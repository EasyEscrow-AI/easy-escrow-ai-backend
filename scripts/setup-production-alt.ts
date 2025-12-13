#!/usr/bin/env npx ts-node
/**
 * Production ALT Setup Script
 * 
 * Creates and initializes an Address Lookup Table (ALT) for production use.
 * This is a ONE-TIME setup script that should be run once per environment.
 * 
 * Usage:
 *   npx ts-node scripts/setup-production-alt.ts
 * 
 * Environment Variables Required:
 *   - SOLANA_RPC_URL: RPC endpoint
 *   - MAINNET_PROD_ADMIN_PRIVATE_KEY: Admin private key for signing
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as dotenv from 'dotenv';
import bs58 from 'bs58';
import path from 'path';
import fs from 'fs';

// Load environment
dotenv.config();

// Constants for ALT addresses
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');

// Determine environment
const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.SOLANA_RPC_URL?.includes('mainnet');

// Load IDL for program ID
const idlPath = isProduction
  ? path.join(__dirname, '../src/generated/anchor/escrow-idl-production.json')
  : path.join(__dirname, '../src/generated/anchor/escrow-idl-staging.json');

const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
const PROGRAM_ID = new PublicKey(idl.address);

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        ADDRESS LOOKUP TABLE (ALT) SETUP SCRIPT               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  
  // Initialize connection
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  console.log(`🔗 RPC URL: ${rpcUrl}`);
  console.log(`🌐 Environment: ${isProduction ? 'PRODUCTION (Mainnet)' : 'STAGING (Devnet)'}`);
  console.log();
  
  const connection = new Connection(rpcUrl, 'confirmed');
  
  // Load admin keypair
  const adminKeyVar = isProduction 
    ? 'MAINNET_PROD_ADMIN_PRIVATE_KEY'
    : 'DEVNET_STAGING_ADMIN_PRIVATE_KEY';
  
  const adminKeyStr = process.env[adminKeyVar];
  if (!adminKeyStr) {
    console.error(`❌ ERROR: ${adminKeyVar} environment variable not set`);
    process.exit(1);
  }
  
  let adminKeypair: Keypair;
  try {
    // Try base58 format first
    adminKeypair = Keypair.fromSecretKey(bs58.decode(adminKeyStr));
  } catch {
    // Try JSON array format
    try {
      adminKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(adminKeyStr)));
    } catch {
      console.error('❌ ERROR: Invalid private key format');
      process.exit(1);
    }
  }
  
  console.log(`👤 Admin: ${adminKeypair.publicKey.toBase58()}`);
  
  // Check balance
  const balance = await connection.getBalance(adminKeypair.publicKey);
  const balanceSOL = balance / 1e9;
  console.log(`💰 Balance: ${balanceSOL.toFixed(4)} SOL`);
  
  if (balanceSOL < 0.01) {
    console.error('❌ ERROR: Insufficient balance. Need at least 0.01 SOL for ALT creation.');
    process.exit(1);
  }
  
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 STATIC ADDRESSES TO ADD TO ALT:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Derive Treasury PDA
  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('main_treasury'), adminKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  // Static addresses for ALT
  const staticAddresses: { name: string; address: PublicKey }[] = [
    { name: 'Token Program', address: TOKEN_PROGRAM_ID },
    { name: 'System Program', address: new PublicKey('11111111111111111111111111111111') },
    { name: 'Bubblegum Program', address: BUBBLEGUM_PROGRAM_ID },
    { name: 'SPL Account Compression', address: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID },
    { name: 'SPL Noop', address: SPL_NOOP_PROGRAM_ID },
    { name: 'Escrow Program', address: PROGRAM_ID },
    { name: 'Platform Authority', address: adminKeypair.publicKey },
    { name: 'Treasury PDA', address: treasuryPDA },
  ];
  
  for (const { name, address } of staticAddresses) {
    console.log(`  ${name}: ${address.toBase58()}`);
  }
  
  console.log();
  console.log(`📊 Total addresses: ${staticAddresses.length}`);
  console.log(`💾 Estimated savings: ~${staticAddresses.length * 31} bytes per transaction`);
  console.log();
  
  // Check if ALT already exists in environment
  const existingALT = isProduction 
    ? process.env.MAINNET_PROD_ALT_ADDRESS 
    : process.env.DEVNET_STAGING_ALT_ADDRESS;
  
  if (existingALT) {
    console.log('⚠️  WARNING: ALT address already configured in environment:');
    console.log(`   ${existingALT}`);
    console.log();
    console.log('   To create a new ALT, remove the existing ALT address from your environment');
    console.log('   and run this script again.');
    console.log();
    
    // Verify existing ALT
    try {
      const existingTable = await connection.getAddressLookupTable(new PublicKey(existingALT));
      if (existingTable.value) {
        console.log('✅ Existing ALT verified:');
        console.log(`   Addresses: ${existingTable.value.state.addresses.length}`);
        console.log(`   Last extended slot: ${existingTable.value.state.lastExtendedSlot}`);
        return;
      }
    } catch (e) {
      console.log('⚠️  Could not verify existing ALT');
    }
  }
  
  // Import ALT service
  const { ALTService, createALTService } = await import('../src/services/altService');
  
  // Create ALT service
  const altService = createALTService(connection, {
    platformAuthority: adminKeypair.publicKey,
    treasuryPda: treasuryPDA,
  });
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 CREATING ADDRESS LOOKUP TABLE...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();
  
  try {
    const lookupTableAddress = await altService.createAndInitializePlatformALT(adminKeypair);
    
    console.log();
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ ALT CREATED SUCCESSFULLY               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`🔑 ALT Address: ${lookupTableAddress.toBase58()}`);
    console.log();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 NEXT STEPS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log();
    console.log('1. Add this to your environment variables:');
    console.log();
    if (isProduction) {
      console.log(`   MAINNET_PROD_ALT_ADDRESS=${lookupTableAddress.toBase58()}`);
    } else {
      console.log(`   DEVNET_STAGING_ALT_ADDRESS=${lookupTableAddress.toBase58()}`);
    }
    console.log();
    console.log('2. For DigitalOcean App Platform, add to app spec:');
    console.log();
    console.log('   envs:');
    console.log(`     - key: ${isProduction ? 'MAINNET_PROD_ALT_ADDRESS' : 'DEVNET_STAGING_ALT_ADDRESS'}`);
    console.log(`       value: ${lookupTableAddress.toBase58()}`);
    console.log('       scope: RUN_TIME');
    console.log();
    console.log('3. Verify ALT is active:');
    console.log();
    console.log(`   solana address-lookup-table get ${lookupTableAddress.toBase58()} --url ${isProduction ? 'mainnet-beta' : 'devnet'}`);
    console.log();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Final balance check
    const finalBalance = await connection.getBalance(adminKeypair.publicKey);
    const costSOL = (balance - finalBalance) / 1e9;
    console.log(`💰 Cost: ${costSOL.toFixed(6)} SOL`);
    console.log(`💰 Remaining balance: ${(finalBalance / 1e9).toFixed(4)} SOL`);
    console.log();
    
  } catch (error) {
    console.error('❌ ERROR creating ALT:', error);
    process.exit(1);
  }
}

main().catch(console.error);

