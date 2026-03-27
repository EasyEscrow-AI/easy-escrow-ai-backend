/**
 * Pool Expiry Monitor Service
 *
 * Scheduled job that runs every 5 minutes to identify and expire transaction
 * pools past their expiration time. Handles refunding members and closing
 * on-chain vaults for expired pools.
 *
 * Pattern: follows InstitutionEscrowExpiryMonitor (singleton, node-cron,
 * leadership, isRunning guard, batch processing, metrics, alerting).
 *
 * Gated by TRANSACTION_POOLS_ENABLED feature flag.
 */

import * as cron from 'node-cron';
import { PrismaClient } from '../generated/prisma';
import { PublicKey } from '@solana/web3.js';
import { alertingService, AlertSeverity } from './alerting.service';
import { redisClient } from '../config/redis';
import { getPoolVaultProgramService } from './pool-vault-program.service';

const LOG_PREFIX = '[PoolExpiryMonitor]';
const POOL_CACHE_PREFIX = 'pool:';

export interface PoolExpiryMonitorConfig {
  /** Cron schedule (default: every 5 minutes) */
  schedule: string;
  /** Batch size for processing expired pools */
  batchSize: number;
  /** Timezone for cron schedule */
  timezone: string;
  /** Delay between on-chain transactions in ms */
  onChainDelayMs: number;
  /** Safety limit for batch iterations */
  maxIterations: number;
}

export class PoolExpiryMonitor {
  private static instance: PoolExpiryMonitor;
  private prisma: PrismaClient;
  private config: PoolExpiryMonitorConfig;
  private job: cron.ScheduledTask | null = null;
  private isLeader: boolean = false;
  private isRunning: boolean = false;

  // Execution tracking
  private lastRun: Date | null = null;
  private totalExecutions: number = 0;
  private totalExpired: number = 0;
  private consecutiveErrors: number = 0;

  private constructor(prisma: PrismaClient, config?: Partial<PoolExpiryMonitorConfig>) {
    this.prisma = prisma;
    this.config = {
      schedule: '*/5 * * * *',
      batchSize: 50,
      timezone: process.env.TZ || 'America/Los_Angeles',
      onChainDelayMs: 2000,
      maxIterations: 50,
      ...config,
    };

    this.determineLeadership();
  }

  static getInstance(
    prisma: PrismaClient,
    config?: Partial<PoolExpiryMonitorConfig>
  ): PoolExpiryMonitor {
    if (!PoolExpiryMonitor.instance) {
      PoolExpiryMonitor.instance = new PoolExpiryMonitor(prisma, config);
    }
    return PoolExpiryMonitor.instance;
  }

  /**
   * Determine if this instance should run cron jobs.
   * In multi-instance deployments, only one instance should run scheduled tasks.
   */
  private determineLeadership(): void {
    const hostname = process.env.HOSTNAME || '';
    const dyno = process.env.DYNO || '';

    if (process.env.SCHEDULER_LEADER === 'true') {
      this.isLeader = true;
      console.log(
        `${LOG_PREFIX} This instance is designated as scheduler leader (SCHEDULER_LEADER=true)`
      );
    } else if (!hostname && !dyno) {
      this.isLeader = true;
      console.log(`${LOG_PREFIX} Running locally - scheduler leader enabled`);
    } else {
      this.isLeader = hostname.includes('web-0') || dyno === 'web.1';
      console.log(`${LOG_PREFIX} Instance: ${hostname || dyno} - Leader: ${this.isLeader}`);
    }
  }

  /**
   * Start the expiry monitor
   */
  start(): void {
    if (!this.isLeader) {
      console.log(`${LOG_PREFIX} Skipping - not leader instance`);
      return;
    }

    if (this.job) {
      console.log(`${LOG_PREFIX} Monitor already running`);
      return;
    }

    this.job = cron.schedule(
      this.config.schedule,
      async () => {
        await this.executeExpiryCheck();
      },
      {
        timezone: this.config.timezone,
      }
    );

    console.log(`${LOG_PREFIX} Monitor started`);
    console.log(`${LOG_PREFIX}    Schedule: ${this.config.schedule}`);
    console.log(`${LOG_PREFIX}    Timezone: ${this.config.timezone}`);
    console.log(`${LOG_PREFIX}    Batch size: ${this.config.batchSize}`);
  }

  /**
   * Stop the monitor
   */
  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log(`${LOG_PREFIX} Monitor stopped`);
    }
  }

  /**
   * Execute expiry check (can be called manually for testing)
   */
  async executeExpiryCheck(): Promise<{
    success: boolean;
    dbOnlyExpired: number;
    onChainExpired: number;
    onChainFailures: number;
    error?: string;
  }> {
    if (this.isRunning) {
      console.log(`${LOG_PREFIX} Skipping execution - previous run still in progress`);
      return {
        success: false,
        dbOnlyExpired: 0,
        onChainExpired: 0,
        onChainFailures: 0,
        error: 'Previous execution still running',
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    console.log(`\n${LOG_PREFIX} Starting expiry check at ${new Date().toISOString()}`);

    try {
      let totalDbOnly = 0;
      let totalOnChain = 0;
      let totalOnChainFailures = 0;
      let iterations = 0;

      while (iterations < this.config.maxIterations) {
        iterations++;

        // Find expired pools in batch
        const expiredPools = await this.prisma.transactionPool.findMany({
          where: {
            status: { in: ['OPEN', 'LOCKED'] },
            expiresAt: {
              not: null,
              lt: new Date(),
            },
          },
          orderBy: { expiresAt: 'asc' },
          take: this.config.batchSize,
        });

        if (expiredPools.length === 0) break;

        console.log(
          `${LOG_PREFIX} Batch ${iterations}: Found ${expiredPools.length} expired pools`
        );

        // Separate into DB-only and on-chain groups
        const dbOnly: typeof expiredPools = [];
        const onChain: typeof expiredPools = [];

        for (const pool of expiredPools) {
          if (pool.poolVaultPda && pool.status === 'LOCKED') {
            onChain.push(pool);
          } else {
            dbOnly.push(pool);
          }
        }

        // Process DB-only batch (OPEN pools without vault, or OPEN pools with no members)
        if (dbOnly.length > 0) {
          const dbOnlyIds = dbOnly.map((p) => p.id);
          const updateResult = await this.prisma.transactionPool.updateMany({
            where: {
              id: { in: dbOnlyIds },
              status: { in: ['OPEN', 'LOCKED'] },
            },
            data: {
              status: 'CANCELLED',
            },
          });

          totalDbOnly += updateResult.count;
          console.log(`${LOG_PREFIX}   DB-only expired: ${updateResult.count}`);

          // Post-expiry actions for DB-only pools
          for (const pool of dbOnly) {
            await this.postExpireActions(pool);
          }
        }

        // Process on-chain pools individually (refund members, close vault)
        for (const pool of onChain) {
          try {
            // Refund all pending members
            const members = await this.prisma.transactionPoolMember.findMany({
              where: { poolId: pool.id, status: { in: ['PENDING'] } },
            });

            const programService = this.getProgramService();

            for (const member of members) {
              try {
                const escrow = await this.prisma.institutionEscrow.findUnique({
                  where: { escrowId: member.escrowId },
                  select: { payerWallet: true, escrowCode: true },
                });

                if (programService && escrow) {
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
                }

                await this.prisma.transactionPoolMember.update({
                  where: { id: member.id },
                  data: { status: 'REMOVED' },
                });
              } catch (memberErr) {
                console.error(
                  `${LOG_PREFIX}   Member refund failed for ${member.id}:`,
                  (memberErr as Error).message
                );
                // On-chain refund failed — record error but don't mark as REMOVED
                try {
                  await this.prisma.transactionPoolMember.update({
                    where: { id: member.id },
                    data: { errorMessage: `Refund failed: ${(memberErr as Error).message}` },
                  });
                } catch {
                  // DB update failure is non-critical here
                }
              }

              // Delay between on-chain transactions
              if (this.config.onChainDelayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, this.config.onChainDelayMs));
              }
            }

            // Close vault
            if (programService) {
              try {
                await programService.closePoolVaultOnChain({
                  poolId: pool.id,
                  poolCode: pool.poolCode,
                });
              } catch (closeErr) {
                console.error(
                  `${LOG_PREFIX}   Close vault failed for ${pool.poolCode}:`,
                  (closeErr as Error).message
                );
              }
            }

            // Update pool status - race condition guard
            try {
              await this.prisma.transactionPool.update({
                where: {
                  id: pool.id,
                  status: { in: ['OPEN', 'LOCKED'] },
                },
                data: { status: 'CANCELLED' },
              });
            } catch (dbErr: any) {
              if (dbErr?.code === 'P2025') {
                console.warn(
                  `${LOG_PREFIX}   Race condition: pool ${pool.id} status changed — skipping DB update`
                );
                continue;
              }
              throw dbErr;
            }

            totalOnChain++;

            await this.postExpireActions(pool);

            // Delay between pools
            if (this.config.onChainDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, this.config.onChainDelayMs));
            }
          } catch (error) {
            totalOnChainFailures++;
            console.error(
              `${LOG_PREFIX}   On-chain cancel failed for pool ${pool.poolCode}:`,
              (error as Error).message
            );
          }
        }

        // If we got less than batch size, we're done
        if (expiredPools.length < this.config.batchSize) break;

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const duration = Date.now() - startTime;

      console.log(`${LOG_PREFIX} Completed at: ${new Date().toISOString()}`);
      console.log(`${LOG_PREFIX}   DB-only expired: ${totalDbOnly}`);
      console.log(`${LOG_PREFIX}   On-chain expired: ${totalOnChain}`);
      console.log(`${LOG_PREFIX}   On-chain failures: ${totalOnChainFailures}`);
      console.log(`${LOG_PREFIX}   Duration: ${duration}ms`);
      console.log(`${LOG_PREFIX}   Batches processed: ${iterations}`);

      // Update tracking metrics
      this.lastRun = new Date();
      this.totalExecutions++;
      this.totalExpired += totalDbOnly + totalOnChain;
      this.consecutiveErrors = 0;

      this.isRunning = false;
      return {
        success: true,
        dbOnlyExpired: totalDbOnly,
        onChainExpired: totalOnChain,
        onChainFailures: totalOnChainFailures,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      console.error(`${LOG_PREFIX} Failed at: ${new Date().toISOString()}`);
      console.error(`${LOG_PREFIX}   Duration: ${duration}ms`);
      console.error(`${LOG_PREFIX}   Error: ${error.message}`);

      this.lastRun = new Date();
      this.totalExecutions++;
      this.consecutiveErrors++;

      if (this.consecutiveErrors >= 3) {
        console.error(`${LOG_PREFIX} ALERT: ${this.consecutiveErrors} consecutive failures!`);
        await alertingService.sendAlert(
          'pool_expiry_monitor_failed',
          AlertSeverity.HIGH,
          'Pool Expiry Monitor Failing',
          `Pool expiry monitor has failed ${this.consecutiveErrors} times consecutively. Last error: ${error.message}`,
          {
            component: 'pool-expiry-monitor',
            consecutiveErrors: this.consecutiveErrors,
            lastError: error.message,
          }
        );
      }

      this.isRunning = false;
      return {
        success: false,
        dbOnlyExpired: 0,
        onChainExpired: 0,
        onChainFailures: 0,
        error: error.message,
      };
    }
  }

  /**
   * Post-expiry actions: audit log, notification, cache invalidation.
   */
  private async postExpireActions(pool: any): Promise<void> {
    // Audit log
    try {
      await this.prisma.transactionPoolAuditLog.create({
        data: {
          poolId: pool.id,
          action: 'POOL_EXPIRED',
          actor: 'system:expiry-monitor',
          details: {
            previousStatus: pool.status,
            memberCount: pool.memberCount,
            totalAmount: Number(pool.totalAmount),
            message: 'Pool expired automatically by system monitor',
          } as any,
        },
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} Audit log failed for ${pool.id}:`, err);
    }

    // Notification (non-critical, lazy-loaded)
    try {
      const { getInstitutionNotificationService } = require('./institution-notification.service');
      await getInstitutionNotificationService().notify({
        clientId: pool.clientId,
        escrowId: pool.id,
        type: 'POOL_CANCELLED',
        title: 'Pool Expired',
        message: `Transaction pool ${pool.poolCode} has expired and been cancelled.${
          pool.memberCount > 0 ? ` ${pool.memberCount} member(s) have been refunded.` : ''
        }`,
        metadata: {
          poolId: pool.id,
          poolCode: pool.poolCode,
          memberCount: pool.memberCount,
          totalAmount: Number(pool.totalAmount),
          previousStatus: pool.status,
        },
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} Notification failed for ${pool.id} (non-critical):`, err);
    }

    // Cache invalidation
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
   * Lazy getter for PoolVaultProgramService
   */
  private getProgramService() {
    try {
      return getPoolVaultProgramService();
    } catch {
      return null;
    }
  }

  /**
   * Get monitor status and metrics
   */
  getStatus(): {
    isLeader: boolean;
    isRunning: boolean;
    isScheduled: boolean;
    lastRun: Date | null;
    totalExecutions: number;
    totalExpired: number;
    consecutiveErrors: number;
    schedule: string;
  } {
    return {
      isLeader: this.isLeader,
      isRunning: this.isRunning,
      isScheduled: this.job !== null,
      lastRun: this.lastRun,
      totalExecutions: this.totalExecutions,
      totalExpired: this.totalExpired,
      consecutiveErrors: this.consecutiveErrors,
      schedule: this.config.schedule,
    };
  }

  /**
   * Manually trigger expiry check (for testing/debugging)
   */
  async triggerManual(): Promise<{
    success: boolean;
    dbOnlyExpired: number;
    onChainExpired: number;
    onChainFailures: number;
    error?: string;
  }> {
    console.log(`${LOG_PREFIX} Manual trigger initiated`);
    return await this.executeExpiryCheck();
  }
}

/**
 * Export singleton getter
 */
export function getPoolExpiryMonitor(
  prisma: PrismaClient,
  config?: Partial<PoolExpiryMonitorConfig>
): PoolExpiryMonitor {
  return PoolExpiryMonitor.getInstance(prisma, config);
}
