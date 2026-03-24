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

import { PrismaClient, InstitutionEscrowStatus } from '../generated/prisma';
import type { SettlementMode, ReleaseMode } from '../types/institution-escrow';
import { redisClient } from '../config/redis';
import { AllowlistService, getAllowlistService } from './allowlist.service';
import { ComplianceService, getComplianceService } from './compliance.service';
import { getTokenWhitelistService } from './institution-token-whitelist.service';
import { getInstitutionNotificationService } from './institution-notification.service';
import {
  getInstitutionEscrowProgramService,
  InstitutionEscrowProgramService,
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

const ESCROW_CACHE_PREFIX = 'institution:escrow:';
const ESCROW_CACHE_TTL = 300; // 5 minutes

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
}

export interface CreateEscrowResult {
  escrow: Record<string, unknown>;
  complianceResult: Record<string, unknown>;
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
    this.prisma = new PrismaClient();
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

    // 5. Calculate platform fee with min/max clamping from client settings
    const platformFee = await this.calculatePlatformFee(clientId, amount);

    // 6. Determine status based on compliance
    const initialStatus: InstitutionEscrowStatus = complianceResult.passed
      ? 'CREATED'
      : 'COMPLIANCE_HOLD';

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
      const feeCollectorPk = toPublicKey(config.platform.feeCollectorAddress, 'feeCollectorAddress');
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
        await this.createAuditLog(escrowId, clientId, 'ON_CHAIN_INIT_FAILED', payerWallet, {
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
      },
    });

    // 12. Create audit log
    await this.createAuditLog(escrowId, clientId, 'ESCROW_CREATED', payerWallet, {
      amount,
      corridor,
      conditionType,
      escrowPda,
      vaultPda,
      initTxSignature,
      complianceResult: {
        passed: complianceResult.passed,
        riskScore: complianceResult.riskScore,
        flags: complianceResult.flags,
      },
    });

    // 11. Send notifications
    try {
      const notificationService = getInstitutionNotificationService();
      if (initialStatus === 'COMPLIANCE_HOLD') {
        await notificationService.notify({
          clientId,
          escrowId,
          type: 'ESCROW_COMPLIANCE_HOLD',
          priority: 'HIGH',
          title: 'Escrow Held for Compliance Review',
          message: `Escrow ${escrowCode} (${amount} USDC) requires compliance review before proceeding.`,
          metadata: { amount, corridor, riskScore: complianceResult.riskScore },
        });
      } else {
        await notificationService.notify({
          clientId,
          escrowId,
          type: 'ESCROW_CREATED',
          title: 'Escrow Created',
          message: `Escrow ${escrowCode} created for ${amount} USDC on corridor ${corridor}. Awaiting deposit.`,
          metadata: { amount, corridor, escrowCode },
        });
      }
    } catch (error) {
      console.warn('[InstitutionEscrow] Notification failed (non-critical):', error);
    }

    // 12. Cache in Redis
    await this.cacheEscrow(escrow);

    return {
      escrow: this.formatEscrow(escrow),
      complianceResult: {
        passed: complianceResult.passed,
        riskScore: complianceResult.riskScore,
        flags: complianceResult.flags,
      },
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

    await this.createAuditLog(escrowId, clientId, 'DRAFT_SAVED', payerWallet, {
      amount: resolvedAmount,
      corridor: corridor || null,
    });

    await this.cacheEscrow(escrow);

    return this.formatEscrow(escrow);
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

    await this.createAuditLog(escrowId, clientId, 'DRAFT_UPDATED', escrow.payerWallet, {
      updatedFields: Object.keys(updateData),
    });

    await this.cacheEscrow(updated);

    return this.formatEscrow(updated);
  }

  /**
   * Submit a DRAFT escrow — validates all required fields are present,
   * runs compliance checks, assigns nonce, and transitions to CREATED (or COMPLIANCE_HOLD).
   */
  async submitDraft(
    clientId: string,
    idOrCode: string,
    expiryHours = 72
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

    // Determine status
    const newStatus: InstitutionEscrowStatus = complianceResult.passed
      ? 'CREATED'
      : 'COMPLIANCE_HOLD';

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
          `[InstitutionEscrow] Draft mint mismatch: DB has "${escrow.usdcMint}" but env USDC_MINT_ADDRESS is "${onChainMint.toBase58()}". Using env mint for on-chain tx.`
        );
      }
      const feeCollectorPk = toPublicKey(config.platform.feeCollectorAddress, 'feeCollectorAddress');
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
        await this.createAuditLog(escrowId, clientId, 'ON_CHAIN_INIT_FAILED', escrow.payerWallet, {
          error: (error as Error).message,
        });
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
      },
    });

    await this.createAuditLog(escrowId, clientId, 'DRAFT_SUBMITTED', escrow.payerWallet, {
      amount: Number(escrow.amount),
      corridor: escrow.corridor,
      conditionType: escrow.conditionType,
      complianceResult: {
        passed: complianceResult.passed,
        riskScore: complianceResult.riskScore,
        flags: complianceResult.flags,
      },
    });

    await this.cacheEscrow(updated);

    // Send notification (same as createEscrow)
    try {
      const notificationService = getInstitutionNotificationService();
      if (newStatus === 'COMPLIANCE_HOLD') {
        await notificationService.notify({
          clientId,
          escrowId,
          type: 'ESCROW_COMPLIANCE_HOLD',
          priority: 'HIGH',
          title: 'Escrow Held for Compliance Review',
          message: `Escrow ${escrow.escrowCode} (${Number(
            escrow.amount
          )} USDC) requires compliance review before proceeding.`,
          metadata: {
            amount: Number(escrow.amount),
            corridor: escrow.corridor,
            riskScore: complianceResult.riskScore,
          },
        });
      } else {
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
          },
        });
      }
    } catch (error) {
      console.warn('[InstitutionEscrow] Notification failed (non-critical):', error);
    }

    return {
      escrow: this.formatEscrow(updated),
      complianceResult: {
        passed: complianceResult.passed,
        riskScore: complianceResult.riskScore,
        flags: complianceResult.flags,
      },
    };
  }

  /**
   * Record a deposit for an escrow
   */
  async recordDeposit(
    clientId: string,
    idOrCode: string,
    txSignature: string
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

    await this.createAuditLog(escrowId, clientId, 'DEPOSIT_CONFIRMED', escrow.payerWallet, {
      txSignature,
      amount: Number(escrow.amount),
    });

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

    return this.formatEscrow(updated);
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
   * Release funds from escrow to recipient
   */
  async releaseFunds(
    clientId: string,
    idOrCode: string,
    notes?: string
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

    // Capture original status before changing to RELEASING so balance check can revert correctly
    const originalStatus = escrow.status as InstitutionEscrowStatus;

    // Update status to RELEASING
    await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: { status: 'RELEASING' },
    });

    // Check payer's token balance before settlement
    await this.checkPayerBalance(escrow, clientId);

    // Execute on-chain release (transfer USDC from vault to recipient)
    let releaseTxSig: string | null = null;
    const releaseProgramService = this.getProgramService();
    if (releaseProgramService && escrow.escrowPda) {
      try {
        if (!config.platform.feeCollectorAddress) {
          throw new Error('Platform feeCollectorAddress is not configured');
        }
        const feeCollector = toPublicKey(config.platform.feeCollectorAddress, 'feeCollectorAddress');
        const usdcMint = releaseProgramService.getUsdcMintAddress();
        releaseTxSig = await releaseProgramService.releaseEscrowOnChain({
          escrowId,
          recipientWallet: toPublicKey(escrow.recipientWallet!, 'recipientWallet'),
          feeCollector,
          usdcMint,
          escrowCode: escrow.escrowCode,
        });
        console.log(
          `[InstitutionEscrow] On-chain release success for ${escrowId}, tx: ${releaseTxSig}`
        );
      } catch (error) {
        console.error('[InstitutionEscrow] On-chain release failed:', error);
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

    await this.createAuditLog(escrowId, clientId, 'FUNDS_RELEASED', escrow.settlementAuthority, {
      amount: Number(escrow.amount),
      recipient: escrow.recipientWallet,
      releaseTxSignature: releaseTxSig,
      notes,
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

      await this.createAuditLog(
        escrowId,
        clientId,
        'ESCROW_COMPLETED',
        escrow.settlementAuthority,
        {
          previousStatus: 'RELEASED',
        }
      );

      await this.cacheEscrow(completed);
      return this.formatEscrow(completed);
    } catch (error) {
      // If notification/completion fails, escrow stays RELEASED (still valid terminal state)
      console.warn('[InstitutionEscrow] COMPLETE transition failed (non-critical):', error);
      await this.cacheEscrow(updated);
      return this.formatEscrow(updated);
    }
  }

  /**
   * Cancel escrow and initiate refund
   */
  async cancelEscrow(
    clientId: string,
    idOrCode: string,
    reason?: string
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

    await this.createAuditLog(escrowId, clientId, 'ESCROW_CANCELLED', escrow.payerWallet, {
      reason,
      previousStatus: escrow.status,
      wasFunded: escrow.status === 'FUNDED',
    });

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

    return this.formatEscrow(updated);
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
          await this.createAuditLog(escrowId, clientId, 'INSUFFICIENT_FUNDS', escrow.payerWallet, {
            available: tokenAccount.amount.toString(),
            required: requiredMicroUsdc.toString(),
          });
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
        await this.createAuditLog(escrowId, clientId, 'INSUFFICIENT_FUNDS', escrow.payerWallet, {
          reason: 'Token account does not exist',
        });
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
    // Try Redis cache first (cache keyed by escrowCode)
    try {
      const cached = await redisClient.get(`${ESCROW_CACHE_PREFIX}${idOrCode}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.clientId === clientId) {
          return this.formatEscrow(parsed);
        }
      }
    } catch {
      // Cache miss
    }

    const escrow = await this.getEscrowInternal(clientId, idOrCode, true);
    return this.formatEscrow(escrow);
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

    return {
      escrows: escrows.map((e) => this.formatEscrow(e)),
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
   * Format escrow for API response (list view — lightweight)
   */
  private formatEscrow(escrow: Record<string, unknown>): Record<string, unknown> {
    const e = escrow as any;
    return {
      id: e.escrowCode,
      escrowId: e.escrowCode,
      internalId: e.escrowId,
      clientId: e.clientId,
      payerWallet: e.payerWallet,
      recipientWallet: e.recipientWallet,
      usdcMint: e.usdcMint,
      amount: Number(e.amount),
      platformFee: Number(e.platformFee),
      corridor: e.corridor,
      conditionType: e.conditionType,
      status: e.status,
      statusLabel: InstitutionEscrowService.STATUS_LABELS[e.status] || e.status,
      settlementAuthority: e.settlementAuthority,
      riskScore: e.riskScore,
      settlementMode: e.settlementMode || 'escrow',
      releaseMode: e.releaseMode || (e.conditionType === 'COMPLIANCE_CHECK' ? 'ai' : 'manual'),
      approvalParties: e.approvalParties || [],
      releaseConditions: e.releaseConditions || [],
      approvalInstructions: e.approvalInstructions || null,
      escrowPda: e.escrowPda,
      vaultPda: e.vaultPda,
      nonceAccount: e.nonceAccount,
      depositTxSignature: e.depositTxSignature,
      releaseTxSignature: e.releaseTxSignature,
      cancelTxSignature: e.cancelTxSignature,
      expiresAt: e.expiresAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      resolvedAt: e.resolvedAt,
      fundedAt: e.fundedAt,
    };
  }

  private async formatEscrowEnriched(
    escrow: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const base = this.formatEscrow(escrow);
    const e = escrow as any;

    const [corridorRecord, client, aiAnalyses, auditLogs] = await Promise.all([
      e.corridor
        ? this.prisma.institutionCorridor.findUnique({ where: { code: e.corridor } })
        : Promise.resolve(null),
      this.prisma.institutionClient.findUnique({
        where: { id: e.clientId },
        select: { companyName: true, country: true, primaryWallet: true },
      }),
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
      this.prisma.institutionAuditLog.findMany({
        where: { escrowId: e.escrowId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          action: true,
          actor: true,
          details: true,
          createdAt: true,
        },
      }),
    ]);

    if (corridorRecord) {
      base.corridor = {
        code: corridorRecord.code,
        name: `${corridorRecord.sourceCountry} → ${corridorRecord.destCountry}`,
        sourceCountry: corridorRecord.sourceCountry,
        destCountry: corridorRecord.destCountry,
        riskLevel: corridorRecord.riskLevel,
        requiredDocuments: corridorRecord.requiredDocuments,
        compliance: corridorRecord.status,
      };
    }

    base.sender = {
      name: client?.companyName || 'Unknown',
      wallet: e.payerWallet,
      country: client?.country || null,
    };

    const recipientClient = e.recipientWallet
      ? await this.prisma.institutionClient.findFirst({
          where: {
            OR: [
              { primaryWallet: e.recipientWallet },
              { settledWallets: { has: e.recipientWallet } },
            ],
          },
          select: { companyName: true, country: true },
        })
      : null;

    base.recipient = {
      name: recipientClient?.companyName || 'External Wallet',
      wallet: e.recipientWallet,
      country: recipientClient?.country || null,
    };

    base.complianceChecks = aiAnalyses.map((a) => ({
      id: a.id,
      type: a.analysisType,
      riskScore: a.riskScore,
      recommendation: a.recommendation,
      summary: a.summary,
      factors: a.factors,
      createdAt: a.createdAt,
    }));

    base.activityLog = auditLogs.map((l) => ({
      id: l.id,
      action: l.action,
      actor: l.actor,
      details: l.details,
      createdAt: l.createdAt,
    }));

    return base;
  }
}

let instance: InstitutionEscrowService | null = null;
export function getInstitutionEscrowService(): InstitutionEscrowService {
  if (!instance) {
    instance = new InstitutionEscrowService();
  }
  return instance;
}
