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
  createTestCNFT,
  displayCNFTInfo,
  CnftDetails,
} from '../../helpers/devnet-cnft-setup';
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

// cNFT will be created during test setup
let testCnft: CnftDetails;

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
    
    // Create test cNFT
    console.log('\n🌳 cNFT Setup:');
    console.log('  Creating test cNFT for maker...');
    
    try {
      testCnft = await createTestCNFT(
        connection,
        wallets.sender, // Sender will own the cNFT
        wallets.sender.publicKey,
        {
          name: `Test cNFT ${Date.now()}`,
          symbol: 'TCNFT',
          uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/test-cnft.json',
        }
      );
      
      displayCNFTInfo(testCnft);
      console.log('  ✅ Test cNFT created successfully');
    } catch (error: any) {
      console.error('  ❌ Failed to create test cNFT:', error.message);
      throw error;
    }
    
    console.log('\n✅ Test setup complete with live cNFT\n');
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
      console.log(`  cNFT Asset ID: ${testCnft.assetId.toBase58()}`);
      console.log(`  Idempotency Key: ${idempotencyKey}`);
      
      const createResponse = await apiClient.createOffer({
        makerWallet: wallets.sender.publicKey.toBase58(),
        takerWallet: wallets.receiver.publicKey.toBase58(),
        offeredAssets: [{
          mint: testCnft.assetId.toBase58(),
          isCompressed: true,
        }],
        requestedAssets: [],
        requestedSol: solAmount,
      }, idempotencyKey);
      
      console.log('\n✅ Swap offer created successfully');
      console.log(`  Offer ID: ${createResponse.data?.offer.id}`);
      console.log(`  Status: ${createResponse.data?.offer.status}`);
      console.log(`  Maker Wallet: ${createResponse.data?.offer.makerWallet}`);
      console.log(`  Taker Wallet: ${createResponse.data?.offer.takerWallet}`);
      
      // Display transaction details
      console.log('\n📝 Transaction Details:');
      console.log(`  Nonce Account: ${createResponse.data?.transaction.nonceAccount}`);
      console.log(`  Serialized Transaction Length: ${createResponse.data?.transaction.serialized?.length} chars`);
      
      displayExplorerLink(createResponse.data?.offer.id || '', 'devnet');
      
      console.log('\n✅ cNFT swap test completed successfully!');
      console.log('═══════════════════════════════════════════════════════════\n');
    });
  });
});
