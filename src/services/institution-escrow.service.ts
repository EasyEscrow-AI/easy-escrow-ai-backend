/**
 * Institution Escrow Service (Core Orchestrator)
 *
 * Orchestrates the full escrow lifecycle:
 * 1. Create escrow (validate, compliance check, build tx, store)
 * 2. Record deposit (verify on-chain, update status)
 * 3. Release funds (settlement authority, build tx, update status)
 * 4. Cancel escrow (build cancel tx, refund, update status)
 * 5. List/get escrows (Redis cache + Prisma)
 */

import {
  PrismaClient,
  InstitutionEscrowStatus,
  PrivacyLevel as PrismaPrivacyLevel,
} from '../generated/prisma';
import { prisma } from '../config/database';
import type { SettlementMode, ReleaseMode } from '../types/institution-escrow';
import { redisClient } from '../config/redis';
import { AllowlistService, getAllowlistService } from './allowlist.service';
import { ComplianceService, getComplianceService } from './compliance.service';
import { getTokenWhitelistService } from './institution-token-whitelist.service';
import { getInstitutionNotificationService } from './institution-notification.service';
import { getAiAnalysisService, AiAnalysisResult } from './ai-analysis.service';
import {
  getInstitutionEscrowProgramService,
  InstitutionEscrowProgramService,
  buildAiDigest,
  AiMemoData,
} from './institution-escrow-program.service';
import type { NoncePoolManager } from './noncePoolManager';
import crypto from 'crypto';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config';
import {
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
} from '@solana/spl-token';
import { resolveReleaseDestination } from './privacy/privacy-router.service';
import { getStealthAddressService } from './privacy/stealth-address.service';
import { PrivacyLevel, PrivacyPreferences } from './privacy/privacy.types';
import { isPrivacyEnabled } from '../utils/featureFlags';
import { getCdpSettlementService } from './cdp-settlement.service';
import { getInstitutionEscrowConfig } from '../config/institution-escrow.config';

const ESCROW_CACHE_PREFIX = 'institution:escrow:';
const ESCROW_CACHE_TTL = 300; // 5 minutes

const AUDIT_ACTION_LABELS: Record<string, string> = {
  DRAFT_SAVED: 'Draft Saved',
  DRAFT_UPDATED: 'Draft Updated',
  DRAFT_SUBMITTED: 'Draft Submitted',
  ESCROW_CREATED: 'Escrow Created',
  COMPLIANCE_SCREENING: 'Compliance Screening',
  COMPLIANCE_HOLD: 'Compliance Hold',
  COMPLIANCE_WARNING: 'Compliance Warning',
  DEPOSIT_CONFIRMED: 'Escrow Funded',
  AI_RELEASE_CHECK: 'AI Release Check',
  AI_APPROVED: 'AI Approved',
  AI_AUTO_RELEASE: 'AI Auto-Release',
  FUNDS_RELEASED: 'Funds Released',
  ESCROW_COMPLETED: 'Escrow Complete',
  ESCROW_CANCELLED: 'Cancelled',
  ESCROW_EXPIRED: 'Expired',
  INSUFFICIENT_FUNDS: 'Insufficient Funds',
  ON_CHAIN_INIT_FAILED: 'On-Chain Init Failed',
  ON_CHAIN_RELEASE_FAILED: 'On-Chain Release Failed',
  ON_CHAIN_CANCEL_FAILED: 'On-Chain Cancel Failed',
  TIMELOCK_SET: 'Timelock Set',
  TIMELOCK_OVERRIDE: 'Timelock Override',
  TIMELOCK_DEFERRED: 'Auto-Release Deferred (Timelock)',
  ESCROW_FULFILLED: 'Proof of Delivery',
  PROOF_SUBMITTED: 'Proof Submitted',
  RECIPIENT_NOTIFIED: 'Recipient Notified',
  CDP_POLICY_CHECK: 'CDP Policy Check',
};

const AI_RELEASE_CONDITION_LABELS: Record<string, string> = {
  legal_compliance: 'All legal compliance checks pass',
  invoice_amount_match: 'Invoice amount matches exactly',
  client_info_match: 'Client information matches exactly',
  document_signature_verified: 'Document signature is verified (via DocuSign)',
  cdp_policy_approval: 'All policies passed by independent settlement authority',
};

function truncateWallet(wallet: string | null | undefined): string | null {
  if (!wallet || wallet.length < 8) return wallet || null;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

interface PartyNames {
  payerName: string | null;
  payerAccountLabel: string | null;
  payerBranchName: string | null;
  recipientName: string | null;
  recipientAccountLabel: string | null;
  recipientBranchName: string | null;
  counterpartyId: string | null;
}

/** Safely create a PublicKey from a string, with a field-specific error message. */
function toPublicKey(value: string, fieldName: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid Solana address for ${fieldName}: "${value}"`);
  }
}

export interface CreateEscrowParams {
  clientId: string;
  payerWallet: string;
  recipientWallet: string;
  amount: number;
  corridor: string;
  conditionType: string;
  expiryHours?: number;
  settlementAuthority?: string;
  /** Optional token mint address. Defaults to USDC if omitted. Must be on AMINA-approved whitelist. */
  tokenMint?: string;
  /** "escrow" (PDA) or "direct" atomic settlement */
  settlementMode: SettlementMode;
  /** "manual" approval or "ai" compliance check */
  releaseMode: ReleaseMode;
  /** Party IDs who must approve for manual release */
  approvalParties?: string[];
  /** Condition IDs for AI release */
  releaseConditions?: string[];
  /** Free-text instructions for manual reviewers */
  approvalInstructions?: string;
  actorEmail?: string;
  /** Party display names for receipts, audit log, and detail views */
  payerName?: string;
  payerAccountLabel?: string;
  payerBranchName?: string;
  recipientName?: string;
  recipientAccountLabel?: string;
  recipientBranchName?: string;
  /** Payment timelock hours (cooling-off period). 0 = disabled. */
  timelockHours?: number;
}

export interface SaveDraftParams {
  clientId: string;
  payerWallet: string;
  recipientWallet?: string;
  amount?: number;
  corridor?: string;
  conditionType?: string;
  settlementAuthority?: string;
  tokenMint?: string;
  settlementMode?: SettlementMode;
  releaseMode?: ReleaseMode;
  approvalParties?: string[];
  releaseConditions?: string[];
  approvalInstructions?: string;
  actorEmail?: string;
  payerName?: string;
  payerAccountLabel?: string;
  payerBranchName?: string;
  recipientName?: string;
  recipientAccountLabel?: string;
  recipientBranchName?: string;
  timelockHours?: number;
}

export interface UpdateDraftParams {
  payerWallet?: string;
  recipientWallet?: string;
  amount?: number;
  corridor?: string;
  conditionType?: string;
  settlementAuthority?: string;
  tokenMint?: string;
  settlementMode?: SettlementMode;
  releaseMode?: ReleaseMode;
  approvalParties?: string[];
  releaseConditions?: string[];
  approvalInstructions?: string;
  actorEmail?: string;
  payerName?: string;
  payerAccountLabel?: string;
  payerBranchName?: string;
  recipientName?: string;
  recipientAccountLabel?: string;
  recipientBranchName?: string;
  timelockHours?: number;
}

export interface CreateEscrowResult {
  escrow: Record<string, unknown>;
  complianceResult: Record<string, unknown>;
  activityLog: Array<Record<string, unknown>>;
}

export interface ListEscrowsParams {
  clientId: string | null;
  status?: string;
  corridor?: string;
  limit?: number;
  offset?: number;
  /** Filter by payer, recipient, or all (default: all) */
  role?: 'payer' | 'recipient' | 'all';
}

export class InstitutionEscrowService {
  private prisma: PrismaClient;
  private allowlistService: AllowlistService;
  private complianceService: ComplianceService;

  constructor() {
    this.prisma = prisma;
    this.allowlistService = getAllowlistService();
    this.complianceService = getComplianceService();
  }

  /**
   * Lazy getter for InstitutionEscrowProgramService.
   */
  private getProgramService(): InstitutionEscrowProgramService | null {
    try {
      return getInstitutionEscrowProgramService();
    } catch (err) {
      console.warn('[InstitutionEscrow] ProgramService not available:', (err as Error).message);
      return null;
    }
  }

  /**
   * Lazy getter for NoncePoolManager to avoid circular import at load time.
   * The singleton is created in offers.routes.ts and exported from there.
   */
  private getNoncePoolManager(): NoncePoolManager | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { noncePoolManager } = require('../routes/offers.routes');
      return noncePoolManager || null;
    } catch {
      return null;
    }
  }

  /**
   * Generate a human-readable escrow code in EE-XXX-XXX format.
   * Uses uppercase alphanumeric characters (excludes ambiguous: 0/O, 1/I/L).
   */
  private generateEscrowCode(): string {
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 30 chars
    const bytes = crypto.randomBytes(6);
    let code = 'EE-';
    for (let i = 0; i < 6; i++) {
      if (i === 3) code += '-';
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }

  /**
   * Calculate platform fee with min/max clamping from client settings.
   */
  private async calculatePlatformFee(clientId: string, amount: number): Promise<number> {
    let feeBps = parseInt(process.env.INSTITUTION_ESCROW_FEE_BPS || '20', 10);
    let minFee = 0.2;
    let maxFee = 20.0;

    try {
      const settings = await this.prisma.institutionClientSettings.findUnique({
        where: { clientId },
        select: { feeBps: true, minFeeUsdc: true, maxFeeUsdc: true },
      });
      if (settings) {
        feeBps = settings.feeBps ?? feeBps;
        minFee = settings.minFeeUsdc ? Number(settings.minFeeUsdc) : minFee;
        maxFee = settings.maxFeeUsdc ? Number(settings.maxFeeUsdc) : maxFee;
      }
    } catch {
      // Fall back to defaults if settings lookup fails
    }

    // Use integer arithmetic to avoid floating-point rounding errors.
    // Convert amount to micro-USDC (6 decimals), apply BPS, then convert back.
    // E.g. 599.99 USDC * 20 bps: 599990000 * 20 / 10000 = 1199980 micro = 1.199980 USDC
    const amountMicro = Math.round(amount * 1_000_000);
    const feeMicro = Math.floor((amountMicro * feeBps) / 10000);
    const rawFee = feeMicro / 1_000_000;
    // Round to 6 decimal places (USDC precision) to prevent float drift
    const fee = Math.round(Math.min(maxFee, Math.max(minFee, rawFee)) * 1_000_000) / 1_000_000;
    return fee;
  }

  /**
   * Resolve timelock hours using priority chain:
   * 1. Per-escrow value (if provided) — 0 = disabled (returns null)
   * 2. Per-client defaultTimelockHours (from InstitutionClientSettings)
   * 3. Global config defaultTimelockHours
   * 4. null (no timelock)
   */
  private async resolveTimelockHours(
    clientId: string,
    perEscrowValue?: number
  ): Promise<number | null> {
    if (perEscrowValue !== undefined) {
      return perEscrowValue > 0 ? perEscrowValue : null;
    }
    try {
      const settings = await this.prisma.institutionClientSettings.findUnique({
        where: { clientId },
        select: { defaultTimelockHours: true },
      });
      if (settings?.defaultTimelockHours != null && settings.defaultTimelockHours > 0) {
        return settings.defaultTimelockHours;
      }
    } catch {
      // Fall through to global default
    }
    const instConfig = getInstitutionEscrowConfig();
    return instConfig.defaultTimelockHours > 0 ? instConfig.defaultTimelockHours : null;
  }

  /**
   * Create a new institution escrow
   */
  async createEscrow(params: CreateEscrowParams): Promise<CreateEscrowResult> {
    const {
      clientId,
      payerWallet,
      recipientWallet,
      amount,
      corridor,
      conditionType,
      expiryHours = 72,
      settlementAuthority,
      tokenMint,
      settlementMode,
      releaseMode,
      approvalParties,
      releaseConditions: rawReleaseConditions,
      approvalInstructions,
      actorEmail,
    } = params;

    // Ensure legal_compliance is always included for AI release mode (Set union)
    const releaseConditions =
      releaseMode === 'ai'
        ? [...new Set([...(rawReleaseConditions || []), 'legal_compliance'])]
        : rawReleaseConditions;

    // 1. Validate client is verified
    const client = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
    });
    if (!client) {
      throw new Error('Client not found');
    }
    if (client.status !== 'ACTIVE') {
      throw new Error(`Client account is ${client.status}. Must be ACTIVE.`);
    }
    if (client.kycStatus !== 'VERIFIED') {
      throw new Error(`KYC status is ${client.kycStatus}. Must be VERIFIED.`);
    }

    // 2. Run compliance checks
    const complianceResult = await this.complianceService.validateTransaction({
      clientId,
      payerWallet,
      recipientWallet,
      amount,
      corridor,
    });

    if (!complianceResult.passed) {
      // If compliance fails with HIGH risk (above reject threshold), reject immediately
      const thresholds = await this.complianceService.getComplianceThresholds();
      if (complianceResult.riskScore >= thresholds.rejectScore) {
        throw new Error(`Compliance check failed: ${complianceResult.reasons.join('; ')}`);
      }
      // For medium risk (above hold threshold), create with COMPLIANCE_HOLD status
    }

    // 3. Generate escrow ID and human-readable code
    const escrowId = crypto.randomUUID();
    const escrowCode = this.generateEscrowCode();

    // 4. Resolve and validate token mint against AMINA-approved whitelist
    const tokenWhitelist = getTokenWhitelistService();
    let resolvedMint: string;
    if (tokenMint) {
      await tokenWhitelist.validateMint(tokenMint);
      resolvedMint = tokenMint;
    } else {
      resolvedMint = await tokenWhitelist.getDefaultMint();
    }

    // 5. Validate recipient wallet belongs to a registered institution
    await this.validateRecipientWallet(recipientWallet, clientId);

    // 6. Calculate platform fee with min/max clamping from client settings
    const platformFee = await this.calculatePlatformFee(clientId, amount);

    // 6. Determine initial status — always CREATED per lifecycle design.
    // Compliance concerns are recorded in riskScore and audit trail;
    // COMPLIANCE_HOLD is only applied after funding (at release time).
    const initialStatus: InstitutionEscrowStatus = 'CREATED';

    // 7. Calculate expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    // 7b. Resolve timelock hours: per-escrow > per-client > global config > 0
    const resolvedTimelockHours = await this.resolveTimelockHours(
      clientId,
      params.timelockHours
    );
    // Validate timelockHours < expiryHours to prevent un-releasable escrows
    if (resolvedTimelockHours && resolvedTimelockHours >= expiryHours) {
      throw new Error(
        `timelockHours (${resolvedTimelockHours}) must be less than expiryHours (${expiryHours})`
      );
    }

    // 8. Determine settlement authority — prefer explicit param, then client's primary wallet (if valid), else payer
    let resolvedSettlementAuthority = settlementAuthority || payerWallet;
    if (!settlementAuthority && client.primaryWallet) {
      try {
        new PublicKey(client.primaryWallet);
        resolvedSettlementAuthority = client.primaryWallet;
      } catch {
        // client.primaryWallet is not a valid Solana address (e.g. placeholder seed data)
      }
    }

    // 8b. Override settlement authority with CDP wallet when cdp_policy_approval is selected
    if (releaseConditions?.includes('cdp_policy_approval')) {
      const institutionConfig = getInstitutionEscrowConfig();
      if (!institutionConfig.cdp.enabled) {
        throw new Error('CDP settlement authority is not enabled. Set CDP_ENABLED=true to use cdp_policy_approval.');
      }
      const cdpService = getCdpSettlementService();
      resolvedSettlementAuthority = (await cdpService.getPublicKey()).toBase58();
    }

    // 9. Assign durable nonce for atomic settlement (required for on-chain proof)
    let nonceAccount: string | null = null;
    const npm = this.getNoncePoolManager();
    if (npm) {
      try {
        nonceAccount = await npm.assignNonceToOffer();
        console.log(`[InstitutionEscrow] Assigned nonce ${nonceAccount} to escrow ${escrowCode}`);
      } catch (error) {
        throw new Error(`Failed to assign durable nonce for escrow: ${(error as Error).message}`);
      }
    } else {
      console.warn(
        '[InstitutionEscrow] NoncePoolManager not available — escrow will lack atomic settlement'
      );
    }

    // 10. Initialize escrow on-chain (skip for direct payments — no vault needed)
    let escrowPda: string | null = null;
    let vaultPda: string | null = null;
    let initTxSignature: string | null = null;
    const programService = this.getProgramService();
    if (programService && settlementMode !== 'direct') {
      // Validate all PublicKey inputs before on-chain call
      if (!config.platform.feeCollectorAddress) {
        throw new Error('Platform feeCollectorAddress is not configured');
      }
      // Use the env-configured USDC mint for on-chain operations — the whitelist may
      // contain mainnet addresses that don't exist on devnet/staging.
      const onChainMint = programService.getUsdcMintAddress();
      if (resolvedMint !== onChainMint.toBase58()) {
        console.warn(
          `[InstitutionEscrow] Mint mismatch: whitelist resolved "${resolvedMint}" but env USDC_MINT_ADDRESS is "${onChainMint.toBase58()}". Using env mint for on-chain tx.`
        );
      }
      const feeCollectorPk = toPublicKey(
        config.platform.feeCollectorAddress,
        'feeCollectorAddress'
      );
      const payerPk = toPublicKey(payerWallet, 'payerWallet');
      const recipientPk = toPublicKey(recipientWallet, 'recipientWallet');

      // When CDP is enabled and cdp_policy_approval is selected, use the CDP wallet
      // as on-chain settlement authority. Otherwise default to admin keypair.
      const onChainSettlementAuthority = releaseConditions?.includes('cdp_policy_approval')
        ? toPublicKey(resolvedSettlementAuthority, 'settlementAuthority')
        : programService.adminPublicKey;

      try {
        const result = await programService.initEscrowOnChain({
          escrowId,
          payerWallet: payerPk,
          recipientWallet: recipientPk,
          usdcMint: onChainMint,
          feeCollector: feeCollectorPk,
          settlementAuthority: onChainSettlementAuthority,
          amount,
          platformFee,
          conditionType: conditionType as string,
          corridor,
          expiryTimestamp: Math.floor(expiresAt.getTime() / 1000),
          escrowCode,
        });
        escrowPda = result.escrowPda;
        vaultPda = result.vaultPda;
        initTxSignature = result.txSignature;
        console.log(
          `[InstitutionEscrow] On-chain init success for ${escrowCode}, tx: ${initTxSignature}`
        );
      } catch (error) {
        console.error('[InstitutionEscrow] On-chain init failed:', error);
        if (nonceAccount && npm) {
          try {
            await npm.releaseNonce(nonceAccount);
          } catch {
            /* non-critical */
          }
        }
        await this.createAuditLog(escrowId, clientId, 'ON_CHAIN_INIT_FAILED', client.companyName, {
          error: (error as Error).message,
        });
        throw new Error(`On-chain escrow initialization failed: ${(error as Error).message}`);
      }
    }

    // 11. Store in Prisma
    const escrow = await this.prisma.institutionEscrow.create({
      data: {
        escrowId,
        escrowCode,
        clientId,
        payerWallet,
        recipientWallet,
        usdcMint: resolvedMint,
        amount,
        platformFee,
        corridor,
        conditionType: conditionType as any,
        status: initialStatus,
        settlementAuthority: resolvedSettlementAuthority,
        riskScore: complianceResult.riskScore,
        nonceAccount,
        escrowPda,
        vaultPda,
        expiresAt,
        settlementMode,
        releaseMode,
        approvalParties: approvalParties || [],
        releaseConditions: releaseConditions || [],
        approvalInstructions,
        initTxSignature,
        payerName: params.payerName || null,
        payerAccountLabel: params.payerAccountLabel || null,
        payerBranchName: params.payerBranchName || null,
        recipientName: params.recipientName || null,
        recipientAccountLabel: params.recipientAccountLabel || null,
        recipientBranchName: params.recipientBranchName || null,
        timelockHours: resolvedTimelockHours,
      },
    });

    // 12. Create KYT-enriched audit logs
    await this.createKytAuditLog(escrow, 'ESCROW_CREATED', actorEmail || client.companyName, {
      initTxSignature,
      conditionType,
      releaseMode,
      releaseConditions: releaseConditions || [],
      message: `Payment initiated for ${amount} USDC on corridor ${corridor}`,
    });

    // Separate compliance screening audit entry
    const failedChecks = complianceResult.checks?.filter((c: any) => c.status === 'FAIL') || [];
    const warnChecks = complianceResult.checks?.filter((c: any) => c.status === 'WARNING') || [];
    await this.createKytAuditLog(escrow, 'COMPLIANCE_SCREENING', 'EasyEscrow AI Assistant', {
      passed: complianceResult.passed,
      riskScore: complianceResult.riskScore,
      riskLevel: complianceResult.riskLevel,
      checksCount: complianceResult.checks?.length || 0,
      failedCount: failedChecks.length,
      warningCount: warnChecks.length,
      checks: complianceResult.checks,
      flags: complianceResult.flags,
      message: complianceResult.passed
        ? `All 12 checks passed — risk score ${complianceResult.riskScore}/100 (${complianceResult.riskLevel})`
        : `${failedChecks.length} failed, ${warnChecks.length} warnings — risk score ${complianceResult.riskScore}/100 (${complianceResult.riskLevel})`,
    });

    // Log compliance warnings if any checks failed (but don't hold the escrow)
    if (!complianceResult.passed) {
      await this.createKytAuditLog(escrow, 'COMPLIANCE_WARNING', 'EasyEscrow AI Assistant', {
        riskScore: complianceResult.riskScore,
        riskLevel: complianceResult.riskLevel,
        message: `Compliance warnings noted — risk score ${complianceResult.riskScore}/100 (${complianceResult.riskLevel}). Review recommended before release.`,
      });
    }

    // 11. Send notifications
    try {
      const notificationService = getInstitutionNotificationService();
      await notificationService.notify({
        clientId,
        escrowId,
        type: 'ESCROW_CREATED',
        title: 'Escrow Created',
        message: `Escrow ${escrowCode} created for ${amount} USDC on corridor ${corridor}. ${settlementMode === 'direct' ? 'Awaiting proof of delivery.' : 'Awaiting deposit.'}`,
        metadata: { amount, corridor, escrowCode, riskScore: complianceResult.riskScore },
      });
    } catch (error) {
      console.warn('[InstitutionEscrow] Notification failed (non-critical):', error);
    }

    // 12. Cache in Redis
    await this.cacheEscrow(escrow);

    const [partyNames, activityLog] = await Promise.all([
      this.resolvePartyNames([escrow as any], clientId),
      this.getActivityLog(escrow.escrowId),
    ]);

    return {
      escrow: this.formatEscrow(escrow, partyNames[0]),
      complianceResult: {
        passed: complianceResult.passed,
        riskScore: complianceResult.riskScore,
        flags: complianceResult.flags,
        checks: complianceResult.checks,
        riskLevel: complianceResult.riskLevel,
      },
      activityLog,
    };
  }

  /**
   * Save a new escrow as DRAFT — no compliance check, no nonce, no expiry.
   * Only payerWallet is required; other fields can be filled in later.
   */
  async saveDraft(params: SaveDraftParams): Promise<Record<string, unknown>> {
    const {
      clientId,
      payerWallet,
      recipientWallet,
      amount,
      corridor,
      conditionType,
      settlementAuthority,
      tokenMint,
      settlementMode,
      releaseMode,
      approvalParties,
      releaseConditions: rawDraftConditions,
      approvalInstructions,
      actorEmail,
    } = params;

    // Ensure legal_compliance is always included for AI release mode (Set union)
    const releaseConditions =
      releaseMode === 'ai'
        ? [...new Set([...(rawDraftConditions || []), 'legal_compliance'])]
        : rawDraftConditions;

    // Validate client exists and is active
    const client = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
    });
    if (!client) throw new Error('Client not found');
    if (client.status !== 'ACTIVE')
      throw new Error(`Client account is ${client.status}. Must be ACTIVE.`);

    const escrowId = crypto.randomUUID();
    const escrowCode = this.generateEscrowCode();

    // Resolve token mint (default USDC)
    const tokenWhitelist = getTokenWhitelistService();
    let resolvedMint: string;
    if (tokenMint) {
      await tokenWhitelist.validateMint(tokenMint);
      resolvedMint = tokenMint;
    } else {
      resolvedMint = await tokenWhitelist.getDefaultMint();
    }

    const resolvedAmount = amount || 0;
    const platformFee =
      resolvedAmount > 0 ? await this.calculatePlatformFee(clientId, resolvedAmount) : 0;

    // Resolve timelock for draft: per-escrow > per-client > global > null
    const draftTimelockHours = params.timelockHours !== undefined
      ? (params.timelockHours > 0 ? params.timelockHours : null)
      : null; // Drafts only store explicit value; defaults applied at submit/create

    const escrow = await this.prisma.institutionEscrow.create({
      data: {
        escrowId,
        escrowCode,
        clientId,
        payerWallet,
        recipientWallet: recipientWallet || null,
        usdcMint: resolvedMint,
        amount: resolvedAmount,
        platformFee,
        corridor: corridor || null,
        conditionType: conditionType ? (conditionType as any) : null,
        status: 'DRAFT',
        settlementAuthority: settlementAuthority || client.primaryWallet || payerWallet,
        expiresAt: null,
        settlementMode: settlementMode || null,
        releaseMode: releaseMode || null,
        approvalParties: approvalParties || [],
        releaseConditions: releaseConditions || [],
        approvalInstructions: approvalInstructions || null,
        timelockHours: draftTimelockHours,
        payerName: params.payerName || null,
        payerAccountLabel: params.payerAccountLabel || null,
        payerBranchName: params.payerBranchName || null,
        recipientName: params.recipientName || null,
        recipientAccountLabel: params.recipientAccountLabel || null,
        recipientBranchName: params.recipientBranchName || null,
      },
    });

    await this.createAuditLog(escrowId, clientId, 'DRAFT_SAVED', actorEmail || client.companyName, {
      amount: resolvedAmount,
      corridor: corridor || null,
    });

    await this.cacheEscrow(escrow);

    const partyNames = await this.resolvePartyNames([escrow as any], clientId);
    return this.formatEscrow(escrow, partyNames[0]);
  }

  /**
   * Update fields on a DRAFT escrow. Only DRAFT status escrows can be updated.
   */
  async updateDraft(
    clientId: string,
    idOrCode: string,
    params: UpdateDraftParams
  ): Promise<Record<string, unknown>> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    if (escrow.status !== 'DRAFT') {
      throw new Error(`Cannot update: escrow status is ${escrow.status}, expected DRAFT`);
    }

    const updateData: Record<string, unknown> = {};

    if (params.payerWallet !== undefined) updateData.payerWallet = params.payerWallet;
    if (params.recipientWallet !== undefined) updateData.recipientWallet = params.recipientWallet;
    if (params.corridor !== undefined) updateData.corridor = params.corridor;
    if (params.conditionType !== undefined) updateData.conditionType = params.conditionType;
    if (params.settlementAuthority !== undefined)
      updateData.settlementAuthority = params.settlementAuthority;

    if (params.amount !== undefined) {
      updateData.amount = params.amount;
      updateData.platformFee =
        params.amount > 0 ? await this.calculatePlatformFee(escrow.clientId, params.amount) : 0;
    }

    if (params.tokenMint !== undefined) {
      const tokenWhitelist = getTokenWhitelistService();
      await tokenWhitelist.validateMint(params.tokenMint);
      updateData.usdcMint = params.tokenMint;
    }

    if (params.settlementMode !== undefined) updateData.settlementMode = params.settlementMode;
    if (params.releaseMode !== undefined) updateData.releaseMode = params.releaseMode;
    if (params.approvalParties !== undefined) updateData.approvalParties = params.approvalParties;
    if (params.releaseConditions !== undefined) {
      // Ensure legal_compliance is always included for AI release mode (Set union)
      const effectiveMode = params.releaseMode ?? escrow.releaseMode;
      updateData.releaseConditions =
        effectiveMode === 'ai'
          ? [...new Set([...params.releaseConditions, 'legal_compliance'])]
          : params.releaseConditions;
    }
    if (params.approvalInstructions !== undefined)
      updateData.approvalInstructions = params.approvalInstructions;

    if (params.payerName !== undefined) updateData.payerName = params.payerName;
    if (params.payerAccountLabel !== undefined)
      updateData.payerAccountLabel = params.payerAccountLabel;
    if (params.payerBranchName !== undefined) updateData.payerBranchName = params.payerBranchName;
    if (params.recipientName !== undefined) updateData.recipientName = params.recipientName;
    if (params.recipientAccountLabel !== undefined)
      updateData.recipientAccountLabel = params.recipientAccountLabel;
    if (params.recipientBranchName !== undefined)
      updateData.recipientBranchName = params.recipientBranchName;

    if (params.timelockHours !== undefined) {
      updateData.timelockHours = params.timelockHours > 0 ? params.timelockHours : null;
    }

    // Post-merge check: ensure payer !== recipient after partial update
    const mergedPayerWallet = (updateData.payerWallet as string) || escrow.payerWallet;
    const mergedRecipientWallet = (updateData.recipientWallet as string) || escrow.recipientWallet;
    if (mergedPayerWallet && mergedRecipientWallet && mergedPayerWallet === mergedRecipientWallet) {
      throw new Error('recipientWallet must not equal payerWallet');
    }

    const updated = await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: updateData as any,
    });

    await this.createAuditLog(
      escrowId,
      clientId,
      'DRAFT_UPDATED',
      params.actorEmail || (await this.resolveActorName(clientId)),
      {
        updatedFields: Object.keys(updateData),
      }
    );

    await this.cacheEscrow(updated);

    const partyNames = await this.resolvePartyNames([updated as any], clientId);
    return this.formatEscrow(updated, partyNames[0]);
  }

  /**
   * Submit a DRAFT escrow — validates all required fields are present,
   * runs compliance checks, assigns nonce, and transitions to CREATED.
   */
  async submitDraft(
    clientId: string,
    idOrCode: string,
    expiryHours = 72,
    actorEmail?: string
  ): Promise<CreateEscrowResult> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    if (escrow.status !== 'DRAFT') {
      throw new Error(`Cannot submit: escrow status is ${escrow.status}, expected DRAFT`);
    }

    // Validate all required fields are present
    if (!escrow.recipientWallet)
      throw new Error('Cannot submit draft: recipientWallet is required');
    if (!escrow.corridor) throw new Error('Cannot submit draft: corridor is required');
    if (!escrow.conditionType) throw new Error('Cannot submit draft: conditionType is required');
    if (!escrow.amount || Number(escrow.amount) <= 0)
      throw new Error('Cannot submit draft: amount must be greater than 0');
    if (escrow.payerWallet === escrow.recipientWallet)
      throw new Error('Cannot submit draft: payerWallet and recipientWallet must be different');

    // Validate KYC
    const client = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
    });
    if (!client) throw new Error('Client not found');
    if (client.kycStatus !== 'VERIFIED')
      throw new Error(`KYC status is ${client.kycStatus}. Must be VERIFIED.`);

    // Validate recipient wallet belongs to a registered institution
    await this.validateRecipientWallet(escrow.recipientWallet, clientId);

    // Run compliance checks
    const complianceResult = await this.complianceService.validateTransaction({
      clientId,
      payerWallet: escrow.payerWallet,
      recipientWallet: escrow.recipientWallet,
      amount: Number(escrow.amount),
      corridor: escrow.corridor,
    });

    if (!complianceResult.passed) {
      const thresholds = await this.complianceService.getComplianceThresholds();
      if (complianceResult.riskScore >= thresholds.rejectScore) {
        throw new Error(`Compliance check failed: ${complianceResult.reasons.join('; ')}`);
      }
    }

    // Determine status — always CREATED per lifecycle design.
    // COMPLIANCE_HOLD is only applied after funding (at release time).
    const newStatus: InstitutionEscrowStatus = 'CREATED';

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    // Assign durable nonce
    let nonceAccount: string | null = null;
    const npm = this.getNoncePoolManager();
    if (npm) {
      try {
        nonceAccount = await npm.assignNonceToOffer();
        console.log(
          `[InstitutionEscrow] Assigned nonce ${nonceAccount} to draft ${escrow.escrowCode}`
        );
      } catch (error) {
        throw new Error(`Failed to assign durable nonce: ${(error as Error).message}`);
      }
    }

    // Initialize escrow on-chain (skip for direct payments — no vault needed)
    let escrowPda: string | null = null;
    let vaultPda: string | null = null;
    let initTxSignature: string | null = null;
    const programService = this.getProgramService();
    if (programService && (escrow as any).settlementMode !== 'direct') {
      if (!config.platform.feeCollectorAddress) {
        throw new Error('Platform feeCollectorAddress is not configured');
      }
      let resolvedSettlementAuthority = escrow.settlementAuthority || escrow.payerWallet;

      // Override with CDP wallet when cdp_policy_approval is selected
      const draftReleaseConditions: string[] = (escrow.releaseConditions as string[]) || [];
      if (draftReleaseConditions.includes('cdp_policy_approval')) {
        const institutionConfig = getInstitutionEscrowConfig();
        if (!institutionConfig.cdp.enabled) {
          throw new Error('CDP settlement authority is not enabled. Set CDP_ENABLED=true to use cdp_policy_approval.');
        }
        const cdpService = getCdpSettlementService();
        resolvedSettlementAuthority = (await cdpService.getPublicKey()).toBase58();
      }

      const onChainMint = programService.getUsdcMintAddress();
      if (escrow.usdcMint !== onChainMint.toBase58()) {
        console.warn(
          `[InstitutionEscrow] Draft mint mismatch: DB has "${
            escrow.usdcMint
          }" but env USDC_MINT_ADDRESS is "${onChainMint.toBase58()}". Using env mint for on-chain tx.`
        );
      }
      const feeCollectorPk = toPublicKey(
        config.platform.feeCollectorAddress,
        'feeCollectorAddress'
      );
      const payerPk = toPublicKey(escrow.payerWallet, 'payerWallet');
      const recipientPk = toPublicKey(escrow.recipientWallet!, 'recipientWallet');
      const onChainSettlementAuthority = toPublicKey(
        resolvedSettlementAuthority,
        'settlementAuthority'
      );

      try {
        const result = await programService.initEscrowOnChain({
          escrowId,
          payerWallet: payerPk,
          recipientWallet: recipientPk,
          usdcMint: onChainMint,
          feeCollector: feeCollectorPk,
          settlementAuthority: onChainSettlementAuthority,
          amount: Number(escrow.amount),
          platformFee: Number(escrow.platformFee),
          conditionType: escrow.conditionType as string,
          corridor: escrow.corridor!,
          expiryTimestamp: Math.floor(expiresAt.getTime() / 1000),
          escrowCode: escrow.escrowCode,
        });
        escrowPda = result.escrowPda;
        vaultPda = result.vaultPda;
        initTxSignature = result.txSignature;
        console.log(
          `[InstitutionEscrow] On-chain init success for draft ${escrow.escrowCode}, tx: ${initTxSignature}`
        );
      } catch (error) {
        console.error('[InstitutionEscrow] On-chain init failed for draft:', error);
        if (nonceAccount && npm) {
          try {
            await npm.releaseNonce(nonceAccount);
          } catch {
            /* non-critical */
          }
        }
        await this.createAuditLog(
          escrowId,
          clientId,
          'ON_CHAIN_INIT_FAILED',
          await this.resolveActorName(clientId),
          {
            error: (error as Error).message,
          }
        );
        throw new Error(`On-chain escrow initialization failed: ${(error as Error).message}`);
      }
    }

    // Resolve timelock: if draft already has one, keep it; otherwise apply defaults
    const resolvedTimelockHours = await this.resolveTimelockHours(
      clientId,
      escrow.timelockHours != null ? escrow.timelockHours : undefined
    );
    if (resolvedTimelockHours && resolvedTimelockHours >= expiryHours) {
      throw new Error(
        `timelockHours (${resolvedTimelockHours}) must be less than expiryHours (${expiryHours})`
      );
    }

    const updated = await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: {
        status: newStatus,
        riskScore: complianceResult.riskScore,
        nonceAccount,
        escrowPda,
        vaultPda,
        expiresAt,
        initTxSignature,
        timelockHours: resolvedTimelockHours,
      },
    });

    await this.createKytAuditLog(updated, 'DRAFT_SUBMITTED', actorEmail || client.companyName, {
      conditionType: escrow.conditionType,
      message: `Draft submitted for ${Number(escrow.amount)} USDC on corridor ${escrow.corridor}`,
    });

    // Separate compliance screening audit entry
    const failedChecks2 = complianceResult.checks?.filter((c: any) => c.status === 'FAIL') || [];
    const warnChecks2 = complianceResult.checks?.filter((c: any) => c.status === 'WARNING') || [];
    await this.createKytAuditLog(updated, 'COMPLIANCE_SCREENING', 'EasyEscrow AI Assistant', {
      passed: complianceResult.passed,
      riskScore: complianceResult.riskScore,
      riskLevel: complianceResult.riskLevel,
      checksCount: complianceResult.checks?.length || 0,
      failedCount: failedChecks2.length,
      warningCount: warnChecks2.length,
      checks: complianceResult.checks,
      flags: complianceResult.flags,
      message: complianceResult.passed
        ? `All 12 checks passed — risk score ${complianceResult.riskScore}/100 (${complianceResult.riskLevel})`
        : `${failedChecks2.length} failed, ${warnChecks2.length} warnings — risk score ${complianceResult.riskScore}/100 (${complianceResult.riskLevel})`,
    });

    // Log compliance warnings if any checks failed (but don't hold the escrow)
    if (!complianceResult.passed) {
      await this.createKytAuditLog(updated, 'COMPLIANCE_WARNING', 'EasyEscrow AI Assistant', {
        riskScore: complianceResult.riskScore,
        riskLevel: complianceResult.riskLevel,
        message: `Compliance warnings noted — risk score ${complianceResult.riskScore}/100 (${complianceResult.riskLevel}). Review recommended before release.`,
      });
    }

    await this.cacheEscrow(updated);

    // Send notification
    try {
      const notificationService = getInstitutionNotificationService();
      await notificationService.notify({
        clientId,
        escrowId,
        type: 'ESCROW_CREATED',
        title: 'Escrow Created',
        message: `Escrow ${escrow.escrowCode} created for ${Number(
          escrow.amount
        )} USDC on corridor ${escrow.corridor}. ${(escrow as any).settlementMode === 'direct' ? 'Awaiting proof of delivery.' : 'Awaiting deposit.'}`,
        metadata: {
          amount: Number(escrow.amount),
          corridor: escrow.corridor,
          escrowCode: escrow.escrowCode,
          riskScore: complianceResult.riskScore,
        },
      });
    } catch (error) {
      console.warn('[InstitutionEscrow] Notification failed (non-critical):', error);
    }

    const [submitPartyNames, submitActivityLog] = await Promise.all([
      this.resolvePartyNames([updated as any], clientId),
      this.getActivityLog(updated.escrowId),
    ]);

    return {
      escrow: this.formatEscrow(updated, submitPartyNames[0]),
      complianceResult: {
        passed: complianceResult.passed,
        riskScore: complianceResult.riskScore,
        flags: complianceResult.flags,
        checks: complianceResult.checks,
        riskLevel: complianceResult.riskLevel,
      },
      activityLog: submitActivityLog,
    };
  }

  /**
   * Record a deposit for an escrow
   */
  async recordDeposit(
    clientId: string,
    idOrCode: string,
    txSignature: string,
    actorEmail?: string
  ): Promise<Record<string, unknown>> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    if ((escrow as any).settlementMode === 'direct') {
      throw new Error('Cannot record deposit: this escrow uses direct settlement (no deposit step required)');
    }

    if (escrow.status !== 'CREATED') {
      throw new Error(`Cannot record deposit: escrow status is ${escrow.status}, expected CREATED`);
    }

    // Check if expired
    if (escrow.expiresAt && new Date() > escrow.expiresAt) {
      await this.prisma.institutionEscrow.update({
        where: { escrowId },
        data: { status: 'EXPIRED', resolvedAt: new Date() },
      });
      try {
        await getInstitutionNotificationService().notify({
          clientId,
          escrowId,
          type: 'ESCROW_EXPIRED',
          title: 'Escrow Expired',
          message: `Escrow ${
            escrow.escrowCode || escrowId
          } has expired without a deposit being recorded.`,
          metadata: { amount: Number(escrow.amount), corridor: escrow.corridor },
        });
      } catch (error) {
        console.warn(
          '[InstitutionEscrow] ESCROW_EXPIRED notification failed (non-critical):',
          error
        );
      }
      throw new Error('Escrow has expired');
    }

    // Record the deposit
    await this.prisma.institutionDeposit.create({
      data: {
        escrowId,
        txSignature,
        amount: escrow.amount,
        confirmedAt: new Date(),
      },
    });

    // Update escrow status to FUNDED and compute unlockAt from timelockHours
    const fundedAt = new Date();
    const unlockAt = escrow.timelockHours && escrow.timelockHours > 0
      ? new Date(fundedAt.getTime() + escrow.timelockHours * 60 * 60 * 1000)
      : null;

    const updated = await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: {
        status: 'FUNDED',
        depositTxSignature: txSignature,
        fundedAt,
        unlockAt,
      },
    });

    // Verify on-chain state matches (non-blocking)
    const programService2 = this.getProgramService();
    if (programService2 && escrow.escrowPda) {
      try {
        const onChainState = await programService2.verifyOnChainState(escrowId);
        if (onChainState.exists) {
          if (onChainState.status === undefined) {
            console.warn(
              `[InstitutionEscrow] On-chain account exists but status decoding failed for ${escrowId}`
            );
          } else if (onChainState.status !== 1) {
            console.warn(
              `[InstitutionEscrow] On-chain status mismatch for ${escrowId}: expected Funded (1), got ${onChainState.status}`
            );
          } else {
            console.log(`[InstitutionEscrow] On-chain state verified as Funded for ${escrowId}`);
          }
        }
      } catch (err) {
        console.warn('[InstitutionEscrow] On-chain verification failed (non-critical):', err);
      }
    }

    await this.createKytAuditLog(
      escrow,
      'DEPOSIT_CONFIRMED',
      actorEmail || (await this.resolveActorName(escrow.clientId)),
      {
        txSignature,
        message: `${Number(escrow.amount)} USDC deposited to PDA`,
      }
    );

    if (unlockAt) {
      await this.createKytAuditLog(
        escrow,
        'TIMELOCK_SET',
        actorEmail || (await this.resolveActorName(escrow.clientId)),
        {
          timelockHours: escrow.timelockHours,
          unlockAt: unlockAt.toISOString(),
          message: `Payment timelock active — funds unlock at ${unlockAt.toISOString()}`,
        }
      );
    }

    // Bust payer's balance cache after deposit (USDC left their wallet)
    try {
      const { getInstitutionAccountService } = await import('./institution-account.service');
      await getInstitutionAccountService().invalidateBalanceCache(escrow.payerWallet);
    } catch {
      /* non-critical */
    }

    try {
      await getInstitutionNotificationService().notify({
        clientId,
        escrowId,
        type: 'ESCROW_FUNDED',
        title: 'Escrow Funded',
        message: `Deposit of ${Number(escrow.amount)} USDC confirmed for escrow ${
          escrow.escrowCode || escrowId
        }.`,
        metadata: { amount: Number(escrow.amount), txSignature },
      });
    } catch (error) {
      console.warn('[InstitutionEscrow] ESCROW_FUNDED notification failed (non-critical):', error);
    }

    // Notify the recipient that funds are locked and ready
    if (escrow.recipientWallet) {
      try {
        const recipientClientId = await this.resolveClientIdByWallet(escrow.recipientWallet);
        if (recipientClientId && recipientClientId !== clientId) {
          const senderName = await this.resolveActorName(escrow.clientId);
          await getInstitutionNotificationService().notify({
            clientId: recipientClientId,
            escrowId,
            type: 'ESCROW_FUNDED',
            title: `Payment Received — ${escrow.escrowCode || escrowId}`,
            message: `${senderName} has deposited ${Number(escrow.amount)} USDC into escrow ${
              escrow.escrowCode || escrowId
            }. Funds are locked and awaiting release conditions.`,
            metadata: {
              amount: Number(escrow.amount),
              escrowCode: escrow.escrowCode,
              sender: senderName,
              txSignature,
            },
          });
        }
      } catch {
        /* non-critical */
      }
    }

    await this.cacheEscrow(updated);

    const depositPartyNames = await this.resolvePartyNames([updated as any], clientId);
    return this.formatEscrow(updated, depositPartyNames[0]);
  }

  /**
   * Get a serialized unsigned deposit transaction for an escrow.
   * The frontend signs this with the payer's wallet and submits it.
   */
  async getDepositTransaction(
    clientId: string,
    idOrCode: string
  ): Promise<{
    transaction: string;
    escrowId: string;
    amount: number;
    platformFee: number;
    totalDeposit: number;
    currency: string;
  }> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    if ((escrow as any).settlementMode === 'direct') {
      throw new Error('Cannot get deposit transaction: this escrow uses direct settlement (no deposit required)');
    }

    if (escrow.status !== 'CREATED') {
      throw new Error(
        `Cannot get deposit transaction: escrow status is ${escrow.status}, expected CREATED`
      );
    }

    const programService = this.getProgramService();
    if (!programService) {
      throw new Error('Program service not available');
    }

    if (!config.platform.feeCollectorAddress) {
      throw new Error('Platform feeCollectorAddress is not configured');
    }

    const payerWallet = toPublicKey(escrow.payerWallet, 'payerWallet');
    const usdcMint = programService.getUsdcMintAddress();
    const feeCollector = toPublicKey(config.platform.feeCollectorAddress, 'feeCollectorAddress');

    const tx = await programService.buildDepositTransaction({
      escrowId,
      payer: payerWallet,
      usdcMint,
      feeCollector,
      memo: escrow.escrowCode ? `EasyEscrow:deposit:${escrow.escrowCode}` : undefined,
    });

    tx.feePayer = payerWallet;
    const { blockhash } = await programService.getConnection().getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');

    const amount = Number(escrow.amount);
    const platformFee = Number(escrow.platformFee);

    return {
      transaction: serialized,
      escrowId,
      amount,
      platformFee,
      totalDeposit: amount + platformFee,
      currency: 'USDC',
    };
  }

  /**
   * Perform AI release condition checks.
   * Runs the AI analysis service and evaluates each selected condition.
   * Returns a structured result with pass/fail per condition.
   */
  private async performAiReleaseCheck(
    escrow: any,
    clientId: string
  ): Promise<{
    passed: boolean;
    conditions: Array<{
      condition: string;
      label: string;
      passed: boolean;
      detail: string;
    }>;
    aiAnalysis: AiAnalysisResult & { summary: string };
  }> {
    const aiService = getAiAnalysisService();
    const analysis = await aiService.analyzeEscrow(escrow.escrowId, clientId);

    const selectedConditions: string[] = escrow.releaseConditions || [];
    const results: Array<{ condition: string; label: string; passed: boolean; detail: string }> =
      [];

    // Analyze the uploaded proof document(s) to extract invoice data
    // This is needed for invoice_amount_match and client_info_match conditions
    let docFields: Record<string, unknown> = {};
    const needsDocAnalysis =
      selectedConditions.includes('invoice_amount_match') ||
      selectedConditions.includes('client_info_match') ||
      selectedConditions.includes('document_signature_verified');

    if (needsDocAnalysis) {
      const latestFile = await this.prisma.institutionFile.findFirst({
        where: { escrowId: escrow.escrowId },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true, fileName: true, clientId: true },
      });

      if (latestFile) {
        try {
          const docAnalysis = await aiService.analyzeDocument({
            escrowId: escrow.escrowId,
            fileId: latestFile.id,
            clientId: latestFile.clientId,
            context: {
              expectedAmount: Number(escrow.amount),
              corridor: escrow.corridor,
            },
          });
          docFields = docAnalysis.extractedFields || {};
        } catch (err) {
          console.warn('[InstitutionEscrow] Document analysis for release check failed:', err);
        }
      }
    }

    // 1. Legal compliance (always required for AI mode)
    const compliancePassed = analysis.recommendation !== 'REJECT' && analysis.riskScore < 70;
    results.push({
      condition: 'legal_compliance',
      label: 'All legal compliance checks pass',
      passed: compliancePassed,
      detail: compliancePassed
        ? `Risk score ${analysis.riskScore}/100, recommendation: ${analysis.recommendation}`
        : `Failed: risk score ${analysis.riskScore}/100, recommendation: ${analysis.recommendation}`,
    });

    // 2. Invoice amount match (if selected) — uses document-extracted amount
    // Accept match against escrow amount OR escrow + platform fee (total due)
    if (selectedConditions.includes('invoice_amount_match')) {
      const extractedAmount = docFields.total_amount ?? docFields.invoiceAmount ?? docFields.amount;
      const escrowAmount = Number(escrow.amount);
      const totalDue = escrowAmount + Number(escrow.platformFee || 0);
      const extracted =
        extractedAmount !== undefined && extractedAmount !== null ? Number(extractedAmount) : NaN;
      const matchesEscrow = !isNaN(extracted) && Math.abs(extracted - escrowAmount) < 0.01;
      const matchesTotalDue = !isNaN(extracted) && Math.abs(extracted - totalDue) < 0.01;
      const amountMatches = matchesEscrow || matchesTotalDue;
      results.push({
        condition: 'invoice_amount_match',
        label: 'Invoice amount matches exactly',
        passed: amountMatches,
        detail: amountMatches
          ? `Invoice amount $${extracted.toLocaleString()} matches ${
              matchesEscrow ? 'escrow amount' : 'total due (escrow + fee)'
            } $${(matchesEscrow ? escrowAmount : totalDue).toLocaleString()}`
          : `Invoice amount ${
              !isNaN(extracted) ? `$${extracted.toLocaleString()}` : 'not found in document'
            } does not match escrow amount $${escrowAmount.toLocaleString()} or total due $${totalDue.toLocaleString()}`,
      });
    }

    // 3. Client information match (if selected) — verify sender & recipient from document
    if (selectedConditions.includes('client_info_match')) {
      // Look up both the payer (sender) and recipient client names
      const payerClient = await this.prisma.institutionClient.findUnique({
        where: { id: escrow.clientId },
        select: { companyName: true, legalName: true },
      });

      // Resolve recipient client by wallet
      let recipientCompanyName: string | null = null;
      if (escrow.recipientWallet) {
        const recipientClientId = await this.resolveClientIdByWallet(escrow.recipientWallet);
        if (recipientClientId) {
          const recipientClient = await this.prisma.institutionClient.findUnique({
            where: { id: recipientClientId },
            select: { companyName: true },
          });
          recipientCompanyName = recipientClient?.companyName || null;
        }
      }

      // Extract sender and recipient from the document
      const docSender =
        docFields.sender_name ?? docFields.counterparty_name ?? docFields.companyName;
      const docRecipient = docFields.recipient_name;

      // Check sender matches
      const senderMatch =
        docSender != null &&
        payerClient &&
        (String(docSender)
          .toLowerCase()
          .includes(payerClient.companyName?.toLowerCase() || '') ||
          String(docSender)
            .toLowerCase()
            .includes(payerClient.legalName?.toLowerCase() || ''));

      // Check recipient matches (if we can resolve the recipient)
      const recipientMatch =
        !recipientCompanyName ||
        (docRecipient != null &&
          String(docRecipient).toLowerCase().includes(recipientCompanyName.toLowerCase()));

      const bothMatch = !!senderMatch && recipientMatch;
      const details: string[] = [];
      if (senderMatch) {
        details.push(`Sender "${docSender}" matches "${payerClient?.companyName}"`);
      } else {
        details.push(
          `Sender "${docSender ?? 'not found'}" does not match "${payerClient?.companyName}"`
        );
      }
      if (recipientCompanyName) {
        if (
          docRecipient != null &&
          String(docRecipient).toLowerCase().includes(recipientCompanyName.toLowerCase())
        ) {
          details.push(`Recipient "${docRecipient}" matches "${recipientCompanyName}"`);
        } else {
          details.push(
            `Recipient "${docRecipient ?? 'not found'}" does not match "${recipientCompanyName}"`
          );
        }
      }

      results.push({
        condition: 'client_info_match',
        label: 'Client information matches exactly',
        passed: bothMatch,
        detail: details.join('; '),
      });
    }

    // 4. Document signature verified (if selected)
    if (selectedConditions.includes('document_signature_verified')) {
      const signatureVerified =
        docFields.signatureVerified === true || docFields.docusignStatus === 'completed';
      results.push({
        condition: 'document_signature_verified',
        label: 'Document signature is verified (via DocuSign)',
        passed: !!signatureVerified,
        detail: signatureVerified
          ? 'Document signature has been verified'
          : 'Document signature could not be verified',
      });
    }

    // 5. CDP policy approval (if selected)
    if (selectedConditions.includes('cdp_policy_approval')) {
      let cdpHealthy = false;
      try {
        cdpHealthy = await getCdpSettlementService().isHealthy();
      } catch {
        // CDP service not initialized — treat as unhealthy
      }
      results.push({
        condition: 'cdp_policy_approval',
        label: 'All policies passed by independent settlement authority',
        passed: cdpHealthy,
        detail: cdpHealthy
          ? 'CDP settlement authority is active — policies enforced at signing'
          : 'CDP settlement authority is unreachable',
      });
    }

    const allPassed = results.every((r) => r.passed);

    return { passed: allPassed, conditions: results, aiAnalysis: analysis };
  }

  /**
   * Mark escrow as fulfilled (proof of delivery submitted).
   * Transitions FUNDED → PENDING_RELEASE so both parties see the escrow is awaiting release.
   * Accepts optional fileId to link a specific proof document; falls back to most-recent file.
   * Triggers AI release check when releaseMode is 'ai' (non-blocking, result recorded in audit log).
   */
  async fulfillEscrow(
    clientId: string,
    idOrCode: string,
    opts?: { fileId?: string; notes?: string },
    actorEmail?: string
  ): Promise<Record<string, unknown>> {
    // Allow both escrow creator and recipient to fulfill (upload proof of delivery)
    const escrow = await this.getEscrowInternal(clientId, idOrCode, true);
    const { escrowId } = escrow;

    // Direct payments skip the deposit step, so they remain in CREATED status
    const allowedStatuses = (escrow as any).settlementMode === 'direct'
      ? ['CREATED', 'FUNDED']
      : ['FUNDED'];
    if (!allowedStatuses.includes(escrow.status)) {
      throw new Error(`Cannot fulfill: escrow status is ${escrow.status}, expected ${allowedStatuses.join(' or ')}`);
    }

    // Resolve proof document — accept files uploaded by the caller (creator or recipient)
    let proofDocument: {
      id: string;
      fileName: string;
      documentType: string;
      uploadedAt: Date;
    } | null = null;

    if (opts?.fileId) {
      // Explicit file — validate it exists and belongs to this escrow
      // Accept files uploaded by the caller OR attached to the escrow
      const file = await this.prisma.institutionFile.findFirst({
        where: { id: opts.fileId, escrowId, clientId },
        select: { id: true, fileName: true, documentType: true, uploadedAt: true },
      });
      if (!file) {
        throw new Error('File not found or does not belong to this escrow');
      }
      proofDocument = file;
    } else {
      // Fallback: most recent file attached to escrow by this caller
      const file = await this.prisma.institutionFile.findFirst({
        where: { escrowId, clientId },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true, fileName: true, documentType: true, uploadedAt: true },
      });
      if (!file) {
        throw new Error('No proof document attached to this escrow. Upload a file first.');
      }
      proofDocument = file;
    }

    // Transition to PENDING_RELEASE
    await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: { status: 'PENDING_RELEASE' },
    });

    const auditMessage = `Proof of delivery submitted — ${proofDocument.fileName}`;

    await this.createKytAuditLog(
      escrow,
      'PROOF_SUBMITTED',
      actorEmail || (await this.resolveActorName(clientId)),
      {
        previousStatus: escrow.status,
        newStatus: 'PENDING_RELEASE',
        message: auditMessage,
        fileId: proofDocument.id,
        fileName: proofDocument.fileName,
        documentType: proofDocument.documentType,
        ...(opts?.notes && { notes: opts.notes }),
      }
    );

    // Send notification to the caller (recipient who fulfilled)
    try {
      await getInstitutionNotificationService().notify({
        clientId,
        escrowId,
        type: 'ESCROW_FUNDED',
        title: 'Proof of Delivery Submitted',
        message: auditMessage,
        metadata: { escrowId, escrowCode: escrow.escrowCode, status: 'PENDING_RELEASE' },
      });
    } catch {
      /* non-critical */
    }

    // Also notify the escrow creator if the fulfiller is a counterparty
    if (escrow.clientId !== clientId) {
      try {
        await getInstitutionNotificationService().notify({
          clientId: escrow.clientId,
          escrowId,
          type: 'ESCROW_FUNDED',
          title: 'Recipient Submitted Proof of Delivery',
          message: auditMessage,
          metadata: { escrowId, escrowCode: escrow.escrowCode, status: 'PENDING_RELEASE' },
        });
      } catch {
        /* non-critical */
      }
    }

    // Trigger AI release check if releaseMode is 'ai'
    // If all conditions pass, auto-release the funds
    let aiReleaseChecks: Record<string, unknown> | null = null;

    if (escrow.releaseMode === 'ai') {
      try {
        const check = await this.performAiReleaseCheck(escrow, clientId);

        aiReleaseChecks = {
          passed: check.passed,
          recommendation: check.aiAnalysis.recommendation,
          riskScore: check.aiAnalysis.riskScore,
          summary: check.aiAnalysis.summary,
          conditions: check.conditions.map((c) => ({
            key: c.condition,
            label: c.label,
            passed: c.passed,
            detail: c.detail,
          })),
          checkedAt: new Date().toISOString(),
        };

        await this.createKytAuditLog(escrow, 'AI_RELEASE_CHECK', 'AI Orchestrator', {
          passed: check.passed,
          releaseMode: 'ai',
          triggeredBy: 'fulfill',
          conditions: check.conditions,
          riskScore: check.aiAnalysis.riskScore,
          recommendation: check.aiAnalysis.recommendation,
          summary: check.aiAnalysis.summary,
          message: check.passed
            ? `Risk score ${check.aiAnalysis.riskScore / 100} — recommended release`
            : `AI release blocked — ${check.conditions
                .filter((c) => !c.passed)
                .map((c) => c.label)
                .join(', ')}`,
        });

        // Auto-release if all AI conditions passed
        if (check.passed) {
          // Check timelock before auto-releasing — if locked, defer to manual release
          const freshEscrow = await this.getEscrowInternal(escrow.clientId, escrowId);
          if (freshEscrow.unlockAt && new Date() < new Date(freshEscrow.unlockAt)) {
            console.log(
              `[InstitutionEscrow] AI auto-release deferred for ${escrow.escrowCode || escrowId} — timelock active until ${new Date(freshEscrow.unlockAt).toISOString()}`
            );
            await this.createKytAuditLog(escrow, 'TIMELOCK_DEFERRED', 'AI Orchestrator', {
              unlockAt: new Date(freshEscrow.unlockAt).toISOString(),
              riskScore: check.aiAnalysis.riskScore,
              message: `AI approved but auto-release deferred — timelock active until ${new Date(freshEscrow.unlockAt).toISOString()}`,
            });
            aiReleaseChecks = {
              ...aiReleaseChecks,
              autoReleaseDeferred: true,
              unlockAt: new Date(freshEscrow.unlockAt).toISOString(),
            } as any;
          } else {
            try {
              console.log(
                `[InstitutionEscrow] AI auto-release triggered for ${escrow.escrowCode || escrowId}`
              );
              await this.createKytAuditLog(escrow, 'AI_APPROVED', 'AI Orchestrator', {
                releaseMode: 'ai',
                riskScore: check.aiAnalysis.riskScore,
                recommendation: check.aiAnalysis.recommendation,
                message: `AI approved release — risk score ${check.aiAnalysis.riskScore / 100}`,
              });
              await this.createKytAuditLog(escrow, 'AI_AUTO_RELEASE', 'AI Orchestrator', {
                releaseMode: 'ai',
                conditionsPassed: check.conditions.length,
                conditions: check.conditions.map((c) => ({
                  condition: c.condition,
                  label: c.label,
                  passed: c.passed,
                })),
                riskScore: check.aiAnalysis.riskScore,
                message: `AI auto-release initiated — ${check.conditions.length} conditions passed`,
              });
              const releaseResult = await this.releaseFunds(
                escrow.clientId,
                escrowId,
                'AI auto-release — all conditions passed',
                'AI Orchestrator',
                undefined,
                {
                  skipAiCheck: true,
                  aiMemoData: {
                    recommendation: check.aiAnalysis.recommendation,
                    riskScore: check.aiAnalysis.riskScore,
                    factors: check.aiAnalysis.factors,
                  },
                }
              );
              // Attach AI check results to the release response
              return { ...(releaseResult as Record<string, unknown>), aiReleaseChecks };
            } catch (releaseErr) {
              console.error('[InstitutionEscrow] AI auto-release failed (non-critical):', releaseErr);
              // Fall through — escrow stays in PENDING_RELEASE for manual release
            }
          }
        }
      } catch (aiErr) {
        console.error(
          `[InstitutionEscrow] AI release check failed for ${escrow.escrowCode || escrowId}:`,
          aiErr instanceof Error ? aiErr.message : aiErr
        );
        aiReleaseChecks = {
          passed: false,
          error: aiErr instanceof Error ? aiErr.message : 'AI check failed',
          checkedAt: new Date().toISOString(),
        };
      }
    }

    const updated = await this.getEscrowInternal(clientId, idOrCode, true);
    const partyNames = await this.resolvePartyNames([updated as any], clientId);
    const result = this.formatEscrow(updated, partyNames[0]);
    // Attach AI release check results so the frontend knows why auto-release did/didn't happen
    if (aiReleaseChecks) {
      (result as any).aiReleaseChecks = aiReleaseChecks;
    }
    return result;
  }

  /**
   * Notify the counterparty (recipient) to upload proof of delivery.
   */
  async notifyRecipient(
    clientId: string,
    idOrCode: string,
    message?: string,
    actorEmail?: string
  ): Promise<{ sent: boolean }> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    // Direct payments can notify from CREATED (no deposit step)
    const isDirectPayment = (escrow as any).settlementMode === 'direct';
    const validStatuses: InstitutionEscrowStatus[] = isDirectPayment
      ? ['CREATED', 'FUNDED', 'PENDING_RELEASE']
      : ['FUNDED'];
    if (!validStatuses.includes(escrow.status)) {
      throw new Error(
        `Cannot notify recipient: escrow status is ${escrow.status}, expected ${validStatuses.join(', ')}`
      );
    }

    if (!escrow.recipientWallet) {
      throw new Error('Escrow has no recipient wallet assigned');
    }

    // Resolve recipient to a registered institution client
    const [recipientAccounts, recipientClients] = await Promise.all([
      this.prisma.institutionAccount.findMany({
        where: { walletAddress: escrow.recipientWallet, isActive: true },
        select: { clientId: true, client: { select: { companyName: true } } },
      }),
      this.prisma.institutionClient.findMany({
        where: {
          OR: [
            { primaryWallet: escrow.recipientWallet },
            { settledWallets: { hasSome: [escrow.recipientWallet] } },
          ],
        },
        select: { id: true, companyName: true },
      }),
    ]);

    let recipientClientId: string | null = null;
    if (recipientAccounts.length > 0) {
      recipientClientId = (recipientAccounts[0] as any).clientId;
    } else if (recipientClients.length > 0) {
      recipientClientId = recipientClients[0].id;
    }

    if (!recipientClientId) {
      throw new Error('Recipient has no registered institution account');
    }

    // Get payer company name for notification
    const payerClient = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
      select: { companyName: true },
    });
    const payerCompanyName = payerClient?.companyName || 'The payer';
    const amount = Number(escrow.amount);

    await getInstitutionNotificationService().notify({
      clientId: recipientClientId,
      escrowId,
      type: 'ESCROW_FUNDED',
      title: `Proof of Delivery Requested — ${escrow.escrowCode}`,
      message: `${payerCompanyName} has requested you upload proof of delivery for escrow ${
        escrow.escrowCode
      } ($${amount} USDC).${message ? `\n\nMessage: ${message}` : ''}`,
      metadata: {
        escrowId,
        escrowCode: escrow.escrowCode,
        requestedBy: payerCompanyName,
        action: 'proof_requested',
      },
    });

    await this.createKytAuditLog(
      escrow,
      'RECIPIENT_NOTIFIED',
      actorEmail || (await this.resolveActorName(clientId)),
      {
        escrowCode: escrow.escrowCode,
        recipientClientId,
        ...(message && { message }),
        message: `Recipient notified — proof of delivery requested`,
      }
    );

    return { sent: true };
  }

  /**
   * Release funds from escrow to recipient
   */
  async releaseFunds(
    clientId: string,
    idOrCode: string,
    notes?: string,
    actorEmail?: string,
    privacyPreferences?: PrivacyPreferences,
    options?: { skipAiCheck?: boolean; aiMemoData?: AiMemoData; forceRelease?: boolean }
  ): Promise<Record<string, unknown>> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    // Allow release from FUNDED, PENDING_RELEASE, or INSUFFICIENT_FUNDS (retry after funding)
    // Direct payments also allow release from CREATED (no deposit step)
    const isDirectPayment = (escrow as any).settlementMode === 'direct';
    const releasableStatuses: InstitutionEscrowStatus[] = isDirectPayment
      ? ['CREATED', 'FUNDED', 'PENDING_RELEASE', 'INSUFFICIENT_FUNDS']
      : ['FUNDED', 'PENDING_RELEASE', 'INSUFFICIENT_FUNDS'];
    if (!releasableStatuses.includes(escrow.status)) {
      const expected = releasableStatuses.join(', ');
      throw new Error(
        `Cannot release: escrow status is ${escrow.status}, expected ${expected}`
      );
    }

    // Timelock gate: prevent release before cooling-off period expires
    if (escrow.unlockAt && new Date() < new Date(escrow.unlockAt)) {
      if (options?.forceRelease) {
        await this.createKytAuditLog(
          escrow,
          'TIMELOCK_OVERRIDE',
          actorEmail || (await this.resolveActorName(clientId)),
          {
            unlockAt: new Date(escrow.unlockAt).toISOString(),
            overriddenAt: new Date().toISOString(),
            message: `Timelock override — funds were locked until ${new Date(escrow.unlockAt).toISOString()}`,
          }
        );
      } else {
        const unlockDate = new Date(escrow.unlockAt);
        const hoursRemaining = Math.ceil((unlockDate.getTime() - Date.now()) / (60 * 60 * 1000));
        throw new Error(
          `Cannot release: payment timelock active. Funds unlock at ${unlockDate.toISOString()} (${hoursRemaining}h remaining). Use forceRelease to override.`
        );
      }
    }

    // Track AI analysis for chain-of-custody memo digest
    let aiAnalysisForMemo: AiMemoData | null = options?.aiMemoData || null;

    // Gate by releaseMode: if AI, run AI compliance checks before proceeding
    // Skip if caller already performed the check (e.g. fulfillEscrow auto-release)
    if (escrow.releaseMode === 'ai' && !options?.skipAiCheck) {
      const aiResult = await this.performAiReleaseCheck(escrow, clientId);
      aiAnalysisForMemo = {
        recommendation: aiResult.aiAnalysis.recommendation,
        riskScore: aiResult.aiAnalysis.riskScore,
        factors: aiResult.aiAnalysis.factors,
      };

      await this.createKytAuditLog(escrow, 'AI_RELEASE_CHECK', 'AI Orchestrator', {
        passed: aiResult.passed,
        releaseMode: 'ai',
        conditions: aiResult.conditions,
        riskScore: aiResult.aiAnalysis.riskScore,
        recommendation: aiResult.aiAnalysis.recommendation,
        summary: aiResult.aiAnalysis.summary,
        message: aiResult.passed
          ? `Risk score ${aiResult.aiAnalysis.riskScore / 100} — recommended release`
          : `AI release blocked — ${aiResult.conditions
              .filter((c) => !c.passed)
              .map((c) => c.label)
              .join(', ')}`,
      });

      if (!aiResult.passed) {
        const failedConditions = aiResult.conditions.filter((c) => !c.passed);
        await getInstitutionNotificationService().notify({
          clientId,
          escrowId,
          type: 'ESCROW_COMPLIANCE_HOLD',
          priority: 'HIGH',
          title: 'AI Release Check Failed',
          message: `Escrow ${
            escrow.escrowCode || escrowId
          } failed AI release conditions: ${failedConditions.map((c) => c.label).join(', ')}`,
          metadata: {
            failedConditions: failedConditions.map((c) => ({
              condition: c.condition,
              detail: c.detail,
            })),
            riskScore: aiResult.aiAnalysis.riskScore,
          },
        });

        throw new Error(
          `AI release check failed: ${failedConditions.map((c) => c.label).join('; ')}`
        );
      }

      // Log explicit AI approval for audit trail visibility
      await this.createKytAuditLog(escrow, 'AI_APPROVED', 'AI Orchestrator', {
        releaseMode: 'ai',
        riskScore: aiResult.aiAnalysis.riskScore,
        recommendation: aiResult.aiAnalysis.recommendation,
        message: `AI approved release — risk score ${aiResult.aiAnalysis.riskScore / 100}`,
      });
    }

    // Update status to RELEASING
    const originalStatus = escrow.status;
    await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: { status: 'RELEASING' },
    });

    // Check payer's token balance before settlement (skip for direct payments — no vault)
    if (!isDirectPayment) {
      await this.checkPayerBalance(escrow, clientId);
    }

    // Resolve release destination (standard or stealth address)
    const effectivePrivacy = privacyPreferences || {
      level: (escrow.privacyLevel as PrivacyLevel) || PrivacyLevel.STEALTH,
    };

    let releaseRecipient = escrow.recipientWallet!;
    let stealthPaymentId: string | undefined;

    let actualPrivacyLevel = PrivacyLevel.NONE;

    if (isPrivacyEnabled() && effectivePrivacy.level === PrivacyLevel.STEALTH) {
      try {
        const privacyResult = await resolveReleaseDestination(
          escrow.recipientWallet!,
          clientId,
          escrowId,
          escrow.usdcMint,
          BigInt(Math.round(Number(escrow.amount) * 1_000_000)), // Convert USDC to raw
          effectivePrivacy
        );
        releaseRecipient = privacyResult.recipientAddress;
        stealthPaymentId = privacyResult.stealthPaymentId;
        actualPrivacyLevel = privacyResult.privacyLevel;
        console.log(
          `[InstitutionEscrow] Release for ${escrowId} with privacy=${actualPrivacyLevel}, addr: ${releaseRecipient}`
        );
      } catch (privacyError) {
        console.error('[InstitutionEscrow] Stealth address derivation failed:', privacyError);
        await this.prisma.institutionEscrow.update({
          where: { escrowId },
          data: { status: originalStatus },
        });
        throw new Error(`Stealth address derivation failed: ${(privacyError as Error).message}`);
      }
    }

    // Fetch latest AI analysis from DB for chain-of-custody memo (manual releases)
    if (!aiAnalysisForMemo) {
      try {
        const latestAnalysis = await this.prisma.institutionAiAnalysis.findFirst({
          where: { escrowId, analysisType: 'ESCROW' },
          orderBy: { createdAt: 'desc' },
          select: { recommendation: true, riskScore: true, factors: true },
        });
        if (latestAnalysis) {
          aiAnalysisForMemo = {
            recommendation: latestAnalysis.recommendation as string,
            riskScore: latestAnalysis.riskScore,
            factors: latestAnalysis.factors,
          };
        }
      } catch (err) {
        console.error('[InstitutionEscrow] Failed to fetch AI analysis for memo:', err);
        throw new Error('AI analysis lookup failed — cannot build chain-of-custody memo');
      }
    }

    // Execute on-chain settlement
    // Escrow mode: release USDC from vault PDA to recipient
    // Direct mode: transfer USDC from admin/CDP wallet to recipient (no vault)
    let releaseTxSig: string | null = null;
    const releaseProgramService = this.getProgramService();
    const useCdpRelease = ((escrow.releaseConditions as string[]) || []).includes('cdp_policy_approval');

    if (isDirectPayment && releaseProgramService) {
      // Direct payment: plain SPL transfer from admin/CDP wallet to recipient
      try {
        const usdcMint = releaseProgramService.getUsdcMintAddress();
        const aiDigest = buildAiDigest(aiAnalysisForMemo);

        if (useCdpRelease) {
          const cdpPubkey = await getCdpSettlementService().getPublicKey();
          releaseTxSig = await releaseProgramService.transferUsdcDirectWithCdp({
            cdpAuthorityPubkey: cdpPubkey,
            recipientWallet: toPublicKey(releaseRecipient, 'recipientWallet'),
            usdcMint,
            amount: Number(escrow.amount),
            platformFee: Number(escrow.platformFee),
            feeCollector: toPublicKey(config.platform.feeCollectorAddress!, 'feeCollectorAddress'),
            escrowCode: escrow.escrowCode,
            aiDigest,
          });
          await this.createKytAuditLog(escrow, 'CDP_POLICY_CHECK', 'CDP Settlement Authority', {
            passed: true,
            message: 'CDP policy engine approved direct transfer',
            cdpWallet: cdpPubkey.toBase58(),
          });
        } else {
          releaseTxSig = await releaseProgramService.transferUsdcDirect({
            recipientWallet: toPublicKey(releaseRecipient, 'recipientWallet'),
            usdcMint,
            amount: Number(escrow.amount),
            platformFee: Number(escrow.platformFee),
            feeCollector: toPublicKey(config.platform.feeCollectorAddress!, 'feeCollectorAddress'),
            escrowCode: escrow.escrowCode,
            aiDigest,
          });
        }
        console.log(
          `[InstitutionEscrow] Direct transfer success for ${escrowId}, tx: ${releaseTxSig}`
        );
      } catch (error) {
        console.error('[InstitutionEscrow] Direct transfer failed:', error);
        await this.prisma.institutionEscrow.update({
          where: { escrowId },
          data: { status: originalStatus },
        });
        await this.createAuditLog(
          escrowId,
          clientId,
          'ON_CHAIN_RELEASE_FAILED',
          escrow.settlementAuthority,
          { error: (error as Error).message, mode: 'direct' }
        );
        throw new Error(`Direct transfer failed: ${(error as Error).message}`);
      }
    } else if (releaseProgramService && escrow.escrowPda && !isDirectPayment) {
      try {
        const usdcMint = releaseProgramService.getUsdcMintAddress();
        const aiDigest = buildAiDigest(aiAnalysisForMemo);

        if (useCdpRelease) {
          // CDP multi-sign path: admin as fee payer, CDP as settlement authority
          const cdpPubkey = await getCdpSettlementService().getPublicKey();
          releaseTxSig = await releaseProgramService.releaseEscrowWithCdp({
            escrowId,
            cdpAuthorityPubkey: cdpPubkey,
            recipientWallet: toPublicKey(releaseRecipient, 'recipientWallet'),
            feeCollector: toPublicKey(config.platform.feeCollectorAddress!, 'feeCollectorAddress'),
            usdcMint,
            escrowCode: escrow.escrowCode,
            aiDigest,
          });
          await this.createKytAuditLog(escrow, 'CDP_POLICY_CHECK', 'CDP Settlement Authority', {
            passed: true,
            message: 'CDP policy engine approved release transaction',
            cdpWallet: cdpPubkey.toBase58(),
          });
        } else {
          // Standard release: admin signs as both fee payer and authority
          releaseTxSig = await releaseProgramService.releaseEscrowOnChain({
            escrowId,
            recipientWallet: toPublicKey(releaseRecipient, 'recipientWallet'),
            feeCollector: toPublicKey(config.platform.feeCollectorAddress!, 'feeCollectorAddress'),
            usdcMint,
            escrowCode: escrow.escrowCode,
            aiDigest,
          });
        }
        console.log(
          `[InstitutionEscrow] On-chain release success for ${escrowId}, tx: ${releaseTxSig}`
        );

        // Confirm stealth payment if applicable
        if (stealthPaymentId && releaseTxSig) {
          try {
            const stealthService = getStealthAddressService();
            await stealthService.confirmStealthPayment(stealthPaymentId, releaseTxSig);
          } catch (err) {
            console.warn(
              '[InstitutionEscrow] Stealth payment confirmation failed (non-critical):',
              err
            );
          }
        }
      } catch (error) {
        console.error('[InstitutionEscrow] On-chain release failed:', error);
        // Mark stealth payment as failed if applicable
        if (stealthPaymentId) {
          try {
            const stealthService = getStealthAddressService();
            await stealthService.failStealthPayment(stealthPaymentId);
          } catch (err) {
            console.warn('[InstitutionEscrow] Stealth payment failure update failed:', err);
          }
        }
        await this.prisma.institutionEscrow.update({
          where: { escrowId },
          data: { status: originalStatus },
        });
        await this.createAuditLog(
          escrowId,
          clientId,
          'ON_CHAIN_RELEASE_FAILED',
          escrow.settlementAuthority,
          {
            error: (error as Error).message,
          }
        );
        throw new Error(`On-chain release failed: ${(error as Error).message}`);
      }
    } else if (escrow.nonceAccount && !isDirectPayment) {
      // Fallback: advance nonce if no PDA (legacy escrows created before on-chain wiring)
      try {
        const npm = this.getNoncePoolManager();
        if (npm) {
          releaseTxSig = await npm.advanceNonceWithSignature(escrow.nonceAccount);
          console.log(`[InstitutionEscrow] Nonce advanced for ${escrowId}, tx: ${releaseTxSig}`);
        }
      } catch (error) {
        console.error('[InstitutionEscrow] Nonce advance failed during release:', error);
        await this.prisma.institutionEscrow.update({
          where: { escrowId },
          data: { status: originalStatus },
        });
        throw new Error('On-chain settlement failed: nonce advance error');
      }
    }

    const updated = await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: {
        status: 'RELEASED',
        releaseTxSignature: releaseTxSig,
        resolvedAt: new Date(),
        ...(stealthPaymentId ? { stealthPaymentId } : {}),
        privacyLevel: actualPrivacyLevel as unknown as PrismaPrivacyLevel,
      },
    });

    // Bust balance caches so wallets show updated balances immediately
    try {
      const { getInstitutionAccountService } = await import('./institution-account.service');
      const accountService = getInstitutionAccountService();
      await Promise.all([
        accountService.invalidateBalanceCache(escrow.payerWallet),
        escrow.recipientWallet
          ? accountService.invalidateBalanceCache(escrow.recipientWallet)
          : Promise.resolve(),
      ]);
    } catch {
      /* non-critical */
    }

    // Return nonce to pool without re-advancing (already advanced above)
    if (escrow.nonceAccount) {
      try {
        const npm = this.getNoncePoolManager();
        if (npm) {
          await npm.returnNonceToPool(escrow.nonceAccount);
        }
      } catch (error) {
        console.warn('[InstitutionEscrow] Nonce pool return failed (non-critical):', error);
      }
    }

    const releaseActor =
      escrow.releaseMode === 'ai' ? 'AI Orchestrator' : actorEmail || escrow.settlementAuthority;
    await this.createKytAuditLog(escrow, 'FUNDS_RELEASED', releaseActor, {
      releaseTxSignature: releaseTxSig,
      releaseMode: escrow.releaseMode || 'manual',
      releaseConditions: escrow.releaseConditions || [],
      notes,
      message:
        escrow.releaseMode === 'ai'
          ? 'AI auto-released — conditions met'
          : `${Number(escrow.amount)} USDC released to recipient`,
      privacyLevel: effectivePrivacy.level,
      ...(stealthPaymentId ? { stealthPaymentId, stealthAddress: releaseRecipient } : {}),
    });

    // Transition to COMPLETE: send notification and finalize
    try {
      await getInstitutionNotificationService().notify({
        clientId,
        escrowId,
        type: 'SETTLEMENT_COMPLETE',
        priority: 'HIGH',
        title: 'Settlement Complete',
        message: `Escrow ${escrow.escrowCode || escrowId} has been settled. ${Number(
          escrow.amount
        )} USDC released to recipient.`,
        metadata: {
          amount: Number(escrow.amount),
          recipient: escrow.recipientWallet,
          releaseTxSignature: releaseTxSig,
        },
      });

      // Notify the recipient that funds have been released to them
      if (escrow.recipientWallet) {
        try {
          const recipientClientId = await this.resolveClientIdByWallet(escrow.recipientWallet);
          if (recipientClientId && recipientClientId !== clientId) {
            const senderName = await this.resolveActorName(escrow.clientId);
            await getInstitutionNotificationService().notify({
              clientId: recipientClientId,
              escrowId,
              type: 'SETTLEMENT_COMPLETE',
              priority: 'HIGH',
              title: `Funds Released — ${escrow.escrowCode || escrowId}`,
              message: `${Number(
                escrow.amount
              )} USDC from ${senderName} has been released to your wallet (${
                escrow.escrowCode || escrowId
              }).`,
              metadata: {
                amount: Number(escrow.amount),
                escrowCode: escrow.escrowCode,
                sender: senderName,
                releaseTxSignature: releaseTxSig,
              },
            });
          }
        } catch {
          /* non-critical */
        }
      }

      const completed = await this.prisma.institutionEscrow.update({
        where: { escrowId },
        data: { status: 'COMPLETE' },
      });

      await this.createKytAuditLog(escrow, 'ESCROW_COMPLETED', escrow.settlementAuthority, {
        previousStatus: 'RELEASED',
        message: `Settlement complete — ${Number(escrow.amount)} USDC delivered`,
      });

      await this.cacheEscrow(completed);
      const releasePartyNames = await this.resolvePartyNames([completed as any], clientId);
      return this.formatEscrow(completed, releasePartyNames[0]);
    } catch (error) {
      // If notification/completion fails, escrow stays RELEASED (still valid terminal state)
      console.warn('[InstitutionEscrow] COMPLETE transition failed (non-critical):', error);
      await this.cacheEscrow(updated);
      const releasePartyNames = await this.resolvePartyNames([updated as any], clientId);
      return this.formatEscrow(updated, releasePartyNames[0]);
    }
  }

  /**
   * Cancel escrow and initiate refund
   */
  async cancelEscrow(
    clientId: string,
    idOrCode: string,
    reason?: string,
    actorEmail?: string
  ): Promise<Record<string, unknown>> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    const cancellableStatuses: InstitutionEscrowStatus[] = [
      'DRAFT',
      'CREATED',
      'FUNDED',
      'PENDING_RELEASE',
      'COMPLIANCE_HOLD',
      'INSUFFICIENT_FUNDS',
    ];
    if (!cancellableStatuses.includes(escrow.status)) {
      throw new Error(`Cannot cancel: escrow status is ${escrow.status}`);
    }

    // Update status to CANCELLING
    await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: { status: 'CANCELLING' },
    });

    // For funded escrows with on-chain PDA, execute on-chain cancel (refund USDC to payer)
    let cancelTxSignature: string | null = null;
    const useCdpCancel = ((escrow.releaseConditions as string[]) || []).includes('cdp_policy_approval');
    if ((escrow.status === 'FUNDED' || escrow.status === 'PENDING_RELEASE') && escrow.escrowPda) {
      const cancelProgramService = this.getProgramService();
      if (cancelProgramService) {
        try {
          const usdcMint = cancelProgramService.getUsdcMintAddress();

          if (useCdpCancel) {
            // CDP multi-sign cancel: admin pays fees, CDP signs as caller (settlement authority)
            const cdpPubkey = await getCdpSettlementService().getPublicKey();
            cancelTxSignature = await cancelProgramService.cancelEscrowWithCdp({
              escrowId,
              cdpCallerPubkey: cdpPubkey,
              payerWallet: toPublicKey(escrow.payerWallet, 'payerWallet'),
              usdcMint,
              escrowCode: escrow.escrowCode,
              cancelReason: reason,
            });
          } else {
            cancelTxSignature = await cancelProgramService.cancelEscrowOnChain({
              escrowId,
              payerWallet: toPublicKey(escrow.payerWallet, 'payerWallet'),
              usdcMint,
              escrowCode: escrow.escrowCode,
              cancelReason: reason,
            });
          }
          console.log(
            `[InstitutionEscrow] On-chain cancel success for ${escrowId}, tx: ${cancelTxSignature}`
          );
        } catch (error) {
          console.error('[InstitutionEscrow] On-chain cancel failed:', error);
          await this.prisma.institutionEscrow.update({
            where: { escrowId },
            data: { status: escrow.status },
          });
          await this.createAuditLog(
            escrowId,
            clientId,
            'ON_CHAIN_CANCEL_FAILED',
            escrow.payerWallet,
            {
              error: (error as Error).message,
            }
          );
          throw new Error(`On-chain cancel failed: ${(error as Error).message}`);
        }
      }
    }

    const updated = await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: {
        status: 'CANCELLED',
        cancelTxSignature,
        resolvedAt: new Date(),
      },
    });

    // Release nonce back to pool if assigned
    if (escrow.nonceAccount) {
      try {
        const npm = this.getNoncePoolManager();
        if (npm) {
          await npm.releaseNonce(escrow.nonceAccount);
        }
      } catch (error) {
        console.warn('[InstitutionEscrow] Nonce release on cancel failed (non-critical):', error);
      }
    }

    await this.createKytAuditLog(
      escrow,
      'ESCROW_CANCELLED',
      actorEmail || (await this.resolveActorName(escrow.clientId)),
      {
        reason,
        previousStatus: escrow.status,
        cancelTxSignature,
        wasFunded: escrow.status === 'FUNDED',
        message: reason ? `Cancelled — ${reason}` : 'Cancelled by client',
      }
    );

    try {
      await getInstitutionNotificationService().notify({
        clientId,
        escrowId,
        type: 'ESCROW_CANCELLED',
        title: 'Escrow Cancelled',
        message: `Escrow ${escrow.escrowCode || escrowId} has been cancelled.${
          reason ? ` Reason: ${reason}` : ''
        }`,
        metadata: { reason, previousStatus: escrow.status },
      });
    } catch (error) {
      console.warn(
        '[InstitutionEscrow] ESCROW_CANCELLED notification failed (non-critical):',
        error
      );
    }

    await this.cacheEscrow(updated);

    const cancelPartyNames = await this.resolvePartyNames([updated as any], clientId);
    return this.formatEscrow(updated, cancelPartyNames[0]);
  }

  /**
   * Check payer's USDC balance before settlement.
   * Sets INSUFFICIENT_FUNDS if balance is too low or token account doesn't exist.
   */
  private async checkPayerBalance(escrow: any, clientId: string): Promise<void> {
    const { escrowId } = escrow;
    try {
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      const programService = this.getProgramService();
      const usdcMint = programService
        ? programService.getUsdcMintAddress()
        : toPublicKey(escrow.usdcMint, 'usdcMint');
      const payerWallet = toPublicKey(escrow.payerWallet, 'payerWallet');
      const payerAta = await getAssociatedTokenAddress(usdcMint, payerWallet);

      try {
        const tokenAccount = await getAccount(connection, payerAta);
        const requiredMicroUsdc = BigInt(Math.round(Number(escrow.amount) * 1_000_000));
        if (tokenAccount.amount < requiredMicroUsdc) {
          console.warn(
            `[InstitutionEscrow] Insufficient balance for ${escrowId}: has ${tokenAccount.amount}, needs ${requiredMicroUsdc}`
          );
          await this.prisma.institutionEscrow.update({
            where: { escrowId },
            data: { status: 'INSUFFICIENT_FUNDS' },
          });
          await this.createKytAuditLog(
            escrow,
            'INSUFFICIENT_FUNDS',
            await this.resolveActorName(escrow.clientId),
            {
              available: tokenAccount.amount.toString(),
              required: requiredMicroUsdc.toString(),
              message: `Insufficient balance: has ${tokenAccount.amount}, needs ${requiredMicroUsdc} micro-USDC`,
            }
          );
          try {
            await getInstitutionNotificationService().notify({
              clientId,
              escrowId,
              type: 'ESCROW_FUNDED',
              priority: 'HIGH',
              title: 'Insufficient Funds',
              message: `Escrow ${escrow.escrowCode || escrowId} release blocked: payer has ${
                Number(tokenAccount.amount) / 1_000_000
              } USDC, needs ${Number(escrow.amount)} USDC. Please fund the wallet and retry.`,
              metadata: {
                available: Number(tokenAccount.amount) / 1_000_000,
                required: Number(escrow.amount),
              },
            });
          } catch (notifErr) {
            console.warn('[InstitutionEscrow] INSUFFICIENT_FUNDS notification failed:', notifErr);
          }
          throw new Error(
            `Insufficient USDC balance: has ${
              Number(tokenAccount.amount) / 1_000_000
            }, needs ${Number(escrow.amount)}`
          );
        }
      } catch (err: any) {
        if (err.message?.startsWith('Insufficient USDC balance')) throw err;
        if (!(err instanceof TokenAccountNotFoundError)) throw err;
        // Token account doesn't exist
        console.warn(`[InstitutionEscrow] Payer token account not found for ${escrowId}`);
        await this.prisma.institutionEscrow.update({
          where: { escrowId },
          data: { status: 'INSUFFICIENT_FUNDS' },
        });
        await this.createKytAuditLog(
          escrow,
          'INSUFFICIENT_FUNDS',
          await this.resolveActorName(escrow.clientId),
          {
            reason: 'Token account does not exist',
            message: 'Payer token account does not exist',
          }
        );
        try {
          await getInstitutionNotificationService().notify({
            clientId,
            escrowId,
            type: 'ESCROW_FUNDED',
            priority: 'HIGH',
            title: 'Insufficient Funds',
            message: `Escrow ${
              escrow.escrowCode || escrowId
            } release blocked: payer token account does not exist. Please create a USDC token account and fund it.`,
            metadata: { reason: 'Token account does not exist' },
          });
        } catch (notifErr) {
          console.warn('[InstitutionEscrow] INSUFFICIENT_FUNDS notification failed:', notifErr);
        }
        throw new Error('Insufficient USDC balance: payer token account does not exist');
      }
    } catch (err: any) {
      if (
        err.message?.includes('Insufficient USDC balance') ||
        err.message?.includes('payer token account')
      ) {
        throw err;
      }
      // For RPC/network errors, revert to previous status so release can be retried
      console.error('[InstitutionEscrow] Balance check failed due to RPC error:', err);
      const revertStatus = escrow.status as InstitutionEscrowStatus;
      await this.prisma.institutionEscrow.update({
        where: { escrowId },
        data: { status: revertStatus },
      });
      throw new Error(`Balance check failed: ${err.message}`);
    }
  }

  /**
   * Get a single escrow by code or ID (scoped to client)
   */
  async getEscrow(clientId: string, idOrCode: string): Promise<Record<string, unknown>> {
    // Skip cache for detail view — we need enriched data from DB
    const escrow = await this.getEscrowInternal(clientId, idOrCode, true);
    // Counterparty requests get the base format (no AI analyses, audit logs)
    const isOwner = escrow.clientId === clientId;
    if (isOwner) {
      return this.formatEscrowEnriched(escrow, clientId);
    }
    const partyNames = await this.resolvePartyNames([escrow as any], escrow.clientId);
    return this.formatEscrow(escrow, partyNames[0], clientId);
  }

  /**
   * List escrows for a client with filters
   */
  async listEscrows(params: ListEscrowsParams): Promise<{
    escrows: Record<string, unknown>[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const { clientId, status, corridor, limit = 20, offset = 0, role = 'all' } = params;

    // Admin (null clientId): no ownership filter — return all escrows
    // Regular client: filter by ownership role
    let ownershipFilter: Record<string, unknown>;
    if (!clientId) {
      ownershipFilter = {};
    } else if (role === 'payer') {
      ownershipFilter = { clientId };
    } else if (role === 'recipient') {
      const recipientWallets = await this.getClientWallets(clientId);
      ownershipFilter = { recipientWallet: { in: recipientWallets } };
    } else {
      // role === 'all': return escrows where institution is payer OR recipient
      const recipientWallets = await this.getClientWallets(clientId);
      ownershipFilter = {
        OR: [{ clientId }, { recipientWallet: { in: recipientWallets } }],
      };
    }

    const where: Record<string, unknown> = { ...ownershipFilter };
    if (status) where.status = status;
    if (corridor) where.corridor = corridor;

    const [escrows, total] = await Promise.all([
      this.prisma.institutionEscrow.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.institutionEscrow.count({ where: where as any }),
    ]);

    // For admin (null clientId), resolve names using each escrow's own clientId
    const resolveClientId = clientId || (escrows.length > 0 ? (escrows[0] as any).clientId : '');
    const partyNamesArr = await this.resolvePartyNames(escrows as any[], resolveClientId);

    return {
      escrows: escrows.map((e, i) => this.formatEscrow(e, partyNamesArr[i], clientId ?? undefined)),
      total,
      limit,
      offset,
    };
  }

  /** Collect all wallet addresses belonging to a client (primary + settled + accounts) */
  private async getClientWallets(clientId: string): Promise<string[]> {
    const [client, accounts] = await Promise.all([
      this.prisma.institutionClient.findUnique({
        where: { id: clientId },
        select: { primaryWallet: true, settledWallets: true },
      }),
      this.prisma.institutionAccount.findMany({
        where: { clientId, isActive: true },
        select: { walletAddress: true },
      }),
    ]);
    return [
      client?.primaryWallet,
      ...(client?.settledWallets || []),
      ...accounts.map((a: { walletAddress: string }) => a.walletAddress),
    ].filter(Boolean) as string[];
  }

  /**
   * Internal: Get escrow with client ownership check.
   * Accepts either escrowCode (EE-XXX-XXX) or escrowId (UUID).
   * @param allowCounterpartyRead - When true, counterparties can view but not mutate.
   *   Mutation callers (recordDeposit, releaseFunds, cancelEscrow) pass false.
   */
  private async getEscrowInternal(
    clientId: string,
    idOrCode: string,
    allowCounterpartyRead = false
  ) {
    const isCode = idOrCode.startsWith('EE-');
    const escrow = await this.prisma.institutionEscrow.findUnique({
      where: isCode ? { escrowCode: idOrCode } : { escrowId: idOrCode },
    });

    if (!escrow) {
      throw new Error(`Escrow not found: ${idOrCode}`);
    }

    if (escrow.clientId !== clientId) {
      if (!allowCounterpartyRead) {
        throw new Error('Access denied: escrow belongs to another client');
      }

      // Check if caller is a counterparty (payer or recipient via wallet match)
      const client = await this.prisma.institutionClient.findUnique({
        where: { id: clientId },
        select: { primaryWallet: true, settledWallets: true },
      });
      const accounts = await this.prisma.institutionAccount.findMany({
        where: { clientId, isActive: true },
        select: { walletAddress: true },
      });
      const callerWallets = [
        client?.primaryWallet,
        ...(client?.settledWallets || []),
        ...accounts.map((a: { walletAddress: string }) => a.walletAddress),
      ].filter(Boolean);

      const isCounterparty = callerWallets.some(
        (w) => w === escrow.recipientWallet || w === escrow.payerWallet
      );
      if (!isCounterparty) {
        throw new Error('Access denied: escrow belongs to another client');
      }
    }

    return escrow;
  }

  /**
   * Create an audit log entry
   */
  /**
   * Build KYT (Know Your Transaction) context for audit log enrichment.
   * Resolves originator/beneficiary names from client records so each
   * audit entry is self-contained for compliance / Travel Rule purposes.
   */
  private async buildKytContext(escrow: any): Promise<Record<string, unknown>> {
    const isStealth = escrow.privacyLevel === 'STEALTH';

    const [originatorClient, beneficiaryClient] = await Promise.all([
      this.prisma.institutionClient.findUnique({
        where: { id: escrow.clientId },
        select: {
          companyName: true,
          legalName: true,
          country: true,
          registrationCountry: true,
          lei: true,
        },
      }),
      escrow.recipientWallet && !isStealth
        ? this.prisma.institutionClient.findFirst({
            where: {
              OR: [
                { primaryWallet: escrow.recipientWallet },
                { settledWallets: { has: escrow.recipientWallet } },
              ],
            },
            select: {
              companyName: true,
              legalName: true,
              country: true,
              registrationCountry: true,
              lei: true,
            },
          })
        : Promise.resolve(null),
    ]);

    return {
      kyt: {
        escrowCode: escrow.escrowCode,
        escrowId: escrow.escrowId,
        amount: Number(escrow.amount),
        currency: 'USDC',
        cryptoChain: 'solana',
        corridor: escrow.corridor,
        escrowPda: escrow.escrowPda || null,
        privacyLevel: escrow.privacyLevel || 'NONE',
        originator: {
          name: originatorClient?.companyName || null,
          legalName: originatorClient?.legalName || null,
          wallet: escrow.payerWallet,
          country: originatorClient?.country || null,
          registrationCountry: originatorClient?.registrationCountry || null,
          lei: originatorClient?.lei || null,
        },
        beneficiary: isStealth
          ? { name: 'Stealth Recipient', wallet: null, country: null }
          : {
              name: beneficiaryClient?.companyName || null,
              legalName: beneficiaryClient?.legalName || null,
              wallet: escrow.recipientWallet || null,
              country: beneficiaryClient?.country || null,
              registrationCountry: beneficiaryClient?.registrationCountry || null,
              lei: beneficiaryClient?.lei || null,
            },
      },
    };
  }

  private async createAuditLog(
    escrowId: string,
    clientId: string,
    action: string,
    actor: string,
    details: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    try {
      await this.prisma.institutionAuditLog.create({
        data: {
          escrowId,
          clientId,
          action,
          actor,
          details: details as any,
          ipAddress,
        },
      });
    } catch (error) {
      // Log with enough context to diagnose which audit entry failed
      console.error(
        `[InstitutionEscrowService] Failed to create audit log: action=${action} escrowId=${escrowId} actor=${actor}`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Resolve a clientId to the client's company name for audit log actor field.
   */
  private async resolveActorName(clientId: string): Promise<string> {
    const client = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
      select: { companyName: true },
    });
    return client?.companyName || clientId;
  }

  /**
   * Resolve a wallet address to a registered institution client ID.
   * Returns null if the wallet is not associated with any client.
   */
  private async resolveClientIdByWallet(wallet: string): Promise<string | null> {
    const account = await this.prisma.institutionAccount.findFirst({
      where: { walletAddress: wallet, isActive: true },
      select: { clientId: true },
    });
    if (account) return account.clientId;

    const client = await this.prisma.institutionClient.findFirst({
      where: {
        OR: [{ primaryWallet: wallet }, { settledWallets: { hasSome: [wallet] } }],
      },
      select: { id: true },
    });
    return client?.id || null;
  }

  /**
   * Create an audit log entry enriched with KYT context.
   * Use this for all transactional events (create, fund, release, cancel).
   */
  private async createKytAuditLog(
    escrow: any,
    action: string,
    actor: string,
    details: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    const kytContext = await this.buildKytContext(escrow);
    await this.createAuditLog(
      escrow.escrowId,
      escrow.clientId,
      action,
      actor,
      { ...details, ...kytContext },
      ipAddress
    );
  }

  /**
   * Cache escrow record in Redis (keyed by both escrowCode and escrowId)
   */
  private async cacheEscrow(escrow: Record<string, unknown>): Promise<void> {
    try {
      const data = JSON.stringify(escrow);
      const e = escrow as any;
      await Promise.all([
        redisClient.set(`${ESCROW_CACHE_PREFIX}${e.escrowCode}`, data, 'EX', ESCROW_CACHE_TTL),
        redisClient.set(`${ESCROW_CACHE_PREFIX}${e.escrowId}`, data, 'EX', ESCROW_CACHE_TTL),
      ]);
    } catch {
      // Cache write failure is non-critical
    }
  }

  private static STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft',
    CREATED: 'Awaiting Deposit',
    FUNDED: 'Funded — Awaiting Release',
    COMPLIANCE_HOLD: 'Compliance Review',
    RELEASING: 'Releasing',
    RELEASED: 'Released',
    INSUFFICIENT_FUNDS: 'Insufficient Funds',
    COMPLETE: 'Complete',
    CANCELLING: 'Cancelling',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
    FAILED: 'Failed',
  };

  /**
   * Validate that a recipient wallet belongs to a registered institution account
   * or client wallet. Rejects unknown external wallets.
   */
  private async validateRecipientWallet(
    recipientWallet: string,
    payerClientId: string
  ): Promise<void> {
    // Check institution accounts
    const account = await this.prisma.institutionAccount.findFirst({
      where: { walletAddress: recipientWallet },
      select: { clientId: true },
    });

    if (account) {
      if (account.clientId === payerClientId) {
        throw new Error('Cannot send to your own account');
      }
      return; // Valid — belongs to another institution
    }

    // Check client primary/settled wallets
    const client = await this.prisma.institutionClient.findFirst({
      where: {
        OR: [{ primaryWallet: recipientWallet }, { settledWallets: { has: recipientWallet } }],
      },
      select: { id: true },
    });

    if (client) {
      if (client.id === payerClientId) {
        throw new Error('Cannot send to your own wallet');
      }
      return; // Valid — belongs to another institution
    }

    throw new Error(
      `Recipient wallet ${recipientWallet.substring(0, 8)}...${recipientWallet.slice(
        -4
      )} is not registered to any institution. Only verified institutional wallets are accepted.`
    );
  }

  /**
   * Batch-resolve party names for a list of escrows.
   * Returns a PartyNames[] aligned with the input array.
   * Uses 4 parallel queries regardless of escrow count.
   */
  private async resolvePartyNames(
    escrows: Array<Record<string, unknown>>,
    payerClientId: string
  ): Promise<PartyNames[]> {
    if (escrows.length === 0) return [];

    const payerWallets = [
      ...new Set(escrows.map((e) => (e as any).payerWallet).filter(Boolean)),
    ] as string[];
    const recipientWallets = [
      ...new Set(escrows.map((e) => (e as any).recipientWallet).filter(Boolean)),
    ] as string[];

    const [payerClient, payerAccounts, recipientAccounts, recipientClients] = await Promise.all([
      this.prisma.institutionClient.findUnique({
        where: { id: payerClientId },
        select: { companyName: true },
      }),
      payerWallets.length > 0
        ? this.prisma.institutionAccount.findMany({
            where: { clientId: payerClientId, walletAddress: { in: payerWallets } },
            select: {
              walletAddress: true,
              label: true,
              name: true,
              branch: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      recipientWallets.length > 0
        ? this.prisma.institutionAccount.findMany({
            where: { walletAddress: { in: recipientWallets } },
            select: {
              walletAddress: true,
              label: true,
              name: true,
              client: { select: { id: true, companyName: true } },
              branch: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      recipientWallets.length > 0
        ? this.prisma.institutionClient.findMany({
            where: {
              OR: [
                { primaryWallet: { in: recipientWallets } },
                { settledWallets: { hasSome: recipientWallets } },
              ],
            },
            select: { id: true, companyName: true, primaryWallet: true, settledWallets: true },
          })
        : Promise.resolve([]),
    ]);

    // Payer account lookup: wallet → { label, branchName }
    const payerAccountMap = new Map(
      payerAccounts.map((a) => [
        a.walletAddress,
        { label: a.label || a.name, branchName: (a as any).branch?.name || null },
      ])
    );

    // Recipient lookup: wallet → { clientId, companyName, accountLabel, branchName }
    const recipientMap = new Map<
      string,
      {
        clientId: string;
        companyName: string;
        accountLabel: string | null;
        branchName: string | null;
      }
    >();

    // Accounts give us both client identity and account label
    for (const acct of recipientAccounts) {
      const acctClient = (acct as any).client;
      if (acctClient && !recipientMap.has(acct.walletAddress)) {
        recipientMap.set(acct.walletAddress, {
          clientId: acctClient.id,
          companyName: acctClient.companyName,
          accountLabel: acct.label || acct.name,
          branchName: (acct as any).branch?.name || null,
        });
      }
    }

    // Client direct wallets (primaryWallet / settledWallets) — no account label
    for (const c of recipientClients) {
      const wallets: string[] = [];
      if (c.primaryWallet) wallets.push(c.primaryWallet);
      if (c.settledWallets) wallets.push(...c.settledWallets);
      for (const w of wallets) {
        if (recipientWallets.includes(w) && !recipientMap.has(w)) {
          recipientMap.set(w, {
            clientId: c.id,
            companyName: c.companyName,
            accountLabel: null,
            branchName: null,
          });
        }
      }
    }

    return escrows.map((e) => {
      const esc = e as any;
      const payerAcct = esc.payerWallet ? payerAccountMap.get(esc.payerWallet) : null;
      const recipient = esc.recipientWallet ? recipientMap.get(esc.recipientWallet) : null;
      return {
        // Prefer stored display names, then DB-resolved, then null
        payerName: esc.payerName || payerClient?.companyName || null,
        payerAccountLabel: esc.payerAccountLabel || payerAcct?.label || null,
        payerBranchName: esc.payerBranchName || payerAcct?.branchName || null,
        recipientName: esc.recipientName || recipient?.companyName || null,
        recipientAccountLabel: esc.recipientAccountLabel || recipient?.accountLabel || null,
        recipientBranchName: esc.recipientBranchName || recipient?.branchName || null,
        counterpartyId: recipient?.clientId || null,
      };
    });
  }

  private formatEscrow(
    escrow: Record<string, unknown>,
    partyNames?: PartyNames,
    callerClientId?: string
  ): Record<string, unknown> {
    const e = escrow as any;

    // Privacy-aware masking: hide recipientWallet for non-owners when STEALTH
    const privacyLevel = e.privacyLevel || 'NONE';
    const isOwner = !callerClientId || callerClientId === e.clientId;
    const isRecipient = callerClientId && partyNames?.counterpartyId === callerClientId;
    const shouldMask = privacyLevel === 'STEALTH' && !isOwner && !isRecipient;

    return {
      escrowId: e.escrowCode,
      internalId: e.escrowId,
      status: e.status,
      statusLabel: (e.status === 'FUNDED' && e.unlockAt && new Date() < new Date(e.unlockAt))
        ? 'Funded — Timelock Active'
        : InstitutionEscrowService.STATUS_LABELS[e.status] || e.status,
      amount: Number(e.amount),
      platformFee: Number(e.platformFee),
      corridor: e.corridor,
      riskScore: e.riskScore,
      from: {
        clientId: e.clientId,
        name: partyNames?.payerName ?? truncateWallet(e.payerWallet),
        accountLabel: partyNames?.payerAccountLabel ?? null,
        branchName: partyNames?.payerBranchName ?? null,
        wallet: e.payerWallet,
      },
      to: {
        clientId: shouldMask ? null : partyNames?.counterpartyId ?? null,
        name: shouldMask
          ? 'Stealth Recipient'
          : partyNames?.recipientName ?? truncateWallet(e.recipientWallet),
        accountLabel: shouldMask ? null : partyNames?.recipientAccountLabel ?? null,
        branchName: shouldMask ? null : partyNames?.recipientBranchName ?? null,
        wallet: shouldMask ? null : e.recipientWallet,
      },
      settlement: {
        mode: e.settlementMode || 'escrow',
        tokenMint: e.usdcMint,
        escrowPda: e.escrowPda,
        vaultPda: e.vaultPda,
        nonceAccount: e.nonceAccount,
        authority: e.settlementAuthority,
        isCdpAuthority: ((e.releaseConditions as string[]) || []).includes('cdp_policy_approval'),
      },
      release: (() => {
        const mode = e.releaseMode || (e.conditionType === 'COMPLIANCE_CHECK' ? 'ai' : 'manual');
        const rawConditions: string[] = e.releaseConditions || [];
        // For AI mode, legal_compliance is always required even if not explicitly in the array
        const conditions =
          mode === 'ai' && !rawConditions.includes('legal_compliance')
            ? ['legal_compliance', ...rawConditions]
            : rawConditions;
        return {
          mode,
          conditionType: e.conditionType,
          approvalParties: e.approvalParties || [],
          conditions,
          conditionLabels: conditions.map((c: string) => AI_RELEASE_CONDITION_LABELS[c] || c),
          instructions: e.approvalInstructions || null,
        };
      })(),
      privacy: {
        level: e.privacyLevel || 'NONE',
        stealthPaymentId: e.stealthPaymentId || null,
      },
      timelock: e.timelockHours ? {
        hours: e.timelockHours,
        unlockAt: e.unlockAt || null,
        isLocked: e.unlockAt ? new Date() < new Date(e.unlockAt) : false,
      } : null,
      transactions: {
        initTx: e.initTxSignature || null,
        depositTx: e.depositTxSignature || null,
        releaseTx: e.releaseTxSignature || null,
        cancelTx: e.cancelTxSignature || null,
      },
      timestamps: {
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        expiresAt: e.expiresAt,
        fundedAt: e.fundedAt,
        unlockAt: e.unlockAt || null,
        resolvedAt: e.resolvedAt,
      },
    };
  }

  private async formatEscrowEnriched(
    escrow: Record<string, unknown>,
    callerClientId?: string
  ): Promise<Record<string, unknown>> {
    const e = escrow as any;

    const [partyNamesArr, corridorRecord, client, recipientClient, aiAnalyses, files] =
      await Promise.all([
        this.resolvePartyNames([escrow], e.clientId),
        e.corridor
          ? this.prisma.institutionCorridor.findUnique({ where: { code: e.corridor } })
          : Promise.resolve(null),
        this.prisma.institutionClient.findUnique({
          where: { id: e.clientId },
          select: { companyName: true, country: true },
        }),
        // Pre-fetch recipient client for country — resolvePartyNames gives us the counterpartyId
        Promise.resolve(null as any), // placeholder, resolved below
        this.prisma.institutionAiAnalysis.findMany({
          where: { escrowId: e.escrowId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            analysisType: true,
            riskScore: true,
            recommendation: true,
            summary: true,
            factors: true,
            extractedFields: true,
            createdAt: true,
          },
        }),
        this.prisma.institutionFile.findMany({
          where: { escrowId: e.escrowId },
          orderBy: { uploadedAt: 'desc' },
          select: {
            id: true,
            fileName: true,
            documentType: true,
            mimeType: true,
            sizeBytes: true,
            uploadedAt: true,
          },
        }),
      ]);

    const base = this.formatEscrow(escrow, partyNamesArr[0], callerClientId);

    // Privacy-aware masking check (same logic as formatEscrow)
    const privacyLevel = e.privacyLevel || 'NONE';
    const isOwner = !callerClientId || callerClientId === e.clientId;
    const isRecipient = callerClientId && partyNamesArr[0]?.counterpartyId === callerClientId;
    const shouldMask = privacyLevel === 'STEALTH' && !isOwner && !isRecipient;

    // Enrich from/to with country
    (base.from as any).country = client?.country || null;

    if (shouldMask) {
      (base.to as any).country = null;
    } else if (partyNamesArr[0]?.counterpartyId) {
      const rclient = await this.prisma.institutionClient.findUnique({
        where: { id: partyNamesArr[0].counterpartyId },
        select: { country: true },
      });
      (base.to as any).country = rclient?.country || null;
    } else {
      (base.to as any).country = null;
    }

    // Enrich corridor with full details
    if (corridorRecord) {
      base.corridor = {
        code: corridorRecord.code,
        name:
          corridorRecord.name || `${corridorRecord.sourceCountry} → ${corridorRecord.destCountry}`,
        sourceCountry: corridorRecord.sourceCountry,
        destCountry: corridorRecord.destCountry,
        riskLevel: corridorRecord.riskLevel,
        requiredDocuments: corridorRecord.requiredDocuments,
        compliance: corridorRecord.status,
      };
    }

    base.complianceChecks = aiAnalyses.map((a) => {
      const extracted = (a.extractedFields as any) || {};
      const sections = extracted._sections || null;
      // Map numeric riskScore to human-readable risk level
      const riskLevel =
        a.riskScore <= 25
          ? 'low_risk'
          : a.riskScore <= 50
          ? 'medium_risk'
          : a.riskScore <= 80
          ? 'high_risk'
          : 'blocked';
      return {
        id: a.id,
        type: a.analysisType,
        riskLevel,
        recommendation: a.recommendation,
        summary: a.summary,
        sections,
        createdAt: a.createdAt,
      };
    });

    base.documents = files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      documentType: f.documentType,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      uploadedAt: f.uploadedAt,
    }));

    // Fulfillment info: present when escrow is PENDING_RELEASE or later and has documents
    const fulfillmentLog =
      e.status !== 'DRAFT' && e.status !== 'CREATED' && e.status !== 'FUNDED'
        ? await this.prisma.institutionAuditLog.findFirst({
            where: { escrowId: e.escrowId, action: 'ESCROW_FULFILLED' },
            orderBy: { createdAt: 'desc' },
            select: { actor: true, details: true, createdAt: true },
          })
        : null;
    base.fulfillment = fulfillmentLog
      ? {
          submittedBy: fulfillmentLog.actor,
          submittedAt: fulfillmentLog.createdAt,
          proofDocument: (fulfillmentLog.details as any)?.proofDocument || null,
          documentCount: files.length,
        }
      : null;

    // AI release checks: retrieve the latest AI_RELEASE_CHECK from audit log
    const aiReleaseLog = await this.prisma.institutionAuditLog.findFirst({
      where: { escrowId: e.escrowId, action: 'AI_RELEASE_CHECK' },
      orderBy: { createdAt: 'desc' },
      select: { details: true, createdAt: true },
    });
    if (aiReleaseLog) {
      const details = aiReleaseLog.details as any;
      base.aiReleaseChecks = {
        passed: details?.passed ?? false,
        recommendation: details?.recommendation || null,
        summary: details?.summary || null,
        conditions: (details?.conditions || []).map((c: any) => ({
          key: c.condition,
          label: c.label,
          passed: c.passed,
          detail: c.detail,
        })),
        checkedAt: aiReleaseLog.createdAt,
      };
    } else {
      base.aiReleaseChecks = null;
    }

    base.activityLog = (await this.getActivityLog(e.escrowId)).map((log) => {
      // Strip nested details.kyt to avoid data bloat — KYT fields are already flattened
      const { details, ...rest } = log as any;
      const isAiAction = rest.action === 'AI_RELEASE_CHECK' || rest.action === 'AI_AUTO_RELEASE';
      return {
        ...rest,
        details: details
          ? {
              message: details.message || null,
              riskLevel: details.riskLevel || null,
              riskScore: details.riskScore || null,
              flags: details.flags || null,
              // Preserve AI release check details for frontend display
              ...(isAiAction && {
                passed: details.passed ?? null,
                recommendation: details.recommendation || null,
                summary: details.summary || null,
                conditions: details.conditions || null,
              }),
            }
          : null,
      };
    });

    return base;
  }

  /**
   * Fetch and format recent activity log entries for an escrow.
   * Reusable by create/submit responses to avoid a separate GET call.
   */
  private async getActivityLog(
    escrowId: string,
    limit = 50
  ): Promise<Array<Record<string, unknown>>> {
    const auditLogs = await this.prisma.institutionAuditLog.findMany({
      where: { escrowId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, action: true, actor: true, details: true, createdAt: true },
    });

    return auditLogs.map((l) => {
      const d = (l.details || {}) as Record<string, unknown>;
      const kyt = d.kyt as Record<string, unknown> | undefined;
      return {
        id: l.id,
        action: l.action,
        title: AUDIT_ACTION_LABELS[l.action] || l.action,
        actor: l.actor,
        message: d.message || null,
        txSignature:
          d.initTxSignature || d.txSignature || d.releaseTxSignature || d.cancelTxSignature || null,
        amount: kyt?.amount || d.amount || null,
        currency: kyt?.currency || 'USDC',
        corridor: kyt?.corridor || null,
        originator: kyt?.originator || null,
        beneficiary: kyt?.beneficiary || null,
        riskScore: d.riskScore || null,
        conditions: d.conditions || null,
        details: d,
        createdAt: l.createdAt,
      };
    });
  }
}

let instance: InstitutionEscrowService | null = null;
export function getInstitutionEscrowService(): InstitutionEscrowService {
  if (!instance) {
    instance = new InstitutionEscrowService();
  }
  return instance;
}
