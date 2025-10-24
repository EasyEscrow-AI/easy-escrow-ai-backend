# STAGING Environment Strategy and Architecture

**Complete STAGING Architecture and Strategic Decisions**  
**Last Updated:** January 2025  
**Status:** ✅ Active  
**Purpose:** Production-like testing environment on Solana devnet

---

## Table of Contents

1. [STAGING Environment Overview](#1-staging-environment-overview)
2. [Why Devnet for STAGING (Not Testnet)](#2-why-devnet-for-staging-not-testnet)
3. [Environment Separation Strategy](#3-environment-separation-strategy)
4. [Build-Once-Promote Pattern](#4-build-once-promote-pattern)
5. [CI/CD Requirements](#5-cicd-requirements)
6. [One-Time Setup](#6-one-time-setup)
7. [Upgrade Authority Management](#7-upgrade-authority-management)
8. [Program ID Tracking](#8-program-id-tracking)
9. [Canary Deployments and Rollback](#9-canary-deployments-and-rollback)
10. [What STAGING Provides](#10-what-staging-provides)
11. [Migration from DEV to STAGING](#11-migration-from-dev-to-staging)
12. [Mainnet-Shadow Testing (Separate from STAGING)](#12-mainnet-shadow-testing-separate-from-staging)
13. [Infrastructure as Code (IaC)](#13-infrastructure-as-code-iac)
14. [Monitoring and Observability](#14-monitoring-and-observability)
15. [Configuration Drift Detection](#15-configuration-drift-detection)

---

## 1. STAGING Environment Overview

### Purpose

STAGING is a **production-like testing environment** on Solana devnet that serves as a **release candidate (RC) gate** before deploying to mainnet production.

### Key Characteristics

- **NOT a manual deploy environment** - All deployments are CI/CD only
- **Production topology** - Mirrors production infrastructure (API, DB, Redis, RPC)
- **Stable and controlled** - Separate from DEV churn and experimentation
- **Quality gate** - Must pass all tests before promoting to PROD
- **Risk-free testing** - No real funds at risk (devnet SOL and test USDC)

### Promotion Path

```
┌──────────────────────────────────────────────────────────────┐
│                  Deployment Pipeline                          │
└──────────────────────────────────────────────────────────────┘

Local Development (localhost)
  • Rapid iteration
  • Unit tests
  • Local Solana validator
  • Test database
           ↓
           
DEV Environment (devnet, rapid iteration)
  • Feature development
  • Integration testing
  • Public devnet RPC
  • Shared infrastructure
  • Manual + automated deployments
           ↓
           
STAGING Environment (devnet, production-like) ← We are here
  • Release candidate testing
  • Full E2E tests
  • Private Helius RPC
  • Isolated infrastructure
  • CI/CD only deployments
  • Performance benchmarking
  • Security testing
           ↓
           
PROD Environment (mainnet, live production)
  • Live user traffic
  • Real funds
  • Private Helius/QuickNode RPC
  • Production infrastructure
  • CI/CD with approvals + canary
  • 24/7 monitoring
```

### Environment Comparison Matrix

| Feature | DEV | STAGING | PROD |
|---------|-----|---------|------|
| **Purpose** | Active development | Production-like testing | Live production |
| **Network** | Devnet | Devnet | Mainnet |
| **Program ID** | `4FQ5...Twhd` | `AvdX...9Zei` | `<TBD>` |
| **RPC** | Public devnet | Private Helius | Private Helius/QuickNode |
| **Database** | Local/shared | DO Managed PostgreSQL | DO Managed PostgreSQL |
| **Redis** | Local/shared | Redis Cloud | Redis Cloud |
| **Wallets** | `DEVNET_*` | `DEVNET_STAGING_*` | `MAINNET_*` |
| **Deployment** | Manual/frequent | CI/CD only | CI/CD with approvals |
| **Stability** | Rapid changes | Stable RC | Production-grade |
| **Testing** | Unit/integration | Full E2E + smoke | Monitoring + canary |
| **Data** | Test data | Test data | Production data |
| **Monitoring** | Basic logs | Full observability | Full observability + alerting |

---

## 2. Why Devnet for STAGING (Not Testnet)

### Network Comparison

| Aspect | Devnet | Testnet | Mainnet |
|--------|--------|---------|---------|
| **Purpose** | Public testing playground | Validator/core testing | Production |
| **Stability** | Stable | Can be flaky | Stable |
| **Faucet Access** | ✅ Available | ✅ Available | ❌ No faucet |
| **Testing Use** | App testing | Validator testing | Production |
| **Branch** | Stable releases | Newer branches | Stable releases |
| **Recommended For** | **STAGING environment** | Core developers | Production |

### Why Devnet?

✅ **Benefits of Devnet for STAGING:**

1. **Stable and Reliable**
   - Runs stable Solana releases (not bleeding edge)
   - Predictable behavior for testing
   - Lower chance of network issues disrupting tests

2. **Faucet Access**
   - Easy to fund test wallets via faucet
   - No need to buy devnet SOL
   - Automated wallet funding scripts

3. **Production-like Behavior**
   - Mimics mainnet behavior closely
   - Same transaction costs (in devnet SOL)
   - Same program constraints

4. **Community Standard**
   - Most projects use devnet for pre-prod testing
   - Better documentation and tooling
   - Easier to debug issues

### Why NOT Testnet?

❌ **Testnet Limitations:**

1. **Less Stable**
   - Used for validator stress testing
   - Often runs newer, experimental branches
   - Can have more frequent resets or issues

2. **Not Designed for App Testing**
   - Primarily for validator operators
   - Less predictable for application development
   - Not the "golden path" for pre-production

3. **Flakiness Risk**
   - May experience more network issues
   - Can disrupt CI/CD pipelines
   - Not reliable for release candidate validation

### Mainnet-Shadow Testing

For production conditions that devnet can't reproduce (real token economics, high TPS, etc.), we'll implement **mainnet-shadow testing** as a separate, gated phase (see Section 12).

---

## 3. Environment Separation Strategy

Even though both DEV and STAGING use devnet, they are **completely isolated** to prevent interference and ensure STAGING stability.

### Isolation Boundaries

```
┌────────────────────────────────────────────────────────────┐
│                         DEVNET                              │
│                                                             │
│  ┌──────────────────────┐    ┌──────────────────────┐    │
│  │   DEV Environment    │    │  STAGING Environment │    │
│  │                      │    │                      │    │
│  │  Program ID:         │    │  Program ID:         │    │
│  │  4FQ5...Twhd         │    │  AvdX...9Zei         │    │
│  │                      │    │                      │    │
│  │  Wallets:            │    │  Wallets:            │    │
│  │  DEVNET_*            │    │  DEVNET_STAGING_*    │    │
│  │                      │    │                      │    │
│  │  RPC: Public         │    │  RPC: Private        │    │
│  │  api.devnet....      │    │  Helius              │    │
│  │                      │    │                      │    │
│  │  DB: Local/Shared    │    │  DB: DO Managed      │    │
│  │                      │    │  easyescrow_staging  │    │
│  │                      │    │                      │    │
│  │  Redis: Local        │    │  Redis: Cloud        │    │
│  │                      │    │  Dedicated instance  │    │
│  │                      │    │                      │    │
│  │  Deploy: Manual      │    │  Deploy: CI/CD only  │    │
│  └──────────────────────┘    └──────────────────────┘    │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### 1. Separate Program IDs

**Why:** DEV program can be noisy with frequent redeployments, bugs, and experimental features. STAGING needs a clean, stable program.

- **DEV**: `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd`
- **STAGING**: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- **PROD**: `<TBD>` (will generate separately for mainnet)

**Benefits:**
- DEV changes don't affect STAGING stability
- Can deploy different versions to each environment
- Clear separation in logs and monitoring
- Independent upgrade authority per environment

### 2. Separate RPC Endpoints

**Why:** Rate limiting, reliability, and cost isolation.

- **DEV**: Public RPC (`https://api.devnet.solana.com`)
  - Free, rate-limited
  - Acceptable for development
  - May experience slowdowns

- **STAGING**: Private Helius RPC
  - Dedicated capacity
  - No rate limiting
  - Production-like reliability
  - Better uptime SLA

**Benefits:**
- STAGING tests aren't affected by DEV rate limits
- Production-like RPC performance
- Isolated monitoring and metrics
- Cost tracking per environment

### 3. Separate Infrastructure

**Why:** Data isolation, cost tracking, and production parity.

| Component | DEV | STAGING |
|-----------|-----|---------|
| **Database** | Local/shared | DO Managed PostgreSQL (`easyescrow_staging`) |
| **Redis** | Local/shared | Redis Cloud (dedicated instance) |
| **Queues** | Local Bull | Redis Cloud with Bull |
| **Monitoring** | Basic logs | Full observability stack |
| **Secrets** | Local `.env` | DO App Platform encrypted vars |

**Benefits:**
- No data leakage between environments
- STAGING mirrors production topology
- Independent scaling and resource management
- Clear cost attribution

### 4. Separate Wallets

**Why:** Prevent accidental use of wrong environment credentials and enable independent balance management.

**Naming Convention:**

```bash
# DEV Environment
DEVNET_SENDER_PRIVATE_KEY
DEVNET_RECEIVER_PRIVATE_KEY
DEVNET_ADMIN_PRIVATE_KEY
DEVNET_FEE_COLLECTOR_PRIVATE_KEY

# STAGING Environment (note the _STAGING_ prefix)
DEVNET_STAGING_SENDER_PRIVATE_KEY
DEVNET_STAGING_RECEIVER_PRIVATE_KEY
DEVNET_STAGING_ADMIN_PRIVATE_KEY
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY
```

**Benefits:**
- Can run both environments simultaneously
- Clear identification in logs
- Prevents accidental cross-environment usage
- Independent balance management

### 5. Separate Anchor Configurations

**Why:** Enable environment-specific builds and deployments via CI/CD.

```bash
# DEV
Anchor.dev.toml
└─ Program ID: 4FQ5...Twhd
└─ Wallet: wallets/dev/dev-deployer.json
└─ Cluster: Devnet

# STAGING
Anchor.staging.toml
└─ Program ID: AvdX...9Zei
└─ Wallet: wallets/staging/staging-deployer.json
└─ Cluster: Devnet

# PROD (future)
Anchor.prod.toml
└─ Program ID: <TBD>
└─ Wallet: <multisig>
└─ Cluster: Mainnet
```

**Usage:**

```bash
# Build/deploy for DEV
anchor build -C Anchor.dev.toml
anchor deploy -C Anchor.dev.toml

# Build/deploy for STAGING
anchor build -C Anchor.staging.toml
anchor deploy -C Anchor.staging.toml

# Or use environment variable
export ANCHOR_CONFIG=Anchor.staging.toml
anchor build
anchor deploy
```

**Benefits:**
- Single command to target specific environment
- CI/CD can easily switch between environments
- Configuration stored in version control
- Audit trail for which config was used

---

## 4. Build-Once-Promote Pattern

The **build-once-promote pattern** ensures that the exact same binary (.so) and IDL that passed all tests in STAGING is what gets deployed to production.

### The Pattern

```
┌──────────────────────────────────────────────────────────────┐
│                  Build Once, Promote Everywhere               │
└──────────────────────────────────────────────────────────────┘

1. Merge to `staging` branch
         ↓
2. CI: Build Phase
   ├─ Pin toolchains (Solana 1.18.x, Rust 1.75.0)
   ├─ anchor build (generates .so and IDL)
   ├─ Generate checksums (SHA-256)
   ├─ Run unit tests (no public chain)
   └─ Store artifacts in CI artifact store
         ↓
3. Manual Approval Gate (human review)
         ↓
4. CI: Deploy Phase
   ├─ Download artifacts from CI store
   ├─ Verify checksums (ensure integrity)
   ├─ Deploy .so to STAGING program ID
   ├─ Update IDL on-chain
   ├─ Deploy backend to DO App Platform
   ├─ Run smoke tests (health checks)
   └─ Run E2E tests (full scenarios)
         ↓
5. Mark as Release Candidate (RC)
         ↓
6. Promote to PROD (future)
   ├─ Same .so binary
   ├─ Same IDL
   ├─ Different Program ID (mainnet)
   └─ Canary deployment
```

### Why Build Once?

✅ **Benefits:**

1. **Deterministic Builds**
   - Same source code = same binary
   - Eliminates "works on my machine" issues
   - Reproducible builds for auditing

2. **What You Test Is What You Deploy**
   - Exact binary that passed STAGING tests goes to PROD
   - No risk of build differences causing production bugs
   - Confidence in deployment

3. **Faster Deployments**
   - No need to rebuild for each environment
   - Just promote existing artifacts
   - Reduces deployment time

4. **Audit Trail**
   - Clear lineage from source to production
   - Checksum verification at every step
   - Who/what/when logged for compliance

### Toolchain Pinning

**Critical:** Always pin toolchain versions to ensure reproducible builds.

```bash
# .github/workflows/build-staging.yml
- name: Install Pinned Toolchains
  run: |
    # Pin Solana CLI version
    sh -c "$(curl -sSfL https://release.solana.com/v1.18.17/install)"
    
    # Pin Rust version
    rustup install 1.75.0
    rustup default 1.75.0
    
    # Pin Anchor version
    cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked
```

**Why Pin?**
- Different toolchain versions can produce different binaries
- Newer versions may introduce bugs or breaking changes
- Reproducibility requires exact same tools

### Checksum Generation

```bash
# Generate checksums after build
shasum -a 256 target/deploy/escrow.so > target/deploy/escrow.so.sha256
shasum -a 256 target/idl/escrow.json > target/idl/escrow.json.sha256

# Verify checksums before deploy
shasum -c target/deploy/escrow.so.sha256
shasum -c target/idl/escrow.json.sha256
```

### Artifact Storage

**Options:**

1. **GitHub Actions Artifacts** (recommended for MVP)
   ```yaml
   - name: Upload Build Artifacts
     uses: actions/upload-artifact@v3
     with:
       name: escrow-build-${{ github.sha }}
       path: |
         target/deploy/escrow.so
         target/deploy/escrow.so.sha256
         target/idl/escrow.json
         target/idl/escrow.json.sha256
       retention-days: 90
   ```

2. **DigitalOcean Spaces** (for long-term storage)
   - Upload to `s3://easyescrow-artifacts/builds/$GIT_SHA/`
   - Immutable storage
   - Longer retention (1+ year)

3. **Container Registry** (for backend Docker images)
   - Build Docker image with artifacts
   - Push to DO Container Registry
   - Tag with git SHA

---

## 5. CI/CD Requirements

STAGING deployments **MUST** go through CI/CD. Manual deployments are **forbidden**.

### Why CI/CD Only?

✅ **Benefits:**

1. **Consistency**
   - Same deployment process every time
   - No manual errors or forgotten steps
   - Reproducible deployments

2. **Auditability**
   - Who triggered deployment
   - What was deployed (git SHA, artifacts)
   - When it was deployed
   - Full logs of deployment process

3. **Quality Gates**
   - Automated tests run before deployment
   - Manual approval for production-critical changes
   - Rollback capability built-in

4. **Security**
   - Secrets managed centrally
   - No local copies of production keys
   - Access control via GitHub permissions

### Forbidden Actions

❌ **Never Do These:**

```bash
# ❌ FORBIDDEN: Manual laptop deployment
anchor deploy --provider.cluster devnet

# ❌ FORBIDDEN: SSH into server and deploy
ssh user@staging-server
git pull
npm run build
pm2 restart

# ❌ FORBIDDEN: Local deploy script
./scripts/deploy-staging.sh
```

✅ **Always Do This:**

```bash
# ✅ CORRECT: Trigger CI/CD pipeline
git push origin staging

# ✅ CORRECT: Manual workflow dispatch (emergencies only)
gh workflow run "Deploy to STAGING" --ref staging
```

### CI/CD Pipeline Requirements

**Must Have:**

1. **Pinned Toolchains**
   - Specific Solana CLI version
   - Specific Rust version
   - Specific Anchor version
   - Documented in README

2. **Automated Tests**
   - Unit tests run before build
   - Integration tests run after build
   - Smoke tests run after deployment
   - E2E tests run after deployment

3. **Checksum Verification**
   - Generate checksums after build
   - Verify checksums before deployment
   - Store checksums with artifacts

4. **Secrets Management**
   - All secrets in GitHub Secrets or DO App Platform
   - Never hardcoded in code or config files
   - Rotation policy documented

5. **Audit Logging**
   - Log every deployment event
   - Record who triggered deployment
   - Store logs for 90+ days
   - Slack/Discord notifications

6. **Rollback Capability**
   - Previous artifacts stored
   - One-command rollback
   - Automated rollback on test failure
   - Documented rollback procedures

### Manual Approval Gates

For STAGING, implement optional manual approval:

```yaml
# .github/workflows/deploy-staging.yml
jobs:
  build:
    # ... build steps ...
  
  approve:
    runs-on: ubuntu-latest
    needs: build
    environment:
      name: staging-approval
    steps:
      - name: Wait for Approval
        run: echo "Deployment approved"
  
  deploy:
    needs: approve
    # ... deploy steps ...
```

**When to Require Approval:**
- Schema-changing database migrations
- Breaking API changes
- Major version upgrades
- Security-sensitive changes

---

## 6. One-Time Setup

These steps are performed **once** per environment and then maintained over time.

### Program Keypair Generation

```bash
# Generate STAGING program keypair (done once)
solana-keygen new --outfile target/deploy/escrow-keypair-staging.json

# Extract program ID
solana address -k target/deploy/escrow-keypair-staging.json
# Output: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# Backup keypair
cp target/deploy/escrow-keypair-staging.json temp/staging-backups/

# Store in GitHub Secrets (for CI/CD)
gh secret set STAGING_PROGRAM_KEYPAIR < target/deploy/escrow-keypair-staging.json
```

**⚠️ Critical:** Never generate new program keypairs unless absolutely necessary (lost keypair, security incident). Program IDs should be stable.

### Wallet Generation

```bash
# Generate STAGING wallets (done once)
solana-keygen new --outfile wallets/staging/staging-sender.json
solana-keygen new --outfile wallets/staging/staging-receiver.json
solana-keygen new --outfile wallets/staging/staging-admin.json
solana-keygen new --outfile wallets/staging/staging-fee-collector.json

# Extract addresses
solana address -k wallets/staging/staging-sender.json
# AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z

# Extract Base58 private keys
npx ts-node scripts/utilities/extract-base58-keys.ts

# Backup all wallets
cp wallets/staging/*.json temp/staging-backups/

# Store in GitHub Secrets (for CI/CD)
gh secret set DEVNET_STAGING_SENDER_PRIVATE_KEY --body "<base58-key>"
gh secret set DEVNET_STAGING_RECEIVER_PRIVATE_KEY --body "<base58-key>"
gh secret set DEVNET_STAGING_ADMIN_PRIVATE_KEY --body "<base58-key>"
gh secret set DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY --body "<base58-key>"
```

### Anchor Configuration Files

**Create `Anchor.staging.toml`:**

```toml
[toolchain]
anchor_version = "0.30.1"

[features]
seeds = false
skip-lint = false
resolution = true

[programs.devnet]
escrow = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "Devnet"
wallet = "target/deploy/escrow-keypair-staging.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

**Commit to git:**

```bash
git add Anchor.staging.toml
git commit -m "chore: Add STAGING Anchor configuration"
git push
```

### CI/CD Secrets Setup

**GitHub Secrets:**

```bash
# Program and wallets
gh secret set STAGING_PROGRAM_KEYPAIR < target/deploy/escrow-keypair-staging.json
gh secret set DEVNET_STAGING_SENDER_PRIVATE_KEY --body "<key>"
gh secret set DEVNET_STAGING_RECEIVER_PRIVATE_KEY --body "<key>"
gh secret set DEVNET_STAGING_ADMIN_PRIVATE_KEY --body "<key>"
gh secret set DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY --body "<key>"

# Infrastructure
gh secret set STAGING_DATABASE_URL --body "<postgres-url>"
gh secret set STAGING_REDIS_URL --body "<redis-url>"
gh secret set STAGING_SOLANA_RPC_URL --body "<helius-url>"

# Application
gh secret set STAGING_JWT_SECRET --body "<random-secret>"
gh secret set STAGING_WEBHOOK_SECRET --body "<random-secret>"

# DigitalOcean
gh secret set DO_API_TOKEN --body "<do-api-token>"
gh secret set STAGING_APP_ID --body "<app-platform-id>"
```

**DigitalOcean App Platform:**

Navigate to: **App Platform → easyescrow-staging → Settings → Environment Variables**

Add encrypted variables for all secrets (same as GitHub Secrets above).

---

## 7. Upgrade Authority Management

The **upgrade authority** is the keypair that can upgrade the deployed program. Proper management is critical for security.

### Current Setup (STAGING)

```bash
# Check current upgrade authority
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet

# Output:
# Program Id: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
# Owner: BPFLoaderUpgradeab1e11111111111111111111111
# ProgramData Address: <pda>
# Authority: <deployer-keypair-pubkey>  ← Current upgrade authority
# Last Deployed In Slot: 123456789
# Data Length: 123456 bytes
```

**Current Authority:** STAGING deployer keypair (stored in CI/CD)

### Security Considerations

**STAGING (Acceptable):**
- ✅ Single deployer keypair is fine
- ✅ Stored in GitHub Secrets
- ✅ Accessible only to CI/CD pipeline
- ✅ Can upgrade program as needed for testing

**PRODUCTION (Future - Must Change):**
- ❌ Single keypair is NOT acceptable
- ✅ Must use multisig (3-of-5 or similar)
- ✅ Hardware wallet for signers
- ✅ Emergency upgrade procedures documented

### Transferring Upgrade Authority

**Example: Transfer to multisig (future PROD setup):**

```bash
# Transfer upgrade authority to multisig
solana program set-upgrade-authority \
  <PROGRAM_ID> \
  --upgrade-authority <current-authority-keypair> \
  --new-upgrade-authority <multisig-address>

# Verify transfer
solana program show <PROGRAM_ID>
```

### Making Program Immutable

**For production, if no future upgrades planned:**

```bash
# Set upgrade authority to None (makes program immutable)
solana program set-upgrade-authority \
  <PROGRAM_ID> \
  --upgrade-authority <current-authority-keypair> \
  --final
```

**⚠️ Warning:** This action is **irreversible**. Program can never be upgraded again.

### Upgrade Authority Best Practices

1. **Development/STAGING:**
   - Single keypair is acceptable
   - Stored in CI/CD secrets
   - Regular backups

2. **Production:**
   - Use multisig (Squads Protocol or similar)
   - 3-of-5 or 5-of-9 threshold
   - Hardware wallets for signers
   - Geographically distributed signers
   - Emergency procedures documented

3. **Emergency Upgrades:**
   - Fast-track approval process
   - Incident response plan
   - Post-mortem required

---

## 8. Program ID Tracking

Maintain a clear registry of Program IDs across all environments.

### Active Program IDs

| Environment | Network | Program ID | Status | Deployed | Keypair Location |
|-------------|---------|------------|--------|----------|------------------|
| **DEV** | Devnet | `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd` | ✅ Active | 2025-01-15 | `target/deploy/escrow-keypair.json` |
| **STAGING** | Devnet | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | ✅ Active | 2025-01-20 | `target/deploy/escrow-keypair-staging.json` |
| **PROD** | Mainnet | `<TBD>` | ⏸️ Not deployed | TBD | TBD |

### Explorer Links

- **DEV**: https://explorer.solana.com/address/4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd?cluster=devnet
- **STAGING**: https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet
- **PROD**: TBD

### Environment Variable Names

```bash
# DEV
DEVNET_PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd

# STAGING
DEVNET_STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# PROD (future)
MAINNET_PROGRAM_ID=<tbd>
```

### Version Tracking

Document program versions and deployment history:

```markdown
# Program Deployment History

## STAGING Environment (AvdX...9Zei)

| Version | Git SHA | Deployed | Changes | Deployer |
|---------|---------|----------|---------|----------|
| v0.1.0 | abc123d | 2025-01-20 | Initial deployment | CI/CD (GitHub Actions) |
| v0.1.1 | def456e | 2025-01-22 | Fix fee calculation | CI/CD (GitHub Actions) |
```

---

## 9. Canary Deployments and Rollback

After any deployment, run **canary tests** to validate the deployment before promoting to full traffic.

### Canary Testing

**What is a Canary?**

A small, synthetic test transaction that validates core functionality immediately after deployment.

**Example Canary Test:**

```typescript
// tests/canary/staging-canary.test.ts
import { runCanaryTest } from './canary-utils';

describe('STAGING Canary Tests', () => {
  it('should complete a tiny escrow swap', async () => {
    // Create escrow with minimal amounts (0.01 USDC, test NFT)
    const agreement = await createAgreement({
      nftMint: TEST_NFT_MINT,
      price: 0.01 * 1e6, // 0.01 USDC
      seller: SENDER_WALLET,
      buyer: RECEIVER_WALLET,
      expiry: Date.now() + 3600000, // 1 hour
    });

    // Deposit assets
    await depositNFT(agreement.id, SENDER_WALLET);
    await depositUSDC(agreement.id, RECEIVER_WALLET, 0.01 * 1e6);

    // Verify settlement
    const settled = await waitForSettlement(agreement.id, 60000); // 60s timeout
    expect(settled.status).toBe('completed');
    expect(settled.feesCollected).toBeGreaterThan(0);
  });
});
```

**Run After Every Deployment:**

```bash
# Deploy to STAGING
anchor deploy -C Anchor.staging.toml

# Run canary test immediately
npm run test:staging:canary

# If canary passes, proceed with full E2E tests
npm run test:staging:e2e
```

### Monitoring Metrics

**Watch these metrics for 5-10 minutes after deployment:**

1. **Error Rate** - Should remain at baseline (< 1%)
2. **Response Time** - Should not increase significantly
3. **Transaction Success Rate** - Should remain high (> 99%)
4. **Settlement Time** - Should remain within normal range

**Example monitoring check:**

```bash
# Check API error rate
curl https://staging-api.easyescrow.ai/metrics | grep error_rate

# Check logs for errors
doctl apps logs $STAGING_APP_ID --type run | grep ERROR | tail -50
```

### Rollback Decision Criteria

**Rollback immediately if:**

- ❌ Canary test fails
- ❌ Error rate spikes (> 5%)
- ❌ Database connection failures
- ❌ Program deployment verification fails
- ❌ Critical functionality broken

**Investigate before rolling back:**

- ⚠️ Minor increase in response time
- ⚠️ Non-critical warnings in logs
- ⚠️ Single failed E2E test (may be flaky)

### Rollback Procedures

**Automated Rollback (Recommended):**

```bash
# GitHub Actions workflow
gh workflow run "Rollback STAGING" \
  --field target_deployment_id=<previous-deployment-id>
```

**Manual Rollback via DigitalOcean:**

1. Navigate to: **App Platform → easyescrow-staging → Deployments**
2. Find last successful deployment (green checkmark)
3. Click: **Rollback to this deployment**
4. Confirm rollback
5. Wait for redeployment to complete
6. Run smoke tests to verify

**Manual Rollback via Git:**

```bash
# Find last working commit
git log --oneline

# Checkout that commit
git checkout <last-good-commit>

# Create rollback branch
git checkout -b rollback-staging-$(date +%Y%m%d)

# Force push to staging branch (triggers new deployment)
git push origin rollback-staging-$(date +%Y%m%d):staging --force

# Watch deployment
gh workflow watch
```

### Rollback Time Target

**Target:** < 5 minutes from decision to fully rolled back

**Typical Rollback Timeline:**

- 0:00 - Detect issue
- 0:30 - Decision to rollback
- 1:00 - Trigger rollback
- 3:00 - Rollback deployment complete
- 4:00 - Smoke tests pass
- 5:00 - Confirm rollback successful

### Post-Rollback Actions

**After rollback:**

1. ✅ Run smoke tests to verify rollback
2. ✅ Check logs for errors
3. ✅ Notify team via Slack/Discord
4. ✅ Create incident report
5. ✅ Fix the issue in a new branch
6. ✅ Test fix locally and in DEV
7. ✅ Redeploy to STAGING with fix

---

## 10. What STAGING Provides

STAGING environment provides critical capabilities before production deployment.

### ✅ Stable RC Lane

**Separate from DEV churn:**

- DEV is for rapid iteration, experimentation, and active development
- STAGING is for validating release candidates in a stable environment
- Changes to STAGING are deliberate and controlled
- No "quick fixes" or "let me try this" deployments

**Release Candidate (RC) Process:**

```
Feature development (DEV)
    ↓
Feature complete and tested
    ↓
Merge to `staging` branch
    ↓
CI/CD builds and deploys to STAGING
    ↓
Run full test suite
    ↓
If all tests pass: Tag as RC
    ↓
If any test fails: Fix in DEV and repeat
```

### ✅ Production-like Topology

**STAGING mirrors production infrastructure:**

| Component | STAGING | PROD (Future) |
|-----------|---------|---------------|
| **API** | DO App Platform | DO App Platform |
| **Database** | DO Managed PostgreSQL | DO Managed PostgreSQL |
| **Redis** | Redis Cloud | Redis Cloud |
| **RPC** | Private Helius (devnet) | Private Helius (mainnet) |
| **Queues** | Bull with Redis Cloud | Bull with Redis Cloud |
| **Monitoring** | Full observability | Full observability + alerting |
| **Websockets** | Socket.io | Socket.io |
| **CDN** | DigitalOcean CDN | DigitalOcean CDN |

**Why This Matters:**

- Catch infrastructure-related issues before production
- Validate production deployment procedures
- Test performance under production-like conditions
- Ensure all integrations work correctly

### ✅ Repeatable E2E Before Mainnet

**No real funds at risk:**

- Use devnet SOL (free from faucet)
- Use test USDC (official Circle devnet mint)
- Test NFTs (created for testing)
- Can safely test edge cases and failure scenarios

**Full E2E Test Coverage:**

- Happy path (create → deposit → settle)
- Expiry path (partial deposit → expire → refund)
- Admin cancellation
- Concurrency (multiple buyers)
- Error handling
- Fee collection
- Webhook delivery
- Idempotency

### ✅ Performance Baseline Establishment

**Measure and document baseline performance:**

```bash
# Run load tests on STAGING
npm run test:staging:load

# Measure key metrics
- Response time: 50th, 95th, 99th percentile
- Throughput: requests per second
- Settlement time: average and max
- Database query time: average and max
- RPC call time: average and max
```

**Use baselines to:**

- Set production alerting thresholds
- Identify performance regressions
- Validate scaling strategies
- Optimize bottlenecks before production

### ✅ Security Testing Gate

**Run security tests on STAGING:**

1. **Dependency Scanning**
   ```bash
   npm audit
   cargo audit
   ```

2. **API Security Testing**
   ```bash
   # Test authentication
   # Test authorization
   # Test rate limiting
   # Test input validation
   ```

3. **Infrastructure Security**
   ```bash
   # Verify TLS/SSL
   # Verify database encryption
   # Verify secrets management
   # Verify access controls
   ```

4. **Smart Contract Security**
   ```bash
   # Run unit tests
   # Test unauthorized access attempts
   # Test PDA spoofing
   # Test reentrancy
   ```

### ✅ Confidence for Production Promotion

**Clear criteria for promoting to PROD:**

- ✅ All E2E tests passing
- ✅ Performance within acceptable range
- ✅ Security tests passing
- ✅ No critical bugs
- ✅ Documentation complete
- ✅ Monitoring configured
- ✅ Rollback procedures tested
- ✅ Team approval

---

## 11. Migration from DEV to STAGING

### Promotion Process

**Step 1: Code Promotion**

```bash
# Ensure DEV is stable
git checkout dev
npm test
npm run lint

# Merge to staging branch
git checkout staging
git merge dev

# Push to trigger CI/CD
git push origin staging
```

**Step 2: Configuration Updates**

Update environment-specific configuration:

```typescript
// src/config/environment.ts
const config = {
  development: {
    programId: '4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd',
    rpcUrl: 'https://api.devnet.solana.com',
    database: 'postgres://localhost/escrow_dev',
  },
  staging: {
    programId: 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei',
    rpcUrl: process.env.SOLANA_RPC_URL, // Private Helius
    database: process.env.DATABASE_URL,
  },
  production: {
    programId: process.env.MAINNET_PROGRAM_ID,
    rpcUrl: process.env.SOLANA_RPC_URL,
    database: process.env.DATABASE_URL,
  },
};
```

**Step 3: Database Migration**

```bash
# Test migration on STAGING
npm run staging:migrate

# Verify migration
npm run staging:migrate:status

# Seed test data if needed
npm run staging:seed
```

**Step 4: Validation**

```bash
# Run smoke tests
npm run test:staging:smoke

# Run full E2E tests
npm run test:staging:e2e

# Check logs for errors
doctl apps logs $STAGING_APP_ID --type run | grep ERROR
```

### Critical Rules

**Promote Code, NOT Keys:**

✅ **CORRECT:**
```bash
# Merge code changes
git merge dev → staging

# Use environment-specific keys
STAGING uses: DEVNET_STAGING_*
PROD uses: MAINNET_*
```

❌ **WRONG:**
```bash
# Don't copy DEV keys to STAGING
cp wallets/dev/* wallets/staging/  # ❌ NEVER DO THIS

# Don't reuse Program IDs
STAGING_PROGRAM_ID = DEV_PROGRAM_ID  # ❌ NEVER DO THIS
```

### Independent Credentials

**Each environment has its own:**

- Program ID (different even on same network)
- Wallet keypairs (never shared)
- Database (isolated data)
- Redis instance (isolated caches and queues)
- RPC endpoint (separate rate limits and billing)
- Secrets (JWT, webhook, etc.)

### Database Migration Testing

**Always test migrations on STAGING before PROD:**

```bash
# 1. Backup STAGING database
pg_dump $STAGING_DATABASE_URL > backup.sql

# 2. Run migration
npm run staging:migrate

# 3. Verify migration
npm run staging:migrate:status

# 4. Run tests to verify data integrity
npm run test:staging:e2e

# 5. If migration fails, rollback
npm run staging:migrate:down
psql $STAGING_DATABASE_URL < backup.sql
```

### Backward Compatibility

**Ensure backward compatibility for zero-downtime deployments:**

- New API endpoints can be added
- Existing API endpoints must not break
- Database schema changes must be backward compatible
- Old clients must continue to work during deployment

**Example: Adding a new field**

```sql
-- ✅ SAFE: Add nullable column (backward compatible)
ALTER TABLE agreements ADD COLUMN metadata JSONB;

-- ❌ RISKY: Add NOT NULL column (not backward compatible)
ALTER TABLE agreements ADD COLUMN metadata JSONB NOT NULL;
```

---

## 12. Mainnet-Shadow Testing (Separate from STAGING)

### What is Mainnet-Shadow Testing?

**Mainnet-shadow testing** is a separate, gated phase that validates production conditions on mainnet with **small, controlled transactions using real funds**.

### Why Separate from STAGING?

STAGING on devnet cannot reproduce:

1. **Real Token Economics**
   - Devnet USDC is free (from faucet)
   - Mainnet USDC has real value
   - Economic attack vectors differ

2. **High TPS Production Load**
   - Devnet has lower transaction volume
   - Mainnet has production-scale traffic
   - Performance characteristics differ

3. **Network Effects**
   - Mainnet has different node distribution
   - Different congestion patterns
   - Different confirmation times

### Mainnet-Shadow Strategy

**Phase 1: STAGING Validation (Current)**

- ✅ Test on devnet with test assets
- ✅ Validate all functionality
- ✅ Run full E2E test suite
- ✅ Zero real funds at risk

**Phase 2: Mainnet-Shadow (Future)**

- ⏸️ Deploy to mainnet with **new Program ID**
- ⏸️ Run gated tests with **tiny real amounts** (e.g., $1-5)
- ⏸️ Validate mainnet-specific conditions
- ⏸️ Monitor for unexpected issues

**Phase 3: Production Launch (Future)**

- ⏸️ Open to public after mainnet-shadow validation
- ⏸️ Start with invite-only beta
- ⏸️ Gradually increase limits
- ⏸️ Full public launch

### Mainnet-Shadow Test Scenarios

**Test with minimal real funds:**

1. **Tiny Escrow Swap ($1-5)**
   - Create escrow for low-value NFT
   - Deposit $1-5 USDC
   - Complete settlement
   - Verify all functionality works

2. **Fee Collection Validation**
   - Verify platform fees collected correctly
   - Check fee collector balance
   - Validate fee percentages

3. **Performance Under Mainnet Conditions**
   - Measure confirmation times
   - Check for congestion issues
   - Validate RPC reliability

4. **Emergency Procedures**
   - Test admin cancellation
   - Test expiry handling
   - Test rollback procedures

### Gating Mechanism

**Before mainnet-shadow testing:**

- ✅ All STAGING tests passing
- ✅ Security audit complete (if required)
- ✅ Team approval
- ✅ Dedicated mainnet Program ID generated
- ✅ Mainnet wallets funded with minimal SOL/USDC
- ✅ Incident response plan ready

**During mainnet-shadow testing:**

- ⏸️ Limited to team members only
- ⏸️ Maximum transaction size enforced (e.g., $10)
- ⏸️ Whitelist of allowed wallets
- ⏸️ Close monitoring of all transactions
- ⏸️ Immediate shutdown capability

**After successful mainnet-shadow testing:**

- ✅ Document all test results
- ✅ Review any issues found
- ✅ Fix any mainnet-specific bugs
- ✅ Update monitoring and alerting
- ✅ Prepare for public launch

### Not Part of Regular STAGING Process

**Important:** Mainnet-shadow testing is **not** part of the regular STAGING deployment process.

- STAGING = Devnet testing (every deployment)
- Mainnet-shadow = Mainnet validation (once before public launch)

---

## 13. Infrastructure as Code (IaC)

Manage infrastructure configuration as code for reproducibility and version control.

### IaC for STAGING

**DigitalOcean App Platform Spec:**

```yaml
# .do/app-staging.yaml
name: easyescrow-staging
region: sgp
services:
  - name: api
    github:
      branch: staging
      repo: your-org/easy-escrow-ai-backend
      deploy_on_push: true
    build_command: npm run build
    run_command: npm start
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: professional-xs
    http_port: 8080
    health_check:
      http_path: /health
      initial_delay_seconds: 60
      period_seconds: 30
      timeout_seconds: 10
    envs:
      - key: NODE_ENV
        value: staging
      - key: DEVNET_STAGING_PROGRAM_ID
        value: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
      # ... other non-secret env vars
databases:
  - name: staging-db
    engine: PG
    version: "15"
    size: db-s-1vcpu-1gb
    num_nodes: 1
```

**Deploy via IaC:**

```bash
# Create app from spec
doctl apps create --spec .do/app-staging.yaml

# Update existing app
doctl apps update $STAGING_APP_ID --spec .do/app-staging.yaml
```

### Benefits of IaC

✅ **Advantages:**

1. **Reproducibility**
   - Can recreate environment from scratch
   - No manual configuration steps to forget
   - Consistent across deployments

2. **Version Control**
   - Track infrastructure changes in git
   - Review infrastructure changes like code
   - Rollback infrastructure changes

3. **Documentation**
   - Spec file is documentation
   - No separate docs to maintain
   - Always up to date

4. **Disaster Recovery**
   - Quickly recreate environment if needed
   - No knowledge loss if team member leaves
   - Fast recovery from failures

---

## 14. Monitoring and Observability

STAGING requires full observability to catch issues before production.

### Monitoring Stack

**Application Monitoring:**

- Request/response logging
- Error tracking
- Performance metrics
- Business metrics (agreements created, settlements completed)

**Infrastructure Monitoring:**

- CPU/Memory usage
- Database connections and query performance
- Redis operations and queue depths
- API response times and error rates

**Blockchain Monitoring:**

- RPC call latency and errors
- Transaction confirmation times
- Failed transactions
- Program account health

### Key Metrics to Track

**Application Health:**

- API uptime (target: 99.9%)
- Response time (p50, p95, p99)
- Error rate (target: < 1%)
- Request throughput (req/sec)

**Business Metrics:**

- Agreements created per hour
- Settlement success rate (target: > 99%)
- Average settlement time
- Fee collection totals

**System Metrics:**

- Database connection pool usage
- Redis queue depth
- Memory usage
- CPU usage

**Blockchain Metrics:**

- RPC response time
- Transaction confirmation time
- Failed transaction rate
- Wallet balances (alert if low)

### Alerting Strategy

**Critical Alerts** (immediate notification):

- API down (> 1 minute downtime)
- Database connection failure
- Redis connection failure
- Settlement engine stopped
- Program upgrade authority lost

**Warning Alerts** (15 minute delay):

- High error rate (> 5%)
- Slow response times (> 1s)
- Low wallet balances (< 0.5 SOL)
- Queue backup (> 100 jobs)

**Info Alerts** (1 hour delay):

- Unusual traffic patterns
- Memory usage trends
- Deployment notifications

---

## 15. Configuration Drift Detection

Ensure STAGING configuration matches documented setup over time.

### Configuration Validation

**Automated Checks:**

```bash
# .github/workflows/config-validation.yml
name: Configuration Validation

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Check Program ID
        run: |
          ACTUAL=$(curl https://staging-api.easyescrow.ai/config/program-id)
          EXPECTED="AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
          if [ "$ACTUAL" != "$EXPECTED" ]; then
            echo "ERROR: Program ID mismatch"
            exit 1
          fi
      
      - name: Check Database Connection
        run: |
          # Verify database name
          # Verify connection pooling
          # Verify SSL mode
      
      - name: Check Redis Connection
        run: |
          # Verify Redis instance
          # Verify TLS enabled
      
      - name: Check RPC Endpoint
        run: |
          # Verify using private Helius RPC
          # Verify not using public RPC
```

### Drift Notification

**Alert team if configuration drifts from documented setup:**

- Program ID changed unexpectedly
- Using wrong RPC endpoint
- Wrong database or Redis instance
- Missing environment variables
- Incorrect security settings

---

## Related Documentation

### Strategy & Architecture
- [STAGING Reference](../STAGING_REFERENCE.md) - Complete infrastructure reference
- [STAGING CI/CD Pipeline](../deployment/STAGING_CI_CD_COMPLETE.md) - CI/CD setup and workflows
- [Anchor Configuration Setup](../deployment/ANCHOR_CONFIG_SETUP.md) - Anchor config guide
- [STAGING CI Deployment](../deployment/STAGING_CI_DEPLOYMENT.md) - CI deployment procedures

### Infrastructure
- [STAGING Database Setup](../infrastructure/STAGING_DATABASE_SETUP.md) - PostgreSQL configuration
- [STAGING Redis Setup](../infrastructure/STAGING_REDIS_SETUP.md) - Redis Cloud setup
- [STAGING RPC Setup](../infrastructure/STAGING_RPC_SETUP.md) - Helius RPC configuration

### Testing
- [E2E Testing Guide](../testing/E2E_TESTING.md) - E2E test procedures
- [STAGING Test Results](../testing/STAGING_E2E_RESULTS.md) - Test validation

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team  
**Questions?** Contact the DevOps team or update this document via PR.
