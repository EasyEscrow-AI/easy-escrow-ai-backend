/**
 * Extract Production Wallet Secrets for DigitalOcean Configuration
 * 
 * This script extracts wallet private keys from JSON files and outputs them
 * in formats ready for DigitalOcean App Platform environment variables.
 * 
 * ⚠️ SECURITY: Only run this locally. NEVER commit the output to Git!
 */

import * as fs from 'fs';
import * as path from 'path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const WALLETS_DIR = path.join(__dirname, '../../wallets/production');

interface WalletInfo {
  name: string;
  file: string;
  publicKey: string;
  privateKeyBase58: string;
  envVarName: string;
  addressVarName: string;
}

function extractWalletInfo(walletPath: string, envVarName: string, addressVarName: string): WalletInfo {
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(walletData));
  
  return {
    name: path.basename(walletPath, '.json'),
    file: walletPath,
    publicKey: keypair.publicKey.toBase58(),
    privateKeyBase58: bs58.encode(keypair.secretKey),
    envVarName,
    addressVarName,
  };
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Production Wallet Secrets Extraction                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log('⚠️  WARNING: This script displays SENSITIVE PRIVATE KEYS!');
  console.log('⚠️  Only run locally. NEVER commit output to Git!\n');
  
  const wallets: WalletInfo[] = [];
  
  try {
    // Extract admin wallet
    wallets.push(extractWalletInfo(
      path.join(WALLETS_DIR, 'production-admin.json'),
      'MAINNET_PROD_ADMIN_PRIVATE_KEY',
      'MAINNET_PROD_ADMIN_ADDRESS'
    ));
    
    // Extract treasury wallet (fee collector)
    wallets.push(extractWalletInfo(
      path.join(WALLETS_DIR, 'production-treasury.json'),
      'MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY',
      'MAINNET_PROD_FEE_COLLECTOR_ADDRESS'
    ));
    
    // Extract sender wallet (for E2E tests)
    wallets.push(extractWalletInfo(
      path.join(WALLETS_DIR, 'production-sender.json'),
      'MAINNET_PROD_SENDER_PRIVATE_KEY',
      'MAINNET_PROD_SENDER_ADDRESS'
    ));
    
    // Extract receiver wallet (for E2E tests)
    wallets.push(extractWalletInfo(
      path.join(WALLETS_DIR, 'production-receiver.json'),
      'MAINNET_PROD_RECEIVER_PRIVATE_KEY',
      'MAINNET_PROD_RECEIVER_ADDRESS'
    ));
    
  } catch (error) {
    console.error('❌ Error loading wallets:', error);
    process.exit(1);
  }
  
  console.log('═'.repeat(70));
  console.log('COPY THESE TO DIGITALOCEAN APP PLATFORM → ENVIRONMENT VARIABLES');
  console.log('═'.repeat(70));
  console.log();
  
  for (const wallet of wallets) {
    console.log(`\n📋 ${wallet.name.toUpperCase().replace(/-/g, ' ')}`);
    console.log('─'.repeat(70));
    
    // Private Key
    console.log(`\n🔑 Variable Name: ${wallet.envVarName}`);
    console.log(`   Type: SECRET (check "Encrypt" box)`);
    console.log(`   Value (copy below):`);
    console.log();
    console.log(`   ${wallet.privateKeyBase58}`);
    console.log();
    
    // Public Address
    console.log(`📍 Variable Name: ${wallet.addressVarName}`);
    console.log(`   Type: SECRET (check "Encrypt" box)`);
    console.log(`   Value (copy below):`);
    console.log();
    console.log(`   ${wallet.publicKey}`);
    console.log();
  }
  
  console.log('\n═'.repeat(70));
  console.log('ADDITIONAL REQUIRED SECRETS');
  console.log('═'.repeat(70));
  console.log();
  
  console.log('🔐 JWT_SECRET');
  console.log('   Generate with: openssl rand -base64 64');
  console.log('   Type: SECRET');
  console.log();
  
  console.log('🔐 WEBHOOK_SECRET');
  console.log('   Generate with: openssl rand -base64 32');
  console.log('   Type: SECRET');
  console.log();
  
  console.log('🔗 SOLANA_RPC_URL');
  console.log('   Get from: Helius.dev or QuickNode.com (mainnet)');
  console.log('   Example: https://mainnet.helius-rpc.com/?api-key=YOUR-KEY');
  console.log('   Type: SECRET');
  console.log();
  
  console.log('💾 DATABASE_URL');
  console.log('   Get from: DigitalOcean → Databases → Connection String');
  console.log('   Type: SECRET');
  console.log();
  
  console.log('🔴 REDIS_URL');
  console.log('   Get from: Redis Cloud or DigitalOcean Managed Redis');
  console.log('   Format: rediss://default:PASSWORD@HOST:PORT');
  console.log('   Type: SECRET');
  console.log();
  
  console.log('═'.repeat(70));
  console.log('✅ After setting all secrets in DigitalOcean:');
  console.log('   1. Save environment variables');
  console.log('   2. DO NOT deploy yet');
  console.log('   3. Return here for final deployment step');
  console.log('═'.repeat(70));
  console.log();
  
  console.log('🔒 SECURITY REMINDER:');
  console.log('   - Mark ALL secrets as "Secret" (encrypted) in DigitalOcean');
  console.log('   - NEVER share these values via Slack/Discord/Email');
  console.log('   - NEVER commit to Git');
  console.log('   - Rotate every 90 days\n');
}

main().catch(console.error);

