/**
 * Unit Tests for Unified Offer Normalizer (Tasks 1 & 2)
 *
 * Tests the request normalization and offer type detection for the unified
 * POST /api/swaps/offers endpoint that consolidates atomic, cNFT bid, and bulk swap flows.
 *
 * @see src/utils/unifiedOfferNormalizer.ts
 */

import { expect } from 'chai';
import { describe, it } from 'mocha';
import {
  normalizeOfferRequest,
  validateUnifiedRequest,
  normalizeAsset,
  normalizeAssets,
  normalizeSolAmount,
  parseIntSafe,
  isCnftBidRequest,
  usesBulkNaming,
  usesAtomicNaming,
  OfferType,
  getOfferTypeDescription,
  type UnifiedOfferRequest,
  type AssetInput,
} from '../../src/utils/unifiedOfferNormalizer';
import { AssetType } from '../../src/services/assetValidator';

describe('Unified Offer Normalizer', () => {
  describe('Offer Type Detection', () => {
    describe('isCnftBidRequest()', () => {
      it('should detect cNFT bid request with all required fields', () => {
        const request: UnifiedOfferRequest = {
          bidderWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          targetAssetId: 'DRiP2Pn2K6fuMLKQmt5rZWqHheXMyUtCeXhe8kDQdxRu',
          offerLamports: '1000000000',
        };

        expect(isCnftBidRequest(request)).to.be.true;
      });

      it('should not detect cNFT bid when fields are missing', () => {
        expect(isCnftBidRequest({ bidderWallet: 'wallet' })).to.be.false;
        expect(isCnftBidRequest({ targetAssetId: 'asset' })).to.be.false;
        expect(isCnftBidRequest({ offerLamports: '1000' })).to.be.false;
        expect(
          isCnftBidRequest({ bidderWallet: 'wallet', targetAssetId: 'asset' })
        ).to.be.false;
      });
    });

    describe('usesBulkNaming()', () => {
      it('should detect bulk naming conventions', () => {
        expect(usesBulkNaming({ partyA: 'wallet' })).to.be.true;
        expect(usesBulkNaming({ assetsA: [] })).to.be.true;
        expect(usesBulkNaming({ assetsB: [] })).to.be.true;
        expect(usesBulkNaming({ solAmountA: '1000' })).to.be.true;
        expect(usesBulkNaming({ solAmountB: '1000' })).to.be.true;
        // Note: partyB alone is not checked by usesBulkNaming (only checks primary identifiers)
      });

      it('should not detect bulk naming for atomic style', () => {
        expect(usesBulkNaming({ makerWallet: 'wallet' })).to.be.false;
        expect(usesBulkNaming({ offeredAssets: [] })).to.be.false;
      });
    });

    describe('usesAtomicNaming()', () => {
      it('should detect atomic naming conventions', () => {
        expect(usesAtomicNaming({ makerWallet: 'wallet' })).to.be.true;
        expect(usesAtomicNaming({ offeredAssets: [] })).to.be.true;
        expect(usesAtomicNaming({ requestedAssets: [] })).to.be.true;
        expect(usesAtomicNaming({ offeredSol: '1000' })).to.be.true;
        expect(usesAtomicNaming({ requestedSol: '1000' })).to.be.true;
        // Note: takerWallet alone is not checked (only checks primary identifiers)
      });

      it('should not detect atomic naming for bulk style', () => {
        expect(usesAtomicNaming({ partyA: 'wallet' })).to.be.false;
        expect(usesAtomicNaming({ assetsA: [] })).to.be.false;
      });
    });
  });

  describe('Asset Normalization', () => {
    describe('normalizeAsset()', () => {
      it('should normalize asset with mint field', () => {
        const asset: AssetInput = { mint: 'asset-mint-address' };
        const normalized = normalizeAsset(asset);

        expect(normalized.identifier).to.equal('asset-mint-address');
        expect(normalized.type).to.equal(AssetType.NFT);
      });

      it('should normalize asset with identifier field', () => {
        const asset: AssetInput = { identifier: 'asset-id' };
        const normalized = normalizeAsset(asset);

        expect(normalized.identifier).to.equal('asset-id');
      });

      it('should normalize asset with assetId field', () => {
        const asset: AssetInput = { assetId: 'cnft-asset-id' };
        const normalized = normalizeAsset(asset);

        expect(normalized.identifier).to.equal('cnft-asset-id');
      });

      it('should detect CNFT type via isCompressed flag', () => {
        const asset: AssetInput = { mint: 'asset', isCompressed: true };
        const normalized = normalizeAsset(asset);

        expect(normalized.type).to.equal(AssetType.CNFT);
      });

      it('should detect CNFT type via type field', () => {
        const asset: AssetInput = { mint: 'asset', type: 'CNFT' };
        const normalized = normalizeAsset(asset);

        expect(normalized.type).to.equal(AssetType.CNFT);
      });

      it('should detect CORE_NFT type via isCoreNft flag', () => {
        const asset: AssetInput = { mint: 'asset', isCoreNft: true };
        const normalized = normalizeAsset(asset);

        expect(normalized.type).to.equal(AssetType.CORE_NFT);
      });

      it('should detect CORE_NFT type via type field', () => {
        const asset: AssetInput = { mint: 'asset', type: 'CORE_NFT' };
        const normalized = normalizeAsset(asset);

        expect(normalized.type).to.equal(AssetType.CORE_NFT);
      });

      it('should throw error for asset without identifier', () => {
        const asset: AssetInput = { isCompressed: true };

        expect(() => normalizeAsset(asset)).to.throw(
          'Asset must have mint, identifier, or assetId field'
        );
      });

      it('should preserve metadata', () => {
        const asset: AssetInput = {
          mint: 'asset',
          metadata: { name: 'Test NFT' },
        };
        const normalized = normalizeAsset(asset);

        expect(normalized.metadata).to.deep.equal({ name: 'Test NFT' });
      });
    });

    describe('normalizeAssets()', () => {
      it('should normalize array of assets', () => {
        const assets: AssetInput[] = [
          { mint: 'nft-1' },
          { mint: 'cnft-1', isCompressed: true },
        ];
        const normalized = normalizeAssets(assets);

        expect(normalized).to.have.length(2);
        expect(normalized[0].type).to.equal(AssetType.NFT);
        expect(normalized[1].type).to.equal(AssetType.CNFT);
      });

      it('should return empty array for undefined', () => {
        expect(normalizeAssets(undefined)).to.deep.equal([]);
      });

      it('should return empty array for non-array', () => {
        expect(normalizeAssets('invalid' as any)).to.deep.equal([]);
      });
    });
  });

  describe('SOL Amount Normalization', () => {
    describe('normalizeSolAmount()', () => {
      it('should convert string to bigint', () => {
        expect(normalizeSolAmount('1000000000')).to.equal(BigInt(1000000000));
      });

      it('should convert number to bigint', () => {
        expect(normalizeSolAmount(1000000000)).to.equal(BigInt(1000000000));
      });

      it('should return undefined for undefined', () => {
        expect(normalizeSolAmount(undefined)).to.be.undefined;
      });

      it('should return undefined for null', () => {
        expect(normalizeSolAmount(null as any)).to.be.undefined;
      });

      it('should return undefined for empty string', () => {
        expect(normalizeSolAmount('')).to.be.undefined;
      });

      it('should throw error for invalid amount', () => {
        expect(() => normalizeSolAmount('invalid')).to.throw(
          'Invalid SOL amount'
        );
      });
    });

    describe('parseIntSafe()', () => {
      it('should parse string to number', () => {
        expect(parseIntSafe('86400')).to.equal(86400);
      });

      it('should return number as-is', () => {
        expect(parseIntSafe(86400)).to.equal(86400);
      });

      it('should return undefined for undefined', () => {
        expect(parseIntSafe(undefined)).to.be.undefined;
      });

      it('should throw error for invalid integer', () => {
        expect(() => parseIntSafe('not-a-number')).to.throw(
          'Invalid integer value'
        );
      });
    });
  });

  describe('Request Normalization', () => {
    describe('normalizeOfferRequest() - cNFT Bid', () => {
      it('should detect and normalize cNFT bid request', () => {
        const request: UnifiedOfferRequest = {
          bidderWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          targetAssetId: 'DRiP2Pn2K6fuMLKQmt5rZWqHheXMyUtCeXhe8kDQdxRu',
          offerLamports: '1000000000',
          durationSeconds: '86400',
          feeBps: 250,
        };

        const result = normalizeOfferRequest(request);

        expect(result.offerType).to.equal(OfferType.CNFT_BID);
        expect(result.cnftBidRequest).to.exist;
        expect(result.cnftBidRequest!.bidderWallet).to.equal(
          '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R'
        );
        expect(result.cnftBidRequest!.targetAssetId).to.equal(
          'DRiP2Pn2K6fuMLKQmt5rZWqHheXMyUtCeXhe8kDQdxRu'
        );
        expect(result.cnftBidRequest!.offerLamports).to.equal(
          BigInt(1000000000)
        );
        expect(result.cnftBidRequest!.durationSeconds).to.equal(86400);
        expect(result.cnftBidRequest!.feeBps).to.equal(250);
        expect(result.warnings).to.be.empty;
      });
    });

    describe('normalizeOfferRequest() - Atomic Swap', () => {
      it('should normalize simple atomic swap with maker/taker style', () => {
        const request: UnifiedOfferRequest = {
          makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          takerWallet: '8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ',
          offeredAssets: [{ mint: 'nft-mint-1' }],
          requestedAssets: [],
          offeredSol: '0',
          requestedSol: '1000000000',
        };

        const result = normalizeOfferRequest(request);

        expect(result.offerType).to.equal(OfferType.ATOMIC);
        expect(result.atomicRequest).to.exist;
        expect(result.atomicRequest!.makerWallet).to.equal(
          '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R'
        );
        expect(result.atomicRequest!.takerWallet).to.equal(
          '8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ'
        );
        expect(result.atomicRequest!.offeredAssets).to.have.length(1);
        expect(result.atomicRequest!.requestedSol).to.equal(BigInt(1000000000));
      });

      it('should normalize atomic swap with partyA/B style (aliases)', () => {
        const request: UnifiedOfferRequest = {
          partyA: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          partyB: '8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ',
          assetsA: [{ mint: 'nft-mint-1' }],
          assetsB: [{ mint: 'nft-mint-2' }],
          solAmountA: '0',
          solAmountB: '0',
        };

        const result = normalizeOfferRequest(request);

        expect(result.offerType).to.equal(OfferType.ATOMIC);
        expect(result.atomicRequest!.makerWallet).to.equal(
          '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R'
        );
        expect(result.atomicRequest!.takerWallet).to.equal(
          '8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ'
        );
      });

      it('should emit warning when both naming conventions are used', () => {
        const request: UnifiedOfferRequest = {
          makerWallet: 'wallet-1',
          partyA: 'wallet-2',
          offeredAssets: [{ mint: 'asset-1' }],
        };

        const result = normalizeOfferRequest(request);

        expect(result.warnings).to.have.length(1);
        expect(result.warnings[0]).to.include('both maker/taker and partyA/B');
        // maker/taker should take precedence
        expect(result.atomicRequest!.makerWallet).to.equal('wallet-1');
      });

      it('should throw error when maker wallet is missing', () => {
        const request: UnifiedOfferRequest = {
          offeredAssets: [{ mint: 'nft-mint-1' }],
        };

        expect(() => normalizeOfferRequest(request)).to.throw(
          'Request must include makerWallet or partyA'
        );
      });
    });

    describe('normalizeOfferRequest() - Bulk Two-Phase', () => {
      it('should detect bulk swap with 3+ cNFTs on one side', () => {
        const request: UnifiedOfferRequest = {
          makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          offeredAssets: [
            { mint: 'cnft-1', isCompressed: true },
            { mint: 'cnft-2', isCompressed: true },
            { mint: 'cnft-3', isCompressed: true },
          ],
          requestedAssets: [],
          requestedSol: '5000000000',
        };

        const result = normalizeOfferRequest(request);

        expect(result.offerType).to.equal(OfferType.BULK_TWO_PHASE);
        expect(result.bulkRequest).to.exist;
        expect(result.bulkRequest!.partyA).to.equal(
          '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R'
        );
        expect(result.bulkRequest!.assetsA).to.have.length(3);
      });

      it('should detect bulk swap with 5+ total assets', () => {
        const request: UnifiedOfferRequest = {
          makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          offeredAssets: [
            { mint: 'nft-1' },
            { mint: 'nft-2' },
            { mint: 'nft-3' },
          ],
          requestedAssets: [{ mint: 'nft-4' }, { mint: 'nft-5' }],
        };

        const result = normalizeOfferRequest(request);

        expect(result.offerType).to.equal(OfferType.BULK_TWO_PHASE);
      });

      it('should detect bulk swap with 4+ assets and any cNFT', () => {
        const request: UnifiedOfferRequest = {
          makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          offeredAssets: [
            { mint: 'nft-1' },
            { mint: 'cnft-1', isCompressed: true },
          ],
          requestedAssets: [{ mint: 'nft-2' }, { mint: 'nft-3' }],
        };

        const result = normalizeOfferRequest(request);

        expect(result.offerType).to.equal(OfferType.BULK_TWO_PHASE);
      });

      it('should include both bulk and atomic request for bulk swaps', () => {
        const request: UnifiedOfferRequest = {
          partyA: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          partyB: '8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ',
          assetsA: [
            { mint: 'cnft-1', isCompressed: true },
            { mint: 'cnft-2', isCompressed: true },
            { mint: 'cnft-3', isCompressed: true },
          ],
          assetsB: [],
          solAmountB: '5000000000',
          lockTimeoutSeconds: 3600,
          platformFeeLamports: '10000000',
        };

        const result = normalizeOfferRequest(request);

        expect(result.offerType).to.equal(OfferType.BULK_TWO_PHASE);
        expect(result.bulkRequest).to.exist;
        expect(result.atomicRequest).to.exist; // Also includes atomic format for reference
        expect(result.bulkRequest!.lockTimeoutSeconds).to.equal(3600);
        expect(result.bulkRequest!.platformFeeLamports).to.equal(
          BigInt(10000000)
        );
      });
    });
  });

  describe('Request Validation', () => {
    describe('validateUnifiedRequest()', () => {
      it('should validate valid atomic swap request', () => {
        const request: UnifiedOfferRequest = {
          makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          offeredAssets: [{ mint: 'nft-mint-1' }],
          requestedSol: '1000000000',
        };

        const result = validateUnifiedRequest(request);

        expect(result.isValid).to.be.true;
        expect(result.errors).to.be.empty;
      });

      it('should validate valid cNFT bid request', () => {
        const request: UnifiedOfferRequest = {
          bidderWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          targetAssetId: 'DRiP2Pn2K6fuMLKQmt5rZWqHheXMyUtCeXhe8kDQdxRu',
          offerLamports: '1000000000',
        };

        const result = validateUnifiedRequest(request);

        expect(result.isValid).to.be.true;
        expect(result.errors).to.be.empty;
      });

      it('should reject request without maker wallet', () => {
        const request: UnifiedOfferRequest = {
          offeredAssets: [{ mint: 'nft-mint-1' }],
        };

        const result = validateUnifiedRequest(request);

        expect(result.isValid).to.be.false;
        expect(result.errors).to.have.length(1);
        expect(result.errors[0].field).to.equal('makerWallet');
      });

      it('should reject request without assets or SOL', () => {
        const request: UnifiedOfferRequest = {
          makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
        };

        const result = validateUnifiedRequest(request);

        expect(result.isValid).to.be.false;
        expect(result.errors.some((e) => e.field === 'offeredAssets')).to.be
          .true;
      });

      it('should reject non-array asset fields', () => {
        const request: UnifiedOfferRequest = {
          makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          offeredAssets: 'not-an-array' as any,
        };

        const result = validateUnifiedRequest(request);

        expect(result.isValid).to.be.false;
        expect(
          result.errors.some(
            (e) =>
              e.field === 'offeredAssets' && e.message.includes('must be an array')
          )
        ).to.be.true;
      });

      it('should accept request with only SOL amounts', () => {
        const request: UnifiedOfferRequest = {
          makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
          offeredSol: '1000000000',
          requestedAssets: [{ mint: 'nft-mint-1' }],
        };

        const result = validateUnifiedRequest(request);

        expect(result.isValid).to.be.true;
      });
    });
  });

  describe('Utility Functions', () => {
    describe('getOfferTypeDescription()', () => {
      it('should return correct descriptions', () => {
        expect(getOfferTypeDescription(OfferType.ATOMIC)).to.equal(
          'atomic swap'
        );
        expect(getOfferTypeDescription(OfferType.CNFT_BID)).to.equal(
          'cNFT bid with SOL escrow'
        );
        expect(getOfferTypeDescription(OfferType.BULK_TWO_PHASE)).to.equal(
          'bulk two-phase swap (lock/settle)'
        );
      });
    });
  });

  describe('Asset Type Case Sensitivity (Bug Fix)', () => {
    /**
     * This test suite documents the case sensitivity behavior that caused a bug
     * where cNFT and Core NFT listings displayed as "Unknown NFT SPL NFT".
     *
     * The bug occurred because:
     * - Frontend sends uppercase: { type: 'CNFT' } or { type: 'CORE_NFT' }
     * - Backend normalizes to lowercase enum: AssetType.CNFT = 'cnft'
     * - Frontend was checking for uppercase when rendering, which didn't match
     *
     * The fix ensures frontend checks for lowercase values.
     * These tests ensure the backend continues to normalize to lowercase.
     */

    it('should normalize CNFT type to lowercase enum value', () => {
      const asset: AssetInput = { mint: 'asset', type: 'CNFT' };
      const normalized = normalizeAsset(asset);

      // Backend stores lowercase 'cnft', NOT 'CNFT'
      expect(normalized.type).to.equal(AssetType.CNFT);
      expect(normalized.type).to.equal('cnft');
      expect(normalized.type).to.not.equal('CNFT');
    });

    it('should normalize CORE_NFT type to lowercase enum value', () => {
      const asset: AssetInput = { mint: 'asset', type: 'CORE_NFT' };
      const normalized = normalizeAsset(asset);

      // Backend stores lowercase 'core_nft', NOT 'CORE_NFT'
      expect(normalized.type).to.equal(AssetType.CORE_NFT);
      expect(normalized.type).to.equal('core_nft');
      expect(normalized.type).to.not.equal('CORE_NFT');
    });

    it('should normalize NFT type to lowercase enum value', () => {
      const asset: AssetInput = { mint: 'asset', type: 'NFT' };
      const normalized = normalizeAsset(asset);

      // Backend stores lowercase 'nft', NOT 'NFT'
      expect(normalized.type).to.equal(AssetType.NFT);
      expect(normalized.type).to.equal('nft');
      expect(normalized.type).to.not.equal('NFT');
    });

    it('should preserve metadata through normalization for marketplace display', () => {
      // This test ensures metadata (name, image) survives normalization
      // so listings don't show "Unknown NFT"
      const asset: AssetInput = {
        identifier: 'cnft-asset-id',
        type: 'CNFT',
        metadata: {
          name: 'My Cool cNFT',
          image: 'https://example.com/image.png',
        },
      };
      const normalized = normalizeAsset(asset);

      expect(normalized.metadata).to.exist;
      expect(normalized.metadata.name).to.equal('My Cool cNFT');
      expect(normalized.metadata.image).to.equal('https://example.com/image.png');
    });

    it('should preserve metadata in full offer normalization', () => {
      const request: UnifiedOfferRequest = {
        makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
        offeredAssets: [
          {
            identifier: 'cnft-1',
            type: 'CNFT',
            metadata: { name: 'Test cNFT', image: 'https://test.com/img.png' },
          },
        ],
        requestedAssets: [],
        requestedSol: '1000000000',
      };

      const result = normalizeOfferRequest(request);

      expect(result.atomicRequest!.offeredAssets[0].type).to.equal('cnft');
      expect(result.atomicRequest!.offeredAssets[0].metadata).to.exist;
      expect(result.atomicRequest!.offeredAssets[0].metadata.name).to.equal('Test cNFT');
    });

    it('should handle mixed case asset types in a single request', () => {
      const request: UnifiedOfferRequest = {
        makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
        offeredAssets: [
          { identifier: 'nft-1', type: 'NFT' },
          { identifier: 'cnft-1', type: 'CNFT' },
          { identifier: 'core-1', type: 'CORE_NFT' },
        ],
        requestedAssets: [],
        requestedSol: '1000000000',
      };

      const result = normalizeOfferRequest(request);

      const assets = result.atomicRequest!.offeredAssets;
      expect(assets[0].type).to.equal('nft');
      expect(assets[1].type).to.equal('cnft');
      expect(assets[2].type).to.equal('core_nft');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty assets arrays', () => {
      const request: UnifiedOfferRequest = {
        makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
        offeredAssets: [],
        requestedAssets: [],
        offeredSol: '1000000000',
      };

      const result = normalizeOfferRequest(request);

      expect(result.offerType).to.equal(OfferType.ATOMIC);
      expect(result.atomicRequest!.offeredAssets).to.have.length(0);
    });

    it('should handle customFee field', () => {
      const request: UnifiedOfferRequest = {
        makerWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
        offeredAssets: [{ mint: 'nft-1' }],
        requestedSol: '1000000000',
        customFee: '5000000',
      };

      const result = normalizeOfferRequest(request);

      expect(result.atomicRequest!.customFee).to.equal(BigInt(5000000));
    });

    it('should prefer maker/taker fields over partyA/B when both present', () => {
      const request: UnifiedOfferRequest = {
        makerWallet: 'maker-wallet',
        partyA: 'party-a-wallet',
        offeredAssets: [{ mint: 'nft-1' }],
        assetsA: [{ mint: 'nft-2' }],
      };

      const result = normalizeOfferRequest(request);

      expect(result.atomicRequest!.makerWallet).to.equal('maker-wallet');
      expect(result.atomicRequest!.offeredAssets[0].identifier).to.equal(
        'nft-1'
      );
    });
  });
});
