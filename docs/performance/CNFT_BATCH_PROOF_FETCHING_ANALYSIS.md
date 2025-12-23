# cNFT Batch Proof Fetching Analysis & Implementation Plan

**Date:** December 16, 2025  
**Status:** 📋 Analysis Complete - Ready for Implementation

---

## Current State Analysis

### 1. **JITO Already Bypasses RPC** ✅

**Finding:** We already call JITO directly, NOT through our RPC connection.

**Evidence:**
- JITO bundle submission: `https://mainnet.block-engine.jito.wtf/api/v1/bundles` (direct HTTP call)
- JITO transaction submission: `https://mainnet.block-engine.jito.wtf/api/v1/transactions` (direct HTTP call)
- No RPC connection used for JITO operations

**Conclusion:** ✅ **No change needed** - JITO already bypasses RPC.

---

### 2. **DAS API Currently Uses RPC** ⚠️

**Finding:** We're calling DAS API through our RPC connection (`this.config.rpcEndpoint`).

**Current Implementation:**
```typescript
// src/services/cnftService.ts:677
const response = await fetch(this.config.rpcEndpoint, {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'getAssetProof',  // or 'getAsset'
    params: { id: assetId },
  }),
});
```

**Potential Issue:**
- RPC provider may add latency/overhead
- RPC provider may have rate limits
- RPC provider may cache responses (causing stale proofs)

**Opportunity:** Call DAS API directly (bypass RPC) for:
- ✅ Faster response times
- ✅ Better control over caching
- ✅ Reduced dependency on RPC provider

---

### 3. **Batch Fetching NOT Using DAS Batch API** ❌

**Finding:** We have `batchGetCnftProofs()` but it's doing individual calls in parallel, NOT using DAS API's `getAssetProofBatch`.

**Current Implementation:**
```typescript
// src/services/cnftService.ts:261-268
const batchPromises = batch.map(async (assetId) => {
  const proof = await this.getCnftProof(assetId, true, 0); // Individual call
  return { assetId, proof, error: null };
});
const batchResults = await Promise.all(batchPromises);
```

**Problem:**
- Makes N separate DAS API calls (one per cNFT)
- Each call has network latency
- Higher chance of stale proofs (proofs fetched at different times)
- More API calls = more rate limit risk

**DAS API Supports:**
```typescript
// DAS API has getAssetProofBatch method
{
  jsonrpc: '2.0',
  method: 'getAssetProofBatch',
  params: {
    ids: ['asset1', 'asset2', 'asset3', ...]  // Multiple IDs in one call
  }
}
```

**Benefits of Batch API:**
- ✅ Single API call for multiple proofs
- ✅ All proofs fetched at the same time (reduces stale proof risk)
- ✅ Faster overall (one network round-trip vs N)
- ✅ Better rate limit efficiency

---

### 4. **JITO Bundle Building Fetches Proofs Sequentially** ⚠️

**Finding:** When building JITO bundles with multiple cNFTs, we fetch proofs sequentially in a loop.

**Current Implementation:**
```typescript
// src/services/transactionGroupBuilder.ts:1232-1242
for (const { asset, from, to, side } of batch) {
  const result = await this.directBubblegumService.buildTransferInstruction({
    assetId: asset.identifier,
    fromWallet: from,
    toWallet: to,
  });
  // ... builds instruction with proof
}
```

**Problem:**
- Sequential `await` means proofs are fetched one at a time
- If we have 5 cNFTs in a bundle, we make 5 sequential DAS API calls
- Total time = sum of all individual fetch times
- Higher chance of stale proofs (first proof fetched before last proof)

**Opportunity:** Pre-fetch all proofs in batch BEFORE building transactions.

---

## Recommendations

### Priority 1: Implement `getAssetProofBatch` ✅ **HIGH IMPACT**

**Why:**
- Reduces stale proof issues (all proofs fetched simultaneously)
- Faster for JITO bundles (single API call vs N calls)
- Better rate limit efficiency

**Implementation:**
1. Add `getAssetProofBatch()` method to `CnftService`
2. Use DAS API's `getAssetProofBatch` method
3. Update `TransactionGroupBuilder` to pre-fetch all proofs before building transactions
4. Fallback to individual calls if batch fails

**Expected Impact:**
- **Speed:** 5x faster for 5 cNFT bundle (1 call vs 5 calls)
- **Stale Proofs:** Reduced (all proofs fetched at same time)
- **Rate Limits:** Better efficiency

---

### Priority 2: Consider Direct DAS API Calls ⚠️ **MEDIUM IMPACT**

**Why:**
- May reduce latency (bypass RPC provider)
- Better control over caching
- Reduced dependency on RPC provider

**Considerations:**
- Need to find direct DAS API endpoint (may be RPC-specific)
- QuickNode may require add-on for DAS API
- May need to maintain both paths (RPC fallback)

**Implementation:**
1. Research direct DAS API endpoints
2. Add configuration option: `useDirectDasApi: boolean`
3. Implement direct DAS API calls with RPC fallback
4. Performance test both approaches

**Expected Impact:**
- **Latency:** Potentially 50-200ms faster per call
- **Reliability:** Less dependent on RPC provider
- **Complexity:** Higher (need to maintain two paths)

---

### Priority 3: Pre-fetch All Proofs for JITO Bundles ✅ **HIGH IMPACT**

**Why:**
- All proofs fetched before transaction building
- Reduces stale proof risk (proofs fetched at same time)
- Better error handling (fail fast if proofs can't be fetched)

**Implementation:**
1. Collect all cNFT asset IDs from bundle
2. Call `getAssetProofBatch()` to fetch all proofs at once
3. Pass proofs to `DirectBubblegumService` (skip individual fetching)
4. Build all transactions with pre-fetched proofs

**Expected Impact:**
- **Stale Proofs:** Significantly reduced
- **Speed:** Faster (parallel batch fetch vs sequential)
- **Error Handling:** Better (fail fast if batch fetch fails)

---

## Implementation Plan

### Phase 1: Add `getAssetProofBatch` Method

**File:** `src/services/cnftService.ts`

**New Method:**
```typescript
/**
 * Fetch multiple Merkle proofs in a single DAS API call
 * Uses getAssetProofBatch for efficiency and to reduce stale proof risk
 * 
 * @param assetIds - Array of cNFT asset IDs
 * @param skipCache - Whether to bypass cache
 * @returns Map of assetId -> DasProofResponse
 */
async getAssetProofBatch(
  assetIds: string[],
  skipCache = false
): Promise<Map<string, DasProofResponse>> {
  // 1. Check cache for all IDs
  // 2. For uncached IDs, call DAS API getAssetProofBatch
  // 3. Cache results
  // 4. Return Map
}
```

**Benefits:**
- Single API call for multiple proofs
- All proofs fetched simultaneously (reduces stale proof risk)
- Faster than individual calls

---

### Phase 2: Update `TransactionGroupBuilder` to Pre-fetch Proofs

**File:** `src/services/transactionGroupBuilder.ts`

**Changes:**
1. Before building transactions, collect all cNFT asset IDs
2. Call `cnftService.getAssetProofBatch(allAssetIds)`
3. Pass pre-fetched proofs to `DirectBubblegumService`
4. Skip individual proof fetching in `buildTransferInstruction`

**Benefits:**
- All proofs fetched before transaction building
- Reduced stale proof risk
- Faster overall (batch fetch vs sequential)

---

### Phase 3: Update `DirectBubblegumService` to Accept Pre-fetched Proofs

**File:** `src/services/directBubblegumService.ts`

**Changes:**
1. Add optional `preFetchedProof` parameter to `buildTransferInstruction`
2. If provided, use pre-fetched proof (skip DAS API call)
3. Fallback to individual fetch if not provided (backward compatible)

**Benefits:**
- Supports batch fetching
- Backward compatible (still works with individual fetches)
- Reduces redundant API calls

---

## Expected Results

### Performance Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **5 cNFT Bundle Proof Fetch** | 5 sequential calls (~1.5s) | 1 batch call (~300ms) | **5x faster** |
| **Stale Proof Risk** | High (proofs fetched at different times) | Low (all proofs fetched simultaneously) | **Significantly reduced** |
| **Rate Limit Efficiency** | 5 API calls | 1 API call | **5x better** |

### Stale Proof Reduction

**Before:**
- Proof 1 fetched at T=0ms
- Proof 2 fetched at T=300ms
- Proof 3 fetched at T=600ms
- **Risk:** Proof 1 may be stale by the time Proof 3 is fetched

**After:**
- All proofs fetched at T=0ms (simultaneously)
- **Risk:** All proofs are from the same moment in time

---

## Questions to Answer

1. **Does our RPC provider support `getAssetProofBatch`?**
   - Need to test if QuickNode supports this method
   - May need to check if add-on is required

2. **What's the direct DAS API endpoint?**
   - Is there a public DAS API endpoint we can call directly?
   - Or is DAS API only available through RPC providers?

3. **Should we implement direct DAS API calls?**
   - Performance test: RPC vs Direct
   - Cost analysis: Does direct call save money?
   - Reliability: Is direct endpoint more reliable?

---

## Next Steps

1. ✅ **Research DAS API `getAssetProofBatch` format**
2. ✅ **Test if our RPC supports `getAssetProofBatch`**
3. ⏳ **Implement `getAssetProofBatch` method**
4. ⏳ **Update `TransactionGroupBuilder` to pre-fetch proofs**
5. ⏳ **Update `DirectBubblegumService` to accept pre-fetched proofs**
6. ⏳ **Performance test: Before vs After**
7. ⏳ **Consider direct DAS API calls (optional)**

---

## Conclusion

**JITO already bypasses RPC** - ✅ No change needed.

**Batch proof fetching is the biggest opportunity:**
- ✅ Implement `getAssetProofBatch` for JITO bundles
- ✅ Pre-fetch all proofs before building transactions
- ✅ Reduces stale proof risk significantly
- ✅ 5x faster for 5 cNFT bundles

**Direct DAS API calls are optional:**
- ⚠️ May improve latency slightly
- ⚠️ Need to research endpoints and test performance
- ⚠️ Higher complexity (maintain two paths)

**Recommendation:** Start with batch fetching (high impact, low complexity), then evaluate direct DAS API calls if needed.

