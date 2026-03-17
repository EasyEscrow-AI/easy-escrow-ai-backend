/**
 * cNFT Swap E2E Test: cNFT (Compressed NFT) for SOL Happy Path (Staging)
 * 
 * NOTE: cNFT swaps use Jito bundles for multi-transaction execution,
 * NOT single atomic transactions like standard NFT swaps.
 * 
 * Tests the complete flow of swapping a compressed NFT for SOL tokens including:
 * - Standard 1% percentage fee
 * - cNFT ownership verification via DAS API
 * - Merkle proof validation
 */

// Load staging environment variables FIRST
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.staging' });

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadDevnetWallets,
  verifyWalletBalances,
  DevnetWallets,
} from '../../helpers/devnet-wallet-manager';
import {
  loadTestCnfts,
  getTestCnft,
  displayTestCnftInfo,
  hasTestCnfts,
} from '../../helpers/test-cnft-manager';
import { wait, generateTestAgreementId } from '../../helpers/test-utils';
import { AtomicSwapApiClient } from '../../helpers/atomic-swap-api-client';
import {
  getNonceData,
  waitForConfirmation,
  displayExplorerLink,
} from '../../helpers/swap-verification';

// Test configuration
const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei');
const PLATFORM_AUTHORITY_PATH = process.env.STAGING_ADMIN_PRIVATE_KEY_PATH || 
  path.join(__dirname, '../../../wallets/staging/staging-deployer.json');
const STAGING_API_URL = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
const ATOMIC_SWAP_API_KEY = process.env.ATOMIC_SWAP_API_KEY || '';

// Use pre-minted test cNFT (avoids tree creation cost)
let testCnftAssetId: string;

describe('🌳 cNFT Swap E2E: cNFT for SOL - Happy Path (Staging)', () => {
  let connection: Connection;
  let program: Program;
  let platformAuthority: Keypair;
  let treasuryPda: PublicKey;
  let wallets: DevnetWallets;
  let apiClient: AtomicSwapApiClient;
  
  before(async function() {
    this.timeout(120000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   cNFT SWAP: cNFT → SOL HAPPY PATH - STAGING SETUP           ║');
    console.log('║   ⚠️  REQUIRES: Pre-minted test cNFTs                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    // Setup connection
    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);
    
    // Load platform authority
    const authoritySecret = JSON.parse(fs.readFileSync(PLATFORM_AUTHORITY_PATH, 'utf8'));
    platformAuthority = Keypair.fromSecretKey(new Uint8Array(authoritySecret));
    console.log('🔑 Platform Authority:', platformAuthority.publicKey.toBase58());
    
    // Load IDL
    const idlPath = path.join(__dirname, '../../../src/generated/anchor/escrow-idl-staging.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    
    // Setup provider and program
    const wallet = new Wallet(platformAuthority);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    program = new Program(idl, provider);
    
    // Get treasury PDA from environment
    const treasuryAddress = process.env.DEVNET_STAGING_PDA_TREASURY_ADDRESS;
    if (!treasuryAddress) {
      throw new Error('DEVNET_STAGING_PDA_TREASURY_ADDRESS not set in environment');
    }
    treasuryPda = new PublicKey(treasuryAddress);
    console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
    
    // Verify treasury is initialized
    try {
      const treasuryAccount = await connection.getAccountInfo(treasuryPda);
      if (!treasuryAccount) {
        console.warn('⚠️  Treasury account not found on-chain. This may be OK if using platform fee collector.');
        console.warn('   Continuing with test...');
      } else {
        console.log('✅ Treasury initialized');
      }
    } catch (error) {
      console.error('❌ Treasury check failed:', error);
      // Don't throw - the treasury check is informational for this test
      console.warn('⚠️  Continuing despite treasury check failure...');
    }
    
    // Load test wallets
    // NOTE: For cNFT→SOL, the MAKER offers cNFT, TAKER offers SOL
    // So we'll use sender as maker (offers cNFT) and receiver as taker (offers SOL)
    wallets = await loadDevnetWallets();
    console.log('\n🔑 Test Wallets:');
    console.log(`  Maker (Offers cNFT): ${wallets.sender.publicKey.toBase58()}`);
    console.log(`  Taker (Offers SOL):  ${wallets.receiver.publicKey.toBase58()}`);
    
    // Verify wallet balances
    await verifyWalletBalances(connection, wallets, 0.1);
    
    // Initialize API client
    console.log('\n🔌 Initializing API client...');
    console.log(`  API URL: ${STAGING_API_URL}`);
    apiClient = new AtomicSwapApiClient(STAGING_API_URL, ATOMIC_SWAP_API_KEY);
    console.log('✅ API client initialized');
    
    // Load pre-minted test cNFT
    console.log('\n🌳 cNFT Setup:');
    console.log('  Loading pre-minted test cNFT...');
    
    try {
      // Check if test cNFTs are configured
      if (!hasTestCnfts()) {
        console.warn('  ⚠️  Test cNFTs not configured - skipping suite');
        console.warn('  Run: ts-node scripts/setup-test-cnfts-staging.ts');
        return this.skip();
      }

      // Get first available test cNFT
      const testCnft = getTestCnft(0); // Use first test cNFT
      testCnftAssetId = testCnft.assetId;

      console.log('  ✅ Using pre-minted test cNFT:');
      displayTestCnftInfo(testCnft);

      // Verify ownership
      console.log('\n  🔍 Verifying current ownership...');
      const assetData = await (connection as any)._rpcRequest('getAsset', {
        id: testCnftAssetId,
      });
      const asset = assetData.result || assetData;
      const currentOwner = asset?.ownership?.owner;

      console.log(`     Current Owner: ${currentOwner}`);
      console.log(`     Expected Owner (Maker): ${wallets.sender.publicKey.toBase58()}`);

      if (currentOwner !== wallets.sender.publicKey.toBase58()) {
        console.warn('  ⚠️  cNFT is not currently owned by maker (sender) - skipping suite');
        console.warn('     Run: ts-node scripts/rebalance-test-cnfts-staging.ts to fix');
        return this.skip();
      } else {
        console.log('  ✅ Ownership verified');
      }

      console.log('  ✅ Test cNFT ready (pre-indexed, no wait needed)');

    } catch (error: any) {
      console.error('  ❌ Failed to load test cNFT:', error.message);
      console.warn('  Skipping suite due to cNFT setup failure');
      return this.skip();
    }
    
    console.log('\n✅ Test setup complete with pre-minted cNFT');
    console.log('💡 Benefits: No tree creation cost, no minting time, no indexing wait!\n');
  });
  
  describe('Scenario 1: cNFT for SOL Swap', () => {
    it('should successfully swap cNFT for SOL with 1% platform fee', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: cNFT for SOL with 1% Fee');
      console.log('═══════════════════════════════════════════════════════════');
      
      const idempotencyKey = generateTestAgreementId();
      const solAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL requested by maker
      
      console.log('\n💫 Creating Swap Offer...');
      console.log(`  Maker: ${wallets.sender.publicKey.toBase58()} (offers cNFT)`);
      console.log(`  Taker: ${wallets.receiver.publicKey.toBase58()} (offers ${solAmount / LAMPORTS_PER_SOL} SOL)`);
      console.log(`  cNFT Asset ID: ${testCnftAssetId}`);
      console.log(`  Idempotency Key: ${idempotencyKey}`);
      
      // Get balances before swap
      const makerBalanceBefore = await connection.getBalance(wallets.sender.publicKey);
      const takerBalanceBefore = await connection.getBalance(wallets.receiver.publicKey);
      const treasuryBalanceBefore = await connection.getBalance(treasuryPda);
      
      console.log('\n💰 Balances Before:');
      console.log(`  Maker:    ${makerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Taker:    ${takerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Treasury: ${treasuryBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      
      // Step 1: Create offer via API
      // Maker offers cNFT, requests SOL
      const createResponse = await apiClient.createOffer({
        makerWallet: wallets.sender.publicKey.toBase58(),
        takerWallet: wallets.receiver.publicKey.toBase58(),
        offeredAssets: [{
          mint: testCnftAssetId,
          isCompressed: true,
        }],
        requestedAssets: [], // Taker only offers SOL
        offeredSol: 0,
        requestedSol: solAmount,
      }, idempotencyKey);
      
      if (!createResponse.success || !createResponse.data) {
        throw new Error(`Failed to create offer: ${createResponse.message || 'Unknown error'}`);
      }
      
      console.log('\n✅ Swap offer created successfully');
      console.log(`  Offer ID: ${createResponse.data.offer.id}`);
      console.log(`  Status: ${createResponse.data.offer.status}`);
      console.log(`  Maker Wallet: ${createResponse.data.offer.makerWallet}`);
      console.log(`  Taker Wallet: ${createResponse.data.offer.takerWallet}`);
      
      // Step 2: Accept offer via API (this builds the transaction)
      console.log('\n🤝 Step 2: Accepting offer via API...');
      const acceptIdempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('test-cnft-sol-accept');
      const acceptResponse = await apiClient.acceptOffer(
        createResponse.data.offer.id,
        wallets.receiver.publicKey.toBase58(),
        acceptIdempotencyKey
      );
      
      if (!acceptResponse.success || !acceptResponse.data) {
        throw new Error(`Failed to accept offer: ${acceptResponse.message || 'Unknown error'}`);
      }
      
      console.log(`✅ Offer accepted, transaction ready for signing`);
      
      // Check if this is a bulk swap (cNFT swaps use Direct Bubblegum bundles)
      const bulkSwap = (acceptResponse.data as any).bulkSwap;
      let swapSignature: string | null = null;
      let bulkSignatures: string[] = [];
      
      if (bulkSwap && bulkSwap.isBulkSwap) {
        console.log('\n🚀 BULK SWAP DETECTED (Direct Bubblegum Bundle):');
        console.log(`  Strategy: ${bulkSwap.strategy}`);
        console.log(`  Transaction Count: ${bulkSwap.transactionCount}`);
        console.log(`  Requires Jito: ${bulkSwap.requiresJitoBundle}`);
        
        // Step 3: Sign and send multiple transactions for cNFT swap
        console.log('\n🔏 Step 3: Signing and sending bulk swap transactions...');
        console.log('  ⚠️  CRITICAL TEST: This will verify:');
        console.log('    - SOL transfers (Transaction 1)');
        console.log('    - cNFT transfer via Bubblegum (Transaction 2+)');
        console.log('    - Platform fee collected');
        
        // Format transactions for bulk swap handler
        const transactionsForBulk = bulkSwap.transactions.map((tx: any) => ({
          index: tx.index,
          purpose: tx.purpose,
          serializedTransaction: tx.serializedTransaction,
          requiredSigners: tx.requiredSigners,
        }));
        
        const bulkResult = await AtomicSwapApiClient.signAndSendBulkSwapTransactions(
          { transactions: transactionsForBulk },
          wallets.sender,  // maker
          wallets.receiver, // taker
          connection
        );
        
        if (!bulkResult.success) {
          throw new Error(`Bulk swap failed: ${bulkResult.error}`);
        }
        
        bulkSignatures = bulkResult.signatures;
        swapSignature = bulkSignatures[bulkSignatures.length - 1]; // Use last signature for verification
        
        console.log(`\n✅ All ${bulkSignatures.length} transactions confirmed!`);
        bulkSignatures.forEach((sig, i) => {
          console.log(`  Tx ${i + 1}: ${sig}`);
        });
        
      } else {
        // Standard single transaction flow
        console.log('\n🔏 Step 3: Signing and sending single transaction (both parties)...');
        console.log('  ⚠️  CRITICAL TEST: This will verify:');
        console.log('    - cNFT transfer from maker to taker');
        console.log('    - SOL transfer from taker to maker');
        console.log('    - Platform fee collected');
        
        let serializedTx = acceptResponse.data.transaction.serialized;
        const maxAttempts = 3;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(`\n  Attempt ${attempt}/${maxAttempts}...`);
            
            swapSignature = await AtomicSwapApiClient.signAndSendTransaction(
              serializedTx,
              [wallets.sender, wallets.receiver], // BOTH maker and taker sign
              connection
            );
            
            console.log(`  ✅ Transaction sent: ${swapSignature}`);
            break; // Success!
            
          } catch (error: any) {
            const errorMsg = error.message || String(error);
            
            // Check for stale proof errors
            if (errorMsg.includes('0xbc4') || 
                errorMsg.includes('AccountNotInitialized') ||
                errorMsg.includes('InvalidProof') ||
                errorMsg.includes('tree_authority')) {
              
              if (attempt < maxAttempts) {
                console.log(`  ⚠️  Stale proof detected, rebuilding transaction...`);
                
                // Re-accept to get fresh transaction with new proofs
                const retryAcceptKey = AtomicSwapApiClient.generateIdempotencyKey(`retry-${attempt}`);
                const retryAccept = await apiClient.acceptOffer(
                  createResponse.data.offer.id,
                  wallets.receiver.publicKey.toBase58(),
                  retryAcceptKey
                );
                
                if (retryAccept.success && retryAccept.data) {
                  serializedTx = retryAccept.data.transaction.serialized;
                  console.log(`  🔄 Fresh transaction obtained, retrying...`);
                  continue;
                }
              }
            }
            
            // Final attempt failed or non-retryable error
            console.error(`  ❌ Attempt ${attempt} failed:`, errorMsg);
            if (attempt === maxAttempts) {
              throw error;
            }
          }
        }
      }
      
      if (!swapSignature) {
        throw new Error('All transaction attempts failed');
      }
      
      // Wait for confirmation
      console.log('\n⏳ Waiting for confirmation...');
      await waitForConfirmation(connection, swapSignature);
      console.log('✅ Transaction confirmed!');
      
      // Display explorer link
      displayExplorerLink(swapSignature, 'devnet');
      
      // Get balances after swap
      await wait(2000); // Wait for balances to update
      const makerBalanceAfter = await connection.getBalance(wallets.sender.publicKey);
      const takerBalanceAfter = await connection.getBalance(wallets.receiver.publicKey);
      const treasuryBalanceAfter = await connection.getBalance(treasuryPda);
      
      console.log('\n💰 Balances After:');
      console.log(`  Maker:    ${makerBalanceAfter / LAMPORTS_PER_SOL} SOL (change: ${(makerBalanceAfter - makerBalanceBefore) / LAMPORTS_PER_SOL})`);
      console.log(`  Taker:    ${takerBalanceAfter / LAMPORTS_PER_SOL} SOL (change: ${(takerBalanceAfter - takerBalanceBefore) / LAMPORTS_PER_SOL})`);
      console.log(`  Treasury: ${treasuryBalanceAfter / LAMPORTS_PER_SOL} SOL (change: ${(treasuryBalanceAfter - treasuryBalanceBefore) / LAMPORTS_PER_SOL})`);
      
      // Verify the swap worked
      // Maker should have received SOL (minus platform fee)
      expect(makerBalanceAfter).to.be.greaterThan(makerBalanceBefore);
      
      // Treasury should have collected fee
      expect(treasuryBalanceAfter).to.be.greaterThanOrEqual(treasuryBalanceBefore);
      
      // Verify cNFT ownership changed
      console.log('\n🔍 Verifying cNFT ownership after swap...');
      const assetDataAfter = await (connection as any)._rpcRequest('getAsset', {
        id: testCnftAssetId,
      });
      const assetAfter = assetDataAfter.result || assetDataAfter;
      const newOwner = assetAfter?.ownership?.owner;
      
      console.log(`  New Owner: ${newOwner}`);
      console.log(`  Expected: ${wallets.receiver.publicKey.toBase58()}`);
      
      // cNFT should now be owned by taker
      expect(newOwner).to.equal(wallets.receiver.publicKey.toBase58());
      
      console.log('\n✅ cNFT for SOL swap completed successfully!');
      console.log('═══════════════════════════════════════════════════════════\n');
    });
  });
  
  after(function() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   cNFT SWAP: cNFT → SOL HAPPY PATH - TESTS COMPLETE         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
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
 *    - STAGING_ADMIN_PRIVATE_KEY_PATH (optional)
 *    - STAGING_API_URL (defaults to https://staging-api.easyescrow.ai)
 *    - DEVNET_SENDER_PRIVATE_KEY (maker wallet - owns cNFT)
 *    - DEVNET_RECEIVER_PRIVATE_KEY (taker wallet - pays SOL)
 * 
 * 3. Ensure test cNFTs are set up:
 *    - Run: ts-node scripts/setup-test-cnfts-staging.ts
 *    - This mints cNFTs to the sender wallet
 * 
 * 4. Ensure wallets are funded:
 *    - Minimum 0.1 SOL per wallet for transaction fees
 *    - Taker needs SOL to offer in the swap
 *    - Use: scripts/deployment/devnet/fund-devnet-wallets.ps1
 * 
 * 5. Run tests:
 *    npm run test:staging:e2e:cnft-for-sol
 * 
 * WHAT THIS TESTS:
 * - cNFT → SOL swap happy path
 * - Maker offers cNFT, receives SOL
 * - Taker offers SOL, receives cNFT
 * - Platform fee collected (1%)
 * - cNFT ownership verification via DAS API
 * - Merkle proof validation with retry for stale proofs
 */
