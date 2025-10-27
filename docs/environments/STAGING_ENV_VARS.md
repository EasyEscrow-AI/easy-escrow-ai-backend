# STAGING Environment Variables Reference

**Last Updated:** January 2025  
**Environment:** STAGING  
**Network:** Devnet  
**Purpose:** Production-like testing environment

## Table of Contents

- [Overview](#overview)
- [Naming Convention](#naming-convention)
- [Complete Variable Reference](#complete-variable-reference)
- [Security Classification](#security-classification)
- [Setup Instructions](#setup-instructions)
- [Secret Rotation](#secret-rotation)
- [Troubleshooting](#troubleshooting)

---

## Overview

The STAGING environment uses a **specific naming convention** (`DEVNET_STAGING_*`) to differentiate from the DEV environment (`DEVNET_*`) and prevent configuration conflicts.

### Key Differences: DEV vs STAGING

| Aspect | DEV Environment | STAGING Environment |
|--------|----------------|---------------------|
| **Naming Prefix** | `DEVNET_*` | `DEVNET_STAGING_*` |
| **Purpose** | Active development | Production-like testing |
| **Wallet Keys** | `DEVNET_SENDER_PRIVATE_KEY` | `DEVNET_STAGING_SENDER_PRIVATE_KEY` |
| **Program ID** | `DEVNET_PROGRAM_ID` | `DEVNET_STAGING_PROGRAM_ID` |
| **Database** | Shared/local | Dedicated managed instance |
| **Redis** | Shared/local | Dedicated Redis Cloud instance |
| **RPC Provider** | Public or local | Dedicated Helius endpoint |

---

## Naming Convention

### Why DEVNET_STAGING_* Prefix?

✅ **Benefits:**
- Prevents conflicts when running multiple environments locally
- Clear distinction in codebase and logs
- Supports simultaneous DEV and STAGING configurations
- Easier debugging and environment identification

❌ **Without proper naming:**
- Variables collision (`DEVNET_SENDER_PRIVATE_KEY` used by both)
- Accidental use of wrong environment
- Deployment configuration errors

### Environment Variable Patterns

```bash
# ✅ CORRECT - STAGING Environment
DEVNET_STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
DEVNET_STAGING_SENDER_PRIVATE_KEY=21YtDf3...

# ❌ WRONG - Conflicts with DEV
DEVNET_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
DEVNET_SENDER_PRIVATE_KEY=21YtDf3...
```

---

## Complete Variable Reference

### 1. Core Environment Settings

| Variable | Value | Classification | Description |
|----------|-------|----------------|-------------|
| `NODE_ENV` | `staging` | Public | Node.js environment mode |
| `SOLANA_NETWORK` | `devnet` | Public | Solana cluster to use |
| `PORT` | `8080` | Public | Server listening port |
| `HOST` | `0.0.0.0` | Public | Server bind address |
| `LOG_LEVEL` | `debug` | Public | Logging verbosity |

### 2. Solana RPC Configuration

| Variable | Example Value | Classification | Description |
|----------|---------------|----------------|-------------|
| `SOLANA_RPC_URL` | `https://devnet.helius-rpc.com/?api-key=xxx` | **SECRET** | Primary RPC endpoint (Helius) |
| `SOLANA_RPC_URL_FALLBACK` | `https://api.devnet.solana.com` | Public | Backup RPC endpoint |
| `SOLANA_RPC_TIMEOUT` | `30000` | Public | RPC request timeout (ms) |
| `SOLANA_RPC_RETRIES` | `3` | Public | Number of retry attempts |
| `SOLANA_RPC_HEALTH_CHECK_INTERVAL` | `30000` | Public | Health check interval (ms) |

**Rotation Schedule:** Quarterly  
**Source:** [Helius Dashboard](https://dashboard.helius.dev/)

### 3. STAGING Program Configuration

| Variable | Value | Classification | Description |
|----------|-------|----------------|-------------|
| `DEVNET_STAGING_PROGRAM_ID` | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | Public | STAGING escrow program ID |

**Note:** Uses `DEVNET_STAGING_*` prefix (NOT `DEVNET_*`)

### 4. STAGING Wallet Private Keys (Base58)

| Variable | Classification | Description |
|----------|----------------|-------------|
| `DEVNET_STAGING_SENDER_PRIVATE_KEY` | **SECRET** | Sender wallet (NFT owner, seller side) |
| `DEVNET_STAGING_RECEIVER_PRIVATE_KEY` | **SECRET** | Receiver wallet (USDC holder, buyer side) |
| `DEVNET_STAGING_ADMIN_PRIVATE_KEY` | **SECRET** | Admin wallet (admin operations) |
| `DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY` | **SECRET** | Fee collector wallet (receives platform fees) |

**Format:** Base58 encoded (88 characters)  
**Rotation Schedule:** Quarterly or on security incident  
**Source:** `wallets/staging/*.json` (keypairs)  
**Extraction:** `npx ts-node scripts/utilities/extract-base58-keys.ts`

**⚠️ CRITICAL:**
- NEVER commit these to git
- Store in DigitalOcean App Platform as encrypted secrets
- Rotate if exposed

### 5. Token Configuration

| Variable | Value | Classification | Description |
|----------|-------|----------------|-------------|
| `DEVNET_STAGING_USDC_MINT_ADDRESS` | `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` | Public | Official Circle USDC devnet mint |

**Note:** Uses official USDC devnet mint for production parity

### 6. Database Configuration

| Variable | Classification | Description |
|----------|----------------|-------------|
| `DATABASE_URL` | **SECRET** | Primary PostgreSQL connection URL |
| `DATABASE_POOL_URL` | **SECRET** | Connection pooler URL (recommended) |
| `DATABASE_POOL_SIZE` | Public | Connection pool size (10) |
| `DATABASE_POOL_TIMEOUT` | Public | Pool timeout in seconds (30) |

**Format:**
```bash
postgresql://staging_user:PASSWORD@host.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require
```

**Rotation Schedule:** Quarterly  
**Source:** DigitalOcean Managed Databases dashboard  
**Setup:** See Task 67 completion or `docs/infrastructure/STAGING_DATABASE_SETUP.md`

### 7. Redis Configuration

| Variable | Classification | Description |
|----------|----------------|-------------|
| `REDIS_URL` | **SECRET** | Redis Cloud connection URL |

**Format:**
```bash
redis://default:PASSWORD@redis-xxxxx.cloud.redislabs.com:19320
```

**Rotation Schedule:** Quarterly  
**Source:** Redis Cloud dashboard  
**Setup:** See Task 68 or `docs/infrastructure/STAGING_REDIS_SETUP.md`

### 8. Platform Fee Configuration

| Variable | Value | Classification | Description |
|----------|-------|----------------|-------------|
| `PLATFORM_FEE_BPS` | `100` | Public | Platform fee (1% = 100 basis points) |
| `FEE_COLLECTOR_ADDRESS` | `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ` | Public | Fee collector wallet public key |

### 9. Monitoring & Health Checks

| Variable | Value | Classification | Description |
|----------|-------|----------------|-------------|
| `MONITORING_ENDPOINT` | `https://staging-api.easyescrow.ai/health` | Public | Health check endpoint URL |
| `HEALTH_CHECK_ENABLED` | `true` | Public | Enable health checks |
| `HEALTH_CHECK_PATH` | `/health` | Public | Health check path |
| `ENABLE_DEPOSIT_MONITORING` | `true` | Public | Enable blockchain monitoring |
| `DEPOSIT_POLL_INTERVAL_MS` | `10000` | Public | Deposit polling interval |
| `TRANSACTION_CONFIRMATION_TIMEOUT` | `60000` | Public | TX confirmation timeout |

### 10. JWT Configuration

| Variable | Classification | Description |
|----------|----------------|-------------|
| `JWT_SECRET` | **SECRET** | JWT signing secret (min 32 chars) |
| `JWT_EXPIRATION` | Public | Token expiration (24h) |

**Generation:** `openssl rand -base64 32`  
**Rotation Schedule:** Quarterly (invalidates all sessions)

### 11. API Rate Limiting

| Variable | Value | Classification | Description |
|----------|-------|----------------|-------------|
| `RATE_LIMIT_WINDOW_MS` | `900000` | Public | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `200` | Public | Max requests per window |

**Note:** More lenient than production

### 12. CORS Configuration

| Variable | Value | Classification | Description |
|----------|-------|----------------|-------------|
| `CORS_ORIGIN` | `https://staging.easyescrow.ai,http://localhost:3000` | Public | Allowed origins |

### 13. Webhook Configuration

| Variable | Classification | Description |
|----------|----------------|-------------|
| `WEBHOOK_SECRET` | **SECRET** | Webhook payload signing secret |
| `WEBHOOK_MAX_RETRIES` | Public | Max webhook delivery retries (5) |
| `WEBHOOK_RETRY_DELAY` | Public | Retry delay in ms (5000) |

**Generation:** `openssl rand -base64 32`  
**Rotation Schedule:** Quarterly

### 14. Feature Flags

| Variable | Value | Classification | Description |
|----------|-------|----------------|-------------|
| `ENABLE_WEBHOOKS` | `true` | Public | Enable webhook delivery |
| `ENABLE_RATE_LIMITING` | `true` | Public | Enable API rate limiting |
| `ENABLE_REQUEST_LOGGING` | `true` | Public | Enable request logging |

### 15. Swagger/Documentation

| Variable | Value | Classification | Description |
|----------|-------|----------------|-------------|
| `ENABLE_SWAGGER` | `true` | Public | Enable Swagger UI |
| `SWAGGER_PATH` | `/api/docs` | Public | Swagger UI path |

**Note:** Enabled in STAGING for API testing

### 16. Monitoring & Analytics (Optional)

| Variable | Classification | Description |
|----------|----------------|-------------|
| `SENTRY_DSN` | **SECRET** | Sentry error tracking DSN |
| `SENTRY_ENVIRONMENT` | Public | Sentry environment name (staging) |
| `SENTRY_TRACES_SAMPLE_RATE` | Public | Trace sampling rate (0.5) |

### 17. Email Configuration (Test Service)

| Variable | Classification | Description |
|----------|----------------|-------------|
| `SMTP_HOST` | Public | SMTP server host (mailtrap.io) |
| `SMTP_PORT` | Public | SMTP port (2525) |
| `SMTP_USER` | **SECRET** | SMTP username |
| `SMTP_PASS` | **SECRET** | SMTP password |
| `SMTP_FROM` | Public | From email address |

**Source:** [Mailtrap](https://mailtrap.io/)

### 18. S3/Spaces Configuration

| Variable | Classification | Description |
|----------|----------------|-------------|
| `DO_SPACES_ENDPOINT` | Public | DigitalOcean Spaces endpoint |
| `DO_SPACES_BUCKET` | Public | Bucket name (easyescrow-staging) |
| `DO_SPACES_KEY` | **SECRET** | Spaces access key |
| `DO_SPACES_SECRET` | **SECRET** | Spaces secret key |
| `DO_SPACES_REGION` | Public | Region (nyc3) |

**Source:** DigitalOcean Spaces dashboard

### 19. DigitalOcean API

| Variable | Classification | Description |
|----------|----------------|-------------|
| `DIGITAL_OCEAN_API_KEY` | **SECRET** | DigitalOcean API personal access token |

**Source:** [DigitalOcean API Tokens](https://cloud.digitalocean.com/account/api/tokens)  
**Permissions:** Read/Write access

### 20. Logging Configuration

| Variable | Value | Classification | Description |
|----------|-------|----------------|-------------|
| `LOG_FORMAT` | `json` | Public | Log output format |
| `LOG_MAX_SIZE` | `10m` | Public | Max log file size |
| `LOG_MAX_FILES` | `7` | Public | Max log files to keep |

---

## Security Classification

### 🔴 SECRET (Must Be Encrypted)

These variables MUST be stored as encrypted secrets in DigitalOcean App Platform:

- `DEVNET_STAGING_SENDER_PRIVATE_KEY`
- `DEVNET_STAGING_RECEIVER_PRIVATE_KEY`
- `DEVNET_STAGING_ADMIN_PRIVATE_KEY`
- `DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY`
- `DATABASE_URL`
- `DATABASE_POOL_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `WEBHOOK_SECRET`
- `SOLANA_RPC_URL` (contains API key)
- `SMTP_USER`
- `SMTP_PASS`
- `DO_SPACES_KEY`
- `DO_SPACES_SECRET`
- `DIGITAL_OCEAN_API_KEY`
- `SENTRY_DSN` (if used)

### 🟢 PUBLIC (Can Be Plain Text)

These variables can be stored in plain text:

- All other variables not listed above
- Configuration values, feature flags, timeouts, etc.

---

## Setup Instructions

### Option 1: Automated Setup (Recommended)

```powershell
# Run the automated setup script
.\scripts\deployment\setup-staging-env.ps1

# Follow the prompts to enter:
# - Helius API key
# - Database credentials
# - Redis credentials
# - Other configuration values
```

**The script automatically:**
- ✅ Extracts wallet keys from keypairs
- ✅ Generates secure JWT/webhook secrets
- ✅ Creates .env.staging file
- ✅ Uses proper DEVNET_STAGING_* naming

### Option 2: Manual Setup

1. **Extract Wallet Keys:**
   ```powershell
   npx ts-node scripts/utilities/extract-base58-keys.ts
   ```

2. **Create .env.staging:**
   ```powershell
   # Copy and modify
   cp .env.staging.example .env.staging
   ```

3. **Fill in Values:**
   - Update all `YOUR_*` placeholders
   - Use extracted wallet keys
   - Generate secrets: `openssl rand -base64 32`

### Option 3: DigitalOcean App Platform

1. Navigate to: **Apps > Staging App > Settings > Environment Variables**
2. Add each variable:
   - Set **Key** (e.g., `DEVNET_STAGING_SENDER_PRIVATE_KEY`)
   - Set **Value** (the actual secret)
   - Check **Encrypt** for SECRET variables
3. Click **Save**
4. Redeploy the app

---

## Secret Rotation

### Rotation Schedule

| Secret Type | Frequency | Impact |
|-------------|-----------|--------|
| Wallet Private Keys | Quarterly or on breach | High - requires new wallet setup |
| Database Passwords | Quarterly | Medium - brief downtime |
| Redis Passwords | Quarterly | Medium - brief downtime |
| JWT Secrets | Quarterly | Medium - invalidates sessions |
| Webhook Secrets | Quarterly | Low - update webhook consumers |
| API Keys (Helius, DO) | Quarterly | Low - update config |

### Automated Rotation Script

```powershell
# Run the rotation script
.\scripts\deployment\rotate-staging-secrets.ps1

# Script will:
# 1. Generate new secrets
# 2. Update DigitalOcean App Platform
# 3. Create backup of old secrets
# 4. Redeploy application
# 5. Verify connectivity
```

**Manual Rotation Steps:**

1. **Database Password:**
   ```sql
   ALTER USER staging_user WITH PASSWORD 'new_secure_password';
   ```
   Update `DATABASE_URL` and `DATABASE_POOL_URL` in DO App Platform.

2. **Redis Password:**
   - Generate new password in Redis Cloud dashboard
   - Update `REDIS_URL` in DO App Platform

3. **Wallet Keys:**
   ```powershell
   # Generate new wallets
   solana-keygen new -o wallets/staging/staging-sender-new.json
   # Fund new wallets
   # Update DEVNET_STAGING_*_PRIVATE_KEY variables
   # Transfer assets from old to new wallets
   # Backup old keypairs before deletion
   ```

4. **JWT/Webhook Secrets:**
   ```powershell
   # Generate new secrets
   $newJwtSecret = openssl rand -base64 32
   $newWebhookSecret = openssl rand -base64 32
   # Update JWT_SECRET and WEBHOOK_SECRET in DO App Platform
   ```

5. **Deploy Changes:**
   ```powershell
   # Redeploy app with new secrets
   doctl apps create-deployment <staging-app-id>
   ```

---

## Troubleshooting

### Environment Variable Not Loading

**Symptoms:**
- Application uses default/wrong values
- "Variable not defined" errors

**Solutions:**
1. Verify variable name uses `DEVNET_STAGING_*` prefix (not `DEVNET_*`)
2. Check variable exists in `.env.staging` or DO App Platform
3. Restart application after changes
4. Verify environment: `echo $NODE_ENV` should be `staging`

### Naming Convention Conflicts

**Symptoms:**
- Wrong wallets/program being used
- DEV and STAGING configurations mixing

**Solutions:**
1. Audit all variables for correct prefix
2. Search codebase for `process.env.DEVNET_` references
3. Update to use `DEVNET_STAGING_*` in staging environment
4. Use environment-specific config loader

### Secret Rotation Failed

**Symptoms:**
- Application won't start after rotation
- Authentication failures

**Solutions:**
1. Verify new secrets are correct
2. Check DO App Platform deployment logs
3. Test connections manually:
   ```powershell
   # Test database
   psql "$DATABASE_URL"
   
   # Test Redis
   redis-cli -u "$REDIS_URL" PING
   ```
4. Rollback to previous secrets if needed

### RPC Connection Issues

**Symptoms:**
- `429 Too Many Requests` errors
- Slow blockchain operations

**Solutions:**
1. Verify Helius API key is correct
2. Check RPC URL format includes API key
3. Test RPC connection:
   ```powershell
   npx ts-node scripts/utilities/test-rpc-connection.ts
   ```
4. Use fallback URL if primary fails

---

## Related Documentation

- [STAGING Database Setup](../infrastructure/STAGING_DATABASE_SETUP.md) - Database configuration
- [STAGING Redis Setup](../infrastructure/STAGING_REDIS_SETUP.md) - Redis configuration
- [STAGING RPC Setup](../infrastructure/STAGING_RPC_SETUP.md) - RPC provider setup
- [STAGING Wallets](../STAGING_WALLETS.md) - Wallet management
- [Program IDs](../PROGRAM_IDS.md) - All program IDs
- [Token Addresses](../STAGING_TOKEN_ADDRESSES.md) - Token mint addresses
- [Deployment Guide](../deployment/STAGING_DEPLOYMENT.md) - Deployment procedures

---

**Last Updated:** January 2025  
**Maintained By:** DevOps Team

