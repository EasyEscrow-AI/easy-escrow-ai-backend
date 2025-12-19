/**
 * Integration Tests for Atomic Swap API Endpoints
 * Tests HTTP API with supertest
 */

import { expect } from 'chai';
import request from 'supertest';
import { Keypair } from '@solana/web3.js';
import { PrismaClient } from '../../src/generated/prisma';
import app from '../../src/index';

describe('Atomic Swap API - Integration Tests', () => {
  let prisma: PrismaClient;
  let testMakerWallet: string;
  let testTakerWallet: string;
  let createdOfferId: number;
  
  before(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
        },
      },
    });
    
    // Generate test wallets
    testMakerWallet = Keypair.generate().publicKey.toBase58();
    testTakerWallet = Keypair.generate().publicKey.toBase58();
    
    // Clean up any existing test data
    await prisma.swapTransaction.deleteMany();
    await prisma.swapOffer.deleteMany();
  });
  
  after(async () => {
    // Cleanup
    await prisma.swapTransaction.deleteMany();
    await prisma.swapOffer.deleteMany();
    await prisma.$disconnect();
  });
  
  describe('POST /api/swaps/offers - Create Offer', () => {
    it('should create a new direct offer', async () => {
      const response = await request(app)
        .post('/api/swaps/offers')
        .send({
          makerWallet: testMakerWallet,
          takerWallet: testTakerWallet,
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: '100000000', // 0.1 SOL
          requestedSolLamports: '50000000', // 0.05 SOL
        })
        .expect(201);
      
      expect(response.body).to.have.property('id');
      expect(response.body).to.have.property('status', 'ACTIVE');
      expect(response.body).to.have.property('makerWallet', testMakerWallet);
      expect(response.body).to.have.property('takerWallet', testTakerWallet);
      expect(response.body).to.have.property('serializedTransaction');
      expect(response.body).to.have.property('platformFeeLamports');
      expect(response.body).to.have.property('expiresAt');
      
      createdOfferId = response.body.id;
    });
    
    it('should create an open offer (no taker)', async () => {
      const response = await request(app)
        .post('/api/swaps/offers')
        .send({
          makerWallet: testMakerWallet,
          // No takerWallet
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: '200000000', // 0.2 SOL
          requestedSolLamports: '0',
        })
        .expect(201);
      
      expect(response.body).to.have.property('id');
      expect(response.body.takerWallet).to.be.null;
      expect(response.body.serializedTransaction).to.be.null;
    });
    
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/swaps/offers')
        .send({
          // Missing makerWallet
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: '0',
          requestedSolLamports: '0',
        })
        .expect(400);
      
      expect(response.body).to.have.property('error');
    });
    
    it('should validate wallet addresses', async () => {
      const response = await request(app)
        .post('/api/swaps/offers')
        .send({
          makerWallet: 'invalid-address',
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: '0',
          requestedSolLamports: '0',
        })
        .expect(400);
      
      expect(response.body).to.have.property('error');
      expect(response.body.error).to.include('Invalid wallet address');
    });
    
    it('should validate asset structure', async () => {
      const response = await request(app)
        .post('/api/swaps/offers')
        .send({
          makerWallet: testMakerWallet,
          offeredAssets: [
            {
              // Missing required fields
              amount: 1,
            },
          ],
          requestedAssets: [],
          offeredSolLamports: '0',
          requestedSolLamports: '0',
        })
        .expect(400);
      
      expect(response.body).to.have.property('error');
    });
  });
  
  describe('GET /api/swaps/offers - List Offers', () => {
    it('should list all offers', async () => {
      const response = await request(app)
        .get('/api/swaps/offers')
        .expect(200);
      
      expect(response.body).to.have.property('offers');
      expect(response.body).to.have.property('total');
      expect(response.body).to.have.property('limit');
      expect(response.body).to.have.property('offset');
      expect(response.body.offers).to.be.an('array');
    });
    
    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/swaps/offers')
        .query({ status: 'ACTIVE' })
        .expect(200);
      
      expect(response.body.offers).to.be.an('array');
      response.body.offers.forEach((offer: any) => {
        expect(offer.status).to.equal('ACTIVE');
      });
    });
    
    it('should filter by maker wallet', async () => {
      const response = await request(app)
        .get('/api/swaps/offers')
        .query({ makerWallet: testMakerWallet })
        .expect(200);
      
      expect(response.body.offers).to.be.an('array');
      response.body.offers.forEach((offer: any) => {
        expect(offer.makerWallet).to.equal(testMakerWallet);
      });
    });
    
    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/swaps/offers')
        .query({ limit: 5, offset: 0 })
        .expect(200);
      
      expect(response.body.offers).to.have.lengthOf.at.most(5);
      expect(response.body.limit).to.equal(5);
      expect(response.body.offset).to.equal(0);
    });
  });
  
  describe('GET /api/swaps/offers/:id - Get Offer Details', () => {
    it('should get offer by ID', async () => {
      const response = await request(app)
        .get(`/api/swaps/offers/${createdOfferId}`)
        .expect(200);
      
      expect(response.body).to.have.property('id', createdOfferId);
      expect(response.body).to.have.property('status');
      expect(response.body).to.have.property('makerWallet');
      expect(response.body).to.have.property('offeredAssets');
      expect(response.body).to.have.property('requestedAssets');
    });
    
    it('should return 404 for non-existent offer', async () => {
      const response = await request(app)
        .get('/api/swaps/offers/99999999')
        .expect(404);
      
      expect(response.body).to.have.property('error');
    });
  });
  
  describe('POST /api/swaps/offers/:id/counter - Create Counter-Offer', () => {
    let parentOfferId: number;
    
    before(async () => {
      // Create a parent offer
      const parentResponse = await request(app)
        .post('/api/swaps/offers')
        .send({
          makerWallet: testMakerWallet,
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: '300000000',
          requestedSolLamports: '100000000',
        })
        .expect(201);
      
      parentOfferId = parentResponse.body.id;
    });
    
    it('should create a counter-offer', async () => {
      const counterMaker = Keypair.generate().publicKey.toBase58();
      
      const response = await request(app)
        .post(`/api/swaps/offers/${parentOfferId}/counter`)
        .send({
          counterMakerWallet: counterMaker,
        })
        .expect(201);
      
      expect(response.body).to.have.property('id');
      expect(response.body).to.have.property('offerType', 'COUNTER');
      expect(response.body).to.have.property('parentOfferId', parentOfferId);
      expect(response.body.makerWallet).to.equal(counterMaker);
    });
    
    it('should reject counter-offer for non-existent parent', async () => {
      const response = await request(app)
        .post('/api/swaps/offers/99999999/counter')
        .send({
          counterMakerWallet: Keypair.generate().publicKey.toBase58(),
        })
        .expect(404);
      
      expect(response.body).to.have.property('error');
    });
  });
  
  describe('POST /api/swaps/offers/:id/accept - Accept Offer', () => {
    let openOfferId: number;
    
    before(async () => {
      // Create an open offer
      const openResponse = await request(app)
        .post('/api/swaps/offers')
        .send({
          makerWallet: testMakerWallet,
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: '150000000',
          requestedSolLamports: '0',
        })
        .expect(201);
      
      openOfferId = openResponse.body.id;
    });
    
    it('should accept an open offer', async () => {
      const newTaker = Keypair.generate().publicKey.toBase58();
      
      const response = await request(app)
        .post(`/api/swaps/offers/${openOfferId}/accept`)
        .send({
          takerWallet: newTaker,
        })
        .expect(200);
      
      expect(response.body).to.have.property('serializedTransaction');
      expect(response.body.serializedTransaction).to.be.a('string');
    });
    
    it('should reject acceptance by unauthorized taker', async () => {
      const wrongTaker = Keypair.generate().publicKey.toBase58();
      
      const response = await request(app)
        .post(`/api/swaps/offers/${createdOfferId}/accept`)
        .send({
          takerWallet: wrongTaker, // Not the designated taker
        })
        .expect(403);
      
      expect(response.body).to.have.property('error');
    });
  });
  
  describe('POST /api/swaps/offers/:id/cancel - Cancel Offer', () => {
    let cancelOfferId: number;
    
    before(async () => {
      // Create an offer to cancel
      const cancelResponse = await request(app)
        .post('/api/swaps/offers')
        .send({
          makerWallet: testMakerWallet,
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: '50000000',
          requestedSolLamports: '0',
        })
        .expect(201);
      
      cancelOfferId = cancelResponse.body.id;
    });
    
    it('should cancel an offer', async () => {
      const response = await request(app)
        .post(`/api/swaps/offers/${cancelOfferId}/cancel`)
        .send({
          walletAddress: testMakerWallet,
        })
        .expect(200);
      
      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('cancelled');
    });
    
    it('should reject cancellation by non-maker', async () => {
      const response = await request(app)
        .post(`/api/swaps/offers/${createdOfferId}/cancel`)
        .send({
          walletAddress: Keypair.generate().publicKey.toBase58(), // Not the maker
        })
        .expect(403);
      
      expect(response.body).to.have.property('error');
    });
    
    it('should reject cancellation of already cancelled offer', async () => {
      const response = await request(app)
        .post(`/api/swaps/offers/${cancelOfferId}/cancel`)
        .send({
          walletAddress: testMakerWallet,
        })
        .expect(400);
      
      expect(response.body).to.have.property('error');
      expect(response.body.error).to.include('not active');
    });
  });
  
  describe('POST /api/swaps/offers/:id/confirm - Confirm Swap', () => {
    it('should require valid signature', async () => {
      const response = await request(app)
        .post(`/api/swaps/offers/${createdOfferId}/confirm`)
        .send({
          signature: 'invalid-signature',
        })
        .expect(400);
      
      expect(response.body).to.have.property('error');
    });
    
    it('should reject confirmation for non-existent offer', async () => {
      const response = await request(app)
        .post('/api/swaps/offers/99999999/confirm')
        .send({
          signature: 'valid-but-nonexistent-signature',
        })
        .expect(404);
      
      expect(response.body).to.have.property('error');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/swaps/offers')
        .send('not valid json')
        .set('Content-Type', 'application/json')
        .expect(400);
      
      expect(response.body).to.have.property('error');
    });
    
    it('should handle server errors gracefully', async () => {
      // Test with extremely large values that might cause overflow
      const response = await request(app)
        .post('/api/swaps/offers')
        .send({
          makerWallet: testMakerWallet,
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: '999999999999999999999999', // Too large
          requestedSolLamports: '0',
        })
        .expect((res) => {
          expect(res.status).to.be.oneOf([400, 422, 500]);
        });
    });
  });
  
  describe('Rate Limiting (if implemented)', () => {
    it('should handle too many requests', async function () {
      this.timeout(10000);
      
      // Make many requests quickly
      const requests = Array.from({ length: 100 }, () =>
        request(app)
          .get('/api/swaps/offers')
          .then((res) => res.status)
      );
      
      const results = await Promise.all(requests);
      
      // Some requests should succeed
      expect(results.some((status) => status === 200)).to.be.true;
      
      // If rate limiting is enabled, some might fail with 429
      // This test is flexible to allow for both scenarios
    });
  });
});

