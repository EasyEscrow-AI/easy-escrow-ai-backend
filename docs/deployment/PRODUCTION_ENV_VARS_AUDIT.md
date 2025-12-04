# Production Environment Variables Audit

**Created:** December 3, 2025  
**Task:** 31.2 - Audit and Update Environment Variables for Production  
**Status:** ✅ Complete Audit | ⏳ Pending Configuration

---

## 🎯 Purpose

Compare staging and production environment variables to ensure ALL required atomic swap functionality is supported in production. Identify missing variables, validate secrets management, and create configuration checklist.

---

## ✅ Currently Configured in Production YAML

### Core Environment (8 variables)
| Variable | Value | Scope | Type | Notes |
|----------|-------|-------|------|-------|
| `NODE_ENV` | `production` | RUN_AND_BUILD_TIME | Plain | ✅ Correct |
| `SOLANA_NETWORK` | `mainnet-beta` | RUN_AND_BUILD_TIME | Plain | ✅ Correct |
| `PORT` | `8080` | RUN_AND_BUILD_TIME | Plain | ✅ Correct |
| `HOST` | `0.0.0.0` | RUN_AND_BUILD_TIME | Plain | ✅ Correct |
| `LOG_LEVEL` | `info` | RUN_AND_BUILD_TIME | Plain | ✅ Correct |
| `LOG_FORMAT` | `json` | RUN_TIME | Plain | ✅ Correct |
| `LOG_MAX_SIZE` | `20m` | RUN_TIME | Plain | ✅ Correct |
| `LOG_MAX_FILES` | `14` | RUN_TIME | Plain | ✅ Correct |

### Solana RPC (6 variables)
| Variable | Value/Type | Scope | Notes |
|----------|------------|-------|-------|
| `SOLANA_RPC_URL` | SECRET | RUN_TIME | ✅ Must set in console |
| `SOLANA_RPC_URL_FALLBACK` | `https://api.mainnet-beta.solana.com` | RUN_TIME | ✅ Correct |
| `SOLANA_RPC_TIMEOUT` | `30000` | RUN_TIME | ✅ Correct |
| `SOLANA_RPC_RETRIES` | `3` | RUN_TIME | ✅ Correct |
| `SOLANA_RPC_HEALTH_CHECK_INTERVAL` | `30000` | RUN_TIME | ✅ Correct |

### Program IDs (2 variables)
| Variable | Value | Scope | Notes |
|----------|-------|-------|-------|
| `MAINNET_PROD_PROGRAM_ID` | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | RUN_TIME | ✅ Correct |
| `ESCROW_PROGRAM_ID` | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | RUN_TIME | ✅ Correct |

### Wallets (10 SECRET variables)
| Variable | Type | Scope | Purpose |
|----------|------|-------|---------|
| `MAINNET_PROD_ADMIN_PRIVATE_KEY` | SECRET | RUN_TIME | ✅ Platform admin |
| `MAINNET_PROD_ADMIN_ADDRESS` | SECRET | RUN_TIME | ✅ Platform admin |
| `MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY` | SECRET | RUN_TIME | ✅ Fee collector |
| `MAINNET_PROD_FEE_COLLECTOR_ADDRESS` | SECRET | RUN_TIME | ✅ Fee collector |
| `MAINNET_PROD_SENDER_PRIVATE_KEY` | SECRET | RUN_TIME | ✅ Test wallet |
| `MAINNET_PROD_SENDER_ADDRESS` | SECRET | RUN_TIME | ✅ Test wallet |
| `MAINNET_PROD_RECEIVER_PRIVATE_KEY` | SECRET | RUN_TIME | ✅ Test wallet |
| `MAINNET_PROD_RECEIVER_ADDRESS` | SECRET | RUN_TIME | ✅ Test wallet |
| `MAINNET_PROD_DEPLOYER_ADDRESS` | SECRET | RUN_TIME | ✅ Deployer |
| `MAINNET_ADMIN_PRIVATE_KEY` | SECRET | RUN_TIME | ⚠️ Legacy? |

### Token Configuration (2 variables)
| Variable | Value | Scope | Notes |
|----------|-------|-------|-------|
| `MAINNET_PROD_USDC_MINT_ADDRESS` | `EPjFW...Dt1v` (Circle USDC) | RUN_TIME | ✅ Official mainnet USDC |
| `USDC_MINT_ADDRESS` | `EPjFW...Dt1v` (Circle USDC) | RUN_TIME | ✅ Official mainnet USDC |

### Database (3 SECRET variables)
| Variable | Type | Scope | Notes |
|----------|------|-------|-------|
| `DATABASE_URL` | SECRET | RUN_AND_BUILD_TIME | ✅ Direct connection for migrations |
| `DATABASE_POOL_URL` | SECRET | RUN_AND_BUILD_TIME | ✅ Pooler for runtime |
| `REDIS_URL` | SECRET | RUN_AND_BUILD_TIME | ✅ Correct scope |

### Platform Fees (1 variable)
| Variable | Value | Scope | Notes |
|----------|-------|-------|-------|
| `PLATFORM_FEE_BPS` | `100` | RUN_TIME | ✅ 1% fee (vs 2.5% staging) |

### Security (2 SECRET variables)
| Variable | Type | Scope | Purpose |
|----------|------|-------|---------|
| `JWT_SECRET` | SECRET | RUN_TIME | ✅ Authentication |
| `WEBHOOK_SECRET` | SECRET | RUN_TIME | ✅ Webhook validation |

### DigitalOcean Spaces (6 variables)
| Variable | Value/Type | Scope | Notes |
|----------|------------|-------|-------|
| `DO_SPACES_ENDPOINT` | `https://sgp1.digitaloceanspaces.com` | RUN_TIME | ✅ Correct |
| `DO_SPACES_BUCKET` | `easyescrow-production` | RUN_TIME | ✅ Correct |
| `DO_SPACES_BUCKET_NAME` | `easyescrow-production` | RUN_TIME | ✅ Correct |
| `DO_SPACES_KEY` | SECRET | RUN_TIME | ✅ Correct |
| `DO_SPACES_SECRET` | SECRET | RUN_TIME | ✅ Correct |
| `DO_SPACES_REGION` | `sgp1` | RUN_TIME | ✅ Correct |

### Monitoring (13 variables)
| Variable | Value/Type | Scope | Purpose |
|----------|------------|-------|---------|
| `MONITORING_ENDPOINT` | `https://api.easyescrow.ai/health` | RUN_TIME | ✅ Health check |
| `HEALTH_CHECK_ENABLED` | `true` | RUN_TIME | ✅ Enabled |
| `HEALTH_CHECK_PATH` | `/health` | RUN_TIME | ✅ Correct |
| `ENABLE_DEPOSIT_MONITORING` | `true` | RUN_TIME | ✅ Enabled |
| `DEPOSIT_POLL_INTERVAL_MS` | `10000` | RUN_TIME | ✅ 10 seconds |
| `TRANSACTION_CONFIRMATION_TIMEOUT` | `60000` | RUN_TIME | ✅ 60 seconds |
| `DISABLE_WS_MONITORING` | `true` | RUN_TIME | ✅ Avoid rate limits |
| `RATE_LIMIT_WINDOW_MS` | `900000` | RUN_TIME | ✅ 15 minutes |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | RUN_TIME | ✅ Restrictive |
| `SENTRY_DSN` | SECRET | RUN_TIME | ✅ Error tracking |
| `SENTRY_ENVIRONMENT` | `production` | RUN_TIME | ✅ Correct |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | RUN_TIME | ✅ 10% sampling |
| `JWT_EXPIRATION` | `24h` | RUN_TIME | ✅ Correct |

### Feature Flags (5 variables)
| Variable | Value | Scope | Notes |
|----------|-------|-------|-------|
| `ENABLE_WEBHOOKS` | `true` | RUN_TIME | ✅ Enabled |
| `ENABLE_RATE_LIMITING` | `true` | RUN_TIME | ✅ Enabled |
| `ENABLE_REQUEST_LOGGING` | `true` | RUN_TIME | ✅ Enabled |
| `ENABLE_SWAGGER` | `false` | RUN_TIME | ✅ Disabled for security |
| `SWAGGER_PATH` | `/docs` | RUN_TIME | ✅ Correct |

### CORS & Webhooks (4 variables)
| Variable | Value/Type | Scope | Notes |
|----------|------------|-------|-------|
| `CORS_ORIGIN` | `https://easyescrow.ai,https://www.easyescrow.ai` | RUN_TIME | ✅ Production domains |
| `WEBHOOK_MAX_RETRIES` | `5` | RUN_TIME | ✅ Correct |
| `WEBHOOK_RETRY_DELAY` | `5000` | RUN_TIME | ✅ 5 seconds |

### SMTP (5 variables)
| Variable | Value/Type | Scope | Notes |
|----------|------------|-------|-------|
| `SMTP_HOST` | SECRET | RUN_TIME | ✅ Must set |
| `SMTP_PORT` | `587` | RUN_TIME | ✅ Standard TLS |
| `SMTP_USER` | SECRET | RUN_TIME | ✅ Must set |
| `SMTP_PASS` | SECRET | RUN_TIME | ✅ Must set |
| `SMTP_FROM` | `noreply@easyescrow.ai` | RUN_TIME | ✅ Production email |

### Notification Webhooks (2 SECRET variables)
| Variable | Type | Scope | Purpose |
|----------|------|-------|---------|
| `SLACK_WEBHOOK` | SECRET | BUILD_TIME | ⚠️ Optional |
| `DISCORD_WEBHOOK` | SECRET | BUILD_TIME | ⚠️ Optional |

---

## ❌ MISSING in Production (Required for Atomic Swaps)

### CRITICAL: Atomic Swap Configuration (Missing 15+ variables)

#### 1. Treasury Authority (CRITICAL)
| Variable | Staging | Production | Action Required |
|----------|---------|------------|-----------------|
| `TREASURY_AUTHORITY_PRIVATE_KEY` | ❌ Not in YAML | ❌ Missing | 🔴 **MUST ADD** |
| `TREASURY_AUTHORITY_ADDRESS` | ❌ Not in YAML | ❌ Missing | 🔴 **MUST ADD** |

**Action:** Add to production YAML:
```yaml
- key: MAINNET_PROD_TREASURY_AUTHORITY_PRIVATE_KEY
  type: SECRET
  scope: RUN_TIME

- key: MAINNET_PROD_TREASURY_AUTHORITY_ADDRESS
  type: SECRET
  scope: RUN_TIME
```

#### 2. Treasury PDA Address (CRITICAL)
| Variable | Staging | Production | Action Required |
|----------|---------|------------|-----------------|
| `TREASURY_PDA_ADDRESS` | ❌ Not in YAML | ❌ Missing | 🔴 **MUST ADD** |

**Action:** Add after Treasury is initialized on mainnet:
```yaml
- key: MAINNET_PROD_TREASURY_PDA_ADDRESS
  value: <derived-pda-address>
  scope: RUN_TIME
```

#### 3. Authorized Apps for Zero-Fee Swaps (CRITICAL)
| Variable | Staging | Production | Action Required |
|----------|---------|------------|-----------------|
| `STAGING_AUTHORIZED_ZERO_FEE_APPS` | ❌ Not in YAML | ❌ Missing | 🔴 **MUST ADD** |

**Action:** Add to production YAML (comma-separated list):
```yaml
- key: MAINNET_PROD_AUTHORIZED_ZERO_FEE_APPS
  value: <app-pubkey-1>,<app-pubkey-2>
  scope: RUN_TIME
```

#### 4. Solana Commitment Level (Minor)
| Variable | Staging | Production | Action Required |
|----------|---------|------------|-----------------|
| `SOLANA_COMMITMENT` | `finalized` | ❌ Missing | 🟡 **SHOULD ADD** |

**Action:** Add to production YAML:
```yaml
- key: SOLANA_COMMITMENT
  value: finalized
  scope: RUN_AND_BUILD_TIME
```

#### 5. Monitoring & Feature Flags (Minor)
| Variable | Staging | Production | Action Required |
|----------|---------|------------|-----------------|
| `MONITORING_ENABLED` | `true` | ❌ Missing | 🟡 **SHOULD ADD** |
| `WEBHOOK_ENABLED` | `true` | ✅ Covered by `ENABLE_WEBHOOKS` | ℹ️ OK |
| `CORS_ENABLED` | `true` | ❌ Missing | 🟡 **SHOULD ADD** |
| `HELMET_ENABLED` | `true` | ❌ Missing | 🟡 **SHOULD ADD** |

#### 6. Database Pool Configuration (Important)
| Variable | Staging | Production | Action Required |
|----------|---------|------------|-----------------|
| `DATABASE_URL_POOL` | ✅ Pooler | ✅ `DATABASE_POOL_URL` | ⚠️ **NAME MISMATCH** |

**Action:** Production uses `DATABASE_POOL_URL` instead of `DATABASE_URL_POOL`. Backend code expects `DATABASE_URL_POOL`. Either:
1. Rename in YAML to `DATABASE_URL_POOL`, OR
2. Update backend code to use `DATABASE_POOL_URL`

#### 7. Metrics & Health Check Intervals (Optional)
| Variable | Staging | Production | Action Required |
|----------|---------|------------|-----------------|
| `HEALTH_CHECK_INTERVAL_MS` | `120000` | ❌ Missing | 🟡 **OPTIONAL** |
| `METRICS_INTERVAL_MS` | `300000` | ❌ Missing | 🟡 **OPTIONAL** |

---

## 📋 Required Actions for Production

### Phase 1: Add Critical Atomic Swap Variables (BLOCKING)

**Must complete before any atomic swap functionality works:**

```yaml
# Add to .do/app-production.yaml under services[0].envs:

#
# Treasury Configuration (CRITICAL)
#
- key: MAINNET_PROD_TREASURY_AUTHORITY_PRIVATE_KEY
  type: SECRET
  scope: RUN_TIME

- key: MAINNET_PROD_TREASURY_AUTHORITY_ADDRESS
  type: SECRET
  scope: RUN_TIME

- key: MAINNET_PROD_TREASURY_PDA_ADDRESS
  value: <will-be-set-after-treasury-initialization>
  scope: RUN_TIME

#
# Zero-Fee Authorization (CRITICAL)
#
- key: MAINNET_PROD_AUTHORIZED_ZERO_FEE_APPS
  value: ""  # Empty for now, populate after auditing authorized apps
  scope: RUN_TIME

#
# Solana Configuration
#
- key: SOLANA_COMMITMENT
  value: finalized
  scope: RUN_AND_BUILD_TIME

#
# Feature Flags
#
- key: MONITORING_ENABLED
  value: "true"
  scope: RUN_TIME

- key: CORS_ENABLED
  value: "true"
  scope: RUN_TIME

- key: HELMET_ENABLED
  value: "true"
  scope: RUN_TIME
```

### Phase 2: Fix Database Pool Variable Name (BLOCKING)

**Option A: Rename in Production YAML (Recommended)**
```yaml
# Change from:
- key: DATABASE_POOL_URL
  type: SECRET
  scope: RUN_AND_BUILD_TIME

# To:
- key: DATABASE_URL_POOL
  type: SECRET
  scope: RUN_AND_BUILD_TIME
```

**Option B: Update Backend Code**
Search and replace `DATABASE_URL_POOL` with `DATABASE_POOL_URL` in backend codebase.

**Recommendation:** Use Option A (rename in YAML) for consistency with staging.

### Phase 3: Set All Secrets in DigitalOcean Console (BLOCKING)

**Navigate to:** DigitalOcean Console → App → Settings → Environment Variables

**Secrets to Set:**

1. **Database**
   - `DATABASE_URL`: Direct connection (port 25060 or 5432) - Required for migrations
   - `DATABASE_URL_POOL`: Pooler connection (port 25061) - Required for runtime

2. **Redis**
   - `REDIS_URL`: Production Redis connection string with password

3. **Solana RPC**
   - `SOLANA_RPC_URL`: Helius/QuickNode mainnet endpoint with API key

4. **Program & Treasury**
   - `MAINNET_PROD_ADMIN_PRIVATE_KEY`: Platform admin wallet (base58)
   - `MAINNET_PROD_ADMIN_ADDRESS`: Platform admin address
   - `MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY`: Fee collector wallet (base58)
   - `MAINNET_PROD_FEE_COLLECTOR_ADDRESS`: Fee collector address
   - `MAINNET_PROD_TREASURY_AUTHORITY_PRIVATE_KEY`: Treasury authority wallet (base58)
   - `MAINNET_PROD_TREASURY_AUTHORITY_ADDRESS`: Treasury authority address

5. **Test Wallets**
   - `MAINNET_PROD_SENDER_PRIVATE_KEY`: Test sender wallet
   - `MAINNET_PROD_SENDER_ADDRESS`: Test sender address
   - `MAINNET_PROD_RECEIVER_PRIVATE_KEY`: Test receiver wallet
   - `MAINNET_PROD_RECEIVER_ADDRESS`: Test receiver address
   - `MAINNET_PROD_DEPLOYER_ADDRESS`: Program deployer address

6. **Security**
   - `JWT_SECRET`: Strong random value (openssl rand -base64 64)
   - `WEBHOOK_SECRET`: Strong random value (openssl rand -base64 32)

7. **DigitalOcean Spaces**
   - `DO_SPACES_KEY`: Spaces access key
   - `DO_SPACES_SECRET`: Spaces secret key

8. **Monitoring (Optional)**
   - `SENTRY_DSN`: Sentry error tracking DSN
   - `SMTP_HOST`: Production SMTP host
   - `SMTP_USER`: SMTP username
   - `SMTP_PASS`: SMTP password
   - `SLACK_WEBHOOK`: Slack notifications
   - `DISCORD_WEBHOOK`: Discord notifications

---

## 🔒 Secrets Management Validation

### ✅ Correct Pattern (All Secrets Follow This)

```yaml
- key: SOME_SECRET
  type: SECRET
  scope: RUN_TIME  # or RUN_AND_BUILD_TIME
  # NO value field - managed via console
```

### ❌ Incorrect Patterns (NONE FOUND - Good!)

```yaml
# BAD - Don't do this
- key: SOME_SECRET
  type: SECRET
  value: ${SOME_SECRET}  # ← Remove this
```

**Validation:** ✅ All SECRET-type variables in production YAML follow correct pattern (no `value` field).

---

## 🔑 Wallet Generation & Funding Requirements

### Wallets Needed for Production (Mainnet)

| Wallet | Purpose | Funding Required | Generation Command |
|--------|---------|------------------|-------------------|
| **Admin** | Platform operations, zero-fee auth | ~5 SOL | `solana-keygen new -o mainnet-prod-admin.json` |
| **Treasury Authority** | Treasury initialization/management | ~2 SOL | `solana-keygen new -o mainnet-prod-treasury-authority.json` |
| **Fee Collector** | Receives platform fees | 0 SOL (receives fees) | `solana-keygen new -o mainnet-prod-fee-collector.json` |
| **Deployer** | Program deployment | ~10 SOL | `solana-keygen new -o mainnet-prod-deployer.json` |
| **Test Sender** | E2E testing | ~2 SOL | `solana-keygen new -o mainnet-prod-sender.json` |
| **Test Receiver** | E2E testing | ~2 SOL | `solana-keygen new -o mainnet-prod-receiver.json` |

**Total SOL Required:** ~21 SOL for full production setup

---

## 📊 Staging vs Production Comparison

### Variables Present in Staging but Missing in Production

| Variable (Staging) | Production Equivalent | Status |
|-------------------|----------------------|--------|
| `DEVNET_STAGING_ADMIN_PRIVATE_KEY` | `MAINNET_PROD_ADMIN_PRIVATE_KEY` | ✅ Exists |
| `DEVNET_STAGING_ADMIN_ADDRESS` | `MAINNET_PROD_ADMIN_ADDRESS` | ✅ Exists |
| `SPACES_ACCESS_KEY_ID` | `DO_SPACES_KEY` | ✅ Exists (different name) |
| `SPACES_SECRET_ACCESS_KEY` | `DO_SPACES_SECRET` | ✅ Exists (different name) |
| `SPACES_BUCKET` | `DO_SPACES_BUCKET` | ✅ Exists |
| `SPACES_ENDPOINT` | `DO_SPACES_ENDPOINT` | ✅ Exists |
| `SPACES_REGION` | `DO_SPACES_REGION` | ✅ Exists |
| N/A | `MAINNET_PROD_TREASURY_AUTHORITY_*` | ❌ **MUST ADD** |
| N/A | `MAINNET_PROD_TREASURY_PDA_ADDRESS` | ❌ **MUST ADD** |
| N/A | `MAINNET_PROD_AUTHORIZED_ZERO_FEE_APPS` | ❌ **MUST ADD** |
| `DATABASE_URL_POOL` | `DATABASE_POOL_URL` | ⚠️ **NAME MISMATCH** |
| `SOLANA_COMMITMENT` | Missing | ❌ **SHOULD ADD** |
| `MONITORING_ENABLED` | Missing | ❌ **SHOULD ADD** |
| `CORS_ENABLED` | Missing | ❌ **SHOULD ADD** |
| `HELMET_ENABLED` | Missing | ❌ **SHOULD ADD** |

---

## ✅ Production Deployment Checklist

### Pre-Deployment (Must Complete)

- [ ] **Generate all production wallets** (admin, treasury authority, fee collector, deployer, test wallets)
- [ ] **Fund wallets** with required SOL (~21 SOL total)
- [ ] **Update .do/app-production.yaml** with missing atomic swap variables
- [ ] **Fix DATABASE_POOL_URL → DATABASE_URL_POOL** name mismatch
- [ ] **Set all secrets in DigitalOcean console** (do NOT commit to YAML)
- [ ] **Document all wallet addresses** and store private keys securely
- [ ] **Audit authorized apps whitelist** and populate `MAINNET_PROD_AUTHORIZED_ZERO_FEE_APPS`
- [ ] **Verify SOLANA_RPC_URL** points to production-grade mainnet RPC
- [ ] **Verify DATABASE_URL** uses direct connection (not pooler)
- [ ] **Test environment variable loading** with staging-like setup

### Post-Deployment (Verify)

- [ ] **Check backend logs** for "Configuration loaded successfully"
- [ ] **Verify health check** returns 200 and shows all services healthy
- [ ] **Test /test page** password protection (password available in source code)
- [ ] **Verify Treasury PDA** is accessible and configured
- [ ] **Test API endpoint** connectivity and authentication
- [ ] **Monitor error logs** for configuration issues
- [ ] **Run smoke tests** to verify basic functionality

---

## 🚨 Security Validation

### Secrets Audit Checklist

- [x] ✅ All SECRET-type variables have NO `value` field in YAML
- [x] ✅ No hardcoded private keys in YAML
- [x] ✅ No hardcoded API keys in YAML
- [x] ✅ No hardcoded database passwords in YAML
- [x] ✅ All placeholders use `${VARIABLE_NAME}` or omitted for SECRETs
- [x] ✅ Production domains in CORS_ORIGIN (not wildcards)
- [x] ✅ Swagger disabled in production (`ENABLE_SWAGGER=false`)

---

## 📝 Updated Production YAML Required

Create a new file to track required YAML updates:

**File:** `docs/deployment/PRODUCTION_YAML_UPDATES_REQUIRED.md`

**Contents:**
```yaml
# Add these to .do/app-production.yaml under services[0].envs:

#
# Atomic Swap: Treasury Configuration (CRITICAL)
#
- key: MAINNET_PROD_TREASURY_AUTHORITY_PRIVATE_KEY
  type: SECRET
  scope: RUN_TIME

- key: MAINNET_PROD_TREASURY_AUTHORITY_ADDRESS
  type: SECRET
  scope: RUN_TIME

- key: MAINNET_PROD_TREASURY_PDA_ADDRESS
  value: ""  # Will be set after Task 33 (Treasury PDA Setup)
  scope: RUN_TIME

#
# Atomic Swap: Zero-Fee Authorization (CRITICAL)
#
- key: MAINNET_PROD_AUTHORIZED_ZERO_FEE_APPS
  value: ""  # Comma-separated list of authorized app public keys
  scope: RUN_TIME

#
# Solana Configuration (Important)
#
- key: SOLANA_COMMITMENT
  value: finalized
  scope: RUN_AND_BUILD_TIME

#
# Feature Flags (Important)
#
- key: MONITORING_ENABLED
  value: "true"
  scope: RUN_TIME

- key: CORS_ENABLED
  value: "true"
  scope: RUN_TIME

- key: HELMET_ENABLED
  value: "true"
  scope: RUN_TIME

#
# Fix Database Pool Variable Name
#
# RENAME:
- key: DATABASE_URL_POOL  # Was: DATABASE_POOL_URL
  type: SECRET
  scope: RUN_AND_BUILD_TIME
```

---

## 🔧 Backend Code That Expects These Variables

### 1. Treasury Configuration
**File:** `src/config/atomicSwap.config.ts`
- Expects: `MAINNET_PROD_TREASURY_AUTHORITY_PRIVATE_KEY`
- Expects: `MAINNET_PROD_TREASURY_AUTHORITY_ADDRESS`
- Expects: `MAINNET_PROD_TREASURY_PDA_ADDRESS`

### 2. Authorized Apps
**File:** `src/config/atomicSwap.config.ts`
- Expects: `MAINNET_PROD_AUTHORIZED_ZERO_FEE_APPS` (comma-separated)

### 3. Database Pool
**File:** Multiple database connection files
- Expects: `DATABASE_URL_POOL` (NOT `DATABASE_POOL_URL`)

---

## 📈 Priority Matrix

| Priority | Variables | Blocking? | Task |
|----------|-----------|-----------|------|
| 🔴 **P0 - Critical** | Treasury authority, Treasury PDA, Authorized apps | Yes | Task 33, 34 |
| 🟡 **P1 - High** | DATABASE_URL_POOL rename, SOLANA_COMMITMENT | Partially | Task 34 |
| 🟢 **P2 - Medium** | Feature flags, Monitoring intervals | No | Task 34 |
| ⚪ **P3 - Low** | Optional monitoring webhooks | No | Post-deployment |

---

## 🎯 Next Steps

### Immediate Actions (Task 31.2)

1. ✅ **Document this audit** (COMPLETE)
2. 🔄 **Create YAML update file** with required changes
3. 🔄 **Generate production wallets** (Task 31.4)
4. 🔄 **Update .do/app-production.yaml** with missing variables
5. 🔄 **Create secrets checklist** for DigitalOcean console configuration

### Before Production Deployment (Task 34)

1. Apply YAML updates to `.do/app-production.yaml`
2. Generate and fund all production wallets
3. Set all secrets in DigitalOcean console
4. Test environment variable loading
5. Verify backend starts with production configuration

---

## 📚 Related Documentation

- [Staging YAML](.do/app-staging.yaml)
- [Production YAML](.do/app-production.yaml)
- [Atomic Swap Config](../src/config/atomicSwap.config.ts)
- [Environment Variables Guide](../docs/environments/ENVIRONMENT_VARIABLES.md)
- [Secrets Management Rules](../.cursor/rules/deployment-secrets.mdc)

---

**Audit Status:** ✅ Complete  
**Next Task:** 31.3 - Conduct Comprehensive Security Audit  
**Blockers:** None - can proceed with YAML updates in parallel with security audit


