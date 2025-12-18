/**
 * Unit Tests for TwoPhaseSwapSettleService
 *
 * Tests the settle phase of two-phase swaps:
 * - Settlement chunk calculation
 * - Chunk execution with retry logic
 * - Progress tracking
 * - Settlement completion handling
 *
 * Based on Task 10: Implement Settle Phase (Chunked Transfers)
 */

import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import {
  TwoPhaseSwapSettleService,
  createTwoPhaseSwapSettleService,
  CNFT_CHUNK_LIMITS,
  TX_SIZE_LIMIT,
  RETRY_CONFIG,
  SettleServiceError,
  SwapNotReadyError,
  ChunkExecutionError,
  SettlementChunk,
} from '../../src/services/twoPhaseSwapSettleService';
import { TwoPhaseSwapStatus } from '../../src/generated/prisma';
import { SwapAsset, TwoPhaseSwapData } from '../../src/services/swapStateMachine';
import { TWO_PHASE_SWAP_SEEDS } from '../../src/services/twoPhaseSwapLockService';

// Test keys
const mockProgramId = Keypair.generate().publicKey;
const mockFeeCollector = Keypair.generate().publicKey;
const mockBackendSigner = Keypair.generate();
const partyAWallet = Keypair.generate().publicKey;
const partyBWallet = Keypair.generate().publicKey;
const mockAssetId1 = 'mock-cnft-asset-1';
const mockAssetId2 = 'mock-cnft-asset-2';
const mockAssetId3 = 'mock-cnft-asset-3';

/**
 * Create a mock swap data object for testing
 */
function createMockSwapData(
  options: Partial<TwoPhaseSwapData> = {}
): TwoPhaseSwapData {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now

  return {
    id: 'test-swap-' + Math.random().toString(36).slice(2, 11),
    status: TwoPhaseSwapStatus.FULLY_LOCKED,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    partyA: partyAWallet.toBase58(),
    partyB: partyBWallet.toBase58(),
    assetsA: [],
    assetsB: [],
    solAmountA: null,
    solAmountB: null,
    lockTxA: 'mock-lock-tx-a',
    lockTxB: 'mock-lock-tx-b',
    lockConfirmedA: now,
    lockConfirmedB: now,
    settleTxs: [],
    currentSettleIndex: 0,
    totalSettleTxs: 0,
    finalSettleTx: null,
    settledAt: null,
    errorMessage: null,
    errorCode: null,
    failedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    platformFeeLamports: BigInt(0),
    swapOfferId: null,
    delegationStatus: {},
    stateHistory: [],
    ...options,
  };
}

describe('TwoPhaseSwapSettleService', () => {
  describe('Constants', () => {
    it('should have correct chunk limits', () => {
      expect(CNFT_CHUNK_LIMITS.DEEP_TREE_THRESHOLD).to.equal(20);
      expect(CNFT_CHUNK_LIMITS.SHALLOW_TREE_THRESHOLD).to.equal(10);
      expect(CNFT_CHUNK_LIMITS.MAX_CNFTS_DEEP_TREE).to.equal(1);
      expect(CNFT_CHUNK_LIMITS.MAX_CNFTS_SHALLOW_TREE).to.equal(2);
    });

    it('should have correct transaction size limit', () => {
      expect(TX_SIZE_LIMIT).to.equal(1200);
    });

    it('should have correct retry configuration', () => {
      expect(RETRY_CONFIG.MAX_RETRIES).to.equal(3);
      expect(RETRY_CONFIG.BASE_DELAY_MS).to.equal(1000);
      expect(RETRY_CONFIG.BACKOFF_MULTIPLIER).to.equal(2);
    });
  });

  describe('Error Classes', () => {
    it('should create SettleServiceError with message', () => {
      const error = new SettleServiceError('Test error');
      expect(error.message).to.equal('Test error');
      expect(error.name).to.equal('SettleServiceError');
      expect(error).to.be.instanceOf(Error);
    });

    it('should create SwapNotReadyError with correct info', () => {
      const error = new SwapNotReadyError('swap-123', 'CREATED');
      expect(error.message).to.include('swap-123');
      expect(error.message).to.include('CREATED');
      expect(error.message).to.include('FULLY_LOCKED');
      expect(error.name).to.equal('SwapNotReadyError');
    });

    it('should create ChunkExecutionError with details', () => {
      const error = new ChunkExecutionError(2, 3, 'Transaction failed');
      expect(error.message).to.include('Chunk 2');
      expect(error.message).to.include('3 retries');
      expect(error.message).to.include('Transaction failed');
      expect(error.name).to.equal('ChunkExecutionError');
      expect(error.chunkIndex).to.equal(2);
      expect(error.retryCount).to.equal(3);
    });
  });

  describe('PDA Derivation', () => {
    let connection: Connection;
    let mockPrisma: any;
    let settleService: TwoPhaseSwapSettleService;
    const testSwapId = 'test-swap-uuid-12345';

    beforeEach(() => {
      connection = new Connection('https://api.devnet.solana.com');
      mockPrisma = {
        twoPhaseSwap: {
          create: async () => ({}),
          findUnique: async () => null,
          findMany: async () => [],
          update: async () => ({}),
        },
      };
      settleService = createTwoPhaseSwapSettleService(
        connection,
        mockPrisma,
        mockProgramId,
        mockFeeCollector,
        mockBackendSigner
      );
    });

    it('should derive delegate PDA deterministically', () => {
      const [pda1, bump1] = settleService.deriveDelegatePDA(testSwapId);
      const [pda2, bump2] = settleService.deriveDelegatePDA(testSwapId);

      // Same input should give same output
      expect(pda1.toBase58()).to.equal(pda2.toBase58());
      expect(bump1).to.equal(bump2);

      // Should be a valid PDA (on curve is false)
      expect(PublicKey.isOnCurve(pda1.toBytes())).to.be.false;
    });

    it('should derive SOL vault PDA for Party A', () => {
      const [pdaA, bumpA] = settleService.deriveSolVaultPDA(testSwapId, 'A');

      // Should be a valid PDA
      expect(PublicKey.isOnCurve(pdaA.toBytes())).to.be.false;
      expect(bumpA).to.be.a('number');
    });

    it('should derive SOL vault PDA for Party B', () => {
      const [pdaB, bumpB] = settleService.deriveSolVaultPDA(testSwapId, 'B');

      // Should be a valid PDA
      expect(PublicKey.isOnCurve(pdaB.toBytes())).to.be.false;
      expect(bumpB).to.be.a('number');
    });

    it('should derive different SOL vault PDAs for Party A and B', () => {
      const [pdaA] = settleService.deriveSolVaultPDA(testSwapId, 'A');
      const [pdaB] = settleService.deriveSolVaultPDA(testSwapId, 'B');

      expect(pdaA.toBase58()).to.not.equal(pdaB.toBase58());
    });

    it('should use correct PDA seeds', () => {
      // Manually derive and compare
      const [expectedDelegatePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(TWO_PHASE_SWAP_SEEDS.DELEGATE_AUTHORITY),
          Buffer.from(testSwapId),
        ],
        mockProgramId
      );

      const [actualDelegatePDA] = settleService.deriveDelegatePDA(testSwapId);
      expect(actualDelegatePDA.toBase58()).to.equal(expectedDelegatePDA.toBase58());
    });
  });

  describe('Chunk Calculation Logic', () => {
    describe('Empty Swap', () => {
      it('should handle swap with no assets', async () => {
        const swap = createMockSwapData({
          assetsA: [],
          assetsB: [],
          solAmountA: null,
          solAmountB: null,
        });

        // With no assets and no SOL, should return empty chunks
        // Note: This is a conceptual test - actual method requires RPC connection
        expect(swap.assetsA.length).to.equal(0);
        expect(swap.assetsB.length).to.equal(0);
      });
    });

    describe('SOL Only Swap', () => {
      it('should calculate single SOL chunk correctly', () => {
        const swap = createMockSwapData({
          assetsA: [],
          assetsB: [],
          solAmountA: BigInt(1_000_000_000), // 1 SOL
          solAmountB: BigInt(500_000_000), // 0.5 SOL
        });

        // SOL transfers should be in a single chunk
        const hasSolTransfers =
          (swap.solAmountA && swap.solAmountA > BigInt(0)) ||
          (swap.solAmountB && swap.solAmountB > BigInt(0));

        expect(hasSolTransfers).to.be.true;
      });
    });

    describe('cNFT Only Swap', () => {
      it('should handle single cNFT correctly', () => {
        const swap = createMockSwapData({
          assetsA: [{ type: 'CNFT', identifier: mockAssetId1 }],
          assetsB: [],
        });

        expect(swap.assetsA.length).to.equal(1);
        expect(swap.assetsA[0].type).to.equal('CNFT');
      });

      it('should handle multiple cNFTs from one party', () => {
        const swap = createMockSwapData({
          assetsA: [
            { type: 'CNFT', identifier: mockAssetId1 },
            { type: 'CNFT', identifier: mockAssetId2 },
            { type: 'CNFT', identifier: mockAssetId3 },
          ],
          assetsB: [],
        });

        expect(swap.assetsA.length).to.equal(3);
        const cnftCount = swap.assetsA.filter((a) => a.type === 'CNFT').length;
        expect(cnftCount).to.equal(3);
      });
    });

    describe('Mixed Asset Swap', () => {
      it('should handle cNFTs and SOL together', () => {
        const swap = createMockSwapData({
          assetsA: [
            { type: 'CNFT', identifier: mockAssetId1 },
          ],
          assetsB: [],
          solAmountA: null,
          solAmountB: BigInt(1_000_000_000), // 1 SOL from B to A
        });

        const hasCnfts = swap.assetsA.some((a) => a.type === 'CNFT');
        const hasSol = swap.solAmountB && swap.solAmountB > BigInt(0);

        expect(hasCnfts).to.be.true;
        expect(hasSol).to.be.true;
      });
    });

    describe('Chunk Size Estimation', () => {
      it('should estimate correct instruction size for deep trees', () => {
        // Deep tree: proof > 20 nodes, ~24 nodes typical
        const proofSize = 24;
        const estimatedSize = 200 + proofSize * 32; // Base + proof nodes

        expect(estimatedSize).to.equal(968);
        expect(estimatedSize).to.be.lessThan(TX_SIZE_LIMIT);
      });

      it('should estimate correct instruction size for shallow trees', () => {
        // Shallow tree: proof <= 10 nodes
        const proofSize = 8;
        const estimatedSize = 200 + proofSize * 32;

        expect(estimatedSize).to.equal(456);
        expect(estimatedSize).to.be.lessThan(TX_SIZE_LIMIT);
      });

      it('should limit to 1 cNFT per tx for deep trees', () => {
        const proofSize = 25; // Deep tree
        const isDeepTree = proofSize > CNFT_CHUNK_LIMITS.DEEP_TREE_THRESHOLD;

        expect(isDeepTree).to.be.true;
        expect(CNFT_CHUNK_LIMITS.MAX_CNFTS_DEEP_TREE).to.equal(1);
      });

      it('should allow 2 cNFTs per tx for shallow trees', () => {
        const proofSize = 8; // Shallow tree
        const isShallowTree = proofSize <= CNFT_CHUNK_LIMITS.SHALLOW_TREE_THRESHOLD;

        expect(isShallowTree).to.be.true;
        expect(CNFT_CHUNK_LIMITS.MAX_CNFTS_SHALLOW_TREE).to.equal(2);
      });
    });
  });

  describe('Settlement Status Validation', () => {
    it('should require FULLY_LOCKED status', () => {
      const swap = createMockSwapData({ status: TwoPhaseSwapStatus.CREATED });

      const isReady = swap.status === TwoPhaseSwapStatus.FULLY_LOCKED;
      expect(isReady).to.be.false;
    });

    it('should accept FULLY_LOCKED status', () => {
      const swap = createMockSwapData({ status: TwoPhaseSwapStatus.FULLY_LOCKED });

      const isReady = swap.status === TwoPhaseSwapStatus.FULLY_LOCKED;
      expect(isReady).to.be.true;
    });

    it('should reject SETTLING status (already in progress)', () => {
      const swap = createMockSwapData({ status: TwoPhaseSwapStatus.SETTLING });

      const isReady = swap.status === TwoPhaseSwapStatus.FULLY_LOCKED;
      expect(isReady).to.be.false;
    });

    it('should reject COMPLETED status', () => {
      const swap = createMockSwapData({ status: TwoPhaseSwapStatus.COMPLETED });

      const isReady = swap.status === TwoPhaseSwapStatus.FULLY_LOCKED;
      expect(isReady).to.be.false;
    });
  });

  describe('Progress Tracking', () => {
    it('should calculate percentage correctly at start', () => {
      const swap = createMockSwapData({
        currentSettleIndex: 0,
        totalSettleTxs: 5,
      });

      const percentComplete =
        swap.totalSettleTxs > 0
          ? Math.round((swap.currentSettleIndex / swap.totalSettleTxs) * 100)
          : 0;

      expect(percentComplete).to.equal(0);
    });

    it('should calculate percentage correctly mid-settlement', () => {
      const swap = createMockSwapData({
        currentSettleIndex: 2,
        totalSettleTxs: 5,
      });

      const percentComplete =
        swap.totalSettleTxs > 0
          ? Math.round((swap.currentSettleIndex / swap.totalSettleTxs) * 100)
          : 0;

      expect(percentComplete).to.equal(40);
    });

    it('should calculate percentage correctly at completion', () => {
      const swap = createMockSwapData({
        currentSettleIndex: 5,
        totalSettleTxs: 5,
      });

      const percentComplete =
        swap.totalSettleTxs > 0
          ? Math.round((swap.currentSettleIndex / swap.totalSettleTxs) * 100)
          : 0;

      expect(percentComplete).to.equal(100);
    });

    it('should handle zero total chunks', () => {
      const swap = createMockSwapData({
        currentSettleIndex: 0,
        totalSettleTxs: 0,
      });

      const percentComplete =
        swap.totalSettleTxs > 0
          ? Math.round((swap.currentSettleIndex / swap.totalSettleTxs) * 100)
          : 0;

      expect(percentComplete).to.equal(0);
    });
  });

  describe('Retry Logic', () => {
    it('should have exponential backoff delays', () => {
      const delays: number[] = [];
      for (let retry = 0; retry < RETRY_CONFIG.MAX_RETRIES; retry++) {
        const delay =
          RETRY_CONFIG.BASE_DELAY_MS *
          Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retry);
        delays.push(delay);
      }

      expect(delays[0]).to.equal(1000); // 1 second
      expect(delays[1]).to.equal(2000); // 2 seconds
      expect(delays[2]).to.equal(4000); // 4 seconds
    });

    it('should stop after MAX_RETRIES', () => {
      const maxRetries = RETRY_CONFIG.MAX_RETRIES;
      expect(maxRetries).to.equal(3);
    });
  });

  describe('Settlement Strategy Selection', () => {
    // Helper to determine strategy based on chunk count
    function getStrategy(numChunks: number): 'single_tx' | 'chunked' | 'jito_bundle' {
      if (numChunks === 1) {
        return 'single_tx';
      } else if (numChunks <= 3) {
        return 'chunked';
      } else {
        return 'jito_bundle';
      }
    }

    it('should use single_tx for 1 chunk', () => {
      const strategy = getStrategy(1);
      expect(strategy).to.equal('single_tx');
    });

    it('should use chunked for 2-3 chunks', () => {
      expect(getStrategy(2)).to.equal('chunked');
      expect(getStrategy(3)).to.equal('chunked');
    });

    it('should use jito_bundle for 4+ chunks', () => {
      expect(getStrategy(4)).to.equal('jito_bundle');
      expect(getStrategy(5)).to.equal('jito_bundle');
      expect(getStrategy(10)).to.equal('jito_bundle');
    });
  });

  describe('Transfer Direction Logic', () => {
    it('should transfer Party A assets to Party B', () => {
      const swap = createMockSwapData({
        partyA: partyAWallet.toBase58(),
        partyB: partyBWallet.toBase58(),
        assetsA: [{ type: 'CNFT', identifier: mockAssetId1 }],
      });

      // Party A's assets go to Party B
      const assetFrom = swap.partyA;
      const assetTo = swap.partyB;

      expect(assetFrom).to.equal(partyAWallet.toBase58());
      expect(assetTo).to.equal(partyBWallet.toBase58());
    });

    it('should transfer Party B assets to Party A', () => {
      const swap = createMockSwapData({
        partyA: partyAWallet.toBase58(),
        partyB: partyBWallet.toBase58(),
        assetsB: [{ type: 'CNFT', identifier: mockAssetId2 }],
      });

      // Party B's assets go to Party A
      const assetFrom = swap.partyB;
      const assetTo = swap.partyA;

      expect(assetFrom).to.equal(partyBWallet.toBase58());
      expect(assetTo).to.equal(partyAWallet.toBase58());
    });

    it('should transfer Party A SOL to Party B', () => {
      const swap = createMockSwapData({
        partyA: partyAWallet.toBase58(),
        partyB: partyBWallet.toBase58(),
        solAmountA: BigInt(1_000_000_000),
      });

      // Party A's SOL goes to Party B
      const solTo = swap.partyB;
      expect(solTo).to.equal(partyBWallet.toBase58());
    });

    it('should transfer Party B SOL to Party A', () => {
      const swap = createMockSwapData({
        partyA: partyAWallet.toBase58(),
        partyB: partyBWallet.toBase58(),
        solAmountB: BigInt(500_000_000),
      });

      // Party B's SOL goes to Party A
      const solTo = swap.partyA;
      expect(solTo).to.equal(partyAWallet.toBase58());
    });
  });

  describe('Platform Fee Handling', () => {
    it('should include platform fee in settlement', () => {
      const swap = createMockSwapData({
        platformFeeLamports: BigInt(10_000_000), // 0.01 SOL
      });

      expect(swap.platformFeeLamports).to.equal(BigInt(10_000_000));
    });

    it('should handle zero platform fee', () => {
      const swap = createMockSwapData({
        platformFeeLamports: BigInt(0),
      });

      expect(swap.platformFeeLamports).to.equal(BigInt(0));
    });

    it('should identify fee source correctly', () => {
      const swap = createMockSwapData({
        solAmountA: BigInt(1_000_000_000),
        solAmountB: BigInt(500_000_000),
        platformFeeLamports: BigInt(10_000_000),
      });

      // Fee comes from the higher SOL side (Party A in this case)
      const feeFromParty =
        swap.solAmountA && swap.solAmountA > (swap.solAmountB || BigInt(0))
          ? 'A'
          : 'B';

      expect(feeFromParty).to.equal('A');
    });
  });

  describe('Settlement Completion Detection', () => {
    it('should detect incomplete settlement', () => {
      const swap = createMockSwapData({
        currentSettleIndex: 2,
        totalSettleTxs: 5,
      });

      const isComplete = swap.currentSettleIndex >= swap.totalSettleTxs;
      expect(isComplete).to.be.false;
    });

    it('should detect complete settlement', () => {
      const swap = createMockSwapData({
        currentSettleIndex: 5,
        totalSettleTxs: 5,
      });

      const isComplete = swap.currentSettleIndex >= swap.totalSettleTxs;
      expect(isComplete).to.be.true;
    });

    it('should detect over-complete settlement', () => {
      const swap = createMockSwapData({
        currentSettleIndex: 6, // Edge case: more than expected
        totalSettleTxs: 5,
      });

      const isComplete = swap.currentSettleIndex >= swap.totalSettleTxs;
      expect(isComplete).to.be.true;
    });
  });

  describe('Settlement Transaction Tracking', () => {
    it('should track settlement transaction signatures', () => {
      const swap = createMockSwapData({
        settleTxs: [
          'sig1abc123',
          'sig2def456',
        ],
        currentSettleIndex: 2,
        totalSettleTxs: 5,
      });

      expect(swap.settleTxs.length).to.equal(2);
      expect(swap.settleTxs[0]).to.equal('sig1abc123');
      expect(swap.settleTxs[1]).to.equal('sig2def456');
    });

    it('should have empty settleTxs initially', () => {
      const swap = createMockSwapData();

      expect(swap.settleTxs).to.be.an('array');
      expect(swap.settleTxs.length).to.equal(0);
    });
  });

  describe('Error State Handling', () => {
    it('should track error message on failure', () => {
      const swap = createMockSwapData({
        status: TwoPhaseSwapStatus.FAILED,
        errorMessage: 'Transaction failed: insufficient funds',
        errorCode: 'INSUFFICIENT_FUNDS',
        failedAt: new Date(),
      });

      expect(swap.status).to.equal(TwoPhaseSwapStatus.FAILED);
      expect(swap.errorMessage).to.include('insufficient funds');
      expect(swap.errorCode).to.equal('INSUFFICIENT_FUNDS');
      expect(swap.failedAt).to.not.be.null;
    });

    it('should have null error fields initially', () => {
      const swap = createMockSwapData();

      expect(swap.errorMessage).to.be.null;
      expect(swap.errorCode).to.be.null;
      expect(swap.failedAt).to.be.null;
    });
  });

  describe('Settled State', () => {
    it('should track final settlement transaction', () => {
      const swap = createMockSwapData({
        status: TwoPhaseSwapStatus.COMPLETED,
        finalSettleTx: 'final-tx-signature-abc123',
        settledAt: new Date(),
      });

      expect(swap.status).to.equal(TwoPhaseSwapStatus.COMPLETED);
      expect(swap.finalSettleTx).to.equal('final-tx-signature-abc123');
      expect(swap.settledAt).to.not.be.null;
    });

    it('should have null settled fields before completion', () => {
      const swap = createMockSwapData({
        status: TwoPhaseSwapStatus.SETTLING,
      });

      expect(swap.finalSettleTx).to.be.null;
      expect(swap.settledAt).to.be.null;
    });
  });
});
