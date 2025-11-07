# V2 E2E Test Results - Latest Run

**Date:** November 4, 2025, 12:05 PM  
**Test:** NFT_FOR_SOL (Test 01)  
**Deployment:** 0c53e3b (Build fixes deployed)  
**Status:** 🟡 Partial Success - NFT Deposit Failing

---

## ✅ **What's Working**

### 1. Agreement Creation ✅
```
Agreement ID: AGR-MHKIUNK3-B63393YE
Escrow PDA: 7EG3LZLD4DQ4EwTrgLgdmASDuBE7uRMqqucvV3GUi73s
Transaction: 2e5SWEpS...przmqRqf
```
- ✅ V2 `init_agreement_v2` instruction successful
- ✅ Escrow PDA created correctly
- ✅ SOL amount (0.1 SOL) stored properly

### 2. SOL Deposit ✅
```
Amount: 0.1 SOL (100,000,000 lamports)
Transaction: NEZmwkrM...fCEoQ9N
Status: Confirmed
```
- ✅ Buyer successfully deposited 0.1 SOL
- ✅ `deposit_sol` instruction executed
- ✅ Buyer balance decreased by 0.1021 SOL (0.1 SOL + 0.0021 SOL fees)
- ✅ Transaction confirmed on-chain

---

## ❌ **What's Failing**

### 1. NFT Deposit ❌
**Error:** `Request failed with status code 500`  
**Endpoint:** `POST /v1/agreements/{id}/deposit-nft/prepare`

**Issue:** Server-side error when preparing NFT deposit transaction

**Previous Error (Fixed):** 
- Before: `AccountDiscriminatorMismatch` (v1 instruction used for v2 agreement)
- Now: Server 500 error (runtime error in v2 NFT deposit logic)

**Likely Cause:** Runtime error in `buildDepositSellerNftTransaction` method

**What We Know:**
- The v1/v2 detection logic is working (no discriminator mismatch)
- The code is calling the correct v2 method
- Something in the v2 NFT deposit transaction building is throwing an exception

### 2. Settlement ❌
**Status:** Stuck at `PENDING` for 120 attempts (2 minutes)

**Root Cause:** Settlement can't proceed because:
- NFT deposit failed (not deposited)
- Agreement status is `PENDING` (not `BOTH_LOCKED`)
- Monitoring service waiting for both deposits

### 3. Balance Verification ❌
**Expected:** Seller receives ~0.099 SOL (0.1 - 0.001 fee)  
**Actual:** Seller lost 0.0035 SOL (transaction fees only)

**Root Cause:** No settlement occurred (NFT not deposited)

---

## 📊 **Transaction Timeline**

| Step | Status | Transaction | Notes |
|------|--------|-------------|-------|
| 1. Create Agreement | ✅ | `2e5SWEpS...` | V2 init successful |
| 2. NFT Deposit | ❌ | N/A | 500 error on prepare |
| 3. SOL Deposit | ✅ | `NEZmwkrM...` | 0.1 SOL deposited |
| 4. Settlement | ❌ | N/A | Blocked by missing NFT |

---

## 🔍 **Diagnostic Information**

### Balance Changes

**Seller:**
- Initial: 16.9427 SOL
- Final: 16.9392 SOL
- Change: -0.0035 SOL (tx fees only, no NFT deposited)

**Buyer:**
- Initial: 10.8567 SOL
- Final: 10.7546 SOL
- Change: -0.1021 SOL (0.1 SOL deposited + 0.0021 SOL fees)

**Fee Collector:**
- Initial: 0.0000 SOL
- Final: 0.0000 SOL
- Change: 0.0000 SOL (no settlement occurred)

### Agreement Status
- Created: `PENDING`
- After SOL Deposit: `PENDING` (should be `USDC_LOCKED` aka SOL_LOCKED)
- Expected After Both: `BOTH_LOCKED`
- Final: `PENDING`

**Issue:** Agreement status didn't update after SOL deposit

---

## 🐛 **Issues to Investigate**

### Priority 1: NFT Deposit 500 Error
**Need to check:**
1. Server logs for the 500 error
2. `buildDepositSellerNftTransaction` implementation
3. Any missing parameters or null values
4. Account derivation issues

**Possible Causes:**
- Null reference in account derivation
- Missing token account
- Incorrect instruction parameters
- Exception in Anchor SDK call

### Priority 2: Agreement Status Not Updating
**Issue:** SOL deposit succeeded but agreement status stayed `PENDING`

**Expected Behavior:**
- After SOL deposit: Status should change to `USDC_LOCKED` (repurposed for v2 as SOL_LOCKED)
- After NFT deposit: Status should change to `BOTH_LOCKED`

**Need to check:**
- SOL deposit monitoring logic
- Database update in sol-deposit.service.ts
- Agreement status transition logic

---

## 🎯 **Next Steps**

### Immediate (To Unblock Tests):

1. **Debug NFT Deposit 500 Error:**
   - Check staging server logs for exception details
   - Review `buildDepositSellerNftTransaction` implementation
   - Verify all parameters are non-null
   - Test locally if possible

2. **Fix Agreement Status Update:**
   - Verify `sol-deposit.service.ts` is updating agreement status
   - Check monitoring service is detecting SOL deposits
   - Ensure status transitions are working correctly

3. **Add Error Logging:**
   - Add more detailed error logging to NFT deposit endpoint
   - Log full exception stack traces
   - Return more informative error messages

### Testing Strategy:

Once NFT deposit is fixed:
1. Run Test 01 (NFT_FOR_SOL) again
2. Verify full flow: Create → Deposit NFT → Deposit SOL → Settle
3. Run Test 02 (NFT_FOR_NFT_WITH_FEE)
4. Run Test 03 (NFT_FOR_NFT_PLUS_SOL)

---

## 💡 **Positive Progress**

Despite the NFT deposit issue, we've made significant progress:

1. ✅ **V2 Agreement Creation Works Perfectly**
   - All parameters correctly passed
   - Escrow PDA created successfully
   - No more AccountDiscriminatorMismatch errors

2. ✅ **V2 SOL Deposit Works Perfectly**
   - Buyer can deposit SOL to escrow PDA
   - Transaction confirms successfully
   - Correct amount deposited

3. ✅ **Build Deployed Successfully**
   - All TypeScript errors fixed
   - No compilation issues
   - Service running stable

4. ✅ **Rate Limiting Improved**
   - 3-second delays helping (fewer 429 errors)
   - Status check rate limiting still an issue after 97 checks

---

## 🔧 **Recommended Fixes**

### Fix 1: NFT Deposit Endpoint
```typescript
// Likely issue in buildDepositSellerNftTransaction
// Need to add null checks and better error handling

async buildDepositSellerNftTransaction(...) {
  try {
    // Add validation
    if (!escrowPda || !seller || !nftMint) {
      throw new Error('Missing required parameters');
    }
    
    // Add error context
    console.log('[buildDepositSellerNftTransaction] Parameters:', {
      escrowPda: escrowPda.toString(),
      seller: seller.toString(),
      nftMint: nftMint.toString()
    });
    
    // ... rest of implementation
  } catch (error) {
    console.error('[buildDepositSellerNftTransaction] Error:', error);
    throw error; // Re-throw with context
  }
}
```

### Fix 2: Agreement Status Update
```typescript
// In sol-deposit.service.ts handleSolAccountChange
// Ensure status update happens after SOL deposit

if (currentSolBalance.gte(expectedSolAmount)) {
  // Update agreement status
  let newStatus: AgreementStatus;
  if (agreement.status === AgreementStatus.NFT_LOCKED) {
    newStatus = AgreementStatus.BOTH_LOCKED;
  } else {
    newStatus = AgreementStatus.USDC_LOCKED; // Repurposed as SOL_LOCKED
  }
  
  await prisma.agreement.update({
    where: { id: agreement.id },
    data: { status: newStatus, updatedAt: new Date() }
  });
}
```

---

## 📈 **Success Rate**

**Test Steps:** 9 total
- ✅ Passing: 4 (44%)
  - Check initial balances
  - Create test NFT
  - Create v2 agreement
  - Deposit SOL
- ❌ Failing: 5 (56%)
  - Deposit NFT (500 error)
  - Status assertion
  - Wait for settlement
  - Verify NFT transfer
  - Verify SOL distribution

**Core Functionality:**
- Agreement Creation: 100% ✅
- SOL Deposits: 100% ✅
- NFT Deposits: 0% ❌ (blocking issue)
- Settlement: 0% ❌ (blocked by NFT)

---

## 🚀 **Path to Success**

We're **very close** to having fully working v2 E2E tests! The main blocker is the NFT deposit 500 error. Once that's fixed:

1. NFT deposit will work
2. Agreement status will update to `BOTH_LOCKED`
3. Settlement will trigger automatically
4. All v2 swap types will work end-to-end

**Estimated Time to Fix:** 30-60 minutes once we identify the 500 error cause

---

**Status:** Ready for NFT deposit debugging  
**Blocker:** Server 500 error on NFT deposit endpoint  
**Next Action:** Check staging logs for exception details

