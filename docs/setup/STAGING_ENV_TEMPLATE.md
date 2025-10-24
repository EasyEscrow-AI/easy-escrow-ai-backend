# Staging Environment Variables Template

This document provides a template for staging environment variables with the **DEVNET_STAGING_*** naming convention to differentiate from DEV environment variables.

## How to Use This Template

1. **For Local Testing**: Create `.env.staging` in the project root and copy these variables
2. **For DigitalOcean Deployment**: Add these as environment variables in App Platform settings
3. **Automated Setup**: Run `.\scripts\deployment\setup-staging-env.ps1` to generate `.env.staging` automatically

## ⚠️ IMPORTANT: Naming Convention

**STAGING uses `DEVNET_STAGING_*` prefix** to avoid conflicts with DEV environment (`DEVNET_*`).

- ✅ `DEVNET_STAGING_PROGRAM_ID` - STAGING environment
- ✅ `DEVNET_STAGING_SENDER_PRIVATE_KEY` - STAGING wallet
- ❌ `DEVNET_PROGRAM_ID` - DEV environment only
- ❌ `DEVNET_SENDER_PRIVATE_KEY` - DEV wallet only

## Environment Variables

```env
# ============================================================================
# EasyEscrow Staging Environment Configuration
# ============================================================================

# Environment
NODE_ENV=staging

# Server Configuration
PORT=8080
HOST=0.0.0.0
LOG_LEVEL=debug

# Database Configuration (DigitalOcean Managed PostgreSQL)
# Replace with your actual staging database credentials
DATABASE_URL="postgresql://staging_user:YOUR_STAGING_PASSWORD@your-cluster.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require"
DATABASE_POOL_URL="postgresql://staging_user:YOUR_STAGING_PASSWORD@your-cluster-pooler.db.ondigitalocean.com:25061/easyescrow_staging?sslmode=require"
DATABASE_POOL_SIZE=10
DATABASE_POOL_TIMEOUT=30

# Solana Configuration (Devnet for Staging)
# Primary RPC Endpoint - Use dedicated provider (QuickNode recommended)
SOLANA_RPC_URL=https://[subdomain].solana-devnet.quiknode.pro/[your-api-key]/
# Fallback RPC Endpoint - Public devnet as backup
SOLANA_RPC_URL_FALLBACK=https://api.devnet.solana.com
SOLANA_NETWORK=devnet

# RPC Connection Optimization
SOLANA_RPC_TIMEOUT=30000                      # 30 seconds
SOLANA_RPC_RETRIES=3                          # Number of retry attempts
SOLANA_RPC_HEALTH_CHECK_INTERVAL=30000        # Health check interval in ms

# STAGING Program Configuration (Devnet)
# NOTE: Uses DEVNET_STAGING_* prefix to differentiate from DEV
DEVNET_STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# STAGING Wallet Configuration (Base58 Private Keys)
# Extract using: npx ts-node scripts/utilities/extract-base58-keys.ts
DEVNET_STAGING_SENDER_PRIVATE_KEY=your_staging_sender_private_key_base58
DEVNET_STAGING_RECEIVER_PRIVATE_KEY=your_staging_receiver_private_key_base58
DEVNET_STAGING_ADMIN_PRIVATE_KEY=your_staging_admin_private_key_base58
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=your_staging_fee_collector_private_key_base58

# USDC Token (Official Circle Devnet)
DEVNET_STAGING_USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr

# Redis Configuration (Staging)
REDIS_HOST=your-staging-redis.cloud.redislabs.com
REDIS_PORT=6379
REDIS_PASSWORD=your_staging_redis_password
REDIS_TLS=true

# JWT Configuration (Staging)
JWT_SECRET=your_staging_jwt_secret_here_min_32_chars
JWT_EXPIRATION=24h

# API Rate Limiting (Staging - more lenient than production)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=200

# CORS Configuration (Staging)
CORS_ORIGIN=https://staging.easyescrow.ai,http://localhost:3000

# Webhook Configuration (Staging)
WEBHOOK_SECRET=your_staging_webhook_secret
WEBHOOK_MAX_RETRIES=5
WEBHOOK_RETRY_DELAY=5000

# Platform Fee Configuration
PLATFORM_FEE_BPS=250
FEE_COLLECTOR_ADDRESS=YourStagingFeeCollectorAddressHere

# Monitoring & Analytics (Optional)
SENTRY_DSN=
SENTRY_ENVIRONMENT=staging
SENTRY_TRACES_SAMPLE_RATE=0.5

# Feature Flags (Staging)
ENABLE_WEBHOOKS=true
ENABLE_RATE_LIMITING=true
ENABLE_REQUEST_LOGGING=true
ENABLE_DEPOSIT_MONITORING=true

# Blockchain Monitoring
DEPOSIT_POLL_INTERVAL_MS=10000
TRANSACTION_CONFIRMATION_TIMEOUT=60000

# Email Configuration (Staging - use test service)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_mailtrap_user
SMTP_PASS=your_mailtrap_pass
SMTP_FROM=noreply@staging.easyescrow.ai

# S3/Spaces Configuration (Staging)
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DO_SPACES_BUCKET=easyescrow-staging
DO_SPACES_KEY=your_staging_spaces_key
DO_SPACES_SECRET=your_staging_spaces_secret
DO_SPACES_REGION=nyc3

# Logging
LOG_FORMAT=json
LOG_MAX_SIZE=10m
LOG_MAX_FILES=7

# Health Check
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_PATH=/health

# Swagger/OpenAPI Documentation
ENABLE_SWAGGER=true
SWAGGER_PATH=/api-docs
```

## Setup Instructions

### 1. Database Setup

```bash
# Run the staging database setup script
.\scripts\deployment\setup-staging-database.ps1

# Save the generated staging_user password
# Update DATABASE_URL and DATABASE_POOL_URL above

# Run migrations
DATABASE_URL="postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require" npx prisma migrate deploy

# Seed test data
npm run db:seed:staging
```

### 2. RPC Provider Setup

**IMPORTANT**: For production-like staging environment, use a dedicated RPC provider to avoid rate limiting.

```bash
# 1. Sign up for QuickNode (recommended - faster, cross-chain ready)
#    Visit: https://www.quicknode.com/

# 2. Create a new Solana Devnet endpoint named "easy-escrow-staging"

# 3. Copy your HTTP Provider URL and update SOLANA_RPC_URL above:
#    SOLANA_RPC_URL=https://[subdomain].solana-devnet.quiknode.pro/[your-api-key]/

# 4. Test the connection
solana cluster-version --url https://[your-subdomain].solana-devnet.quiknode.pro/[your-api-key]/

# 5. Verify the fallback is configured
#    SOLANA_RPC_URL_FALLBACK=https://api.devnet.solana.com
```

**Why QuickNode?**
- ⚡ Faster performance and lower latency
- 🌐 Cross-chain ready for future multi-chain expansion
- 📊 Comprehensive dashboard and analytics
- 🔒 Enterprise-grade security

For detailed setup instructions, provider comparisons, and troubleshooting:
📚 See [STAGING_RPC_SETUP.md](../infrastructure/STAGING_RPC_SETUP.md)

### 3. Wallet Setup

```bash
# Generate staging wallet
solana-keygen new --outfile staging-wallet.json

# Get devnet SOL
solana airdrop 5 --url devnet --keypair staging-wallet.json

# Update ANCHOR_WALLET path in environment variables
```

### 4. Program Deployment

```bash
# Update Anchor.staging.toml with staging wallet
# Build program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Update ESCROW_PROGRAM_ID in environment variables
```

### 5. Redis Setup

1. Create Redis instance in DigitalOcean or Upstash
2. Get connection details from dashboard
3. Update REDIS_* variables

### 6. Test Connection

```bash
# Test database connection
npm run db:test-connection

# Test full staging environment
npm run test:staging
```

## Security Checklist

- ✅ **Never commit `.env.staging` to Git**
- ✅ Store secrets in DigitalOcean App Platform (encrypted)
- ✅ Use strong passwords (32+ characters)
- ✅ Enable TLS for all external connections
- ✅ Rotate credentials quarterly
- ✅ Limit database user permissions
- ✅ Use different credentials for each environment
- ✅ Enable audit logging for sensitive operations

## DigitalOcean App Platform Setup

To add these variables to DigitalOcean App Platform:

1. Navigate to: **Apps > Your Staging App > Settings > App-Level Environment Variables**
2. Click **"Edit"**
3. Add each variable:
   - **Key**: Variable name (e.g., `DATABASE_URL`)
   - **Value**: The actual value
   - **Encrypt**: ✅ Check for sensitive values (passwords, secrets, API keys)
4. Click **"Save"**
5. Redeploy the app for changes to take effect

## Environment-Specific Differences

| Variable | Development | Staging | Production |
|----------|------------|---------|------------|
| `NODE_ENV` | development | staging | production |
| `LOG_LEVEL` | debug | debug | info |
| `DATABASE_POOL_SIZE` | 5 | 10 | 25 |
| `RATE_LIMIT_MAX_REQUESTS` | 1000 | 200 | 100 |
| `SOLANA_NETWORK` | localnet/devnet | devnet | mainnet-beta |
| `ENABLE_SWAGGER` | true | true | false |

## Troubleshooting

### Database Connection Issues

If you encounter database connection errors:

```bash
# Test connection manually
psql "postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require"

# Verify SSL is enabled
echo "sslmode=require should be in your connection string"

# Check firewall rules
# Ensure your IP is whitelisted in DigitalOcean dashboard
```

### Migration Issues

If migrations fail:

```bash
# Check migration status
npx prisma migrate status

# Reset migrations (CAUTION: This deletes data)
npx prisma migrate reset

# Apply migrations manually
npx prisma migrate deploy
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -h your-redis-host -p 6379 -a your-password --tls ping

# Should return: PONG
```

## Additional Resources

- [DigitalOcean App Platform Environment Variables](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/)
- [Prisma Environment Variables](https://www.prisma.io/docs/guides/development-environment/environment-variables)
- [Solana Devnet Setup](https://docs.solana.com/clusters#devnet)
- [Redis Cloud Setup](https://redis.io/docs/getting-started/installation/)

---

**Last Updated:** January 2025  
**Maintained By:** DevOps Team

