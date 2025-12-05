/**
 * Initialize Production Treasury PDA on Mainnet
 * 
 * This script initializes the Treasury Program Derived Address (PDA) on Solana mainnet
 * by calling the initialize_treasury instruction from the atomic swap program.
 * 
 * ⚠️  CRITICAL: This is a ONE-TIME operation for production deployment.
 * 
 * Prerequisites:
 * 1. Treasury authority keypair must exist at wallets/production/production-treasury.json
 * 2. Treasury authority must have sufficient SOL for rent (~0.002 SOL)
 * 3. Program must be deployed to mainnet at 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
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
const TREASURY_AUTHORITY_PATH = 'wallets/production/production-treasury.json';

// Treasury seed prefix (must match Rust program)
const TREASURY_SEED_PREFIX = Buffer.from('main_treasury');

async function initializeTreasury() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║      Initialize Production Treasury PDA on Mainnet          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('⚠️  WARNING: This is a ONE-TIME production operation!\n');
  console.log('📋 Configuration:');
  console.log(`   RPC URL:     ${MAINNET_RPC_URL}`);
  console.log(`   Program ID:  ${PRODUCTION_PROGRAM_ID}`);
  console.log(`   Authority:   ${TREASURY_AUTHORITY_PATH}\n`);

  try {
    // 1. Connect to mainnet
    console.log('🔗 Connecting to Solana mainnet...');
    const connection = new Connection(MAINNET_RPC_URL, 'confirmed');
    
    // Verify connection
    const version = await connection.getVersion();
    console.log(`   ✅ Connected (version: ${version['solana-core']})\n`);

    // 2. Load treasury authority keypair
    console.log('🔑 Loading treasury authority keypair...');
    const authorityKeypairPath = path.join(process.cwd(), TREASURY_AUTHORITY_PATH);
    
    if (!fs.existsSync(authorityKeypairPath)) {
      throw new Error(`Treasury authority keypair not found at: ${authorityKeypairPath}`);
    }
    
    const authorityKeypairData = JSON.parse(fs.readFileSync(authorityKeypairPath, 'utf-8'));
    const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKeypairData));
    console.log(`   Authority:   ${authority.publicKey.toBase58()}\n`);

    // 3. Check authority balance
    console.log('💰 Checking authority balance...');
    const balance = await connection.getBalance(authority.publicKey);
    const balanceSOL = balance / 1e9;
    console.log(`   Balance:     ${balanceSOL.toFixed(4)} SOL`);
    
    if (balance < 0.002 * 1e9) {
      throw new Error(`Insufficient balance. Need at least 0.002 SOL for rent. Current: ${balanceSOL} SOL`);
    }
    console.log('   ✅ Sufficient balance\n');

    // 4. Derive Treasury PDA
    console.log('🔍 Deriving Treasury PDA...');
    const programId = new PublicKey(PRODUCTION_PROGRAM_ID);
    const [treasuryPDA, bump] = PublicKey.findProgramAddressSync(
      [TREASURY_SEED_PREFIX, authority.publicKey.toBuffer()],
      programId
    );
    console.log(`   Treasury PDA: ${treasuryPDA.toBase58()}`);
    console.log(`   Bump:         ${bump}\n`);

    // 5. Check if Treasury PDA already exists
    console.log('🔍 Checking if Treasury PDA already exists...');
    const treasuryAccount = await connection.getAccountInfo(treasuryPDA);
    
    if (treasuryAccount) {
      console.log('   ⚠️  Treasury PDA already exists!');
      console.log(`   Owner:  ${treasuryAccount.owner.toBase58()}`);
      console.log(`   Size:   ${treasuryAccount.data.length} bytes`);
      console.log(`   Lamports: ${treasuryAccount.lamports}\n`);
      console.log('❌ Treasury is already initialized. Exiting.\n');
      return;
    }
    console.log('   ✅ Treasury PDA does not exist (ready for initialization)\n');

    // 6. Load program IDL
    console.log('📦 Loading program IDL...');
    const idlPath = path.join(process.cwd(), 'src/generated/anchor/escrow-idl-production.json');
    
    if (!fs.existsSync(idlPath)) {
      throw new Error(`IDL not found at: ${idlPath}`);
    }
    
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    console.log('   ✅ IDL loaded\n');

    // 7. Create Anchor provider and program
    console.log('🔧 Setting up Anchor program...');
    const wallet = new anchor.Wallet(authority);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
    
    const program = new anchor.Program(idl, programId, provider);
    console.log('   ✅ Program initialized\n');

    // 8. Set authorized withdrawal wallet (use authority itself for now)
    const authorizedWithdrawalWallet = authority.publicKey;
    console.log('📝 Treasury Configuration:');
    console.log(`   Authorized Withdrawal Wallet: ${authorizedWithdrawalWallet.toBase58()}\n`);

    // 9. Call initialize_treasury instruction
    console.log('🚀 Initializing Treasury PDA on mainnet...');
    console.log('   ⏳ Sending transaction...\n');

    const tx = await program.methods
      .initializeTreasury(authorizedWithdrawalWallet)
      .accounts({
        authority: authority.publicKey,
        treasury: treasuryPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log('   ✅ Transaction confirmed!\n');
    console.log('📝 Transaction Details:');
    console.log(`   Signature: ${tx}`);
    console.log(`   Explorer:  https://solscan.io/tx/${tx}\n`);

    // 10. Verify initialization
    console.log('🔍 Verifying Treasury PDA initialization...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for finalization
    
    const verifyAccount = await connection.getAccountInfo(treasuryPDA);
    
    if (!verifyAccount) {
      throw new Error('Treasury PDA was not created!');
    }
    
    console.log(`   ✅ Treasury PDA exists!`);
    console.log(`   Owner:    ${verifyAccount.owner.toBase58()}`);
    console.log(`   Size:     ${verifyAccount.data.length} bytes`);
    console.log(`   Lamports: ${verifyAccount.lamports}\n`);

    // 11. Success summary
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                  INITIALIZATION SUCCESSFUL!                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Treasury PDA Details:');
    console.log(`   Address:   ${treasuryPDA.toBase58()}`);
    console.log(`   Authority: ${authority.publicKey.toBase58()}`);
    console.log(`   Bump:      ${bump}`);
    console.log(`   Explorer:  https://solscan.io/account/${treasuryPDA.toBase58()}\n`);

    console.log('📝 Next Steps:');
    console.log('   1. Update production environment variables:');
    console.log(`      MAINNET_TREASURY_PDA=${treasuryPDA.toBase58()}`);
    console.log(`      MAINNET_TREASURY_AUTHORITY=${authority.publicKey.toBase58()}`);
    console.log(`      MAINNET_TREASURY_BUMP=${bump}`);
    console.log('   2. Test fee collection with a test swap');
    console.log('   3. Monitor Treasury PDA balance for incoming fees\n');

    return {
      treasuryPDA: treasuryPDA.toBase58(),
      authority: authority.publicKey.toBase58(),
      bump,
      signature: tx,
    };

  } catch (error) {
    console.error('\n❌ Error initializing Treasury PDA:');
    console.error(error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  initializeTreasury()
    .then(() => {
      console.log('✅ Script completed successfully\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { initializeTreasury };

