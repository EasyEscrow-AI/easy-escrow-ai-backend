/**
 * DataSales Scheduler Service
 *
 * Scheduled jobs for DataSales agreement lifecycle:
 * 1. Timeout Handler - Auto-cancel expired deposit windows
 * 2. Access Expiry Handler - Mark settled agreements as expired
 * 3. Cleanup Handler - Archive old agreements and cleanup S3
 */

import * as cron from 'node-cron';
import { PrismaClient, DataSalesStatus } from '../generated/prisma';
import { DataSalesManager } from './dataSalesManager';
import { S3Service } from './s3Service';
import { getDataSalesProgramService } from './datasales-program.service';
import { logger } from './logger.service';
import { Connection } from '@solana/web3.js';
import { config as appConfig } from '../config';

export interface DataSalesSchedulerConfig {
  /** Timeout check schedule (default: every 5 minutes) */
  timeoutSchedule: string;
  /** Access expiry check schedule (default: every hour) */
  expirySchedule: string;
  /** Cleanup schedule (default: daily at 3 AM) */
  cleanupSchedule: string;
  /** Batch size for processing */
  batchSize: number;
  /** Timezone for cron schedule */
  timezone: string;
  /** Grace period in days before cleanup (default: 7 days) */
  cleanupGraceDays: number;
}

export class DataSalesScheduler {
  private static instance: DataSalesScheduler;
  private prisma: PrismaClient;
  private config: DataSalesSchedulerConfig;
  private manager: DataSalesManager;
  private s3Service: S3Service;
  private timeoutJob: cron.ScheduledTask | null = null;
  private expiryJob: cron.ScheduledTask | null = null;
  private cleanupJob: cron.ScheduledTask | null = null;
  private isLeader: boolean = false;

  // Execution tracking
  private lastTimeoutRun: Date | null = null;
  private lastExpiryRun: Date | null = null;
  private lastCleanupRun: Date | null = null;
  private totalTimeoutsCancelled: number = 0;
  private totalExpired: number = 0;
  private totalArchived: number = 0;

  private constructor(
    prisma: PrismaClient,
    config?: Partial<DataSalesSchedulerConfig>
  ) {
    this.prisma = prisma;
    this.config = {
      timeoutSchedule: '*/5 * * * *', // Every 5 minutes
      expirySchedule: '0 * * * *', // Every hour
      cleanupSchedule: '0 3 * * *', // Daily at 3 AM
      batchSize: 50,
      timezone: process.env.TZ || 'America/Los_Angeles',
      cleanupGraceDays: 7,
      ...config,
    };

    const connection = new Connection(appConfig.solana?.rpcUrl || 'http://localhost:8899', 'confirmed');
    this.s3Service = S3Service.getInstance();
    this.manager = new DataSalesManager(prisma, connection, this.s3Service);

    this.determineLeadership();
  }

  static getInstance(
    prisma: PrismaClient,
    config?: Partial<DataSalesSchedulerConfig>
  ): DataSalesScheduler {
    if (!DataSalesScheduler.instance) {
      DataSalesScheduler.instance = new DataSalesScheduler(prisma, config);
    }
    return DataSalesScheduler.instance;
  }

  private determineLeadership(): void {
    const hostname = process.env.HOSTNAME || '';
    const dyno = process.env.DYNO || '';

    if (process.env.SCHEDULER_LEADER === 'true') {
      this.isLeader = true;
      logger.info('[DataSalesScheduler] This instance is designated as scheduler leader');
    } else if (!hostname && !dyno) {
      this.isLeader = true;
      logger.info('[DataSalesScheduler] Running locally - scheduler leader enabled');
    } else {
      this.isLeader = hostname.includes('web-0') || dyno === 'web.1';
      logger.info(`[DataSalesScheduler] Instance: ${hostname || dyno} - Leader: ${this.isLeader}`);
    }
  }

  /**
   * Start all scheduled jobs
   */
  start(): void {
    if (!this.isLeader) {
      logger.info('[DataSalesScheduler] Skipping scheduler - not leader instance');
      return;
    }

    this.startTimeoutJob();
    this.startExpiryJob();
    this.startCleanupJob();

    logger.info('[DataSalesScheduler] All jobs started');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    if (this.timeoutJob) {
      this.timeoutJob.stop();
      this.timeoutJob = null;
    }
    if (this.expiryJob) {
      this.expiryJob.stop();
      this.expiryJob = null;
    }
    if (this.cleanupJob) {
      this.cleanupJob.stop();
      this.cleanupJob = null;
    }
    logger.info('[DataSalesScheduler] All jobs stopped');
  }

  // ============================================
  // Timeout Handler
  // ============================================

  private startTimeoutJob(): void {
    if (this.timeoutJob) return;

    this.timeoutJob = cron.schedule(
      this.config.timeoutSchedule,
      async () => {
        await this.handleTimeouts();
      },
      { timezone: this.config.timezone }
    );

    logger.info(
      `[DataSalesScheduler] Timeout job started (schedule: ${this.config.timeoutSchedule})`
    );
  }

  /**
   * Find and cancel agreements with expired deposit windows
   */
  async handleTimeouts(): Promise<{ processed: number; cancelled: number }> {
    const startTime = Date.now();
    let cancelled = 0;

    try {
      // Find agreements with expired deposit windows
      const expiredAgreements = await this.prisma.dataSalesAgreement.findMany({
        where: {
          status: {
            in: [
              DataSalesStatus.PENDING_DEPOSITS,
              DataSalesStatus.DATA_LOCKED,
              DataSalesStatus.SOL_LOCKED,
            ],
          },
          depositWindowEndsAt: {
            lt: new Date(),
          },
        },
        take: this.config.batchSize,
      });

      logger.info(
        `[DataSalesScheduler:Timeout] Found ${expiredAgreements.length} agreements with expired deposit windows`
      );

      // Cancel each agreement
      for (const agreement of expiredAgreements) {
        try {
          await this.manager.cancelAgreement(agreement.agreementId);
          cancelled++;
          logger.info(`[DataSalesScheduler:Timeout] Cancelled agreement: ${agreement.agreementId}`);
        } catch (error) {
          logger.error(
            `[DataSalesScheduler:Timeout] Failed to cancel agreement: ${agreement.agreementId}`,
            { error }
          );
        }
      }

      this.lastTimeoutRun = new Date();
      this.totalTimeoutsCancelled += cancelled;

      logger.info(
        `[DataSalesScheduler:Timeout] Completed in ${Date.now() - startTime}ms - Cancelled: ${cancelled}/${expiredAgreements.length}`
      );

      return { processed: expiredAgreements.length, cancelled };
    } catch (error) {
      logger.error('[DataSalesScheduler:Timeout] Job failed', { error });
      return { processed: 0, cancelled: 0 };
    }
  }

  // ============================================
  // Access Expiry Handler
  // ============================================

  private startExpiryJob(): void {
    if (this.expiryJob) return;

    this.expiryJob = cron.schedule(
      this.config.expirySchedule,
      async () => {
        await this.handleAccessExpiry();
      },
      { timezone: this.config.timezone }
    );

    logger.info(
      `[DataSalesScheduler] Access expiry job started (schedule: ${this.config.expirySchedule})`
    );
  }

  /**
   * Mark settled agreements as expired when access period ends
   */
  async handleAccessExpiry(): Promise<{ processed: number; expired: number }> {
    const startTime = Date.now();

    try {
      // Find settled agreements with expired access
      const result = await this.prisma.dataSalesAgreement.updateMany({
        where: {
          status: DataSalesStatus.SETTLED,
          accessExpiresAt: {
            lt: new Date(),
          },
        },
        data: {
          status: DataSalesStatus.EXPIRED,
        },
      });

      this.lastExpiryRun = new Date();
      this.totalExpired += result.count;

      logger.info(
        `[DataSalesScheduler:Expiry] Marked ${result.count} agreements as expired in ${Date.now() - startTime}ms`
      );

      return { processed: result.count, expired: result.count };
    } catch (error) {
      logger.error('[DataSalesScheduler:Expiry] Job failed', { error });
      return { processed: 0, expired: 0 };
    }
  }

  // ============================================
  // Cleanup Handler
  // ============================================

  private startCleanupJob(): void {
    if (this.cleanupJob) return;

    this.cleanupJob = cron.schedule(
      this.config.cleanupSchedule,
      async () => {
        await this.handleCleanup();
      },
      { timezone: this.config.timezone }
    );

    logger.info(
      `[DataSalesScheduler] Cleanup job started (schedule: ${this.config.cleanupSchedule})`
    );
  }

  /**
   * Archive old expired agreements and cleanup S3 buckets
   */
  async handleCleanup(): Promise<{ processed: number; archived: number; errors: number }> {
    const startTime = Date.now();
    let archived = 0;
    let errors = 0;

    try {
      const gracePeriodMs = this.config.cleanupGraceDays * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - gracePeriodMs);

      // Find expired agreements past grace period
      const expiredAgreements = await this.prisma.dataSalesAgreement.findMany({
        where: {
          status: DataSalesStatus.EXPIRED,
          accessExpiresAt: {
            lt: cutoffDate,
          },
        },
        take: this.config.batchSize,
      });

      logger.info(
        `[DataSalesScheduler:Cleanup] Found ${expiredAgreements.length} agreements to archive`
      );

      // Archive each agreement
      for (const agreement of expiredAgreements) {
        try {
          // Delete S3 bucket
          try {
            await this.s3Service.deleteBucket(agreement.s3BucketName);
            logger.info(
              `[DataSalesScheduler:Cleanup] Deleted S3 bucket: ${agreement.s3BucketName}`
            );
          } catch (s3Error) {
            logger.warn(
              `[DataSalesScheduler:Cleanup] Failed to delete S3 bucket: ${agreement.s3BucketName}`,
              { error: s3Error }
            );
          }

          // Close on-chain escrow if exists
          try {
            const programService = getDataSalesProgramService();
            const closeTx = await programService.buildCloseEscrowTransaction(
              agreement.agreementId
            );
            await programService.sendAndConfirmTransaction(closeTx.serializedTransaction);
            logger.info(
              `[DataSalesScheduler:Cleanup] Closed on-chain escrow: ${agreement.agreementId}`
            );
          } catch (chainError) {
            // May fail if already closed or doesn't exist
            logger.warn(
              `[DataSalesScheduler:Cleanup] Could not close escrow (may already be closed): ${agreement.agreementId}`,
              { error: chainError }
            );
          }

          // Update to ARCHIVED
          await this.prisma.dataSalesAgreement.update({
            where: { id: agreement.id },
            data: {
              status: DataSalesStatus.ARCHIVED,
              archivedAt: new Date(),
            },
          });

          archived++;
          logger.info(`[DataSalesScheduler:Cleanup] Archived agreement: ${agreement.agreementId}`);
        } catch (error) {
          errors++;
          logger.error(
            `[DataSalesScheduler:Cleanup] Failed to archive agreement: ${agreement.agreementId}`,
            { error }
          );
        }
      }

      this.lastCleanupRun = new Date();
      this.totalArchived += archived;

      logger.info(
        `[DataSalesScheduler:Cleanup] Completed in ${Date.now() - startTime}ms - Archived: ${archived}, Errors: ${errors}`
      );

      return { processed: expiredAgreements.length, archived, errors };
    } catch (error) {
      logger.error('[DataSalesScheduler:Cleanup] Job failed', { error });
      return { processed: 0, archived: 0, errors: 1 };
    }
  }

  // ============================================
  // Status & Metrics
  // ============================================

  getStatus(): {
    isLeader: boolean;
    timeoutJob: { running: boolean; lastRun: Date | null; totalCancelled: number };
    expiryJob: { running: boolean; lastRun: Date | null; totalExpired: number };
    cleanupJob: { running: boolean; lastRun: Date | null; totalArchived: number };
  } {
    return {
      isLeader: this.isLeader,
      timeoutJob: {
        running: this.timeoutJob !== null,
        lastRun: this.lastTimeoutRun,
        totalCancelled: this.totalTimeoutsCancelled,
      },
      expiryJob: {
        running: this.expiryJob !== null,
        lastRun: this.lastExpiryRun,
        totalExpired: this.totalExpired,
      },
      cleanupJob: {
        running: this.cleanupJob !== null,
        lastRun: this.lastCleanupRun,
        totalArchived: this.totalArchived,
      },
    };
  }

  /**
   * Run timeout check manually (for testing or manual trigger)
   */
  async runTimeoutCheck(): Promise<{ processed: number; cancelled: number }> {
    return this.handleTimeouts();
  }

  /**
   * Run expiry check manually
   */
  async runExpiryCheck(): Promise<{ processed: number; expired: number }> {
    return this.handleAccessExpiry();
  }

  /**
   * Run cleanup manually
   */
  async runCleanup(): Promise<{ processed: number; archived: number; errors: number }> {
    return this.handleCleanup();
  }
}

// Export for index.ts initialization
export function getDataSalesScheduler(
  prisma: PrismaClient,
  config?: Partial<DataSalesSchedulerConfig>
): DataSalesScheduler {
  return DataSalesScheduler.getInstance(prisma, config);
}
