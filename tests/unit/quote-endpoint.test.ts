import { expect } from 'chai';
import request from 'supertest';
import sinon from 'sinon';
import { Application } from 'express';
import { createTestApp } from '../helpers/test-app';

/**
 * Unit tests for POST /api/quote endpoint
 * 
 * The quote endpoint provides comprehensive swap information including:
 * - SOL price (from CoinGecko)
 * - Network fees estimation
 * - Platform fees (percentage/flat/zero-fee)
 * - Transaction size estimation with ALT support
 * - Time estimates
 * - Warnings about limitations
 */
describe('Quote Endpoint - POST /api/quote', () => {
  let app: Application;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    app = createTestApp();
    
    // Stub global fetch for CoinGecko price API
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves({
      ok: true,
      json: async () => ({ solana: { usd: 150.00 } }),
    } as Response);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Basic Functionality', () => {
    it('should return a successful quote for SPL NFT -> SOL swap', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 1_000_000_000, // 1 SOL
        })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('data');
      
      const data = response.body.data;
      
      // Check SOL price is returned
      expect(data).to.have.property('solPriceUSD');
      expect(data.solPriceUSD).to.be.a('number');
      
      // Check maker side
      expect(data.maker).to.have.property('assetCount', 1);
      expect(data.maker.breakdown).to.have.property('splNfts', 1);
      expect(data.maker.breakdown).to.have.property('cNfts', 0);
      expect(data.maker.breakdown).to.have.property('coreNfts', 0);
      
      // Check taker side
      expect(data.taker).to.have.property('assetCount', 0);
      expect(data.taker.sol.lamports).to.equal(1_000_000_000);
      
      // Check fees
      expect(data).to.have.property('networkFee');
      expect(data.networkFee).to.have.property('sol');
      expect(data.networkFee).to.have.property('lamports');
      expect(data.networkFee).to.have.property('display');
      
      expect(data).to.have.property('platformFee');
      expect(data.platformFee).to.have.property('type', 'percentage');
      expect(data.platformFee).to.have.property('rate', 0.01);
      
      // Check transaction size
      expect(data).to.have.property('transactionSize');
      expect(data.transactionSize).to.have.property('estimated');
      expect(data.transactionSize).to.have.property('maxSize', 1232);
      expect(data.transactionSize).to.have.property('willFit');
      expect(data.transactionSize).to.have.property('status');
      
      // Check time estimate
      expect(data).to.have.property('estimatedTime');
      expect(data.estimatedTime).to.have.property('seconds');
      expect(data.estimatedTime).to.have.property('display');
      
      // Check canSwap
      expect(data).to.have.property('canSwap');
    });

    it('should return a quote for SOL -> NFT swap', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [],
          takerAssets: [{
            mint: '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          makerSolLamports: 500_000_000, // 0.5 SOL
          takerSolLamports: 0,
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      
      const data = response.body.data;
      expect(data.maker.sol.lamports).to.equal(500_000_000);
      expect(data.taker.assetCount).to.equal(1);
    });

    it('should return a quote for NFT <-> NFT swap', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [{
            mint: '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          makerSolLamports: 0,
          takerSolLamports: 0,
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      
      const data = response.body.data;
      expect(data.maker.assetCount).to.equal(1);
      expect(data.taker.assetCount).to.equal(1);
      
      // NFT-only swaps should have flat fee
      expect(data.platformFee.type).to.equal('flat');
      expect(data.platformFee.sol).to.equal(0.005);
    });
  });

  describe('cNFT Handling', () => {
    it('should handle cNFT -> SOL swap with warnings', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: 'BoQhmB2wgvdB1Wrumoy1LYQBjzaScVdMhtkMHRQdSRPt',
            isCompressed: true,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 100_000_000, // 0.1 SOL
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      
      const data = response.body.data;
      expect(data.maker.breakdown.cNfts).to.equal(1);
      
      // cNFTs should have warnings about proof size
      expect(data.warnings).to.be.an('array');
      // May or may not have warning depending on proof nodes
    });

    it('should use provided proof nodes for accurate cNFT estimation', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: 'BoQhmB2wgvdB1Wrumoy1LYQBjzaScVdMhtkMHRQdSRPt',
            isCompressed: true,
            isCoreNft: false,
            proofNodes: 3, // Known proof size
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 100_000_000,
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      
      const data = response.body.data;
      expect(data.transactionSize.details.makerProofNodes).to.equal(3);
    });
  });

  describe('Core NFT Handling', () => {
    it('should handle Core NFT -> SOL swap', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: 'CoreNFTAddress123',
            isCompressed: false,
            isCoreNft: true,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 200_000_000, // 0.2 SOL
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      
      const data = response.body.data;
      expect(data.maker.breakdown.coreNfts).to.equal(1);
      expect(data.maker.breakdown.splNfts).to.equal(0);
      expect(data.maker.breakdown.cNfts).to.equal(0);
    });
  });

  describe('Fee Calculations', () => {
    it('should calculate percentage-based platform fee for SOL swaps', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 10_000_000_000, // 10 SOL
        })
        .expect(200);

      const data = response.body.data;
      expect(data.platformFee.type).to.equal('percentage');
      expect(data.platformFee.rate).to.equal(0.01);
      expect(data.platformFee.sol).to.equal(0.1); // 1% of 10 SOL
    });

    it('should apply minimum platform fee for small SOL amounts', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 10_000_000, // 0.01 SOL (1% = 0.0001 SOL, below minimum)
        })
        .expect(200);

      const data = response.body.data;
      expect(data.platformFee.type).to.equal('percentage');
      expect(data.platformFee.sol).to.equal(0.001); // Minimum fee
    });

    it('should apply flat fee for NFT-only swaps', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [{
            mint: '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          makerSolLamports: 0,
          takerSolLamports: 0,
        })
        .expect(200);

      const data = response.body.data;
      expect(data.platformFee.type).to.equal('flat');
      expect(data.platformFee.sol).to.equal(0.005);
    });

    it('should apply zero fee when API key is provided', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 1_000_000_000,
          apiKey: 'test-api-key-123',
        })
        .expect(200);

      const data = response.body.data;
      expect(data.platformFee.type).to.equal('zero');
      expect(data.platformFee.sol).to.equal(0);
    });

    it('should calculate network fees based on NFT types', async () => {
      // Regular NFT - lower fees
      const regularResponse = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 100_000_000,
        })
        .expect(200);

      // cNFT - higher fees
      const cnftResponse = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: 'BoQhmB2wgvdB1Wrumoy1LYQBjzaScVdMhtkMHRQdSRPt',
            isCompressed: true,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 100_000_000,
        })
        .expect(200);

      // cNFT should have higher network fees due to more compute
      expect(cnftResponse.body.data.networkFee.sol)
        .to.be.greaterThan(regularResponse.body.data.networkFee.sol);
    });
  });

  describe('Transaction Size Estimation', () => {
    it('should estimate transaction size for SPL NFT swap', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 100_000_000,
        })
        .expect(200);

      const txSize = response.body.data.transactionSize;
      expect(txSize.estimated).to.be.a('number');
      expect(txSize.estimated).to.be.greaterThan(0);
      expect(txSize.maxSize).to.equal(1232);
      expect(txSize.willFit).to.be.a('boolean');
      expect(txSize.status).to.be.oneOf(['ok', 'alt_required', 'near_limit', 'too_large']);
    });

    it('should provide ALT information when available', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 100_000_000,
        })
        .expect(200);

      const txSize = response.body.data.transactionSize;
      expect(txSize).to.have.property('altAvailable');
      expect(txSize).to.have.property('estimatedWithALT');
    });

    it('should provide transaction size breakdown', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 100_000_000,
        })
        .expect(200);

      const breakdown = response.body.data.transactionSize.breakdown;
      expect(breakdown).to.have.property('signatures');
      expect(breakdown).to.have.property('accounts');
      expect(breakdown).to.have.property('instructions');
      expect(breakdown).to.have.property('cnftProofs');
    });

    it('should warn about multi-NFT swaps exceeding limits', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [
            { mint: 'NFT1', isCompressed: false, isCoreNft: false },
            { mint: 'NFT2', isCompressed: false, isCoreNft: false },
          ],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 100_000_000,
        })
        .expect(200);

      const data = response.body.data;
      expect(data.transactionSize.status).to.equal('too_large');
      expect(data.warnings).to.include('Current program only supports 1 NFT per side. Multi-NFT swaps require program upgrade.');
      expect(data.canSwap).to.be.false;
    });
  });

  describe('Time Estimation', () => {
    it('should estimate ~5 seconds for simple swaps', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 100_000_000,
        })
        .expect(200);

      expect(response.body.data.estimatedTime.seconds).to.equal(5);
      expect(response.body.data.estimatedTime.display).to.equal('~5 seconds');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty request body gracefully', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({})
        .expect(200); // Should still return a quote with defaults

      expect(response.body.success).to.be.true;
      const data = response.body.data;
      expect(data.maker.assetCount).to.equal(0);
      expect(data.taker.assetCount).to.equal(0);
    });

    it('should handle CoinGecko API failure gracefully', async () => {
      // Make fetch return error
      fetchStub.resolves({
        ok: false,
        status: 500,
      } as Response);

      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 100_000_000,
        })
        .expect(200);

      // Should still return a quote even without SOL price
      expect(response.body.success).to.be.true;
      // SOL price may be null or cached
    });
  });

  describe('Response Format', () => {
    it('should include timestamp in response', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 0,
        })
        .expect(200);

      expect(response.body.data).to.have.property('timestamp');
      expect(new Date(response.body.data.timestamp)).to.be.instanceOf(Date);
    });

    it('should format SOL amounts with USD when price available', async () => {
      const response = await request(app)
        .post('/api/quote')
        .send({
          makerAssets: [{
            mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            isCompressed: false,
            isCoreNft: false,
          }],
          takerAssets: [],
          makerSolLamports: 0,
          takerSolLamports: 1_000_000_000,
        })
        .expect(200);

      const data = response.body.data;
      
      // Check display format includes USD
      expect(data.taker.sol.display).to.include('SOL');
      if (data.solPriceUSD) {
        expect(data.taker.sol.usd).to.be.a('number');
      }
    });
  });
});

