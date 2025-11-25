# Rent Recovery - Execution Guide

## 📋 Overview

This guide walks through the complete process of recovering rent and trapped assets from 172 stuck escrow PDAs on mainnet.

**Expected Recovery:**
- ~0.44 SOL (~$90) total
- 5+ trapped NFTs returned to original depositors
- Cost: ~0.00258 SOL (~$0.50)
- **Net profit: ~$89.50**

---

## ⚠️ Prerequisites

### Environment Setup
1. **Mainnet Admin Private Key** in `.env.production`:
   ```bash
   MAINNET_ADMIN_PRIVATE_KEY=<base58_encoded_private_key>
   ```

2. **RPC URLs** in `.env.production`:
   ```bash
   MAINNET_RPC_URL=<quicknode_url>  # For scanning (higher rate limits)
   SOLANA_RPC_URL_FALLBACK=https://api.mainnet-beta.solana.com  # For transactions
   ```

3. **Mainnet Deployer Wallet** with ~10 SOL:
   - Location: `wallets/production/mainnet-deployer.json`
   - Needed for program upgrade

---

## 🚀 Execution Steps

### Step 1: Trace Asset Depositors (20-30 minutes)

This script scans blockchain history to find who deposited each asset.

```powershell
# Run asset tracing
npx ts-node scripts/trace-escrow-depositors.ts
```

**What it does:**
- Scans all 172 escrow PDAs
- Gets transaction history for each
- Identifies who deposited each NFT
- Identifies who deposited SOL
- Saves results to `temp/escrow-asset-recipients.json`

**Expected output:**
```
📊 TRACING COMPLETE
Total Escrows: 172
Successfully Traced: 170
Failed: 2

📈 Summary Statistics:
   Escrows with token accounts: 30
   Escrows with traced depositors: 28
   Total token accounts: 35
   Token accounts traced: 33/35
```

**If failures occur:**
- Check RPC rate limits (use QuickNode)
- Retry failed accounts manually
- Review `temp/escrow-asset-recipients.json`

---

### Step 2: Build Force Close Transactions (10-15 minutes)

This script prepares the actual transactions to execute.

```powershell
# Build transactions
npx ts-node scripts/build-force-close-transactions.ts
```

**What it does:**
- Loads traced asset data
- Derives escrow ID for each PDA
- Checks if recipient ATAs exist
- Builds `remaining_accounts` arrays
- Calculates estimated costs
- Saves results to `temp/force-close-transactions.json`

**Expected output:**
```
📊 BUILD COMPLETE
Total Escrows: 172
Ready to Execute: 160
Needs Review: 10
Skip (Empty): 2

💰 Estimated Total Cost: 0.025800 SOL
```

**If "needs review" > 0:**
- Review `temp/force-close-transactions.json`
- Check `reason` field for each
- Manually investigate blockchain for those accounts
- Update JSON with correct recipient addresses

---

### Step 3: Deploy Smart Contract to Mainnet

#### 3a. Build Program

```powershell
# Navigate to program directory
cd C:\websites\VENTURE\easy-escrow-ai-backend\programs\escrow

# Set environment
$env:HOME = $env:USERPROFILE

# Build
cargo build-sbf

# Return to project root
cd ../..
```

**Verify:**
```powershell
# Check binary exists
Test-Path target/deploy/easyescrow.so
# Should return: True
```

#### 3b. Generate IDL

```powershell
# Set environment
$env:HOME = $env:USERPROFILE

# Generate IDL
anchor idl build

# Save to file
anchor idl build | Set-Content -Path "target\idl\escrow.json"
```

**Verify:**
```powershell
# Check IDL includes new instruction
Get-Content target\idl\escrow.json | Select-String "admin_force_close_with_recovery"
# Should show the instruction
```

#### 3c. Deploy to Mainnet

```powershell
# Configure Solana for mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Check deployer balance (need ~10 SOL)
solana balance wallets/production/mainnet-deployer.json

# Deploy program upgrade
anchor upgrade target/deploy/easyescrow.so `
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx `
  --provider.cluster mainnet `
  --provider.wallet wallets/production/mainnet-deployer.json
```

**Expected output:**
```
Upgrade authority: <deployer_address>
Upgrading program 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
Success
```

#### 3d. Upload IDL

```powershell
# Upload IDL to blockchain
anchor idl upgrade 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx `
  --filepath target/idl/escrow.json `
  --provider.cluster mainnet `
  --provider.wallet wallets/production/mainnet-deployer.json
```

**Verify deployment:**
```powershell
# Check program on-chain
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta
```

---

### Step 4: Test with Dry Run

Before executing real transactions, test the process.

```powershell
# Dry run (no real transactions)
npx ts-node scripts/execute-force-close-batch.ts

# Dry run with limit (test first 5)
npx ts-node scripts/execute-force-close-batch.ts --limit 5
```

**Expected output:**
```
🧪 DRY RUN mode

📂 Loaded 160 transactions to execute

[1/160] ─────────────────────────────────────────
🔨 Processing 7Fq9XCe2... (ID: 123)
   📝 Creating 2 ATAs...
   [DRY RUN] Would create ATA: ABC123...
   [DRY RUN] Would call admin_force_close_with_recovery
   [DRY RUN] Escrow ID: 123
   [DRY RUN] Remaining accounts: 6
   ✅ SUCCESS: DRY_RUN

...

📊 EXECUTION COMPLETE
Total Processed: 5
Successful: 5
Failed: 0
```

**Review:**
- Check `temp/force-close-execution-results.json`
- Verify all transactions marked as `success`
- Review any `failed` transactions

---

### Step 5: Execute First 5 Accounts (LIVE)

**CRITICAL: Start small!**

```powershell
# Execute first 5 accounts LIVE
npx ts-node scripts/execute-force-close-batch.ts --live --limit 5
```

**⚠️ WARNING: This executes REAL transactions!**

The script will wait 10 seconds before starting. Press Ctrl+C to abort.

**Expected output:**
```
🔴 LIVE mode

⚠️  WARNING: Running in LIVE mode!
⚠️  Real transactions will be sent to mainnet.
⚠️  Press Ctrl+C within 10 seconds to abort...

[1/5] ─────────────────────────────────────────
🔨 Processing 7Fq9XCe2... (ID: 123)
   📝 Creating 2 ATAs...
   ✅ ATA created: 5KJh...
   ✅ ATA created: 9Mnp...
   Remaining accounts: 6
     - 2 NFTs
     - 1 SOL vault (0.000104 SOL)
   ✅ SUCCESS: 4XyZ8abC...

...

📊 EXECUTION COMPLETE
Total Processed: 5
Successful: 5
Failed: 0
```

---

### Step 6: Verify First 5 Manually

**Check on Solscan:**

For each transaction:
1. Open transaction on Solscan: `https://solscan.io/tx/<signature>`
2. Verify:
   - ✅ NFTs transferred to correct addresses
   - ✅ SOL transferred to correct addresses
   - ✅ Token accounts closed
   - ✅ Escrow PDA closed
   - ✅ Rent sent to admin wallet

**Check Escrow PDAs:**
1. Open each escrow PDA on Solscan
2. Verify account is closed (balance = 0)

**Check Recipient Wallets:**
1. Verify recipients received their assets
2. Check NFTs in recipient wallets
3. Check SOL balances increased

**If any issues:**
- STOP immediately
- Review transaction logs
- Fix issue before continuing
- Update scripts if needed

---

### Step 7: Execute Remaining Accounts in Batches

Once first 5 are verified, proceed with batches.

```powershell
# Execute in batches of 20
npx ts-node scripts/execute-force-close-batch.ts --live --limit 20

# Wait, verify, then continue
npx ts-node scripts/execute-force-close-batch.ts --live --limit 40
# ... and so on
```

**OR execute all at once:**

```powershell
# Execute all remaining (160 accounts)
npx ts-node scripts/execute-force-close-batch.ts --live
```

**Monitor progress:**
- Watch console output for errors
- Check `temp/force-close-execution-results.json` periodically
- Monitor admin wallet balance increasing

---

## 📊 Expected Results

### After Full Execution

**Admin Wallet:**
- ~0.44 SOL recovered (rent + extra deposits)
- Check balance: `solana balance <admin_wallet> --url mainnet-beta`

**Recipient Wallets:**
- 5+ NFTs returned to original depositors
- Extra SOL deposits returned (~0.04 SOL total)

**Blockchain:**
- 172 escrow PDAs closed
- All token accounts closed
- Full audit trail on-chain

---

## 🔧 Troubleshooting

### Issue: RPC Rate Limiting

**Symptoms:** 429 errors during tracing

**Solution:**
- Use QuickNode RPC (higher limits)
- Increase delays between requests
- Process in smaller batches

### Issue: ATA Creation Fails

**Symptoms:** "Account already exists" or "Insufficient funds"

**Solution:**
- Check if ATA already exists (skip if so)
- Ensure admin wallet has sufficient SOL
- Retry failed ATAs individually

### Issue: Force Close Fails

**Symptoms:** Transaction fails with program error

**Possible causes:**
1. **Wrong escrow ID** - Verify PDA derivation
2. **Missing accounts** - Check `remaining_accounts` array
3. **Wrong account order** - Verify NFTs, then wallets, then SOL
4. **Deserialization error** - Escrow state corrupted (rare)

**Debug:**
```powershell
# Check escrow state on-chain
solana account <escrow_pda> --url mainnet-beta

# Simulate transaction
# (Add simulation flag to script)
```

### Issue: "Some transactions failed"

**Action:**
1. Review `temp/force-close-execution-results.json`
2. Find `"status": "failed"` entries
3. Check `error` field for details
4. Fix issue and retry those specific accounts

---

## 📁 Output Files

All generated files are in `temp/`:

1. **`escrow-asset-recipients.json`**
   - Traced asset depositors
   - Token account details
   - SOL vault information

2. **`force-close-transactions.json`**
   - Built transactions ready to execute
   - Recipient accounts
   - Estimated costs
   - Status (ready/needs_review/skip)

3. **`force-close-execution-results.json`**
   - Execution results
   - Transaction signatures
   - Success/failure status
   - Timestamps

---

## ✅ Success Criteria

After execution, verify:

- [x] All 172 escrow PDAs closed
- [x] Admin wallet received ~0.44 SOL
- [x] All trapped NFTs returned to depositors
- [x] All extra SOL returned to depositors
- [x] No failed transactions
- [x] All transaction signatures valid
- [x] Recipients confirmed asset receipt

---

## 💡 Tips

1. **Start small** - Always test with 5 accounts first
2. **Verify thoroughly** - Check Solscan for each batch
3. **Use standard RPC** - Don't waste $ on Jito tips
4. **Save signatures** - Keep execution results file
5. **Monitor admin wallet** - Watch balance increase
6. **Check recipients** - Ensure assets arrive
7. **Pause between batches** - Respect RPC limits

---

## 📞 Need Help?

Review these documents:
- [RENT_RECOVERY_IMPLEMENTATION_SUMMARY.md](./RENT_RECOVERY_IMPLEMENTATION_SUMMARY.md)
- [FORCE_CLOSE_INSTRUCTION_DESIGN.md](./FORCE_CLOSE_INSTRUCTION_DESIGN.md)
- [SMART_CONTRACT_BUILD_GUIDE.md](../.cursor/rules/solana-program-build.mdc)

---

**Total Time Estimate:**
- Tracing: 30 min
- Building: 15 min
- Deployment: 10 min
- Testing: 15 min
- Verification: 30 min
- Full execution: 2 hours
- **Total: ~3.5 hours**

**Expected ROI:**
- Cost: ~$0.50
- Recovery: ~$90
- **Net profit: ~$89.50**
- **ROI: 17,900%** 🚀



