# Anchor Configuration Setup Guide

**Complete Guide to Anchor Configuration for Multi-Environment Deployments**  
**Last Updated:** January 2025  
**Related:** [STAGING Strategy](../architecture/STAGING_STRATEGY.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Anchor Configuration Files](#2-anchor-configuration-files)
3. [Environment-Specific Configurations](#3-environment-specific-configurations)
4. [Using ANCHOR_CONFIG Environment Variable](#4-using-anchor_config-environment-variable)
5. [Program ID Management](#5-program-id-management)
6. [Wallet Configuration](#6-wallet-configuration)
7. [Network Configuration](#7-network-configuration)
8. [Build and Deploy Commands](#8-build-and-deploy-commands)
9. [CI/CD Integration](#9-cicd-integration)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

### Why Multiple Anchor Configurations?

**Problem:** Single `Anchor.toml` file can only target one Program ID and one network at a time.

**Solution:** Use environment-specific Anchor configuration files:

- `Anchor.dev.toml` - For DEV environment
- `Anchor.staging.toml` - For STAGING environment
- `Anchor.prod.toml` - For PROD environment (future)

### Benefits

✅ **Advantages:**

1. **Environment Isolation**
   - Each environment has its own Program ID
   - Separate wallets for deployment
   - Independent network configurations

2. **CI/CD Friendly**
   - Single command to target specific environment
   - No manual configuration changes
   - Easy to switch between environments

3. **Version Control**
   - Configuration stored in git
   - Track configuration changes
   - Audit trail for changes

4. **Reproducible Builds**
   - Consistent configuration across team
   - No local configuration drift
   - Deterministic deployments

---

## 2. Anchor Configuration Files

### Standard Structure

```toml
[toolchain]
anchor_version = "0.30.1"      # Pin Anchor version

[features]
seeds = false                   # Don't auto-derive seeds
skip-lint = false              # Run linter
resolution = true              # Enable dependency resolution

[programs.<network>]
<program_name> = "<program_id>"

[registry]
url = "https://api.apr.dev"    # Anchor Package Registry

[provider]
cluster = "<network>"          # Network (Devnet/Mainnet)
wallet = "<path_to_wallet>"    # Deployer keypair

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"

[[test.validator.account]]
address = "<program_id>"
filename = "target/deploy/<program>.json"
```

### File Locations

```
project-root/
├── Anchor.toml              # Default (optional, or symlink to dev)
├── Anchor.dev.toml          # DEV environment
├── Anchor.staging.toml      # STAGING environment
└── Anchor.prod.toml         # PROD environment (future)
```

---

## 3. Environment-Specific Configurations

### DEV Environment (`Anchor.dev.toml`)

```toml
[toolchain]
anchor_version = "0.30.1"

[features]
seeds = false
skip-lint = false
resolution = true

[programs.devnet]
escrow = "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "Devnet"
wallet = "wallets/dev/dev-deployer.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"

[[test.validator.account]]
address = "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"
filename = "target/deploy/escrow.json"
```

**Usage:**

```bash
# Build for DEV
anchor build -C Anchor.dev.toml

# Deploy to DEV
anchor deploy -C Anchor.dev.toml
```

### STAGING Environment (`Anchor.staging.toml`)

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

[[test.validator.account]]
address = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
filename = "target/deploy/escrow.json"
```

**Usage:**

```bash
# Build for STAGING
anchor build -C Anchor.staging.toml

# Deploy to STAGING
anchor deploy -C Anchor.staging.toml
```

### PROD Environment (`Anchor.prod.toml`) - Future

```toml
[toolchain]
anchor_version = "0.30.1"

[features]
seeds = false
skip-lint = false
resolution = true

[programs.mainnet]
escrow = "<TBD-MAINNET-PROGRAM-ID>"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "Mainnet"
wallet = "<path-to-multisig-or-secure-wallet>"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"

[[test.validator.account]]
address = "<TBD-MAINNET-PROGRAM-ID>"
filename = "target/deploy/escrow.json"
```

---

## 4. Using ANCHOR_CONFIG Environment Variable

### Setting the Environment Variable

**Option 1: Command Line (Temporary)**

```bash
# Set for single command
ANCHOR_CONFIG=Anchor.staging.toml anchor build

# Set for entire session
export ANCHOR_CONFIG=Anchor.staging.toml
anchor build
anchor deploy
```

**Option 2: Shell Profile (Permanent)**

```bash
# Add to ~/.bashrc or ~/.zshrc
export ANCHOR_CONFIG=Anchor.dev.toml  # Default to DEV
```

**Option 3: .env File (Project-Specific)**

```bash
# .env.staging
ANCHOR_CONFIG=Anchor.staging.toml
```

### CI/CD Usage

**GitHub Actions:**

```yaml
- name: Build with STAGING Config
  env:
    ANCHOR_CONFIG: Anchor.staging.toml
  run: |
    anchor build
    anchor deploy
```

### Verification

**Check which config is being used:**

```bash
# Anchor will show config file path
anchor build --verbose

# Or explicitly verify
echo $ANCHOR_CONFIG
```

---

## 5. Program ID Management

### Generating Program IDs

**For each environment, generate a unique Program ID:**

```bash
# Generate DEV program keypair
solana-keygen new --outfile target/deploy/escrow-keypair.json

# Get Program ID
solana address -k target/deploy/escrow-keypair.json
# Output: 4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd

# Generate STAGING program keypair
solana-keygen new --outfile target/deploy/escrow-keypair-staging.json

# Get Program ID
solana address -k target/deploy/escrow-keypair-staging.json
# Output: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
```

### Updating Program IDs

**After generating new keypair:**

1. Update Anchor config file:
   ```toml
   [programs.devnet]
   escrow = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"  # New ID
   ```

2. Update Rust source code:
   ```rust
   // programs/escrow/src/lib.rs
   declare_id!("AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei");
   ```

3. Rebuild program:
   ```bash
   anchor build -C Anchor.staging.toml
   ```

4. Verify Program ID matches:
   ```bash
   # Check compiled program
   solana-keygen pubkey target/deploy/escrow-keypair-staging.json
   
   # Should match declare_id in source code
   ```

### Program ID Registry

**Maintain a registry of all Program IDs:**

| Environment | Network | Program ID | Keypair Location |
|-------------|---------|------------|------------------|
| DEV | Devnet | `4FQ5...Twhd` | `target/deploy/escrow-keypair.json` |
| STAGING | Devnet | `AvdX...9Zei` | `target/deploy/escrow-keypair-staging.json` |
| PROD | Mainnet | `<TBD>` | `<TBD>` |

---

## 6. Wallet Configuration

### Deployer Wallets

**Each environment needs its own deployer wallet:**

```toml
# DEV
[provider]
wallet = "wallets/dev/dev-deployer.json"

# STAGING
[provider]
wallet = "target/deploy/escrow-keypair-staging.json"

# PROD (future)
[provider]
wallet = "<secure-multisig-or-hardware-wallet>"
```

### Wallet Security

**DEV:**
- ✅ Local keypair file is acceptable
- ✅ Stored in `wallets/dev/` (gitignored)

**STAGING:**
- ✅ Keypair file stored in CI/CD secrets
- ✅ Temporary file created during deployment
- ✅ File deleted after deployment

**PROD:**
- ⚠️ Never use local keypair file
- ✅ Use hardware wallet (Ledger, Trezor)
- ✅ Or use multisig (Squads Protocol)
- ✅ Multiple signers required

### Funding Deployer Wallets

```bash
# Fund DEV deployer
solana airdrop 5 <dev-deployer-address> --url devnet

# Fund STAGING deployer
solana airdrop 5 <staging-deployer-address> --url devnet

# PROD deployer (buy SOL on mainnet)
# Transfer SOL to deployer address
```

---

## 7. Network Configuration

### Network Options

```toml
[provider]
cluster = "Localnet"   # Local validator
cluster = "Devnet"     # Public devnet
cluster = "Testnet"    # Public testnet (not recommended)
cluster = "Mainnet"    # Production mainnet
```

### Custom RPC URLs

**Override default RPC endpoint:**

```bash
# Use custom RPC for deployment
anchor deploy \
  -C Anchor.staging.toml \
  --provider.cluster devnet \
  --provider.wallet target/deploy/escrow-keypair-staging.json \
  --url https://devnet.helius-rpc.com/?api-key=<key>
```

### Network-Specific Considerations

**Devnet:**
- ✅ Free SOL from faucet
- ✅ Faster block times (testing-friendly)
- ⚠️ Can reset occasionally

**Testnet:**
- ⚠️ Less stable than devnet
- ⚠️ Used for validator testing
- ❌ Not recommended for app testing

**Mainnet:**
- ⚠️ Real SOL costs money
- ⚠️ Slower block times (production-realistic)
- ⚠️ Higher transaction fees

---

## 8. Build and Deploy Commands

### Basic Commands

**Build:**

```bash
# Build with specific config
anchor build -C Anchor.staging.toml

# Or with environment variable
export ANCHOR_CONFIG=Anchor.staging.toml
anchor build
```

**Deploy:**

```bash
# Deploy with specific config
anchor deploy -C Anchor.staging.toml

# Deploy specific program
anchor deploy -C Anchor.staging.toml --program-name escrow
```

**IDL Operations:**

```bash
# Initialize IDL
anchor idl init <PROGRAM_ID> target/idl/escrow.json -C Anchor.staging.toml

# Upgrade IDL
anchor idl upgrade <PROGRAM_ID> target/idl/escrow.json -C Anchor.staging.toml

# Fetch IDL
anchor idl fetch <PROGRAM_ID> -C Anchor.staging.toml
```

### Advanced Commands

**Verify Program Deployment:**

```bash
# Check program exists
solana program show <PROGRAM_ID> --url devnet

# Get program data
anchor idl fetch <PROGRAM_ID> -C Anchor.staging.toml -o fetched-idl.json

# Compare with local IDL
diff target/idl/escrow.json fetched-idl.json
```

**Test with Specific Config:**

```bash
# Run tests with STAGING config
anchor test -C Anchor.staging.toml
```

---

## 9. CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy to STAGING

on:
  push:
    branches:
      - staging

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
      
      - name: Install Anchor
        run: |
          cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked
      
      - name: Setup Deployer Keypair
        run: |
          echo "${{ secrets.STAGING_PROGRAM_KEYPAIR }}" > keypair.json
          chmod 600 keypair.json
      
      - name: Build with STAGING Config
        run: |
          anchor build -C Anchor.staging.toml
      
      - name: Deploy to STAGING
        run: |
          anchor deploy \
            -C Anchor.staging.toml \
            --provider.cluster devnet \
            --provider.wallet keypair.json
      
      - name: Clean up Keypair
        if: always()
        run: rm -f keypair.json
```

### Script-Based Deployment

**Create deployment script:**

```bash
#!/bin/bash
# scripts/deploy-staging.sh

set -e

ENVIRONMENT=${1:-staging}
CONFIG_FILE="Anchor.${ENVIRONMENT}.toml"

echo "Deploying to ${ENVIRONMENT} environment..."
echo "Using config: ${CONFIG_FILE}"

# Verify config exists
if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: Config file not found: $CONFIG_FILE"
  exit 1
fi

# Build
echo "Building program..."
anchor build -C "$CONFIG_FILE"

# Deploy
echo "Deploying program..."
anchor deploy -C "$CONFIG_FILE"

# Update IDL
echo "Updating IDL..."
PROGRAM_ID=$(anchor keys list -C "$CONFIG_FILE" | grep escrow | awk '{print $2}')
anchor idl upgrade "$PROGRAM_ID" target/idl/escrow.json -C "$CONFIG_FILE"

echo "Deployment complete!"
```

**Usage:**

```bash
# Deploy to STAGING
./scripts/deploy-staging.sh staging

# Deploy to DEV
./scripts/deploy-staging.sh dev
```

---

## 10. Troubleshooting

### Common Issues

**Problem:** `anchor build` uses wrong Program ID

**Solution:**

```bash
# Explicitly specify config
anchor build -C Anchor.staging.toml

# Or set environment variable
export ANCHOR_CONFIG=Anchor.staging.toml
anchor build
```

**Problem:** "Program ID mismatch" error

**Solution:**

```bash
# Verify Program ID in config matches Rust source
grep escrow Anchor.staging.toml
# Should output: escrow = "AvdX..."

# Check Rust source
grep declare_id programs/escrow/src/lib.rs
# Should output: declare_id!("AvdX...");

# If mismatch, update Rust source and rebuild
```

**Problem:** Deployment fails with "insufficient funds"

**Solution:**

```bash
# Check deployer wallet balance
DEPLOYER=$(solana address -k target/deploy/escrow-keypair-staging.json)
solana balance $DEPLOYER --url devnet

# Fund wallet if needed
solana airdrop 5 $DEPLOYER --url devnet
```

**Problem:** Can't find keypair file

**Solution:**

```bash
# Verify keypair file path in config
grep wallet Anchor.staging.toml

# Check file exists
ls -lh target/deploy/escrow-keypair-staging.json

# If missing, restore from backup or regenerate
```

**Problem:** IDL upgrade fails

**Solution:**

```bash
# Check upgrade authority
solana program show <PROGRAM_ID> --url devnet

# Verify deployer wallet is the authority
# If not, transfer authority or use correct wallet
```

### Debug Mode

**Enable verbose output:**

```bash
# Build with verbose logging
anchor build -C Anchor.staging.toml --verbose

# Deploy with verbose logging
anchor deploy -C Anchor.staging.toml --verbose
```

---

## Best Practices

### 1. Always Use -C Flag

**Don't rely on default `Anchor.toml`:**

```bash
# ❌ WRONG: Ambiguous which config
anchor build
anchor deploy

# ✅ CORRECT: Explicit config
anchor build -C Anchor.staging.toml
anchor deploy -C Anchor.staging.toml
```

### 2. Commit Config Files to Git

```bash
# ✅ DO commit
git add Anchor.dev.toml Anchor.staging.toml
git commit -m "Add environment-specific Anchor configs"

# ❌ DON'T commit keypair files
# (already in .gitignore)
```

### 3. Document Program IDs

**Maintain a registry:**

```markdown
# Program IDs

| Environment | Program ID | Config File |
|-------------|------------|-------------|
| DEV | 4FQ5...Twhd | Anchor.dev.toml |
| STAGING | AvdX...9Zei | Anchor.staging.toml |
| PROD | <TBD> | Anchor.prod.toml |
```

### 4. Test Config Before Deployment

```bash
# Dry-run build
anchor build -C Anchor.staging.toml

# Verify Program ID
anchor keys list -C Anchor.staging.toml

# Check deployer wallet
solana address -k $(grep wallet Anchor.staging.toml | awk -F'"' '{print $2}')
```

---

## Related Documentation

- [STAGING Strategy](../architecture/STAGING_STRATEGY.md) - Overall STAGING architecture
- [STAGING CI/CD Complete](STAGING_CI_CD_COMPLETE.md) - Full CI/CD setup
- [STAGING CI Deployment](STAGING_CI_DEPLOYMENT.md) - CI deployment procedures

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team  
**Questions?** Contact the DevOps team or update this document via PR.
