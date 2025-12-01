# Devnet Deployment Guide

Complete guide for deploying the Easy Escrow backend with devnet E2E testing capabilities.

## Overview

This guide covers deploying to DigitalOcean App Platform with static devnet wallets configured for automated E2E testing.

## Architecture

**Local Development:**
- Environment variables from local machine
- Private keys never committed to git

**DigitalOcean Deployment:**
- Private keys stored as DO App Platform secrets (encrypted)
- Static wallet addresses for consistent testing
- Secrets injected at runtime

## Prerequisites

1. DigitalOcean API key
2. Devnet wallet private keys (base58 format)
3. PowerShell (Windows) or Bash (Linux/Mac)

## Step 1: Set Up Local Environment

First, configure your local environment variables:

```powershell
# Set environment variables (current session)
.\scripts\set-devnet-env-vars.ps1 `
  -SenderKey "<your_base58_key>" `
  -ReceiverKey "<your_base58_key>" `
  -AdminKey "<your_base58_key>" `
  -FeeCollectorKey "<your_base58_key>"

# Or set permanently
.\scripts\set-devnet-env-vars.ps1 ... -Permanent

# Verify
.\scripts\set-devnet-env-vars.ps1 -Show
```

## Step 2: Configure DigitalOcean Secrets

### Option A: Automated (Recommended)

Use the automated script to push secrets to DigitalOcean:

```powershell
# After setting local env vars, push to DO
.\scripts\digitalocean\setup-devnet-secrets.ps1 -FromEnv

# Or specify App ID explicitly
.\scripts\digitalocean\setup-devnet-secrets.ps1 -AppId <APP_ID> -FromEnv

# Dry run (preview changes)
.\scripts\digitalocean\setup-devnet-secrets.ps1 -FromEnv -DryRun
```

**What the script does:**
1. Reads your local environment variables
2. Connects to DigitalOcean API
3. Updates app secrets (encrypted)
4. Triggers automatic redeployment

### Option B: Manual Configuration

Via DigitalOcean Dashboard:

1. Go to https://cloud.digitalocean.com/apps
2. Select your app
3. Navigate to **Settings** → **App-Level Environment Variables**
4. Add the following variables (type: **SECRET**):
   - `DEVNET_SENDER_PRIVATE_KEY`
   - `DEVNET_RECEIVER_PRIVATE_KEY`
   - `DEVNET_ADMIN_PRIVATE_KEY`
   - `DEVNET_FEE_COLLECTOR_PRIVATE_KEY`
5. Click **Save** (triggers redeployment)

### Option C: Via DigitalOcean CLI

```bash
# Install doctl if not already installed
brew install doctl  # Mac
# OR
choco install doctl  # Windows

# Authenticate
doctl auth init

# Set secrets
doctl apps update <APP_ID> --spec - <<EOF
{
  "envs": [
    {
      "key": "DEVNET_SENDER_PRIVATE_KEY",
      "value": "your_base58_key",
      "scope": "RUN_TIME",
      "type": "SECRET"
    }
  ]
}
EOF
```

## Step 3: Verify Deployment

### Check Deployment Status

```powershell
# Via web dashboard
https://cloud.digitalocean.com/apps/<APP_ID>

# Or check logs
doctl apps logs <APP_ID> --type deploy
```

### Verify Secrets Are Set

Secrets won't be visible in the dashboard (security feature), but you can verify they're loaded:

```bash
# SSH into app container (if enabled) and check
echo $DEVNET_SENDER_PRIVATE_KEY  # Should show masked value
```

Or run a test endpoint that checks for the environment variables (without exposing values).

## Step 4: Fund Devnet Wallets

The static wallet addresses need to be funded on devnet:

```powershell
# Option 1: Automated script
.\scripts\fund-devnet-wallets.ps1 `
  -Buyer 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 `
  -Seller AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z `
  -Admin 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R `
  -FeeCollector 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ
```

```bash
# Option 2: Individual commands
solana transfer AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z 2 --url devnet
solana transfer 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 2 --url devnet
solana transfer 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R 2 --url devnet
solana transfer 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ 1 --url devnet
```

## Step 5: Run E2E Tests

### Against Local Environment

```powershell
npm run test:e2e:devnet:nft-swap
```

### Against Deployed Environment

Update test configuration to point to deployed URL:

```typescript
const API_URL = process.env.API_URL || 'https://your-app.ondigitalocean.app';
```

Then run tests:

```powershell
npm run test:e2e:devnet:nft-swap
```

## Environment Variables Summary

| Variable | Source | Purpose |
|----------|--------|---------|
| `DIGITALOCEAN_API_KEY` | Local | API access for deployment |
| `DEVNET_SENDER_PRIVATE_KEY` | Local + DO | Sender wallet key |
| `DEVNET_RECEIVER_PRIVATE_KEY` | Local + DO | Receiver wallet key |
| `DEVNET_ADMIN_PRIVATE_KEY` | Local + DO | Admin wallet key |
| `DEVNET_FEE_COLLECTOR_PRIVATE_KEY` | Local + DO | Fee collector wallet key |

## Updating Secrets

### Rotate Keys

```powershell
# 1. Generate new keypairs
solana-keygen new --no-bip39-passphrase -o new-keypair.json

# 2. Convert to base58 (if needed)
node -e "const bs58=require('bs58');const fs=require('fs');console.log(bs58.encode(Buffer.from(JSON.parse(fs.readFileSync('new-keypair.json')))))"

# 3. Update local env vars
.\scripts\set-devnet-env-vars.ps1 -SenderKey <NEW_KEY> ... -Permanent

# 4. Push to DigitalOcean
.\scripts\digitalocean\setup-devnet-secrets.ps1 -FromEnv

# 5. Fund new wallets on devnet
.\scripts\fund-devnet-wallets.ps1 ...
```

### Update Single Secret

```powershell
# Update just one key
.\scripts\digitalocean\setup-devnet-secrets.ps1 `
  -AppId <APP_ID> `
  -SenderKey <NEW_KEY> `
  -ReceiverKey $env:DEVNET_RECEIVER_PRIVATE_KEY `
  -AdminKey $env:DEVNET_ADMIN_PRIVATE_KEY `
  -FeeCollectorKey $env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY
```

## Troubleshooting

### "API key not provided"

**Solution**: Set `DIGITALOCEAN_API_KEY` or `DO_API_KEY` environment variable

```powershell
$env:DIGITALOCEAN_API_KEY = "your_api_key"
```

### "App ID not found"

**Solution**: Specify App ID explicitly

```powershell
# Find your App ID
doctl apps list

# Use it
.\scripts\digitalocean\setup-devnet-secrets.ps1 -AppId <ID> -FromEnv
```

### "Failed to load devnet wallets" in deployed app

**Causes:**
1. Secrets not set on DigitalOcean
2. App not redeployed after setting secrets
3. Wrong secret names

**Solution**: Re-run setup script and verify deployment

### Wallets have zero balance

**Solution**: Fund the wallets on devnet (see Step 4)

## CI/CD Integration

### GitHub Actions

```yaml
name: Deploy and Test Devnet

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Devnet Secrets on DO
        env:
          DIGITALOCEAN_API_KEY: ${{ secrets.DIGITALOCEAN_API_KEY }}
          DEVNET_SENDER_PRIVATE_KEY: ${{ secrets.DEVNET_SENDER_PRIVATE_KEY }}
          DEVNET_RECEIVER_PRIVATE_KEY: ${{ secrets.DEVNET_RECEIVER_PRIVATE_KEY }}
          DEVNET_ADMIN_PRIVATE_KEY: ${{ secrets.DEVNET_ADMIN_PRIVATE_KEY }}
          DEVNET_FEE_COLLECTOR_PRIVATE_KEY: ${{ secrets.DEVNET_FEE_COLLECTOR_PRIVATE_KEY }}
        run: |
          pwsh ./scripts/digitalocean/setup-devnet-secrets.ps1 -FromEnv
      
      - name: Run E2E Tests
        run: npm run test:e2e:devnet:nft-swap
```

## Security Best Practices

✅ **DO:**
- Use DigitalOcean secrets (not plain env vars)
- Rotate keys regularly
- Keep private keys in secure key management systems
- Use different keys for different environments
- Monitor wallet balances

❌ **DON'T:**
- Commit private keys to git
- Share keys via insecure channels
- Use mainnet keys on devnet
- Hard-code keys in application code
- Expose keys in logs or error messages

## Static Wallet Addresses

For reference (public addresses, safe to share):

| Role | Address |
|------|---------|
| Sender (Seller) | `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z` |
| Receiver (Buyer) | `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4` |
| Admin | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` |
| FeeCollector | `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ` |

## Related Documentation

- [Environment Setup](./ENVIRONMENT_SETUP.md) - Local environment configuration
- [Static Devnet Wallets](./STATIC_DEVNET_WALLETS.md) - Wallet details
- [DigitalOcean Secrets Configuration](./DIGITALOCEAN_SECRETS_CONFIGURATION.md) - All DO secrets

## Support

For issues:
1. Check troubleshooting section above
2. Review DigitalOcean deployment logs
3. Verify environment variables are set correctly
4. Ensure wallets are funded on devnet

