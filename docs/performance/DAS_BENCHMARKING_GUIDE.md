# DAS API Benchmarking Guide

**Date:** December 16, 2025  
**Purpose:** Guide for running DAS API performance benchmarks to evaluate provider options

---

## Overview

The DAS API benchmarking suite compares performance across multiple RPC providers to determine if switching providers or implementing multi-provider pooling would provide >20% performance improvement.

---

## Prerequisites

1. **Test Asset IDs**: At least 100 cNFT asset IDs for batch testing
   - Load from `tests/fixtures/production-test-assets.json`
   - Or provide via environment variable

2. **API Keys** (optional, for additional providers):
   - `HELIUS_API_KEY`: Helius API key
   - `QUICKNODE_ENDPOINT`: QuickNode endpoint URL
   - `TRITON_ENDPOINT`: Triton One endpoint URL

3. **Current RPC Endpoint**:
   - `CURRENT_RPC_ENDPOINT` or `SOLANA_RPC_URL` or `MAINNET_RPC_URL`

---

## Running Benchmarks

### Basic Usage

```bash
# Set environment variables
export CURRENT_RPC_ENDPOINT="https://your-rpc-endpoint.com"
export HELIUS_API_KEY="your-helius-key"  # Optional

# Run benchmarks
npm run test:das:benchmark
```

### Output

**Console Output:**
- Formatted results with metrics per provider
- Comparison against baseline
- Recommendations (keep/switch/pool)

**File Output:**
- `temp/das-benchmark-results.json` - Complete results in JSON format

---

## Benchmark Metrics

### Test Scenarios

1. **Single `getAsset`** - Baseline single asset retrieval
2. **Single `getAssetProof`** - Single proof retrieval
3. **`getAssetProofBatch` (10 assets)** - Small batch
4. **`getAssetProofBatch` (50 assets)** - Medium batch
5. **`getAssetProofBatch` (100 assets)** - Large batch

### Metrics Collected

- **p50 Latency**: Median response time
- **p95 Latency**: 95th percentile (handles outliers)
- **p99 Latency**: 99th percentile (worst-case)
- **Average Latency**: Mean response time
- **Throughput**: Requests per second
- **Success Rate**: Percentage of successful requests
- **Error Rate**: Percentage of failed requests
- **Rate Limit Hits**: Number of 429 errors

---

## Interpreting Results

### Performance Improvement Thresholds

- **>20% improvement**: Consider switching provider or implementing pooling
- **10-20% improvement**: Consider multi-provider pooling
- **<10% improvement**: Keep current provider

### Example Output

```
📊 HELIUS
--------------------------------------------------------------------------------
Overall Avg Latency: 245.32ms
Overall P95 Latency: 512.67ms
Overall Success Rate: 98.50%
Overall Throughput: 4.08 req/s
Improvement vs Baseline: +15.23%
Recommendation: POOL
```

---

## Benchmark Configuration

### Adjusting Iterations

Edit `scripts/testing/run-das-benchmarks.ts`:

```typescript
const config: DasBenchmarkConfig = {
  providers,
  testAssetIds,
  iterations: 30, // Increase for more accurate results (default: 10)
  metrics: 'all',
};
```

**Recommendations:**
- **Development**: 10 iterations (faster)
- **Production**: 30-50 iterations (more accurate)
- **CI/CD**: 20 iterations (balance)

---

## Best Practices

### 1. Run During Low Congestion

- Avoid peak hours (evenings, weekends)
- Use Solana Beach/Explorer to check network status
- Run multiple times and average results

### 2. Use Real Asset IDs

- Use actual cNFT asset IDs from production
- Ensure assets exist and are accessible
- Include mix of high/low activity trees

### 3. Test Multiple Times

- Run benchmarks 3+ times
- Average results for accuracy
- Account for network variability

### 4. Monitor Rate Limits

- Watch for 429 errors
- Adjust delays between requests if needed
- Respect provider rate limits

---

## Troubleshooting

### No Test Assets Available

**Error:** `Only X test asset IDs available`

**Solution:**
1. Update `tests/fixtures/production-test-assets.json` with real cNFT IDs
2. Or set `TEST_ASSET_IDS` environment variable (comma-separated)

### Rate Limit Errors

**Error:** `429 Too Many Requests`

**Solution:**
1. Increase delay between requests in `dasPerformanceTester.ts`
2. Reduce `iterations` count
3. Use provider with higher rate limits

### Provider Not Responding

**Error:** `Network error` or timeout

**Solution:**
1. Verify endpoint URL is correct
2. Check API key is valid
3. Test endpoint manually with curl/Postman
4. Check provider status page

---

## Next Steps After Benchmarking

### If >20% Improvement Found

1. **Document findings** in `docs/performance/DAS_API_OPTIMIZATION_RESEARCH.md`
2. **Evaluate costs** - Compare provider pricing
3. **Implement multi-provider pooling** (Task 71 Subtask 4)
4. **Update configuration** to use new provider(s)

### If <20% Improvement

1. **Document findings** - Keep current provider
2. **Monitor performance** - Re-benchmark quarterly
3. **Consider other optimizations** - Caching, batching, etc.

---

## Related Documentation

- [DAS API Optimization Research](./DAS_API_OPTIMIZATION_RESEARCH.md)
- [cNFT Batch Proof Fetching Analysis](../CNFT_BATCH_PROOF_FETCHING_ANALYSIS.md)

---

## Example Benchmark Results

```json
{
  "timestamp": "2025-12-16T12:00:00.000Z",
  "summaries": [
    {
      "provider": "Current RPC",
      "overallAvgLatencyMs": 289.45,
      "overallP95LatencyMs": 567.23,
      "overallSuccessRate": 0.98,
      "recommendation": "keep"
    },
    {
      "provider": "Helius",
      "overallAvgLatencyMs": 245.32,
      "overallP95LatencyMs": 512.67,
      "overallSuccessRate": 0.985,
      "improvementPercent": 15.23,
      "recommendation": "pool"
    }
  ]
}
```

