/**
 * Staging E2E Test: Delegation-Based Listing Flows
 *
 * Tests the complete listing lifecycle using delegation:
 * - Create listing with delegation transaction
 * - Confirm listing after seller signs
 * - Cancel listing with delegation revocation
 * - Listing expiry handling
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
  console.warn('⚠️  Could not load staging test assets');
}

describe('🏪 Staging E2E: Delegation-Based Listing Flows (Devnet)', () => {
  let connection: Connection;
  let wallets: DevnetWallets;
  let testCnftAssetId: string;

  before(async function() {
    this.timeout(120000);

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   DELEGATION LISTING E2E TESTS - STAGING (DEVNET)            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);
    console.log('📡 API:', STAGING_API_URL);

    // Load test wallets
    wallets = await loadDevnetWallets();
    console.log('🔑 Seller Wallet:', wallets.sender.publicKey.toBase58());
    console.log('🔑 Buyer Wallet:', wallets.receiver.publicKey.toBase58());

    // Verify wallet balances
    await verifyWalletBalances(connection, wallets, 0.1);

    // Load test cNFT
    if (hasTestCnfts()) {
      const testCnft = getTestCnft(0);
      testCnftAssetId = testCnft?.assetId;
    } else if (stagingAssets?.maker?.cnfts?.length > 0) {
      testCnftAssetId = stagingAssets.maker.cnfts[0].mint;
    }

    if (!testCnftAssetId) {
      console.warn('⚠️  No test cNFTs available - some tests will be skipped');
    } else {
      console.log('🌳 Test cNFT:', testCnftAssetId);
    }

    console.log('\n✅ Test setup complete\n');
  });

  describe('Listing Creation', () => {
    let createdListingId: string;
    let delegationTxSerialized: string;

    it('should create a listing with delegation transaction', async function() {
      this.timeout(60000);

      if (!testCnftAssetId) {
        console.log('⚠️  Skipping - no test cNFT available');
        this.skip();
        return;
      }

      console.log('\n📋 TEST: Create Listing with Delegation');
      console.log('═══════════════════════════════════════════════════════════\n');

      const listingPrice = 0.5 * LAMPORTS_PER_SOL; // 0.5 SOL

      const response = await request(STAGING_API_URL)
        .post('/api/listings')
        .set('x-idempotency-key', `test-listing-${Date.now()}`)
        .send({
          seller: wallets.sender.publicKey.toBase58(),
          assetId: testCnftAssetId,
          priceLamports: listingPrice.toString(),
          durationSeconds: 3600, // 1 hour
        });

      console.log('   Response status:', response.status);

      if (response.status !== 200 && response.status !== 201) {
        console.log('   Response body:', JSON.stringify(response.body, null, 2));
      }

      expect([200, 201]).to.include(response.status);
      expect(response.body.success).to.be.true;
      expect(response.body.data).to.exist;
      expect(response.body.data.listing).to.exist;
      expect(response.body.data.transaction).to.exist;

      createdListingId = response.body.data.listing.listingId;
      delegationTxSerialized = response.body.data.transaction.serializedTransaction;

      console.log('   ✅ Listing created:', createdListingId);
      console.log('   Status:', response.body.data.listing.status);
      console.log('   Delegation Status:', response.body.data.listing.delegationStatus);
      console.log('   Price:', response.body.data.listing.priceLamports, 'lamports');
      console.log('   Platform Fee:', response.body.data.fees.platformFeeLamports, 'lamports');
      console.log('   Seller Receives:', response.body.data.fees.sellerReceivesLamports, 'lamports');
    });

    it('should confirm listing after seller signs delegation transaction', async function() {
      this.timeout(120000);

      if (!createdListingId || !delegationTxSerialized) {
        console.log('⚠️  Skipping - no listing created in previous test');
        this.skip();
        return;
      }

      console.log('\n📋 TEST: Confirm Listing (Sign Delegation)');
      console.log('═══════════════════════════════════════════════════════════\n');

      // Deserialize and sign the delegation transaction
      const txBuffer = Buffer.from(delegationTxSerialized, 'base64');

      // Check if versioned transaction
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

      console.log('   Delegation tx sent:', signature);
      displayExplorerLink(signature, 'devnet');

      // Wait for confirmation
      await waitForConfirmation(connection, signature);
      console.log('   ✅ Delegation transaction confirmed');

      // Confirm listing via API
      const confirmResponse = await request(STAGING_API_URL)
        .post(`/api/listings/${createdListingId}/confirm`)
        .send({
          signature: signature,
        });

      console.log('   Confirm response status:', confirmResponse.status);

      expect([200, 201]).to.include(confirmResponse.status);
      expect(confirmResponse.body.success).to.be.true;
      expect(confirmResponse.body.data.listing.status).to.equal('ACTIVE');
      expect(confirmResponse.body.data.listing.delegationStatus).to.equal('CONFIRMED');

      console.log('   ✅ Listing confirmed and active');
    });

    it('should retrieve listing details', async function() {
      this.timeout(30000);

      if (!createdListingId) {
        console.log('⚠️  Skipping - no listing created');
        this.skip();
        return;
      }

      console.log('\n📋 TEST: Get Listing Details');
      console.log('═══════════════════════════════════════════════════════════\n');

      const response = await request(STAGING_API_URL)
        .get(`/api/listings/${createdListingId}`);

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.data.listing).to.exist;
      expect(response.body.data.listing.listingId).to.equal(createdListingId);

      console.log('   ✅ Listing retrieved successfully');
      console.log('   Listing ID:', response.body.data.listing.listingId);
      console.log('   Status:', response.body.data.listing.status);
      console.log('   Asset ID:', response.body.data.listing.assetId);
    });

    it('should cancel listing and revoke delegation', async function() {
      this.timeout(120000);

      if (!createdListingId) {
        console.log('⚠️  Skipping - no listing created');
        this.skip();
        return;
      }

      console.log('\n📋 TEST: Cancel Listing');
      console.log('═══════════════════════════════════════════════════════════\n');

      const response = await request(STAGING_API_URL)
        .delete(`/api/listings/${createdListingId}`)
        .send({
          seller: wallets.sender.publicKey.toBase58(),
        });

      console.log('   Cancel response status:', response.status);

      // Cancel may return transaction to sign, or succeed directly
      expect([200, 201]).to.include(response.status);
      expect(response.body.success).to.be.true;

      if (response.body.data.transaction) {
        // Need to sign revocation transaction
        const revokeTxSerialized = response.body.data.transaction.serializedTransaction;
        const txBuffer = Buffer.from(revokeTxSerialized, 'base64');

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

        await waitForConfirmation(connection, signature);
        console.log('   ✅ Revocation transaction confirmed:', signature);
      }

      console.log('   ✅ Listing cancelled successfully');
    });
  });

  describe('Listing Validation', () => {
    it('should reject listing with invalid asset ID', async function() {
      this.timeout(30000);

      console.log('\n📋 TEST: Reject Invalid Asset ID');
      console.log('═══════════════════════════════════════════════════════════\n');

      const response = await request(STAGING_API_URL)
        .post('/api/listings')
        .set('x-idempotency-key', `test-invalid-${Date.now()}`)
        .send({
          seller: wallets.sender.publicKey.toBase58(),
          assetId: 'invalid-asset-id',
          priceLamports: (0.5 * LAMPORTS_PER_SOL).toString(),
        });

      expect([400, 422]).to.include(response.status);
      console.log('   ✅ Invalid asset correctly rejected');
    });

    it('should reject listing with zero price', async function() {
      this.timeout(30000);

      if (!testCnftAssetId) {
        this.skip();
        return;
      }

      console.log('\n📋 TEST: Reject Zero Price');
      console.log('═══════════════════════════════════════════════════════════\n');

      const response = await request(STAGING_API_URL)
        .post('/api/listings')
        .set('x-idempotency-key', `test-zero-price-${Date.now()}`)
        .send({
          seller: wallets.sender.publicKey.toBase58(),
          assetId: testCnftAssetId,
          priceLamports: '0',
        });

      expect([400, 422]).to.include(response.status);
      console.log('   ✅ Zero price correctly rejected');
    });

    it('should reject duplicate listing for same asset', async function() {
      this.timeout(60000);

      if (!testCnftAssetId) {
        this.skip();
        return;
      }

      console.log('\n📋 TEST: Reject Duplicate Listing');
      console.log('═══════════════════════════════════════════════════════════\n');

      // Create first listing
      const firstResponse = await request(STAGING_API_URL)
        .post('/api/listings')
        .set('x-idempotency-key', `test-dup-1-${Date.now()}`)
        .send({
          seller: wallets.sender.publicKey.toBase58(),
          assetId: testCnftAssetId,
          priceLamports: (0.5 * LAMPORTS_PER_SOL).toString(),
        });

      if (firstResponse.status !== 200 && firstResponse.status !== 201) {
        console.log('   First listing failed - asset may already be listed');
        this.skip();
        return;
      }

      // Try to create duplicate listing
      const dupResponse = await request(STAGING_API_URL)
        .post('/api/listings')
        .set('x-idempotency-key', `test-dup-2-${Date.now()}`)
        .send({
          seller: wallets.sender.publicKey.toBase58(),
          assetId: testCnftAssetId,
          priceLamports: (0.6 * LAMPORTS_PER_SOL).toString(),
        });

      expect([400, 409, 422]).to.include(dupResponse.status);
      console.log('   ✅ Duplicate listing correctly rejected');

      // Cleanup - cancel the first listing
      if (firstResponse.body.data?.listing?.listingId) {
        await request(STAGING_API_URL)
          .delete(`/api/listings/${firstResponse.body.data.listing.listingId}`)
          .send({ seller: wallets.sender.publicKey.toBase58() });
      }
    });
  });

  after(function() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   DELEGATION LISTING E2E TESTS - COMPLETE                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
  });
});
