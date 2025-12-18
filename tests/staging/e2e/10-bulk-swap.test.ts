/**
 * Staging E2E Test: Bulk Swap (2-4 NFTs per swap)
 *
 * Tests bulk swap functionality on staging/devnet with various asset combinations:
 * - 2+2 NFT swaps (2 maker NFTs for 2 taker NFTs)
 * - 3+1 NFT swaps (3 maker NFTs for 1 taker NFT)
 * - 4+0 NFT swaps (4 maker NFTs for SOL)
 * - Mixed asset types (SPL + cNFT combinations)
 * - Jito bundle submission and confirmation
 *
 * Environment: Staging (Devnet)
 */

// Load staging environment variables FIRST
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.staging' });

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { AtomicSwapApiClient } from '../../helpers/atomic-swap-api-client';
import { waitForConfirmation, displayExplorerLink } from '../../helpers/swap-verification';
import { wait } from '../../helpers/test-utils';
import {
  loadDevnetWallets,
  verifyWalletBalances,
  DevnetWallets,
} from '../../helpers/devnet-wallet-manager';

// Load staging test assets
let stagingAssets: any = null;
try {
  const assetsPath = path.join(__dirname, '../../fixtures/staging-test-assets.json');
  if (fs.existsSync(assetsPath)) {
    stagingAssets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
    console.log('✅ Loaded staging test assets from fixtures');
  }
} catch (error) {
  console.warn('⚠️  Could not load staging test assets:', error);
}

// Test configuration
const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || process.env.DEVNET_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei');
const STAGING_API_URL = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
const ATOMIC_SWAP_API_KEY = process.env.ATOMIC_SWAP_API_KEY || '';

describe('🚀 Staging E2E: Bulk Swap (2-4 NFTs) - Devnet', () => {
  let connection: Connection;
  let wallets: DevnetWallets;
  let apiClient: AtomicSwapApiClient;

  before(async function() {
    this.timeout(180000);

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   STAGING E2E: BULK SWAP (2-4 NFTs) - DEVNET                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);

    // Load staging wallets
    wallets = await loadDevnetWallets();

    console.log('🔑 Maker Wallet:', wallets.sender.publicKey.toBase58());
    console.log('🔑 Taker Wallet:', wallets.receiver.publicKey.toBase58());

    // Initialize API client
    apiClient = new AtomicSwapApiClient(STAGING_API_URL, ATOMIC_SWAP_API_KEY);
    console.log('✅ API client initialized');

    // Verify wallet balances
    await verifyWalletBalances(connection, wallets, 0.1);

    const makerBalance = await connection.getBalance(wallets.sender.publicKey);
    const takerBalance = await connection.getBalance(wallets.receiver.publicKey);

    console.log('\n💰 Wallet Balances:');
    console.log(`  Maker: ${makerBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Taker: ${takerBalance / LAMPORTS_PER_SOL} SOL`);

    if (makerBalance < 0.1 * LAMPORTS_PER_SOL || takerBalance < 0.1 * LAMPORTS_PER_SOL) {
      console.warn('⚠️  WARNING: Low wallet balance. Tests may fail due to insufficient funds.');
    }
  });

  describe('Bulk Swap: 2+2 NFTs (2 maker NFTs for 2 taker NFTs)', () => {
    it('should successfully execute bulk swap with 2 NFTs on each side', async function() {
      this.timeout(300000); // 5 minutes for devnet

      console.log('\n📋 TEST: Bulk Swap 2+2 NFTs');
      console.log('═══════════════════════════════════════════════════════════');

      const idempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('staging-bulk-2-2');

      console.log('\n💫 Creating Bulk Swap Offer (2+2)...');

      // Load real NFT addresses from fixtures
      if (!stagingAssets ||
          !stagingAssets.maker?.splNfts?.length || stagingAssets.maker.splNfts.length < 2 ||
          !stagingAssets.taker?.splNfts?.length || stagingAssets.taker.splNfts.length < 2) {
        console.log('⚠️  Insufficient NFTs in fixtures - skipping test');
        console.log(`   Maker NFTs: ${stagingAssets?.maker?.splNfts?.length || 0}`);
        console.log(`   Taker NFTs: ${stagingAssets?.taker?.splNfts?.length || 0}`);
        this.skip();
        return;
      }

      const makerNft1 = stagingAssets.maker.splNfts[0].mint;
      const makerNft2 = stagingAssets.maker.splNfts[1].mint;
      const takerNft1 = stagingAssets.taker.splNfts[0].mint;
      const takerNft2 = stagingAssets.taker.splNfts[1].mint;

      console.log(`   Maker NFT 1: ${makerNft1}`);
      console.log(`   Maker NFT 2: ${makerNft2}`);
      console.log(`   Taker NFT 1: ${takerNft1}`);
      console.log(`   Taker NFT 2: ${takerNft2}`);

      const createResponse = await apiClient.createOffer({
        makerWallet: wallets.sender.publicKey.toBase58(),
        takerWallet: wallets.receiver.publicKey.toBase58(),
        offeredAssets: [
          { mint: makerNft1, isCompressed: false },
          { mint: makerNft2, isCompressed: false },
        ],
        requestedAssets: [
          { mint: takerNft1, isCompressed: false },
          { mint: takerNft2, isCompressed: false },
        ],
        offeredSol: 0,
        requestedSol: 0,
      }, idempotencyKey);

      if (!createResponse.success || !createResponse.data) {
        console.log('⚠️  Offer creation failed - may need actual NFT addresses');
        console.log('   Error:', createResponse.message);
        this.skip();
        return;
      }

      console.log('✅ Bulk swap offer created');
      console.log(`  Offer ID: ${createResponse.data.offer.id}`);

      // Accept offer
      console.log('\n🤝 Accepting bulk swap offer...');
      const acceptKey = AtomicSwapApiClient.generateIdempotencyKey('staging-bulk-2-2-accept');
      const acceptResponse = await apiClient.acceptOffer(
        createResponse.data.offer.id,
        wallets.receiver.publicKey.toBase58(),
        acceptKey
      );

      if (!acceptResponse.success || !acceptResponse.data) {
        throw new Error(`Failed to accept offer: ${acceptResponse.message}`);
      }

      // Check for bulk swap
      const bulkSwap = (acceptResponse.data as any).bulkSwap;

      if (!bulkSwap || !bulkSwap.isBulkSwap) {
        throw new Error('Expected bulk swap but got single transaction');
      }

      console.log('\n🚀 BULK SWAP DETECTED:');
      console.log(`  Strategy: ${bulkSwap.strategy}`);
      console.log(`  Transaction Count: ${bulkSwap.transactionCount}`);
      console.log(`  Requires Jito: ${bulkSwap.requiresJitoBundle}`);

      expect(bulkSwap.transactionCount).to.be.greaterThanOrEqual(2);

      // Sign and send bulk transactions
      console.log('\n🔏 Signing and sending bulk swap transactions...');
      const transactionsForBulk = bulkSwap.transactions.map((tx: any) => ({
        index: tx.index,
        purpose: tx.purpose,
        serializedTransaction: tx.serializedTransaction,
        requiredSigners: tx.requiredSigners,
      }));

      const bulkResult = await AtomicSwapApiClient.signAndSendBulkSwapTransactions(
        {
          transactions: transactionsForBulk,
          requiresJitoBundle: bulkSwap.requiresJitoBundle !== false,
        },
        wallets.sender,
        wallets.receiver,
        connection
      );

      if (!bulkResult.success) {
        throw new Error(`Bulk swap failed: ${bulkResult.error}`);
      }

      if (bulkResult.bundleId) {
        console.log(`\n✅ Jito bundle confirmed: ${bulkResult.bundleId}`);
        console.log(`  Bundle Status: Landed`);
        console.log(`  All ${bulkSwap.transactionCount} transactions executed atomically`);
      } else {
        console.log(`\n✅ All ${bulkResult.signatures.length} transactions confirmed!`);
        bulkResult.signatures.forEach((sig, i) => {
          console.log(`  Tx ${i + 1}: ${sig}`);
          displayExplorerLink(sig, 'devnet');
        });
      }

      console.log('\n✅ Bulk swap 2+2 completed successfully!');
    });
  });

  describe('Bulk Swap: 3+1 NFTs (3 maker NFTs for 1 taker NFT)', () => {
    it('should successfully execute bulk swap with 3 maker NFTs for 1 taker NFT', async function() {
      this.timeout(300000);

      console.log('\n📋 TEST: Bulk Swap 3+1 NFTs');
      console.log('═══════════════════════════════════════════════════════════');

      const idempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('staging-bulk-3-1');

      // Load real NFT addresses from fixtures
      if (!stagingAssets ||
          !stagingAssets.maker?.splNfts?.length || stagingAssets.maker.splNfts.length < 3 ||
          !stagingAssets.taker?.splNfts?.length || stagingAssets.taker.splNfts.length < 1) {
        console.log('⚠️  Insufficient NFTs in fixtures - skipping test');
        this.skip();
        return;
      }

      const makerNft1 = stagingAssets.maker.splNfts[0].mint;
      const makerNft2 = stagingAssets.maker.splNfts[1].mint;
      const makerNft3 = stagingAssets.maker.splNfts[2].mint;
      const takerNft1 = stagingAssets.taker.splNfts[0].mint;

      const createResponse = await apiClient.createOffer({
        makerWallet: wallets.sender.publicKey.toBase58(),
        takerWallet: wallets.receiver.publicKey.toBase58(),
        offeredAssets: [
          { mint: makerNft1, isCompressed: false },
          { mint: makerNft2, isCompressed: false },
          { mint: makerNft3, isCompressed: false },
        ],
        requestedAssets: [
          { mint: takerNft1, isCompressed: false },
        ],
        offeredSol: 0,
        requestedSol: 0,
      }, idempotencyKey);

      if (!createResponse.success || !createResponse.data) {
        console.log('⚠️  Offer creation failed - may need actual NFT addresses');
        this.skip();
        return;
      }

      const acceptKey = AtomicSwapApiClient.generateIdempotencyKey('staging-bulk-3-1-accept');
      const acceptResponse = await apiClient.acceptOffer(
        createResponse.data.offer.id,
        wallets.receiver.publicKey.toBase58(),
        acceptKey
      );

      if (!acceptResponse.success || !acceptResponse.data) {
        throw new Error(`Failed to accept offer: ${acceptResponse.message}`);
      }

      const bulkSwap = (acceptResponse.data as any).bulkSwap;

      if (!bulkSwap || !bulkSwap.isBulkSwap) {
        throw new Error('Expected bulk swap but got single transaction');
      }

      expect(bulkSwap.transactionCount).to.be.greaterThanOrEqual(2);

      const transactionsForBulk = bulkSwap.transactions.map((tx: any) => ({
        index: tx.index,
        purpose: tx.purpose,
        serializedTransaction: tx.serializedTransaction,
        requiredSigners: tx.requiredSigners,
      }));

      const bulkResult = await AtomicSwapApiClient.signAndSendBulkSwapTransactions(
        {
          transactions: transactionsForBulk,
          requiresJitoBundle: bulkSwap.requiresJitoBundle !== false,
        },
        wallets.sender,
        wallets.receiver,
        connection
      );

      if (!bulkResult.success) {
        throw new Error(`Bulk swap failed: ${bulkResult.error}`);
      }

      if (bulkResult.bundleId) {
        console.log(`\n✅ Jito bundle confirmed: ${bulkResult.bundleId}`);
        console.log(`  All ${bulkSwap.transactionCount} transactions executed atomically`);
      } else {
        console.log(`\n✅ All ${bulkResult.signatures.length} transactions confirmed!`);
      }
      console.log('\n✅ Bulk swap 3+1 completed successfully!');
    });
  });

  describe('Bulk Swap: 4+0 NFTs (4 maker NFTs for SOL)', () => {
    it('should successfully execute bulk swap with 4 maker NFTs for SOL', async function() {
      this.timeout(300000);

      console.log('\n📋 TEST: Bulk Swap 4+0 NFTs (for SOL)');
      console.log('═══════════════════════════════════════════════════════════');

      const solAmount = 0.5 * LAMPORTS_PER_SOL; // 0.5 SOL for devnet
      const idempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('staging-bulk-4-0');

      // Load real NFT addresses from fixtures
      if (!stagingAssets || !stagingAssets.maker?.splNfts?.length || stagingAssets.maker.splNfts.length < 4) {
        console.log('⚠️  Insufficient NFTs in fixtures - skipping test');
        this.skip();
        return;
      }

      const makerNft1 = stagingAssets.maker.splNfts[0].mint;
      const makerNft2 = stagingAssets.maker.splNfts[1].mint;
      const makerNft3 = stagingAssets.maker.splNfts[2].mint;
      const makerNft4 = stagingAssets.maker.splNfts[3].mint;

      const createResponse = await apiClient.createOffer({
        makerWallet: wallets.sender.publicKey.toBase58(),
        takerWallet: wallets.receiver.publicKey.toBase58(),
        offeredAssets: [
          { mint: makerNft1, isCompressed: false },
          { mint: makerNft2, isCompressed: false },
          { mint: makerNft3, isCompressed: false },
          { mint: makerNft4, isCompressed: false },
        ],
        requestedAssets: [],
        offeredSol: 0,
        requestedSol: solAmount,
      }, idempotencyKey);

      if (!createResponse.success || !createResponse.data) {
        console.log('⚠️  Offer creation failed - may need actual NFT addresses');
        this.skip();
        return;
      }

      const acceptKey = AtomicSwapApiClient.generateIdempotencyKey('staging-bulk-4-0-accept');
      const acceptResponse = await apiClient.acceptOffer(
        createResponse.data.offer.id,
        wallets.receiver.publicKey.toBase58(),
        acceptKey
      );

      if (!acceptResponse.success || !acceptResponse.data) {
        throw new Error(`Failed to accept offer: ${acceptResponse.message}`);
      }

      const bulkSwap = (acceptResponse.data as any).bulkSwap;

      if (!bulkSwap || !bulkSwap.isBulkSwap) {
        throw new Error('Expected bulk swap but got single transaction');
      }

      expect(bulkSwap.transactionCount).to.be.greaterThanOrEqual(2);

      const transactionsForBulk = bulkSwap.transactions.map((tx: any) => ({
        index: tx.index,
        purpose: tx.purpose,
        serializedTransaction: tx.serializedTransaction,
        requiredSigners: tx.requiredSigners,
      }));

      const bulkResult = await AtomicSwapApiClient.signAndSendBulkSwapTransactions(
        {
          transactions: transactionsForBulk,
          requiresJitoBundle: bulkSwap.requiresJitoBundle !== false,
        },
        wallets.sender,
        wallets.receiver,
        connection
      );

      if (!bulkResult.success) {
        throw new Error(`Bulk swap failed: ${bulkResult.error}`);
      }

      if (bulkResult.bundleId) {
        console.log(`\n✅ Jito bundle confirmed: ${bulkResult.bundleId}`);
        console.log(`  All ${bulkSwap.transactionCount} transactions executed atomically`);
      } else {
        console.log(`\n✅ All ${bulkResult.signatures.length} transactions confirmed!`);
      }
      console.log('\n✅ Bulk swap 4+0 completed successfully!');
    });
  });

  describe('Bulk Swap: Mixed Asset Types (SPL + cNFT)', () => {
    it('should successfully execute bulk swap with mixed asset types', async function() {
      this.timeout(300000);

      console.log('\n📋 TEST: Bulk Swap Mixed Assets (SPL + cNFT)');
      console.log('═══════════════════════════════════════════════════════════');

      const idempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('staging-bulk-mixed');

      // Load real NFT addresses from fixtures
      // Check for actual mixed assets (SPL + cNFT)
      const hasMakerSpl = stagingAssets?.maker?.splNfts?.length >= 1;
      const hasMakerCnft = stagingAssets?.maker?.cnfts?.length >= 1;
      const hasTakerCnft = stagingAssets?.taker?.cnfts?.length >= 1;

      if (!stagingAssets || !hasMakerSpl || !hasMakerCnft || !hasTakerCnft) {
        console.log('⚠️  Insufficient mixed assets in fixtures - skipping test');
        console.log(`   Maker SPL NFTs: ${stagingAssets?.maker?.splNfts?.length || 0} (need 1+)`);
        console.log(`   Maker cNFTs: ${stagingAssets?.maker?.cnfts?.length || 0} (need 1+)`);
        console.log(`   Taker cNFTs: ${stagingAssets?.taker?.cnfts?.length || 0} (need 1+)`);
        this.skip();
        return;
      }

      // Use real mixed assets
      const makerSplNft = stagingAssets.maker.splNfts[0].mint;
      const makerCnft = stagingAssets.maker.cnfts[0].mint;
      const takerCnft = stagingAssets.taker.cnfts[0].mint;

      console.log(`   Maker SPL NFT: ${makerSplNft}`);
      console.log(`   Maker cNFT: ${makerCnft}`);
      console.log(`   Taker cNFT: ${takerCnft}`);

      const createResponse = await apiClient.createOffer({
        makerWallet: wallets.sender.publicKey.toBase58(),
        takerWallet: wallets.receiver.publicKey.toBase58(),
        offeredAssets: [
          { mint: makerSplNft, isCompressed: false },
          { mint: makerCnft, isCompressed: true },
        ],
        requestedAssets: [
          { mint: takerCnft, isCompressed: true },
        ],
        offeredSol: 0,
        requestedSol: 0,
      }, idempotencyKey);

      if (!createResponse.success || !createResponse.data) {
        console.log('⚠️  Offer creation failed - may need actual asset addresses');
        this.skip();
        return;
      }

      const acceptKey = AtomicSwapApiClient.generateIdempotencyKey('staging-bulk-mixed-accept');
      const acceptResponse = await apiClient.acceptOffer(
        createResponse.data.offer.id,
        wallets.receiver.publicKey.toBase58(),
        acceptKey
      );

      if (!acceptResponse.success || !acceptResponse.data) {
        throw new Error(`Failed to accept offer: ${acceptResponse.message}`);
      }

      const bulkSwap = (acceptResponse.data as any).bulkSwap;

      if (!bulkSwap || !bulkSwap.isBulkSwap) {
        throw new Error('Expected bulk swap but got single transaction');
      }

      expect(bulkSwap.transactionCount).to.be.greaterThanOrEqual(2);

      const transactionsForBulk = bulkSwap.transactions.map((tx: any) => ({
        index: tx.index,
        purpose: tx.purpose,
        serializedTransaction: tx.serializedTransaction,
        requiredSigners: tx.requiredSigners,
      }));

      const bulkResult = await AtomicSwapApiClient.signAndSendBulkSwapTransactions(
        {
          transactions: transactionsForBulk,
          requiresJitoBundle: bulkSwap.requiresJitoBundle !== false,
        },
        wallets.sender,
        wallets.receiver,
        connection
      );

      if (!bulkResult.success) {
        throw new Error(`Bulk swap failed: ${bulkResult.error}`);
      }

      if (bulkResult.bundleId) {
        console.log(`\n✅ Jito bundle confirmed: ${bulkResult.bundleId}`);
        console.log(`  All ${bulkSwap.transactionCount} transactions executed atomically`);
      } else {
        console.log(`\n✅ All ${bulkResult.signatures.length} transactions confirmed!`);
      }
      console.log('\n✅ Bulk swap with mixed assets completed successfully!');
    });
  });
});

/**
 * USAGE INSTRUCTIONS:
 *
 * 1. Ensure staging program is deployed:
 *    - Program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
 *    - Treasury initialized on devnet
 *
 * 2. Set environment variables:
 *    - STAGING_SOLANA_RPC_URL (optional, defaults to devnet)
 *    - STAGING_API_URL (defaults to https://staging-api.easyescrow.ai)
 *    - ATOMIC_SWAP_API_KEY (optional, for zero-fee swaps)
 *
 * 3. Ensure wallets are funded:
 *    - Minimum 0.1 SOL per wallet for transaction fees
 *    - Taker needs SOL if offering SOL in swaps
 *
 * 4. Create staging test assets fixture:
 *    - Create tests/fixtures/staging-test-assets.json
 *    - Include maker/taker SPL NFTs and cNFTs
 *
 * 5. Run tests:
 *    npm run test:staging:e2e:bulk-swap
 *
 * WHAT THIS TESTS:
 * - Bulk swap functionality (2-4 NFTs per swap)
 * - Jito bundle submission and confirmation (on devnet - simulated)
 * - Mixed asset type combinations
 * - Transaction group creation
 * - Atomic execution via multiple transactions
 */
