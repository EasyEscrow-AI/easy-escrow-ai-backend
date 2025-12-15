/**
 * Fix ALT Treasury PDA
 * 
 * The initial ALT creation used wrong seeds for Treasury PDA.
 * This script extends the existing ALT to add the CORRECT Treasury PDA.
 * 
 * Wrong:   ['treasury'] 
 * Correct: ['main_treasury', authority.toBuffer()]
 */

import {
  Connection,
  Keypair,
  PublicKey,
  AddressLookupTableProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Production program ID
const ESCROW_PROGRAM_ID = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx');

// Existing ALT address
const ALT_ADDRESS = new PublicKey('7U8iARw9TgABSrQcMoEgMXRs9ofHD4Rbzv2qtyRJyc2f');

// Production admin public key (from production-admin.json)
const PRODUCTION_ADMIN = new PublicKey('HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2');

async function main() {
  console.log('=== Fixing ALT Treasury PDA ===\n');
  
  // Load deployer keypair
  const deployerPath = path.join(__dirname, '../wallets/production/mainnet-deployer.json');
  const deployerKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
  );
  console.log('Deployer:', deployerKeypair.publicKey.toBase58());
  
  // Connect to mainnet
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Calculate the CORRECT Treasury PDA
  const [correctTreasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('main_treasury'), PRODUCTION_ADMIN.toBuffer()],
    ESCROW_PROGRAM_ID
  );
  
  // Calculate the WRONG Treasury PDA (what was added before)
  const [wrongTreasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    ESCROW_PROGRAM_ID
  );
  
  console.log('\n📋 Treasury PDA Analysis:');
  console.log('   Wrong (in ALT):  ', wrongTreasuryPDA.toBase58());
  console.log('   Correct (needed):', correctTreasuryPDA.toBase58());
  console.log('   Match:', wrongTreasuryPDA.equals(correctTreasuryPDA) ? '✅ YES' : '❌ NO');
  
  if (wrongTreasuryPDA.equals(correctTreasuryPDA)) {
    console.log('\n✅ Treasury PDAs match! No fix needed.');
    return;
  }
  
  // Check if correct PDA is already in ALT
  console.log('\n🔍 Checking existing ALT...');
  const lookupTableAccount = await connection.getAddressLookupTable(ALT_ADDRESS);
  
  if (!lookupTableAccount.value) {
    throw new Error('Could not fetch ALT');
  }
  
  const existingAddresses = lookupTableAccount.value.state.addresses;
  console.log('   Current addresses in ALT:', existingAddresses.length);
  
  const alreadyHasCorrect = existingAddresses.some(addr => addr.equals(correctTreasuryPDA));
  
  if (alreadyHasCorrect) {
    console.log('\n✅ Correct Treasury PDA already in ALT! No action needed.');
    return;
  }
  
  console.log('\n⚠️ Correct Treasury PDA NOT in ALT. Adding it now...');
  
  // Check balance
  const balance = await connection.getBalance(deployerKeypair.publicKey);
  console.log(`   Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  
  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    throw new Error('Insufficient balance');
  }
  
  // Extend ALT with correct Treasury PDA
  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: deployerKeypair.publicKey,
    authority: deployerKeypair.publicKey,
    lookupTable: ALT_ADDRESS,
    addresses: [correctTreasuryPDA],
  });
  
  const blockhash = await connection.getLatestBlockhash();
  
  const message = new TransactionMessage({
    payerKey: deployerKeypair.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions: [extendInstruction],
  }).compileToV0Message();
  
  const tx = new VersionedTransaction(message);
  tx.sign([deployerKeypair]);
  
  console.log('\n📤 Sending transaction...');
  const sig = await connection.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  
  console.log('   TX:', sig);
  
  await connection.confirmTransaction({
    signature: sig,
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
  }, 'confirmed');
  
  console.log('   ✅ Transaction confirmed!');
  
  // Verify
  console.log('\n🔍 Verifying...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const updatedALT = await connection.getAddressLookupTable(ALT_ADDRESS);
  if (updatedALT.value) {
    console.log('   Addresses in ALT:', updatedALT.value.state.addresses.length);
    
    const hasCorrect = updatedALT.value.state.addresses.some(addr => addr.equals(correctTreasuryPDA));
    if (hasCorrect) {
      console.log('   ✅ Correct Treasury PDA successfully added!');
    } else {
      console.log('   ❌ Treasury PDA not found (may need more time to propagate)');
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ ALT FIX COMPLETE!');
  console.log('='.repeat(60));
  console.log('\nCorrect Treasury PDA:', correctTreasuryPDA.toBase58());
  console.log('ALT now has', (updatedALT.value?.state.addresses.length || 0), 'addresses');
}

main().catch(console.error);

