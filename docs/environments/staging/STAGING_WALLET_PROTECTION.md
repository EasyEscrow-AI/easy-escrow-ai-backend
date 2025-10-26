# STAGING Wallet Protection

This document explains how STAGING wallet files are protected from accidental modification or deletion.

---

## 🛡️ Why STAGING Wallets Are Protected

STAGING is a **prod-like environment** that serves as a release candidate gate. For this to work effectively, STAGING wallets must remain **static and predictable**.

### Key Reasons:

1. **Stability**: STAGING environment should be stable and reproducible
2. **Configuration References**: Wallet addresses are referenced in:
   - Environment variables (`.env.staging`)
   - CI/CD pipeline secrets
   - Documentation files
   - Test fixtures
3. **Team Consistency**: All team members use the same wallet **addresses**
4. **Prevents Accidents**: Stops accidental `solana-keygen new --force` overwrites
5. **Deployment Integrity**: Ensures deployments are tested with consistent wallets

---

## 🚨 **CRITICAL: Wallets Are NOT Tracked in Git**

### What `wallets/staging/` Directory Is For:

The `wallets/staging/` directory is for **LOCAL storage** of keypair files:
- ✅ **Purpose**: Convenient local access to STAGING keypairs
- ✅ **Git Status**: **IGNORED** (never committed to git)
- ✅ **Private Keys**: Stored in `.env.staging` (also git-ignored)
- ✅ **Team Sharing**: Via secure channels (NOT git)

### ❌ **What Should NEVER Be in Git:**

- **Keypair JSON files** (contain private keys)
- **`.env.*` files** (contain private keys in Base58)
- **Any file with private keys**

### ✅ **What IS Tracked in Git:**

- **Public addresses** (in documentation)
- **Configuration templates** (`.env.staging.example`)
- **Setup scripts** (without private keys)

---

## 🔒 Protection Layers Implemented

### 1. Read-Only File Attributes

All STAGING wallet files are marked as read-only at the OS level:

**Protected Wallet Files:**
- `wallets/staging/staging-sender.json` ✅ (Read-Only, Git-Ignored)
- `wallets/staging/staging-receiver.json` ✅ (Read-Only, Git-Ignored)
- `wallets/staging/staging-admin.json` ✅ (Read-Only, Git-Ignored)
- `wallets/staging/staging-fee-collector.json` ✅ (Read-Only, Git-Ignored)
- `target/deploy/escrow-keypair-staging.json` ✅ (Read-Only, Git-Ignored)

**Purpose**: Prevents accidental overwriting with `solana-keygen new --force`

**Verification Command:**
```powershell
Get-ChildItem -Path "wallets/staging/*.json" | Select-Object Name, IsReadOnly
Get-ItemProperty -Path "target/deploy/escrow-keypair-staging.json" | Select-Object Name, IsReadOnly
```

### 2. Git Ignore Protection

STAGING wallets are **NEVER committed to git**:

**`.gitignore` Rules:**
```
# Private key directories (NEVER commit these)
wallets/
keys/
keypairs/

# Environment files with secrets (NEVER commit these)
.env
.env.*
.env.staging

# Keypair files (NEVER commit these)
*-keypair.json
**/target/deploy/*.json
```

**Verification:**
```bash
git status wallets/staging/
# Should output: nothing to commit (untracked files)
```

### 3. Pre-commit Hook Security Check

The pre-commit hook **blocks** any attempt to commit private keys:

```bash
#!/bin/sh
# Check for accidental private key commits
if git diff --cached --name-only | grep -qE "wallets/.*\.json|.*keypair.*\.json|\.env\..*"; then
  echo "🚨 CRITICAL: You are about to commit PRIVATE KEYS or secrets!"
  echo "This is a SECURITY RISK and should NEVER be done."
  echo "❌ Commit BLOCKED for your protection."
  exit 1
fi
```

**This prevents:**
- Accidental commits of wallet files
- Accidental commits of `.env.*` files
- Accidental commits of any keypair files

### 4. Backup Recovery

All STAGING wallets have backups in `/temp/staging-backups/`:
- `staging-sender.json`
- `staging-receiver.json`
- `staging-admin.json`
- `staging-fee-collector.json`
- `escrow-keypair-staging.json`

**Note**: Backups are also git-ignored and should be shared via secure channels only.

---

## 🔓 How to Temporarily Unlock (If Really Needed)

**⚠️ WARNING**: Only unlock if you have a very good reason and understand the consequences.

### Unlock a Single File

```powershell
# Remove read-only protection
Set-ItemProperty -Path "wallets/staging/staging-sender.json" -Name IsReadOnly -Value $false

# Make your changes
# ... edit the file ...

# Re-enable protection
Set-ItemProperty -Path "wallets/staging/staging-sender.json" -Name IsReadOnly -Value $true
```

### Unlock All STAGING Wallets

```powershell
# Remove protection from all files
Get-ChildItem -Path "wallets/staging/*.json" | ForEach-Object {
    Set-ItemProperty -Path $_.FullName -Name IsReadOnly -Value $false
}
Set-ItemProperty -Path "target/deploy/escrow-keypair-staging.json" -Name IsReadOnly -Value $false

# Make your changes
# ...

# Re-enable protection
Get-ChildItem -Path "wallets/staging/*.json" | ForEach-Object {
    Set-ItemProperty -Path $_.FullName -Name IsReadOnly -Value $true
}
Set-ItemProperty -Path "target/deploy/escrow-keypair-staging.json" -Name IsReadOnly -Value $true
```

---

## 🆘 Emergency Recovery Procedures

### If a Wallet File is Accidentally Deleted

1. **Restore from backup:**
   ```powershell
   Copy-Item -Path "temp/staging-backups/staging-sender.json" -Destination "wallets/staging/staging-sender.json"
   Set-ItemProperty -Path "wallets/staging/staging-sender.json" -Name IsReadOnly -Value $true
   ```

2. **Verify the address matches:**
   ```bash
   solana address -k wallets/staging/staging-sender.json
   # Should output: AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z
   ```

3. **Update `.env.staging` if needed** (should already be correct)

### If a Wallet File is Accidentally Overwritten

1. **Stop immediately** - Don't save or commit
2. **Restore from backup** (see above)
3. **Re-enable read-only protection**

### If Backup is Lost

If the backup in `/temp/staging-backups/` is lost:

1. **Check with team members** - They may have copies
2. **Restore from `.env.staging`** - Private keys are stored there in Base58 format
3. **Recreate keypair file from Base58:**
   ```javascript
   const fs = require('fs');
   const bs58 = require('bs58');
   
   const base58Key = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
   const keypairArray = Array.from(bs58.decode(base58Key));
   fs.writeFileSync('wallets/staging/staging-sender.json', JSON.stringify(keypairArray));
   ```

---

## 🤝 Team Onboarding: Sharing STAGING Wallets

### ❌ **NEVER Do This:**
- Commit wallet files to git
- Share private keys in Slack/email
- Store keys in plaintext documents
- Include keys in screenshots

### ✅ **Correct Approach:**

**Option 1: Secure File Sharing**
1. Export `.env.staging` from secure location
2. Share via:
   - Encrypted password manager (1Password, LastPass)
   - Secure file sharing (encrypted Dropbox/OneDrive link)
   - In-person transfer
3. New team member:
   - Places `.env.staging` in project root
   - Runs setup script to recreate keypair files from Base58 keys

**Option 2: DigitalOcean App Platform Secrets**
1. All STAGING private keys stored in DO App Platform environment variables
2. New team members access via DO dashboard (with proper permissions)
3. Download environment variables securely

**Option 3: Secrets Management Service**
1. Use AWS Secrets Manager, HashiCorp Vault, or similar
2. Grant team member access to `staging/wallets` secret
3. Pull secrets programmatically in local dev environment

---

## 📋 STAGING Wallet Addresses (Reference)

**These PUBLIC addresses can be shared freely:**

| Wallet | Address | Env Var |
|--------|---------|---------|
| **Sender** | `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z` | `DEVNET_STAGING_SENDER_PRIVATE_KEY` |
| **Receiver** | `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4` | `DEVNET_STAGING_RECEIVER_PRIVATE_KEY` |
| **Admin** | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` | `DEVNET_STAGING_ADMIN_PRIVATE_KEY` |
| **Fee Collector** | `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ` | `DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY` |
| **Program** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | `DEVNET_STAGING_PROGRAM_ID` |

**⚠️ These addresses should NEVER change in STAGING environment.**
**🔒 Private keys are stored ONLY in `.env.staging` (git-ignored).**

---

## ✅ Verification Checklist

After any wallet-related work, verify protection is intact:

- [ ] All wallet files are read-only
- [ ] Backup files exist in `/temp/staging-backups/`
- [ ] `.env.staging` has correct wallet private keys (Base58 format)
- [ ] `wallets/staging/` directory is git-ignored
- [ ] `git status` shows no wallet files (should be untracked)
- [ ] Wallet addresses match the reference table above
- [ ] Pre-commit hook blocks wallet file commits

**Verification Commands:**
```powershell
# Check read-only status
Get-ChildItem -Path "wallets/staging/*.json" | Select-Object Name, IsReadOnly

# Verify git ignores wallets
git status wallets/staging/
# Should output: "Untracked files" or nothing (good)

# Verify addresses
solana address -k wallets/staging/staging-sender.json
solana address -k wallets/staging/staging-receiver.json
solana address -k wallets/staging/staging-admin.json
solana address -k wallets/staging/staging-fee-collector.json
solana address -k target/deploy/escrow-keypair-staging.json

# Check backups exist
Test-Path temp/staging-backups/staging-sender.json
Test-Path temp/staging-backups/staging-receiver.json
Test-Path temp/staging-backups/staging-admin.json
Test-Path temp/staging-backups/staging-fee-collector.json
Test-Path temp/staging-backups/escrow-keypair-staging.json

# Test pre-commit hook protection (simulate)
git add wallets/staging/staging-sender.json 2>&1
# Should fail or show warning
```

---

## 🎯 Best Practices

### DO ✅

- **Store private keys in `.env.staging`** (git-ignored)
- **Keep keypair files read-only** locally
- **Use secure channels** to share keys with team
- **Backup keypairs** in secure locations
- **Verify addresses** match after any recovery
- **Keep addresses static** in STAGING environment

### DON'T ❌

- **Never commit** keypair files to git
- **Never commit** `.env.*` files to git
- **Never share** private keys in plaintext
- **Never store** keys in public locations
- **Never reuse** STAGING keys for other environments
- **Never regenerate** STAGING keys without team coordination

---

## 🔄 Comparison with DEV Environment

| Aspect | DEV Wallets | STAGING Wallets |
|--------|-------------|-----------------|
| **Read-Only Protection** | ✅ Yes | ✅ Yes |
| **Git Tracking** | ❌ NO (Git-Ignored) | ❌ NO (Git-Ignored) |
| **Backups** | ✅ Yes | ✅ Yes |
| **Stability** | 🟡 Can change | ✅ Must be static |
| **Purpose** | Development testing | Release candidate gate |
| **Private Key Storage** | `.env.dev` (git-ignored) | `.env.staging` (git-ignored) |

---

## 📚 Related Documentation

- [STAGING Wallets Overview](STAGING_WALLETS.md)
- [STAGING Strategy](architecture/STAGING_STRATEGY.md)
- [Program IDs by Environment](PROGRAM_IDS.md)
- [Base58 vs Byte Array Format](setup/BASE58_VS_BYTE_ARRAY.md)

---

## ⚠️ Important Security Reminders

1. **Private keys NEVER go in git** - Always git-ignored
2. **Wallets are secrets** - Treat like passwords
3. **Read-only prevents accidents** - Stops overwrites, not commits
4. **Team needs secure sharing** - Use encrypted channels
5. **Recovery requires backups** - Keep multiple secure copies
6. **Pre-commit hook is last defense** - Blocks accidental commits

---

**Last Updated:** 2025-01-20  
**Maintained By:** Development Team  
**Related Task:** Task 65.1 - Protect STAGING Wallet Files from Accidental Overwrite  
**Security Level:** CRITICAL - Contains wallet protection guidelines
