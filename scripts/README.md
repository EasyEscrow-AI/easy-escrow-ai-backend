# Deployment Scripts

This directory contains scripts to help with Solana program deployment.

## Scripts Overview

### 1. `install-solana-tools.ps1`
Automated installation script for Solana development tools.

**What it installs:**
- Rust (if not already installed)
- Solana CLI
- Anchor Framework (v0.32.1)

**Usage:**
```powershell
.\scripts\install-solana-tools.ps1
```

**Options:**
- Interactive menu for choosing installation method
- Automatic PATH configuration
- Verification of all installations

**Estimated Time:**
- Method 1 (GitHub Download): 5-10 minutes
- Method 2 (Cargo Build): 20-30 minutes

### 2. `deploy-to-devnet.ps1`
Automated deployment script for deploying the escrow program to Solana devnet.

**What it does:**
1. Verifies all prerequisites are installed
2. Builds the Solana program (`anchor build`)
3. Configures Solana for devnet
4. Checks SOL balance and airdrops if needed
5. Deploys the program to devnet
6. Verifies the deployment
7. Saves deployment info to `deployment-info.txt`

**Usage:**
```powershell
.\scripts\deploy-to-devnet.ps1
```

**Prerequisites:**
- Rust installed
- Solana CLI installed
- Anchor Framework installed
- Devnet SOL in wallet (~5 SOL)

**Output:**
- Deployment status and program ID
- Link to Solana Explorer
- Deployment info saved to file

### 3. `setup-devnet-e2e.ps1` / `setup-devnet-e2e.sh`
Setup scripts for E2E devnet testing environment (Task 37).

**Features:**
- Verifies Solana CLI installation
- Configures devnet RPC endpoints
- Checks program deployment
- Requests SOL airdrops for testing
- Validates USDC availability
- Creates output directories
- Sets up environment variables

**Usage:**
```powershell
# Windows
.\scripts\setup-devnet-e2e.ps1

# Skip airdrop (if rate limited)
.\scripts\setup-devnet-e2e.ps1 -SkipAirdrop
```

```bash
# Linux/Mac
chmod +x scripts/setup-devnet-e2e.sh
./scripts/setup-devnet-e2e.sh
```

### 4. `setup-database.ps1` / `setup-database.sh`
Database setup scripts (already existing).

## Quick Start Guide

### First Time Setup

```powershell
# Step 1: Install development tools
.\scripts\install-solana-tools.ps1

# Step 2: Restart PowerShell (important!)
# Close and reopen PowerShell

# Step 3: Deploy to devnet
.\scripts\deploy-to-devnet.ps1
```

### Manual Deployment

If you prefer manual steps:

```powershell
# 1. Build the program
anchor build

# 2. Configure for devnet
solana config set --url devnet

# 3. Get devnet SOL
solana airdrop 2

# 4. Deploy
anchor deploy

# 5. Verify
solana program show <PROGRAM_ID>
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

- [DEVNET_DEPLOYMENT_STATUS.md](../DEVNET_DEPLOYMENT_STATUS.md) - Current deployment status
- [SOLANA_SETUP.md](../SOLANA_SETUP.md) - Detailed setup instructions
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Complete deployment guide
- [Solana Documentation](https://docs.solana.com/)
- [Anchor Documentation](https://www.anchor-lang.com/)

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review error messages carefully
3. Check Solana status: https://status.solana.com/
4. Consult the detailed guides in the project root
5. Ask on Anchor Discord: https://discord.gg/anchor

## Notes

- Devnet SOL is free (via airdrops)
- Devnet is reset periodically
- Always test on devnet before mainnet
- Keep your wallet keypair secure
- Never commit keypairs to git

---

**Last Updated:** October 13, 2025

