# DigitalOcean Dev Server E2E Test Readiness Checklist

**Server:** `easyescrow-backend-dev`  
**App ID:** Check at https://cloud.digitalocean.com/apps  
**Date:** October 16, 2025

## Required Components for E2E Tests

### 1. ✅ Solana Tools & Configuration

#### Anchor CLI
- **Required Version:** `0.32.1` (must match `Anchor.toml`)
- **Installation:**
  ```bash
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  avm install 0.32.1
  avm use 0.32.1
  ```
- **Verify:**
  ```bash
  anchor --version
  # Expected: anchor-cli 0.32.1
  ```

#### Solana CLI
- **Required:** Latest stable
- **Configuration:** Devnet
- **Installation:**
  ```bash
  sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
  solana config set --url devnet
  ```
- **Verify:**
  ```bash
  solana --version
  solana config get
  # Should show: RPC URL: https://api.devnet.solana.com
  ```

---

### 2. ✅ Environment Variables

#### Core Configuration (Already Set in app-spec-upstash.yaml)
- ✅ `NODE_ENV=development`
- ✅ `PORT=3000`
- ✅ `SOLANA_NETWORK=devnet`
- ✅ `SOLANA_RPC_URL=https://api.devnet.solana.com`
- ✅ `SOLANA_COMMITMENT=confirmed`
- ✅ `ESCROW_PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd`
- ✅ `USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`

#### Devnet Wallet Private Keys (SECRETS - Need Verification)
These should be set as SECRET type environment variables:

- ❓ `DEVNET_SENDER_PRIVATE_KEY` (Seller - NFT owner)
  - **Public Address:** `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z`
  
- ❓ `DEVNET_RECEIVER_PRIVATE_KEY` (Buyer - USDC payer)
  - **Public Address:** `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4`
  
- ❓ `DEVNET_ADMIN_PRIVATE_KEY` (Escrow admin)
  - **Public Address:** `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`
  
- ❓ `DEVNET_FEE_COLLECTOR_PRIVATE_KEY` (Treasury - 1% fees)
  - **Public Address:** `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ`

#### How to Set Wallet Secrets
```powershell
# From your local machine with DO API key
.\scripts\digitalocean\setup-devnet-secrets.ps1 -FromEnv
```

**Verify secrets are set:**
- Go to: https://cloud.digitalocean.com/apps/[APP_ID]/settings
- Navigate to: App-Level Environment Variables
- Check that the 4 wallet keys exist (values will be masked)

---

### 3. ✅ Funded Devnet Wallets

All wallets must have sufficient SOL and tokens for testing:

#### Minimum Balances Required
- **Sender:** 0.5 SOL (for rent, transaction fees)
- **Receiver:** 0.5 SOL + 0.5 USDC (for swap payment)
- **Admin:** 0.5 SOL (for admin operations)
- **FeeCollector:** 0.1 SOL (minimal, receive-only)

#### Check Balances
```bash
# Via Solana CLI
solana balance AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z --url devnet  # Sender
solana balance 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 --url devnet  # Receiver
solana balance 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R --url devnet  # Admin
solana balance 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ --url devnet  # FeeCollector

# Via Solana Explorer
# https://explorer.solana.com/address/AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z?cluster=devnet
```

#### Fund Wallets (if needed)
```bash
# Using automated script
.\scripts\fund-devnet-wallets.ps1 `
  -Buyer 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 `
  -Seller AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z `
  -Admin 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R `
  -FeeCollector 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ

# Or individual transfers from a funded wallet
solana transfer AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z 2 --url devnet
solana transfer 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 2 --url devnet
solana transfer 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R 2 --url devnet
solana transfer 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ 1 --url devnet
```

---

### 4. ✅ Deployed Program

#### Program Information
- **Program ID:** `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd`
- **Network:** Devnet
- **Source:** `programs/escrow/src/lib.rs`

#### Verify Program is Deployed
```bash
# Check program account exists
solana program show 4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd --url devnet

# View in explorer
# https://explorer.solana.com/address/4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd?cluster=devnet
```

#### ⚠️ CRITICAL: Program ID Consistency Check

**Before running E2E tests, verify program ID is consistent across ALL configurations:**

```bash
# 1. Verify Rust source code
grep "declare_id" programs/escrow/src/lib.rs
# Expected: declare_id!("4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd");

# 2. Verify Anchor.toml
grep "escrow =" Anchor.toml | grep devnet
# Expected: escrow = "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"

# 3. Verify backend IDL
grep '"address"' src/generated/anchor/escrow-idl.json | head -1
# Expected: "address": "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd",

# 4. Verify environment variable
echo $ESCROW_PROGRAM_ID
# Expected: 4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd

# 5. Verify on-chain IDL matches
anchor idl fetch 4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd --provider.cluster devnet | grep '"address"' | head -1
# Expected: "address": "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd",
```

**If any check fails, STOP and fix the mismatch before running tests.**

Common fixes:
- **Stale IDL**: `cp target/idl/escrow.json src/generated/anchor/escrow-idl.json && docker compose restart backend`
- **Wrong env var**: Update `nodemon.json` or `.env` and restart services
- **Mismatched declare_id**: Rebuild and redeploy program

#### Required Program Instructions
The deployed program must have these instructions:
- `initAgreement`
- `depositUsdc`
- `depositNft`
- `settle`
- `adminCancel`
- `cancelIfExpired`

---

### 5. ✅ Node.js Dependencies

#### Required Packages
Check `package.json` for:
- `@coral-xyz/anchor@^0.32.1` ✅
- `@solana/web3.js@^1.98.4` ✅
- `@solana/spl-token@^0.4.14` ✅
- `@metaplex-foundation/js@^0.20.1` ✅
- `bs58@^6.0.0` ✅
- `mocha`, `chai` (dev dependencies) ✅

#### Installation
```bash
npm ci  # Clean install from package-lock.json
```

---

### 6. ✅ Test Files & Helpers

Required files for e2e tests:

#### Test Files
- ✅ `tests/e2e/devnet-nft-usdc-swap.test.ts`
- ✅ `tests/integration-test-devnet.ts`

#### Helper Modules
- ✅ `tests/helpers/devnet-wallet-manager.ts`
- ✅ `tests/helpers/devnet-token-setup.ts`
- ✅ `tests/helpers/devnet-nft-setup.ts`

#### Test Fixtures
- ✅ `tests/fixtures/devnet-config.json` (generated at runtime if missing)

---

### 7. ✅ Database & Redis

#### Database (PostgreSQL)
- ✅ Already configured in app spec: `DATABASE_URL`
- Connection: `easyescrow-staging-postgres-do-user-11230012-0.d.db.ondigitalocean.com:25060`

#### Redis (Upstash)
- ✅ Already configured in app spec: `REDIS_URL`
- Connection: `sterling-dog-24743.upstash.io:6379`

---

## Verification Commands

### Quick Health Check
Run these commands on the DO server to verify everything:

```bash
# 1. Check Anchor version
anchor --version

# 2. Check Solana CLI
solana --version
solana config get

# 3. Check Node.js and npm
node --version
npm --version

# 4. Verify program deployment
solana account 4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd --url devnet

# 5. Check wallet balances
solana balance AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z --url devnet
solana balance 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 --url devnet
solana balance 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R --url devnet
solana balance 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ --url devnet

# 6. Check environment variables (masked)
echo "SOLANA_NETWORK: $SOLANA_NETWORK"
echo "ESCROW_PROGRAM_ID: $ESCROW_PROGRAM_ID"
echo "Sender key set: $([ -n "$DEVNET_SENDER_PRIVATE_KEY" ] && echo 'YES' || echo 'NO')"
echo "Receiver key set: $([ -n "$DEVNET_RECEIVER_PRIVATE_KEY" ] && echo 'YES' || echo 'NO')"
echo "Admin key set: $([ -n "$DEVNET_ADMIN_PRIVATE_KEY" ] && echo 'YES' || echo 'NO')"
echo "FeeCollector key set: $([ -n "$DEVNET_FEE_COLLECTOR_PRIVATE_KEY" ] && echo 'YES' || echo 'NO')"

# 7. Check dependencies
npm list @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

---

## Running E2E Tests

### Prerequisites Check Script
```bash
# Run the setup verification script
npm run setup:devnet:verify
# or
./scripts/deployment/devnet/setup-devnet-e2e.ps1
```

### Run Tests
```bash
# Full e2e test suite
npm run test:e2e

# With verbose output
npm run test:e2e:verbose

# Specific test
npx mocha tests/e2e/devnet-nft-usdc-swap.test.ts --timeout 180000
```

---

## Common Issues & Solutions

### ❌ "Anchor version mismatch"
**Solution:** Install Anchor 0.32.1
```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.32.1
avm use 0.32.1
```

### ❌ "Failed to load devnet wallets"
**Solution:** Set environment variables via DO dashboard or script:
```powershell
.\scripts\digitalocean\setup-devnet-secrets.ps1 -FromEnv
```

### ❌ "Insufficient wallet balances"
**Solution:** Fund wallets using script or manual transfers (see section 3)

### ❌ "Program account not found"
**Solution:** Verify program is deployed to devnet:
```bash
solana account 4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd --url devnet
```

### ❌ "Transaction simulation failed"
**Common causes:**
1. Insufficient SOL for rent/fees
2. Incorrect program ID
3. Wallet keys mismatch with addresses
4. Program not deployed or outdated

---

## Security Checklist

- [ ] Private keys stored as SECRET type in DO App Platform
- [ ] Private keys never logged or exposed in error messages
- [ ] `.env` file in `.gitignore`
- [ ] `tests/fixtures/devnet-config.json` in `.gitignore`
- [ ] Regular key rotation schedule
- [ ] Separate devnet/mainnet keys

---

## Contact & Documentation

- **Deployment Guide:** `docs/DEVNET_DEPLOYMENT_GUIDE.md`
- **Static Wallets:** `docs/STATIC_DEVNET_WALLETS.md`
- **DO Secrets:** `docs/DIGITALOCEAN_SECRETS_CONFIGURATION.md`
- **E2E Test README:** `tests/e2e/README.md`
- **Verification Scripts:**
  - `scripts/verify-do-e2e-readiness.sh` (Linux/Mac)
  - `scripts/verify-do-e2e-readiness.ps1` (Windows/PowerShell)

---

## Summary Status

| Component | Status | Notes |
|-----------|--------|-------|
| Anchor CLI 0.32.1 | ❓ | Need to verify |
| Solana CLI | ❓ | Need to verify |
| Devnet Configuration | ❓ | Need to verify |
| Wallet Private Keys | ❓ | Check DO secrets |
| Wallet Balances | ❓ | Check explorer |
| Program Deployment | ✅ | Deployed to devnet |
| Node Dependencies | ✅ | In package.json |
| Test Files | ✅ | Committed to repo |
| Database | ✅ | Configured in app spec |
| Redis | ✅ | Configured in app spec |

**Next Steps:**
1. SSH into DO server (if access enabled)
2. Run verification commands above
3. Install missing tools (Anchor, Solana CLI)
4. Set wallet secrets if not present
5. Fund wallets if balances low
6. Run test suite

---

**Generated:** October 16, 2025  
**For:** easyescrow-backend-dev (DigitalOcean App Platform)

