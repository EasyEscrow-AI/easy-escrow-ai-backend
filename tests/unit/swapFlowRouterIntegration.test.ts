/**
 * Integration Tests for Swap Flow Router (Task 12)
 *
 * Tests the integration of swap flow routing with the offers API.
 * These tests verify that:
 * 1. POST /offers includes swapFlow information
 * 2. The swapFlow correctly identifies delegation requirements
 * 3. Two-phase routing is correctly triggered for bulk swaps
 *
 * @see .taskmaster/tasks/task_012_cnft-delegation-swap.txt
 */

import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import {
  determineSwapFlow,
  SwapFlowType,
  needsDelegation,
  needsTwoPhase,
} from '../../src/utils/swapFlowRouter';
import { AssetType } from '../../src/services/assetValidator';

/**
 * These tests verify the integration of flow routing logic with offer processing.
 * They simulate the scenarios that would occur when the API processes offers.
 */
describe('Swap Flow Router - Integration Scenarios', () => {
  describe('Offer Creation Flow Detection', () => {
    it('should correctly identify atomic flow for simple NFT swap', () => {
      // Simulates: POST /api/swaps/offers with 2 regular NFTs
      const offeredAssets = [
        { type: AssetType.NFT, identifier: 'nft-mint-1' },
      ];
      const requestedAssets = [
        { type: AssetType.NFT, identifier: 'nft-mint-2' },
      ];

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      // Verify flow detection matches expected API response
      expect(flowResult.flowType).to.equal(SwapFlowType.ATOMIC);
      expect(flowResult.requiresDelegation).to.be.false;
      expect(flowResult.requiresTwoPhase).to.be.false;

      // Verify helper functions work correctly
      expect(needsDelegation(offeredAssets, requestedAssets)).to.be.false;
      expect(needsTwoPhase(offeredAssets, requestedAssets)).to.be.false;
    });

    it('should correctly identify delegation flow for cNFT-for-SOL swap', () => {
      // Simulates: POST /api/swaps/offers with cNFT for SOL
      const offeredAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-asset-id-1' },
      ];
      const requestedAssets: { type: AssetType; identifier: string }[] = [];
      const requestedSol = BigInt(1_000_000_000); // 1 SOL

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        requestedSol
      );

      // Verify cNFT triggers delegation flow
      expect(flowResult.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
      expect(flowResult.requiresDelegation).to.be.true;
      expect(flowResult.requiresTwoPhase).to.be.false;
      expect(flowResult.cnftCount).to.equal(1);

      // Verify helper functions
      expect(needsDelegation(offeredAssets, requestedAssets)).to.be.true;
      expect(needsTwoPhase(offeredAssets, requestedAssets)).to.be.false;
    });

    it('should correctly identify delegation flow for bulk cNFT sale (single-side cNFT)', () => {
      // Simulates: POST /api/swaps/offers with 3 cNFTs for SOL (bundle marketplace sale)
      // Single-side cNFT (no cNFT on taker side) → uses Jito bundle, NOT Two-Phase
      const offeredAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
        { type: AssetType.CNFT, identifier: 'cnft-2' },
        { type: AssetType.CNFT, identifier: 'cnft-3' },
      ];
      const requestedAssets: { type: AssetType; identifier: string }[] = [];
      const requestedSol = BigInt(5_000_000_000); // 5 SOL

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        requestedSol
      );

      // Bulk cNFT sale (cNFTs on ONE side only) uses CNFT_DELEGATION with Jito bundle
      expect(flowResult.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
      expect(flowResult.requiresDelegation).to.be.true;
      expect(flowResult.requiresTwoPhase).to.be.false; // NOT Two-Phase for single-side cNFT
      expect(flowResult.cnftCount).to.equal(3);

      // Verify helper functions
      expect(needsDelegation(offeredAssets, requestedAssets)).to.be.true;
      expect(needsTwoPhase(offeredAssets, requestedAssets)).to.be.false;
    });
  });

  describe('Offer Accept Flow Detection', () => {
    it('should maintain flow type consistency from creation to acceptance', () => {
      // Simulates the flow: Create offer -> Accept offer
      // Both should identify the same flow type
      const offeredAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-mint-1' },
      ];
      const requestedAssets = [
        { type: AssetType.NFT, identifier: 'nft-mint-2' },
      ];

      // Flow at creation
      const createFlowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      // Flow at acceptance (same assets, same result)
      const acceptFlowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      // Both should identify cNFT delegation
      expect(createFlowResult.flowType).to.equal(acceptFlowResult.flowType);
      expect(createFlowResult.requiresDelegation).to.equal(acceptFlowResult.requiresDelegation);
      expect(createFlowResult.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
    });
  });

  describe('cNFT-to-cNFT Routing (Magic Eden Style)', () => {
    it('should route 1 cNFT ↔ 1 cNFT swaps to two-phase delegation', () => {
      // Simple cNFT-to-cNFT swap should use two-phase delegation
      // This eliminates JITO bundle dependency
      const offeredAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
      ];
      const requestedAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-2' },
      ];

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      // cNFT-to-cNFT ALWAYS uses two-phase for sequential settlement
      expect(flowResult.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(flowResult.requiresDelegation).to.be.true;
      expect(flowResult.requiresTwoPhase).to.be.true;
      expect(flowResult.cnftCount).to.equal(2);
      expect(flowResult.reason).to.include('cNFT-to-cNFT');
    });

    it('should route 2 cNFT ↔ 2 cNFT swaps to two-phase delegation', () => {
      const offeredAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
        { type: AssetType.CNFT, identifier: 'cnft-2' },
      ];
      const requestedAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-3' },
        { type: AssetType.CNFT, identifier: 'cnft-4' },
      ];

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      expect(flowResult.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(flowResult.requiresTwoPhase).to.be.true;
      expect(flowResult.cnftCount).to.equal(4);
    });

    it('should route cNFT-for-SOL to delegation flow (not two-phase)', () => {
      // Single-side cNFT (cNFT-for-SOL) can use direct delegation
      const offeredAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
      ];
      const requestedAssets: { type: AssetType; identifier: string }[] = [];
      const requestedSol = BigInt(1_000_000_000); // 1 SOL

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        requestedSol
      );

      // Single-side cNFT uses delegation flow (not two-phase)
      expect(flowResult.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
      expect(flowResult.requiresDelegation).to.be.true;
      expect(flowResult.requiresTwoPhase).to.be.false;
    });

    it('should route cNFT-for-NFT to delegation flow (not two-phase)', () => {
      // cNFT offered for regular NFT
      const offeredAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
      ];
      const requestedAssets = [
        { type: AssetType.NFT, identifier: 'nft-1' },
      ];

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      // cNFT-for-NFT uses delegation flow (cNFT only on one side)
      expect(flowResult.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
      expect(flowResult.requiresDelegation).to.be.true;
      expect(flowResult.requiresTwoPhase).to.be.false;
    });
  });

  describe('JITO Flag Integration', () => {
    it('should respect JITO enabled flag for single-side cNFT swaps', () => {
      // cNFT-for-SOL (single-side cNFT) - uses delegation flow
      const offeredAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
      ];
      const requestedAssets: { type: AssetType; identifier: string }[] = [];
      const requestedSol = BigInt(1_000_000_000);

      // With JITO enabled
      const jitoEnabledResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        requestedSol,
        true // JITO enabled
      );

      // With JITO disabled
      const jitoDisabledResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        requestedSol,
        false // JITO disabled
      );

      // Both should require delegation for cNFT
      expect(jitoEnabledResult.requiresDelegation).to.be.true;
      expect(jitoDisabledResult.requiresDelegation).to.be.true;

      // But canUseJito should differ
      expect(jitoEnabledResult.canUseJito).to.be.true;
      expect(jitoDisabledResult.canUseJito).to.be.false;
    });

    it('should use two-phase for cNFT-to-cNFT regardless of JITO flag', () => {
      // cNFT-to-cNFT ALWAYS uses two-phase, eliminating JITO dependency
      const offeredAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
      ];
      const requestedAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-2' },
      ];

      // With JITO enabled
      const jitoEnabledResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined,
        true
      );

      // With JITO disabled
      const jitoDisabledResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined,
        false
      );

      // BOTH should use two-phase regardless of JITO flag
      expect(jitoEnabledResult.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(jitoDisabledResult.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(jitoEnabledResult.requiresTwoPhase).to.be.true;
      expect(jitoDisabledResult.requiresTwoPhase).to.be.true;
    });
  });

  describe('API Response Format Verification', () => {
    it('should return correct swapFlow structure for API responses', () => {
      const offeredAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-1' },
        { type: AssetType.CNFT, identifier: 'cnft-2' },
      ];
      const requestedAssets = [
        { type: AssetType.NFT, identifier: 'nft-1' },
      ];

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        BigInt(500_000_000), // 0.5 SOL
        undefined
      );

      // Verify all required fields are present for API response
      expect(flowResult).to.have.all.keys([
        'flowType',
        'requiresDelegation',
        'requiresTwoPhase',
        'canUseJito',
        'cnftCount',
        'totalAssetCount',
        'reason',
      ]);

      // Verify correct counts
      expect(flowResult.cnftCount).to.equal(2);
      expect(flowResult.totalAssetCount).to.equal(3);
    });

    it('should include error information for invalid swaps', () => {
      const flowResult = determineSwapFlow(
        [], // No assets
        [],
        undefined,
        undefined
      );

      expect(flowResult.flowType).to.equal(SwapFlowType.INVALID);
      expect(flowResult.error).to.be.a('string');
      expect(flowResult.error).to.include('asset');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain atomic swap behavior for legacy NFT-only swaps', () => {
      // Legacy format: 2 regular NFTs
      const offeredAssets = [
        { type: AssetType.NFT, identifier: 'legacy-nft-1' },
      ];
      const requestedAssets = [
        { type: AssetType.NFT, identifier: 'legacy-nft-2' },
      ];
      const offeredSol = BigInt(100_000_000); // 0.1 SOL

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        offeredSol,
        undefined
      );

      // Legacy behavior: atomic swap, no delegation
      expect(flowResult.flowType).to.equal(SwapFlowType.ATOMIC);
      expect(flowResult.requiresDelegation).to.be.false;
      expect(flowResult.requiresTwoPhase).to.be.false;
    });

    it('should handle Core NFTs as non-delegation assets', () => {
      const offeredAssets = [
        { type: AssetType.CORE_NFT, identifier: 'core-nft-1' },
      ];
      const requestedAssets = [
        { type: AssetType.CORE_NFT, identifier: 'core-nft-2' },
      ];

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      // Core NFTs use atomic swap, not delegation
      expect(flowResult.flowType).to.equal(SwapFlowType.ATOMIC);
      expect(flowResult.requiresDelegation).to.be.false;
      expect(flowResult.cnftCount).to.equal(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle mixed asset types with cNFT-to-cNFT correctly', () => {
      // Mix of NFT, Core NFT, and cNFT - with cNFTs on BOTH sides
      const offeredAssets = [
        { type: AssetType.NFT, identifier: 'nft-1' },
        { type: AssetType.CORE_NFT, identifier: 'core-1' },
        { type: AssetType.CNFT, identifier: 'cnft-1' },
      ];
      const requestedAssets = [
        { type: AssetType.CNFT, identifier: 'cnft-2' },
      ];

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      // cNFT on BOTH sides (1 offered + 1 requested) → TWO_PHASE for reliable Merkle proofs
      expect(flowResult.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(flowResult.requiresDelegation).to.be.true;
      expect(flowResult.requiresTwoPhase).to.be.true;
      expect(flowResult.cnftCount).to.equal(2);
      expect(flowResult.totalAssetCount).to.equal(4);
    });

    it('should reject SOL-for-SOL swaps', () => {
      const flowResult = determineSwapFlow(
        [],
        [],
        BigInt(1_000_000_000), // 1 SOL offered
        BigInt(2_000_000_000) // 2 SOL requested
      );

      expect(flowResult.flowType).to.equal(SwapFlowType.INVALID);
      expect(flowResult.error).to.include('SOL-for-SOL');
    });

    it('should reject swaps with >4 total NFTs (Jito bundle limit)', () => {
      // 5 NFTs exceeds the 4 NFT limit (Jito bundles max 5 transactions: 1 for SOL/fee + 4 for NFT transfers)
      // This should now return INVALID, not ATOMIC
      const offeredAssets = [
        { type: AssetType.NFT, identifier: 'nft-1' },
        { type: AssetType.NFT, identifier: 'nft-2' },
        { type: AssetType.NFT, identifier: 'nft-3' },
      ];
      const requestedAssets = [
        { type: AssetType.NFT, identifier: 'nft-4' },
        { type: AssetType.NFT, identifier: 'nft-5' },
      ];

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      // >4 NFTs is now rejected as INVALID
      expect(flowResult.flowType).to.equal(SwapFlowType.INVALID);
      expect(flowResult.error).to.include('Maximum 4 NFTs');
      expect(flowResult.totalAssetCount).to.equal(5);
    });

    it('should reject swaps with >4 total NFTs even WITH cNFTs (Jito bundle limit)', () => {
      // 5+ assets exceeds the 4 NFT limit, even with cNFTs
      // Previously this would trigger two-phase, now it's rejected
      const offeredAssets = [
        { type: AssetType.NFT, identifier: 'nft-1' },
        { type: AssetType.NFT, identifier: 'nft-2' },
        { type: AssetType.CNFT, identifier: 'cnft-1' }, // cNFT present
      ];
      const requestedAssets = [
        { type: AssetType.NFT, identifier: 'nft-3' },
        { type: AssetType.NFT, identifier: 'nft-4' },
      ];

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      // >4 NFTs is now rejected as INVALID (even with cNFTs)
      expect(flowResult.flowType).to.equal(SwapFlowType.INVALID);
      expect(flowResult.error).to.include('Maximum 4 NFTs');
      expect(flowResult.totalAssetCount).to.equal(5);
      expect(flowResult.cnftCount).to.equal(1);
    });

    it('should allow 4 NFTs with cNFT on one side (uses Jito bundle)', () => {
      // 4 total assets WITH cNFT on ONE side only → uses Jito bundle, NOT Two-Phase
      const offeredAssets = [
        { type: AssetType.NFT, identifier: 'nft-1' },
        { type: AssetType.CNFT, identifier: 'cnft-1' }, // cNFT present on offered side only
      ];
      const requestedAssets = [
        { type: AssetType.NFT, identifier: 'nft-2' },
        { type: AssetType.NFT, identifier: 'nft-3' },
      ];

      const flowResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined
      );

      // cNFT on ONE side only → CNFT_DELEGATION with Jito bundle (not Two-Phase)
      expect(flowResult.flowType).to.equal(SwapFlowType.CNFT_DELEGATION);
      expect(flowResult.requiresTwoPhase).to.be.false;
      expect(flowResult.requiresDelegation).to.be.true; // Has cNFT
      expect(flowResult.totalAssetCount).to.equal(4);
      expect(flowResult.cnftCount).to.equal(1);
    });
  });
});
