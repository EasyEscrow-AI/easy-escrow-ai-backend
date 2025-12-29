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

    it('should correctly identify two-phase flow for bulk cNFT swap', () => {
      // Simulates: POST /api/swaps/offers/bulk with 3+ cNFTs
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

      // Verify bulk cNFT triggers two-phase flow
      expect(flowResult.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(flowResult.requiresDelegation).to.be.true;
      expect(flowResult.requiresTwoPhase).to.be.true;
      expect(flowResult.cnftCount).to.equal(3);

      // Verify helper functions
      expect(needsDelegation(offeredAssets, requestedAssets)).to.be.true;
      expect(needsTwoPhase(offeredAssets, requestedAssets)).to.be.true;
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

  describe('JITO Flag Integration', () => {
    it('should respect JITO enabled flag', () => {
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
        true // JITO enabled
      );

      // With JITO disabled
      const jitoDisabledResult = determineSwapFlow(
        offeredAssets,
        requestedAssets,
        undefined,
        undefined,
        false // JITO disabled
      );

      // Both should require delegation for cNFT
      expect(jitoEnabledResult.requiresDelegation).to.be.true;
      expect(jitoDisabledResult.requiresDelegation).to.be.true;

      // But canUseJito should differ
      expect(jitoEnabledResult.canUseJito).to.be.true;
      expect(jitoDisabledResult.canUseJito).to.be.false;
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
    it('should handle mixed asset types with correct prioritization', () => {
      // Mix of NFT, Core NFT, and cNFT
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

      // 4 assets with cNFT should trigger two-phase
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

    it('should handle large SPL-only asset counts with atomic flow (not two-phase)', () => {
      // 5 NFTs (no cNFTs) should use ATOMIC flow, NOT two-phase.
      // Two-phase is ONLY for cNFT delegation.
      // SPL-only bulk swaps use Jito bundles or sequential execution.
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

      // SPL-only bulk swaps use atomic flow, not two-phase
      expect(flowResult.flowType).to.equal(SwapFlowType.ATOMIC);
      expect(flowResult.requiresTwoPhase).to.be.false;
      expect(flowResult.requiresDelegation).to.be.false; // No cNFTs
      expect(flowResult.totalAssetCount).to.equal(5);
    });

    it('should trigger two-phase for large asset counts WITH cNFTs', () => {
      // 5+ assets WITH at least one cNFT should trigger two-phase
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

      // 5 assets WITH cNFT triggers two-phase
      expect(flowResult.flowType).to.equal(SwapFlowType.TWO_PHASE);
      expect(flowResult.requiresTwoPhase).to.be.true;
      expect(flowResult.requiresDelegation).to.be.true; // Has cNFT
      expect(flowResult.totalAssetCount).to.equal(5);
      expect(flowResult.cnftCount).to.equal(1);
    });
  });
});
