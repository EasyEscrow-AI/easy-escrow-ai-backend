# Solana Program Build Scripts

This directory contains scripts for building the Solana escrow program with **environment-specific program IDs** using Rust feature flags.

## 🎯 Purpose

Prevent accidental program ID mix-ups between environments by automating the build process with compile-time guarantees.

## 📁 Files

- **`build-mainnet.ps1`** / **`build-mainnet.sh`** - Build for production mainnet
- **`build-staging.ps1`** / **`build-staging.sh`** - Build for staging/devnet
- **`verify-program-id.ps1`** - Verify program ID in built binary

## 🚀 Quick Start

### Build for Specific Environment

**PowerShell (Windows):**
```powershell
# Production
.\scripts\solana\build-mainnet.ps1

# Staging
.\scripts\solana\build-staging.ps1
```

**Bash (Linux/Mac):**
```bash
# Production
./scripts/solana/build-mainnet.sh

# Staging
./scripts/solana/build-staging.sh
```

**NPM (Cross-platform):**
```bash
npm run build:mainnet
npm run build:staging
npm run build:devnet
npm run build:local
```

### Verify Build

```powershell
# Verify the built binary has correct program ID
.\scripts\solana\verify-program-id.ps1 -Environment mainnet
.\scripts\solana\verify-program-id.ps1 -Environment staging
```

## 🔐 Program IDs by Environment

| Environment | Program ID | Network |
|-------------|-----------|---------|
| **Mainnet** | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | Mainnet-Beta |
| **Staging** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | Devnet |
| **Devnet** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | Devnet |
| **Localnet** | `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS` | Localnet |

## 📖 How It Works

### 1. Feature Flags

Program IDs are selected at **compile time** using Rust features:

```toml
# programs/escrow/Cargo.toml
[features]
mainnet = []
staging = []
devnet = []
localnet = []
```

### 2. Conditional Compilation

Only **one** program ID is compiled into the binary:

```rust
// programs/escrow/src/lib.rs
#[cfg(feature = "mainnet")]
declare_id!("2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx");

#[cfg(feature = "staging")]
declare_id!("AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei");
```

### 3. Build Scripts

Scripts automate the build process and provide clear feedback:

```powershell
anchor build --features mainnet
```

## ✅ Safety Features

1. **Compile-time guarantee** - Only one program ID per build
2. **Type-safe** - Compiler enforces correctness
3. **No manual changes** - Program ID automatically selected
4. **Clear verification** - Easy to verify which environment was built
5. **Visual feedback** - Scripts show which environment is being built

## 📋 Deployment Checklist

Before deploying to **any** environment:

- [ ] Build with correct feature flag
- [ ] Verify program ID in binary
- [ ] Test on target network
- [ ] Verify wallet/keypair matches environment
- [ ] Double-check network endpoint

### Example: Mainnet Deployment

```bash
# 1. Build for mainnet
npm run build:mainnet

# 2. Verify program ID
.\scripts\solana\verify-program-id.ps1 -Environment mainnet

# 3. Deploy
solana program deploy target/deploy/escrow.so \
  --program-id wallets/production/escrow-program-keypair.json \
  --url mainnet-beta
```

## 🔍 Troubleshooting

### Wrong Program ID in Binary

**Problem:** Deployed binary has wrong program ID

**Solution:**
```bash
# Rebuild with correct environment
npm run build:mainnet

# Verify before deploying
.\scripts\solana\verify-program-id.ps1 -Environment mainnet
```

### Multiple Features Error

**Problem:** "Multiple applicable items in scope"

**Solution:** Only specify **one** feature per build:
```bash
# ❌ Wrong
anchor build --features mainnet,staging

# ✅ Correct
anchor build --features mainnet
```

## 📚 Related Documentation

- [Program ID Management Strategy](../../docs/development/PROGRAM_ID_MANAGEMENT.md) - Complete guide
- [Deployment Process](../../docs/deployment/DEPLOYMENT_PROCESS.md) - Deployment workflow
- [Environment Configuration](../../docs/environments/ENVIRONMENTS.md) - Environment details

## 🎓 Best Practices

1. **Always use build scripts** - Don't run `anchor build` directly
2. **Always verify before deploying** - Check program ID in binary
3. **Use NPM scripts** - Cross-platform and consistent
4. **Check twice, deploy once** - Verify environment before deploying
5. **Document deployments** - Record which binary was deployed where

## 🤝 Contributing

When modifying the program:

1. Changes apply to **all environments** (single `lib.rs`)
2. Build and test for **each environment** separately
3. Verify program ID after building
4. Update documentation if program IDs change

---

**Remember:** One source file, multiple program IDs, zero manual changes! 🚀
