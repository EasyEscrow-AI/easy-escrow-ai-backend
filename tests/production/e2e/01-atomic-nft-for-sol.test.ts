/**
 * Production E2E Test: NFT for SOL Happy Path
 * 
 * Tests the complete flow of swapping an NFT for SOL tokens on mainnet including:
 * - Standard 1% platform fee
 * - Treasury fee collection
 * - Nonce validation
 * - Balance verification
 * 
 * ⚠️ IMPORTANT: This test uses REAL MAINNET wallets and incurs REAL transaction fees
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { wait } from '../../helpers/test-utils';

// Production configuration
const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx');
const TREASURY_AUTHORITY_PATH = process.env.MAINNET_TREASURY_AUTHORITY_PATH || 
  path.join(__dirname, '../../../wallets/production/production-treasury.json');
const SENDER_PATH = process.env.PRODUCTION_SENDER_PATH ||
  path.join(__dirname, '../../../wallets/production/production-sender.json');
const RECEIVER_PATH = process.env.PRODUCTION_RECEIVER_PATH ||
  path.join(__dirname, '../../../wallets/production/production-receiver.json');

describe('🚀 Production E2E: NFT → SOL - Happy Path (Mainnet)', () => {
  let connection: Connection;
  let program: Program;
  let treasuryAuthority: Keypair;
  let treasuryPda: PublicKey;
  let sender: Keypair;
  let receiver: Keypair;
  
  before(async function() {
    this.timeout(180000); // 3 minutes for mainnet
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION E2E: NFT → SOL HAPPY PATH - MAINNET SETUP      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    // Setup connection
    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);
    console.log('🌐 Network: MAINNET-BETA');
    
    // Load treasury authority
    const treasurySecret = JSON.parse(fs.readFileSync(TREASURY_AUTHORITY_PATH, 'utf8'));
    treasuryAuthority = Keypair.fromSecretKey(new Uint8Array(treasurySecret));
    console.log('🔑 Treasury Authority:', treasuryAuthority.publicKey.toBase58());
    
    // Load test wallets
    const senderSecret = JSON.parse(fs.readFileSync(SENDER_PATH, 'utf8'));
    sender = Keypair.fromSecretKey(new Uint8Array(senderSecret));
    console.log('👤 Sender (Maker):', sender.publicKey.toBase58());
    
    const receiverSecret = JSON.parse(fs.readFileSync(RECEIVER_PATH, 'utf8'));
    receiver = Keypair.fromSecretKey(new Uint8Array(receiverSecret));
    console.log('👤 Receiver (Taker):', receiver.publicKey.toBase58());
    
    // Load production IDL
    const idlPath = path.join(__dirname, '../../../src/generated/anchor/escrow-idl-production.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    idl.address = PROGRAM_ID.toBase58();
    
    // Setup provider and program
    const wallet = new Wallet(treasuryAuthority);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    program = new Program(idl, provider);
    
    // Derive treasury PDA
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('main_treasury'), treasuryAuthority.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
    
    // Verify treasury is initialized
    try {
      const treasuryAccount = await connection.getAccountInfo(treasuryPda);
      if (!treasuryAccount) {
        throw new Error('Treasury not initialized on mainnet! Run initialization script first.');
      }
      console.log('✅ Treasury initialized');
    } catch (error) {
      console.error('❌ Treasury check failed:', error);
      throw error;
    }
    
    // Verify wallet balances
    console.log('\n💰 Checking wallet balances...');
    const senderBalance = await connection.getBalance(sender.publicKey);
    const receiverBalance = await connection.getBalance(receiver.publicKey);
    
    console.log(`  Sender: ${(senderBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`  Receiver: ${(receiverBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    
    if (senderBalance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(`Sender has insufficient balance: ${senderBalance / LAMPORTS_PER_SOL} SOL (need at least 0.01 SOL)`);
    }
    
    if (receiverBalance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(`Receiver has insufficient balance: ${receiverBalance / LAMPORTS_PER_SOL} SOL (need at least 0.01 SOL)`);
    }
    
    console.log('✅ Wallet balances sufficient');
    
    console.log('\n⚠️  IMPORTANT: This test uses REAL mainnet wallets and incurs REAL fees!');
    console.log('📊 Estimated cost: ~0.01 SOL (~$1.50 at $150/SOL)\n');
  });
  
  it('should successfully swap NFT for SOL on mainnet', async function() {
    this.timeout(180000);
    
    console.log('🧪 Test: NFT → SOL swap on mainnet');
    console.log('⏳ This may take 30-60 seconds on mainnet...\n');
    
    // TODO: Implement NFT creation and swap logic
    // For now, this is a placeholder test to establish the structure
    
    console.log('⚠️  Test implementation pending - structure created');
    console.log('📝 Next steps:');
    console.log('   1. Create production NFT helpers');
    console.log('   2. Implement swap transaction building');
    console.log('   3. Verify fee collection to treasury');
    console.log('   4. Validate nonce usage');
    
    // Skip test for now
    this.skip();
  });
  
  after(async function() {
    console.log('\n✅ Production E2E test completed\n');
  });
});

