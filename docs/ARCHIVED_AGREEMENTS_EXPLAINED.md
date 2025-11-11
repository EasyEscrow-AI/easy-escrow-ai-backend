# ARCHIVED Agreements and the Stuck Monitor

## 🚨 CRITICAL: Why ARCHIVED Must Stay in Stuck Monitor

**TL;DR:** Removing `ARCHIVED` from the stuck agreement monitor would trap user funds in escrow. **DO NOT REMOVE IT.**

---

## Background

A common misconception is that `ARCHIVED` agreements are "finished" and have no stuck assets. This is **incorrect and dangerous**.

### ❌ **Incorrect Assumption**
> "If an escrow has been ARCHIVED, it's finished (unless we want to reclaim rent)"

### ✅ **Reality**
- ARCHIVED agreements **CAN have deposits still in escrow**
- ARCHIVED means "**failed/cleanup**" not necessarily "**successfully completed**"
- Status transitions allow `BOTH_LOCKED` → `ARCHIVED` (with deposits!)
- The stuck monitor **MUST** check ARCHIVED to prevent fund loss

---

## Evidence from Code

### From `refund.service.ts` (Lines 171-182)

```typescript
// Check if agreement status allows refunds
// ARCHIVED is included because test cleanup marks failed agreements as ARCHIVED
// but they may still have stuck assets in escrow PDAs that need to be refunded
const refundableStatuses = [
  AgreementStatus.EXPIRED,
  AgreementStatus.CANCELLED,
  AgreementStatus.PENDING,
  AgreementStatus.FUNDED,
  AgreementStatus.USDC_LOCKED,
  AgreementStatus.NFT_LOCKED,
  AgreementStatus.BOTH_LOCKED,
  AgreementStatus.ARCHIVED, // Allow refunds for archived agreements with stuck assets
];
```

**The refund service explicitly includes ARCHIVED because deposits can be stuck!**

---

## The Fund-Trapping Scenario

### Timeline

1. **Agreement created** with NFT and SOL deposits
2. **Status:** `BOTH_LOCKED` (both parties deposited)
3. **Settlement fails** (network error, bug, etc.)
4. **Admin/cleanup script** marks agreement as `ARCHIVED`
   - This is a **valid status transition**
   - Deposits are **still in escrow PDAs** 💰
5. **If stuck monitor excludes ARCHIVED:**
   - Monitor doesn't detect stuck agreement ❌
   - No automatic refund triggered ❌
   - **User funds permanently trapped!** 🚨

---

## Status Transitions

### Valid Transitions to ARCHIVED

```
PENDING      → ARCHIVED  (initialization failed)
NFT_LOCKED   → ARCHIVED  (partial deposit, cleanup)
SOL_LOCKED   → ARCHIVED  (partial deposit, cleanup)
USDC_LOCKED  → ARCHIVED  (partial deposit, cleanup)
BOTH_LOCKED  → ARCHIVED  (settlement failed, cleanup) ⚠️ DEPOSITS STUCK!
EXPIRED      → ARCHIVED  (cleanup after expiry)
CANCELLED    → ARCHIVED  (cleanup after cancel)
```

**Note:** The critical case is `BOTH_LOCKED` → `ARCHIVED` where deposits exist but settlement never completed.

---

## Why ARCHIVED Alerts Occur

### Legitimate ARCHIVED Alerts

ARCHIVED agreements appear in stuck monitor alerts when:

1. **Settlement failed** and agreement was archived with deposits
2. **Cleanup script** archived agreement before checking for deposits
3. **Admin action** archived agreement without processing refunds
4. **Test cleanup** marked failed test as ARCHIVED with test NFTs/SOL

**These are NOT false alarms - they indicate potential stuck funds!**

---

## Correct Approach

### ✅ **DO: Keep ARCHIVED in Stuck Monitor**

```typescript
// src/services/stuck-agreement-monitor.service.ts
const stuckAgreements = await prisma.agreement.findMany({
  where: {
    status: {
      in: [
        AgreementStatus.NFT_LOCKED,
        AgreementStatus.SOL_LOCKED,
        AgreementStatus.USDC_LOCKED,
        AgreementStatus.BOTH_LOCKED,
        AgreementStatus.ARCHIVED, // ✅ MUST include to prevent fund loss
      ],
    },
  },
});
```

### ✅ **DO: Improve Alert Messaging**

Instead of removing ARCHIVED, improve the alert to distinguish:

```typescript
// Check if agreement has deposits
const deposits = await prisma.deposit.findMany({
  where: { agreementId: agreement.agreementId },
});

const hasDeposits = deposits.length > 0;

// Different severity based on deposits
const severity = agreement.status === AgreementStatus.ARCHIVED && !hasDeposits
  ? AlertSeverity.INFO      // ℹ️ Archived without deposits (normal)
  : AlertSeverity.CRITICAL; // 🚨 Archived WITH deposits (stuck funds!)

const message = hasDeposits
  ? `ARCHIVED agreement has ${deposits.length} stuck deposit(s) - refund needed!`
  : `ARCHIVED agreement has no deposits (normal cleanup)`;
```

### ❌ **DON'T: Remove ARCHIVED from Monitor**

This creates a critical gap where stuck funds won't be detected.

---

## Automatic Refunds

The stuck monitor **automatically triggers refunds** for ARCHIVED agreements with deposits:

```typescript
// src/services/stuck-agreement-monitor.service.ts
if (
  this.config.autoRefundEnabled &&
  timeSinceLastUpdate >= autoRefundThreshold &&
  !this.refundAttempts.has(agreement.agreementId)
) {
  console.log(`[StuckAgreementMonitor] Auto-refund threshold reached for ${agreement.agreementId}`);
  console.log(`[StuckAgreementMonitor] Attempting automatic refund...`);
  
  const refundResult = await refundService.processRefund(agreement.agreementId);
  // ...
}
```

**This includes ARCHIVED agreements!** Removing them would break automatic refunds.

---

## Summary

| Scenario | ARCHIVED in Monitor? | Result |
|----------|---------------------|--------|
| **Include ARCHIVED** ✅ | Yes | Stuck funds detected & refunded |
| **Exclude ARCHIVED** ❌ | No | **Funds trapped forever!** |

---

## Related

- **Issue:** PR #217 (closed) - Attempted to remove ARCHIVED
- **Bug Found By:** Cursor bot code review
- **Risk:** Critical - user funds would be permanently trapped
- **Decision:** ARCHIVED **MUST** remain in stuck monitor

---

## For Developers

**If you see ARCHIVED agreements in stuck monitor alerts:**

1. ✅ **This is correct behavior** - don't remove it!
2. 🔍 **Check if deposits exist** - use refund service
3. 💰 **Process refund if needed** - automatic refund will handle it
4. 📊 **Improve logging** - distinguish no-deposits vs stuck-deposits

**DO NOT remove ARCHIVED from the monitor - it will trap user funds!**

---

**Last Updated:** 2025-11-11  
**Reviewed By:** Cursor bot (code review)  
**Status:** ARCHIVED must remain in stuck monitor (CRITICAL)

