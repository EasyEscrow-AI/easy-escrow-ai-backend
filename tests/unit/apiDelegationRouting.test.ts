/**
 * Unit Tests for API Delegation Routing (Task 12)
 *
 * Tests the automatic routing of API endpoints to delegation-based settlement
 * for cNFT and bulk swaps.
 *
 * Routing Logic:
 * 1. Single NFT/SPL for NFT/SPL → Existing atomic swap
 * 2. Any cNFT involved → Delegation-based flow
 * 3. Bulk (>1 asset per side) → Two-phase swap
 * 4. cNFT-for-SOL only → Single-tx delegate transfer
 *
 * @see .taskmaster/tasks/task_012_cnft-delegation-swap.txt
 */

import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import {
  determineSwapFlow,
  SwapFlowType,
  SwapFlowResult,
  isJitoBundlesEnabled,
} from '../../src/utils/swapFlowRouter';
import { AssetType } from '../../src/services/assetValidator';

/**
 * Mock asset helpers for testing
 */
function createAsset(type: AssetType, identifier: string = 'test-mint') {
  return { type, identifier };
}

describe('API Delegation Routing (Task 12)', () => {
  describe('determineSwapFlow', () => {
    describe('Atomic Swap Routing (Legacy)', () => {
      it('should route single NFT for single NFT to atomic swap', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.NFT)],
          [createAsset(AssetType.NFT)],
          undefined,
          undefined
        );

        expect(result.flowType).to.equal(SwapFlowType.ATOMIC);
        expect(result.requiresDelegation).to.be.false;
        expect(result.requiresTwoPhase).to.be.false;
        expect(result.reason).to.include('atomic');
      });

      it('should route single NFT for SOL to atomic swap', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.NFT)],
          [],
          undefined,
          BigInt(1_000_000_000) // 1 SOL
        );

        expect(result.flowType).to.equal(SwapFlowType.ATOMIC);
        expect(result.requiresDelegation).to.be.false;
      });

      it('should route Core NFT for Core NFT to atomic swap', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.CORE_NFT)],
          [createAsset(AssetType.CORE_NFT)],
          undefined,
          undefined
        );

        expect(result.flowType).to.equal(SwapFlowType.ATOMIC);
        expect(result.requiresDelegation).to.be.false;
      });

      it('should route 2 NFTs for 2 NFTs to atomic swap', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.NFT), createAsset(AssetType.NFT, 'mint-2')],
          [createAsset(AssetType.NFT), createAsset(AssetType.NFT, 'mint-2')],
          undefined,
          undefined
        );

        expect(result.flowType).to.equal(SwapFlowType.ATOMIC);
        expect(result.requiresDelegation).to.be.false;
      });
    });

    describe('cNFT Delegation Routing', () => {
      it('should route single cNFT for SOL to delegation flow', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.CNFT)],
          [],
          undefined,
          BigInt(1_000_000_000) // 1 SOL
        );

        expect(result.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
        expect(result.requiresDelegation).to.be.true;
        expect(result.requiresTwoPhase).to.be.false;
        expect(result.cnftCount).to.equal(1);
        expect(result.reason).to.include('cNFT');
      });

      it('should route cNFT for NFT to delegation flow', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.CNFT)],
          [createAsset(AssetType.NFT)],
          undefined,
          undefined
        );

        expect(result.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
        expect(result.requiresDelegation).to.be.true;
        expect(result.cnftCount).to.equal(1);
      });

      it('should route NFT for cNFT to delegation flow', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.NFT)],
          [createAsset(AssetType.CNFT)],
          undefined,
          undefined
        );

        expect(result.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
        expect(result.requiresDelegation).to.be.true;
        expect(result.cnftCount).to.equal(1);
      });

      it('should route cNFT for cNFT to two-phase flow (cNFT-to-cNFT)', () => {
        // cNFT-to-cNFT swaps use TWO_PHASE for reliable Merkle proof handling
        const result = determineSwapFlow(
          [createAsset(AssetType.CNFT)],
          [createAsset(AssetType.CNFT)],
          undefined,
          undefined
        );

        expect(result.flowType).to.equal(SwapFlowType.TWO_PHASE);
        expect(result.requiresDelegation).to.be.true;
        expect(result.requiresTwoPhase).to.be.true;
        expect(result.cnftCount).to.equal(2);
      });

      it('should route 2 cNFTs for SOL to delegation flow (not two-phase)', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.CNFT), createAsset(AssetType.CNFT, 'cnft-2')],
          [],
          undefined,
          BigInt(2_000_000_000) // 2 SOL
        );

        expect(result.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
        expect(result.requiresDelegation).to.be.true;
        expect(result.requiresTwoPhase).to.be.false;
        expect(result.cnftCount).to.equal(2);
      });
    });

    describe('Two-Phase and Bulk Swap Routing', () => {
      it('should route 3 cNFTs on ONE side to delegation flow (Jito bundle)', () => {
        // Single-side cNFT (even bulk like 3 cNFT → SOL) uses Jito bundle, NOT Two-Phase
        const result = determineSwapFlow(
          [
            createAsset(AssetType.CNFT, 'cnft-1'),
            createAsset(AssetType.CNFT, 'cnft-2'),
            createAsset(AssetType.CNFT, 'cnft-3'),
          ],
          [],
          undefined,
          BigInt(3_000_000_000) // 3 SOL
        );

        expect(result.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
        expect(result.requiresDelegation).to.be.true;
        expect(result.requiresTwoPhase).to.be.false; // NOT Two-Phase for single-side cNFT
        expect(result.cnftCount).to.equal(3);
      });

      it('should reject 5+ total assets as INVALID (exceeds Jito limit)', () => {
        // 5 NFTs exceeds the 4 NFT Jito bundle limit
        const result = determineSwapFlow(
          [
            createAsset(AssetType.NFT, 'nft-1'),
            createAsset(AssetType.NFT, 'nft-2'),
            createAsset(AssetType.NFT, 'nft-3'),
          ],
          [
            createAsset(AssetType.NFT, 'nft-4'),
            createAsset(AssetType.NFT, 'nft-5'),
          ],
          undefined,
          undefined
        );

        expect(result.flowType).to.equal(SwapFlowType.INVALID);
        expect(result.error).to.include('Maximum 4 NFTs');
        expect(result.totalAssetCount).to.equal(5);
      });

      it('should reject 5 mixed NFT and cNFT as INVALID (exceeds limit)', () => {
        // 5 total assets exceeds the 4 NFT Jito bundle limit
        const result = determineSwapFlow(
          [
            createAsset(AssetType.NFT, 'nft-1'),
            createAsset(AssetType.CNFT, 'cnft-1'),
            createAsset(AssetType.CNFT, 'cnft-2'),
          ],
          [
            createAsset(AssetType.NFT, 'nft-2'),
            createAsset(AssetType.CNFT, 'cnft-3'),
          ],
          undefined,
          undefined
        );

        expect(result.flowType).to.equal(SwapFlowType.INVALID);
        expect(result.error).to.include('Maximum 4 NFTs');
        expect(result.totalAssetCount).to.equal(5);
      });

      it('should route 4 assets with cNFT on ONE side to delegation (Jito bundle)', () => {
        // 4 assets with cNFT on ONE side only → CNFT_DELEGATION (Jito bundle)
        const result = determineSwapFlow(
          [createAsset(AssetType.NFT), createAsset(AssetType.NFT, 'nft-2')],
          [createAsset(AssetType.NFT, 'nft-3'), createAsset(AssetType.CNFT)],
          undefined,
          undefined
        );

        // cNFT on ONE side only → uses Jito bundle, not Two-Phase
        expect(result.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
        expect(result.requiresDelegation).to.be.true;
        expect(result.requiresTwoPhase).to.be.false;
      });

      it('should route 4 assets with cNFT on BOTH sides to two-phase', () => {
        // 4 assets with cNFT on BOTH sides → TWO_PHASE
        const result = determineSwapFlow(
          [createAsset(AssetType.CNFT, 'cnft-1'), createAsset(AssetType.NFT, 'nft-1')],
          [createAsset(AssetType.NFT, 'nft-2'), createAsset(AssetType.CNFT, 'cnft-2')],
          undefined,
          undefined
        );

        // cNFT on BOTH sides → uses Two-Phase for reliable Merkle proofs
        expect(result.flowType).to.equal(SwapFlowType.TWO_PHASE);
        expect(result.requiresDelegation).to.be.true;
        expect(result.requiresTwoPhase).to.be.true;
      });
    });

    describe('SOL-only handling', () => {
      it('should error when no assets and no SOL on either side', () => {
        const result = determineSwapFlow([], [], undefined, undefined);

        expect(result.flowType).to.equal(SwapFlowType.INVALID);
        expect(result.error).to.include('assets');
      });

      it('should route SOL for NFT correctly', () => {
        const result = determineSwapFlow(
          [],
          [createAsset(AssetType.NFT)],
          BigInt(1_000_000_000), // 1 SOL offered
          undefined
        );

        expect(result.flowType).to.equal(SwapFlowType.ATOMIC);
        expect(result.requiresDelegation).to.be.false;
      });
    });

    describe('JITO Feature Flag', () => {
      // Note: These tests verify the logic, but the actual env var is tested
      // through integration tests. We test with explicit jitoEnabled parameter.

      it('should prefer JITO bundles for cNFT when flag is enabled', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.CNFT)],
          [createAsset(AssetType.CNFT)],
          undefined,
          undefined,
          true // jitoEnabled
        );

        // With JITO enabled, can still use atomic for simple cNFT swaps
        // but the flag affects whether delegation is needed
        expect(result.canUseJito).to.be.true;
      });

      it('should require delegation when JITO flag is disabled', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.CNFT)],
          [createAsset(AssetType.CNFT)],
          undefined,
          undefined,
          false // jitoEnabled = false
        );

        expect(result.requiresDelegation).to.be.true;
        expect(result.canUseJito).to.be.false;
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty assets with SOL both sides', () => {
        const result = determineSwapFlow(
          [],
          [],
          BigInt(1_000_000_000), // 1 SOL
          BigInt(2_000_000_000) // 2 SOL
        );

        // SOL for SOL is invalid (no swap needed)
        expect(result.flowType).to.equal(SwapFlowType.INVALID);
        expect(result.error).to.include('asset');
      });

      it('should count Core NFTs as non-cNFT', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.CORE_NFT)],
          [createAsset(AssetType.CORE_NFT)],
          undefined,
          undefined
        );

        expect(result.cnftCount).to.equal(0);
        expect(result.requiresDelegation).to.be.false;
      });

      it('should identify mixed asset types correctly', () => {
        const result = determineSwapFlow(
          [createAsset(AssetType.NFT), createAsset(AssetType.CORE_NFT)],
          [createAsset(AssetType.CNFT)],
          undefined,
          undefined
        );

        expect(result.cnftCount).to.equal(1);
        expect(result.totalAssetCount).to.equal(3);
        expect(result.requiresDelegation).to.be.true;
      });
    });
  });

  describe('SwapFlowResult structure', () => {
    it('should return all required fields', () => {
      const result = determineSwapFlow(
        [createAsset(AssetType.NFT)],
        [createAsset(AssetType.NFT)],
        undefined,
        undefined
      );

      expect(result).to.have.property('flowType');
      expect(result).to.have.property('requiresDelegation');
      expect(result).to.have.property('requiresTwoPhase');
      expect(result).to.have.property('canUseJito');
      expect(result).to.have.property('cnftCount');
      expect(result).to.have.property('totalAssetCount');
      expect(result).to.have.property('reason');
    });
  });
});
