# SOL Recovery Scripts

This directory contains emergency recovery scripts for handling stuck assets in production.

## refund-stuck-sol.ts

**Purpose:** Refunds SOL stuck in `sol_vault` PDAs from agreements that failed to settle properly.

### When to Use

Use this script when:
- Agreements reached `BOTH_LOCKED` status
- Settlement failed (e.g., Custom error 2000)
- Agreements were marked `ARCHIVED` in database
- **But no on-chain refunds were issued**
- Buyer's SOL is stuck in the `sol_vault` PDA

### Prerequisites

1. **Production Access:**
   - Must have access to production server OR
   - Must have `MAINNET_ADMIN_PRIVATE_KEY` locally

2. **Environment Setup:**
   ```bash
   NODE_ENV=production
   MAINNET_ADMIN_PRIVATE_KEY=<admin-private-key>
   DATABASE_URL=<production-database-url>
   SOLANA_RPC_URL=<mainnet-rpc-url>
   ```

3. **Database Access:**
   - Script needs to query production Prisma database
   - Verify connection string is correct

### Usage

#### Option 1: Run on Production Server (Recommended)

```bash
# SSH into production server
ssh production-server

# Navigate to app directory
cd /app

# Run recovery script
NODE_ENV=production npx ts-node scripts/recovery/refund-stuck-sol.ts
```

#### Option 2: Run Locally (If You Have Credentials)

```bash
# Set environment variables
export NODE_ENV=production
export MAINNET_ADMIN_PRIVATE_KEY="<your-admin-key>"
export DATABASE_URL="<production-db-url>"
export SOLANA_RPC_URL="<mainnet-rpc>"

# Run script
npx ts-node scripts/recovery/refund-stuck-sol.ts
```

### What the Script Does

1. **Validates Environment:**
   - Checks `NODE_ENV=production`
   - Verifies `MAINNET_ADMIN_PRIVATE_KEY` exists
   
2. **Safety Wait:**
   - 5-second countdown to allow cancellation (Ctrl+C)

3. **For Each Stuck Agreement:**
   - Fetches agreement from database
   - Verifies SOL deposit exists
   - Issues `adminCancel` transaction on-chain
   - Refunds SOL from `sol_vault` PDA to buyer
   - Updates agreement status to `CANCELLED`

4. **Summary Report:**
   - Shows success/fail counts
   - Lists refund transaction IDs
   - Provides next steps

### Expected Output

```
================================================================================
🔧 EMERGENCY RECOVERY: Refunding Stuck SOL from Failed Test Agreements
================================================================================

Environment: PRODUCTION
Admin Key: ✅ Loaded
Agreements to Process: 3

⚠️  WARNING: This will issue on-chain transactions to refund SOL

Press Ctrl+C to cancel or wait 5 seconds to proceed...

🚀 Starting recovery process...

────────────────────────────────────────────────────────────────────────────────

📋 Processing AGR-MHPSOTOW-8G04QMWN...
  Status: ARCHIVED
  Escrow PDA: Eer5MiA9Kc4E3yRdi7Moe1M78XB6UaA75HvDNdMFzETi
  Buyer: 3qYD5LwHSuxwLi2mECzoVEmH2M7aehNjodUZCdmnCwtY
  SOL Amount: 0.01 SOL
  🔄 Issuing admin refund...
  ✅ Refund transaction: https://explorer.solana.com/tx/XXXXX?cluster=mainnet-beta
  ✅ Agreement status updated to CANCELLED

[... repeat for other agreements ...]

================================================================================
📊 RECOVERY SUMMARY
================================================================================

✅ Successful Refunds: 3/3
❌ Failed Refunds: 0/3

🎉 All stuck SOL has been successfully refunded!

Next Steps:
  1. Verify buyer wallet balance increased
  2. Check Solana Explorer for refund transactions
  3. Confirm escrow PDAs are empty

✅ Recovery process complete
```

### Verifying Refunds

After running the script, verify refunds were successful:

1. **Check Buyer Wallet:**
   ```bash
   solana balance 3qYD5LwHSuxwLi2mECzoVEmH2M7aehNjodUZCdmnCwtY --url mainnet-beta
   ```
   Balance should have increased by ~0.03 SOL

2. **Check Escrow PDAs:**
   ```bash
   # For each agreement, check escrow PDA balance
   solana balance Eer5MiA9Kc4E3yRdi7Moe1M78XB6UaA75HvDNdMFzETi --url mainnet-beta
   ```
   Should show only rent-exempt minimum (~0.0023 SOL)

3. **Check Database:**
   ```sql
   SELECT agreementId, status FROM agreements 
   WHERE agreementId IN ('AGR-MHPSOTOW-8G04QMWN', ...);
   ```
   Status should be `CANCELLED`

### Troubleshooting

#### Error: "MAINNET_ADMIN_PRIVATE_KEY not found"

**Solution:** Ensure environment variable is set correctly:
```bash
echo $MAINNET_ADMIN_PRIVATE_KEY  # Should output the key
```

#### Error: "AdminCancel failed"

**Possible Causes:**
1. Agreement already refunded
2. Admin keypair doesn't have authority
3. Solana network congestion

**Solution:** Check Solana Explorer for the failed transaction to see specific error.

#### Error: "Agreement not found"

**Solution:** Verify agreement ID exists in database:
```sql
SELECT * FROM agreements WHERE agreementId = 'AGR-XXX';
```

### Safety Features

1. **Environment Check:** Only runs with `NODE_ENV=production`
2. **Admin Key Required:** Won't run without proper credentials
3. **5-Second Countdown:** Allows cancellation before executing
4. **Error Handling:** Continues processing if one agreement fails
5. **Summary Report:** Shows exactly what succeeded/failed

### Adding New Stuck Agreements

To recover SOL from additional stuck agreements:

1. Edit `scripts/recovery/refund-stuck-sol.ts`
2. Add agreement IDs to `STUCK_AGREEMENTS` array:
   ```typescript
   const STUCK_AGREEMENTS = [
     'AGR-EXISTING1',
     'AGR-EXISTING2',
     'AGR-NEW-STUCK-ONE',  // <-- Add here
   ];
   ```
3. Save and run the script

### After Recovery

1. **Document the Incident:**
   - Create entry in `docs/incidents/` describing what happened
   - Include root cause, fix applied, and prevention measures

2. **Update Monitoring:**
   - Consider adding alerts for stuck agreements
   - Implement automated refund checks

3. **Prevent Recurrence:**
   - Fix underlying bugs that caused stuck SOL
   - Add E2E tests (like `06-admin-cancel-with-refunds.test.ts`)
   - Ensure settlement always issues refunds on failure

---

## Future Recovery Scripts

As issues arise, add new recovery scripts here following the same pattern:
- Comprehensive error checking
- Safety confirmations
- Detailed logging
- Summary reports
- Clear documentation

