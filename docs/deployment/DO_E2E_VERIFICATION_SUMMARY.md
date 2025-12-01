# DigitalOcean E2E Test Readiness - Quick Summary

**Date:** October 16, 2025  
**Server:** easyescrow-backend-dev  
**Purpose:** Verify DO server has everything needed for E2E devnet tests

---

## 🎯 Quick Answer: What the Server Needs

### 1. **Solana Tools** (Most Critical)
- ✅ **Solana CLI** - Installed and configured for devnet
- ❌ **Anchor CLI 0.32.1** - REQUIRED, must match `Anchor.toml`
  - This is the most likely missing component
  - Install with: `avm install 0.32.1 && avm use 0.32.1`

### 2. **Wallet Private Keys** (Critical)
- ❌ Four devnet wallet secrets must be set in DO App Platform:
  - `DEVNET_SENDER_PRIVATE_KEY`
  - `DEVNET_RECEIVER_PRIVATE_KEY`
  - `DEVNET_ADMIN_PRIVATE_KEY`
  - `DEVNET_FEE_COLLECTOR_PRIVATE_KEY`
  
- **Set via:** `.\scripts\digitalocean\setup-devnet-secrets.ps1 -FromEnv`

### 3. **Funded Wallets** (Important)
- Wallets need minimum SOL balances on devnet:
  - Sender: 0.5 SOL
  - Receiver: 0.5 SOL
  - Admin: 0.5 SOL
  - FeeCollector: 0.1 SOL

### 4. **Program Deployment** (Already Done ✅)
- Program `7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV` is deployed to devnet

### 5. **Node Dependencies** (Already Done ✅)
- All packages in `package.json` should be installed via `npm ci`

---

## 🚀 How to Verify

### Option 1: One-Liner Inline Script (EASIEST - Works in DO Console)

**Copy and paste this into the DO console:**

```bash
node -e "
console.log('=== DO Server E2E Readiness Check ===\n');
const { execSync } = require('child_process');
const run = (cmd) => { try { return execSync(cmd, {encoding:'utf8'}).trim(); } catch(e) { return null; } };

console.log('Node:', process.version, '✅');
const npm = run('npm --version'); console.log('npm:', npm || '❌', npm ? '✅' : '');

const solana = run('solana --version'); 
console.log('Solana CLI:', solana || '❌ NOT INSTALLED');

const anchor = run('anchor --version');
if (anchor) {
  const match = anchor.match(/0\.32\.1/);
  console.log('Anchor CLI:', anchor, match ? '✅' : '⚠️  WRONG VERSION (need 0.32.1)');
} else {
  console.log('Anchor CLI: ❌ NOT INSTALLED (CRITICAL!)');
}

console.log('\nEnvironment Variables:');
console.log('SOLANA_NETWORK:', process.env.SOLANA_NETWORK || '❌');
console.log('ESCROW_PROGRAM_ID:', process.env.ESCROW_PROGRAM_ID || '❌');
console.log('DEVNET_SENDER_PRIVATE_KEY:', process.env.DEVNET_SENDER_PRIVATE_KEY ? '✅ SET' : '❌');
console.log('DEVNET_RECEIVER_PRIVATE_KEY:', process.env.DEVNET_RECEIVER_PRIVATE_KEY ? '✅ SET' : '❌');
console.log('DEVNET_ADMIN_PRIVATE_KEY:', process.env.DEVNET_ADMIN_PRIVATE_KEY ? '✅ SET' : '❌');
console.log('DEVNET_FEE_COLLECTOR_PRIVATE_KEY:', process.env.DEVNET_FEE_COLLECTOR_PRIVATE_KEY ? '✅ SET' : '❌');

console.log('\nNode Dependencies:');
const fs = require('fs');
['@coral-xyz/anchor','@solana/web3.js','@solana/spl-token'].forEach(dep => {
  try { 
    const pkg = JSON.parse(fs.readFileSync(\`node_modules/\${dep}/package.json\`));
    console.log(\`\${dep}: \${pkg.version} ✅\`);
  } catch(e) { console.log(\`\${dep}: ❌\`); }
});
"
```

This checks everything in one command - no bash required!

### Option 2: Run Verification Script (If Available)

**On the DO server (if scripts directory exists):**
```bash
# Bash
bash scripts/verify-do-e2e-readiness.sh

# Or PowerShell
pwsh scripts/verify-do-e2e-readiness.ps1

# Or Node.js
node scripts/verify-do-server.js
```

### Option 3: Check Remotely from Local Machine

**From your local machine to check remotely:**
```powershell
# Check wallet balances (doesn't require server access)
solana balance AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z --url devnet
solana balance 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 --url devnet
solana balance 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R --url devnet
solana balance 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ --url devnet

# Check program deployment
solana account 7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV --url devnet
```

### Option 2: Manual Checks via DO Dashboard

1. **Check Environment Variables:**
   - Go to: https://cloud.digitalocean.com/apps
   - Select `easyescrow-backend-dev`
   - Navigate to: Settings → App-Level Environment Variables
   - Verify these 4 SECRET variables exist:
     - `DEVNET_SENDER_PRIVATE_KEY`
     - `DEVNET_RECEIVER_PRIVATE_KEY`
     - `DEVNET_ADMIN_PRIVATE_KEY`
     - `DEVNET_FEE_COLLECTOR_PRIVATE_KEY`

2. **Check Deployment Logs:**
   - Go to: Runtime Logs
   - Look for Anchor/Solana version info in startup logs

3. **Check Wallet Balances:**
   - Use Solana Explorer links (see below)

---

## 📊 Wallet Explorer Links (Check Balances)

- **Sender:** https://explorer.solana.com/address/AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z?cluster=devnet
- **Receiver:** https://explorer.solana.com/address/5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4?cluster=devnet
- **Admin:** https://explorer.solana.com/address/498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R?cluster=devnet
- **FeeCollector:** https://explorer.solana.com/address/8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ?cluster=devnet

---

## 🔧 Most Likely Issues & Fixes

### Issue 1: Anchor CLI Not Installed / Wrong Version
**Symptoms:** 
- E2E tests fail with "anchor command not found"
- Version mismatch errors

**Fix:**
```bash
# Install AVM (Anchor Version Manager)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# Install correct version
avm install 0.32.1
avm use 0.32.1

# Verify
anchor --version  # Should show: anchor-cli 0.32.1
```

### Issue 2: Wallet Private Keys Not Set
**Symptoms:** 
- Tests fail with "Failed to load devnet wallets"
- "Private key not found" errors

**Fix:**
```powershell
# Set keys in DO App Platform
.\scripts\digitalocean\setup-devnet-secrets.ps1 -FromEnv

# This requires:
# 1. Local env vars set with wallet keys
# 2. DIGITALOCEAN_API_KEY set
# 3. App will auto-redeploy after setting
```

### Issue 3: Insufficient Wallet Balances
**Symptoms:** 
- Tests fail with "insufficient funds"
- Transaction errors

**Fix:**
```bash
# Fund all wallets
solana transfer AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z 2 --url devnet
solana transfer 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 2 --url devnet
solana transfer 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R 2 --url devnet
solana transfer 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ 1 --url devnet

# Or use batch script
.\scripts\fund-devnet-wallets.ps1
```

### Issue 4: Solana CLI Not Configured for Devnet
**Symptoms:** 
- Commands use wrong network
- Cannot find accounts on devnet

**Fix:**
```bash
solana config set --url devnet
solana config get  # Verify
```

---

## ✅ Verification Checklist

Quick checklist to verify manually:

- [ ] **Anchor CLI 0.32.1 installed** (`anchor --version`)
- [ ] **Solana CLI configured for devnet** (`solana config get`)
- [ ] **Program deployed** (check explorer link above)
- [ ] **4 wallet secrets set in DO dashboard**
- [ ] **Wallet balances sufficient** (check explorer links)
- [ ] **Node dependencies installed** (`node_modules` exists)
- [ ] **Test files present** (`tests/e2e/` directory exists)
- [ ] **Database & Redis configured** (already in `app-spec-upstash.yaml`)

---

## 🧪 Testing After Verification

Once everything is verified, test with:

```bash
# Run full e2e test suite
npm run test:e2e

# Or with verbose output
npm run test:e2e:verbose

# Or specific test
npx mocha tests/e2e/devnet-nft-usdc-swap.test.ts --timeout 180000
```

---

## 📚 Related Documentation

- **Full Checklist:** `docs/DO_SERVER_E2E_CHECKLIST.md`
- **Verification Script (Bash):** `scripts/verify-do-e2e-readiness.sh`
- **Verification Script (PowerShell):** `scripts/verify-do-e2e-readiness.ps1`
- **Deployment Guide:** `docs/DEVNET_DEPLOYMENT_GUIDE.md`
- **Static Wallets:** `docs/STATIC_DEVNET_WALLETS.md`
- **DO Secrets Setup:** `scripts/digitalocean/setup-devnet-secrets.ps1`

---

## 🎯 TL;DR - What You Need to Do

1. **Check if Anchor 0.32.1 is installed on DO server** (most likely NOT installed)
2. **Set 4 wallet private keys as secrets in DO App Platform**
3. **Fund the 4 wallets on devnet** (check balances via explorer)
4. **Run verification script to confirm everything**
5. **Run E2E tests**

**Expected Time:** 15-30 minutes if all tools need to be installed

---

**Generated:** October 16, 2025  
**Status:** Ready for verification

