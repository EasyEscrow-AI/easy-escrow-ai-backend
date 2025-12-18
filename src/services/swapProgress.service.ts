/**
 * Swap Progress Service
 *
 * Provides progress tracking for two-phase swaps including:
 * - Current phase (pending, lock, settle, complete, failed, cancelled, expired)
 * - Progress percentage and transfer counts
 * - Transaction tracking (lock and settlement transactions)
 * - Timestamps for each phase
 * - Rate limiting and caching support
 *
 * @see .taskmaster/tasks/task_013_cnft-delegation-swap.txt
 */

import { TwoPhaseSwapStatus } from '../generated/prisma';
import { SwapStateMachine, TwoPhaseSwapData, StateHistoryEntry } from './swapStateMachine';
import { CacheService } from './cache.service';

// =============================================================================
// Types
// =============================================================================

/**
 * Transaction info for progress response
 */
export interface TransactionInfo {
  /** Transaction signature */
  sig: string;
  /** Transaction status */
  status: 'pending' | 'confirmed' | 'failed';
  /** Transaction type */
  type: 'lock_a' | 'lock_b' | `settle_${number}`;
}

/**
 * Progress details
 */
export interface ProgressDetails {
  /** Total number of transfers needed */
  totalTransfers: number;
  /** Number of completed transfers */
  completedTransfers: number;
  /** Current chunk being processed (1-indexed) */
  currentChunk: number;
  /** Percentage of completion (0-100) */
  percentComplete: number;
}

/**
 * Timestamp information
 */
export interface ProgressTimestamps {
  /** When the swap was created */
  created: string;
  /** When both parties completed locking (optional) */
  lockedAt?: string;
  /** When settlement phase started (optional) */
  settleStarted?: string;
  /** Estimated completion time (optional, during active settlement) */
  estimatedCompletion?: string;
}

/**
 * Error information for failed swaps
 */
export interface ErrorInfo {
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
}

/**
 * Cancellation information
 */
export interface CancellationInfo {
  /** Wallet that cancelled */
  by: string;
  /** Reason for cancellation */
  reason?: string;
}

/**
 * Swap progress phase
 */
export type SwapPhase =
  | 'pending'
  | 'lock'
  | 'settle'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'expired';

/**
 * Full swap progress response
 */
export interface SwapProgressResponse {
  /** Swap ID */
  swapId: string;
  /** Current status */
  status: TwoPhaseSwapStatus;
  /** Current phase */
  phase: SwapPhase;
  /** Progress details */
  progress: ProgressDetails;
  /** Timestamps */
  timestamps: ProgressTimestamps;
  /** Transaction list */
  transactions: TransactionInfo[];
  /** Error info (for failed swaps) */
  error?: ErrorInfo;
  /** Cancellation info (for cancelled swaps) */
  cancellation?: CancellationInfo;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in the window */
  remaining: number;
  /** Seconds until rate limit resets */
  resetInSeconds: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Cache TTL in seconds */
const CACHE_TTL_SECONDS = 2;

/** Cache key prefix */
const CACHE_PREFIX = 'progress:';

/** Rate limit: requests per second per swap */
const RATE_LIMIT_REQUESTS_PER_SECOND = 1;

/** Estimated time per settlement transaction in milliseconds */
const ESTIMATED_MS_PER_SETTLE_TX = 15000; // 15 seconds

// =============================================================================
// Service Class
// =============================================================================

/**
 * Swap Progress Service
 *
 * Provides progress information for two-phase swaps with caching and rate limiting.
 */
export class SwapProgressService {
  private stateMachine: SwapStateMachine;
  private cache: CacheService;
  private rateLimitTracker: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(stateMachine: SwapStateMachine, cache: CacheService) {
    this.stateMachine = stateMachine;
    this.cache = cache;
  }

  /**
   * Get progress for a swap
   *
   * Returns cached response if available and not in terminal state.
   */
  async getProgress(swapId: string): Promise<SwapProgressResponse | null> {
    // Check cache first (unless terminal state)
    const cacheKey = `${CACHE_PREFIX}${swapId}`;
    const cached = await this.cache.get<SwapProgressResponse>(cacheKey);
    if (cached && !this.isTerminalPhase(cached.phase)) {
      return cached;
    }

    // Fetch swap from state machine
    const swap = await this.stateMachine.getSwap(swapId);
    if (!swap) {
      return null;
    }

    // Build progress response
    const response = this.buildProgressResponse(swap);

    // Cache response (skip for terminal states - they won't change)
    if (!this.isTerminalPhase(response.phase)) {
      await this.cache.set(cacheKey, response, CACHE_TTL_SECONDS);
    }

    return response;
  }

  /**
   * Check rate limit for a client
   */
  async checkRateLimit(swapId: string, clientIp: string): Promise<RateLimitResult> {
    const key = `${swapId}:${clientIp}`;
    const now = Date.now();
    const windowMs = 1000; // 1 second window

    let tracker = this.rateLimitTracker.get(key);

    // Check if we're in a new window
    if (!tracker || now - tracker.windowStart >= windowMs) {
      tracker = { count: 0, windowStart: now };
    }

    tracker.count++;
    this.rateLimitTracker.set(key, tracker);

    const allowed = tracker.count <= RATE_LIMIT_REQUESTS_PER_SECOND;
    const remaining = Math.max(0, RATE_LIMIT_REQUESTS_PER_SECOND - tracker.count);
    const resetInSeconds = Math.ceil((tracker.windowStart + windowMs - now) / 1000);

    // Clean up old entries periodically
    if (this.rateLimitTracker.size > 10000) {
      this.cleanupRateLimitTracker();
    }

    return { allowed, remaining, resetInSeconds };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Build progress response from swap data
   */
  private buildProgressResponse(swap: TwoPhaseSwapData): SwapProgressResponse {
    const phase = this.determinePhase(swap.status);
    const progress = this.calculateProgress(swap);
    const timestamps = this.buildTimestamps(swap);
    const transactions = this.buildTransactionList(swap);

    const response: SwapProgressResponse = {
      swapId: swap.id,
      status: swap.status,
      phase,
      progress,
      timestamps,
      transactions,
    };

    // Add error info for failed swaps
    if (swap.status === TwoPhaseSwapStatus.FAILED && swap.errorMessage) {
      response.error = {
        message: swap.errorMessage,
        code: swap.errorCode || undefined,
      };
    }

    // Add cancellation info for cancelled swaps
    if (swap.status === TwoPhaseSwapStatus.CANCELLED && swap.cancelledBy) {
      response.cancellation = {
        by: swap.cancelledBy,
        reason: swap.cancelReason || undefined,
      };
    }

    return response;
  }

  /**
   * Determine the phase based on status
   */
  private determinePhase(status: TwoPhaseSwapStatus): SwapPhase {
    switch (status) {
      case TwoPhaseSwapStatus.CREATED:
      case TwoPhaseSwapStatus.ACCEPTED:
        return 'pending';

      case TwoPhaseSwapStatus.LOCKING_PARTY_A:
      case TwoPhaseSwapStatus.PARTY_A_LOCKED:
      case TwoPhaseSwapStatus.LOCKING_PARTY_B:
      case TwoPhaseSwapStatus.FULLY_LOCKED:
        return 'lock';

      case TwoPhaseSwapStatus.SETTLING:
      case TwoPhaseSwapStatus.PARTIAL_SETTLE:
        return 'settle';

      case TwoPhaseSwapStatus.COMPLETED:
        return 'complete';

      case TwoPhaseSwapStatus.FAILED:
        return 'failed';

      case TwoPhaseSwapStatus.CANCELLED:
        return 'cancelled';

      case TwoPhaseSwapStatus.EXPIRED:
        return 'expired';

      default:
        return 'pending';
    }
  }

  /**
   * Calculate progress based on swap state
   */
  private calculateProgress(swap: TwoPhaseSwapData): ProgressDetails {
    const phase = this.determinePhase(swap.status);

    // For pending phase, no progress yet
    if (phase === 'pending') {
      return {
        totalTransfers: swap.totalSettleTxs || 1,
        completedTransfers: 0,
        currentChunk: 0,
        percentComplete: 0,
      };
    }

    // For lock phase, progress is based on which parties have locked
    if (phase === 'lock') {
      const partyALocked = !!swap.lockTxA;
      const partyBLocked = !!swap.lockTxB;

      let percentComplete = 0;
      if (partyALocked && !partyBLocked) {
        percentComplete = 50;
      } else if (partyALocked && partyBLocked) {
        percentComplete = 100;
      }

      return {
        totalTransfers: swap.totalSettleTxs || 1,
        completedTransfers: 0,
        currentChunk: partyALocked ? (partyBLocked ? 2 : 1) : 0,
        percentComplete,
      };
    }

    // For settle phase, progress is based on completed transactions
    if (phase === 'settle') {
      const totalTransfers = swap.totalSettleTxs || 1;
      const completedTransfers = swap.currentSettleIndex;
      const percentComplete = Math.round((completedTransfers / totalTransfers) * 100);

      return {
        totalTransfers,
        completedTransfers,
        currentChunk: completedTransfers + 1,
        percentComplete,
      };
    }

    // For terminal states
    if (phase === 'complete') {
      return {
        totalTransfers: swap.totalSettleTxs || 1,
        completedTransfers: swap.totalSettleTxs || 1,
        currentChunk: swap.totalSettleTxs || 1,
        percentComplete: 100,
      };
    }

    // For failed/cancelled/expired, show progress at failure point
    return {
      totalTransfers: swap.totalSettleTxs || 1,
      completedTransfers: swap.currentSettleIndex,
      currentChunk: swap.currentSettleIndex,
      percentComplete: Math.round((swap.currentSettleIndex / (swap.totalSettleTxs || 1)) * 100),
    };
  }

  /**
   * Build timestamps object
   */
  private buildTimestamps(swap: TwoPhaseSwapData): ProgressTimestamps {
    const timestamps: ProgressTimestamps = {
      created: swap.createdAt.toISOString(),
    };

    // lockedAt - when both parties are locked (Party B confirms = fully locked)
    if (swap.lockConfirmedB) {
      timestamps.lockedAt = swap.lockConfirmedB.toISOString();
    } else if (swap.lockConfirmedA) {
      // Show Party A lock time if Party B hasn't locked yet
      timestamps.lockedAt = swap.lockConfirmedA.toISOString();
    }

    // settleStarted - find when settlement began from state history
    const settleEntry = swap.stateHistory.find(
      (entry: StateHistoryEntry) => entry.toState === TwoPhaseSwapStatus.SETTLING
    );
    if (settleEntry) {
      timestamps.settleStarted = settleEntry.timestamp;
    }

    // estimatedCompletion - only for active settlement
    const phase = this.determinePhase(swap.status);
    if (phase === 'settle') {
      const remainingTxs = (swap.totalSettleTxs || 1) - swap.currentSettleIndex;
      const estimatedMs = remainingTxs * ESTIMATED_MS_PER_SETTLE_TX;
      const estimatedCompletion = new Date(Date.now() + estimatedMs);
      timestamps.estimatedCompletion = estimatedCompletion.toISOString();
    }

    return timestamps;
  }

  /**
   * Build transaction list
   */
  private buildTransactionList(swap: TwoPhaseSwapData): TransactionInfo[] {
    const transactions: TransactionInfo[] = [];

    // Add lock transactions
    if (swap.lockTxA) {
      transactions.push({
        sig: swap.lockTxA,
        status: 'confirmed',
        type: 'lock_a',
      });
    }

    if (swap.lockTxB) {
      transactions.push({
        sig: swap.lockTxB,
        status: 'confirmed',
        type: 'lock_b',
      });
    }

    // Add settlement transactions
    if (swap.settleTxs && swap.settleTxs.length > 0) {
      swap.settleTxs.forEach((txSig: string, index: number) => {
        transactions.push({
          sig: txSig,
          status: 'confirmed',
          type: `settle_${index + 1}` as `settle_${number}`,
        });
      });
    }

    return transactions;
  }

  /**
   * Check if a phase is terminal (won't change)
   */
  private isTerminalPhase(phase: SwapPhase): boolean {
    return ['complete', 'failed', 'cancelled', 'expired'].includes(phase);
  }

  /**
   * Clean up old rate limit entries
   */
  private cleanupRateLimitTracker(): void {
    const now = Date.now();
    const windowMs = 1000;

    for (const [key, tracker] of this.rateLimitTracker.entries()) {
      if (now - tracker.windowStart >= windowMs * 10) {
        // Keep for 10 seconds before cleanup
        this.rateLimitTracker.delete(key);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a SwapProgressService instance
 */
export function createSwapProgressService(
  stateMachine: SwapStateMachine,
  cache: CacheService
): SwapProgressService {
  return new SwapProgressService(stateMachine, cache);
}
