/**
 * Two-Phase Swap Monitor Service
 *
 * Background service that monitors two-phase swaps and triggers recovery actions:
 * - Detects stuck swaps (no progress for N minutes)
 * - Processes expired swaps (lock phase timeout)
 * - Triggers automatic recovery for partial settlements
 * - Generates alerts for admin intervention
 *
 * Similar to stuck-agreement-monitor.service.ts but for TwoPhaseSwap model.
 *
 * @see .taskmaster/tasks/task_011_cnft-delegation-swap.txt
 */

import { PrismaClient, TwoPhaseSwapStatus } from '../generated/prisma';
import {
  SwapRecoveryService,
  createSwapRecoveryService,
  RecoveryConfig,
  AlertService,
  DelegationRevoker,
  SolReturner,
  SettlementExecutor,
} from './swapRecoveryService';
import { SwapStateMachine, createSwapStateMachine } from './swapStateMachine';

// =============================================================================
// Types
// =============================================================================

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  /** Cron check interval in milliseconds */
  checkIntervalMs: number;
  /** Minutes before considering a swap stuck */
  stuckThresholdMinutes: number;
  /** Enable automatic recovery attempts */
  autoRecoveryEnabled: boolean;
  /** Minutes of lock phase before auto-expiry */
  lockTimeoutMinutes: number;
  /** Maximum age of swaps to check (hours) */
  maxAgeHours: number;
  /** Delay between processing swaps (ms) */
  processingDelayMs: number;
  /** Enable alerts */
  alertsEnabled: boolean;
}

/**
 * Monitor status
 */
export interface MonitorStatus {
  isRunning: boolean;
  lastCheckAt: Date | null;
  checkCount: number;
  stuckSwapsFound: number;
  expiredSwapsProcessed: number;
  recoveryAttempts: number;
  recoverySuccesses: number;
  alertsSent: number;
  errors: number;
}

/**
 * Alert callback type
 */
export type AlertCallback = (
  type: string,
  swapId: string,
  message: string,
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
) => void;

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: MonitorConfig = {
  checkIntervalMs: 60000, // 1 minute
  stuckThresholdMinutes: 10,
  autoRecoveryEnabled: true,
  lockTimeoutMinutes: 30,
  maxAgeHours: 24,
  processingDelayMs: 3000, // 3 seconds between swaps
  alertsEnabled: true,
};

// =============================================================================
// Main Service Class
// =============================================================================

/**
 * Two-Phase Swap Monitor
 *
 * Runs periodic checks for:
 * 1. Expired swaps (lock phase timeout) - triggers expiry and asset return
 * 2. Stuck swaps (no progress) - alerts and optional auto-recovery
 * 3. Failed swaps - alerts for admin intervention
 */
export class TwoPhaseSwapMonitor {
  private prisma: PrismaClient;
  private stateMachine: SwapStateMachine;
  private recoveryService: SwapRecoveryService;
  private config: MonitorConfig;
  private monitorTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private alertCallbacks: AlertCallback[] = [];

  // Status tracking
  private status: MonitorStatus = {
    isRunning: false,
    lastCheckAt: null,
    checkCount: 0,
    stuckSwapsFound: 0,
    expiredSwapsProcessed: 0,
    recoveryAttempts: 0,
    recoverySuccesses: 0,
    alertsSent: 0,
    errors: 0,
  };

  constructor(
    prisma: PrismaClient,
    recoveryService: SwapRecoveryService,
    config?: Partial<MonitorConfig>
  ) {
    this.prisma = prisma;
    this.stateMachine = createSwapStateMachine(prisma);
    this.recoveryService = recoveryService;
    this.config = { ...DEFAULT_CONFIG, ...config };

    console.log('[TwoPhaseSwapMonitor] Initialized with config:', this.config);
  }

  // ===========================================================================
  // Lifecycle Management
  // ===========================================================================

  /**
   * Start the monitor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[TwoPhaseSwapMonitor] Monitor already running');
      return;
    }

    console.log('[TwoPhaseSwapMonitor] Starting monitor...');
    console.log(`[TwoPhaseSwapMonitor] Check interval: ${this.config.checkIntervalMs / 1000}s`);
    console.log(`[TwoPhaseSwapMonitor] Stuck threshold: ${this.config.stuckThresholdMinutes} minutes`);
    console.log(`[TwoPhaseSwapMonitor] Auto-recovery: ${this.config.autoRecoveryEnabled}`);

    this.isRunning = true;
    this.status.isRunning = true;

    // Run initial check
    await this.runCheck();

    // Start periodic checks
    this.monitorTimer = setInterval(async () => {
      await this.runCheck();
    }, this.config.checkIntervalMs);

    console.log('[TwoPhaseSwapMonitor] Monitor started successfully');
  }

  /**
   * Stop the monitor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[TwoPhaseSwapMonitor] Monitor not running');
      return;
    }

    console.log('[TwoPhaseSwapMonitor] Stopping monitor...');

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }

    this.isRunning = false;
    this.status.isRunning = false;

    console.log('[TwoPhaseSwapMonitor] Monitor stopped');
  }

  /**
   * Register alert callback
   */
  onAlert(callback: AlertCallback): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get monitor status
   */
  getStatus(): MonitorStatus {
    return { ...this.status };
  }

  // ===========================================================================
  // Main Check Loop
  // ===========================================================================

  /**
   * Run a single check cycle
   */
  async runCheck(): Promise<void> {
    console.log('[TwoPhaseSwapMonitor] Running check...');

    this.status.checkCount++;
    this.status.lastCheckAt = new Date();

    try {
      // 1. Process expired swaps first (highest priority)
      await this.processExpiredSwaps();

      // 2. Check for stuck swaps
      await this.checkStuckSwaps();

      // 3. Check for failed swaps that need attention
      await this.checkFailedSwaps();
    } catch (error) {
      console.error('[TwoPhaseSwapMonitor] Error during check:', error);
      this.status.errors++;
    }
  }

  // ===========================================================================
  // Expired Swap Processing
  // ===========================================================================

  /**
   * Find and process expired swaps
   */
  private async processExpiredSwaps(): Promise<void> {
    console.log('[TwoPhaseSwapMonitor] Checking for expired swaps...');

    // States that can expire (lock phase states)
    const expirableStates = [
      TwoPhaseSwapStatus.CREATED,
      TwoPhaseSwapStatus.ACCEPTED,
      TwoPhaseSwapStatus.LOCKING_PARTY_A,
      TwoPhaseSwapStatus.PARTY_A_LOCKED,
      TwoPhaseSwapStatus.LOCKING_PARTY_B,
    ];

    const maxAgeThreshold = new Date(
      Date.now() - this.config.maxAgeHours * 60 * 60 * 1000
    );

    const expiredSwaps = await this.prisma.twoPhaseSwap.findMany({
      where: {
        status: { in: expirableStates },
        expiresAt: { lt: new Date() },
        createdAt: { gte: maxAgeThreshold }, // Only recent swaps
      },
      take: 50, // Process in batches
      orderBy: { expiresAt: 'asc' },
    });

    if (expiredSwaps.length === 0) {
      console.log('[TwoPhaseSwapMonitor] No expired swaps found');
      return;
    }

    console.log(
      `[TwoPhaseSwapMonitor] Found ${expiredSwaps.length} expired swap(s)`
    );

    for (const swap of expiredSwaps) {
      try {
        console.log(
          `[TwoPhaseSwapMonitor] Processing expired swap ${swap.id} (status: ${swap.status})`
        );

        const result = await this.recoveryService.recoverExpiredPartialLock(swap.id);

        if (result.success) {
          this.status.expiredSwapsProcessed++;
          console.log(
            `[TwoPhaseSwapMonitor] Expired swap ${swap.id} processed successfully`
          );

          this.sendAlert(
            'SWAP_EXPIRED',
            swap.id,
            `Swap expired and assets returned. Previous status: ${swap.status}`,
            'INFO'
          );
        } else {
          console.error(
            `[TwoPhaseSwapMonitor] Failed to process expired swap ${swap.id}:`,
            result.errorMessage
          );

          this.sendAlert(
            'EXPIRY_FAILED',
            swap.id,
            `Failed to process expired swap: ${result.errorMessage}`,
            'WARNING'
          );
        }

        // Delay between processing
        await this.delay(this.config.processingDelayMs);
      } catch (error) {
        console.error(
          `[TwoPhaseSwapMonitor] Error processing expired swap ${swap.id}:`,
          error
        );
        this.status.errors++;
      }
    }
  }

  // ===========================================================================
  // Stuck Swap Detection
  // ===========================================================================

  /**
   * Check for stuck swaps
   */
  private async checkStuckSwaps(): Promise<void> {
    console.log('[TwoPhaseSwapMonitor] Checking for stuck swaps...');

    const stuckThreshold = new Date(
      Date.now() - this.config.stuckThresholdMinutes * 60 * 1000
    );

    // Active states where swaps shouldn't be idle
    const activeStates = [
      TwoPhaseSwapStatus.LOCKING_PARTY_A,
      TwoPhaseSwapStatus.PARTY_A_LOCKED,
      TwoPhaseSwapStatus.LOCKING_PARTY_B,
      TwoPhaseSwapStatus.SETTLING,
      TwoPhaseSwapStatus.PARTIAL_SETTLE,
    ];

    const stuckSwaps = await this.prisma.twoPhaseSwap.findMany({
      where: {
        status: { in: activeStates },
        updatedAt: { lt: stuckThreshold },
        expiresAt: { gt: new Date() }, // Not yet expired
      },
      take: 20,
      orderBy: { updatedAt: 'asc' },
    });

    if (stuckSwaps.length === 0) {
      console.log('[TwoPhaseSwapMonitor] No stuck swaps found');
      return;
    }

    console.log(`[TwoPhaseSwapMonitor] Found ${stuckSwaps.length} stuck swap(s)`);
    this.status.stuckSwapsFound += stuckSwaps.length;

    for (const swap of stuckSwaps) {
      const stuckMinutes = Math.round(
        (Date.now() - swap.updatedAt.getTime()) / 60000
      );

      console.log(
        `[TwoPhaseSwapMonitor] Swap ${swap.id} stuck in ${swap.status} for ${stuckMinutes} minutes`
      );

      // Determine severity
      const severity =
        stuckMinutes > this.config.stuckThresholdMinutes * 2 ? 'CRITICAL' : 'WARNING';

      // Send alert
      this.sendAlert(
        'STUCK_SWAP',
        swap.id,
        `Swap stuck in ${swap.status} for ${stuckMinutes} minutes`,
        severity
      );

      // Attempt auto-recovery if enabled
      if (this.config.autoRecoveryEnabled) {
        await this.attemptAutoRecovery(swap);
      }

      // Delay between processing
      await this.delay(this.config.processingDelayMs);
    }
  }

  /**
   * Attempt automatic recovery for a stuck swap
   */
  private async attemptAutoRecovery(swap: any): Promise<void> {
    console.log(`[TwoPhaseSwapMonitor] Attempting auto-recovery for ${swap.id}`);

    this.status.recoveryAttempts++;

    try {
      // Only auto-recover settlement issues
      if (
        swap.status === TwoPhaseSwapStatus.PARTIAL_SETTLE ||
        swap.status === TwoPhaseSwapStatus.SETTLING
      ) {
        const result = await this.recoveryService.recoverPartialSettlement(swap.id);

        if (result.success) {
          this.status.recoverySuccesses++;
          console.log(
            `[TwoPhaseSwapMonitor] Auto-recovery succeeded for ${swap.id}`
          );

          this.sendAlert(
            'RECOVERY_SUCCESS',
            swap.id,
            `Auto-recovery succeeded. Swap now ${result.finalState}`,
            'INFO'
          );
        } else {
          console.log(
            `[TwoPhaseSwapMonitor] Auto-recovery failed for ${swap.id}: ${result.errorMessage}`
          );

          this.sendAlert(
            'RECOVERY_FAILED',
            swap.id,
            `Auto-recovery failed: ${result.errorMessage}. Manual intervention may be required.`,
            'CRITICAL'
          );
        }
      } else {
        // Can't auto-recover lock phase issues
        console.log(
          `[TwoPhaseSwapMonitor] Cannot auto-recover swap ${swap.id} in state ${swap.status}`
        );

        this.sendAlert(
          'MANUAL_INTERVENTION',
          swap.id,
          `Swap stuck in ${swap.status} - cannot auto-recover. Manual intervention required.`,
          'CRITICAL'
        );
      }
    } catch (error) {
      console.error(
        `[TwoPhaseSwapMonitor] Error during auto-recovery for ${swap.id}:`,
        error
      );
      this.status.errors++;
    }
  }

  // ===========================================================================
  // Failed Swap Monitoring
  // ===========================================================================

  /**
   * Check for failed swaps that need admin attention
   */
  private async checkFailedSwaps(): Promise<void> {
    console.log('[TwoPhaseSwapMonitor] Checking for failed swaps...');

    const recentThreshold = new Date(
      Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
    );

    const failedSwaps = await this.prisma.twoPhaseSwap.findMany({
      where: {
        status: TwoPhaseSwapStatus.FAILED,
        failedAt: { gte: recentThreshold },
      },
      take: 10,
      orderBy: { failedAt: 'desc' },
    });

    if (failedSwaps.length === 0) {
      console.log('[TwoPhaseSwapMonitor] No recent failed swaps');
      return;
    }

    console.log(
      `[TwoPhaseSwapMonitor] ${failedSwaps.length} failed swap(s) in last 24h`
    );

    // Just alert for failed swaps - don't auto-recover
    for (const swap of failedSwaps) {
      const hoursSinceFailed = swap.failedAt
        ? Math.round((Date.now() - swap.failedAt.getTime()) / 3600000)
        : 0;

      // Only alert once per swap (check state history or use separate tracking)
      // For now, just log and send a single alert type
      if (hoursSinceFailed < 1) {
        this.sendAlert(
          'SWAP_FAILED',
          swap.id,
          `Swap failed: ${swap.errorMessage || 'Unknown error'}. Error code: ${swap.errorCode || 'N/A'}`,
          'CRITICAL'
        );
      }
    }
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Send an alert
   */
  private sendAlert(
    type: string,
    swapId: string,
    message: string,
    severity: 'INFO' | 'WARNING' | 'CRITICAL'
  ): void {
    if (!this.config.alertsEnabled) {
      return;
    }

    this.status.alertsSent++;

    console.log(`[TwoPhaseSwapMonitor] ALERT [${severity}] ${type}: ${message}`);

    for (const callback of this.alertCallbacks) {
      try {
        callback(type, swapId, message, severity);
      } catch (error) {
        console.error('[TwoPhaseSwapMonitor] Error in alert callback:', error);
      }
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Manually trigger a check (for testing)
   */
  async manualCheck(): Promise<void> {
    await this.runCheck();
  }
}

// =============================================================================
// Factory and Singleton
// =============================================================================

let monitorInstance: TwoPhaseSwapMonitor | null = null;

/**
 * Get or create the monitor singleton
 */
export function getTwoPhaseSwapMonitor(
  prisma: PrismaClient,
  recoveryService: SwapRecoveryService,
  config?: Partial<MonitorConfig>
): TwoPhaseSwapMonitor {
  if (!monitorInstance) {
    monitorInstance = new TwoPhaseSwapMonitor(prisma, recoveryService, config);
  }
  return monitorInstance;
}

/**
 * Reset monitor instance (for testing)
 */
export function resetTwoPhaseSwapMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop().catch(console.error);
    monitorInstance = null;
  }
}
