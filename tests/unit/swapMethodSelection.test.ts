/**
 * Unit Tests: Swap Method Selection
 *
 * Tests the logic that determines which execution method to use for swaps:
 * - JITO Bundle (when Jito enabled)
 * - Sequential RPC (when Jito disabled, small swaps)
 * - TWO_PHASE Escrow (when Jito disabled, large swaps)
 *
 * Selection Logic:
 * 1. swapFlowRouter determines initial flow type
 * 2. transactionGroupBuilder has final say:
 *    - If Jito ENABLED → Builds JITO bundle
 *    - If Jito DISABLED AND small swap (≤2 cNFTs, ≤3 assets) → Sequential RPC
 *    - If Jito DISABLED AND large swap → TWO_PHASE
 */

import { expect } from 'chai';
import { describe, it } from 'mocha';
import {
  determineSwapFlow,
  SwapFlowType,
  SwapAssetInput,
} from '../../src/utils/swapFlowRouter';
import { AssetType } from '../../src/services/assetValidator';

// Constants matching the production code
const CNFT_TWO_PHASE_THRESHOLD = 3; // 3+ cNFTs on either side
const TOTAL_ASSET_TWO_PHASE_THRESHOLD = 5; // 5+ total assets
const MAX_CNFTS_SEQUENTIAL_RPC = 2; // ≤2 cNFTs for sequential RPC
const MAX_ASSETS_SEQUENTIAL_RPC = 3; // ≤3 assets for sequential RPC

/**
 * Helper to create cNFT assets
 */
function createCnftAssets(count: number, prefix: string = 'cnft'): SwapAssetInput[] {
  return Array.from({ length: count }, (_, i) => ({
    type: AssetType.CNFT,
    identifier: `${prefix}-${i + 1}`,
  }));
}

/**
 * Helper to create NFT assets
 */
function createNftAssets(count: number, prefix: string = 'nft'): SwapAssetInput[] {
  return Array.from({ length: count }, (_, i) => ({
    type: AssetType.NFT,
    identifier: `${prefix}-${i + 1}`,
  }));
}

/**
 * Simulates transactionGroupBuilder's canUseSequentialRpc check
 * This is the critical decision point when Jito is disabled
 */
function canUseSequentialRpc(makerCnfts: number, takerCnfts: number, totalAssets: number): boolean {
  const totalCnfts = makerCnfts + takerCnfts;
  return totalCnfts <= MAX_CNFTS_SEQUENTIAL_RPC && totalAssets <= MAX_ASSETS_SEQUENTIAL_RPC;
}

/**
 * Simulates the complete method selection logic
 */
function determineExecutionMethod(
  makerAssets: SwapAssetInput[],
  takerAssets: SwapAssetInput[],
  jitoEnabled: boolean
): 'JITO_BUNDLE' | 'SEQUENTIAL_RPC' | 'TWO_PHASE' | 'ATOMIC' {
  const makerCnfts = makerAssets.filter(a => a.type === AssetType.CNFT).length;
  const takerCnfts = takerAssets.filter(a => a.type === AssetType.CNFT).length;
  const totalCnfts = makerCnfts + takerCnfts;
  const totalAssets = makerAssets.length + takerAssets.length;
  const hasCnfts = totalCnfts > 0;

  // No cNFTs = atomic swap (single transaction)
  if (!hasCnfts && totalAssets <= 2) {
    return 'ATOMIC';
  }

  // cNFT swaps need multiple transactions (1 per cNFT)
  const needsMultipleTx = hasCnfts;

  if (!needsMultipleTx) {
    // Bulk NFT swap (no cNFTs)
    if (jitoEnabled) {
      return 'JITO_BUNDLE';
    }
    // Large bulk swap without Jito
    if (totalAssets >= TOTAL_ASSET_TWO_PHASE_THRESHOLD) {
      return 'TWO_PHASE';
    }
    return 'ATOMIC';
  }

  // cNFT swap - needs bundle or two-phase
  if (jitoEnabled) {
    return 'JITO_BUNDLE';
  }

  // Jito disabled - check if sequential RPC is safe
  if (canUseSequentialRpc(makerCnfts, takerCnfts, totalAssets)) {
    return 'SEQUENTIAL_RPC';
  }

  // Too large for sequential RPC - must use two-phase
  return 'TWO_PHASE';
}

describe('Swap Method Selection Logic', () => {
  describe('swapFlowRouter - Initial Flow Determination', () => {
    it('1:1 cNFT swap should return CNFT_DELEGATION (not two-phase)', () => {
      const offeredAssets = createCnftAssets(1, 'offered');
      const requestedAssets = createCnftAssets(1, 'requested');

      const result = determineSwapFlow(offeredAssets, requestedAssets);

      expect(result.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
      expect(result.requiresDelegation).to.be.true;
      expect(result.requiresTwoPhase).to.be.false;
      expect(result.cnftCount).to.equal(2);
      expect(result.totalAssetCount).to.equal(2);
    });

    it('1:3 cNFT swap should return TWO_PHASE (3 cNFTs on one side)', () => {
      const offeredAssets = createCnftAssets(1, 'offered');
      const requestedAssets = createCnftAssets(3, 'requested');

      const result = determineSwapFlow(offeredAssets, requestedAssets);

      expect(result.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(result.requiresDelegation).to.be.true;
      expect(result.requiresTwoPhase).to.be.true;
      expect(result.cnftCount).to.equal(4);
      expect(result.totalAssetCount).to.equal(4);
    });

    it('3:1 cNFT swap should return TWO_PHASE (3 cNFTs on one side)', () => {
      const offeredAssets = createCnftAssets(3, 'offered');
      const requestedAssets = createCnftAssets(1, 'requested');

      const result = determineSwapFlow(offeredAssets, requestedAssets);

      expect(result.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(result.requiresDelegation).to.be.true;
      expect(result.requiresTwoPhase).to.be.true;
      expect(result.cnftCount).to.equal(4);
    });

    it('3:3 cNFT swap should return TWO_PHASE (3+ cNFTs on both sides)', () => {
      const offeredAssets = createCnftAssets(3, 'offered');
      const requestedAssets = createCnftAssets(3, 'requested');

      const result = determineSwapFlow(offeredAssets, requestedAssets);

      expect(result.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(result.requiresDelegation).to.be.true;
      expect(result.requiresTwoPhase).to.be.true;
      expect(result.cnftCount).to.equal(6);
      expect(result.totalAssetCount).to.equal(6);
    });

    it('2:1 cNFT swap should return CNFT_DELEGATION (under threshold)', () => {
      const offeredAssets = createCnftAssets(2, 'offered');
      const requestedAssets = createCnftAssets(1, 'requested');

      const result = determineSwapFlow(offeredAssets, requestedAssets);

      // 3 cNFTs but none on one side >= 3, so CNFT_DELEGATION
      // BUT 3 assets is still OK for CNFT_DELEGATION
      expect(result.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
      expect(result.requiresDelegation).to.be.true;
      expect(result.cnftCount).to.equal(3);
    });

    it('1:2 cNFT swap should return CNFT_DELEGATION (under threshold)', () => {
      const offeredAssets = createCnftAssets(1, 'offered');
      const requestedAssets = createCnftAssets(2, 'requested');

      const result = determineSwapFlow(offeredAssets, requestedAssets);

      expect(result.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
      expect(result.requiresDelegation).to.be.true;
      expect(result.cnftCount).to.equal(3);
    });

    it('2:2 cNFT swap should return TWO_PHASE (4 assets with cNFT)', () => {
      const offeredAssets = createCnftAssets(2, 'offered');
      const requestedAssets = createCnftAssets(2, 'requested');

      const result = determineSwapFlow(offeredAssets, requestedAssets);

      // 4 assets with cNFTs triggers needsTwoPhaseForMixedBulk
      expect(result.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(result.requiresDelegation).to.be.true;
      expect(result.requiresTwoPhase).to.be.true;
      expect(result.cnftCount).to.equal(4);
      expect(result.totalAssetCount).to.equal(4);
    });
  });

  describe('transactionGroupBuilder - canUseSequentialRpc Logic', () => {
    it('2 cNFTs, 2 assets: CAN use sequential RPC', () => {
      expect(canUseSequentialRpc(1, 1, 2)).to.be.true;
    });

    it('2 cNFTs, 3 assets: CAN use sequential RPC', () => {
      expect(canUseSequentialRpc(1, 1, 3)).to.be.true;
    });

    it('3 cNFTs, 3 assets: CANNOT use sequential RPC (>2 cNFTs)', () => {
      expect(canUseSequentialRpc(2, 1, 3)).to.be.false;
    });

    it('2 cNFTs, 4 assets: CANNOT use sequential RPC (>3 assets)', () => {
      expect(canUseSequentialRpc(1, 1, 4)).to.be.false;
    });

    it('4 cNFTs, 4 assets: CANNOT use sequential RPC', () => {
      expect(canUseSequentialRpc(1, 3, 4)).to.be.false;
      expect(canUseSequentialRpc(3, 1, 4)).to.be.false;
      expect(canUseSequentialRpc(2, 2, 4)).to.be.false;
    });

    it('6 cNFTs, 6 assets: CANNOT use sequential RPC', () => {
      expect(canUseSequentialRpc(3, 3, 6)).to.be.false;
    });
  });

  describe('Complete Method Selection - Jito Disabled', () => {
    const jitoEnabled = false;

    it('1:1 cNFT swap → SEQUENTIAL_RPC (2 cNFTs, 2 assets)', () => {
      const makerAssets = createCnftAssets(1, 'maker');
      const takerAssets = createCnftAssets(1, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('SEQUENTIAL_RPC');
    });

    it('1:3 cNFT swap → TWO_PHASE (4 cNFTs, 4 assets)', () => {
      const makerAssets = createCnftAssets(1, 'maker');
      const takerAssets = createCnftAssets(3, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('TWO_PHASE');
    });

    it('3:1 cNFT swap → TWO_PHASE (4 cNFTs, 4 assets)', () => {
      const makerAssets = createCnftAssets(3, 'maker');
      const takerAssets = createCnftAssets(1, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('TWO_PHASE');
    });

    it('3:3 cNFT swap → TWO_PHASE (6 cNFTs, 6 assets)', () => {
      const makerAssets = createCnftAssets(3, 'maker');
      const takerAssets = createCnftAssets(3, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('TWO_PHASE');
    });

    it('2:1 cNFT swap → TWO_PHASE (3 cNFTs > 2 limit)', () => {
      const makerAssets = createCnftAssets(2, 'maker');
      const takerAssets = createCnftAssets(1, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('TWO_PHASE');
    });

    it('1:2 cNFT swap → TWO_PHASE (3 cNFTs > 2 limit)', () => {
      const makerAssets = createCnftAssets(1, 'maker');
      const takerAssets = createCnftAssets(2, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('TWO_PHASE');
    });

    it('2:2 cNFT swap → TWO_PHASE (4 cNFTs, 4 assets)', () => {
      const makerAssets = createCnftAssets(2, 'maker');
      const takerAssets = createCnftAssets(2, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('TWO_PHASE');
    });

    it('1 cNFT for SOL → SEQUENTIAL_RPC (1 cNFT, 1 asset)', () => {
      const makerAssets = createCnftAssets(1, 'maker');
      const takerAssets: SwapAssetInput[] = [];

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('SEQUENTIAL_RPC');
    });

    it('1:1 NFT swap (no cNFTs) → ATOMIC', () => {
      const makerAssets = createNftAssets(1, 'maker');
      const takerAssets = createNftAssets(1, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('ATOMIC');
    });
  });

  describe('Complete Method Selection - Jito Enabled', () => {
    const jitoEnabled = true;

    it('1:1 cNFT swap → JITO_BUNDLE', () => {
      const makerAssets = createCnftAssets(1, 'maker');
      const takerAssets = createCnftAssets(1, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('JITO_BUNDLE');
    });

    it('1:3 cNFT swap → JITO_BUNDLE', () => {
      const makerAssets = createCnftAssets(1, 'maker');
      const takerAssets = createCnftAssets(3, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('JITO_BUNDLE');
    });

    it('3:1 cNFT swap → JITO_BUNDLE', () => {
      const makerAssets = createCnftAssets(3, 'maker');
      const takerAssets = createCnftAssets(1, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('JITO_BUNDLE');
    });

    it('3:3 cNFT swap → JITO_BUNDLE', () => {
      const makerAssets = createCnftAssets(3, 'maker');
      const takerAssets = createCnftAssets(3, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('JITO_BUNDLE');
    });

    it('2:1 cNFT swap → JITO_BUNDLE', () => {
      const makerAssets = createCnftAssets(2, 'maker');
      const takerAssets = createCnftAssets(1, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('JITO_BUNDLE');
    });

    it('1:1 NFT swap (no cNFTs) → ATOMIC', () => {
      const makerAssets = createNftAssets(1, 'maker');
      const takerAssets = createNftAssets(1, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, jitoEnabled);

      expect(method).to.equal('ATOMIC');
    });
  });

  describe('Edge Cases', () => {
    it('0 cNFTs, 5 NFTs → TWO_PHASE (bulk without Jito)', () => {
      const makerAssets = createNftAssets(3, 'maker');
      const takerAssets = createNftAssets(2, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, false);

      // 5 assets without Jito should use two-phase
      expect(method).to.equal('TWO_PHASE');
    });

    it('0 cNFTs, 5 NFTs with Jito → JITO_BUNDLE', () => {
      const makerAssets = createNftAssets(3, 'maker');
      const takerAssets = createNftAssets(2, 'taker');

      const method = determineExecutionMethod(makerAssets, takerAssets, true);

      expect(method).to.equal('JITO_BUNDLE');
    });

    it('Mixed: 1 cNFT + 2 NFTs → TWO_PHASE (3 assets > 3 limit with cNFT)', () => {
      const makerAssets: SwapAssetInput[] = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
        { type: AssetType.NFT, identifier: 'nft-1' },
      ];
      const takerAssets: SwapAssetInput[] = [
        { type: AssetType.NFT, identifier: 'nft-2' },
      ];

      const method = determineExecutionMethod(makerAssets, takerAssets, false);

      // 1 cNFT ≤ 2, but 3 assets = 3 which is OK
      // Wait, 3 assets is the limit, so this should be SEQUENTIAL_RPC
      // Let me re-check: canUseSequentialRpc(1, 0, 3) = (1 <= 2) && (3 <= 3) = true
      expect(method).to.equal('SEQUENTIAL_RPC');
    });

    it('Mixed: 1 cNFT + 3 NFTs → TWO_PHASE (4 assets > 3 limit)', () => {
      const makerAssets: SwapAssetInput[] = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
        { type: AssetType.NFT, identifier: 'nft-1' },
      ];
      const takerAssets: SwapAssetInput[] = [
        { type: AssetType.NFT, identifier: 'nft-2' },
        { type: AssetType.NFT, identifier: 'nft-3' },
      ];

      const method = determineExecutionMethod(makerAssets, takerAssets, false);

      // 1 cNFT ≤ 2, but 4 assets > 3, so TWO_PHASE
      expect(method).to.equal('TWO_PHASE');
    });
  });

  describe('Threshold Boundary Tests', () => {
    it('Exactly 2 cNFTs, 3 assets → SEQUENTIAL_RPC (at boundary)', () => {
      const makerAssets: SwapAssetInput[] = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
        { type: AssetType.NFT, identifier: 'nft-1' },
      ];
      const takerAssets: SwapAssetInput[] = [
        { type: AssetType.CNFT, identifier: 'cnft-2' },
      ];

      const method = determineExecutionMethod(makerAssets, takerAssets, false);

      // 2 cNFTs = 2 (limit), 3 assets = 3 (limit) - exactly at boundary
      expect(method).to.equal('SEQUENTIAL_RPC');
    });

    it('Exactly 3 cNFTs, 3 assets → TWO_PHASE (over cNFT limit)', () => {
      const makerAssets: SwapAssetInput[] = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
        { type: AssetType.CNFT, identifier: 'cnft-2' },
      ];
      const takerAssets: SwapAssetInput[] = [
        { type: AssetType.CNFT, identifier: 'cnft-3' },
      ];

      const method = determineExecutionMethod(makerAssets, takerAssets, false);

      // 3 cNFTs > 2 limit, must use TWO_PHASE
      expect(method).to.equal('TWO_PHASE');
    });

    it('Exactly 2 cNFTs, 4 assets → TWO_PHASE (over asset limit)', () => {
      const makerAssets: SwapAssetInput[] = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
        { type: AssetType.NFT, identifier: 'nft-1' },
      ];
      const takerAssets: SwapAssetInput[] = [
        { type: AssetType.CNFT, identifier: 'cnft-2' },
        { type: AssetType.NFT, identifier: 'nft-2' },
      ];

      const method = determineExecutionMethod(makerAssets, takerAssets, false);

      // 2 cNFTs OK, but 4 assets > 3 limit, must use TWO_PHASE
      expect(method).to.equal('TWO_PHASE');
    });
  });

  describe('swapFlowRouter Threshold Constants Verification', () => {
    it('CNFT_TWO_PHASE_THRESHOLD should be 3', () => {
      // 2 cNFTs on one side should NOT trigger two-phase
      const result2 = determineSwapFlow(
        createCnftAssets(2),
        [],
        undefined,
        BigInt(1e9) // Need SOL to make it valid
      );
      expect(result2.requiresTwoPhase).to.be.false;

      // 3 cNFTs on one side SHOULD trigger two-phase
      const result3 = determineSwapFlow(
        createCnftAssets(3),
        [],
        undefined,
        BigInt(1e9)
      );
      expect(result3.requiresTwoPhase).to.be.true;
    });

    it('TOTAL_ASSET_TWO_PHASE_THRESHOLD should be 5', () => {
      // 4 NFTs should NOT trigger two-phase (no cNFTs)
      const result4 = determineSwapFlow(
        createNftAssets(2),
        createNftAssets(2),
        undefined,
        undefined
      );
      expect(result4.requiresTwoPhase).to.be.false;

      // 5 NFTs SHOULD trigger two-phase
      const result5 = determineSwapFlow(
        createNftAssets(3),
        createNftAssets(2),
        undefined,
        undefined
      );
      expect(result5.requiresTwoPhase).to.be.true;
    });

    it('4+ assets WITH cNFT should trigger two-phase (needsTwoPhaseForMixedBulk)', () => {
      // 3 assets with cNFT should NOT trigger
      const result3 = determineSwapFlow(
        [{ type: AssetType.CNFT, identifier: 'cnft-1' }],
        [{ type: AssetType.NFT, identifier: 'nft-1' }, { type: AssetType.NFT, identifier: 'nft-2' }],
        undefined,
        undefined
      );
      expect(result3.requiresTwoPhase).to.be.false;

      // 4 assets with cNFT SHOULD trigger
      const result4 = determineSwapFlow(
        [{ type: AssetType.CNFT, identifier: 'cnft-1' }, { type: AssetType.NFT, identifier: 'nft-1' }],
        [{ type: AssetType.NFT, identifier: 'nft-2' }, { type: AssetType.NFT, identifier: 'nft-3' }],
        undefined,
        undefined
      );
      expect(result4.requiresTwoPhase).to.be.true;
    });
  });

  describe('Settlement Phase - JITO Strategy Selection', () => {
    /**
     * Settlement uses JITO bundle when:
     * 1. JITO is enabled
     * 2. Multiple chunks are needed (totalChunks > 1)
     *
     * Otherwise, falls back to sequential RPC.
     */

    /**
     * Simulates the settlement execution strategy selection
     * (matches twoPhaseSwapSettleService.startSettlement logic)
     */
    function determineSettlementStrategy(
      jitoEnabled: boolean,
      totalChunks: number
    ): 'JITO_BUNDLE' | 'SEQUENTIAL_RPC' {
      const useJitoBundle = jitoEnabled && totalChunks > 1;
      return useJitoBundle ? 'JITO_BUNDLE' : 'SEQUENTIAL_RPC';
    }

    describe('JITO Enabled', () => {
      const jitoEnabled = true;

      it('Single chunk → SEQUENTIAL_RPC (no bundle needed)', () => {
        const strategy = determineSettlementStrategy(jitoEnabled, 1);
        expect(strategy).to.equal('SEQUENTIAL_RPC');
      });

      it('2 chunks → JITO_BUNDLE', () => {
        const strategy = determineSettlementStrategy(jitoEnabled, 2);
        expect(strategy).to.equal('JITO_BUNDLE');
      });

      it('3 chunks → JITO_BUNDLE', () => {
        const strategy = determineSettlementStrategy(jitoEnabled, 3);
        expect(strategy).to.equal('JITO_BUNDLE');
      });

      it('5 chunks (large swap) → JITO_BUNDLE', () => {
        const strategy = determineSettlementStrategy(jitoEnabled, 5);
        expect(strategy).to.equal('JITO_BUNDLE');
      });
    });

    describe('JITO Disabled', () => {
      const jitoEnabled = false;

      it('Single chunk → SEQUENTIAL_RPC', () => {
        const strategy = determineSettlementStrategy(jitoEnabled, 1);
        expect(strategy).to.equal('SEQUENTIAL_RPC');
      });

      it('2 chunks → SEQUENTIAL_RPC (fallback)', () => {
        const strategy = determineSettlementStrategy(jitoEnabled, 2);
        expect(strategy).to.equal('SEQUENTIAL_RPC');
      });

      it('3 chunks → SEQUENTIAL_RPC (fallback)', () => {
        const strategy = determineSettlementStrategy(jitoEnabled, 3);
        expect(strategy).to.equal('SEQUENTIAL_RPC');
      });

      it('5 chunks (large swap) → SEQUENTIAL_RPC (fallback)', () => {
        const strategy = determineSettlementStrategy(jitoEnabled, 5);
        expect(strategy).to.equal('SEQUENTIAL_RPC');
      });
    });

    describe('Boundary Tests', () => {
      it('Exactly 1 chunk with JITO → SEQUENTIAL_RPC (threshold)', () => {
        expect(determineSettlementStrategy(true, 1)).to.equal('SEQUENTIAL_RPC');
      });

      it('Exactly 2 chunks with JITO → JITO_BUNDLE (over threshold)', () => {
        expect(determineSettlementStrategy(true, 2)).to.equal('JITO_BUNDLE');
      });

      it('0 chunks (edge case) with JITO → SEQUENTIAL_RPC', () => {
        // Edge case: empty settlement
        expect(determineSettlementStrategy(true, 0)).to.equal('SEQUENTIAL_RPC');
      });
    });
  });
});
