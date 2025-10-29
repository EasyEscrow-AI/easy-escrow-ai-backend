/**
 * Stuck Agreement Monitor Service
 * 
 * Monitors for agreements that are stuck in BOTH_LOCKED status for an unusually long time
 * and alerts when settlement appears to be failing repeatedly
 */

import { prisma } from '../config/database';
import { AgreementStatus } from '../generated/prisma';

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
}

/**
 * Stuck Agreement Monitor Service Class
 */
export class StuckAgreementMonitorService {
  private config: Required<MonitorConfig>;
  private monitorTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private alertCallbacks: Array<(alert: StuckAgreementAlert) => void> = [];

  constructor(config?: MonitorConfig) {
    this.config = {
      warningThresholdMinutes: config?.warningThresholdMinutes || 10, // 10 minutes
      criticalThresholdMinutes: config?.criticalThresholdMinutes || 30, // 30 minutes
      checkIntervalMs: config?.checkIntervalMs || 60000, // 1 minute
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

      // Find agreements stuck in BOTH_LOCKED status
      const stuckAgreements = await prisma.agreement.findMany({
        where: {
          status: AgreementStatus.BOTH_LOCKED,
          updatedAt: {
            lt: warningThreshold, // Updated before warning threshold
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

        console.log(`[StuckAgreementMonitor] ${severity}: ${alert.message}`);

        // Trigger alert callbacks
        this.triggerAlert(alert);
      }
    } catch (error) {
      console.error('[StuckAgreementMonitor] Error checking for stuck agreements:', error);
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

