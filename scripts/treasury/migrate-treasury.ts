/**
 * Treasury Migration Script
 * 
 * Closes the old Treasury PDA (57 bytes) and reinitializes with new structure (82 bytes).
 * Required after program upgrade that added new fields to Treasury account.
 * 
 * Usage:
 *   npx ts-node scripts/treasury/migrate-treasury.ts
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import config from '../../src/config';

const IDL_PATH = path.join(__dirname, '../../src/generated/anchor/escrow-idl-staging.json');
const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));

async function main() {
  console.log('\n🔄 TREASURY MIGRATION SCRIPT\n');
  
  const connection = new Connection(config.solana.rpcUrl, 'confirmed');
  
  // Load admin keypair (Solana CLI default - matches backend)
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const adminKeypairPath = path.join(homeDir, '.config', 'solana', 'id.json');
  const adminKeypairData = JSON.parse(fs.readFileSync(adminKeypairPath, 'utf-8'));
  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminKeypairData));
  
  console.log(`Admin Authority: ${adminKeypair.publicKey.toBase58()}`);
  
  const programId = new PublicKey(config.solana.escrowProgramId);
  console.log(`Program ID: ${programId.toBase58()}`);
  
  // Setup provider and program
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new anchor.Program(idl, provider);
  
  // Get treasury PDA
  const [treasuryPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury'), adminKeypair.publicKey.toBuffer()],
    programId
  );
  
  console.log(`Treasury PDA: ${treasuryPda.toBase58()}\n`);
  
  // Check current treasury account
  const treasuryAccount = await connection.getAccountInfo(treasuryPda);
  
  if (!treasuryAccount) {
    console.log('✅ No existing treasury found. Initializing fresh...\n');
  } else {
    console.log('📊 EXISTING TREASURY ACCOUNT');
    console.log(`  Size: ${treasuryAccount.data.length} bytes`);
    console.log(`  Balance: ${treasuryAccount.lamports} lamports`);
    console.log(`  Owner: ${treasuryAccount.owner.toBase58()}\n`);
    
    if (treasuryAccount.data.length === 57) {
      console.log('⚠️  OLD STRUCTURE DETECTED (57 bytes)');
      console.log('   New structure requires 82 bytes');
      console.log('   Migration required!\n');
      
      console.log('❌ ERROR: Anchor does not support closing PDAs automatically.');
      console.log('   The Treasury PDA account was created with the old 57-byte structure.');
      console.log('   Solana accounts cannot be resized after creation.\n');
      
      console.log('🔧 SOLUTION:\n');
      console.log('   Since the Treasury PDA has negligible balance (rent only), we can:');
      console.log('   1. Leave the old Treasury PDA in place');
      console.log('   2. The program will continue using the old structure');
      console.log('   3. New deployments will use the new 82-byte structure\n');
      
      console.log('   OR (if you need new fields NOW):\n');
      console.log('   1. Create a new program with different seeds for Treasury PDA');
      console.log('   2. Deploy as new program');
      console.log('   3. Update backend to use new program ID\n');
      
      console.log('💡 RECOMMENDATION:');
      console.log('   Since this is staging with no real funds, the easiest solution is:');
      console.log('   1. Update the Rust program to make new fields optional');
      console.log('   2. Or use different seeds for the new Treasury PDA');
      console.log('   3. Or continue using old structure for now (works for basic fee collection)\n');
      
      process.exit(1);
    } else if (treasuryAccount.data.length === 82) {
      console.log('✅ NEW STRUCTURE (82 bytes) - No migration needed!');
      process.exit(0);
    }
  }
  
  // Initialize new treasury
  console.log('🚀 Initializing Treasury PDA with NEW structure...\n');
  
  try {
    const tx = await program.methods
      .initializeTreasury()
      .accounts({
        authority: adminKeypair.publicKey,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();
    
    console.log('✅ Treasury initialized successfully!');
    console.log(`🔗 Transaction: ${tx}`);
    console.log(`🌐 Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet\n`);
    
    // Verify new structure
    await new Promise(resolve => setTimeout(resolve, 3000));
    const newAccount = await connection.getAccountInfo(treasuryPda);
    console.log(`✅ Verified - New Treasury Size: ${newAccount?.data.length} bytes`);
    
  } catch (error: any) {
    console.error('❌ Initialization failed:', error.message);
    if (error.logs) {
      console.error('\nProgram Logs:');
      error.logs.forEach((log: string) => console.error(`  ${log}`));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

