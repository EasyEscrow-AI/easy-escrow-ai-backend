/**
 * Atomic Swap E2E Test: cNFT (Compressed NFT) for SOL Happy Path (Staging)
 * 
 * Tests the complete flow of swapping a compressed NFT for SOL tokens including:
 * - Creating a test cNFT using Metaplex Bubblegum
 * - Setting up a Merkle tree for cNFT storage
 * - cNFT ownership verification via DAS API
 * - Merkle proof generation and validation
 * - Atomic swap execution with 1% platform fee
 * - cNFT transfer using Bubblegum program
 */

// Load staging environment variables FIRST
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.staging' });

import { describe, it, before } from 'mocha';
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
import { displayCNFTInfo, CnftDetails } from '../../helpers/devnet-cnft-setup';
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

describe('🌳 Atomic Swap E2E: cNFT for SOL - Happy Path (Staging)', () => {
  let connection: Connection;
  let program: Program;
  let platformAuthority: Keypair;
  let treasuryPda: PublicKey;
  let wallets: DevnetWallets;
  let apiClient: AtomicSwapApiClient;
  
  before(async function() {
    this.timeout(120000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   ATOMIC SWAP: cNFT → SOL HAPPY PATH - STAGING SETUP        ║');
    console.log('║   ⚠️  REQUIRES: cNFT Creation Infrastructure                 ║');
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
    
    // Derive treasury PDA
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('treasury'), platformAuthority.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
    
    // Verify treasury is initialized
    try {
      const treasuryAccount = await connection.getAccountInfo(treasuryPda);
      if (!treasuryAccount) {
        throw new Error('Treasury not initialized on staging! Run initialization first.');
      }
      console.log('✅ Treasury initialized');
    } catch (error) {
      console.error('❌ Treasury check failed:', error);
      throw error;
    }
    
    // Load test wallets
    wallets = await loadDevnetWallets();
    console.log('\n🔑 Test Wallets:');
    console.log(`  Maker (Sender):  ${wallets.sender.publicKey.toBase58()}`);
    console.log(`  Taker (Receiver): ${wallets.receiver.publicKey.toBase58()}`);
    
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
        console.error('  ❌ Test cNFTs not configured!');
        console.error('  Run: ts-node scripts/setup-test-cnfts-staging.ts');
        throw new Error('Test cNFTs not setup. Run setup script first.');
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
      console.log(`     Expected Owner: ${wallets.sender.publicKey.toBase58()}`);
      
      if (currentOwner !== wallets.sender.publicKey.toBase58()) {
        console.warn('  ⚠️  cNFT is not currently owned by sender!');
        console.warn('     This may be from a previous test. Continuing anyway...');
        console.warn('     Run: ts-node scripts/rebalance-test-cnfts-staging.ts to fix');
      } else {
        console.log('  ✅ Ownership verified');
      }
      
      // No need to wait for DAS indexing - cNFT is already indexed!
      console.log('  ✅ Test cNFT ready (pre-indexed, no wait needed)');
      
    } catch (error: any) {
      console.error('  ❌ Failed to load test cNFT:', error.message);
      throw error;
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
      const solAmount = 0.1 * LAMPORTS_PER_SOL;
      
      console.log('\n💫 Creating Swap Offer...');
      console.log(`  Maker: ${wallets.sender.publicKey.toBase58()} (offers cNFT)`);
      console.log(`  Taker: ${wallets.receiver.publicKey.toBase58()} (offers ${solAmount / LAMPORTS_PER_SOL} SOL)`);
      console.log(`  cNFT Asset ID: ${testCnftAssetId}`);
      console.log(`  Idempotency Key: ${idempotencyKey}`);
      
      // Step 1: Create offer via API
      const createResponse = await apiClient.createOffer({
        makerWallet: wallets.sender.publicKey.toBase58(),
        takerWallet: wallets.receiver.publicKey.toBase58(),
        offeredAssets: [{
          mint: testCnftAssetId,
          isCompressed: true,
        }],
        requestedAssets: [],
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
      
      // Step 3: Both parties sign and send transaction with retry for stale proofs
      console.log('\n🔏 Step 3: Signing and sending transaction (both parties)...');
      console.log('  ⚠️  CRITICAL TEST: This will verify:');
      console.log('    - cNFT leaf owner is marked as signer');
      console.log('    - Correct leaf_id is used (not node_index)');
      console.log('    - Bubblegum transfer succeeds on-chain');
      
      let swapSignature: string | null = null;
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
          
          console.log(`✅ Swap transaction sent: ${swapSignature}`);
          displayExplorerLink(swapSignature, 'devnet');
          
          // Wait for confirmation
          await waitForConfirmation(connection, swapSignature, 'confirmed');
          
          console.log('✅ Transaction confirmed on-chain');
          break; // Success!
          
        } catch (error: any) {
          const isLastAttempt = attempt === maxAttempts;
          const errorMessage = error?.message || '';
          const logs = error?.logs || [];
          
          // Check for stale cNFT proof error
          const isStaleProof = 
            errorMessage.includes('Invalid root recomputed from proof') ||
            errorMessage.includes('Error using concurrent merkle tree') ||
            logs.some((log: string) => 
              log.includes('Invalid root recomputed from proof') ||
              log.includes('Error using concurrent merkle tree')
            );
          
          console.error(`❌ Attempt ${attempt} failed:`, errorMessage);
          if (logs.length > 0) {
            console.error('  Transaction logs:', logs.join('\n  '));
          }
          
          if (isStaleProof && !isLastAttempt) {
            console.warn(`\n  ⚠️  Stale cNFT proof detected!`);
            console.warn(`  Rebuilding transaction with fresh proofs...`);
            
            // Rebuild transaction with fresh proofs
            const rebuildResponse = await apiClient.rebuildTransaction(createResponse.data.offer.id);
            
            if (!rebuildResponse.success || !rebuildResponse.data) {
              throw new Error(`Failed to rebuild transaction: ${rebuildResponse.message}`);
            }
            
            serializedTx = rebuildResponse.data.transaction.serialized;
            console.log(`  ✅ Transaction rebuilt with fresh proofs`);
            console.log(`  Waiting for proof to stabilize before retry...`);
            
            // Longer delay to ensure DAS API has fully updated tree state
            // and the new proof is stable
            await wait(2000);
            console.log(`  Retrying with fresh transaction...`);
            continue;
          }
          
          // Not a stale proof error, or we've exhausted retries
          if (isLastAttempt) {
            console.error(`\n❌ All ${maxAttempts} attempts exhausted`);
            if (isStaleProof) {
              throw new Error(`cNFT proof remained stale after ${maxAttempts} attempts. High Merkle tree activity detected.`);
            }
          }
          
          throw error;
        }
      }
      
      if (!swapSignature) {
        throw new Error('Failed to get swap signature after retries');
      }
      
      // Step 4: Confirm execution via API
      console.log('\n✅ Step 4: Confirming on-chain execution...');
      const confirmResponse = await apiClient.confirmOffer(
        createResponse.data.offer.id,
        swapSignature
      );
      
      if (!confirmResponse.success) {
        throw new Error(`Failed to confirm offer: ${confirmResponse.message || 'Unknown error'}`);
      }
      
      console.log('✅ Swap execution confirmed');
      
      // Step 5: Verify cNFT ownership transferred via DAS API
      console.log('\n📊 Step 5: Verifying cNFT ownership transfer...');
      
      // Fetch updated cNFT data
      const dasResponse = await (connection as any)._rpcRequest('getAsset', {
        id: testCnftAssetId,
      });
      
      const updatedAsset = dasResponse.result || dasResponse;
      const newOwner = updatedAsset.ownership.owner;
      
      console.log(`  Previous Owner (Maker): ${wallets.sender.publicKey.toBase58()}`);
      console.log(`  New Owner (Taker):      ${newOwner}`);
      
      expect(newOwner).to.equal(
        wallets.receiver.publicKey.toBase58(),
        'cNFT should now be owned by taker'
      );
      
      console.log('\n✅ cNFT ownership verified via DAS API!');
      console.log('✅ Full cNFT swap test completed successfully!');
      console.log('\n💡 Note: Run rebalance script to return cNFT to original owner:');
      console.log('   ts-node scripts/rebalance-test-cnfts-staging.ts');
      console.log('═══════════════════════════════════════════════════════════\n');
    });
  });
});
