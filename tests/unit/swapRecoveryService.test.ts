/**
 * Unit Tests for SwapRecoveryService
 *
 * Tests the swap state recovery and monitoring service including:
 * - Recovery from lock transaction failures
 * - Timeout and asset release for partial locks
 * - Partial settlement recovery
 * - Complete failure handling
 * - Stuck swap detection
 * - Concurrent recovery prevention
 *
 * Based on Task 11: Implement Swap State Recovery and Monitoring
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { TwoPhaseSwapStatus } from '../../src/generated/prisma';

// Import the service under test (will be created)
import {
  SwapRecoveryService,
  createSwapRecoveryService,
  RecoveryResult,
  StuckSwapAlert,
  AlertSeverity,
  RecoveryConfig,
  RecoveryErrorCode,
} from '../../src/services/swapRecoveryService';

import {
  SwapStateMachine,
  createSwapStateMachine,
  TwoPhaseSwapData,
  SwapAsset,
} from '../../src/services/swapStateMachine';

// =============================================================================
// Mock Prisma Client
// =============================================================================

class MockPrismaClient {
  private swaps: Map<string, any> = new Map();
  private idCounter = 0;

  twoPhaseSwap = {
    create: async (params: { data: any }) => {
      const id = `swap-${++this.idCounter}`;
      const swap = {
        id,
        ...params.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.swaps.set(id, swap);
      return swap;
    },

    findUnique: async (params: { where: { id: string } }) => {
      return this.swaps.get(params.where.id) || null;
    },

    update: async (params: { where: { id: string }; data: any }) => {
      const swap = this.swaps.get(params.where.id);
      if (!swap) {
        throw new Error('Swap not found');
      }
      const updated = {
        ...swap,
        ...params.data,
        updatedAt: new Date(),
      };
      this.swaps.set(params.where.id, updated);
      return updated;
    },

    findMany: async (params: { where?: any; take?: number; skip?: number; orderBy?: any }) => {
      let results = Array.from(this.swaps.values());

      if (params.where) {
        if (params.where.OR) {
          results = results.filter((s) =>
            params.where.OR.some((condition: any) => {
              return Object.entries(condition).every(
                ([key, value]) => s[key] === value
              );
            })
          );
        }
        if (params.where.status) {
          if (params.where.status.in) {
            results = results.filter((s) => params.where.status.in.includes(s.status));
          } else {
            results = results.filter((s) => s.status === params.where.status);
          }
        }
        if (params.where.expiresAt) {
          if (params.where.expiresAt.lt) {
            results = results.filter((s) => s.expiresAt < params.where.expiresAt.lt);
          }
        }
        if (params.where.updatedAt) {
          if (params.where.updatedAt.lt) {
            results = results.filter((s) => s.updatedAt < params.where.updatedAt.lt);
          }
        }
      }

      // Sort
      if (params.orderBy) {
        const [key, order] = Object.entries(params.orderBy)[0];
        results.sort((a, b) => {
          if (order === 'desc') {
            return b[key as string] > a[key as string] ? 1 : -1;
          }
          return a[key as string] > b[key as string] ? 1 : -1;
        });
      }

      // Pagination
      const skip = params.skip || 0;
      const take = params.take || results.length;
      return results.slice(skip, skip + take);
    },

    count: async (params: { where?: any }) => {
      let results = Array.from(this.swaps.values());

      if (params.where) {
        if (params.where.status) {
          if (params.where.status.in) {
            results = results.filter((s) => params.where.status.in.includes(s.status));
          } else {
            results = results.filter((s) => s.status === params.where.status);
          }
        }
      }

      return results.length;
    },
  };

  // Helper to reset state between tests
  reset() {
    this.swaps.clear();
    this.idCounter = 0;
  }

  // Helper to access swaps for assertions
  getSwaps() {
    return this.swaps;
  }

  // Helper to manually create a swap (bypassing state machine)
  async createSwapDirectly(data: Partial<any>): Promise<any> {
    const id = `swap-${++this.idCounter}`;
    const swap = {
      id,
      status: TwoPhaseSwapStatus.CREATED,
      partyA: 'PartyA111111111111111111111111111111111111',
      partyB: 'PartyB222222222222222222222222222222222222',
      assetsA: [{ type: 'CNFT', identifier: 'asset-a-1' }],
      assetsB: [{ type: 'CNFT', identifier: 'asset-b-1' }],
      solAmountA: null,
      solAmountB: null,
      platformFeeLamports: BigInt(10_000_000),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
      createdAt: new Date(),
      updatedAt: new Date(),
      delegationStatus: {},
      stateHistory: [],
      settleTxs: [],
      lockTxA: null,
      lockTxB: null,
      lockConfirmedA: null,
      lockConfirmedB: null,
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
      ...data,
    };
    this.swaps.set(id, swap);
    return swap;
  }
}

// =============================================================================
// Mock Services
// =============================================================================

class MockDelegationRevoker {
  public revokedAssets: string[] = [];
  public shouldFail: boolean = false;

  async revokeDelegation(assetId: string): Promise<{ success: boolean; signature?: string }> {
    if (this.shouldFail) {
      return { success: false };
    }
    this.revokedAssets.push(assetId);
    return { success: true, signature: `revoke-tx-${assetId}` };
  }

  reset() {
    this.revokedAssets = [];
    this.shouldFail = false;
  }
}

class MockSolReturner {
  public returnedAmounts: Array<{ wallet: string; amount: bigint }> = [];
  public shouldFail: boolean = false;

  async returnEscrowedSol(
    vaultPda: string,
    toWallet: string,
    amount: bigint
  ): Promise<{ success: boolean; signature?: string }> {
    if (this.shouldFail) {
      return { success: false };
    }
    this.returnedAmounts.push({ wallet: toWallet, amount });
    return { success: true, signature: `return-sol-tx-${toWallet}` };
  }

  reset() {
    this.returnedAmounts = [];
    this.shouldFail = false;
  }
}

class MockSettlementExecutor {
  public executedChunks: number[] = [];
  public shouldFail: boolean = false;
  public failAtIndex: number = -1;

  async executeSettlementChunk(
    swapId: string,
    chunkIndex: number
  ): Promise<{ success: boolean; signature?: string }> {
    if (this.shouldFail || this.failAtIndex === chunkIndex) {
      return { success: false };
    }
    this.executedChunks.push(chunkIndex);
    return { success: true, signature: `settle-tx-${chunkIndex}` };
  }

  reset() {
    this.executedChunks = [];
    this.shouldFail = false;
    this.failAtIndex = -1;
  }
}

class MockAlertService {
  public alerts: Array<{ type: string; swapId: string; message: string }> = [];

  async sendAlert(type: string, swapId: string, message: string): Promise<void> {
    this.alerts.push({ type, swapId, message });
  }

  reset() {
    this.alerts = [];
  }
}

// =============================================================================
// Test Suite
// =============================================================================

describe('SwapRecoveryService', () => {
  let prisma: MockPrismaClient;
  let stateMachine: SwapStateMachine;
  let recoveryService: SwapRecoveryService;
  let mockDelegationRevoker: MockDelegationRevoker;
  let mockSolReturner: MockSolReturner;
  let mockSettlementExecutor: MockSettlementExecutor;
  let mockAlertService: MockAlertService;

  // Test wallets
  const partyA = 'PartyAWalletAddress111111111111111111111111';
  const partyB = 'PartyBWalletAddress222222222222222222222222';

  // Test assets
  const testAssetsA: SwapAsset[] = [
    { type: 'CNFT', identifier: 'asset-a-1' },
  ];
  const testAssetsB: SwapAsset[] = [
    { type: 'CNFT', identifier: 'asset-b-1' },
  ];

  beforeEach(() => {
    prisma = new MockPrismaClient();
    stateMachine = createSwapStateMachine(prisma as any);
    mockDelegationRevoker = new MockDelegationRevoker();
    mockSolReturner = new MockSolReturner();
    mockSettlementExecutor = new MockSettlementExecutor();
    mockAlertService = new MockAlertService();

    recoveryService = createSwapRecoveryService({
      prisma: prisma as any,
      stateMachine,
      delegationRevoker: mockDelegationRevoker as any,
      solReturner: mockSolReturner as any,
      settlementExecutor: mockSettlementExecutor as any,
      alertService: mockAlertService as any,
      config: {
        maxRetries: 3,
        stuckThresholdMinutes: 10,
        lockTimeoutMinutes: 30,
      },
    });
  });

  afterEach(() => {
    prisma.reset();
    mockDelegationRevoker.reset();
    mockSolReturner.reset();
    mockSettlementExecutor.reset();
    mockAlertService.reset();
  });

  // ===========================================================================
  // Recovery Scenario 1: Lock Transaction Failed
  // ===========================================================================

  describe('Recovery Scenario: Lock Transaction Failed', () => {
    it('should retry lock submission up to 3 times', async () => {
      // Create swap in LOCKING_PARTY_A state
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.LOCKING_PARTY_A,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      // Simulate retry with eventual success
      let retryCount = 0;
      const mockRetryLock = async (): Promise<boolean> => {
        retryCount++;
        return retryCount >= 2; // Succeeds on 2nd try
      };

      const result = await recoveryService.recoverLockFailure(swap.id, {
        retryLockFn: mockRetryLock,
      });

      expect(result.success).to.be.true;
      expect(result.retriesAttempted).to.equal(2);
    });

    it('should revert to previous state if all retries fail', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.LOCKING_PARTY_A,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      // Mock always failing
      const mockRetryLock = async (): Promise<boolean> => false;

      const result = await recoveryService.recoverLockFailure(swap.id, {
        retryLockFn: mockRetryLock,
      });

      expect(result.success).to.be.false;
      expect(result.retriesAttempted).to.equal(3);
      expect(result.finalState).to.equal(TwoPhaseSwapStatus.ACCEPTED);
    });

    it('should notify user of lock failure', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.LOCKING_PARTY_A,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
      });

      const mockRetryLock = async (): Promise<boolean> => false;

      await recoveryService.recoverLockFailure(swap.id, {
        retryLockFn: mockRetryLock,
      });

      // Check that alert was sent
      expect(mockAlertService.alerts.some(
        (a) => a.type === 'LOCK_FAILURE' && a.swapId === swap.id
      )).to.be.true;
    });
  });

  // ===========================================================================
  // Recovery Scenario 2: One Party Locked, Other Didn't (Timeout)
  // ===========================================================================

  describe('Recovery Scenario: Partial Lock Timeout', () => {
    it('should expire swap after lock phase timeout', async () => {
      // Create swap with Party A locked but expired
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        solAmountA: BigInt(1_000_000_000),
        lockTxA: 'lockTxA123',
        lockConfirmedA: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        expiresAt: new Date(Date.now() - 30 * 60 * 1000), // Expired 30 min ago
        delegationStatus: {
          'asset-a-1': { assetId: 'asset-a-1', delegated: true },
        },
      });

      const result = await recoveryService.recoverExpiredPartialLock(swap.id);

      expect(result.success).to.be.true;
      expect(result.finalState).to.equal(TwoPhaseSwapStatus.EXPIRED);
    });

    it('should revoke delegation for locked party', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        lockTxA: 'lockTxA123',
        lockConfirmedA: new Date(),
        expiresAt: new Date(Date.now() - 30 * 60 * 1000), // Expired
        delegationStatus: {
          'asset-a-1': { assetId: 'asset-a-1', delegated: true },
        },
      });

      await recoveryService.recoverExpiredPartialLock(swap.id);

      // Check delegation was revoked
      expect(mockDelegationRevoker.revokedAssets).to.include('asset-a-1');
    });

    it('should release escrowed SOL for locked party', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        solAmountA: BigInt(1_000_000_000),
        lockTxA: 'lockTxA123',
        lockConfirmedA: new Date(),
        expiresAt: new Date(Date.now() - 30 * 60 * 1000), // Expired
      });

      await recoveryService.recoverExpiredPartialLock(swap.id);

      // Check SOL was returned
      expect(mockSolReturner.returnedAmounts.some(
        (r) => r.wallet === partyA && r.amount === BigInt(1_000_000_000)
      )).to.be.true;
    });

    it('should set status to EXPIRED', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        expiresAt: new Date(Date.now() - 30 * 60 * 1000), // Expired
      });

      const result = await recoveryService.recoverExpiredPartialLock(swap.id);

      expect(result.finalState).to.equal(TwoPhaseSwapStatus.EXPIRED);

      const updatedSwap = await prisma.twoPhaseSwap.findUnique({ where: { id: swap.id } });
      expect(updatedSwap?.status).to.equal(TwoPhaseSwapStatus.EXPIRED);
    });
  });

  // ===========================================================================
  // Recovery Scenario 3: Partial Settlement
  // ===========================================================================

  describe('Recovery Scenario: Partial Settlement', () => {
    it('should resume from currentSettleIndex', async () => {
      // Create swap with partial settlement
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        settleTxs: ['settleTx0', 'settleTx1'],
        currentSettleIndex: 2,
        totalSettleTxs: 5,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const result = await recoveryService.recoverPartialSettlement(swap.id);

      expect(result.success).to.be.true;
      // Should have executed chunks 2, 3, 4
      expect(mockSettlementExecutor.executedChunks).to.include(2);
      expect(mockSettlementExecutor.executedChunks).to.include(3);
      expect(mockSettlementExecutor.executedChunks).to.include(4);
    });

    it('should retry failed settlement chunk', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        settleTxs: ['settleTx0'],
        currentSettleIndex: 1,
        totalSettleTxs: 3,
      });

      // Fail first attempt at chunk 1, succeed on retry
      let chunk1Attempts = 0;
      mockSettlementExecutor.executeSettlementChunk = async (swapId: string, chunkIndex: number) => {
        if (chunkIndex === 1 && chunk1Attempts === 0) {
          chunk1Attempts++;
          return { success: false };
        }
        return { success: true, signature: `settle-tx-${chunkIndex}` };
      };

      const result = await recoveryService.recoverPartialSettlement(swap.id);

      expect(result.success).to.be.true;
      expect(result.chunksRecovered).to.equal(2); // Chunks 1 and 2
    });

    it('should complete settlement after recovery', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        settleTxs: ['settleTx0', 'settleTx1'],
        currentSettleIndex: 2,
        totalSettleTxs: 3,
      });

      const result = await recoveryService.recoverPartialSettlement(swap.id);

      expect(result.success).to.be.true;
      expect(result.finalState).to.equal(TwoPhaseSwapStatus.COMPLETED);
    });
  });

  // ===========================================================================
  // Recovery Scenario 4: Complete Failure
  // ===========================================================================

  describe('Recovery Scenario: Complete Failure', () => {
    it('should mark swap as FAILED after unrecoverable error', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.SETTLING,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
      });

      const result = await recoveryService.markAsFailed(swap.id, {
        errorMessage: 'Unrecoverable settlement error',
        errorCode: RecoveryErrorCode.SETTLEMENT_FAILED,
      });

      expect(result.success).to.be.true;
      expect(result.finalState).to.equal(TwoPhaseSwapStatus.FAILED);
    });

    it('should alert admin on failure', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.SETTLING,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
      });

      await recoveryService.markAsFailed(swap.id, {
        errorMessage: 'Critical failure',
        errorCode: RecoveryErrorCode.SETTLEMENT_FAILED,
      });

      expect(mockAlertService.alerts.some(
        (a) => a.type === 'SWAP_FAILED' && a.swapId === swap.id
      )).to.be.true;
    });

    describe('Manual Admin Intervention', () => {
      it('should allow admin to retry settlement', async () => {
        const swap = await prisma.createSwapDirectly({
          status: TwoPhaseSwapStatus.FAILED,
          partyA,
          partyB,
          assetsA: testAssetsA,
          assetsB: testAssetsB,
          settleTxs: ['tx0', 'tx1'], // Already completed chunks 0 and 1
          currentSettleIndex: 2,
          totalSettleTxs: 3,
          errorMessage: 'Previous failure',
          errorCode: RecoveryErrorCode.SETTLEMENT_FAILED,
        });

        const result = await recoveryService.adminRetrySettlement(swap.id);

        expect(result.success).to.be.true;
        expect(result.finalState).to.equal(TwoPhaseSwapStatus.COMPLETED);
      });

      it('should allow admin to rollback (revoke delegations, return escrow)', async () => {
        const swap = await prisma.createSwapDirectly({
          status: TwoPhaseSwapStatus.FAILED,
          partyA,
          partyB,
          assetsA: testAssetsA,
          assetsB: testAssetsB,
          solAmountA: BigInt(1_000_000_000),
          solAmountB: BigInt(500_000_000),
          lockTxA: 'lockTxA123',
          lockTxB: 'lockTxB123',
          delegationStatus: {
            'asset-a-1': { assetId: 'asset-a-1', delegated: true },
            'asset-b-1': { assetId: 'asset-b-1', delegated: true },
          },
        });

        const result = await recoveryService.adminRollback(swap.id);

        expect(result.success).to.be.true;
        // Delegations revoked
        expect(mockDelegationRevoker.revokedAssets).to.include('asset-a-1');
        expect(mockDelegationRevoker.revokedAssets).to.include('asset-b-1');
        // SOL returned
        expect(mockSolReturner.returnedAmounts.length).to.equal(2);
      });
    });
  });

  // ===========================================================================
  // Stuck Swap Detection
  // ===========================================================================

  describe('Stuck Swap Detection', () => {
    it('should detect swaps with no progress for N minutes', async () => {
      // Create swap that hasn't been updated in 15 minutes
      const oldDate = new Date(Date.now() - 15 * 60 * 1000);
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.LOCKING_PARTY_A,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        updatedAt: oldDate,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Not yet expired
      });

      const stuckSwaps = await recoveryService.findStuckSwaps();

      expect(stuckSwaps.some((s) => s.id === swap.id)).to.be.true;
    });

    it('should attempt automatic recovery for stuck swaps', async () => {
      const oldDate = new Date(Date.now() - 15 * 60 * 1000);
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        updatedAt: oldDate,
        settleTxs: ['tx0'],
        currentSettleIndex: 1,
        totalSettleTxs: 2,
      });

      const results = await recoveryService.processStuckSwaps();

      expect(results.length).to.equal(1);
      expect(results[0].swapId).to.equal(swap.id);
      expect(results[0].recoveryAttempted).to.be.true;
    });

    it('should escalate to admin if unrecoverable', async () => {
      const oldDate = new Date(Date.now() - 15 * 60 * 1000);
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.SETTLING,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        updatedAt: oldDate,
      });

      // Make settlement executor always fail
      mockSettlementExecutor.shouldFail = true;

      await recoveryService.processStuckSwaps();

      // Check admin alert was sent
      expect(mockAlertService.alerts.some(
        (a) => a.type === 'ADMIN_ESCALATION' && a.swapId === swap.id
      )).to.be.true;
    });

    it('should generate alerts for swaps stuck > 10 minutes', async () => {
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.LOCKING_PARTY_B,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        updatedAt: elevenMinutesAgo,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      await recoveryService.checkAndAlertStuckSwaps();

      expect(mockAlertService.alerts.some(
        (a) => a.type === 'STUCK_SWAP' && a.swapId === swap.id
      )).to.be.true;
    });
  });

  // ===========================================================================
  // Concurrent Recovery Prevention
  // ===========================================================================

  describe('Concurrent Recovery Prevention', () => {
    it('should prevent concurrent recovery attempts on same swap', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        settleTxs: ['tx0'],
        currentSettleIndex: 1,
        totalSettleTxs: 3,
      });

      // Start two recovery attempts simultaneously
      const promise1 = recoveryService.recoverPartialSettlement(swap.id);
      const promise2 = recoveryService.recoverPartialSettlement(swap.id);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, one should be blocked
      const successCount = [result1, result2].filter((r) => r.success).length;
      const blockedCount = [result1, result2].filter((r) => r.errorCode === RecoveryErrorCode.RECOVERY_IN_PROGRESS).length;

      expect(successCount).to.equal(1);
      expect(blockedCount).to.equal(1);
    });

    it('should release lock after recovery completes', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        settleTxs: ['tx0'],
        currentSettleIndex: 1,
        totalSettleTxs: 2,
      });

      // First recovery attempt
      const result1 = await recoveryService.recoverPartialSettlement(swap.id);
      expect(result1.success).to.be.true;

      // Reset for second test
      await prisma.twoPhaseSwap.update({
        where: { id: swap.id },
        data: {
          status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
          currentSettleIndex: 1,
          totalSettleTxs: 2,
        },
      });

      // Second recovery attempt should work (lock released)
      const result2 = await recoveryService.recoverPartialSettlement(swap.id);
      // Either succeeds or fails for other reasons, but NOT because of lock
      expect(result2.errorCode).to.not.equal(RecoveryErrorCode.RECOVERY_IN_PROGRESS);
    });
  });

  // ===========================================================================
  // Asset Return Verification
  // ===========================================================================

  describe('Asset Return Verification', () => {
    it('should verify all assets returned on rollback', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.FAILED,
        partyA,
        partyB,
        assetsA: [
          { type: 'CNFT', identifier: 'cnft-a-1' },
          { type: 'CNFT', identifier: 'cnft-a-2' },
        ],
        assetsB: [
          { type: 'CNFT', identifier: 'cnft-b-1' },
        ],
        solAmountA: BigInt(1_000_000_000),
        solAmountB: BigInt(500_000_000),
        delegationStatus: {
          'cnft-a-1': { assetId: 'cnft-a-1', delegated: true },
          'cnft-a-2': { assetId: 'cnft-a-2', delegated: true },
          'cnft-b-1': { assetId: 'cnft-b-1', delegated: true },
        },
      });

      const result = await recoveryService.adminRollback(swap.id);

      expect(result.success).to.be.true;
      // All cNFT delegations revoked
      expect(mockDelegationRevoker.revokedAssets).to.have.lengthOf(3);
      expect(mockDelegationRevoker.revokedAssets).to.include('cnft-a-1');
      expect(mockDelegationRevoker.revokedAssets).to.include('cnft-a-2');
      expect(mockDelegationRevoker.revokedAssets).to.include('cnft-b-1');
      // All SOL returned
      expect(mockSolReturner.returnedAmounts).to.have.lengthOf(2);
    });

    it('should handle partial rollback failures gracefully', async () => {
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.FAILED,
        partyA,
        partyB,
        assetsA: [{ type: 'CNFT', identifier: 'cnft-a-1' }],
        assetsB: [{ type: 'CNFT', identifier: 'cnft-b-1' }],
        delegationStatus: {
          'cnft-a-1': { assetId: 'cnft-a-1', delegated: true },
          'cnft-b-1': { assetId: 'cnft-b-1', delegated: true },
        },
      });

      // Make delegation revoker fail
      mockDelegationRevoker.shouldFail = true;

      const result = await recoveryService.adminRollback(swap.id);

      expect(result.success).to.be.false;
      expect(result.errorCode).to.equal(RecoveryErrorCode.ROLLBACK_PARTIAL_FAILURE);
      // Alert should be sent for partial failure
      expect(mockAlertService.alerts.some(
        (a) => a.type === 'ROLLBACK_PARTIAL_FAILURE'
      )).to.be.true;
    });
  });

  // ===========================================================================
  // Expiry Processing Tests
  // ===========================================================================

  describe('Expired Swap Processing', () => {
    it('should find and process expired swaps in batch', async () => {
      // Create multiple expired swaps
      for (let i = 0; i < 3; i++) {
        await prisma.createSwapDirectly({
          status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
          partyA,
          partyB,
          assetsA: testAssetsA,
          assetsB: testAssetsB,
          expiresAt: new Date(Date.now() - 30 * 60 * 1000), // Expired
        });
      }

      const results = await recoveryService.processExpiredSwaps();

      expect(results.processed).to.equal(3);
      expect(results.failed).to.equal(0);
    });

    it('should not process non-expired swaps', async () => {
      // Create non-expired swap
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Not expired
      });

      const results = await recoveryService.processExpiredSwaps();

      expect(results.processed).to.equal(0);
    });
  });

  // ===========================================================================
  // Service Configuration Tests
  // ===========================================================================

  describe('Service Configuration', () => {
    it('should respect maxRetries configuration', async () => {
      const customService = createSwapRecoveryService({
        prisma: prisma as any,
        stateMachine,
        delegationRevoker: mockDelegationRevoker as any,
        solReturner: mockSolReturner as any,
        settlementExecutor: mockSettlementExecutor as any,
        alertService: mockAlertService as any,
        config: {
          maxRetries: 5,
          stuckThresholdMinutes: 10,
          lockTimeoutMinutes: 30,
        },
      });

      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.LOCKING_PARTY_A,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
      });

      let retryCount = 0;
      const result = await customService.recoverLockFailure(swap.id, {
        retryLockFn: async () => {
          retryCount++;
          return false; // Always fail
        },
      });

      expect(retryCount).to.equal(5);
    });

    it('should respect stuckThresholdMinutes configuration', async () => {
      const customService = createSwapRecoveryService({
        prisma: prisma as any,
        stateMachine,
        delegationRevoker: mockDelegationRevoker as any,
        solReturner: mockSolReturner as any,
        settlementExecutor: mockSettlementExecutor as any,
        alertService: mockAlertService as any,
        config: {
          maxRetries: 3,
          stuckThresholdMinutes: 5, // 5 minutes
          lockTimeoutMinutes: 30,
        },
      });

      // Create swap updated 6 minutes ago
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.LOCKING_PARTY_A,
        partyA,
        partyB,
        assetsA: testAssetsA,
        assetsB: testAssetsB,
        updatedAt: sixMinutesAgo,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const stuckSwaps = await customService.findStuckSwaps();

      expect(stuckSwaps.some((s) => s.id === swap.id)).to.be.true;
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('Factory Function', () => {
    it('should create SwapRecoveryService instance', () => {
      const service = createSwapRecoveryService({
        prisma: prisma as any,
        stateMachine,
        delegationRevoker: mockDelegationRevoker as any,
        solReturner: mockSolReturner as any,
        settlementExecutor: mockSettlementExecutor as any,
        alertService: mockAlertService as any,
      });

      expect(service).to.be.instanceOf(SwapRecoveryService);
    });
  });
});
