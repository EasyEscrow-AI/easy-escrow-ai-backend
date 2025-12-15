/**
 * Initialize Atomic Swap Treasury on Staging (Devnet)
 * 
 * This script initializes the treasury PDA for the atomic swap program on staging.
 * Run this ONCE before using atomic swap features.
 */

import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
const envPath = path.join(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Configuration
const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei'); // Staging program ID
const ADMIN_KEYPAIR_PATH = process.env.STAGING_ADMIN_PRIVATE_KEY_PATH || 
  path.join(__dirname, '../../../wallets/staging/staging-admin.json');
const WITHDRAWAL_WALLET_PATH = path.join(__dirname, '../../../wallets/staging/staging-fee-collector.json');

// Treasury seed prefix (MUST match Rust program: b"main_treasury")
const TREASURY_SEED_PREFIX = Buffer.from('main_treasury');

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Initialize Atomic Swap Treasury - STAGING (Devnet)        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // Setup connection
  const connection = new Connection(RPC_URL, 'confirmed');
  console.log('📡 RPC URL:', RPC_URL);
  
  // Load admin keypair
  if (!fs.existsSync(ADMIN_KEYPAIR_PATH)) {
    console.error('❌ Admin keypair not found at:', ADMIN_KEYPAIR_PATH);
    console.error('   Set STAGING_ADMIN_PRIVATE_KEY_PATH or create the keypair file');
    process.exit(1);
  }
  
  const adminSecret = JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, 'utf8'));
  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminSecret));
  
  console.log('🔑 Admin Authority:', adminKeypair.publicKey.toBase58());
  console.log('🏦 Program ID:', PROGRAM_ID.toBase58());
  
  // Check admin balance
  const adminBalance = await connection.getBalance(adminKeypair.publicKey);
  const adminBalanceSOL = adminBalance / 1_000_000_000;
  console.log('💰 Admin Balance:', adminBalanceSOL.toFixed(4), 'SOL');
  
  if (adminBalance < 0.01 * 1_000_000_000) {
    console.error('\n❌ Insufficient balance for initialization (minimum 0.01 SOL required)');
    console.error('   Fund the admin wallet on devnet:');
    console.error(`   solana airdrop 1 ${adminKeypair.publicKey.toBase58()} --url devnet`);
    process.exit(1);
  }
  
  // Load IDL
  const idlPath = path.join(__dirname, '../../../target/idl/escrow.json');
  if (!fs.existsSync(idlPath)) {
    console.error('❌ IDL file not found at:', idlPath);
    console.error('   Run: anchor build');
    process.exit(1);
  }
  
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  idl.address = PROGRAM_ID.toBase58();
  
  // Setup provider and program
  const wallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, { 
    commitment: 'confirmed',
    preflightCommitment: 'confirmed'
  });
  const program = new Program(idl, provider);
  
  console.log('\n✅ Program loaded successfully\n');
  
  // Derive treasury PDA using correct seeds (must match Rust program)
  const [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
    [TREASURY_SEED_PREFIX, adminKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
  console.log('🔢 Treasury Bump:', treasuryBump);
  
  // Check if treasury already exists
  console.log('\n🔍 Checking if treasury is already initialized...');
  const treasuryAccount = await connection.getAccountInfo(treasuryPda);
  
  if (treasuryAccount) {
    console.log('\n✅ Treasury is already initialized!');
    console.log('   Treasury PDA:', treasuryPda.toBase58());
    
    try {
      // Try to read treasury data
      const treasuryData = await (program.account as any).treasury.fetch(treasuryPda);
      console.log('\n📊 Treasury Stats:');
      console.log('   Authority:', treasuryData.authority.toBase58());
      console.log('   Total Fees Collected:', treasuryData.totalFeesCollected.toString(), 'lamports');
      console.log('   Total Swaps Executed:', treasuryData.totalSwapsExecuted.toString());
      
      if (treasuryData.authority.toBase58() !== adminKeypair.publicKey.toBase58()) {
        console.warn('\n⚠️  WARNING: Treasury authority does not match current admin!');
        console.warn('   Expected:', adminKeypair.publicKey.toBase58());
        console.warn('   Actual:  ', treasuryData.authority.toBase58());
      }
    } catch (error) {
      console.warn('\n⚠️  Could not read treasury data (account exists but data is unreadable)');
      console.warn('   Error:', error instanceof Error ? error.message : String(error));
    }
    
    console.log('\n✅ No initialization needed - treasury is ready!');
    process.exit(0);
  }
  
  // Load withdrawal wallet for authorization
  console.log('\n🔐 Loading authorized withdrawal wallet...');
  if (!fs.existsSync(WITHDRAWAL_WALLET_PATH)) {
    console.error('❌ Withdrawal wallet not found at:', WITHDRAWAL_WALLET_PATH);
    process.exit(1);
  }
  const withdrawalSecret = JSON.parse(fs.readFileSync(WITHDRAWAL_WALLET_PATH, 'utf8'));
  const withdrawalWallet = Keypair.fromSecretKey(new Uint8Array(withdrawalSecret));
  console.log('   Authorized Withdrawal Wallet:', withdrawalWallet.publicKey.toBase58());
  
  // Initialize treasury
  console.log('\n🔨 Initializing treasury...');
  console.log('   This will create the treasury PDA and set you as the authority');
  console.log('   Withdrawals will ONLY be allowed to:', withdrawalWallet.publicKey.toBase58());
  
  try {
    const tx = await program.methods
      .initializeTreasury(withdrawalWallet.publicKey)
      .accounts({
        authority: adminKeypair.publicKey,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log('\n✅ Treasury initialized successfully!');
    console.log('📝 Transaction Signature:', tx);
    console.log('🔗 Explorer:', `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    
    // Wait for confirmation
    console.log('\n⏳ Waiting for confirmation...');
    await connection.confirmTransaction(tx, 'confirmed');
    console.log('✅ Transaction confirmed!');
    
    // Verify treasury data
    console.log('\n📊 Reading treasury data...');
    const treasuryData = await (program.account as any).treasury.fetch(treasuryPda);
    console.log('   Authority:', treasuryData.authority.toBase58());
    console.log('   Total Fees Collected:', treasuryData.totalFeesCollected.toString(), 'lamports');
    console.log('   Total Swaps Executed:', treasuryData.totalSwapsExecuted.toString());
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   ✅ TREASURY INITIALIZATION COMPLETE                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n📝 Add this to your .env.staging:');
    console.log(`   DEVNET_STAGING_PDA_TREASURY_ADDRESS=${treasuryPda.toBase58()}`);
    console.log('\nYou can now run atomic swap tests:');
    console.log('  npm run test:staging:e2e:atomic-swaps\n');
    
  } catch (error) {
    console.error('\n❌ Treasury initialization failed!');
    console.error('Error:', error);
    
    if (error instanceof Error) {
      console.error('\nError details:');
      console.error('  Message:', error.message);
      if ('logs' in error) {
        console.error('  Logs:', (error as any).logs);
      }
    }
    
    console.error('\n💡 Troubleshooting:');
    console.error('  1. Ensure admin wallet has sufficient SOL (>0.01 SOL)');
    console.error('  2. Verify program is deployed on devnet');
    console.error('  3. Check RPC endpoint is reachable');
    console.error('  4. Ensure you have the correct admin keypair');
    
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

