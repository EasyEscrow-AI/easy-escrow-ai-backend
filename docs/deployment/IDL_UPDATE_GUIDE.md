# IDL Update Guide

## Overview

This guide covers how to update the Interface Definition Language (IDL) for the Solana escrow program on both devnet (staging) and mainnet (production) environments.

**CRITICAL**: The program must be built with the correct `declare_id!` for each environment before deployment.

---

## Prerequisites

- Anchor CLI installed (`anchor --version` should show 0.32.1)
- Sufficient SOL in deployment wallet:
  - **Devnet**: ~2-5 SOL (use faucet if needed)
  - **Mainnet**: ~10 SOL (real funds required)
- Upgrade authority for the program
- Access to deployment wallets

---

## Environment-Specific Program IDs

| Environment | Program ID | Wallet |
|------------|-----------|--------|
| **Devnet/Staging** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | Default wallet (498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R) |
| **Mainnet/Production** | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | Production wallet (requires ~10 SOL) |

---

## Critical: declare_id! Must Match Deployment Target

The `declare_id!` macro in `programs/escrow/src/lib.rs` embeds the program ID into the compiled binary. **You must build separate binaries for staging and production.**

### Current State
Check the current `declare_id!` in the program:

```bash
grep "declare_id!" programs/escrow/src/lib.rs
```

---

## Update IDL on Devnet (Staging)

### Step 1: Set declare_id! to Staging

Edit `programs/escrow/src/lib.rs`:

```rust
// STAGING/DEVNET Program ID
declare_id!("AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei");
```

### Step 2: Build Program

```bash
# Set HOME for Windows
$env:HOME = $env:USERPROFILE

# Build with Anchor
anchor build
```

**Verify Build Output**:
- `target/deploy/escrow.so` should exist (~266 KB)
- `target/idl/escrow.json` should exist (~17 KB)

### Step 3: Verify Wallet Balance

```bash
# Set cluster to devnet
solana config set --url devnet

# Check balance
solana balance

# If insufficient, request airdrop
solana airdrop 2
```

### Step 4: Upgrade Program on Devnet

```bash
anchor upgrade target/deploy/escrow.so \
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster https://api.devnet.solana.com
```

**Expected Output**:
```
Program Id: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
Signature: <transaction_signature>
```

### Step 5: Upload IDL to Devnet

```bash
anchor idl upgrade AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --filepath target/idl/escrow.json \
  --provider.cluster https://api.devnet.solana.com
```

**Expected Output**:
```
Idl data length: 1869 bytes
Step 0/1869 
Step 600/1869 
Step 1200/1869 
Step 1800/1869 
Idl account <idl_account_address> successfully upgraded
```

### Step 6: Copy IDL to Backend

```bash
# Copy updated IDL to backend
cp target/idl/escrow.json src/generated/anchor/escrow.json

# Verify copy
ls -la src/generated/anchor/escrow.json
```

### Step 7: Commit Changes

```bash
# Stage changes
git add src/generated/anchor/escrow.json
git add programs/escrow/src/lib.rs  # If declare_id changed
git add Anchor.toml  # If config changed

# Commit
git commit -m "chore: update IDL after devnet program upgrade"

# Push
git push
```

---

## Update IDL on Mainnet (Production)

### Step 1: Set declare_id! to Production

⚠️ **CRITICAL STEP** - Edit `programs/escrow/src/lib.rs`:

```rust
// PRODUCTION/MAINNET Program ID
declare_id!("2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx");
```

### Step 2: Build Program for Production

```bash
# Set HOME for Windows
$env:HOME = $env:USERPROFILE

# Clean previous build artifacts (recommended)
anchor clean

# Build with Anchor
anchor build
```

**Verify Build Output**:
- `target/deploy/escrow.so` should exist (~266 KB)
- `target/idl/escrow.json` should exist (~17 KB)
- **Verify the program was built with PRODUCTION ID**:
  ```bash
  grep "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx" target/idl/escrow.json
  # Should return matches
  ```

### Step 3: Verify Mainnet Wallet Balance

```bash
# Set cluster to mainnet
solana config set --url mainnet-beta

# Check balance (requires real SOL)
solana balance

# Should have ~10 SOL for program upgrade
```

**If insufficient balance**: Purchase SOL and transfer to deployment wallet.

### Step 4: Upgrade Program on Mainnet

⚠️ **PRODUCTION DEPLOYMENT - VERIFY EVERYTHING FIRST**

```bash
# Double-check you're on mainnet
solana config get

# Upgrade program (REAL MONEY, BE CAREFUL)
anchor upgrade target/deploy/escrow.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --provider.cluster https://api.mainnet-beta.solana.com
```

**Expected Output**:
```
Program Id: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
Signature: <transaction_signature>
```

**Verify on Solscan**:
```
https://solscan.io/tx/<transaction_signature>
```

### Step 5: Upload IDL to Mainnet

```bash
anchor idl upgrade 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --filepath target/idl/escrow.json \
  --provider.cluster https://api.mainnet-beta.solana.com
```

**Expected Output**:
```
Idl data length: 1869 bytes
Step 0/1869 
Step 600/1869 
Step 1200/1869 
Step 1800/1869 
Idl account <idl_account_address> successfully upgraded
```

### Step 6: Copy IDL to Backend

```bash
# Copy updated IDL to backend (same as staging)
cp target/idl/escrow.json src/generated/anchor/escrow.json
```

### Step 7: Commit Production Changes

```bash
# Stage changes
git add src/generated/anchor/escrow.json
git add programs/escrow/src/lib.rs  # declare_id is now production

# Commit
git commit -m "chore: update IDL after mainnet program upgrade"

# Push to production branch
git push
```

---

## Troubleshooting

### Error: DeclaredProgramIdMismatch

**Symptom**:
```
Error: AnchorError occurred. Error Code: DeclaredProgramIdMismatch.
Error Message: The declared program id does not match the actual program id.
```

**Cause**: The program was built with a different `declare_id!` than the target deployment program ID.

**Solution**:
1. Update `declare_id!` in `programs/escrow/src/lib.rs` to match target environment
2. Rebuild: `anchor build`
3. Retry upgrade

### Error: Insufficient Funds

**Devnet**:
```bash
solana airdrop 2
```

**Mainnet**:
- Purchase SOL from an exchange
- Transfer to deployment wallet

### Error: Unauthorized Upgrade Authority

**Symptom**:
```
Error: Program's authority does not match authority provided
```

**Solution**: Ensure you're using the wallet that has upgrade authority for the program.

**Check current authority**:
```bash
solana program show <program_id>
```

---

## Post-Deployment Verification

### Verify Program Upgrade

```bash
# Get program info
solana program show <program_id> --url <cluster_url>

# Check last upgrade slot
```

### Verify IDL Update

Fetch the on-chain IDL and compare:

```bash
# Fetch from devnet
anchor idl fetch AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster https://api.devnet.solana.com

# Fetch from mainnet
anchor idl fetch 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --provider.cluster https://api.mainnet-beta.solana.com
```

Compare with local IDL:
```bash
diff target/idl/escrow.json <fetched_idl.json>
```

### Test Backend Integration

**Staging**:
```bash
npm run test:staging:e2e:01-solana-nft-usdc-happy-path
```

**Production**:
```bash
npm run test:production:e2e:01-solana-nft-usdc-happy-path
```

---

## Best Practices

1. **Always build separate binaries** for staging and production
2. **Test on devnet/staging first** before mainnet deployment
3. **Verify declare_id!** before every build
4. **Keep IDL in sync** between on-chain and backend (`src/generated/anchor/escrow.json`)
5. **Document all deployments** with transaction signatures
6. **Monitor logs** after deployment for any issues
7. **Have rollback plan** ready (keep previous program backup)

---

## Quick Reference

### Devnet/Staging Commands

```bash
# 1. Update declare_id to staging
# Edit programs/escrow/src/lib.rs

# 2. Build
anchor build

# 3. Upgrade program
anchor upgrade target/deploy/escrow.so \
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster https://api.devnet.solana.com

# 4. Upload IDL
anchor idl upgrade AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --filepath target/idl/escrow.json \
  --provider.cluster https://api.devnet.solana.com

# 5. Copy to backend
cp target/idl/escrow.json src/generated/anchor/escrow.json
```

### Mainnet/Production Commands

```bash
# 1. Update declare_id to production
# Edit programs/escrow/src/lib.rs

# 2. Clean and build
anchor clean
anchor build

# 3. Upgrade program
anchor upgrade target/deploy/escrow.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --provider.cluster https://api.mainnet-beta.solana.com

# 4. Upload IDL
anchor idl upgrade 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --filepath target/idl/escrow.json \
  --provider.cluster https://api.mainnet-beta.solana.com

# 5. Copy to backend
cp target/idl/escrow.json src/generated/anchor/escrow.json
```

---

## Related Documentation

- [Program Deployment Guide](./PROGRAM_DEPLOYMENT_GUIDE.md)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana CLI Reference](https://docs.solana.com/cli)

---

**Last Updated**: October 29, 2025
**Anchor Version**: 0.32.1
**Solana Version**: 2.x

