# E2E Test USDC Setup Guide

## Important Change: Now Using Official Devnet USDC

The E2E tests have been updated to use the **official devnet USDC mint** instead of creating custom test mints. This ensures compatibility with the production API.

**Official Devnet USDC:** `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`

---

## Required Setup

### 1. Update Your `.env` File

Make sure your `.env` file uses the official devnet USDC:

```bash
USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
```

### 2. Fund Test Wallets with Devnet USDC

Before running E2E tests, your test wallets need devnet USDC tokens.

#### Get Devnet USDC from Faucet

**Option 1: SPL Token Faucet (Recommended)**
```
https://spl-token-faucet.com/?token-name=USDC-Dev
```

**Option 2: Manual Request**
```bash
# Connect your wallet to devnet and request USDC
# Minimum required: 0.5 USDC per test run
```

#### Required Balances

For the receiver wallet (buyer):
- **Minimum:** 0.5 USDC per test run
- **Recommended:** 2-3 USDC for multiple test runs

Example:
```
Receiver: Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk
Required: 0.5+ USDC
```

### 3. Check Wallet Balances

Before running tests, verify your wallets have USDC:

```powershell
# Check receiver USDC balance
solana balance --url devnet Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk
```

Or use the inline check script:

```bash
node -e "
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAccount } = require('@solana/spl-token');
const connection = new Connection('https://api.devnet.solana.com');
const USDC_MINT = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
// Add your check logic here
"
```

---

## Why This Change?

### Before (❌ Issues)
- Tests created custom USDC mint every run
- Custom mint address: `738juYYJLqMRB1DTeffUR7zPuc9zyftCswedLYuikjzk`
- API expected official USDC: `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`
- **Result:** ATA address mismatch, deposit failures

### After (✅ Fixed)
- Tests use official devnet USDC mint
- Matches API's expected mint address
- ATAs calculated correctly
- Proper integration testing

---

## Running E2E Tests

Once USDC is funded:

```powershell
# Load environment
Get-Content .env | ForEach-Object { 
  if ($_ -match '^([^=]+)=(.*)$') { 
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') 
  } 
}

# Point to DO dev server
$env:API_BASE_URL = "https://easyescrow-backend-dev-rg7y6.ondigitalocean.app"
$env:SOLANA_NETWORK = "devnet"

# Run tests
npm run test:e2e
```

---

## Troubleshooting

### "Receiver has insufficient USDC"

**Problem:** Test wallet doesn't have enough USDC

**Solution:** Get devnet USDC from faucet (see step 2)

### "Invalid account data for instruction"

**Problem:** USDC mint mismatch between test and API

**Solution:** Make sure both use `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`

### "ATA address mismatch"

**Problem:** Test created ATA for wrong USDC mint

**Solution:** 
1. Delete `tests/fixtures/devnet-config.json`
2. Rerun test (will use official USDC)

---

## Additional Resources

- **Official Devnet USDC Explorer:** https://explorer.solana.com/address/Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr?cluster=devnet
- **SPL Token Faucet:** https://spl-token-faucet.com/?token-name=USDC-Dev
- **Solana Cookbook - Tokens:** https://solanacookbook.com/references/token.html

---

**Last Updated:** October 16, 2025

