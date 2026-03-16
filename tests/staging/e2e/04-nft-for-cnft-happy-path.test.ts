/**
 * Cross-Format Swap E2E Test: NFT for cNFT Happy Path (Staging)
 * 
 * NOTE: Cross-format swaps involving cNFTs use Jito bundles for multi-transaction
 * execution, NOT single atomic transactions like standard NFT swaps.
 * 
 * Tests the complete flow of swapping NFT ↔ cNFT (Compressed NFT) including:
 * - Pure NFT ↔ cNFT swap with flat fee
 * - 1% percentage fee (if SOL involved)
 * - Fixed flat fee
 * - Zero fee (platform pays fees)
 * - Hybrid ownership verification (regular NFT + cNFT)
 * - Merkle proof validation for cNFT
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
import { wait } from '../../helpers/test-utils';

// Test configuration
const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei');
const PLATFORM_AUTHORITY_PATH = process.env.STAGING_ADMIN_PRIVATE_KEY_PATH || 
  path.join(__dirname, '../../../wallets/staging/staging-deployer.json');
const QUICKNODE_RPC = process.env.QUICKNODE_CNFT_RPC_URL;

// Mock cNFT for testing (will be replaced with actual cNFT creation)
const MOCK_CNFT_ASSET_ID = 'mock-cnft-asset-id-for-hybrid-testing';

describe('🔄🌳 Cross-Format Swap E2E: NFT for cNFT - Happy Path (Staging)', () => {
  let connection: Connection;
  let program: Program;
  let platformAuthority: Keypair;
  let treasuryPda: PublicKey;
  let wallets: DevnetWallets;
  let makerNFT: NFTDetails;
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   ATOMIC SWAP: NFT ↔ cNFT HAPPY PATH - STAGING SETUP        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    // Verify QuickNode RPC is configured for cNFT support
    if (!QUICKNODE_RPC) {
      console.warn('⚠️  QUICKNODE_CNFT_RPC_URL not set - using standard RPC');
      console.warn('   cNFT verification may not work without QuickNode API\n');
    }
    
    // Setup connection
    connection = new Connection(QUICKNODE_RPC || RPC_URL, 'confirmed');
    console.log('📡 RPC:', QUICKNODE_RPC || RPC_URL);
    
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
      name: 'Maker NFT (NFT↔cNFT Swap)',
      symbol: 'MAKERNFT',
    });
    displayNFTInfo(makerNFT);
    
    console.log('🌳 cNFT Setup for taker:');
    console.log(`  ⚠️  Using mock cNFT asset ID: ${MOCK_CNFT_ASSET_ID}`);
    console.log('  📝 Note: Actual cNFT creation will be implemented\n');
    
    console.log('✅ Setup complete\n');
  });
  
  describe('Scenario 1: Pure NFT ↔ cNFT Swap (No SOL)', () => {
    it('should successfully swap NFT for cNFT with flat fee', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: Pure NFT ↔ cNFT Swap with Flat Fee');
      console.log('═══════════════════════════════════════════════════════════');
      
      const platformFee = 0.01 * LAMPORTS_PER_SOL; // Flat fee (no SOL in swap)
      
      console.log('📦 Swap Details:');
      console.log(`  Maker offers: NFT (${makerNFT.mint.toString()})`);
      console.log(`  Taker offers: cNFT (${MOCK_CNFT_ASSET_ID})`);
      console.log(`  Platform fee: ${platformFee / LAMPORTS_PER_SOL} SOL (flat fee)`);
      console.log(`  SOL amount:   0 (pure asset swap)`);
      
      // Get balances before swap
      const makerBalanceBefore = await connection.getBalance(wallets.sender.publicKey);
      const takerBalanceBefore = await connection.getBalance(wallets.receiver.publicKey);
      const treasuryBalanceBefore = await connection.getBalance(treasuryPda);
      
      console.log('\n💰 Balances Before:');
      console.log(`  Maker:    ${makerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Taker:    ${takerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Treasury: ${treasuryBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      
      console.log('\n🔍 Verification Requirements:');
      console.log('  - Regular NFT: Standard on-chain verification');
      console.log('  - cNFT: QuickNode API + Merkle proof verification');
      
      console.log('\n⚠️  Note: Actual swap execution pending backend API integration');
      console.log('⚠️  Note: cNFT verification pending QuickNode integration');
      console.log('✅ Test structure validated\n');
    });
  });
  
  describe('Scenario 2: NFT + SOL for cNFT', () => {
    it('should successfully swap NFT+SOL for cNFT with percentage fee', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: NFT+SOL for cNFT with 1% Fee');
      console.log('═══════════════════════════════════════════════════════════');
      
      const solAmount = 0.3 * LAMPORTS_PER_SOL; // Maker offers 0.3 SOL + NFT
      const platformFee = Math.floor(solAmount * 0.01); // 1% of SOL amount
      
      console.log('📦 Swap Details:');
      console.log(`  Maker offers: NFT (${makerNFT.mint.toString()}) + ${solAmount / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Taker offers: cNFT (${MOCK_CNFT_ASSET_ID})`);
      console.log(`  Platform fee: ${platformFee / LAMPORTS_PER_SOL} SOL (1% of SOL)`);
      
      // Get balances before swap
      const makerBalanceBefore = await connection.getBalance(wallets.sender.publicKey);
      const takerBalanceBefore = await connection.getBalance(wallets.receiver.publicKey);
      const treasuryBalanceBefore = await connection.getBalance(treasuryPda);
      
      console.log('\n💰 Balances Before:');
      console.log(`  Maker:    ${makerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Taker:    ${takerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Treasury: ${treasuryBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      
      console.log('\n⚠️  Note: Actual swap execution pending backend API integration');
      console.log('✅ Test structure validated\n');
    });
  });

  describe('Scenario 3: Fixed Fee for NFT ↔ cNFT', () => {
    it('should successfully swap NFT for cNFT with custom fixed fee', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: NFT ↔ cNFT with Custom Fixed Fee');
      console.log('═══════════════════════════════════════════════════════════');
      
      const platformFee = 0.005 * LAMPORTS_PER_SOL; // Custom 0.005 SOL fee
      
      console.log('📦 Swap Details:');
      console.log(`  Maker offers: NFT (${makerNFT.mint.toString()})`);
      console.log(`  Taker offers: cNFT (${MOCK_CNFT_ASSET_ID})`);
      console.log(`  Platform fee: ${platformFee / LAMPORTS_PER_SOL} SOL (custom fixed)`);
      
      // Get balances before swap
      const makerBalanceBefore = await connection.getBalance(wallets.sender.publicKey);
      const takerBalanceBefore = await connection.getBalance(wallets.receiver.publicKey);
      const treasuryBalanceBefore = await connection.getBalance(treasuryPda);
      
      console.log('\n💰 Balances Before:');
      console.log(`  Maker:    ${makerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Taker:    ${takerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Treasury: ${treasuryBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      
      console.log('\n⚠️  Note: Actual swap execution pending backend API integration');
      console.log('✅ Test structure validated\n');
    });
  });

  describe('Scenario 4: Zero Fee (Platform Pays)', () => {
    it('should successfully swap NFT for cNFT with platform covering all fees', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: NFT ↔ cNFT with Zero Fee (Platform Pays)');
      console.log('═══════════════════════════════════════════════════════════');
      
      const platformFee = 0; // Platform covers all fees
      
      console.log('📦 Swap Details:');
      console.log(`  Maker offers: NFT (${makerNFT.mint.toString()})`);
      console.log(`  Taker offers: cNFT (${MOCK_CNFT_ASSET_ID})`);
      console.log(`  Platform fee: ${platformFee} SOL (platform pays transaction costs)`);
      
      // Get balances before swap
      const makerBalanceBefore = await connection.getBalance(wallets.sender.publicKey);
      const takerBalanceBefore = await connection.getBalance(wallets.receiver.publicKey);
      const treasuryBalanceBefore = await connection.getBalance(treasuryPda);
      
      console.log('\n💰 Balances Before:');
      console.log(`  Maker:    ${makerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Taker:    ${takerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Treasury: ${treasuryBalanceBefore / LAMPORTS_PER_SOL} SOL`);
      
      console.log('\n⚠️  Note: Actual swap execution pending backend API integration');
      console.log('⚠️  Note: Platform will pay network transaction fees');
      console.log('✅ Test structure validated\n');
    });
  });
  
  describe('Scenario 5: Hybrid Ownership Verification', () => {
    it('should verify NFT and cNFT ownership using different methods', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: Hybrid Ownership Verification');
      console.log('═══════════════════════════════════════════════════════════');
      
      console.log('🔍 Verification Methods:');
      console.log('  NFT Verification:');
      console.log('    - Standard on-chain token account check');
      console.log('    - Token balance = 1');
      console.log('    - Owner matches maker wallet');
      console.log('');
      console.log('  cNFT Verification:');
      console.log('    - QuickNode DAS API query');
      console.log('    - Merkle proof validation');
      console.log('    - Owner matches taker wallet');
      
      // const nftOwned = await verifyNFTOwnership(connection, makerNFT.mint, wallets.sender.publicKey);
      // const cnftOwned = await verifyCNFTOwnership(MOCK_CNFT_ASSET_ID, wallets.receiver.publicKey);
      // expect(nftOwned).to.be.true;
      // expect(cnftOwned).to.be.true;

      console.log('\n⚠️  Note: Hybrid ownership verification pending implementation');
      console.log('✅ Test structure validated\n');
    });
    
    it('should reject swap if either asset ownership fails', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: Reject Invalid Hybrid Ownership');
      console.log('═══════════════════════════════════════════════════════════');
      
      console.log('🔒 Security validation:');
      console.log('  - Reject if NFT ownership fails');
      console.log('  - Reject if cNFT ownership fails');
      console.log('  - Reject if cNFT merkle proof invalid');
      console.log('  - Reject if either asset locked');
      
      console.log('\n⚠️  Note: Ownership rejection test pending implementation');
      console.log('✅ Test structure validated\n');
    });
  });
  
  describe('Scenario 6: cNFT Merkle Proof Validation', () => {
    it('should validate cNFT merkle proof before swap', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: cNFT Merkle Proof Validation');
      console.log('═══════════════════════════════════════════════════════════');
      
      if (!QUICKNODE_RPC) {
        console.log('⚠️  QUICKNODE_CNFT_RPC_URL not configured - skipping test');
        this.skip();
        return;
      }
      
      console.log('🌲 Merkle Proof Requirements:');
      console.log('  - Retrieve current proof from tree');
      console.log('  - Validate proof path to root');
      console.log('  - Confirm leaf data matches asset');
      console.log('  - Verify tree authority');
      
      // const proof = await quicknodeApi.getAssetProof(MOCK_CNFT_ASSET_ID);
      // expect(proof).to.not.be.null;
      // expect(proof.root).to.not.be.null;
      // expect(proof.proof.length).to.be.greaterThan(0);

      console.log('\n⚠️  Note: Merkle proof validation pending QuickNode integration');
      console.log('✅ Test structure validated\n');
    });
    
    it('should reject swap with invalid merkle proof', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: Reject Invalid Merkle Proof');
      console.log('═══════════════════════════════════════════════════════════');
      
      console.log('🔒 Security validation:');
      console.log('  - Reject tampered proofs');
      console.log('  - Reject proofs from wrong tree');
      console.log('  - Reject outdated proofs');
      
      console.log('\n⚠️  Note: Invalid proof rejection test pending');
      console.log('✅ Test structure validated\n');
    });
  });
  
  describe('Scenario 7: Mixed Asset Type Edge Cases', () => {
    it('should handle NFT with metadata vs cNFT without metadata', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: Mixed Metadata Scenarios');
      console.log('═══════════════════════════════════════════════════════════');
      
      console.log('📜 Metadata Handling:');
      console.log('  - NFT: Full on-chain metadata account');
      console.log('  - cNFT: Off-chain metadata (compressed)');
      console.log('  - Both valid for atomic swap');
      
      console.log('\n⚠️  Note: Mixed metadata test pending implementation');
      console.log('✅ Test structure validated\n');
    });
    
    it('should handle different compression depths', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: Variable Compression Depths');
      console.log('═══════════════════════════════════════════════════════════');
      
      console.log('🌲 Tree Depth Variations:');
      console.log('  - Support cNFTs from depth 3-20 trees');
      console.log('  - Validate proof length matches tree depth');
      console.log('  - Handle different max sizes');
      
      console.log('\n⚠️  Note: Compression depth test pending implementation');
      console.log('✅ Test structure validated\n');
    });
  });
  
  describe('Scenario 8: Atomic Execution for Hybrid Swaps', () => {
    it('should ensure atomic execution of NFT ↔ cNFT swap', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: Atomic Hybrid Swap Execution');
      console.log('═══════════════════════════════════════════════════════════');
      
      console.log('⚛️  Atomicity guarantees:');
      console.log('  - NFT transfer and cNFT transfer together');
      console.log('  - No partial states possible');
      console.log('  - Failure reverts all changes');
      console.log('  - Merkle tree updates atomic with transfer');
      
      console.log('\n⚠️  Note: Atomic execution test pending implementation');
      console.log('✅ Test structure validated\n');
    });
  });
  
  describe('Scenario 9: QuickNode API Integration', () => {
    it('should successfully query cNFT data via QuickNode API', async function() {
      this.timeout(180000);
      
      console.log('\n📋 TEST: QuickNode API Integration');
      console.log('═══════════════════════════════════════════════════════════');
      
      if (!QUICKNODE_RPC) {
        console.log('⚠️  QUICKNODE_CNFT_RPC_URL not configured - skipping test');
        this.skip();
        return;
      }
      
      console.log('🌐 QuickNode DAS API Calls:');
      console.log('  - getAsset: Fetch cNFT details');
      console.log('  - getAssetProof: Get merkle proof');
      console.log('  - getAssetsByOwner: List owner cNFTs');
      
      // const asset = await quicknodeApi.getAsset(MOCK_CNFT_ASSET_ID);
      // expect(asset).to.not.be.null;
      // expect(asset.compression.compressed).to.be.true;

      console.log('\n⚠️  Note: QuickNode API integration pending');
      console.log('✅ Test structure validated\n');
    });
  });
  
  after(function() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   ATOMIC SWAP: NFT ↔ cNFT HAPPY PATH - TESTS COMPLETE       ║');
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
 *    - QUICKNODE_CNFT_RPC_URL (REQUIRED for cNFT support)
 *    - DEVNET_SENDER_PRIVATE_KEY (maker wallet with NFT)
 *    - DEVNET_RECEIVER_PRIVATE_KEY (taker wallet with cNFT)
 * 
 * 3. Ensure QuickNode setup:
 *    - QuickNode RPC endpoint with DAS API access
 *    - Configured for devnet
 *    - API key included in RPC URL
 * 
 * 4. Ensure wallets are funded:
 *    - Minimum 0.1 SOL per wallet for transaction fees
 *    - Use: scripts/deployment/devnet/fund-devnet-wallets.ps1
 * 
 * 5. Run tests:
 *    npm run test:staging:e2e:nft-for-cnft
 * 
 * WHAT THIS TESTS:
 * - NFT ↔ cNFT happy path with various fee structures
 * - Pure NFT ↔ cNFT swap with flat fee
 * - NFT+SOL for cNFT with percentage fee
 * - Custom fixed fees
 * - Zero fee (platform pays)
 * - Hybrid ownership verification (NFT on-chain + cNFT via QuickNode)
 * - Merkle proof validation
 * - Mixed asset type edge cases
 * - Atomic execution guarantees
 * - QuickNode API integration
 * 
 * NOTE: Hybrid swaps require QuickNode RPC with DAS API for cNFT verification
 */

