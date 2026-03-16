/**
 * AI Analysis Service
 *
 * Analyzes uploaded documents (invoices, contracts, shipping docs) using Claude API
 * to assess risk and extract relevant fields for institution escrow compliance.
 *
 * Pipeline: Fetch file -> Extract text (PDF) -> Anonymize PII -> Claude API -> Parse & store
 */

import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '../generated/prisma';
import { redisClient } from '../config/redis';
import crypto from 'crypto';

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

    // Check cache first
    const cacheKey = `${AI_CACHE_PREFIX}${escrowId}:${fileId}`;
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
      where: { escrowId, documentHash },
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

    // Call Claude API
    const model = process.env.AI_ANALYSIS_MODEL || 'claude-sonnet-4-20250514';
    const analysisResult = await this.callClaudeApi(
      anonymizedText,
      file.mimeType === 'application/pdf' ? undefined : fileBuffer,
      file.mimeType,
      context,
      model,
    );

    // Store in database
    await this.prisma.institutionAiAnalysis.create({
      data: {
        escrowId,
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
      where: { escrowId, clientId },
    });
    if (!escrow) {
      throw new Error('Escrow not found or access denied');
    }

    const analyses = await this.prisma.institutionAiAnalysis.findMany({
      where: { escrowId },
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

  /**
   * Call Claude API with document text and structured prompt
   */
  private async callClaudeApi(
    documentText: string,
    imageBuffer: Buffer | undefined,
    mimeType: string,
    context?: AnalyzeDocumentParams['context'],
    model?: string,
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

    const contextInfo = context
      ? `\nContext: Expected amount: ${context.expectedAmount || 'unknown'}, PO#: ${context.poNumber || 'unknown'}, Corridor: ${context.corridor || 'unknown'}`
      : '';

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
      system: systemPrompt,
      messages: [{ role: 'user', content: contentParts }],
    });

    // Extract text from response
    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse JSON response
    try {
      const parsed = JSON.parse(responseText);
      return {
        riskScore: Math.min(100, Math.max(0, parsed.risk_score || 50)),
        extractedFields: parsed.extracted_fields || {},
        factors: (parsed.factors || []).map((f: { name: string; weight: number; value: number }) => ({
          name: f.name,
          weight: Math.min(1, Math.max(0, f.weight || 0)),
          value: Math.min(100, Math.max(0, f.value || 0)),
        })),
        recommendation: ['APPROVE', 'REVIEW', 'REJECT'].includes(parsed.recommendation)
          ? parsed.recommendation
          : 'REVIEW',
        details: parsed.details || 'Analysis complete',
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
