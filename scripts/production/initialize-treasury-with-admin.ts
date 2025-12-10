/**
 * Initialize Production Treasury PDA using ADMIN wallet as authority
 * 
 * This script initializes a NEW Treasury PDA using the production ADMIN wallet
 * as the authority, matching what the backend code expects.
 * 
 * Background:
 * - Task 33 initialized Treasury PDA using treasury wallet (HMtLH...UBFF)
 * - Backend code derives Treasury PDA using admin wallet (HGrfP...SDj2)
 * - These produce DIFFERENT PDAs!
 * 
 * Solution:
 * Initialize a new Treasury PDA with admin as authority to match backend expectation.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';

// Production configuration
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PRODUCTION_PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';
const ADMIN_AUTHORITY_PATH = 'wallets/production/production-admin.json';

// Treasury seed prefix (must match Rust program)
const TREASURY_SEED_PREFIX = Buffer.from('main_treasury');

async function initializeTreasury() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Initialize Treasury PDA with ADMIN as Authority (Mainnet) ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('⚠️  This creates a NEW Treasury PDA using ADMIN wallet as authority\n');
  console.log('📋 Configuration:');
  console.log(`   RPC URL:     ${MAINNET_RPC_URL}`);
  console.log(`   Program ID:  ${PRODUCTION_PROGRAM_ID}`);
  console.log(`   Authority:   ${ADMIN_AUTHORITY_PATH} (ADMIN wallet)\n`);

  try {
    // 1. Connect to mainnet
    console.log('🔗 Connecting to Solana mainnet...');
    const connection = new Connection(MAINNET_RPC_URL, 'confirmed');
    
    const version = await connection.getVersion();
    console.log(`   ✅ Connected (version: ${version['solana-core']})\n`);

    // 2. Load admin authority keypair
    console.log('🔑 Loading admin authority keypair...');
    const authorityKeypairPath = path.join(process.cwd(), ADMIN_AUTHORITY_PATH);
    
    if (!fs.existsSync(authorityKeypairPath)) {
      throw new Error(`Admin authority keypair not found at: ${authorityKeypairPath}`);
    }
    
    const authorityKeypairData = JSON.parse(fs.readFileSync(authorityKeypairPath, 'utf-8'));
    const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKeypairData));
    console.log(`   Authority:   ${authority.publicKey.toBase58()} (ADMIN)\n`);

    // 3. Check authority balance
    console.log('💰 Checking authority balance...');
    const balance = await connection.getBalance(authority.publicKey);
    const balanceSOL = balance / 1e9;
    console.log(`   Balance:     ${balanceSOL.toFixed(4)} SOL`);
    
    if (balance < 0.002 * 1e9) {
      throw new Error(`Insufficient balance. Need at least 0.002 SOL for rent. Current: ${balanceSOL} SOL`);
    }
    console.log('   ✅ Sufficient balance\n');

    // 4. Derive Treasury PDA (using ADMIN as authority)
    console.log('🔍 Deriving Treasury PDA...');
    const programId = new PublicKey(PRODUCTION_PROGRAM_ID);
    
    const [treasuryPDA, bump] = PublicKey.findProgramAddressSync(
      [TREASURY_SEED_PREFIX, authority.publicKey.toBuffer()],  // ADMIN as authority
      programId
    );
    
    console.log(`   Seeds:       ['main_treasury', authority_pubkey]`);
    console.log(`   Authority:   ${authority.publicKey.toBase58()}`);
    console.log(`   Program ID:  ${programId.toBase58()}`);
    console.log(`   Treasury PDA: ${treasuryPDA.toBase58()}`);
    console.log(`   Bump:        ${bump}\n`);

    // 5. Check if Treasury PDA already exists
    console.log('🔍 Checking if Treasury PDA already exists...');
    const accountInfo = await connection.getAccountInfo(treasuryPDA);
    
    if (accountInfo) {
      console.log('   ⚠️  Treasury PDA already initialized!');
      console.log(`   Owner:       ${accountInfo.owner.toBase58()}`);
      console.log(`   Lamports:    ${accountInfo.lamports}`);
      console.log(`   Data length: ${accountInfo.data.length} bytes\n`);
      console.log('✅ Treasury PDA already exists - no action needed.\n');
      
      // Output environment variable
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║                  ENVIRONMENT VARIABLE                        ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');
      console.log('Add this to DigitalOcean environment variables:');
      console.log(`MAINNET_TREASURY_PDA=${treasuryPDA.toBase58()}\n`);
      
      return;
    }
    
    console.log('   Treasury PDA not found - will initialize\n');

    // 6. Load Anchor IDL
    console.log('📄 Loading program IDL...');
    const idlPath = path.join(process.cwd(), 'src/generated/anchor/escrow-idl-production.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    console.log('   ✅ IDL loaded\n');

    // 7. Create Anchor program instance
    const wallet = new anchor.Wallet(authority);
    const provider = new anchor.AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed', preflightCommitment: 'confirmed' }
    );
    const program = new anchor.Program(idl, provider);
    console.log('   ✅ Program instance created\n');

    // 8. Set authorized withdrawal wallet (use authority itself)
    const authorizedWithdrawalWallet = authority.publicKey;
    console.log('📝 Treasury Configuration:');
    console.log(`   Authorized Withdrawal Wallet: ${authorizedWithdrawalWallet.toBase58()}\n`);

    // 9. Call initialize_treasury instruction
    console.log('📝 Calling initialize_treasury instruction...');
    console.log('   This will:');
    console.log('   1. Create Treasury PDA account (~114 bytes)');
    console.log('   2. Set authority to admin wallet');
    console.log('   3. Mark Treasury as initialized');
    console.log('   4. Enable fee collection\n');

    const tx = await program.methods
      .initializeTreasury(authorizedWithdrawalWallet)
      .accounts({
        authority: authority.publicKey,
        treasury: treasuryPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log('   ✅ Transaction sent!');
    console.log(`   Signature:   ${tx}\n`);

    // 9. Confirm transaction
    console.log('⏳ Waiting for confirmation...');
    await connection.confirmTransaction(tx, 'confirmed');
    console.log('   ✅ Transaction confirmed!\n');

    // 10. Verify Treasury PDA is initialized
    console.log('🔍 Verifying Treasury PDA initialization...');
    const treasuryAccount = await connection.getAccountInfo(treasuryPDA);
    
    if (!treasuryAccount) {
      throw new Error('Treasury PDA not found after initialization!');
    }
    
    console.log('   ✅ Treasury PDA initialized successfully!');
    console.log(`   Owner:       ${treasuryAccount.owner.toBase58()}`);
    console.log(`   Lamports:    ${treasuryAccount.lamports}`);
    console.log(`   Data length: ${treasuryAccount.data.length} bytes\n`);

    // 11. Fund Treasury PDA if needed (optional)
    console.log('💰 Treasury PDA funding...');
    if (treasuryAccount.lamports > 0.001 * 1e9) {
      console.log('   ✅ Treasury already has sufficient balance\n');
    } else {
      console.log('   ⚠️  Consider funding Treasury PDA for rent exemption\n');
    }

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                  SUCCESS - TREASURY INITIALIZED              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log('📝 Summary:');
    console.log(`   Treasury PDA:  ${treasuryPDA.toBase58()}`);
    console.log(`   Authority:     ${authority.publicKey.toBase58()} (ADMIN)`);
    console.log(`   Program ID:    ${programId.toBase58()}`);
    console.log(`   Transaction:   ${tx}`);
    console.log(`   View on Solscan: https://solscan.io/tx/${tx}\n`);

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                  ENVIRONMENT VARIABLE                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('Add this to DigitalOcean production environment variables:');
    console.log(`MAINNET_TREASURY_PDA=${treasuryPDA.toBase58()}\n`);
    console.log('Scope: RUN_TIME');
    console.log('Type: SECRET\n');

    console.log('✅ Treasury PDA initialization complete!\n');

  } catch (error) {
    console.error('\n❌ Error initializing Treasury PDA:', error);
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}\n`);
    }
    process.exit(1);
  }
}

// Run the initialization
initializeTreasury();

