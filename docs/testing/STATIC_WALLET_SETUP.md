# Static Wallet Setup for E2E Tests

**Date:** October 16, 2025  
**Purpose:** Configure E2E tests to use pre-funded static devnet wallets

## Wallet Addresses (Already Configured)

The following static wallet addresses are now configured in `tests/fixtures/devnet-config.json`:

| Role | Address |
|------|---------|
| **Sender (Buyer1/Seller)** | `FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71` |
| **Receiver (Buyer2)** | `Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk` |
| **Admin** | `7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u` |
| **FeeCollector** | `C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E` |

## Quick Start

### Step 1: Set Environment Variables (Required)

You need to provide the **private keys** for these wallets. Set these environment variables with base58-encoded private keys:

#### PowerShell (Windows)
```powershell
$env:DEVNET_SENDER_PRIVATE_KEY="<your_base58_private_key>"
$env:DEVNET_RECEIVER_PRIVATE_KEY="<your_base58_private_key>"
$env:DEVNET_ADMIN_PRIVATE_KEY="<your_base58_private_key>"
$env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY="<your_base58_private_key>"
```

#### Bash (Linux/Mac)
```bash
export DEVNET_SENDER_PRIVATE_KEY="<your_base58_private_key>"
export DEVNET_RECEIVER_PRIVATE_KEY="<your_base58_private_key>"
export DEVNET_ADMIN_PRIVATE_KEY="<your_base58_private_key>"
export DEVNET_FEE_COLLECTOR_PRIVATE_KEY="<your_base58_private_key>"
```

### Step 2: Verify Wallet Funding

Check that all wallets have sufficient SOL:

```bash
solana balance FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71 --url devnet
solana balance Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk --url devnet
solana balance 7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u --url devnet
solana balance C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E --url devnet
```

**Minimum Requirements:**
- Sender: 2 SOL
- Receiver: 2 SOL
- Admin: 1 SOL
- FeeCollector: 0.5 SOL

### Step 3: Fund if Needed

If any wallet is low on SOL:

```bash
solana transfer FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71 2 --url devnet
solana transfer Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk 2 --url devnet
solana transfer 7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u 1 --url devnet
solana transfer C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E 1 --url devnet
```

### Step 4: Run Tests

```bash
npm run test:e2e:devnet:nft-swap
npm run test:e2e:devnet
npm run simple-e2e
```

## Alternative: Store Private Keys in Config File

**⚠️ WARNING: Only use this for local development. Never commit the file with private keys!**

Add a `walletKeys` section to `tests/fixtures/devnet-config.json`:

```json
{
  "walletKeys": {
    "sender": "<base58_private_key>",
    "receiver": "<base58_private_key>",
    "admin": "<base58_private_key>",
    "feeCollector": "<base58_private_key>"
  },
  "wallets": {
    "sender": "FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71",
    "receiver": "Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk",
    "admin": "7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u",
    "feeCollector": "C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E"
  }
}
```

**Note:** `tests/fixtures/devnet-config.json` is gitignored, so it won't be committed accidentally.

## Converting Keypair Files to Base58

If you have keypair JSON files, convert them to base58 format:

### Using Node.js
```javascript
const fs = require('fs');
const bs58 = require('bs58');

const keypairFile = fs.readFileSync('path/to/keypair.json', 'utf-8');
const keypairArray = JSON.parse(keypairFile);
const privateKey = bs58.encode(Buffer.from(keypairArray));
console.log(privateKey);
```

### One-liner (in project directory)
```bash
node -e "const bs58=require('bs58');const fs=require('fs');console.log(bs58.encode(Buffer.from(JSON.parse(fs.readFileSync('keypair.json')))))"
```

### Using Solana CLI (shows public key only)
```bash
solana-keygen pubkey keypair.json
```

## Test Files Using Static Wallets

These test files will now use your static wallets:

- ✅ `tests/e2e/devnet-nft-usdc-swap.test.ts` (uses `loadDevnetWallets()`)
- ✅ `tests/e2e/devnet-e2e.test.ts` (updated to use `loadStaticWallets()`)
- 🔄 `tests/e2e/simple-devnet.test.ts` (still uses deterministic seeds - optional to update)
- 🔄 `tests/e2e/devnet-e2e-corrected.test.ts` (uses `loadDevnetWallets()`)

## Troubleshooting

### Error: "Private keys not provided"

**Problem:** Environment variables not set and config file missing `walletKeys`

**Solution:**
1. Set environment variables as shown in Step 1
2. OR add `walletKeys` to `tests/fixtures/devnet-config.json`

### Error: "Failed to load devnet wallets"

**Problem:** Invalid base58 private key format

**Solution:**
- Verify your private keys are base58-encoded
- Check for extra spaces or newlines in environment variables
- Convert from JSON array format if needed

### Tests fail immediately with balance errors

**Problem:** Wallets not funded or depleted

**Solution:**
```bash
# Check balances
solana balance FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71 --url devnet

# Fund as needed
solana transfer FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71 2 --url devnet
```

### Different wallet addresses showing in test output

**Problem:** Environment variables or config not being read

**Solution:**
1. Check environment variables are set in current shell:
   ```powershell
   echo $env:DEVNET_SENDER_PRIVATE_KEY  # PowerShell
   echo $DEVNET_SENDER_PRIVATE_KEY      # Bash
   ```
2. Verify `tests/fixtures/devnet-config.json` exists
3. Check test output for "Loading wallets from..." message

## Security Best Practices

1. **Never commit private keys** to the repository
   - `tests/fixtures/devnet-config.json` is gitignored
   - But always double-check before committing

2. **Use environment variables** for CI/CD
   - Store in GitHub Secrets, not in code
   - Rotate keys if exposed

3. **Devnet keys only**
   - Never reuse devnet keys on mainnet
   - Keep mainnet keys completely separate

4. **FeeCollector security**
   - This is a treasury wallet
   - Store its private key securely
   - It only needs to receive, rarely signs

## Benefits of Static Wallets

✅ **Reusable** - Fund once, use for multiple test runs  
✅ **Predictable** - Same addresses every time  
✅ **Trackable** - View transaction history on Solana Explorer  
✅ **Cost-effective** - Avoid airdrop rate limits  
✅ **Debuggable** - Easy to inspect wallet state between tests  

## Solana Explorer Links

Track your wallets on Solana Explorer:

- [Sender (CL8c...)](https://explorer.solana.com/address/FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71?cluster=devnet)
- [Receiver (8GDA...)](https://explorer.solana.com/address/Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk?cluster=devnet)
- [Admin (5wwb...)](https://explorer.solana.com/address/7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u?cluster=devnet)
- [FeeCollector (C5ji...)](https://explorer.solana.com/address/C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E?cluster=devnet)

## Next Steps

1. ✅ Set environment variables with your private keys
2. ✅ Verify wallet balances
3. ✅ Run E2E tests
4. ✅ Monitor wallet balances and refund as needed

