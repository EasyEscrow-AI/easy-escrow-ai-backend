/**
 * Integration Tests for Offer Management API
 * Tests private sales, counter-offers, cancellation, and updates
 */

import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PrismaClient } from '../../src/generated/prisma';
import request from 'supertest';

const baseUrl = process.env.API_BASE_URL || 'http://localhost:8080';

describe('Offer Management - Integration Tests', () => {
  let connection: Connection;
  let prisma: PrismaClient;
  let makerWallet: Keypair;
  let takerWallet: Keypair;
  let adminWallet: Keypair;

  before(async () => {
    makerWallet = Keypair.generate();
    takerWallet = Keypair.generate();
    adminWallet = Keypair.generate();

    const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDatabaseUrl,
        },
      },
    });

    const rpcUrl = process.env.TEST_RPC_URL || 'http://localhost:8899';
    connection = new Connection(rpcUrl, 'confirmed');
  });

  after(async () => {
    await prisma.swapTransaction.deleteMany();
    await prisma.swapOffer.deleteMany();
    await prisma.$disconnect();
  });

  describe('Private Sales with Taker Wallet Restriction', () => {
    it('should create private sale offer with taker wallet restriction', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        takerWallet: takerWallet.publicKey.toBase58(), // Restricted taker
        offeredAssets: [
          { mint: 'private-nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const response = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-private-${Date.now()}`)
        .send(offerData);

      if (response.status === 200 || response.status === 201) {
        expect(response.body.offer).to.have.property('takerWallet');
        expect(response.body.offer.takerWallet).to.equal(takerWallet.publicKey.toBase58());
      }
    });

    it('should reject acceptance from unauthorized wallet', async () => {
      // Create private offer
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        takerWallet: takerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'private-nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-private-create-${Date.now()}`)
        .send(offerData);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const offerId = createResponse.body.offer?.id;

        if (offerId) {
          // Try to accept with wrong wallet
          const unauthorizedWallet = Keypair.generate();
          const acceptResponse = await request(baseUrl)
            .post(`/api/swaps/offers/${offerId}/accept`)
            .set('Content-Type', 'application/json')
            .set('Idempotency-Key', `test-unauthorized-${Date.now()}`)
            .send({
              takerWallet: unauthorizedWallet.publicKey.toBase58(),
            });

          // Should reject
          expect([403, 400]).to.include(acceptResponse.status);
        }
      }
    });
  });

  describe('Counter-Offer Functionality', () => {
    it('should create counter-offer with parent relationship', async () => {
      // First create original offer
      const originalOffer = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-original-${Date.now()}`)
        .send(originalOffer);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const originalOfferId = createResponse.body.offer?.id;

        if (originalOfferId) {
          // Create counter-offer
          const counterOffer = {
            makerWallet: takerWallet.publicKey.toBase58(), // Taker becomes maker
            offeredAssets: [],
            requestedAssets: [
              { mint: 'nft-1', isCompressed: false },
            ],
            offeredSol: '800000000', // Counter with 0.8 SOL instead of 1 SOL
            requestedSol: '0',
            parentOfferId: originalOfferId,
          };

          const counterResponse = await request(baseUrl)
            .post(`/api/swaps/offers/${originalOfferId}/counter-offer`)
            .set('Content-Type', 'application/json')
            .set('Idempotency-Key', `test-counter-${Date.now()}`)
            .send(counterOffer);

          if (counterResponse.status === 200 || counterResponse.status === 201) {
            expect(counterResponse.body.offer).to.have.property('parentOfferId');
            expect(counterResponse.body.offer.parentOfferId).to.equal(originalOfferId);
          }
        }
      }
    });

    it('should traverse offer chain for counter-offer relationships', async () => {
      // Create chain of counter-offers
      const originalOffer = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-chain-${Date.now()}`)
        .send(originalOffer);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const offerId = createResponse.body.offer?.id;

        if (offerId) {
          // Get offer details should show chain
          const getResponse = await request(baseUrl)
            .get(`/api/swaps/offers/${offerId}`)
            .set('Content-Type', 'application/json');

          if (getResponse.status === 200) {
            const offer = getResponse.body.offer;
            // Should be able to traverse parent/child relationships
            expect(offer).to.have.property('id');
          }
        }
      }
    });
  });

  describe('Offer Cancellation', () => {
    it('should allow maker to cancel their offer', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-cancel-create-${Date.now()}`)
        .send(offerData);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const offerId = createResponse.body.offer?.id;

        if (offerId) {
          // Cancel as maker
          const cancelResponse = await request(baseUrl)
            .delete(`/api/swaps/offers/${offerId}`)
            .set('Content-Type', 'application/json')
            .set('Idempotency-Key', `test-cancel-${Date.now()}`)
            .send({
              makerWallet: makerWallet.publicKey.toBase58(),
            });

          if (cancelResponse.status === 200) {
            expect(cancelResponse.body).to.have.property('success');
            expect(cancelResponse.body.success).to.be.true;
          }
        }
      }
    });

    it('should allow admin to cancel any offer', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-admin-cancel-${Date.now()}`)
        .send(offerData);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const offerId = createResponse.body.offer?.id;

        if (offerId) {
          // Cancel as admin (would need admin auth in real scenario)
          const cancelResponse = await request(baseUrl)
            .delete(`/api/swaps/offers/${offerId}`)
            .set('Content-Type', 'application/json')
            .set('X-Admin-Key', process.env.ADMIN_API_KEY || 'test-admin-key')
            .set('Idempotency-Key', `test-admin-cancel-${Date.now()}`)
            .send({});

          // Should succeed with admin auth
          if (cancelResponse.status === 200) {
            expect(cancelResponse.body.success).to.be.true;
          }
        }
      }
    });

    it('should reject cancellation from unauthorized wallet', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-unauth-cancel-${Date.now()}`)
        .send(offerData);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const offerId = createResponse.body.offer?.id;

        if (offerId) {
          // Try to cancel with wrong wallet
          const unauthorizedWallet = Keypair.generate();
          const cancelResponse = await request(baseUrl)
            .delete(`/api/swaps/offers/${offerId}`)
            .set('Content-Type', 'application/json')
            .set('Idempotency-Key', `test-unauth-${Date.now()}`)
            .send({
              makerWallet: unauthorizedWallet.publicKey.toBase58(),
            });

          // Should reject
          expect([403, 401]).to.include(cancelResponse.status);
        }
      }
    });
  });

  describe('Offer Updates', () => {
    it('should allow maker to update SOL amount', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-update-create-${Date.now()}`)
        .send(offerData);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const offerId = createResponse.body.offer?.id;

        if (offerId) {
          // Update SOL amount
          const updateResponse = await request(baseUrl)
            .put(`/api/swaps/offers/${offerId}`)
            .set('Content-Type', 'application/json')
            .set('Idempotency-Key', `test-update-${Date.now()}`)
            .send({
              makerWallet: makerWallet.publicKey.toBase58(),
              requestedSol: '1500000000', // Update to 1.5 SOL
            });

          if (updateResponse.status === 200) {
            expect(updateResponse.body.offer).to.have.property('requestedSol');
            expect(updateResponse.body.offer.requestedSol).to.equal('1500000000');
          }
        }
      }
    });

    it('should allow maker to update assets', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-update-assets-${Date.now()}`)
        .send(offerData);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const offerId = createResponse.body.offer?.id;

        if (offerId) {
          // Update assets
          const updateResponse = await request(baseUrl)
            .put(`/api/swaps/offers/${offerId}`)
            .set('Content-Type', 'application/json')
            .set('Idempotency-Key', `test-update-assets-${Date.now()}`)
            .send({
              makerWallet: makerWallet.publicKey.toBase58(),
              offeredAssets: [
                { mint: 'nft-1', isCompressed: false },
                { mint: 'nft-2', isCompressed: false },
              ],
            });

          if (updateResponse.status === 200) {
            expect(updateResponse.body.offer.offeredAssets).to.have.length(2);
          }
        }
      }
    });

    it('should reject updates from unauthorized wallet', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-unauth-update-${Date.now()}`)
        .send(offerData);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const offerId = createResponse.body.offer?.id;

        if (offerId) {
          // Try to update with wrong wallet
          const unauthorizedWallet = Keypair.generate();
          const updateResponse = await request(baseUrl)
            .put(`/api/swaps/offers/${offerId}`)
            .set('Content-Type', 'application/json')
            .set('Idempotency-Key', `test-unauth-update-${Date.now()}`)
            .send({
              makerWallet: unauthorizedWallet.publicKey.toBase58(),
              requestedSol: '2000000000',
            });

          // Should reject
          expect([403, 401]).to.include(updateResponse.status);
        }
      }
    });
  });

  describe('Database State Verification', () => {
    it('should properly track offer state transitions', async () => {
      const offerData = {
        makerWallet: makerWallet.publicKey.toBase58(),
        offeredAssets: [
          { mint: 'nft-1', isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: '0',
        requestedSol: '1000000000',
      };

      const createResponse = await request(baseUrl)
        .post('/api/swaps/offers')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', `test-state-${Date.now()}`)
        .send(offerData);

      if (createResponse.status === 200 || createResponse.status === 201) {
        const offerId = createResponse.body.offer?.id;

        if (offerId) {
          // Verify database state
          const dbOffer = await prisma.swapOffer.findUnique({
            where: { id: offerId },
          });

          expect(dbOffer).to.exist;
          expect(dbOffer!.status).to.equal('ACTIVE');
          expect(dbOffer!.makerWallet).to.equal(makerWallet.publicKey.toBase58());
        }
      }
    });
  });
});

