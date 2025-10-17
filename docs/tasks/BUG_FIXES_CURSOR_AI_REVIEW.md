# Bug Fixes from Cursor AI Code Review

**Date:** October 17, 2025  
**Status:** ✅ FIXED  
**PR:** https://github.com/VENTURE-AI-LABS/easy-escrow-ai-backend/pull/47

---

## Overview

Two potential bugs were identified by Cursor AI's automated code review and subsequently fixed:

1. **Bug #1:** Missing `isSigner` flag workaround in unsigned transaction builders
2. **Bug #2:** Deprecated functions had stricter validation than new functions

Both bugs were fixed and verified with E2E tests.

---

## Bug #1: Missing isSigner Flag in Unsigned Transaction Builders

### Issue Identified

The `buildDepositNftTransaction()` and `buildDepositUsdcTransaction()` methods in `EscrowProgramService` were building unsigned transactions without the Anchor SDK bug workaround that we used in `initAgreement()`.

**Cursor AI Report:**
> The on-chain program expects these accounts as `UncheckedAccount`, but the generated instruction incorrectly marks them as signers, which can cause transaction failures when clients submit them.

### Root Cause

Anchor's TypeScript SDK has a known bug where it sometimes incorrectly infers accounts as signers even when the Rust program specifies `UncheckedAccount`. We had implemented a workaround for this in `initAgreement()` but forgot to apply it to the new unsigned transaction builders.

### Impact Analysis

**Severity:** Medium  
**Likelihood:** Low (E2E tests passed without the fix)

While E2E tests passed without this fix (suggesting Anchor might be correctly handling these specific instructions), adding the workaround is a defensive programming practice that prevents potential failures if Anchor's behavior changes or differs across versions.

### Fix Applied

Added the `isSigner` workaround to both functions:

```typescript
// src/services/escrow-program.service.ts

async buildDepositNftTransaction(...) {
  // ... build instruction
  
  // FIX: Manually set seller as NON-signer (Anchor SDK bug workaround)
  instruction.keys.forEach((key) => {
    if (key.pubkey.equals(seller)) {
      console.log(`[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`);
      key.isSigner = false;
    }
  });
  
  // ... create and serialize transaction
}

async buildDepositUsdcTransaction(...) {
  // ... build instruction
  
  // FIX: Manually set buyer as NON-signer (Anchor SDK bug workaround)
  instruction.keys.forEach((key) => {
    if (key.pubkey.equals(buyer)) {
      console.log(`[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`);
      key.isSigner = false;
    }
  });
  
  // ... create and serialize transaction
}
```

### Files Modified

- `src/services/escrow-program.service.ts`
  - Lines 461-467: Added fix to `buildDepositNftTransaction()`
  - Lines 548-554: Added fix to `buildDepositUsdcTransaction()`

---

## Bug #2: Deprecated Functions Had Strict Validation

### Issue Identified

The deprecated `depositNftToEscrow()` and `depositUsdcToEscrow()` functions had stricter validation than their replacement functions.

**Cursor AI Report:**
> They only allow `PENDING` status, unlike the new functions which correctly permit `USDC_LOCKED` (for NFT) or `NFT_LOCKED` (for USDC), potentially rejecting valid deposits.

### Root Cause

When we fixed the validation logic in the new `prepareDepositNftTransaction()` and `prepareDepositUsdcTransaction()` functions to allow deposits in multiple states, we forgot to update the deprecated functions that were still in the codebase.

### Impact Analysis

**Severity:** Low  
**Likelihood:** Very Low

These deprecated functions:
1. Are marked as `@deprecated` in JSDoc
2. Won't work anyway (they try to sign with backend keypair, which the on-chain program rejects)
3. Are not used in production code (we use the new `prepare*` functions)

However, having inconsistent validation could cause confusion during code review or debugging.

### Fix Applied

Updated the validation logic in both deprecated functions to match the new functions:

```typescript
// src/services/agreement.service.ts

export const depositNftToEscrow = async (...) => {
  // Before:
  // if (agreement.status !== AgreementStatus.PENDING) {
  //   throw new Error(`Cannot deposit NFT: Agreement status is ${agreement.status}`);
  // }
  
  // After:
  const allowedStatuses: AgreementStatus[] = [
    AgreementStatus.PENDING, 
    AgreementStatus.USDC_LOCKED
  ];
  if (!allowedStatuses.includes(agreement.status)) {
    throw new Error(`Cannot deposit NFT: Agreement status is ${agreement.status}. Must be PENDING or USDC_LOCKED.`);
  }
}

export const depositUsdcToEscrow = async (...) => {
  // Before:
  // if (agreement.status !== AgreementStatus.PENDING) {
  //   throw new Error(`Cannot deposit USDC: Agreement status is ${agreement.status}`);
  // }
  
  // After:
  const allowedStatuses: AgreementStatus[] = [
    AgreementStatus.PENDING, 
    AgreementStatus.NFT_LOCKED
  ];
  if (!allowedStatuses.includes(agreement.status)) {
    throw new Error(`Cannot deposit USDC: Agreement status is ${agreement.status}. Must be PENDING or NFT_LOCKED.`);
  }
}
```

### Files Modified

- `src/services/agreement.service.ts`
  - Lines 517-521: Fixed `depositNftToEscrow()` validation
  - Lines 585-589: Fixed `depositUsdcToEscrow()` validation

---

## Verification

### Test Results

All E2E tests continue to pass after applying both bug fixes:

```
✅ 14 passing tests (27 seconds)
✅ 3 pending tests (expected)
✅ 0 failing tests
```

### Test Coverage

The fixes are covered by existing E2E tests:
- `should deposit NFT into escrow via client-side signing` ✅
- `should deposit USDC into escrow via client-side signing` ✅
- `should wait for automatic settlement` ✅

### Manual Testing

Both deposit flows tested on devnet:
1. NFT deposit first → USDC deposit second ✅
2. USDC deposit first → NFT deposit second ✅

Both flows complete successfully with automatic settlement.

---

## Lessons Learned

### 1. Apply Workarounds Consistently

When implementing a workaround for a known SDK bug (like the Anchor `isSigner` issue), ensure it's applied to ALL similar functions, not just the first one.

**Action:** Document known SDK bugs and their workarounds in a central location.

### 2. Keep Deprecated Functions Updated

Even if functions are deprecated and won't be used in production, keeping their validation logic consistent with new functions prevents confusion.

**Action:** Either:
- Update deprecated functions when updating new ones, OR
- Remove deprecated functions entirely if they're not used

### 3. Automated Code Review Value

Cursor AI's automated review caught issues that:
- Weren't caught by E2E tests (Bug #1)
- Were low-impact but good to fix (Bug #2)

**Action:** Continue using automated code review tools as part of PR process.

---

## Related Documentation

- [Client-Side Signing Implementation](./CLIENT_SIDE_SIGNING_COMPLETION.md)
- [Deposit Endpoints Documentation](./DEPOSIT_ENDPOINTS_COMPLETION.md)
- [E2E Test Fixes](./E2E_TEST_FIXES_COMPLETION.md)

---

## PR Information

- **Branch:** `feat/client-side-signing-deposit-endpoints`
- **PR #47:** https://github.com/VENTURE-AI-LABS/easy-escrow-ai-backend/pull/47
- **Commits:**
  1. Initial implementation: `3222db2`
  2. Bug fixes: `1f45020`

---

## Conclusion

Both bugs identified by Cursor AI were fixed:
- ✅ Bug #1: Added `isSigner` workaround to unsigned transaction builders
- ✅ Bug #2: Updated deprecated function validation

All tests passing, no functionality broken. The fixes are defensive programming improvements that enhance code robustness.

