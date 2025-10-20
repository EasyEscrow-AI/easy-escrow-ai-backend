# Deployment Scripts Guide

Complete guide for using the automated deployment scripts for Easy Escrow backend.

## Overview

The deployment system provides a streamlined way to deploy to DigitalOcean App Platform with automatic devnet test wallet configuration for non-production environments.

## Key Features

✅ **Environment-aware**: Automatically handles dev, staging, and production  
✅ **Auto-configures devnet secrets**: For dev/staging (not production)  
✅ **Safe defaults**: Won't add test wallets to production  
✅ **Dry-run mode**: Preview changes before applying  
✅ **Idempotent**: Safe to run multiple times  

## Quick Start

### Deploy to Dev (with devnet test wallets)

```powershell
# Windows PowerShell
.\scripts\deployment\digitalocean\deploy-to-digitalocean.ps1

# Or explicitly
.\scripts\deployment\digitalocean\deploy-to-digitalocean.ps1 -Environment dev
```

```bash
# Linux/Mac
./scripts/deployment/digitalocean/deploy-to-digitalocean.sh
```

### Deploy to Staging

```powershell
# Windows
.\scripts\deployment\digitalocean\deploy-to-digitalocean.ps1 -Staging

# Or
.\scripts\deployment\digitalocean\deploy-to-digitalocean.ps1 -Environment staging
```

```bash
# Linux/Mac
./scripts/deployment/digitalocean/deploy-to-digitalocean.sh --staging
```

### Deploy to Production

```powershell
# Windows (no devnet secrets by default)
.\scripts\deployment\digitalocean\deploy-to-digitalocean.ps1 -Production
```

```bash
# Linux/Mac
./scripts/deployment/digitalocean/deploy-to-digitalocean.sh --production
```

## Environment Behavior

| Environment | Devnet Secrets | Default Behavior |
|-------------|----------------|------------------|
| **dev** | ✅ Included | Auto-configures test wallets |
| **staging** | ✅ Included | Auto-configures test wallets |
| **production** | ❌ Excluded | No test wallets (secure) |

## Advanced Usage

### Deploy without Devnet Secrets

Even for dev/staging, you can skip devnet configuration:

```powershell
.\scripts\deployment\digitalocean\deploy-to-digitalocean.ps1 -Environment dev -NoDevnetSecrets
```

### Dry Run (Preview Changes)

Preview what would happen without making changes:

```powershell
.\scripts\deployment\digitalocean\deploy-to-digitalocean.ps1 -DryRun
```

### Direct Script with All Options

Use the main deployment script directly for full control:

```powershell
# Full control
.\scripts\deployment\digitalocean\deploy.ps1 `
    -Environment dev `
    -AppId "your-app-id" `
    -ApiKey "your-api-key" `
    -DryRun
```

### Configuration Only (No Redeployment)

Update secrets without triggering a redeployment:

```powershell
.\scripts\digitalocean\deploy.ps1 `
    -Environment dev `
    -NoRedeploy
```

## Prerequisites

### Required Environment Variables

**For Deployment:**
```powershell
$env:DIGITALOCEAN_API_KEY = "your_api_key"
```

**For Devnet Secrets (if included):**
```powershell
$env:DEVNET_SENDER_PRIVATE_KEY = "your_base58_key"
$env:DEVNET_RECEIVER_PRIVATE_KEY = "your_base58_key"
$env:DEVNET_ADMIN_PRIVATE_KEY = "your_base58_key"
$env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY = "your_base58_key"
```

### Setup Environment Variables

Use the helper script to set devnet keys:

```powershell
.\scripts\set-devnet-env-vars.ps1 `
    -SenderKey "..." `
    -ReceiverKey "..." `
    -AdminKey "..." `
    -FeeCollectorKey "..." `
    -Permanent
```

## Deployment Flow

### What Happens During Deployment

1. **Validation**
   - Checks API key is present
   - Validates environment selection
   - Confirms App ID (auto-detects if not provided)

2. **Environment Check**
   - For **production**: Warns if devnet secrets requested
   - For **dev/staging**: Includes devnet secrets by default

3. **Devnet Configuration** (if enabled)
   - Loads devnet wallet private keys from environment
   - Pushes to DigitalOcean as encrypted secrets
   - Configures 4 static test wallets

4. **Deployment Trigger**
   - Triggers DigitalOcean app redeployment
   - Monitors deployment status
   - Provides deployment URLs

5. **Summary**
   - Shows deployment details
   - Lists configured wallets (if any)
   - Provides next steps

## What Gets Deployed

### Dev/Staging Environments

**Secrets Configured:**
- `DATABASE_URL` (existing)
- `REDIS_URL` (existing)
- `AUTHORITY_KEYPAIR` (existing)
- `RECEIPT_SIGNING_KEY` (existing)
- **`DEVNET_SENDER_PRIVATE_KEY`** ← NEW
- **`DEVNET_RECEIVER_PRIVATE_KEY`** ← NEW
- **`DEVNET_ADMIN_PRIVATE_KEY`** ← NEW
- **`DEVNET_FEE_COLLECTOR_PRIVATE_KEY`** ← NEW

### Production Environment

**Secrets Configured:**
- `DATABASE_URL` (existing)
- `REDIS_URL` (existing)
- `AUTHORITY_KEYPAIR` (existing)
- `RECEIPT_SIGNING_KEY` (existing)
- No devnet secrets ✅ (secure)

## Static Devnet Wallet Addresses

These public addresses are safe to share and are consistent across all environments:

| Role | Address |
|------|---------|
| Sender (NFT Owner) | `FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71` |
| Receiver (USDC Payer) | `Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk` |
| Admin (Escrow Ops) | `7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u` |
| FeeCollector (Treasury) | `C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E` |

## After Deployment

### Verify Deployment

1. **Check deployment status:**
   ```
   https://cloud.digitalocean.com/apps/<APP_ID>
   ```

2. **View logs:**
   ```bash
   doctl apps logs <APP_ID> --type run
   ```

3. **Test health endpoint:**
   ```bash
   curl https://your-app.ondigitalocean.app/health
   ```

### Fund Devnet Wallets (if needed)

After deploying dev/staging, fund the test wallets:

```powershell
.\scripts\fund-devnet-wallets.ps1 `
    -Buyer Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk `
    -Seller FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71 `
    -Admin 7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u `
    -FeeCollector C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E
```

### Run E2E Tests

Against deployed environment:

```bash
# Update API_URL in test config
export API_URL="https://your-app.ondigitalocean.app"

# Run tests
npm run test:e2e:devnet:nft-swap
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy to DigitalOcean

on:
  push:
    branches:
      - main        # Production
      - staging     # Staging
      - develop     # Dev

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup PowerShell
        uses: azure/powershell@v1
      
      - name: Set Environment Variables
        run: |
          echo "DIGITALOCEAN_API_KEY=${{ secrets.DIGITALOCEAN_API_KEY }}" >> $GITHUB_ENV
          echo "DEVNET_SENDER_PRIVATE_KEY=${{ secrets.DEVNET_SENDER_PRIVATE_KEY }}" >> $GITHUB_ENV
          echo "DEVNET_RECEIVER_PRIVATE_KEY=${{ secrets.DEVNET_RECEIVER_PRIVATE_KEY }}" >> $GITHUB_ENV
          echo "DEVNET_ADMIN_PRIVATE_KEY=${{ secrets.DEVNET_ADMIN_PRIVATE_KEY }}" >> $GITHUB_ENV
          echo "DEVNET_FEE_COLLECTOR_PRIVATE_KEY=${{ secrets.DEVNET_FEE_COLLECTOR_PRIVATE_KEY }}" >> $GITHUB_ENV
      
      - name: Deploy to Dev
        if: github.ref == 'refs/heads/develop'
        run: ./scripts/deploy-to-digitalocean.sh
      
      - name: Deploy to Staging
        if: github.ref == 'refs/heads/staging'
        run: ./scripts/deploy-to-digitalocean.sh --staging
      
      - name: Deploy to Production
        if: github.ref == 'refs/heads/main'
        run: ./scripts/deploy-to-digitalocean.sh --production
```

## Troubleshooting

### "API key not provided"

**Solution:**
```powershell
$env:DIGITALOCEAN_API_KEY = "your_api_key"
# Or
.\scripts\deploy-to-digitalocean.ps1 -ApiKey "your_api_key"
```

### "App ID not found"

The script auto-detects your app. If it fails, get the App ID manually:

```bash
# List all apps
doctl apps list

# Use specific App ID
.\scripts\digitalocean\deploy.ps1 -Environment dev -AppId <APP_ID>
```

### "Missing environment variables"

For devnet deployment, you need the wallet private keys:

```powershell
# Set them all at once
.\scripts\set-devnet-env-vars.ps1 -SenderKey <KEY> ... -Permanent

# Verify
.\scripts\set-devnet-env-vars.ps1 -Show
```

### "Deployment failed"

Check DigitalOcean logs:

```bash
doctl apps logs <APP_ID> --type deploy
```

Common issues:
- Database migration failures
- Missing environment variables on DO
- Build errors

### Devnet Secrets Not Working on Deployed App

**Causes:**
1. Secrets not properly pushed to DO
2. App not redeployed after secret update
3. Private keys are incorrect

**Solution:**
```powershell
# Re-run deployment
.\scripts\deploy-to-digitalocean.ps1 -Environment dev

# Or just update secrets
.\scripts\digitalocean\setup-devnet-secrets.ps1 -FromEnv
```

## Security Best Practices

### ✅ DO:
- Use different keys for dev/staging/production
- Store API keys in secure environment variables
- Rotate keys regularly
- Use dry-run mode to preview changes
- Keep devnet secrets out of production

### ❌ DON'T:
- Commit private keys to git
- Share API keys via insecure channels
- Use production keys on devnet
- Deploy devnet secrets to production (script warns you)
- Hard-code secrets in scripts

## Script Architecture

```
deploy-to-digitalocean.ps1        # User-friendly wrapper
  ↓
scripts/deployment/digitalocean/deploy.ps1   # Main deployment logic
  ↓
setup-devnet-secrets.ps1          # Devnet wallet configuration (if enabled)
  ↓
DigitalOcean API                   # Updates app + triggers deployment
```

## Related Documentation

- [Devnet Deployment Guide](./DEVNET_DEPLOYMENT_GUIDE.md) - Detailed devnet setup
- [DigitalOcean Secrets Configuration](./DIGITALOCEAN_SECRETS_CONFIGURATION.md) - All DO secrets
- [Static Devnet Wallets](./STATIC_DEVNET_WALLETS.md) - Wallet details

## Examples

### Example 1: First Time Dev Deployment

```powershell
# 1. Set up devnet keys
.\scripts\set-devnet-env-vars.ps1 `
    -SenderKey "..." `
    -ReceiverKey "..." `
    -AdminKey "..." `
    -FeeCollectorKey "..." `
    -Permanent

# 2. Deploy
.\scripts\deploy-to-digitalocean.ps1

# 3. Fund wallets
.\scripts\fund-devnet-wallets.ps1 -Amount 2

# 4. Run tests
npm run test:e2e:devnet:nft-swap
```

### Example 2: Production Deployment (No Devnet)

```powershell
# Production is secure by default
.\scripts\deploy-to-digitalocean.ps1 -Production

# Devnet secrets are automatically excluded
```

### Example 3: Update Just Devnet Secrets

```powershell
# Update secrets without full redeployment
.\scripts\digitalocean\deploy.ps1 `
    -Environment dev `
    -NoRedeploy
```

### Example 4: Dry Run Before Production

```powershell
# Preview what would happen
.\scripts\deploy-to-digitalocean.ps1 -Production -DryRun

# If looks good, run for real
.\scripts\deploy-to-digitalocean.ps1 -Production
```

## Support

For issues:
1. Check troubleshooting section above
2. Review DigitalOcean deployment logs
3. Verify environment variables are set
4. Ensure API key has correct permissions
5. Check app is in the correct region

