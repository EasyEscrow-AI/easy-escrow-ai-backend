# DigitalOcean App Platform Secrets Configuration

This guide provides step-by-step instructions for configuring secrets in DigitalOcean App Platform for the Easy Escrow AI Backend.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Required Secrets](#required-secrets)
- [Configuration Steps](#configuration-steps)
- [Environment-Specific Configuration](#environment-specific-configuration)
- [Secret Rotation](#secret-rotation)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## Overview

DigitalOcean App Platform provides a secure secrets management system that:
- Encrypts secrets at rest and in transit
- Injects secrets as environment variables at runtime
- Keeps secrets out of source code and logs
- Supports environment-specific configurations
- Allows secure secret rotation without downtime

## Prerequisites

- DigitalOcean account with App Platform access
- Project owner or admin permissions
- Generated Solana keypairs (see [Generating Keypairs](#generating-keypairs))
- Access to the DigitalOcean dashboard

## Required Secrets

### 1. AUTHORITY_KEYPAIR (Required)
**Description**: Authority keypair for signing Solana transactions

**Format**: JSON array or Base58
```bash
# Example JSON format
[1,2,3,4,5,...,64]

# Example Base58 format (from solana-keygen)
5J7XqR9pZt8F3...
```

**How to generate**:
```bash
# Using Solana CLI
solana-keygen new --outfile authority-keypair.json --no-bip39-passphrase

# Get the JSON array (copy the entire content)
cat authority-keypair.json

# IMPORTANT: Securely delete the file after copying
rm authority-keypair.json
```

### 2. RECEIPT_SIGNING_KEY (Required)
**Description**: Key for signing receipt tokens

**Format**: Any secure random string (minimum 32 characters)
```bash
# Generate using OpenSSL
openssl rand -base64 48
```

### 3. DATABASE_URL (Required)
**Description**: PostgreSQL database connection string

**Format**: PostgreSQL connection URL
```
postgresql://user:password@host:port/database?sslmode=require
```

**Note**: Use DigitalOcean Managed Database connection string

### 4. REDIS_URL (Required)
**Description**: Redis connection URL for caching and queues

**Format**: Redis connection URL
```
redis://username:password@host:port
```

### 5. PLATFORM_KEYPAIR (Optional)
**Description**: Platform fee collector keypair

**Format**: Same as AUTHORITY_KEYPAIR

### 6. WEBHOOK_SECRET (Optional but Recommended)
**Description**: Secret for validating webhook signatures

**Format**: Secure random string
```bash
# Generate using OpenSSL
openssl rand -hex 32
```

### 7. JWT_SECRET (Optional)
**Description**: Secret for JWT token signing

**Format**: Secure random string
```bash
# Generate using OpenSSL
openssl rand -base64 32
```

### 8. Devnet Wallet Private Keys (For E2E Testing)
**Description**: Private keys for static devnet test wallets

**Environment Variables**:
- `DEVNET_SENDER_PRIVATE_KEY` - Sender wallet (NFT owner)
- `DEVNET_RECEIVER_PRIVATE_KEY` - Receiver wallet (USDC payer)
- `DEVNET_ADMIN_PRIVATE_KEY` - Admin wallet (escrow operations)
- `DEVNET_FEE_COLLECTOR_PRIVATE_KEY` - Fee collector wallet (treasury)

**Format**: Base58 encoded private keys

**Static Addresses**:
- Sender: `CL8c2oMZUq9wdw84MAVGBdhKt6BXfKZb1Hy1Mo1jfyz1`
- Receiver: `8GDAazp6Vm3avTiMDkaHiTCjMyJRzRF1k9n6w8b85x1m`
- Admin: `5wwbtUoPpVw7bEWpZj9kp4gZ265uwQuoPxE5145dTdVh`
- FeeCollector: `C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E`

**Automated Setup**:
```powershell
# Set local environment variables first
.\scripts\set-devnet-env-vars.ps1 -SenderKey <KEY> -ReceiverKey <KEY> -AdminKey <KEY> -FeeCollectorKey <KEY>

# Push to DigitalOcean
.\scripts\digitalocean\setup-devnet-secrets.ps1 -AppId <APP_ID> -FromEnv
```

**Note**: Only needed if running E2E tests on deployed environment. Not required for production.

### 8. API_KEY_SECRET (Optional)
**Description**: Secret for API key generation and validation

**Format**: Secure random string
```bash
# Generate using OpenSSL
openssl rand -hex 24
```

## Configuration Steps

### Step 1: Access App Platform Dashboard

1. Log in to [DigitalOcean Dashboard](https://cloud.digitalocean.com/)
2. Navigate to **Apps** in the left sidebar
3. Select your application (easy-escrow-ai-backend)
4. Click on **Settings** tab

### Step 2: Configure Environment Variables

1. In the Settings tab, find the **App-Level Environment Variables** section
2. Click **Edit** or **Add Variable**

### Step 3: Add Required Secrets

For each secret:

1. Click **Add Variable**
2. Enter the **Key** (e.g., `AUTHORITY_KEYPAIR`)
3. Enter the **Value** (the actual secret)
4. Select **Encrypt** checkbox (this marks it as a secret)
5. Click **Save**

**Example Configuration**:

| Key | Value | Encrypted |
|-----|-------|-----------|
| AUTHORITY_KEYPAIR | `[1,2,3,...]` | ✅ Yes |
| RECEIPT_SIGNING_KEY | `your-secure-key` | ✅ Yes |
| DATABASE_URL | `postgresql://...` | ✅ Yes |
| REDIS_URL | `redis://...` | ✅ Yes |
| WEBHOOK_SECRET | `your-webhook-secret` | ✅ Yes |
| JWT_SECRET | `your-jwt-secret` | ✅ Yes |
| SOLANA_RPC_URL | `https://api.devnet.solana.com` | ❌ No |
| SOLANA_NETWORK | `devnet` | ❌ No |
| NODE_ENV | `production` | ❌ No |

### Step 4: Configure Non-Secret Environment Variables

Add public configuration (non-encrypted):

```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta
ESCROW_PROGRAM_ID=<your-program-id>

# USDC Configuration
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Platform Configuration
PLATFORM_FEE_BPS=250
PLATFORM_FEE_COLLECTOR_ADDRESS=<your-collector-address>

# Application Configuration
NODE_ENV=production
PORT=8080

# Webhook Configuration
WEBHOOK_MAX_RETRIES=5
WEBHOOK_RETRY_DELAY_MS=1000
```

### Step 5: Verify Configuration

1. After adding all variables, click **Save**
2. The app will automatically redeploy with new configuration
3. Check the **Runtime Logs** for any configuration errors
4. Look for log message: `[SecretsManagementService] Secrets management initialized successfully`

### Step 6: Test Secret Loading

After deployment, verify secrets are loaded:

```bash
# Check application logs
doctl apps logs <app-id>

# Look for these messages:
# ✓ Loaded Authority keypair for signing transactions
# ✓ Loaded Receipt signing key
# ✓ Loaded webhook secret
```

## Environment-Specific Configuration

### Development Environment

Create a `.env.development` file (do NOT commit):

```bash
# Development Secrets
AUTHORITY_KEYPAIR='[1,2,3,...]'
RECEIPT_SIGNING_KEY='dev-signing-key-change-in-prod'
DATABASE_URL='postgresql://localhost:5432/escrow_dev'
REDIS_URL='redis://localhost:6379'

# Development Configuration
SOLANA_RPC_URL='http://localhost:8899'
SOLANA_NETWORK='localnet'
NODE_ENV='development'
```

### Staging Environment

Configure in DigitalOcean App Platform:
- Use separate keypairs from production
- Connect to staging database
- Use devnet Solana network
- Test secret rotation procedures

### Production Environment

Configure in DigitalOcean App Platform:
- Use production keypairs (securely generated and stored)
- Connect to production database with SSL
- Use mainnet-beta Solana network
- Enable all security features
- Monitor secret access patterns

## Secret Rotation

### When to Rotate Secrets

- **Immediately**: If a secret is compromised or exposed
- **Regularly**: Every 90 days as a security best practice
- **On Staff Changes**: When team members with access leave

### Rotation Procedure

#### 1. Generate New Secret

```bash
# For keypairs
solana-keygen new --outfile new-authority-keypair.json --no-bip39-passphrase

# For other secrets
openssl rand -base64 48
```

#### 2. Update in DigitalOcean

1. Navigate to App Settings → Environment Variables
2. Find the secret to rotate
3. Click **Edit**
4. Update the value with the new secret
5. Click **Save**

#### 3. Deploy with Zero Downtime

The app will automatically redeploy:
- Old pods remain active during deployment
- New pods start with new secrets
- Traffic switches when new pods are healthy
- Old pods are terminated

#### 4. Update Dependent Services

If the secret is used by other services:
- Update webhook configurations
- Notify integration partners
- Update backup systems

#### 5. Verify New Secret

```bash
# Check logs for successful initialization
doctl apps logs <app-id> | grep "SecretsManagementService"

# Test critical functionality
curl https://your-app.ondigitalocean.app/api/health
```

#### 6. Revoke Old Secret

- Mark old keypairs as inactive
- Remove from backup systems
- Document rotation in security log

## Troubleshooting

### Secret Not Loading

**Symptom**: Error message "Required secret X is not set"

**Solutions**:
1. Verify the secret is configured in App Platform
2. Check the environment variable name matches exactly
3. Ensure the "Encrypt" checkbox is checked
4. Verify the app has been redeployed after adding the secret
5. Check for typos in the secret name

### Invalid Keypair Format

**Symptom**: Error message "Failed to parse keypair"

**Solutions**:
1. Verify the keypair is valid JSON array format `[1,2,3,...]`
2. Ensure exactly 64 numbers in the array
3. Check for any extra characters or whitespace
4. Try Base58 format instead
5. Regenerate the keypair if corrupted

### Database Connection Failed

**Symptom**: Error connecting to database

**Solutions**:
1. Verify DATABASE_URL is correct
2. Check database allows connections from App Platform
3. Ensure SSL mode is set correctly (`?sslmode=require`)
4. Verify database credentials are valid
5. Check database is running and accessible

### Secrets Visible in Logs

**Symptom**: Secrets appearing in application logs

**Solutions**:
1. Never log secret values directly
2. Update logging to mask sensitive data
3. Review code for console.log statements with secrets
4. Use the SecretsManagementService instead of direct process.env access

## Security Best Practices

### 1. Never Commit Secrets

- ✅ Use environment variables
- ✅ Use .gitignore to exclude secret files
- ✅ Use pre-commit hooks to scan for secrets
- ❌ Never commit .env files
- ❌ Never commit keypair JSON files
- ❌ Never hardcode secrets in source code

### 2. Use Strong Secrets

- Minimum 32 characters for passwords and keys
- Use cryptographically secure random generators
- Avoid predictable patterns or dictionary words
- Use different secrets for each environment

### 3. Limit Access

- Only share secrets with team members who need them
- Use role-based access control in DigitalOcean
- Audit who has access to secrets regularly
- Remove access when no longer needed

### 4. Monitor Secret Usage

- Enable audit logging in DigitalOcean
- Monitor for unexpected secret access
- Set up alerts for secret modifications
- Review access logs regularly

### 5. Plan for Compromise

- Have a secret rotation procedure ready
- Document incident response steps
- Test rotation procedures regularly
- Keep backup secrets secure and separate

### 6. Use Separate Secrets per Environment

- Development secrets are different from production
- Never use production secrets in development
- Test secret rotation in staging first
- Maintain clear documentation of which secrets are used where

## Additional Resources

- [DigitalOcean App Platform Secrets Documentation](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/)
- [Solana Keypair Generation](https://docs.solana.com/cli/generate-keypair)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [SecretsManagementService API Documentation](../src/services/secrets-management.service.ts)

## Support

If you encounter issues with secrets configuration:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review application logs in DigitalOcean dashboard
3. Verify all prerequisites are met
4. Contact the team lead or DevOps engineer

---

**Last Updated**: Task 39 Implementation
**Maintained By**: DevOps Team

