# Static Devnet Wallets for E2E Testing

This document describes the static wallet addresses used for devnet E2E testing.

## Wallet Addresses

### Sender (Seller) - NFT Owner
**Address:** `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z`
- Owns NFT
- Receives USDC payment (99%)

### Receiver (Buyer) - USDC Payer
**Address:** `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4`
- Pays USDC
- Receives NFT

### Admin - Escrow Operations
**Address:** `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`
- Performs escrow operations
- System admin wallet

### FeeCollector - Treasury (Receive-Only)
**Address:** `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ`
- Receives 1% fees
- Treasury wallet
- Receive-only (never signs transactions)

## Setup Instructions

### 1. Initialize Static Wallet Configuration

```powershell
# Run the setup script
.\scripts\setup-static-devnet-wallets.ps1
```

This creates `tests/fixtures/devnet-config.json` with the static wallet addresses.

### 2. Provide Private Keys

**⚠️ NEVER commit private keys to the repository!**

Choose one of these methods:

#### Option A: Environment Variables (Recommended)

Set these environment variables with the base58-encoded private keys:

```powershell
# PowerShell
$env:DEVNET_SENDER_PRIVATE_KEY="<base58_private_key>"
$env:DEVNET_RECEIVER_PRIVATE_KEY="<base58_private_key>"
$env:DEVNET_ADMIN_PRIVATE_KEY="<base58_private_key>"
$env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY="<base58_private_key>"
```

```bash
# Bash
export DEVNET_SENDER_PRIVATE_KEY="<base58_private_key>"
export DEVNET_RECEIVER_PRIVATE_KEY="<base58_private_key>"
export DEVNET_ADMIN_PRIVATE_KEY="<base58_private_key>"
export DEVNET_FEE_COLLECTOR_PRIVATE_KEY="<base58_private_key>"
```

#### Option B: Add to devnet-config.json (Local Only)

Edit `tests/fixtures/devnet-config.json` and add:

```json
{
  "walletKeys": {
    "sender": "<base58_private_key>",
    "receiver": "<base58_private_key>",
    "admin": "<base58_private_key>",
    "feeCollector": "<base58_private_key>"
  },
  "wallets": {
    // ... existing wallet addresses
  }
}
```

**Note:** `tests/fixtures/devnet-config.json` is gitignored.

### 3. Fund the Wallets

#### Quick Fund (Individual Commands)

```bash
solana transfer AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z 2 --url devnet  # Sender
solana transfer 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 2 --url devnet  # Receiver
solana transfer 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R 2 --url devnet  # Admin
solana transfer 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ 1 --url devnet  # FeeCollector
```

#### Batch Fund (PowerShell Script)

```powershell
.\scripts\fund-devnet-wallets.ps1 `
  -Buyer 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 `
  -Seller AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z `
  -Admin 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R `
  -FeeCollector 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ
```

### 4. Run E2E Tests

```bash
npm run test:e2e:devnet:nft-swap
```

## Converting Keypair to Base58

If you have a keypair JSON file, convert it to base58:

```typescript
// Node.js / TypeScript
import * as fs from 'fs';
import * as bs58 from 'bs58';

const keypairFile = fs.readFileSync('path/to/keypair.json', 'utf-8');
const keypairArray = JSON.parse(keypairFile);
const privateKey = bs58.encode(Buffer.from(keypairArray));
console.log(privateKey);
```

Or use this one-liner in the project:

```bash
node -e "const bs58=require('bs58');const fs=require('fs');console.log(bs58.encode(Buffer.from(JSON.parse(fs.readFileSync('keypair.json')))))"
```

## Security Best Practices

1. **Never commit private keys** to the repository
2. **Use environment variables** for CI/CD and local development
3. **Rotate keys regularly** if they're exposed
4. **Keep FeeCollector private key secure** - it's a treasury wallet
5. **Use separate keypairs** for mainnet (never reuse devnet keys)

## Solana Explorer Links

- [Sender](https://explorer.solana.com/address/AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z?cluster=devnet)
- [Receiver](https://explorer.solana.com/address/5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4?cluster=devnet)
- [Admin](https://explorer.solana.com/address/498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R?cluster=devnet)
- [FeeCollector](https://explorer.solana.com/address/8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ?cluster=devnet)

## Troubleshooting

### "Failed to load devnet wallets"

**Cause:** Private keys not provided

**Solution:** Set environment variables or add `walletKeys` to `devnet-config.json`

### "Insufficient wallet balances"

**Cause:** Wallets not funded or funds depleted

**Solution:** Run funding commands above

### Tests fail with "Account not found"

**Cause:** Wallet doesn't exist on devnet or needs activation

**Solution:** Fund with at least 0.01 SOL to activate the account

## Maintaining Static Wallets

### Check Balances

```bash
solana balance AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z --url devnet
solana balance 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 --url devnet
solana balance 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R --url devnet
solana balance 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ --url devnet
```

### Request Airdrop (if needed)

```bash
solana airdrop 2 AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z --url devnet
solana airdrop 2 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 --url devnet
solana airdrop 2 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R --url devnet
solana airdrop 1 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ --url devnet
```

## CI/CD Integration

For automated testing in CI/CD:

```yaml
# GitHub Actions example
env:
  DEVNET_SENDER_PRIVATE_KEY: ${{ secrets.DEVNET_SENDER_PRIVATE_KEY }}
  DEVNET_RECEIVER_PRIVATE_KEY: ${{ secrets.DEVNET_RECEIVER_PRIVATE_KEY }}
  DEVNET_ADMIN_PRIVATE_KEY: ${{ secrets.DEVNET_ADMIN_PRIVATE_KEY }}
  DEVNET_FEE_COLLECTOR_PRIVATE_KEY: ${{ secrets.DEVNET_FEE_COLLECTOR_PRIVATE_KEY }}
```

Store private keys as repository secrets.

