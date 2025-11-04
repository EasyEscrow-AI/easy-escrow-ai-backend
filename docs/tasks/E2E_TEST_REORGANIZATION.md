# E2E Test Reorganization - V2 as Primary

**Date:** November 4, 2025  
**Branch:** `staging`  
**Status:** ✅ Complete

---

## Summary

Reorganized staging E2E tests to prioritize v2 (SOL-based) swaps as the primary implementation, while preserving v1 tests that need to be updated for v2 support.

---

## 📁 New Test Structure

### **Primary V2 Tests (01-03)** ⭐

| # | Test File | Swap Type | Status |
|---|-----------|-----------|--------|
| 01 | `01-v2-nft-for-sol-happy-path.test.ts` | NFT_FOR_SOL | ✅ Ready |
| 02 | `02-v2-nft-for-nft-with-fee.test.ts` | NFT_FOR_NFT_WITH_FEE | ✅ Ready |
| 03 | `03-v2-nft-for-nft-plus-sol.test.ts` | NFT_FOR_NFT_PLUS_SOL | ✅ Ready |

**Description:** Comprehensive v2 happy path tests for all three SOL-based swap types.

---

### **V1 Tests to Update for V2 (04-09)** 🔄

| # | Test File | Category | Update Needed |
|---|-----------|----------|---------------|
| 04 | `04-agreement-expiry-refund.test.ts` | Expiry/Refund | Add v2 support |
| 05 | `05-admin-cancellation.test.ts` | Admin Operations | Add v2 support |
| 06 | `06-zero-fee-transactions.test.ts` | Fee Edge Cases | Add v2 support |
| 07 | `07-idempotency-handling.test.ts` | Idempotency | Add v2 support |
| 08 | `08-concurrent-operations.test.ts` | Concurrency | Add v2 support |
| 09 | `09-edge-cases-validation.test.ts` | Edge Cases | Add v2 support |

**Description:** Tests originally written for v1 (USDC) that need to be updated to work with v2 (SOL).

---

## 🗑️ Deleted Tests

| Test File | Reason |
|-----------|--------|
| `01-solana-nft-usdc-happy-path.test.ts` | Legacy v1 USDC happy path - replaced by v2 SOL-based tests |

---

## 📦 NPM Scripts Updated

### V2 Test Scripts (Updated Paths)

```json
"test:staging:e2e:v2-nft-sol": "...01-v2-nft-for-sol-happy-path.test.ts",
"test:staging:e2e:v2-nft-nft-fee": "...02-v2-nft-for-nft-with-fee.test.ts",
"test:staging:e2e:v2-nft-nft-sol": "...03-v2-nft-for-nft-plus-sol.test.ts",
"test:staging:e2e:v2-all": "...'01-*.test.ts' '02-*.test.ts' '03-*.test.ts'"
```

### Legacy Test Scripts (Updated Numbers)

```json
"test:staging:e2e:04-agreement-expiry-refund": "...04-agreement-expiry-refund.test.ts",
"test:staging:e2e:05-admin-cancellation": "...05-admin-cancellation.test.ts",
"test:staging:e2e:06-zero-fee-transactions": "...06-zero-fee-transactions.test.ts",
"test:staging:e2e:07-idempotency-handling": "...07-idempotency-handling.test.ts",
"test:staging:e2e:08-concurrent-operations": "...08-concurrent-operations.test.ts",
"test:staging:e2e:09-edge-cases-validation": "...09-edge-cases-validation.test.ts"
```

### Removed Scripts

```json
// ❌ Removed (deleted test file)
"test:staging:e2e:01-solana-nft-usdc-happy-path"
"test:staging:e2e:01-solana-nft-usdc-happy-path:verbose"
```

---

## 📊 File Renames Summary

### V2 Tests (08-10 → 01-03)

```
08-v2-nft-for-sol-happy-path.test.ts       → 01-v2-nft-for-sol-happy-path.test.ts
09-v2-nft-for-nft-with-fee.test.ts         → 02-v2-nft-for-nft-with-fee.test.ts
10-v2-nft-for-nft-plus-sol.test.ts         → 03-v2-nft-for-nft-plus-sol.test.ts
```

### Legacy Tests (02-07 → 04-09)

```
02-agreement-expiry-refund.test.ts         → 04-agreement-expiry-refund.test.ts
03-admin-cancellation.test.ts              → 05-admin-cancellation.test.ts
04-zero-fee-transactions.test.ts           → 06-zero-fee-transactions.test.ts
05-idempotency-handling.test.ts            → 07-idempotency-handling.test.ts
06-concurrent-operations.test.ts           → 08-concurrent-operations.test.ts
07-edge-cases-validation.test.ts           → 09-edge-cases-validation.test.ts
```

---

## ✅ Benefits of Reorganization

1. **Clear Priority:** V2 tests (01-03) are clearly the primary, current implementation
2. **Logical Numbering:** Happy paths first (01-03), edge cases follow (04-09)
3. **Easy to Run:** `npm run test:staging:e2e:v2-all` runs all primary v2 tests
4. **Future-Ready:** Space for adding more v2 tests (10+) as needed
5. **Preserved History:** Git mv preserves commit history for all renamed files
6. **Legacy Tests Kept:** Tests 04-09 preserved for future v2 updates

---

## 🎯 Next Steps for Legacy Tests (04-09)

Each legacy test (04-09) needs to be updated to support v2:

### Updates Required:

1. **Swap Type Selection:**
   - Test with `NFT_FOR_SOL`, `NFT_FOR_NFT_WITH_FEE`, or `NFT_FOR_NFT_PLUS_SOL`
   - Remove USDC-related code

2. **Agreement Creation:**
   - Use `solAmount` instead of `price`
   - Include `swapType` and `feePayer` fields
   - Remove `usdcMint` parameter

3. **Deposit Endpoints:**
   - Use `/deposit-sol/prepare` instead of `/deposit-usdc/prepare`
   - Use v2 NFT deposit instruction (`deposit_seller_nft`)

4. **Settlement Verification:**
   - Verify SOL distribution instead of USDC
   - Check platform fee in SOL
   - Verify correct `feePayer` (buyer vs seller)

5. **State Transitions:**
   - Use `USDC_LOCKED` as "SOL_LOCKED" (field repurposed for v2)
   - Verify `BOTH_LOCKED` → `SETTLED` flow

### Priority Order:

1. **High Priority:** Agreement expiry and admin cancellation (04-05)
2. **Medium Priority:** Idempotency and concurrent operations (07-08)
3. **Low Priority:** Zero-fee transactions and edge cases (06, 09)

---

## 📝 Running Tests

### Run All V2 Tests:
```bash
npm run test:staging:e2e:v2-all
```

### Run Individual V2 Tests:
```bash
npm run test:staging:e2e:v2-nft-sol        # Test 01
npm run test:staging:e2e:v2-nft-nft-fee    # Test 02
npm run test:staging:e2e:v2-nft-nft-sol    # Test 03
```

### Run Legacy Tests (for v1/v2 comparison):
```bash
npm run test:staging:e2e:04-agreement-expiry-refund
npm run test:staging:e2e:05-admin-cancellation
# etc.
```

---

## 🔗 Related Documentation

- **V2 E2E Progress:** `docs/tasks/V2_E2E_TESTS_PROGRESS.md`
- **V2 E2E Test Creation:** `docs/tasks/V2_E2E_TESTS_COMPLETE.md`
- **Phase 3 Completion:** `docs/tasks/PHASE_3_COMPLETION_SUMMARY.md`

---

## 📌 Key Commits

- `4af3463`: refactor(e2e): Reorganize E2E tests - v2 tests as primary (01-03)
- `31d8a1b`: test(e2e): Add rate limit delays to all v2 E2E tests
- `7500c62`: test(e2e): Reduce SOL amounts to conserve devnet balance
- `b009914`: feat(v2): Add v2 NFT deposit support with automatic v1/v2 detection

---

**Status:** ✅ Reorganization Complete  
**V2 Tests:** Ready to run (pending rate limit resolution)  
**Legacy Tests:** Preserved for future v2 updates

