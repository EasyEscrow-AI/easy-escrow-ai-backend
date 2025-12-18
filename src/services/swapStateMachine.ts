/**
 * Two-Phase Swap State Machine Service
 *
 * Manages state transitions for bulk and cNFT swaps using a two-phase approach:
 * 1. Lock Phase: Both parties delegate/escrow their assets
 * 2. Settle Phase: Assets are atomically transferred
 *
 * This enables safe multi-transaction swaps where both parties must lock
 * before any transfers occur, preventing partial execution risks.
 *
 * @see .taskmaster/tasks/task_008_cnft-delegation-swap.txt
 */

import { PrismaClient, TwoPhaseSwapStatus } from '../generated/prisma';

// =============================================================================
// Types
// =============================================================================

/**
 * Asset information for a two-phase swap
 */
export interface SwapAsset {
  /** Asset type: NFT, CNFT, or CORE_NFT */
  type: 'NFT' | 'CNFT' | 'CORE_NFT';
  /** Asset identifier (mint address for NFT/CORE_NFT, asset ID for CNFT) */
  identifier: string;
  /** Optional metadata for display purposes */
  metadata?: {
    name?: string;
    image?: string;
    collection?: string;
  };
}

/**
 * Per-asset delegation status tracking
 */
export interface AssetDelegationStatus {
  /** Asset identifier */
  assetId: string;
  /** Whether the asset has been delegated */
  delegated: boolean;
  /** Delegation transaction signature */
  delegateTxId?: string;
  /** When delegation was confirmed */
  delegatedAt?: string;
  /** Current delegate PDA */
  delegatePda?: string;
}

/**
 * State history entry for audit trail
 */
export interface StateHistoryEntry {
  /** Previous state */
  fromState: TwoPhaseSwapStatus;
  /** New state */
  toState: TwoPhaseSwapStatus;
  /** When the transition occurred */
  timestamp: string;
  /** Reason for the transition */
  reason?: string;
  /** Wallet that triggered the transition (if applicable) */
  triggeredBy?: string;
}

/**
 * Input for creating a new two-phase swap
 */
export interface CreateTwoPhaseSwapInput {
  /** Party A (initiator) wallet address */
  partyA: string;
  /** Party B (counterparty) wallet address - optional for open swaps */
  partyB?: string;
  /** Assets from Party A */
  assetsA: SwapAsset[];
  /** Assets from Party B */
  assetsB: SwapAsset[];
  /** SOL amount from Party A (in lamports) */
  solAmountA?: bigint;
  /** SOL amount from Party B (in lamports) */
  solAmountB?: bigint;
  /** Platform fee in lamports */
  platformFeeLamports: bigint;
  /** Expiration time for the lock phase */
  expiresAt: Date;
  /** Original swap offer ID (if created from an offer) */
  swapOfferId?: number;
}

/**
 * Result of a state transition
 */
export interface TransitionResult {
  /** Whether the transition was successful */
  success: boolean;
  /** The updated swap (if successful) */
  swap?: TwoPhaseSwapData;
  /** Error message (if failed) */
  error?: string;
  /** Previous state before transition */
  previousState?: TwoPhaseSwapStatus;
  /** New state after transition */
  newState?: TwoPhaseSwapStatus;
}

/**
 * Two-phase swap data structure
 */
export interface TwoPhaseSwapData {
  id: string;
  status: TwoPhaseSwapStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  partyA: string;
  partyB: string | null;
  assetsA: SwapAsset[];
  assetsB: SwapAsset[];
  solAmountA: bigint | null;
  solAmountB: bigint | null;
  lockTxA: string | null;
  lockTxB: string | null;
  lockConfirmedA: Date | null;
  lockConfirmedB: Date | null;
  settleTxs: string[];
  currentSettleIndex: number;
  totalSettleTxs: number;
  finalSettleTx: string | null;
  settledAt: Date | null;
  errorMessage: string | null;
  errorCode: string | null;
  failedAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  platformFeeLamports: bigint;
  swapOfferId: number | null;
  delegationStatus: Record<string, AssetDelegationStatus>;
  stateHistory: StateHistoryEntry[];
}

// =============================================================================
// State Transition Rules
// =============================================================================

/**
 * Valid state transitions map
 * Key: Current state
 * Value: Array of valid next states
 */
export const VALID_TRANSITIONS: Record<TwoPhaseSwapStatus, TwoPhaseSwapStatus[]> = {
  // Initial state - can be accepted or cancelled
  [TwoPhaseSwapStatus.CREATED]: [
    TwoPhaseSwapStatus.ACCEPTED,
    TwoPhaseSwapStatus.CANCELLED,
    TwoPhaseSwapStatus.EXPIRED,
  ],

  // Accepted - ready to start locking
  [TwoPhaseSwapStatus.ACCEPTED]: [
    TwoPhaseSwapStatus.LOCKING_PARTY_A,
    TwoPhaseSwapStatus.CANCELLED,
    TwoPhaseSwapStatus.EXPIRED,
  ],

  // Party A locking their assets
  [TwoPhaseSwapStatus.LOCKING_PARTY_A]: [
    TwoPhaseSwapStatus.PARTY_A_LOCKED,
    TwoPhaseSwapStatus.CANCELLED,
    TwoPhaseSwapStatus.EXPIRED,
    TwoPhaseSwapStatus.FAILED,
  ],

  // Party A locked, waiting for Party B
  [TwoPhaseSwapStatus.PARTY_A_LOCKED]: [
    TwoPhaseSwapStatus.LOCKING_PARTY_B,
    TwoPhaseSwapStatus.CANCELLED,
    TwoPhaseSwapStatus.EXPIRED,
    TwoPhaseSwapStatus.FAILED,
  ],

  // Party B locking their assets
  [TwoPhaseSwapStatus.LOCKING_PARTY_B]: [
    TwoPhaseSwapStatus.FULLY_LOCKED,
    TwoPhaseSwapStatus.CANCELLED,
    TwoPhaseSwapStatus.EXPIRED,
    TwoPhaseSwapStatus.FAILED,
  ],

  // Both parties locked - ready to settle
  [TwoPhaseSwapStatus.FULLY_LOCKED]: [
    TwoPhaseSwapStatus.SETTLING,
    TwoPhaseSwapStatus.FAILED, // If settlement preparation fails
  ],

  // Settlement in progress
  [TwoPhaseSwapStatus.SETTLING]: [
    TwoPhaseSwapStatus.PARTIAL_SETTLE,
    TwoPhaseSwapStatus.COMPLETED,
    TwoPhaseSwapStatus.FAILED,
  ],

  // Partial settlement - some transactions complete
  [TwoPhaseSwapStatus.PARTIAL_SETTLE]: [
    TwoPhaseSwapStatus.COMPLETED,
    TwoPhaseSwapStatus.FAILED,
  ],

  // Terminal states - no transitions allowed
  [TwoPhaseSwapStatus.COMPLETED]: [],
  [TwoPhaseSwapStatus.FAILED]: [],
  [TwoPhaseSwapStatus.CANCELLED]: [],
  [TwoPhaseSwapStatus.EXPIRED]: [],
};

/**
 * States that allow cancellation
 */
export const CANCELLABLE_STATES: TwoPhaseSwapStatus[] = [
  TwoPhaseSwapStatus.CREATED,
  TwoPhaseSwapStatus.ACCEPTED,
  TwoPhaseSwapStatus.LOCKING_PARTY_A,
  TwoPhaseSwapStatus.PARTY_A_LOCKED,
  TwoPhaseSwapStatus.LOCKING_PARTY_B,
];

/**
 * States that are considered "locked" (assets committed)
 */
export const LOCKED_STATES: TwoPhaseSwapStatus[] = [
  TwoPhaseSwapStatus.PARTY_A_LOCKED,
  TwoPhaseSwapStatus.LOCKING_PARTY_B,
  TwoPhaseSwapStatus.FULLY_LOCKED,
  TwoPhaseSwapStatus.SETTLING,
  TwoPhaseSwapStatus.PARTIAL_SETTLE,
];

/**
 * Terminal states - swap is complete (success or failure)
 */
export const TERMINAL_STATES: TwoPhaseSwapStatus[] = [
  TwoPhaseSwapStatus.COMPLETED,
  TwoPhaseSwapStatus.FAILED,
  TwoPhaseSwapStatus.CANCELLED,
  TwoPhaseSwapStatus.EXPIRED,
];

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Base error for state machine operations
 */
export class StateMachineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateMachineError';
  }
}

/**
 * Invalid state transition attempted
 */
export class InvalidTransitionError extends StateMachineError {
  public readonly currentState: TwoPhaseSwapStatus;
  public readonly attemptedState: TwoPhaseSwapStatus;
  public readonly validTransitions: TwoPhaseSwapStatus[];

  constructor(
    currentState: TwoPhaseSwapStatus,
    attemptedState: TwoPhaseSwapStatus,
    validTransitions: TwoPhaseSwapStatus[]
  ) {
    super(
      `Invalid transition from ${currentState} to ${attemptedState}. ` +
        `Valid transitions: ${validTransitions.join(', ') || 'none'}`
    );
    this.name = 'InvalidTransitionError';
    this.currentState = currentState;
    this.attemptedState = attemptedState;
    this.validTransitions = validTransitions;
  }
}

/**
 * Swap not found error
 */
export class SwapNotFoundError extends StateMachineError {
  public readonly swapId: string;

  constructor(swapId: string) {
    super(`Two-phase swap not found: ${swapId}`);
    this.name = 'SwapNotFoundError';
    this.swapId = swapId;
  }
}

/**
 * Swap has expired
 */
export class SwapExpiredError extends StateMachineError {
  public readonly swapId: string;
  public readonly expiresAt: Date;

  constructor(swapId: string, expiresAt: Date) {
    super(`Two-phase swap ${swapId} has expired at ${expiresAt.toISOString()}`);
    this.name = 'SwapExpiredError';
    this.swapId = swapId;
    this.expiresAt = expiresAt;
  }
}

/**
 * Unauthorized operation error
 */
export class UnauthorizedError extends StateMachineError {
  public readonly swapId: string;
  public readonly wallet: string;

  constructor(swapId: string, wallet: string, operation: string) {
    super(`Wallet ${wallet} is not authorized to ${operation} swap ${swapId}`);
    this.name = 'UnauthorizedError';
    this.swapId = swapId;
    this.wallet = wallet;
  }
}

// =============================================================================
// Main Service Class
// =============================================================================

/**
 * Two-Phase Swap State Machine Service
 *
 * Manages the lifecycle of two-phase swaps including:
 * - State creation and validation
 * - State transitions with validation
 * - Lock phase management
 * - Settlement tracking
 * - Cancellation and expiration handling
 */
export class SwapStateMachine {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    console.log('[SwapStateMachine] Initialized');
  }

  // ===========================================================================
  // Swap Creation
  // ===========================================================================

  /**
   * Create a new two-phase swap
   */
  async createSwap(input: CreateTwoPhaseSwapInput): Promise<TwoPhaseSwapData> {
    console.log('[SwapStateMachine] Creating two-phase swap:', {
      partyA: input.partyA,
      partyB: input.partyB || 'open',
      assetsA: input.assetsA.length,
      assetsB: input.assetsB.length,
    });

    // Validate input
    if (!input.partyA) {
      throw new StateMachineError('Party A wallet address is required');
    }

    if (input.assetsA.length === 0 && !input.solAmountA) {
      throw new StateMachineError('Party A must offer at least one asset or SOL');
    }

    if (input.assetsB.length === 0 && !input.solAmountB) {
      throw new StateMachineError('Party B must offer at least one asset or SOL');
    }

    if (input.expiresAt <= new Date()) {
      throw new StateMachineError('Expiration time must be in the future');
    }

    // Initialize delegation status for cNFT assets
    const delegationStatus: Record<string, AssetDelegationStatus> = {};
    for (const asset of [...input.assetsA, ...input.assetsB]) {
      if (asset.type === 'CNFT') {
        delegationStatus[asset.identifier] = {
          assetId: asset.identifier,
          delegated: false,
        };
      }
    }

    // Create initial state history entry
    const initialHistory: StateHistoryEntry[] = [
      {
        fromState: TwoPhaseSwapStatus.CREATED, // Technically no "from" state, but we track it anyway
        toState: TwoPhaseSwapStatus.CREATED,
        timestamp: new Date().toISOString(),
        reason: 'Swap created',
        triggeredBy: input.partyA,
      },
    ];

    // Create the swap in the database
    const swap = await this.prisma.twoPhaseSwap.create({
      data: {
        status: TwoPhaseSwapStatus.CREATED,
        partyA: input.partyA,
        partyB: input.partyB,
        assetsA: input.assetsA as any,
        assetsB: input.assetsB as any,
        solAmountA: input.solAmountA,
        solAmountB: input.solAmountB,
        platformFeeLamports: input.platformFeeLamports,
        expiresAt: input.expiresAt,
        swapOfferId: input.swapOfferId,
        delegationStatus: delegationStatus as any,
        stateHistory: initialHistory as any,
        settleTxs: [],
      },
    });

    console.log('[SwapStateMachine] Two-phase swap created:', swap.id);

    return this.mapToSwapData(swap);
  }

  // ===========================================================================
  // State Transitions
  // ===========================================================================

  /**
   * Validate if a transition is allowed
   */
  isValidTransition(
    currentState: TwoPhaseSwapStatus,
    newState: TwoPhaseSwapStatus
  ): boolean {
    const validNextStates = VALID_TRANSITIONS[currentState] || [];
    return validNextStates.includes(newState);
  }

  /**
   * Transition swap to a new state
   */
  async transition(
    swapId: string,
    newState: TwoPhaseSwapStatus,
    options: {
      reason?: string;
      triggeredBy?: string;
      additionalData?: Partial<{
        lockTxA: string;
        lockTxB: string;
        lockConfirmedA: Date;
        lockConfirmedB: Date;
        finalSettleTx: string;
        settledAt: Date;
        errorMessage: string;
        errorCode: string;
        failedAt: Date;
        cancelledBy: string;
        cancelledAt: Date;
        cancelReason: string;
        currentSettleIndex: number;
        settleTxs: string[];
      }>;
    } = {}
  ): Promise<TransitionResult> {
    console.log('[SwapStateMachine] Transition requested:', {
      swapId,
      newState,
      reason: options.reason,
    });

    // Load current swap
    const swap = await this.prisma.twoPhaseSwap.findUnique({
      where: { id: swapId },
    });

    if (!swap) {
      return {
        success: false,
        error: `Swap not found: ${swapId}`,
      };
    }

    const currentState = swap.status;

    // Validate transition
    if (!this.isValidTransition(currentState, newState)) {
      const validTransitions = VALID_TRANSITIONS[currentState] || [];
      return {
        success: false,
        error: `Invalid transition from ${currentState} to ${newState}. Valid transitions: ${validTransitions.join(', ') || 'none'}`,
        previousState: currentState,
      };
    }

    // Check expiration for lock-phase transitions
    if (this.isLockPhaseState(newState) && swap.expiresAt < new Date()) {
      // Auto-transition to EXPIRED instead
      return this.transition(swapId, TwoPhaseSwapStatus.EXPIRED, {
        reason: 'Lock phase timeout',
        triggeredBy: 'system',
      });
    }

    // Build state history entry
    const historyEntry: StateHistoryEntry = {
      fromState: currentState,
      toState: newState,
      timestamp: new Date().toISOString(),
      reason: options.reason,
      triggeredBy: options.triggeredBy,
    };

    // Get current history and append new entry
    const currentHistory = (swap.stateHistory as any[]) || [];
    const newHistory = [...currentHistory, historyEntry];

    // Build update data
    const updateData: any = {
      status: newState,
      stateHistory: newHistory as any,
      ...options.additionalData,
    };

    // Update the swap
    const updatedSwap = await this.prisma.twoPhaseSwap.update({
      where: { id: swapId },
      data: updateData,
    });

    console.log('[SwapStateMachine] Transition complete:', {
      swapId,
      from: currentState,
      to: newState,
    });

    return {
      success: true,
      swap: this.mapToSwapData(updatedSwap),
      previousState: currentState,
      newState,
    };
  }

  // ===========================================================================
  // Lock Phase Operations
  // ===========================================================================

  /**
   * Start lock phase for Party A
   */
  async startLockingPartyA(
    swapId: string,
    triggeredBy: string
  ): Promise<TransitionResult> {
    return this.transition(swapId, TwoPhaseSwapStatus.LOCKING_PARTY_A, {
      reason: 'Party A started locking assets',
      triggeredBy,
    });
  }

  /**
   * Confirm Party A's lock
   */
  async confirmPartyALock(
    swapId: string,
    lockTxId: string,
    triggeredBy: string
  ): Promise<TransitionResult> {
    return this.transition(swapId, TwoPhaseSwapStatus.PARTY_A_LOCKED, {
      reason: 'Party A lock confirmed',
      triggeredBy,
      additionalData: {
        lockTxA: lockTxId,
        lockConfirmedA: new Date(),
      },
    });
  }

  /**
   * Start lock phase for Party B
   */
  async startLockingPartyB(
    swapId: string,
    triggeredBy: string
  ): Promise<TransitionResult> {
    return this.transition(swapId, TwoPhaseSwapStatus.LOCKING_PARTY_B, {
      reason: 'Party B started locking assets',
      triggeredBy,
    });
  }

  /**
   * Confirm Party B's lock and mark as fully locked
   */
  async confirmPartyBLock(
    swapId: string,
    lockTxId: string,
    triggeredBy: string
  ): Promise<TransitionResult> {
    return this.transition(swapId, TwoPhaseSwapStatus.FULLY_LOCKED, {
      reason: 'Party B lock confirmed, both parties fully locked',
      triggeredBy,
      additionalData: {
        lockTxB: lockTxId,
        lockConfirmedB: new Date(),
      },
    });
  }

  // ===========================================================================
  // Settlement Operations
  // ===========================================================================

  /**
   * Start settlement phase
   */
  async startSettlement(
    swapId: string,
    totalTxCount: number,
    triggeredBy: string
  ): Promise<TransitionResult> {
    // First update the total transaction count
    await this.prisma.twoPhaseSwap.update({
      where: { id: swapId },
      data: { totalSettleTxs: totalTxCount },
    });

    return this.transition(swapId, TwoPhaseSwapStatus.SETTLING, {
      reason: `Starting settlement with ${totalTxCount} transaction(s)`,
      triggeredBy,
    });
  }

  /**
   * Record a settlement transaction
   */
  async recordSettlementTx(
    swapId: string,
    txSignature: string,
    triggeredBy: string
  ): Promise<TransitionResult> {
    const swap = await this.prisma.twoPhaseSwap.findUnique({
      where: { id: swapId },
    });

    if (!swap) {
      return { success: false, error: `Swap not found: ${swapId}` };
    }

    const currentTxs = (swap.settleTxs as string[]) || [];
    const newTxs = [...currentTxs, txSignature];
    const newIndex = newTxs.length;

    // Check if all transactions are complete
    const isComplete = newIndex >= swap.totalSettleTxs;

    if (isComplete) {
      // Transition to COMPLETED
      return this.transition(swapId, TwoPhaseSwapStatus.COMPLETED, {
        reason: 'All settlement transactions complete',
        triggeredBy,
        additionalData: {
          settleTxs: newTxs,
          currentSettleIndex: newIndex,
          finalSettleTx: txSignature,
          settledAt: new Date(),
        },
      });
    } else {
      // Transition to PARTIAL_SETTLE or stay in SETTLING
      const newState =
        swap.status === TwoPhaseSwapStatus.SETTLING
          ? TwoPhaseSwapStatus.PARTIAL_SETTLE
          : swap.status;

      return this.transition(swapId, newState, {
        reason: `Settlement transaction ${newIndex}/${swap.totalSettleTxs} recorded`,
        triggeredBy,
        additionalData: {
          settleTxs: newTxs,
          currentSettleIndex: newIndex,
        },
      });
    }
  }

  /**
   * Complete settlement
   */
  async completeSettlement(
    swapId: string,
    finalTxSignature: string,
    triggeredBy: string
  ): Promise<TransitionResult> {
    return this.transition(swapId, TwoPhaseSwapStatus.COMPLETED, {
      reason: 'Settlement completed successfully',
      triggeredBy,
      additionalData: {
        finalSettleTx: finalTxSignature,
        settledAt: new Date(),
      },
    });
  }

  // ===========================================================================
  // Cancellation & Failure Operations
  // ===========================================================================

  /**
   * Cancel a swap (if allowed)
   */
  async cancelSwap(
    swapId: string,
    cancelledBy: string,
    reason?: string
  ): Promise<TransitionResult> {
    const swap = await this.prisma.twoPhaseSwap.findUnique({
      where: { id: swapId },
    });

    if (!swap) {
      return { success: false, error: `Swap not found: ${swapId}` };
    }

    // Check if cancellation is allowed
    if (!CANCELLABLE_STATES.includes(swap.status)) {
      return {
        success: false,
        error: `Cannot cancel swap in ${swap.status} state. Cancellation only allowed in: ${CANCELLABLE_STATES.join(', ')}`,
        previousState: swap.status,
      };
    }

    // Verify authorization (only parties can cancel)
    if (cancelledBy !== swap.partyA && cancelledBy !== swap.partyB) {
      return {
        success: false,
        error: `Wallet ${cancelledBy} is not authorized to cancel this swap`,
        previousState: swap.status,
      };
    }

    return this.transition(swapId, TwoPhaseSwapStatus.CANCELLED, {
      reason: reason || 'Cancelled by user',
      triggeredBy: cancelledBy,
      additionalData: {
        cancelledBy,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });
  }

  /**
   * Mark swap as failed
   */
  async failSwap(
    swapId: string,
    errorMessage: string,
    errorCode?: string,
    triggeredBy?: string
  ): Promise<TransitionResult> {
    return this.transition(swapId, TwoPhaseSwapStatus.FAILED, {
      reason: `Swap failed: ${errorMessage}`,
      triggeredBy: triggeredBy || 'system',
      additionalData: {
        errorMessage,
        errorCode,
        failedAt: new Date(),
      },
    });
  }

  /**
   * Mark swap as expired
   */
  async expireSwap(swapId: string): Promise<TransitionResult> {
    return this.transition(swapId, TwoPhaseSwapStatus.EXPIRED, {
      reason: 'Lock phase timeout exceeded',
      triggeredBy: 'system',
    });
  }

  // ===========================================================================
  // Accept Operation
  // ===========================================================================

  /**
   * Accept a swap (Party B accepts Party A's swap offer)
   */
  async acceptSwap(
    swapId: string,
    partyB: string
  ): Promise<TransitionResult> {
    const swap = await this.prisma.twoPhaseSwap.findUnique({
      where: { id: swapId },
    });

    if (!swap) {
      return { success: false, error: `Swap not found: ${swapId}` };
    }

    // Verify swap is in CREATED state
    if (swap.status !== TwoPhaseSwapStatus.CREATED) {
      return {
        success: false,
        error: `Swap cannot be accepted in ${swap.status} state`,
        previousState: swap.status,
      };
    }

    // Check if swap has specific taker
    if (swap.partyB && swap.partyB !== partyB) {
      return {
        success: false,
        error: `This swap is designated for wallet ${swap.partyB}`,
        previousState: swap.status,
      };
    }

    // Check expiration
    if (swap.expiresAt < new Date()) {
      return this.expireSwap(swapId);
    }

    // Update partyB if this was an open swap
    if (!swap.partyB) {
      await this.prisma.twoPhaseSwap.update({
        where: { id: swapId },
        data: { partyB },
      });
    }

    return this.transition(swapId, TwoPhaseSwapStatus.ACCEPTED, {
      reason: 'Swap accepted by counterparty',
      triggeredBy: partyB,
    });
  }

  // ===========================================================================
  // Delegation Status Updates
  // ===========================================================================

  /**
   * Update delegation status for an asset
   */
  async updateAssetDelegation(
    swapId: string,
    assetId: string,
    status: Partial<AssetDelegationStatus>
  ): Promise<TwoPhaseSwapData> {
    const swap = await this.prisma.twoPhaseSwap.findUnique({
      where: { id: swapId },
    });

    if (!swap) {
      throw new SwapNotFoundError(swapId);
    }

    const currentStatus = (swap.delegationStatus as unknown as Record<string, AssetDelegationStatus>) || {};
    const updatedStatus = {
      ...currentStatus,
      [assetId]: {
        ...currentStatus[assetId],
        ...status,
        assetId,
      },
    };

    const updatedSwap = await this.prisma.twoPhaseSwap.update({
      where: { id: swapId },
      data: { delegationStatus: updatedStatus as any },
    });

    return this.mapToSwapData(updatedSwap);
  }

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  /**
   * Get a swap by ID
   */
  async getSwap(swapId: string): Promise<TwoPhaseSwapData | null> {
    const swap = await this.prisma.twoPhaseSwap.findUnique({
      where: { id: swapId },
    });

    if (!swap) {
      return null;
    }

    return this.mapToSwapData(swap);
  }

  /**
   * Get swaps by party wallet
   */
  async getSwapsByParty(
    walletAddress: string,
    options: {
      status?: TwoPhaseSwapStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ swaps: TwoPhaseSwapData[]; total: number }> {
    const where: any = {
      OR: [{ partyA: walletAddress }, { partyB: walletAddress }],
    };

    if (options.status) {
      where.status = options.status;
    }

    const [swaps, total] = await Promise.all([
      this.prisma.twoPhaseSwap.findMany({
        where,
        take: options.limit || 50,
        skip: options.offset || 0,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.twoPhaseSwap.count({ where }),
    ]);

    return {
      swaps: swaps.map((s) => this.mapToSwapData(s)),
      total,
    };
  }

  /**
   * Get swaps that have expired and need to be marked as such
   */
  async getExpiredSwaps(limit: number = 100): Promise<TwoPhaseSwapData[]> {
    const expirableStates = [
      TwoPhaseSwapStatus.CREATED,
      TwoPhaseSwapStatus.ACCEPTED,
      TwoPhaseSwapStatus.LOCKING_PARTY_A,
      TwoPhaseSwapStatus.PARTY_A_LOCKED,
      TwoPhaseSwapStatus.LOCKING_PARTY_B,
    ];

    const swaps = await this.prisma.twoPhaseSwap.findMany({
      where: {
        status: { in: expirableStates },
        expiresAt: { lt: new Date() },
      },
      take: limit,
      orderBy: { expiresAt: 'asc' },
    });

    return swaps.map((s) => this.mapToSwapData(s));
  }

  /**
   * Process expired swaps (batch operation)
   */
  async processExpiredSwaps(): Promise<number> {
    const expiredSwaps = await this.getExpiredSwaps();
    let processed = 0;

    for (const swap of expiredSwaps) {
      const result = await this.expireSwap(swap.id);
      if (result.success) {
        processed++;
      }
    }

    console.log(`[SwapStateMachine] Processed ${processed} expired swaps`);
    return processed;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Check if a state is in the lock phase
   */
  private isLockPhaseState(state: TwoPhaseSwapStatus): boolean {
    const lockPhaseStates: TwoPhaseSwapStatus[] = [
      TwoPhaseSwapStatus.LOCKING_PARTY_A,
      TwoPhaseSwapStatus.PARTY_A_LOCKED,
      TwoPhaseSwapStatus.LOCKING_PARTY_B,
    ];
    return lockPhaseStates.includes(state);
  }

  /**
   * Check if swap is in a terminal state
   */
  isTerminalState(status: TwoPhaseSwapStatus): boolean {
    return TERMINAL_STATES.includes(status);
  }

  /**
   * Check if swap can be cancelled
   */
  canCancel(status: TwoPhaseSwapStatus): boolean {
    return CANCELLABLE_STATES.includes(status);
  }

  /**
   * Check if party has assets locked
   */
  isPartyLocked(status: TwoPhaseSwapStatus, party: 'A' | 'B'): boolean {
    const partyALockedStates: TwoPhaseSwapStatus[] = [
      TwoPhaseSwapStatus.PARTY_A_LOCKED,
      TwoPhaseSwapStatus.LOCKING_PARTY_B,
      TwoPhaseSwapStatus.FULLY_LOCKED,
      TwoPhaseSwapStatus.SETTLING,
      TwoPhaseSwapStatus.PARTIAL_SETTLE,
    ];
    const partyBLockedStates: TwoPhaseSwapStatus[] = [
      TwoPhaseSwapStatus.FULLY_LOCKED,
      TwoPhaseSwapStatus.SETTLING,
      TwoPhaseSwapStatus.PARTIAL_SETTLE,
    ];

    if (party === 'A') {
      return partyALockedStates.includes(status);
    } else {
      return partyBLockedStates.includes(status);
    }
  }

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
      assetsA: swap.assetsA as SwapAsset[],
      assetsB: swap.assetsB as SwapAsset[],
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
      delegationStatus: swap.delegationStatus as unknown as Record<string, AssetDelegationStatus>,
      stateHistory: swap.stateHistory as StateHistoryEntry[],
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a SwapStateMachine instance
 */
export function createSwapStateMachine(prisma: PrismaClient): SwapStateMachine {
  return new SwapStateMachine(prisma);
}
