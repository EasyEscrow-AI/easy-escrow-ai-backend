# Asset Recovery Guide

**Date:** October 29, 2025  
**Status:** ✅ ACTIVE  
**Feature:** Automatic & Manual Asset Recovery

---

## Overview

This guide covers the automatic and manual asset recovery systems for failed/stuck escrow agreements. Assets (NFTs and USDC) can get stuck in escrow when settlements fail or agreements expire without proper cleanup.

---

## Table of Contents

- [Automatic Recovery](#automatic-recovery)
- [Manual Recovery](#manual-recovery)
- [Recovery Script Usage](#recovery-script-usage)
- [Database Queries](#database-queries)
- [Troubleshooting](#troubleshooting)

---

## Automatic Recovery

### Settlement Failure Auto-Refund

**Status:** ✅ IMPLEMENTED (October 29, 2025)

When a settlement transaction fails, the system automatically triggers a refund process:

1. **Settlement fails** → Error caught in `SettlementService.executeSettlement()`
2. **Eligibility check** → Verifies agreement has confirmed deposits
3. **Background refund** → Executes on-chain refund without blocking error response
4. **Database update** → Agreement status updated to `REFUNDED`
5. **Webhook trigger** → `escrow.refunded` event published

**Code Location:** `src/services/settlement.service.ts` (lines 532-567)

```typescript
// Automatic refund on settlement failure
if (eligibility.eligible && eligibility.hasDeposits) {
  refundService.processRefunds(agreement.agreementId)
    .then((refundResult) => {
      // Log success or errors
    });
}
```

**Key Features:**
- ✅ Non-blocking (runs in background)
- ✅ Automatic retry (3 attempts with exponential backoff)
- ✅ Proper error logging
- ✅ Webhook notifications

---

## Manual Recovery

### When to Use Manual Recovery

Use the manual recovery script when:
- Assets are stuck from old failed agreements (before auto-refund was implemented)
- Automatic refund failed and needs manual intervention
- Agreement is in an inconsistent state
- On-chain assets don't match database records

### Affected Statuses

The recovery script handles agreements in these statuses with confirmed deposits:
- `PENDING` - Agreement created but settlement never attempted
- `FUNDED` - Deposits confirmed but settlement not triggered
- `USDC_LOCKED` - Only USDC deposited
- `NFT_LOCKED` - Only NFT deposited
- `BOTH_LOCKED` - Both assets deposited but not settled
- `EXPIRED` - Agreement expired without settlement
- `CANCELLED` - Manually cancelled but refund not executed

---

## Recovery Script Usage

### Script Location

```
scripts/utilities/recover-failed-agreements.ts
```

### Prerequisites

1. **Environment file** must exist (`.env.staging` or `.env.production`)
2. **Admin wallet** must be configured with private key
3. **Database access** must be available
4. **RPC endpoint** must be accessible

### Command Reference

#### Dry Run (Preview Only)

**Staging:**
```bash
npm run recover:staging:dry
# Or directly:
npx ts-node scripts/utilities/recover-failed-agreements.ts --dry-run --all --env staging
```

**Production:**
```bash
npm run recover:production:dry
# Or directly:
npx ts-node scripts/utilities/recover-failed-agreements.ts --dry-run --all --env production
```

**What it does:**
- ✅ Scans database for failed agreements
- ✅ Verifies assets on-chain
- ✅ Shows what would be recovered
- ❌ Does NOT execute transactions

#### Live Recovery (Executes On-Chain)

**⚠️ WARNING:** These commands execute real blockchain transactions!

**Staging (All Failed Agreements):**
```bash
npm run recover:staging
```

**Production (All Failed Agreements):**
```bash
npm run recover:production
```

**Single Agreement (Any Environment):**
```bash
npm run recover:agreement <agreement-id> -- --env production
# Or:
npx ts-node scripts/utilities/recover-failed-agreements.ts --agreement-id <id> --env production
```

**Safety Features:**
- 5-second cancellation window before execution
- 3-second delay between recoveries (rate limiting)
- Detailed logging of all actions
- On-chain verification before refund

---

## Recovery Script Output

### Dry Run Example

```
████████████████████████████████████████████████████████████████████████████████
🚑 ASSET RECOVERY SCRIPT
████████████████████████████████████████████████████████████████████████████████
   Environment: PRODUCTION
   Network: mainnet-beta
   RPC: https://mainnet.helius-rpc.com/?api-key=...
   Mode: DRY RUN (preview only)
████████████████████████████████████████████████████████████████████████████████

🔍 Searching for agreements needing asset recovery...

Found 3 agreement(s) with confirmed deposits in failed/stuck status

📊 Recovery Summary:
   Total agreements: 3
   Total deposits: 5

════════════════════════════════════════════════════════════════════════════════
📦 Agreement: agr_1234567890
   Status: EXPIRED
   Created: 2025-10-28T15:30:00.000Z
   Expiry: 2025-10-28T16:30:00.000Z
   Escrow PDA: 7xK...abc
   Deposits: 2

   On-Chain Assets:
   - NFT in escrow: ✅ (balance: 1)
   - USDC in escrow: ✅ (balance: 100000000)

   Database Deposits:
   1. NFT from 9tY...xyz
   2. USDC from 8pM...def
      Amount: 100 USDC

   🔍 DRY RUN - Would execute on-chain refund for this agreement
════════════════════════════════════════════════════════════════════════════════

...

████████████████████████████████████████████████████████████████████████████████
📋 FINAL SUMMARY
████████████████████████████████████████████████████████████████████████████████
   Successful: 3 / 3
   Failed: 0 / 3
   Assets recovered: 5
████████████████████████████████████████████████████████████████████████████████

💡 TIP: Run without --dry-run to execute actual recovery
```

### Live Recovery Example

```
████████████████████████████████████████████████████████████████████████████████
🚑 ASSET RECOVERY SCRIPT
████████████████████████████████████████████████████████████████████████████████
   Environment: PRODUCTION
   Network: mainnet-beta
   RPC: https://mainnet.helius-rpc.com/?api-key=...
   Mode: LIVE EXECUTION
████████████████████████████████████████████████████████████████████████████████

⚠️  WARNING: This will execute real blockchain transactions!
   Press Ctrl+C within 5 seconds to cancel...

   Proceeding with recovery...

...

════════════════════════════════════════════════════════════════════════════════
📦 Agreement: agr_1234567890
   Status: EXPIRED
   ...

   💰 Executing on-chain refund...

   ✅ Refund successful!
   Transactions: 1
   1. NFT → 9tY...xyz
      TX: 5KJ...abc123
   2. USDC → 8pM...def
      TX: 5KJ...abc123
════════════════════════════════════════════════════════════════════════════════
```

---

## Database Queries

### Find Failed Agreements with Assets

```sql
-- PostgreSQL
SELECT 
  a.agreement_id,
  a.status,
  a.escrow_pda,
  a.nft_mint,
  a.created_at,
  a.expiry,
  COUNT(d.id) as deposit_count,
  COUNT(CASE WHEN d.type = 'NFT' THEN 1 END) as nft_count,
  COUNT(CASE WHEN d.type = 'USDC' THEN 1 END) as usdc_count,
  SUM(CASE WHEN d.type = 'USDC' THEN d.amount ELSE 0 END) as total_usdc
FROM "Agreement" a
JOIN "Deposit" d ON d.agreement_id = a.agreement_id
WHERE a.status IN ('PENDING', 'FUNDED', 'USDC_LOCKED', 'NFT_LOCKED', 'BOTH_LOCKED', 'EXPIRED', 'CANCELLED')
  AND d.status = 'CONFIRMED'
GROUP BY a.agreement_id
ORDER BY a.created_at ASC;
```

### Check Refund Status

```sql
-- Check if refund was executed
SELECT 
  a.agreement_id,
  a.status,
  a.cancelled_at,
  t.tx_id,
  t.operation_type,
  t.timestamp
FROM "Agreement" a
LEFT JOIN "TransactionLog" t ON t.agreement_id = a.agreement_id AND t.operation_type = 'refund'
WHERE a.agreement_id = 'agr_1234567890';
```

### Find Agreements by Date Range

```sql
-- Find failed agreements from specific time period
SELECT 
  a.agreement_id,
  a.status,
  a.created_at,
  COUNT(d.id) as deposits
FROM "Agreement" a
JOIN "Deposit" d ON d.agreement_id = a.agreement_id
WHERE a.status IN ('EXPIRED', 'CANCELLED', 'BOTH_LOCKED')
  AND d.status = 'CONFIRMED'
  AND a.created_at BETWEEN '2025-10-01' AND '2025-10-31'
GROUP BY a.agreement_id
ORDER BY a.created_at DESC;
```

---

## On-Chain Verification

### Verify Assets Still in Escrow

Use Solana CLI or Solscan to verify:

```bash
# Check NFT balance in escrow
solana account <escrow-nft-token-account>

# Check USDC balance in escrow
solana account <escrow-usdc-token-account>

# View on Solscan (mainnet)
https://solscan.io/account/<escrow-pda>

# View on Solscan (devnet)
https://solscan.io/account/<escrow-pda>?cluster=devnet
```

---

## Troubleshooting

### Recovery Failed: "No assets in escrow"

**Cause:** Assets were already recovered or never deposited.

**Solution:**
1. Check on-chain balances manually
2. Verify database deposit records
3. Check transaction logs for previous refund attempts

### Recovery Failed: "Unauthorized"

**Cause:** Admin wallet not configured correctly.

**Solution:**
1. Verify `ADMIN_PRIVATE_KEY` in environment file
2. Check admin wallet has authority in escrow state
3. Verify admin wallet matches program's admin

### Recovery Failed: "Transaction timeout"

**Cause:** Network congestion or RPC issues.

**Solution:**
1. Wait and retry (script has automatic retry with 3 attempts)
2. Check RPC endpoint status
3. Try with different RPC endpoint
4. Increase transaction priority fee (if available)

### Recovery Partial Success

**Cause:** One asset refunded but other failed.

**Solution:**
1. Run recovery again for same agreement (idempotent)
2. Check which asset failed in error logs
3. Manually verify on-chain status
4. May need to cancel escrow first via admin

### Database Out of Sync

**Cause:** Refund succeeded on-chain but database not updated.

**Solution:**
```sql
-- Manually update agreement status
UPDATE "Agreement"
SET status = 'REFUNDED', cancelled_at = NOW()
WHERE agreement_id = 'agr_1234567890';

-- Mark deposits as refunded
UPDATE "Deposit"
SET status = 'REFUNDED'
WHERE agreement_id = 'agr_1234567890';
```

---

## Testing Recovery

### Test on Staging First

**Always test recovery on staging before production!**

```bash
# 1. Dry run to see what would happen
npm run recover:staging:dry

# 2. Review output carefully

# 3. Execute recovery
npm run recover:staging

# 4. Verify results
npm run test:staging:e2e:02-agreement-expiry-refund
```

### Create Test Failed Agreement

```bash
# Create agreement that will fail settlement
npm run test:staging:e2e:07-edge-cases-validation

# Let it fail, then run recovery
npm run recover:staging:dry
```

---

## Best Practices

### Before Recovery

1. ✅ **Always dry run first** - See what will be recovered
2. ✅ **Backup database** - Create snapshot before production recovery
3. ✅ **Check RPC status** - Ensure network is stable
4. ✅ **Verify admin wallet** - Confirm correct wallet is configured
5. ✅ **Review agreements** - Manually inspect suspicious cases

### During Recovery

1. ✅ **Monitor logs** - Watch for errors or unexpected behavior
2. ✅ **Check transactions** - Verify each TX on block explorer
3. ✅ **Don't interrupt** - Let script complete each agreement
4. ✅ **Rate limiting** - Script has 3s delay between recoveries

### After Recovery

1. ✅ **Verify on-chain** - Check assets returned to owners
2. ✅ **Check database** - Ensure status updated to REFUNDED
3. ✅ **Review webhooks** - Confirm refund events published
4. ✅ **Document** - Record what was recovered and why
5. ✅ **User notification** - Inform affected users if needed

---

## Related Documentation

- [Refund Service Implementation](../architecture/REFUND_EXECUTION_INVESTIGATION.md)
- [Settlement Service](../architecture/WEBHOOK_SYSTEM.md)
- [Escrow Program](../architecture/IDL_QUICK_REFERENCE.md)
- [Production E2E Tests](../testing/PRODUCTION_E2E_TESTS.md)

---

## Support

If you encounter issues with asset recovery:

1. Check this documentation first
2. Review error logs in detail
3. Verify on-chain state manually
4. Test recovery on staging
5. Contact technical lead if needed

---

**Last Updated:** October 29, 2025  
**Implemented By:** Feature/on-chain-refunds branch

