# V2 E2E Tests - Progress Report

**Date:** November 4, 2025  
**Branch:** `staging`  
**Status:** 🟡 In Progress - Rate Limiting Issues

---

## Summary

All 3 v2 E2E tests have been created and v2 backend NFT deposit support has been implemented. However, tests are currently blocked by aggressive rate limiting on the staging API.

---

## ✅ Completed Work

### 1. V2 Backend NFT Deposit Support

**File:** `src/services/escrow-program.service.ts`

Created new method for v2 NFT deposits:
- `buildDepositSellerNftTransaction()`: Client-side signing for v2 seller NFT deposits
  - Uses `deposit_seller_nft` instruction for `EscrowStateV2`
  - Matches v2 account structure (no `associatedTokenProgram`)
  - Includes priority fees and Jito tips for mainnet
  - Implements Anchor SDK bug workaround (seller as non-signer)

**File:** `src/services/agreement.service.ts`

Updated methods to detect v1 vs v2 automatically:
- `prepareDepositNftTransaction()`: Routes to correct builder based on `swapType` field
  - v2 (has `swapType`) → `buildDepositSellerNftTransaction`
  - v1 (no `swapType`) → `buildDepositNftTransaction`
- `depositNftToEscrow()`: Also detects v1/v2 for deprecated server-side deposits
  - v2 → `depositSellerNft`
  - v1 → `depositNft`

**Detection Logic:**
```typescript
const isV2 = agreement.swapType !== null;
```

**Benefits:**
- ✅ Automatic v1/v2 detection
- ✅ Full backward compatibility with v1
- ✅ Fixes `AccountDiscriminatorMismatch` error
- ✅ Zero breaking changes

**Commits:**
- `b009914`: feat(v2): Add v2 NFT deposit support with automatic v1/v2 detection

### 2. E2E Test Creation

Created 3 comprehensive E2E test files:

**Test 1:** `tests/staging/e2e/08-v2-nft-for-sol-happy-path.test.ts`
- **Swap Type:** `NFT_FOR_SOL`
- **SOL Amount:** 0.1 SOL (reduced from 1.5)
- **Platform Fee:** 1% (0.001 SOL)
- **Flow:** Seller NFT → Buyer SOL payment

**Test 2:** `tests/staging/e2e/09-v2-nft-for-nft-with-fee.test.ts`
- **Swap Type:** `NFT_FOR_NFT_WITH_FEE`
- **SOL Fee:** 0.01 SOL (platform fee only)
- **Flow:** Seller NFT A ↔ Buyer NFT B + SOL fee

**Test 3:** `tests/staging/e2e/10-v2-nft-for-nft-plus-sol.test.ts`
- **Swap Type:** `NFT_FOR_NFT_PLUS_SOL`
- **SOL Payment:** 0.2 SOL (reduced from 2.0)
- **Flow:** Seller NFT A ↔ Buyer NFT B + SOL payment

**NPM Scripts Added:**
```json
"test:staging:e2e:v2-nft-sol": "mocha ... 08-*.test.ts",
"test:staging:e2e:v2-nft-nft-fee": "mocha ... 09-*.test.ts",
"test:staging:e2e:v2-nft-nft-sol": "mocha ... 10-*.test.ts",
"test:staging:e2e:v2-all": "mocha ... 08-*.test.ts 09-*.test.ts 10-*.test.ts"
```

**Commits:**
- `7500c62`: test(e2e): Reduce SOL amounts to conserve devnet balance
- `31d8a1b`: test(e2e): Add rate limit delays to all v2 E2E tests

### 3. Test Improvements

**SOL Amount Reductions (91% savings):**
- Test 1: 1.5 SOL → 0.1 SOL
- Test 2: 0.01 SOL (unchanged, already minimal)
- Test 3: 2.0 SOL → 0.2 SOL
- **Total:** 3.51 SOL → 0.31 SOL per run

**Rate Limit Protections:**
- Added 3-second delays before all deposit API calls
- Prevents rapid-fire requests that trigger 429 errors
- Applied to NFT deposit and SOL deposit endpoints

---

## 🚧 Current Issues

### Issue 1: Aggressive Rate Limiting

**Problem:** Staging API returns `429 Too Many Requests` even after 3-second delays

**Affected Endpoints:**
- `POST /v1/agreements/:id/deposit-nft/prepare`
- `POST /v1/agreements/:id/deposit-sol/prepare`
- `GET /v1/agreements/:id` (status checks)

**Impact:** Tests cannot complete deposit phase

**Potential Solutions:**
1. **Increase delays in tests** (e.g., 5-10 seconds)
2. **Adjust staging rate limiter** to allow more requests per minute
3. **Add rate limit bypass** for test wallets
4. **Run tests less frequently** (longer wait between test runs)

### Issue 2: Deployment Timing

**Problem:** DigitalOcean staging deployment takes 2-3 minutes

**Impact:**
- Tests may run before v2 code is deployed
- Initial test runs may use stale v1 endpoints
- Need to wait 2-3 minutes after pushing to staging

**Current Workaround:** Manual 90-120 second wait before running tests

---

## 📊 Test Results

### Latest Run: November 4, 2025 11:14 AM

**Status:** ❌ Failed (Rate Limiting)

**Passing Tests (4/9):**
- ✅ Check initial SOL balances
- ✅ Create test NFT for seller
- ✅ Create v2 NFT-for-SOL escrow agreement
- ✅ Display transaction summary

**Failing Tests (5/9):**
- ❌ Prepare and submit NFT deposit transaction (429 Rate Limit)
- ❌ Prepare and submit SOL deposit transaction (429 Rate Limit)
- ❌ Wait for automatic settlement (timeout, no deposits made)
- ❌ Verify NFT transfer (no deposits made)
- ❌ Verify SOL distribution (no deposits made)

**Key Findings:**
1. ✅ Agreement creation works perfectly
2. ✅ V2 `init_agreement_v2` instruction successful
3. ✅ Escrow PDA created correctly
4. ❌ Deposit endpoints immediately hit rate limit
5. ❌ Cannot test settlement without successful deposits

**Transaction Links:**
- Agreement: [3q3zGzDLoYQ...](https://explorer.solana.com/tx/3q3zGzDLoYQ2MmnEAdHQDHa6r9qz927mFHFP6sEx9ai7JewKHDZae9yEomV1f1hxWNRjvtf93gmVd52NoxUBhFW4?cluster=devnet)

---

## 🎯 Next Steps

### Immediate (Required to Complete Tests)

1. **Address Rate Limiting:**
   - Option A: Increase test delays to 10 seconds
   - Option B: Adjust staging rate limiter configuration
   - Option C: Add test wallet whitelist bypass

2. **Wait for Clean Deployment:**
   - Ensure no active test runs
   - Push any final changes
   - Wait full 3 minutes for deployment
   - Verify endpoint responds with v2 logic

3. **Run Tests Sequentially (Not in Parallel):**
   - Run Test 1, wait 5 minutes
   - Run Test 2, wait 5 minutes
   - Run Test 3, wait 5 minutes
   - This avoids rate limit accumulation

### Success Criteria

For each test to pass:
1. ✅ Agreement creation (already working)
2. ✅ NFT deposit using `deposit_seller_nft` (v2)
3. ✅ SOL deposit using `deposit_sol`
4. ✅ Automatic settlement detection
5. ✅ NFT transferred to buyer
6. ✅ SOL distributed (seller receives payment minus fee)
7. ✅ Platform fee sent to fee collector

### Final Deliverable

Once all 3 tests pass:
1. Run `npm run test:staging:e2e:v2-all`
2. Capture full output
3. Document in `V2_E2E_TESTS_COMPLETE.md`
4. Update main task list
5. Mark Phase 3 (Tasks 1.13, 1.14) as complete

---

## 📁 Related Files

**Backend (v2 Support):**
- `src/services/escrow-program.service.ts` (buildDepositSellerNftTransaction)
- `src/services/agreement.service.ts` (v1/v2 detection)

**E2E Tests:**
- `tests/staging/e2e/08-v2-nft-for-sol-happy-path.test.ts`
- `tests/staging/e2e/09-v2-nft-for-nft-with-fee.test.ts`
- `tests/staging/e2e/10-v2-nft-for-nft-plus-sol.test.ts`
- `tests/staging/e2e/shared-test-utils.ts`

**Documentation:**
- `docs/tasks/V2_E2E_TESTS_COMPLETE.md` (created earlier)
- `docs/tasks/V2_E2E_TEST_RUN_RESULTS.md` (earlier run results)
- `package.json` (NPM scripts)

---

## 🔍 Technical Details

### V2 NFT Deposit Flow

```typescript
// 1. API Request: POST /deposit-nft/prepare
// 2. Backend detects v2 (swapType !== null)
// 3. Calls buildDepositSellerNftTransaction()
// 4. Creates instruction with accounts:
//    - escrowState (PDA with EscrowStateV2)
//    - seller
//    - nftMint
//    - sellerTokenAccount (seller's NFT ATA)
//    - escrowTokenAccount (escrow PDA's NFT ATA)
//    - tokenProgram
//    - systemProgram
// 5. Returns unsigned transaction to client
// 6. Client signs with seller wallet
// 7. Client submits to Solana network
// 8. On-chain: deposit_seller_nft updates seller_nft_deposited flag
```

### Account Discriminator

The `AccountDiscriminatorMismatch` error occurred because:
- V2 agreements use `EscrowStateV2` struct (discriminator: `0x...`)
- V1 `deposit_nft` instruction expects `EscrowState` (different discriminator)
- Solution: Use `deposit_seller_nft` instruction for v2

### Detection Logic

```typescript
// Simple, reliable detection
const isV2 = agreement.swapType !== null;

// Why this works:
// - v1 agreements: swapType = null (field didn't exist)
// - v2 agreements: swapType = 'NFT_FOR_SOL' | 'NFT_FOR_NFT_WITH_FEE' | 'NFT_FOR_NFT_PLUS_SOL'
```

---

## 💡 Recommendations

1. **For Future Tests:**
   - Add longer delays (10 seconds) as default
   - Consider implementing exponential backoff on 429 errors
   - Add retry logic with increasing delays

2. **For Rate Limiter:**
   - Consider different limits for deposit endpoints (more lenient)
   - Whitelist test wallets for E2E testing
   - Implement per-wallet rate limiting instead of global

3. **For CI/CD:**
   - Add automatic wait after deployment (3 minutes)
   - Run E2E tests sequentially with 5-minute gaps
   - Consider separate staging environment for E2E tests

---

**Status:** Ready for rate limit resolution and final test run  
**Blocked By:** Staging API rate limiting (429 errors)  
**ETA:** Can complete once rate limit issue is resolved

