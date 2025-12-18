/**
 * Unit Tests for SwapStateMachine Service
 *
 * Tests the two-phase swap state machine including:
 * - State transitions
 * - Invalid transition prevention
 * - Timeout/expiration handling
 * - Cancellation at each state
 * - Failure recovery logic
 *
 * Based on Task 8: Design Two-Phase Swap State Machine
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import {
  SwapStateMachine,
  createSwapStateMachine,
  VALID_TRANSITIONS,
  CANCELLABLE_STATES,
  LOCKED_STATES,
  TERMINAL_STATES,
  StateMachineError,
  InvalidTransitionError,
  SwapNotFoundError,
  SwapExpiredError,
  UnauthorizedError,
  CreateTwoPhaseSwapInput,
  SwapAsset,
  TwoPhaseSwapData,
} from '../../src/services/swapStateMachine';
import { TwoPhaseSwapStatus } from '../../src/generated/prisma';

// Mock Prisma Client
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
          results = results.filter((s) => s.status === params.where.status);
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
}

describe('SwapStateMachine', () => {
  let prisma: MockPrismaClient;
  let stateMachine: SwapStateMachine;

  // Test wallets
  const partyA = 'PartyAWalletAddress111111111111111111111111';
  const partyB = 'PartyBWalletAddress222222222222222222222222';
  const unauthorized = 'UnauthorizedWallet333333333333333333333333';

  // Test assets
  const testAssetsA: SwapAsset[] = [
    { type: 'CNFT', identifier: 'asset-a-1' },
    { type: 'NFT', identifier: 'asset-a-2-mint' },
  ];

  const testAssetsB: SwapAsset[] = [
    { type: 'CNFT', identifier: 'asset-b-1' },
  ];

  // Helper to create a swap input
  const createSwapInput = (overrides?: Partial<CreateTwoPhaseSwapInput>): CreateTwoPhaseSwapInput => ({
    partyA,
    partyB,
    assetsA: testAssetsA,
    assetsB: testAssetsB,
    solAmountA: BigInt(1_000_000_000), // 1 SOL
    solAmountB: BigInt(0),
    platformFeeLamports: BigInt(10_000_000), // 0.01 SOL
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    ...overrides,
  });

  beforeEach(() => {
    prisma = new MockPrismaClient();
    stateMachine = createSwapStateMachine(prisma as any);
  });

  afterEach(() => {
    prisma.reset();
  });

  // ===========================================================================
  // Error Classes Tests
  // ===========================================================================

  describe('Error Classes', () => {
    it('StateMachineError should have correct name', () => {
      const error = new StateMachineError('Test error');
      expect(error.name).to.equal('StateMachineError');
      expect(error.message).to.equal('Test error');
    });

    it('InvalidTransitionError should contain transition details', () => {
      const error = new InvalidTransitionError(
        TwoPhaseSwapStatus.CREATED,
        TwoPhaseSwapStatus.COMPLETED,
        [TwoPhaseSwapStatus.ACCEPTED, TwoPhaseSwapStatus.CANCELLED]
      );
      expect(error.name).to.equal('InvalidTransitionError');
      expect(error.currentState).to.equal(TwoPhaseSwapStatus.CREATED);
      expect(error.attemptedState).to.equal(TwoPhaseSwapStatus.COMPLETED);
      expect(error.validTransitions).to.include(TwoPhaseSwapStatus.ACCEPTED);
      expect(error.message).to.include('Invalid transition');
    });

    it('SwapNotFoundError should contain swap ID', () => {
      const error = new SwapNotFoundError('swap-123');
      expect(error.name).to.equal('SwapNotFoundError');
      expect(error.swapId).to.equal('swap-123');
      expect(error.message).to.include('swap-123');
    });

    it('SwapExpiredError should contain swap ID and expiry', () => {
      const expiresAt = new Date();
      const error = new SwapExpiredError('swap-123', expiresAt);
      expect(error.name).to.equal('SwapExpiredError');
      expect(error.swapId).to.equal('swap-123');
      expect(error.expiresAt).to.equal(expiresAt);
    });

    it('UnauthorizedError should contain operation details', () => {
      const error = new UnauthorizedError('swap-123', 'wallet-abc', 'cancel');
      expect(error.name).to.equal('UnauthorizedError');
      expect(error.swapId).to.equal('swap-123');
      expect(error.wallet).to.equal('wallet-abc');
      expect(error.message).to.include('cancel');
    });
  });

  // ===========================================================================
  // State Transition Constants Tests
  // ===========================================================================

  describe('State Transition Constants', () => {
    it('should define valid transitions for all states', () => {
      const allStates = Object.values(TwoPhaseSwapStatus);
      for (const state of allStates) {
        expect(VALID_TRANSITIONS[state]).to.be.an('array');
      }
    });

    it('terminal states should have no valid transitions', () => {
      for (const state of TERMINAL_STATES) {
        expect(VALID_TRANSITIONS[state]).to.be.empty;
      }
    });

    it('CREATED should only transition to ACCEPTED, CANCELLED, or EXPIRED', () => {
      const validNext = VALID_TRANSITIONS[TwoPhaseSwapStatus.CREATED];
      expect(validNext).to.include(TwoPhaseSwapStatus.ACCEPTED);
      expect(validNext).to.include(TwoPhaseSwapStatus.CANCELLED);
      expect(validNext).to.include(TwoPhaseSwapStatus.EXPIRED);
      expect(validNext).to.have.lengthOf(3);
    });

    it('FULLY_LOCKED should only transition to SETTLING or FAILED', () => {
      const validNext = VALID_TRANSITIONS[TwoPhaseSwapStatus.FULLY_LOCKED];
      expect(validNext).to.include(TwoPhaseSwapStatus.SETTLING);
      expect(validNext).to.include(TwoPhaseSwapStatus.FAILED);
      expect(validNext).to.have.lengthOf(2);
    });

    it('CANCELLABLE_STATES should include lock phase states but not terminal', () => {
      expect(CANCELLABLE_STATES).to.include(TwoPhaseSwapStatus.CREATED);
      expect(CANCELLABLE_STATES).to.include(TwoPhaseSwapStatus.ACCEPTED);
      expect(CANCELLABLE_STATES).to.not.include(TwoPhaseSwapStatus.COMPLETED);
      expect(CANCELLABLE_STATES).to.not.include(TwoPhaseSwapStatus.FAILED);
    });

    it('LOCKED_STATES should include states where assets are committed', () => {
      expect(LOCKED_STATES).to.include(TwoPhaseSwapStatus.PARTY_A_LOCKED);
      expect(LOCKED_STATES).to.include(TwoPhaseSwapStatus.FULLY_LOCKED);
      expect(LOCKED_STATES).to.not.include(TwoPhaseSwapStatus.CREATED);
    });

    it('TERMINAL_STATES should include all final states', () => {
      expect(TERMINAL_STATES).to.include(TwoPhaseSwapStatus.COMPLETED);
      expect(TERMINAL_STATES).to.include(TwoPhaseSwapStatus.FAILED);
      expect(TERMINAL_STATES).to.include(TwoPhaseSwapStatus.CANCELLED);
      expect(TERMINAL_STATES).to.include(TwoPhaseSwapStatus.EXPIRED);
      expect(TERMINAL_STATES).to.have.lengthOf(4);
    });
  });

  // ===========================================================================
  // Swap Creation Tests
  // ===========================================================================

  describe('createSwap', () => {
    it('should create a swap with CREATED status', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      expect(swap.id).to.exist;
      expect(swap.status).to.equal(TwoPhaseSwapStatus.CREATED);
      expect(swap.partyA).to.equal(partyA);
      expect(swap.partyB).to.equal(partyB);
    });

    it('should store assets correctly', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      expect(swap.assetsA).to.deep.equal(testAssetsA);
      expect(swap.assetsB).to.deep.equal(testAssetsB);
    });

    it('should store SOL amounts correctly', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      expect(swap.solAmountA).to.equal(BigInt(1_000_000_000));
      // solAmountB is null when 0 (not stored in DB)
      expect(swap.solAmountB).to.be.null;
    });

    it('should initialize delegation status for cNFT assets', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      expect(swap.delegationStatus['asset-a-1']).to.exist;
      expect(swap.delegationStatus['asset-a-1'].delegated).to.be.false;
      expect(swap.delegationStatus['asset-b-1']).to.exist;
      expect(swap.delegationStatus['asset-b-1'].delegated).to.be.false;
    });

    it('should create initial state history entry', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      expect(swap.stateHistory).to.have.lengthOf(1);
      expect(swap.stateHistory[0].toState).to.equal(TwoPhaseSwapStatus.CREATED);
      expect(swap.stateHistory[0].triggeredBy).to.equal(partyA);
    });

    it('should allow open swaps (no partyB)', async () => {
      const input = createSwapInput({ partyB: undefined });
      const swap = await stateMachine.createSwap(input);

      // partyB is undefined when not specified (open swap)
      expect(swap.partyB).to.not.exist;
    });

    it('should throw error if partyA is missing', async () => {
      const input = createSwapInput({ partyA: '' });

      try {
        await stateMachine.createSwap(input);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(StateMachineError);
        expect(error.message).to.include('Party A');
      }
    });

    it('should throw error if no assets or SOL offered by partyA', async () => {
      const input = createSwapInput({
        assetsA: [],
        solAmountA: BigInt(0),
      });

      try {
        await stateMachine.createSwap(input);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(StateMachineError);
        expect(error.message).to.include('Party A must offer');
      }
    });

    it('should throw error if no assets or SOL offered by partyB', async () => {
      const input = createSwapInput({
        assetsB: [],
        solAmountB: BigInt(0),
      });

      try {
        await stateMachine.createSwap(input);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(StateMachineError);
        expect(error.message).to.include('Party B must offer');
      }
    });

    it('should throw error if expiresAt is in the past', async () => {
      const input = createSwapInput({
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      });

      try {
        await stateMachine.createSwap(input);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(StateMachineError);
        expect(error.message).to.include('future');
      }
    });
  });

  // ===========================================================================
  // State Transition Validation Tests
  // ===========================================================================

  describe('isValidTransition', () => {
    it('should return true for valid transitions', () => {
      expect(stateMachine.isValidTransition(
        TwoPhaseSwapStatus.CREATED,
        TwoPhaseSwapStatus.ACCEPTED
      )).to.be.true;

      expect(stateMachine.isValidTransition(
        TwoPhaseSwapStatus.ACCEPTED,
        TwoPhaseSwapStatus.LOCKING_PARTY_A
      )).to.be.true;

      expect(stateMachine.isValidTransition(
        TwoPhaseSwapStatus.FULLY_LOCKED,
        TwoPhaseSwapStatus.SETTLING
      )).to.be.true;
    });

    it('should return false for invalid transitions', () => {
      expect(stateMachine.isValidTransition(
        TwoPhaseSwapStatus.CREATED,
        TwoPhaseSwapStatus.COMPLETED
      )).to.be.false;

      expect(stateMachine.isValidTransition(
        TwoPhaseSwapStatus.COMPLETED,
        TwoPhaseSwapStatus.CREATED
      )).to.be.false;

      expect(stateMachine.isValidTransition(
        TwoPhaseSwapStatus.SETTLING,
        TwoPhaseSwapStatus.CREATED
      )).to.be.false;
    });

    it('should return false for transitions from terminal states', () => {
      for (const terminalState of TERMINAL_STATES) {
        for (const targetState of Object.values(TwoPhaseSwapStatus)) {
          if (targetState !== terminalState) {
            expect(stateMachine.isValidTransition(terminalState, targetState)).to.be.false;
          }
        }
      }
    });
  });

  // ===========================================================================
  // State Transition Tests
  // ===========================================================================

  describe('transition', () => {
    it('should transition swap to new state', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      const result = await stateMachine.transition(
        swap.id,
        TwoPhaseSwapStatus.ACCEPTED,
        { reason: 'Test transition', triggeredBy: partyB }
      );

      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.ACCEPTED);
      expect(result.previousState).to.equal(TwoPhaseSwapStatus.CREATED);
      expect(result.swap?.status).to.equal(TwoPhaseSwapStatus.ACCEPTED);
    });

    it('should add entry to state history', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      await stateMachine.transition(
        swap.id,
        TwoPhaseSwapStatus.ACCEPTED,
        { reason: 'Accepted by counterparty', triggeredBy: partyB }
      );

      const updated = await stateMachine.getSwap(swap.id);
      expect(updated?.stateHistory).to.have.lengthOf(2);
      expect(updated?.stateHistory[1].fromState).to.equal(TwoPhaseSwapStatus.CREATED);
      expect(updated?.stateHistory[1].toState).to.equal(TwoPhaseSwapStatus.ACCEPTED);
      expect(updated?.stateHistory[1].reason).to.equal('Accepted by counterparty');
    });

    it('should fail for invalid transitions', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      const result = await stateMachine.transition(
        swap.id,
        TwoPhaseSwapStatus.COMPLETED, // Invalid - can't go directly from CREATED to COMPLETED
        { reason: 'Invalid test' }
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include('Invalid transition');
    });

    it('should fail for non-existent swap', async () => {
      const result = await stateMachine.transition(
        'non-existent-id',
        TwoPhaseSwapStatus.ACCEPTED,
        {}
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include('not found');
    });

    it('should store additional data on transition', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      // First transition to ACCEPTED
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});

      // Then to LOCKING_PARTY_A
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_A, {});

      // Then to PARTY_A_LOCKED with lock transaction
      const lockTxId = 'lockTx123456789';
      const result = await stateMachine.transition(
        swap.id,
        TwoPhaseSwapStatus.PARTY_A_LOCKED,
        {
          additionalData: {
            lockTxA: lockTxId,
            lockConfirmedA: new Date(),
          },
        }
      );

      expect(result.success).to.be.true;
      expect(result.swap?.lockTxA).to.equal(lockTxId);
      expect(result.swap?.lockConfirmedA).to.exist;
    });
  });

  // ===========================================================================
  // Lock Phase Tests
  // ===========================================================================

  describe('Lock Phase Operations', () => {
    let swap: TwoPhaseSwapData;

    beforeEach(async () => {
      const input = createSwapInput();
      swap = await stateMachine.createSwap(input);
      // Accept the swap first
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {
        triggeredBy: partyB,
      });
    });

    describe('startLockingPartyA', () => {
      it('should transition to LOCKING_PARTY_A', async () => {
        const result = await stateMachine.startLockingPartyA(swap.id, partyA);

        expect(result.success).to.be.true;
        expect(result.newState).to.equal(TwoPhaseSwapStatus.LOCKING_PARTY_A);
      });
    });

    describe('confirmPartyALock', () => {
      it('should transition to PARTY_A_LOCKED and store lock tx', async () => {
        await stateMachine.startLockingPartyA(swap.id, partyA);

        const lockTx = 'partyALockTx123';
        const result = await stateMachine.confirmPartyALock(swap.id, lockTx, partyA);

        expect(result.success).to.be.true;
        expect(result.newState).to.equal(TwoPhaseSwapStatus.PARTY_A_LOCKED);
        expect(result.swap?.lockTxA).to.equal(lockTx);
        expect(result.swap?.lockConfirmedA).to.exist;
      });
    });

    describe('startLockingPartyB', () => {
      it('should transition to LOCKING_PARTY_B', async () => {
        await stateMachine.startLockingPartyA(swap.id, partyA);
        await stateMachine.confirmPartyALock(swap.id, 'lockTxA', partyA);

        const result = await stateMachine.startLockingPartyB(swap.id, partyB);

        expect(result.success).to.be.true;
        expect(result.newState).to.equal(TwoPhaseSwapStatus.LOCKING_PARTY_B);
      });
    });

    describe('confirmPartyBLock', () => {
      it('should transition to FULLY_LOCKED and store lock tx', async () => {
        await stateMachine.startLockingPartyA(swap.id, partyA);
        await stateMachine.confirmPartyALock(swap.id, 'lockTxA', partyA);
        await stateMachine.startLockingPartyB(swap.id, partyB);

        const lockTx = 'partyBLockTx123';
        const result = await stateMachine.confirmPartyBLock(swap.id, lockTx, partyB);

        expect(result.success).to.be.true;
        expect(result.newState).to.equal(TwoPhaseSwapStatus.FULLY_LOCKED);
        expect(result.swap?.lockTxB).to.equal(lockTx);
        expect(result.swap?.lockConfirmedB).to.exist;
      });
    });
  });

  // ===========================================================================
  // Settlement Phase Tests
  // ===========================================================================

  describe('Settlement Phase Operations', () => {
    let swap: TwoPhaseSwapData;

    beforeEach(async () => {
      const input = createSwapInput();
      swap = await stateMachine.createSwap(input);
      // Progress through lock phase
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_A, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.PARTY_A_LOCKED, {
        additionalData: { lockTxA: 'lockA', lockConfirmedA: new Date() },
      });
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_B, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.FULLY_LOCKED, {
        additionalData: { lockTxB: 'lockB', lockConfirmedB: new Date() },
      });
    });

    describe('startSettlement', () => {
      it('should transition to SETTLING', async () => {
        const result = await stateMachine.startSettlement(swap.id, 1, 'system');

        expect(result.success).to.be.true;
        expect(result.newState).to.equal(TwoPhaseSwapStatus.SETTLING);
      });

      it('should set total transaction count', async () => {
        await stateMachine.startSettlement(swap.id, 3, 'system');

        const updated = await stateMachine.getSwap(swap.id);
        expect(updated?.totalSettleTxs).to.equal(3);
      });
    });

    describe('recordSettlementTx', () => {
      it('should record settlement transaction and update progress', async () => {
        await stateMachine.startSettlement(swap.id, 3, 'system');

        const result = await stateMachine.recordSettlementTx(swap.id, 'settleTx1', 'system');

        expect(result.success).to.be.true;
        expect(result.swap?.settleTxs).to.include('settleTx1');
        expect(result.swap?.currentSettleIndex).to.equal(1);
      });

      it('should transition to PARTIAL_SETTLE after first tx of multi-tx settlement', async () => {
        await stateMachine.startSettlement(swap.id, 3, 'system');

        const result = await stateMachine.recordSettlementTx(swap.id, 'settleTx1', 'system');

        expect(result.newState).to.equal(TwoPhaseSwapStatus.PARTIAL_SETTLE);
      });

      it('should transition to COMPLETED when all transactions are done', async () => {
        await stateMachine.startSettlement(swap.id, 2, 'system');
        await stateMachine.recordSettlementTx(swap.id, 'settleTx1', 'system');

        const result = await stateMachine.recordSettlementTx(swap.id, 'settleTx2', 'system');

        expect(result.newState).to.equal(TwoPhaseSwapStatus.COMPLETED);
        expect(result.swap?.settledAt).to.exist;
      });
    });

    describe('completeSettlement', () => {
      it('should transition to COMPLETED with final tx', async () => {
        await stateMachine.startSettlement(swap.id, 1, 'system');

        const result = await stateMachine.completeSettlement(
          swap.id,
          'finalSettleTx123',
          'system'
        );

        expect(result.success).to.be.true;
        expect(result.newState).to.equal(TwoPhaseSwapStatus.COMPLETED);
        expect(result.swap?.finalSettleTx).to.equal('finalSettleTx123');
        expect(result.swap?.settledAt).to.exist;
      });
    });
  });

  // ===========================================================================
  // Cancellation Tests
  // ===========================================================================

  describe('Cancellation', () => {
    it('should allow cancellation in CREATED state', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      const result = await stateMachine.cancelSwap(swap.id, partyA, 'Changed mind');

      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.CANCELLED);
      expect(result.swap?.cancelledBy).to.equal(partyA);
      expect(result.swap?.cancelReason).to.equal('Changed mind');
    });

    it('should allow cancellation in ACCEPTED state', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});

      const result = await stateMachine.cancelSwap(swap.id, partyB);

      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.CANCELLED);
    });

    it('should allow cancellation during lock phase', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_A, {});

      const result = await stateMachine.cancelSwap(swap.id, partyA);

      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.CANCELLED);
    });

    it('should not allow cancellation in FULLY_LOCKED state', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_A, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.PARTY_A_LOCKED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_B, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.FULLY_LOCKED, {});

      const result = await stateMachine.cancelSwap(swap.id, partyA);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Cannot cancel');
    });

    it('should not allow cancellation in SETTLING state', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_A, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.PARTY_A_LOCKED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_B, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.FULLY_LOCKED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.SETTLING, {});

      const result = await stateMachine.cancelSwap(swap.id, partyA);

      expect(result.success).to.be.false;
    });

    it('should not allow cancellation by unauthorized party', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      const result = await stateMachine.cancelSwap(swap.id, unauthorized);

      expect(result.success).to.be.false;
      expect(result.error).to.include('not authorized');
    });
  });

  // ===========================================================================
  // Failure Handling Tests
  // ===========================================================================

  describe('Failure Handling', () => {
    it('should transition to FAILED with error details', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_A, {});

      const result = await stateMachine.failSwap(
        swap.id,
        'Delegation failed: insufficient funds',
        'DELEGATION_FAILED'
      );

      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.FAILED);
      expect(result.swap?.errorMessage).to.equal('Delegation failed: insufficient funds');
      expect(result.swap?.errorCode).to.equal('DELEGATION_FAILED');
      expect(result.swap?.failedAt).to.exist;
    });

    it('should allow failure from LOCKING states', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_A, {});

      const result = await stateMachine.failSwap(swap.id, 'Lock failed');
      expect(result.success).to.be.true;
    });

    it('should allow failure from SETTLING state', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_A, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.PARTY_A_LOCKED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_B, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.FULLY_LOCKED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.SETTLING, {});

      const result = await stateMachine.failSwap(swap.id, 'Settlement tx failed');
      expect(result.success).to.be.true;
    });
  });

  // ===========================================================================
  // Expiration Tests
  // ===========================================================================

  describe('Expiration Handling', () => {
    it('should transition to EXPIRED when expireSwap is called', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      const result = await stateMachine.expireSwap(swap.id);

      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.EXPIRED);
    });

    it('should auto-expire when transitioning to lock phase after expiry', async () => {
      // Create swap with very short expiry (already expired)
      const input = createSwapInput({
        expiresAt: new Date(Date.now() + 100), // 100ms from now
      });
      const swap = await stateMachine.createSwap(input);
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Try to start lock phase
      const result = await stateMachine.startLockingPartyA(swap.id, partyA);

      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.EXPIRED);
    });

    it('should find expired swaps', async () => {
      // Create an expired swap
      const expiredInput = createSwapInput({
        expiresAt: new Date(Date.now() - 1000), // Already expired
      });
      // Manually create with past date (bypass validation)
      const expiredSwap = await prisma.twoPhaseSwap.create({
        data: {
          status: TwoPhaseSwapStatus.ACCEPTED,
          partyA,
          partyB,
          assetsA: testAssetsA as any,
          assetsB: testAssetsB as any,
          platformFeeLamports: BigInt(10_000_000),
          expiresAt: new Date(Date.now() - 1000), // Already expired
          delegationStatus: {},
          stateHistory: [],
          settleTxs: [],
        },
      });

      const expiredSwaps = await stateMachine.getExpiredSwaps();

      expect(expiredSwaps.some((s) => s.id === expiredSwap.id)).to.be.true;
    });

    it('should process expired swaps in batch', async () => {
      // Create multiple expired swaps
      for (let i = 0; i < 3; i++) {
        await prisma.twoPhaseSwap.create({
          data: {
            status: TwoPhaseSwapStatus.ACCEPTED,
            partyA,
            partyB,
            assetsA: testAssetsA as any,
            assetsB: testAssetsB as any,
            platformFeeLamports: BigInt(10_000_000),
            expiresAt: new Date(Date.now() - 1000),
            delegationStatus: {},
            stateHistory: [],
            settleTxs: [],
          },
        });
      }

      const processed = await stateMachine.processExpiredSwaps();

      expect(processed).to.equal(3);
    });
  });

  // ===========================================================================
  // Accept Operation Tests
  // ===========================================================================

  describe('Accept Operation', () => {
    it('should accept open swap and set partyB', async () => {
      const input = createSwapInput({ partyB: undefined });
      const swap = await stateMachine.createSwap(input);

      const result = await stateMachine.acceptSwap(swap.id, partyB);

      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.ACCEPTED);
    });

    it('should fail if wrong party tries to accept private swap', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      const result = await stateMachine.acceptSwap(swap.id, unauthorized);

      expect(result.success).to.be.false;
      expect(result.error).to.include('designated');
    });

    it('should fail if swap is not in CREATED state', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});

      const result = await stateMachine.acceptSwap(swap.id, partyB);

      expect(result.success).to.be.false;
      expect(result.error).to.include('cannot be accepted');
    });

    it('should auto-expire if accepting after expiry', async () => {
      const input = createSwapInput({
        expiresAt: new Date(Date.now() + 100),
      });
      const swap = await stateMachine.createSwap(input);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = await stateMachine.acceptSwap(swap.id, partyB);

      expect(result.newState).to.equal(TwoPhaseSwapStatus.EXPIRED);
    });
  });

  // ===========================================================================
  // Delegation Status Tests
  // ===========================================================================

  describe('Delegation Status Updates', () => {
    it('should update asset delegation status', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      const updated = await stateMachine.updateAssetDelegation(swap.id, 'asset-a-1', {
        delegated: true,
        delegateTxId: 'delegateTx123',
        delegatedAt: new Date().toISOString(),
        delegatePda: 'delegatePDA123',
      });

      expect(updated.delegationStatus['asset-a-1'].delegated).to.be.true;
      expect(updated.delegationStatus['asset-a-1'].delegateTxId).to.equal('delegateTx123');
    });

    it('should throw for non-existent swap', async () => {
      try {
        await stateMachine.updateAssetDelegation('non-existent', 'asset-1', {
          delegated: true,
        });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(SwapNotFoundError);
      }
    });
  });

  // ===========================================================================
  // Query Operations Tests
  // ===========================================================================

  describe('Query Operations', () => {
    describe('getSwap', () => {
      it('should return swap by ID', async () => {
        const input = createSwapInput();
        const created = await stateMachine.createSwap(input);

        const swap = await stateMachine.getSwap(created.id);

        expect(swap).to.exist;
        expect(swap?.id).to.equal(created.id);
      });

      it('should return null for non-existent swap', async () => {
        const swap = await stateMachine.getSwap('non-existent');
        expect(swap).to.be.null;
      });
    });

    describe('getSwapsByParty', () => {
      beforeEach(async () => {
        // Create multiple swaps
        await stateMachine.createSwap(createSwapInput());
        await stateMachine.createSwap(createSwapInput());
        await stateMachine.createSwap(createSwapInput({
          partyA: 'OtherParty',
        }));
      });

      it('should return swaps for partyA', async () => {
        const result = await stateMachine.getSwapsByParty(partyA);

        expect(result.swaps).to.have.lengthOf(2);
        expect(result.total).to.equal(2);
      });

      it('should return swaps for partyB', async () => {
        const result = await stateMachine.getSwapsByParty(partyB);

        expect(result.swaps).to.have.lengthOf(3); // All swaps have partyB
      });

      it('should filter by status', async () => {
        // Accept one swap
        const swaps = await stateMachine.getSwapsByParty(partyA);
        await stateMachine.transition(swaps.swaps[0].id, TwoPhaseSwapStatus.ACCEPTED, {});

        const createdSwaps = await stateMachine.getSwapsByParty(partyA, {
          status: TwoPhaseSwapStatus.CREATED,
        });

        expect(createdSwaps.swaps).to.have.lengthOf(1);
      });

      it('should respect pagination', async () => {
        const result = await stateMachine.getSwapsByParty(partyB, {
          limit: 2,
          offset: 0,
        });

        expect(result.swaps).to.have.lengthOf(2);
        expect(result.total).to.equal(3);
      });
    });
  });

  // ===========================================================================
  // Utility Methods Tests
  // ===========================================================================

  describe('Utility Methods', () => {
    describe('isTerminalState', () => {
      it('should return true for terminal states', () => {
        expect(stateMachine.isTerminalState(TwoPhaseSwapStatus.COMPLETED)).to.be.true;
        expect(stateMachine.isTerminalState(TwoPhaseSwapStatus.FAILED)).to.be.true;
        expect(stateMachine.isTerminalState(TwoPhaseSwapStatus.CANCELLED)).to.be.true;
        expect(stateMachine.isTerminalState(TwoPhaseSwapStatus.EXPIRED)).to.be.true;
      });

      it('should return false for non-terminal states', () => {
        expect(stateMachine.isTerminalState(TwoPhaseSwapStatus.CREATED)).to.be.false;
        expect(stateMachine.isTerminalState(TwoPhaseSwapStatus.SETTLING)).to.be.false;
      });
    });

    describe('canCancel', () => {
      it('should return true for cancellable states', () => {
        expect(stateMachine.canCancel(TwoPhaseSwapStatus.CREATED)).to.be.true;
        expect(stateMachine.canCancel(TwoPhaseSwapStatus.ACCEPTED)).to.be.true;
        expect(stateMachine.canCancel(TwoPhaseSwapStatus.LOCKING_PARTY_A)).to.be.true;
      });

      it('should return false for non-cancellable states', () => {
        expect(stateMachine.canCancel(TwoPhaseSwapStatus.FULLY_LOCKED)).to.be.false;
        expect(stateMachine.canCancel(TwoPhaseSwapStatus.SETTLING)).to.be.false;
        expect(stateMachine.canCancel(TwoPhaseSwapStatus.COMPLETED)).to.be.false;
      });
    });

    describe('isPartyLocked', () => {
      it('should correctly identify Party A lock status', () => {
        expect(stateMachine.isPartyLocked(TwoPhaseSwapStatus.CREATED, 'A')).to.be.false;
        expect(stateMachine.isPartyLocked(TwoPhaseSwapStatus.PARTY_A_LOCKED, 'A')).to.be.true;
        expect(stateMachine.isPartyLocked(TwoPhaseSwapStatus.FULLY_LOCKED, 'A')).to.be.true;
      });

      it('should correctly identify Party B lock status', () => {
        expect(stateMachine.isPartyLocked(TwoPhaseSwapStatus.PARTY_A_LOCKED, 'B')).to.be.false;
        expect(stateMachine.isPartyLocked(TwoPhaseSwapStatus.FULLY_LOCKED, 'B')).to.be.true;
        expect(stateMachine.isPartyLocked(TwoPhaseSwapStatus.SETTLING, 'B')).to.be.true;
      });
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('Factory Function', () => {
    it('should create SwapStateMachine instance', () => {
      const machine = createSwapStateMachine(prisma as any);
      expect(machine).to.be.instanceOf(SwapStateMachine);
    });
  });

  // ===========================================================================
  // Full Lifecycle Test
  // ===========================================================================

  describe('Full Swap Lifecycle', () => {
    it('should complete a full happy-path swap', async () => {
      // 1. Create swap
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);
      expect(swap.status).to.equal(TwoPhaseSwapStatus.CREATED);

      // 2. Accept swap
      let result = await stateMachine.acceptSwap(swap.id, partyB);
      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.ACCEPTED);

      // 3. Party A starts locking
      result = await stateMachine.startLockingPartyA(swap.id, partyA);
      expect(result.newState).to.equal(TwoPhaseSwapStatus.LOCKING_PARTY_A);

      // 4. Party A lock confirmed
      result = await stateMachine.confirmPartyALock(swap.id, 'lockTxA123', partyA);
      expect(result.newState).to.equal(TwoPhaseSwapStatus.PARTY_A_LOCKED);

      // 5. Party B starts locking
      result = await stateMachine.startLockingPartyB(swap.id, partyB);
      expect(result.newState).to.equal(TwoPhaseSwapStatus.LOCKING_PARTY_B);

      // 6. Party B lock confirmed
      result = await stateMachine.confirmPartyBLock(swap.id, 'lockTxB123', partyB);
      expect(result.newState).to.equal(TwoPhaseSwapStatus.FULLY_LOCKED);

      // 7. Start settlement
      result = await stateMachine.startSettlement(swap.id, 1, 'system');
      expect(result.newState).to.equal(TwoPhaseSwapStatus.SETTLING);

      // 8. Complete settlement
      result = await stateMachine.completeSettlement(swap.id, 'finalTx123', 'system');
      expect(result.newState).to.equal(TwoPhaseSwapStatus.COMPLETED);

      // Verify final state
      const finalSwap = await stateMachine.getSwap(swap.id);
      expect(finalSwap?.status).to.equal(TwoPhaseSwapStatus.COMPLETED);
      expect(finalSwap?.lockTxA).to.equal('lockTxA123');
      expect(finalSwap?.lockTxB).to.equal('lockTxB123');
      expect(finalSwap?.finalSettleTx).to.equal('finalTx123');
      expect(finalSwap?.settledAt).to.exist;
      expect(finalSwap?.stateHistory.length).to.be.greaterThan(5);
    });

    it('should handle cancellation mid-flow', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      await stateMachine.acceptSwap(swap.id, partyB);
      await stateMachine.startLockingPartyA(swap.id, partyA);

      // Cancel during lock phase
      const result = await stateMachine.cancelSwap(swap.id, partyA, 'No longer want to trade');

      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.CANCELLED);

      const finalSwap = await stateMachine.getSwap(swap.id);
      expect(finalSwap?.cancelReason).to.equal('No longer want to trade');
    });

    it('should handle failure during settlement', async () => {
      const input = createSwapInput();
      const swap = await stateMachine.createSwap(input);

      // Progress to SETTLING
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.ACCEPTED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_A, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.PARTY_A_LOCKED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.LOCKING_PARTY_B, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.FULLY_LOCKED, {});
      await stateMachine.transition(swap.id, TwoPhaseSwapStatus.SETTLING, {});

      // Settlement fails
      const result = await stateMachine.failSwap(
        swap.id,
        'Transaction simulation failed',
        'TX_SIM_FAILED'
      );

      expect(result.success).to.be.true;
      expect(result.newState).to.equal(TwoPhaseSwapStatus.FAILED);

      const finalSwap = await stateMachine.getSwap(swap.id);
      expect(finalSwap?.errorMessage).to.include('simulation failed');
      expect(finalSwap?.errorCode).to.equal('TX_SIM_FAILED');
    });
  });
});
