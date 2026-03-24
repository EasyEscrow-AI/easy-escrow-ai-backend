/**
 * Institution Escrow Expiry Monitor Service
 *
 * Scheduled job that runs every 10 minutes to identify and expire institution
 * escrows past their expiration time. Handles both DB-only expiry (CREATED,
 * INSUFFICIENT_FUNDS) and on-chain cancel + DB expiry (FUNDED, COMPLIANCE_HOLD
 * with escrowPda).
 *
 * Pattern: follows OfferExpiryScheduler (singleton, node-cron, leadership,
 * isRunning guard, batch processing, metrics, alerting).
 */

import * as cron from 'node-cron';
import { PrismaClient } from '../generated/prisma';
import { PublicKey } from '@solana/web3.js';
import { alertingService, AlertSeverity } from './alerting.service';
import { redisClient } from '../config/redis';
import { getInstitutionEscrowProgramService } from './institution-escrow-program.service';
// Lazy-loaded to avoid import chain to 'resend' which is only installed in production
// import { getInstitutionNotificationService } from './institution-notification.service';
import type { NoncePoolManager } from './noncePoolManager';

const LOG_PREFIX = '[InstitutionEscrowExpiryMonitor]';
const ESCROW_CACHE_PREFIX = 'institution:escrow:';

export interface InstitutionEscrowExpiryConfig {
  /** Cron schedule (default: every 10 minutes) */
  schedule: string;
  /** Batch size for processing expired escrows */
  batchSize: number;
  /** Timezone for cron schedule */
  timezone: string;
  /** Delay between on-chain transactions in ms */
  onChainDelayMs: number;
  /** Safety limit for batch iterations */
  maxIterations: number;
}

export class InstitutionEscrowExpiryMonitor {
  private static instance: InstitutionEscrowExpiryMonitor;
  private prisma: PrismaClient;
  private config: InstitutionEscrowExpiryConfig;
  private job: cron.ScheduledTask | null = null;
  private isLeader: boolean = false;
  private isRunning: boolean = false;

  // Execution tracking
  private lastRun: Date | null = null;
  private totalExecutions: number = 0;
  private totalExpired: number = 0;
  private consecutiveErrors: number = 0;

  private constructor(prisma: PrismaClient, config?: Partial<InstitutionEscrowExpiryConfig>) {
    this.prisma = prisma;
    this.config = {
      schedule: '*/10 * * * *',
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
    config?: Partial<InstitutionEscrowExpiryConfig>
  ): InstitutionEscrowExpiryMonitor {
    if (!InstitutionEscrowExpiryMonitor.instance) {
      InstitutionEscrowExpiryMonitor.instance = new InstitutionEscrowExpiryMonitor(prisma, config);
    }
    return InstitutionEscrowExpiryMonitor.instance;
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

        // Find expired escrows in batch
        const expiredEscrows = await this.prisma.institutionEscrow.findMany({
          where: {
            status: {
              in: ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'INSUFFICIENT_FUNDS'],
            },
            expiresAt: {
              not: null,
              lt: new Date(),
            },
          },
          orderBy: { expiresAt: 'asc' },
          take: this.config.batchSize,
        });

        if (expiredEscrows.length === 0) break;

        console.log(
          `${LOG_PREFIX} Batch ${iterations}: Found ${expiredEscrows.length} expired escrows`
        );

        // Separate into DB-only and on-chain groups
        const dbOnly: typeof expiredEscrows = [];
        const onChain: typeof expiredEscrows = [];

        for (const escrow of expiredEscrows) {
          // Data anomaly: FUNDED escrow should always have an escrowPda
          if (escrow.status === 'FUNDED' && !escrow.escrowPda) {
            console.warn(
              `${LOG_PREFIX}   FUNDED escrow ${escrow.escrowId} missing escrowPda — falling back to DB-only expiry`
            );
          }

          const needsOnChainCancel =
            escrow.status === 'FUNDED' || (escrow.status === 'COMPLIANCE_HOLD' && escrow.escrowPda);
          if (needsOnChainCancel && escrow.escrowPda) {
            onChain.push(escrow);
          } else {
            dbOnly.push(escrow);
          }
        }

        // Process DB-only batch (CREATED, INSUFFICIENT_FUNDS, COMPLIANCE_HOLD without PDA)
        if (dbOnly.length > 0) {
          const dbOnlyIds = dbOnly.map((e) => e.escrowId);
          const updateResult = await this.prisma.institutionEscrow.updateMany({
            where: {
              escrowId: { in: dbOnlyIds },
              // Re-check status to prevent race condition (includes FUNDED for anomalous missing-PDA case)
              status: { in: ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'INSUFFICIENT_FUNDS'] },
            },
            data: {
              status: 'EXPIRED',
              resolvedAt: new Date(),
            },
          });

          totalDbOnly += updateResult.count;
          console.log(`${LOG_PREFIX}   DB-only expired: ${updateResult.count}`);

          // Create audit logs + notifications + cache invalidation for DB-only
          for (const escrow of dbOnly) {
            await this.postExpireActions(escrow);
          }
        }

        // Process on-chain escrows individually
        for (const escrow of onChain) {
          try {
            const programService = getInstitutionEscrowProgramService();
            const usdcMint = programService.getUsdcMintAddress();

            const cancelTxSignature = await programService.cancelEscrowOnChain({
              escrowId: escrow.escrowId,
              payerWallet: new PublicKey(escrow.payerWallet),
              usdcMint,
              escrowCode: escrow.escrowCode,
            });

            console.log(
              `${LOG_PREFIX}   On-chain cancel success for ${
                escrow.escrowCode || escrow.escrowId
              }, tx: ${cancelTxSignature}`
            );

            // Update DB — compound where may throw P2025 if status changed between query and here
            try {
              await this.prisma.institutionEscrow.update({
                where: {
                  escrowId: escrow.escrowId,
                  // Race-condition guard: only update if still in expected status
                  status: { in: ['FUNDED', 'COMPLIANCE_HOLD'] },
                },
                data: {
                  status: 'EXPIRED',
                  cancelTxSignature,
                  resolvedAt: new Date(),
                },
              });
            } catch (dbErr: any) {
              if (dbErr?.code === 'P2025') {
                console.warn(
                  `${LOG_PREFIX}   Race condition: escrow ${escrow.escrowId} status changed (expected FUNDED/COMPLIANCE_HOLD) — skipping DB update`
                );
                continue;
              }
              throw dbErr;
            }

            totalOnChain++;

            // Release nonce if assigned
            if (escrow.nonceAccount) {
              try {
                const npm = this.getNoncePoolManager();
                if (npm) {
                  await npm.releaseNonce(escrow.nonceAccount);
                }
              } catch (err) {
                console.warn(
                  `${LOG_PREFIX} Nonce release failed for ${escrow.escrowId} (non-critical):`,
                  err
                );
              }
            }

            await this.postExpireActions(escrow, cancelTxSignature);

            // Delay between on-chain transactions
            if (this.config.onChainDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, this.config.onChainDelayMs));
            }
          } catch (error) {
            totalOnChainFailures++;
            console.error(
              `${LOG_PREFIX}   On-chain cancel failed for ${escrow.escrowCode || escrow.escrowId}:`,
              (error as Error).message
            );
            // Skip and retry next cycle — never mark EXPIRED if funds aren't returned
          }
        }

        // If we got less than batch size, we're done
        if (expiredEscrows.length < this.config.batchSize) break;

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
          'institution_escrow_expiry_monitor_failed',
          AlertSeverity.HIGH,
          'Institution Escrow Expiry Monitor Failing',
          `Institution escrow expiry monitor has failed ${this.consecutiveErrors} times consecutively. Last error: ${error.message}`,
          {
            component: 'institution-escrow-expiry-monitor',
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
  private async postExpireActions(escrow: any, cancelTxSignature?: string): Promise<void> {
    // Build KYT context for audit log enrichment
    const kytContext = await this.buildKytContext(escrow);

    // Audit log
    try {
      await this.prisma.institutionAuditLog.create({
        data: {
          escrowId: escrow.escrowId,
          clientId: escrow.clientId,
          action: 'ESCROW_EXPIRED',
          actor: 'system:expiry-monitor',
          details: {
            previousStatus: escrow.status,
            cancelTxSignature: cancelTxSignature || null,
            wasFunded: escrow.status === 'FUNDED',
            message: `Escrow expired automatically by system monitor`,
            ...kytContext,
          } as any,
        },
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} Audit log failed for ${escrow.escrowId}:`, err);
    }

    // Notification (non-critical, lazy-loaded to avoid 'resend' import chain)
    try {
      const { getInstitutionNotificationService } = require('./institution-notification.service');
      await getInstitutionNotificationService().notify({
        clientId: escrow.clientId,
        escrowId: escrow.escrowId,
        type: 'ESCROW_EXPIRED',
        title: 'Escrow Expired',
        message: `Escrow ${escrow.escrowCode || escrow.escrowId} has expired.${
          cancelTxSignature ? ' USDC has been returned to payer.' : ''
        }`,
        metadata: {
          amount: Number(escrow.amount),
          corridor: escrow.corridor,
          previousStatus: escrow.status,
          cancelTxSignature: cancelTxSignature || null,
        },
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} Notification failed for ${escrow.escrowId} (non-critical):`, err);
    }

    // Cache invalidation
    try {
      const keys: string[] = [];
      if (escrow.escrowCode) keys.push(`${ESCROW_CACHE_PREFIX}${escrow.escrowCode}`);
      if (escrow.escrowId) keys.push(`${ESCROW_CACHE_PREFIX}${escrow.escrowId}`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch {
      // Cache invalidation failure is non-critical
    }
  }

  /**
   * Build KYT (Know Your Transaction) context for audit log enrichment.
   * Replicates the pattern from InstitutionEscrowService.buildKytContext.
   */
  private async buildKytContext(escrow: any): Promise<Record<string, unknown>> {
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
      escrow.recipientWallet
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
        originator: {
          name: originatorClient?.companyName || null,
          legalName: originatorClient?.legalName || null,
          wallet: escrow.payerWallet,
          country: originatorClient?.country || null,
          registrationCountry: originatorClient?.registrationCountry || null,
          lei: originatorClient?.lei || null,
        },
        beneficiary: {
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

  /**
   * Lazy getter for NoncePoolManager to avoid circular import at load time.
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
 * Export singleton getter — delegates to the class's internal static instance.
 */
export function getInstitutionEscrowExpiryMonitor(
  prisma: PrismaClient,
  config?: Partial<InstitutionEscrowExpiryConfig>
): InstitutionEscrowExpiryMonitor {
  return InstitutionEscrowExpiryMonitor.getInstance(prisma, config);
}
