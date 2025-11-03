# Post-Mortem: Why Staging Didn't Catch Error 3007

**Date:** November 3, 2025  
**Incident:** Error 3007 in Production  
**Root Cause:** Testing gap in staging validation

---

## Timeline

1. **BETA Limits Deployed to Staging** ✅
2. **Staging Tests Run** ✅ (7/7 passed)
3. **Deployed to Production** ✅
4. **Production Tests Run** ✅ (8/8 passed)
5. **User Hit Error 3007** ❌

---

## What Went Wrong?

### The Staging Tests Were Flawed

Our staging test file (`temp/test-beta-limits-3000.ts`) used:

```typescript
nftMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Line 34
```

**This is a WALLET ADDRESS, not an NFT mint!**

### Why The Tests "Passed"

The staging tests checked:
- ✅ **Price validation** (min/max amounts)
- ❌ **NFT mint validation** (account ownership)

**Test Logic:**
```typescript
// Test checked: Did API return 201?
const success = response.status === 201;
const matches = success === test.expectedToPass;

if (matches) {
  console.log(`✅ PASS: ${test.name}`);  // This happened!
}
```

**What Actually Happened:**
1. API accepted wallet address as NFT mint
2. Backend created agreement record in database
3. Returned 201 status code
4. Test saw 201 → marked as PASS ✅
5. **But nobody tried to actually use the agreement!**

---

## The Critical Gap

### What We Tested ✅
- Price validation (amounts between $1-$3,000)
- API response codes (201 vs 400)
- Database record creation

### What We DIDN'T Test ❌
- **NFT mint account ownership** (Token Program vs System Program)
- **NFT mint account structure** (82-byte mint format)
- **Full escrow lifecycle** (init → deposit → settle)
- **On-chain transaction execution**

---

## How Error 3007 Slipped Through

### Staging Environment
```
User Request → API Validation → Database → 201 Response
                    ↓
              Only checked price!
              Didn't check NFT mint ownership!
```

**Result:** Tests passed ✅ (but with invalid data)

### Production Environment
```
User Request → API Validation → Database → 201 Response
                                    ↓
              User tries to deposit NFT
                                    ↓
          On-chain transaction created
                                    ↓
              ❌ Error 3007: AccountOwnedByWrongProgram
```

**Result:** Transaction failed on-chain ❌

---

## Types of Testing Gaps

### 1. **Validation Gap**
- **What we validated:** Price amounts
- **What we missed:** Account ownership
- **Impact:** Invalid data entered system

### 2. **Integration Gap**
- **What we tested:** API → Database
- **What we missed:** API → Blockchain
- **Impact:** On-chain failures not detected

### 3. **End-to-End Gap**
- **What we tested:** Agreement creation
- **What we missed:** Full escrow lifecycle (deposit → settle)
- **Impact:** Real-world usage patterns not tested

---

## Why This Is A Common Problem

### False Positives in Testing

Our tests had **false positives** because:

1. **Shallow Validation**
   - Only checked API accepts request
   - Didn't verify data correctness

2. **No On-Chain Validation**
   - Never queried blockchain to verify accounts
   - Assumed all valid addresses are valid NFT mints

3. **Incomplete E2E Testing**
   - Created agreements but never used them
   - Didn't test deposit/settle flow with test data

---

## What We Fixed

### Immediate Fix ✅

**Added On-Chain Validation:**
```typescript
export const isValidNFTMintOnChain = async (
  mint: string,
  connection: Connection
): Promise<{ valid: boolean; error?: string }> => {
  // 1. Check account exists
  const accountInfo = await connection.getAccountInfo(mintPubkey);
  if (!accountInfo) {
    return { valid: false, error: 'Account does not exist' };
  }
  
  // 2. Check ownership (Token Program vs System Program)
  if (!accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
    return { valid: false, error: 'Wrong program owner' };
  }
  
  // 3. Check mint structure (82 bytes)
  if (accountInfo.data.length !== 82) {
    return { valid: false, error: 'Invalid mint structure' };
  }
  
  return { valid: true };
};
```

**Now validation happens at API level BEFORE database/blockchain!**

---

## Lessons Learned

### 1. **Test With Real Data**
❌ **Bad:** Using placeholder addresses  
✅ **Good:** Using actual NFT mints from blockchain

### 2. **Validate All Inputs**
❌ **Bad:** Only checking format (base58 encoding)  
✅ **Good:** Querying blockchain for account details

### 3. **Complete E2E Testing**
❌ **Bad:** Creating agreements and stopping  
✅ **Good:** Creating → Depositing → Settling → Verifying

### 4. **Test Negative Cases**
❌ **Bad:** Only testing valid scenarios  
✅ **Good:** Testing wallet addresses, system accounts, non-existent accounts

### 5. **Mirror Production Usage**
❌ **Bad:** Testing what we think users will do  
✅ **Good:** Testing what users actually do

---

## Improved Testing Strategy

### New Test Requirements

#### 1. **Input Validation Tests**
```typescript
✅ Test: Valid NFT mint (owned by Token Program)
✅ Test: Wallet address (owned by System Program) → REJECT
✅ Test: Non-existent address → REJECT
✅ Test: Wrong account type (not a mint) → REJECT
```

#### 2. **Integration Tests**
```typescript
✅ Test: API → Database → Blockchain query
✅ Test: Verify on-chain account before accepting
✅ Test: Reject invalid accounts at API level
```

#### 3. **E2E Tests**
```typescript
✅ Test: Create agreement with REAL NFT
✅ Test: Deposit NFT to escrow
✅ Test: Deposit USDC to escrow
✅ Test: Automatic settlement
✅ Test: Verify final balances
```

---

## Action Items

### Immediate (Done) ✅
- [x] Add on-chain NFT mint validation
- [x] Update validation middleware
- [x] Create comprehensive test for Error 3007 scenarios

### Short-Term (Next Sprint)
- [ ] Update all test files to use real NFT mints
- [ ] Add E2E test for full escrow lifecycle in staging
- [ ] Add monitoring/alerts for validation failures
- [ ] Document test data requirements

### Medium-Term (Next Quarter)
- [ ] Implement test data factory for valid NFTs
- [ ] Add automated testing against live staging blockchain
- [ ] Create validation test matrix (all input types)
- [ ] Add pre-production smoke tests

### Long-Term (Ongoing)
- [ ] Continuous monitoring of production errors
- [ ] Regular review of validation logic
- [ ] Keep test suite synchronized with production usage
- [ ] Add chaos engineering for edge cases

---

## Metrics

### Before Fix
- **Validation Depth:** Format only (base58)
- **False Positive Rate:** 100% (accepted all valid addresses)
- **Production Error Rate:** Unknown (just discovered)

### After Fix
- **Validation Depth:** Format + On-chain query + Ownership + Structure
- **False Positive Rate:** Expected 0% (rejects invalid mints)
- **Production Error Rate:** Target 0% (Error 3007 should not recur)

---

## Related Documentation

- [Error 3007 Fix](../fixes/ERROR_3007_FIX.md)
- [BETA Limits Deployment](../deployment/PRODUCTION_BETA_LIMITS_DEPLOYMENT.md)
- [Testing Guidelines](.cursor/rules/testing.mdc)

---

## Conclusion

### What Happened
Our staging tests had a **false positive** because we used an invalid NFT mint address (wallet address) but only validated the price, not the account ownership.

### Why It Happened
- **Shallow validation:** Only format checks, no on-chain verification
- **Incomplete testing:** Created agreements but never used them
- **Test data:** Used placeholder addresses instead of real NFT mints

### How We Fixed It
- ✅ Added on-chain validation at API level
- ✅ Verify account ownership before accepting
- ✅ Reject invalid accounts immediately
- ✅ Clear error messages for users

### Key Takeaway
**"Passing tests" doesn't always mean "correct behavior"**

We need to test not just that the system accepts input, but that the input is actually valid for the intended use case.

---

**Status:** ✅ **Issue Resolved & Documented**  
**Prevention:** On-chain validation now prevents this class of errors

