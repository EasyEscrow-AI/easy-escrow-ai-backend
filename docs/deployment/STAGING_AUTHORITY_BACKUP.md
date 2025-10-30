# Staging Authority Wallet Backup

**Date:** October 30, 2025  
**Status:** Completed

---

## Summary

Successfully backed up the staging program upgrade authority wallet to the project's wallets directory.

---

## Background

During the security.txt deployment to staging (devnet), we discovered:
- The staging program `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` had an unknown upgrade authority
- Authority public key: `CPDz3pC5AnK7es3oEcP52HLhByPSAWG6f9QGP6j4jjEA`
- After searching the project, found it was the system-wide Solana CLI default wallet

---

## Discovery Process

1. ❌ Searched all project `wallets/` directories - not found
2. ❌ Searched project root and common locations - not found
3. ✅ **Found in:** `~/.config/solana/id.json` (default Solana CLI wallet)

This explained why the wallet wasn't in the project - it was the system default wallet used during the original staging deployment.

---

## Action Taken

### Wallet Backup

**Copied wallet to project:**
- **Source:** `C:\Users\samde\.config\solana\id.json`
- **Destination:** `wallets/staging/staging-deployer.json`
- **Public Key:** `CPDz3pC5AnK7es3oEcP52HLhByPSAWG6f9QGP6j4jjEA`

### Configuration Alignment

This now matches what `Anchor.staging.toml` expects:

```toml
[provider]
cluster = "Devnet"
wallet = "wallets/staging/staging-deployer.json"
```

---

## Security Considerations

### ✅ Proper Security

- Wallet file is **gitignored** (entire `wallets/` directory)
- Private key is **never committed** to repository
- Original remains in system config as additional backup
- Only documentation (this file) is committed

### 🔒 Storage Locations

The staging authority wallet now exists in:
1. **System:** `~/.config/solana/id.json` (original)
2. **Project:** `wallets/staging/staging-deployer.json` (backup, gitignored)

---

## Usage

### Deploying to Staging

```bash
anchor deploy --program-name escrow \
  --provider.cluster devnet \
  --provider.wallet wallets/staging/staging-deployer.json \
  --program-keypair wallets/staging/escrow-program-keypair.json
```

### Verifying Authority

```bash
# Check public key
solana-keygen pubkey wallets/staging/staging-deployer.json
# Output: CPDz3pC5AnK7es3oEcP52HLhByPSAWG6f9QGP6j4jjEA

# Check program authority on-chain
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet
# Authority: CPDz3pC5AnK7es3oEcP52HLhByPSAWG6f9QGP6j4jjEA
```

---

## Staging Wallet Inventory

After this backup, the staging directory contains:

| Wallet File | Public Key | Purpose |
|-------------|------------|---------|
| `staging-deployer.json` | `CPDz3pC5...jjEA` | Program upgrade authority ⭐ NEW |
| `escrow-program-keypair.json` | `AvdX6LEk...b9Zei` | Staging program keypair |
| `staging-admin.json` | `498GViCL...2e4R` | Admin operations |
| `staging-fee-collector.json` | `8LL197pz...tKJr` | Fee collection |
| `staging-receiver.json` | `5VsKp5GW...ktx4` | Test receiver |
| `staging-sender.json` | `AoCpvu92...Z99z` | Test sender |

---

## Impact

### ✅ Positive Outcomes

1. **Project Self-Sufficiency:** All staging wallets now in project directory
2. **Anchor Alignment:** Matches expected wallet path in config
3. **Team Consistency:** Other developers can deploy to staging using project wallets
4. **Deployment Success:** Enabled security.txt deployment to staging

### 📝 Deployments Using This Wallet

**First deployment after backup:**
- **Date:** October 30, 2025
- **Purpose:** Deploy program with security.txt
- **Program:** `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- **Transaction:** `2meHkenEWWj2KTbYPK9x7gRZaNPwpg2JmustJi3JzSQRB98vQGoRXUqLVDmNjqTPqoBRFQPvD1t6XFjkbEkXdCkX`
- **Result:** ✅ Success

---

## Best Practices

### For Future Deployments

1. **Always use project wallets** - Avoid system default for deployments
2. **Document authority** - Record which wallet is upgrade authority
3. **Multiple backups** - Keep authority wallets in multiple secure locations
4. **Team access** - Ensure team knows wallet locations (while keeping private keys secure)

### Authority Transfer (If Needed)

If you ever need to transfer authority to a different wallet:

```bash
solana program set-upgrade-authority \
  AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --upgrade-authority wallets/staging/staging-deployer.json \
  --new-upgrade-authority <new-authority-pubkey> \
  --url devnet
```

---

## Related Documentation

- [Staging Strategy](../architecture/STAGING_STRATEGY.md)
- [Security.txt Implementation](../security/SECURITY_TXT_IMPLEMENTATION.md)
- [Devnet Deployment Success](../security/SECURITY_TXT_DEVNET_DEPLOYMENT_SUCCESS.md)

---

**Last Updated:** October 30, 2025

