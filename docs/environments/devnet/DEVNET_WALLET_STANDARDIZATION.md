# Devnet Wallet Address Standardization

**Date**: January 16, 2025  
**Branch**: `fix/devnet-wallet-address-sync`  
**Status**: ✅ COMPLETED

---

## Problem Statement

The backend system had **mismatched wallet addresses** across different files:
- **Configuration file** (`tests/fixtures/devnet-config.json`) had one set of addresses
- **Scripts** (`scripts/set-devnet-env-vars.ps1` and others) referenced different addresses
- **Environment variables** were not standardized

This created confusion and test failures because:
1. Tests were using different wallets than expected
2. Funding scripts targeted wrong addresses
3. Deployment scripts referenced incorrect wallets

---

## Solution: Single Source of Truth

We established `tests/fixtures/devnet-config.json` as the **single source of truth** for devnet wallet addresses.

### Official Devnet Wallet Addresses

| Role | Address | Purpose |
|------|---------|---------|
| **Sender** | `FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71` | NFT owner (seller) |
| **Receiver** | `Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk` | USDC payer (buyer) |
| **Admin** | `7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u` | Escrow operations |
| **Fee Collector** | `C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E` | Treasury (1% fees) |

### Configuration Hierarchy

The system reads wallet configuration in this priority order:

```
1. Environment Variables (Highest Priority)
   ↓
   DEVNET_SENDER_PRIVATE_KEY
   DEVNET_RECEIVER_PRIVATE_KEY
   DEVNET_ADMIN_PRIVATE_KEY
   DEVNET_FEE_COLLECTOR_PRIVATE_KEY

2. Configuration File (Fallback)
   ↓
   tests/fixtures/devnet-config.json
   {
     "wallets": { ... },      // Public addresses
     "walletKeys": { ... }    // Private keys (base58)
   }

3. Generate New (Last Resort)
   ↓
   If neither above exist, generate new wallets
   and create devnet-config.json automatically
```

---

## Files Updated

### Scripts Updated

1. **`scripts/set-devnet-env-vars.ps1`**
   - Updated static wallet addresses in usage/help text
   - Updated example funding command
   - Changed from:
     - Sender: `CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1` ❌
     - Receiver: `8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m` ❌
     - Admin: `5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh` ❌
   - Changed to: (Correct addresses from `devnet-config.json` ✅)

2. **`scripts/digitalocean/deploy.ps1`**
   - Added reference to correct wallet addresses
   - Added documentation note pointing to `devnet-config.json`

3. **`scripts/digitalocean/setup-devnet-secrets.ps1`**
   - Added wallet address reference in help text
   - Ensures correct addresses are documented when setting secrets

### Documentation Updated

4. **`docs/ENV_TEMPLATE.md`** (NEW)
   - Complete environment variable template
   - Documents all required variables
   - Shows official wallet addresses
   - Provides setup instructions
   - Includes troubleshooting section

### Configuration Files

5. **`tests/fixtures/devnet-config.json`** (Source of Truth)
   - Already contained correct addresses
   - No changes needed
   - This is the reference file

6. **`tests/fixtures/devnet-static-wallets.json`**
   - Already contained correct addresses
   - No changes needed

---

## How to Use

### For Local Development

#### Step 1: Set Environment Variables

```powershell
# PowerShell (Recommended)
.\scripts\set-devnet-env-vars.ps1 `
  -SenderKey "<sender_private_key_base58>" `
  -ReceiverKey "<receiver_private_key_base58>" `
  -AdminKey "<admin_private_key_base58>" `
  -FeeCollectorKey "<fee_collector_private_key_base58>" `
  -Permanent
```

Or manually:

```powershell
$env:DEVNET_SENDER_PRIVATE_KEY = "<base58_key>"
$env:DEVNET_RECEIVER_PRIVATE_KEY = "<base58_key>"
$env:DEVNET_ADMIN_PRIVATE_KEY = "<base58_key>"
$env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY = "<base58_key>"
```

#### Step 2: Verify Configuration

```powershell
# Check environment variables
.\scripts\set-devnet-env-vars.ps1 -Show

# Check config file
cat tests\fixtures\devnet-config.json
```

#### Step 3: Fund Wallets

```powershell
.\scripts\fund-devnet-wallets.ps1 `
  -Buyer Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk `
  -Seller FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71 `
  -Admin 7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u `
  -FeeCollector C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E
```

#### Step 4: Run Tests

```powershell
npm test
npm run test:e2e:devnet
```

### For DigitalOcean Deployment

#### Step 1: Set Local Environment Variables

```powershell
.\scripts\set-devnet-env-vars.ps1 -Permanent `
  -SenderKey "<key>" `
  -ReceiverKey "<key>" `
  -AdminKey "<key>" `
  -FeeCollectorKey "<key>"
```

#### Step 2: Deploy Secrets to DigitalOcean

```powershell
.\scripts\digitalocean\setup-devnet-secrets.ps1 `
  -AppId <your_app_id> `
  -FromEnv
```

#### Step 3: Deploy Application

```powershell
.\scripts\digitalocean\deploy.ps1 `
  -AppId <your_app_id> `
  -IncludeDevnetSecrets
```

---

## Test Helper Integration

### E2E Test Helper

The `tests/helpers/devnet-wallet-manager.ts` helper automatically:

1. **Checks environment variables first**
   ```typescript
   const senderKey = process.env.DEVNET_SENDER_PRIVATE_KEY;
   const receiverKey = process.env.DEVNET_RECEIVER_PRIVATE_KEY;
   const adminKey = process.env.DEVNET_ADMIN_PRIVATE_KEY;
   const feeCollectorKey = process.env.DEVNET_FEE_COLLECTOR_PRIVATE_KEY;
   ```

2. **Falls back to config file**
   ```typescript
   const config = JSON.parse(fs.readFileSync('tests/fixtures/devnet-config.json'));
   sender = Keypair.fromSecretKey(bs58.decode(config.walletKeys.sender));
   ```

3. **Generates new if neither exist**
   ```typescript
   sender = Keypair.generate();
   // Saves to devnet-config.json
   ```

### Usage in Tests

```typescript
import { loadDevnetWallets } from '../helpers/devnet-wallet-manager';

// Automatically loads from env vars or config file
const wallets = await loadDevnetWallets();

// Returns standardized wallet structure
wallets.sender;        // FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71
wallets.receiver;      // Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk
wallets.admin;         // 7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u
wallets.feeCollector;  // C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E
```

---

## Verification

### Check All Files Use Correct Addresses

```bash
# Should return NO results (all fixed)
grep -r "CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1" .
grep -r "8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m" .
grep -r "5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh" .

# Should return matches in config files (correct addresses)
grep -r "FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71" .
grep -r "Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk" .
grep -r "7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u" .
grep -r "C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E" .
```

### Run Tests

```powershell
# Unit tests
npm test

# E2E tests (requires funded wallets)
npm run test:e2e:devnet
```

---

## Migration Guide

If you have **old environment variables or config files** with the wrong addresses:

### Step 1: Clear Old Variables

```powershell
# PowerShell
Remove-Item Env:\DEVNET_SENDER_PRIVATE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\DEVNET_RECEIVER_PRIVATE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\DEVNET_ADMIN_PRIVATE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\DEVNET_FEE_COLLECTOR_PRIVATE_KEY -ErrorAction SilentlyContinue
```

### Step 2: Delete Old Config

```powershell
# Delete old config file (will be regenerated)
Remove-Item tests\fixtures\devnet-config.json -ErrorAction SilentlyContinue
```

### Step 3: Set New Variables

```powershell
.\scripts\set-devnet-env-vars.ps1 -Permanent `
  -SenderKey "<NEW_KEY_FOR_FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71>" `
  -ReceiverKey "<NEW_KEY_FOR_Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk>" `
  -AdminKey "<NEW_KEY_FOR_7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u>" `
  -FeeCollectorKey "<NEW_KEY_FOR_C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E>"
```

### Step 4: Fund New Wallets

```powershell
.\scripts\fund-devnet-wallets.ps1 `
  -Buyer Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk `
  -Seller FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71 `
  -Admin 7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u `
  -FeeCollector C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E
```

---

## Security Notes

### ⚠️ CRITICAL

1. **Private keys are in `devnet-config.json`**
   - This file is **gitignored**
   - NEVER commit it to version control
   - Share private keys only through secure channels

2. **Environment variables are persistent**
   - Using `-Permanent` flag sets user-level variables
   - They persist across PowerShell sessions
   - Restart shell to see changes

3. **DEVNET ONLY**
   - These wallets should ONLY be used on devnet
   - NEVER use these keys on mainnet
   - Generate new keys for mainnet

4. **Rotate regularly**
   - If private keys are compromised, generate new ones
   - Update all environments with new keys
   - Fund new wallets and re-run tests

---

## Related Documentation

- [ENV_TEMPLATE.md](./ENV_TEMPLATE.md) - Environment variable template
- [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) - Complete variable reference
- [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Environment setup guide
- [STATIC_DEVNET_WALLETS.md](./STATIC_DEVNET_WALLETS.md) - Devnet wallet setup
- [DEVNET_DEPLOYMENT_GUIDE.md](./DEVNET_DEPLOYMENT_GUIDE.md) - Deployment guide
- [DIGITALOCEAN_SECRETS_CONFIGURATION.md](./DIGITALOCEAN_SECRETS_CONFIGURATION.md) - DO secrets

---

## Summary

✅ **Standardized** all wallet addresses to match `devnet-config.json`  
✅ **Updated** all scripts with correct addresses  
✅ **Created** comprehensive environment variable template  
✅ **Documented** configuration hierarchy and usage  
✅ **Verified** e2e tests use correct addresses  
✅ **Added** migration guide for existing setups  

**Result**: All systems now reference the same devnet wallet addresses consistently.

---

**Last Updated**: January 16, 2025  
**Author**: AI Assistant  
**Version**: 1.0.0

