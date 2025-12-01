# Wallet Generation Guardrails

**Date**: January 16, 2025  
**Branch**: `fix/devnet-wallet-address-sync`

---

## Overview

To prevent accidental overwriting of existing devnet wallets, we've implemented **guardrails** in all wallet generation scripts and helpers.

---

## Guardrails Implemented

### 1. TypeScript Helper (`tests/helpers/devnet-wallet-manager.ts`)

**Location**: `loadDevnetWallets()` function

**Guardrail**: Automatic wallet generation is **DISABLED by default**

#### Behavior

The helper now follows this strict hierarchy:

1. **Check environment variables** (highest priority)
   - `DEVNET_SENDER_PRIVATE_KEY`
   - `DEVNET_RECEIVER_PRIVATE_KEY`
   - `DEVNET_ADMIN_PRIVATE_KEY`
   - `DEVNET_FEE_COLLECTOR_PRIVATE_KEY`
   - ✅ If all found: Use them
   - ❌ If any missing: Continue to next step

2. **Check configuration file** (`tests/fixtures/devnet-config.json`)
   - ✅ If exists with all wallet keys: Use them
   - ❌ If missing or incomplete: Continue to next step

3. **Automatic generation** (BLOCKED by default)
   - ❌ **THROWS ERROR** by default
   - ✅ Only proceeds if `FORCE_GENERATE_WALLETS=true`

#### Error Message

When no wallets are found and force generation is disabled:

```
❌ No wallet configuration found!

⚠️  GUARDRAIL: Automatic wallet generation is disabled to prevent overwriting existing wallets.

Options:
1. Set environment variables (RECOMMENDED):
   - DEVNET_SENDER_PRIVATE_KEY
   - DEVNET_RECEIVER_PRIVATE_KEY
   - DEVNET_ADMIN_PRIVATE_KEY
   - DEVNET_FEE_COLLECTOR_PRIVATE_KEY

2. Use the setup script to create static wallets:
   scripts/setup-static-devnet-wallets.ps1

3. Create tests/fixtures/devnet-config.json manually with your wallet keys

4. Force generation of NEW wallets (USE WITH CAUTION):
   Set FORCE_GENERATE_WALLETS=true environment variable

For setup instructions, see: docs/ENV_TEMPLATE.md
```

#### Force Generation Mode

If you set `FORCE_GENERATE_WALLETS=true`, the helper will:

1. **Warn heavily** with multiple warnings
2. Generate completely new wallet addresses
3. Save them to `devnet-config.json`
4. Display the new addresses
5. Show funding instructions

**⚠️ WARNING**: Force-generated wallets will have **DIFFERENT addresses** than any existing funded wallets!

### 2. PowerShell Script (`scripts/setup-static-devnet-wallets.ps1`)

**Guardrail**: Checks existing config and compares addresses

#### Behavior

When `devnet-config.json` already exists:

1. **Load existing config** and display addresses
2. **Compare with standardized addresses**
3. **If addresses match**:
   - ✅ Exit with success message
   - No overwrite needed
   - Suggests using `set-devnet-env-vars.ps1` for key updates
4. **If addresses DON'T match**:
   - ⚠️ Display both existing and standardized addresses
   - ⚠️ Warn that overwriting will change addresses
   - ⚠️ Warn that new addresses need funding
   - Ask for confirmation
5. **Confirmation required** unless `-Force` flag is used

#### Example Output

When addresses match:
```powershell
⚠️  Configuration file already exists: tests/fixtures/devnet-config.json

Existing wallet addresses:
  Sender:       AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z
  Receiver:     5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4
  Admin:        498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
  FeeCollector: 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ

✅ Addresses match standardized wallets. No need to overwrite.

If you need to update private keys, edit the file manually or use:
  .\scripts\set-devnet-env-vars.ps1
```

When addresses don't match:
```powershell
⚠️  GUARDRAIL WARNING: Existing addresses DO NOT match standardized wallets!

Standardized addresses:
  Sender:       AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z
  Receiver:     5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4
  Admin:        498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
  FeeCollector: 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ

⚠️  Overwriting will change your wallet addresses!
   This means you'll need to fund NEW addresses.

Overwrite with standardized static wallets? (y/n):
```

---

## Usage Guide

### Safe Wallet Setup (Recommended)

#### Option 1: Environment Variables

```powershell
# Set environment variables (recommended)
.\scripts\set-devnet-env-vars.ps1 -Permanent `
  -SenderKey "<private_key>" `
  -ReceiverKey "<private_key>" `
  -AdminKey "<private_key>" `
  -FeeCollectorKey "<private_key>"
```

#### Option 2: Manual Configuration

1. Create `tests/fixtures/devnet-config.json`:
```json
{
  "wallets": {
    "sender": "AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z",
    "receiver": "5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4",
    "admin": "498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R",
    "feeCollector": "8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ"
  },
  "walletKeys": {
    "sender": "<base58_private_key>",
    "receiver": "<base58_private_key>",
    "admin": "<base58_private_key>",
    "feeCollector": "<base58_private_key>"
  }
}
```

#### Option 3: Setup Script

```powershell
# Setup standardized static wallets
.\scripts\setup-static-devnet-wallets.ps1
```

This will:
- Check if config exists
- Compare addresses with standardized wallets
- Warn if addresses don't match
- Require confirmation before overwriting

### Force Generation (Use with Caution!)

#### PowerShell Script

```powershell
# Force overwrite with standardized addresses
.\scripts\setup-static-devnet-wallets.ps1 -Force
```

#### TypeScript Tests

```bash
# Force generate new wallets
FORCE_GENERATE_WALLETS=true npm test

# PowerShell
$env:FORCE_GENERATE_WALLETS="true"
npm test
```

**⚠️ WARNING**: Force generation creates NEW wallet addresses!

---

## Verification

### Check Current Configuration

```powershell
# Show environment variables
.\scripts\set-devnet-env-vars.ps1 -Show

# Check config file
cat tests/fixtures/devnet-config.json

# Check if addresses match standardized
.\scripts\setup-static-devnet-wallets.ps1
# (Will exit with success if addresses match)
```

### Test Wallet Loading

```powershell
# This should either succeed or show clear error with instructions
npm test
```

Expected outcomes:
1. ✅ **Success**: Wallets loaded from env vars or config
2. ❌ **Clear error**: Shows instructions for setup (no auto-generation)
3. ⚠️ **Force mode**: Heavy warnings before generating

---

## Benefits

### 1. Prevents Accidental Overwrites

Before guardrails:
- Tests could generate new wallets silently
- Scripts would overwrite without warning
- Users would lose track of wallet addresses

After guardrails:
- ✅ Explicit confirmation required
- ✅ Clear warnings about address changes
- ✅ Comparison with standardized addresses
- ✅ Safe defaults (no auto-generation)

### 2. Protects Funded Wallets

Before:
- Generate new addresses → Old funded wallets orphaned
- No warning that addresses changed
- Confusion about why tests fail (no funds)

After:
- ✅ Prevents generating new addresses by default
- ✅ Warns if addresses will change
- ✅ Shows funding instructions for new addresses
- ✅ Suggests using existing configuration

### 3. Enforces Standardization

The guardrails check if wallet addresses match the standardized set:
- Sender: `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z`
- Receiver: `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4`
- Admin: `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`
- FeeCollector: `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ`

If addresses match: ✅ No action needed  
If addresses differ: ⚠️ Warning before overwrite

---

## Migration Path

If you have existing wallets with different addresses:

### Option A: Keep Existing Wallets

1. Don't run setup scripts
2. Set environment variables for your existing wallets
3. Tests will use your wallets

### Option B: Migrate to Standardized Wallets

1. **Export old wallet private keys** (if needed)
2. Run `.\scripts\setup-static-devnet-wallets.ps1`
3. Confirm overwrite when prompted
4. **Fund the new standardized addresses**
5. Update environment variables (or use config file)

### Option C: Force Generate New Wallets

1. Set `FORCE_GENERATE_WALLETS=true`
2. Run tests (will generate new wallets)
3. **Fund the newly generated addresses**
4. Save the new addresses for future use

---

## Error Handling

### Error: No wallet configuration found

**Cause**: No env vars, no config file, force generation disabled

**Solution**: Set env vars or create config file (see [ENV_TEMPLATE.md](ENV_TEMPLATE.md))

### Error: Config file missing wallet keys

**Cause**: Config file exists but doesn't have `walletKeys` section

**Solution**: Add private keys to config or use env vars

### Warning: Addresses don't match standardized wallets

**Cause**: Your config has different addresses than standardized set

**Solution**: Either keep your addresses or migrate to standardized ones

---

## Related Documentation

- [ENV_TEMPLATE.md](ENV_TEMPLATE.md) - Environment setup guide
- [DEVNET_WALLET_STANDARDIZATION.md](DEVNET_WALLET_STANDARDIZATION.md) - Wallet standardization
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) - Complete variable reference
- [STATIC_DEVNET_WALLETS.md](STATIC_DEVNET_WALLETS.md) - Static wallet setup

---

## Summary

✅ **TypeScript Helper**: Blocks auto-generation by default (requires `FORCE_GENERATE_WALLETS=true`)  
✅ **PowerShell Script**: Compares addresses and warns before overwriting  
✅ **Clear Errors**: Helpful error messages with setup instructions  
✅ **Force Mode**: Heavy warnings when generating new addresses  
✅ **Safe Defaults**: Prevents accidental wallet overwrites  

**Result**: Devnet wallets are protected from accidental overwrites, with clear guidance when setup is needed.

---

**Last Updated**: January 16, 2025  
**Author**: AI Assistant  
**Version**: 1.0.0

