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

import { PrismaClient, InstitutionEscrowStatus, PrivacyLevel as PrismaPrivacyLevel } from '../generated/prisma';
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
  AI_RELEASE_CHECK: 'AI Analysis',
  FUNDS_RELEASED: 'Funds Released',
  ESCROW_COMPLETED: 'Settlement Complete',
  ESCROW_CANCELLED: 'Cancelled',
  ESCROW_EXPIRED: 'Expired',
  INSUFFICIENT_FUNDS: 'Insufficient Funds',
  ON_CHAIN_INIT_FAILED: 'On-Chain Init Failed',
  ON_CHAIN_RELEASE_FAILED: 'On-Chain Release Failed',
  ON_CHAIN_CANCEL_FAILED: 'On-Chain Cancel Failed',
};

const AI_RELEASE_CONDITION_LABELS: Record<string, string> = {
  legal_compliance: 'All legal compliance checks pass',
  invoice_amount_match: 'Invoice amount matches exactly',
  client_info_match: 'Client information matches exactly',
  document_signature_verified: 'Document signature is verified (via DocuSign)',
};

interface PartyNames {
  payerName: string | null;
  payerAccountLabel: string | null;
  recipientName: string | null;
  recipientAccountLabel: string | null;
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
}

export interface CreateEscrowResult {
  escrow: Record<string, unknown>;
  complianceResult: Record<string, unknown>;
  activityLog: Array<Record<string, unknown>>;
}

export interface ListEscrowsParams {
  clientId: string;
  status?: string;
  corridor?: string;
  limit?: number;
  offset?: number;
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

    const rawFee = (amount * feeBps) / 10000;
    return Math.min(maxFee, Math.max(minFee, rawFee));
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
      releaseConditions,
      approvalInstructions,
      actorEmail,
    } = params;

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

    // 10. Initialize escrow on-chain
    let escrowPda: string | null = null;
    let vaultPda: string | null = null;
    let initTxSignature: string | null = null;
    const programService = this.getProgramService();
    if (programService) {
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
      const settlementPk = toPublicKey(resolvedSettlementAuthority, 'settlementAuthority');

      try {
        const result = await programService.initEscrowOnChain({
          escrowId,
          payerWallet: payerPk,
          recipientWallet: recipientPk,
          usdcMint: onChainMint,
          feeCollector: feeCollectorPk,
          settlementAuthority: settlementPk,
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
        message: `Escrow ${escrowCode} created for ${amount} USDC on corridor ${corridor}. Awaiting deposit.`,
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
      releaseConditions,
      approvalInstructions,
      actorEmail,
    } = params;

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
    if (params.releaseConditions !== undefined)
      updateData.releaseConditions = params.releaseConditions;
    if (params.approvalInstructions !== undefined)
      updateData.approvalInstructions = params.approvalInstructions;

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

    // Initialize escrow on-chain
    let escrowPda: string | null = null;
    let vaultPda: string | null = null;
    let initTxSignature: string | null = null;
    const programService = this.getProgramService();
    if (programService) {
      if (!config.platform.feeCollectorAddress) {
        throw new Error('Platform feeCollectorAddress is not configured');
      }
      const resolvedSettlementAuthority = escrow.settlementAuthority || escrow.payerWallet;
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
      const settlementPk = toPublicKey(resolvedSettlementAuthority, 'settlementAuthority');

      try {
        const result = await programService.initEscrowOnChain({
          escrowId,
          payerWallet: payerPk,
          recipientWallet: recipientPk,
          usdcMint: onChainMint,
          feeCollector: feeCollectorPk,
          settlementAuthority: settlementPk,
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
        )} USDC on corridor ${escrow.corridor}. Awaiting deposit.`,
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

    // Update escrow status to FUNDED
    const updated = await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: {
        status: 'FUNDED',
        depositTxSignature: txSignature,
        fundedAt: new Date(),
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
  ): Promise<{ transaction: string; escrowId: string }> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    if (escrow.status !== 'CREATED') {
      throw new Error(
        `Cannot get deposit transaction: escrow status is ${escrow.status}, expected CREATED`
      );
    }

    const programService = this.getProgramService();
    if (!programService) {
      throw new Error('Program service not available');
    }

    const payerWallet = toPublicKey(escrow.payerWallet, 'payerWallet');
    const usdcMint = programService.getUsdcMintAddress();

    const tx = await programService.buildDepositTransaction({
      escrowId,
      payer: payerWallet,
      usdcMint,
      memo: escrow.escrowCode ? `EasyEscrow:deposit:${escrow.escrowCode}` : undefined,
    });

    tx.feePayer = payerWallet;
    const { blockhash } = await programService.getConnection().getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');

    return { transaction: serialized, escrowId };
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

    // 2. Invoice amount match (if selected)
    if (selectedConditions.includes('invoice_amount_match')) {
      const extractedAmount =
        analysis.extractedFields?.invoiceAmount ?? analysis.extractedFields?.amount;
      const escrowAmount = Number(escrow.amount);
      const amountMatches =
        extractedAmount !== undefined && Math.abs(Number(extractedAmount) - escrowAmount) < 0.01;
      results.push({
        condition: 'invoice_amount_match',
        label: 'Invoice amount matches exactly',
        passed: !!amountMatches,
        detail: amountMatches
          ? `Invoice amount ${extractedAmount} matches escrow amount ${escrowAmount}`
          : `Invoice amount ${
              extractedAmount ?? 'not found'
            } does not match escrow amount ${escrowAmount}`,
      });
    }

    // 3. Client information match (if selected)
    if (selectedConditions.includes('client_info_match')) {
      const client = await this.prisma.institutionClient.findUnique({
        where: { id: clientId },
        select: { companyName: true, legalName: true, country: true },
      });
      const extractedCompany =
        analysis.extractedFields?.companyName ?? analysis.extractedFields?.clientName;
      const clientMatch =
        extractedCompany !== undefined &&
        client &&
        (String(extractedCompany)
          .toLowerCase()
          .includes(client.companyName?.toLowerCase() || '') ||
          String(extractedCompany)
            .toLowerCase()
            .includes(client.legalName?.toLowerCase() || ''));
      results.push({
        condition: 'client_info_match',
        label: 'Client information matches exactly',
        passed: !!clientMatch,
        detail: clientMatch
          ? `Extracted company "${extractedCompany}" matches client record`
          : `Extracted company "${extractedCompany ?? 'not found'}" does not match client "${
              client?.companyName
            }"`,
      });
    }

    // 4. Document signature verified (if selected)
    if (selectedConditions.includes('document_signature_verified')) {
      const signatureVerified =
        analysis.extractedFields?.signatureVerified === true ||
        analysis.extractedFields?.docusignStatus === 'completed';
      results.push({
        condition: 'document_signature_verified',
        label: 'Document signature is verified (via DocuSign)',
        passed: !!signatureVerified,
        detail: signatureVerified
          ? 'Document signature has been verified'
          : 'Document signature could not be verified',
      });
    }

    const allPassed = results.every((r) => r.passed);

    return { passed: allPassed, conditions: results, aiAnalysis: analysis };
  }

  /**
   * Release funds from escrow to recipient
   */
  async releaseFunds(
    clientId: string,
    idOrCode: string,
    notes?: string,
    actorEmail?: string,
    privacyPreferences?: PrivacyPreferences
  ): Promise<Record<string, unknown>> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    // Allow release from FUNDED or INSUFFICIENT_FUNDS (retry after funding)
    const releasableStatuses: InstitutionEscrowStatus[] = ['FUNDED', 'INSUFFICIENT_FUNDS'];
    if (!releasableStatuses.includes(escrow.status)) {
      throw new Error(
        `Cannot release: escrow status is ${escrow.status}, expected FUNDED or INSUFFICIENT_FUNDS`
      );
    }

    // Track AI analysis for chain-of-custody memo digest
    let aiAnalysisForMemo: AiMemoData | null = null;

    // Gate by releaseMode: if AI, run AI compliance checks before proceeding
    if (escrow.releaseMode === 'ai') {
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
    }

    // Update status to RELEASING
    const originalStatus = escrow.status;
    await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: { status: 'RELEASING' },
    });

    // Check payer's token balance before settlement
    await this.checkPayerBalance(escrow, clientId);

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
        throw new Error(
          `Stealth address derivation failed: ${(privacyError as Error).message}`
        );
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

    // Execute on-chain release (transfer USDC from vault to recipient)
    let releaseTxSig: string | null = null;
    const releaseProgramService = this.getProgramService();
    if (releaseProgramService && escrow.escrowPda) {
      try {
        if (!config.platform.feeCollectorAddress) {
          throw new Error('Platform feeCollectorAddress is not configured');
        }
        const feeCollector = toPublicKey(
          config.platform.feeCollectorAddress,
          'feeCollectorAddress'
        );
        const usdcMint = releaseProgramService.getUsdcMintAddress();
        const aiDigest = buildAiDigest(aiAnalysisForMemo);
        releaseTxSig = await releaseProgramService.releaseEscrowOnChain({
          escrowId,
          recipientWallet: toPublicKey(releaseRecipient, 'recipientWallet'),
          feeCollector,
          usdcMint,
          escrowCode: escrow.escrowCode,
          aiDigest,
        });
        console.log(
          `[InstitutionEscrow] On-chain release success for ${escrowId}, tx: ${releaseTxSig}`
        );

        // Confirm stealth payment if applicable
        if (stealthPaymentId && releaseTxSig) {
          try {
            const stealthService = getStealthAddressService();
            await stealthService.confirmStealthPayment(stealthPaymentId, releaseTxSig);
          } catch (err) {
            console.warn('[InstitutionEscrow] Stealth payment confirmation failed (non-critical):', err);
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
          data: { status: 'FUNDED' },
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
    } else if (escrow.nonceAccount) {
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
          data: { status: 'FUNDED' },
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
    if (escrow.status === 'FUNDED' && escrow.escrowPda) {
      const cancelProgramService = this.getProgramService();
      if (cancelProgramService) {
        try {
          const usdcMint = cancelProgramService.getUsdcMintAddress();
          cancelTxSignature = await cancelProgramService.cancelEscrowOnChain({
            escrowId,
            payerWallet: toPublicKey(escrow.payerWallet, 'payerWallet'),
            usdcMint,
            escrowCode: escrow.escrowCode,
            cancelReason: reason,
          });
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
    const { clientId, status, corridor, limit = 20, offset = 0 } = params;

    const where: Record<string, unknown> = { clientId };
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

    const partyNamesArr = await this.resolvePartyNames(escrows as any[], clientId);

    return {
      escrows: escrows.map((e, i) => this.formatEscrow(e, partyNamesArr[i], clientId)),
      total,
      limit,
      offset,
    };
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
      console.error('[InstitutionEscrowService] Failed to create audit log:', error);
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
            select: { walletAddress: true, label: true, name: true },
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

    // Payer account label lookup: wallet → label
    const payerAccountMap = new Map(payerAccounts.map((a) => [a.walletAddress, a.label || a.name]));

    // Recipient lookup: wallet → { clientId, companyName, accountLabel }
    const recipientMap = new Map<
      string,
      { clientId: string; companyName: string; accountLabel: string | null }
    >();

    // Accounts give us both client identity and account label
    for (const acct of recipientAccounts) {
      const acctClient = (acct as any).client;
      if (acctClient && !recipientMap.has(acct.walletAddress)) {
        recipientMap.set(acct.walletAddress, {
          clientId: acctClient.id,
          companyName: acctClient.companyName,
          accountLabel: acct.label || acct.name,
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
          recipientMap.set(w, { clientId: c.id, companyName: c.companyName, accountLabel: null });
        }
      }
    }

    return escrows.map((e) => {
      const esc = e as any;
      const recipient = esc.recipientWallet ? recipientMap.get(esc.recipientWallet) : null;
      return {
        payerName: payerClient?.companyName || null,
        payerAccountLabel: esc.payerWallet ? payerAccountMap.get(esc.payerWallet) || null : null,
        recipientName: recipient?.companyName || null,
        recipientAccountLabel: recipient?.accountLabel || null,
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
    const isRecipient =
      callerClientId && partyNames?.counterpartyId === callerClientId;
    const shouldMask = privacyLevel === 'STEALTH' && !isOwner && !isRecipient;

    return {
      escrowId: e.escrowCode,
      internalId: e.escrowId,
      status: e.status,
      statusLabel: InstitutionEscrowService.STATUS_LABELS[e.status] || e.status,
      amount: Number(e.amount),
      platformFee: Number(e.platformFee),
      corridor: e.corridor,
      riskScore: e.riskScore,
      from: {
        clientId: e.clientId,
        name: partyNames?.payerName ?? null,
        accountLabel: partyNames?.payerAccountLabel ?? null,
        wallet: e.payerWallet,
      },
      to: {
        clientId: shouldMask ? null : (partyNames?.counterpartyId ?? null),
        name: shouldMask
          ? 'Stealth Recipient'
          : (partyNames?.recipientName ?? (e.recipientWallet ? 'External Wallet' : null)),
        accountLabel: shouldMask ? null : (partyNames?.recipientAccountLabel ?? null),
        wallet: shouldMask ? null : e.recipientWallet,
      },
      settlement: {
        mode: e.settlementMode || 'escrow',
        tokenMint: e.usdcMint,
        escrowPda: e.escrowPda,
        vaultPda: e.vaultPda,
        nonceAccount: e.nonceAccount,
        authority: e.settlementAuthority,
      },
      release: {
        mode: e.releaseMode || (e.conditionType === 'COMPLIANCE_CHECK' ? 'ai' : 'manual'),
        conditionType: e.conditionType,
        approvalParties: e.approvalParties || [],
        conditions: e.releaseConditions || [],
        conditionLabels: (e.releaseConditions || []).map(
          (c: string) => AI_RELEASE_CONDITION_LABELS[c] || c
        ),
        instructions: e.approvalInstructions || null,
      },
      privacy: {
        level: e.privacyLevel || 'NONE',
        stealthPaymentId: e.stealthPaymentId || null,
      },
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
        resolvedAt: e.resolvedAt,
      },
    };
  }

  private async formatEscrowEnriched(
    escrow: Record<string, unknown>,
    callerClientId?: string
  ): Promise<Record<string, unknown>> {
    const e = escrow as any;

    const [partyNamesArr, corridorRecord, client, recipientClient, aiAnalyses] = await Promise.all([
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
          createdAt: true,
        },
      }),
    ]);

    const base = this.formatEscrow(escrow, partyNamesArr[0], callerClientId);

    // Privacy-aware masking check (same logic as formatEscrow)
    const privacyLevel = e.privacyLevel || 'NONE';
    const isOwner = !callerClientId || callerClientId === e.clientId;
    const isRecipient =
      callerClientId && partyNamesArr[0]?.counterpartyId === callerClientId;
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

    base.complianceChecks = aiAnalyses.map((a) => ({
      id: a.id,
      type: a.analysisType,
      riskScore: a.riskScore,
      recommendation: a.recommendation,
      summary: a.summary,
      factors: a.factors,
      createdAt: a.createdAt,
    }));

    base.activityLog = (await this.getActivityLog(e.escrowId)).map((log) => {
      // Strip nested details.kyt to avoid data bloat — KYT fields are already flattened
      const { details, ...rest } = log as any;
      return {
        ...rest,
        details: details
          ? {
              message: details.message || null,
              riskLevel: details.riskLevel || null,
              riskScore: details.riskScore || null,
              flags: details.flags || null,
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
