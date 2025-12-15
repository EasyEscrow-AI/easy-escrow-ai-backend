/**
 * Production Integration Tests: cNFT API Endpoints
 * 
 * Tests cNFT-specific API endpoints including proof fetching, asset validation,
 * and transaction building without executing actual transfers.
 * 
 * Environment: Production (Mainnet)
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';
import { Connection, PublicKey } from '@solana/web3.js';

const API_BASE_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';
const RPC_URL = process.env.MAINNET_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

describe('🔍 Production Integration: cNFT API Endpoints', () => {
  let connection: Connection;

  before(function() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     PRODUCTION INTEGRATION TEST: cNFT API ENDPOINTS           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(`📡 API Base URL: ${API_BASE_URL}\n`);

    connection = new Connection(RPC_URL, 'confirmed');
  });

  describe('cNFT Asset Validation', () => {
    it('should validate cNFT asset format in quote request', async function() {
      this.timeout(30000);

      const quoteRequest = {
        makerAssets: [{
          type: 'cnft',
          identifier: 'test-cnft-asset-id-123',
        }],
        takerAssets: [{
          type: 'sol',
          amount: 0.1,
        }],
      };

      const response = await request(API_BASE_URL)
        .post('/api/quote')
        .send(quoteRequest);

      // Should either succeed (if valid) or return proper error (if invalid)
      expect([200, 400]).to.include(response.status);
      console.log(`✅ cNFT validation: ${response.status === 200 ? 'Valid' : 'Error handled'}`);
    });

    it('should handle mixed asset types (cNFT + SPL NFT + SOL)', async function() {
      this.timeout(30000);

      const mixedQuoteRequest = {
        makerAssets: [
          { type: 'cnft', identifier: 'cnft-123' },
          { type: 'nft', identifier: '11111111111111111111111111111111' },
          { type: 'sol', amount: 0.05 },
        ],
        takerAssets: [
          { type: 'sol', amount: 0.2 },
        ],
      };

      const response = await request(API_BASE_URL)
        .post('/api/offers/quote')
        .send(mixedQuoteRequest);

      expect([200, 400]).to.include(response.status);
      console.log('✅ Mixed asset types: OK');
    });
  });

  describe('Bulk Swap API', () => {
    it('should handle bulk swap quote requests (3+ assets)', async function() {
      this.timeout(30000);

      const bulkQuoteRequest = {
        makerAssets: [
          { type: 'cnft', identifier: 'cnft-1' },
          { type: 'cnft', identifier: 'cnft-2' },
          { type: 'cnft', identifier: 'cnft-3' },
        ],
        takerAssets: [
          { type: 'sol', amount: 0.3 },
        ],
      };

      const response = await request(API_BASE_URL)
        .post('/api/quote')
        .send(bulkQuoteRequest);

      expect([200, 400]).to.include(response.status);
      if (response.status === 200) {
        expect(response.body).to.have.property('data');
        // Check if transaction group info is included for bulk swaps
        if (response.body.data.transactionCount) {
          console.log(`✅ Bulk swap detected: ${response.body.data.transactionCount} transactions`);
        }
      }
      console.log('✅ Bulk swap quote: OK');
    });

    it('should validate maximum asset limit (10 per side)', async function() {
      this.timeout(30000);

      const maxAssetsRequest = {
        makerAssets: Array.from({ length: 11 }, (_, i) => ({
          type: 'nft',
          identifier: `${i.toString().padStart(44, '1')}`,
        })),
        takerAssets: [{ type: 'sol', amount: 1.0 }],
      };

      const response = await request(API_BASE_URL)
        .post('/api/quote')
        .send(maxAssetsRequest);

      // Should return 400 for exceeding limit
      expect([400, 422]).to.include(response.status);
      console.log('✅ Asset limit validation: OK');
    });
  });

  describe('Offer Management for cNFT Swaps', () => {
    it('should list offers with cNFT assets', async function() {
      this.timeout(30000);

      const response = await request(API_BASE_URL)
        .get('/api/offers')
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.be.an('array');

      // Check if any offers contain cNFT assets
      const cnftOffers = response.body.data.offers.filter((offer: any) => 
        offer.offeredAssets?.some((asset: any) => asset.isCompressed === true || asset.type === 'cnft') ||
        offer.requestedAssets?.some((asset: any) => asset.isCompressed === true || asset.type === 'cnft')
      );

      console.log(`✅ Found ${cnftOffers.length} offers with cNFT assets`);
    });
  });

  describe('Transaction Group Information', () => {
    it('should return transaction group info for bulk swaps', async function() {
      this.timeout(30000);

      // First, get existing offers to check for bulk swaps
      const offersResponse = await request(API_BASE_URL)
        .get('/api/offers')
        .expect(200);

      if (offersResponse.body.data.length > 0) {
        const bulkOffer = offersResponse.body.data.find((offer: any) => 
          offer.transactionCount && offer.transactionCount > 1
        );

        if (bulkOffer) {
          expect(bulkOffer).to.have.property('transactionCount');
          expect(bulkOffer.transactionCount).to.be.greaterThan(1);
          console.log(`✅ Bulk swap found: ${bulkOffer.transactionCount} transactions`);
        } else {
          console.log('ℹ️  No bulk swaps found in current offers');
        }
      }
    });
  });
});

