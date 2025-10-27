# Solana Mainnet Deployment Scripts

This directory contains scripts for building, verifying, and deploying the EasyEscrow Solana program to mainnet.

## 📋 Available Scripts

### 1. Build Scripts

#### `build-mainnet.sh` / `build-mainnet.ps1`
Builds the program for mainnet deployment with pinned toolchains.

**Usage:**
```bash
# Unix/Mac/Linux
./scripts/solana/build-mainnet.sh

# Windows PowerShell
.\scripts\solana\build-mainnet.ps1
```

**What it does:**
- Verifies toolchain versions (Solana 1.18.x, Rust 1.75.0, Anchor 0.30.1)
- Cleans previous builds
- Builds program with `Anchor.mainnet.toml` configuration
- Generates SHA256 checksums for verification
- Displays build summary and deployment cost estimate

**Output:**
- `target/deploy/escrow.so` - Program binary
- `target/idl/escrow.json` - Program IDL
- `target/deploy/escrow.so.sha256` - Program checksum
- `target/idl/escrow.json.sha256` - IDL checksum

---

### 2. Verification Script

#### `verify-mainnet-deployment.sh`
Comprehensive pre-deployment verification.

**Usage:**
```bash
./scripts/solana/verify-mainnet-deployment.sh
```

**What it checks:**
- ✓ Configuration file exists and is set to mainnet
- ✓ Program keypair exists with correct permissions
- ✓ Program IDs match across all files
- ✓ Deployer keypair exists and is funded
- ✓ Build artifacts exist and are valid
- ✓ RPC endpoint is responsive
- ✓ Program doesn't already exist (or does for upgrades)
- ✓ Git status and commit info
- ⚠ Backup reminders
- ⚠ Security checklist

**Exit codes:**
- `0` - All checks passed or only warnings
- `1` - Errors found, cannot deploy

---

### 3. Cost Calculator

#### `calculate-deployment-cost.sh`
Calculates exact SOL requirements for deployment.

**Usage:**
```bash
./scripts/solana/calculate-deployment-cost.sh
```

**What it calculates:**
- Program account rent (based on actual program size)
- Buffer account rent (for upgradeable programs)
- IDL account rent
- Transaction fees
- Priority fees (optional)
- Error/retry buffer

**Output example:**
```
TOTAL ESTIMATED COST:  ~4.67 SOL

Recommendations:
Minimum Balance:   5 SOL
Recommended:       7 SOL
Conservative:      10 SOL
```

**Why the calculator is useful:**
- Shows exactly where SOL is spent
- Adjusts for actual program size
- Helps determine minimum funding needed
- **Answer to "Why 10 SOL?"**: It's conservative; actual need is ~4-6 SOL for typical programs

---

## 🚀 Deployment Workflow

### Step 1: Build the Program

```bash
# Run build script
./scripts/solana/build-mainnet.sh

# This will:
# - Clean previous builds
# - Build with pinned toolchains
# - Generate checksums
# - Show estimated deployment cost
```

### Step 2: Generate Keypairs

```bash
# Generate program keypair
solana-keygen new -o target/deploy/escrow-mainnet-keypair.json

# Save the seed phrase securely!

# Generate deployer keypair (if not exists)
solana-keygen new -o wallets/production/mainnet-deployer.json
```

### Step 3: Update Program IDs

```bash
# Get program ID
PROGRAM_ID=$(solana address -k target/deploy/escrow-mainnet-keypair.json)
echo $PROGRAM_ID

# Update Anchor.mainnet.toml
# Replace PLACEHOLDER_MAINNET_PROGRAM_ID with actual ID

# Update programs/escrow/src/lib.rs
# Replace declare_id!("PLACEHOLDER_MAINNET_PROGRAM_ID") with actual ID
```

### Step 4: Rebuild with Correct IDs

```bash
# Rebuild after updating IDs
./scripts/solana/build-mainnet.sh
```

### Step 5: Calculate Required SOL

```bash
# See exact SOL requirements
./scripts/solana/calculate-deployment-cost.sh

# This shows:
# - Exact cost based on your program size
# - Minimum vs recommended balances
# - Current deployer balance (if keypair exists)
```

### Step 6: Fund Deployer Wallet

```bash
# Get deployer address
DEPLOYER_ADDRESS=$(solana address -k wallets/production/mainnet-deployer.json)

# Transfer SOL (from your funded wallet)
solana transfer $DEPLOYER_ADDRESS 5 \
  --from <your-funded-keypair> \
  --url mainnet-beta

# Verify balance
solana balance -k wallets/production/mainnet-deployer.json --url mainnet-beta
```

### Step 7: Verify Everything

```bash
# Run comprehensive verification
./scripts/solana/verify-mainnet-deployment.sh

# This checks EVERYTHING before deployment
# Must pass with 0 errors to proceed
```

### Step 8: Deploy (Manual - Not scripted yet)

```bash
# Deploy to mainnet
anchor deploy \
  --provider.cluster mainnet-beta \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --program-name escrow \
  --program-keypair target/deploy/escrow-mainnet-keypair.json

# Upload IDL
anchor idl init \
  $(solana address -k target/deploy/escrow-mainnet-keypair.json) \
  --provider.cluster mainnet-beta \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --filepath target/idl/escrow.json
```

---

## 💰 SOL Requirements Explained (VERIFIED ACCURATE)

### Why is 10 SOL recommended?

**Short answer:** It's conservative. Actual need is ~7 SOL upfront with ~3.5 SOL refunded.

**✅ ACCURATE Breakdown for typical 250KB program:**

| Item | Cost | Notes |
|------|------|-------|
| **Program account rent** | **1.74 SOL** | Permanent (6,960 lamports/byte) |
| **IDL account rent** | **0.12 SOL** | Permanent (~17.5KB typical) |
| **Transaction fees** | **0.001 SOL** | ~203 txs @ 0.000005 SOL each |
| **Safety buffer** | **1.50 SOL** | For errors/retries |
| **Permanent Subtotal** | **~3.36 SOL** | **What you pay long-term** |
| **Buffer account rent** | **3.48 SOL** | **REFUNDED after deployment** |
| **Total Upfront Needed** | **~6.85 SOL** | **What you need initially** |

### Can you deploy with less?

| Amount | Status | Risk | Reality |
|--------|--------|------|---------|
| 1 SOL | ❌ Fail | Insufficient | Not even enough for program rent |
| 3 SOL | ❌ Fail | Too low | Can't cover permanent costs |
| 5 SOL | ⚠️ Risky | Very tight | Might work for small programs only |
| 7 SOL | ✅ Good | Realistic | Matches calculated upfront need |
| 10 SOL | ✅ Safe | Conservative | Recommended for first deploy |

**Key Insight:** The buffer account (~3.5 SOL) is REFUNDED after deployment!  
- You need ~7 SOL upfront
- You get ~3.5 SOL back
- Net cost: ~3.5 SOL permanent

### Use the calculator!

```bash
./scripts/solana/calculate-deployment-cost.sh
```

This shows **exact** requirements for **your** program size.

---

## 🔒 Security Notes

1. **Never commit keypairs to git**
2. **Always backup seed phrases**
3. **Set file permissions to 600** (Unix/Mac)
4. **Use hardware wallet** for production if possible
5. **Test on devnet first**
6. **Verify program IDs** match everywhere
7. **Run verification script** before deploying
8. **Have rollback plan** ready

---

## 📚 Related Documentation

- [Mainnet Deployment Guide](../../docs/deployment/MAINNET_DEPLOYMENT_GUIDE.md)
- [Wallet Security README](../../wallets/production/README.md)
- [Anchor Configuration](../../Anchor.mainnet.toml)

---

## 🆘 Troubleshooting

### Build fails with toolchain version mismatch

```bash
# Install pinned versions
solana-install init 1.18.20
rustup install 1.75.0 && rustup default 1.75.0
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked
```

### "Insufficient funds" during deployment

```bash
# Check actual cost
./scripts/solana/calculate-deployment-cost.sh

# Add more SOL if needed
solana transfer <deployer-address> 2 --from <funded-wallet> --url mainnet-beta
```

### Verification script fails

Read the error messages carefully. Most common issues:
- Program ID not updated in all files
- Deployer wallet not funded
- Build artifacts missing (run build script)
- Keypairs with wrong permissions

### Program ID mismatch

```bash
# Get IDs from each location
KEYPAIR_ID=$(solana address -k target/deploy/escrow-mainnet-keypair.json)
CONFIG_ID=$(grep 'escrow =' Anchor.mainnet.toml | cut -d'"' -f2)
SOURCE_ID=$(grep 'declare_id!' programs/escrow/src/lib.rs | cut -d'"' -f2)

# Compare
echo "Keypair: $KEYPAIR_ID"
echo "Config:  $CONFIG_ID"
echo "Source:  $SOURCE_ID"

# All three must match!
```

---

**Remember:** Production deployment is permanent. Triple-check everything!

