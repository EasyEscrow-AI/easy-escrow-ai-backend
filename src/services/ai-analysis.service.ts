/**
 * AI Analysis Service — "EasyEscrow AI"
 *
 * Provides AI-powered analysis helpers for the institutional escrow portal:
 *
 * 1. Analyze Escrow       — full AI analysis of escrow details (amounts, corridor, wallets, risk)
 * 2. Analyze Document     — single document matched against an escrow (names, amounts, addresses)
 * 3. Analyze Client       — AI analysis of institution client profile & compliance posture
 *
 * Each has a corresponding "get" method to retrieve stored results.
 *
 * Pipeline: Collect data -> Anonymize PII -> Claude API -> Parse & store
 */

import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '../generated/prisma';
import { redisClient } from '../config/redis';
import crypto from 'crypto';
import {
  DataAnonymizer,
  ESCROW_SENSITIVE_FIELDS,
  CLIENT_SENSITIVE_FIELDS,
} from '../utils/data-anonymizer';
import { escrowWhere } from '../utils/uuid-conversion';
import { evaluateEscrow, EscrowData, RulesEngineResult } from './escrow-rules-engine';

const AI_RATE_LIMIT_KEY_PREFIX = 'institution:ai:ratelimit:';
const AI_RATE_LIMIT_MAX = 5; // 5 requests per minute per client
const AI_RATE_LIMIT_WINDOW = 60; // seconds
const AI_CACHE_PREFIX = 'institution:ai:analysis:';
const AI_CACHE_TTL = 900; // 15 minutes

export interface AiAnalysisResult {
  riskScore: number;
  extractedFields: Record<string, unknown>;
  factors: Array<{ name: string; weight: number; value: number }>;
  recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
  details: string;
}

export interface EscrowAnalysisResult extends AiAnalysisResult {
  summary: string;
  sections?: Record<string, unknown>;
  tier?: 'preliminary' | 'full';
  aiAnalysisAvailable?: boolean;
  model?: string;
}

export interface AnalyzeDocumentParams {
  escrowId: string;
  fileId: string;
  clientId: string;
  context?: {
    expectedAmount?: number;
    poNumber?: string;
    corridor?: string;
  };
}

export class AiAnalysisService {
  private prisma: PrismaClient;
  private anthropic: Anthropic | null = null;

  constructor() {
    this.prisma = new PrismaClient();
  }

  private getAnthropicClient(): Anthropic {
    if (!this.anthropic) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }
      this.anthropic = new Anthropic({ apiKey });
    }
    return this.anthropic;
  }

  /**
   * Analyze a document for risk assessment
   */
  async analyzeDocument(params: AnalyzeDocumentParams): Promise<AiAnalysisResult> {
    const { escrowId, fileId, clientId, context } = params;

    // Rate limit check
    await this.checkRateLimit(clientId);

    // Verify escrow belongs to this client, and fetch non-PII client details for context
    const escrow = await this.prisma.institutionEscrow.findFirst({
      where: { ...escrowWhere(escrowId), clientId },
      select: {
        escrowId: true,
        escrowCode: true,
        clientId: true,
        amount: true,
        corridor: true,
        status: true,
        client: {
          select: {
            companyName: true,
            legalName: true,
            country: true,
            industry: true,
          },
        },
      },
    });
    if (!escrow) {
      throw new Error('Escrow not found or access denied');
    }
    const resolvedEscrowId = escrow.escrowId; // Internal UUID for FK operations

    // Check cache first (use internal escrowId for consistency)
    const cacheKey = `${AI_CACHE_PREFIX}${resolvedEscrowId}:${fileId}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Cache miss or Redis error, continue
    }

    // Fetch file record
    const file = await this.prisma.institutionFile.findFirst({
      where: { id: fileId, clientId },
    });
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    // Fetch file content
    const fileBuffer = await this.fetchFileBuffer(file.fileKey);

    // Spreadsheet/CSV files cannot be analyzed via vision — reject with clear message
    const unsupportedForAnalysis = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (unsupportedForAnalysis.includes(file.mimeType)) {
      throw new Error(
        `AI analysis does not support ${file.mimeType} files. Please convert to PDF before analyzing.`,
      );
    }

    // Extract text from PDF or use OCR hint for images
    let documentText: string;
    if (file.mimeType === 'application/pdf') {
      documentText = await this.extractPdfText(fileBuffer);
    } else {
      // For images, we'll send them directly to Claude's vision capability
      documentText = '[Image document - analyzed via vision]';
    }

    // Anonymize PII
    const { anonymizedText, piiMap } = this.anonymizePii(documentText);

    // Generate document hash for deduplication
    const documentHash = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    // Check if we already analyzed this exact document
    const existingAnalysis = await this.prisma.institutionAiAnalysis.findFirst({
      where: { escrowId: resolvedEscrowId, documentHash },
    });
    if (existingAnalysis) {
      const result: AiAnalysisResult = {
        riskScore: existingAnalysis.riskScore,
        extractedFields: existingAnalysis.extractedFields as Record<string, unknown>,
        factors: existingAnalysis.factors as Array<{ name: string; weight: number; value: number }>,
        recommendation: existingAnalysis.recommendation as 'APPROVE' | 'REVIEW' | 'REJECT',
        details: `Previously analyzed document (hash: ${documentHash.substring(0, 8)})`,
      };
      return result;
    }

    // Build non-PII client context for the AI prompt (no personal names/addresses)
    const clientInfo = escrow.client;
    const clientContext = clientInfo ? {
      companyName: clientInfo.companyName,
      legalName: clientInfo.legalName || undefined,
      country: clientInfo.country || undefined,
      industry: clientInfo.industry || undefined,
    } : undefined;

    // Call Claude API
    const model = process.env.AI_ANALYSIS_MODEL || 'claude-sonnet-4-20250514';
    const analysisResult = await this.callClaudeApi(
      anonymizedText,
      file.mimeType === 'application/pdf' ? undefined : fileBuffer,
      file.mimeType,
      context,
      model,
      clientContext,
    );

    // Store in database
    await this.prisma.institutionAiAnalysis.create({
      data: {
        analysisType: 'DOCUMENT',
        escrowId: resolvedEscrowId,
        clientId,
        fileId,
        documentHash,
        riskScore: analysisResult.riskScore,
        factors: analysisResult.factors,
        recommendation: analysisResult.recommendation,
        extractedFields: analysisResult.extractedFields as any,
        model,
      },
    });

    // Cache the result
    try {
      await redisClient.set(cacheKey, JSON.stringify(analysisResult), 'EX', AI_CACHE_TTL);
    } catch {
      // Cache write failure is non-critical
    }

    return analysisResult;
  }

  /**
   * Get analysis results for an escrow
   */
  async getAnalysisResults(
    escrowId: string,
    clientId: string,
  ): Promise<AiAnalysisResult[]> {
    // Verify escrow belongs to client
    const escrow = await this.prisma.institutionEscrow.findFirst({
      where: { ...escrowWhere(escrowId), clientId },
    });
    if (!escrow) {
      throw new Error('Escrow not found or access denied');
    }

    const analyses = await this.prisma.institutionAiAnalysis.findMany({
      where: { escrowId: escrow.escrowId, analysisType: 'DOCUMENT' },
      orderBy: { createdAt: 'desc' },
    });

    return analyses.map((a) => ({
      riskScore: a.riskScore,
      extractedFields: a.extractedFields as Record<string, unknown>,
      factors: a.factors as Array<{ name: string; weight: number; value: number }>,
      recommendation: a.recommendation as 'APPROVE' | 'REVIEW' | 'REJECT',
      details: `Analyzed at ${a.createdAt.toISOString()} using ${a.model}`,
    }));
  }

  // ─── Escrow Analysis ──────────────────────────────────────────

  /**
   * Run a full AI analysis on an escrow's details (amounts, corridor, wallets, status, risk).
   * Does NOT analyze a document — instead evaluates the escrow itself.
   */
  async analyzeEscrow(
    escrowId: string,
    clientId: string,
    options: { anonymize?: boolean } = {},
  ): Promise<EscrowAnalysisResult> {
    const { anonymize = true } = options;
    await this.checkRateLimit(clientId);

    const escrow = await this.prisma.institutionEscrow.findFirst({
      where: { ...escrowWhere(escrowId), clientId },
      include: {
        client: {
          select: {
            companyName: true,
            legalName: true,
            country: true,
            industry: true,
            tier: true,
            kycStatus: true,
            kybStatus: true,
            riskRating: true,
            entityType: true,
          },
        },
        deposits: true,
        files: { select: { id: true, fileName: true, documentType: true, sizeBytes: true } },
      },
    });
    if (!escrow) {
      throw new Error('Escrow not found or access denied');
    }
    const resolvedEscrowId = escrow.escrowId;

    // Fetch available corridors from the client's country
    let availableCorridors: Array<{
      code: string;
      riskLevel: string;
      minAmount: number;
      maxAmount: number;
    }> = [];
    try {
      const clientCountry = escrow.client?.country;
      if (clientCountry) {
        const corridors = await this.prisma.institutionCorridor.findMany({
          where: {
            sourceCountry: clientCountry,
            status: 'ACTIVE',
          },
          select: {
            code: true,
            sourceCountry: true,
            destCountry: true,
            riskLevel: true,
            minAmount: true,
            maxAmount: true,
          },
          orderBy: { riskLevel: 'asc' },
        });
        availableCorridors = corridors.map((c) => ({
          code: c.code,
          riskLevel: c.riskLevel,
          minAmount: Number(c.minAmount),
          maxAmount: Number(c.maxAmount),
        }));
      }
    } catch {
      // Non-critical — continue without corridor data
    }

    // Build escrow summary for AI — include all fields for step-by-step analysis
    const escrowSummary: Record<string, unknown> = {
      escrowId: escrow.escrowId,
      escrowCode: escrow.escrowCode,
      status: escrow.status,
      amount: Number(escrow.amount),
      platformFee: Number(escrow.platformFee),
      tokenMint: escrow.usdcMint,
      corridor: escrow.corridor,
      conditionType: escrow.conditionType,
      settlementAuthority: escrow.settlementAuthority,
      riskScore: escrow.riskScore,
      payerWallet: escrow.payerWallet,
      recipientWallet: escrow.recipientWallet,
      hasDeposit: escrow.deposits.length > 0,
      depositCount: escrow.deposits.length,
      fileCount: escrow.files.length,
      fileTypes: escrow.files.map(f => f.documentType),
      expiresAt: escrow.expiresAt?.toISOString() ?? null,
      createdAt: escrow.createdAt.toISOString(),
      fundedAt: escrow.fundedAt?.toISOString() || null,
      resolvedAt: escrow.resolvedAt?.toISOString() || null,
      depositTxSignature: escrow.depositTxSignature,
      escrowPda: escrow.escrowPda,
      nonceAccount: escrow.nonceAccount,
      client: {
        companyName: escrow.client.companyName,
        legalName: escrow.client.legalName,
        tradingName: (escrow.client as any).tradingName,
        country: escrow.client.country,
        industry: escrow.client.industry,
        tier: escrow.client.tier,
        kycStatus: escrow.client.kycStatus,
        kybStatus: (escrow.client as any).kybStatus,
        riskRating: (escrow.client as any).riskRating,
        entityType: (escrow.client as any).entityType,
      },
      availableCorridors: availableCorridors.length > 0 ? availableCorridors : null,
    };

    // Step 1: Content-hash caching — hash escrow data for dedup regardless of escrowId
    const summaryHash = crypto.createHash('sha256')
      .update(JSON.stringify(escrowSummary, Object.keys(escrowSummary).sort()))
      .digest('hex');
    const hashCacheKey = `${AI_CACHE_PREFIX}escrow:hash:${summaryHash}`;
    try {
      const hashCached = await redisClient.get(hashCacheKey);
      if (hashCached) return JSON.parse(hashCached);
    } catch { /* miss */ }

    // Check escrowId-based cache
    const cacheKey = `${AI_CACHE_PREFIX}escrow:${resolvedEscrowId}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* cache miss */ }

    // Check for existing analysis of same escrow (dedup by type)
    const existing = await this.prisma.institutionAiAnalysis.findFirst({
      where: { escrowId: resolvedEscrowId, analysisType: 'ESCROW' },
      orderBy: { createdAt: 'desc' },
    });
    // Re-analyze if escrow status changed since last analysis
    const statusChanged = existing && (existing.extractedFields as any)?.escrow_status !== escrow.status;
    if (existing && !statusChanged) {
      const result: EscrowAnalysisResult = {
        riskScore: existing.riskScore,
        extractedFields: existing.extractedFields as Record<string, unknown>,
        factors: existing.factors as Array<{ name: string; weight: number; value: number }>,
        recommendation: existing.recommendation as 'APPROVE' | 'REVIEW' | 'REJECT',
        details: `Previously analyzed (${existing.createdAt.toISOString()})`,
        summary: (existing as any).summary || '',
      };
      return result;
    }

    // Step 3: Model selection — use Haiku for DRAFT, Sonnet for everything else
    const model = escrow.status === 'DRAFT'
      ? (process.env.AI_ANALYSIS_MODEL_DRAFT || 'claude-haiku-4-5-20251001')
      : (process.env.AI_ANALYSIS_MODEL || 'claude-sonnet-4-20250514');
    const maxTokens = escrow.status === 'DRAFT' ? 2048 : 4096;

    const client = this.getAnthropicClient();
    const anonymizer = anonymize ? new DataAnonymizer() : null;

    // Anonymize sensitive fields before sending to AI
    const dataForAi = anonymizer
      ? anonymizer.anonymizeObject(escrowSummary, ESCROW_SENSITIVE_FIELDS)
      : escrowSummary;

    const systemPrompt = `You are EasyEscrow AI, a compliance analyst for cross-border stablecoin escrow payments on Solana.${anonymize ? ' Tokenized fields (e.g. [COMPANY_1], [WALLET_1]) will be resolved after — reference them as-is.' : ''}

Analyze the escrow JSON and return a step-by-step compliance assessment. The escrow may be DRAFT (partial data) or any later state. Use "pending" for sections where required data is null/missing.

STATUS RULES per section:
- "pass": No issues found, data looks compliant
- "warning": Minor concerns or unusual patterns, but not blocking
- "fail": Compliance risk identified, requires attention
- "pending": Required data for this section is null/not yet provided

SECTION ANALYSIS RULES:
1. from_account: Check payerWallet exists, client.kycStatus=VERIFIED (fail if not), client.kybStatus (warn if not VERIFIED), client.riskRating (fail if HIGH/CRITICAL), client.country jurisdiction risk. Pending if payerWallet is null.
2. to_account: Check recipientWallet is set (pending if null), different from payerWallet (fail if same). Note if wallet appears to be an exchange or contract address.
3. corridor: The data includes "availableCorridors" — an array of active corridors from the payer's country with riskLevel and amount limits (queried from the database), or null if none exist. If corridor is null (DRAFT): check availableCorridors and recommend the best one (lowest riskLevel that fits the amount). If no corridors are available, status=fail with "No active corridors available for this country." If corridor IS set: verify it exists in availableCorridors (fail if not found), check riskLevel (HIGH=warning), check amount is within min/max limits. Include the recommended or validated corridor code in findings.
4. amount: Check amount > 0 (fail if 0 or null), flag amounts > 100000 as warning, flag > 1000000 as high scrutiny. Check platformFee is reasonable. Pending if amount is null/0.
5. settlement: Check tokenMint is a known stablecoin (USDC/USDT/EURC/PYUSD). Report deposit status (hasDeposit, depositTxSignature). Note escrowPda and on-chain readiness. Pending if no tokenMint.
6. release: Check conditionType is set (pending if null). ADMIN_RELEASE=pass, TIME_LOCK=pass with note, COMPLIANCE_CHECK=pass. Verify settlementAuthority is set (warn if missing for non-DRAFT). Note if settlementAuthority differs from payerWallet.
7. advanced: Check expiresAt is set and reasonable (warn if <24h or >90 days from now). Note fileCount (warn if 0 supporting docs for amounts >50000). Note nonceAccount (pass if assigned). Pending if expiresAt is null on non-DRAFT.
8. overview: Aggregate all sections. Count pass/warning/fail/pending. Give a 1-sentence compliance verdict. Status = "fail" if ANY section is "fail", "warning" if any "warning", "pass" if all pass/pending.

RESPONSE FORMAT (valid JSON only, no other text):
{
  "risk_score": <0-100>,
  "recommendation": "<APPROVE|REVIEW|REJECT>",
  "summary": "<1 sentence: e.g. 'Compliant SG-CH corridor escrow with verified KYC — no issues found.'>",
  "sections": {
    "<section_key>": {
      "status": "<pass|warning|fail|pending>",
      "title": "<display title>",
      "findings": "<1-2 concise sentences>",
      "checked_fields": ["<field names this section evaluated>"],
      "recommended_corridor": "<only for corridor section: best corridor code from availableCorridors, or null>"
    }
  },
  "extracted_fields": {
    "escrow_status": "<string>",
    "amount_usd": <number|null>,
    "corridor": "<string|null>",
    "condition_type": "<string|null>",
    "client_tier": "<string>",
    "kyc_status": "<string>",
    "days_until_expiry": <number|null>,
    "has_supporting_documents": <boolean>,
    "deposit_confirmed": <boolean>
  },
  "factors": [{"name": "<string>", "weight": <0-1>, "value": <0-100>}],
  "details": "<brief risk explanation>"
}`;

    // Step 2: Anthropic prompt caching — cache the large system prompt
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Analyze this escrow transaction:\n\n${JSON.stringify(dataForAi, null, 2)}`,
      }],
    });

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    let result: EscrowAnalysisResult;
    try {
      const parsed = this.extractJson(responseText);
      result = {
        riskScore: Math.min(100, Math.max(0, (parsed.risk_score as number) || 50)),
        extractedFields: (parsed.extracted_fields as Record<string, unknown>) || {},
        factors: ((parsed.factors as any[]) || []).map((f: any) => ({
          name: f.name,
          weight: Math.min(1, Math.max(0, f.weight || 0)),
          value: Math.min(100, Math.max(0, f.value || 0)),
        })),
        recommendation: ['APPROVE', 'REVIEW', 'REJECT'].includes(parsed.recommendation as string)
          ? (parsed.recommendation as 'APPROVE' | 'REVIEW' | 'REJECT')
          : 'REVIEW',
        details: (parsed.details as string) || 'Analysis complete',
        summary: (parsed.summary as string) || '',
        sections: (parsed.sections as Record<string, unknown>) || undefined,
        model,
      };
    } catch {
      result = {
        riskScore: 50,
        extractedFields: {},
        factors: [{ name: 'parse_error', weight: 1, value: 50 }],
        recommendation: 'REVIEW',
        details: 'AI response could not be parsed. Manual review recommended.',
        summary: 'Analysis could not be completed automatically.',
        model,
      };
    }

    // De-anonymize: restore real values in AI response
    if (anonymizer) {
      result = anonymizer.deanonymizeResult(result) as EscrowAnalysisResult;
    }

    // Store
    await this.prisma.institutionAiAnalysis.create({
      data: {
        analysisType: 'ESCROW',
        escrowId: resolvedEscrowId,
        clientId,
        riskScore: result.riskScore,
        factors: result.factors,
        recommendation: result.recommendation,
        extractedFields: result.extractedFields as any,
        summary: result.summary,
        model,
      },
    });

    // Cache under both escrowId key and content-hash key
    try {
      const resultJson = JSON.stringify(result);
      await redisClient.set(cacheKey, resultJson, 'EX', AI_CACHE_TTL);
      await redisClient.set(hashCacheKey, resultJson, 'EX', AI_CACHE_TTL);
    } catch { /* non-critical */ }

    return result;
  }

  /**
   * Fast escrow analysis using the local rules engine.
   * Returns a preliminary result in <1ms. If a cached AI result exists,
   * merges it and returns tier: 'full'. Otherwise fires a background AI
   * call and returns tier: 'preliminary'.
   */
  async analyzeEscrowFast(
    escrowId: string,
    clientId: string,
    options: { anonymize?: boolean } = {},
  ): Promise<EscrowAnalysisResult> {
    await this.checkRateLimit(clientId);

    const escrow = await this.prisma.institutionEscrow.findFirst({
      where: { ...escrowWhere(escrowId), clientId },
      include: {
        client: {
          select: {
            companyName: true,
            legalName: true,
            country: true,
            industry: true,
            tier: true,
            kycStatus: true,
            kybStatus: true,
            riskRating: true,
            entityType: true,
          },
        },
        deposits: true,
        files: { select: { id: true, fileName: true, documentType: true, sizeBytes: true } },
      },
    });
    if (!escrow) {
      throw new Error('Escrow not found or access denied');
    }

    // Fetch available corridors
    let availableCorridors: Array<{ code: string; riskLevel: string; minAmount: number; maxAmount: number }> = [];
    try {
      const clientCountry = escrow.client?.country;
      if (clientCountry) {
        const corridors = await this.prisma.institutionCorridor.findMany({
          where: { sourceCountry: clientCountry, status: 'ACTIVE' },
          select: { code: true, riskLevel: true, minAmount: true, maxAmount: true },
          orderBy: { riskLevel: 'asc' },
        });
        availableCorridors = corridors.map(c => ({
          code: c.code,
          riskLevel: c.riskLevel,
          minAmount: Number(c.minAmount),
          maxAmount: Number(c.maxAmount),
        }));
      }
    } catch { /* non-critical */ }

    // Build EscrowData for the rules engine
    const escrowData: EscrowData = {
      status: escrow.status,
      amount: Number(escrow.amount),
      platformFee: Number(escrow.platformFee),
      tokenMint: escrow.usdcMint,
      corridor: escrow.corridor,
      conditionType: escrow.conditionType,
      settlementAuthority: escrow.settlementAuthority,
      riskScore: escrow.riskScore,
      payerWallet: escrow.payerWallet,
      recipientWallet: escrow.recipientWallet,
      hasDeposit: escrow.deposits.length > 0,
      depositCount: escrow.deposits.length,
      fileCount: escrow.files.length,
      expiresAt: escrow.expiresAt?.toISOString() ?? null,
      depositTxSignature: escrow.depositTxSignature,
      escrowPda: escrow.escrowPda,
      nonceAccount: escrow.nonceAccount,
      client: {
        kycStatus: escrow.client.kycStatus,
        kybStatus: (escrow.client as any).kybStatus,
        riskRating: (escrow.client as any).riskRating,
        country: escrow.client.country,
        entityType: (escrow.client as any).entityType,
        tier: escrow.client.tier,
      },
      availableCorridors: availableCorridors.length > 0 ? availableCorridors : null,
    };

    // Run the local rules engine (<1ms)
    const preliminary = evaluateEscrow(escrowData);

    // Check content-hash cache for a prior AI result
    const escrowSummary: Record<string, unknown> = {
      escrowId: escrow.escrowId,
      escrowCode: escrow.escrowCode,
      status: escrow.status,
      amount: Number(escrow.amount),
      platformFee: Number(escrow.platformFee),
      tokenMint: escrow.usdcMint,
      corridor: escrow.corridor,
      conditionType: escrow.conditionType,
      settlementAuthority: escrow.settlementAuthority,
      riskScore: escrow.riskScore,
      payerWallet: escrow.payerWallet,
      recipientWallet: escrow.recipientWallet,
      hasDeposit: escrow.deposits.length > 0,
      depositCount: escrow.deposits.length,
      fileCount: escrow.files.length,
      fileTypes: escrow.files.map(f => f.documentType),
      expiresAt: escrow.expiresAt?.toISOString() ?? null,
      createdAt: escrow.createdAt.toISOString(),
      fundedAt: escrow.fundedAt?.toISOString() || null,
      resolvedAt: escrow.resolvedAt?.toISOString() || null,
      depositTxSignature: escrow.depositTxSignature,
      escrowPda: escrow.escrowPda,
      nonceAccount: escrow.nonceAccount,
      client: {
        companyName: escrow.client.companyName,
        legalName: escrow.client.legalName,
        tradingName: (escrow.client as any).tradingName,
        country: escrow.client.country,
        industry: escrow.client.industry,
        tier: escrow.client.tier,
        kycStatus: escrow.client.kycStatus,
        kybStatus: (escrow.client as any).kybStatus,
        riskRating: (escrow.client as any).riskRating,
        entityType: (escrow.client as any).entityType,
      },
      availableCorridors: availableCorridors.length > 0 ? availableCorridors : null,
    };

    const summaryHash = crypto.createHash('sha256')
      .update(JSON.stringify(escrowSummary, Object.keys(escrowSummary).sort()))
      .digest('hex');
    const hashCacheKey = `${AI_CACHE_PREFIX}escrow:hash:${summaryHash}`;

    try {
      const hashCached = await redisClient.get(hashCacheKey);
      if (hashCached) {
        const aiResult = JSON.parse(hashCached) as EscrowAnalysisResult;
        return { ...aiResult, tier: 'full', aiAnalysisAvailable: true };
      }
    } catch { /* miss */ }

    // No cached AI result — fire background AI call and return preliminary
    this.analyzeEscrow(escrowId, clientId, options).catch(() => {
      // Background AI call failed — result won't be cached, but that's OK
    });

    return {
      riskScore: preliminary.riskScore,
      extractedFields: preliminary.extractedFields,
      factors: preliminary.factors,
      recommendation: preliminary.recommendation,
      details: preliminary.details,
      summary: preliminary.summary,
      sections: preliminary.sections,
      tier: 'preliminary',
      aiAnalysisAvailable: false,
    };
  }

  /**
   * Get stored escrow-level analysis results
   */
  async getEscrowAnalysis(
    escrowId: string,
    clientId: string,
  ): Promise<Array<EscrowAnalysisResult>> {
    const escrow = await this.prisma.institutionEscrow.findFirst({
      where: { ...escrowWhere(escrowId), clientId },
    });
    if (!escrow) {
      throw new Error('Escrow not found or access denied');
    }

    const analyses = await this.prisma.institutionAiAnalysis.findMany({
      where: { escrowId: escrow.escrowId, analysisType: 'ESCROW' },
      orderBy: { createdAt: 'desc' },
    });

    return analyses.map(a => ({
      riskScore: a.riskScore,
      extractedFields: a.extractedFields as Record<string, unknown>,
      factors: a.factors as Array<{ name: string; weight: number; value: number }>,
      recommendation: a.recommendation as 'APPROVE' | 'REVIEW' | 'REJECT',
      details: `Analyzed at ${a.createdAt.toISOString()} using ${a.model}`,
      summary: (a as any).summary || '',
    }));
  }

  // ─── Client Analysis ─────────────────────────────────────────

  /**
   * Run AI analysis on an institution client's profile and compliance posture.
   */
  async analyzeClient(
    clientId: string,
    options: { anonymize?: boolean } = {},
  ): Promise<AiAnalysisResult & { summary: string }> {
    const { anonymize = true } = options;
    await this.checkRateLimit(clientId);

    const clientRecord = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
      include: {
        wallets: { select: { id: true, chain: true, isPrimary: true, isSettlement: true } },
        escrows: {
          select: { escrowId: true, status: true, amount: true, corridor: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!clientRecord) {
      throw new Error('Client not found');
    }

    // Check cache
    const cacheKey = `${AI_CACHE_PREFIX}client:${clientId}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* cache miss */ }

    const model = process.env.AI_ANALYSIS_MODEL || 'claude-sonnet-4-20250514';
    const client = this.getAnthropicClient();
    const anonymizer = anonymize ? new DataAnonymizer() : null;

    // Build client profile for AI
    const clientProfile: Record<string, unknown> = {
      companyName: clientRecord.companyName,
      legalName: clientRecord.legalName,
      tradingName: clientRecord.tradingName,
      entityType: clientRecord.entityType,
      country: clientRecord.country,
      industry: clientRecord.industry,
      tier: clientRecord.tier,
      status: clientRecord.status,
      kycStatus: clientRecord.kycStatus,
      kybStatus: clientRecord.kybStatus,
      riskRating: clientRecord.riskRating,
      sanctionsStatus: clientRecord.sanctionsStatus,
      isRegulatedEntity: clientRecord.isRegulatedEntity,
      regulatoryStatus: clientRecord.regulatoryStatus,
      licenseType: clientRecord.licenseType,
      yearEstablished: clientRecord.yearEstablished,
      employeeCountRange: clientRecord.employeeCountRange,
      annualRevenueRange: clientRecord.annualRevenueRange,
      walletCustodyType: clientRecord.walletCustodyType,
      preferredSettlementChain: clientRecord.preferredSettlementChain,
      walletCount: clientRecord.wallets.length,
      hasPrimaryWallet: clientRecord.wallets.some(w => w.isPrimary),
      hasSettlementWallet: clientRecord.wallets.some(w => w.isSettlement),
      onboardingCompleted: !!clientRecord.onboardingCompletedAt,
      escrowHistory: {
        totalEscrows: clientRecord.escrows.length,
        statusBreakdown: clientRecord.escrows.reduce((acc: Record<string, number>, e) => {
          acc[e.status] = (acc[e.status] || 0) + 1;
          return acc;
        }, {}),
        corridorsUsed: [...new Set(clientRecord.escrows.map(e => e.corridor))],
        totalVolume: clientRecord.escrows.reduce((sum, e) => sum + Number(e.amount), 0),
      },
      accountAge: Math.floor(
        (Date.now() - clientRecord.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    };

    // Anonymize sensitive fields before sending to AI
    const dataForAi = anonymizer
      ? anonymizer.anonymizeObject(clientProfile, CLIENT_SENSITIVE_FIELDS)
      : clientProfile;

    const systemPrompt = `You are EasyEscrow AI, an institutional compliance analyst. Analyze the following institution client profile and provide a comprehensive compliance and risk assessment.${anonymize ? '\n\nNote: Some fields have been tokenized for privacy (e.g. [COMPANY_1], [PERSON_1]). Reference these tokens in your analysis — they will be resolved to real values after.' : ''}

Your response MUST be valid JSON with this exact structure:
{
  "risk_score": <number 0-100>,
  "recommendation": "<APPROVE|REVIEW|REJECT>",
  "summary": "<2-4 sentence human-readable summary of the client assessment>",
  "extracted_fields": {
    "company_name": "<string>",
    "entity_type": "<string|null>",
    "country": "<string|null>",
    "industry": "<string|null>",
    "kyc_verified": <boolean>,
    "kyb_verified": <boolean>,
    "sanctions_clear": <boolean>,
    "is_regulated": <boolean>,
    "account_age_days": <number>,
    "total_escrow_volume": <number>,
    "escrow_count": <number>,
    "has_wallet_configured": <boolean>
  },
  "factors": [
    {"name": "<factor_name>", "weight": <0-1>, "value": <0-100>}
  ],
  "details": "<brief explanation of risk factors and compliance status>"
}

Consider: KYC/KYB status, sanctions screening, entity type, jurisdiction risk, transaction history, wallet configuration, regulatory status, account maturity.
Respond with ONLY the JSON object, no additional text.`;

    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Analyze this institution client profile:\n\n${JSON.stringify(dataForAi, null, 2)}`,
      }],
    });

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    let result: AiAnalysisResult & { summary: string };
    try {
      const parsed = this.extractJson(responseText);
      result = {
        riskScore: Math.min(100, Math.max(0, (parsed.risk_score as number) || 50)),
        extractedFields: (parsed.extracted_fields as Record<string, unknown>) || {},
        factors: ((parsed.factors as any[]) || []).map((f: any) => ({
          name: f.name,
          weight: Math.min(1, Math.max(0, f.weight || 0)),
          value: Math.min(100, Math.max(0, f.value || 0)),
        })),
        recommendation: ['APPROVE', 'REVIEW', 'REJECT'].includes(parsed.recommendation as string)
          ? (parsed.recommendation as 'APPROVE' | 'REVIEW' | 'REJECT')
          : 'REVIEW',
        details: (parsed.details as string) || 'Analysis complete',
        summary: (parsed.summary as string) || '',
      };
    } catch {
      result = {
        riskScore: 50,
        extractedFields: {},
        factors: [{ name: 'parse_error', weight: 1, value: 50 }],
        recommendation: 'REVIEW',
        details: 'AI response could not be parsed. Manual review recommended.',
        summary: 'Client analysis could not be completed automatically.',
      };
    }

    // De-anonymize: restore real values in AI response
    if (anonymizer) {
      result = anonymizer.deanonymizeResult(result);
    }

    // Store
    await this.prisma.institutionAiAnalysis.create({
      data: {
        analysisType: 'CLIENT',
        clientId,
        riskScore: result.riskScore,
        factors: result.factors,
        recommendation: result.recommendation,
        extractedFields: result.extractedFields as any,
        summary: result.summary,
        model,
      },
    });

    try {
      await redisClient.set(cacheKey, JSON.stringify(result), 'EX', AI_CACHE_TTL);
    } catch { /* non-critical */ }

    return result;
  }

  /**
   * Get stored client-level analysis results
   */
  async getClientAnalysis(
    clientId: string,
  ): Promise<Array<AiAnalysisResult & { summary: string }>> {
    const analyses = await this.prisma.institutionAiAnalysis.findMany({
      where: { clientId, analysisType: 'CLIENT' },
      orderBy: { createdAt: 'desc' },
    });

    return analyses.map(a => ({
      riskScore: a.riskScore,
      extractedFields: a.extractedFields as Record<string, unknown>,
      factors: a.factors as Array<{ name: string; weight: number; value: number }>,
      recommendation: a.recommendation as 'APPROVE' | 'REVIEW' | 'REJECT',
      details: `Analyzed at ${a.createdAt.toISOString()} using ${a.model}`,
      summary: (a as any).summary || '',
    }));
  }

  /**
   * Extract JSON from an AI response that may contain markdown fences or surrounding text
   */
  private extractJson(responseText: string): Record<string, unknown> {
    // 1. Try raw parse first
    try {
      return JSON.parse(responseText);
    } catch {
      // continue to extraction
    }

    // 2. Strip markdown code fences: ```json ... ``` or ``` ... ```
    const fenceMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {
        // continue
      }
    }

    // 3. Find the outermost { ... } in the response
    const firstBrace = responseText.indexOf('{');
    const lastBrace = responseText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(responseText.slice(firstBrace, lastBrace + 1));
      } catch {
        // continue
      }
    }

    throw new Error('No valid JSON found in AI response');
  }

  /**
   * Call Claude API with document text and structured prompt
   */
  private async callClaudeApi(
    documentText: string,
    imageBuffer: Buffer | undefined,
    mimeType: string,
    context?: AnalyzeDocumentParams['context'],
    model?: string,
    clientContext?: {
      companyName?: string;
      legalName?: string;
      country?: string;
      industry?: string;
    },
  ): Promise<AiAnalysisResult> {
    const client = this.getAnthropicClient();

    const systemPrompt = `You are a compliance analyst reviewing trade documents for cross-border escrow payments. Analyze the provided document and return a JSON assessment.

Your response MUST be valid JSON with this exact structure:
{
  "risk_score": <number 0-100>,
  "recommendation": "<APPROVE|REVIEW|REJECT>",
  "extracted_fields": {
    "document_type": "<string>",
    "total_amount": <number|null>,
    "currency": "<string|null>",
    "counterparty_name": "<string|null>",
    "date": "<string|null>",
    "reference_number": "<string|null>",
    "description": "<string|null>"
  },
  "factors": [
    {"name": "<factor_name>", "weight": <0-1>, "value": <0-100>}
  ],
  "details": "<brief explanation>"
}

Risk scoring guidelines:
- 0-25: Low risk, standard trade document, amounts match expectations
- 26-50: Moderate risk, minor inconsistencies or unusual terms
- 51-75: High risk, significant red flags requiring manual review
- 76-100: Very high risk, potential fraud indicators, reject

Respond with ONLY the JSON object, no additional text.`;

    let contextInfo = context
      ? `\nEscrow Context: Expected amount: ${context.expectedAmount || 'unknown'}, PO#: ${context.poNumber || 'unknown'}, Corridor: ${context.corridor || 'unknown'}`
      : '';

    if (clientContext) {
      const parts = [];
      if (clientContext.companyName) parts.push(`Company: ${clientContext.companyName}`);
      if (clientContext.legalName) parts.push(`Legal Name: ${clientContext.legalName}`);
      if (clientContext.country) parts.push(`Country: ${clientContext.country}`);
      if (clientContext.industry) parts.push(`Industry: ${clientContext.industry}`);
      if (parts.length > 0) {
        contextInfo += `\nClient Details: ${parts.join(', ')}`;
      }
    }

    const contentParts: Anthropic.ContentBlockParam[] = [];

    if (imageBuffer && mimeType !== 'application/pdf') {
      // Send image for vision analysis
      const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      contentParts.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: imageBuffer.toString('base64'),
        },
      });
      contentParts.push({
        type: 'text',
        text: `Analyze this trade document for compliance risk assessment.${contextInfo}`,
      });
    } else {
      contentParts.push({
        type: 'text',
        text: `Analyze the following trade document for compliance risk assessment.${contextInfo}\n\nDocument text:\n${documentText}`,
      });
    }

    const response = await client.messages.create({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: contentParts }],
    });

    // Extract text from response
    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse JSON response
    try {
      const parsed = this.extractJson(responseText);
      return {
        riskScore: Math.min(100, Math.max(0, (parsed.risk_score as number) || 50)),
        extractedFields: (parsed.extracted_fields as Record<string, unknown>) || {},
        factors: ((parsed.factors as any[]) || []).map((f: { name: string; weight: number; value: number }) => ({
          name: f.name,
          weight: Math.min(1, Math.max(0, f.weight || 0)),
          value: Math.min(100, Math.max(0, f.value || 0)),
        })),
        recommendation: ['APPROVE', 'REVIEW', 'REJECT'].includes(parsed.recommendation as string)
          ? (parsed.recommendation as 'APPROVE' | 'REVIEW' | 'REJECT')
          : 'REVIEW',
        details: (parsed.details as string) || 'Analysis complete',
      };
    } catch {
      // If JSON parsing fails, return a safe default
      return {
        riskScore: 50,
        extractedFields: {},
        factors: [{ name: 'parse_error', weight: 1, value: 50 }],
        recommendation: 'REVIEW',
        details: 'AI response could not be parsed. Manual review recommended.',
      };
    }
  }

  /**
   * Extract text from PDF buffer
   */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch (error) {
      console.error('[AiAnalysisService] PDF extraction failed:', error);
      return '[PDF text extraction failed]';
    }
  }

  /**
   * Fetch file buffer from DO Spaces
   */
  private async fetchFileBuffer(fileKey: string): Promise<Buffer> {
    // Use the file service to get the buffer
    // Import dynamically to avoid circular dependency
    const { getInstitutionFileService } = await import('./institution-file.service');
    const fileService = getInstitutionFileService();

    // We need a direct S3 fetch here since getFileBuffer requires clientId validation
    // which we've already done at the analyzeDocument level
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      endpoint: process.env.DO_SPACES_ENDPOINT
        ? `https://${process.env.DO_SPACES_ENDPOINT}`
        : undefined,
      region: process.env.DO_SPACES_REGION || 'nyc3',
      credentials: {
        accessKeyId: process.env.DO_SPACES_KEY || '',
        secretAccessKey: process.env.DO_SPACES_SECRET || '',
      },
      forcePathStyle: false,
    });

    const command = new GetObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET || process.env.DO_SPACES_BUCKET_NAME || '',
      Key: fileKey,
    });

    const response = await s3.send(command);
    const stream = response.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Anonymize PII in document text
   */
  private anonymizePii(text: string): {
    anonymizedText: string;
    piiMap: Map<string, string>;
  } {
    const piiMap = new Map<string, string>();
    let anonymized = text;
    let personCounter = 1;
    let accountCounter = 1;
    let addressCounter = 1;

    // Email addresses
    anonymized = anonymized.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      (match) => {
        const key = `[EMAIL_${personCounter}]`;
        piiMap.set(key, match);
        personCounter++;
        return key;
      },
    );

    // Phone numbers (various formats)
    anonymized = anonymized.replace(
      /(\+?\d{1,4}[\s-]?)?(\(?\d{1,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/g,
      (match) => {
        // Only replace if it looks like a phone number (7+ digits)
        const digits = match.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15) {
          const key = `[PHONE_${personCounter}]`;
          piiMap.set(key, match);
          return key;
        }
        return match;
      },
    );

    // Bank account numbers (sequences of 8-20 digits)
    anonymized = anonymized.replace(
      /\b\d{8,20}\b/g,
      (match) => {
        const key = `[ACCOUNT_${accountCounter}]`;
        piiMap.set(key, match);
        accountCounter++;
        return key;
      },
    );

    // Postal/ZIP addresses (multi-line patterns with common keywords)
    // This is a simplified approach - real PII detection would need NER
    anonymized = anonymized.replace(
      /\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b[^.]*?\d{5}(-\d{4})?/gi,
      (match) => {
        const key = `[ADDRESS_${addressCounter}]`;
        piiMap.set(key, match);
        addressCounter++;
        return key;
      },
    );

    return { anonymizedText: anonymized, piiMap };
  }

  /**
   * Check rate limit for AI requests
   */
  private async checkRateLimit(clientId: string): Promise<void> {
    const key = `${AI_RATE_LIMIT_KEY_PREFIX}${clientId}`;
    try {
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, AI_RATE_LIMIT_WINDOW);
      }
      if (current > AI_RATE_LIMIT_MAX) {
        throw new Error(
          `AI analysis rate limit exceeded. Maximum ${AI_RATE_LIMIT_MAX} requests per minute.`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('rate limit')) {
        throw error;
      }
      // Redis error - allow the request
    }
  }
}

let instance: AiAnalysisService | null = null;
export function getAiAnalysisService(): AiAnalysisService {
  if (!instance) {
    instance = new AiAnalysisService();
  }
  return instance;
}
