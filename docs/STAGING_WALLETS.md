# STAGING Wallet Management

This document tracks all wallet addresses for the STAGING environment.

## STAGING Wallet Addresses

| Role | Address | Keypair Location | Backup Location |
|------|---------|------------------|-----------------|
| **Sender** | `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z` | `wallets/staging/staging-sender.json` | `temp/staging-backups/staging-sender.json` |
| **Receiver** | `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4` | `wallets/staging/staging-receiver.json` | `temp/staging-backups/staging-receiver.json` |
| **Admin** | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` | `wallets/staging/staging-admin.json` | `temp/staging-backups/staging-admin.json` |
| **Fee Collector** | `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ` | `wallets/staging/staging-fee-collector.json` | `temp/staging-backups/staging-fee-collector.json` |

## Explorer Links (Devnet)

- **Sender**: https://explorer.solana.com/address/AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z?cluster=devnet
- **Receiver**: https://explorer.solana.com/address/5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4?cluster=devnet
- **Admin**: https://explorer.solana.com/address/498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R?cluster=devnet
- **Fee Collector**: https://explorer.solana.com/address/8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ?cluster=devnet

## Wallet Roles

### Sender Wallet
- **Purpose**: Owns NFTs in test scenarios
- **Usage**: Seller side of escrow transactions
- **Required Balance**: ~5 SOL for transaction fees
- **Env Var**: `DEVNET_STAGING_SENDER_PRIVATE_KEY`

### Receiver Wallet
- **Purpose**: Holds USDC for test payments
- **Usage**: Buyer side of escrow transactions
- **Required Balance**: ~5 SOL + test USDC
- **Env Var**: `DEVNET_STAGING_RECEIVER_PRIVATE_KEY`

### Admin Wallet
- **Purpose**: Administrative operations
- **Usage**: Admin cancellations, system operations
- **Required Balance**: ~3 SOL for admin transactions
- **Env Var**: `DEVNET_STAGING_ADMIN_PRIVATE_KEY`

### Fee Collector Wallet
- **Purpose**: Receives platform fees
- **Usage**: Platform fee accumulation
- **Required Balance**: ~3 SOL (receives fees)
- **Env Var**: `DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY`

## Environment Variables

### Key Format: Base58

**STAGING uses Base58 format for private keys** (same as DEV environment for consistency).

Add these to `.env.staging`:

```bash
# STAGING Wallets (Base58 format - 88 characters)
DEVNET_STAGING_SENDER_PRIVATE_KEY=21YtDf3GptHmEL414KRMjJs9yV6R7A61tjvWc6ZXi8yod...
DEVNET_STAGING_RECEIVER_PRIVATE_KEY=2b6UD1VrvUYZb6eoidA8Xi5sPyezFqPKDNikXpaH2KsS...
DEVNET_STAGING_ADMIN_PRIVATE_KEY=4JMoiWVkrnUxXqdhqCEoPcYu5RjmFSGBPX9Wb2ngRHno...
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=3m2viLKKSgGVkM5cWr92dbiRh57o6BqTZfjgmURujANL...

# Official USDC Devnet Mint
DEVNET_STAGING_USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
```

### Converting Keypair to Base58

If you need to convert a keypair JSON file to Base58:

```javascript
// Using Node.js
const fs = require('fs');
const bs58 = require('bs58');

const keypairJson = JSON.parse(fs.readFileSync('wallet.json', 'utf8'));
const keypairBytes = Uint8Array.from(keypairJson);
const base58Key = bs58.encode(keypairBytes);
console.log(base58Key);
```

Or use the conversion script:

```powershell
node scripts/convert-keys-to-base58.js
```

**Why Base58?**
- ✅ Consistent with DEV environment
- ✅ Standard Solana format (used by CLI tools)
- ✅ More compact and readable than byte arrays
- ✅ Built-in error detection
- ✅ Compatible with all Solana SDKs

## Funding Wallets

### Initial Funding

Run the funding script:

```powershell
.\scripts\fund-staging-wallets.ps1
```

**Note**: Devnet faucet has rate limits. If funding fails:
1. Wait 5-10 minutes
2. Run the script again
3. Or use the web faucet: https://faucet.solana.com/

### Manual Funding

```bash
# Fund individual wallet
solana airdrop 5 <wallet-address> --url devnet

# Check balance
solana balance <wallet-address> --url devnet
```

### Alternative Funding Methods

If faucet is consistently failing:
1. **Web Faucet**: https://faucet.solana.com/
2. **QuickNode Faucet**: https://faucet.quicknode.com/solana/devnet
3. **Solana Discord**: Request SOL in #devnet-faucet channel

## Checking Wallet Balances

```powershell
# Check all STAGING wallet balances
solana balance AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z --url devnet  # Sender
solana balance 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 --url devnet  # Receiver
solana balance 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R --url devnet  # Admin
solana balance 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ --url devnet  # Fee Collector
```

## Backup and Recovery

### Backup Locations

All wallet keypairs are backed up to:
- **Primary**: `wallets/staging/*.json`
- **Backup**: `temp/staging-backups/*.json`

### Recovery Process

If a wallet keypair is lost:

```powershell
# Restore from backup
Copy-Item temp/staging-backups/staging-sender.json wallets/staging/

# Verify address matches
solana address -k wallets/staging/staging-sender.json
# Should output: AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z
```

### Creating Additional Backups

```powershell
# Backup to secure external location
Copy-Item wallets/staging/*.json <secure-backup-location>/
```

## Security Notes

⚠️ **IMPORTANT**:
- **NEVER commit wallet keypairs to git**
- Wallets are in `.gitignore`
- Only `.env.staging.example` (template) is committed
- Use environment variables for private keys

## Setting Up Test Assets

### USDC Token Account

```bash
# Create USDC token account for Receiver (Official USDC Devnet Mint)
spl-token create-account Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr \
  --owner wallets/staging/staging-receiver.json \
  --url devnet

# Get test USDC from devnet faucet
# Visit: https://spl-token-faucet.com/?token-name=USDC-Dev
# Or use Circle's devnet faucet
```

### Test NFT

```bash
# Create test NFT for Sender
# Use Metaplex CLI or similar tool
metaplex create-nft \
  --keypair wallets/staging/staging-sender.json \
  --name "Test NFT #1" \
  --url devnet
```

## Troubleshooting

### "Wallet not found"

**Solution**: Generate wallets if not created:
```powershell
cd wallets/staging
solana-keygen new -o staging-sender.json
# ...repeat for other wallets
```

### "Insufficient funds"

**Solution**: Fund wallet with more SOL:
```bash
solana airdrop 5 <address> --url devnet
```

### "Rate limit exceeded"

**Solution**: Wait 5-10 minutes and try again, or use alternative faucets.

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team

