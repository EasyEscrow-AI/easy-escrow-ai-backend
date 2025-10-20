# Anchor Configuration Setup

This document explains the Anchor configuration files for different environments.

## Overview

We use **separate Anchor configuration files** for each environment to enable CI/CD-based deployments with distinct Program IDs:

- `Anchor.toml` - Default (localnet)
- `Anchor.dev.toml` - DEV environment (devnet)
- `Anchor.staging.toml` - STAGING environment (devnet)
- `Anchor.prod.toml` - PROD environment (mainnet, future)

## Configuration Files

### Anchor.dev.toml

For **DEV environment** deployments on devnet:

```toml
[programs.devnet]
escrow = "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"

[provider]
cluster = "Devnet"
wallet = "~/.config/solana/id.json"
```

**Usage:**
```bash
anchor build -C Anchor.dev.toml
anchor deploy -C Anchor.dev.toml
```

### Anchor.staging.toml

For **STAGING environment** deployments on devnet:

```toml
[programs.devnet]
escrow = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"

[provider]
cluster = "Devnet"
wallet = "keys/staging-deployer.json"
```

**Usage:**
```bash
anchor build  # Build once, same artifacts for all environments
anchor deploy -C Anchor.staging.toml --provider.cluster devnet
```

## Toolchain Pinning

### rust-toolchain.toml

Ensures consistent Rust version across all environments:

```toml
[toolchain]
channel = "1.75.0"
components = ["rustfmt", "clippy"]
targets = ["wasm32-unknown-unknown"]
```

This file is automatically read by `rustup` to install/use the correct Rust version.

## Directory Structure

```
project-root/
├── Anchor.toml              # Default (localnet)
├── Anchor.dev.toml          # DEV environment
├── Anchor.staging.toml      # STAGING environment
├── Anchor.prod.toml         # PROD environment (future)
├── rust-toolchain.toml      # Rust version pinning
├── keys/
│   ├── .gitkeep            # Preserve directory in git
│   └── staging-deployer.json  # STAGING deployer (NOT in git)
└── target/deploy/
    ├── escrow-keypair.json         # DEV program keypair
    └── escrow-keypair-staging.json # STAGING program keypair
```

## Deployer Keypairs

### keys/ Directory

The `keys/` directory stores **deployer keypairs** (wallets that pay for deployment costs):

- **NOT the program keypairs** (those are in `target/deploy/`)
- **NOT committed to git** (in `.gitignore`)
- Used by CI/CD for deployments

### Creating Deployer Keypairs

```bash
# Create staging deployer keypair
solana-keygen new -o keys/staging-deployer.json --force

# Fund with devnet SOL for deployment costs
solana airdrop 5 keys/staging-deployer.json --url devnet

# Verify balance
solana balance keys/staging-deployer.json --url devnet
```

## Usage in CI/CD

### Build Phase (Once)

```bash
# Install pinned toolchains
solana-install init 1.18.x
rustup show  # Reads rust-toolchain.toml

# Build program once
anchor build

# Same .so and IDL will be used for all environments
```

### Deploy Phase (Environment-Specific)

```bash
# Deploy to DEV
anchor deploy -C Anchor.dev.toml

# Deploy to STAGING (same artifacts!)
anchor deploy -C Anchor.staging.toml

# Deploy to PROD (future, same artifacts!)
anchor deploy -C Anchor.prod.toml
```

## Environment Variables

You can also use environment variables:

```bash
# Set config file
export ANCHOR_CONFIG=Anchor.staging.toml

# Deploy with environment config
anchor deploy
```

## CI Secrets

For **GitHub Actions**, configure these secrets:

```
STAGING_DEPLOYER_KEYPAIR  # Contents of keys/staging-deployer.json
STAGING_PROGRAM_ID        # AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
STAGING_RPC_URL           # Private RPC endpoint
```

## Security Notes

### ⚠️ **NEVER Commit These Files:**

```gitignore
keys/*.json
!keys/.gitkeep
target/deploy/*.json
.env*
!.env*.example
```

### ✅ **Safe to Commit:**

- `Anchor.*.toml` files (contain public Program IDs only)
- `rust-toolchain.toml`
- `.env.*.example` templates
- `keys/.gitkeep`

## Verification

### Verify Configurations

```bash
# Check DEV config
anchor build -C Anchor.dev.toml
# Should show DEV Program ID: 4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd

# Check STAGING config
anchor build -C Anchor.staging.toml
# Should show STAGING Program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
```

### Verify Toolchain

```bash
# Check Rust version
rustc --version
# Should output: rustc 1.75.0

# Check Solana version
solana --version
# Should output: solana-cli 1.18.x
```

## Troubleshooting

### "Program ID mismatch" Error

**Cause:** Program keypair doesn't match the ID in Anchor config.

**Solution:**
```bash
# Extract actual Program ID from keypair
solana address -k target/deploy/escrow-keypair-staging.json

# Update Anchor.staging.toml with the correct ID
```

### "Deployer has insufficient funds"

**Cause:** Deployer keypair doesn't have enough SOL.

**Solution:**
```bash
# Check balance
solana balance keys/staging-deployer.json --url devnet

# Add more SOL
solana airdrop 5 keys/staging-deployer.json --url devnet
```

### "Cannot find wallet file"

**Cause:** Deployer keypair not created or not in correct location.

**Solution:**
```bash
# Create deployer keypair
solana-keygen new -o keys/staging-deployer.json

# Or copy from secure location
cp /path/to/backup/staging-deployer.json keys/
```

## Related Documentation

- [STAGING Strategy](../architecture/STAGING_STRATEGY.md) - Overall STAGING approach
- [STAGING Reference](../STAGING_REFERENCE.md) - Program IDs and infrastructure
- [Program IDs Registry](../PROGRAM_IDS.md) - All Program IDs

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team

