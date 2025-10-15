# Environment Variables Reference

Complete reference for all environment variables used by the EasyEscrow.ai backend API.

## Table of Contents

- [Server Configuration](#server-configuration)
- [Database Configuration](#database-configuration)
- [Redis Configuration](#redis-configuration)
- [Solana Blockchain](#solana-blockchain)
- [Authentication & Security](#authentication--security)
- [Monitoring & Background Jobs](#monitoring--background-jobs)
- [Webhooks](#webhooks)
- [CORS & Security Headers](#cors--security-headers)
- [Logging](#logging)
- [Complete Example](#complete-example)

---

## Server Configuration

### `NODE_ENV`
- **Type**: String
- **Default**: `development`
- **Options**: `development`, `staging`, `production`
- **Required**: No
- **Description**: Determines the runtime environment and affects error verbosity, caching, and security settings.

```bash
NODE_ENV=production
```

### `PORT`
- **Type**: Number
- **Default**: `3000`
- **Required**: No
- **Description**: Port on which the Express server listens.

```bash
PORT=3000
```

---

## Database Configuration

### `DATABASE_URL`
- **Type**: String (Connection URI)
- **Required**: Yes
- **Description**: PostgreSQL database connection string in Prisma format.
- **Format**: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=SCHEMA`

```bash
DATABASE_URL=postgresql://postgres:mypassword@localhost:5432/easyescrow?schema=public
```

**Components**:
- `USER`: Database user
- `PASSWORD`: Database password
- `HOST`: Database host (localhost, IP, or domain)
- `PORT`: Database port (default: 5432)
- `DATABASE`: Database name
- `schema`: PostgreSQL schema (default: public)

**Examples**:
```bash
# Local development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/easyescrow?schema=public

# Docker Compose
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/easyescrow?schema=public

# Production with SSL
DATABASE_URL=postgresql://user:pass@prod.db.com:5432/easyescrow?schema=public&sslmode=require

# Connection pooling
DATABASE_URL=postgresql://user:pass@localhost:5432/easyescrow?schema=public&connection_limit=10
```

---

## Redis Configuration

### `REDIS_HOST`
- **Type**: String
- **Default**: `localhost`
- **Required**: No (if REDIS_URL is provided)
- **Description**: Redis server hostname or IP address.

```bash
REDIS_HOST=localhost
```

### `REDIS_PORT`
- **Type**: Number
- **Default**: `6379`
- **Required**: No
- **Description**: Redis server port.

```bash
REDIS_PORT=6379
```

### `REDIS_PASSWORD`
- **Type**: String
- **Default**: Empty (no password)
- **Required**: No
- **Description**: Redis authentication password.

```bash
REDIS_PASSWORD=myredispassword
```

### `REDIS_DB`
- **Type**: Number
- **Default**: `0`
- **Required**: No
- **Description**: Redis database number (0-15).

```bash
REDIS_DB=0
```

### `REDIS_TLS`
- **Type**: Boolean
- **Default**: `false`
- **Required**: No
- **Description**: Enable TLS/SSL for Redis connection.

```bash
REDIS_TLS=true
```

### `REDIS_URL`
- **Type**: String (Connection URI)
- **Required**: No
- **Description**: Complete Redis connection URL. Overrides individual Redis settings if provided.

```bash
# Without password
REDIS_URL=redis://localhost:6379

# With password
REDIS_URL=redis://:password@localhost:6379

# With TLS
REDIS_URL=rediss://localhost:6379

# Full format
REDIS_URL=redis://username:password@host:port/db
```

---

## Solana Blockchain

### `SOLANA_RPC_URL`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Solana RPC endpoint URL.

```bash
# Devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Mainnet Beta
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Custom RPC
SOLANA_RPC_URL=https://my-rpc-endpoint.com

# Localhost
SOLANA_RPC_URL=http://localhost:8899
```

### `SOLANA_COMMITMENT`
- **Type**: String
- **Default**: `confirmed`
- **Options**: `processed`, `confirmed`, `finalized`
- **Required**: No
- **Description**: Transaction confirmation level.

```bash
SOLANA_COMMITMENT=confirmed
```

**Commitment Levels**:
- `processed`: Fastest, least secure (may be rolled back)
- `confirmed`: Balanced (majority of cluster confirmed)
- `finalized`: Slowest, most secure (cannot be rolled back)

### `SOLANA_NETWORK`
- **Type**: String
- **Default**: `devnet`
- **Options**: `localnet`, `devnet`, `testnet`, `mainnet-beta`
- **Required**: No
- **Description**: Solana network identifier for logging and configuration.

```bash
SOLANA_NETWORK=devnet
```

### `ESCROW_PROGRAM_ID`
- **Type**: String (Base58 Public Key)
- **Required**: Yes
- **Description**: Deployed escrow program's public key address.

```bash
ESCROW_PROGRAM_ID=BZWjEPLRQTzHfQQKHwUJRx5RoU3VJDZvqAGmDrYJTgxP
```

### `USDC_MINT_ADDRESS`
- **Type**: String (Base58 Public Key)
- **Required**: Yes
- **Description**: USDC token mint address for the network.

```bash
# Devnet USDC
USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr

# Mainnet USDC
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

---

## Authentication & Security

### `JWT_SECRET`
- **Type**: String
- **Required**: Yes
- **Description**: Secret key for JWT token signing and verification. Must be at least 32 characters.
- **Security**: **CRITICAL** - Keep this secret secure. Rotate regularly.

```bash
JWT_SECRET=your_super_secure_jwt_secret_min_32_characters_long
```

**Best Practices**:
- Use a cryptographically secure random string
- Minimum 32 characters (preferably 64+)
- Never commit to version control
- Rotate periodically
- Use different secrets for different environments

**Generate secure secret**:
```bash
# Linux/Mac
openssl rand -base64 64

# Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

### `API_KEY`
- **Type**: String
- **Required**: Yes (for protected endpoints)
- **Description**: API key for authenticating requests to protected endpoints.

```bash
API_KEY=your_api_key_here
```

---

## Monitoring & Background Jobs

### `MONITORING_ENABLED`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Enable/disable deposit monitoring service.

```bash
MONITORING_ENABLED=true
```

### `MONITORING_INTERVAL_MS`
- **Type**: Number (milliseconds)
- **Default**: `30000` (30 seconds)
- **Required**: No
- **Description**: Interval for monitoring orchestrator health checks.

```bash
MONITORING_INTERVAL_MS=30000
```

### `METRICS_INTERVAL_MS`
- **Type**: Number (milliseconds)
- **Default**: `60000` (60 seconds)
- **Required**: No
- **Description**: Interval for collecting and reporting metrics.

```bash
METRICS_INTERVAL_MS=60000
```

### `MAX_MONITOR_RESTARTS`
- **Type**: Number
- **Default**: `5`
- **Required**: No
- **Description**: Maximum number of automatic monitoring service restarts before stopping.

```bash
MAX_MONITOR_RESTARTS=5
```

### `RESTART_DELAY_MS`
- **Type**: Number (milliseconds)
- **Default**: `5000` (5 seconds)
- **Required**: No
- **Description**: Delay before restarting failed monitoring service.

```bash
RESTART_DELAY_MS=5000
```

### `EXPIRY_CHECK_INTERVAL_MS`
- **Type**: Number (milliseconds)
- **Default**: `60000` (60 seconds)
- **Required**: No
- **Description**: Interval for checking expired agreements.

```bash
EXPIRY_CHECK_INTERVAL_MS=60000
```

### `AUTO_PROCESS_REFUNDS`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Automatically process refunds for expired/cancelled agreements.

```bash
AUTO_PROCESS_REFUNDS=true
```

### `REFUND_BATCH_SIZE`
- **Type**: Number
- **Default**: `10`
- **Required**: No
- **Description**: Number of refunds to process in each batch.

```bash
REFUND_BATCH_SIZE=10
```

---

## Idempotency

### `IDEMPOTENCY_EXPIRATION_HOURS`
- **Type**: Number (hours)
- **Default**: `24`
- **Required**: No
- **Description**: How long to keep idempotency keys before cleanup.

```bash
IDEMPOTENCY_EXPIRATION_HOURS=24
```

### `IDEMPOTENCY_CLEANUP_INTERVAL_MINUTES`
- **Type**: Number (minutes)
- **Default**: `60`
- **Required**: No
- **Description**: Interval for cleaning up expired idempotency keys.

```bash
IDEMPOTENCY_CLEANUP_INTERVAL_MINUTES=60
```

---

## Webhooks

### `WEBHOOK_ENABLED`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Enable/disable webhook functionality.

```bash
WEBHOOK_ENABLED=true
```

### `WEBHOOK_MAX_RETRIES`
- **Type**: Number
- **Default**: `3`
- **Required**: No
- **Description**: Maximum number of webhook delivery retry attempts.

```bash
WEBHOOK_MAX_RETRIES=3
```

### `WEBHOOK_RETRY_DELAY_MS`
- **Type**: Number (milliseconds)
- **Default**: `1000` (1 second)
- **Required**: No
- **Description**: Delay between webhook retry attempts.

```bash
WEBHOOK_RETRY_DELAY_MS=1000
```

---

## CORS & Security Headers

### `ALLOWED_ORIGINS`
- **Type**: String (comma-separated URLs)
- **Required**: Yes
- **Description**: Comma-separated list of allowed CORS origins.

```bash
# Single origin
ALLOWED_ORIGINS=http://localhost:3000

# Multiple origins
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,https://app.easyescrow.ai

# Wildcard (not recommended for production)
ALLOWED_ORIGINS=*
```

### `CORS_ENABLED`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Enable/disable CORS middleware.

```bash
CORS_ENABLED=true
```

### `CORS_CREDENTIALS`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Allow credentials (cookies, authorization headers) in CORS requests.

```bash
CORS_CREDENTIALS=true
```

### `HELMET_ENABLED`
- **Type**: Boolean
- **Default**: `true`
- **Required**: No
- **Description**: Enable/disable Helmet security headers middleware.

```bash
HELMET_ENABLED=true
```

### `ALLOWED_USDC_AMOUNTS`
- **Type**: String (comma-separated numbers)
- **Required**: Yes
- **Description**: Whitelisted USDC amounts (in USDC, not lamports) allowed for agreements.

```bash
ALLOWED_USDC_AMOUNTS=10,25,50,75,100,250,500,1000
```

---

## Rate Limiting

### `RATE_LIMIT_WINDOW_MS`
- **Type**: Number (milliseconds)
- **Default**: `900000` (15 minutes)
- **Required**: No
- **Description**: Time window for rate limiting.

```bash
RATE_LIMIT_WINDOW_MS=900000
```

### `RATE_LIMIT_MAX_REQUESTS`
- **Type**: Number
- **Default**: `100`
- **Required**: No
- **Description**: Maximum requests per window per IP.

```bash
RATE_LIMIT_MAX_REQUESTS=100
```

---

## Logging

### `LOG_LEVEL`
- **Type**: String
- **Default**: `info`
- **Options**: `error`, `warn`, `info`, `debug`, `verbose`
- **Required**: No
- **Description**: Logging verbosity level.

```bash
LOG_LEVEL=info
```

### `LOG_FORMAT`
- **Type**: String
- **Default**: `json`
- **Options**: `json`, `text`
- **Required**: No
- **Description**: Log output format.

```bash
LOG_FORMAT=json
```

---

## DigitalOcean Spaces Configuration

### `SPACES_ENDPOINT`
- **Type**: String (URL)
- **Required**: Yes (if using Spaces)
- **Description**: DigitalOcean Spaces endpoint URL.

```bash
SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com
```

### `SPACES_REGION`
- **Type**: String
- **Default**: `sgp1`
- **Required**: Yes (if using Spaces)
- **Description**: DigitalOcean Spaces region.

```bash
SPACES_REGION=sgp1
```

### `SPACES_BUCKET`
- **Type**: String
- **Required**: Yes (if using Spaces)
- **Description**: DigitalOcean Spaces bucket name. Use `easyescrow-test` for dev/staging and `easyescrow-storage` for production.

```bash
# Development/Staging
SPACES_BUCKET=easyescrow-test

# Production
SPACES_BUCKET=easyescrow-storage
```

### `SPACES_ACCESS_KEY_ID`
- **Type**: String
- **Required**: Yes (if using Spaces)
- **Description**: DigitalOcean Spaces access key ID.
- **Security**: **CRITICAL** - Keep this secret secure.

```bash
SPACES_ACCESS_KEY_ID=DO00XXXXXXXXXXXXXXXXX
```

### `SPACES_SECRET_ACCESS_KEY`
- **Type**: String
- **Required**: Yes (if using Spaces)
- **Description**: DigitalOcean Spaces secret access key.
- **Security**: **CRITICAL** - Keep this secret secure.

```bash
SPACES_SECRET_ACCESS_KEY=your_secret_key_here
```

---

## Complete Example

### Development Environment

```bash
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/easyescrow?schema=public

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Solana
SOLANA_RPC_URL=http://localhost:8899
SOLANA_COMMITMENT=confirmed
SOLANA_NETWORK=localnet
ESCROW_PROGRAM_ID=BZWjEPLRQTzHfQQKHwUJRx5RoU3VJDZvqAGmDrYJTgxP
USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr

# Security
JWT_SECRET=development_jwt_secret_min_32_characters_long_not_for_production
API_KEY=dev_api_key_123

# Monitoring
MONITORING_ENABLED=true
MONITORING_INTERVAL_MS=30000
EXPIRY_CHECK_INTERVAL_MS=60000
AUTO_PROCESS_REFUNDS=true

# Webhooks
WEBHOOK_ENABLED=true
WEBHOOK_MAX_RETRIES=3

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
CORS_ENABLED=true
HELMET_ENABLED=true
ALLOWED_USDC_AMOUNTS=10,25,50,75,100,250,500,1000

# Spaces (Development/Staging uses easyescrow-test)
SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com
SPACES_REGION=sgp1
SPACES_BUCKET=easyescrow-test
SPACES_ACCESS_KEY_ID=DO801KN4CQPPPDQV99WL
SPACES_SECRET_ACCESS_KEY=udsdFmT9NR25hrHOzlyrT13J0xhBFNDTDpBkZllYo30
```

### Production Environment

```bash
# Server
NODE_ENV=production
PORT=3000

# Database (use secrets management in production)
DATABASE_URL=postgresql://produser:SECURE_PASSWORD@prod-db.internal:5432/easyescrow?schema=public&sslmode=require

# Redis
REDIS_URL=rediss://:SECURE_REDIS_PASSWORD@prod-redis.internal:6380

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_COMMITMENT=finalized
SOLANA_NETWORK=mainnet-beta
ESCROW_PROGRAM_ID=YOUR_MAINNET_PROGRAM_ID
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Security (use secrets management!)
JWT_SECRET=SUPER_SECURE_RANDOM_STRING_64_CHARACTERS_OR_MORE_ROTATE_REGULARLY
API_KEY=PRODUCTION_API_KEY_FROM_SECRETS_MANAGER

# Monitoring
MONITORING_ENABLED=true
MONITORING_INTERVAL_MS=30000
METRICS_INTERVAL_MS=60000
EXPIRY_CHECK_INTERVAL_MS=60000
AUTO_PROCESS_REFUNDS=true
REFUND_BATCH_SIZE=10

# Idempotency
IDEMPOTENCY_EXPIRATION_HOURS=24
IDEMPOTENCY_CLEANUP_INTERVAL_MINUTES=60

# Webhooks
WEBHOOK_ENABLED=true
WEBHOOK_MAX_RETRIES=3
WEBHOOK_RETRY_DELAY_MS=2000

# CORS & Security
ALLOWED_ORIGINS=https://app.easyescrow.ai,https://www.easyescrow.ai
CORS_ENABLED=true
CORS_CREDENTIALS=true
HELMET_ENABLED=true
ALLOWED_USDC_AMOUNTS=10,25,50,75,100,250,500,1000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Spaces (Production uses easyescrow-storage)
SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com
SPACES_REGION=sgp1
SPACES_BUCKET=easyescrow-storage
SPACES_ACCESS_KEY_ID=PRODUCTION_KEY_ID
SPACES_SECRET_ACCESS_KEY=PRODUCTION_SECRET_KEY
```

---

## Security Best Practices

1. **Never commit secrets to version control**
   - Use `.env` files locally (add to `.gitignore`)
   - Use secret management in production (AWS Secrets Manager, Vault, etc.)

2. **Use strong, unique secrets**
   - Generate cryptographically secure random strings
   - Different secrets for different environments
   - Minimum 32 characters for JWT secrets

3. **Rotate secrets regularly**
   - Rotate JWT secrets periodically
   - Update API keys regularly
   - Change database passwords on schedule

4. **Restrict CORS origins**
   - Never use `*` in production
   - Only whitelist trusted domains
   - Use HTTPS origins in production

5. **Use environment-specific configurations**
   - Development: verbose logging, relaxed security
   - Staging: production-like, safe for testing
   - Production: strict security, minimal logging

---

**Last Updated**: January 2025
**Version**: 1.0.0

