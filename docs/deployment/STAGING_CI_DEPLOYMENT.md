# STAGING CI/CD Deployment Guide

Complete guide for deploying the Escrow program to STAGING environment using CI/CD principles.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [CI/CD Pipeline Architecture](#cicd-pipeline-architecture)
- [Build Process](#build-process)
- [Deployment Process](#deployment-process)
- [Post-Deployment Steps](#post-deployment-steps)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

## Overview

The STAGING environment deploys the Escrow program to Devnet using a **build-once-deploy-everywhere** approach. This ensures:

- **Consistent artifacts** across all environments
- **Reproducible builds** with pinned toolchains
- **Artifact verification** with SHA-256 checksums
- **Isolated environments** with separate program IDs and RPC endpoints
- **Audit trail** with deployment logs and git commit tracking

### Environment Details

| Property | Value |
|----------|-------|
| **Environment** | STAGING |
| **Network** | Devnet |
| **Program ID** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` |
| **Anchor Config** | `Anchor.staging.toml` |
| **Deployer Keypair** | `keys/staging-deployer.json` |
| **RPC Endpoint** | Private Devnet RPC (configured in CI) |

## Prerequisites

### Required Tools

Ensure the following tools are installed and properly versioned:

```bash
# Solana CLI 1.18.x
solana --version  # Should show 1.18.x

# Anchor CLI 0.30.x
anchor --version  # Should show 0.30.x

# Rust 1.75.x
rustc --version   # Should show 1.75.x
```

### Required Files

- ✅ `Anchor.staging.toml` - Anchor configuration for STAGING
- ✅ `keys/staging-deployer.json` - Deployer keypair (funded with 5+ SOL)
- ✅ `keys/staging-admin.json` - Admin keypair for post-deploy operations
- ✅ `rust-toolchain.toml` - Pinned Rust toolchain version

### Required Secrets (CI Environment)

```bash
# In your CI/CD system (e.g., GitHub Actions, GitLab CI)
STAGING_DEPLOYER_KEYPAIR    # Base58 or JSON of deployer keypair
STAGING_RPC_URL             # Private devnet RPC endpoint
STAGING_ADMIN_KEYPAIR       # Optional: For post-deploy operations
```

## CI/CD Pipeline Architecture

### Build-Once-Deploy-Everywhere Principle

```
┌─────────────────────────────────────────────────────────┐
│                      CI Build Stage                      │
│  (Runs once on merge to main or release tag)            │
├─────────────────────────────────────────────────────────┤
│  1. Pin toolchains (Solana 1.18.x, Rust 1.75.0)         │
│  2. Build program: anchor build                          │
│  3. Generate checksums: SHA-256                          │
│  4. Store artifacts + manifest                           │
└─────────────────────────────────────────────────────────┘
                            │
                            ├──────────────┬─────────────┬────────────┐
                            ▼              ▼             ▼            ▼
                       ┌─────────┐   ┌─────────┐   ┌─────────┐  ┌──────────┐
                       │   DEV   │   │ STAGING │   │ STAGING │  │   PROD   │
                       │ Localnet│   │  Devnet │   │ Testnet │  │ Mainnet  │
                       └─────────┘   └─────────┘   └─────────┘  └──────────┘
                                           │
                                           ▼
                        ┌──────────────────────────────────────┐
                        │    STAGING Deploy Stage              │
                        │  (Promotes same .so to STAGING)      │
                        ├──────────────────────────────────────┤
                        │  1. Verify artifact checksums        │
                        │  2. Deploy with Anchor.staging.toml  │
                        │  3. Upload/Update IDL                │
                        │  4. Run post-deploy migrations       │
                        │  5. Execute smoke tests              │
                        └──────────────────────────────────────┘
```

### Key Benefits

- ✅ **Same binary** deployed to DEV, STAGING, and PROD
- ✅ **Artifact integrity** verified with checksums
- ✅ **Reproducible** builds with pinned versions
- ✅ **Environment isolation** with separate configs
- ✅ **Audit trail** with deployment manifests

## Build Process

### Step 1: Build with Checksums

The build script creates the program binary and generates checksums for verification.

#### Local Testing

```powershell
# Clean build (recommended)
npm run staging:build:clean

# Or regular build
npm run staging:build
```

#### CI Build Script

```yaml
# .github/workflows/build.yml (example)
name: Build Escrow Program

on:
  push:
    branches: [main, release/*]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # Install pinned toolchains
      - name: Install Solana
        run: sh -c "$(curl -sSfL https://release.solana.com/v1.18.25/install)"
      
      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: 1.75.0
          override: true
      
      - name: Install Anchor
        run: cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli
      
      # Build program
      - name: Build Program
        run: anchor build
      
      # Generate checksums
      - name: Generate Checksums
        run: |
          shasum -a 256 target/deploy/escrow.so > target/deploy/escrow.so.sha256
          shasum -a 256 target/idl/escrow.json > target/idl/escrow.json.sha256
      
      # Upload artifacts
      - name: Upload Build Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: escrow-program
          path: |
            target/deploy/escrow.so
            target/deploy/escrow.so.sha256
            target/idl/escrow.json
            target/idl/escrow.json.sha256
```

#### Build Output

The build process generates:

```
target/
├── deploy/
│   ├── escrow.so              # Program binary
│   ├── escrow.so.sha256       # Binary checksum
│   └── build-manifest.json    # Build metadata
└── idl/
    ├── escrow.json            # Program IDL
    └── escrow.json.sha256     # IDL checksum
```

#### Build Manifest

The `build-manifest.json` contains:

```json
{
  "buildTimestamp": "2025-01-20 15:30:45",
  "gitCommit": "abc123def456...",
  "gitBranch": "main",
  "toolchain": {
    "solana": "1.18.25",
    "anchor": "0.30.1",
    "rust": "1.75.0"
  },
  "artifacts": {
    "program": {
      "file": "target/deploy/escrow.so",
      "size": 524288,
      "sha256": "d4f3c5b2a1..."
    },
    "idl": {
      "file": "target/idl/escrow.json",
      "size": 12345,
      "sha256": "a1b2c3d4e5..."
    }
  }
}
```

## Deployment Process

### Step 2: Deploy to STAGING

The deployment script promotes the verified artifacts to STAGING.

#### Local Deployment (Testing)

```powershell
# Deploy to STAGING
npm run staging:deploy

# Or with dry-run to preview
pwsh ./scripts/deployment/staging/deploy-to-staging.ps1 -DryRun
```

#### CI Deploy Script

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to STAGING

on:
  workflow_dispatch:  # Manual trigger only
  push:
    tags:
      - 'v*-rc*'      # e.g., v1.0.0-rc1

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging  # Requires manual approval
    
    steps:
      - uses: actions/checkout@v3
      
      # Download artifacts from build job
      - name: Download Build Artifacts
        uses: actions/download-artifact@v3
        with:
          name: escrow-program
          path: target/
      
      # Install Solana CLI
      - name: Install Solana
        run: sh -c "$(curl -sSfL https://release.solana.com/v1.18.25/install)"
      
      # Install Anchor CLI
      - name: Install Anchor
        run: cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli
      
      # Setup deployer keypair
      - name: Setup Deployer Keypair
        run: |
          mkdir -p keys
          echo "${{ secrets.STAGING_DEPLOYER_KEYPAIR }}" > keys/staging-deployer.json
      
      # Verify checksums
      - name: Verify Artifact Checksums
        run: |
          cd target/deploy
          sha256sum -c escrow.so.sha256
          cd ../idl
          sha256sum -c escrow.json.sha256
      
      # Set RPC endpoint
      - name: Configure RPC Endpoint
        run: |
          export ANCHOR_PROVIDER_URL="${{ secrets.STAGING_RPC_URL }}"
      
      # Deploy program
      - name: Deploy Program
        run: |
          anchor deploy \
            -C Anchor.staging.toml \
            --provider.cluster devnet \
            --provider.wallet keys/staging-deployer.json
      
      # Verify deployment
      - name: Verify Deployment
        run: |
          solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet
      
      # Upload/Update IDL
      - name: Upload IDL
        run: |
          # Check if IDL exists
          if anchor idl fetch AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --provider.cluster devnet 2>&1 | grep -q "IDL not found"; then
            anchor idl init AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
              target/idl/escrow.json \
              -C Anchor.staging.toml \
              --provider.cluster devnet \
              --provider.wallet keys/staging-deployer.json
          else
            anchor idl upgrade AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
              target/idl/escrow.json \
              -C Anchor.staging.toml \
              --provider.cluster devnet \
              --provider.wallet keys/staging-deployer.json
          fi
      
      # Save deployment record
      - name: Save Deployment Record
        run: |
          cat > deployment-record.json <<EOF
          {
            "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
            "environment": "STAGING",
            "network": "devnet",
            "programId": "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei",
            "gitCommit": "${{ github.sha }}",
            "gitTag": "${{ github.ref_name }}",
            "deployer": "$(solana-keygen pubkey keys/staging-deployer.json)"
          }
          EOF
```

## Post-Deployment Steps

### Step 3: Post-Deploy Migration

After successful deployment, run initialization and migrations:

```powershell
# Run post-deploy migrations
npm run staging:migrate

# Fund test wallets
npm run staging:fund-wallets
```

#### What Migration Does

1. **Verifies program deployment** on devnet
2. **Checks admin keypair** and balance
3. **Initializes config accounts** (if required by program)
4. **Verifies PDA structure** for escrow operations
5. **Logs migration details** for audit trail

### Step 4: Fund Test Wallets

The STAGING environment uses dedicated test wallets:

| Wallet | Address | Purpose | Recommended Balance |
|--------|---------|---------|---------------------|
| Sender | `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z` | Sender for test escrows | 5 SOL |
| Receiver | `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4` | Receiver for test escrows | 5 SOL |
| Admin | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` | Admin operations | 3 SOL |
| Fee Collector | `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ` | Fee collection | 3 SOL |

```powershell
# Automatically fund all wallets
npm run staging:fund-wallets
```

## Verification

### Step 5: Run Smoke Tests

Smoke tests verify the deployment is functional:

```powershell
# Run smoke tests
npm run test:staging:smoke
```

#### What Smoke Tests Verify

✅ **Network connectivity** to devnet  
✅ **Program exists** and is executable  
✅ **IDL is loaded** correctly  
✅ **Core instructions** are available  
✅ **PDA derivation** works correctly  
✅ **Token Program** integration is correct

#### Expected Output

```
STAGING Smoke Tests

  Network Connectivity
    ✓ should connect to devnet
    ✓ should have sufficient admin balance

  Program Deployment
    ✓ should find program on devnet
    ✓ should load program IDL

  PDA Derivation
    ✓ should derive escrow PDA correctly

  Token Program Integration
    ✓ should reference correct Token Program

  Explorer Links
    ✓ should generate valid explorer links


  7 passing (3s)

✅ STAGING Smoke Tests Complete!
   All critical checks passed
   STAGING environment is ready for testing
```

### Manual Verification Commands

```bash
# Verify program exists
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet

# Check program size and upgrade authority
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet --programs

# Fetch IDL
anchor idl fetch AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --provider.cluster devnet

# View in explorer
# https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet
```

## CI/CD Best Practices

### ✅ DO

- **Build once** and promote the same binary to all environments
- **Pin toolchain versions** for reproducible builds
- **Verify checksums** before deployment
- **Use separate RPC endpoints** per environment
- **Require manual approval** before STAGING deployment
- **Run smoke tests** after every deployment
- **Log all deployments** with git commit SHA and timestamp
- **Use environment-specific configs** (Anchor.staging.toml)

### ❌ DON'T

- ❌ Deploy directly from a developer laptop
- ❌ Build program multiple times for different environments
- ❌ Skip checksum verification
- ❌ Use public RPC endpoints for STAGING
- ❌ Deploy without running tests
- ❌ Forget to upload IDL after deployment
- ❌ Use the same deployer keypair for all environments

## Troubleshooting

### Build Failures

#### Issue: `anchor build` fails with version mismatch

**Solution:**
```bash
# Verify Rust version
rustc --version  # Should be 1.75.x

# If wrong version, install correct one
rustup install 1.75.0
rustup default 1.75.0
```

#### Issue: Build succeeds but checksums differ

**Solution:**
```powershell
# Clean and rebuild
npm run staging:build:clean

# Verify toolchain versions match exactly
solana --version
anchor --version
rustc --version
```

### Deployment Failures

#### Issue: Insufficient balance for deployment

**Solution:**
```bash
# Check deployer balance
solana balance $(solana-keygen pubkey keys/staging-deployer.json) --url devnet

# Airdrop more SOL
solana airdrop 5 $(solana-keygen pubkey keys/staging-deployer.json) --url devnet
```

#### Issue: Program ID mismatch

**Solution:**
```bash
# Verify Program ID in Anchor.staging.toml matches
grep "escrow =" Anchor.staging.toml
# Should show: escrow = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"

# Verify deployer keypair
solana-keygen pubkey keys/staging-deployer.json
```

#### Issue: IDL upload fails

**Solution:**
```bash
# Check if IDL already exists
anchor idl fetch AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --provider.cluster devnet

# If exists, use upgrade instead of init
anchor idl upgrade AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  target/idl/escrow.json \
  -C Anchor.staging.toml \
  --provider.cluster devnet
```

### Smoke Test Failures

#### Issue: Cannot connect to devnet

**Solution:**
```bash
# Test connection manually
solana cluster-version --url devnet

# Try alternate RPC endpoint
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
```

#### Issue: Admin wallet has no balance

**Solution:**
```bash
# Airdrop to admin wallet
solana airdrop 3 $(solana-keygen pubkey keys/staging-admin.json) --url devnet
```

## Deployment Checklist

Before deploying to STAGING:

- [ ] All tests pass on CI
- [ ] Build artifacts generated with checksums
- [ ] Checksums verified
- [ ] Deployer wallet funded with 5+ SOL
- [ ] `Anchor.staging.toml` configured correctly
- [ ] Smoke tests ready to run
- [ ] Manual approval obtained (if required)

After deploying to STAGING:

- [ ] Program verified on devnet explorer
- [ ] IDL uploaded successfully
- [ ] Post-deploy migration completed
- [ ] Test wallets funded
- [ ] Smoke tests passed
- [ ] Deployment logged with git SHA
- [ ] Team notified of deployment

## Related Documentation

- [Program IDs Registry](../PROGRAM_IDS.md) - All program IDs across environments
- [STAGING Strategy](../architecture/STAGING_STRATEGY.md) - Overall STAGING approach
- [Anchor Config Setup](ANCHOR_CONFIG_SETUP.md) - How Anchor configs are structured
- [STAGING Wallets](../STAGING_WALLETS.md) - Wallet addresses and keypairs

## Support

For deployment issues:
- Check [Troubleshooting](#troubleshooting) section above
- Review CI logs for detailed error messages
- Verify all prerequisites are met
- Consult Solana/Anchor documentation for specific errors

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team

