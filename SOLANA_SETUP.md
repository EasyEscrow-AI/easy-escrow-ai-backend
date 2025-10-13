# Solana Development Environment Setup

This guide walks through setting up the complete Solana development environment needed to build, test, and deploy the escrow program.

## Quick Start for Windows

### 1. Install Rust

1. Download and run rustup-init.exe from: https://rustup.rs/
2. Follow the installation prompts
3. Restart your terminal
4. Verify installation:
   ```powershell
   rustc --version
   cargo --version
   ```

### 2. Install Solana CLI

**Option A: Using PowerShell (Recommended for Windows)**
```powershell
# Download Solana installer
Invoke-WebRequest -Uri https://release.solana.com/v1.17.0/solana-install-init-x86_64-pc-windows-msvc.exe -OutFile solana-install-init.exe

# Run installer
.\solana-install-init.exe v1.17.0

# Add to PATH (restart terminal after this)
$env:PATH += ";$env:USERPROFILE\.local\share\solana\install\active_release\bin"
```

**Option B: Using Windows Subsystem for Linux (WSL)**
```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

Verify installation:
```powershell
solana --version
```

### 3. Install Anchor Framework

**Prerequisites:**
- Rust must be installed first
- Solana CLI must be installed first

**Installation Steps:**

1. Install AVM (Anchor Version Manager):
   ```powershell
   cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
   ```

2. Install latest Anchor version:
   ```powershell
   avm install latest
   avm use latest
   ```

3. Verify installation:
   ```powershell
   anchor --version
   ```

### 4. Install Node.js Dependencies

```powershell
# Install Yarn (if not already installed)
npm install -g yarn

# Install project dependencies
yarn install
```

### 5. Configure Solana for Development

```powershell
# Set cluster to devnet
solana config set --url devnet

# Create a new wallet (if you don't have one)
solana-keygen new --outfile ~/.config/solana/id.json

# Check your wallet address
solana address

# Airdrop devnet SOL for testing
solana airdrop 2

# Verify balance
solana balance
```

## Troubleshooting

### Common Issues on Windows

**Issue: "anchor" command not recognized**
- Solution: Restart your terminal/PowerShell after installing Anchor
- Verify Cargo bin is in PATH: `$env:PATH`
- Should include: `C:\Users\<username>\.cargo\bin`

**Issue: Build fails with "linker not found"**
- Solution: Install Visual Studio Build Tools
- Download from: https://visualstudio.microsoft.com/downloads/
- Select "Desktop development with C++"

**Issue: Solana CLI not found after installation**
- Solution: Manually add to PATH:
  ```powershell
  [System.Environment]::SetEnvironmentVariable(
    "PATH",
    $env:PATH + ";$env:USERPROFILE\.local\share\solana\install\active_release\bin",
    [System.EnvironmentVariableTarget]::User
  )
  ```
- Restart terminal

**Issue: "Failed to get recent blockhash" during airdrop**
- Solution: Devnet might be congested, try again in a few minutes
- Alternative: Use testnet instead:
  ```powershell
  solana config set --url testnet
  solana airdrop 2
  ```

### Build Errors

**Error: "anchor-lang" version mismatch**
- Solution: Update Anchor.toml and Cargo.toml to use same version
- Check current Anchor version: `anchor --version`
- Update dependencies in `programs/escrow/Cargo.toml`

**Error: Program ID mismatch**
- Solution: After first build, update program ID:
  ```powershell
  # Get the program ID
  anchor keys list

  # Update in lib.rs
  # declare_id!("YourProgramIdHere");

  # Update in Anchor.toml
  # [programs.devnet]
  # escrow = "YourProgramIdHere"
  ```

## Building the Program

```powershell
# Clean previous builds
Remove-Item -Recurse -Force target -ErrorAction SilentlyContinue

# Build the program
anchor build

# Get program ID (needed for first-time setup)
anchor keys list

# Update program IDs in code (see above)

# Rebuild after updating IDs
anchor build
```

## Testing the Program

```powershell
# Run all tests
anchor test

# Run tests with logs
anchor test -- --show-logs

# Run specific test
anchor test --skip-deploy
```

## Deploying to Devnet

```powershell
# Ensure you're on devnet
solana config set --url devnet

# Check your balance (need ~5 SOL for deployment)
solana balance

# If balance is low, airdrop more (max 2 SOL per request)
solana airdrop 2

# Deploy the program
anchor deploy

# Verify deployment
solana program show <PROGRAM_ID>

# Check program account
solana account <PROGRAM_ID>
```

## Deployment Cost

- **Devnet**: Free (use airdropped SOL)
- **Mainnet**: ~5-10 SOL depending on program size
  - Program deployment: ~2-3 SOL
  - Program account rent: ~2-3 SOL
  - Transaction fees: minimal

## Next Steps

After successful setup:

1. Build the program: `anchor build`
2. Run tests: `anchor test`
3. Deploy to devnet: `anchor deploy`
4. Integrate with frontend/backend
5. Test with real transactions on devnet
6. Audit code before mainnet deployment

## Resources

- **Anchor Documentation**: https://www.anchor-lang.com/
- **Solana Documentation**: https://docs.solana.com/
- **Solana Cookbook**: https://solanacookbook.com/
- **Anchor Examples**: https://github.com/coral-xyz/anchor/tree/master/tests
- **SPL Token Guide**: https://spl.solana.com/token

## Security Checklist Before Mainnet

- [ ] Complete security audit
- [ ] Test all edge cases on devnet
- [ ] Verify PDA derivations
- [ ] Check CPI security
- [ ] Test with mainnet-fork
- [ ] Verify all error handling
- [ ] Test expiration logic
- [ ] Test cancellation scenarios
- [ ] Verify admin controls
- [ ] Document all features
- [ ] Set up monitoring
- [ ] Plan for upgrades

## Support

For setup issues:
1. Check Anchor Discord: https://discord.gg/anchor
2. Solana Stack Exchange: https://solana.stackexchange.com/
3. Project issues: [Create an issue in this repository]

