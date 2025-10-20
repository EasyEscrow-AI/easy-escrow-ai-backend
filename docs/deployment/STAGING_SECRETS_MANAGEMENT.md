# Staging Secrets Management Guide

**CRITICAL SECURITY NOTICE:** This document contains instructions for managing sensitive staging environment secrets. All secrets MUST be added via DigitalOcean App Platform Console or CLI - NEVER commit secrets to Git.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Secrets Checklist](#secrets-checklist)
- [Adding Secrets via Console (Recommended)](#adding-secrets-via-console-recommended)
- [Adding Secrets via CLI](#adding-secrets-via-cli)
- [Secret Rotation](#secret-rotation)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## Overview

The staging environment requires multiple secrets to be configured securely in DigitalOcean App Platform. These secrets include:

- Solana wallet private keys
- Database credentials
- Redis credentials
- API keys and tokens
- JWT secrets

**All secrets are encrypted at rest** by DigitalOcean and never exposed in logs or API responses.

## Prerequisites

Before adding secrets, ensure you have:

- ✅ Access to DigitalOcean account with App Platform permissions
- ✅ Staging app created in DigitalOcean App Platform
- ✅ `doctl` CLI installed (for CLI method) - [Installation Guide](https://docs.digitalocean.com/reference/doctl/how-to/install/)
- ✅ All staging wallet keypairs available in `wallets/staging/` directory
- ✅ Staging database credentials (from `setup-staging-database.ps1` output)

## Secrets Checklist

Use this checklist to ensure all required secrets are configured:

### Required Secrets

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `DEVNET_STAGING_SENDER_PRIVATE_KEY` | Seller wallet private key (base58) | Extract from `wallets/staging/sender.json` |
| `DEVNET_STAGING_RECEIVER_PRIVATE_KEY` | Buyer wallet private key (base58) | Extract from `wallets/staging/receiver.json` |
| `DEVNET_STAGING_ADMIN_PRIVATE_KEY` | Admin wallet private key (base58) | Extract from `wallets/staging/admin.json` |
| `DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY` | Fee collector wallet private key (base58) | Extract from `wallets/staging/fee-collector.json` |
| `DATABASE_URL` | PostgreSQL connection string | From staging database setup |
| `DATABASE_POOL_URL` | PostgreSQL pooler connection string | From staging database setup |
| `REDIS_URL` | Redis Cloud connection string | From Redis Cloud dashboard |
| `SOLANA_RPC_URL` | Helius devnet RPC URL with API key | From Helius dashboard |
| `JWT_SECRET` | JWT signing secret (48+ chars) | Generate using script or random generator |
| `WEBHOOK_SECRET` | Webhook signature secret (48+ chars) | Generate using script or random generator |

### Optional Secrets (Configure as needed)

| Secret Name | Description | Required For |
|------------|-------------|--------------|
| `SMTP_USER` | Mailtrap SMTP username | Email notifications |
| `SMTP_PASS` | Mailtrap SMTP password | Email notifications |
| `DO_SPACES_KEY` | DigitalOcean Spaces access key | File storage |
| `DO_SPACES_SECRET` | DigitalOcean Spaces secret key | File storage |
| `DIGITAL_OCEAN_API_KEY` | DO API token | Programmatic DO access |
| `SENTRY_DSN` | Sentry error tracking DSN | Error monitoring |

## Adding Secrets via Console (Recommended)

This is the easiest and most visual method for managing secrets.

### Step-by-Step Instructions

1. **Navigate to App Settings**
   - Go to [DigitalOcean Cloud Console](https://cloud.digitalocean.com/apps)
   - Select your staging app: `easyescrow-backend-staging`
   - Click **Settings** in the left sidebar

2. **Access Environment Variables**
   - Scroll to **Environment Variables** section
   - Click **Edit** button
   - You'll see all environment variables from `staging-app.yaml`

3. **Update Secret Values**
   - Find variables marked with `__SECRET_VIA_CONSOLE__`
   - Click the **pencil icon** (✏️) to edit each one
   - Replace `__SECRET_VIA_CONSOLE__` with the actual secret value
   - Ensure **Encrypt** checkbox is ✅ checked for all secrets

4. **Add Wallet Private Keys**

   First, extract base58 private keys from wallet keypairs:

   ```powershell
   # Windows PowerShell
   npx ts-node scripts/utilities/extract-base58-keys.ts
   ```

   This will output something like:
   ```
   DEVNET_STAGING_SENDER_PRIVATE_KEY=3m2viLKKSgGVkM5cWr92dbiRh57o6BqTZfjgmURujANL...
   DEVNET_STAGING_RECEIVER_PRIVATE_KEY=21YtDf3GptHmEL414KRMjJs9yV6R7A61tjvWc6ZXi8yo...
   DEVNET_STAGING_ADMIN_PRIVATE_KEY=4JMoiWVkrnUxXqdhqCEoPcYu5RjmFSGBPX9Wb2ngRHno...
   DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=2b6UD1VrvUYZb6eoidA8Xi5sPyezFqPKDN...
   ```

   Then add each one to DigitalOcean:

   - **DEVNET_STAGING_SENDER_PRIVATE_KEY**
     - Value: `<base58_private_key_from_sender.json>`
     - Type: `SECRET` (encrypted) ✅

   - **DEVNET_STAGING_RECEIVER_PRIVATE_KEY**
     - Value: `<base58_private_key_from_receiver.json>`
     - Type: `SECRET` (encrypted) ✅

   - **DEVNET_STAGING_ADMIN_PRIVATE_KEY**
     - Value: `<base58_private_key_from_admin.json>`
     - Type: `SECRET` (encrypted) ✅

   - **DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY**
     - Value: `<base58_private_key_from_fee-collector.json>`
     - Type: `SECRET` (encrypted) ✅

5. **Add Database Credentials**

   From your staging database setup output (see `setup-staging-database.ps1`):

   - **DATABASE_URL**
     - Value: `postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require`
     - Type: `SECRET` (encrypted) ✅

   - **DATABASE_POOL_URL**
     - Value: `postgresql://staging_user:PASSWORD@pooler-host:25061/easyescrow_staging?sslmode=require`
     - Type: `SECRET` (encrypted) ✅

6. **Add Redis Credentials**

   From Redis Cloud dashboard:

   - **REDIS_URL**
     - Value: `rediss://default:PASSWORD@redis-xxxxx.cloud.redislabs.com:19320`
     - Type: `SECRET` (encrypted) ✅

7. **Add Solana RPC URL**

   From Helius dashboard (devnet API key):

   - **SOLANA_RPC_URL**
     - Value: `https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`
     - Type: `SECRET` (encrypted) ✅

8. **Generate and Add JWT/Webhook Secrets**

   Generate secure random secrets:

   ```powershell
   # Windows PowerShell - Generate 48-character secrets
   -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})
   ```

   Or use the setup script:

   ```powershell
   .\scripts\deployment\setup-staging-env.ps1
   ```

   Then add:

   - **JWT_SECRET**
     - Value: `<generated_48_char_secret>`
     - Type: `SECRET` (encrypted) ✅

   - **WEBHOOK_SECRET**
     - Value: `<generated_48_char_secret>`
     - Type: `SECRET` (encrypted) ✅

9. **Save Changes**
   - Click **Save** button at the bottom
   - DigitalOcean will automatically redeploy your app with the new secrets
   - Monitor deployment progress in the **Deployments** tab

## Adding Secrets via CLI

For automation or scripting, use `doctl` CLI.

### Prerequisites

```bash
# Install doctl (if not already installed)
# Windows (Chocolatey)
choco install doctl

# macOS (Homebrew)
brew install doctl

# Linux
snap install doctl

# Authenticate
doctl auth init
```

### Get Your App ID

```bash
# List your apps
doctl apps list

# Example output:
# ID                                      Name                            Status
# 3c65abc1-2345-6789-abcd-ef0123456789   easyescrow-backend-staging      ACTIVE

# Save your app ID
export APP_ID="3c65abc1-2345-6789-abcd-ef0123456789"
```

### Add Secrets via CLI

```bash
# Set wallet private keys (extract from keypairs first)
doctl apps update $APP_ID --spec <(cat staging-app.yaml.template | \
  sed "s|__SECRET_VIA_CONSOLE__|$(npx ts-node scripts/utilities/extract-base58-keys.ts | grep SENDER | cut -d= -f2)|" )

# Or update individual environment variables
doctl apps env set $APP_ID \
  --var "DEVNET_STAGING_SENDER_PRIVATE_KEY=<base58_key>" \
  --var-type "SECRET"

doctl apps env set $APP_ID \
  --var "DATABASE_URL=postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require" \
  --var-type "SECRET"

doctl apps env set $APP_ID \
  --var "JWT_SECRET=$(openssl rand -base64 48)" \
  --var-type "SECRET"
```

### Automated Secret Setup Script

For convenience, use the automated setup script:

```powershell
# Windows PowerShell
.\scripts\deployment\setup-staging-secrets.ps1 -AppId "your-app-id"

# This script will:
# 1. Extract wallet keys from keypairs
# 2. Generate JWT and webhook secrets
# 3. Prompt for database and Redis credentials
# 4. Apply all secrets via doctl CLI
```

## Secret Rotation

Secrets should be rotated regularly for security. Use the rotation script:

```powershell
# Rotate all secrets
.\scripts\deployment\rotate-staging-secrets.ps1

# Rotate specific secrets only
.\scripts\deployment\rotate-staging-secrets.ps1 -SecretsToRotate "JWT_SECRET,WEBHOOK_SECRET"
```

### Manual Rotation Steps

1. **Generate New Secret**
   ```powershell
   -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})
   ```

2. **Update in DigitalOcean Console**
   - Navigate to App Settings > Environment Variables
   - Edit the secret variable
   - Replace with new value
   - Save changes

3. **Wait for Redeployment**
   - App will automatically redeploy
   - Monitor deployment logs
   - Verify health checks pass

4. **Test Application**
   - Run smoke tests: `npm run test:staging:smoke`
   - Verify all functionality works

## Troubleshooting

### Issue: Secret Not Taking Effect

**Symptoms:**
- Application still using old secret value
- Authentication failures after secret update

**Solution:**
1. Verify secret was saved in DO Console
2. Check deployment completed successfully
3. Restart app manually if needed:
   ```bash
   doctl apps restart $APP_ID
   ```

### Issue: Invalid Private Key Format

**Symptoms:**
```
Error: Invalid private key format
```

**Solution:**
1. Ensure you're using **base58** format, not byte array
2. Extract keys using the official script:
   ```powershell
   npx ts-node scripts/utilities/extract-base58-keys.ts
   ```
3. Verify no extra whitespace or newlines

### Issue: Database Connection Failure

**Symptoms:**
```
Error: Connection terminated unexpectedly
```

**Solution:**
1. Verify `DATABASE_URL` format:
   ```
   postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require
   ```
2. Check database user exists and has proper permissions
3. Verify password is URL-encoded if it contains special characters
4. Test connection locally:
   ```powershell
   psql "$DATABASE_URL"
   ```

### Issue: Redis Connection Failure

**Symptoms:**
```
Error: connect ECONNREFUSED
```

**Solution:**
1. Verify `REDIS_URL` format:
   ```
   rediss://default:PASSWORD@host:19320
   ```
2. Use `rediss://` (with TLS) not `redis://`
3. Check Redis Cloud dashboard for correct host and port
4. Test connection:
   ```bash
   redis-cli -u "$REDIS_URL" ping
   ```

## Security Best Practices

### ✅ DO

- ✅ Use **SECRET** type for all sensitive values in DO Console
- ✅ Rotate secrets quarterly (at minimum)
- ✅ Use strong, randomly generated secrets (48+ characters)
- ✅ Store secrets only in DigitalOcean App Platform (encrypted at rest)
- ✅ Use `__SECRET_VIA_CONSOLE__` placeholder in yaml templates
- ✅ Audit secret access logs regularly
- ✅ Use least-privilege database users (staging_user, not doadmin)
- ✅ Enable 2FA on your DigitalOcean account
- ✅ Restrict team member access to secrets
- ✅ Test secret rotation in staging before production

### ❌ DON'T

- ❌ **NEVER** commit secrets to Git
- ❌ **NEVER** put real secrets in `staging-app.yaml` or any tracked file
- ❌ **NEVER** log secret values
- ❌ **NEVER** share secrets via email or chat
- ❌ **NEVER** reuse production secrets in staging
- ❌ **NEVER** use weak or predictable secrets
- ❌ **NEVER** hardcode secrets in application code
- ❌ **NEVER** store secrets in plaintext files
- ❌ **NEVER** use the same JWT secret across environments

## Verification Checklist

After adding all secrets, verify everything works:

```powershell
# Run staging verification script
.\scripts\deployment\verify-staging-deployment.ps1

# Should verify:
# ✅ App is healthy
# ✅ Database connection works
# ✅ Redis connection works
# ✅ Solana RPC connection works
# ✅ Wallet keys are valid
# ✅ JWT authentication works
# ✅ API endpoints respond correctly
```

## Additional Resources

- [DigitalOcean App Platform Environment Variables Docs](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/)
- [doctl CLI Reference](https://docs.digitalocean.com/reference/doctl/reference/apps/)
- [Staging Database Setup Guide](../infrastructure/STAGING_DATABASE_SETUP.md)
- [Staging Redis Setup Guide](../infrastructure/STAGING_REDIS_SETUP.md)
- [Security Best Practices](../SECRETS_MANAGEMENT.md)

## Support

For issues or questions:
- Review this guide first
- Check [Troubleshooting](#troubleshooting) section
- Contact the DevOps team
- Check `#staging-support` channel

---

**Last Updated:** January 2025  
**Maintained By:** DevOps Team  
**Security Classification:** CONFIDENTIAL

