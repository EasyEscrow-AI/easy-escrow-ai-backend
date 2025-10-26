# Installing Solana CLI and Anchor CLI on DigitalOcean Server

**Date:** October 16, 2025  
**Server:** easyescrow-backend-dev  
**Purpose:** Step-by-step guide to install Solana CLI and Anchor CLI 0.32.1

---

## Prerequisites

- Access to DO console (https://cloud.digitalocean.com/apps/[APP_ID] → Console tab)
- Rust and Cargo should already be installed on the server
- Internet connectivity

---

## Step 1: Install Solana CLI

### Quick Install (Recommended)

Run this single command in the DO console:

```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
```

### What This Does:
- Downloads the latest stable Solana CLI
- Installs to `~/.local/share/solana/install/active_release/bin/`
- Adds to PATH

### Add to PATH (if needed)

If the command completes but `solana` isn't found, add to PATH:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Add to shell profile for persistence
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Verify Installation

```bash
solana --version
# Should show something like: solana-cli 1.18.x
```

### Configure for Devnet

```bash
solana config set --url devnet

# Verify configuration
solana config get
# Should show: RPC URL: https://api.devnet.solana.com
```

---

## Step 2: Install Rust and Cargo (If Not Present)

Check if Rust is installed:

```bash
rustc --version
cargo --version
```

If not installed:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env
```

---

## Step 3: Install Anchor CLI 0.32.1

### Important: Must Install Version 0.32.1

The project requires **exactly version 0.32.1** to match `Anchor.toml`.

### Option A: Install via AVM (Anchor Version Manager) - Recommended

```bash
# Install AVM
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# Add cargo bin to PATH if needed
export PATH="$HOME/.cargo/bin:$PATH"

# Install Anchor 0.32.1
avm install 0.32.1

# Set as active version
avm use 0.32.1

# Verify
anchor --version
# Should show: anchor-cli 0.32.1
```

### Option B: Direct Install (Alternative)

If AVM doesn't work, install Anchor directly:

```bash
cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --locked --force
```

This takes ~10-15 minutes to compile.

### Verify Installation

```bash
anchor --version
# Must show: anchor-cli 0.32.1
```

---

## Step 4: Verify Everything

Run the inline verification script:

```bash
node -e "
console.log('=== DO Server E2E Readiness Check ===\n');
const { execSync } = require('child_process');
const run = (cmd) => { try { return execSync(cmd, {encoding:'utf8'}).trim(); } catch(e) { return null; } };

console.log('Node:', process.version, '✅');
const npm = run('npm --version'); console.log('npm:', npm || '❌', npm ? '✅' : '');

const solana = run('solana --version'); 
console.log('Solana CLI:', solana || '❌ NOT INSTALLED');

const anchor = run('anchor --version');
if (anchor) {
  const match = anchor.match(/0\.32\.1/);
  console.log('Anchor CLI:', anchor, match ? '✅' : '⚠️  WRONG VERSION (need 0.32.1)');
} else {
  console.log('Anchor CLI: ❌ NOT INSTALLED (CRITICAL!)');
}

console.log('\nEnvironment Variables:');
console.log('SOLANA_NETWORK:', process.env.SOLANA_NETWORK || '❌');
console.log('ESCROW_PROGRAM_ID:', process.env.ESCROW_PROGRAM_ID || '❌');
console.log('DEVNET_SENDER_PRIVATE_KEY:', process.env.DEVNET_SENDER_PRIVATE_KEY ? '✅ SET' : '❌');
console.log('DEVNET_RECEIVER_PRIVATE_KEY:', process.env.DEVNET_RECEIVER_PRIVATE_KEY ? '✅ SET' : '❌');
console.log('DEVNET_ADMIN_PRIVATE_KEY:', process.env.DEVNET_ADMIN_PRIVATE_KEY ? '✅ SET' : '❌');
console.log('DEVNET_FEE_COLLECTOR_PRIVATE_KEY:', process.env.DEVNET_FEE_COLLECTOR_PRIVATE_KEY ? '✅ SET' : '❌');
"
```

Expected output:
```
✅ Solana CLI: solana-cli 1.18.x
✅ Anchor CLI: anchor-cli 0.32.1 ✅
✅ All environment variables SET
```

---

## Troubleshooting

### Issue: "solana: command not found" after installation

**Solution:** Add to PATH manually:
```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### Issue: "anchor: command not found" after installation

**Solution:** Add cargo bin to PATH:
```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

### Issue: Anchor installation takes too long

**Cause:** Anchor compiles from source, which takes time.

**Solution:** Be patient, it can take 10-15 minutes. If it times out, try:
```bash
# Increase cargo timeout
export CARGO_NET_GIT_FETCH_WITH_CLI=true
cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --locked --force
```

### Issue: "permission denied" errors

**Solution:** You may need to use your home directory:
```bash
# Ensure installations go to home directory
export CARGO_HOME="$HOME/.cargo"
export RUSTUP_HOME="$HOME/.rustup"
```

### Issue: Wrong Anchor version installed

**Solution:** Use AVM to switch versions:
```bash
avm list  # See installed versions
avm install 0.32.1
avm use 0.32.1
anchor --version  # Verify
```

---

## Quick Command Reference

### Check Installations
```bash
node --version          # Node.js (should already be installed)
npm --version           # npm (should already be installed)
rustc --version         # Rust compiler
cargo --version         # Cargo package manager
solana --version        # Solana CLI
anchor --version        # Anchor CLI (must be 0.32.1)
```

### Check Configuration
```bash
solana config get                    # Should show devnet RPC
echo $SOLANA_NETWORK                 # Should show: devnet
echo $ESCROW_PROGRAM_ID              # Should show program ID
```

### Update PATH (if needed)
```bash
# Add to current session
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

# Make permanent
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

---

## Expected Installation Times

| Tool | Method | Time |
|------|--------|------|
| Solana CLI | curl install | 1-2 minutes |
| Rust/Cargo | rustup | 5-10 minutes |
| Anchor (AVM) | cargo install avm | 5-10 minutes |
| Anchor CLI | avm install | 10-15 minutes |

**Total:** ~20-30 minutes for first-time installation

---

## After Installation

Once both Solana CLI and Anchor CLI are installed:

1. **Verify everything:**
   ```bash
   solana --version && anchor --version
   ```

2. **Configure Solana for devnet:**
   ```bash
   solana config set --url devnet
   ```

3. **Test program account access:**
   ```bash
   solana account 7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV --url devnet
   ```

4. **Ready to run E2E tests!**

---

## Related Documentation

- [DO E2E Verification Summary](./DO_E2E_VERIFICATION_SUMMARY.md)
- [DO Server E2E Checklist](./DO_SERVER_E2E_CHECKLIST.md)
- [Devnet Deployment Guide](./DEVNET_DEPLOYMENT_GUIDE.md)

---

**Generated:** October 16, 2025  
**Status:** Ready for installation

