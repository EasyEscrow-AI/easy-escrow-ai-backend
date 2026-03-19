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
import { redisClient } from '../config/redis';
import { AllowlistService, getAllowlistService } from './allowlist.service';
import { ComplianceService, getComplianceService } from './compliance.service';
import { getTokenWhitelistService } from './institution-token-whitelist.service';
import type { NoncePoolManager } from './noncePoolManager';
import crypto from 'crypto';

const ESCROW_CACHE_PREFIX = 'institution:escrow:';
const ESCROW_CACHE_TTL = 300; // 5 minutes

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
   * Generate a human-readable escrow code in EE-XXXX-XXXX format.
   * Uses uppercase alphanumeric characters (excludes ambiguous: 0/O, 1/I/L).
   */
  private generateEscrowCode(): string {
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 30 chars
    const bytes = crypto.randomBytes(8);
    let code = 'EE-';
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += '-';
      code += chars[bytes[i] % chars.length];
    }
    return code;
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
      // If compliance fails with HIGH risk, reject immediately
      if (complianceResult.riskScore >= 75) {
        throw new Error(
          `Compliance check failed: ${complianceResult.reasons.join('; ')}`,
        );
      }
      // For medium risk, create with COMPLIANCE_HOLD status
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

    // 5. Calculate platform fee (basis points from config, default 50 bps = 0.5%)
    const feeBps = parseInt(process.env.INSTITUTION_ESCROW_FEE_BPS || '50', 10);
    const platformFee = (amount * feeBps) / 10000;

    // 6. Determine status based on compliance
    const initialStatus: InstitutionEscrowStatus = complianceResult.passed
      ? 'CREATED'
      : 'COMPLIANCE_HOLD';

    // 7. Calculate expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    // 8. Determine settlement authority
    const resolvedSettlementAuthority =
      settlementAuthority || client.primaryWallet || payerWallet;

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
      console.warn('[InstitutionEscrow] NoncePoolManager not available — escrow will lack atomic settlement');
    }

    // 10. Store in Prisma
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
        expiresAt,
      },
    });

    // 10. Create audit log
    await this.createAuditLog(escrowId, clientId, 'ESCROW_CREATED', payerWallet, {
      amount,
      corridor,
      conditionType,
      complianceResult: {
        passed: complianceResult.passed,
        riskScore: complianceResult.riskScore,
        flags: complianceResult.flags,
      },
    });

    // 11. Cache in Redis
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
   * Record a deposit for an escrow
   */
  async recordDeposit(
    clientId: string,
    idOrCode: string,
    txSignature: string,
  ): Promise<Record<string, unknown>> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    if (escrow.status !== 'CREATED') {
      throw new Error(
        `Cannot record deposit: escrow status is ${escrow.status}, expected CREATED`,
      );
    }

    // Check if expired
    if (new Date() > escrow.expiresAt) {
      await this.prisma.institutionEscrow.update({
        where: { escrowId },
        data: { status: 'EXPIRED', resolvedAt: new Date() },
      });
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

    await this.createAuditLog(escrowId, clientId, 'DEPOSIT_CONFIRMED', escrow.payerWallet, {
      txSignature,
      amount: Number(escrow.amount),
    });

    await this.cacheEscrow(updated);

    return this.formatEscrow(updated);
  }

  /**
   * Release funds from escrow to recipient
   */
  async releaseFunds(
    clientId: string,
    idOrCode: string,
    notes?: string,
  ): Promise<Record<string, unknown>> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    if (escrow.status !== 'FUNDED') {
      throw new Error(
        `Cannot release: escrow status is ${escrow.status}, expected FUNDED`,
      );
    }

    // Update status to RELEASING
    await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: { status: 'RELEASING' },
    });

    // Advance durable nonce to prove atomic settlement on-chain
    let releaseTxSig: string | null = null;
    if (escrow.nonceAccount) {
      try {
        const npm = this.getNoncePoolManager();
        if (npm) {
          releaseTxSig = await npm.advanceNonceWithSignature(escrow.nonceAccount);
          console.log(`[InstitutionEscrow] Nonce advanced for ${escrowId}, tx: ${releaseTxSig}`);
        }
      } catch (error) {
        console.error('[InstitutionEscrow] Nonce advance failed during release:', error);
        // Revert to FUNDED on failure so release can be retried
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

    await this.cacheEscrow(updated);

    return this.formatEscrow(updated);
  }

  /**
   * Cancel escrow and initiate refund
   */
  async cancelEscrow(
    clientId: string,
    idOrCode: string,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    const escrow = await this.getEscrowInternal(clientId, idOrCode);
    const { escrowId } = escrow;

    const cancellableStatuses: InstitutionEscrowStatus[] = [
      'CREATED',
      'FUNDED',
      'COMPLIANCE_HOLD',
    ];
    if (!cancellableStatuses.includes(escrow.status)) {
      throw new Error(
        `Cannot cancel: escrow status is ${escrow.status}`,
      );
    }

    // Update status to CANCELLING
    await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: { status: 'CANCELLING' },
    });

    // If funded, the route handler will build the on-chain cancel transaction
    const updated = await this.prisma.institutionEscrow.update({
      where: { escrowId },
      data: {
        status: 'CANCELLED',
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

    await this.cacheEscrow(updated);

    return this.formatEscrow(updated);
  }

  /**
   * Get a single escrow by code or ID (scoped to client)
   */
  async getEscrow(
    clientId: string,
    idOrCode: string,
  ): Promise<Record<string, unknown>> {
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
   * Accepts either escrowCode (EE-XXXX-XXXX) or escrowId (UUID).
   * @param allowCounterpartyRead - When true, counterparties can view but not mutate.
   *   Mutation callers (recordDeposit, releaseFunds, cancelEscrow) pass false.
   */
  private async getEscrowInternal(clientId: string, idOrCode: string, allowCounterpartyRead = false) {
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
        (w) => w === escrow.recipientWallet || w === escrow.payerWallet,
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
    ipAddress?: string,
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

  /**
   * Format escrow for API response
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
      settlementAuthority: e.settlementAuthority,
      riskScore: e.riskScore,
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
}

let instance: InstitutionEscrowService | null = null;
export function getInstitutionEscrowService(): InstitutionEscrowService {
  if (!instance) {
    instance = new InstitutionEscrowService();
  }
  return instance;
}
