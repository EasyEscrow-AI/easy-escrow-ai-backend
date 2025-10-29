# Asset Recovery Guide

**Comprehensive guide for investigating and recovering stuck assets from escrow PDAs**

## Table of Contents
- [Overview](#overview)
- [When to Use These Tools](#when-to-use-these-tools)
- [Investigation Tool](#investigation-tool)
- [Manual Recovery Tool](#manual-recovery-tool)
- [Automatic Recovery System](#automatic-recovery-system)
- [Case Studies](#case-studies)
- [Troubleshooting](#troubleshooting)

---

## Overview

The EasyEscrow platform includes multiple layers of asset protection and recovery:

1. **Automatic Recovery** - Monitors expired agreements and processes refunds automatically
2. **Investigation Tool** - Diagnoses why an escrow is stuck
3. **Manual Recovery** - Admin tool for recovering assets from any stuck escrow

### Recovery Flow

```
┌─────────────────────┐
│  Escrow Created     │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│  Assets Deposited   │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
     v           v
┌─────────┐  ┌──────────┐
│Expires  │  │Completes │
└────┬────┘  └──────────┘
     │
     v
┌─────────────────────────────────┐
│ Automatic Recovery System       │
│                                 │
│ 1. ExpiryService (60s interval) │
│    - Marks agreements EXPIRED   │
│                                 │
│ 2. RefundOrchestrator (5m)      │
│    - Processes on-chain refunds │
│    - Calls cancelIfExpired()    │
└────────────┬────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    v                 v
┌─────────┐      ┌─────────────┐
│Success  │      │ Stuck/Failed│
└─────────┘      └──────┬──────┘
                        │
                        v
           ┌────────────────────────┐
           │ Manual Investigation   │
           │ & Recovery Required    │
           └────────────────────────┘
```

---

## When to Use These Tools

### Use **Investigation Tool** When:
- An escrow seems stuck and you want to understand why
- Assets aren't being returned automatically
- Database and on-chain states seem mismatched
- Need to audit the automatic recovery system

### Use **Manual Recovery Tool** When:
- Investigation shows escrow is stuck
- Automatic recovery failed or didn't run
- Escrow was created before monitoring started
- Emergency asset recovery needed

---

## Investigation Tool

### Purpose
Diagnoses why a stuck escrow wasn't automatically recovered by analyzing:
- Database status (tracked/untracked, status, expiry)
- On-chain status (deposits, expiry, escrow state)
- Recovery service eligibility

### Usage

```bash
# Investigate an escrow PDA
npx ts-node scripts/utilities/investigate-stuck-escrow.ts <ESCROW_PDA>

# Examples
npx ts-node scripts/utilities/investigate-stuck-escrow.ts CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh
```

### Output Example

```
🔍 Investigating Stuck Escrow

Escrow PDA: CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh
Environment: development
Date: 2025-10-29T04:00:00.000Z
================================================================================

📊 Step 1: Checking Database Status...
❌ Agreement NOT found in database

⛓️  Step 2: Checking On-Chain Status...
✅ Escrow account found on-chain:
   Buyer: 3qYD5LwHSuxwLi2mECzoVEmH2M7aehNjodUZCdmnCwtY
   Seller: B7jiNm8TKvaoad3N36pyDeXMSVPmvHLaXZMDC7udhTfr
   NFT Mint: J8siYrNdXUR7kHAfeHorepcL55WFzSa6YZPYoWPULgAs
   Status: BOTH_DEPOSITED
   NFT Deposited: true
   Token Deposited: true
   Expiry: 2025-10-28T23:00:00.000Z
   ⚠️  EXPIRED: 5 hours ago

🔬 Step 3: Analysis...

📋 Analysis Results:
Is Stuck: ✅ YES

Reasons:
  1. Escrow exists on-chain but not tracked in database
  2. Agreement expired 5 hours ago with both assets deposited

Recommendations:
  1. This escrow was created before database monitoring started
  2. Use manual recovery script to return assets
  3. Assets will be returned to: NFT→Seller, USDC→Buyer
```

### Interpreting Results

The investigation tool will identify one of these scenarios:

1. **Untracked Escrow** (Not in Database)
   - Escrow created before monitoring started
   - Use manual recovery to return assets

2. **Status Mismatch** (Expired on-chain, PENDING in DB)
   - ExpiryService didn't run when it expired
   - Update database status to EXPIRED
   - Run orchestrator to process refunds

3. **Awaiting Refund** (EXPIRED with deposits)
   - Automatically will be processed by RefundService
   - Check service logs for errors
   - Manually trigger if needed

4. **Completed Successfully** (Not stuck!)
   - Escrow settled normally
   - No action needed

---

## Manual Recovery Tool

### Purpose
Executes admin cancel to return assets from any stuck escrow PDA to their original depositors.

### Safety Features
- ✅ Dry-run mode to preview actions
- ✅ Expiry check (can be overridden with `--force`)
- ✅ Asset verification before execution
- ✅ Database status update option
- ✅ Jito Block Engine integration for mainnet
- ✅ Comprehensive error handling

### Usage

```bash
# Basic syntax
npx ts-node scripts/utilities/manual-recovery.ts <ESCROW_PDA> [OPTIONS]

# Options:
#   --dry-run       Simulate without executing (safe preview)
#   --update-db     Update database after successful recovery
#   --force         Override expiry and asset checks
```

### Examples

#### 1. Dry Run (Safe Preview)
```bash
# Preview what would happen without executing
NODE_ENV=production npx ts-node scripts/utilities/manual-recovery.ts \
  CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh \
  --dry-run
```

**Output:**
```
🔍 DRY RUN MODE - No actual transaction will be executed
   Would call: adminCancel()
   Escrow PDA: CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh
   Buyer: 3qYD5Lw...
   Seller: B7jiNm8...
   NFT Mint: J8siYrN...
   Assets to return:
     ✅ NFT → Seller
     ✅ USDC → Buyer
```

#### 2. Actual Recovery (Production)
```bash
# Execute recovery on mainnet
NODE_ENV=production npx ts-node scripts/utilities/manual-recovery.ts \
  CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh \
  --update-db
```

**Output:**
```
✅ Recovery transaction submitted: 46DZ97HAanV5h2m1...
   View on Solscan: https://solscan.io/tx/46DZ97HAanV5h2m1...

✅ RECOVERY COMPLETE
   Transaction: 46DZ97HAanV5h2m1...
   NFT Recovered: true
   USDC Recovered: true
   Database Updated: true
```

#### 3. Force Recovery (Override Checks)
```bash
# Force recovery even if not expired
NODE_ENV=production npx ts-node scripts/utilities/manual-recovery.ts \
  CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh \
  --force \
  --update-db
```

### Environment Setup

The tool automatically configures itself based on `NODE_ENV`:

**Development/Staging:**
```bash
NODE_ENV=development npx ts-node scripts/utilities/manual-recovery.ts ...
```
- Uses `.env.development`
- Devnet/staging RPC
- Devnet admin keys

**Production:**
```bash
NODE_ENV=production npx ts-node scripts/utilities/manual-recovery.ts ...
```
- Uses `.env.production`
- Mainnet RPC
- Production admin keys
- **Jito Block Engine** for transactions

---

## Automatic Recovery System

### Components

#### 1. ExpiryService
- **Runs:** Every 60 seconds (configurable)
- **Checks:** Agreements with `expiry < now` AND status in `[PENDING, FUNDED, USDC_LOCKED, NFT_LOCKED, BOTH_LOCKED]`
- **Action:** Updates status to `EXPIRED`

#### 2. RefundOrchestrator
- **Runs:** Every 5 minutes
- **Processes:** Agreements with status `EXPIRED` that have deposits
- **Calls:** `RefundService.batchProcessRefunds()`

#### 3. RefundService
- **Validates:** Refund eligibility
- **Executes:** On-chain cancellation via `cancelIfExpired()` or `adminCancel()`
- **Updates:** Agreement status to `REFUNDED` on success

### Monitoring Automatic Recovery

Check service health:
```bash
curl https://api.easyescrow.ai/health
```

Response shows recovery system status:
```json
{
  "expiryCancellation": {
    "status": "running",
    "services": {
      "expiry": true,
      "refund": true,
      "cancellation": true
    },
    "recentErrors": 0
  }
}
```

---

## Case Studies

### Case 1: Untracked Expired Escrow

**Scenario:** NFT stuck in escrow PDA created before monitoring started

**Investigation:**
```bash
npx ts-node scripts/utilities/investigate-stuck-escrow.ts CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh
```

**Finding:**
- ❌ Not in database
- ✅ On-chain: Expired, both assets deposited
- 📋 Recommendation: Manual recovery

**Recovery:**
```bash
# 1. Preview
NODE_ENV=production npx ts-node scripts/utilities/manual-recovery.ts \
  CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh \
  --dry-run

# 2. Execute
NODE_ENV=production npx ts-node scripts/utilities/manual-recovery.ts \
  CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh
```

**Result:** ✅ NFT returned to seller, USDC returned to buyer

---

### Case 2: Status Mismatch

**Scenario:** Agreement expired but still shows PENDING in database

**Investigation:**
- ✅ Found in database: Status=PENDING
- ✅ On-chain: Expired 3 hours ago
- 📋 Analysis: ExpiryService didn't update status

**Fix:**
1. Update database status:
   ```sql
   UPDATE "Agreement" 
   SET status = 'EXPIRED', "cancelledAt" = NOW()
   WHERE "agreementId" = 'AGR-...';
   ```

2. Trigger orchestrator:
   ```typescript
   // Via API or service call
   await orchestrator.processExpiredAgreementRefunds();
   ```

**Result:** ✅ Automatic refund processed within 5 minutes

---

### Case 3: Awaiting Automatic Refund

**Scenario:** Agreement marked EXPIRED but refund pending

**Investigation:**
- ✅ Database: Status=EXPIRED, has deposits
- ✅ On-chain: Still active, assets in escrow
- 📋 Analysis: In queue for automatic processing

**Action:** Wait for orchestrator (runs every 5 minutes)

**If urgent:** Trigger manually:
```bash
NODE_ENV=production npx ts-node scripts/utilities/manual-recovery.ts \
  <ESCROW_PDA> \
  --update-db
```

---

## Troubleshooting

### Common Issues

#### "Escrow PDA not found on-chain"
**Cause:** Escrow already closed/recovered

**Solution:** Check transaction history on Solscan

#### "Transaction must write lock at least one tip account"
**Cause:** Jito tip missing for mainnet transaction

**Solution:** ✅ Fixed! The manual recovery tool automatically adds Jito tips for mainnet

#### "Agreement not eligible for refunds"
**Cause:** Status doesn't allow refunds (e.g., SETTLED, REFUNDED)

**Solution:** Verify agreement status is correct

#### "USDC_MINT_ADDRESS not configured"
**Cause:** Missing environment variable

**Solution:** Ensure `.env.production` or `.env.development` has:
```bash
# For production
MAINNET_PROD_USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# For development
DEVNET_STAGING_USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
```

#### Database update fails after successful recovery
**Cause:** Agreement not found in database or prisma connection issue

**Solution:** 
1. Transaction still succeeded - assets are recovered!
2. Manually update database:
   ```sql
   UPDATE "Agreement" 
   SET status = 'CANCELLED', 
       "cancelTxId" = '<transaction_id>',
       "cancelledAt" = NOW()
   WHERE "escrowPda" = '<escrow_pda>';
   ```

---

## Best Practices

### Before Recovery

1. **Always investigate first:**
   ```bash
   npx ts-node scripts/utilities/investigate-stuck-escrow.ts <ESCROW_PDA>
   ```

2. **Use dry-run to preview:**
   ```bash
   npx ts-node scripts/utilities/manual-recovery.ts <ESCROW_PDA> --dry-run
   ```

3. **Verify assets on Solscan:**
   - Check NFT token account balance
   - Check USDC token account balance
   - Verify escrow PDA ownership

### During Recovery

1. **Use correct environment:**
   - `NODE_ENV=production` for mainnet
   - `NODE_ENV=development` for devnet/staging

2. **Update database when possible:**
   - Use `--update-db` flag if agreement exists in database

3. **Save transaction IDs:**
   - Record all recovery transaction IDs for audit trail

### After Recovery

1. **Verify on Solscan:**
   - Check transaction succeeded
   - Verify assets transferred to correct wallets

2. **Check database status:**
   - Confirm status updated to CANCELLED or REFUNDED
   - Verify cancelTxId recorded

3. **Document the incident:**
   - Why was manual recovery needed?
   - Was it a monitoring gap?
   - Should automatic recovery be improved?

---

## Related Documentation

- [Escrow Program Service](../architecture/ESCROW_PROGRAM_SERVICE.md)
- [Jito Integration](../architecture/JITO_INTEGRATION.md)
- [Recovery Services](../architecture/RECOVERY_SERVICES.md)
- [Database Schema](../database/SCHEMA.md)

---

## Support

If you encounter issues not covered in this guide:

1. Check production logs: `doctl apps logs <app-id>`
2. Review on-chain transaction: Solscan
3. Contact platform admin for assistance
4. File incident report with details

---

**Last Updated:** October 29, 2025
**Version:** 1.0.0
