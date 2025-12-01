/**
 * Nonce Pool Schedulers Service
 * 
 * Two schedulers for nonce pool maintenance:
 * 1. Cleanup Scheduler - Runs every hour to clean up unused nonce accounts
 * 2. Replenishment Scheduler - Runs every 30 minutes to maintain pool size
 */

import * as cron from 'node-cron';
import { NoncePoolManager } from './noncePoolManager';
import { alertingService } from './alerting.service';

export interface NonceSchedulerConfig {
  /** Cleanup schedule (default: every hour) */
  cleanupSchedule: string;
  
  /** Replenishment schedule (default: every 30 minutes) */
  replenishmentSchedule: string;
  
  /** Timezone for cron schedules */
  timezone: string;
  
  /** Minimum pool size threshold for replenishment */
  minPoolSize: number;
  
  /** How many nonces to create during replenishment */
  replenishmentAmount: number;
}

/**
 * Nonce Cleanup Scheduler
 * Runs hourly to identify and clean up stale nonce accounts
 */
export class NonceCleanupScheduler {
  private static instance: NonceCleanupScheduler;
  private noncePoolManager: NoncePoolManager;
  private config: Pick<NonceSchedulerConfig, 'cleanupSchedule' | 'timezone'>;
  private job: cron.ScheduledTask | null = null;
  private isLeader: boolean = false;
  private isRunning: boolean = false;
  
  // Execution tracking
  private lastRun: Date | null = null;
  private totalExecutions: number = 0;
  private totalCleaned: number = 0;
  private consecutiveErrors: number = 0;
  
  private constructor(
    noncePoolManager: NoncePoolManager,
    config?: Partial<Pick<NonceSchedulerConfig, 'cleanupSchedule' | 'timezone'>>
  ) {
    this.noncePoolManager = noncePoolManager;
    this.config = {
      cleanupSchedule: '0 * * * *', // Every hour at minute 0
      timezone: process.env.TZ || 'America/Los_Angeles',
      ...config,
    };
    
    this.determineLeadership();
  }
  
  static getInstance(
    noncePoolManager: NoncePoolManager,
    config?: Partial<Pick<NonceSchedulerConfig, 'cleanupSchedule' | 'timezone'>>
  ): NonceCleanupScheduler {
    if (!NonceCleanupScheduler.instance) {
      NonceCleanupScheduler.instance = new NonceCleanupScheduler(noncePoolManager, config);
    }
    return NonceCleanupScheduler.instance;
  }
  
  private determineLeadership(): void {
    const hostname = process.env.HOSTNAME || '';
    const dyno = process.env.DYNO || '';
    
    if (process.env.SCHEDULER_LEADER === 'true') {
      this.isLeader = true;
      console.log('[NonceCleanupScheduler] This instance is designated as scheduler leader');
    } else if (!hostname && !dyno) {
      this.isLeader = true;
      console.log('[NonceCleanupScheduler] Running locally - scheduler leader enabled');
    } else {
      this.isLeader = hostname.includes('web-0') || dyno === 'web.1';
      console.log(`[NonceCleanupScheduler] Instance: ${hostname || dyno} - Leader: ${this.isLeader}`);
    }
  }
  
  start(): void {
    if (!this.isLeader) {
      console.log('[NonceCleanupScheduler] ⏭️  Skipping scheduler - not leader instance');
      return;
    }
    
    if (this.job) {
      console.log('[NonceCleanupScheduler] ⚠️  Scheduler already running');
      return;
    }
    
    this.job = cron.schedule(
      this.config.cleanupSchedule,
      async () => {
        await this.executeCleanup();
      },
      {
        timezone: this.config.timezone,
      }
    );
    
    console.log('[NonceCleanupScheduler] ✅ Scheduler started');
    console.log(`[NonceCleanupScheduler]    Schedule: ${this.config.cleanupSchedule} (hourly)`);
    console.log(`[NonceCleanupScheduler]    Timezone: ${this.config.timezone}`);
  }
  
  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[NonceCleanupScheduler] 🛑 Scheduler stopped');
    }
  }
  
  async executeCleanup(): Promise<{
    success: boolean;
    cleaned: number;
    error?: string;
  }> {
    if (this.isRunning) {
      console.log('[NonceCleanupScheduler] ⏭️  Skipping execution - previous run still in progress');
      return { success: false, cleaned: 0, error: 'Previous execution still running' };
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║         Nonce Cleanup Started                              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`\n🧹 Starting nonce cleanup at ${new Date().toISOString()}`);
    
    try {
      // NoncePoolManager.cleanup() handles the cleanup logic
      const result = await this.noncePoolManager.cleanup();
      
      const duration = Date.now() - startTime;
      
      console.log('\n╔═══════════════════════════════════════════════════════════╗');
      console.log('║         Cleanup Summary                                    ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log(`✅ Completed at: ${new Date().toISOString()}`);
      console.log(`🗑️  Nonces cleaned: ${result.cleaned}`);
      console.log(`⏱️  Duration: ${duration}ms`);
      
      // Update tracking metrics
      this.lastRun = new Date();
      this.totalExecutions++;
      this.totalCleaned += result.cleaned;
      this.consecutiveErrors = 0;
      
      this.isRunning = false;
      return { success: true, cleaned: result.cleaned };
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      console.error('\n╔═══════════════════════════════════════════════════════════╗');
      console.error('║         Cleanup Failed                                     ║');
      console.error('╚═══════════════════════════════════════════════════════════╝');
      console.error(`❌ Failed at: ${new Date().toISOString()}`);
      console.error(`⏱️  Duration: ${duration}ms`);
      console.error('📄 Error:', error.message);
      
      this.lastRun = new Date();
      this.totalExecutions++;
      this.consecutiveErrors++;
      
      if (this.consecutiveErrors >= 3) {
        console.error(`\n⚠️  ALERT: ${this.consecutiveErrors} consecutive failures in nonce cleanup job!`);
        await alertingService.sendAlert(
          'nonce_cleanup_scheduler_failed',
          'HIGH' as any,
          'Nonce Cleanup Scheduler Failing',
          `Nonce cleanup job has failed ${this.consecutiveErrors} times consecutively. Last error: ${error.message}`,
          {
            component: 'nonce-cleanup-scheduler',
            consecutiveErrors: this.consecutiveErrors,
            lastError: error.message,
          }
        );
      }
      
      this.isRunning = false;
      return { success: false, cleaned: 0, error: error.message };
    }
  }
  
  getStatus() {
    return {
      isLeader: this.isLeader,
      isRunning: this.isRunning,
      isScheduled: this.job !== null,
      lastRun: this.lastRun,
      totalExecutions: this.totalExecutions,
      totalCleaned: this.totalCleaned,
      consecutiveErrors: this.consecutiveErrors,
      schedule: this.config.cleanupSchedule,
    };
  }
  
  async triggerManual() {
    console.log('[NonceCleanupScheduler] 🔧 Manual trigger initiated');
    return await this.executeCleanup();
  }
}

/**
 * Nonce Replenishment Scheduler
 * Runs every 30 minutes to maintain optimal pool size
 */
export class NonceReplenishmentScheduler {
  private static instance: NonceReplenishmentScheduler;
  private noncePoolManager: NoncePoolManager;
  private config: Pick<NonceSchedulerConfig, 'replenishmentSchedule' | 'timezone' | 'minPoolSize' | 'replenishmentAmount'>;
  private job: cron.ScheduledTask | null = null;
  private isLeader: boolean = false;
  private isRunning: boolean = false;
  
  // Execution tracking
  private lastRun: Date | null = null;
  private totalExecutions: number = 0;
  private totalReplenished: number = 0;
  private consecutiveErrors: number = 0;
  
  private constructor(
    noncePoolManager: NoncePoolManager,
    config?: Partial<Pick<NonceSchedulerConfig, 'replenishmentSchedule' | 'timezone' | 'minPoolSize' | 'replenishmentAmount'>>
  ) {
    this.noncePoolManager = noncePoolManager;
    this.config = {
      replenishmentSchedule: '*/30 * * * *', // Every 30 minutes
      timezone: process.env.TZ || 'America/Los_Angeles',
      minPoolSize: 10, // Replenish if below this threshold
      replenishmentAmount: 5, // How many to create
      ...config,
    };
    
    this.determineLeadership();
  }
  
  static getInstance(
    noncePoolManager: NoncePoolManager,
    config?: Partial<Pick<NonceSchedulerConfig, 'replenishmentSchedule' | 'timezone' | 'minPoolSize' | 'replenishmentAmount'>>
  ): NonceReplenishmentScheduler {
    if (!NonceReplenishmentScheduler.instance) {
      NonceReplenishmentScheduler.instance = new NonceReplenishmentScheduler(noncePoolManager, config);
    }
    return NonceReplenishmentScheduler.instance;
  }
  
  private determineLeadership(): void {
    const hostname = process.env.HOSTNAME || '';
    const dyno = process.env.DYNO || '';
    
    if (process.env.SCHEDULER_LEADER === 'true') {
      this.isLeader = true;
      console.log('[NonceReplenishmentScheduler] This instance is designated as scheduler leader');
    } else if (!hostname && !dyno) {
      this.isLeader = true;
      console.log('[NonceReplenishmentScheduler] Running locally - scheduler leader enabled');
    } else {
      this.isLeader = hostname.includes('web-0') || dyno === 'web.1';
      console.log(`[NonceReplenishmentScheduler] Instance: ${hostname || dyno} - Leader: ${this.isLeader}`);
    }
  }
  
  start(): void {
    if (!this.isLeader) {
      console.log('[NonceReplenishmentScheduler] ⏭️  Skipping scheduler - not leader instance');
      return;
    }
    
    if (this.job) {
      console.log('[NonceReplenishmentScheduler] ⚠️  Scheduler already running');
      return;
    }
    
    this.job = cron.schedule(
      this.config.replenishmentSchedule,
      async () => {
        await this.executeReplenishment();
      },
      {
        timezone: this.config.timezone,
      }
    );
    
    console.log('[NonceReplenishmentScheduler] ✅ Scheduler started');
    console.log(`[NonceReplenishmentScheduler]    Schedule: ${this.config.replenishmentSchedule} (every 30 min)`);
    console.log(`[NonceReplenishmentScheduler]    Timezone: ${this.config.timezone}`);
    console.log(`[NonceReplenishmentScheduler]    Min pool size: ${this.config.minPoolSize}`);
    console.log(`[NonceReplenishmentScheduler]    Replenishment amount: ${this.config.replenishmentAmount}`);
  }
  
  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[NonceReplenishmentScheduler] 🛑 Scheduler stopped');
    }
  }
  
  async executeReplenishment(): Promise<{
    success: boolean;
    created: number;
    error?: string;
  }> {
    if (this.isRunning) {
      console.log('[NonceReplenishmentScheduler] ⏭️  Skipping execution - previous run still in progress');
      return { success: false, created: 0, error: 'Previous execution still running' };
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║         Nonce Replenishment Check Started                 ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`\n➕ Starting nonce replenishment check at ${new Date().toISOString()}`);
    
    try {
      // Check current pool size
      const stats = await this.noncePoolManager.getPoolStats();
      console.log(`📊 Current pool stats:`, stats);
      
      if (stats.available >= this.config.minPoolSize) {
        const duration = Date.now() - startTime;
        console.log(`✅ Pool size adequate (${stats.available} >= ${this.config.minPoolSize}), no replenishment needed`);
        console.log(`⏱️  Check duration: ${duration}ms\n`);
        
        this.lastRun = new Date();
        this.totalExecutions++;
        this.consecutiveErrors = 0;
        this.isRunning = false;
        
        return { success: true, created: 0 };
      }
      
      console.log(`⚠️  Pool size low (${stats.available} < ${this.config.minPoolSize}), replenishing...`);
      
      // Replenish the pool
      const toCreate = this.config.replenishmentAmount;
      await this.noncePoolManager.replenishPool(toCreate);
      
      const duration = Date.now() - startTime;
      
      console.log('\n╔═══════════════════════════════════════════════════════════╗');
      console.log('║         Replenishment Summary                              ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log(`✅ Completed at: ${new Date().toISOString()}`);
      console.log(`➕ Nonces created: ${toCreate}`);
      console.log(`⏱️  Duration: ${duration}ms`);
      
      // Update tracking metrics
      this.lastRun = new Date();
      this.totalExecutions++;
      this.totalReplenished += toCreate;
      this.consecutiveErrors = 0;
      
      this.isRunning = false;
      return { success: true, created: toCreate };
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      console.error('\n╔═══════════════════════════════════════════════════════════╗');
      console.error('║         Replenishment Failed                               ║');
      console.error('╚═══════════════════════════════════════════════════════════╝');
      console.error(`❌ Failed at: ${new Date().toISOString()}`);
      console.error(`⏱️  Duration: ${duration}ms`);
      console.error('📄 Error:', error.message);
      
      this.lastRun = new Date();
      this.totalExecutions++;
      this.consecutiveErrors++;
      
      if (this.consecutiveErrors >= 3) {
        console.error(`\n⚠️  ALERT: ${this.consecutiveErrors} consecutive failures in nonce replenishment job!`);
        await alertingService.sendAlert(
          'nonce_replenishment_scheduler_failed',
          'CRITICAL' as any,
          'Nonce Replenishment Scheduler Failing',
          `Nonce replenishment job has failed ${this.consecutiveErrors} times consecutively. Pool may be depleting! Last error: ${error.message}`,
          {
            component: 'nonce-replenishment-scheduler',
            consecutiveErrors: this.consecutiveErrors,
            lastError: error.message,
          }
        );
      }
      
      this.isRunning = false;
      return { success: false, created: 0, error: error.message };
    }
  }
  
  getStatus() {
    return {
      isLeader: this.isLeader,
      isRunning: this.isRunning,
      isScheduled: this.job !== null,
      lastRun: this.lastRun,
      totalExecutions: this.totalExecutions,
      totalReplenished: this.totalReplenished,
      consecutiveErrors: this.consecutiveErrors,
      schedule: this.config.replenishmentSchedule,
      minPoolSize: this.config.minPoolSize,
      replenishmentAmount: this.config.replenishmentAmount,
    };
  }
  
  async triggerManual() {
    console.log('[NonceReplenishmentScheduler] 🔧 Manual trigger initiated');
    return await this.executeReplenishment();
  }
}

/**
 * Export singleton getters
 */
let cleanupSchedulerInstance: NonceCleanupScheduler | null = null;
let replenishmentSchedulerInstance: NonceReplenishmentScheduler | null = null;

export function getNonceCleanupScheduler(
  noncePoolManager: NoncePoolManager,
  config?: Partial<Pick<NonceSchedulerConfig, 'cleanupSchedule' | 'timezone'>>
): NonceCleanupScheduler {
  if (!cleanupSchedulerInstance) {
    cleanupSchedulerInstance = NonceCleanupScheduler.getInstance(noncePoolManager, config);
  }
  return cleanupSchedulerInstance;
}

export function getNonceReplenishmentScheduler(
  noncePoolManager: NoncePoolManager,
  config?: Partial<Pick<NonceSchedulerConfig, 'replenishmentSchedule' | 'timezone' | 'minPoolSize' | 'replenishmentAmount'>>
): NonceReplenishmentScheduler {
  if (!replenishmentSchedulerInstance) {
    replenishmentSchedulerInstance = NonceReplenishmentScheduler.getInstance(noncePoolManager, config);
  }
  return replenishmentSchedulerInstance;
}

