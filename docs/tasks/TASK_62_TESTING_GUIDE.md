# Task 62: Staging Testing Guide

**Environment:** Staging (https://staging-api.easyescrow.ai)  
**Test Page:** https://staging-api.easyescrow.ai/test  
**Date:** 2025-12-15

---

## Pre-Testing Checklist

### ✅ Environment Verification
- [x] Staging backend is healthy
- [x] 18 test cNFTs available (9 maker, 9 taker)
- [ ] PR #421 (InvalidTokenAccount fix) merged and deployed to staging
- [ ] Core NFT minting script ready (requires mpl-core SDK)

### Test Wallets
- **Maker:** `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z` (9 cNFTs)
- **Taker:** `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4` (9 cNFTs)

---

## Testing Instructions

### Step 1: Access Test Page
1. Navigate to: **https://staging-api.easyescrow.ai/test**
2. Verify page loads and shows wallet addresses
3. Click "Load Wallet Info" for both Maker and Taker
4. Verify cNFTs are displayed

### Step 2: Test Single cNFT Swaps

#### Test 2.1: cNFT → SOL (0.1 SOL)
1. **Maker Side:**
   - Select 1 cNFT from maker wallet
   - Leave SOL amount empty
2. **Taker Side:**
   - Leave NFTs empty
   - Enter SOL: `0.1`
3. Click "Get Quote"
4. Verify quote shows correct fees
5. Click "Execute Swap"
6. **Expected:** Swap succeeds, cNFT transfers to taker, SOL transfers to maker
7. **Record Result:** ✅ PASS / ❌ FAIL

#### Test 2.2: cNFT → SOL (0.5 SOL)
- Repeat Test 2.1 with 0.5 SOL

#### Test 2.3: cNFT → SOL (1.0 SOL)
- Repeat Test 2.1 with 1.0 SOL

#### Test 2.4: SOL → cNFT (0.1 SOL)
1. **Maker Side:**
   - Leave NFTs empty
   - Enter SOL: `0.1`
2. **Taker Side:**
   - Select 1 cNFT from taker wallet
   - Leave SOL empty
3. Execute swap
4. **Record Result:** ✅ PASS / ❌ FAIL

#### Test 2.5: cNFT ↔ cNFT
1. **Maker Side:** Select 1 cNFT
2. **Taker Side:** Select 1 cNFT
3. Execute swap
4. **Record Result:** ✅ PASS / ❌ FAIL

---

### Step 3: Test SPL NFT Swaps (InvalidTokenAccount Fix Validation)

#### Test 3.1: SPL NFT ↔ SOL
1. **Maker Side:**
   - Select 1 SPL NFT
   - Leave SOL empty
2. **Taker Side:**
   - Leave NFTs empty
   - Enter SOL: `0.1`
3. Click "Get Quote"
4. **If PR #421 is deployed:** Should get quote successfully
5. **If PR #421 NOT deployed:** May see InvalidTokenAccount error (0x1777)
6. Execute swap
7. **Record Result:** ✅ PASS / ❌ FAIL (with error details)

#### Test 3.2: SPL NFT+SOL ↔ NFT
1. **Maker Side:**
   - Select 1 SPL NFT
   - Enter SOL: `0.1`
2. **Taker Side:**
   - Select 1 SPL NFT
   - Leave SOL empty
3. Execute swap
4. **Record Result:** ✅ PASS / ❌ FAIL (with error details)

---

### Step 4: Test Bulk Swaps (Up to 4 NFTs Total)

#### Test 4.1: 2-Asset Bulk Swap (SPL + cNFT)
1. **Maker Side:**
   - Select 1 SPL NFT
   - Select 1 cNFT
2. **Taker Side:**
   - Select 1 SPL NFT
   - Select 1 cNFT
3. Execute swap
4. Verify transaction group is created (2-4 transactions)
5. Verify Jito bundle submission (if 5+ total cNFTs)
6. **Record Result:** ✅ PASS / ❌ FAIL

#### Test 4.2: 3-Asset Bulk Swap (SPL + Core + cNFT)
1. **Maker Side:**
   - Select 1 SPL NFT
   - Select 1 Core NFT (if available)
   - Select 1 cNFT
2. **Taker Side:**
   - Select 1 SPL NFT
   - Select 1 Core NFT (if available)
   - Select 1 cNFT
3. Execute swap
4. **Record Result:** ✅ PASS / ❌ FAIL

#### Test 4.3: 4-Asset Bulk Swap (Maximum)
1. **Maker Side:**
   - Select 2 assets (any combination)
2. **Taker Side:**
   - Select 2 assets (any combination)
3. Execute swap
4. **Record Result:** ✅ PASS / ❌ FAIL

---

### Step 5: Test Mixed Asset Swaps

#### Test 5.1: Asymmetric Swap (3 vs 1)
1. **Maker Side:**
   - Select 1 SPL + 1 Core + 1 cNFT
2. **Taker Side:**
   - Select 1 cNFT
3. Execute swap
4. **Record Result:** ✅ PASS / ❌ FAIL

---

### Step 6: Test Enhanced Offer Management

#### Test 6.1: Private Sale
1. Create offer with specific taker wallet restriction
2. Try to accept with unauthorized wallet
3. **Expected:** Rejection
4. Accept with authorized wallet
5. **Expected:** Success
6. **Record Result:** ✅ PASS / ❌ FAIL

#### Test 6.2: Counter-Offer
1. Create initial offer
2. Create counter-offer with modified assets
3. Accept counter-offer
4. **Record Result:** ✅ PASS / ❌ FAIL

#### Test 6.3: Offer Cancellation
1. Create offer
2. Cancel offer
3. Verify cleanup
4. **Record Result:** ✅ PASS / ❌ FAIL

#### Test 6.4: Offer Update
1. Create offer
2. Update offer (add/remove assets, change price)
3. Accept updated offer
4. **Record Result:** ✅ PASS / ❌ FAIL

---

### Step 7: Test Error Handling

#### Test 7.1: InvalidTokenAccount Prevention (PR #421)
1. Attempt swap with non-existent token account
2. **Expected:** Clear error message before Rust program execution
3. **Record Result:** ✅ PASS / ❌ FAIL

#### Test 7.2: Bundle Failure Recovery
1. Create bulk swap that triggers Jito bundle
2. Monitor bundle status
3. Test retry mechanism if bundle fails
4. **Record Result:** ✅ PASS / ❌ FAIL

---

### Step 8: Test Core NFTs (If Available)

#### Test 8.1: Core NFT Minting
1. Run Core NFT minting script (if mpl-core SDK installed)
2. Mint 3-5 Core NFTs to maker wallet
3. Mint 3-5 Core NFTs to taker wallet
4. **Record Result:** ✅ PASS / ❌ FAIL

#### Test 8.2: Core NFT Swaps
1. Test Core NFT ↔ SOL
2. Test Core NFT ↔ Core NFT
3. Test Core NFT in bulk swaps
4. **Record Result:** ✅ PASS / ❌ FAIL

---

## Results Template

For each test, record:

```markdown
### Test X.X: [Test Name]
- **Date/Time:** 
- **Result:** ✅ PASS / ❌ FAIL
- **Transaction Signature:** (if successful)
- **Error Message:** (if failed)
- **Notes:**
```

---

## Critical Issues to Watch For

1. **InvalidTokenAccount Error (0x1777):** Should be caught by validation layer if PR #421 is deployed
2. **Stale Proof Errors:** Should auto-refresh
3. **Bundle Failures:** Should retry automatically
4. **Transaction Size Limits:** Should split into multiple transactions
5. **Performance:** Single swaps <15s, bulk swaps <45s

---

## Next Steps After Testing

1. Document all results in `TASK_62_STAGING_TEST_RESULTS.md`
2. Fix any critical issues found
3. Re-test fixed issues
4. Mark Task 62 as complete when >95% pass rate achieved
5. Proceed to Task 63 (Master Sync)

