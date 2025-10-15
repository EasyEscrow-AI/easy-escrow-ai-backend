# Static Devnet Wallets for E2E Testing

This document describes the static wallet addresses used for devnet E2E testing.

## Wallet Addresses

### Sender (Seller) - NFT Owner
**Address:** `CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1`
- Owns NFT
- Receives USDC payment (99%)

### Receiver (Buyer) - USDC Payer
**Address:** `8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m`
- Pays USDC
- Receives NFT

### Admin - Escrow Operations
**Address:** `5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh`
- Performs escrow operations
- System admin wallet

### FeeCollector - Treasury (Receive-Only)
**Address:** `C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E`
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
solana transfer CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1 2 --url devnet  # Sender
solana transfer 8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m 2 --url devnet  # Receiver
solana transfer 5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh 2 --url devnet  # Admin
solana transfer C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E 1 --url devnet  # FeeCollector
```

#### Batch Fund (PowerShell Script)

```powershell
.\scripts\fund-devnet-wallets.ps1 `
  -Buyer 8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m `
  -Seller CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1 `
  -Admin 5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh `
  -FeeCollector C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E
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

- [Sender](https://explorer.solana.com/address/CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1?cluster=devnet)
- [Receiver](https://explorer.solana.com/address/8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m?cluster=devnet)
- [Admin](https://explorer.solana.com/address/5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh?cluster=devnet)
- [FeeCollector](https://explorer.solana.com/address/C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E?cluster=devnet)

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
solana balance CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1 --url devnet
solana balance 8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m --url devnet
solana balance 5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh --url devnet
solana balance C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E --url devnet
```

### Request Airdrop (if needed)

```bash
solana airdrop 2 CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1 --url devnet
solana airdrop 2 8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m --url devnet
solana airdrop 2 5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh --url devnet
solana airdrop 1 C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E --url devnet
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

