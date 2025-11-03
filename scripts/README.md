# Scripts Directory

This directory contains organized scripts to help with development, deployment, and utilities.

## Directory Structure

```
scripts/
├── deployment/          # Deployment scripts for different environments
│   ├── devnet/         # Devnet deployment and setup
│   ├── staging/        # Staging environment deployment
│   └── digitalocean/   # DigitalOcean-specific deployment
├── development/        # Development environment scripts
│   ├── docker/         # Docker-related scripts
│   └── localnet/       # Local Solana validator scripts
├── testing/            # Testing and verification scripts
│   ├── e2e/           # End-to-end testing scripts
│   └── verification/  # Verification and validation scripts
└── utilities/          # General utility scripts
    ├── wallet/        # Wallet management utilities
    ├── database/      # Database setup and management
    ├── git-hooks/     # Git hook scripts
    └── timeout/       # Command timeout utilities
```

## Quick Reference

### Deployment Scripts

#### Devnet (`deployment/devnet/`)
- `deploy-to-devnet.ps1` - Deploy escrow program to Solana devnet
- `fund-devnet-wallets.ps1/.sh` - Fund devnet wallets with SOL
- `set-devnet-env-vars.ps1` - Configure devnet environment variables
- `setup-devnet-e2e.ps1/.sh` - Setup E2E testing environment for devnet
- `setup-devnet-nft-usdc.ps1` - Setup NFT and USDC tokens on devnet
- `setup-static-devnet-wallets.ps1` - Configure static devnet wallets
- `.env.devnet.example` - Example environment configuration for devnet

#### Staging (`deployment/staging/`)
- `build-with-checksums.ps1` - Build escrow program with artifact verification
- `deploy-to-staging.ps1` - Deploy escrow program to STAGING (Devnet)
- `post-deploy-migrate.ps1` - Post-deployment migration and initialization
- `fund-staging-wallets.ps1` - Fund staging environment wallets
- `deploy-with-env-verification.ps1` - Deploy backend with environment verification

#### DigitalOcean (`deployment/digitalocean/`)
- `deploy-to-digitalocean.ps1/.sh` - Deploy to DigitalOcean App Platform
- `deploy.ps1` - Alternative deployment script
- `verify-do-deployment.ps1` - Verify DigitalOcean deployment
- `verify-do-e2e-readiness.ps1/.sh` - Verify E2E test readiness
- `verify-do-server.js` - Server verification script
- `verify-do-wallet-config.ps1` - Verify wallet configuration
- `install-cli-tools-windows.ps1` - Install CLI tools on Windows
- `quick-install.ps1` - Quick installation script
- `run-migration-prod.ps1/.sh` - Run production database migrations
- `setup-database-roles.sql` - SQL script for database role setup
- `setup-devnet-secrets.ps1` - Setup devnet secrets in DigitalOcean

### Development Scripts

#### Docker (`development/docker/`)
- `docker-fresh-start.ps1/.sh` - Fresh Docker environment start

#### Localnet (`development/localnet/`)
- `reset-localnet.ps1` - Reset local Solana validator
- `setup-localnet.ps1` - Setup local Solana validator
- `start-localnet-validator.ps1` - Start local validator
- `setup-nft-collection.ps1` - Setup NFT collection on localnet

### Utility Scripts

#### Wallet Utilities (`utilities/wallet/`)
- `convert-keys-to-base58.js` - Convert wallet keys to base58 format

#### Database Utilities (`utilities/database/`)
- `setup-database.ps1/.sh` - Setup PostgreSQL database
- `test-db-connection.ts` - Test database connectivity and CRUD operations

#### Deployment Database Scripts (`deployment/`)
- `setup-staging-database.ps1` - Automated staging database setup (PowerShell)
- `setup-staging-database.sql` - SQL script for staging database creation
- `connect-staging-db.ps1` - Connect to staging PostgreSQL cluster

#### Git Hooks (`utilities/git-hooks/`)
- `setup-git-hooks.ps1/.sh` - Install git hooks
- `pre-commit-secrets-check.ps1/.sh` - Pre-commit hook for secrets detection

#### Timeout Utilities (`utilities/timeout/`)
- `run-with-timeout.ps1` - PowerShell timeout wrapper for commands
- `run-with-timeout.ts` - TypeScript timeout wrapper for commands

#### Backup Utilities (`utilities/`)
- `backup-digitalocean.ts` - TypeScript backup utility for DigitalOcean resources
- `backup-digitalocean.ps1` - PowerShell wrapper for backup utility
- **Quick Start:** `npm run backup:list` to see all backupable resources
- **See:** [BACKUP_README.md](utilities/BACKUP_README.md) for complete documentation

#### General Utilities (`utilities/`)
- `install-solana-tools.ps1` - Install Solana development tools
- `generate-missing-tasks.js` - Generate missing task files

## Command Timeout Utilities

### `utilities/timeout/run-with-timeout.ts`
TypeScript utility for running commands with automatic timeout detection.

**Features:**
- Intelligent timeout detection based on command type
- Retry logic with exponential backoff
- Live output streaming
- Warning when commands use >80% of timeout
- Full TypeScript types for integration

**Usage:**
```bash
# Basic usage
npx ts-node scripts/utilities/timeout/run-with-timeout.ts git status

# Override timeout (in milliseconds)
npx ts-node scripts/utilities/timeout/run-with-timeout.ts --timeout 120000 npm install

# Configure retry behavior
npx ts-node scripts/utilities/timeout/run-with-timeout.ts --retries 5 anchor deploy
```

### `utilities/timeout/run-with-timeout.ps1`
PowerShell implementation of the timeout utility for Windows users.

**Usage:**
```powershell
# Basic usage
.\scripts\utilities\timeout\run-with-timeout.ps1 -Command "git" -Arguments "status"

# Override timeout (in seconds)
.\scripts\utilities\timeout\run-with-timeout.ps1 -Command "npm" -Arguments "install" -Timeout 120

# Configure retry behavior
.\scripts\utilities\timeout\run-with-timeout.ps1 -Command "anchor" -Arguments "deploy" -Retries 5
```

**See:** [TIMEOUT_UTILITIES.md](../docs/TIMEOUT_UTILITIES.md) for complete documentation.

## DigitalOcean Backup Utilities

### Quick Start

```bash
# 1. Set API key in .env
echo "DIGITAL_OCEAN_API_KEY=dop_v1_xxxxxxxx" >> .env

# 2. List all backupable resources
npm run backup:list

# 3. Test backup (dry run)
npm run backup:all:dry-run

# 4. Execute full backup
npm run backup:all
```

### Available Commands

```bash
# List all resources
npm run backup:list          # TypeScript
npm run backup:list:ps       # PowerShell

# Backup everything
npm run backup:all           # TypeScript
npm run backup:all:ps        # PowerShell

# Backup with dry run
npm run backup:all:dry-run   # TypeScript
npm run backup:all:dry-run:ps # PowerShell

# Backup only apps
npm run backup:apps          # TypeScript
npm run backup:apps:ps       # PowerShell

# Backup only databases
npm run backup:databases     # TypeScript
npm run backup:databases:ps  # PowerShell
```

### What Gets Backed Up

**App Platform Applications:**
- Creates deployment snapshots
- Includes source code, config, env vars (not secrets)
- Free, kept indefinitely

**Managed Databases:**
- Creates on-demand backups
- Complete database dump
- Retention: 7-90 days depending on plan
- Included in database pricing

**See:** [BACKUP_README.md](utilities/BACKUP_README.md) and [DIGITALOCEAN_BACKUP_GUIDE.md](../docs/operations/DIGITALOCEAN_BACKUP_GUIDE.md) for complete documentation.

## Quick Start Guide

### First Time Setup

```powershell
# Step 1: Install development tools
.\scripts\utilities\install-solana-tools.ps1

# Step 2: Setup local database
.\scripts\utilities\database\setup-database.ps1

# Step 3: Setup git hooks
.\scripts\utilities\git-hooks\setup-git-hooks.ps1

# Step 4: Restart PowerShell (important!)
# Close and reopen PowerShell

# Step 5: Deploy to devnet
.\scripts\deployment\devnet\deploy-to-devnet.ps1
```

### Staging Database Setup

```powershell
# Setup staging database (DigitalOcean Managed PostgreSQL)
.\scripts\deployment\setup-staging-database.ps1

# Or manually using SQL
psql "postgresql://doadmin:PASSWORD@host:25060/defaultdb?sslmode=require" -f .\scripts\deployment\setup-staging-database.sql

# Run migrations
$env:DATABASE_URL="postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require"
npx prisma migrate deploy

# Seed test data
npm run db:seed:staging

# Test connection
npm run db:test-connection
```

**See:** [STAGING_DATABASE_SETUP.md](../docs/infrastructure/STAGING_DATABASE_SETUP.md) for complete staging setup guide.

### Development Workflow

```powershell
# Start local validator
.\scripts\development\localnet\start-localnet-validator.ps1

# Setup localnet environment
.\scripts\development\localnet\setup-localnet.ps1

# Reset localnet if needed
.\scripts\development\localnet\reset-localnet.ps1
```

### Docker Development

```powershell
# Fresh Docker start
.\scripts\development\docker\docker-fresh-start.ps1
```

### Deployment Workflows

#### Devnet Deployment
```powershell
# Setup devnet environment
.\scripts\deployment\devnet\setup-devnet-e2e.ps1

# Fund wallets
.\scripts\deployment\devnet\fund-devnet-wallets.ps1

# Deploy program
.\scripts\deployment\devnet\deploy-to-devnet.ps1
```

#### Staging Deployment
```powershell
# Fund staging wallets
.\scripts\deployment\staging\fund-staging-wallets.ps1

# Deploy with verification
.\scripts\deployment\staging\deploy-with-env-verification.ps1
```

#### DigitalOcean Deployment
```powershell
# Deploy to DigitalOcean
.\scripts\deployment\digitalocean\deploy-to-digitalocean.ps1

# Verify deployment
.\scripts\deployment\digitalocean\verify-do-deployment.ps1

# Verify E2E readiness
.\scripts\deployment\digitalocean\verify-do-e2e-readiness.ps1
```

## Troubleshooting

### Network Issues
If downloads fail:
```powershell
# Try with TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Or download manually from:
# https://github.com/solana-labs/solana/releases/latest
```

### Command Not Found
If commands aren't recognized after installation:
1. Restart PowerShell completely
2. Or manually add to PATH:
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### Insufficient SOL
If deployment fails due to insufficient SOL:
```powershell
# Request multiple airdrops
solana airdrop 2
Start-Sleep -Seconds 5
solana airdrop 2

# Check balance
solana balance
```

### Build Failures
If `anchor build` fails:
```powershell
# Clean and rebuild
Remove-Item -Recurse target -ErrorAction SilentlyContinue
anchor build

# Update Rust if needed
rustup update
```

## Configuration Files

After deployment, update these files:

### `.env`
```env
SOLANA_NETWORK=devnet
ESCROW_PROGRAM_ID=<your-program-id>
SOLANA_RPC_URL=https://api.devnet.solana.com
```

### `Anchor.toml`
Already configured with program IDs for devnet and localnet.

## Verification

After successful deployment:

1. **Check Solana Explorer:**
   ```
   https://explorer.solana.com/address/<PROGRAM_ID>?cluster=devnet
   ```

2. **Verify program exists:**
   ```powershell
   solana program show <PROGRAM_ID>
   ```

3. **Check program account:**
   ```powershell
   solana account <PROGRAM_ID>
   ```

## Resources

- [DEVNET_DEPLOYMENT_GUIDE.md](../docs/DEVNET_DEPLOYMENT_GUIDE.md) - Devnet deployment guide
- [DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md) - Complete deployment guide
- [DOCKER_DEPLOYMENT.md](../docs/DOCKER_DEPLOYMENT.md) - Docker deployment guide
- [TIMEOUT_UTILITIES.md](../docs/TIMEOUT_UTILITIES.md) - Timeout utilities documentation
- [Solana Documentation](https://docs.solana.com/)
- [Anchor Documentation](https://www.anchor-lang.com/)

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review error messages carefully
3. Check Solana status: https://status.solana.com/
4. Consult the detailed guides in the docs directory
5. Ask on Anchor Discord: https://discord.gg/anchor

## Notes

- Devnet SOL is free (via airdrops)
- Devnet is reset periodically
- Always test on devnet before mainnet
- Keep your wallet keypair secure
- Never commit keypairs to git

---

**Last Updated:** October 20, 2025
**Organization:** Reorganized into logical subdirectories for better maintainability
