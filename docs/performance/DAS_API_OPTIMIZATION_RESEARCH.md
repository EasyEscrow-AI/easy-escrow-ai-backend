# DAS API Optimization Research & Implementation Plan

**Date:** December 16, 2025  
**Status:** 📋 Research Complete - Benchmarking Required  
**Task:** Task 71 - Research and Evaluate Direct DAS API Access Options

---

## Executive Summary

**Key Finding:** No standalone public DAS API endpoints exist. All DAS API access requires RPC providers with DAS add-on enabled.

**Recommendation:** Current RPC provider (via `this.config.rpcEndpoint`) is sufficient. Multi-provider pooling should only be implemented if benchmarks show >20% performance improvement.

---

## Research Findings

### 1. No Standalone Public DAS API Endpoints

**Finding:** There are NO standalone public DAS API endpoints independent of RPC providers.

**Evidence:**
- Solana Labs public endpoints (`api.mainnet-beta.solana.com`) do NOT support DAS API
- All DAS API access flows through commercial RPC providers
- Metaplex's Aura (decentralized indexing) still requires RPC provider integration

**Conclusion:** ✅ **Cannot bypass RPC** - DAS API is inherently tied to RPC provider infrastructure.

---

### 2. RPC Providers Supporting DAS API

#### Helius (Market Leader)
- **Endpoint:** `https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- **DAS Support:** Full implementation, no add-on required
- **Rate Limits:**
  - Free: 2 req/s
  - Developer ($49/mo): 10 req/s
  - Business ($499/mo): 50 req/s
  - Professional ($999/mo): 100 req/s
- **Pricing:** Credit-based system
- **Features:** Enhanced DAS API, WebSocket subscriptions, webhooks
- **getAssetProofBatch:** ✅ Supported

#### QuickNode
- **Endpoint:** `https://your-endpoint.quiknode.pro/auth-token/`
- **DAS Support:** Requires "Digital Asset Standard Add-on" activation
- **Rate Limits:**
  - Professional: 100 DAS req/s
  - Additional 100 RPS increments: $100/mo
- **Pricing:** Credit-based, $0.53 per million additional requests
- **Features:** Multi-chain infrastructure, marketplace add-ons
- **getAssetProofBatch:** ✅ Supported

#### Triton One
- **Endpoint:** Standard RPC Pool endpoints
- **DAS Support:** Enabled by default on all endpoints
- **Rate Limits:** Aligned with RPC Pool tier
- **Pricing:** $50 per million DAS requests (per-request billing)
- **Features:** Performance-focused, Project Yellowstone optimizations
- **getAssetProofBatch:** ✅ Supported

#### GetBlock
- **Endpoint:** Dedicated node URLs
- **DAS Support:** Free add-on during node configuration
- **Rate Limits:** Based on compute units (CU)
- **Pricing:** Tier-based ($0-$200+/mo)
- **Features:** Pre-configured nodes, easy setup
- **getAssetProofBatch:** ✅ Supported

#### Extrnode
- **Endpoint:** Decentralized RPC gateway
- **DAS Support:** Integrated across all endpoints
- **Rate Limits:**
  - Free: 5 req/s
  - Basic ($25/mo): 50 req/s
  - Professional ($99/mo): Custom
- **Pricing:** Credit-based with bonus credits
- **Features:** Decentralized infrastructure
- **getAssetProofBatch:** ✅ Supported

#### Alchemy (Beta)
- **Endpoint:** Standard Alchemy endpoints
- **DAS Support:** Beta status
- **Rate Limits:** Tier-based (Standard/Advanced/Professional/Enterprise)
- **Pricing:** CU-based (getAsset: 80 CU, getAssetProof: 480 CU)
- **Features:** Enterprise-grade, multi-chain
- **getAssetProofBatch:** ✅ Supported

---

### 3. Provider Comparison Matrix

| Provider | DAS Add-on Required | getAssetProofBatch | Rate Limits (DAS) | Pricing Model | Latency (Est.) | Notes |
|----------|---------------------|-------------------|-------------------|---------------|----------------|-------|
| **Current RPC** | ✅ Yes | ✅ Yes | ? | ? | Baseline | To be benchmarked |
| **Helius** | ❌ No | ✅ Yes | 2-100 req/s | Credit-based | Low | Market leader, enhanced features |
| **QuickNode** | ✅ Yes | ✅ Yes | 100 req/s | Credit-based | Medium | Multi-chain, marketplace add-ons |
| **Triton One** | ❌ No | ✅ Yes | Tier-based | $50/1M requests | Low | Per-request billing, performance-focused |
| **GetBlock** | ✅ Free | ✅ Yes | CU-based | Tier-based | Medium | Easy setup, pre-configured nodes |
| **Extrnode** | ❌ No | ✅ Yes | 5-50+ req/s | Credit-based | Medium | Decentralized infrastructure |
| **Alchemy** | ❌ No | ✅ Yes | Tier-based | CU-based | Low | Enterprise-grade, multi-chain (Beta) |

**Key Findings:**
- All providers support `getAssetProofBatch` ✅
- No provider requires dedicated DAS endpoint (all use standard RPC endpoints)
- Rate limits vary significantly (2-100+ req/s)
- Pricing models differ (credit-based vs per-request vs tier-based)

---

### 4. Current Implementation Analysis

**Current Setup:**
```typescript
// src/services/cnftService.ts:890
const response = await fetch(this.config.rpcEndpoint, {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'getAssetProof',  // or 'getAssetProofBatch'
    params: { id: assetId },
  }),
});
```

**Assessment:**
- ✅ Uses RPC endpoint (correct approach - no standalone endpoints exist)
- ✅ Supports all DAS methods including `getAssetProofBatch`
- ✅ Proper JSON-RPC format
- ⚠️ Single provider dependency (no failover)

---

## Performance Benchmarking Plan

### Benchmark Suite Requirements

**Test Scenarios:**
1. Single `getAsset` call (baseline)
2. Single `getAssetProof` call
3. `getAssetProofBatch` with 10 assets
4. `getAssetProofBatch` with 50 assets
5. `getAssetProofBatch` with 100 assets

**Metrics to Collect:**
- p50 latency (median)
- p95 latency (95th percentile)
- p99 latency (99th percentile)
- Throughput (requests/second)
- Success rate
- Error rate
- Rate limit hits

**Providers to Test:**
- Current RPC provider (baseline)
- Helius (if API key available)
- QuickNode (if API key available)
- Triton One (if API key available)

**Test Conditions:**
- Run during low network congestion
- 3 iterations per test
- Use same test asset IDs across providers
- Measure end-to-end latency (request → response)

---

## Implementation Decision Criteria

### Multi-Provider Pooling Implementation

**Implement ONLY if:**
- ✅ Benchmarks show >20% latency improvement vs current RPC
- ✅ Success rate improvement >5%
- ✅ Cost analysis shows acceptable ROI

**Do NOT implement if:**
- ❌ Performance improvement <20%
- ❌ Additional complexity not justified
- ❌ Cost increase exceeds benefit

---

## Recommended Approach

### Phase 1: Benchmarking (Current Task)
1. Create `DASPerformanceTester` class
2. Run benchmarks against current RPC
3. Run benchmarks against 2-3 alternative providers (if API keys available)
4. Compare results and document findings

### Phase 2: Decision Point
- **If >20% improvement:** Proceed with multi-provider pooling
- **If <20% improvement:** Document findings, keep current implementation

### Phase 3: Implementation (Conditional)
Only if benchmarks justify it:
1. Create `DasProviderPool` class
2. Add configuration for multiple providers
3. Implement health checks and failover
4. Integrate into `CnftService`

---

## Cost Analysis

### Current Setup
- **Cost:** Included in existing RPC subscription
- **Rate Limits:** Determined by current RPC tier
- **Latency:** Baseline (to be measured)

### Alternative Providers (Example)
- **Helius Professional:** $999/mo for 100 req/s
- **Triton One:** $50 per million requests
- **QuickNode Professional:** $399/mo base + DAS add-on

**Cost-Benefit:** Only switch if benchmarks show significant improvement AND cost is acceptable.

---

## Next Steps

1. ✅ **Research Complete** - Documented all major providers
2. ⏳ **Create Benchmarking Suite** - `test/utils/dasPerformanceTester.ts`
3. ⏳ **Run Benchmarks** - Test current RPC vs alternatives
4. ⏳ **Analyze Results** - Determine if >20% improvement exists
5. ⏳ **Decision Point** - Implement pooling OR document findings only

---

## References

- [Helius DAS API Docs](https://www.helius.dev/docs/das-api)
- [QuickNode DAS API Guide](https://www.quicknode.com/guides/solana-development/nfts/das-api)
- [Triton One DAS API](https://docs.triton.one/digital-assets-api/introduction)
- [Metaplex DAS API Specification](https://developers.metaplex.com/das-api)
- [Solana RPC Providers](https://developers.metaplex.com/rpc-providers)

