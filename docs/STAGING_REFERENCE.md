# STAGING Environment Reference

**Complete infrastructure reference for STAGING environment**  
**Last Updated:** January 2025  
**Environment:** STAGING  
**Network:** Solana Devnet  
**Status:** ✅ Active

---

## Table of Contents

1. [Environment Overview](#1-environment-overview)
2. [Program IDs by Environment](#2-program-ids-by-environment)
3. [Wallet Addresses and Naming Convention](#3-wallet-addresses-and-naming-convention)
4. [Infrastructure Details](#4-infrastructure-details)
5. [Deployment Information](#5-deployment-information)
6. [Backup and Recovery Procedures](#6-backup-and-recovery-procedures)
7. [Testing Procedures](#7-testing-procedures)
8. [Environment Variable Naming Convention](#8-environment-variable-naming-convention)
9. [Cross-References](#9-cross-references)

---

## 1. Environment Overview

### Purpose

STAGING is a **production-like testing environment** on Solana devnet that serves as a **release candidate (RC) gate** before deploying to mainnet production.

### Key Characteristics

| Aspect | Details |
|--------|---------|
| **Purpose** | Production-like testing and validation |
| **Network** | Solana Devnet |
| **Deployment** | CI/CD only (no manual deployments) |
| **Infrastructure** | Mirrors production topology |
| **Testing** | Full E2E, integration, and smoke tests |
| **Isolation** | Completely separate from DEV environment |

### Differences from DEV and PROD

| Feature | DEV (Development) | STAGING (Pre-Production) | PROD (Production) |
|---------|------------------|-------------------------|-------------------|
| **Purpose** | Active development | Production-like testing | Live production |
| **Network** | Devnet | Devnet | Mainnet |
| **RPC** | Public (api.devnet.solana.com) | Private Helius | Private Helius |
| **Database** | Local/shared | Managed PostgreSQL | Managed PostgreSQL |
| **Redis** | Local/shared | Redis Cloud | Redis Cloud |
| **Program ID** | `4FQ5...Twhd` | `AvdX...9Zei` | `<TBD>` |
| **Wallets** | `DEVNET_*` prefix | `DEVNET_STAGING_*` prefix | `MAINNET_*` prefix |
| **Deployment** | Manual/frequent | CI/CD only | CI/CD with approvals |
| **Stability** | Rapid iteration | Stable, RC candidates | Production-grade |
| **Testing** | Unit/integration | Full E2E + smoke tests | Monitoring + canary |

### Usage Guidelines

✅ **Use STAGING for:**
- Pre-production validation
- E2E testing with production-like infrastructure
- Release candidate (RC) testing
- Performance benchmarking
- Security testing
- Integration testing with external services

❌ **Don't use STAGING for:**
- Active development (use DEV)
- Experimental features (use DEV or feature branches)
- Manual deployments (use CI/CD only)
- Production data (use test data only)

### Promotion Path

```
Local Development (localhost)
    ↓
DEV Environment (devnet, rapid iteration)
    ↓
STAGING Environment (devnet, production-like) ← We are here
    ↓
PROD Environment (mainnet, live production)
```

---

## 2. Program IDs by Environment

### Active Program IDs

| Environment | Network | Program ID | Status | Deployed | Keypair Location | Backup Location |
|-------------|---------|------------|--------|----------|------------------|-----------------|
| **DEV** | Devnet | `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd` | ✅ Active | 2025-01-15 | `target/deploy/escrow-keypair.json` | N/A |
| **STAGING** | Devnet | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | ✅ Active | 2025-01-20 | `target/deploy/escrow-keypair-staging.json` | `temp/staging-backups/escrow-keypair-staging.json` |
| **PROD** | Mainnet | `<TBD>` | ⏸️ Not deployed | TBD | TBD | TBD |

### Explorer Links

**DEV Environment:**
- Program: https://explorer.solana.com/address/4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd?cluster=devnet
- Network: Devnet
- Upgrade Authority: Dev team keypair

**STAGING Environment:**
- Program: https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet
- Network: Devnet
- Upgrade Authority: Staging deployer keypair

**PROD Environment:**
- Program: TBD (not yet deployed)
- Network: Mainnet
- Upgrade Authority: 3-of-5 multisig (planned)

### Environment Variable Names

Use these exact environment variable names in your `.env` files:

```bash
# DEV Environment
DEVNET_PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd

# STAGING Environment
DEVNET_STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# PROD Environment (future)
MAINNET_PROGRAM_ID=<tbd>
```

### Anchor Configuration Files

Each environment has its own Anchor config:

```toml
# Anchor.dev.toml
[programs.devnet]
escrow = "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"

# Anchor.staging.toml
[programs.devnet]
escrow = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"

# Anchor.prod.toml (future)
[programs.mainnet]
escrow = "<tbd>"
```

---

## 3. Wallet Addresses and Naming Convention

### STAGING Wallet Addresses

All STAGING wallets use the **`DEVNET_STAGING_*`** prefix to avoid conflicts with DEV environment wallets.

| Role | Address | Keypair Location | Backup Location | Env Var Name |
|------|---------|------------------|-----------------|--------------|
| **Sender** | `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z` | `wallets/staging/staging-sender.json` | `temp/staging-backups/staging-sender.json` | `DEVNET_STAGING_SENDER_PRIVATE_KEY` |
| **Receiver** | `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4` | `wallets/staging/staging-receiver.json` | `temp/staging-backups/staging-receiver.json` | `DEVNET_STAGING_RECEIVER_PRIVATE_KEY` |
| **Admin** | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` | `wallets/staging/staging-admin.json` | `temp/staging-backups/staging-admin.json` | `DEVNET_STAGING_ADMIN_PRIVATE_KEY` |
| **Fee Collector** | `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ` | `wallets/staging/staging-fee-collector.json` | `temp/staging-backups/staging-fee-collector.json` | `DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY` |

### Explorer Links (Devnet)

- **Sender**: https://explorer.solana.com/address/AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z?cluster=devnet
- **Receiver**: https://explorer.solana.com/address/5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4?cluster=devnet
- **Admin**: https://explorer.solana.com/address/498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R?cluster=devnet
- **Fee Collector**: https://explorer.solana.com/address/8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ?cluster=devnet

### Wallet Roles and Usage

#### Sender Wallet
- **Purpose**: Owns NFTs in test scenarios
- **Usage**: Seller side of escrow transactions
- **Required Balance**: ~5 SOL for transaction fees
- **Test Asset**: NFTs minted to this wallet

#### Receiver Wallet
- **Purpose**: Holds USDC for test payments
- **Usage**: Buyer side of escrow transactions
- **Required Balance**: ~5 SOL + test USDC
- **Test Asset**: Official USDC devnet mint

#### Admin Wallet
- **Purpose**: Administrative operations
- **Usage**: Admin cancellations, system operations
- **Required Balance**: ~3 SOL for admin transactions

#### Fee Collector Wallet
- **Purpose**: Receives platform fees
- **Usage**: Platform fee accumulation
- **Required Balance**: ~3 SOL (receives fees)

### Naming Convention Rationale

**Why `DEVNET_STAGING_*` prefix?**

✅ **Benefits:**
- Prevents conflicts when running multiple environments locally
- Clear distinction in codebase and logs
- Supports simultaneous DEV and STAGING configurations
- Easier debugging and environment identification
- Prevents accidental use of wrong environment credentials

❌ **Without proper naming:**
- Variable collision (`DEVNET_SENDER_PRIVATE_KEY` used by both DEV and STAGING)
- Accidental use of wrong environment
- Deployment configuration errors
- Difficult to identify which environment a wallet belongs to

### Comparison with DEV Naming

| Resource | DEV Environment | STAGING Environment |
|----------|----------------|---------------------|
| **Sender Key** | `DEVNET_SENDER_PRIVATE_KEY` | `DEVNET_STAGING_SENDER_PRIVATE_KEY` |
| **Receiver Key** | `DEVNET_RECEIVER_PRIVATE_KEY` | `DEVNET_STAGING_RECEIVER_PRIVATE_KEY` |
| **Admin Key** | `DEVNET_ADMIN_PRIVATE_KEY` | `DEVNET_STAGING_ADMIN_PRIVATE_KEY` |
| **Fee Collector** | `DEVNET_FEE_COLLECTOR_PRIVATE_KEY` | `DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY` |
| **Program ID** | `DEVNET_PROGRAM_ID` | `DEVNET_STAGING_PROGRAM_ID` |
| **USDC Mint** | `DEVNET_USDC_MINT_ADDRESS` | `DEVNET_STAGING_USDC_MINT_ADDRESS` |

### Private Key Format

**STAGING uses Base58 format for private keys** (consistent with DEV environment).

**Format:** Base58 encoded string (88 characters)  
**Example:** `21YtDf3GptHmEL414KRMjJs9yV6R7A61tjvWc6ZXi8yod...`

**Why Base58?**
- ✅ Consistent with DEV environment
- ✅ Standard Solana format (used by CLI tools)
- ✅ More compact and readable than byte arrays
- ✅ Built-in error detection
- ✅ Compatible with all Solana SDKs

### Token Configuration

**USDC Mint Address (Official Circle Devnet):**
```bash
DEVNET_STAGING_USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
```

**Note:** STAGING uses the **official Circle USDC devnet mint** to ensure production parity. Do NOT use test mints.

---

## 4. Infrastructure Details

### API Endpoint

| Component | Value |
|-----------|-------|
| **API URL** | `https://staging-api.easyescrow.ai` |
| **Health Check** | `https://staging-api.easyescrow.ai/health` |
| **API Docs (Swagger)** | `https://staging-api.easyescrow.ai/api-docs` |
| **Platform** | DigitalOcean App Platform |

### Database

| Component | Value |
|-----------|-------|
| **Provider** | DigitalOcean Managed PostgreSQL |
| **Database Name** | `easyescrow_staging` |
| **User** | `staging_user` |
| **Connection Port** | `25060` (direct), `25061` (pooler) |
| **SSL Mode** | `require` |
| **Pool Size** | 10-15 connections |
| **Backup Retention** | 7 days (daily backups) |

**Connection Strings:**
```bash
# Direct connection (migrations, admin tasks)
DATABASE_URL=postgresql://staging_user:PASSWORD@host.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require

# Pooled connection (application runtime, recommended)
DATABASE_POOL_URL=postgresql://staging_user:PASSWORD@pooler-host.db.ondigitalocean.com:25061/easyescrow_staging?sslmode=require
```

### Redis

| Component | Value |
|-----------|-------|
| **Provider** | Redis Cloud (redis.io) |
| **Region** | AP Southeast 1 (Singapore) |
| **Host** | `redis-19320.c1.ap-southeast-1-1.ec2.redns.redis-cloud.com` |
| **Port** | `19320` |
| **TLS** | ✅ Enabled |
| **Use Cases** | Bull queues, caching, idempotency, rate limiting |

**Connection String:**
```bash
REDIS_URL=redis://default:PASSWORD@redis-19320.c1.ap-southeast-1-1.ec2.redns.redis-cloud.com:19320
```

**Why Redis Cloud?**
- ✅ Full Redis compatibility (supports all Bull queue Lua scripts)
- ✅ No limitations on dynamic key generation
- ✅ Production-grade infrastructure
- ✅ TLS encryption out of the box

### RPC Endpoint

| Component | Value |
|-----------|-------|
| **Primary RPC** | Helius (private, production-like) |
| **URL** | `https://devnet.helius-rpc.com/?api-key=<key>` |
| **Fallback RPC** | `https://api.devnet.solana.com` |
| **Network** | Solana Devnet |
| **Timeout** | 30000ms |
| **Retries** | 3 attempts |

**Why Private RPC for STAGING?**
- ✅ Production-like reliability
- ✅ No rate limiting issues
- ✅ Faster response times
- ✅ Better uptime than public RPC

### Environment Configuration

**Environment file:** `.env.staging`

**Key settings:**
```bash
NODE_ENV=staging
SOLANA_NETWORK=devnet
PORT=8080
LOG_LEVEL=debug
```

---

## 5. Deployment Information

### Deployment Methods

**⚠️ IMPORTANT:** STAGING deployments are **CI/CD ONLY**. Manual deployments are forbidden.

#### CI/CD Pipeline (Recommended)

**Trigger Methods:**
1. **Push to `staging` branch** (automatic)
2. **Manual workflow dispatch** (via GitHub Actions)

**Pipeline Stages:**

```
1. Build Phase
   ├─ Pin toolchains (Solana 1.18.x, Rust 1.75.0)
   ├─ anchor build
   ├─ Generate checksums
   ├─ Run unit tests
   └─ Store artifacts

2. Manual Approval Gate

3. Deploy Phase
   ├─ Download artifacts
   ├─ Verify checksums
   ├─ Deploy program to devnet
   ├─ Update IDL
   ├─ Deploy backend to DO App Platform
   ├─ Run smoke tests
   └─ Run E2E tests
```

### Build Commands

```bash
# Pin toolchains
solana-install init 1.18.x
rustup install 1.75.0

# Build program ONCE (same artifact promoted to all envs)
anchor build

# Generate checksums
shasum -a 256 target/deploy/escrow.so > target/deploy/escrow.so.sha256
shasum -a 256 target/idl/escrow.json > target/idl/escrow.json.sha256
```

### Deployment Commands

```bash
# Deploy to STAGING
anchor deploy \
  -C Anchor.staging.toml \
  --provider.cluster devnet \
  --provider.wallet $STAGING_DEPLOYER_KEYPAIR

# Update IDL
anchor idl upgrade $STAGING_PROGRAM_ID \
  target/idl/escrow.json \
  -C Anchor.staging.toml

# Deploy backend
doctl apps create-deployment $STAGING_APP_ID --wait
```

### Post-Deployment Verification

```bash
# 1. Health check
curl https://staging-api.easyescrow.ai/health

# 2. Run smoke tests
npm run test:staging:smoke

# 3. Run E2E tests
npm run test:staging:e2e

# 4. Verify database migrations
npm run staging:migrate:status

# 5. Check logs
doctl apps logs $STAGING_APP_ID --type run --follow
```

### Rollback Procedures

**Automated Rollback (Recommended):**
```bash
gh workflow run "Rollback STAGING" \
  --field target_deployment_id=<previous-deployment-id>
```

**Manual Rollback via DigitalOcean:**
1. Navigate to: **App Platform → easyescrow-staging → Deployments**
2. Find last successful deployment
3. Click: **Rollback to this deployment**
4. Confirm rollback

**Manual Rollback via Git:**
```bash
# Find last working commit
git log --oneline

# Checkout that commit
git checkout <commit-hash>

# Create rollback branch
git checkout -b rollback-staging-$(date +%Y%m%d)

# Force push to staging
git push origin rollback-staging-$(date +%Y%m%d):staging --force
```

### Access Credentials

**Credentials are stored in:**
- **DigitalOcean App Platform**: Encrypted environment variables
- **`.env.staging`**: Local development (gitignored)
- **GitHub Secrets**: CI/CD pipeline

**Required Secrets:**
- `DEVNET_STAGING_SENDER_PRIVATE_KEY`
- `DEVNET_STAGING_RECEIVER_PRIVATE_KEY`
- `DEVNET_STAGING_ADMIN_PRIVATE_KEY`
- `DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY`
- `DATABASE_URL`
- `DATABASE_POOL_URL`
- `REDIS_URL`
- `SOLANA_RPC_URL` (includes Helius API key)
- `JWT_SECRET`
- `WEBHOOK_SECRET`

---

## 6. Backup and Recovery Procedures

### Wallet Backups

**Backup Locations:**
- **Primary**: `wallets/staging/*.json` (gitignored)
- **Backup**: `temp/staging-backups/*.json` (gitignored)

**Backed Up Files:**
- `staging-sender.json` → `temp/staging-backups/staging-sender.json`
- `staging-receiver.json` → `temp/staging-backups/staging-receiver.json`
- `staging-admin.json` → `temp/staging-backups/staging-admin.json`
- `staging-fee-collector.json` → `temp/staging-backups/staging-fee-collector.json`

**Creating Additional Backups:**
```powershell
# Backup to secure external location
Copy-Item wallets/staging/*.json <secure-backup-location>/
```

### Program Keypair Backup

**Program Keypair:**
- **Primary Location**: `target/deploy/escrow-keypair-staging.json`
- **Backup Location**: `temp/staging-backups/escrow-keypair-staging.json`
- **Program ID**: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`

**Verify Program ID:**
```bash
solana address -k target/deploy/escrow-keypair-staging.json
# Should output: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
```

### Recovery Procedures

#### Recovering Lost Wallet Keypair

```powershell
# 1. Restore from backup
Copy-Item temp/staging-backups/staging-sender.json wallets/staging/

# 2. Verify address matches
solana address -k wallets/staging/staging-sender.json
# Should output: AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z

# 3. Extract Base58 private key
npx ts-node scripts/utilities/extract-base58-keys.ts

# 4. Update environment variables
# Update DEVNET_STAGING_SENDER_PRIVATE_KEY in .env.staging

# 5. Verify wallet balance
solana balance AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z --url devnet
```

#### Recovering Lost Program Keypair

```bash
# 1. Restore from backup
cp temp/staging-backups/escrow-keypair-staging.json target/deploy/

# 2. Verify program ID
solana address -k target/deploy/escrow-keypair-staging.json
# Should output: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# 3. Verify program is deployed
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet

# 4. Verify upgrade authority
# Check that you have authority to upgrade the program
```

### When to Restore from Backups

**Restore wallets when:**
- Local keypair files are accidentally deleted
- Moving development to a new machine
- Team member needs access to STAGING wallets
- Security incident requires key rotation (generate NEW keys, don't restore)

**Restore program keypair when:**
- Program keypair is accidentally deleted
- Need to upgrade program from new machine
- CI/CD needs program keypair access

**⚠️ SECURITY NOTES:**
- **NEVER** commit backups to git
- Store backups in encrypted, secure locations
- Rotate keys if exposed or compromised
- Use hardware wallets for production upgrade authority

### Database Backups

**Automatic Backups:**
- **Frequency**: Daily
- **Retention**: 7 days
- **Location**: DigitalOcean Managed Databases (automatic)

**Manual Backup:**
```bash
# Export database
pg_dump "postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require" > staging-backup-$(date +%Y%m%d).sql

# Compress backup
gzip staging-backup-$(date +%Y%m%d).sql
```

**Restoring from Backup:**
```bash
# Restore from SQL dump
psql "postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require" < backup.sql
```

**Point-in-Time Recovery:**
- Available for last 2 days via DigitalOcean dashboard
- Navigate to: **Databases → Your Cluster → Backups → Restore to a Point in Time**

---

## 7. Testing Procedures

### E2E Test Execution

**Run full E2E test suite:**
```bash
# Set staging environment
export NODE_ENV=staging

# Run E2E tests
npm run test:staging:e2e

# Or with explicit configuration
npx ts-node tests/e2e/staging-e2e-test.ts
```

**Expected test coverage:**
- ✅ Full escrow lifecycle (create, deposit, complete)
- ✅ NFT transfer flow
- ✅ USDC payment flow
- ✅ Admin operations (cancel, emergency)
- ✅ Fee collection
- ✅ Webhook delivery
- ✅ Idempotency checks
- ✅ Error handling

### Smoke Tests

**Run quick smoke tests:**
```bash
npm run test:staging:smoke
```

**Smoke test checklist:**
- ✅ API health endpoint responding
- ✅ Database connectivity
- ✅ Redis connectivity
- ✅ Solana RPC connectivity
- ✅ Program account accessible
- ✅ Wallet balances sufficient
- ✅ Basic CRUD operations work

### Wallet Funding Procedures

**Fund wallets via devnet faucet:**
```powershell
# Run automated funding script
.\scripts\deployment\fund-staging-wallets.ps1
```

**Manual funding:**
```bash
# Fund individual wallet
solana airdrop 5 <wallet-address> --url devnet

# Check balance
solana balance <wallet-address> --url devnet
```

**Alternative funding methods:**
- Web Faucet: https://faucet.solana.com/
- QuickNode Faucet: https://faucet.quicknode.com/solana/devnet
- Solana Discord: #devnet-faucet channel

**Required balances:**
- Sender: ~5 SOL
- Receiver: ~5 SOL + test USDC
- Admin: ~3 SOL
- Fee Collector: ~3 SOL

### Getting Test USDC

**Option 1: SPL Token Faucet**
```
https://spl-token-faucet.com/?token-name=USDC-Dev
```

**Option 2: Create Token Account**
```bash
# Create USDC token account for Receiver
spl-token create-account Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr \
  --owner wallets/staging/staging-receiver.json \
  --url devnet
```

### Expected Test Results

**Successful E2E test output:**
```
✅ STAGING E2E Tests - PASSED

Test Results:
  ✓ Health check (150ms)
  ✓ Create escrow agreement (1200ms)
  ✓ Deposit NFT to escrow (2500ms)
  ✓ Deposit USDC to escrow (2300ms)
  ✓ Complete escrow settlement (3000ms)
  ✓ Verify NFT transferred (800ms)
  ✓ Verify USDC transferred (800ms)
  ✓ Verify fees collected (500ms)
  ✓ Verify webhook delivered (400ms)

Total: 9 tests, 9 passed, 0 failed
Time: 11.65s
```

### Validation Steps

**Pre-deployment validation:**
1. ✅ All unit tests pass
2. ✅ TypeScript compiles without errors
3. ✅ Linting passes
4. ✅ Build artifacts generated
5. ✅ Checksums verified

**Post-deployment validation:**
1. ✅ Health check endpoint returns 200
2. ✅ Smoke tests pass
3. ✅ E2E tests pass
4. ✅ Database migrations applied
5. ✅ All services connected (DB, Redis, RPC)
6. ✅ Logs show no critical errors
7. ✅ Monitoring dashboards show normal metrics

---

## 8. Environment Variable Naming Convention

### The DEVNET_STAGING_* Convention

STAGING uses a **specific naming convention** (`DEVNET_STAGING_*`) to differentiate from DEV environment (`DEVNET_*`) and prevent configuration conflicts.

### Naming Pattern

```bash
# ✅ CORRECT - STAGING Environment
DEVNET_STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
DEVNET_STAGING_SENDER_PRIVATE_KEY=21YtDf3...
DEVNET_STAGING_RECEIVER_PRIVATE_KEY=2b6UD1V...
DEVNET_STAGING_ADMIN_PRIVATE_KEY=4JMoiWV...
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=3m2viLK...
DEVNET_STAGING_USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr

# ❌ WRONG - Conflicts with DEV
DEVNET_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
DEVNET_SENDER_PRIVATE_KEY=21YtDf3...
```

### Why This Convention?

✅ **Benefits:**
- **Prevents conflicts** when running multiple environments locally
- **Clear distinction** in codebase and logs
- **Simultaneous configs** - can have both DEV and STAGING env files
- **Easier debugging** - immediately identify which environment
- **Prevents mistakes** - explicit naming reduces accidental use of wrong env

❌ **Without proper naming:**
- Variable collision (same name used by both DEV and STAGING)
- Accidental use of wrong environment
- Deployment configuration errors
- Difficult to identify which environment a credential belongs to

### Comparison with DEV Naming

| Resource | DEV Environment | STAGING Environment |
|----------|----------------|---------------------|
| **Program ID** | `DEVNET_PROGRAM_ID` | `DEVNET_STAGING_PROGRAM_ID` |
| **Sender Key** | `DEVNET_SENDER_PRIVATE_KEY` | `DEVNET_STAGING_SENDER_PRIVATE_KEY` |
| **Receiver Key** | `DEVNET_RECEIVER_PRIVATE_KEY` | `DEVNET_STAGING_RECEIVER_PRIVATE_KEY` |
| **Admin Key** | `DEVNET_ADMIN_PRIVATE_KEY` | `DEVNET_STAGING_ADMIN_PRIVATE_KEY` |
| **Fee Collector** | `DEVNET_FEE_COLLECTOR_PRIVATE_KEY` | `DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY` |
| **USDC Mint** | `DEVNET_USDC_MINT_ADDRESS` | `DEVNET_STAGING_USDC_MINT_ADDRESS` |
| **RPC URL** | `SOLANA_RPC_URL` (public) | `SOLANA_RPC_URL` (private Helius) |

### How to Avoid Mixing Environments

**In Code:**
```typescript
// ✅ CORRECT - Environment-aware config
const programId = process.env.NODE_ENV === 'staging'
  ? process.env.DEVNET_STAGING_PROGRAM_ID
  : process.env.DEVNET_PROGRAM_ID;

// ❌ WRONG - Hard-coded or wrong variable
const programId = process.env.DEVNET_PROGRAM_ID; // Might be DEV when you want STAGING
```

**In Scripts:**
```bash
# ✅ CORRECT - Explicit environment
export NODE_ENV=staging
npm run deploy:staging

# ❌ WRONG - Ambiguous
npm run deploy
```

**In Configuration Files:**
```bash
# .env.staging (STAGING configuration)
NODE_ENV=staging
DEVNET_STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# .env.dev (DEV configuration)
NODE_ENV=development
DEVNET_PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd
```

### Complete Variable List

See [STAGING Environment Variables Reference](docs/environments/STAGING_ENV_VARS.md) for complete list of all environment variables with descriptions, security classifications, and setup instructions.

---

## 9. Cross-References

### Related Documentation

#### STAGING Strategy & Architecture
- [STAGING Strategy](docs/architecture/STAGING_STRATEGY.md) - Complete STAGING architecture and strategy
- [Build-Once-Promote Pattern](docs/architecture/STAGING_STRATEGY.md#4-build-once-promote-pattern)
- [CI/CD Requirements](docs/architecture/STAGING_STRATEGY.md#5-cicd-requirements)
- [Environment Separation Strategy](docs/architecture/STAGING_STRATEGY.md#3-environment-separation-strategy)

#### Deployment Guides
- [STAGING Deployment Guide](docs/deployment/STAGING_DEPLOYMENT_GUIDE.md) - Complete deployment procedures
- [STAGING CI/CD Pipeline](docs/deployment/STAGING_CI_CD_PIPELINE.md) - Automated deployment setup
- [STAGING Domain Setup](docs/deployment/STAGING_DOMAIN_SETUP.md) - Domain and DNS configuration
- [STAGING Secrets Management](docs/deployment/STAGING_SECRETS_MANAGEMENT.md) - Managing secrets securely

#### Infrastructure Setup
- [STAGING Database Setup](docs/infrastructure/STAGING_DATABASE_SETUP.md) - PostgreSQL configuration
- [STAGING Redis Setup](docs/infrastructure/STAGING_REDIS_SETUP.md) - Redis Cloud configuration
- [STAGING RPC Setup](docs/infrastructure/STAGING_RPC_SETUP.md) - Helius RPC setup

#### Configuration & Environment
- [STAGING Environment Variables](docs/environments/STAGING_ENV_VARS.md) - Complete env var reference
- [STAGING Env Template](docs/setup/STAGING_ENV_TEMPLATE.md) - Template for .env.staging
- [Program IDs Registry](docs/PROGRAM_IDS.md) - All program IDs across environments
- [STAGING Wallets](docs/STAGING_WALLETS.md) - Wallet management and funding

#### Testing & Validation
- [E2E Testing Guide](docs/testing/E2E_TESTING.md) - E2E test procedures
- [STAGING E2E Results](docs/testing/STAGING_E2E_RESULTS.md) - Test results and validation

#### Security & Compliance
- [STAGING Wallet Protection](docs/STAGING_WALLET_PROTECTION.md) - Wallet security practices
- [Secrets Management](docs/SECRETS_MANAGEMENT.md) - General secrets management
- [Security Incident Response](docs/SECURITY_INCIDENT_CREDENTIAL_EXPOSURE.md) - Incident procedures

#### Token Configuration
- [STAGING Token Addresses](docs/STAGING_TOKEN_ADDRESSES.md) - USDC and NFT configuration

#### Troubleshooting
- [Deployment Troubleshooting](docs/deployment/STAGING_DEPLOYMENT_GUIDE.md#troubleshooting)
- [Database Troubleshooting](docs/infrastructure/STAGING_DATABASE_SETUP.md#troubleshooting)
- [Redis Troubleshooting](docs/infrastructure/STAGING_REDIS_SETUP.md#troubleshooting)

### Task References

This reference document was created as part of:
- **Task 74**: Document STAGING Program IDs and Infrastructure

Dependencies:
- **Task 64**: Generate STAGING program keypair
- **Task 65**: Generate STAGING wallets
- **Task 66**: Deploy program to STAGING
- **Task 67**: Setup STAGING database
- **Task 68**: Setup STAGING Redis
- **Task 69**: Configure STAGING environment variables
- **Task 70**: Setup STAGING RPC endpoint
- **Task 73**: Create STAGING deployment automation

### Quick Links

**DigitalOcean Resources:**
- [App Platform Console](https://cloud.digitalocean.com/apps)
- [Database Dashboard](https://cloud.digitalocean.com/databases)
- [Spaces Dashboard](https://cloud.digitalocean.com/spaces)

**External Services:**
- [Helius Dashboard](https://dashboard.helius.dev/)
- [Redis Cloud Console](https://app.redislabs.com/)
- [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)

**API Endpoints:**
- Health: https://staging-api.easyescrow.ai/health
- API Docs: https://staging-api.easyescrow.ai/api-docs

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-01-20 | Initial STAGING reference document | AI Agent (Task 74) |

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team  
**Questions or Updates?** Contact the DevOps team or update this document via PR.

