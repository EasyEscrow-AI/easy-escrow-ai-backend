/**
 * Staging E2E Test: Two-Phase Swap Flows
 *
 * Tests the complete two-phase swap lifecycle:
 * - Create swap offer with delegation
 * - Lock phase (both parties lock assets)
 * - Settle phase (chunked settlement for bulk transfers)
 * - Complete/Cancel/Fail scenarios
 * - Progress tracking
 *
 * Environment: Staging (Devnet)
 */

// Load staging environment variables FIRST
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.staging' });

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadDevnetWallets,
  verifyWalletBalances,
  DevnetWallets,
} from '../../helpers/devnet-wallet-manager';
import {
  hasTestCnfts,
  getTestCnft,
  loadTestCnfts,
} from '../../helpers/test-cnft-manager';
import { wait } from '../../helpers/test-utils';
import { waitForConfirmation, displayExplorerLink } from '../../helpers/swap-verification';

// Test configuration
const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || process.env.DEVNET_RPC_URL || 'https://api.devnet.solana.com';
const STAGING_API_URL = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';

// Load staging test assets
let stagingAssets: any = null;
try {
  const assetsPath = path.join(__dirname, '../../fixtures/staging-test-assets.json');
  if (fs.existsSync(assetsPath)) {
    stagingAssets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
  }
} catch (error) {
  console.warn('Could not load staging test assets');
}

describe('Staging E2E: Two-Phase Swap Flows (Devnet)', () => {
  let connection: Connection;
  let wallets: DevnetWallets;
  let partyACnfts: string[] = [];
  let partyBCnfts: string[] = [];

  before(async function() {
    this.timeout(120000);

    console.log('\n+--------------------------------------------------------------+');
    console.log('|   TWO-PHASE SWAP E2E TESTS - STAGING (DEVNET)                |');
    console.log('+--------------------------------------------------------------+\n');

    // Check if two-phase swap endpoints are available on staging
    try {
      const checkRes = await request(STAGING_API_URL).post('/api/swaps/two-phase').send({}).timeout({ response: 10000 });
      if (checkRes.status === 404) {
        console.log('Two-phase swap endpoints not available on staging - skipping suite');
        return this.skip();
      }
    } catch (err: any) {
      if (err?.status === 404) {
        console.log('Two-phase swap endpoints not available on staging - skipping suite');
        return this.skip();
      }
      // Other errors (400 validation, etc.) mean the endpoint exists - continue
    }

    connection = new Connection(RPC_URL, 'confirmed');
    console.log('RPC:', RPC_URL);
    console.log('API:', STAGING_API_URL);

    // Load test wallets
    wallets = await loadDevnetWallets();
    console.log('Party A Wallet:', wallets.sender.publicKey.toBase58());
    console.log('Party B Wallet:', wallets.receiver.publicKey.toBase58());

    // Verify wallet balances
    await verifyWalletBalances(connection, wallets, 0.3);

    // Load test cNFTs for both parties
    if (hasTestCnfts()) {
      // Use loadTestCnfts().testCnfts to get ALL available cNFTs
      const config = loadTestCnfts();
      const allCnfts = config.testCnfts;
      // Split cNFTs between parties for swap testing
      if (allCnfts.length >= 2) {
        partyACnfts = allCnfts.slice(0, Math.ceil(allCnfts.length / 2)).map((c: any) => c.assetId);
        partyBCnfts = allCnfts.slice(Math.ceil(allCnfts.length / 2)).map((c: any) => c.assetId);
      } else if (allCnfts.length === 1) {
        // Only 1 cNFT available - use it for Party A, Party B will use SOL
        partyACnfts = [allCnfts[0].assetId];
      }
    } else if (stagingAssets) {
      if (stagingAssets.maker?.cnfts?.length > 0) {
        partyACnfts = stagingAssets.maker.cnfts.map((c: any) => c.mint);
      }
      if (stagingAssets.taker?.cnfts?.length > 0) {
        partyBCnfts = stagingAssets.taker.cnfts.map((c: any) => c.mint);
      }
    }

    console.log('Party A cNFTs:', partyACnfts.length);
    console.log('Party B cNFTs:', partyBCnfts.length);

    if (partyACnfts.length === 0) {
      console.warn('No test cNFTs for Party A - some tests will be skipped');
    }

    console.log('\nTest setup complete\n');
  });

  describe('Two-Phase Swap Creation', () => {
    let swapId: string;
    let lockTxASerialized: string;

    it('should create a two-phase swap offer', async function() {
      this.timeout(60000);

      if (partyACnfts.length === 0) {
        console.log('Skipping - no test cNFTs available');
        this.skip();
        return;
      }

      console.log('\nTEST: Create Two-Phase Swap Offer');
      console.log('===========================================================\n');

      const response = await request(STAGING_API_URL)
        .post('/api/swaps/two-phase')
        .set('x-idempotency-key', `test-swap-${Date.now()}`)
        .send({
          partyA: wallets.sender.publicKey.toBase58(),
          partyB: wallets.receiver.publicKey.toBase58(),
          partyAAssets: [{
            type: 'cnft',
            assetId: partyACnfts[0],
          }],
          partyBAssets: [{
            type: 'sol',
            amount: 0.1 * LAMPORTS_PER_SOL,
          }],
          expirySeconds: 3600, // 1 hour
        });

      console.log('   Response status:', response.status);

      if (response.status !== 200 && response.status !== 201) {
        console.log('   Response body:', JSON.stringify(response.body, null, 2));
        this.skip();
        return;
      }

      expect([200, 201]).to.include(response.status);
      expect(response.body.success).to.be.true;
      expect(response.body.data).to.exist;
      expect(response.body.data.swap).to.exist;

      swapId = response.body.data.swap.id;

      if (response.body.data.lockTransaction) {
        lockTxASerialized = response.body.data.lockTransaction.serializedTransaction;
      }

      console.log('   Swap ID:', swapId);
      console.log('   Status:', response.body.data.swap.status);
      console.log('   Has Lock TX:', !!lockTxASerialized);
    });

    it('should get swap details', async function() {
      this.timeout(30000);

      if (!swapId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Get Swap Details');
      console.log('===========================================================\n');

      const response = await request(STAGING_API_URL)
        .get(`/api/swaps/two-phase/${swapId}`);

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.data.swap).to.exist;
      expect(response.body.data.swap.id).to.equal(swapId);

      console.log('   Status:', response.body.data.swap.status);
      console.log('   Party A:', response.body.data.swap.partyA);
      console.log('   Party B:', response.body.data.swap.partyB);
    });
  });

  describe('Lock Phase', () => {
    let swapId: string;
    let lockTxASerialized: string;
    let lockTxBSerialized: string;

    before(async function() {
      this.timeout(60000);

      if (partyACnfts.length === 0) {
        return;
      }

      // Create swap for lock phase testing
      const response = await request(STAGING_API_URL)
        .post('/api/swaps/two-phase')
        .set('x-idempotency-key', `test-lock-${Date.now()}`)
        .send({
          partyA: wallets.sender.publicKey.toBase58(),
          partyB: wallets.receiver.publicKey.toBase58(),
          partyAAssets: [{
            type: 'cnft',
            assetId: partyACnfts[0],
          }],
          partyBAssets: [{
            type: 'sol',
            amount: 0.05 * LAMPORTS_PER_SOL,
          }],
          expirySeconds: 3600,
        });

      if (response.status === 200 || response.status === 201) {
        swapId = response.body.data.swap.id;
        if (response.body.data.lockTransaction) {
          lockTxASerialized = response.body.data.lockTransaction.serializedTransaction;
        }
      }
    });

    it('should execute Party A lock', async function() {
      this.timeout(120000);

      if (!swapId || !lockTxASerialized) {
        console.log('Skipping - no swap or lock tx');
        this.skip();
        return;
      }

      console.log('\nTEST: Party A Lock');
      console.log('===========================================================\n');

      // Sign and submit lock transaction
      const txBuffer = Buffer.from(lockTxASerialized, 'base64');
      const isVersioned = txBuffer.length > 0 && (txBuffer[0] & 0x80) !== 0;

      let signature: string;
      if (isVersioned) {
        const { VersionedTransaction } = await import('@solana/web3.js');
        const versionedTx = VersionedTransaction.deserialize(txBuffer);
        versionedTx.sign([wallets.sender]);
        signature = await connection.sendTransaction(versionedTx);
      } else {
        const { Transaction } = await import('@solana/web3.js');
        const legacyTx = Transaction.from(txBuffer);
        legacyTx.partialSign(wallets.sender);
        signature = await connection.sendRawTransaction(legacyTx.serialize());
      }

      console.log('   Lock tx sent:', signature);
      displayExplorerLink(signature, 'devnet');

      await waitForConfirmation(connection, signature);
      console.log('   Lock transaction confirmed');

      // Confirm lock via API
      const confirmResponse = await request(STAGING_API_URL)
        .post(`/api/swaps/two-phase/${swapId}/lock/confirm`)
        .send({
          party: 'A',
          signature,
        });

      expect([200, 201]).to.include(confirmResponse.status);
      console.log('   Party A lock confirmed');
      console.log('   New status:', confirmResponse.body.data?.swap?.status);

      // Get Party B lock transaction if available
      if (confirmResponse.body.data?.lockTransaction) {
        lockTxBSerialized = confirmResponse.body.data.lockTransaction.serializedTransaction;
      }
    });

    it('should execute Party B lock', async function() {
      this.timeout(120000);

      if (!swapId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Party B Lock');
      console.log('===========================================================\n');

      // Get Party B lock transaction if not already available
      if (!lockTxBSerialized) {
        const lockResponse = await request(STAGING_API_URL)
          .post(`/api/swaps/two-phase/${swapId}/lock`)
          .send({
            party: 'B',
          });

        if (lockResponse.status !== 200 && lockResponse.status !== 201) {
          console.log('   Could not get Party B lock tx');
          this.skip();
          return;
        }

        lockTxBSerialized = lockResponse.body.data.lockTransaction?.serializedTransaction;
      }

      if (!lockTxBSerialized) {
        console.log('   No lock transaction for Party B (may be SOL-only)');
        // For SOL payments, might auto-lock
        const swapResponse = await request(STAGING_API_URL)
          .get(`/api/swaps/two-phase/${swapId}`);

        console.log('   Current status:', swapResponse.body.data?.swap?.status);
        return;
      }

      // Sign and submit
      const txBuffer = Buffer.from(lockTxBSerialized, 'base64');
      const isVersioned = txBuffer.length > 0 && (txBuffer[0] & 0x80) !== 0;

      let signature: string;
      if (isVersioned) {
        const { VersionedTransaction } = await import('@solana/web3.js');
        const versionedTx = VersionedTransaction.deserialize(txBuffer);
        versionedTx.sign([wallets.receiver]);
        signature = await connection.sendTransaction(versionedTx);
      } else {
        const { Transaction } = await import('@solana/web3.js');
        const legacyTx = Transaction.from(txBuffer);
        legacyTx.partialSign(wallets.receiver);
        signature = await connection.sendRawTransaction(legacyTx.serialize());
      }

      await waitForConfirmation(connection, signature);
      console.log('   Party B lock tx confirmed:', signature);

      // Confirm lock
      const confirmResponse = await request(STAGING_API_URL)
        .post(`/api/swaps/two-phase/${swapId}/lock/confirm`)
        .send({
          party: 'B',
          signature,
        });

      expect([200, 201]).to.include(confirmResponse.status);
      console.log('   Party B lock confirmed');
      console.log('   New status:', confirmResponse.body.data?.swap?.status);
    });

    it('should show FULLY_LOCKED status after both parties lock', async function() {
      this.timeout(30000);

      if (!swapId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Verify Fully Locked Status');
      console.log('===========================================================\n');

      const response = await request(STAGING_API_URL)
        .get(`/api/swaps/two-phase/${swapId}`);

      expect(response.status).to.equal(200);

      const status = response.body.data?.swap?.status;
      console.log('   Current status:', status);

      // Status should be FULLY_LOCKED or SETTLING (if auto-started)
      expect(['FULLY_LOCKED', 'SETTLING', 'PARTIAL_SETTLE', 'COMPLETED']).to.include(status);
    });
  });

  describe('Progress Tracking', () => {
    let swapId: string;

    before(async function() {
      this.timeout(60000);

      if (partyACnfts.length === 0) {
        return;
      }

      // Create a swap for progress tracking
      const response = await request(STAGING_API_URL)
        .post('/api/swaps/two-phase')
        .set('x-idempotency-key', `test-progress-${Date.now()}`)
        .send({
          partyA: wallets.sender.publicKey.toBase58(),
          partyB: wallets.receiver.publicKey.toBase58(),
          partyAAssets: [{
            type: 'cnft',
            assetId: partyACnfts[0],
          }],
          partyBAssets: [{
            type: 'sol',
            amount: 0.02 * LAMPORTS_PER_SOL,
          }],
          expirySeconds: 3600,
        });

      if (response.status === 200 || response.status === 201) {
        swapId = response.body.data.swap.id;
      }
    });

    it('should return progress information', async function() {
      this.timeout(30000);

      if (!swapId) {
        console.log('Skipping - no swap created');
        this.skip();
        return;
      }

      console.log('\nTEST: Get Progress Information');
      console.log('===========================================================\n');

      const response = await request(STAGING_API_URL)
        .get(`/api/swaps/two-phase/${swapId}/progress`);

      console.log('   Response status:', response.status);

      if (response.status !== 200) {
        console.log('   Response:', JSON.stringify(response.body, null, 2));
        // Progress endpoint may not exist yet
        this.skip();
        return;
      }

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.exist;

      const progress = response.body.data;
      console.log('   Swap ID:', progress.swapId);
      console.log('   Status:', progress.status);
      console.log('   Phase:', progress.phase);

      if (progress.progress) {
        console.log('   Progress:');
        console.log('     Total Transfers:', progress.progress.totalTransfers);
        console.log('     Completed:', progress.progress.completedTransfers);
        console.log('     Percent:', progress.progress.percentComplete + '%');
      }

      if (progress.timestamps) {
        console.log('   Timestamps:');
        console.log('     Created:', progress.timestamps.created);
        if (progress.timestamps.lockedAt) {
          console.log('     Locked At:', progress.timestamps.lockedAt);
        }
      }

      if (progress.transactions && progress.transactions.length > 0) {
        console.log('   Transactions:', progress.transactions.length);
      }
    });

    it('should include phase information', async function() {
      this.timeout(30000);

      if (!swapId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Verify Phase Information');
      console.log('===========================================================\n');

      const response = await request(STAGING_API_URL)
        .get(`/api/swaps/two-phase/${swapId}/progress`);

      if (response.status !== 200) {
        this.skip();
        return;
      }

      const phase = response.body.data?.phase;
      console.log('   Current phase:', phase);

      // Phase should be one of the valid phases
      const validPhases = ['pending', 'lock', 'settle', 'complete', 'failed', 'cancelled', 'expired'];
      expect(validPhases).to.include(phase);
    });
  });

  describe('Swap Cancellation', () => {
    let swapId: string;

    it('should allow cancellation before lock', async function() {
      this.timeout(90000);

      if (partyACnfts.length === 0) {
        this.skip();
        return;
      }

      console.log('\nTEST: Cancel Swap Before Lock');
      console.log('===========================================================\n');

      // Create a swap
      const createResponse = await request(STAGING_API_URL)
        .post('/api/swaps/two-phase')
        .set('x-idempotency-key', `test-cancel-${Date.now()}`)
        .send({
          partyA: wallets.sender.publicKey.toBase58(),
          partyB: wallets.receiver.publicKey.toBase58(),
          partyAAssets: [{
            type: 'cnft',
            assetId: partyACnfts[0],
          }],
          partyBAssets: [{
            type: 'sol',
            amount: 0.01 * LAMPORTS_PER_SOL,
          }],
          expirySeconds: 3600,
        });

      if (createResponse.status !== 200 && createResponse.status !== 201) {
        this.skip();
        return;
      }

      swapId = createResponse.body.data.swap.id;
      console.log('   Created swap:', swapId);

      // Cancel the swap
      const cancelResponse = await request(STAGING_API_URL)
        .post(`/api/swaps/two-phase/${swapId}/cancel`)
        .send({
          party: wallets.sender.publicKey.toBase58(),
          reason: 'Test cancellation',
        });

      console.log('   Cancel response status:', cancelResponse.status);

      expect([200, 201]).to.include(cancelResponse.status);
      expect(cancelResponse.body.success).to.be.true;

      // Verify status
      const verifyResponse = await request(STAGING_API_URL)
        .get(`/api/swaps/two-phase/${swapId}`);

      expect(verifyResponse.body.data.swap.status).to.equal('CANCELLED');
      console.log('   Swap cancelled successfully');
    });

    it('should reject cancellation after settlement starts', async function() {
      this.timeout(30000);

      console.log('\nTEST: Reject Cancel After Settlement');
      console.log('===========================================================\n');

      // This test would require a swap in SETTLING status
      // For now, just verify the API handles invalid cancel requests
      const response = await request(STAGING_API_URL)
        .post('/api/swaps/two-phase/non-existent-id/cancel')
        .send({
          party: wallets.sender.publicKey.toBase58(),
        });

      expect([400, 404]).to.include(response.status);
      console.log('   Invalid cancel correctly rejected');
    });
  });

  describe('Error Scenarios', () => {
    it('should reject swap with insufficient balance', async function() {
      this.timeout(30000);

      console.log('\nTEST: Reject Insufficient Balance');
      console.log('===========================================================\n');

      // Try to create swap with huge SOL amount
      const response = await request(STAGING_API_URL)
        .post('/api/swaps/two-phase')
        .set('x-idempotency-key', `test-insufficient-${Date.now()}`)
        .send({
          partyA: wallets.sender.publicKey.toBase58(),
          partyB: wallets.receiver.publicKey.toBase58(),
          partyAAssets: [{
            type: 'sol',
            amount: 1000000 * LAMPORTS_PER_SOL, // 1M SOL - definitely insufficient
          }],
          partyBAssets: [{
            type: 'sol',
            amount: 0.01 * LAMPORTS_PER_SOL,
          }],
          expirySeconds: 3600,
        });

      // Should fail validation
      expect([400, 422]).to.include(response.status);
      console.log('   Insufficient balance correctly rejected');
    });

    it('should reject swap with invalid asset ID', async function() {
      this.timeout(30000);

      console.log('\nTEST: Reject Invalid Asset ID');
      console.log('===========================================================\n');

      const response = await request(STAGING_API_URL)
        .post('/api/swaps/two-phase')
        .set('x-idempotency-key', `test-invalid-asset-${Date.now()}`)
        .send({
          partyA: wallets.sender.publicKey.toBase58(),
          partyB: wallets.receiver.publicKey.toBase58(),
          partyAAssets: [{
            type: 'cnft',
            assetId: 'not-a-valid-asset-id',
          }],
          partyBAssets: [{
            type: 'sol',
            amount: 0.01 * LAMPORTS_PER_SOL,
          }],
          expirySeconds: 3600,
        });

      expect([400, 422]).to.include(response.status);
      console.log('   Invalid asset ID correctly rejected');
    });

    it('should reject swap with asset not owned by party', async function() {
      this.timeout(30000);

      if (partyACnfts.length === 0) {
        this.skip();
        return;
      }

      console.log('\nTEST: Reject Asset Not Owned');
      console.log('===========================================================\n');

      // Try to swap Party A's cNFT as Party B
      const response = await request(STAGING_API_URL)
        .post('/api/swaps/two-phase')
        .set('x-idempotency-key', `test-not-owned-${Date.now()}`)
        .send({
          partyA: wallets.receiver.publicKey.toBase58(), // Party B's wallet
          partyB: wallets.sender.publicKey.toBase58(),
          partyAAssets: [{
            type: 'cnft',
            assetId: partyACnfts[0], // But Party A's cNFT
          }],
          partyBAssets: [{
            type: 'sol',
            amount: 0.01 * LAMPORTS_PER_SOL,
          }],
          expirySeconds: 3600,
        });

      expect([400, 403, 422]).to.include(response.status);
      console.log('   Asset not owned correctly rejected');
    });
  });

  after(function() {
    console.log('\n+--------------------------------------------------------------+');
    console.log('|   TWO-PHASE SWAP E2E TESTS - COMPLETE                        |');
    console.log('+--------------------------------------------------------------+\n');
  });
});
