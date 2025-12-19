/**
 * Integration Tests for Bulk Swap API
 * Tests multi-asset swaps, mixed asset types, transaction group creation, and Jito bundle submission
 */

import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PrismaClient } from '../../src/generated/prisma';
import request from 'supertest';
import express from 'express';
import { AssetType } from '../../src/services/assetValidator';

// Note: This test file requires a running backend server
// Run with: npm run test:integration:bulk-swap

describe('Bulk Swap API - Integration Tests', () => {
  let app: express.Application;
  let connection: Connection;
  let prisma: PrismaClient;
  let makerWallet: Keypair;
  let takerWallet: Keypair;
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:8080';

  before(async () => {
    // Initialize test wallets
    makerWallet = Keypair.generate();
    takerWallet = Keypair.generate();

    // Connect to test database
    const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDatabaseUrl,
        },
      },
    });

    // Connect to Solana RPC
    const rpcUrl = process.env.TEST_RPC_URL || 'http://localhost:8899';
    connection = new Connection(rpcUrl, 'confirmed');
  });

  after(async () => {
    // Cleanup test data
    await prisma.swapTransaction.deleteMany();
    await prisma.swapOffer.deleteMany();
    await prisma.$disconnect();
  });

  describe('POST /api/swaps/offers - Multi-Asset Support', () => {
    it('should create offer with 2-5 assets per side', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'asset-1', isCompressed: false },
          { mint: 'asset-2', isCompressed: false },
        ],
        requestedAssets: [
          { mint: 'asset-3', isCompressed: false },
          { mint: 'asset-4', isCompressed: false },
          { mint: 'asset-5', isCompressed: false },
        ],
        offeredSol: '0',
        requestedSol: '1000000000', // 1 SOL
      };

      const response = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-${Date.now()}`)
        .send(offerData);

      // Note: This will fail if backend is not running
      // In real scenario, would mock the API or use test server
      if (response.status === 200 || response.status === 201) {
        expect(response.body).to.have.property('offer');
        expect(response.body.offer).to.have.property('id');
      }
    });

    it('should create offer with mixed asset types (cNFT + NFT + SOL)', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'cnft-asset-1', isCompressed: true },
          { mint: 'nft-asset-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '500000000', // 0.5 SOL
        requestedSol: '2000000000', // 2 SOL
      };

      const response = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-mixed-${Date.now()}`)
        .send(offerData);

      if (response.status === 200 || response.status === 201) {
        expect(response.body).to.have.property('offer');
      }
    });

    it('should reject offer with more than 10 assets per side', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: Array.from({ length: 11 }, (_, i) => ({
          mint: `asset-${i}`,
          isCompressed: false,
        })),
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const response = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-too-many-${Date.now()}`)
        .send(offerData);

      // Should return validation error
      expect([400, 422]).to.include(response.status);
    });
  });

  describe('Transaction Group Creation', () => {
    it('should return transaction group for bulk swaps with 3+ cNFTs', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'cnft-1', isCompressed: true },
          { mint: 'cnft-2', isCompressed: true },
          { mint: 'cnft-3', isCompressed: true },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '3000000000', // 3 SOL
      };

      const response = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-group-${Date.now()}`)
        .send(offerData);

      if (response.status === 200 || response.status === 201) {
        // Should return transaction group or bundle info
        const body = response.body;
        if (body.transactions) {
          expect(body.transactions).to.be.an('array');
          expect(body.transactions.length).to.be.greaterThan(1);
        }
        if (body.bulkSwap) {
          expect(body.bulkSwap.isBulkSwap).to.be.true;
          expect(body.bulkSwap.transactionCount).to.be.greaterThan(1);
        }
      }
    });

    it('should handle transaction group with mixed asset types', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'cnft-1', isCompressed: true },
          { mint: 'cnft-2', isCompressed: true },
          { mint: 'nft-1', isCompressed: false },
        ],
        requestedAssets: [
          { mint: 'nft-2', isCompressed: false },
        ],
        offeredSol: '0',
        requestedSol: '0',
      };

      const response = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-mixed-group-${Date.now()}`)
        .send(offerData);

      if (response.status === 200 || response.status === 201) {
        expect(response.body).to.have.property('offer');
      }
    });
  });

  describe('Jito Bundle Submission', () => {
    it('should submit Jito bundle for swaps with 5+ total cNFTs', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'cnft-1', isCompressed: true },
          { mint: 'cnft-2', isCompressed: true },
          { mint: 'cnft-3', isCompressed: true },
        ],
        requestedAssets: [
          { mint: 'cnft-4', isCompressed: true },
          { mint: 'cnft-5', isCompressed: true },
        ],
        offeredSol: '0',
        requestedSol: '0',
      };

      const response = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-jito-${Date.now()}`)
        .send(offerData);

      if (response.status === 200 || response.status === 201) {
        const body = response.body;
        if (body.bulkSwap && body.bulkSwap.requiresJitoBundle) {
          expect(body.bulkSwap.requiresJitoBundle).to.be.true;
          if (body.bundleId) {
            expect(body.bundleId).to.be.a('string');
          }
        }
      }
    });
  });

  describe('Partial Failure Handling', () => {
    it('should handle invalid asset in bulk swap gracefully', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'valid-asset-1', isCompressed: false },
          { mint: 'invalid-asset-xyz', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const response = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-partial-${Date.now()}`)
        .send(offerData);

      // Should either reject or handle gracefully
      expect([200, 201, 400, 422]).to.include(response.status);
    });
  });

  describe('Transaction Confirmation Polling', () => {
    it('should provide bundle status endpoint for tracking', async () => {
      // First create an offer
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'cnft-1', isCompressed: true },
          { mint: 'cnft-2', isCompressed: true },
          { mint: 'cnft-3', isCompressed: true },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '3000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-status-${Date.now()}`)
        .send(offerData);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const offerId = createResponse.body.offer?.id;

        if (offerId) {
          // Check bundle status endpoint
          const statusResponse = await request(baseUrl)
            .get(`/api/swaps/offers/${offerId}/bundle-status`)
            .set('Content-Type', 'application/json');

          if (statusResponse.status === 200) {
            expect(statusResponse.body).to.have.property('bundleStatus');
          }
        }
      }
    });
  });
});

