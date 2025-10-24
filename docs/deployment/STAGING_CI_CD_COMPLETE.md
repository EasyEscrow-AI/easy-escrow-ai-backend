# STAGING CI/CD Complete Guide

**Complete CI/CD Pipeline Setup for STAGING Environment**  
**Last Updated:** January 2025  
**Status:** ✅ Documented  
**Related:** [STAGING Strategy](../architecture/STAGING_STRATEGY.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Pipeline Architecture](#2-pipeline-architecture)
3. [GitHub Actions Workflows](#3-github-actions-workflows)
4. [Build Phase](#4-build-phase)
5. [Deploy Phase](#5-deploy-phase)
6. [Testing Phase](#6-testing-phase)
7. [Secrets Management](#7-secrets-management)
8. [Rollback Procedures](#8-rollback-procedures)
9. [Monitoring and Notifications](#9-monitoring-and-notifications)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

### CI/CD Philosophy

**STAGING deployments are CI/CD ONLY. Manual deployments are forbidden.**

**Why?**
- ✅ Consistency - Same process every time
- ✅ Auditability - Who/what/when logged
- ✅ Quality gates - Automated tests before deployment
- ✅ Security - Centralized secrets management
- ✅ Rollback - Built-in rollback capability

### Pipeline Goals

1. **Build Once** - Generate artifacts once, use everywhere
2. **Test Thoroughly** - Multiple test stages (unit, integration, E2E)
3. **Deploy Safely** - Manual approval gates, checksums, rollback capability
4. **Monitor Continuously** - Track metrics, alert on issues
5. **Audit Everything** - Full logs, notifications, approvals

---

## 2. Pipeline Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    STAGING CI/CD Pipeline                    │
└─────────────────────────────────────────────────────────────┘

Trigger: Push to `staging` branch or manual dispatch
    ↓
┌─────────────────────────────────────────────────────────────┐
│ BUILD PHASE                                                  │
│ ├─ Checkout code                                             │
│ ├─ Pin toolchains (Solana 1.18.x, Rust 1.75.0)             │
│ ├─ Install dependencies                                      │
│ ├─ Run linter (ESLint, cargo clippy)                        │
│ ├─ Run unit tests (no blockchain)                           │
│ ├─ Build Solana program (anchor build)                      │
│ ├─ Build backend (npm run build)                            │
│ ├─ Generate checksums (SHA-256)                             │
│ └─ Upload artifacts to CI storage                           │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ APPROVAL GATE (Manual)                                       │
│ • Team member reviews build                                  │
│ • Approves or rejects deployment                             │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ DEPLOY PHASE                                                 │
│ ├─ Download artifacts from CI storage                       │
│ ├─ Verify checksums                                          │
│ ├─ Deploy Solana program (anchor deploy -C Anchor.staging)  │
│ ├─ Update IDL on-chain                                       │
│ ├─ Deploy backend to DO App Platform                        │
│ ├─ Run database migrations                                   │
│ └─ Wait for health checks                                    │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ TEST PHASE                                                   │
│ ├─ Run smoke tests (health, connectivity)                   │
│ ├─ Run canary tests (minimal escrow swap)                   │
│ ├─ Run E2E tests (full scenarios)                           │
│ └─ Verify metrics (error rate, response time)               │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ NOTIFICATION                                                 │
│ • Send Slack/Discord notification                            │
│ • Update deployment dashboard                                │
│ • Mark as release candidate if all tests pass                │
└─────────────────────────────────────────────────────────────┘
```

### Workflow Files

**Location:** `.github/workflows/`

| Workflow File | Trigger | Purpose |
|---------------|---------|---------|
| `build-staging.yml` | Push to `staging` | Build and test |
| `deploy-staging.yml` | Manual approval after build | Deploy to STAGING |
| `rollback-staging.yml` | Manual dispatch | Rollback deployment |
| `smoke-test-staging.yml` | After deployment | Quick health checks |
| `e2e-test-staging.yml` | After smoke tests | Full E2E tests |

---

## 3. GitHub Actions Workflows

### Build Workflow

**File:** `.github/workflows/build-staging.yml`

```yaml
name: Build STAGING

on:
  push:
    branches:
      - staging
  workflow_dispatch:

env:
  RUST_VERSION: 1.75.0
  SOLANA_VERSION: 1.18.17
  ANCHOR_VERSION: 0.30.1

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install Rust Toolchain
        uses: actions-rs/toolchain@v1
        with:
          toolchain: ${{ env.RUST_VERSION }}
          profile: minimal
          override: true
      
      - name: Cache Rust Dependencies
        uses: actions/cache@v3
        with:
          path: |
            ~/.cargo/bin/
            ~/.cargo/registry/index/
            ~/.cargo/registry/cache/
            ~/.cargo/git/db/
            target/
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
      
      - name: Install Solana CLI
        run: |
          sh -c "$(curl -sSfL https://release.solana.com/v${{ env.SOLANA_VERSION }}/install)"
          echo "$HOME/.local/share/solana/install/active_release/bin" >> $GITHUB_PATH
      
      - name: Install Anchor CLI
        run: |
          cargo install --git https://github.com/coral-xyz/anchor --tag v${{ env.ANCHOR_VERSION }} anchor-cli --locked
      
      - name: Install Node Dependencies
        run: npm ci
      
      - name: Run Linter
        run: |
          npm run lint
          cargo clippy -- -D warnings
      
      - name: Run Unit Tests
        run: npm test
      
      - name: Build Solana Program
        run: |
          anchor build -C Anchor.staging.toml
      
      - name: Build Backend
        run: npm run build
      
      - name: Generate Checksums
        run: |
          shasum -a 256 target/deploy/escrow.so > target/deploy/escrow.so.sha256
          shasum -a 256 target/idl/escrow.json > target/idl/escrow.json.sha256
          shasum -a 256 dist/index.js > dist/index.js.sha256
      
      - name: Upload Build Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: staging-build-${{ github.sha }}
          path: |
            target/deploy/escrow.so
            target/deploy/escrow.so.sha256
            target/idl/escrow.json
            target/idl/escrow.json.sha256
            dist/
            dist/index.js.sha256
          retention-days: 90
      
      - name: Notify Build Success
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'STAGING build successful - Ready for deployment'
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
        if: success()
      
      - name: Notify Build Failure
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'STAGING build failed - Check logs'
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
        if: failure()
```

### Deploy Workflow

**File:** `.github/workflows/deploy-staging.yml`

```yaml
name: Deploy to STAGING

on:
  workflow_dispatch:
    inputs:
      build_sha:
        description: 'Git SHA of build to deploy'
        required: true
        type: string

jobs:
  approve:
    runs-on: ubuntu-latest
    environment:
      name: staging-approval
    steps:
      - name: Wait for Approval
        run: echo "Deployment to STAGING approved"
  
  deploy:
    runs-on: ubuntu-latest
    needs: approve
    
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          ref: ${{ inputs.build_sha }}
      
      - name: Download Build Artifacts
        uses: actions/download-artifact@v3
        with:
          name: staging-build-${{ inputs.build_sha }}
      
      - name: Verify Checksums
        run: |
          shasum -c target/deploy/escrow.so.sha256
          shasum -c target/idl/escrow.json.sha256
          shasum -c dist/index.js.sha256
      
      - name: Install Solana CLI
        run: |
          sh -c "$(curl -sSfL https://release.solana.com/v1.18.17/install)"
          echo "$HOME/.local/share/solana/install/active_release/bin" >> $GITHUB_PATH
      
      - name: Install Anchor CLI
        run: |
          cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked
      
      - name: Setup Deployer Keypair
        run: |
          echo "${{ secrets.STAGING_PROGRAM_KEYPAIR }}" > target/deploy/escrow-keypair-staging.json
          chmod 600 target/deploy/escrow-keypair-staging.json
      
      - name: Deploy Solana Program
        run: |
          anchor deploy \
            -C Anchor.staging.toml \
            --provider.cluster devnet \
            --provider.wallet target/deploy/escrow-keypair-staging.json
      
      - name: Update IDL
        run: |
          anchor idl upgrade AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
            target/idl/escrow.json \
            -C Anchor.staging.toml \
            --provider.cluster devnet \
            --provider.wallet target/deploy/escrow-keypair-staging.json
      
      - name: Install doctl
        uses: digitalocean/action-doctl@v2
        with:
          token: ${{ secrets.DO_API_TOKEN }}
      
      - name: Deploy Backend to App Platform
        run: |
          doctl apps create-deployment ${{ secrets.STAGING_APP_ID }} --wait
      
      - name: Wait for Health Check
        run: |
          for i in {1..30}; do
            if curl -f https://staging-api.easyescrow.ai/health; then
              echo "Health check passed"
              exit 0
            fi
            echo "Waiting for health check... ($i/30)"
            sleep 10
          done
          echo "Health check failed"
          exit 1
      
      - name: Notify Deployment Success
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'STAGING deployment successful - Running tests'
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
        if: success()
      
      - name: Notify Deployment Failure
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'STAGING deployment failed - Initiate rollback'
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
        if: failure()
```

### Rollback Workflow

**File:** `.github/workflows/rollback-staging.yml`

```yaml
name: Rollback STAGING

on:
  workflow_dispatch:
    inputs:
      target_deployment_id:
        description: 'DO App Platform deployment ID to rollback to'
        required: true
        type: string
      reason:
        description: 'Reason for rollback'
        required: true
        type: string

jobs:
  rollback:
    runs-on: ubuntu-latest
    
    steps:
      - name: Install doctl
        uses: digitalocean/action-doctl@v2
        with:
          token: ${{ secrets.DO_API_TOKEN }}
      
      - name: Rollback Backend
        run: |
          # DigitalOcean App Platform doesn't have direct rollback command
          # Need to redeploy previous commit or restore previous spec
          doctl apps create-deployment ${{ secrets.STAGING_APP_ID }} --wait
      
      - name: Verify Rollback
        run: |
          curl -f https://staging-api.easyescrow.ai/health || exit 1
      
      - name: Notify Rollback
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'STAGING rolled back - Reason: ${{ inputs.reason }}'
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## 4. Build Phase

### Toolchain Pinning

**Critical:** Pin exact versions to ensure reproducible builds.

```yaml
env:
  RUST_VERSION: 1.75.0        # Pin Rust
  SOLANA_VERSION: 1.18.17     # Pin Solana CLI
  ANCHOR_VERSION: 0.30.1      # Pin Anchor CLI
  NODE_VERSION: 20            # Pin Node.js
```

**Why Pin?**
- Different toolchain versions can produce different binaries
- Ensures reproducibility across builds
- Prevents unexpected breakages from toolchain updates

### Caching Strategy

**Cache Rust Dependencies:**

```yaml
- name: Cache Rust Dependencies
  uses: actions/cache@v3
  with:
    path: |
      ~/.cargo/bin/
      ~/.cargo/registry/index/
      ~/.cargo/registry/cache/
      ~/.cargo/git/db/
      target/
    key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
```

**Cache Node Dependencies:**

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'  # Automatically caches node_modules
```

**Benefits:**
- ✅ Faster builds (2-3x speedup)
- ✅ Reduced CI minutes usage
- ✅ More consistent build times

### Checksum Generation

**Generate checksums for all artifacts:**

```bash
# Solana program
shasum -a 256 target/deploy/escrow.so > target/deploy/escrow.so.sha256

# IDL
shasum -a 256 target/idl/escrow.json > target/idl/escrow.json.sha256

# Backend build
shasum -a 256 dist/index.js > dist/index.js.sha256
```

**Verify before deployment:**

```bash
shasum -c target/deploy/escrow.so.sha256
shasum -c target/idl/escrow.json.sha256
shasum -c dist/index.js.sha256
```

---

## 5. Deploy Phase

### Manual Approval Gate

**Setup GitHub Environment:**

1. Navigate to: **GitHub → Settings → Environments**
2. Create environment: `staging-approval`
3. Configure protection rules:
   - ✅ Required reviewers: Select team members (1-2 people)
   - ✅ Wait timer: 0 minutes (immediate approval)
   - ✅ Deployment branches: `staging` only

**Approval Process:**

1. Build completes successfully
2. Designated reviewer receives notification
3. Reviewer checks:
   - ✅ Build logs for errors
   - ✅ Test results
   - ✅ Changes in this deployment
4. Reviewer approves or rejects
5. If approved, deploy phase begins

### Deployment Steps

**1. Program Deployment:**

```bash
# Deploy to STAGING Program ID
anchor deploy \
  -C Anchor.staging.toml \
  --provider.cluster devnet \
  --provider.wallet target/deploy/escrow-keypair-staging.json
```

**2. IDL Update:**

```bash
# Update on-chain IDL
anchor idl upgrade AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  target/idl/escrow.json \
  -C Anchor.staging.toml
```

**3. Backend Deployment:**

```bash
# Deploy to DigitalOcean App Platform
doctl apps create-deployment $STAGING_APP_ID --wait
```

**4. Database Migration:**

```bash
# Run migrations on STAGING database
npm run staging:migrate
```

---

## 6. Testing Phase

### Smoke Tests

**Run immediately after deployment:**

```bash
npm run test:staging:smoke
```

**Test Coverage:**
- ✅ API health endpoint
- ✅ Database connectivity
- ✅ Redis connectivity
- ✅ Solana RPC connectivity
- ✅ Program account accessible

**Pass Criteria:** All smoke tests pass (< 30 seconds)

### Canary Tests

**Run small, real transactions:**

```bash
npm run test:staging:canary
```

**Test Coverage:**
- ✅ Create escrow with minimal amounts
- ✅ Deposit NFT and USDC
- ✅ Complete settlement
- ✅ Verify fees collected

**Pass Criteria:** Canary transaction completes successfully (< 2 minutes)

### E2E Tests

**Run full test suite:**

```bash
npm run test:staging:e2e
```

**Test Coverage:**
- ✅ Happy path (create → deposit → settle)
- ✅ Expiry path (partial → expire → refund)
- ✅ Admin cancellation
- ✅ Concurrent operations
- ✅ Idempotency handling
- ✅ Webhook delivery

**Pass Criteria:** All E2E tests pass (< 15 minutes)

---

## 7. Secrets Management

### GitHub Secrets

**Required Secrets:**

```bash
# Program and Wallets
STAGING_PROGRAM_KEYPAIR=<json-keypair>
DEVNET_STAGING_SENDER_PRIVATE_KEY=<base58-key>
DEVNET_STAGING_RECEIVER_PRIVATE_KEY=<base58-key>
DEVNET_STAGING_ADMIN_PRIVATE_KEY=<base58-key>
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=<base58-key>

# Infrastructure
STAGING_DATABASE_URL=<postgres-url>
STAGING_REDIS_URL=<redis-url>
STAGING_SOLANA_RPC_URL=<helius-url>

# Application
STAGING_JWT_SECRET=<random-secret>
STAGING_WEBHOOK_SECRET=<random-secret>

# DigitalOcean
DO_API_TOKEN=<do-api-token>
STAGING_APP_ID=<app-platform-id>

# Notifications
SLACK_WEBHOOK_URL=<slack-webhook>
```

### Secret Rotation

**Quarterly secret rotation:**

1. Generate new secrets
2. Update GitHub Secrets
3. Update DigitalOcean App Platform vars
4. Redeploy application
5. Verify all services working
6. Document rotation in changelog

---

## 8. Rollback Procedures

### Automated Rollback

**Trigger rollback workflow:**

```bash
gh workflow run rollback-staging.yml \
  --field target_deployment_id=<deployment-id> \
  --field reason="Failed smoke tests"
```

### Manual Rollback

**Via DigitalOcean Console:**

1. Navigate to: **App Platform → easyescrow-staging → Deployments**
2. Find last successful deployment
3. Click: **Rollback to this deployment**
4. Confirm and wait for completion

**Via Git:**

```bash
# Checkout last working commit
git checkout <last-good-commit>

# Force push to staging branch
git push origin HEAD:staging --force
```

### Post-Rollback Checklist

- ✅ Run smoke tests
- ✅ Check error logs
- ✅ Verify metrics return to baseline
- ✅ Notify team
- ✅ Create incident report
- ✅ Fix issue in new branch
- ✅ Redeploy with fix

---

## 9. Monitoring and Notifications

### Slack Notifications

**Configure Slack webhook:**

1. Create Slack app or incoming webhook
2. Add webhook URL to GitHub Secrets (`SLACK_WEBHOOK_URL`)
3. Configure notifications in workflows

**Notification Events:**
- ✅ Build started
- ✅ Build succeeded
- ❌ Build failed
- ✅ Deployment started
- ✅ Deployment succeeded
- ❌ Deployment failed
- ✅ Tests passed
- ❌ Tests failed
- ⚠️ Rollback initiated

### Deployment Dashboard

**Track deployments:**

- Current deployment version (git SHA)
- Deployment history (last 10 deployments)
- Success/failure rates
- Average deployment time
- Rollback frequency

---

## 10. Troubleshooting

### Build Failures

**Problem:** Build fails with toolchain errors

**Solution:**
```bash
# Verify toolchain versions match
rustc --version  # Should be 1.75.0
solana --version  # Should be 1.18.17
anchor --version  # Should be 0.30.1
```

**Problem:** Out of memory during build

**Solution:**
```yaml
# Increase memory for GitHub Actions runner
# Use larger runner (enterprise feature) or optimize build
```

### Deployment Failures

**Problem:** Program deployment fails with "insufficient funds"

**Solution:**
```bash
# Fund deployer wallet
solana airdrop 5 <deployer-address> --url devnet
```

**Problem:** IDL upgrade fails with "authority mismatch"

**Solution:**
```bash
# Verify upgrade authority
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet
```

### Test Failures

**Problem:** Smoke tests fail immediately after deployment

**Solution:**
```bash
# Check health endpoint manually
curl https://staging-api.easyescrow.ai/health

# Check application logs
doctl apps logs $STAGING_APP_ID --type run | tail -100
```

---

## Related Documentation

- [STAGING Strategy](../architecture/STAGING_STRATEGY.md) - Overall STAGING architecture
- [Anchor Config Setup](ANCHOR_CONFIG_SETUP.md) - Anchor configuration guide
- [STAGING CI Deployment](STAGING_CI_DEPLOYMENT.md) - CI deployment procedures

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team  
**Questions?** Contact the DevOps team or update this document via PR.

