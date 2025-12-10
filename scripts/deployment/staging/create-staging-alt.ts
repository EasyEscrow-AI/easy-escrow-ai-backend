/**
 * Create Staging Address Lookup Table (ALT)
 * 
 * This script creates an ALT on devnet for optimizing cNFT transaction sizes.
 * Run once to set up, then add the ALT address to DEVNET_STAGING_ALT_ADDRESS env var.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  AddressLookupTableProgram,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// Program IDs for cNFT support
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');
const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');

// Metaplex Core program
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

// Our escrow program (STAGING/DEVNET)
const ESCROW_PROGRAM_ID = new PublicKey('AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei');

// Associated Token Program
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Create Staging Address Lookup Table (ALT) - DEVNET         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // Load deployer keypair
  const deployerPath = path.join(__dirname, '../../../wallets/staging/staging-deployer.json');
  if (!fs.existsSync(deployerPath)) {
    throw new Error(`Deployer keypair not found at ${deployerPath}`);
  }
  
  const deployerKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(deployerPath, 'utf-8')))
  );
  console.log('🔑 Deployer:', deployerKeypair.publicKey.toBase58());
  
  // Connect to devnet
  const rpcUrl = process.env.STAGING_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  console.log('📡 RPC URL:', rpcUrl);
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Check balance
  const balance = await connection.getBalance(deployerKeypair.publicKey);
  console.log(`💰 Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  
  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    throw new Error('Insufficient balance. Need at least 0.05 SOL');
  }
  
  // Load staging admin to derive correct Treasury PDA
  const adminPath = path.join(__dirname, '../../../wallets/staging/staging-admin.json');
  const adminKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(adminPath, 'utf-8')))
  );
  console.log('👤 Staging Admin:', adminKeypair.publicKey.toBase58());
  
  // Derive Treasury PDA (CORRECT seeds: ['main_treasury', authority])
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('main_treasury'), adminKeypair.publicKey.toBuffer()],
    ESCROW_PROGRAM_ID
  );
  console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
  
  // Static addresses to include in ALT
  const staticAddresses: PublicKey[] = [
    TOKEN_PROGRAM_ID,
    SystemProgram.programId,
    BUBBLEGUM_PROGRAM_ID,
    SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    SPL_NOOP_PROGRAM_ID,
    ESCROW_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    MPL_CORE_PROGRAM_ID,
    treasuryPda,
  ];
  
  console.log('\n📋 Addresses to add:', staticAddresses.length);
  staticAddresses.forEach((addr, i) => {
    console.log(`   ${i}: ${addr.toBase58()}`);
  });
  
  // Step 1: Get recent slot for ALT creation
  const slot = await connection.getSlot();
  console.log('\n⏱️  Current slot:', slot);
  
  // Step 2: Create lookup table instruction
  const [createInstruction, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: deployerKeypair.publicKey,
    payer: deployerKeypair.publicKey,
    recentSlot: slot - 1,
  });
  
  console.log('\n🔑 ALT Address:', lookupTableAddress.toBase58());
  
  // Step 3: Create the lookup table
  console.log('\n📝 Step 1: Creating lookup table...');
  const createBlockhash = await connection.getLatestBlockhash();
  
  const createMessage = new TransactionMessage({
    payerKey: deployerKeypair.publicKey,
    recentBlockhash: createBlockhash.blockhash,
    instructions: [createInstruction],
  }).compileToV0Message();
  
  const createTx = new VersionedTransaction(createMessage);
  createTx.sign([deployerKeypair]);
  
  const createSig = await connection.sendTransaction(createTx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  
  console.log('   TX:', createSig);
  
  await connection.confirmTransaction({
    signature: createSig,
    blockhash: createBlockhash.blockhash,
    lastValidBlockHeight: createBlockhash.lastValidBlockHeight,
  }, 'confirmed');
  
  console.log('   ✅ Lookup table created!');
  
  // Wait for table to be active
  console.log('\n⏳ Waiting for table activation (2 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 4: Extend the lookup table with addresses
  console.log('\n📝 Step 2: Adding addresses to lookup table...');
  
  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: deployerKeypair.publicKey,
    authority: deployerKeypair.publicKey,
    lookupTable: lookupTableAddress,
    addresses: staticAddresses,
  });
  
  const extendBlockhash = await connection.getLatestBlockhash();
  
  const extendMessage = new TransactionMessage({
    payerKey: deployerKeypair.publicKey,
    recentBlockhash: extendBlockhash.blockhash,
    instructions: [extendInstruction],
  }).compileToV0Message();
  
  const extendTx = new VersionedTransaction(extendMessage);
  extendTx.sign([deployerKeypair]);
  
  const extendSig = await connection.sendTransaction(extendTx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  
  console.log('   TX:', extendSig);
  
  await connection.confirmTransaction({
    signature: extendSig,
    blockhash: extendBlockhash.blockhash,
    lastValidBlockHeight: extendBlockhash.lastValidBlockHeight,
  }, 'confirmed');
  
  console.log('   ✅ Addresses added to lookup table!');
  
  // Step 5: Verify the lookup table
  console.log('\n📝 Step 3: Verifying lookup table...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const lookupTableAccount = await connection.getAddressLookupTable(lookupTableAddress);
  
  if (lookupTableAccount.value) {
    console.log('   ✅ Lookup table verified!');
    console.log('   Addresses in table:', lookupTableAccount.value.state.addresses.length);
    console.log('   Authority:', lookupTableAccount.value.state.authority?.toBase58());
  } else {
    console.log('   ⚠️ Could not fetch lookup table (may need more time)');
  }
  
  // Output results
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   ✅ STAGING ALT CREATION COMPLETE!                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n📝 Add this to your .env.staging:');
  console.log(`   DEVNET_STAGING_ALT_ADDRESS=${lookupTableAddress.toBase58()}`);
  console.log('\n📋 Also for DigitalOcean App Platform:');
  console.log(`   Key:   DEVNET_STAGING_ALT_ADDRESS`);
  console.log(`   Value: ${lookupTableAddress.toBase58()}`);
  console.log('\n🔗 Explorer: https://explorer.solana.com/address/' + lookupTableAddress.toBase58() + '?cluster=devnet');
  
  // Save to file for reference
  const outputDir = path.join(__dirname, '../../../temp');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, 'staging-alt-address.txt');
  fs.writeFileSync(outputPath, lookupTableAddress.toBase58());
  console.log(`\n💾 ALT address saved to: ${outputPath}`);
}

main().catch(console.error);

