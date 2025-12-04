# Program ID Management Strategy

## Overview

To prevent accidental program ID mix-ups between environments, we use **Rust feature flags** for conditional compilation. This ensures the correct program ID is compiled into each build automatically.

## Architecture

### Single Source File, Multiple Program IDs

- **One `lib.rs` file** - All program logic in a single file
- **Conditional compilation** - Different program IDs selected at build time via features
- **Type-safe** - Compiler ensures only one program ID is active per build
- **No manual changes needed** - Program ID selected automatically

## Program IDs by Environment

| Environment | Program ID | Network | Use Case |
|-------------|-----------|---------|----------|
| **Mainnet** | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | Mainnet-Beta | Production |
| **Staging** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | Devnet | Pre-production testing |
| **Devnet** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | Devnet | Development |
| **Localnet** | `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS` | Localnet | Local testing |

## Building for Each Environment

### Method 1: Build Scripts (Recommended)

**PowerShell (Windows):**
```powershell
# Build for production mainnet
.\scripts\solana\build-mainnet.ps1

# Build for staging
.\scripts\solana\build-staging.ps1
```

**Bash (Linux/Mac):**
```bash
# Build for production mainnet
./scripts/solana/build-mainnet.sh

# Build for staging
./scripts/solana/build-staging.sh
```

### Method 2: NPM Scripts

```bash
# Build for production mainnet
npm run build:mainnet

# Build for staging
npm run build:staging

# Build for devnet
npm run build:devnet

# Build for localnet
npm run build:local
```

### Method 3: Direct Anchor Commands

```bash
# Build for specific environment
anchor build --features mainnet
anchor build --features staging
anchor build --features devnet
anchor build --features localnet
```

## How It Works

### 1. Feature Flags in `Cargo.toml`

```toml
[features]
default = ["mainnet"]  # Default to mainnet for safety

# Environment-specific features (mutually exclusive)
mainnet = []
staging = []
devnet = []
localnet = []
```

### 2. Conditional Compilation in `lib.rs`

```rust
// Only ONE of these will be included in the final binary

#[cfg(feature = "mainnet")]
declare_id!("2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx");

#[cfg(feature = "staging")]
declare_id!("AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei");

#[cfg(feature = "devnet")]
declare_id!("AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei");

#[cfg(feature = "localnet")]
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
```

## Safety Features

### ✅ **Compile-Time Guarantees**

1. **Only one program ID per build** - Rust compiler ensures exactly one `declare_id!()` is active
2. **No runtime checks needed** - Program ID is baked into the binary at compile time
3. **Type-safe** - Cannot accidentally mix program IDs
4. **Build artifacts are environment-specific** - Each build is clearly tagged

### ✅ **Default to Production**

- Default feature is `mainnet` - most conservative choice
- If no feature is specified, it will build for mainnet
- Prevents accidental staging builds being deployed to production

### ✅ **Clear Build Output**

Build scripts clearly display which environment is being built:

```
🏗️  Building Solana Program for MAINNET...
Program ID: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx

✅ MAINNET build completed successfully!

⚠️  IMPORTANT: This binary is for MAINNET only!
```

## Deployment Workflow

### Mainnet Deployment

```bash
# 1. Build for mainnet
npm run build:mainnet

# 2. Verify the program ID in the binary
solana-verify get-program-id target/deploy/escrow.so
# Should output: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx

# 3. Deploy to mainnet
solana program deploy target/deploy/escrow.so \
  --program-id wallets/production/escrow-program-keypair.json \
  --url mainnet-beta
```

### Staging Deployment

```bash
# 1. Build for staging
npm run build:staging

# 2. Verify the program ID in the binary
solana-verify get-program-id target/deploy/escrow.so
# Should output: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# 3. Deploy to devnet (staging uses devnet)
solana program deploy target/deploy/escrow.so \
  --program-id wallets/staging/escrow-program-keypair.json \
  --url devnet
```

## CI/CD Integration

In your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Build Mainnet Program
  run: npm run build:mainnet
  
- name: Verify Program ID
  run: |
    PROGRAM_ID=$(solana-verify get-program-id target/deploy/escrow.so)
    if [ "$PROGRAM_ID" != "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx" ]; then
      echo "❌ Program ID mismatch!"
      exit 1
    fi
```

## Verifying Build Artifacts

### Method 1: Check Program ID in Binary

```bash
# Extract program ID from built binary
solana-verify get-program-id target/deploy/escrow.so
```

### Method 2: Check IDL

```bash
# Check the metadata in the IDL file
cat target/idl/escrow.json | grep "address"
```

### Method 3: Deploy to Localnet and Verify

```bash
# Start local validator
solana-test-validator

# Deploy and get program ID
solana program deploy target/deploy/escrow.so
```

## Common Issues and Solutions

### Issue: "Multiple applicable items in scope"

**Cause:** Multiple features enabled simultaneously

**Solution:** Only specify one environment feature per build:
```bash
# ❌ Wrong
anchor build --features mainnet,staging

# ✅ Correct
anchor build --features mainnet
```

### Issue: Wrong program ID in deployed binary

**Cause:** Built with wrong feature flag

**Solution:** Rebuild with correct feature:
```bash
# Verify which environment you need
echo $ENVIRONMENT

# Rebuild
npm run build:$ENVIRONMENT

# Verify program ID before deploying
solana-verify get-program-id target/deploy/escrow.so
```

### Issue: Default build uses wrong environment

**Cause:** Default feature is mainnet (by design)

**Solution:** Always specify the environment explicitly:
```bash
# Don't rely on defaults
npm run build:staging  # Explicit
```

## Benefits of This Approach

### ✅ **Single Source of Truth**

- One `lib.rs` file contains all program logic
- Changes automatically apply to all environments
- No code duplication or drift

### ✅ **Impossible to Mix Up**

- Compiler enforces only one program ID per build
- Build scripts clearly indicate which environment
- Cannot accidentally deploy wrong binary

### ✅ **Developer Friendly**

- Clear npm scripts for each environment
- Visual feedback during builds
- Easy to verify which environment you built for

### ✅ **CI/CD Ready**

- Easy to integrate into automated pipelines
- Verification steps can catch mistakes early
- Reproducible builds

## Comparison with Alternatives

### ❌ **Manual Editing (Previous Approach)**

```rust
// Change this manually before each build
declare_id!("2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx");
```

**Problems:**
- Easy to forget to change
- No verification
- Error-prone
- Git conflicts

### ❌ **Separate lib.rs Files**

```
src/lib.rs          // Mainnet
src/lib_staging.rs  // Staging
src/lib_devnet.rs   // Devnet
```

**Problems:**
- Code duplication
- Code drift between environments
- Triple maintenance burden
- Merge conflicts

### ✅ **Feature Flags (Current Approach)**

**Benefits:**
- Type-safe
- Single source file
- Automated selection
- Compile-time guarantee

## Summary

This approach ensures:

1. ✅ **Correct program ID is always used** for each environment
2. ✅ **No manual changes needed** - automated via build scripts
3. ✅ **Code changes apply to all environments** - single source file
4. ✅ **Compile-time safety** - impossible to mix up program IDs
5. ✅ **Clear verification** - easy to verify which environment was built

## Related Documentation

- [Build Scripts](../../scripts/solana/README.md)
- [Deployment Guide](../deployment/DEPLOYMENT_PROCESS.md)
- [Environment Configuration](../environments/ENVIRONMENTS.md)

