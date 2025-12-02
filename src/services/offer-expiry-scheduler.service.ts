/**
 * Offer Expiry Scheduler Service
 * 
 * Scheduled job that runs every 15 minutes to identify and expire offers
 * past their expiration time. Updates offer status in database and logs
 * expiration events.
 */

import * as cron from 'node-cron';
import { PrismaClient } from '../generated/prisma';
import { alertingService } from './alerting.service';

export interface OfferExpiryConfig {
  /** Cron schedule (default: every 15 minutes) */
  schedule: string;
  
  /** Batch size for processing expired offers */
  batchSize: number;
  
  /** Timezone for cron schedule */
  timezone: string;
}

export class OfferExpiryScheduler {
  private static instance: OfferExpiryScheduler;
  private prisma: PrismaClient;
  private config: OfferExpiryConfig;
  private job: cron.ScheduledTask | null = null;
  private isLeader: boolean = false;
  private isRunning: boolean = false;
  
  // Execution tracking
  private lastRun: Date | null = null;
  private totalExecutions: number = 0;
  private totalExpired: number = 0;
  private consecutiveErrors: number = 0;
  
  private constructor(prisma: PrismaClient, config?: Partial<OfferExpiryConfig>) {
    this.prisma = prisma;
    this.config = {
      schedule: '*/15 * * * *', // Every 15 minutes
      batchSize: 200,
      timezone: process.env.TZ || 'America/Los_Angeles',
      ...config,
    };
    
    this.determineLeadership();
  }
  
  static getInstance(prisma: PrismaClient, config?: Partial<OfferExpiryConfig>): OfferExpiryScheduler {
    if (!OfferExpiryScheduler.instance) {
      OfferExpiryScheduler.instance = new OfferExpiryScheduler(prisma, config);
    }
    return OfferExpiryScheduler.instance;
  }
  
  /**
   * Determine if this instance should run cron jobs
   * In multi-instance deployments, only one instance should run scheduled tasks
   */
  private determineLeadership(): void {
    const hostname = process.env.HOSTNAME || '';
    const dyno = process.env.DYNO || '';
    
    if (process.env.SCHEDULER_LEADER === 'true') {
      // Explicit leader designation via environment variable
      this.isLeader = true;
      console.log('[OfferExpiryScheduler] This instance is designated as scheduler leader (SCHEDULER_LEADER=true)');
    } else if (!hostname && !dyno) {
      // Local development - always leader
      this.isLeader = true;
      console.log('[OfferExpiryScheduler] Running locally - scheduler leader enabled');
    } else {
      // In production, only run on first instance
      this.isLeader = hostname.includes('web-0') || dyno === 'web.1';
      console.log(`[OfferExpiryScheduler] Instance: ${hostname || dyno} - Leader: ${this.isLeader}`);
    }
  }
  
  /**
   * Start the offer expiry scheduler
   */
  start(): void {
    if (!this.isLeader) {
      console.log('[OfferExpiryScheduler] ⏭️  Skipping scheduler - not leader instance');
      return;
    }
    
    if (this.job) {
      console.log('[OfferExpiryScheduler] ⚠️  Scheduler already running');
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
    
    console.log('[OfferExpiryScheduler] ✅ Scheduler started');
    console.log(`[OfferExpiryScheduler]    Schedule: ${this.config.schedule} (every 15 minutes)`);
    console.log(`[OfferExpiryScheduler]    Timezone: ${this.config.timezone}`);
    console.log(`[OfferExpiryScheduler]    Batch size: ${this.config.batchSize}`);
  }
  
  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[OfferExpiryScheduler] 🛑 Scheduler stopped');
    }
  }
  
  /**
   * Execute expiry check (can be called manually for testing)
   */
  async executeExpiryCheck(): Promise<{
    success: boolean;
    expired: number;
    error?: string;
  }> {
    if (this.isRunning) {
      console.log('[OfferExpiryScheduler] ⏭️  Skipping execution - previous run still in progress');
      return { success: false, expired: 0, error: 'Previous execution still running' };
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║         Offer Expiry Check Started                        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`\n⏰ Starting expiry check at ${new Date().toISOString()}`);
    
    try {
      let totalExpired = 0;
      let hasMore = true;
      let iterations = 0;
      const maxIterations = 100; // Safety limit
      
      while (hasMore && iterations < maxIterations) {
        iterations++;
        
        // Find expired offers in batches
        // offers.status: pending, accepted, active, etc. should become 'expired'
        const expiredOffers = await this.prisma.swap_offer.findMany({
          where: {
            expires_at: {
              lt: new Date(), // Expiration time is in the past
            },
            status: {
              in: ['active', 'pending'], // Only expire active/pending offers
            },
          },
          take: this.config.batchSize,
          select: {
            id: true,
            expires_at: true,
            status: true,
          },
        });
        
        if (expiredOffers.length === 0) {
          hasMore = false;
          break;
        }
        
        console.log(`\n📋 Batch ${iterations}: Found ${expiredOffers.length} expired offers`);
        
        // Update offers to expired status
        // Include status filter to prevent race condition where offer gets accepted between query and update
        const offerIds = expiredOffers.map((offer) => offer.id);
        
        const updateResult = await this.prisma.swap_offer.updateMany({
          where: {
            id: {
              in: offerIds,
            },
            status: {
              in: ['active', 'pending'], // Re-check status to prevent race condition
            },
          },
          data: {
            status: 'expired',
            updated_at: new Date(),
          },
        });
        
        totalExpired += updateResult.count;
        
        console.log(`   ✅ Expired ${updateResult.count} offers`);
        
        // If we got less than batch size, we're done
        if (expiredOffers.length < this.config.batchSize) {
          hasMore = false;
        }
        
        // Small delay between batches to prevent database overload
        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      
      const duration = Date.now() - startTime;
      
      console.log('\n╔═══════════════════════════════════════════════════════════╗');
      console.log('║         Expiry Check Summary                               ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log(`✅ Completed at: ${new Date().toISOString()}`);
      console.log(`📊 Total offers expired: ${totalExpired}`);
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log(`🔄 Batches processed: ${iterations}`);
      
      // Update tracking metrics
      this.lastRun = new Date();
      this.totalExecutions++;
      this.totalExpired += totalExpired;
      this.consecutiveErrors = 0; // Reset error counter on success
      
      this.isRunning = false;
      return { success: true, expired: totalExpired };
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      console.error('\n╔═══════════════════════════════════════════════════════════╗');
      console.error('║         Expiry Check Failed                                ║');
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
        console.error(`\n⚠️  ALERT: ${this.consecutiveErrors} consecutive failures in offer expiry job!`);
        await alertingService.sendAlert(
          'offer_expiry_scheduler_failed',
          'HIGH' as any,
          'Offer Expiry Scheduler Failing',
          `Offer expiry job has failed ${this.consecutiveErrors} times consecutively. Last error: ${error.message}`,
          {
            component: 'offer-expiry-scheduler',
            consecutiveErrors: this.consecutiveErrors,
            lastError: error.message,
          }
        );
      }
      
      this.isRunning = false;
      return { success: false, expired: 0, error: error.message };
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
    expired: number;
    error?: string;
  }> {
    console.log('[OfferExpiryScheduler] 🔧 Manual trigger initiated');
    return await this.executeExpiryCheck();
  }
}

/**
 * Export singleton getter
 */
let schedulerInstance: OfferExpiryScheduler | null = null;

export function getOfferExpiryScheduler(
  prisma: PrismaClient,
  config?: Partial<OfferExpiryConfig>
): OfferExpiryScheduler {
  if (!schedulerInstance) {
    schedulerInstance = OfferExpiryScheduler.getInstance(prisma, config);
  }
  return schedulerInstance;
}

