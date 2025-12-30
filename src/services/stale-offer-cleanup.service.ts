/**
 * Stale Offer Cleanup Scheduler Service
 *
 * Scheduled job that runs every 30 minutes to identify and cancel offers
 * where the maker no longer owns the offered assets. This handles cases where
 * NFTs are transferred after an offer is created.
 */

import * as cron from 'node-cron';
import { PrismaClient, OfferStatus } from '../generated/prisma';
import { alertingService } from './alerting.service';
import { AssetValidator, AssetType } from './assetValidator';
import { NoncePoolManager } from './noncePoolManager';

export interface StaleOfferCleanupConfig {
  /** Cron schedule (default: every 30 minutes) */
  schedule: string;

  /** Batch size for processing offers (smaller due to DAS rate limits) */
  batchSize: number;

  /** Timezone for cron schedule */
  timezone: string;

  /** Delay between batches in ms (for rate limiting) */
  batchDelayMs: number;

  /** Delay between individual asset validations in ms */
  validationDelayMs: number;
}

export class StaleOfferCleanupScheduler {
  private static instance: StaleOfferCleanupScheduler;
  private prisma: PrismaClient;
  private assetValidator: AssetValidator;
  private noncePoolManager: NoncePoolManager;
  private config: StaleOfferCleanupConfig;
  private job: cron.ScheduledTask | null = null;
  private isLeader: boolean = false;
  private isRunning: boolean = false;

  // Execution tracking
  private lastRun: Date | null = null;
  private totalExecutions: number = 0;
  private totalCleaned: number = 0;
  private consecutiveErrors: number = 0;

  private constructor(
    prisma: PrismaClient,
    assetValidator: AssetValidator,
    noncePoolManager: NoncePoolManager,
    config?: Partial<StaleOfferCleanupConfig>
  ) {
    this.prisma = prisma;
    this.assetValidator = assetValidator;
    this.noncePoolManager = noncePoolManager;
    this.config = {
      schedule: '*/30 * * * *', // Every 30 minutes
      batchSize: 50, // Smaller batches due to DAS rate limits
      timezone: process.env.TZ || 'America/Los_Angeles',
      batchDelayMs: 500,
      validationDelayMs: 100,
      ...config,
    };

    this.determineLeadership();
  }

  static getInstance(
    prisma: PrismaClient,
    assetValidator: AssetValidator,
    noncePoolManager: NoncePoolManager,
    config?: Partial<StaleOfferCleanupConfig>
  ): StaleOfferCleanupScheduler {
    if (!StaleOfferCleanupScheduler.instance) {
      StaleOfferCleanupScheduler.instance = new StaleOfferCleanupScheduler(
        prisma,
        assetValidator,
        noncePoolManager,
        config
      );
    }
    return StaleOfferCleanupScheduler.instance;
  }

  /**
   * Determine if this instance should run cron jobs
   * In multi-instance deployments, only one instance should run scheduled tasks
   */
  private determineLeadership(): void {
    const hostname = process.env.HOSTNAME || '';
    const dyno = process.env.DYNO || '';

    if (process.env.SCHEDULER_LEADER === 'true') {
      this.isLeader = true;
      console.log(
        '[StaleOfferCleanup] This instance is designated as scheduler leader (SCHEDULER_LEADER=true)'
      );
    } else if (!hostname && !dyno) {
      this.isLeader = true;
      console.log('[StaleOfferCleanup] Running locally - scheduler leader enabled');
    } else {
      this.isLeader = hostname.includes('web-0') || dyno === 'web.1';
      console.log(`[StaleOfferCleanup] Instance: ${hostname || dyno} - Leader: ${this.isLeader}`);
    }
  }

  /**
   * Start the stale offer cleanup scheduler
   */
  start(): void {
    if (!this.isLeader) {
      console.log('[StaleOfferCleanup] ⏭️  Skipping scheduler - not leader instance');
      return;
    }

    if (this.job) {
      console.log('[StaleOfferCleanup] ⚠️  Scheduler already running');
      return;
    }

    this.job = cron.schedule(
      this.config.schedule,
      async () => {
        await this.executeCleanup();
      },
      {
        timezone: this.config.timezone,
      }
    );

    console.log('[StaleOfferCleanup] ✅ Scheduler started');
    console.log(`[StaleOfferCleanup]    Schedule: ${this.config.schedule} (every 30 minutes)`);
    console.log(`[StaleOfferCleanup]    Timezone: ${this.config.timezone}`);
    console.log(`[StaleOfferCleanup]    Batch size: ${this.config.batchSize}`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[StaleOfferCleanup] 🛑 Scheduler stopped');
    }
  }

  /**
   * Execute stale offer cleanup (can be called manually for testing)
   */
  async executeCleanup(): Promise<{
    success: boolean;
    cleaned: number;
    checked: number;
    error?: string;
  }> {
    if (this.isRunning) {
      console.log('[StaleOfferCleanup] ⏭️  Skipping execution - previous run still in progress');
      return { success: false, cleaned: 0, checked: 0, error: 'Previous execution still running' };
    }

    this.isRunning = true;
    const startTime = Date.now();

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║         Stale Offer Cleanup Started                        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`\n⏰ Starting cleanup at ${new Date().toISOString()}`);

    try {
      let totalCleaned = 0;
      let totalChecked = 0;
      let hasMore = true;
      let iterations = 0;
      const maxIterations = 20; // Safety limit (20 * 50 = 1000 offers max)

      while (hasMore && iterations < maxIterations) {
        iterations++;

        // Find active offers in batches
        const activeOffers = await this.prisma.swapOffer.findMany({
          where: {
            status: {
              in: [OfferStatus.ACTIVE, OfferStatus.COUNTERED],
            },
          },
          take: this.config.batchSize,
          skip: (iterations - 1) * this.config.batchSize,
          select: {
            id: true,
            makerWallet: true,
            offeredAssets: true,
            nonceAccount: true,
            status: true,
          },
          orderBy: {
            createdAt: 'asc', // Process oldest first
          },
        });

        if (activeOffers.length === 0) {
          hasMore = false;
          break;
        }

        console.log(`\n📋 Batch ${iterations}: Checking ${activeOffers.length} offers`);

        let batchCleaned = 0;

        for (const offer of activeOffers) {
          totalChecked++;

          try {
            // Parse offered assets
            const offeredAssets = offer.offeredAssets as Array<{
              type: string;
              identifier: string;
            }>;

            if (!offeredAssets || offeredAssets.length === 0) {
              continue;
            }

            // Convert to AssetType format
            const assetsToValidate = offeredAssets.map((asset) => ({
              type: asset.type.toUpperCase() as AssetType,
              identifier: asset.identifier,
            }));

            // Validate maker still owns these assets
            const validationResults = await this.assetValidator.validateAssets(
              offer.makerWallet,
              assetsToValidate
            );

            const invalidAssets = validationResults.filter((v) => !v.isValid);

            if (invalidAssets.length > 0) {
              // Maker no longer owns at least one asset - cancel the offer
              console.log(
                `   🗑️  Offer ${offer.id}: Maker ${offer.makerWallet.slice(0, 8)}... no longer owns ${invalidAssets.length} asset(s)`
              );

              // Cancel the offer
              await this.prisma.swapOffer.update({
                where: { id: offer.id },
                data: {
                  status: OfferStatus.CANCELLED,
                  cancelledAt: new Date(),
                  cancelledBy: 'SYSTEM_STALE_CLEANUP',
                },
              });

              // Cancel any counter-offers linked to this offer
              await this.prisma.swapOffer.updateMany({
                where: {
                  parentOfferId: offer.id,
                  status: {
                    in: [OfferStatus.ACTIVE, OfferStatus.ACCEPTED, OfferStatus.COUNTERED],
                  },
                },
                data: {
                  status: OfferStatus.CANCELLED,
                  cancelledAt: new Date(),
                  cancelledBy: 'SYSTEM_STALE_CLEANUP',
                },
              });

              // Release nonce back to pool
              if (offer.nonceAccount) {
                try {
                  await this.noncePoolManager.releaseNonce(offer.nonceAccount);
                } catch (nonceError: any) {
                  console.warn(
                    `   ⚠️  Failed to release nonce for offer ${offer.id}: ${nonceError.message}`
                  );
                }
              }

              batchCleaned++;
              totalCleaned++;
            }

            // Small delay between validations to respect rate limits
            await new Promise((resolve) => setTimeout(resolve, this.config.validationDelayMs));
          } catch (offerError: any) {
            console.warn(`   ⚠️  Error checking offer ${offer.id}: ${offerError.message}`);
            // Continue with next offer
          }
        }

        console.log(`   ✅ Batch ${iterations}: Cleaned ${batchCleaned} stale offers`);

        // If we got less than batch size, we're done
        if (activeOffers.length < this.config.batchSize) {
          hasMore = false;
        }

        // Delay between batches
        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, this.config.batchDelayMs));
        }
      }

      const duration = Date.now() - startTime;

      console.log('\n╔═══════════════════════════════════════════════════════════╗');
      console.log('║         Stale Offer Cleanup Summary                        ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log(`✅ Completed at: ${new Date().toISOString()}`);
      console.log(`📊 Offers checked: ${totalChecked}`);
      console.log(`🗑️  Stale offers cleaned: ${totalCleaned}`);
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log(`🔄 Batches processed: ${iterations}`);

      // Update tracking metrics
      this.lastRun = new Date();
      this.totalExecutions++;
      this.totalCleaned += totalCleaned;
      this.consecutiveErrors = 0;

      this.isRunning = false;
      return { success: true, cleaned: totalCleaned, checked: totalChecked };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      console.error('\n╔═══════════════════════════════════════════════════════════╗');
      console.error('║         Stale Offer Cleanup Failed                         ║');
      console.error('╚═══════════════════════════════════════════════════════════╝');
      console.error(`❌ Failed at: ${new Date().toISOString()}`);
      console.error(`⏱️  Duration: ${duration}ms`);
      console.error('📄 Error:', error.message);
      console.error('📚 Stack:', error.stack);

      // Update tracking metrics
      this.lastRun = new Date();
      this.totalExecutions++;
      this.consecutiveErrors++;

      // Alert if multiple consecutive failures
      if (this.consecutiveErrors >= 3) {
        console.error(
          `\n⚠️  ALERT: ${this.consecutiveErrors} consecutive failures in stale offer cleanup job!`
        );
        await alertingService.sendAlert(
          'stale_offer_cleanup_failed',
          'HIGH' as any,
          'Stale Offer Cleanup Scheduler Failing',
          `Stale offer cleanup job has failed ${this.consecutiveErrors} times consecutively. Last error: ${error.message}`,
          {
            component: 'stale-offer-cleanup',
            consecutiveErrors: this.consecutiveErrors,
            lastError: error.message,
          }
        );
      }

      this.isRunning = false;
      return { success: false, cleaned: 0, checked: 0, error: error.message };
    }
  }

  /**
   * Get scheduler status and metrics
   */
  getStatus(): {
    isLeader: boolean;
    isRunning: boolean;
    isScheduled: boolean;
    lastRun: Date | null;
    totalExecutions: number;
    totalCleaned: number;
    consecutiveErrors: number;
    schedule: string;
  } {
    return {
      isLeader: this.isLeader,
      isRunning: this.isRunning,
      isScheduled: this.job !== null,
      lastRun: this.lastRun,
      totalExecutions: this.totalExecutions,
      totalCleaned: this.totalCleaned,
      consecutiveErrors: this.consecutiveErrors,
      schedule: this.config.schedule,
    };
  }

  /**
   * Manually trigger cleanup (for testing/debugging)
   */
  async triggerManual(): Promise<{
    success: boolean;
    cleaned: number;
    checked: number;
    error?: string;
  }> {
    console.log('[StaleOfferCleanup] 🔧 Manual trigger initiated');
    return await this.executeCleanup();
  }
}

/**
 * Export singleton getter
 */
let schedulerInstance: StaleOfferCleanupScheduler | null = null;

export function getStaleOfferCleanupScheduler(
  prisma: PrismaClient,
  assetValidator: AssetValidator,
  noncePoolManager: NoncePoolManager,
  config?: Partial<StaleOfferCleanupConfig>
): StaleOfferCleanupScheduler {
  if (!schedulerInstance) {
    schedulerInstance = StaleOfferCleanupScheduler.getInstance(
      prisma,
      assetValidator,
      noncePoolManager,
      config
    );
  }
  return schedulerInstance;
}
