#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';

interface WalletKeys {
  sender: string;
  receiver: string;
  admin: string;
  feeCollector: string;
}

/**
 * Extract base58 private keys from staging wallet JSON files
 */
function extractStagingKeys(): WalletKeys {
  const walletsDir = path.join(__dirname, '../../wallets/staging');
  
  const walletFiles = {
    sender: 'staging-sender.json',
    receiver: 'staging-receiver.json',
    admin: 'staging-admin.json',
    feeCollector: 'staging-fee-collector.json'
  };

  const keys: WalletKeys = {
    sender: '',
    receiver: '',
    admin: '',
    feeCollector: ''
  };

  for (const [role, filename] of Object.entries(walletFiles)) {
    const filePath = path.join(walletsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Wallet file not found: ${filePath}`);
    }

    const keypairJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const keypairBytes = Uint8Array.from(keypairJson);
    const base58Key = bs58.encode(keypairBytes);
    
    keys[role as keyof WalletKeys] = base58Key;
  }

  return keys;
}

/**
 * Main execution
 */
function main() {
  try {
    console.log('🔑 Extracting base58 private keys from staging wallets...\n');
    
    const keys = extractStagingKeys();
    
    console.log('✅ Successfully extracted keys:\n');
    console.log(`DEVNET_STAGING_SENDER_PRIVATE_KEY=${keys.sender}`);
    console.log(`DEVNET_STAGING_RECEIVER_PRIVATE_KEY=${keys.receiver}`);
    console.log(`DEVNET_STAGING_ADMIN_PRIVATE_KEY=${keys.admin}`);
    console.log(`DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=${keys.feeCollector}`);
    
    console.log('\n✅ Copy these to your .env.staging file');
  } catch (error) {
    console.error('❌ Error extracting keys:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { extractStagingKeys };

