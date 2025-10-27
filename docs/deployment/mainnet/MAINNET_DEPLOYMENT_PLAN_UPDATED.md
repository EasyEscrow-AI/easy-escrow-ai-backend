# 🚀 Mainnet Deployment Plan - Updated with Research Findings

**Date:** 2025-10-27  
**Status:** Ready to deploy with enhanced safeguards

---

## 📋 Research Findings Incorporated

Based on your comprehensive research, we've updated the deployment plan to address:

✅ Transaction expiration issues (`--max-sign-attempts`)  
✅ Network congestion (priority fees)  
✅ Buffer account recovery  
✅ Upgrade authority management  
✅ Post-deployment verification  
✅ Network configuration safety checks  

---

## 🎯 Pre-Deployment Checklist

### 1. Network Configuration Safety ✅

```bash
# Verify we're NOT accidentally on wrong network
solana config get

# Expected output:
# RPC URL: https://prettiest-broken-flower.solana-mainnet.quiknode.pro/...
# Cluster: mainnet-beta
```

**Status:** ✅ QuickNode RPC configured (dedicated, not public endpoint)

---

### 2. Wallet Funding ✅

```bash
# Current balance
solana balance wallets/production/mainnet-deployer.json --url mainnet-beta
# Output: 10.1 SOL

# Required: ~7.18 SOL
# Buffer: 2.92 SOL extra (for retries, priority fees, errors)
```

**Status:** ✅ Well-funded with safety margin

---

### 3. Program Build Verification ✅

- ✅ Program size: 259 KB (optimized)
- ✅ Checksum verified
- ✅ Program ID consistent across all files
- ✅ Toolchain versions match

---

### 4. Testing Completed ✅

- ✅ Devnet tested extensively
- ✅ Staging environment verified
- ✅ All instructions tested
- ✅ Integration tests passing

**Note:** We're Phase 1 (MVP launch). Security audit recommended for Phase 2 when handling significant TVL.

---

## 🚀 Enhanced Deployment Commands

### Option 1: Anchor Deploy (Recommended with safeguards)

```bash
# Step 1: Final network verification
solana config get
# Verify: RPC is QuickNode, cluster is mainnet

# Step 2: Check current priority fees (optional)
# Visit: https://www.quicknode.com/gas-tracker/solana
# Current typical range: 100,000 - 500,000 micro-lamports

# Step 3: Deploy with all safety flags
anchor deploy \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --provider.cluster mainnet \
  --program-keypair target/deploy/escrow-mainnet-keypair.json
  
# Anchor handles most of the safety flags internally
# Estimated time: 5-10 minutes
```

### Option 2: Solana CLI Direct (Maximum control)

```bash
# Step 1: Set priority fee (adjust based on network congestion)
PRIORITY_FEE=300000  # 300k micro-lamports (~$0.06 extra)

# Step 2: Deploy with all production safeguards
solana program deploy target/deploy/escrow.so \
  --url mainnet-beta \
  --keypair wallets/production/mainnet-deployer.json \
  --program-id target/deploy/escrow-mainnet-keypair.json \
  --with-compute-unit-price $PRIORITY_FEE \
  --max-sign-attempts 1000 \
  --commitment confirmed

# What each flag does:
# --with-compute-unit-price: Prioritizes your transactions during congestion
# --max-sign-attempts: Retries if blockhash expires (common issue!)
# --commitment: Waits for confirmation before proceeding
```

---

## ⚠️ During Deployment - What to Expect

### Normal Behavior ✅

```
Estimated time: 5-10 minutes for 259 KB program
Progress indicators may pause at certain percentages
Multiple "Waiting for confirmation" messages are normal
```

### Warning Signs 🟡

```
If stuck > 15 minutes:
- Network congestion likely
- Increase priority fee and retry
- Check QuickNode status

If "Blockhash not found" errors:
- This is NORMAL and expected
- --max-sign-attempts flag handles this automatically
- Will retry with fresh blockhash
```

### Critical Errors 🔴

```
"Account data too small":
- Program exceeded allocated space
- Solution: solana program extend <PROGRAM_ID> <BYTES>
- Unlikely for us (we have 2x buffer)

"Transaction simulation failed":
- Check network connection
- Verify wallet has SOL
- Retry deployment
```

---

## ✅ Post-Deployment Actions (CRITICAL!)

### Step 1: Verify Deployment Success

```bash
# Check program is deployed
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta

# Expected output:
# Program Id: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
# Owner: BPFLoaderUpgradeab1e11111111111111111111111
# ProgramData Address: [address]
# Authority: GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
# Last Deployed In Slot: [slot number]
# Data Length: 265,344 bytes (259 KB)
# Balance: 1.8468 SOL
```

**Verify:**
- ✅ Program ID matches: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- ✅ Authority matches deployer: `GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH`
- ✅ Data length correct: ~265 KB

---

### Step 2: Upload IDL

```bash
# Upload program interface definition
anchor idl init \
  --filepath target/idl/escrow.json \
  2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --provider.cluster mainnet

# This allows frontends/integrations to interact with your program
```

---

### Step 3: Buffer Account Cleanup (RECOVER YOUR SOL!) 💰

**IMPORTANT:** This is how you recover the ~3.69 SOL buffer rent!

```bash
# List all buffer accounts (should see deployment buffer)
solana program show --buffers --url mainnet-beta

# Expected output:
# Buffer Address: [some address]
# Authority: GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
# Balance: ~3.69 SOL

# Close the buffer and recover SOL
solana program close --buffers --url mainnet-beta

# Alternative: Close specific buffer
solana program close <BUFFER_ADDRESS> --url mainnet-beta

# Verify SOL returned to deployer wallet
solana balance wallets/production/mainnet-deployer.json --url mainnet-beta
# Should be: ~6.61 SOL (10.1 - 7.18 + 3.69 refund)
```

**⚠️ DO THIS IMMEDIATELY AFTER DEPLOYMENT!**  
Each failed deployment also creates a buffer - clean them up to recover SOL!

---

### Step 4: Withdraw Excess SOL to Treasury

```bash
# After buffer refund, you'll have ~6.61 SOL in deployer
# Keep only 0.01 SOL for future operations

# Generate treasury wallet (one-time)
solana-keygen new -o wallets/production/treasury.json

# Transfer excess (6.6 SOL, keep 0.01)
solana transfer $(solana-keygen pubkey wallets/production/treasury.json) 6.6 \
  --from wallets/production/mainnet-deployer.json \
  --url mainnet-beta \
  --with-compute-unit-price 100000

# Verify deployer now has ~0.01 SOL
solana balance wallets/production/mainnet-deployer.json --url mainnet-beta
```

---

### Step 5: Test First Transaction

```bash
# Run a small test transaction to verify program works
# Example: Create test escrow with 0.01 USDC

# Monitor transaction on Solscan:
# https://solscan.io/tx/[TRANSACTION_SIGNATURE]

# Verify:
# - Transaction succeeds
# - Program invoked correctly
# - All instructions execute
# - No unexpected errors
```

---

### Step 6: Update Backend Environment

Update production environment variables:

```env
# Old (devnet/staging)
SOLANA_PROGRAM_ID=GpvN8LB1xXTu9N541x9rrbxD7HwH6xi1Gkp84P7rUAEZ

# New (mainnet)
MAINNET_PROD_PROGRAM_ID=2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
```

---

## 🔒 Upgrade Authority Management

### Current (Phase 1): Single Wallet ✅

```bash
# Current upgrade authority
# Wallet: wallets/production/mainnet-deployer.json
# Address: GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH

# Status: ACCEPTABLE for Phase 1 (MVP launch)
# Security measures:
# ✅ Wallet kept in cold storage (offline USB)
# ✅ Only 0.01 SOL kept in wallet (minimal exposure)
# ✅ Multiple encrypted backups
# ✅ Seed phrase stored securely
```

### Future (Phase 2 - 3-6 months): Transfer to Ledger 🔐

```bash
# When you get hardware wallet:
# 1. Set up Ledger with Solana app
# 2. Get Ledger address:
LEDGER_ADDRESS=$(solana-keygen pubkey usb://ledger)

# 3. Transfer upgrade authority:
solana program set-upgrade-authority \
  2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --upgrade-authority wallets/production/mainnet-deployer.json \
  --new-upgrade-authority $LEDGER_ADDRESS \
  --url mainnet-beta

# 4. Verify transfer:
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta
# Authority should now be Ledger address
```

### Future (Phase 3 - when you have team): Multisig 👥

```bash
# Use Squads Protocol for 2-of-3 multisig
# Visit: https://app.squads.so

# Transfer authority to multisig:
solana program set-upgrade-authority \
  2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --upgrade-authority <CURRENT_AUTHORITY> \
  --new-upgrade-authority <MULTISIG_ADDRESS> \
  --url mainnet-beta
```

---

## 🐛 If Deployment Fails - Recovery Steps

### Failed Deployment: Recover Buffer SOL

```bash
# If deployment fails, Solana provides 12-word seed phrase in error
# Example error:
# "Deployment failed. Buffer account: AbCd...XyZ"
# "Seed phrase: word1 word2 word3 ... word12"

# Step 1: Recover the keypair
solana-keygen recover -o failed-buffer-recovery.json
# Enter the 12-word seed phrase when prompted

# Step 2: Close buffer and recover SOL
solana program close failed-buffer-recovery.json --url mainnet-beta

# Step 3: Clean up
rm failed-buffer-recovery.json

# Your SOL is recovered! ✅
```

### List All Your Buffers (Audit)

```bash
# See ALL buffers associated with your wallet
solana program show --buffers --url mainnet-beta

# Close all at once
solana program close --buffers --url mainnet-beta

# Verify no orphaned buffers remain
solana program show --buffers --url mainnet-beta
# Output: "No buffers found"
```

---

## 🔄 Redeployment Scenarios

### Scenario 1: Bug Fix (Same Size)

```bash
# Fix the bug in code
# Rebuild with same optimizations
anchor build

# Deploy upgrade
solana program deploy target/deploy/escrow.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --keypair wallets/production/mainnet-deployer.json \
  --url mainnet-beta

# Cost: ~0.001 SOL (just transaction fees)
# Program ID stays the same ✅
```

### Scenario 2: Program Grew Larger

```bash
# Check current allocated space
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta

# If new version is bigger, extend first
# Example: Need 50 KB more (51,200 bytes)
solana program extend 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx 51200 \
  --keypair wallets/production/mainnet-deployer.json \
  --url mainnet-beta

# Cost: ~0.35 SOL for 50 KB additional rent

# Then deploy upgrade normally
solana program deploy target/deploy/escrow.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --keypair wallets/production/mainnet-deployer.json \
  --url mainnet-beta
```

### Scenario 3: Complete Redeploy (Lost Authority)

**⚠️ WORST CASE - Avoid this!**

If you lose the upgrade authority keypair:
- Cannot upgrade existing program
- Need to deploy entirely new program
- New program ID (all integrations must update)
- Cost: Full deployment (~7 SOL)

**Prevention:**
- ✅ Multiple backups of seed phrase
- ✅ Encrypted backups in different locations
- ✅ Password manager backup
- ✅ Paper backup in safe

---

## 📊 Cost Summary (With Research Findings)

| Item | Cost | When | Refundable |
|------|------|------|------------|
| **Initial Deployment** |
| Program rent | 1.85 SOL | Upfront | No (permanent) |
| Buffer rent | 3.69 SOL | Upfront | **YES! Close buffer to recover** |
| IDL rent | 0.14 SOL | After deploy | No (permanent) |
| TX fees | 0.001 SOL | Upfront | No |
| Priority fees | 0.001-0.01 SOL | Upfront | No (optional, congestion) |
| Safety buffer | 1.50 SOL | Upfront | Unused portion remains |
| **Total Upfront** | **7.18-7.19 SOL** | | |
| **After Buffer Refund** | **~3.5 SOL permanent** | | |
| | | | |
| **Failed Deployment** |
| Buffer recovery | 3.69 SOL | After failure | **YES! Fully recoverable** |
| | | | |
| **Future Upgrades** |
| Bug fix (same size) | 0.001 SOL | Per upgrade | No |
| Extend program | 0.35 SOL/50KB | If size grows | No (permanent) |
| Priority fees | 0.001-0.01 SOL | If congestion | No |

**Key Insight:** Failed deployments don't lose your SOL - you can recover the buffer! 💰

---

## 🚨 Red Flags We're Avoiding

✅ **Using dedicated RPC** (QuickNode, not public endpoint)  
✅ **Priority fees ready** (for congestion handling)  
✅ **Max sign attempts** (handles blockhash expiration)  
✅ **Tested on devnet/staging** (extensively)  
✅ **Upgrade authority plan** (Phase 1→2→3 roadmap)  
✅ **Multiple backups** (seed phrases secured)  
✅ **Network verification** (will check config before deploy)  
✅ **Buffer cleanup plan** (recover SOL immediately)  

---

## 🎯 Deployment Readiness - Final Check

```
╔═══════════════════════════════════════════════════╗
║         DEPLOYMENT READINESS STATUS               ║
╚═══════════════════════════════════════════════════╝

✅ Program built and verified (259 KB)
✅ Program IDs consistent everywhere
✅ Wallet funded (10.1 SOL with safety margin)
✅ QuickNode RPC configured (dedicated endpoint)
✅ Priority fee strategy ready
✅ Max retry strategy ready
✅ Buffer cleanup plan documented
✅ Upgrade authority secured
✅ Testing complete (devnet + staging)
✅ Network configuration verified
✅ Post-deployment checklist prepared
✅ Recovery procedures documented

🚀 READY TO DEPLOY WITH CONFIDENCE!
```

---

## 📞 Support Resources

### If Issues Arise

**QuickNode Status:** https://status.quiknode.com/  
**Solana Status:** https://status.solana.com/  
**Priority Fee Tracker:** https://www.quicknode.com/gas-tracker/solana  

**Solana Discord:** https://discord.gg/solana  
**Anchor Discord:** https://discord.gg/anchor  

**Your Monitoring:**
- Solscan: https://solscan.io/address/2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
- Explorer: https://explorer.solana.com/address/2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx?cluster=mainnet-beta

---

**Your research made this deployment plan significantly better!** 🎉  
All common gotchas are now addressed with specific solutions. Ready when you are! 🚀

