# Program IDs Registry

Official registry of all Escrow Program IDs across environments.

## Active Program IDs

| Environment | Network | Program ID | Status | Deployed | Keypair Location | Backup Location |
|-------------|---------|------------|--------|----------|------------------|-----------------|
| **DEV** | Devnet | `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd` | ✅ Active | 2025-01-15 | `target/deploy/escrow-keypair.json` | N/A |
| **STAGING** | Devnet | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | ✅ Active | 2025-01-20 | `target/deploy/escrow-keypair-staging.json` | `temp/staging-backups/escrow-keypair-staging.json` |
| **PROD** | Mainnet | `<TBD>` | ⏸️ Not deployed | TBD | TBD | TBD |

## Explorer Links

### DEV Environment
- **Program**: https://explorer.solana.com/address/4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd?cluster=devnet
- **Network**: Devnet
- **Upgrade Authority**: Dev team keypair

### STAGING Environment
- **Program**: https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet
- **Network**: Devnet
- **Upgrade Authority**: Staging deployer keypair

### PROD Environment
- **Program**: TBD
- **Network**: Mainnet
- **Upgrade Authority**: 3-of-5 multisig (planned)

## Environment Variable Names

Use these exact environment variable names in your `.env` files:

```bash
# DEV Environment
DEVNET_PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd

# STAGING Environment  
DEVNET_STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# PROD Environment (future)
MAINNET_PROGRAM_ID=<tbd>
```

## Anchor Configuration Files

Each environment has its own Anchor config:

```toml
# Anchor.dev.toml
[programs.devnet]
escrow = "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"

# Anchor.staging.toml
[programs.devnet]
escrow = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"

# Anchor.prod.toml (future)
[programs.mainnet]
escrow = "<tbd>"
```

## Security Notes

⚠️ **NEVER commit program keypairs to git!**

- Keypairs are stored in `target/deploy/` (already in `.gitignore`)
- Backups are in `temp/` directory (also in `.gitignore`)
- For production, use hardware wallet or multisig for upgrade authority

## Backup Procedures

### Restoring from Backup

If program keypair is lost:

```bash
# For STAGING
cp temp/staging-backups/escrow-keypair-staging.json target/deploy/
solana address -k target/deploy/escrow-keypair-staging.json
# Should output: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
```

### Creating Additional Backups

```bash
# Backup to secure location
cp target/deploy/escrow-keypair-staging.json /path/to/secure/location/
```

## Revision History

| Date | Environment | Program ID | Change | By |
|------|-------------|------------|--------|-----|
| 2025-01-15 | DEV | 4FQ5...Twhd | Initial DEV deployment | Dev team |
| 2025-01-20 | STAGING | AvdX...9Zei | Generated STAGING keypair | AI Agent |

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team

