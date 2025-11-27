/**
 * Close old Treasury PDA and reinitialize with new structure
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import config from '../../src/config';

const IDL_PATH = path.join(__dirname, '../../target/idl/escrow.json');
const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));

async function main() {
  console.log('\n🔄 CLOSE & REINITIALIZE TREASURY\n');
  
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
  
  // Step 1: Close old treasury
  console.log('📋 Step 1: Closing old Treasury PDA...');
  try {
    const closeTx = await program.methods
      .closeTreasury()
      .accounts({
        authority: adminKeypair.publicKey,
        treasury: treasuryPda,
      })
      .signers([adminKeypair])
      .rpc();
    
    console.log('✅ Treasury closed!');
    console.log(`🔗 Close TX: ${closeTx}`);
    console.log(`🌐 Explorer: https://explorer.solana.com/tx/${closeTx}?cluster=devnet\n`);
    
    // Wait for confirmation
    await new Promise(resolve => setTimeout(resolve, 3000));
    
  } catch (error: any) {
    console.error('❌ Close failed:', error.message);
    if (error.logs) {
      console.error('\nProgram Logs:');
      error.logs.forEach((log: string) => console.error(`  ${log}`));
    }
    process.exit(1);
  }
  
  // Step 2: Reinitialize with new structure
  console.log('📋 Step 2: Reinitializing Treasury with new 82-byte structure...');
  try {
    const initTx = await program.methods
      .initializeTreasury()
      .accounts({
        authority: adminKeypair.publicKey,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();
    
    console.log('✅ Treasury reinitialized!');
    console.log(`🔗 Init TX: ${initTx}`);
    console.log(`🌐 Explorer: https://explorer.solana.com/tx/${initTx}?cluster=devnet\n`);
    
    // Wait and verify
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const newAccount = await connection.getAccountInfo(treasuryPda);
    console.log(`✅ Verified - New Treasury Size: ${newAccount?.data.length} bytes`);
    
    if (newAccount?.data.length === 82) {
      console.log('🎉 SUCCESS! Treasury migrated to new structure!');
    } else {
      console.log(`⚠️  Unexpected size: ${newAccount?.data.length} bytes`);
    }
    
  } catch (error: any) {
    console.error('❌ Reinitialize failed:', error.message);
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

