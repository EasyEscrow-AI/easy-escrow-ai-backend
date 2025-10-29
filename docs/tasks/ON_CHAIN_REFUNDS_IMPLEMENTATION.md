# On-Chain Refunds Implementation

**Date:** October 29, 2025  
**Branch:** `feature/on-chain-refunds`  
**Status:** ✅ COMPLETED  

---

## Summary

Implemented automatic on-chain refunds for failed settlements and created a manual asset recovery system for stuck/failed escrow agreements. This ensures that assets (NFTs and USDC) are properly returned to depositors when agreements fail or expire.

---

## Problem Statement

### Issues Discovered

1. **Settlement Failures Leave Assets Stuck**
   - When settlement transactions fail, assets remain locked in escrow PDAs
   - No automatic recovery mechanism was in place
   - Users' assets were inaccessible

2. **Old Failed Agreements**
   - Historical failed agreements have assets stuck on-chain
   - Database shows deposits but on-chain assets never returned
   - Need manual recovery tool for batch processing

3. **Production E2E Test Failure**
   - Settlement failed in production test
   - NFT remained in escrow (not automatically returned)
   - Revealed gap in error handling

---

## Implementation

### 1. Automatic Refund on Settlement Failure

**File:** `src/services/settlement.service.ts`

**Changes:**
- Added automatic refund trigger in settlement error handler
- Checks refund eligibility (has deposits)
- Executes refund in background (non-blocking)
- Logs success/failure for monitoring

```typescript
// Trigger automatic refund on settlement failure
try {
  const refundService = getRefundService();
  const eligibility = await refundService.checkRefundEligibility(agreement.agreementId);
  
  if (eligibility.eligible && eligibility.hasDeposits) {
    refundService.processRefunds(agreement.agreementId)
      .then((refundResult) => {
        if (refundResult.success) {
          console.log(`✅ Automatic refund successful`);
        } else {
          console.error(`⚠️ Automatic refund failed`, refundResult.errors);
        }
      });
  }
} catch (refundError) {
  console.error('Failed to initiate automatic refund:', refundError);
}
```

**Features:**
- ✅ Non-blocking (doesn't delay error response)
- ✅ Automatic retry (3 attempts with exponential backoff)
- ✅ Proper error logging
- ✅ Webhook notifications
- ✅ Database state synchronization

---

### 2. Manual Asset Recovery Script

**File:** `scripts/utilities/recover-failed-agreements.ts`

**Purpose:**
Recover assets from failed/stuck agreements that occurred before auto-refund was implemented or where auto-refund failed.

**Features:**
- 🔍 **Smart Discovery** - Finds agreements with confirmed deposits in failed states
- ✅ **On-Chain Verification** - Checks if assets are actually still in escrow
- 🔒 **Safe Execution** - Dry-run mode to preview before executing
- 🔄 **Batch Processing** - Handle multiple agreements with rate limiting
- 📊 **Detailed Reporting** - Shows what will be recovered and transaction IDs

**Supported Statuses:**
- `PENDING` - Agreement created but never settled
- `FUNDED` - Deposits confirmed but settlement not triggered
- `USDC_LOCKED` - Only USDC deposited
- `NFT_LOCKED` - Only NFT deposited
- `BOTH_LOCKED` - Both assets deposited but not settled
- `EXPIRED` - Agreement expired without settlement
- `CANCELLED` - Manually cancelled but refund not executed

**Usage:**

```bash
# Dry run (preview only) - ALWAYS RUN THIS FIRST
npm run recover:staging:dry

# Execute recovery on staging
npm run recover:staging

# Execute recovery on production
npm run recover:production

# Recover specific agreement
npm run recover:agreement <id> -- --env production
```

**Safety Features:**
- 5-second cancellation window before execution
- 3-second delay between recoveries (rate limiting)
- Verifies assets on-chain before attempting refund
- Detailed transaction logging
- Idempotent (safe to re-run)

---

### 3. NPM Scripts

**File:** `package.json`

**Added Commands:**
```json
{
  "recover:dry-run": "Preview recovery for all environments",
  "recover:staging": "Execute recovery on staging",
  "recover:staging:dry": "Preview recovery on staging",
  "recover:production": "Execute recovery on production",
  "recover:production:dry": "Preview recovery on production",
  "recover:agreement": "Recover specific agreement by ID"
}
```

---

### 4. Documentation

**File:** `docs/operations/ASSET_RECOVERY_GUIDE.md`

**Contents:**
- Comprehensive recovery guide
- Command reference
- Database queries
- On-chain verification
- Troubleshooting
- Best practices
- Safety guidelines

---

## Technical Details

### Automatic Refund Flow

```
1. Settlement attempt fails
   ↓
2. Error caught in SettlementService
   ↓
3. Check refund eligibility
   ↓
4. Execute RefundService.processRefunds()
   ↓
5. Call EscrowProgramService.cancelIfExpired() or .adminCancel()
   ↓
6. On-chain transaction: Return NFT to seller, USDC to buyer
   ↓
7. Update database: status = REFUNDED
   ↓
8. Publish webhook: escrow.refunded
```

### Manual Recovery Flow

```
1. Script finds failed agreements
   ↓
2. Verify assets on-chain (SPL token accounts)
   ↓
3. Execute RefundService.processRefunds()
   ↓
4. Retry up to 3 times with exponential backoff
   ↓
5. Log results and update database
   ↓
6. Generate recovery report
```

### On-Chain Refund Methods

Both methods exist in the Rust escrow program:

**1. `cancel_if_expired`** (programs/escrow/src/lib.rs, lines 178-234)
- Used when agreement has expired
- Anyone can call (no admin signature required)
- Checks `Clock::get()?.unix_timestamp > escrow.expiry_timestamp`
- Returns USDC to buyer (if deposited)
- Returns NFT to seller (if deposited)
- Updates escrow status to `Cancelled`

**2. `admin_cancel`** (programs/escrow/src/lib.rs, lines 236-292)
- Used for manual cancellations
- Requires admin signature
- Checks `ctx.accounts.admin.key() == escrow.admin`
- Returns USDC to buyer (if deposited)
- Returns NFT to seller (if deposited)
- Updates escrow status to `Cancelled`

---

## Testing

### Test Strategy

1. **Build Verification** ✅
   ```bash
   npm run build
   ```
   - Confirms TypeScript compiles without errors
   - Validates all imports and types

2. **Dry Run Testing**
   ```bash
   npm run recover:staging:dry
   ```
   - Verifies script finds failed agreements
   - Checks on-chain asset verification
   - Previews what would be recovered

3. **Staging Recovery Test**
   ```bash
   # Create failed agreement
   npm run test:staging:e2e:02-agreement-expiry-refund
   
   # Verify it shows in dry run
   npm run recover:staging:dry
   
   # Execute recovery
   npm run recover:staging
   ```

4. **Production Validation** (when ready)
   ```bash
   # Always dry run first
   npm run recover:production:dry
   
   # Review output carefully
   # Then execute
   npm run recover:production
   ```

---

## Database Impact

### Agreement Status Updates

Successful refunds update:
```sql
UPDATE "Agreement"
SET 
  status = 'REFUNDED',
  cancelled_at = NOW()
WHERE agreement_id = '<id>';
```

### Deposit Status Updates

```sql
UPDATE "Deposit"
SET status = 'REFUNDED'
WHERE agreement_id = '<id>';
```

### Transaction Logs

```sql
INSERT INTO "TransactionLog" (
  tx_id,
  operation_type,
  agreement_id,
  status,
  timestamp
) VALUES (
  '<txId>',
  'refund',
  '<agreementId>',
  'confirmed',
  NOW()
);
```

---

## Production Readiness

### Pre-Deployment Checklist

- [x] Code builds without errors
- [x] No linter errors
- [x] TypeScript types are correct
- [x] Recovery script has dry-run mode
- [x] Safety delays implemented
- [x] Comprehensive error handling
- [x] Detailed logging
- [x] Documentation complete

### Deployment Steps

1. **Merge to staging branch**
   ```bash
   git add -A
   git commit -m "feat: implement on-chain refunds and asset recovery"
   git push origin feature/on-chain-refunds
   ```

2. **Create PR to staging**
   - Review changes carefully
   - Run CI/CD tests
   - Deploy to staging environment

3. **Test on staging**
   ```bash
   npm run recover:staging:dry
   npm run test:staging:e2e:02-agreement-expiry-refund
   ```

4. **Merge to master (when ready)**
   - After staging validation
   - Create PR to master
   - Deploy to production

5. **Run production recovery**
   ```bash
   # ALWAYS dry run first
   npm run recover:production:dry
   
   # Review carefully, then execute
   npm run recover:production
   ```

---

## Key Benefits

### For Users
- ✅ Assets automatically returned on settlement failure
- ✅ No need to contact support for stuck assets
- ✅ Faster resolution time
- ✅ Better user experience

### For Operations
- ✅ Automated recovery reduces manual intervention
- ✅ Batch processing for historical failures
- ✅ Detailed logging for auditing
- ✅ Safe dry-run mode for testing

### For Business
- ✅ Reduced support tickets
- ✅ Improved trust and reliability
- ✅ Better asset management
- ✅ Comprehensive audit trail

---

## Monitoring

### What to Monitor

1. **Settlement Failures**
   - Look for: `[SettlementService] Error executing settlement`
   - Should trigger: `[SettlementService] Settlement failed - initiating automatic refund`

2. **Automatic Refunds**
   - Success: `[SettlementService] ✅ Automatic refund successful`
   - Failure: `[SettlementService] ⚠️ Automatic refund failed`

3. **Manual Recovery**
   - Track recovery script executions
   - Monitor success/failure rates
   - Review assets recovered

### Metrics to Track

- **Settlement failure rate** → Should decrease over time
- **Automatic refund success rate** → Target: >95%
- **Manual recovery volume** → Should decrease as auto-refund handles new cases
- **Asset value recovered** → Track total USDC/NFT value

---

## Known Limitations

1. **Manual Recovery Required for Old Cases**
   - Agreements that failed before this feature was deployed
   - One-time cleanup needed

2. **Network Failures**
   - If blockchain network is down, refunds will fail
   - Retry mechanism helps but may need manual intervention

3. **Gas/Priority Fees**
   - Admin wallet pays for refund transactions
   - Need to ensure wallet has sufficient SOL

---

## Future Enhancements

### Potential Improvements

1. **Scheduled Recovery Job**
   - Cron job to automatically run recovery script daily
   - Auto-detect and recover stuck assets

2. **Admin Dashboard**
   - Web UI to view failed agreements
   - One-click recovery from dashboard
   - Real-time recovery status

3. **User Notifications**
   - Email/webhook when assets are recovered
   - Transaction links for transparency

4. **Recovery Metrics Dashboard**
   - Track recovery success rates
   - Monitor asset values recovered
   - Alert on failed recoveries

---

## Related Files

### Modified Files
- `src/services/settlement.service.ts` - Automatic refund on failure
- `package.json` - Recovery script commands

### New Files
- `scripts/utilities/recover-failed-agreements.ts` - Manual recovery script
- `docs/operations/ASSET_RECOVERY_GUIDE.md` - Comprehensive guide
- `docs/tasks/ON_CHAIN_REFUNDS_IMPLEMENTATION.md` - This document

### Existing Infrastructure (Already Implemented)
- `src/services/refund.service.ts` - On-chain refund execution
- `src/services/escrow-program.service.ts` - Blockchain interaction
- `programs/escrow/src/lib.rs` - Smart contract refund instructions

---

## Rollback Plan

If issues arise:

1. **Disable Auto-Refund**
   ```typescript
   // Comment out auto-refund code in settlement.service.ts
   // Lines 532-567
   ```

2. **Stop Manual Recovery**
   ```bash
   # Don't run recovery scripts until issue resolved
   ```

3. **Revert Changes**
   ```bash
   git revert <commit-hash>
   git push origin feature/on-chain-refunds
   ```

---

## Success Criteria

### Completed ✅

- [x] Automatic refund on settlement failure
- [x] Manual recovery script with dry-run mode
- [x] NPM scripts for easy execution
- [x] Comprehensive documentation
- [x] Safety features (delays, verification)
- [x] Error handling and retry logic
- [x] No linter errors
- [x] TypeScript builds successfully

### Next Steps

- [ ] Merge to staging branch
- [ ] Create PR for review
- [ ] Deploy to staging
- [ ] Test on staging environment
- [ ] Run production recovery (dry-run first)
- [ ] Monitor automatic refunds in production

---

**Implementation Date:** October 29, 2025  
**Implemented By:** AI Assistant + User collaboration  
**Branch:** `feature/on-chain-refunds`  
**Status:** ✅ Ready for deployment

