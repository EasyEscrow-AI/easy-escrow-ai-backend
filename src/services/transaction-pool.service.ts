/**
 * Transaction Pool Service (Core Orchestrator)
 *
 * Orchestrates the full pool lifecycle:
 * 1. Create pool (validate client, generate code, init on-chain vault, store)
 * 2. Add/remove members (validate escrow state, corridor match, update totals)
 * 3. Lock pool (freeze membership, run aggregate compliance)
 * 4. Settle pool (release each member, encrypt receipts, store on-chain)
 * 5. Retry failed members (re-run settlement for FAILED members)
 * 6. Cancel pool (refund each member, close vault)
 * 7. Get/list pools (Redis cache + Prisma)
 * 8. Decrypt receipts (fetch on-chain, decrypt with AES key)
 * 9. Audit log (paginated)
 */

import { PrismaClient } from '../generated/prisma';
import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { PublicKey } from '@solana/web3.js';
import { config } from '../config';
import crypto from 'crypto';
import {
  TransactionPoolStatus,
  PoolMemberStatus,
  PoolSettlementMode,
  PoolAuditAction,
  CreatePoolParams,
  AddPoolMemberParams,
  RemovePoolMemberParams,
  LockPoolParams,
  SettlePoolParams,
  RetryFailedMembersParams,
  CancelPoolParams,
  GetPoolParams,
  GetPoolAuditParams,
  ListPoolsParams,
  PoolSettlementResult,
  PoolMemberSettlementResult,
  PoolComplianceResult,
  ReceiptPlaintext,
  PoolContext,
} from '../types/transaction-pool';
import { getPoolVaultProgramService, PoolVaultProgramService } from './pool-vault-program.service';
import { getInstitutionEscrowService } from './institution-escrow.service';
import { getInstitutionNotificationService } from './institution-notification.service';

const LOG_PREFIX = '[TransactionPoolService]';
const POOL_CACHE_PREFIX = 'pool:';
const POOL_CACHE_TTL = 300; // 5 minutes

const POOL_MAX_MEMBERS = parseInt(process.env.POOL_MAX_MEMBERS || '50', 10);
const POOL_DEFAULT_EXPIRY_HOURS = parseInt(process.env.POOL_DEFAULT_EXPIRY_HOURS || '24', 10);
const POOL_SETTLEMENT_CONCURRENCY = parseInt(process.env.POOL_SETTLEMENT_CONCURRENCY || '5', 10);

export class TransactionPoolService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
  }

  // ─── Pool CRUD ──────────────────────────────────────────────────

  /**
   * Create a new transaction pool
   */
  async createPool(params: CreatePoolParams): Promise<Record<string, unknown>> {
    const {
      clientId,
      corridor,
      settlementMode = PoolSettlementMode.SEQUENTIAL,
      expiryHours = POOL_DEFAULT_EXPIRY_HOURS,
      actorEmail,
    } = params;

    // 1. Validate client is active and verified
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

    // 2. Generate pool ID and human-readable code
    const poolId = crypto.randomUUID();
    const poolCode = this.generatePoolCode();

    // 3. Calculate expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    // 4. Initialize pool vault on-chain
    let poolVaultPda: string | null = null;
    let poolVaultTokenAccount: string | null = null;
    const programService = this.getProgramService();
    if (programService) {
      try {
        if (!config.platform.feeCollectorAddress) {
          throw new Error('Platform feeCollectorAddress is not configured');
        }
        const usdcMint = programService.getUsdcMintAddress();
        const feeCollector = new PublicKey(config.platform.feeCollectorAddress);

        const result = await programService.initPoolVaultOnChain({
          poolId,
          usdcMint,
          feeCollector,
          corridor: corridor || '',
          expiryTimestamp: Math.floor(expiresAt.getTime() / 1000),
          poolCode,
        });

        poolVaultPda = result.poolStatePda;
        poolVaultTokenAccount = result.vaultPda;
        console.log(
          `${LOG_PREFIX} On-chain pool vault init success for ${poolCode}, tx: ${result.txSignature}`
        );
      } catch (error) {
        console.error(`${LOG_PREFIX} On-chain pool vault init failed:`, error);
        throw new Error(`On-chain pool vault initialization failed: ${(error as Error).message}`);
      }
    }

    // 5. Store in Prisma
    const pool = await this.prisma.transactionPool.create({
      data: {
        id: poolId,
        poolCode,
        clientId,
        status: 'OPEN',
        settlementMode,
        corridor: corridor || null,
        totalAmount: 0,
        totalFees: 0,
        memberCount: 0,
        settledCount: 0,
        failedCount: 0,
        poolVaultPda,
        poolVaultTokenAccount,
        expiresAt,
      },
    });

    // 6. Audit log
    await this.createPoolAuditLog(
      poolId,
      null,
      PoolAuditAction.POOL_CREATED,
      actorEmail || client.companyName,
      {
        corridor,
        settlementMode,
        expiryHours,
        poolVaultPda,
        message: `Pool ${poolCode} created`,
      }
    );

    // 7. Notification
    await this.sendNotification(clientId, poolId, 'POOL_CREATED', 'Pool Created', {
      message: `Transaction pool ${poolCode} created. Add escrows to the pool before locking.`,
      poolCode,
      corridor,
    });

    // 8. Cache
    await this.cachePool(pool);

    return this.formatPool(pool);
  }

  /**
   * Add an escrow as a member of a pool
   */
  async addMember(params: AddPoolMemberParams): Promise<Record<string, unknown>> {
    const { clientId, poolIdOrCode, escrowId, actorEmail } = params;

    const pool = await this.resolvePool(clientId, poolIdOrCode);

    if (pool.status !== 'OPEN') {
      throw new Error(`Cannot add member: pool status is ${pool.status}, expected OPEN`);
    }

    if (pool.memberCount >= POOL_MAX_MEMBERS) {
      throw new Error(`Pool has reached maximum member count (${POOL_MAX_MEMBERS})`);
    }

    // Resolve escrow (by ID or code)
    const escrow = await this.resolveEscrow(clientId, escrowId);

    // Validate escrow is FUNDED
    if (escrow.status !== 'FUNDED') {
      throw new Error(
        `Escrow ${escrow.escrowCode || escrow.escrowId} status is ${escrow.status}, expected FUNDED`
      );
    }

    // Validate escrow is not already in a pool
    const existingMember = await this.prisma.transactionPoolMember.findFirst({
      where: {
        escrowId: escrow.escrowId,
        status: { not: 'REMOVED' },
      },
    });
    if (existingMember) {
      throw new Error(
        `Escrow ${escrow.escrowCode || escrow.escrowId} is already in pool ${existingMember.poolId}`
      );
    }

    // Validate corridor match (if pool has a corridor restriction)
    if (pool.corridor && escrow.corridor && pool.corridor !== escrow.corridor) {
      throw new Error(`Corridor mismatch: pool is ${pool.corridor}, escrow is ${escrow.corridor}`);
    }

    // Atomic: create member + update pool totals
    const [member] = await this.prisma.$transaction([
      this.prisma.transactionPoolMember.create({
        data: {
          poolId: pool.id,
          escrowId: escrow.escrowId,
          status: 'PENDING',
          amount: Number(escrow.amount),
          platformFee: Number(escrow.platformFee),
          corridor: escrow.corridor,
          sequenceNumber: pool.memberCount + 1,
        },
      }),
      this.prisma.transactionPool.update({
        where: { id: pool.id },
        data: {
          totalAmount: { increment: Number(escrow.amount) },
          totalFees: { increment: Number(escrow.platformFee) },
          memberCount: { increment: 1 },
        },
      }),
    ]);

    await this.createPoolAuditLog(
      pool.id,
      escrow.escrowId,
      PoolAuditAction.MEMBER_ADDED,
      actorEmail || 'system',
      {
        memberId: member.id,
        escrowCode: escrow.escrowCode,
        amount: Number(escrow.amount),
        corridor: escrow.corridor,
        message: `Escrow ${escrow.escrowCode || escrow.escrowId} added to pool`,
      }
    );

    await this.invalidatePoolCache(pool);

    // Re-fetch pool with updated totals
    const updatedPool = await this.prisma.transactionPool.findUnique({
      where: { id: pool.id },
      include: { members: { where: { status: { not: 'REMOVED' } } } },
    });

    if (!updatedPool) {
      throw new Error(`Pool ${pool.id} not found after update`);
    }

    return this.formatPool(updatedPool, updatedPool.members);
  }

  /**
   * Remove a member from a pool
   */
  async removeMember(params: RemovePoolMemberParams): Promise<Record<string, unknown>> {
    const { clientId, poolIdOrCode, memberId, actorEmail } = params;

    const pool = await this.resolvePool(clientId, poolIdOrCode);

    if (pool.status !== 'OPEN') {
      throw new Error(`Cannot remove member: pool status is ${pool.status}, expected OPEN`);
    }

    const member = await this.prisma.transactionPoolMember.findUnique({
      where: { id: memberId },
    });
    if (!member || member.poolId !== pool.id) {
      throw new Error(`Member ${memberId} not found in pool ${pool.poolCode}`);
    }
    if (member.status === 'REMOVED') {
      throw new Error(`Member ${memberId} is already removed`);
    }

    // Atomic: mark member removed + update pool totals
    await this.prisma.$transaction([
      this.prisma.transactionPoolMember.update({
        where: { id: memberId },
        data: { status: 'REMOVED' },
      }),
      this.prisma.transactionPool.update({
        where: { id: pool.id },
        data: {
          totalAmount: { decrement: Number(member.amount) },
          totalFees: { decrement: Number(member.platformFee) },
          memberCount: { decrement: 1 },
        },
      }),
    ]);

    await this.createPoolAuditLog(
      pool.id,
      member.escrowId,
      PoolAuditAction.MEMBER_REMOVED,
      actorEmail || 'system',
      {
        memberId,
        amount: Number(member.amount),
        message: `Member ${memberId} removed from pool`,
      }
    );

    await this.invalidatePoolCache(pool);

    const updatedPool = await this.prisma.transactionPool.findUnique({
      where: { id: pool.id },
      include: { members: { where: { status: { not: 'REMOVED' } } } },
    });

    if (!updatedPool) {
      throw new Error(`Pool ${pool.id} not found after update`);
    }

    return this.formatPool(updatedPool, updatedPool.members);
  }

  /**
   * Lock a pool — freeze membership and run aggregate compliance check
   */
  async lockPool(params: LockPoolParams): Promise<Record<string, unknown>> {
    const { clientId, poolIdOrCode, actorEmail } = params;

    const pool = await this.resolvePool(clientId, poolIdOrCode);

    if (pool.status !== 'OPEN') {
      throw new Error(`Cannot lock: pool status is ${pool.status}, expected OPEN`);
    }

    if (pool.memberCount === 0) {
      throw new Error('Cannot lock: pool has no members');
    }

    // Run aggregate compliance check
    const complianceResult = await this.runPoolComplianceCheck(pool.id);

    await this.createPoolAuditLog(
      pool.id,
      null,
      PoolAuditAction.COMPLIANCE_CHECK,
      'EasyEscrow AI Assistant',
      {
        passed: complianceResult.passed,
        aggregateRiskScore: complianceResult.aggregateRiskScore,
        memberRiskScores: complianceResult.memberRiskScores,
        flags: complianceResult.flags,
        message: complianceResult.passed
          ? `Compliance passed — aggregate risk score ${complianceResult.aggregateRiskScore}/100`
          : `Compliance flagged — aggregate risk score ${complianceResult.aggregateRiskScore}/100`,
      }
    );

    const updatedPool = await this.prisma.transactionPool.update({
      where: { id: pool.id },
      data: {
        status: 'LOCKED',
        lockedAt: new Date(),
        poolRiskScore: complianceResult.aggregateRiskScore,
        compliancePassed: complianceResult.passed,
      },
    });

    await this.createPoolAuditLog(
      pool.id,
      null,
      PoolAuditAction.POOL_LOCKED,
      actorEmail || 'system',
      {
        memberCount: pool.memberCount,
        totalAmount: Number(pool.totalAmount),
        compliancePassed: complianceResult.passed,
        message: `Pool locked with ${pool.memberCount} members, total ${Number(
          pool.totalAmount
        )} USDC`,
      }
    );

    await this.sendNotification(clientId, pool.id, 'POOL_LOCKED', 'Pool Locked', {
      message: `Pool ${pool.poolCode} locked with ${pool.memberCount} members. Ready for settlement.`,
      poolCode: pool.poolCode,
      memberCount: pool.memberCount,
      totalAmount: Number(pool.totalAmount),
    });

    await this.invalidatePoolCache(pool);

    const members = await this.prisma.transactionPoolMember.findMany({
      where: { poolId: pool.id, status: { not: 'REMOVED' } },
    });

    return this.formatPool(updatedPool, members);
  }

  /**
   * Settle a pool — release funds for each member
   */
  async settlePool(params: SettlePoolParams): Promise<PoolSettlementResult> {
    const { clientId, poolIdOrCode, notes, actorEmail } = params;

    const pool = await this.resolvePool(clientId, poolIdOrCode);

    if (pool.status !== 'LOCKED') {
      throw new Error(`Cannot settle: pool status is ${pool.status}, expected LOCKED`);
    }

    // Validate compliance passed
    if (pool.compliancePassed === false) {
      throw new Error('Cannot settle: pool compliance check did not pass');
    }

    // Transition to SETTLING
    await this.prisma.transactionPool.update({
      where: { id: pool.id },
      data: { status: 'SETTLING' },
    });

    await this.createPoolAuditLog(
      pool.id,
      null,
      PoolAuditAction.POOL_SETTLING,
      actorEmail || 'system',
      {
        notes,
        settlementMode: pool.settlementMode,
        message: `Pool settlement started (${pool.settlementMode} mode)`,
      }
    );

    // Fetch active members
    const members = await this.prisma.transactionPoolMember.findMany({
      where: { poolId: pool.id, status: 'PENDING' },
      orderBy: { sequenceNumber: 'asc' },
    });

    const results: PoolMemberSettlementResult[] = [];
    let settledCount = 0;
    let failedCount = 0;

    if (pool.settlementMode === 'PARALLEL') {
      // Parallel settlement with concurrency cap
      const concurrency = POOL_SETTLEMENT_CONCURRENCY;
      for (let i = 0; i < members.length; i += concurrency) {
        const batch = members.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
          batch.map((member) => this.settleSingleMember(pool, member, actorEmail))
        );

        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (result.value.status === PoolMemberStatus.SETTLED) settledCount++;
            else failedCount++;
          } else {
            failedCount++;
            results.push({
              memberId: batch[j].id,
              escrowId: batch[j].escrowId,
              status: PoolMemberStatus.FAILED,
              errorMessage: result.reason?.message || 'Unknown error',
            });
          }
        }
      }
    } else {
      // Sequential settlement
      for (const member of members) {
        try {
          const result = await this.settleSingleMember(pool, member, actorEmail);
          results.push(result);
          if (result.status === PoolMemberStatus.SETTLED) settledCount++;
          else failedCount++;
        } catch (error) {
          failedCount++;
          results.push({
            memberId: member.id,
            escrowId: member.escrowId,
            status: PoolMemberStatus.FAILED,
            errorMessage: (error as Error).message,
          });
        }
      }
    }

    // Determine final pool status
    let finalStatus: TransactionPoolStatus;
    if (failedCount === 0) {
      finalStatus = TransactionPoolStatus.SETTLED;
    } else if (settledCount === 0) {
      finalStatus = TransactionPoolStatus.FAILED;
    } else {
      finalStatus = TransactionPoolStatus.PARTIAL_FAIL;
    }

    const updatedPool = await this.prisma.transactionPool.update({
      where: { id: pool.id },
      data: {
        status: finalStatus,
        settledCount,
        failedCount,
        settledAt: finalStatus === TransactionPoolStatus.SETTLED ? new Date() : null,
        settledBy: actorEmail || 'system',
      },
    });

    const auditAction =
      finalStatus === TransactionPoolStatus.SETTLED
        ? PoolAuditAction.POOL_SETTLED
        : finalStatus === TransactionPoolStatus.FAILED
        ? PoolAuditAction.POOL_FAILED
        : PoolAuditAction.POOL_PARTIAL_FAIL;

    await this.createPoolAuditLog(pool.id, null, auditAction, actorEmail || 'system', {
      settledCount,
      failedCount,
      totalMembers: members.length,
      message: `Pool settlement ${finalStatus}: ${settledCount} settled, ${failedCount} failed`,
    });

    // Notification
    const notifType =
      finalStatus === TransactionPoolStatus.SETTLED ? 'POOL_SETTLED' : 'POOL_FAILED';
    await this.sendNotification(
      clientId,
      pool.id,
      notifType as any,
      finalStatus === TransactionPoolStatus.SETTLED ? 'Pool Settled' : 'Pool Settlement Issue',
      {
        message:
          finalStatus === TransactionPoolStatus.SETTLED
            ? `Pool ${pool.poolCode} fully settled: ${settledCount} payments completed.`
            : `Pool ${pool.poolCode} settlement: ${settledCount} settled, ${failedCount} failed.`,
        poolCode: pool.poolCode,
        settledCount,
        failedCount,
      }
    );

    await this.invalidatePoolCache(pool);

    return {
      poolId: pool.id,
      poolCode: pool.poolCode,
      status: finalStatus,
      totalMembers: members.length,
      settledCount,
      failedCount,
      members: results,
      settledAt: updatedPool.settledAt || undefined,
    };
  }

  /**
   * Retry settlement for FAILED members only
   */
  async retryFailedMembers(params: RetryFailedMembersParams): Promise<PoolSettlementResult> {
    const { clientId, poolIdOrCode, actorEmail } = params;

    const pool = await this.resolvePool(clientId, poolIdOrCode);

    if (pool.status !== 'PARTIAL_FAIL' && pool.status !== 'FAILED') {
      throw new Error(
        `Cannot retry: pool status is ${pool.status}, expected PARTIAL_FAIL or FAILED`
      );
    }

    // Transition to SETTLING
    await this.prisma.transactionPool.update({
      where: { id: pool.id },
      data: { status: 'SETTLING' },
    });

    const failedMembers = await this.prisma.transactionPoolMember.findMany({
      where: { poolId: pool.id, status: 'FAILED' },
      orderBy: { sequenceNumber: 'asc' },
    });

    if (failedMembers.length === 0) {
      throw new Error('No failed members to retry');
    }

    await this.createPoolAuditLog(
      pool.id,
      null,
      PoolAuditAction.RETRY_SETTLEMENT,
      actorEmail || 'system',
      {
        failedCount: failedMembers.length,
        message: `Retrying ${failedMembers.length} failed member(s)`,
      }
    );

    const results: PoolMemberSettlementResult[] = [];
    let newSettled = 0;
    let newFailed = 0;

    for (const member of failedMembers) {
      try {
        // Increment retry count
        await this.prisma.transactionPoolMember.update({
          where: { id: member.id },
          data: { retryCount: { increment: 1 } },
        });

        const result = await this.settleSingleMember(pool, member, actorEmail);
        results.push(result);
        if (result.status === PoolMemberStatus.SETTLED) newSettled++;
        else newFailed++;
      } catch (error) {
        newFailed++;
        results.push({
          memberId: member.id,
          escrowId: member.escrowId,
          status: PoolMemberStatus.FAILED,
          errorMessage: (error as Error).message,
        });
      }
    }

    // Recalculate totals
    const totalSettled = pool.settledCount + newSettled;
    const remainingFailed = await this.prisma.transactionPoolMember.count({
      where: { poolId: pool.id, status: 'FAILED' },
    });

    let finalStatus: TransactionPoolStatus;
    if (remainingFailed === 0) {
      finalStatus = TransactionPoolStatus.SETTLED;
    } else if (totalSettled === 0) {
      finalStatus = TransactionPoolStatus.FAILED;
    } else {
      finalStatus = TransactionPoolStatus.PARTIAL_FAIL;
    }

    const updatedPool = await this.prisma.transactionPool.update({
      where: { id: pool.id },
      data: {
        status: finalStatus,
        settledCount: totalSettled,
        failedCount: remainingFailed,
        settledAt: finalStatus === TransactionPoolStatus.SETTLED ? new Date() : null,
      },
    });

    await this.invalidatePoolCache(pool);

    return {
      poolId: pool.id,
      poolCode: pool.poolCode,
      status: finalStatus,
      totalMembers: pool.memberCount,
      settledCount: totalSettled,
      failedCount: remainingFailed,
      members: results,
      settledAt: updatedPool.settledAt || undefined,
    };
  }

  /**
   * Cancel a pool — refund each member and close vault
   */
  async cancelPool(params: CancelPoolParams): Promise<Record<string, unknown>> {
    const { clientId, poolIdOrCode, reason, actorEmail } = params;

    const pool = await this.resolvePool(clientId, poolIdOrCode);

    const cancellableStatuses = ['OPEN', 'LOCKED'];
    if (!cancellableStatuses.includes(pool.status)) {
      throw new Error(`Cannot cancel: pool status is ${pool.status}`);
    }

    // Get active members
    const members = await this.prisma.transactionPoolMember.findMany({
      where: { poolId: pool.id, status: { in: ['PENDING'] } },
    });

    // Refund each member via on-chain cancel
    const programService = this.getProgramService();
    for (const member of members) {
      try {
        const escrow = await this.prisma.institutionEscrow.findUnique({
          where: { escrowId: member.escrowId },
        });

        if (programService && escrow) {
          try {
            const usdcMint = programService.getUsdcMintAddress();
            const refundAmount = (Number(member.amount) + Number(member.platformFee)) * 1_000_000;
            await programService.cancelPoolMemberOnChain({
              poolId: pool.id,
              refundAmountMicroUsdc: Math.round(refundAmount).toString(),
              payerWallet: new PublicKey(escrow.payerWallet),
              usdcMint,
              poolCode: pool.poolCode,
              escrowCode: escrow.escrowCode,
            });
          } catch (onChainErr) {
            console.error(
              `${LOG_PREFIX} On-chain cancel failed for member ${member.id}:`,
              (onChainErr as Error).message
            );
          }
        }

        await this.prisma.transactionPoolMember.update({
          where: { id: member.id },
          data: { status: 'REMOVED' },
        });

        await this.createPoolAuditLog(
          pool.id,
          member.escrowId,
          PoolAuditAction.MEMBER_REFUNDED,
          'system',
          {
            memberId: member.id,
            amount: Number(member.amount),
            message: `Member ${member.id} refunded during pool cancellation`,
          }
        );
      } catch (error) {
        console.error(
          `${LOG_PREFIX} Failed to refund member ${member.id}:`,
          (error as Error).message
        );
      }
    }

    // Close vault on-chain
    if (programService && pool.poolVaultPda) {
      try {
        await programService.closePoolVaultOnChain({
          poolId: pool.id,
          poolCode: pool.poolCode,
        });
      } catch (error) {
        console.error(`${LOG_PREFIX} Close pool vault failed:`, (error as Error).message);
      }
    }

    const updatedPool = await this.prisma.transactionPool.update({
      where: { id: pool.id },
      data: { status: 'CANCELLED' },
    });

    await this.createPoolAuditLog(
      pool.id,
      null,
      PoolAuditAction.POOL_CANCELLED,
      actorEmail || 'system',
      {
        reason,
        refundedMembers: members.length,
        message: reason ? `Pool cancelled — ${reason}` : 'Pool cancelled',
      }
    );

    await this.sendNotification(clientId, pool.id, 'POOL_CANCELLED', 'Pool Cancelled', {
      message: `Pool ${pool.poolCode} has been cancelled.${reason ? ` Reason: ${reason}` : ''} ${
        members.length
      } member(s) refunded.`,
      poolCode: pool.poolCode,
      reason,
    });

    await this.invalidatePoolCache(pool);

    return this.formatPool(updatedPool);
  }

  // ─── Read Operations ────────────────────────────────────────────

  /**
   * Get a single pool by ID or code (cache-first)
   */
  async getPool(params: GetPoolParams): Promise<Record<string, unknown>> {
    const { clientId, poolIdOrCode } = params;

    // Try cache first
    const cached = await this.getCachedPool(poolIdOrCode);
    if (cached) {
      // Verify ownership
      if ((cached as any).clientId !== clientId) {
        throw new Error('Access denied: pool belongs to another client');
      }
      return cached;
    }

    const pool = await this.resolvePool(clientId, poolIdOrCode);

    const members = await this.prisma.transactionPoolMember.findMany({
      where: { poolId: pool.id, status: { not: 'REMOVED' } },
      orderBy: { sequenceNumber: 'asc' },
    });

    const formatted = this.formatPool(pool, members);
    await this.cachePool(pool);
    return formatted;
  }

  /**
   * List pools for a client with filters
   */
  async listPools(params: ListPoolsParams): Promise<{
    pools: Record<string, unknown>[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const { clientId, status, corridor, limit = 20, offset = 0 } = params;

    const where: Record<string, unknown> = { clientId };
    if (status) where.status = status;
    if (corridor) where.corridor = corridor;

    const [pools, total] = await Promise.all([
      this.prisma.transactionPool.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { members: { where: { status: { not: 'REMOVED' } } } },
      }),
      this.prisma.transactionPool.count({ where: where as any }),
    ]);

    return {
      pools: pools.map((p: any) => this.formatPool(p, p.members)),
      total,
      limit,
      offset,
    };
  }

  /**
   * Decrypt an on-chain receipt for a pool member
   */
  async decryptReceipt(
    clientId: string,
    poolIdOrCode: string,
    escrowId: string
  ): Promise<ReceiptPlaintext> {
    const pool = await this.resolvePool(clientId, poolIdOrCode);

    // Find the member
    const member = await this.prisma.transactionPoolMember.findFirst({
      where: { poolId: pool.id, escrowId },
    });
    if (!member) {
      throw new Error(`Escrow ${escrowId} is not a member of pool ${pool.poolCode}`);
    }
    if (member.status !== 'SETTLED') {
      throw new Error(`Member has not been settled yet (status: ${member.status})`);
    }

    const programService = this.getProgramService();
    if (!programService) {
      throw new Error('Pool vault program service not available');
    }

    const receiptData = await programService.fetchPoolReceipt(pool.id, member.escrowId);
    if (!receiptData.exists || !receiptData.encryptedPayload) {
      throw new Error('On-chain receipt not found');
    }

    return programService.decryptReceipt(receiptData.encryptedPayload);
  }

  /**
   * Get paginated audit log for a pool
   */
  async getPoolAudit(params: GetPoolAuditParams): Promise<{
    logs: Record<string, unknown>[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const { clientId, poolIdOrCode, limit = 20, offset = 0 } = params;

    const pool = await this.resolvePool(clientId, poolIdOrCode);

    const [logs, total] = await Promise.all([
      this.prisma.transactionPoolAuditLog.findMany({
        where: { poolId: pool.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.transactionPoolAuditLog.count({
        where: { poolId: pool.id },
      }),
    ]);

    return {
      logs: logs.map((log: any) => ({
        id: log.id,
        poolId: log.poolId,
        escrowId: log.escrowId,
        action: log.action,
        actor: log.actor,
        details: log.details,
        createdAt: log.createdAt,
      })),
      total,
      limit,
      offset,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────

  /**
   * Resolve a pool by ID or code, validating client ownership
   */
  private async resolvePool(clientId: string, poolIdOrCode: string) {
    const isCode = poolIdOrCode.startsWith('TP-');
    const pool = await this.prisma.transactionPool.findUnique({
      where: isCode ? { poolCode: poolIdOrCode } : { id: poolIdOrCode },
    });

    if (!pool) {
      throw new Error(`Pool not found: ${poolIdOrCode}`);
    }
    if (pool.clientId !== clientId) {
      throw new Error('Access denied: pool belongs to another client');
    }

    return pool;
  }

  /**
   * Resolve an escrow by ID or code, validating client ownership
   */
  private async resolveEscrow(clientId: string, idOrCode: string) {
    const isCode = idOrCode.startsWith('EE-');
    const escrow = await this.prisma.institutionEscrow.findUnique({
      where: isCode ? { escrowCode: idOrCode } : { escrowId: idOrCode },
    });

    if (!escrow) {
      throw new Error(`Escrow not found: ${idOrCode}`);
    }
    if (escrow.clientId !== clientId) {
      throw new Error('Access denied: escrow belongs to another client');
    }

    return escrow;
  }

  /**
   * Generate a human-readable pool code in TP-XXX-XXX format.
   * Uses uppercase alphanumeric characters (excludes ambiguous: 0/O, 1/I/L).
   */
  private generatePoolCode(): string {
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 30 chars
    const bytes = crypto.randomBytes(6);
    let code = 'TP-';
    for (let i = 0; i < 6; i++) {
      if (i === 3) code += '-';
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }

  /**
   * Cache a pool record in Redis (keyed by both poolCode and id)
   */
  private async cachePool(pool: Record<string, unknown>): Promise<void> {
    try {
      const data = JSON.stringify(pool);
      const p = pool as any;
      await Promise.all([
        redisClient.set(`${POOL_CACHE_PREFIX}${p.poolCode}`, data, 'EX', POOL_CACHE_TTL),
        redisClient.set(`${POOL_CACHE_PREFIX}${p.id}`, data, 'EX', POOL_CACHE_TTL),
      ]);
    } catch {
      // Cache write failure is non-critical
    }
  }

  /**
   * Get a cached pool from Redis
   */
  private async getCachedPool(idOrCode: string): Promise<Record<string, unknown> | null> {
    try {
      const data = await redisClient.get(`${POOL_CACHE_PREFIX}${idOrCode}`);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Cache read failure is non-critical
    }
    return null;
  }

  /**
   * Invalidate pool cache (both keys)
   */
  private async invalidatePoolCache(pool: any): Promise<void> {
    try {
      const keys: string[] = [];
      if (pool.poolCode) keys.push(`${POOL_CACHE_PREFIX}${pool.poolCode}`);
      if (pool.id) keys.push(`${POOL_CACHE_PREFIX}${pool.id}`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch {
      // Cache invalidation failure is non-critical
    }
  }

  /**
   * Create a pool audit log entry
   */
  private async createPoolAuditLog(
    poolId: string,
    escrowId: string | null,
    action: PoolAuditAction | string,
    actor: string,
    details: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    try {
      await this.prisma.transactionPoolAuditLog.create({
        data: {
          poolId,
          escrowId,
          action: String(action),
          actor,
          details: details as any,
          ipAddress,
        },
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to create audit log:`, error);
    }
  }

  /**
   * Send a notification (non-critical, lazy-loaded)
   */
  private async sendNotification(
    clientId: string,
    poolId: string,
    type: any,
    title: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    try {
      const notificationService = getInstitutionNotificationService();
      await notificationService.notify({
        clientId,
        escrowId: poolId,
        type,
        title,
        message: metadata.message as string,
        metadata,
      });
    } catch (error) {
      console.warn(`${LOG_PREFIX} Notification failed (non-critical):`, error);
    }
  }

  /**
   * Run aggregate compliance check across all pool members
   */
  private async runPoolComplianceCheck(poolId: string): Promise<PoolComplianceResult> {
    const members = await this.prisma.transactionPoolMember.findMany({
      where: { poolId, status: { not: 'REMOVED' } },
    });

    const memberRiskScores: Array<{ escrowId: string; riskScore: number }> = [];
    const flags: string[] = [];

    // Batch-fetch all escrows in a single query to avoid N+1
    const escrowIds = members.map((m) => m.escrowId);
    const escrows = await this.prisma.institutionEscrow.findMany({
      where: { escrowId: { in: escrowIds } },
      select: { riskScore: true, escrowId: true, escrowCode: true, corridor: true },
    });
    const escrowMap = new Map(escrows.map((e) => [e.escrowId, e]));

    for (const member of members) {
      const escrow = escrowMap.get(member.escrowId);

      const riskScore = escrow?.riskScore ? Number(escrow.riskScore) : 0;
      memberRiskScores.push({ escrowId: member.escrowId, riskScore });

      if (riskScore >= 75) {
        flags.push(
          `High risk member: ${escrow?.escrowCode || member.escrowId} (score: ${riskScore})`
        );
      }
    }

    // Aggregate risk score: weighted average
    const totalWeight = memberRiskScores.reduce((sum, m) => sum + m.riskScore, 0);
    const aggregateRiskScore =
      memberRiskScores.length > 0 ? Math.round(totalWeight / memberRiskScores.length) : 0;

    // Pool-level checks
    if (members.length > 20) {
      flags.push(`Large pool: ${members.length} members`);
    }

    const totalAmount = members.reduce((sum, m) => sum + Number(m.amount), 0);
    if (totalAmount > 100000) {
      flags.push(`High value pool: ${totalAmount} USDC`);
    }

    const passed = aggregateRiskScore < 75 && !flags.some((f) => f.startsWith('High risk member'));

    return {
      passed,
      aggregateRiskScore,
      memberRiskScores,
      flags,
    };
  }

  /**
   * Settle a single pool member — release funds, create receipt, update status
   */
  private async settleSingleMember(
    pool: any,
    member: any,
    actorEmail?: string
  ): Promise<PoolMemberSettlementResult> {
    const escrow = await this.prisma.institutionEscrow.findUnique({
      where: { escrowId: member.escrowId },
    });

    if (!escrow) {
      throw new Error(`Escrow not found: ${member.escrowId}`);
    }

    // Mark member as SETTLING
    await this.prisma.transactionPoolMember.update({
      where: { id: member.id },
      data: { status: 'SETTLING' },
    });

    await this.createPoolAuditLog(
      pool.id,
      member.escrowId,
      PoolAuditAction.MEMBER_SETTLING,
      'system',
      {
        memberId: member.id,
        amount: Number(member.amount),
        message: `Settling member ${member.id}`,
      }
    );

    try {
      // Release funds via escrow service with pool context
      const poolContext: PoolContext = {
        poolId: pool.id,
        memberId: member.id,
        skipOnChainRelease: false,
      };

      const escrowService = getInstitutionEscrowService();
      await escrowService.releaseFunds(
        escrow.clientId,
        escrow.escrowId,
        undefined,
        actorEmail || 'system:pool-settlement',
        undefined,
        poolContext
      );

      // Get the release tx signature from the updated escrow
      const updatedEscrow = await this.prisma.institutionEscrow.findUnique({
        where: { escrowId: member.escrowId },
        select: { releaseTxSignature: true },
      });

      const releaseTxSignature = updatedEscrow?.releaseTxSignature || undefined;

      // Create on-chain receipt
      let receiptPda: string | undefined;
      let commitmentHash: string | undefined;
      const programService = this.getProgramService();

      if (programService && releaseTxSignature) {
        try {
          const receiptPlaintext: ReceiptPlaintext = {
            poolId: pool.id,
            poolCode: pool.poolCode,
            escrowId: escrow.escrowId,
            escrowCode: escrow.escrowCode,
            amount: Number(escrow.amount).toFixed(6),
            corridor: escrow.corridor || '',
            payerWallet: escrow.payerWallet,
            recipientWallet: escrow.recipientWallet || '',
            releaseTxSignature,
            settledAt: new Date().toISOString(),
          };

          const commitment = programService.computeCommitment(receiptPlaintext);
          const encryptedReceipt = programService.encryptReceipt(receiptPlaintext);

          if (!config.platform.feeCollectorAddress) {
            throw new Error('Platform feeCollectorAddress is not configured');
          }
          const usdcMint = programService.getUsdcMintAddress();
          const feeCollector = new PublicKey(config.platform.feeCollectorAddress);
          const amountMicroUsdc = programService.decimalToMicroUsdc(Number(escrow.amount));
          const feeMicroUsdc = programService.decimalToMicroUsdc(Number(escrow.platformFee));

          const receiptResult = await programService.releasePoolMemberOnChain({
            poolId: pool.id,
            escrowId: member.escrowId,
            recipientWallet: new PublicKey(escrow.recipientWallet!),
            usdcMint,
            amountMicroUsdc,
            commitmentHash: commitment,
            encryptedReceipt,
            poolCode: pool.poolCode,
            escrowCode: escrow.escrowCode,
          });

          receiptPda = receiptResult.receiptPda;
          commitmentHash = commitment.toString('hex');

          await this.createPoolAuditLog(
            pool.id,
            member.escrowId,
            PoolAuditAction.RECEIPT_CREATED,
            'system',
            {
              memberId: member.id,
              receiptPda,
              commitmentHash,
              message: `On-chain receipt created for member ${member.id}`,
            }
          );
        } catch (receiptErr) {
          console.error(
            `${LOG_PREFIX} On-chain receipt creation failed for member ${member.id}:`,
            (receiptErr as Error).message
          );
          // Receipt failure is non-critical — settlement already succeeded
        }
      }

      // Mark member as SETTLED
      await this.prisma.transactionPoolMember.update({
        where: { id: member.id },
        data: {
          status: 'SETTLED',
          releaseTxSignature: releaseTxSignature || null,
          releasedAt: new Date(),
          receiptPda: receiptPda || null,
          commitmentHash: commitmentHash || null,
        },
      });

      await this.createPoolAuditLog(
        pool.id,
        member.escrowId,
        PoolAuditAction.MEMBER_SETTLED,
        'system',
        {
          memberId: member.id,
          releaseTxSignature,
          receiptPda,
          amount: Number(member.amount),
          message: `Member ${member.id} settled successfully`,
        }
      );

      return {
        memberId: member.id,
        escrowId: member.escrowId,
        status: PoolMemberStatus.SETTLED,
        releaseTxSignature,
        receiptPda,
        commitmentHash,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Mark member as FAILED
      await this.prisma.transactionPoolMember.update({
        where: { id: member.id },
        data: {
          status: 'FAILED',
          errorMessage,
        },
      });

      await this.createPoolAuditLog(
        pool.id,
        member.escrowId,
        PoolAuditAction.MEMBER_FAILED,
        'system',
        {
          memberId: member.id,
          error: errorMessage,
          message: `Member ${member.id} settlement failed: ${errorMessage}`,
        }
      );

      return {
        memberId: member.id,
        escrowId: member.escrowId,
        status: PoolMemberStatus.FAILED,
        errorMessage,
      };
    }
  }

  /**
   * Lazy getter for PoolVaultProgramService
   */
  private getProgramService(): PoolVaultProgramService | null {
    try {
      return getPoolVaultProgramService();
    } catch (err) {
      console.warn(`${LOG_PREFIX} PoolVaultProgramService not available:`, (err as Error).message);
      return null;
    }
  }

  /**
   * Format a pool for API response
   */
  private formatPool(pool: any, members?: any[]): Record<string, unknown> {
    return {
      id: pool.id,
      poolCode: pool.poolCode,
      clientId: pool.clientId,
      status: pool.status,
      statusLabel: this.getStatusLabel(pool.status),
      settlementMode: pool.settlementMode,
      corridor: pool.corridor,
      totalAmount: Number(pool.totalAmount),
      totalFees: Number(pool.totalFees),
      memberCount: pool.memberCount,
      settledCount: pool.settledCount,
      failedCount: pool.failedCount,
      poolVaultPda: pool.poolVaultPda,
      poolRiskScore: pool.poolRiskScore ? Number(pool.poolRiskScore) : null,
      compliancePassed: pool.compliancePassed,
      settledBy: pool.settledBy,
      settledAt: pool.settledAt,
      lockedAt: pool.lockedAt,
      createdAt: pool.createdAt,
      updatedAt: pool.updatedAt,
      expiresAt: pool.expiresAt,
      members: members
        ? members.map((m: any) => ({
            id: m.id,
            escrowId: m.escrowId,
            status: m.status,
            amount: Number(m.amount),
            platformFee: Number(m.platformFee),
            corridor: m.corridor,
            releaseTxSignature: m.releaseTxSignature,
            releasedAt: m.releasedAt,
            receiptPda: m.receiptPda,
            commitmentHash: m.commitmentHash,
            errorMessage: m.errorMessage,
            retryCount: m.retryCount,
            sequenceNumber: m.sequenceNumber,
            addedAt: m.addedAt,
          }))
        : undefined,
    };
  }

  private static STATUS_LABELS: Record<string, string> = {
    OPEN: 'Open',
    LOCKED: 'Locked — Ready for Settlement',
    SETTLING: 'Settling',
    SETTLED: 'Settled',
    PARTIAL_FAIL: 'Partially Failed',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
  };

  private getStatusLabel(status: string): string {
    return TransactionPoolService.STATUS_LABELS[status] || status;
  }
}

let instance: TransactionPoolService | null = null;
export function getTransactionPoolService(prismaClient?: PrismaClient): TransactionPoolService {
  if (!instance) {
    instance = new TransactionPoolService(prismaClient);
  }
  return instance;
}
