/**
 * Create USDC Token Account for Production Receiver Wallet
 * 
 * This script creates an Associated Token Account (ATA) for USDC
 * on the production receiver wallet.
 * 
 * Run: npx ts-node scripts/utilities/create-usdc-account.ts
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load production environment
dotenv.config({ path: '.env.production' });

const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Create USDC Token Account for Production Receiver');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Connect to Solana
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  console.log(`🔗 Connected to: ${rpcUrl}`);
  
  // Check network
  const version = await connection.getVersion();
  console.log(`✅ Solana version: ${version['solana-core']}\n`);

  // Load receiver wallet
  const receiverPath = path.join(__dirname, '../../wallets/production/mainnet-receiver.json');
  const receiverKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(receiverPath, 'utf-8')))
  );
  
  console.log(`👛 Receiver Wallet: ${receiverKeypair.publicKey.toBase58()}`);
  
  // Check SOL balance
  const balance = await connection.getBalance(receiverKeypair.publicKey);
  console.log(`💰 SOL Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);
  
  if (balance < 5000000) { // Less than 0.005 SOL
    console.error('❌ Insufficient SOL for account creation rent (~0.002 SOL needed)');
    process.exit(1);
  }

  // Create USDC token account
  const usdcMint = new PublicKey(MAINNET_USDC_MINT);
  
  console.log('🏗️  Creating USDC token account...');
  console.log(`   USDC Mint: ${usdcMint.toBase58()}`);
  
  try {
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      receiverKeypair, // payer
      usdcMint,
      receiverKeypair.publicKey // owner
    );
    
    console.log('');
    console.log('✅ SUCCESS!');
    console.log('');
    console.log(`   Token Account: ${tokenAccount.address.toBase58()}`);
    console.log(`   Owner: ${receiverKeypair.publicKey.toBase58()}`);
    console.log(`   Mint: ${usdcMint.toBase58()}`);
    
    // Check if it was newly created or already existed
    const accountInfo = await connection.getAccountInfo(tokenAccount.address);
    console.log('');
    
    if (tokenAccount.address) {
      console.log('   ℹ️  Account already existed');
    } else {
      console.log('   🆕 New account created!');
      console.log(`   💰 Rent cost: ~0.002 SOL`);
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ✅ USDC Token Account Ready!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    
  } catch (error: any) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('');
    process.exit(1);
  }
}

main().catch(console.error);




