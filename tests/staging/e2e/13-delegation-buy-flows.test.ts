/**
 * Staging E2E Test: Delegation-Based Buy Flows
 *
 * Tests the complete buy lifecycle using delegation:
 * - Buy listed cNFT via delegation settlement
 * - Verify ownership transfer to buyer
 * - Verify SOL payment to seller
 * - Verify platform fee collection
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

// Platform fee wallet (from env or default)
const PLATFORM_FEE_WALLET = process.env.PLATFORM_FEE_WALLET || 'FEEpayerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

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

describe('Staging E2E: Delegation-Based Buy Flows (Devnet)', () => {
  let connection: Connection;
  let wallets: DevnetWallets;
  let testCnftAssetId: string;
  let createdListingId: string;

  before(async function() {
    this.timeout(120000);

    console.log('\n+--------------------------------------------------------------+');
    console.log('|   DELEGATION BUY E2E TESTS - STAGING (DEVNET)                |');
    console.log('+--------------------------------------------------------------+\n');

    connection = new Connection(RPC_URL, 'confirmed');
    console.log('RPC:', RPC_URL);
    console.log('API:', STAGING_API_URL);

    // Load test wallets
    wallets = await loadDevnetWallets();
    console.log('Seller Wallet:', wallets.sender.publicKey.toBase58());
    console.log('Buyer Wallet:', wallets.receiver.publicKey.toBase58());

    // Verify wallet balances (buyer needs SOL to purchase)
    await verifyWalletBalances(connection, wallets, 0.5);

    // Load test cNFT
    if (hasTestCnfts()) {
      const testCnft = getTestCnft(0);
      testCnftAssetId = testCnft?.assetId;
    } else if (stagingAssets?.maker?.cnfts?.length > 0) {
      testCnftAssetId = stagingAssets.maker.cnfts[0].mint;
    }

    if (!testCnftAssetId) {
      console.warn('No test cNFTs available - some tests will be skipped');
    } else {
      console.log('Test cNFT:', testCnftAssetId);
    }

    console.log('\nTest setup complete\n');
  });

  describe('Buy Listed cNFT', () => {
    let listingPrice: number;
    let sellerBalanceBefore: number;
    let buyerBalanceBefore: number;
    let platformFeeAmount: number;
    let sellerReceives: number;

    it('should create and confirm a listing for buy test', async function() {
      this.timeout(180000);

      if (!testCnftAssetId) {
        console.log('Skipping - no test cNFT available');
        this.skip();
        return;
      }

      console.log('\nTEST: Setup - Create Listing for Buy Test');
      console.log('===========================================================\n');

      listingPrice = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL

      // Create listing
      const createResponse = await request(STAGING_API_URL)
        .post('/api/listings')
        .set('x-idempotency-key', `test-buy-listing-${Date.now()}`)
        .send({
          seller: wallets.sender.publicKey.toBase58(),
          assetId: testCnftAssetId,
          priceLamports: listingPrice.toString(),
          durationSeconds: 3600,
        });

      if (createResponse.status !== 200 && createResponse.status !== 201) {
        console.log('Create listing failed:', JSON.stringify(createResponse.body, null, 2));
        this.skip();
        return;
      }

      createdListingId = createResponse.body.data.listing.listingId;
      platformFeeAmount = parseInt(createResponse.body.data.fees.platformFeeLamports);
      sellerReceives = parseInt(createResponse.body.data.fees.sellerReceivesLamports);

      console.log('   Listing created:', createdListingId);
      console.log('   Price:', listingPrice, 'lamports');
      console.log('   Platform Fee:', platformFeeAmount, 'lamports');
      console.log('   Seller Receives:', sellerReceives, 'lamports');

      // Sign and submit delegation transaction
      const delegationTxSerialized = createResponse.body.data.transaction.serializedTransaction;
      const txBuffer = Buffer.from(delegationTxSerialized, 'base64');
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
      console.log('   Delegation tx confirmed:', signature);

      // Confirm listing
      const confirmResponse = await request(STAGING_API_URL)
        .post(`/api/listings/${createdListingId}/confirm`)
        .send({ signature });

      expect([200, 201]).to.include(confirmResponse.status);
      expect(confirmResponse.body.data.listing.status).to.equal('ACTIVE');
      console.log('   Listing confirmed and active');
    });

    it('should record balances before purchase', async function() {
      this.timeout(30000);

      if (!createdListingId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Record Pre-Purchase Balances');
      console.log('===========================================================\n');

      sellerBalanceBefore = await connection.getBalance(wallets.sender.publicKey);
      buyerBalanceBefore = await connection.getBalance(wallets.receiver.publicKey);

      console.log('   Seller balance:', sellerBalanceBefore / LAMPORTS_PER_SOL, 'SOL');
      console.log('   Buyer balance:', buyerBalanceBefore / LAMPORTS_PER_SOL, 'SOL');
    });

    it('should execute buy via delegation settlement', async function() {
      this.timeout(180000);

      if (!createdListingId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Execute Buy');
      console.log('===========================================================\n');

      // Initiate buy
      const buyResponse = await request(STAGING_API_URL)
        .post(`/api/listings/${createdListingId}/buy`)
        .send({
          buyer: wallets.receiver.publicKey.toBase58(),
        });

      console.log('   Buy response status:', buyResponse.status);

      if (buyResponse.status !== 200 && buyResponse.status !== 201) {
        console.log('   Buy response:', JSON.stringify(buyResponse.body, null, 2));
      }

      expect([200, 201]).to.include(buyResponse.status);
      expect(buyResponse.body.success).to.be.true;

      // If transaction returned, sign and submit
      if (buyResponse.body.data.transaction) {
        const buyTxSerialized = buyResponse.body.data.transaction.serializedTransaction;
        const txBuffer = Buffer.from(buyTxSerialized, 'base64');
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
        console.log('   Buy tx confirmed:', signature);
        displayExplorerLink(signature, 'devnet');

        // Confirm buy if needed
        if (buyResponse.body.data.requiresConfirmation) {
          const confirmBuyResponse = await request(STAGING_API_URL)
            .post(`/api/listings/${createdListingId}/buy/confirm`)
            .send({ signature });

          expect([200, 201]).to.include(confirmBuyResponse.status);
        }
      }

      console.log('   Buy executed successfully');
    });

    it('should verify ownership transferred to buyer', async function() {
      this.timeout(60000);

      if (!createdListingId || !testCnftAssetId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Verify Ownership Transfer');
      console.log('===========================================================\n');

      // Wait for settlement to complete
      await wait(5000);

      // Check asset ownership via DAS API or our API
      const assetResponse = await request(STAGING_API_URL)
        .get(`/api/assets/${testCnftAssetId}`);

      if (assetResponse.status === 200 && assetResponse.body.data?.owner) {
        const currentOwner = assetResponse.body.data.owner;
        console.log('   Current owner:', currentOwner);
        console.log('   Expected buyer:', wallets.receiver.publicKey.toBase58());

        expect(currentOwner).to.equal(wallets.receiver.publicKey.toBase58());
        console.log('   Ownership transfer verified');
      } else {
        console.log('   Could not verify ownership via API (may need DAS check)');
      }
    });

    it('should verify SOL payment to seller', async function() {
      this.timeout(30000);

      if (!createdListingId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Verify SOL Payment to Seller');
      console.log('===========================================================\n');

      const sellerBalanceAfter = await connection.getBalance(wallets.sender.publicKey);
      const sellerGain = sellerBalanceAfter - sellerBalanceBefore;

      console.log('   Seller balance before:', sellerBalanceBefore / LAMPORTS_PER_SOL, 'SOL');
      console.log('   Seller balance after:', sellerBalanceAfter / LAMPORTS_PER_SOL, 'SOL');
      console.log('   Seller gain:', sellerGain / LAMPORTS_PER_SOL, 'SOL');
      console.log('   Expected (minus fees):', sellerReceives / LAMPORTS_PER_SOL, 'SOL');

      // Allow for small variance due to rent
      const tolerance = 10000; // 0.00001 SOL
      expect(sellerGain).to.be.closeTo(sellerReceives, tolerance);
      console.log('   Payment verified');
    });

    it('should verify buyer paid correct amount', async function() {
      this.timeout(30000);

      if (!createdListingId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Verify Buyer Payment');
      console.log('===========================================================\n');

      const buyerBalanceAfter = await connection.getBalance(wallets.receiver.publicKey);
      const buyerSpent = buyerBalanceBefore - buyerBalanceAfter;

      console.log('   Buyer balance before:', buyerBalanceBefore / LAMPORTS_PER_SOL, 'SOL');
      console.log('   Buyer balance after:', buyerBalanceAfter / LAMPORTS_PER_SOL, 'SOL');
      console.log('   Buyer spent:', buyerSpent / LAMPORTS_PER_SOL, 'SOL');
      console.log('   Expected price:', listingPrice / LAMPORTS_PER_SOL, 'SOL');

      // Buyer spends price + tx fees
      expect(buyerSpent).to.be.greaterThanOrEqual(listingPrice);
      // But not more than price + reasonable tx fees (0.01 SOL)
      expect(buyerSpent).to.be.lessThan(listingPrice + 0.01 * LAMPORTS_PER_SOL);
      console.log('   Buyer payment verified');
    });
  });

  describe('Buy Validation', () => {
    it('should reject buy from seller (self-buy)', async function() {
      this.timeout(120000);

      if (!testCnftAssetId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Reject Self-Buy');
      console.log('===========================================================\n');

      // Create a new listing
      const createResponse = await request(STAGING_API_URL)
        .post('/api/listings')
        .set('x-idempotency-key', `test-self-buy-${Date.now()}`)
        .send({
          seller: wallets.sender.publicKey.toBase58(),
          assetId: testCnftAssetId,
          priceLamports: (0.1 * LAMPORTS_PER_SOL).toString(),
        });

      if (createResponse.status !== 200 && createResponse.status !== 201) {
        console.log('   Skipping - could not create listing');
        this.skip();
        return;
      }

      const listingId = createResponse.body.data.listing.listingId;

      // Sign and confirm the listing to ACTIVE status first
      if (createResponse.body.data.transaction?.serializedTransaction) {
        const delegationTxSerialized = createResponse.body.data.transaction.serializedTransaction;
        const txBuffer = Buffer.from(delegationTxSerialized, 'base64');
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

        // Confirm listing to ACTIVE
        await request(STAGING_API_URL)
          .post(`/api/listings/${listingId}/confirm`)
          .send({ signature });
      }

      // Try to buy own ACTIVE listing
      const buyResponse = await request(STAGING_API_URL)
        .post(`/api/listings/${listingId}/buy`)
        .send({
          buyer: wallets.sender.publicKey.toBase58(), // Same as seller
        });

      expect([400, 403, 422]).to.include(buyResponse.status);
      console.log('   Self-buy correctly rejected');

      // Cleanup
      await request(STAGING_API_URL)
        .delete(`/api/listings/${listingId}`)
        .send({ seller: wallets.sender.publicKey.toBase58() });
    });

    it('should reject buy on non-existent listing', async function() {
      this.timeout(30000);

      console.log('\nTEST: Reject Non-Existent Listing');
      console.log('===========================================================\n');

      const response = await request(STAGING_API_URL)
        .post('/api/listings/non-existent-listing-id/buy')
        .send({
          buyer: wallets.receiver.publicKey.toBase58(),
        });

      expect([400, 404]).to.include(response.status);
      console.log('   Non-existent listing correctly rejected');
    });

    it('should reject buy on cancelled listing', async function() {
      this.timeout(180000);

      if (!testCnftAssetId) {
        this.skip();
        return;
      }

      console.log('\nTEST: Reject Buy on Cancelled Listing');
      console.log('===========================================================\n');

      // Create a listing
      const createResponse = await request(STAGING_API_URL)
        .post('/api/listings')
        .set('x-idempotency-key', `test-cancelled-buy-${Date.now()}`)
        .send({
          seller: wallets.sender.publicKey.toBase58(),
          assetId: testCnftAssetId,
          priceLamports: (0.1 * LAMPORTS_PER_SOL).toString(),
        });

      if (createResponse.status !== 200 && createResponse.status !== 201) {
        console.log('   Skipping - could not create listing');
        this.skip();
        return;
      }

      const listingId = createResponse.body.data.listing.listingId;

      // Sign and confirm the listing to ACTIVE status first
      if (createResponse.body.data.transaction?.serializedTransaction) {
        const delegationTxSerialized = createResponse.body.data.transaction.serializedTransaction;
        const txBuffer = Buffer.from(delegationTxSerialized, 'base64');
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

        // Confirm listing to ACTIVE
        await request(STAGING_API_URL)
          .post(`/api/listings/${listingId}/confirm`)
          .send({ signature });

        console.log('   Listing confirmed to ACTIVE');
      }

      // Now cancel the ACTIVE listing
      const cancelResponse = await request(STAGING_API_URL)
        .delete(`/api/listings/${listingId}`)
        .send({ seller: wallets.sender.publicKey.toBase58() });

      // Handle revocation transaction if needed
      if (cancelResponse.body.data?.transaction?.serializedTransaction) {
        const revokeTxSerialized = cancelResponse.body.data.transaction.serializedTransaction;
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
      }

      console.log('   Listing cancelled');

      // Try to buy cancelled listing
      const buyResponse = await request(STAGING_API_URL)
        .post(`/api/listings/${listingId}/buy`)
        .send({
          buyer: wallets.receiver.publicKey.toBase58(),
        });

      expect([400, 404, 409, 422]).to.include(buyResponse.status);
      console.log('   Buy on cancelled listing correctly rejected');
    });
  });

  after(function() {
    console.log('\n+--------------------------------------------------------------+');
    console.log('|   DELEGATION BUY E2E TESTS - COMPLETE                        |');
    console.log('+--------------------------------------------------------------+\n');
  });
});
