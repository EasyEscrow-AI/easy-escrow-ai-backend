# Production Wallet Generation Guide

**Status:** Step-by-step instructions  
**Date:** 2025-10-27  
**Security Level:** CRITICAL

---

## Overview

This guide walks through generating the three wallets needed for production mainnet deployment:

1. **Deployer Wallet** - For program deployment (cold storage)
2. **Admin Wallet** - For daily operations (hot wallet)
3. **Fee Collector Wallet** - For receiving fees (hot wallet)

---

## Prerequisites

✅ **Required:**
- Solana CLI 2.1.x installed (`solana --version`)
- Secure computer (no malware, updated OS)
- NOT on public/shared computer
- Encrypted disk (BitLocker/FileVault)
- Password manager for storing keys
- Physical paper and pen (for seed phrases)

⚠️ **Environment:**
- Close all unnecessary applications
- Disconnect from public WiFi (use trusted network)
- Ensure antivirus is up to date
- No screen sharing active

---

## Step 1: Generate Deployer Wallet

**This wallet will deploy your program and then go to cold storage.**

### 1.1 Create Secure Directory

```powershell
# Windows PowerShell
cd C:\websites\VENTURE\easy-escrow-ai-backend

# Verify directory exists
if (!(Test-Path "wallets\production")) {
    New-Item -ItemType Directory -Path "wallets\production" -Force
}

# Verify gitignore protection
git check-ignore -v wallets/production/test.json
# Should show: .gitignore:34:wallets/
```

### 1.2 Generate Deployer Keypair

```bash
# Generate with passphrase protection (RECOMMENDED)
solana-keygen new -o wallets/production/mainnet-deployer.json

# You will be prompted:
# 1. Enter BIP39 passphrase (OPTIONAL but recommended)
# 2. Seed phrase will be displayed (SAVE THIS!)
```

**CRITICAL: Save the seed phrase shown on screen!**

### 1.3 Document Seed Phrase

**Write seed phrase on paper (not digital):**

```
Seed Phrase (24 words):
1. ____________  7. ____________  13. ____________  19. ____________
2. ____________  8. ____________  14. ____________  20. ____________
3. ____________  9. ____________  15. ____________  21. ____________
4. ____________ 10. ____________  16. ____________  22. ____________
5. ____________ 11. ____________  17. ____________  23. ____________
6. ____________ 12. ____________  18. ____________  24. ____________

BIP39 Passphrase (if used): ________________________

Date Generated: _______________
Wallet Purpose: Mainnet Deployer
Public Address: ________________________________________
```

**Store copies in:**
- [ ] Bank safe deposit box
- [ ] Home safe
- [ ] Encrypted password manager (as backup)

### 1.4 Verify Generation

```bash
# Get public address
solana-keygen pubkey wallets/production/mainnet-deployer.json

# Verify file permissions (Unix/Mac)
ls -la wallets/production/mainnet-deployer.json
# Should show: -rw------- (600)

# Windows: Check file permissions
Get-Acl wallets\production\mainnet-deployer.json
# Should show only your user account
```

### 1.5 Create Encrypted Backup

```bash
# Create encrypted backup
tar -czf deployer-backup-$(date +%Y%m%d).tar.gz wallets/production/mainnet-deployer.json
gpg -c deployer-backup-*.tar.gz

# Store encrypted backup in separate location
# DELETE unencrypted tar.gz
rm deployer-backup-*.tar.gz
```

---

## Step 2: Generate Admin Wallet

**This wallet will be used for daily operations (hot wallet).**

### 2.1 Generate in Temporary Location

```bash
# Generate to temp location (NOT in git)
solana-keygen new -o /tmp/mainnet-admin.json

# Save seed phrase as with deployer wallet
```

### 2.2 Extract Private Key (Base58)

```bash
# Convert to base58 for environment variables
cat /tmp/mainnet-admin.json

# Output looks like:
# [123,45,67,...,89]  <- This is the private key array

# Use Solana CLI to get base58 format
# Or use online tool (ONLY on secure, offline computer)
```

**Alternative: Use helper script**

```typescript
// temp-extract-key.ts (create temporarily)
import bs58 from 'bs58';
import fs from 'fs';

const keypairJson = JSON.parse(fs.readFileSync('/tmp/mainnet-admin.json', 'utf8'));
const base58Key = bs58.encode(Buffer.from(keypairJson));
console.log('Base58 Private Key:', base58Key);
console.log('Public Address:', /* derive public key */);
```

### 2.3 Store in Password Manager

**Add to password manager:**
```
Title: EasyEscrow Mainnet - Admin Wallet
Username: mainnet-admin
Password: <BASE58_PRIVATE_KEY>
Notes: 
  - Purpose: Daily operations, admin cancellations
  - Public Address: <PUBLIC_ADDRESS>
  - Generated: <DATE>
  - Deployed to: DigitalOcean App Platform
  - Environment Variable: MAINNET_PROD_ADMIN_PRIVATE_KEY
```

### 2.4 Delete Temporary File

```bash
# Securely delete from temp
rm /tmp/mainnet-admin.json

# Verify deletion
ls /tmp/mainnet-admin.json
# Should show: No such file or directory
```

---

## Step 3: Generate Fee Collector Wallet

**This wallet will receive platform fees.**

### 3.1 Generate Keypair

```bash
# Generate to temp location
solana-keygen new -o /tmp/mainnet-fee-collector.json

# Save seed phrase
```

### 3.2 Extract Private Key & Address

```bash
# Get public address
COLLECTOR_ADDRESS=$(solana-keygen pubkey /tmp/mainnet-fee-collector.json)
echo "Fee Collector Address: $COLLECTOR_ADDRESS"

# Convert to base58 (same process as admin wallet)
# Store in password manager
```

### 3.3 Store in Password Manager

**Add to password manager:**
```
Title: EasyEscrow Mainnet - Fee Collector
Username: mainnet-fee-collector
Password: <BASE58_PRIVATE_KEY>
Notes:
  - Purpose: Receives platform fees
  - Public Address: <PUBLIC_ADDRESS>
  - Generated: <DATE>
  - Deployed to: DigitalOcean App Platform
  - Environment Variables:
    - MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY
    - MAINNET_PROD_FEE_COLLECTOR_ADDRESS
```

### 3.4 Delete Temporary File

```bash
# Securely delete
rm /tmp/mainnet-fee-collector.json
```

---

## Step 4: Fund Wallets

**Before deployment, wallets need SOL.**

### 4.1 Purchase SOL

**Buy from exchange:**
- Coinbase, Binance, Kraken, etc.
- Minimum: 20 SOL total
- Recommended: 25 SOL (buffer for fees)

### 4.2 Transfer to Deployer

```bash
# From exchange or funded wallet, send 10 SOL to deployer
DEPLOYER_ADDRESS=$(solana-keygen pubkey wallets/production/mainnet-deployer.json)

# Transfer from exchange to deployer address
# Or from funded wallet:
solana transfer $DEPLOYER_ADDRESS 10 \
  --url mainnet-beta \
  --keypair <YOUR_FUNDED_WALLET>

# Verify balance
solana balance $DEPLOYER_ADDRESS --url mainnet-beta
# Should show: ~10 SOL
```

### 4.3 Transfer to Admin

```bash
# Get admin address from password manager
ADMIN_ADDRESS=<ADMIN_PUBLIC_ADDRESS>

# Transfer 5 SOL for operations
solana transfer $ADMIN_ADDRESS 5 \
  --url mainnet-beta \
  --keypair <YOUR_FUNDED_WALLET>

# Verify balance
solana balance $ADMIN_ADDRESS --url mainnet-beta
```

### 4.4 Transfer to Fee Collector

```bash
# Get collector address from password manager
COLLECTOR_ADDRESS=<COLLECTOR_PUBLIC_ADDRESS>

# Transfer 1 SOL for rent
solana transfer $COLLECTOR_ADDRESS 1 \
  --url mainnet-beta \
  --keypair <YOUR_FUNDED_WALLET>

# Verify balance
solana balance $COLLECTOR_ADDRESS --url mainnet-beta
```

---

## Step 5: Configure DigitalOcean Secrets

**Add hot wallets (admin & fee collector) to DigitalOcean.**

### 5.1 Navigate to App Settings

1. Go to https://cloud.digitalocean.com/apps
2. Select `easyescrow-backend-production`
3. Settings → Environment Variables

### 5.2 Add Admin Wallet

```
Key: MAINNET_PROD_ADMIN_PRIVATE_KEY
Value: <BASE58_PRIVATE_KEY from password manager>
Type: SECRET
Scope: RUN_AND_BUILD_TIME
```

### 5.3 Add Fee Collector Wallet

```
Key: MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY
Value: <BASE58_PRIVATE_KEY from password manager>
Type: SECRET
Scope: RUN_AND_BUILD_TIME

Key: MAINNET_PROD_FEE_COLLECTOR_ADDRESS
Value: <PUBLIC_ADDRESS from password manager>
Type: PLAIN
Scope: RUN_AND_BUILD_TIME
```

### 5.4 Save Configuration

Click "Save" → App will redeploy with new environment variables

---

## Security Checklist

### Before Deployment ✅

- [ ] All seed phrases written on paper and stored securely (3+ locations)
- [ ] Deployer wallet backed up and encrypted
- [ ] Admin & fee collector keys stored in password manager
- [ ] Temporary files deleted (`/tmp/mainnet-*.json`)
- [ ] File permissions verified (600 for deployer wallet)
- [ ] Wallets funded with sufficient SOL
- [ ] DigitalOcean secrets configured
- [ ] No wallet files committed to git
- [ ] Team knows location of seed phrases (in case of emergency)

### Post-Deployment ✅

- [ ] Upgrade authority transferred to multisig
- [ ] Deployer wallet refunded (excess SOL)
- [ ] Deployer wallet moved to cold storage
- [ ] Balance monitoring configured
- [ ] Emergency procedures documented
- [ ] Team trained on wallet security

---

## Common Issues & Solutions

### Issue: "Permission denied" when generating wallet

**Solution:**
```bash
# Fix directory permissions
chmod 700 wallets/production

# Regenerate
solana-keygen new -o wallets/production/mainnet-deployer.json
```

### Issue: Lost seed phrase

**Solution:**
- If wallet hasn't been funded: Generate new wallet
- If wallet funded and lost: **FUNDS ARE UNRECOVERABLE**
- Prevention: Store seed phrases in multiple secure locations

### Issue: Wallet file accidentally committed to git

**Solution:**
1. **Immediately** generate new wallet
2. Transfer funds to new wallet
3. Remove old wallet from git history:
   ```bash
   git filter-repo --path wallets/production/mainnet-deployer.json --invert-paths
   ```
4. Force push (after team coordination)
5. Rotate all related secrets

### Issue: Can't remember BIP39 passphrase

**Solution:**
- If you have seed phrase but forgot passphrase: Wallet is unrecoverable
- Must generate new wallet
- Prevention: Store passphrase with seed phrase

---

## Wallet Summary Table

| Wallet | Location | Hot/Cold | Purpose | Funding | Environment Variable |
|--------|----------|----------|---------|---------|---------------------|
| **Deployer** | `wallets/production/mainnet-deployer.json` | ❄️ Cold | Deploy program | 10 SOL | N/A (file-based) |
| **Admin** | Password Manager | 🔥 Hot | Daily ops | 5 SOL | `MAINNET_PROD_ADMIN_PRIVATE_KEY` |
| **Fee Collector** | Password Manager | 🔥 Hot | Receive fees | 1 SOL | `MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY` |

---

## Next Steps

After generating all wallets:

1. ✅ Verify all wallets funded
2. ✅ Verify DigitalOcean secrets configured
3. ✅ Run pre-deployment verification: `npm run validate:pre-deployment`
4. ✅ Proceed to program build: Task 90.2

---

**Security Reminder:** These wallets control real funds on mainnet. Treat them with extreme care. When in doubt, ask for security review before proceeding.

**Last Updated:** 2025-10-27  
**Next Review:** Before wallet generation

