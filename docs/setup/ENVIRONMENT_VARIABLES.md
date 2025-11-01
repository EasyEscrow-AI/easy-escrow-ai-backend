# Environment Variables Configuration

Complete reference for all environment variables used in the EasyEscrow.ai backend.

## 📋 Quick Start

**For Local Development:**
```bash
# Copy the template
cp .env.example .env

# Edit with your values
nano .env
```

## 🎯 Health Check Intervals by Environment

### Recommended Configuration

| Environment | RPC Health | Service Health | Metrics | Why? |
|------------|-----------|----------------|---------|------|
| **Local Dev** | 1 min (60s) | 1 min (60s) | 3 min (180s) | Fast feedback during development |
| **Staging** | 2 min (120s) | 2 min (120s) | 5 min (300s) | Moderate for pre-prod testing |
| **Production** | 5 min (300s) | 5 min (300s) | 10 min (600s) | Optimized for cost & performance |

### Environment Variable Names

```bash
# RPC Health Checks (How often to check Solana RPC endpoint health)
SOLANA_RPC_HEALTH_CHECK_INTERVAL=60000

# Service Health Checks (How often to check DB, Redis, services)
HEALTH_CHECK_INTERVAL_MS=60000

# Metrics Collection (How often to collect performance metrics)
METRICS_INTERVAL_MS=180000
```

### Impact Analysis

**Before Optimization (30s intervals):**
- 🔴 12,240 health operations per day
- 🔴 Excessive API usage
- 🔴 Cluttered logs

**After Optimization:**

| Environment | Daily Checks | Reduction |
|------------|-------------|-----------|
| Production | 1,008 | 92% ↓ |
| Staging | 1,728 | 86% ↓ |
| Development | 2,880 | 77% ↓ |

## 🔧 Full Environment Variables Reference

### Application Configuration

```bash
NODE_ENV=development              # development, staging, production
PORT=3000                         # HTTP port
HOST=0.0.0.0                      # Listen address
LOG_LEVEL=debug                   # error, warn, info, debug
```

### Solana Configuration

```bash
# Network
SOLANA_NETWORK=devnet             # devnet, mainnet-beta
SOLANA_COMMITMENT=confirmed       # processed, confirmed, finalized

# RPC URLs
SOLANA_RPC_URL=https://...        # Primary RPC endpoint
SOLANA_RPC_URL_FALLBACK=https://... # Fallback RPC endpoint

# Performance Tuning
SOLANA_RPC_TIMEOUT=30000          # Request timeout (ms)
SOLANA_RPC_RETRIES=3              # Number of retries

# Health Check Intervals (see table above)
SOLANA_RPC_HEALTH_CHECK_INTERVAL=60000
HEALTH_CHECK_INTERVAL_MS=60000
METRICS_INTERVAL_MS=180000

# Program Configuration
ESCROW_PROGRAM_ID=...             # Your Anchor program ID
```

### Wallet Configuration

**Environment-Specific Private Keys:**

```bash
# Local Development
DEVNET_ADMIN_PRIVATE_KEY=...      # Admin wallet (Base58)
DEVNET_ADMIN_ADDRESS=...          # Admin public key
DEVNET_FEE_COLLECTOR_PRIVATE_KEY=...
DEVNET_FEE_COLLECTOR_ADDRESS=...

# Staging
DEVNET_STAGING_ADMIN_PRIVATE_KEY=...
DEVNET_STAGING_ADMIN_ADDRESS=...
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=...
DEVNET_STAGING_FEE_COLLECTOR_ADDRESS=...

# Production
MAINNET_PROD_ADMIN_PRIVATE_KEY=...
MAINNET_PROD_ADMIN_ADDRESS=...
MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY=...
MAINNET_PROD_FEE_COLLECTOR_ADDRESS=...
```

**The application automatically selects the correct wallet based on `NODE_ENV`.**

### Token Configuration

```bash
# USDC Mint Addresses
# Devnet: Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
# Mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
```

### Database Configuration

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
DATABASE_POOL_URL=postgresql://...  # Optional: separate pool URL
DATABASE_POOL_SIZE=10               # Connection pool size
DATABASE_POOL_TIMEOUT=30000         # Pool timeout (ms)
```

### Redis Configuration

```bash
REDIS_URL=redis://localhost:6379
# Or with password: redis://:password@host:6379
```

### Application Features

```bash
# Platform Fee (basis points, 100 = 1%)
PLATFORM_FEE_BPS=250                # 2.5%

# Monitoring
MONITORING_ENABLED=true
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_PATH=/health
ENABLE_DEPOSIT_MONITORING=true
DEPOSIT_POLL_INTERVAL_MS=5000
TRANSACTION_CONFIRMATION_TIMEOUT=60000
```

### Security & Authentication

```bash
# JWT Configuration
JWT_SECRET=your-secret-min-32-chars
JWT_EXPIRATION=24h

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000         # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGIN=http://localhost:3001,http://localhost:3000
CORS_ENABLED=true

# Security Headers
HELMET_ENABLED=true
```

### Webhooks

```bash
WEBHOOK_SECRET=your-webhook-secret
WEBHOOK_MAX_RETRIES=3
WEBHOOK_RETRY_DELAY=5000
ENABLE_WEBHOOKS=true
```

### API Documentation

```bash
ENABLE_SWAGGER=true
SWAGGER_PATH=/docs
```

### Logging & Monitoring

```bash
ENABLE_REQUEST_LOGGING=true
LOG_FORMAT=combined
LOG_MAX_SIZE=10m
LOG_MAX_FILES=7

# Sentry (Optional)
SENTRY_DSN=your-sentry-dsn
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

### External Services

```bash
# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@easyescrow.ai

# DigitalOcean Spaces (Object Storage)
DO_SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com
DO_SPACES_BUCKET=easyescrow-prod
DO_SPACES_KEY=your-spaces-key
DO_SPACES_SECRET=your-spaces-secret
DO_SPACES_REGION=sgp1

# Slack/Discord Webhooks (Alerts)
SLACK_WEBHOOK=your-slack-webhook-url
DISCORD_WEBHOOK=your-discord-webhook-url
```

## 🚀 Configuration by Environment

### Local Development (.env)

```bash
NODE_ENV=development
SOLANA_NETWORK=devnet
LOG_LEVEL=debug
ENABLE_SWAGGER=true
ENABLE_WEBHOOKS=false
HELMET_ENABLED=false

# Health Checks: 1 minute
SOLANA_RPC_HEALTH_CHECK_INTERVAL=60000
HEALTH_CHECK_INTERVAL_MS=60000
METRICS_INTERVAL_MS=180000
```

### Staging (.do/app-staging.yaml)

```bash
NODE_ENV=staging
SOLANA_NETWORK=devnet
LOG_LEVEL=info
ENABLE_SWAGGER=true
ENABLE_WEBHOOKS=true
HELMET_ENABLED=true

# Health Checks: 2 minutes
SOLANA_RPC_HEALTH_CHECK_INTERVAL=120000
HEALTH_CHECK_INTERVAL_MS=120000
METRICS_INTERVAL_MS=300000
```

### Production (production-app.yaml)

```bash
NODE_ENV=production
SOLANA_NETWORK=mainnet-beta
LOG_LEVEL=info
ENABLE_SWAGGER=false
ENABLE_WEBHOOKS=true
HELMET_ENABLED=true

# Health Checks: 5 minutes
SOLANA_RPC_HEALTH_CHECK_INTERVAL=300000
HEALTH_CHECK_INTERVAL_MS=300000
METRICS_INTERVAL_MS=600000
```

## 🔒 Security Best Practices

### Sensitive Values

**NEVER commit these to git:**
- ❌ Private keys (any `*_PRIVATE_KEY`)
- ❌ JWT secrets
- ❌ Database passwords
- ❌ Redis passwords
- ❌ API keys
- ❌ Webhook secrets

**Always store them as:**
- ✅ DigitalOcean App Platform Secrets (production/staging)
- ✅ Local `.env` file (development, gitignored)
- ✅ Environment variables in deployment systems

### Private Key Formats

**Supported formats:**
1. **Base58** (Solana standard) ✅ Recommended
2. **JSON Array** `[1, 2, 3, ..., 64]`
3. **Base64** (not recommended)

**Example (Base58):**
```bash
DEVNET_ADMIN_PRIVATE_KEY=5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP...
```

## 🔍 Troubleshooting

### Health Checks Running Too Often

**Problem:** Logs show health checks every few seconds

**Solution:** Set appropriate intervals:
```bash
# Production
SOLANA_RPC_HEALTH_CHECK_INTERVAL=300000  # 5 min
HEALTH_CHECK_INTERVAL_MS=300000
METRICS_INTERVAL_MS=600000

# Staging
SOLANA_RPC_HEALTH_CHECK_INTERVAL=120000  # 2 min
HEALTH_CHECK_INTERVAL_MS=120000
METRICS_INTERVAL_MS=300000
```

### Invalid Private Key Format

**Problem:** `Failed to load admin keypair`

**Solution:** Ensure private key is in Base58 format:
```bash
# Get Base58 format from JSON
solana-keygen pubkey wallet.json
# Copy the Base58 string
```

### RPC Connection Issues

**Problem:** `Health check failed` repeatedly

**Solution:**
1. Verify RPC URL is correct and accessible
2. Check API key is valid (if using Helius/QuickNode)
3. Increase timeout: `SOLANA_RPC_TIMEOUT=60000`
4. Add fallback: `SOLANA_RPC_URL_FALLBACK=https://api.mainnet-beta.solana.com`

### Rate Limiting Not Working

**Problem:** All users share same rate limit

**Solution:** Enable trust proxy (for production/staging):
```typescript
// src/index.ts
app.set('trust proxy', true);
```

## 📚 Related Documentation

- [Production Deployment Guide](../deployment/PRODUCTION_DEPLOYMENT.md)
- [Health Check Optimization](../deployment/HEALTH_CHECK_OPTIMIZATION.md)
- [Trust Proxy Configuration](../deployment/TRUST_PROXY_FIX.md)
- [Solana RPC Setup](./SOLANA_RPC_SETUP.md)
- [Wallet Management](./WALLET_SETUP.md)

## 🎓 Key Takeaways

### Health Check Intervals

✅ **Match intervals to environment**
- Faster in dev (1 min) for quick feedback
- Moderate in staging (2 min) for testing
- Slower in production (5-10 min) for cost optimization

✅ **Monitor the impact**
- Check logs after changes
- Verify no service degradation
- Measure cost savings

❌ **Avoid extremes**
- Too frequent = unnecessary cost + log noise
- Too slow = delayed issue detection
- Balance detection speed with resource usage

### Security

✅ **Always use secrets management**
- DigitalOcean App Platform Secrets
- Never commit sensitive values
- Rotate keys regularly

✅ **Use environment-specific wallets**
- Separate wallets for dev/staging/prod
- Different private keys per environment
- Automatic selection based on NODE_ENV

---

**Last Updated:** 2025-10-28  
**Status:** Optimized for all environments  
**Impact:** 77-92% reduction in health check operations  



