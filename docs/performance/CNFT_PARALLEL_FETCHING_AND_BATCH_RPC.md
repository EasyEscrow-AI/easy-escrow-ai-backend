# cNFT Parallel Fetching and Batch RPC Configuration

**Date**: December 16, 2025  
**Status**: ✅ Complete  
**Branch**: feature/task71-das-api-optimization-research

## Overview

Implemented parallel proof fetching for individual cNFTs and separate RPC connection for batch operations to reduce stale proof risk and improve performance.

## Problem

1. **Stale Proof Risk**: When fetching multiple cNFT proofs sequentially, the first proof may become stale by the time the last one is fetched (especially on high-activity trees)
2. **Batch Performance**: QuickNode's batch operations were failing (0% success rate), while Helius showed 100% success and 55% better performance
3. **No Parallel Fetching**: Individual cNFT proofs were fetched one at a time, increasing stale proof risk

## Solution

### 1. Parallel Proof Fetching

Added `getCnftProofsParallel()` method that fetches multiple proofs simultaneously:

```typescript
// Fetch multiple proofs in parallel (reduces stale proof risk)
const proofMap = await cnftService.getCnftProofsParallel(assetIds, skipCache);
```

**Benefits:**
- All proofs fetched at the same time (reduces stale proof window)
- Enabled by default (`enableParallelProofFetching: true`)
- Automatically falls back to sequential if disabled or single asset

### 2. Separate Batch RPC Connection

Added support for a dedicated RPC endpoint for batch operations:

**Configuration:**
```typescript
// config/index.ts
solana: {
  rpcUrl: process.env.SOLANA_RPC_URL, // Primary (Helius)
  rpcUrlFallback: process.env.SOLANA_RPC_URL_FALLBACK || process.env.SOLANA_RPC_URL_2, // Fallback (QuickNode)
  rpcUrlBatch: process.env.SOLANA_RPC_URL_BATCH || process.env.SOLANA_RPC_URL, // Batch operations (defaults to primary)
}
```

**Environment Variables:**
- `SOLANA_RPC_URL`: Primary RPC (Helius) - used for individual operations
- `SOLANA_RPC_URL_2` or `SOLANA_RPC_URL_FALLBACK`: Fallback RPC (QuickNode)
- `SOLANA_RPC_URL_BATCH`: Batch operations RPC (defaults to `SOLANA_RPC_URL`)

**Implementation:**
- `CnftService` now supports optional `batchRpcEndpoint` in config
- `getAssetProofBatch()` automatically uses batch connection if configured
- Batch connection is created automatically if `batchRpcEndpoint` differs from primary

### 3. Benchmark Results

Based on production benchmark results:

| Provider | Avg Latency | P95 Latency | Success Rate | Throughput |
|----------|------------|-------------|--------------|------------|
| **Helius** | 283ms | 353ms | 100% | 3.53 req/s |
| QuickNode | 639ms | 1259ms | 40% | 1.56 req/s |

**Recommendation**: Use Helius for both primary and batch operations.

## Configuration

### Production Environment Variables

```bash
# Primary RPC (Helius) - for individual operations
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY

# Fallback RPC (QuickNode) - for failover
SOLANA_RPC_URL_2=https://prettiest-broken-flower.solana-mainnet.quiknode.pro/YOUR_QUICKNODE_KEY/

# Batch operations RPC (Helius) - defaults to SOLANA_RPC_URL if not set
SOLANA_RPC_URL_BATCH=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
```

### DigitalOcean App Platform

1. Go to App Settings → Environment Variables
2. Set `SOLANA_RPC_URL` to Helius endpoint
3. Set `SOLANA_RPC_URL_2` to QuickNode endpoint (fallback)
4. Optionally set `SOLANA_RPC_URL_BATCH` to Helius endpoint (defaults to `SOLANA_RPC_URL`)

## Code Changes

### Files Modified

1. **`src/config/index.ts`**
   - Added `rpcUrlBatch` configuration option
   - Supports `SOLANA_RPC_URL_BATCH` environment variable

2. **`src/services/cnftService.ts`**
   - Added `batchRpcEndpoint` to `CnftServiceConfig`
   - Added `batchConnection` property for separate batch operations
   - Added `enableParallelProofFetching` configuration option
   - Added `getCnftProofsParallel()` method for parallel proof fetching
   - Updated `makeDasRequest()` to support batch connection
   - Updated `getAssetProofBatch()` to use batch connection

3. **`src/services/cnftService.ts` (createCnftService)**
   - Automatically configures batch RPC from config if available

## Usage

### Parallel Proof Fetching

```typescript
// Fetch multiple proofs in parallel (reduces stale proof risk)
const assetIds = ['asset1', 'asset2', 'asset3'];
const proofMap = await cnftService.getCnftProofsParallel(assetIds, true); // skipCache = true
```

### Batch Operations (Automatic)

Batch operations automatically use the batch connection if configured:

```typescript
// This automatically uses batch connection (Helius) if configured
const proofMap = await cnftService.getAssetProofBatch(assetIds, true);
```

## Benefits

1. **Reduced Stale Proof Risk**: Parallel fetching ensures all proofs are fetched simultaneously
2. **Better Batch Performance**: Helius shows 100% success rate vs QuickNode's 0%
3. **Flexible Configuration**: Can use different RPCs for different operations
4. **Backward Compatible**: Defaults to primary RPC if batch RPC not configured

## Testing

- ✅ TypeScript compilation passes
- ✅ No linting errors
- ✅ Backward compatible (defaults to primary RPC)
- ⏳ Production testing required to verify stale proof improvements

## Related Documentation

- [DAS_API_OPTIMIZATION_RESEARCH.md](DAS_API_OPTIMIZATION_RESEARCH.md) - Research on DAS API optimization
- [DAS_BENCHMARKING_GUIDE.md](DAS_BENCHMARKING_GUIDE.md) - Benchmarking guide
- [CNFT_STALE_PROOF_IMPROVEMENTS.md](CNFT_STALE_PROOF_IMPROVEMENTS.md) - Previous stale proof improvements

