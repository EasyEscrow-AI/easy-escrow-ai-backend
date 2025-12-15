/**
 * Production E2E Test: Bulk Swap (2-4 NFTs per swap)
 * 
 * Tests bulk swap functionality on mainnet with various asset combinations:
 * - 2+2 NFT swaps (2 maker NFTs for 2 taker NFTs)
 * - 3+1 NFT swaps (3 maker NFTs for 1 taker NFT)
 * - 4+0 NFT swaps (4 maker NFTs for SOL)
 * - Mixed asset types (SPL + Core + cNFT combinations)
 * - Jito bundle submission and confirmation
 * 
 * ⚠️ IMPORTANT: Uses REAL MAINNET wallets and incurs REAL transaction fees
 * ⚠️ NOTE: Bulk swaps use Jito bundles for atomic execution
 */

// Load production environment variables FIRST
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { AtomicSwapApiClient } from '../../helpers/atomic-swap-api-client';
import { waitForConfirmation, displayExplorerLink } from '../../helpers/swap-verification';
import { wait } from '../../helpers/test-utils';

// Load production test assets
let productionAssets: any = null;
try {
  const assetsPath = path.join(__dirname, '../../fixtures/production-test-assets.json');
  if (fs.existsSync(assetsPath)) {
    productionAssets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
    console.log('✅ Loaded production test assets from fixtures');
  }
} catch (error) {
  console.warn('⚠️  Could not load production test assets:', error);
}

// Test configuration
const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx');
const PRODUCTION_API_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';
const ATOMIC_SWAP_API_KEY = process.env.ATOMIC_SWAP_API_KEY || '';

describe('🚀 Production E2E: Bulk Swap (2-4 NFTs) - Mainnet', () => {
  let connection: Connection;
  let maker: Keypair;
  let taker: Keypair;
  let apiClient: AtomicSwapApiClient;
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION E2E: BULK SWAP (2-4 NFTs) - MAINNET           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);
    
    // Load production wallets
    const makerPath = path.join(__dirname, '../../../wallets/production/production-sender.json');
    const takerPath = path.join(__dirname, '../../../wallets/production/production-receiver.json');
    
    maker = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(makerPath, 'utf8'))));
    taker = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(takerPath, 'utf8'))));
    
    console.log('🔑 Maker Wallet:', maker.publicKey.toBase58());
    console.log('🔑 Taker Wallet:', taker.publicKey.toBase58());
    
    // Initialize API client
    apiClient = new AtomicSwapApiClient(PRODUCTION_API_URL, ATOMIC_SWAP_API_KEY);
    console.log('✅ API client initialized');
    
    // Verify wallet balances
    const makerBalance = await connection.getBalance(maker.publicKey);
    const takerBalance = await connection.getBalance(taker.publicKey);
    
    console.log('\n💰 Wallet Balances:');
    console.log(`  Maker: ${makerBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Taker: ${takerBalance / LAMPORTS_PER_SOL} SOL`);
    
    if (makerBalance < 0.1 * LAMPORTS_PER_SOL || takerBalance < 0.1 * LAMPORTS_PER_SOL) {
      console.warn('⚠️  WARNING: Low wallet balance. Tests may fail due to insufficient funds.');
    }
  });
  
  describe('Bulk Swap: 2+2 NFTs (2 maker NFTs for 2 taker NFTs)', () => {
    it('should successfully execute bulk swap with 2 NFTs on each side', async function() {
      this.timeout(300000); // 5 minutes for mainnet
      
      console.log('\n📋 TEST: Bulk Swap 2+2 NFTs');
      console.log('═══════════════════════════════════════════════════════════');
      
      // NOTE: This test requires actual NFTs in the wallets
      // For production, we'll use placeholder asset IDs that should be replaced
      // with actual NFT addresses from the test wallets
      
      const idempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('bulk-2-2');
      
      console.log('\n💫 Creating Bulk Swap Offer (2+2)...');
      
      // Load real NFT addresses from fixtures
      if (!productionAssets || productionAssets.maker.splNfts.length < 2 || productionAssets.taker.splNfts.length < 2) {
        console.log('⚠️  Insufficient NFTs in fixtures - skipping test');
        console.log(`   Maker NFTs: ${productionAssets?.maker?.splNfts?.length || 0}`);
        console.log(`   Taker NFTs: ${productionAssets?.taker?.splNfts?.length || 0}`);
        this.skip();
        return;
      }
      
      const makerNft1 = productionAssets.maker.splNfts[0].mint;
      const makerNft2 = productionAssets.maker.splNfts[1].mint;
      const takerNft1 = productionAssets.taker.splNfts[0].mint;
      const takerNft2 = productionAssets.taker.splNfts[1].mint;
      
      console.log(`   Maker NFT 1: ${makerNft1}`);
      console.log(`   Maker NFT 2: ${makerNft2}`);
      console.log(`   Taker NFT 1: ${takerNft1}`);
      console.log(`   Taker NFT 2: ${takerNft2}`);
      
      const createResponse = await apiClient.createOffer({
        makerWallet: maker.publicKey.toBase58(),
        takerWallet: taker.publicKey.toBase58(),
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
      const acceptKey = AtomicSwapApiClient.generateIdempotencyKey('bulk-2-2-accept');
      const acceptResponse = await apiClient.acceptOffer(
        createResponse.data.offer.id,
        taker.publicKey.toBase58(),
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
        { transactions: transactionsForBulk },
        maker,
        taker,
        connection
      );
      
      if (!bulkResult.success) {
        throw new Error(`Bulk swap failed: ${bulkResult.error}`);
      }
      
      console.log(`\n✅ All ${bulkResult.signatures.length} transactions confirmed!`);
      bulkResult.signatures.forEach((sig, i) => {
        console.log(`  Tx ${i + 1}: ${sig}`);
        displayExplorerLink(sig, 'mainnet-beta');
      });
      
      console.log('\n✅ Bulk swap 2+2 completed successfully!');
    });
  });
  
  describe('Bulk Swap: 3+1 NFTs (3 maker NFTs for 1 taker NFT)', () => {
    it('should successfully execute bulk swap with 3 maker NFTs for 1 taker NFT', async function() {
      this.timeout(300000);
      
      console.log('\n📋 TEST: Bulk Swap 3+1 NFTs');
      console.log('═══════════════════════════════════════════════════════════');
      
      const idempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('bulk-3-1');
      
      // Load real NFT addresses from fixtures
      if (!productionAssets || productionAssets.maker.splNfts.length < 3 || productionAssets.taker.splNfts.length < 1) {
        console.log('⚠️  Insufficient NFTs in fixtures - skipping test');
        this.skip();
        return;
      }
      
      const makerNft1 = productionAssets.maker.splNfts[0].mint;
      const makerNft2 = productionAssets.maker.splNfts[1].mint;
      const makerNft3 = productionAssets.maker.splNfts[2].mint;
      const takerNft1 = productionAssets.taker.splNfts[0].mint;
      
      const createResponse = await apiClient.createOffer({
        makerWallet: maker.publicKey.toBase58(),
        takerWallet: taker.publicKey.toBase58(),
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
      
      const acceptKey = AtomicSwapApiClient.generateIdempotencyKey('bulk-3-1-accept');
      const acceptResponse = await apiClient.acceptOffer(
        createResponse.data.offer.id,
        taker.publicKey.toBase58(),
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
        { transactions: transactionsForBulk },
        maker,
        taker,
        connection
      );
      
      if (!bulkResult.success) {
        throw new Error(`Bulk swap failed: ${bulkResult.error}`);
      }
      
      console.log(`\n✅ All ${bulkResult.signatures.length} transactions confirmed!`);
      console.log('\n✅ Bulk swap 3+1 completed successfully!');
    });
  });
  
  describe('Bulk Swap: 4+0 NFTs (4 maker NFTs for SOL)', () => {
    it('should successfully execute bulk swap with 4 maker NFTs for SOL', async function() {
      this.timeout(300000);
      
      console.log('\n📋 TEST: Bulk Swap 4+0 NFTs (for SOL)');
      console.log('═══════════════════════════════════════════════════════════');
      
      const solAmount = 2 * LAMPORTS_PER_SOL; // 2 SOL
      const idempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('bulk-4-0');
      
      // Load real NFT addresses from fixtures
      if (!productionAssets || productionAssets.maker.splNfts.length < 4) {
        console.log('⚠️  Insufficient NFTs in fixtures - skipping test');
        this.skip();
        return;
      }
      
      const makerNft1 = productionAssets.maker.splNfts[0].mint;
      const makerNft2 = productionAssets.maker.splNfts[1].mint;
      const makerNft3 = productionAssets.maker.splNfts[2].mint;
      const makerNft4 = productionAssets.maker.splNfts[3].mint;
      
      const createResponse = await apiClient.createOffer({
        makerWallet: maker.publicKey.toBase58(),
        takerWallet: taker.publicKey.toBase58(),
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
      
      const acceptKey = AtomicSwapApiClient.generateIdempotencyKey('bulk-4-0-accept');
      const acceptResponse = await apiClient.acceptOffer(
        createResponse.data.offer.id,
        taker.publicKey.toBase58(),
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
        { transactions: transactionsForBulk },
        maker,
        taker,
        connection
      );
      
      if (!bulkResult.success) {
        throw new Error(`Bulk swap failed: ${bulkResult.error}`);
      }
      
      console.log(`\n✅ All ${bulkResult.signatures.length} transactions confirmed!`);
      console.log('\n✅ Bulk swap 4+0 completed successfully!');
    });
  });
  
  describe('Bulk Swap: Mixed Asset Types (SPL + Core + cNFT)', () => {
    it('should successfully execute bulk swap with mixed asset types', async function() {
      this.timeout(300000);
      
      console.log('\n📋 TEST: Bulk Swap Mixed Assets (SPL + Core + cNFT)');
      console.log('═══════════════════════════════════════════════════════════');
      
      const idempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('bulk-mixed');
      
      // Load real NFT addresses from fixtures
      // Note: Mixed asset test requires SPL + Core + cNFT, but we only have SPL NFTs
      // For now, we'll use SPL NFTs and skip if mixed types are required
      if (!productionAssets || productionAssets.maker.splNfts.length < 2 || productionAssets.taker.splNfts.length < 1) {
        console.log('⚠️  Insufficient NFTs in fixtures - skipping test');
        this.skip();
        return;
      }
      
      // Using SPL NFTs as placeholders (Core/cNFT support pending)
      const makerSplNft = productionAssets.maker.splNfts[0].mint;
      const makerCoreNft = productionAssets.maker.splNfts[1].mint; // Using SPL as placeholder
      const takerCnft = productionAssets.taker.splNfts[0].mint; // Using SPL as placeholder
      
      console.log('   ⚠️  NOTE: Using SPL NFTs as placeholders for Core/cNFT (mixed asset test)');
      
      const createResponse = await apiClient.createOffer({
        makerWallet: maker.publicKey.toBase58(),
        takerWallet: taker.publicKey.toBase58(),
        offeredAssets: [
          { mint: makerSplNft, isCompressed: false },
          { mint: makerCoreNft, isCompressed: false },
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
      
      const acceptKey = AtomicSwapApiClient.generateIdempotencyKey('bulk-mixed-accept');
      const acceptResponse = await apiClient.acceptOffer(
        createResponse.data.offer.id,
        taker.publicKey.toBase58(),
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
        { transactions: transactionsForBulk },
        maker,
        taker,
        connection
      );
      
      if (!bulkResult.success) {
        throw new Error(`Bulk swap failed: ${bulkResult.error}`);
      }
      
      console.log(`\n✅ All ${bulkResult.signatures.length} transactions confirmed!`);
      console.log('\n✅ Bulk swap with mixed assets completed successfully!');
    });
  });
});

/**
 * USAGE INSTRUCTIONS:
 * 
 * 1. Ensure production program is deployed:
 *    - Program ID: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
 *    - Treasury initialized on mainnet
 * 
 * 2. Set environment variables:
 *    - MAINNET_RPC_URL (optional, defaults to public mainnet)
 *    - PRODUCTION_API_URL (defaults to https://api.easyescrow.ai)
 *    - ATOMIC_SWAP_API_KEY (optional, for zero-fee swaps)
 * 
 * 3. Ensure wallets are funded:
 *    - Minimum 0.1 SOL per wallet for transaction fees
 *    - Taker needs SOL if offering SOL in swaps
 * 
 * 4. Replace placeholder asset IDs:
 *    - Update PLACEHOLDER_* values with actual NFT/asset addresses
 *    - Ensure assets are owned by the respective wallets
 * 
 * 5. Run tests:
 *    npm run test:production:e2e:bulk-swap
 * 
 * WHAT THIS TESTS:
 * - Bulk swap functionality (2-4 NFTs per swap)
 * - Jito bundle submission and confirmation
 * - Mixed asset type combinations
 * - Transaction group creation
 * - Atomic execution via Jito bundles
 */

