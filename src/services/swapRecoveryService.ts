/**
 * Swap State Recovery Service
 *
 * Implements recovery mechanisms for interrupted two-phase swaps and monitoring.
 *
 * Recovery Scenarios:
 * 1. Lock tx failed - Retry submission up to N times, revert to previous state if persistent
 * 2. Partial lock timeout - Revoke delegations, release escrowed assets, mark EXPIRED
 * 3. Partial settlement - Resume from currentSettleIndex, retry failed chunks
 * 4. Complete failure - Mark FAILED, alert admin, support manual intervention
 *
 * @see .taskmaster/tasks/task_011_cnft-delegation-swap.txt
 */

import { PrismaClient, TwoPhaseSwapStatus } from '../generated/prisma';
import {
  SwapStateMachine,
  TwoPhaseSwapData,
  AssetDelegationStatus,
} from './swapStateMachine';

// =============================================================================
// Types
// =============================================================================

/**
 * Error codes for recovery operations
 */
export enum RecoveryErrorCode {
  SWAP_NOT_FOUND = 'SWAP_NOT_FOUND',
  INVALID_STATE = 'INVALID_STATE',
  RECOVERY_IN_PROGRESS = 'RECOVERY_IN_PROGRESS',
  LOCK_RETRY_EXHAUSTED = 'LOCK_RETRY_EXHAUSTED',
  SETTLEMENT_FAILED = 'SETTLEMENT_FAILED',
  DELEGATION_REVOKE_FAILED = 'DELEGATION_REVOKE_FAILED',
  SOL_RETURN_FAILED = 'SOL_RETURN_FAILED',
  ROLLBACK_PARTIAL_FAILURE = 'ROLLBACK_PARTIAL_FAILURE',
  ADMIN_RETRY_FAILED = 'ADMIN_RETRY_FAILED',
  NOT_EXPIRED = 'NOT_EXPIRED',
}

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  success: boolean;
  swapId: string;
  finalState?: TwoPhaseSwapStatus;
  errorMessage?: string;
  errorCode?: RecoveryErrorCode;
  retriesAttempted?: number;
  chunksRecovered?: number;
  assetsReturned?: number;
  recoveryAttempted?: boolean;
}

/**
 * Stuck swap alert
 */
export interface StuckSwapAlert {
  swapId: string;
  status: TwoPhaseSwapStatus;
  stuckDurationMinutes: number;
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
}

/**
 * Recovery service configuration
 */
export interface RecoveryConfig {
  /** Maximum number of retry attempts for lock/settlement */
  maxRetries: number;
  /** Minutes of no progress before a swap is considered stuck */
  stuckThresholdMinutes: number;
  /** Minutes before lock phase timeout */
  lockTimeoutMinutes: number;
}

/**
 * Delegation revoker interface
 */
export interface DelegationRevoker {
  revokeDelegation(assetId: string): Promise<{ success: boolean; signature?: string }>;
}

/**
 * SOL returner interface
 */
export interface SolReturner {
  returnEscrowedSol(
    vaultPda: string,
    toWallet: string,
    amount: bigint
  ): Promise<{ success: boolean; signature?: string }>;
}

/**
 * Settlement executor interface
 */
export interface SettlementExecutor {
  executeSettlementChunk(
    swapId: string,
    chunkIndex: number
  ): Promise<{ success: boolean; signature?: string }>;
}

/**
 * Alert service interface
 */
export interface AlertService {
  sendAlert(type: string, swapId: string, message: string): Promise<void>;
}

/**
 * Recovery service dependencies
 */
export interface RecoveryServiceDependencies {
  prisma: PrismaClient;
  stateMachine: SwapStateMachine;
  delegationRevoker: DelegationRevoker;
  solReturner: SolReturner;
  settlementExecutor: SettlementExecutor;
  alertService: AlertService;
  config?: Partial<RecoveryConfig>;
}

/**
 * Options for lock failure recovery
 */
export interface LockRecoveryOptions {
  retryLockFn: () => Promise<boolean>;
}

/**
 * Options for marking as failed
 */
export interface MarkFailedOptions {
  errorMessage: string;
  errorCode: RecoveryErrorCode;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: RecoveryConfig = {
  maxRetries: 3,
  stuckThresholdMinutes: 10,
  lockTimeoutMinutes: 30,
};

// =============================================================================
// Main Service Class
// =============================================================================

/**
 * Swap State Recovery Service
 *
 * Handles recovery from various failure scenarios in two-phase swaps:
 * - Lock transaction failures
 * - Partial lock timeouts
 * - Partial settlement recovery
 * - Complete failure handling
 * - Stuck swap detection and automatic recovery
 */
export class SwapRecoveryService {
  private prisma: PrismaClient;
  private stateMachine: SwapStateMachine;
  private delegationRevoker: DelegationRevoker;
  private solReturner: SolReturner;
  private settlementExecutor: SettlementExecutor;
  private alertService: AlertService;
  private config: RecoveryConfig;

  // Track swaps currently being recovered to prevent concurrent recovery
  private recoveryLocks: Set<string> = new Set();

  constructor(deps: RecoveryServiceDependencies) {
    this.prisma = deps.prisma;
    this.stateMachine = deps.stateMachine;
    this.delegationRevoker = deps.delegationRevoker;
    this.solReturner = deps.solReturner;
    this.settlementExecutor = deps.settlementExecutor;
    this.alertService = deps.alertService;
    this.config = { ...DEFAULT_CONFIG, ...deps.config };

    console.log('[SwapRecoveryService] Initialized with config:', this.config);
  }

  // ===========================================================================
  // Lock Management for Concurrent Recovery Prevention
  // ===========================================================================

  /**
   * Acquire lock for recovery operation
   */
  private acquireLock(swapId: string): boolean {
    if (this.recoveryLocks.has(swapId)) {
      return false;
    }
    this.recoveryLocks.add(swapId);
    return true;
  }

  /**
   * Release lock after recovery operation
   */
  private releaseLock(swapId: string): void {
    this.recoveryLocks.delete(swapId);
  }

  // ===========================================================================
  // Recovery Scenario 1: Lock Transaction Failed
  // ===========================================================================

  /**
   * Recover from lock transaction failure
   *
   * Retries lock submission up to maxRetries times.
   * If all retries fail, reverts to previous state.
   *
   * @param swapId - Swap ID to recover
   * @param options - Recovery options including retry function
   */
  async recoverLockFailure(
    swapId: string,
    options: LockRecoveryOptions
  ): Promise<RecoveryResult> {
    console.log(`[SwapRecoveryService] Recovering lock failure for swap ${swapId}`);

    // Check if already being recovered
    if (!this.acquireLock(swapId)) {
      return {
        success: false,
        swapId,
        errorCode: RecoveryErrorCode.RECOVERY_IN_PROGRESS,
        errorMessage: 'Recovery already in progress for this swap',
      };
    }

    try {
      const swap = await this.stateMachine.getSwap(swapId);
      if (!swap) {
        return {
          success: false,
          swapId,
          errorCode: RecoveryErrorCode.SWAP_NOT_FOUND,
          errorMessage: 'Swap not found',
        };
      }

      // Validate state is LOCKING_PARTY_A or LOCKING_PARTY_B
      if (
        swap.status !== TwoPhaseSwapStatus.LOCKING_PARTY_A &&
        swap.status !== TwoPhaseSwapStatus.LOCKING_PARTY_B
      ) {
        return {
          success: false,
          swapId,
          errorCode: RecoveryErrorCode.INVALID_STATE,
          errorMessage: `Cannot recover lock failure in state ${swap.status}`,
        };
      }

      // Retry lock submission
      let retriesAttempted = 0;
      let success = false;

      while (retriesAttempted < this.config.maxRetries && !success) {
        retriesAttempted++;
        console.log(
          `[SwapRecoveryService] Lock retry attempt ${retriesAttempted}/${this.config.maxRetries}`
        );

        try {
          success = await options.retryLockFn();
          if (success) {
            console.log(`[SwapRecoveryService] Lock retry succeeded on attempt ${retriesAttempted}`);
          }
        } catch (error) {
          console.error(`[SwapRecoveryService] Lock retry attempt ${retriesAttempted} failed:`, error);
        }
      }

      if (success) {
        return {
          success: true,
          swapId,
          retriesAttempted,
        };
      }

      // All retries failed - revert to previous state
      console.log(`[SwapRecoveryService] All lock retries exhausted, reverting to previous state`);

      const previousState =
        swap.status === TwoPhaseSwapStatus.LOCKING_PARTY_A
          ? TwoPhaseSwapStatus.ACCEPTED
          : TwoPhaseSwapStatus.PARTY_A_LOCKED;

      await this.stateMachine.transition(swapId, previousState, {
        reason: `Lock failed after ${retriesAttempted} retries`,
        triggeredBy: 'recovery-service',
      });

      // Send alert
      await this.alertService.sendAlert(
        'LOCK_FAILURE',
        swapId,
        `Lock transaction failed after ${retriesAttempted} retries. Reverted to ${previousState}.`
      );

      return {
        success: false,
        swapId,
        finalState: previousState,
        errorCode: RecoveryErrorCode.LOCK_RETRY_EXHAUSTED,
        errorMessage: `Lock failed after ${retriesAttempted} retries`,
        retriesAttempted,
      };
    } finally {
      this.releaseLock(swapId);
    }
  }

  // ===========================================================================
  // Recovery Scenario 2: Partial Lock Timeout
  // ===========================================================================

  /**
   * Recover from expired partial lock
   *
   * When one party locked but the other didn't before timeout:
   * - Revokes delegations for locked party
   * - Returns escrowed SOL to locked party
   * - Marks swap as EXPIRED
   *
   * @param swapId - Swap ID to recover
   */
  async recoverExpiredPartialLock(swapId: string): Promise<RecoveryResult> {
    console.log(`[SwapRecoveryService] Recovering expired partial lock for swap ${swapId}`);

    if (!this.acquireLock(swapId)) {
      return {
        success: false,
        swapId,
        errorCode: RecoveryErrorCode.RECOVERY_IN_PROGRESS,
        errorMessage: 'Recovery already in progress for this swap',
      };
    }

    try {
      const swap = await this.stateMachine.getSwap(swapId);
      if (!swap) {
        return {
          success: false,
          swapId,
          errorCode: RecoveryErrorCode.SWAP_NOT_FOUND,
          errorMessage: 'Swap not found',
        };
      }

      // Check if actually expired
      if (swap.expiresAt > new Date()) {
        return {
          success: false,
          swapId,
          errorCode: RecoveryErrorCode.NOT_EXPIRED,
          errorMessage: 'Swap has not expired yet',
        };
      }

      // Validate state allows expiry recovery
      const validStates: TwoPhaseSwapStatus[] = [
        TwoPhaseSwapStatus.CREATED,
        TwoPhaseSwapStatus.ACCEPTED,
        TwoPhaseSwapStatus.LOCKING_PARTY_A,
        TwoPhaseSwapStatus.PARTY_A_LOCKED,
        TwoPhaseSwapStatus.LOCKING_PARTY_B,
      ];

      if (!validStates.includes(swap.status)) {
        return {
          success: false,
          swapId,
          errorCode: RecoveryErrorCode.INVALID_STATE,
          errorMessage: `Cannot expire swap in state ${swap.status}`,
        };
      }

      let assetsReturned = 0;

      // Revoke delegations for Party A if they locked
      if (
        swap.status === TwoPhaseSwapStatus.PARTY_A_LOCKED ||
        swap.status === TwoPhaseSwapStatus.LOCKING_PARTY_B
      ) {
        const delegationStatus = swap.delegationStatus || {};

        for (const asset of swap.assetsA) {
          if (asset.type === 'CNFT') {
            const assetStatus = delegationStatus[asset.identifier];
            if (assetStatus?.delegated) {
              console.log(`[SwapRecoveryService] Revoking delegation for ${asset.identifier}`);
              const result = await this.delegationRevoker.revokeDelegation(asset.identifier);
              if (result.success) {
                assetsReturned++;
              } else {
                console.error(
                  `[SwapRecoveryService] Failed to revoke delegation for ${asset.identifier}`
                );
              }
            }
          }
        }

        // Return escrowed SOL for Party A
        if (swap.solAmountA && swap.solAmountA > BigInt(0)) {
          console.log(`[SwapRecoveryService] Returning ${swap.solAmountA} lamports to Party A`);
          const result = await this.solReturner.returnEscrowedSol(
            `sol-vault-${swapId}-A`,
            swap.partyA,
            swap.solAmountA
          );
          if (result.success) {
            assetsReturned++;
          }
        }
      }

      // Transition to EXPIRED
      await this.stateMachine.expireSwap(swapId);

      return {
        success: true,
        swapId,
        finalState: TwoPhaseSwapStatus.EXPIRED,
        assetsReturned,
      };
    } finally {
      this.releaseLock(swapId);
    }
  }

  // ===========================================================================
  // Recovery Scenario 3: Partial Settlement
  // ===========================================================================

  /**
   * Recover from partial settlement
   *
   * Resumes settlement from currentSettleIndex, retrying failed chunks.
   *
   * @param swapId - Swap ID to recover
   */
  async recoverPartialSettlement(swapId: string): Promise<RecoveryResult> {
    console.log(`[SwapRecoveryService] Recovering partial settlement for swap ${swapId}`);

    if (!this.acquireLock(swapId)) {
      return {
        success: false,
        swapId,
        errorCode: RecoveryErrorCode.RECOVERY_IN_PROGRESS,
        errorMessage: 'Recovery already in progress for this swap',
      };
    }

    try {
      return await this.recoverPartialSettlementInternal(swapId);
    } finally {
      this.releaseLock(swapId);
    }
  }

  /**
   * Internal partial settlement recovery (no locking)
   * Used by adminRetrySettlement to avoid deadlock
   */
  private async recoverPartialSettlementInternal(swapId: string): Promise<RecoveryResult> {
    const swap = await this.stateMachine.getSwap(swapId);
    if (!swap) {
      return {
        success: false,
        swapId,
        errorCode: RecoveryErrorCode.SWAP_NOT_FOUND,
        errorMessage: 'Swap not found',
      };
    }

    // Validate state
    if (
      swap.status !== TwoPhaseSwapStatus.SETTLING &&
      swap.status !== TwoPhaseSwapStatus.PARTIAL_SETTLE
    ) {
      return {
        success: false,
        swapId,
        errorCode: RecoveryErrorCode.INVALID_STATE,
        errorMessage: `Cannot recover settlement in state ${swap.status}`,
      };
    }

    let chunksRecovered = 0;
    let currentIndex = swap.currentSettleIndex;
    const totalChunks = swap.totalSettleTxs;

    console.log(
      `[SwapRecoveryService] Resuming from chunk ${currentIndex}/${totalChunks}`
    );

    // Process remaining chunks
    while (currentIndex < totalChunks) {
      let chunkSuccess = false;
      let retries = 0;

      // Retry each chunk up to maxRetries times
      while (!chunkSuccess && retries < this.config.maxRetries) {
        retries++;
        console.log(
          `[SwapRecoveryService] Executing chunk ${currentIndex}, attempt ${retries}`
        );

        const result = await this.settlementExecutor.executeSettlementChunk(
          swapId,
          currentIndex
        );

        if (result.success) {
          chunkSuccess = true;
          chunksRecovered++;

          // Record settlement transaction
          await this.stateMachine.recordSettlementTx(
            swapId,
            result.signature || `settle-tx-${currentIndex}`,
            'recovery-service'
          );
        }
      }

      if (!chunkSuccess) {
        console.error(
          `[SwapRecoveryService] Chunk ${currentIndex} failed after ${retries} retries`
        );
        return {
          success: false,
          swapId,
          errorCode: RecoveryErrorCode.SETTLEMENT_FAILED,
          errorMessage: `Settlement chunk ${currentIndex} failed after ${retries} retries`,
          chunksRecovered,
        };
      }

      currentIndex++;
    }

    // Get final state
    const updatedSwap = await this.stateMachine.getSwap(swapId);

    return {
      success: true,
      swapId,
      finalState: updatedSwap?.status || TwoPhaseSwapStatus.COMPLETED,
      chunksRecovered,
    };
  }

  // ===========================================================================
  // Recovery Scenario 4: Complete Failure
  // ===========================================================================

  /**
   * Mark swap as FAILED
   *
   * Used when a swap has encountered an unrecoverable error.
   * Alerts admin for manual intervention.
   *
   * @param swapId - Swap ID to mark as failed
   * @param options - Error details
   */
  async markAsFailed(swapId: string, options: MarkFailedOptions): Promise<RecoveryResult> {
    console.log(`[SwapRecoveryService] Marking swap ${swapId} as FAILED`);

    const swap = await this.stateMachine.getSwap(swapId);
    if (!swap) {
      return {
        success: false,
        swapId,
        errorCode: RecoveryErrorCode.SWAP_NOT_FOUND,
        errorMessage: 'Swap not found',
      };
    }

    // Transition to FAILED
    const result = await this.stateMachine.failSwap(
      swapId,
      options.errorMessage,
      options.errorCode,
      'recovery-service'
    );

    if (!result.success) {
      return {
        success: false,
        swapId,
        errorCode: RecoveryErrorCode.INVALID_STATE,
        errorMessage: result.error || 'Failed to mark swap as FAILED',
      };
    }

    // Alert admin
    await this.alertService.sendAlert(
      'SWAP_FAILED',
      swapId,
      `Swap failed: ${options.errorMessage}. Error code: ${options.errorCode}`
    );

    return {
      success: true,
      swapId,
      finalState: TwoPhaseSwapStatus.FAILED,
    };
  }

  /**
   * Admin retry settlement for a FAILED swap
   *
   * Allows admin to manually retry settlement after fixing underlying issues.
   *
   * @param swapId - Swap ID to retry
   */
  async adminRetrySettlement(swapId: string): Promise<RecoveryResult> {
    console.log(`[SwapRecoveryService] Admin retry settlement for swap ${swapId}`);

    if (!this.acquireLock(swapId)) {
      return {
        success: false,
        swapId,
        errorCode: RecoveryErrorCode.RECOVERY_IN_PROGRESS,
        errorMessage: 'Recovery already in progress for this swap',
      };
    }

    try {
      const swap = await this.stateMachine.getSwap(swapId);
      if (!swap) {
        return {
          success: false,
          swapId,
          errorCode: RecoveryErrorCode.SWAP_NOT_FOUND,
          errorMessage: 'Swap not found',
        };
      }

      if (swap.status !== TwoPhaseSwapStatus.FAILED) {
        return {
          success: false,
          swapId,
          errorCode: RecoveryErrorCode.INVALID_STATE,
          errorMessage: `Cannot retry settlement in state ${swap.status}`,
        };
      }

      // Transition back to PARTIAL_SETTLE to allow recovery
      await this.prisma.twoPhaseSwap.update({
        where: { id: swapId },
        data: {
          status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
          errorMessage: null,
          errorCode: null,
          failedAt: null,
        },
      });

      // Now recover the partial settlement (use internal method to avoid deadlock)
      const result = await this.recoverPartialSettlementInternal(swapId);

      if (!result.success) {
        // Mark as failed again
        await this.markAsFailed(swapId, {
          errorMessage: result.errorMessage || 'Admin retry failed',
          errorCode: RecoveryErrorCode.ADMIN_RETRY_FAILED,
        });
      }

      return result;
    } finally {
      this.releaseLock(swapId);
    }
  }

  /**
   * Admin rollback a FAILED swap
   *
   * Revokes all delegations and returns all escrowed assets to original owners.
   *
   * @param swapId - Swap ID to rollback
   */
  async adminRollback(swapId: string): Promise<RecoveryResult> {
    console.log(`[SwapRecoveryService] Admin rollback for swap ${swapId}`);

    if (!this.acquireLock(swapId)) {
      return {
        success: false,
        swapId,
        errorCode: RecoveryErrorCode.RECOVERY_IN_PROGRESS,
        errorMessage: 'Recovery already in progress for this swap',
      };
    }

    try {
      const swap = await this.stateMachine.getSwap(swapId);
      if (!swap) {
        return {
          success: false,
          swapId,
          errorCode: RecoveryErrorCode.SWAP_NOT_FOUND,
          errorMessage: 'Swap not found',
        };
      }

      const delegationStatus = swap.delegationStatus || {};
      let assetsReturned = 0;
      let failures: string[] = [];

      // Revoke all delegations for Party A
      for (const asset of swap.assetsA) {
        if (asset.type === 'CNFT') {
          const assetStatus = delegationStatus[asset.identifier];
          if (assetStatus?.delegated) {
            console.log(`[SwapRecoveryService] Revoking delegation for ${asset.identifier}`);
            const result = await this.delegationRevoker.revokeDelegation(asset.identifier);
            if (result.success) {
              assetsReturned++;
            } else {
              failures.push(`delegation-${asset.identifier}`);
            }
          }
        }
      }

      // Revoke all delegations for Party B
      for (const asset of swap.assetsB) {
        if (asset.type === 'CNFT') {
          const assetStatus = delegationStatus[asset.identifier];
          if (assetStatus?.delegated) {
            console.log(`[SwapRecoveryService] Revoking delegation for ${asset.identifier}`);
            const result = await this.delegationRevoker.revokeDelegation(asset.identifier);
            if (result.success) {
              assetsReturned++;
            } else {
              failures.push(`delegation-${asset.identifier}`);
            }
          }
        }
      }

      // Return SOL to Party A
      if (swap.solAmountA && swap.solAmountA > BigInt(0)) {
        console.log(`[SwapRecoveryService] Returning ${swap.solAmountA} lamports to Party A`);
        const result = await this.solReturner.returnEscrowedSol(
          `sol-vault-${swapId}-A`,
          swap.partyA,
          swap.solAmountA
        );
        if (result.success) {
          assetsReturned++;
        } else {
          failures.push('sol-partyA');
        }
      }

      // Return SOL to Party B
      if (swap.solAmountB && swap.solAmountB > BigInt(0) && swap.partyB) {
        console.log(`[SwapRecoveryService] Returning ${swap.solAmountB} lamports to Party B`);
        const result = await this.solReturner.returnEscrowedSol(
          `sol-vault-${swapId}-B`,
          swap.partyB,
          swap.solAmountB
        );
        if (result.success) {
          assetsReturned++;
        } else {
          failures.push('sol-partyB');
        }
      }

      // Check for partial failures
      if (failures.length > 0) {
        await this.alertService.sendAlert(
          'ROLLBACK_PARTIAL_FAILURE',
          swapId,
          `Rollback partially failed. Failed items: ${failures.join(', ')}`
        );

        return {
          success: false,
          swapId,
          errorCode: RecoveryErrorCode.ROLLBACK_PARTIAL_FAILURE,
          errorMessage: `Rollback partially failed: ${failures.join(', ')}`,
          assetsReturned,
        };
      }

      // Update swap to reflect rollback
      await this.prisma.twoPhaseSwap.update({
        where: { id: swapId },
        data: {
          cancelledBy: 'admin',
          cancelledAt: new Date(),
          cancelReason: 'Admin rollback after failure',
        },
      });

      return {
        success: true,
        swapId,
        assetsReturned,
      };
    } finally {
      this.releaseLock(swapId);
    }
  }

  // ===========================================================================
  // Stuck Swap Detection
  // ===========================================================================

  /**
   * Find swaps that are stuck (no progress for N minutes)
   */
  async findStuckSwaps(): Promise<TwoPhaseSwapData[]> {
    const stuckThreshold = new Date(
      Date.now() - this.config.stuckThresholdMinutes * 60 * 1000
    );

    // States that indicate swap is in progress and shouldn't be idle
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
      orderBy: { updatedAt: 'asc' },
    });

    return stuckSwaps.map((swap) => this.mapToSwapData(swap));
  }

  /**
   * Process stuck swaps with automatic recovery
   */
  async processStuckSwaps(): Promise<RecoveryResult[]> {
    console.log('[SwapRecoveryService] Processing stuck swaps');

    const stuckSwaps = await this.findStuckSwaps();
    const results: RecoveryResult[] = [];

    for (const swap of stuckSwaps) {
      console.log(`[SwapRecoveryService] Processing stuck swap ${swap.id} in state ${swap.status}`);

      let result: RecoveryResult;

      // Attempt automatic recovery based on state
      if (
        swap.status === TwoPhaseSwapStatus.PARTIAL_SETTLE ||
        swap.status === TwoPhaseSwapStatus.SETTLING
      ) {
        result = await this.recoverPartialSettlement(swap.id);
        result.recoveryAttempted = true;
      } else {
        // For other states, just alert - can't auto-recover lock issues
        result = {
          success: false,
          swapId: swap.id,
          recoveryAttempted: false,
          errorMessage: `Cannot auto-recover swap in state ${swap.status}`,
        };
      }

      // If recovery failed, escalate to admin
      if (!result.success) {
        await this.alertService.sendAlert(
          'ADMIN_ESCALATION',
          swap.id,
          `Swap stuck in ${swap.status} - automatic recovery ${result.recoveryAttempted ? 'failed' : 'not possible'}. Manual intervention required.`
        );
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Check for stuck swaps and generate alerts
   */
  async checkAndAlertStuckSwaps(): Promise<void> {
    const stuckSwaps = await this.findStuckSwaps();

    for (const swap of stuckSwaps) {
      const stuckDuration = Date.now() - swap.updatedAt.getTime();
      const stuckMinutes = Math.round(stuckDuration / 60000);

      await this.alertService.sendAlert(
        'STUCK_SWAP',
        swap.id,
        `Swap stuck in ${swap.status} for ${stuckMinutes} minutes`
      );
    }
  }

  // ===========================================================================
  // Expiry Processing
  // ===========================================================================

  /**
   * Process all expired swaps in batch
   */
  async processExpiredSwaps(): Promise<{ processed: number; failed: number }> {
    console.log('[SwapRecoveryService] Processing expired swaps');

    const expirableStates = [
      TwoPhaseSwapStatus.CREATED,
      TwoPhaseSwapStatus.ACCEPTED,
      TwoPhaseSwapStatus.LOCKING_PARTY_A,
      TwoPhaseSwapStatus.PARTY_A_LOCKED,
      TwoPhaseSwapStatus.LOCKING_PARTY_B,
    ];

    const expiredSwaps = await this.prisma.twoPhaseSwap.findMany({
      where: {
        status: { in: expirableStates },
        expiresAt: { lt: new Date() },
      },
      take: 100, // Process in batches
      orderBy: { expiresAt: 'asc' },
    });

    let processed = 0;
    let failed = 0;

    for (const swap of expiredSwaps) {
      try {
        const result = await this.recoverExpiredPartialLock(swap.id);
        if (result.success) {
          processed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`[SwapRecoveryService] Error processing expired swap ${swap.id}:`, error);
        failed++;
      }
    }

    console.log(`[SwapRecoveryService] Processed ${processed} expired swaps, ${failed} failed`);
    return { processed, failed };
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Map database model to TwoPhaseSwapData
   */
  private mapToSwapData(swap: any): TwoPhaseSwapData {
    return {
      id: swap.id,
      status: swap.status,
      createdAt: swap.createdAt,
      updatedAt: swap.updatedAt,
      expiresAt: swap.expiresAt,
      partyA: swap.partyA,
      partyB: swap.partyB,
      assetsA: swap.assetsA as any[],
      assetsB: swap.assetsB as any[],
      solAmountA: swap.solAmountA ? BigInt(swap.solAmountA) : null,
      solAmountB: swap.solAmountB ? BigInt(swap.solAmountB) : null,
      lockTxA: swap.lockTxA,
      lockTxB: swap.lockTxB,
      lockConfirmedA: swap.lockConfirmedA,
      lockConfirmedB: swap.lockConfirmedB,
      settleTxs: swap.settleTxs as string[],
      currentSettleIndex: swap.currentSettleIndex,
      totalSettleTxs: swap.totalSettleTxs,
      finalSettleTx: swap.finalSettleTx,
      settledAt: swap.settledAt,
      errorMessage: swap.errorMessage,
      errorCode: swap.errorCode,
      failedAt: swap.failedAt,
      cancelledBy: swap.cancelledBy,
      cancelledAt: swap.cancelledAt,
      cancelReason: swap.cancelReason,
      platformFeeLamports: BigInt(swap.platformFeeLamports),
      swapOfferId: swap.swapOfferId,
      delegationStatus: swap.delegationStatus as Record<string, AssetDelegationStatus>,
      stateHistory: swap.stateHistory as any[],
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a SwapRecoveryService instance
 */
export function createSwapRecoveryService(
  deps: RecoveryServiceDependencies
): SwapRecoveryService {
  return new SwapRecoveryService(deps);
}
