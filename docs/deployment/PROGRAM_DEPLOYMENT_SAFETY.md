# Program Deployment Safety Guidelines

**Date:** November 3, 2025  
**Status:** CRITICAL - MUST FOLLOW

---

## ⚠️ CRITICAL: Static Program IDs

**All environments use STATIC, PRE-EXISTING program IDs. We NEVER deploy new programs without explicit user approval.**

### Environment Program IDs

| Environment | Network | Program ID | Status |
|-------------|---------|------------|--------|
| **Staging** | Devnet | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | ✅ Active |
| **Production** | Mainnet | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | ✅ Active |
| **Development** | Devnet | `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd` | ✅ Active |

---

## 🛡️ Safety Mechanisms

### 1. Program Keypair Verification

**BEFORE EVERY DEPLOYMENT**, the script must verify:

```powershell
# Get the program ID from the keypair
$actualProgramId = solana-keygen pubkey $programKeypair

# MUST match the expected static program ID
if ($actualProgramId -ne $expectedProgramId) {
    Write-Host "❌ CRITICAL ERROR: This would deploy a NEW program!"
    Write-Host "   Deployment BLOCKED"
    exit 1
}
```

### 2. Explicit Program ID in Deploy Command

**ALWAYS use `solana program deploy` with explicit `--program-id`:**

```bash
# ✅ CORRECT - Explicitly targets existing program
solana program deploy target/deploy/escrow.so \
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --keypair wallets/staging/staging-deployer.json \
  --url devnet

# ❌ WRONG - Can deploy to random program ID
anchor deploy --program-keypair target/deploy/escrow-keypair.json
```

### 3. Environment-Specific Keypairs

**Program keypairs MUST be stored in environment-specific directories:**

```
wallets/
├── staging/
│   ├── escrow-program-keypair.json  ← Generates: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
│   └── staging-deployer.json
├── production/
│   ├── escrow-program-keypair.json  ← Generates: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
│   └── mainnet-deployer.json
└── dev/
    ├── escrow-program-keypair.json  ← Generates: 4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd
    └── devnet-admin.json
```

**NEVER use `target/deploy/escrow-keypair.json` for deployments!**

---

## 🚨 What Went Wrong (November 3, 2025)

### Incident Summary

**Accidental New Program Deployment:**
- Attempted to upgrade staging program: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- Used wrong command: `anchor deploy --program-keypair target/deploy/escrow-keypair.json`
- Resulted in NEW program: `7bteFyUMAxPBNqRjbhoKAMcnnoseb5Hm14Noa3W45TUz` ❌

### Root Cause

1. **Wrong keypair used:** `target/deploy/escrow-keypair.json` instead of `wallets/staging/escrow-program-keypair.json`
2. **No safety check:** Script didn't verify program ID before deployment
3. **Wrong deploy method:** Used `anchor deploy` instead of `solana program deploy`

### Resolution

✅ Correctly upgraded staging program using:
```bash
solana program deploy target/deploy/escrow.so \
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --keypair wallets/staging/staging-deployer.json \
  --url devnet
```

### Cleanup Needed

The accidentally deployed program `7bteFyUMAxPBNqRjbhoKAMcnnoseb5Hm14Noa3W45TUz` can be closed to reclaim rent:

```bash
solana program close 7bteFyUMAxPBNqRjbhoKAMcnnoseb5Hm14Noa3W45TUz \
  --keypair wallets/staging/staging-deployer.json \
  --url devnet
```

---

## ✅ Updated Safety Checks

### `scripts/deployment/staging/deploy-to-staging.ps1`

**Added protections:**

1. **Program keypair verification:**
   ```powershell
   # Check program keypair exists
   if (-not (Test-Path $programKeypair)) {
       Write-Host "❌ Program keypair not found: $programKeypair"
       exit 1
   }
   
   # Verify it generates the correct program ID
   $actualProgramId = solana-keygen pubkey $programKeypair
   if ($actualProgramId -ne $programId) {
       Write-Host "❌ CRITICAL ERROR: Program keypair mismatch!"
       Write-Host "   THIS WOULD DEPLOY A NEW PROGRAM!"
       Write-Host "   Deployment BLOCKED"
       exit 1
   }
   ```

2. **Explicit program ID in deployment:**
   ```powershell
   # Use solana CLI with explicit program ID
   solana program deploy $programSo \
     --program-id $programId \
     --keypair $deployerKeypair \
     --url devnet
   ```

---

## 📋 Deployment Checklist

**BEFORE deploying to ANY environment:**

- [ ] Verify you're upgrading an EXISTING program (not creating new)
- [ ] Confirm program ID matches expected static ID
- [ ] Use environment-specific program keypair from `wallets/{env}/`
- [ ] Run deployment script with safety checks enabled
- [ ] Verify deployment with `solana program show <program-id>`
- [ ] Test on devnet first (staging environment)

---

## 🔒 Manual Deployment Commands

### Staging (Devnet)

```bash
# Build for staging
npm run solana:build:staging

# Deploy (UPGRADE existing program)
solana program deploy target/deploy/escrow.so \
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --keypair wallets/staging/staging-deployer.json \
  --url devnet

# Verify
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet
```

### Production (Mainnet)

```bash
# Build for production
npm run solana:build:mainnet

# Deploy (UPGRADE existing program)
solana program deploy target/deploy/escrow.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --keypair wallets/production/mainnet-deployer.json \
  --url mainnet-beta

# Verify
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta
```

---

## ❌ Commands to NEVER Use

### DON'T: Deploy with program keypair

```bash
# ❌ Creates NEW program from keypair
anchor deploy --program-keypair wallets/staging/escrow-program-keypair.json

# ❌ Uses random keypair from target/deploy
anchor deploy --program-keypair target/deploy/escrow-keypair.json
```

### DON'T: Use default anchor deploy

```bash
# ❌ Uses whatever keypair is in target/deploy (unpredictable)
anchor deploy
```

### DON'T: Deploy without verifying program ID first

```bash
# ❌ No verification that you're upgrading the correct program
solana program deploy target/deploy/escrow.so --keypair <deployer>
```

---

## 🎯 Best Practices

1. **Always use deployment scripts** (`./scripts/deployment/{env}/deploy-to-{env}.ps1`)
2. **Run with `-DryRun` first** to verify the deployment command
3. **Verify program ID** before deployment
4. **Test on devnet** (staging) before mainnet (production)
5. **Keep program keypairs secure** and backed up
6. **Never commit program keypairs** to git (they're in `.gitignore`)
7. **Document all deployments** with transaction signatures
8. **Monitor on-chain** after deployment for issues

---

## 🆘 Emergency Contacts

If you accidentally deploy a new program:

1. **STOP** - Don't close the program yet
2. **Notify the team** immediately
3. **Document** the new program ID and transaction
4. **Assess impact** - Is the new program being used?
5. **Plan migration** or program closure
6. **Update documentation** with incident details

---

## 📚 Related Documentation

- [PROGRAM_ID_MANAGEMENT.md](../development/PROGRAM_ID_MANAGEMENT.md)
- [ENVIRONMENT_ISOLATION_COMPLETE.md](../development/ENVIRONMENT_ISOLATION_COMPLETE.md)
- [STAGING_CI_DEPLOYMENT.md](./STAGING_CI_DEPLOYMENT.md)

---

**Remember: We use STATIC program IDs. New program deployments require explicit user approval and planning.**

