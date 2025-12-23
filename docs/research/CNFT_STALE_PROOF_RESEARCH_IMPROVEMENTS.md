# cNFT Stale Proof Handling - Research-Based Improvements

**Date:** December 16, 2025  
**Status:** ✅ Implemented

---

## Research Summary

Based on comprehensive research using Perplexity Search API, we've identified and implemented additional improvements beyond the initial retry logic enhancements.

---

## Key Findings from Research

### 1. **Proof Fast-Forwarding (Solana's Unique Feature)**
- **Finding**: Solana's concurrent Merkle trees support **fast-forwarding of stale proofs**
- **How it works**: Proofs can remain valid for up to `maxBufferSize` updates (typically 64)
- **Implication**: Even if a proof is slightly stale, the on-chain program can fast-forward it
- **Action**: Our code already leverages this via `ConcurrentMerkleTreeAccount`

### 2. **Cache TTL Optimization**
- **Finding**: High-activity trees update every few seconds
- **Current**: 30-second cache TTL
- **Improved**: 5-second cache TTL for proofs
- **Rationale**: Research shows proofs can become stale in seconds on active trees

### 3. **Just-in-Time Proof Fetching**
- **Finding**: Marketplaces fetch proofs immediately before transaction building
- **Status**: ✅ Already implemented - `DirectBubblegumService` skips cache on first attempt
- **Action**: Enhanced logging to track cache usage

### 4. **Multiple RPC Providers (Future Enhancement)**
- **Finding**: Using multiple RPC endpoints can improve proof fetch speed
- **Strategy**: Race condition - first provider to respond wins
- **Status**: ⏳ Not yet implemented (single connection currently)
- **Future**: Consider connection pooling with multiple providers

### 5. **Batch Proof Fetching**
- **Finding**: DAS API supports `getAssetProofBatch` for multiple proofs
- **Status**: ⏳ Not yet implemented (single proof fetching)
- **Future**: Use batch fetching for bulk swaps

---

## Implemented Improvements

### 1. ✅ Increased Retry Attempts in `DirectBubblegumService`
- **Before**: 3 retries
- **After**: 5 retries
- **Delays**: 500ms, 1s, 2s, 3s, 4s (progressive exponential backoff)

### 2. ✅ Shorter Cache TTL for Proofs
- **Before**: 30 seconds
- **After**: 5 seconds (configurable per call)
- **Rationale**: High-activity trees update faster than 30-second cache allows

### 3. ✅ Enhanced Logging
- Added cache age tracking
- Added root hash logging for debugging
- Better visibility into retry attempts

### 4. ✅ Increased Retry Attempts in `OfferManager`
- **Before**: 2 attempts
- **After**: 5 attempts
- **Delays**: 500ms, 1s, 2s, 3s (exponential backoff)

---

## How Other Marketplaces Handle This

### Magic Eden & Tensor Approach:
1. **More Retries**: 5+ retry attempts with exponential backoff
2. **Just-in-Time Fetching**: Proofs fetched immediately before transaction building
3. **Tree Stability Checks**: Wait for tree sequence to stabilize before retrying
4. **Multiple RPC Providers**: Use fastest provider for proof fetching
5. **Short Cache TTL**: Very short cache (5-10 seconds) for high-activity trees

### Solana's Concurrent Merkle Tree Features:
1. **Fast-Forwarding**: Stale proofs can be fast-forwarded up to `maxBufferSize` updates
2. **Buffer Size**: Determines how many concurrent updates can happen before proof invalidates
3. **Canopy Depth**: Reduces proof size by caching upper tree nodes on-chain

---

## Code Changes

### `src/services/cnftService.ts`

**Changed:**
- `cacheProof()` now accepts optional `ttlSeconds` parameter (default: 5 seconds)
- Enhanced logging in `getCnftProof()` with cache age tracking
- Added root hash logging for debugging stale proof issues

**Key Code:**
```typescript
// Cache with short TTL for high-activity trees
this.cacheProof(assetId, proofData, 5); // 5 second TTL instead of 30s
```

### `src/services/directBubblegumService.ts`

**Changed:**
- Increased `maxRetries` from 3 to 5
- Extended `retryDelays` array: `[500, 1000, 2000, 3000, 4000]`

### `src/services/offerManager.ts`

**Changed:**
- Increased `maxAttempts` from 2 to 5
- Implemented exponential backoff: `[500, 1000, 2000, 3000]`

---

## Expected Impact

### Before:
- 2-3 retry attempts
- 30-second cache TTL (too long for active trees)
- Limited visibility into cache usage

### After:
- 5 retry attempts with progressive delays
- 5-second cache TTL (matches tree update frequency)
- Enhanced logging for debugging
- Better success rate on high-activity trees

---

## Future Enhancements (Not Yet Implemented)

### 1. Multiple RPC Providers
```typescript
// Future: Connection pool with multiple providers
const providers = [
  'https://mainnet.helius-rpc.com/?api-key=...',
  'https://quicknode.com/...',
  'https://alchemy.com/...',
];
// Race condition: first to respond wins
```

### 2. Batch Proof Fetching
```typescript
// Future: Use getAssetProofBatch for bulk swaps
const response = await this.makeDasRequest('getAssetProofBatch', {
  ids: [assetId1, assetId2, assetId3],
});
```

### 3. Dynamic Retry Count Based on Tree Activity
```typescript
// Future: Adjust retries based on tree sequence change rate
const treeActivity = calculateTreeActivity(treeSequence);
const maxRetries = treeActivity > 10 ? 7 : 5;
```

---

## Testing Recommendations

1. **Test with High-Activity Trees**: Use trees with sequence > 100,000
2. **Monitor Cache Hit Rate**: Should see more cache misses with 5s TTL
3. **Track Retry Attempts**: Logs should show up to 5 retry attempts
4. **Verify Success Rate**: Should see improved success on active trees

---

## Related Documentation

- `docs/CNFT_STALE_PROOF_IMPROVEMENTS.md` - Initial improvements
- `docs/JITO_API_FORMAT_VERIFICATION.md` - Jito API format verification
- Solana Docs: [State Compression](https://solana.com/developers/guides/advanced/state-compression)
- Metaplex Docs: [DAS API](https://developers.metaplex.com/rpc-providers)

---

**Last Updated:** December 16, 2025  
**Research Source:** Perplexity Search API (December 2025)

