# Mainnet Production Deployment Guide

**Status:** 🚨 PRODUCTION - Handle with extreme care  
**Last Updated:** 2025-10-27

This guide covers deploying the EasyEscrow Solana program to **mainnet-beta** (production).

---

## ⚠️ Critical Security Warnings

**READ THIS BEFORE PROCEEDING:**

1. **Mainnet deployment is IRREVERSIBLE** - Once deployed, the program is live with real user funds
2. **Use hardware wallet** for deployer keypair whenever possible
3. **Verify ALL program IDs** match expected values before deployment
4. **Test thoroughly on devnet/staging** before mainnet deployment
5. **Never commit keypairs** to git or share them insecurely
6. **Minimum 10 SOL required** for deployment (5-10 SOL for program, buffer for fees)
7. **Set upgrade authority** to multisig or governance after deployment

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Generate Production Keypairs](#step-1-generate-production-keypairs)
3. [Step 2: Fund Deployer Wallet](#step-2-fund-deployer-wallet)
4. [Step 3: Configure Program ID](#step-3-configure-program-id)
5. [Step 4: Build Production Program](#step-4-build-production-program)
6. [Step 5: Deploy to Mainnet](#step-5-deploy-to-mainnet)
7. [Step 6: Upload IDL](#step-6-upload-idl)
8. [Step 7: Verify Deployment](#step-7-verify-deployment)
9. [Step 8: Security Configuration](#step-8-security-configuration)
10. [Post-Deployment](#post-deployment)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **Solana CLI:** 2.1.x or higher (Agave client)
- **Anchor CLI:** 0.32.1 (matches Cargo.toml dependencies)
- **Rust:** 1.82.0 (specified in rust-toolchain.toml)
- **Node.js:** 18.x or higher
- **Yarn:** Latest

**Note:** These versions match the working staging deployment and are specified in:
- `rust-toolchain.toml` → Rust 1.82.0
- `programs/escrow/Cargo.toml` → Anchor 0.32.1
- `Anchor.mainnet.toml` → Anchor 0.32.1

### Required Resources

- **Mainnet RPC Endpoint** with high rate limits
  - **Primary Provider:** QuickNode (confirmed for this deployment)
  - **Alternatives:** Helius, Triton, Alchemy
- **10+ SOL** in deployer wallet for deployment costs
- **Secure key storage** (hardware wallet or secure key management system)

### Required Access

- Access to production secrets vault
- Permission to deploy to mainnet
- Access to Cloudflare for DNS updates (if applicable)
- Access to DigitalOcean for environment variable updates

---

## Step 0: RPC Provider Setup (QuickNode)

**Selected Provider:** QuickNode - Enterprise-grade Solana mainnet RPC

### Why QuickNode?
- ✅ Dedicated Solana mainnet infrastructure
- ✅ High rate limits for production traffic
- ✅ Excellent uptime and reliability
- ✅ Fast response times and low latency
- ✅ Enterprise support

### QuickNode Endpoint Setup

1. **Create Endpoint** at https://www.quicknode.com/
   - Sign up/log in to QuickNode dashboard
   - Click "Create Endpoint"
   - Select **Solana Mainnet Beta**
   - Choose appropriate plan (pay-as-you-go or subscription)

2. **Get Endpoint URL**
   ```
   Format: https://xxx-yyy-zzz.solana-mainnet.quiknode.pro/abc123/
   ```
   Copy the full HTTP endpoint URL

3. **Verify Endpoint**
   ```bash
   # Test connectivity
   solana cluster-version --url <YOUR_QUICKNODE_URL>
   
   # Expected output: mainnet-beta cluster version info
   ```

4. **Store Securely**
   - Add to production environment variables as `SOLANA_RPC_URL`
   - Store in DigitalOcean App Platform secrets
   - Keep endpoint URL confidential (it contains your API key)

5. **Rate Limits**
   - Check your plan's rate limits
   - Monitor usage in QuickNode dashboard
   - Set up alerts for approaching limits

### Environment Variable Configuration

**For deployment:**
```bash
export SOLANA_RPC_URL="https://your-quicknode-endpoint.solana-mainnet.quiknode.pro/your-key/"
```

**For DigitalOcean production app:**
- Add `SOLANA_RPC_URL` as encrypted environment variable
- Type: SECRET
- Scope: RUN_TIME and BUILD_TIME (if needed for build)

---

## Step 1: Generate Production Keypairs

### 1.1 Create Secure Directory

```bash
# Create production wallet directory
mkdir -p wallets/production

# Set restrictive permissions (Unix/Mac)
chmod 700 wallets/production

# Windows: Right-click → Properties → Security → Advanced
# Set to only allow your user account full control
```

### 1.2 Generate Program Keypair

```bash
# Generate mainnet program keypair
solana-keygen new -o target/deploy/escrow-mainnet-keypair.json --force

# CRITICAL: Save the seed phrase in a secure location
# This is needed for recovery if the keypair file is lost

# Get the program ID
solana address -k target/deploy/escrow-mainnet-keypair.json

# Save this program ID - you'll need it for configuration
```

**Example Output:**
```
Generating a new keypair

For added security, enter a BIP39 passphrase

NOTE! This passphrase improves security of the recovery seed phrase NOT the
keypair file itself, which is stored as insecure plain text

BIP39 Passphrase (empty for none):

Wrote new keypair to target/deploy/escrow-mainnet-keypair.json
===========================================================================
pubkey: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
===========================================================================
Save this seed phrase and your BIP39 passphrase to recover your new keypair:
[SEED PHRASE HERE - SAVE SECURELY]
===========================================================================
```

### 1.3 Generate Deployer Keypair

```bash
# Generate deployer keypair (separate from program keypair)
solana-keygen new -o wallets/production/mainnet-deployer.json

# Get deployer address
solana address -k wallets/production/mainnet-deployer.json
```

### 1.4 Backup Keypairs Securely

**CRITICAL:** Backup both keypairs to multiple secure locations:

1. **Encrypted backup** to secure cloud storage
2. **Offline backup** on encrypted USB drive
3. **Paper backup** of seed phrases in secure physical location
4. **Hardware security module (HSM)** if available

```bash
# Example: Create encrypted backup
tar -czf mainnet-keypairs-backup.tar.gz \
  target/deploy/escrow-mainnet-keypair.json \
  wallets/production/mainnet-deployer.json

# Encrypt with GPG
gpg --symmetric --cipher-algo AES256 mainnet-keypairs-backup.tar.gz

# Delete unencrypted archive
rm mainnet-keypairs-backup.tar.gz

# Store mainnet-keypairs-backup.tar.gz.gpg in secure location
```

---

## Step 2: Fund Deployer Wallet

### 2.1 Calculate Required SOL

```bash
# Check current deployer balance
solana balance -k wallets/production/mainnet-deployer.json --url mainnet-beta

# Recommended minimum: 10 SOL
# - Program deployment: ~5-8 SOL (depends on program size)
# - IDL upload: ~0.1 SOL
# - Transaction fees: ~0.001 SOL per transaction
# - Buffer: 2-3 SOL for unexpected fees
```

### 2.2 Transfer SOL to Deployer

```bash
# Get deployer address
DEPLOYER_ADDRESS=$(solana address -k wallets/production/mainnet-deployer.json)

# Transfer SOL from your funded wallet
# Replace <source-keypair> with your funded mainnet wallet
solana transfer $DEPLOYER_ADDRESS 10 \
  --from <source-keypair> \
  --url mainnet-beta \
  --fee-payer <source-keypair>

# Verify balance
solana balance -k wallets/production/mainnet-deployer.json --url mainnet-beta
```

**Expected Output:**
```
10 SOL
```

---

## Step 3: Configure Program ID

### 3.1 Update Anchor.mainnet.toml

```bash
# Get program ID
PROGRAM_ID=$(solana address -k target/deploy/escrow-mainnet-keypair.json)
echo "Program ID: $PROGRAM_ID"

# Manually edit Anchor.mainnet.toml
# Replace PLACEHOLDER_MAINNET_PROGRAM_ID with actual program ID
```

Edit `Anchor.mainnet.toml`:
```toml
[programs.mainnet]
escrow = "YOUR_ACTUAL_PROGRAM_ID_HERE"
```

### 3.2 Update Program Source Code

Edit `programs/escrow/src/lib.rs`:

```rust
use anchor_lang::prelude::*;

// PRODUCTION MAINNET PROGRAM ID
// Replace this with your actual program ID from step 1.2
declare_id!("YOUR_ACTUAL_PROGRAM_ID_HERE");

#[program]
pub mod escrow {
    // ... rest of program code
}
```

### 3.3 Verify Configuration

```bash
# Ensure program ID matches across all files
ANCHOR_ID=$(grep 'escrow =' Anchor.mainnet.toml | cut -d'"' -f2)
SOURCE_ID=$(grep 'declare_id!' programs/escrow/src/lib.rs | cut -d'"' -f2)
KEYPAIR_ID=$(solana address -k target/deploy/escrow-mainnet-keypair.json)

echo "Anchor config: $ANCHOR_ID"
echo "Source code:   $SOURCE_ID"
echo "Keypair:       $KEYPAIR_ID"

# All three should match!
if [ "$ANCHOR_ID" = "$SOURCE_ID" ] && [ "$SOURCE_ID" = "$KEYPAIR_ID" ]; then
    echo "✅ All program IDs match!"
else
    echo "❌ ERROR: Program IDs do NOT match!"
    exit 1
fi
```

---

## Step 4: Build Production Program

### 4.1 Install Pinned Toolchains

```bash
# Install Solana CLI (latest 2.x)
solana-install init 2.1.13

# Verify version
solana --version
# Expected: solana-cli 2.1.x (Agave)

# Install Rust toolchain (project specifies 1.82.0 in rust-toolchain.toml)
rustup install 1.82.0
rustup default 1.82.0

# Verify version
rustc --version
# Expected: rustc 1.82.0

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --locked

# Verify Anchor version
anchor --version
# Expected: anchor-cli 0.32.1
```

### 4.2 Clean Build

```bash
# Clean previous builds
anchor clean
rm -rf target/

# Build with mainnet configuration
anchor build --config Anchor.mainnet.toml

# Verify build artifacts
ls -lh target/deploy/escrow.so
ls -lh target/idl/escrow.json
```

**Expected Output:**
```
-rw-r--r-- 1 user user 234K Oct 27 12:00 target/deploy/escrow.so
-rw-r--r-- 1 user user  15K Oct 27 12:00 target/idl/escrow.json
```

### 4.3 Generate Build Checksums

```bash
# Generate SHA256 checksums for verification
shasum -a 256 target/deploy/escrow.so > target/deploy/escrow.so.sha256
shasum -a 256 target/idl/escrow.json > target/idl/escrow.json.sha256

# Display checksums
cat target/deploy/escrow.so.sha256
cat target/idl/escrow.json.sha256
```

Save these checksums for verification and auditing purposes.

---

## Step 5: Deploy to Mainnet

### 5.1 Configure RPC Endpoint

```bash
# Set mainnet RPC URL (use private/premium endpoint)
export ANCHOR_PROVIDER_URL="https://api.mainnet-beta.solana.com"

# Better: Use premium RPC (Helius, QuickNode, Triton)
# export ANCHOR_PROVIDER_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY"
```

### 5.2 Pre-Deployment Verification

```bash
# Verify deployer balance
solana balance -k wallets/production/mainnet-deployer.json --url mainnet-beta

# Verify RPC connectivity
solana cluster-version --url mainnet-beta

# Verify program does NOT exist yet (should fail)
solana program show $(solana address -k target/deploy/escrow-mainnet-keypair.json) --url mainnet-beta
# Expected: "Error: AccountNotFound"
```

### 5.3 Deploy Program

```bash
# Deploy to mainnet
anchor deploy \
  --provider.cluster mainnet-beta \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --program-name escrow \
  --program-keypair target/deploy/escrow-mainnet-keypair.json

# This will take 1-2 minutes
# You'll see transaction signatures for each deployment step
```

**Expected Output:**
```
Deploying workspace: https://explorer.solana.com/tx/[signature]?cluster=mainnet-beta
Upgrade authority: [deployer-address]
Deploying program "escrow"...
Program path: target/deploy/escrow.so...
Program Id: [your-program-id]

Deploy success
```

### 5.4 Save Deployment Transaction

```bash
# Save the deployment transaction signature
echo "Deployment TX: [signature-from-output]" >> deployment-mainnet.log
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> deployment-mainnet.log
echo "Program ID: $(solana address -k target/deploy/escrow-mainnet-keypair.json)" >> deployment-mainnet.log
echo "Deployer: $(solana address -k wallets/production/mainnet-deployer.json)" >> deployment-mainnet.log
```

---

## Step 6: Upload IDL

### 6.1 Initialize IDL on Mainnet

```bash
# Upload IDL to mainnet
anchor idl init \
  $(solana address -k target/deploy/escrow-mainnet-keypair.json) \
  --provider.cluster mainnet-beta \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --filepath target/idl/escrow.json

# Expected: Success message with transaction signature
```

### 6.2 Verify IDL Upload

```bash
# Fetch IDL from mainnet
anchor idl fetch \
  $(solana address -k target/deploy/escrow-mainnet-keypair.json) \
  --provider.cluster mainnet-beta \
  --out fetched-idl.json

# Compare with local IDL
diff target/idl/escrow.json fetched-idl.json

# Should show no differences
```

---

## Step 7: Verify Deployment

### 7.1 Check Program Account

```bash
# Verify program exists and is executable
PROGRAM_ID=$(solana address -k target/deploy/escrow-mainnet-keypair.json)

solana program show $PROGRAM_ID --url mainnet-beta
```

**Expected Output:**
```
Program Id: [your-program-id]
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: [program-data-address]
Authority: [deployer-address]
Last Deployed In Slot: [slot-number]
Data Length: 240000 (234 KB) bytes
Balance: 5.73 SOL
```

### 7.2 Verify Program Bytecode

```bash
# Get deployed program data hash
solana program dump $PROGRAM_ID mainnet-program.so --url mainnet-beta

# Compare with local build
shasum -a 256 mainnet-program.so
shasum -a 256 target/deploy/escrow.so

# Hashes should match exactly
```

### 7.3 Test Program Functionality

```bash
# Run basic program test (read-only operations)
# DO NOT run write operations yet!

# Example: Query program accounts
solana program show $PROGRAM_ID --url mainnet-beta
```

---

## Step 8: Security Configuration

### 8.1 Set Upgrade Authority

**CRITICAL:** For production, upgrade authority should be a multisig or governance program.

```bash
# Option 1: Set to multisig address
solana program set-upgrade-authority \
  $PROGRAM_ID \
  --new-upgrade-authority <MULTISIG_ADDRESS> \
  --url mainnet-beta

# Option 2: Make program immutable (PERMANENT - CANNOT BE UNDONE)
# Only do this after thorough testing!
# solana program set-upgrade-authority \
#   $PROGRAM_ID \
#   --final \
#   --url mainnet-beta
```

### 8.2 Verify Authority Change

```bash
# Check current upgrade authority
solana program show $PROGRAM_ID --url mainnet-beta | grep Authority

# Should show multisig address or "none" if finalized
```

### 8.3 Secure Keypairs

```bash
# After successful deployment, secure the keypairs:

# 1. Move deployer keypair to secure offline storage
# 2. Encrypt program keypair
# 3. Delete unencrypted copies
# 4. Verify backups

# DO NOT delete keypairs until you've verified:
# - Program is deployed successfully
# - IDL is uploaded
# - Authority is transferred (if applicable)
# - Backups are secure and tested
```

---

## Post-Deployment

### Update Backend Configuration

Update production environment variables in DigitalOcean App Platform:

```bash
# Get program ID
PROGRAM_ID=$(solana address -k target/deploy/escrow-mainnet-keypair.json)

echo "Set these in DO App Platform:"
echo "MAINNET_PROD_PROGRAM_ID=$PROGRAM_ID"
echo "ESCROW_PROGRAM_ID=$PROGRAM_ID"
```

Go to: https://cloud.digitalocean.com/apps/a6e6452b-1ec6-4316-82fe-e4069d089b49/settings

Set:
- `MAINNET_PROD_PROGRAM_ID` = your program ID
- `ESCROW_PROGRAM_ID` = your program ID

### Update Frontend Configuration

If you have a frontend, update the program ID there as well.

### Monitor Program

Set up monitoring for:
- Program account changes
- Unusual transaction patterns
- High error rates
- Authority changes

### Documentation

Document the deployment:
- Program ID
- Deployment timestamp
- Transaction signatures
- Upgrade authority
- Security configurations
- Contact information for incident response

---

## Troubleshooting

### Deployment Fails with "Insufficient Funds"

```bash
# Check deployer balance
solana balance -k wallets/production/mainnet-deployer.json --url mainnet-beta

# Add more SOL if needed
solana transfer $(solana address -k wallets/production/mainnet-deployer.json) 5 \
  --from <funded-wallet> \
  --url mainnet-beta
```

### Program ID Mismatch

```bash
# Verify all IDs match
# Anchor.mainnet.toml
# programs/escrow/src/lib.rs (declare_id!)
# target/deploy/escrow-mainnet-keypair.json

# Rebuild if needed
anchor build --config Anchor.mainnet.toml
```

### RPC Rate Limiting

Use a premium RPC endpoint:
- Helius: https://www.helius.dev/
- QuickNode: https://www.quicknode.com/
- Triton: https://triton.one/

### IDL Upload Fails

```bash
# Check if IDL already exists
anchor idl fetch $PROGRAM_ID --provider.cluster mainnet-beta

# If exists, use upgrade instead:
anchor idl upgrade $PROGRAM_ID \
  --provider.cluster mainnet-beta \
  --provider.wallet wallets/production/mainnet-deployer.json \
  --filepath target/idl/escrow.json
```

---

## Checklist

Before deploying to mainnet, verify:

- [ ] Program tested thoroughly on devnet/staging
- [ ] All tests pass
- [ ] Security audit completed (if applicable)
- [ ] Keypairs generated and backed up securely
- [ ] Deployer wallet funded with 10+ SOL
- [ ] Program ID configured correctly in all files
- [ ] Build completes successfully with pinned toolchains
- [ ] Build checksums generated and saved
- [ ] Premium mainnet RPC endpoint configured
- [ ] Team notified of deployment
- [ ] Rollback plan documented
- [ ] Monitoring configured
- [ ] Incident response plan ready

---

**FINAL WARNING:** Mainnet deployment is permanent. Double-check everything before proceeding.

---

**See Also:**
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Documentation](https://docs.solana.com/)
- [Program Deployment Best Practices](https://docs.solana.com/cli/deploy-a-program)

