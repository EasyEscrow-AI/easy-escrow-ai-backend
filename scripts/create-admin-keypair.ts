/**
 * Convert base58 private key to JSON keypair format for Solana CLI
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import bs58 from 'bs58';

// Load production env
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

const privateKeyBase58 = process.env.MAINNET_ADMIN_PRIVATE_KEY;

if (!privateKeyBase58) {
  console.error('❌ MAINNET_ADMIN_PRIVATE_KEY not found in .env.production');
  process.exit(1);
}

// Convert base58 to byte array
const secretKey = bs58.decode(privateKeyBase58);

// Create JSON format [byte array]
const keypairJson = JSON.stringify(Array.from(secretKey));

// Save to temp directory
const outputPath = path.join(__dirname, '../temp/admin-keypair.json');
fs.writeFileSync(outputPath, keypairJson);

console.log('✅ Admin keypair created:', outputPath);
console.log('');
console.log('Use with Solana CLI:');
console.log(`   solana config set --keypair ${outputPath}`);




