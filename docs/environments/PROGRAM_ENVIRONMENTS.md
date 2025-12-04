# Multi-Environment Program Management

## Overview

This project supports multiple program environments to allow parallel development, testing, and production deployments without conflicts. Each environment has its own program keypair and program ID.

## Environment Structure

```
wallets/                                (GITIGNORED - never committed)
├── dev/
│   └── escrow-program-keypair.json    (Dev program keypair - local only)
├── staging/
│   └── escrow-program-keypair.json    (Staging program keypair - local only)
└── production/
    └── escrow-program-keypair.json    (Production program keypair - to be created)
```

**⚠️ IMPORTANT: Keypairs are NOT committed to git and must be set up locally or obtained securely.**

## Initial Setup

### First Time Setup

When setting up this project for the first time, you need to obtain or generate the program keypairs:

#### Option 1: Get Keypairs from Team (Recommended)

1. **Contact a team member** who has the keypairs
2. **Securely transfer** the keypairs (use encrypted channels, not email/Slack)
3. **Place them in the correct locations:**
   ```bash
   # Create directories
   mkdir -p wallets/dev wallets/staging wallets/production
   
   # Copy received keypairs
   cp /secure/location/dev-keypair.json wallets/dev/escrow-program-keypair.json
   cp /secure/location/staging-keypair.json wallets/staging/escrow-program-keypair.json
   ```

4. **Verify** the program IDs match:
   ```bash
   # Should output: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
   solana-keygen pubkey wallets/dev/escrow-program-keypair.json
   
   # Should output: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
   solana-keygen pubkey wallets/staging/escrow-program-keypair.json
   ```

#### Option 2: Generate New Dev Keypair (For Testing Only)

⚠️ **Only for isolated testing - won't work with existing deployments**

```bash
# Create directories
mkdir -p wallets/dev

# Generate new dev keypair
solana-keygen new --outfile wallets/dev/escrow-program-keypair.json

# Get the program ID
solana-keygen pubkey wallets/dev/escrow-program-keypair.json

# You'll need to update Anchor.dev.toml and lib.rs with this new ID
```

### Backup Strategy

**For Team Leads:**

1. **Store keypairs securely:**
   - Use password manager (1Password, LastPass)
   - Encrypted vault (VeraCrypt)
   - Hardware security key
   - **Never** Slack, email, or public channels

2. **Document locations:**
   - Where backups are stored
   - Who has access
   - Recovery procedures

3. **Staging keypairs:**
   - Can be shared with dev team (devnet only)
   - Store in team's secure vault
   - Rotate if compromised

4. **Production keypairs:**
   - Extremely restricted access
   - Hardware wallet recommended
   - Multisig setup recommended
   - Never share unnecessarily

## Environments

### 1. Development (dev)

**Purpose:** Local development and testing  
**Network:** Devnet  
**Program ID:** `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`  
**Config:** `Anchor.dev.toml`  
**Default:** Yes (used by default for local development)

**Use Cases:**
- Feature development
- Local testing
- Quick iterations
- Breaking changes OK

### 2. Staging (staging)

**Purpose:** Production-like environment for testing  
**Network:** Devnet (production-like)  
**Program ID:** `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`  
**Config:** `Anchor.staging.toml`

**Use Cases:**
- E2E testing
- Integration testing
- Pre-production validation
- API testing with stable program
- Should mirror production setup

### 3. Production (production)

**Purpose:** Live production environment  
**Network:** Mainnet-beta  
**Program ID:** `TBD` (to be generated before mainnet deployment)  
**Config:** `Anchor.production.toml` (to be created)

**Use Cases:**
- Live user transactions
- Real assets and funds
- Maximum stability required
- Audited code only

## Quick Start

### Switching Environments

```bash
# Switch to dev (no build)
npm run program:switch:dev

# Switch to staging (no build)
npm run program:switch:staging

# Build for dev
npm run program:build:dev

# Build for staging
npm run program:build:staging

# Build and deploy to dev
npm run program:deploy:dev

# Build and deploy to staging
npm run program:deploy:staging
```

### Manual Switching (PowerShell)

```powershell
# Switch only
.\scripts\utilities\switch-program-environment.ps1 -Environment dev

# Switch and build
.\scripts\utilities\switch-program-environment.ps1 -Environment staging -Build

# Switch, build, and deploy
.\scripts\utilities\switch-program-environment.ps1 -Environment staging -Build -Deploy
```

## What Gets Changed

When you switch environments, the script:

1. **Copies Program Keypair**
   - From: `wallets/{env}/escrow-program-keypair.json`
   - To: `target/deploy/escrow-keypair.json`

2. **Updates Program Source**
   - File: `programs/escrow/src/lib.rs`
   - Updates: `declare_id!("PROGRAM_ID");`

3. **Builds (if -Build flag)**
   - Compiles program with new ID
   - Updates `target/deploy/escrow.so`

4. **Deploys (if -Deploy flag)**
   - Uploads program to blockchain
   - Creates/updates IDL account

## Workflow Examples

### Starting New Feature Development

```bash
# 1. Switch to dev
npm run program:switch:dev

# 2. Make your changes to programs/escrow/src/lib.rs

# 3. Build and test locally
npm run program:build:dev
anchor test

# 4. Deploy to devnet for testing
npm run program:deploy:dev
```

### Testing on Staging

```bash
# 1. Switch to staging
npm run program:switch:staging

# 2. Build for staging
npm run program:build:staging

# 3. Deploy to staging
npm run program:deploy:staging

# 4. Run E2E tests
npm run test:staging:e2e:verbose

# 5. Clean up test data
npm run test:cleanup:all
```

### Preparing for Production

```bash
# 1. Generate production keypair (once)
solana-keygen new --outfile wallets/production/escrow-program-keypair.json

# 2. Get production program ID
solana-keygen pubkey wallets/production/escrow-program-keypair.json

# 3. Update Anchor.production.toml (create if needed)
# 4. Fund production upgrade authority
# 5. Switch to production
.\scripts\utilities\switch-program-environment.ps1 -Environment production -Build -Deploy
```

## Important Notes

### ⚠️ Never Mix Environments

- **Always switch** before building or deploying
- **Verify** the program ID after switching
- **Check** `declare_id!` matches the intended environment

### 🔒 Keypair Security

**ALL ENVIRONMENTS:**
- ❌ **NEVER commit keypairs to git** (all are in .gitignore)
- 🔒 Keypairs are private keys and must be kept secure
- 🔒 Obtain from team members through secure channels
- 🔒 Each developer has their own local copy

**Dev:**
- ⚠️ Lower security (devnet, test funds only)
- ✅ Can be shared among dev team
- ✅ Can be regenerated if compromised
- ⚠️ Still gitignored (security best practice)

**Staging:**
- ⚠️ Medium security (devnet, but production-like)
- ⚠️ Contains test funds
- ⚠️ Used for E2E tests
- 🔒 Share only with authorized team members
- 🔒 Store in team's secure vault

**Production:**
- 🔴 **CRITICAL SECURITY**
- ❌ NEVER commit to git
- 🔒 Store in secure secrets manager (1Password, AWS Secrets Manager)
- 🔒 Backup securely offline with encryption
- 🔒 Multisig strongly recommended
- 🔒 Hardware wallet recommended
- 🔒 Extremely restricted access

### 📝 Before Committing

When you switch environments during development:

```bash
# Always switch back to dev before committing
npm run program:switch:dev

# This ensures:
# - lib.rs has dev program ID (default)
# - target/deploy has dev keypair
# - No staging/production IDs in source
```

### 🔄 After Pulling Changes

If someone else deployed to staging/production:

```bash
# 1. Pull latest
git pull

# 2. Re-switch to your environment
npm run program:switch:staging  # or dev

# 3. Rebuild if needed
npm run program:build:staging
```

## Testing Strategy

### Local Development (dev)
```bash
npm run program:switch:dev
npm run program:build:dev
anchor test
```

### Staging E2E (staging)
```bash
npm run program:switch:staging
npm run program:build:staging
npm run program:deploy:staging
npm run test:staging:e2e:verbose
npm run test:cleanup:all
```

### Production Verification (production)
```bash
# Never test directly on production!
# Use staging to simulate production
npm run program:switch:staging
npm run test:staging:e2e:verbose
```

## Troubleshooting

### "Declared program id does not match"

**Cause:** Program ID in `lib.rs` doesn't match the keypair

**Solution:**
```bash
# Switch to the correct environment
npm run program:switch:staging

# Rebuild
npm run program:build:staging
```

### "Account not found" during deployment

**Cause:** Program hasn't been deployed to that network yet

**Solution:**
```bash
# First deployment needs funding
solana airdrop 2 <UPGRADE_AUTHORITY> --url devnet

# Then deploy
npm run program:deploy:staging
```

### Wrong program ID in tests

**Cause:** Tests are using program ID from wrong environment

**Solution:**
```bash
# Check test configuration
cat tests/e2e/staging/staging-comprehensive-e2e.test.ts | grep programId

# Should match staging program ID:
# AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Build for Staging
  run: |
    npm run program:switch:staging
    npm run program:build:staging

- name: Deploy to Staging
  if: github.ref == 'refs/heads/staging'
  run: npm run program:deploy:staging
  env:
    SOLANA_UPGRADE_AUTHORITY: ${{ secrets.STAGING_UPGRADE_AUTHORITY }}
```

## Program ID Reference

| Environment | Program ID | Network | Status |
|------------|-----------|---------|--------|
| Dev | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | Devnet | ✅ Active |
| Staging | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | Devnet | ✅ Active |
| Production | `TBD` | Mainnet-beta | ⏳ Not yet deployed |

## Related Documentation

- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Testing Guide](./testing/TESTING_GUIDE.md)
- [Staging E2E Tests](./tasks/STAGING_E2E_TESTS_IMPLEMENTATION.md)
- [Secrets Management](./SECRETS_MANAGEMENT.md)

## Migration History

- **2025-10-22:** Implemented multi-environment support
  - Created environment-specific keypairs
  - Added switch-program-environment.ps1 script
  - Updated Anchor configs for each environment
  - Added npm scripts for easy switching
  - Set dev as default environment

---

**Remember:** Always switch to the correct environment before building or deploying! 🎯

