# Test Fixtures

This directory contains test data and configuration files for E2E testing.

## Security Warning ⚠️

**NEVER COMMIT FILES CONTAINING PRIVATE KEYS**

## Files

### `devnet-static-wallets.json` ✅ Safe to commit
Contains **public addresses only** for static devnet wallets used in E2E tests.
- No private keys
- Safe to version control
- Used for consistent wallet addresses across test runs

### `devnet-config.json` ❌ NEVER COMMIT
Contains **private keys** for devnet wallets.
- **GITIGNORED** - Must never be committed
- Created locally by running `scripts/setup-static-devnet-wallets.ps1`
- Contains `walletKeys` section with base58-encoded private keys
- Alternative: Use environment variables instead

### `devnet-config.example.json` ✅ Safe to commit
Template file showing the structure of `devnet-config.json` without real keys.
- Copy to `devnet-config.json` and fill in your keys
- Or use the setup script to auto-generate

## Setup

### Option 1: Use Setup Script (Recommended)
```powershell
.\scripts\setup-static-devnet-wallets.ps1
```
This creates `devnet-config.json` with all necessary keys.

### Option 2: Copy Template
```bash
cp tests/fixtures/devnet-config.example.json tests/fixtures/devnet-config.json
# Edit devnet-config.json and add your keys
```

### Option 3: Use Environment Variables
Set these environment variables instead of using `devnet-config.json`:
- `DEVNET_SENDER_KEY`
- `DEVNET_RECEIVER_KEY`
- `DEVNET_ADMIN_KEY`
- `DEVNET_FEE_COLLECTOR_KEY`

## Pre-commit Protection

The repository has pre-commit hooks that scan for private keys:
- `scripts/pre-commit-secrets-check.ps1` (Windows)
- `scripts/pre-commit-secrets-check.sh` (Linux/Mac)

These hooks will **block commits** if they detect:
- Private keys in base58 format (44-88 characters)
- Files named `*-keypair.json`
- Files named `devnet-config.json`
- Environment files with keys

## Why This Matters

Even for devnet/testnet:
1. **Principle of least privilege** - Don't expose keys unnecessarily
2. **Attack surface** - Exposed keys can be drained or used maliciously
3. **Best practices** - Prevents bad habits that could leak production keys
4. **Audit trail** - Shows commitment to security practices

## If Keys Are Accidentally Committed

1. **Immediately rotate the keys** - Generate new keypairs
2. **Remove from git history** - Use `git filter-branch` or BFG Repo-Cleaner
3. **Update all references** - Update scripts, tests, and documentation
4. **Document the incident** - Log in security incident tracking

## Reference

- [Static Wallet Setup Guide](../../docs/STATIC_DEVNET_WALLETS.md)
- [Security Incident Policy](../../docs/SECURITY_INCIDENT_CREDENTIAL_EXPOSURE.md)
- [Pre-commit Hooks Setup](../../scripts/setup-git-hooks.ps1)

