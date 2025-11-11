/**
 * Stuck Agreement Monitor Service
 * 
 * Monitors for agreements that are stuck in BOTH_LOCKED status for an unusually long time
 * and alerts when settlement appears to be failing repeatedly.
 * 
 * NEW: Automatically processes refunds for stuck agreements to return assets to senders.
 */

import { prisma } from '../config/database';
import { AgreementStatus } from '../generated/prisma';
import { getRefundService } from './refund.service';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

/**
 * Stuck agreement alert
 */
export interface StuckAgreementAlert {
  agreementId: string;
  status: AgreementStatus;
  timeSinceLastUpdate: number; // milliseconds
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
}

/**
 * Monitor configuration
 */
interface MonitorConfig {
  warningThresholdMinutes?: number; // Warning if stuck for this long
  criticalThresholdMinutes?: number; // Critical if stuck for this long
  checkIntervalMs?: number; // How often to check (milliseconds)
  autoRefundEnabled?: boolean; // Enable automatic refund processing
  autoRefundThresholdMinutes?: number; // Auto-refund after this many minutes
  maxAgeHours?: number; // Maximum age of agreements to check (prevents old agreements from accumulating)
}

/**
 * Stuck Agreement Monitor Service Class
 */
export class StuckAgreementMonitorService {
  private config: Required<MonitorConfig>;
  private monitorTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private alertCallbacks: Array<(alert: StuckAgreementAlert) => void> = [];
  private refundAttempts: Set<string> = new Set(); // Track refund attempts to avoid duplicates

  constructor(config?: MonitorConfig) {
    this.config = {
      warningThresholdMinutes: config?.warningThresholdMinutes || 10, // 10 minutes
      criticalThresholdMinutes: config?.criticalThresholdMinutes || 30, // 30 minutes
      checkIntervalMs: config?.checkIntervalMs || 60000, // 1 minute
      autoRefundEnabled: config?.autoRefundEnabled ?? true, // Enabled by default
      autoRefundThresholdMinutes: config?.autoRefundThresholdMinutes || 15, // 15 minutes
      maxAgeHours: config?.maxAgeHours || 24, // Only check agreements updated within last 24 hours
    };
  }

  /**
   * Start monitoring for stuck agreements
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[StuckAgreementMonitor] Monitor already running');
      return;
    }

    console.log('[StuckAgreementMonitor] Starting stuck agreement monitor...');
    console.log(`[StuckAgreementMonitor] Configuration:`, {
      warningThreshold: `${this.config.warningThresholdMinutes} minutes`,
      criticalThreshold: `${this.config.criticalThresholdMinutes} minutes`,
      checkInterval: `${this.config.checkIntervalMs / 1000} seconds`,
      autoRefundEnabled: this.config.autoRefundEnabled,
      autoRefundThreshold: `${this.config.autoRefundThresholdMinutes} minutes`,
      maxAge: `${this.config.maxAgeHours} hours`,
    });

    // Run initial check
    await this.checkForStuckAgreements();

    // Start periodic checks
    this.monitorTimer = setInterval(async () => {
      await this.checkForStuckAgreements();
    }, this.config.checkIntervalMs);

    this.isRunning = true;
    console.log('[StuckAgreementMonitor] Monitor started successfully');
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[StuckAgreementMonitor] Monitor not running');
      return;
    }

    console.log('[StuckAgreementMonitor] Stopping monitor...');

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }

    this.isRunning = false;
    console.log('[StuckAgreementMonitor] Monitor stopped');
  }

  /**
   * Register a callback for alerts
   */
  onAlert(callback: (alert: StuckAgreementAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Check for stuck agreements
   */
  private async checkForStuckAgreements(): Promise<void> {
    try {
      const now = new Date();
      const warningThreshold = new Date(
        now.getTime() - this.config.warningThresholdMinutes * 60 * 1000
      );
      const criticalThreshold = new Date(
        now.getTime() - this.config.criticalThresholdMinutes * 60 * 1000
      );
      const maxAgeThreshold = new Date(
        now.getTime() - this.config.maxAgeHours * 60 * 60 * 1000
      );

      // Find agreements stuck in any status with deposits
      // Includes partial deposits (NFT_LOCKED, SOL_LOCKED/USDC_LOCKED) and complete deposits (BOTH_LOCKED)
      // NOTE: ARCHIVED is excluded because it means settlement/refund completed successfully
      // and all assets have already been distributed (no stuck assets)
      // Only checks agreements updated within maxAgeHours to prevent old agreements from accumulating
      const stuckAgreements = await prisma.agreement.findMany({
        where: {
          status: {
            in: [
              AgreementStatus.NFT_LOCKED,    // Only NFT deposited
              AgreementStatus.SOL_LOCKED,    // Only SOL deposited (V2)
              AgreementStatus.USDC_LOCKED,   // Only USDC deposited (legacy V1)
              AgreementStatus.BOTH_LOCKED,   // Both sides deposited
              // ARCHIVED excluded - assets already distributed, agreement complete
            ],
          },
          updatedAt: {
            lt: warningThreshold, // Updated before warning threshold
            gte: maxAgeThreshold, // But not older than maxAge (prevents accumulation)
          },
        },
        select: {
          agreementId: true,
          status: true,
          updatedAt: true,
          escrowPda: true,
          nftMint: true,
          price: true,
        },
      });

      if (stuckAgreements.length === 0) {
        // No stuck agreements - all good!
        return;
      }

      console.log(
        `[StuckAgreementMonitor] Found ${stuckAgreements.length} potentially stuck agreement(s)`
      );

      // Process each stuck agreement
      for (const agreement of stuckAgreements) {
        const timeSinceUpdate = now.getTime() - agreement.updatedAt.getTime();
        const minutesSinceUpdate = Math.round(timeSinceUpdate / 60000);

        // Determine severity
        const isCritical = agreement.updatedAt < criticalThreshold;
        const severity = isCritical ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;

        const alert: StuckAgreementAlert = {
          agreementId: agreement.agreementId,
          status: agreement.status,
          timeSinceLastUpdate: timeSinceUpdate,
          severity,
          message: `Agreement ${agreement.agreementId} stuck in ${agreement.status} for ${minutesSinceUpdate} minutes (Escrow PDA: ${agreement.escrowPda})`,
          timestamp: now,
        };

        // Trigger alert callbacks (logging handled by callback in index.ts to avoid duplicate logs)
        this.triggerAlert(alert);

        // ** AUTOMATIC REFUND PROCESSING **
        // If auto-refund is enabled and agreement has been stuck long enough, process refund
        const autoRefundThreshold = new Date(
          now.getTime() - this.config.autoRefundThresholdMinutes * 60 * 1000
        );
        
        if (
          this.config.autoRefundEnabled &&
          agreement.updatedAt < autoRefundThreshold &&
          !this.refundAttempts.has(agreement.agreementId)
        ) {
          console.log(
            `[StuckAgreementMonitor] 🔄 Agreement ${agreement.agreementId} stuck for ${minutesSinceUpdate} minutes - initiating automatic refund`
          );
          
          // Mark as attempted (prevent duplicate attempts)
          this.refundAttempts.add(agreement.agreementId);
          
          // CRITICAL: Process refund SEQUENTIALLY (await) to prevent Jito rate limiting
          // Previously this was fire-and-forget which caused multiple agreements
          // to process refunds in parallel, overwhelming Jito's 1 tx/second limit
          try {
            await this.processAutomaticRefund(agreement.agreementId);
          } catch (refundError) {
            console.error(
              `[StuckAgreementMonitor] ⚠️ Automatic refund failed for ${agreement.agreementId}:`,
              refundError
            );
            // Remove from attempts so it can be retried in next cycle
            this.refundAttempts.delete(agreement.agreementId);
          }
          
          // Add delay between agreements to further prevent rate limiting
          console.log('[StuckAgreementMonitor] Waiting 3s before processing next agreement...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    } catch (error) {
      console.error('[StuckAgreementMonitor] Error checking for stuck agreements:', error);
    }
  }

  /**
   * Process automatic refund for stuck agreement
   */
  private async processAutomaticRefund(agreementId: string): Promise<void> {
    try {
      console.log(`[StuckAgreementMonitor] 🔄 Starting automatic refund for ${agreementId}`);
      
      const refundService = getRefundService();
      
      // Check refund eligibility
      const eligibility = await refundService.checkRefundEligibility(agreementId);
      
      if (!eligibility.eligible) {
        console.log(
          `[StuckAgreementMonitor] ℹ️  Agreement ${agreementId} not eligible for refund: ${eligibility.reason}`
        );
        return;
      }
      
      console.log(
        `[StuckAgreementMonitor] ✅ Agreement ${agreementId} eligible for refund - processing...`
      );
      
      // Process refunds
      const result = await refundService.processRefunds(agreementId);
      
      if (result.success) {
        console.log(
          `[StuckAgreementMonitor] ✅ Automatic refund successful for ${agreementId} - ${result.refundedDeposits.length} deposit(s) refunded`
        );
      } else {
        console.error(
          `[StuckAgreementMonitor] ❌ Automatic refund failed for ${agreementId}:`,
          result.errors
        );
        throw new Error(`Refund failed: ${result.errors?.map(e => `${e.depositId}: ${e.error}`).join('; ')}`);
      }
    } catch (error) {
      console.error(
        `[StuckAgreementMonitor] ❌ Error processing automatic refund for ${agreementId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Trigger alert callbacks
   */
  private triggerAlert(alert: StuckAgreementAlert): void {
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        console.error('[StuckAgreementMonitor] Error in alert callback:', error);
      }
    }
  }

  /**
   * Get monitor status
   */
  getStatus(): {
    isRunning: boolean;
    config: Required<MonitorConfig>;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
    };
  }

  /**
   * Manually check for stuck agreements (for testing/debugging)
   */
  async manualCheck(): Promise<StuckAgreementAlert[]> {
    const alerts: StuckAgreementAlert[] = [];

    // Temporarily register a callback to collect alerts
    const callback = (alert: StuckAgreementAlert) => {
      alerts.push(alert);
    };

    this.onAlert(callback);
    await this.checkForStuckAgreements();

    // Remove the temporary callback
    const index = this.alertCallbacks.indexOf(callback);
    if (index > -1) {
      this.alertCallbacks.splice(index, 1);
    }

    return alerts;
  }
}

// Singleton instance
let stuckAgreementMonitorInstance: StuckAgreementMonitorService | null = null;

/**
 * Get or create stuck agreement monitor singleton instance
 */
export function getStuckAgreementMonitor(
  config?: MonitorConfig
): StuckAgreementMonitorService {
  if (!stuckAgreementMonitorInstance) {
    stuckAgreementMonitorInstance = new StuckAgreementMonitorService(config);
  }
  return stuckAgreementMonitorInstance;
}

/**
 * Reset monitor instance (useful for testing)
 */
export function resetStuckAgreementMonitor(): void {
  if (stuckAgreementMonitorInstance) {
    stuckAgreementMonitorInstance.stop().catch(console.error);
    stuckAgreementMonitorInstance = null;
  }
}

export default StuckAgreementMonitorService;

