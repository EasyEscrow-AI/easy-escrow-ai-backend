# Environment Variables Template

Complete template for setting up environment variables for the EasyEscrow.ai backend.

## Quick Setup

### 1. Create `.env` file

Create a `.env` file in the project root with the following content:

```bash
# ============================================
# EasyEscrow.ai Backend - Environment Variables
# ============================================

# Server Configuration
NODE_ENV=development
PORT=3000

# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/easyescrow?schema=public

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=
REDIS_TLS=false

# Solana Blockchain
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_COMMITMENT=confirmed
SOLANA_NETWORK=devnet
ESCROW_PROGRAM_ID=YOUR_ESCROW_PROGRAM_ID_HERE
USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr

# Security
JWT_SECRET=your_super_secure_jwt_secret_min_32_characters_long
API_KEY=your_api_key_here

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
CORS_ENABLED=true
CORS_CREDENTIALS=true
HELMET_ENABLED=true
ALLOWED_USDC_AMOUNTS=10,25,50,75,100,250,500,1000

# Monitoring
MONITORING_ENABLED=true
MONITORING_INTERVAL_MS=30000
EXPIRY_CHECK_INTERVAL_MS=60000
AUTO_PROCESS_REFUNDS=true

# Webhooks
WEBHOOK_ENABLED=true
WEBHOOK_MAX_RETRIES=3

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# DigitalOcean Spaces
SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com
SPACES_REGION=sgp1
SPACES_BUCKET=easyescrow-test
SPACES_ACCESS_KEY_ID=YOUR_SPACES_ACCESS_KEY_ID
SPACES_SECRET_ACCESS_KEY=YOUR_SPACES_SECRET_ACCESS_KEY

# Devnet Testing Wallets (Private Keys)
DEVNET_SENDER_PRIVATE_KEY=
DEVNET_RECEIVER_PRIVATE_KEY=
DEVNET_ADMIN_PRIVATE_KEY=
DEVNET_FEE_COLLECTOR_PRIVATE_KEY=
```

### 2. Set Devnet Wallet Private Keys

The backend uses **static wallet addresses** for E2E testing on devnet. The addresses are:

| Wallet | Address |
|--------|---------|
| **Sender** | `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z` |
| **Receiver** | `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4` |
| **Admin** | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` |
| **Fee Collector** | `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ` |

You need to set the **private keys** for these wallets in environment variables:

#### Option 1: Using PowerShell Script (Recommended)

```powershell
# Set environment variables for current session
.\scripts\set-devnet-env-vars.ps1 `
  -SenderKey "<sender_private_key_base58>" `
  -ReceiverKey "<receiver_private_key_base58>" `
  -AdminKey "<admin_private_key_base58>" `
  -FeeCollectorKey "<fee_collector_private_key_base58>"

# Or set permanently (user level)
.\scripts\set-devnet-env-vars.ps1 `
  -SenderKey "<sender_private_key_base58>" `
  -ReceiverKey "<receiver_private_key_base58>" `
  -AdminKey "<admin_private_key_base58>" `
  -FeeCollectorKey "<fee_collector_private_key_base58>" `
  -Permanent
```

#### Option 2: Manual Setup in PowerShell

```powershell
$env:DEVNET_SENDER_PRIVATE_KEY = "<sender_private_key_base58>"
$env:DEVNET_RECEIVER_PRIVATE_KEY = "<receiver_private_key_base58>"
$env:DEVNET_ADMIN_PRIVATE_KEY = "<admin_private_key_base58>"
$env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY = "<fee_collector_private_key_base58>"
```

#### Option 3: Manual Setup in Bash

```bash
export DEVNET_SENDER_PRIVATE_KEY="<sender_private_key_base58>"
export DEVNET_RECEIVER_PRIVATE_KEY="<receiver_private_key_base58>"
export DEVNET_ADMIN_PRIVATE_KEY="<admin_private_key_base58>"
export DEVNET_FEE_COLLECTOR_PRIVATE_KEY="<fee_collector_private_key_base58>"
```

### 3. Verify Configuration

#### Check Environment Variables

```powershell
# PowerShell
.\scripts\set-devnet-env-vars.ps1 -Show
```

#### Check Wallet Configuration File

The static wallet addresses and their configuration are stored in:
```
tests/fixtures/devnet-config.json
```

This file contains:
- Public wallet addresses
- Private keys (base58 encoded)
- USDC mint address
- Token account addresses
- Timestamps

**⚠️ SECURITY WARNING:** This file contains private keys and should NEVER be committed to git (it's already gitignored).

---

## Complete Variable Reference

For a complete reference of all environment variables, see:
- [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) - Complete reference
- [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Setup guide
- [STATIC_DEVNET_WALLETS.md](./STATIC_DEVNET_WALLETS.md) - Devnet wallet setup

---

## How the System Reads Configuration

The backend and E2E tests follow this priority order:

1. **Environment variables** (highest priority)
   - `DEVNET_SENDER_PRIVATE_KEY`
   - `DEVNET_RECEIVER_PRIVATE_KEY`
   - `DEVNET_ADMIN_PRIVATE_KEY`
   - `DEVNET_FEE_COLLECTOR_PRIVATE_KEY`

2. **Configuration file** (fallback)
   - `tests/fixtures/devnet-config.json`
   - Contains both public addresses and private keys

3. **Generate new wallets** (last resort)
   - If neither above exist, new wallets are generated
   - New `devnet-config.json` is created automatically

---

## DigitalOcean Deployment

For deploying to DigitalOcean with devnet secrets:

### Setup Secrets

```powershell
# Deploy all secrets including devnet wallets
.\scripts\digitalocean\setup-devnet-secrets.ps1 `
  -AppId <your_app_id> `
  -FromEnv

# Or provide keys directly
.\scripts\digitalocean\setup-devnet-secrets.ps1 `
  -AppId <your_app_id> `
  -SenderKey "<sender_key>" `
  -ReceiverKey "<receiver_key>" `
  -AdminKey "<admin_key>" `
  -FeeCollectorKey "<fee_collector_key>"
```

### Verify Secrets

```powershell
# Check configured secrets on DigitalOcean
.\scripts\digitalocean\verify-secrets.ps1 -AppId <your_app_id>
```

---

## Security Best Practices

### ⚠️ CRITICAL

1. **NEVER commit private keys to git**
   - `.env` is gitignored
   - `devnet-config.json` is gitignored
   - Use `.env.example` for templates only

2. **Use different keys for different environments**
   - Development: Local devnet keys
   - Staging: Separate devnet keys
   - Production: Mainnet keys (NEVER use devnet keys!)

3. **Rotate secrets regularly**
   - Change JWT secrets periodically
   - Update API keys regularly
   - Regenerate devnet keys if compromised

4. **Use secure secret management in production**
   - DigitalOcean Secrets (for DO deployments)
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault

5. **Restrict CORS origins**
   - Never use `*` in production
   - Only whitelist trusted domains

---

## Troubleshooting

### Issue: Tests can't find wallets

**Solution**: Ensure environment variables are set OR `devnet-config.json` exists:

```powershell
# Check if environment variables are set
.\scripts\set-devnet-env-vars.ps1 -Show

# Check if config file exists
ls tests\fixtures\devnet-config.json
```

### Issue: Wrong wallet addresses being used

**Solution**: The correct addresses are in `devnet-config.json`. Update environment variables:

```powershell
# Update environment variables with correct keys
.\scripts\set-devnet-env-vars.ps1 -Permanent `
  -SenderKey "<correct_key>" `
  -ReceiverKey "<correct_key>" `
  -AdminKey "<correct_key>" `
  -FeeCollectorKey "<correct_key>"
```

### Issue: Wallets not funded

**Solution**: Fund the wallets on devnet:

```powershell
# Fund all wallets at once
.\scripts\fund-devnet-wallets.ps1 `
  -Buyer 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 `
  -Seller AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z `
  -Admin 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R `
  -FeeCollector 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ
```

---

**Last Updated**: January 2025  
**Version**: 1.0.0

