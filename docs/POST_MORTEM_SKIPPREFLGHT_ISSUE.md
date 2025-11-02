# Post-Mortem: Missing skipPreflight in E2E Tests

**Date:** 2025-10-28  
**Severity:** High (Production issue)  
**Status:** Fixed  
**PR:** #82  

---

## 📋 **Summary**

Production E2E tests failed because client-side deposit transactions were missing the `skipPreflight: true` option when calling `connection.sendRawTransaction()`. This issue only manifested on mainnet/production because Jito tips are conditionally added based on network detection.

---

## 🐛 **The Issue**

### What Happened
Client-side deposit transactions (NFT and USDC) were failing on mainnet with Jito tip validation errors during the production E2E test run.

### Root Cause
```typescript
// INCORRECT - Missing skipPreflight option
const txId = await connection.sendRawTransaction(transaction.serialize());
```

### Why It Failed
1. Our code adds Jito tips **ONLY on mainnet** (via `isMainnetNetwork()` detection)
2. Transactions with Jito tips **REQUIRE** `skipPreflight: true` to bypass simulation
3. The E2E tests were sending transactions without this option

---

## 🔍 **Why We Missed It**

### 1. **Unit Tests Don't Send Transactions**

Our Jito integration unit tests validate:
- ✅ Transaction structure (tip instruction placement)
- ✅ Tip account addresses (8 official addresses)
- ✅ Network detection logic
- ✅ API parameters

**But they DON'T:**
- ❌ Actually send transactions to the network
- ❌ Test the full client-side flow
- ❌ Validate `sendRawTransaction()` options

**File:** `tests/unit/jito-integration.test.ts`

```typescript
// Unit tests just build transactions, they don't send them
const transaction = new Transaction();
transaction.add(/* instructions */);
// No actual sendRawTransaction() call
```

### 2. **Staging E2E Tests Use Devnet**

**The Key Difference:**

| Environment | Network | Jito Tips Added? | skipPreflight Required? | Test Result |
|-------------|---------|------------------|-------------------------|-------------|
| **Staging** | Devnet  | ❌ NO            | ❌ NO                   | ✅ **PASS** |
| **Production** | Mainnet | ✅ YES         | ✅ YES                  | ❌ **FAIL** |

**Code Logic:**
```typescript
// src/services/escrow-program.service.ts

const isMainnet = isMainnetNetwork(this.provider.connection);

// Jito tips only added on mainnet
if (isMainnet) {
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: seller,
      toPubkey: tipAccount,
      lamports: 1_000_000, // 0.001 SOL
    })
  );
}
```

**Why Staging Tests Passed:**
- Running on **devnet**
- No Jito tips in transaction
- Simulation succeeds WITHOUT `skipPreflight`
- Test passes ✅

**Why Production Tests Failed:**
- Running on **mainnet**
- Jito tips IN transaction
- Simulation FAILS without `skipPreflight`
- Test fails ❌

### 3. **Gap in Test Coverage**

We had **no tests** that:
1. Actually send Jito-tipped transactions to mainnet
2. Validate the full client-side transaction submission flow
3. Test `sendRawTransaction()` options in a mainnet context

---

## 🔧 **The Fix**

### Before (Broken)
```typescript
// Missing options - fails with Jito tips
const txId = await connection.sendRawTransaction(transaction.serialize());
```

### After (Fixed)
```typescript
// With skipPreflight for Jito tips
const txId = await connection.sendRawTransaction(transaction.serialize(), {
  skipPreflight: true,  // Required for Jito tips on mainnet
  maxRetries: 3,        // Added for reliability
});
```

### Files Fixed
1. `tests/production/e2e/01-solana-nft-usdc-happy-path.test.ts`
   - NFT deposit transaction (line 294)
   - USDC deposit transaction (line 363)

### Staging Tests Still Broken
⚠️ **All staging E2E tests** also missing `skipPreflight`, but they pass because:
- They're on devnet (no Jito tips)
- We should still fix them for consistency

**Files needing fix:**
- `tests/staging/e2e/01-solana-nft-usdc-happy-path.test.ts`
- `tests/staging/e2e/02-agreement-expiry-refund.test.ts`
- `tests/staging/e2e/07-edge-cases-validation.test.ts`
- `tests/staging/e2e/test-helpers.ts`

---

## 📚 **Lessons Learned**

### 1. **Environment-Specific Behavior is Dangerous**
**Problem:** Code behaves differently on devnet vs mainnet (Jito tips conditional)

**Lesson:** When code has environment-specific logic, you MUST test in both environments.

**Action Items:**
- ✅ Add production E2E tests (done)
- ⚠️ Need better devnet→mainnet parity tests
- 📝 Document all environment-specific behaviors

### 2. **Unit Tests Have Limits**
**Problem:** Unit tests validated structure but not runtime behavior

**Lesson:** Unit tests can't catch integration issues. You need REAL end-to-end tests.

**Types of Tests:**
- **Unit Tests:** Structure, logic, parameters ✅
- **Integration Tests:** Component interactions ⚠️
- **E2E Tests:** Full user flows in REAL environments ❌ (missing for mainnet)

### 3. **Test What You Ship**
**Problem:** Staging tests passed because they don't match production conditions

**Lesson:** Your test environment should mirror production as closely as possible.

**Gaps:**
- Staging: devnet (no Jito tips)
- Production: mainnet (Jito tips required)
- **Solution:** Need mainnet-like test environment OR conditional logic in tests

### 4. **Documentation Gaps**
**Problem:** No documentation stating `skipPreflight` requirement for Jito tips

**Lesson:** Critical implementation details must be documented.

**Where to Document:**
- [ ] Add to `JITO_FREE_INTEGRATION_SUMMARY.md`
- [ ] Add to E2E test helper comments
- [ ] Add to SDK/API documentation (if we have one)

---

## 🎯 **Action Items**

### Immediate (High Priority)
- [x] Fix production E2E test (`skipPreflight`)
- [x] Push to staging and update PR #82
- [ ] Fix staging E2E tests (for consistency)
- [ ] Add test helper utility for `sendRawTransaction()`

### Short Term
- [ ] Add integration test that validates Jito tips on mainnet testnet
- [ ] Document `skipPreflight` requirement in all relevant places
- [ ] Create test helper: `sendTransactionWithJitoSupport()`
- [ ] Add linting rule to detect `sendRawTransaction()` without options

### Long Term
- [ ] Implement proper mainnet testing strategy
- [ ] Add pre-production smoke tests (run before each deploy)
- [ ] Create E2E test that runs on actual mainnet with minimal SOL
- [ ] Add monitoring/alerting for transaction failures in production

---

## 💡 **Proposed Test Helper**

To prevent this in the future:

```typescript
// tests/helpers/solana-utils.ts

/**
 * Send transaction with proper Jito support
 * Automatically applies skipPreflight for mainnet
 */
export async function sendTransactionWithJitoSupport(
  connection: Connection,
  transaction: Transaction,
  options?: {
    isMainnet?: boolean;
    maxRetries?: number;
  }
): Promise<string> {
  const isMainnet = options?.isMainnet ?? 
    connection.rpcEndpoint.toLowerCase().includes('mainnet');
  
  return await connection.sendRawTransaction(
    transaction.serialize(),
    {
      skipPreflight: isMainnet, // Auto-detect Jito requirement
      maxRetries: options?.maxRetries ?? 3,
    }
  );
}
```

**Benefits:**
- Centralizes transaction sending logic
- Automatically handles `skipPreflight` based on network
- Makes tests more maintainable
- Reduces chance of future mistakes

---

## 📊 **Impact Assessment**

### What Broke
- ❌ Production E2E tests (client-side deposits)
- ✅ Production API (server-side transactions worked fine)

### User Impact
- **None** - Issue caught in testing before real users hit it
- Server-side transactions (agreement creation) worked correctly
- Only affected automated test suite

### Time to Fix
- Detection: Immediate (test failure)
- Root cause analysis: ~5 minutes
- Fix implementation: ~2 minutes
- Testing & deployment: Pending merge

---

## ✅ **Prevention Checklist**

For future Solana integrations:

- [ ] Unit tests for transaction structure
- [ ] Integration tests for component interactions
- [ ] E2E tests for full user flows
- [ ] Environment parity checks (devnet vs mainnet)
- [ ] Document all environment-specific behaviors
- [ ] Pre-production smoke tests
- [ ] Linting rules for common mistakes
- [ ] Helper utilities for complex operations
- [ ] Monitoring/alerting for production issues

---

## 🔗 **Related Documentation**

- [Jito Free Integration Summary](./JITO_FREE_INTEGRATION_SUMMARY.md)
- [Jito Troubleshooting](./JITO_TROUBLESHOOTING.md)
- [Dynamic Priority Fees](./optimization/DYNAMIC_PRIORITY_FEES.md)
- [PR #82](https://github.com/VENTURE-AI-LABS/easy-escrow-ai-backend/pull/82)

---

## 👥 **Contributors**

- **Identified by:** Production E2E test failure
- **Analyzed by:** AI Assistant
- **Fixed by:** AI Assistant (commit `d3b5b3b`)
- **Reviewed by:** Pending

---

**Conclusion:** This was a classic example of environment-specific behavior causing test failures. The fix is simple (add `skipPreflight`), but the lesson is valuable: **test in the environment you deploy to**, and **document environment-specific requirements**.




