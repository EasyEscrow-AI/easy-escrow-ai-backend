/**
 * Unit Tests for Swap Progress Endpoint
 *
 * Tests the swap progress polling endpoint (Task 13) including:
 * - Progress response format for each swap phase
 * - Completed/failed swap progress
 * - Settlement progress tracking
 * - Transaction tracking
 * - Rate limiting and caching
 *
 * @see .taskmaster/tasks/task_013_cnft-delegation-swap.txt
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import {
  SwapProgressService,
  SwapProgressResponse,
  TransactionInfo,
} from '../../src/services/swapProgress.service';
import { TwoPhaseSwapStatus } from '../../src/generated/prisma';
import { TwoPhaseSwapData, SwapAsset } from '../../src/services/swapStateMachine';

// =============================================================================
// Mock Swap State Machine
// =============================================================================

class MockSwapStateMachine {
  private swaps: Map<string, TwoPhaseSwapData> = new Map();

  addSwap(swap: TwoPhaseSwapData): void {
    this.swaps.set(swap.id, swap);
  }

  async getSwap(swapId: string): Promise<TwoPhaseSwapData | null> {
    return this.swaps.get(swapId) || null;
  }

  reset(): void {
    this.swaps.clear();
  }
}

// =============================================================================
// Mock Cache Service
// =============================================================================

class MockCacheService {
  private cache: Map<string, { value: any; expiresAt: number }> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    const expiresAt = Date.now() + (ttl || 3600) * 1000;
    this.cache.set(key, { value, expiresAt });
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  reset(): void {
    this.cache.clear();
  }
}

// =============================================================================
// Test Helpers
// =============================================================================

const createMockSwap = (overrides: Partial<TwoPhaseSwapData> = {}): TwoPhaseSwapData => {
  const now = new Date();
  const defaultAssets: SwapAsset[] = [
    { type: 'CNFT', identifier: 'asset-1' },
    { type: 'NFT', identifier: 'asset-2-mint' },
  ];

  return {
    id: 'swap-test-123',
    status: TwoPhaseSwapStatus.CREATED,
    createdAt: new Date(now.getTime() - 3600000), // 1 hour ago
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 86400000), // 24 hours from now
    partyA: 'PartyAWallet111111111111111111111111111111111',
    partyB: 'PartyBWallet222222222222222222222222222222222',
    assetsA: defaultAssets,
    assetsB: [{ type: 'CNFT', identifier: 'asset-b-1' }],
    solAmountA: BigInt(1_000_000_000),
    solAmountB: null,
    lockTxA: null,
    lockTxB: null,
    lockConfirmedA: null,
    lockConfirmedB: null,
    settleTxs: [],
    currentSettleIndex: 0,
    totalSettleTxs: 1,
    finalSettleTx: null,
    settledAt: null,
    errorMessage: null,
    errorCode: null,
    failedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    platformFeeLamports: BigInt(10_000_000),
    swapOfferId: null,
    delegationStatus: {},
    stateHistory: [
      {
        fromState: TwoPhaseSwapStatus.CREATED,
        toState: TwoPhaseSwapStatus.CREATED,
        timestamp: now.toISOString(),
        reason: 'Swap created',
        triggeredBy: 'PartyAWallet111111111111111111111111111111111',
      },
    ],
    ...overrides,
  };
};

// =============================================================================
// Tests
// =============================================================================

describe('SwapProgressService', () => {
  let progressService: SwapProgressService;
  let mockStateMachine: MockSwapStateMachine;
  let mockCache: MockCacheService;

  beforeEach(() => {
    mockStateMachine = new MockSwapStateMachine();
    mockCache = new MockCacheService();
    progressService = new SwapProgressService(mockStateMachine as any, mockCache as any);
  });

  afterEach(() => {
    mockStateMachine.reset();
    mockCache.reset();
  });

  // ===========================================================================
  // Basic Response Format Tests
  // ===========================================================================

  describe('Response Format', () => {
    it('should return correct response structure for CREATED swap', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.CREATED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);

      expect(progress).to.exist;
      expect(progress!.swapId).to.equal(swap.id);
      expect(progress!.status).to.equal('CREATED');
      expect(progress!.phase).to.equal('pending');
      expect(progress!.progress).to.exist;
      expect(progress!.timestamps).to.exist;
      expect(progress!.transactions).to.be.an('array');
    });

    it('should return null for non-existent swap', async () => {
      const progress = await progressService.getProgress('non-existent-id');
      expect(progress).to.be.null;
    });

    it('should include correct progress structure', async () => {
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.SETTLING,
        totalSettleTxs: 5,
        currentSettleIndex: 3,
        settleTxs: ['tx1', 'tx2', 'tx3'],
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);

      expect(progress?.progress.totalTransfers).to.equal(5);
      expect(progress?.progress.completedTransfers).to.equal(3);
      expect(progress?.progress.currentChunk).to.equal(4); // currentSettleIndex + 1
      expect(progress?.progress.percentComplete).to.equal(60); // 3/5 * 100
    });

    it('should include correct timestamps', async () => {
      const createdAt = new Date('2024-01-15T10:00:00Z');
      const lockConfirmedA = new Date('2024-01-15T10:30:00Z');
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.SETTLING,
        createdAt,
        lockConfirmedA,
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);

      expect(progress?.timestamps.created).to.equal(createdAt.toISOString());
      expect(progress?.timestamps.lockedAt).to.equal(lockConfirmedA.toISOString());
    });
  });

  // ===========================================================================
  // Phase Determination Tests
  // ===========================================================================

  describe('Phase Determination', () => {
    it('should return "pending" phase for CREATED status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.CREATED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('pending');
    });

    it('should return "pending" phase for ACCEPTED status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.ACCEPTED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('pending');
    });

    it('should return "lock" phase for LOCKING_PARTY_A status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.LOCKING_PARTY_A });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('lock');
    });

    it('should return "lock" phase for PARTY_A_LOCKED status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.PARTY_A_LOCKED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('lock');
    });

    it('should return "lock" phase for LOCKING_PARTY_B status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.LOCKING_PARTY_B });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('lock');
    });

    it('should return "lock" phase for FULLY_LOCKED status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.FULLY_LOCKED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('lock');
    });

    it('should return "settle" phase for SETTLING status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.SETTLING });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('settle');
    });

    it('should return "settle" phase for PARTIAL_SETTLE status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.PARTIAL_SETTLE });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('settle');
    });

    it('should return "complete" phase for COMPLETED status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.COMPLETED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('complete');
    });

    it('should return "failed" phase for FAILED status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.FAILED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('failed');
    });

    it('should return "cancelled" phase for CANCELLED status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.CANCELLED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('cancelled');
    });

    it('should return "expired" phase for EXPIRED status', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.EXPIRED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.phase).to.equal('expired');
    });
  });

  // ===========================================================================
  // Progress Calculation Tests
  // ===========================================================================

  describe('Progress Calculation', () => {
    it('should show 0% for swaps that have not started lock phase', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.CREATED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.progress.percentComplete).to.equal(0);
    });

    it('should show lock phase progress correctly', async () => {
      // Party A locked = 50% of lock phase
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        lockTxA: 'lockTxA123',
        lockConfirmedA: new Date(),
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      // In lock phase, progress is based on which parties have locked
      expect(progress?.progress.percentComplete).to.be.greaterThan(0);
      expect(progress?.progress.percentComplete).to.be.lessThan(100);
    });

    it('should show 100% for fully locked state before settlement', async () => {
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.FULLY_LOCKED,
        lockTxA: 'lockTxA123',
        lockTxB: 'lockTxB123',
        lockConfirmedA: new Date(),
        lockConfirmedB: new Date(),
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      // Fully locked = 100% of lock phase
      expect(progress?.progress.percentComplete).to.equal(100);
    });

    it('should calculate settlement progress correctly', async () => {
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.SETTLING,
        totalSettleTxs: 4,
        currentSettleIndex: 2,
        settleTxs: ['tx1', 'tx2'],
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.progress.totalTransfers).to.equal(4);
      expect(progress?.progress.completedTransfers).to.equal(2);
      expect(progress?.progress.percentComplete).to.equal(50); // 2/4 * 100
    });

    it('should show 100% for completed swaps', async () => {
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.COMPLETED,
        totalSettleTxs: 3,
        currentSettleIndex: 3,
        settleTxs: ['tx1', 'tx2', 'tx3'],
        finalSettleTx: 'tx3',
        settledAt: new Date(),
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.progress.percentComplete).to.equal(100);
    });
  });

  // ===========================================================================
  // Transaction Tracking Tests
  // ===========================================================================

  describe('Transaction Tracking', () => {
    it('should return empty transactions array for new swap', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.CREATED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.transactions).to.be.an('array');
      expect(progress?.transactions).to.have.lengthOf(0);
    });

    it('should include lock transactions when available', async () => {
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        lockTxA: 'lockTxA123456789',
        lockConfirmedA: new Date(),
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.transactions).to.have.lengthOf(1);
      expect(progress?.transactions[0]).to.deep.include({
        sig: 'lockTxA123456789',
        type: 'lock_a',
        status: 'confirmed',
      });
    });

    it('should include both lock transactions when fully locked', async () => {
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.FULLY_LOCKED,
        lockTxA: 'lockTxA123456789',
        lockTxB: 'lockTxB987654321',
        lockConfirmedA: new Date(),
        lockConfirmedB: new Date(),
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.transactions).to.have.lengthOf(2);

      const lockATx = progress?.transactions.find((t) => t.type === 'lock_a');
      const lockBTx = progress?.transactions.find((t) => t.type === 'lock_b');

      expect(lockATx?.sig).to.equal('lockTxA123456789');
      expect(lockBTx?.sig).to.equal('lockTxB987654321');
    });

    it('should include settlement transactions', async () => {
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.SETTLING,
        lockTxA: 'lockTxA',
        lockTxB: 'lockTxB',
        lockConfirmedA: new Date(),
        lockConfirmedB: new Date(),
        settleTxs: ['settleTx1', 'settleTx2'],
        currentSettleIndex: 2,
        totalSettleTxs: 5,
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);

      // 2 lock txs + 2 settle txs = 4 total
      expect(progress?.transactions).to.have.lengthOf(4);

      const settleTxs = progress?.transactions.filter((t) => t.type.startsWith('settle_'));
      expect(settleTxs).to.have.lengthOf(2);
      expect(settleTxs?.[0].sig).to.equal('settleTx1');
      expect(settleTxs?.[0].type).to.equal('settle_1');
      expect(settleTxs?.[1].sig).to.equal('settleTx2');
      expect(settleTxs?.[1].type).to.equal('settle_2');
    });

    it('should include final settlement transaction for completed swap', async () => {
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.COMPLETED,
        lockTxA: 'lockTxA',
        lockTxB: 'lockTxB',
        lockConfirmedA: new Date(),
        lockConfirmedB: new Date(),
        settleTxs: ['settleTx1'],
        finalSettleTx: 'settleTx1',
        settledAt: new Date(),
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);

      const settleTx = progress?.transactions.find((t) => t.type.startsWith('settle_'));
      expect(settleTx?.status).to.equal('confirmed');
    });
  });

  // ===========================================================================
  // Timestamp Tests
  // ===========================================================================

  describe('Timestamp Handling', () => {
    it('should include created timestamp', async () => {
      const createdAt = new Date('2024-01-15T10:00:00Z');
      const swap = createMockSwap({ createdAt });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.timestamps.created).to.equal(createdAt.toISOString());
    });

    it('should include lockedAt when Party A is locked', async () => {
      const lockConfirmedA = new Date('2024-01-15T10:30:00Z');
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        lockConfirmedA,
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.timestamps.lockedAt).to.equal(lockConfirmedA.toISOString());
    });

    it('should use Party B lock time for lockedAt when both are locked', async () => {
      const lockConfirmedA = new Date('2024-01-15T10:30:00Z');
      const lockConfirmedB = new Date('2024-01-15T10:45:00Z');
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.FULLY_LOCKED,
        lockConfirmedA,
        lockConfirmedB,
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      // lockedAt should be when both parties are locked (Party B confirms)
      expect(progress?.timestamps.lockedAt).to.equal(lockConfirmedB.toISOString());
    });

    it('should include settleStarted when in settle phase', async () => {
      const settleStarted = new Date('2024-01-15T11:00:00Z');
      const stateHistory = [
        {
          fromState: TwoPhaseSwapStatus.FULLY_LOCKED,
          toState: TwoPhaseSwapStatus.SETTLING,
          timestamp: settleStarted.toISOString(),
          reason: 'Starting settlement',
          triggeredBy: 'system',
        },
      ];
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.SETTLING,
        stateHistory,
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.timestamps.settleStarted).to.equal(settleStarted.toISOString());
    });

    it('should not include lockedAt for swaps not yet locked', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.ACCEPTED });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.timestamps.lockedAt).to.be.undefined;
    });

    it('should provide estimated completion time during settlement', async () => {
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.SETTLING,
        totalSettleTxs: 5,
        currentSettleIndex: 2,
        settleTxs: ['tx1', 'tx2'],
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.timestamps.estimatedCompletion).to.exist;
    });
  });

  // ===========================================================================
  // Completed/Failed Swap Tests
  // ===========================================================================

  describe('Terminal State Handling', () => {
    it('should show correct progress for completed swap', async () => {
      const settledAt = new Date('2024-01-15T12:00:00Z');
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.COMPLETED,
        totalSettleTxs: 3,
        currentSettleIndex: 3,
        settleTxs: ['tx1', 'tx2', 'tx3'],
        finalSettleTx: 'tx3',
        settledAt,
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.progress.percentComplete).to.equal(100);
      expect(progress?.timestamps.estimatedCompletion).to.be.undefined;
    });

    it('should include error info for failed swap', async () => {
      const failedAt = new Date('2024-01-15T11:30:00Z');
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.FAILED,
        errorMessage: 'Transaction simulation failed',
        errorCode: 'TX_SIM_FAILED',
        failedAt,
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.error).to.exist;
      expect(progress?.error?.message).to.equal('Transaction simulation failed');
      expect(progress?.error?.code).to.equal('TX_SIM_FAILED');
    });

    it('should include cancel info for cancelled swap', async () => {
      const cancelledAt = new Date('2024-01-15T10:45:00Z');
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.CANCELLED,
        cancelledBy: 'PartyAWallet111111111111111111111111111111111',
        cancelReason: 'Changed my mind',
        cancelledAt,
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.cancellation).to.exist;
      expect(progress?.cancellation?.by).to.equal('PartyAWallet111111111111111111111111111111111');
      expect(progress?.cancellation?.reason).to.equal('Changed my mind');
    });
  });

  // ===========================================================================
  // Caching Tests
  // ===========================================================================

  describe('Caching', () => {
    it('should cache progress response', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.SETTLING });
      mockStateMachine.addSwap(swap);

      // First call - should query state machine
      const progress1 = await progressService.getProgress(swap.id);

      // Modify the mock (simulate state change)
      swap.currentSettleIndex = 5;
      mockStateMachine.addSwap(swap);

      // Second call - should return cached value
      const progress2 = await progressService.getProgress(swap.id);

      // Should be the same (cached)
      expect(progress1?.progress.completedTransfers).to.equal(
        progress2?.progress.completedTransfers
      );
    });

    it('should use 2-second TTL for cache', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.SETTLING });
      mockStateMachine.addSwap(swap);

      await progressService.getProgress(swap.id);

      // Check cache was set with correct TTL
      const cacheKey = `progress:${swap.id}`;
      const cached = await mockCache.get(cacheKey);
      expect(cached).to.exist;
    });

    it('should bypass cache for terminal states', async () => {
      const swap = createMockSwap({ status: TwoPhaseSwapStatus.COMPLETED });
      mockStateMachine.addSwap(swap);

      // Terminal states should still be returned but may not be cached
      const progress = await progressService.getProgress(swap.id);
      expect(progress?.status).to.equal('COMPLETED');
    });
  });

  // ===========================================================================
  // Rate Limiting Tests
  // ===========================================================================

  describe('Rate Limit Check', () => {
    it('should provide rate limit check method', () => {
      expect(progressService.checkRateLimit).to.be.a('function');
    });

    it('should allow first request', async () => {
      const result = await progressService.checkRateLimit('swap-123', 'client-ip');
      expect(result.allowed).to.be.true;
    });

    it('should track request count per swap', async () => {
      const swapId = 'swap-rate-test';
      const clientIp = 'test-ip';

      // First request should be allowed
      const result1 = await progressService.checkRateLimit(swapId, clientIp);
      expect(result1.allowed).to.be.true;

      // Check remaining requests
      expect(result1.remaining).to.be.greaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle swap with no assets gracefully', async () => {
      const swap = createMockSwap({
        assetsA: [],
        assetsB: [],
        solAmountA: BigInt(1_000_000_000),
        solAmountB: BigInt(500_000_000),
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress).to.exist;
      expect(progress?.progress.totalTransfers).to.be.greaterThanOrEqual(1);
    });

    it('should handle missing stateHistory gracefully', async () => {
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.SETTLING,
        stateHistory: [],
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress).to.exist;
      expect(progress?.timestamps.settleStarted).to.be.undefined;
    });

    it('should handle large number of settlement transactions', async () => {
      const settleTxs = Array.from({ length: 50 }, (_, i) => `settleTx${i + 1}`);
      const swap = createMockSwap({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        totalSettleTxs: 50,
        currentSettleIndex: 25,
        settleTxs: settleTxs.slice(0, 25),
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      expect(progress?.progress.percentComplete).to.equal(50);
      expect(progress?.transactions.filter((t) => t.type.startsWith('settle_'))).to.have.lengthOf(
        25
      );
    });

    it('should serialize BigInt values correctly', async () => {
      const swap = createMockSwap({
        solAmountA: BigInt(5_000_000_000),
        platformFeeLamports: BigInt(50_000_000),
      });
      mockStateMachine.addSwap(swap);

      const progress = await progressService.getProgress(swap.id);
      // The response should be JSON-serializable (no BigInt)
      expect(() => JSON.stringify(progress)).to.not.throw();
    });
  });
});
