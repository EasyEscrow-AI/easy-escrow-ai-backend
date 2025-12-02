# Atomic Swap Deployment Architecture and Auto-Deploy Workflow

**Last Updated:** December 2, 2025  
**Status:** Production Active  
**Environments:** Dev (Devnet), Staging (Devnet), Production (Mainnet)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [DigitalOcean Auto-Deploy Workflow](#digitalocean-auto-deploy-workflow)
3. [Environment Configuration](#environment-configuration)
4. [Local Development Environment](#local-development-environment)
5. [Database Migration Strategy](#database-migration-strategy)
6. [Atomic Swap Deployment Checklist](#atomic-swap-deployment-checklist)
7. [Rollback Procedures](#rollback-procedures)
8. [Monitoring & Health Checks](#monitoring--health-checks)

---

## Overview

EasyEscrow.ai atomic swap backend is deployed on **DigitalOcean App Platform** with automatic deployment triggered by Git pushes. The system uses managed PostgreSQL, Redis Cloud, and Helius RPC for blockchain interaction.

### Architecture At A Glance

```
┌────────────────────────────────────────────────────────────────┐
│                         GitHub                                  │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────┐         │
│  │  master  │    │   staging   │    │ feature/*    │         │
│  │ (mainnet)│    │  (devnet)   │    │    (dev)     │         │
│  └─────┬────┘    └──────┬──────┘    └──────┬───────┘         │
└────────┼─────────────────┼──────────────────┼─────────────────┘
         │                 │                  │
         │ git push        │ git push         │ manual deploy
         ↓                 ↓                  ↓
┌────────────────────────────────────────────────────────────────┐
│              DigitalOcean App Platform                         │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐    │
│  │  PRODUCTION    │  │    STAGING     │  │     DEV      │    │
│  │   App (sgp1)   │  │  App (sgp1)    │  │  App (sgp1)  │    │
│  │  - Build       │  │  - Build       │  │  - Build     │    │
│  │  - Migrate DB  │  │  - Migrate DB  │  │  - Migrate DB│    │
│  │  - Deploy      │  │  - Deploy      │  │  - Deploy    │    │
│  │  - Health Check│  │  - Health Check│  │  - Health Ck │    │
│  └────────┬───────┘  └────────┬───────┘  └──────┬───────┘    │
└───────────┼────────────────────┼──────────────────┼───────────┘
            │                    │                  │
            ↓                    ↓                  ↓
┌────────────────────────────────────────────────────────────────┐
│                    Infrastructure                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ PostgreSQL   │  │ Redis Cloud  │  │ Helius RPC      │    │
│  │ (Managed DB) │  │ (Managed)    │  │ (Mainnet/Devnet)│    │
│  └──────────────┘  └──────────────┘  └─────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

---

## DigitalOcean Auto-Deploy Workflow

### Automatic Deployment Triggers

| Environment | Git Branch | Network | Program ID | Auto-Deploy |
|-------------|------------|---------|------------|-------------|
| **DEV** | `develop` (manual) | Devnet | `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd` | ❌ Manual |
| **STAGING** | `staging` | Devnet | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | ✅ Auto |
| **PRODUCTION** | `master` | Mainnet | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | ✅ Auto |

### Complete CI/CD Pipeline Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Developer pushes to staging/master branch                     │
└─────────────────────────┬────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. DigitalOcean Detects Push                                     │
│    - Webhook triggered from GitHub                               │
│    - Build job queued                                            │
│    - Previous deployment kept running                            │
└─────────────────────────┬────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────────┐
│ 3. Build Phase                                                   │
│    - Clone repository                                            │
│    - Install dependencies: npm ci                                │
│    - Build TypeScript: npm run build                             │
│    - Generate Prisma client: npx prisma generate                 │
│    - Run tests (optional): npm test                              │
│    Duration: ~3-5 minutes                                        │
└─────────────────────────┬────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────────┐
│ 4. Pre-Deploy Job: Database Migration                           │
│    - Command: npm run db:migrate:deploy                          │
│    - Runs: npx prisma migrate deploy                             │
│    - Applies pending migrations                                  │
│    - Connection: Uses DATABASE_URL secret                        │
│    - Runs BEFORE new app starts                                  │
│    Duration: ~10-30 seconds                                      │
└─────────────────────────┬────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────────┐
│ 5. Deployment Phase                                              │
│    - New container created with built image                      │
│    - Environment variables injected from secrets                 │
│    - Health check endpoint polled: /health                       │
│    - Wait for healthy status (max 300s)                          │
│    Duration: ~30-60 seconds                                      │
└─────────────────────────┬────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────────┐
│ 6. Traffic Cutover                                               │
│    - New container marked healthy                                │
│    - Load balancer switches traffic to new container             │
│    - Old container kept running for 30s (drain period)           │
│    - Old container terminated                                    │
│    Duration: ~30 seconds                                         │
└─────────────────────────┬────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────────┐
│ 7. Post-Deploy Verification                                      │
│    - Health check: GET /health                                   │
│    - Version check: GET / (returns version)                      │
│    - Monitoring alerts: Check for errors                         │
│    - Manual smoke test: Create/accept test offer                 │
└──────────────────────────────────────────────────────────────────┘
```

### Branch Protection Rules

**Staging Branch:**
- Requires 1 PR approval
- Must pass all status checks
- No force push allowed
- Auto-deploy enabled

**Master Branch (Production):**
- Requires 2 PR approvals
- Must be merged from staging
- Must pass all status checks
- No force push allowed
- Auto-deploy enabled
- Tagged releases recommended

### Deployment Configuration Files

**Production:** `production-app.yaml`
```yaml
name: easyescrow-backend-prod
region: sgp
services:
  - name: backend
    github:
      repo: your-org/easy-escrow-ai-backend
      branch: master
      deploy_on_push: true
    build_command: npm ci && npm run build
    run_command: npm start
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: basic-xs
    http_port: 3000
    health_check:
      http_path: /health
      initial_delay_seconds: 30
      period_seconds: 10
      timeout_seconds: 5
      success_threshold: 1
      failure_threshold: 3
    envs:
      - key: NODE_ENV
        value: production
        scope: RUN_TIME
      - key: SOLANA_NETWORK
        value: mainnet-beta
        scope: RUN_TIME
      - key: ESCROW_PROGRAM_ID
        value: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
        scope: RUN_TIME
      # Secrets stored in DO console
      - key: DATABASE_URL
        value: ${DATABASE_URL}
        type: SECRET
        scope: RUN_TIME
      - key: REDIS_URL
        value: ${REDIS_URL}
        type: SECRET
        scope: RUN_TIME
      - key: SOLANA_RPC_URL
        value: ${SOLANA_RPC_URL}
        type: SECRET
        scope: RUN_TIME
      - key: PLATFORM_AUTHORITY_KEYPAIR
        value: ${PLATFORM_AUTHORITY_KEYPAIR}
        type: SECRET
        scope: RUN_TIME
jobs:
  - name: db-migrate
    kind: PRE_DEPLOY
    run_command: npm run db:migrate:deploy
    envs:
      - key: DATABASE_URL
        value: ${DATABASE_URL}
        type: SECRET
        scope: RUN_AND_BUILD_TIME
```

**Staging:** `staging-app.yaml` (similar structure, different program ID and network)

---

## Environment Configuration

### Required Environment Variables

**Core Application:**
```bash
NODE_ENV=production                        # Environment mode
PORT=3000                                  # HTTP port
SOLANA_NETWORK=mainnet-beta               # Solana cluster
ESCROW_PROGRAM_ID=2GFDPMZawisx4...        # Program address
```

**Database & Caching:**
```bash
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
REDIS_URL=rediss://default:pass@host:port
```

**Solana RPC:**
```bash
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

**Atomic Swap System:**
```bash
# Platform authority wallet (manages nonces, collects fees)
PLATFORM_AUTHORITY_KEYPAIR=[1,2,3...]      # JSON array format

# Treasury PDA seed (for fee collection)
TREASURY_PDA_SEED=treasury                 # Default: "treasury"

# Platform fee configuration
PLATFORM_FEE_BPS=100                       # 1% (100 basis points)
MIN_PLATFORM_FEE_LAMPORTS=1000000          # 0.001 SOL
MAX_PLATFORM_FEE_LAMPORTS=500000000        # 0.5 SOL
FLAT_FEE_NFT_ONLY_LAMPORTS=5000000         # 0.005 SOL for NFT-only swaps

# Nonce pool configuration
NONCE_POOL_SIZE=50                         # Number of durable nonces
NONCE_POOL_MIN_AVAILABLE=10                # Trigger replenishment
NONCE_POOL_CLEANUP_INTERVAL_MS=300000      # 5 minutes
```

**Asset Validation:**
```bash
# Helius DAS API (for cNFT validation)
HELIUS_API_KEY=your_helius_api_key
HELIUS_DAS_URL=https://mainnet.helius-rpc.com

# QuickNode (alternative RPC provider)
QUICKNODE_API_KEY=your_quicknode_key
QUICKNODE_ENDPOINT=https://your-endpoint.quiknode.pro
```

**Security & Rate Limiting:**
```bash
JWT_SECRET=your_jwt_secret_min_32_chars
API_KEY_SECRET=your_api_key_secret
RATE_LIMIT_WINDOW_MS=900000               # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100               # Standard endpoints
RATE_LIMIT_MAX_REQUESTS_STRICT=10         # Create offer endpoint
```

### Program IDs by Environment

| Environment | Network | Program ID | Explorer Link |
|-------------|---------|------------|---------------|
| **DEV** | Devnet | `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd` | [View](https://explorer.solana.com/address/4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd?cluster=devnet) |
| **STAGING** | Devnet | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | [View](https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet) |
| **PRODUCTION** | Mainnet | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | [View](https://solscan.io/account/2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx) |

### Managing Secrets in DigitalOcean

**Via Console (Recommended):**
1. Navigate to: App → Settings → App-Level Environment Variables
2. Click "Edit" → "Add Variable"
3. Enter key name (e.g., `DATABASE_URL`)
4. Enter secret value
5. Check "Encrypt" checkbox (marks as SECRET type)
6. Save changes
7. Redeploy app to apply new secrets

**Via CLI (doctl):**
```bash
# Update app spec with encrypted values
doctl apps update <app-id> --spec production-app.yaml

# Note: Secrets must be added via console or API
# CLI spec files use placeholders like ${DATABASE_URL}
```

**Security Best Practices:**
- ✅ Never commit actual secrets to Git
- ✅ Use DigitalOcean encrypted secrets
- ✅ Rotate secrets quarterly
- ✅ Use separate keypairs per environment
- ✅ Monitor access logs for secret usage
- ❌ Never log secret values
- ❌ Never expose secrets in error messages

---

## Local Development Environment

### Docker Compose Setup

The project includes a complete Docker Compose configuration for local atomic swap development:

**Services Included:**
- **Backend** (Node.js Express API)
- **PostgreSQL** (Database)
- **Redis** (Caching & session storage)

**Starting Services:**
```bash
# Using npm scripts (recommended)
npm run docker:start              # Start all services
npm run docker:logs:backend       # View backend logs
npm run docker:ps                 # Check service status

# Using Docker Compose directly
docker compose up -d
docker compose logs -f backend
docker compose ps
```

**Stopping Services:**
```bash
# Graceful shutdown (ALWAYS use this)
npm run docker:stop
# OR
docker compose down

# Never use: pkill, taskkill, or kill -9 for services
# Always use Docker commands for graceful shutdowns
```

**Restarting Services:**
```bash
# Restart all services
npm run docker:restart

# Restart specific service
npm run docker:restart:backend
docker compose restart backend

# After code changes (rebuild image)
npm run docker:rebuild
docker compose up -d --build backend
```

**Fresh Start (Clean Slate):**
```bash
# Complete fresh build (removes all data)
npm run docker:fresh

# Fresh build but keep database data
npm run docker:fresh:keep-data

# Fresh build with seed data
npm run docker:fresh:seed
```

### Localnet Solana Validator

For testing atomic swaps without using devnet RPC:

**Start Validator:**
```bash
# Terminal 1: Start validator
npm run localnet:start

# Wait for "Processed Slot" messages
```

**Deploy Program:**
```bash
# Terminal 2: Deploy escrow program
npm run localnet:setup
anchor build && anchor deploy

# Note the deployed program ID
# Update .env: ESCROW_PROGRAM_ID=<program-id>
```

**Test Swaps:**
```bash
# Run localnet tests
npm run test:localnet

# Or individual test files
npx jest tests/staging/e2e/01-atomic-nft-for-sol-happy-path.test.ts
```

**Stop Validator:**
```bash
# Ctrl+C in validator terminal
# Or
npm run localnet:stop
```

### Environment File Structure

```
project-root/
├── .env                    # Local development (gitignored)
├── .env.example            # Template with all variables
├── .env.staging            # Staging config (placeholders only)
├── .env.production         # Production config (placeholders only)
└── docker-compose.yml      # Local services
```

**Sample `.env` for Local Development:**
```bash
# Local development configuration
NODE_ENV=development
PORT=3000

# Localnet Solana
SOLANA_NETWORK=localnet
SOLANA_RPC_URL=http://localhost:8899
ESCROW_PROGRAM_ID=<your-localnet-program-id>

# Docker services
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/easyescrow_dev
REDIS_URL=redis://localhost:6379

# Test keypairs (localnet only - never use these on devnet/mainnet)
PLATFORM_AUTHORITY_KEYPAIR=[1,2,3,...]  # Generate via solana-keygen

# Platform config
PLATFORM_FEE_BPS=100
TREASURY_PDA_SEED=treasury

# Development-only: Relaxed rate limits
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_MAX_REQUESTS_STRICT=100
```

### Troubleshooting Local Environment

**Backend won't start:**
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Linux/Mac

# Restart backend container
docker compose restart backend
docker compose logs -f backend
```

**Database connection issues:**
```bash
# Verify PostgreSQL is running
docker compose ps postgres

# Check database logs
docker compose logs postgres

# Test connection
docker compose exec postgres psql -U postgres -d easyescrow_dev
```

**Redis connection issues:**
```bash
# Verify Redis is running
docker compose ps redis

# Test connection
docker compose exec redis redis-cli ping
# Expected output: PONG
```

**Solana RPC issues (localnet):**
```bash
# Check validator is running
solana cluster-version --url http://localhost:8899

# View validator logs
tail -f ~/.config/solana/validator.log

# Restart validator
pkill solana-test-validator
npm run localnet:start
```

---

## Database Migration Strategy

### Migration Workflow

EasyEscrow.ai uses **Prisma** for database schema management and migrations.

**Development Workflow:**
```bash
# 1. Modify schema.prisma
vim prisma/schema.prisma

# 2. Create migration
npm run db:migrate:dev
# Enter migration name: "add_atomic_swap_tables"

# 3. Migration file created in prisma/migrations/
# Example: 20251202_add_atomic_swap_tables/migration.sql

# 4. Test migration locally
npm run db:reset  # Reset database and reapply all migrations
npm run db:seed   # Populate with test data
```

**Staging/Production Deployment:**
```bash
# Migrations run automatically during deployment
# Via pre-deploy job: npm run db:migrate:deploy

# This runs: npx prisma migrate deploy
# - Applies pending migrations only
# - Does NOT create new migrations
# - Fails deployment if migration errors occur
```

### Migration File Structure

```
prisma/migrations/
├── 20251120_init/
│   └── migration.sql                    # Initial schema
├── 20251125_add_nonce_pool/
│   └── migration.sql                    # Nonce pool tables
├── 20251128_add_atomic_swap_offers/
│   └── migration.sql                    # Offer tables
└── migration_lock.toml                  # Migration lock file
```

### Database Schema (Atomic Swaps)

**Key Tables:**

```sql
-- Atomic swap offers
CREATE TABLE "offers" (
  "id" SERIAL PRIMARY KEY,
  "maker_wallet" TEXT NOT NULL,
  "taker_wallet" TEXT,
  "offered_assets" JSONB NOT NULL,
  "requested_assets" JSONB NOT NULL,
  "offered_sol_lamports" BIGINT NOT NULL,
  "requested_sol_lamports" BIGINT NOT NULL,
  "platform_fee_lamports" BIGINT NOT NULL,
  "nonce_account" TEXT NOT NULL,
  "nonce_value" TEXT,
  "status" TEXT NOT NULL,  -- PENDING, ACCEPTED, FILLED, CANCELLED, EXPIRED
  "parent_offer_id" INTEGER,
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "filled_at" TIMESTAMP,
  "cancelled_at" TIMESTAMP
);

-- Nonce pool management
CREATE TABLE "nonce_accounts" (
  "id" SERIAL PRIMARY KEY,
  "public_key" TEXT UNIQUE NOT NULL,
  "status" TEXT NOT NULL,  -- AVAILABLE, ASSIGNED, EXPIRED
  "assigned_to_offer_id" INTEGER,
  "last_used_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- Transaction history
CREATE TABLE "transaction_history" (
  "id" SERIAL PRIMARY KEY,
  "offer_id" INTEGER NOT NULL,
  "signature" TEXT UNIQUE NOT NULL,
  "status" TEXT NOT NULL,  -- PENDING, CONFIRMED, FAILED
  "error_message" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "confirmed_at" TIMESTAMP
);
```

### Migration Rollback Procedures

⚠️ **Prisma does NOT support automatic rollback**. Manual intervention required.

**Rollback Strategy:**

1. **Create Reverse Migration (Manual)**
   ```sql
   -- File: prisma/migrations/20251202_rollback_offer_changes/migration.sql
   -- Reverse the changes from previous migration
   
   ALTER TABLE "offers" DROP COLUMN "new_column";
   ```

2. **Apply Reverse Migration**
   ```bash
   # Staging
   npm run db:migrate:deploy
   
   # Production (via DigitalOcean console)
   # Run command: npm run db:migrate:deploy
   ```

3. **Rollback App Deployment**
   ```bash
   # Via DigitalOcean console:
   # App → Deployments → Previous Deployment → "Rollback"
   ```

### Data Backup Strategy

**Automatic Backups (DigitalOcean Managed PostgreSQL):**
- Daily backups at 2 AM UTC
- 7-day retention for staging
- 14-day retention for production
- Point-in-time recovery available

**Manual Backup Before Risky Migrations:**
```bash
# Via DigitalOcean console:
# Database → Settings → "Create Backup Now"

# Or via CLI:
doctl databases backup create <database-id>
```

**Restore from Backup:**
```bash
# Via DigitalOcean console:
# Database → Backups → Select backup → "Restore"

# Creates new database cluster from backup
# Update DATABASE_URL in app to point to restored cluster
```

---

## Atomic Swap Deployment Checklist

Use this checklist before deploying atomic swap updates to staging or production.

### Pre-Deployment Checklist

#### Code Quality
- [ ] All unit tests passing (`npm test`)
- [ ] Integration tests passing (`npm run test:integration`)
- [ ] E2E tests passing on staging (`npm run test:staging`)
- [ ] No TypeScript errors (`npm run build`)
- [ ] No linter errors (`npm run lint`)
- [ ] Code reviewed and approved

#### Atomic Swap Verification
- [ ] Offer creation works for all asset types
- [ ] Transaction building includes correct accounts
- [ ] Nonce pool has sufficient available nonces (>10)
- [ ] Fee calculation tested for edge cases
- [ ] Asset validation works for NFTs and cNFTs
- [ ] Counter-offer flow tested
- [ ] Offer cancellation tested (nonce invalidation)

#### Database
- [ ] Migrations tested locally
- [ ] Migrations tested on staging
- [ ] Backup created for production database
- [ ] Schema changes backward compatible (if applicable)
- [ ] Seed data available for new tables

#### Configuration
- [ ] Environment variables documented
- [ ] Secrets updated in DigitalOcean console (if changed)
- [ ] Program ID verified for target environment
- [ ] RPC endpoint configured and tested
- [ ] Platform authority keypair verified

#### Monitoring
- [ ] Health check endpoint returns 200
- [ ] Logging configured for atomic swap operations
- [ ] Error tracking configured (Sentry/similar)
- [ ] Performance metrics baseline established

### Post-Deployment Verification

#### Immediate Checks (0-5 minutes)
- [ ] Health check: `GET /health` returns 200
- [ ] Version check: `GET /` returns new version
- [ ] Database connectivity: Check logs for connection errors
- [ ] Redis connectivity: Check caching operations
- [ ] Nonce pool initialized: Check logs for pool startup

#### Smoke Tests (5-15 minutes)
- [ ] Create test offer (NFT ↔ SOL)
- [ ] Accept test offer
- [ ] Verify transaction built successfully
- [ ] Cancel test offer
- [ ] Verify nonce invalidated
- [ ] Create counter-offer
- [ ] List all offers via API

#### Extended Monitoring (15-60 minutes)
- [ ] Monitor error rates (should be < 1%)
- [ ] Monitor response times (should be < 500ms p95)
- [ ] Check database query performance
- [ ] Verify nonce pool replenishment working
- [ ] Monitor transaction confirmation times
- [ ] Check for any unexpected errors in logs

#### Production-Specific (60+ minutes)
- [ ] Monitor user transactions (real swaps)
- [ ] Verify fee collection to treasury
- [ ] Check Solscan for transaction history
- [ ] Monitor RPC rate limits (should not be exceeded)
- [ ] Verify cNFT validation working (if applicable)
- [ ] Check system resource usage (CPU, memory)

---

## Rollback Procedures

### Application Rollback (DigitalOcean)

**Via Console (Recommended):**
1. Navigate to: App → Deployments
2. Find previous working deployment
3. Click "..." menu → "Rollback to this deployment"
4. Confirm rollback
5. Wait for deployment (2-3 minutes)
6. Verify health check passes

**Via CLI:**
```bash
# List recent deployments
doctl apps list-deployments <app-id>

# Rollback to specific deployment
doctl apps create-deployment <app-id> --deployment-id <deployment-id>
```

**Rollback Time:** ~2-3 minutes (same as normal deployment)

### Database Migration Rollback

⚠️ **More Complex** - Requires manual reverse migration

**Step 1: Create Reverse Migration**
```bash
# Create new migration file
mkdir -p prisma/migrations/$(date +%Y%m%d)_rollback_changes
cat > prisma/migrations/$(date +%Y%m%d)_rollback_changes/migration.sql << EOF
-- Rollback migration from [date]

-- Example: Remove added column
ALTER TABLE "offers" DROP COLUMN IF EXISTS "new_column";

-- Example: Restore deleted table
CREATE TABLE IF NOT EXISTS "old_table" (
  "id" SERIAL PRIMARY KEY,
  -- ... original schema
);
EOF
```

**Step 2: Test Locally**
```bash
# Test reverse migration locally
npm run db:reset
npm run db:seed
# Verify data integrity
```

**Step 3: Apply to Staging**
```bash
# Commit reverse migration
git add prisma/migrations
git commit -m "rollback: revert [feature] migration"
git push origin staging

# Monitor deployment
doctl apps list-deployments <staging-app-id> --watch
```

**Step 4: Verify Staging**
```bash
# Run E2E tests
npm run test:staging

# Manual verification
# Check offer creation, acceptance, cancellation
```

**Step 5: Apply to Production (if needed)**
```bash
# Merge to master
git checkout master
git merge staging
git push origin master

# Monitor deployment
doctl apps list-deployments <prod-app-id> --watch
```

### Nonce Pool Recovery

If nonce pool becomes corrupted or exhausted:

**Emergency Nonce Creation:**
```bash
# SSH to DigitalOcean console or run locally with production credentials

# Create additional nonces
node scripts/create-nonces.js --count 20

# Output:
# Created 20 new nonce accounts
# Added to database with status: AVAILABLE
```

**Nonce Pool Reset:**
```bash
# Mark all nonces as expired
npm run nonce-pool:reset

# Cleanup and recreate
npm run nonce-pool:cleanup
npm run nonce-pool:init --size 50
```

### Emergency Procedures

**Critical Bug Discovered Post-Deployment:**

1. **Immediate**: Rollback app deployment (2-3 min)
2. **Communicate**: Alert team and stakeholders
3. **Investigate**: Identify root cause
4. **Fix**: Create hotfix branch
5. **Test**: Run full test suite
6. **Deploy**: Fast-track through staging → production

**Database Corruption:**

1. **Stop writes**: Set app to read-only mode (maintenance page)
2. **Restore backup**: Use DigitalOcean backup restore
3. **Verify integrity**: Run data validation queries
4. **Resume writes**: Switch app back to normal mode
5. **Post-mortem**: Document incident and prevention steps

**RPC Provider Outage:**

1. **Failover**: Switch to backup RPC provider
   ```bash
   # Update secret in DigitalOcean console
   SOLANA_RPC_URL=https://backup-rpc-endpoint.com
   
   # Redeploy app
   ```
2. **Monitor**: Check transaction success rates
3. **Restore**: Switch back to primary RPC when recovered

---

## Monitoring & Health Checks

### Health Check Endpoint

**Endpoint:** `GET /health`

**Response (Healthy):**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-02T10:30:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "solana_rpc": "connected",
    "nonce_pool": "healthy"
  },
  "version": "1.2.0",
  "environment": "production"
}
```

**Health Check Criteria:**
- Database connection established
- Redis connection established
- Solana RPC reachable
- Nonce pool has >10 available nonces
- Response time < 5 seconds

### Key Metrics to Monitor

**Application Metrics:**
- Request rate (req/sec)
- Error rate (errors/min)
- Response time (p50, p95, p99)
- Active connections

**Atomic Swap Metrics:**
- Offers created per hour
- Offers accepted per hour
- Offers filled per hour
- Offers cancelled per hour
- Average time to acceptance
- Average time to confirmation

**Nonce Pool Metrics:**
- Available nonces
- Assigned nonces
- Nonce creation rate
- Nonce exhaustion events

**System Metrics:**
- CPU usage (%)
- Memory usage (%)
- Disk I/O
- Network bandwidth

### Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Error rate | > 1% | > 5% |
| Response time (p95) | > 500ms | > 1000ms |
| Available nonces | < 15 | < 5 |
| Database connections | > 80% | > 95% |
| CPU usage | > 70% | > 90% |
| Memory usage | > 80% | > 95% |

### Log Monitoring

**Important Log Patterns:**

**Successful Swap:**
```
[INFO] Offer created: offerÍd=123, maker=ABC...
[INFO] Offer accepted: offerId=123, taker=DEF...
[INFO] Transaction built: offerId=123, signature=XYZ...
[INFO] Swap confirmed: offerId=123, status=FILLED
```

**Error Patterns to Watch:**
```
[ERROR] Failed to create offer: ...
[ERROR] Asset validation failed: ...
[ERROR] Nonce pool exhausted
[ERROR] Transaction build failed: ...
[ERROR] RPC request failed: ...
```

**Set up alerts** for ERROR-level logs in production.

---

## Related Documentation

- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - General deployment instructions
- **[Production Deployment Guide](PRODUCTION_DEPLOYMENT_GUIDE.md)** - Mainnet deployment
- **[Staging Deployment Guide](STAGING_DEPLOYMENT_GUIDE.md)** - Devnet staging
- **[Docker Deployment](../DOCKER_DEPLOYMENT.md)** - Local Docker setup
- **[Architecture](../ARCHITECTURE.md)** - System architecture overview
- **[Program Deployment Safety](PROGRAM_DEPLOYMENT_SAFETY.md)** - Solana program deployment
- **[Secrets Management](../security/SECRETS_MANAGEMENT.md)** - Environment variable security

---

**Last Updated:** December 2, 2025  
**Maintained By:** EasyEscrow.ai DevOps Team  
**Review Schedule:** After each major deployment

