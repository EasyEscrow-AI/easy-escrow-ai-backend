# cNFT Stale Proof Handling Improvements

**Date:** December 16, 2025  
**Status:** ✅ Implemented

---

## Problem

Production E2E tests were failing with "Stale Merkle proof detected after 3 refresh attempts" errors. This occurs when high-activity Merkle trees update faster than the DAS API can provide fresh proofs.

---

## Root Cause Analysis

1. **Insufficient Retry Attempts**: `OfferManager.acceptOffer()` only retried 2 times with short delays (500ms, 1000ms)
2. **High-Activity Trees**: Some trees (e.g., Sequence 352398) update very frequently, requiring more retry attempts
3. **DAS API Lag**: The DAS API can lag behind on-chain tree updates, especially during high activity periods

---

## Solution: Aggressive Retry Strategy

Following best practices from other marketplaces (Magic Eden, Tensor), we've implemented:

### 1. Increased Retry Attempts
- **Before**: 2 attempts in `OfferManager`
- **After**: 5 attempts in `OfferManager`
- **Rationale**: High-activity trees need more chances to stabilize

### 2. Exponential Backoff
- **Before**: Fixed delays (500ms, 1000ms)
- **After**: Progressive delays (500ms, 1s, 2s, 3s)
- **Rationale**: Longer waits give trees more time to stabilize between retries

### 3. Just-in-Time Proof Fetching
- Already implemented: `DirectBubblegumService` skips cache on first attempt
- Already implemented: Proofs are fetched immediately before transaction building
- **Rationale**: Ensures proofs are as fresh as possible

### 4. Tree Stability Checks
- Already implemented: `DirectBubblegumService` waits for tree sequence to stabilize
- Already implemented: Checks tree sequence 5 times with 500ms intervals
- **Rationale**: Prevents fetching proofs while tree is mid-update

---

## Code Changes

### `src/services/offerManager.ts`

**Changed:**
- Increased `maxAttempts` from 2 to 5
- Implemented exponential backoff delays: `[500, 1000, 2000, 3000]`
- Added detailed logging for retry attempts

**Key Code:**
```typescript
const maxAttempts = 5; // Increased from 2 to 5 for high-activity trees

// Exponential backoff with longer waits for high-activity trees
const delays = [500, 1000, 2000, 3000];
const delay = delays[attempt - 1] || 3000;
```

---

## How Other Marketplaces Handle This

Based on research and Solana documentation:

1. **Regenerate Proofs Before Each Transaction**
   - ✅ We do this: Proofs are fetched just-in-time before transaction building

2. **Use Proof Fast-Forwarding**
   - ✅ Solana's concurrent Merkle trees support this automatically
   - ✅ Our code uses `ConcurrentMerkleTreeAccount` which handles fast-forwarding

3. **Optimize Merkle Tree Parameters**
   - ⚠️ This is tree-specific and controlled by tree creators
   - We can't change this, but we handle both full and partial canopy trees

4. **Aggressive Retry Strategies**
   - ✅ Now implemented: 5 retries with exponential backoff
   - ✅ Tree stability checks before retrying

---

## Expected Behavior

### Before (2 retries):
1. Attempt 1: Fails with stale proof → Wait 500ms
2. Attempt 2: Fails with stale proof → Wait 1000ms
3. **FAIL**: No more retries

### After (5 retries):
1. Attempt 1: Fails with stale proof → Wait 500ms
2. Attempt 2: Fails with stale proof → Wait 1000ms
3. Attempt 3: Fails with stale proof → Wait 2000ms
4. Attempt 4: Fails with stale proof → Wait 3000ms
5. Attempt 5: **SUCCESS** (or fails if tree is extremely active)

---

## Testing

### Production E2E Test
```bash
npm test -- tests/production/e2e/04-atomic-cnft-for-sol.test.ts
```

**Expected Result:**
- More retry attempts before giving up
- Better success rate on high-activity trees
- Detailed logging for debugging

---

## Monitoring

Watch for these log messages:
- `⚠️ [OfferManager] Attempt X/5 failed with stale cNFT proof, retrying...`
- `Waiting Xms for tree updates to propagate before retry...`

If you see all 5 attempts failing, the tree is extremely active and may need:
- Longer delays between retries
- Different cNFT from a less active tree
- Manual intervention

---

## Future Improvements

1. **Dynamic Retry Count**: Adjust retries based on tree activity level
2. **Tree Activity Monitoring**: Track tree sequence changes to predict staleness
3. **Multiple RPC Providers**: Use fastest provider for proof fetching
4. **Proof Pre-fetching**: Fetch proofs in parallel for bulk swaps

---

## Related Files

- `src/services/offerManager.ts` - Main retry logic
- `src/services/directBubblegumService.ts` - Proof validation and tree stability checks
- `src/services/cnftService.ts` - Proof fetching with cache management
- `tests/production/e2e/04-atomic-cnft-for-sol.test.ts` - Production test

---

**Last Updated:** December 16, 2025

