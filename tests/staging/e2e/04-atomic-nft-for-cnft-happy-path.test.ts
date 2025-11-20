/**
 * Atomic Swap E2E Test: NFT for cNFT Happy Path (Staging)
 * 
 * ⚠️  NOTE: This test requires cNFT creation infrastructure
 * 
 * Tests the complete flow of swapping a standard NFT for a compressed NFT including:
 * - NFT and cNFT ownership verification
 * - Merkle proof validation for cNFT
 * - Cross-format asset swaps
 * 
 * TODO: Implement cNFT creation helper before enabling this test
 * TODO: Add Merkle tree setup and cNFT minting
 * TODO: Verify both NFT (via getAccount) and cNFT (via DAS API) ownership
 */

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
import {
  createTestNFT,
  displayNFTInfo,
  NFTDetails,
} from '../../helpers/devnet-nft-setup';
import { wait, generateTestAgreementId } from '../../helpers/test-utils';
import { AtomicSwapApiClient } from '../../helpers/atomic-swap-api-client';
import {
  getNFTOwner,
  getNonceData,
  waitForConfirmation,
  displayExplorerLink,
} from '../../helpers/swap-verification';

// Test configuration
const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei');
const PLATFORM_AUTHORITY_PATH = process.env.STAGING_ADMIN_PRIVATE_KEY_PATH || 
  path.join(__dirname, '../../../wallets/staging/staging-deployer.json');
const STAGING_API_URL = process.env.STAGING_API_URL || 'http://localhost:3000';
const ATOMIC_SWAP_API_KEY = process.env.ATOMIC_SWAP_API_KEY || '';

// TODO: Replace with actual cNFT after creation
const MOCK_CNFT_ASSET_ID = 'PLACEHOLDER-cNFT-ASSET-ID';

describe('🔀 Atomic Swap E2E: NFT for cNFT - Happy Path (Staging) [REQUIRES cNFT INFRASTRUCTURE]', () => {
  let connection: Connection;
  let program: Program;
  let platformAuthority: Keypair;
  let treasuryPda: PublicKey;
  let wallets: DevnetWallets;
  let makerNFT: NFTDetails;
  let apiClient: AtomicSwapApiClient;
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   ATOMIC SWAP: NFT ↔ cNFT HAPPY PATH - STAGING SETUP        ║');
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
    
    // Create test NFT for maker
    console.log('\n🎨 Creating test NFT for maker...');
    makerNFT = await createTestNFT(connection, wallets.sender, {
      name: 'Maker NFT (NFT→cNFT Swap)',
      symbol: 'MAKNFT',
    });
    displayNFTInfo(makerNFT);
    
    // Initialize API client
    console.log('\n🔌 Initializing API client...');
    console.log(`  API URL: ${STAGING_API_URL}`);
    apiClient = new AtomicSwapApiClient(STAGING_API_URL, ATOMIC_SWAP_API_KEY);
    console.log('✅ API client initialized');
    
    // cNFT creation placeholder
    console.log('\n🌳 cNFT Setup for Taker:');
    console.log('  ❌ cNFT creation not yet implemented');
    console.log(`  📝 Using placeholder: ${MOCK_CNFT_ASSET_ID}`);
    console.log('  📝 TODO: Create cNFT in taker wallet');
    console.log('  📝 TODO: Verify cNFT ownership via QuickNode DAS API\n');
    
    console.log('⚠️  Test setup complete but cNFT infrastructure pending\n');
  });
  
  describe('Scenario 1: NFT for cNFT Swap [PENDING cNFT INFRASTRUCTURE]', () => {
    it.skip('should successfully swap NFT for cNFT', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: NFT for cNFT Swap');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('⚠️  SKIPPED: Requires cNFT creation infrastructure');
      console.log('\n📝 Implementation Checklist:');
      console.log('  [ ] Create helper: tests/helpers/devnet-cnft-setup.ts');
      console.log('  [ ] Function: createTestCNFT(connection, wallet, options)');
      console.log('  [ ] Set up Merkle tree account');
      console.log('  [ ] Mint cNFT to taker wallet');
      console.log('  [ ] Verify standard NFT ownership (getAccount)');
      console.log('  [ ] Verify cNFT ownership (getAsset RPC)');
      console.log('  [ ] Get Merkle proof (getAssetProof RPC)');
      console.log('  [ ] Implement swap flow with mixed asset types');
      console.log('  [ ] Verify both NFT and cNFT transferred correctly');
      console.log('═══════════════════════════════════════════════════════════\n');
      
      // Example flow (once cNFT infrastructure is ready):
      /*
      const createResponse = await apiClient.createOffer({
        makerWallet: wallets.sender.publicKey.toBase58(),
        takerWallet: wallets.receiver.publicKey.toBase58(),
        offeredAssets: [{
          mint: makerNFT.mint.toBase58(),
          isCompressed: false,  // Standard NFT
        }],
        requestedAssets: [{
          mint: CNFT_ASSET_ID,  // From createTestCNFT()
          isCompressed: true,   // Compressed NFT
        }],
      }, idempotencyKey);
      
      // ... rest of swap flow
      
      // Verify mixed asset transfer:
      // - NFT now owned by taker (via getAccount)
      // - cNFT now owned by maker (via getAsset RPC)
      */
    });
  });
});
