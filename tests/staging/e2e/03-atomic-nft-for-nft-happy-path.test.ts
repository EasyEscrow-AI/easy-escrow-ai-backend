/**
 * Atomic Swap E2E Test: NFT for NFT Happy Path (Staging)
 * 
 * Tests the complete flow of swapping NFT ↔ NFT including:
 * - Pure NFT swap with flat fee (no SOL exchanged)
 * - Dual NFT ownership verification
 * - Cross-collection swaps
 */

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
  createTestNFT,
  displayNFTInfo,
  NFTDetails,
} from '../../helpers/devnet-nft-setup';
import { wait, generateTestAgreementId } from '../../helpers/test-utils';
import { AtomicSwapApiClient } from '../../helpers/atomic-swap-api-client';
import {
  verifyBalanceChange,
  verifyNFTOwner,
  getNFTOwner,
  verifyNonceAdvanced,
  getNonceData,
  waitForConfirmation,
  displayExplorerLink,
  displayTestSummary,
} from '../../helpers/swap-verification';

// Test configuration
const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei');
const PLATFORM_AUTHORITY_PATH = process.env.STAGING_ADMIN_PRIVATE_KEY_PATH || 
  path.join(__dirname, '../../../wallets/staging/staging-deployer.json');
const STAGING_API_URL = process.env.STAGING_API_URL || 'http://localhost:3000';
const ATOMIC_SWAP_API_KEY = process.env.ATOMIC_SWAP_API_KEY || '';

describe('🔄 Atomic Swap E2E: NFT for NFT - Happy Path (Staging)', () => {
  let connection: Connection;
  let program: Program;
  let platformAuthority: Keypair;
  let treasuryPda: PublicKey;
  let wallets: DevnetWallets;
  let makerNFT: NFTDetails;
  let takerNFT: NFTDetails;
  let apiClient: AtomicSwapApiClient;
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   ATOMIC SWAP: NFT ↔ NFT HAPPY PATH - STAGING SETUP         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    // Setup connection
    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);
    
    // Load platform authority
    const authoritySecret = JSON.parse(fs.readFileSync(PLATFORM_AUTHORITY_PATH, 'utf8'));
    platformAuthority = Keypair.fromSecretKey(new Uint8Array(authoritySecret));
    console.log('🔑 Platform Authority:', platformAuthority.publicKey.toBase58());
    
    // Load IDL
    const idlPath = path.join(__dirname, '../../../target/idl/escrow.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    idl.address = PROGRAM_ID.toBase58();
    
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
    
    // Create test NFTs for both parties
    console.log('\n🎨 Creating test NFTs for swap...\n');
    
    console.log('Creating Maker NFT...');
    makerNFT = await createTestNFT(connection, wallets.sender, {
      name: 'Maker NFT (NFT↔NFT Swap)',
      symbol: 'MAKERNFT',
    });
    displayNFTInfo(makerNFT);
    
    console.log('Creating Taker NFT...');
    takerNFT = await createTestNFT(connection, wallets.receiver, {
      name: 'Taker NFT (NFT↔NFT Swap)',
      symbol: 'TAKERNFT',
    });
    displayNFTInfo(takerNFT);
    
    // Initialize API client
    console.log('\n🔌 Initializing API client...');
    console.log(`  API URL: ${STAGING_API_URL}`);
    apiClient = new AtomicSwapApiClient(STAGING_API_URL, ATOMIC_SWAP_API_KEY);
    console.log('✅ API client initialized');
    
    console.log('\n✅ Setup complete\n');
  });
  
  describe('Scenario 1: Pure NFT ↔ NFT Swap', () => {
    it('should successfully swap NFT for NFT', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: Pure NFT ↔ NFT Swap');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📦 Swap Details:');
      console.log(`  Maker offers: NFT (${makerNFT.mint.toString()})`);
      console.log(`  Taker offers: NFT (${takerNFT.mint.toString()})`);
      console.log(`  SOL amount:   0 (pure NFT swap)`);
      
      // Get initial state
      const makerBalanceBefore = await connection.getBalance(wallets.sender.publicKey);
      const takerBalanceBefore = await connection.getBalance(wallets.receiver.publicKey);
      const makerNFTOwnerBefore = await getNFTOwner(connection, makerNFT.mint);
      const takerNFTOwnerBefore = await getNFTOwner(connection, takerNFT.mint);
      
      console.log('\n💰 Balances Before:');
      console.log(`  Maker:         ${(makerBalanceBefore / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
      console.log(`  Taker:         ${(takerBalanceBefore / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
      
      console.log('\n🎨 NFT Owners Before:');
      console.log(`  Maker NFT owned by: ${makerNFTOwnerBefore.toBase58()}`);
      console.log(`  Taker NFT owned by: ${takerNFTOwnerBefore.toBase58()}`);
      
      // Verify initial ownership
      expect(makerNFTOwnerBefore.toBase58()).to.equal(wallets.sender.publicKey.toBase58());
      expect(takerNFTOwnerBefore.toBase58()).to.equal(wallets.receiver.publicKey.toBase58());
      
      // Step 1: Create offer
      console.log('\n📝 Step 1: Creating offer via API...');
      const idempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('test-nft-nft');
      
      const createResponse = await apiClient.createOffer({
        makerWallet: wallets.sender.publicKey.toBase58(),
        takerWallet: wallets.receiver.publicKey.toBase58(),
        offeredAssets: [{
          mint: makerNFT.mint.toBase58(),
          isCompressed: false,
        }],
        requestedAssets: [{
          mint: takerNFT.mint.toBase58(),
          isCompressed: false,
        }],
      }, idempotencyKey);
      
      if (!createResponse.success || !createResponse.data) {
        throw new Error(`Failed to create offer: ${createResponse.message || 'Unknown error'}`);
      }
      
      console.log(`✅ Offer created: ${createResponse.data.offer.id}`);
      console.log(`  Nonce Account: ${createResponse.data.transaction.nonceAccount}`);
      
      // Get nonce value before
      const nonceAccountPubkey = new PublicKey(createResponse.data.transaction.nonceAccount);
      const { nonce: nonceBefore } = await getNonceData(connection, nonceAccountPubkey);
      console.log(`  Nonce Before: ${nonceBefore.substring(0, 20)}...`);
      
      // Step 2: Accept offer
      console.log('\n🤝 Step 2: Accepting offer via API...');
      const acceptIdempotencyKey = AtomicSwapApiClient.generateIdempotencyKey('test-nft-nft-accept');
      const acceptResponse = await apiClient.acceptOffer(
        createResponse.data.offer.id,
        wallets.receiver.publicKey.toBase58(),
        acceptIdempotencyKey
      );
      
      if (!acceptResponse.success || !acceptResponse.data) {
        throw new Error(`Failed to accept offer: ${acceptResponse.message || 'Unknown error'}`);
      }
      
      console.log(`✅ Offer accepted, transaction ready for signing`);
      
      // Step 3: Both parties sign and send
      console.log('\n🔏 Step 3: Signing and sending transaction (both parties)...');
      const swapSignature = await AtomicSwapApiClient.signAndSendTransaction(
        acceptResponse.data.transaction.serialized,
        [wallets.sender, wallets.receiver],
        connection
      );
      
      console.log(`✅ Swap transaction sent: ${swapSignature}`);
      displayExplorerLink(swapSignature, 'devnet');
      
      // Wait for confirmation
      await waitForConfirmation(connection, swapSignature, 'confirmed');
      
      // Step 4: Confirm swap
      console.log('\n✅ Step 4: Confirming swap completion...');
      await apiClient.confirmOffer(createResponse.data.offer.id, swapSignature);
      
      // Verify final state
      console.log('\n🔍 Verifying final state...');
      
      // Check NFT ownership swapped
      const makerNFTOwnerAfter = await getNFTOwner(connection, makerNFT.mint);
      const takerNFTOwnerAfter = await getNFTOwner(connection, takerNFT.mint);
      
      console.log('\n🎨 NFT Owners After:');
      console.log(`  Maker NFT now owned by: ${makerNFTOwnerAfter.toBase58()}`);
      console.log(`  Taker NFT now owned by: ${takerNFTOwnerAfter.toBase58()}`);
      
      // Verify ownership transfer
      expect(makerNFTOwnerAfter.toBase58()).to.equal(wallets.receiver.publicKey.toBase58(), 
        'Maker NFT should now be owned by taker');
      expect(takerNFTOwnerAfter.toBase58()).to.equal(wallets.sender.publicKey.toBase58(), 
        'Taker NFT should now be owned by maker');
      
      // Verify nonce advanced
      const { nonce: nonceAfter } = await getNonceData(connection, nonceAccountPubkey);
      expect(nonceAfter).to.not.equal(nonceBefore, 'Nonce should have advanced');
      
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('✅ NFT ↔ NFT swap completed successfully!');
      console.log('✅ Both NFTs transferred to correct owners');
      console.log('✅ Nonce advanced correctly');
      console.log('═══════════════════════════════════════════════════════════\n');
    });
  });
});
