# 🚀 Devnet Deployment - Next Steps

## ✅ What's Been Done

We've successfully prepared everything for deploying the Solana escrow program to devnet:

### Created Files:
1. **`DEVNET_DEPLOYMENT_STATUS.md`** - Tracks deployment status and prerequisites
2. **`scripts/install-solana-tools.ps1`** - Automated tool installation script
3. **`scripts/deploy-to-devnet.ps1`** - Automated deployment script
4. **`scripts/README.md`** - Documentation for using the scripts

### Branch Created:
- ✅ Branch: `task-22-deploy-devnet`
- ✅ Committed: Deployment scripts and documentation
- ✅ Ready for: Tool installation and deployment

### Prerequisites Verified:
- ✅ Rust 1.90.0 - Installed and working
- ⏳ Solana CLI - Installation script ready
- ⏳ Anchor Framework - Installation script ready

## 🎯 What You Need to Do Next

### Option 1: Automated Installation (Recommended)

Run the installation script which will guide you through the process:

```powershell
.\scripts\install-solana-tools.ps1
```

This script will:
1. Verify Rust installation (already done ✅)
2. Install Solana CLI (choose your preferred method)
3. Install Anchor Framework v0.32.1
4. Configure your PATH
5. Verify all installations

**After installation**, restart PowerShell and run:

```powershell
.\scripts\deploy-to-devnet.ps1
```

This will automatically:
- Build the program
- Configure Solana for devnet
- Airdrop SOL if needed
- Deploy the program
- Verify the deployment
- Save deployment info

### Option 2: Manual Step-by-Step

If you prefer manual control:

#### Step 1: Install Solana CLI

**Download from GitHub:**
1. Visit: https://github.com/solana-labs/solana/releases/latest
2. Download: `solana-install-init-x86_64-pc-windows-msvc.exe`
3. Run the installer
4. Restart PowerShell

**Or use Cargo:**
```powershell
cargo install solana-cli
```

**Verify:**
```powershell
solana --version
```

#### Step 2: Install Anchor Framework

```powershell
# Install AVM
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# Install Anchor 0.32.1
avm install 0.32.1
avm use 0.32.1

# Verify
anchor --version
```

#### Step 3: Build the Program

```powershell
anchor build
```

#### Step 4: Configure Solana

```powershell
# Set to devnet
solana config set --url devnet

# Create or use existing wallet
solana-keygen new --outfile ~/.config/solana/id.json

# Check address
solana address

# Get devnet SOL (~5 SOL needed)
solana airdrop 2
solana airdrop 2

# Verify balance
solana balance
```

#### Step 5: Deploy

```powershell
anchor deploy
```

#### Step 6: Verify

```powershell
# Get program ID from deployment output
anchor keys list

# Verify on-chain
solana program show <PROGRAM_ID>

# View on explorer
# https://explorer.solana.com/address/<PROGRAM_ID>?cluster=devnet
```

## 📝 After Successful Deployment

1. **Update Environment Variables** - Add to `.env`:
   ```env
   SOLANA_NETWORK=devnet
   ESCROW_PROGRAM_ID=<your-deployed-program-id>
   SOLANA_RPC_URL=https://api.devnet.solana.com
   ```

2. **Test the Program** - Run integration tests on devnet

3. **Update Task Status** - Mark Task 22.5 as complete

4. **Push Changes** - Push the branch and create a PR

## 🐛 Troubleshooting

### Network Issues During Installation
- Check firewall settings
- Try using a VPN
- Download installers manually from GitHub
- Use the cargo installation method (slower but reliable)

### Commands Not Recognized
- Restart PowerShell completely
- Manually refresh PATH:
  ```powershell
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  ```

### Insufficient SOL
- Request multiple airdrops (max 2 SOL per request)
- Wait 5 seconds between requests
- Check balance: `solana balance`

### Build Errors
- Update Rust: `rustup update`
- Clean build: `Remove-Item -Recurse target && anchor build`
- Check Anchor version matches Anchor.toml (0.32.1)

## 📚 Documentation

- **DEVNET_DEPLOYMENT_STATUS.md** - Detailed deployment status
- **scripts/README.md** - Script usage documentation
- **SOLANA_SETUP.md** - Complete Solana setup guide
- **DEPLOYMENT.md** - Full deployment guide

## 🔗 Useful Resources

- [Solana CLI Installation](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)
- [Anchor GitHub](https://github.com/coral-xyz/anchor)

## ⏱️ Estimated Time

- **Tool Installation**: 10-20 minutes
- **First Build**: 5-10 minutes
- **Deployment**: 5 minutes
- **Total**: ~30-45 minutes

## 💡 Pro Tips

1. **Use the automated script** - It handles most edge cases
2. **Restart PowerShell** after installing tools
3. **Request multiple airdrops** before deploying
4. **Save your wallet** keypair somewhere safe
5. **Check Solana status** if having issues: https://status.solana.com/

## ✨ What Happens After Deployment

Once deployed successfully:

1. ✅ Task 22.5 will be complete
2. ✅ Program will be live on devnet
3. ✅ Can integrate with backend services
4. ✅ Can run end-to-end tests
5. ✅ Ready for Task 38 (Localnet testing)
6. ✅ Ready for Task 37 (E2E devnet testing)

---

## 🚀 Quick Start (TL;DR)

```powershell
# 1. Install tools
.\scripts\install-solana-tools.ps1

# 2. Restart PowerShell

# 3. Deploy
.\scripts\deploy-to-devnet.ps1

# Done! 🎉
```

---

**Branch**: `task-22-deploy-devnet`  
**Status**: Ready for tool installation and deployment  
**Next**: Run installation script  

**Questions?** Check the documentation files or the troubleshooting sections above.

