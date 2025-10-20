const fs = require('fs');
const bs58 = require('bs58');

// Read wallet keypair files and convert to Base58
const wallets = {
  'staging-sender': 'wallets/staging/staging-sender.json',
  'staging-receiver': 'wallets/staging/staging-receiver.json',
  'staging-admin': 'wallets/staging/staging-admin.json',
  'staging-fee-collector': 'wallets/staging/staging-fee-collector.json'
};

console.log('\n🔑 Converting STAGING Wallet Keys to Base58...\n');

const base58Keys = {};

for (const [name, filepath] of Object.entries(wallets)) {
  const keypairJson = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  const keypairBytes = Uint8Array.from(keypairJson);
  // bs58 v6.x uses default export
  const base58Key = bs58.default ? bs58.default.encode(keypairBytes) : bs58.encode(keypairBytes);
  
  base58Keys[name] = base58Key;
  
  console.log(`✅ ${name}`);
  console.log(`   Address: ${base58Key.substring(0, 44)}`);
  console.log(`   Base58:  ${base58Key.substring(0, 50)}...`);
  console.log('');
}

// Generate .env.staging content
const envContent = `# STAGING Environment Configuration
# DO NOT COMMIT THIS FILE
# Last Updated: 2025-01-20

NODE_ENV=staging
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# STAGING Program ID
DEVNET_STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# STAGING Wallets (Base58 Private Keys - same format as DEV)
DEVNET_STAGING_SENDER_PRIVATE_KEY=${base58Keys['staging-sender']}
DEVNET_STAGING_RECEIVER_PRIVATE_KEY=${base58Keys['staging-receiver']}
DEVNET_STAGING_ADMIN_PRIVATE_KEY=${base58Keys['staging-admin']}
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=${base58Keys['staging-fee-collector']}

# Official USDC Devnet Mint
DEVNET_STAGING_USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr

# Redis (STAGING)
REDIS_URL=redis://default:C2FFCNjuy43x5U0GwWCdMIFjNoLpbEQJ@redis-19320.c1.ap-southeast-1-1.ec2.redns.redis-cloud.com:19320

# Database (to be configured in Task 67)
# DATABASE_URL=

# Platform Configuration
PLATFORM_FEE_BPS=100
LOG_LEVEL=debug

# Monitoring
MONITORING_ENDPOINT=https://staging-api.easyescrow.ai/health
`;

// Write to .env.staging
fs.writeFileSync('.env.staging', envContent, 'utf8');

console.log('✅ Updated .env.staging with Base58 format keys\n');
console.log('📝 Format matches DEV environment for consistency\n');

