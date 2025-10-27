# 🔐 Production Deployer Wallet Generated

**Generated:** 2025-10-27  
**Purpose:** Mainnet program deployment  
**Security Phase:** Phase 1 (Regular wallet, upgrade to multisig later)

---

## ✅ Wallet Details

### Public Address (Safe to Share)
```
GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
```

### File Location
```
wallets/production/mainnet-deployer.json
```

---

## 🚨 CRITICAL: Backup Your Seed Phrase NOW

### 24-Word Recovery Phrase

**⚠️ THIS IS DISPLAYED ONLY ONCE - BACKUP IMMEDIATELY!**

```
artefact goat orient onion idea actual pledge tourist embark olive age usual 
exclude jaguar over shrug effort tissue foil eternal robot universe remember angle
```

### Backup Checklist

Complete ALL of these backups:

- [ ] **Backup 1:** Save in password manager (1Password, Bitwarden, etc.)
  - Store as secure note
  - Include public address for reference
  - Never sync to cloud if possible

- [ ] **Backup 2:** Write on paper
  - Use pen (not pencil)
  - Store in safe or secure location
  - Consider laminating
  - Keep away from moisture/fire

- [ ] **Backup 3:** Encrypted USB drive
  - Copy this file to encrypted USB
  - Store USB in different physical location than paper
  - Use VeraCrypt or BitLocker for encryption

- [ ] **Backup 4:** Encrypted cloud backup (optional)
  - Encrypt this file with GPG before uploading
  - Use strong passphrase for GPG
  - Store on different service than password manager

### Security Verification

- [ ] **Verified** all 24 words are spelled correctly
- [ ] **Verified** all 24 words are in correct order
- [ ] **Completed** at least 2 independent backups
- [ ] **Stored** backups in different physical locations
- [ ] **Tested** recovery (optional but recommended on devnet first)

---

## 💰 Funding Instructions

### Required Amount
```
7 SOL (minimum)
```

**Breakdown (OPTIMIZED PROGRAM):**
- Program deployment: ~7.18 SOL upfront
- Buffer refund: ~3.69 SOL (refunded after deployment)
- Net cost: ~3.49 SOL permanent
- Recommended: 7 SOL (includes safety buffer)

**🎉 YOU SAVED 5 SOL ($1,000) thanks to size optimization!**

### How to Fund

#### Option A: From Centralized Exchange (Coinbase, Kraken, Binance)

1. **Copy Address:**
   ```
   GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
   ```

2. **Withdraw from Exchange:**
   - Log into exchange
   - Navigate to SOL wallet
   - Click "Withdraw" or "Send"
   - **IMPORTANT:** Select "Solana" network (NOT any other chain!)
   - Paste address: `GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH`
   - Amount: `7 SOL`
   - Confirm network fees (~0.000005 SOL)
   - Submit withdrawal

3. **Verify Receipt:**
   ```bash
   solana balance wallets/production/mainnet-deployer.json --url mainnet-beta
   ```

#### Option B: From Another Solana Wallet

```bash
# From Phantom, Solflare, or other wallet
# Send 7 SOL to: GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
# Network: Solana Mainnet

# Verify receipt
solana balance wallets/production/mainnet-deployer.json --url mainnet-beta
```

### Funding Safety Checklist

- [ ] **Verified** address is exactly: `GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH`
- [ ] **Selected** correct network: "Solana" or "Solana Mainnet"
- [ ] **NOT** using: Ethereum, BSC, Polygon, or any EVM chain
- [ ] **Confirmed** amount: 7 SOL
- [ ] **Test transaction** (optional): Send 0.01 SOL first to verify

---

## 🚀 Next Steps After Funding

### Step 1: Verify Balance
```bash
solana balance wallets/production/mainnet-deployer.json --url mainnet-beta

# Expected output: 7 SOL
```

### Step 2: Deploy Program
```bash
# Using Anchor deploy
anchor deploy \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --provider.cluster mainnet-beta

# This will take 5-10 minutes
# Uses QuickNode RPC for fast deployment
```

### Step 3: Upload IDL
```bash
# After successful deployment
anchor idl init --filepath target/idl/escrow.json 3k93LULWJHQSpWk7vPVMg34a75bTqrkueoTkbmdeeaqX \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --provider.cluster mainnet-beta
```

### Step 4: Verify Deployment
```bash
# Run verification script
bash scripts/solana/verify-mainnet-deployment.sh

# Should show all ✅ checks passed
```

### Step 5: Secure Post-Deployment

After deployment completes and buffer is refunded (~5-10 minutes):

```bash
# Check balance (should be ~3.7 SOL after refund)
solana balance wallets/production/mainnet-deployer.json --url mainnet-beta

# Withdraw excess to treasury (keep only 0.01 SOL)
# Create treasury wallet first:
solana-keygen new -o wallets/production/treasury.json

# Transfer excess
solana transfer <TREASURY_ADDRESS> <AMOUNT> \
  --from wallets/production/mainnet-deployer.json \
  --url mainnet-beta

# Example: If balance is 3.7 SOL, transfer 3.69 SOL
# Keep 0.01 SOL in deployer for future transactions
```

### Step 6: Cold Storage

After withdrawing excess SOL:

```bash
# 1. Copy deployer wallet to encrypted USB
# 2. Verify backup is readable
# 3. Delete wallet from computer (keep backups only)
# 4. Store USB in secure location (safe, drawer, etc.)
# 5. Document location in password manager
```

---

## 🔒 Security Best Practices

### While Wallet is "Hot" (On Computer)

1. **Disconnect from Internet** when not actively deploying
2. **Never** enter seed phrase in any website or app
3. **Never** share wallet file or seed phrase
4. **Always** verify addresses before sending
5. **Monitor** deployer address for unexpected activity:
   - Solscan: https://solscan.io/address/GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
   - Solana Explorer: https://explorer.solana.com/address/GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH

### After Moving to Cold Storage

1. **Only** retrieve when needed for program upgrades
2. **Plan** upgrades in advance (minimize hot wallet time)
3. **Delete** from computer after each use
4. **Verify** balance hasn't changed unexpectedly
5. **Consider** upgrading to Ledger within 3-6 months

---

## 📊 Wallet Monitoring

### Add to Monitoring Tools

**Solscan Watchlist:**
1. Go to https://solscan.io
2. Search for: `GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH`
3. Click "Add to Watchlist"
4. Enable notifications for:
   - Balance changes
   - Outgoing transactions
   - Program authority changes

**Solana Explorer:**
- Bookmark: https://explorer.solana.com/address/GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH?cluster=mainnet-beta
- Check periodically for unexpected activity

---

## ⚠️ Emergency Procedures

### If Wallet May Be Compromised

**Immediate Actions:**

1. **Check Balance:**
   ```bash
   solana balance wallets/production/mainnet-deployer.json --url mainnet-beta
   ```

2. **Check Transactions:**
   - Visit Solscan: https://solscan.io/address/GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
   - Review all transactions
   - Look for unauthorized transfers

3. **If SOL Still Present:**
   ```bash
   # Transfer to new secure wallet immediately
   solana-keygen new -o wallets/production/emergency-backup.json
   
   solana transfer <NEW_ADDRESS> ALL \
     --from wallets/production/mainnet-deployer.json \
     --url mainnet-beta
   ```

4. **Check Program Authority:**
   ```bash
   solana program show 3k93LULWJHQSpWk7vPVMg34a75bTqrkueoTkbmdeeaqX --url mainnet-beta
   
   # Look for "Upgrade Authority" field
   # Should be: GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
   ```

5. **If Authority Unchanged:**
   ```bash
   # Transfer program authority to new wallet
   solana program set-upgrade-authority 3k93LULWJHQSpWk7vPVMg34a75bTqrkueoTkbmdeeaqX \
     --upgrade-authority wallets/production/mainnet-deployer.json \
     --new-upgrade-authority <NEW_SECURE_ADDRESS> \
     --url mainnet-beta
   ```

### If Wallet is Lost/Deleted

**Recovery from Seed Phrase:**

```bash
# Recover wallet from seed phrase
solana-keygen recover 'prompt://?' -o wallets/production/mainnet-deployer-recovered.json --force

# When prompted, enter your 24-word seed phrase
# Then enter recovery passphrase: [none] (press Enter)
```

**Verify Recovery:**
```bash
solana-keygen pubkey wallets/production/mainnet-deployer-recovered.json

# Should output: GWFUgFT25EUWsQVVmPHaUESKnosJ4adUpWQinCz7CVYH
```

---

## 📝 Deployment Readiness Checklist

Before proceeding with deployment:

### Wallet Setup
- [x] Production wallet generated
- [ ] Seed phrase backed up in 3+ locations
- [ ] Backups verified and tested
- [ ] Wallet monitoring set up

### Funding
- [ ] Wallet funded with 12 SOL
- [ ] Balance verified on-chain
- [ ] Transaction confirmed on Solscan

### Infrastructure
- [x] Program built (479KB, checksum verified)
- [x] QuickNode RPC configured
- [x] DigitalOcean app created
- [ ] Backend environment variables ready

### Documentation
- [x] Security roadmap documented
- [x] Deployment guide complete
- [x] Emergency procedures documented
- [x] Cost analysis verified

---

## 🎯 Current Status

**Wallet Generated:** ✅ Complete  
**Wallet Backed Up:** ⏳ **ACTION REQUIRED**  
**Wallet Funded:** ⏳ Waiting  
**Ready to Deploy:** ⏳ After funding

---

## 📞 Support Resources

### Solana Documentation
- Wallet Security: https://docs.solana.com/wallet-guide
- CLI Reference: https://docs.solana.com/cli

### Monitoring Tools
- Solscan: https://solscan.io
- Solana Explorer: https://explorer.solana.com
- Solana Beach: https://solanabeach.io

### Community
- Solana Discord: https://discord.gg/solana
- Anchor Discord: https://discord.gg/anchor

---

## ⏭️ What's Next?

1. **RIGHT NOW:** Backup your seed phrase (ALL 3+ backups)
2. **TODAY:** Fund wallet with 12 SOL from exchange
3. **AFTER FUNDING:** Run deployment (we'll do this together)
4. **AFTER DEPLOY:** Move wallet to cold storage
5. **WITHIN 3-6 MONTHS:** Upgrade to Ledger (Phase 2)
6. **WHEN YOU HAVE TEAM:** Implement multisig (Phase 3)

---

**🔥 REMEMBER:** Your seed phrase is your ONLY way to recover this wallet. If you lose it AND the wallet file, your program authority is gone forever. BACK IT UP NOW! 🔥

