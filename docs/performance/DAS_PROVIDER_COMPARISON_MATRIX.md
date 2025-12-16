# DAS API Provider Comparison Matrix

**Date:** December 16, 2025  
**Status:** Research Complete - Benchmarks Pending

---

## Provider Comparison

| Provider | DAS Setup | getAssetProofBatch | Rate Limits | Pricing | Best For |
|----------|-----------|-------------------|-------------|---------|----------|
| **Helius** | ✅ Automatic | ✅ Yes | 2-100 req/s | Credit-based | Market leader, enhanced features |
| **QuickNode** | ⚙️ Add-on | ✅ Yes | 100 req/s | Credit-based | Multi-chain apps |
| **Triton One** | ✅ Automatic | ✅ Yes | Tier-based | $50/1M requests | Transparent pricing |
| **GetBlock** | ✅ Free add-on | ✅ Yes | CU-based | Tier-based | Easy setup |
| **Extrnode** | ✅ Automatic | ✅ Yes | 5-50+ req/s | Credit-based | Decentralized infra |
| **Alchemy** | ✅ Automatic | ✅ Yes | Tier-based | CU-based | Enterprise (Beta) |

---

## Detailed Provider Information

### Helius

**Endpoint Format:**
```
https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

**Rate Limits:**
- Free: 2 req/s
- Developer ($49/mo): 10 req/s
- Business ($499/mo): 50 req/s
- Professional ($999/mo): 100 req/s

**Features:**
- Enhanced DAS API
- WebSocket subscriptions
- Webhook support
- LaserStream gRPC

**Pricing:** Credit-based monthly subscriptions

**Best For:** Production applications requiring reliability and features

---

### QuickNode

**Endpoint Format:**
```
https://your-endpoint.quiknode.pro/auth-token/
```

**Rate Limits:**
- Professional: 100 DAS req/s
- Additional 100 RPS: $100/mo

**Features:**
- Multi-chain infrastructure
- Marketplace add-ons
- Solana Kit SDK

**Pricing:** Credit-based, $0.53 per million additional requests

**Best For:** Multi-chain applications

---

### Triton One

**Endpoint Format:**
```
Standard RPC Pool endpoints
```

**Rate Limits:**
- Aligned with RPC Pool tier

**Features:**
- Performance-focused
- Project Yellowstone optimizations
- Per-request billing

**Pricing:** $50 per million DAS requests

**Best For:** Applications with variable request patterns

---

### GetBlock

**Endpoint Format:**
```
Dedicated node URLs
```

**Rate Limits:**
- Based on compute units (CU)

**Features:**
- Pre-configured nodes
- Easy setup
- Free DAS add-on

**Pricing:** Tier-based ($0-$200+/mo)

**Best For:** Developers new to DAS API

---

### Extrnode

**Endpoint Format:**
```
Decentralized RPC gateway
```

**Rate Limits:**
- Free: 5 req/s
- Basic ($25/mo): 50 req/s
- Professional ($99/mo): Custom

**Features:**
- Decentralized infrastructure
- Community-driven

**Pricing:** Credit-based with bonus credits

**Best For:** Decentralized applications

---

### Alchemy

**Endpoint Format:**
```
Standard Alchemy endpoints
```

**Rate Limits:**
- Tier-based (Standard/Advanced/Professional/Enterprise)

**Features:**
- Enterprise-grade
- Multi-chain support
- Beta status

**Pricing:** CU-based (getAsset: 80 CU, getAssetProof: 480 CU)

**Best For:** Enterprise applications (when out of beta)

---

## Benchmark Results (To Be Completed)

**Status:** Benchmarks pending API keys and test execution

**To Run:**
```bash
npm run test:das:benchmark
```

**Expected Output:**
- Latency comparisons (p50, p95, p99)
- Throughput measurements
- Success rate analysis
- Cost comparisons
- Recommendations

---

## Decision Matrix

### When to Switch Provider

✅ **Switch if:**
- Benchmark shows >20% latency improvement
- Success rate improvement >5%
- Cost is acceptable
- Provider reliability is better

❌ **Don't switch if:**
- Performance improvement <20%
- Cost increase exceeds benefit
- Current provider is reliable

### When to Implement Multi-Provider Pooling

✅ **Implement pooling if:**
- Multiple providers show 10-20% improvement
- Need failover redundancy
- Want to distribute load
- Cost is acceptable

❌ **Don't implement pooling if:**
- Single provider is clearly best
- Complexity not justified
- Cost increase is significant

---

## Cost Analysis Examples

### Scenario 1: 10M DAS Requests/Month

| Provider | Monthly Cost | Notes |
|----------|-------------|-------|
| Helius Professional | $999 | Includes 200M credits |
| Triton One | $500 | $50/1M × 10M |
| QuickNode Professional | $399 + overage | Base + credits |

### Scenario 2: 100M DAS Requests/Month

| Provider | Monthly Cost | Notes |
|----------|-------------|-------|
| Helius Professional | $999 + overage | May need Enterprise |
| Triton One | $5,000 | $50/1M × 100M |
| QuickNode Professional | $399 + overage | Significant overage |

---

## Recommendations

### For Current Implementation

1. **Benchmark current RPC** to establish baseline
2. **Test 2-3 alternative providers** if API keys available
3. **Compare results** using >20% improvement threshold
4. **Document findings** regardless of outcome

### For Future Optimization

1. **Monitor DAS API performance** quarterly
2. **Re-benchmark** when provider offerings change
3. **Consider pooling** if multiple providers show promise
4. **Optimize caching** before switching providers

---

## References

- [Helius DAS API Docs](https://www.helius.dev/docs/das-api)
- [QuickNode DAS API Guide](https://www.quicknode.com/guides/solana-development/nfts/das-api)
- [Triton One DAS API](https://docs.triton.one/digital-assets-api/introduction)
- [Metaplex DAS API Specification](https://developers.metaplex.com/das-api)

