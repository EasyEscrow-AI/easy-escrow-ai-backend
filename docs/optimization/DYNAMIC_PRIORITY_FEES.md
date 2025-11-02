# Dynamic Priority Fees with QuickNode API

## Overview

The Easy Escrow AI Backend uses **dynamic priority fees** fetched from QuickNode's Priority Fee API to optimize transaction costs while ensuring fast confirmation on Solana. Instead of using hardcoded static fees, the system queries real-time network conditions and adjusts fees accordingly.

## Why Dynamic Priority Fees?

### Problems with Static Fees

**Before (Hardcoded Fees):**
- ❌ Mainnet: Always 50,000 microlamports
- ❌ Devnet: Always 5,000 microlamports
- ❌ **Overpaying during low network congestion** (wasted SOL)
- ❌ **Underpaying during high congestion** (slow/failed transactions)
- ❌ No adaptation to network conditions

**After (Dynamic Fees):**
- ✅ Mainnet: 5,000-200,000 microlamports (varies with network)
- ✅ Devnet: 1,000-50,000 microlamports (varies with network)
- ✅ **Optimal fees for current network conditions**
- ✅ **Cost savings during low congestion**
- ✅ **Fast confirmation during high congestion**
- ✅ Network-responsive and adaptive

### Real-World Scenarios

**Scenario 1: Low Network Congestion**
```
Static Fee:  50,000 microlamports → Overpaying by 90%
Dynamic Fee:  5,000 microlamports → Cost-optimized
Savings:     45,000 microlamports per transaction
```

**Scenario 2: High Network Congestion**
```
Static Fee:   50,000 microlamports → Transaction slow/dropped
Dynamic Fee: 150,000 microlamports → Fast confirmation
Result: Transaction lands in next block instead of failing
```

## How It Works

### 1. QuickNode Priority Fee API

The system uses QuickNode's `qn_estimatePriorityFees` RPC method to fetch real-time priority fee recommendations.

**API Response Structure:**
```typescript
{
  min: number;        // Minimum fee (slowest, may not land)
  low: number;        // Low priority (slow confirmation)
  medium: number;     // Medium priority (balanced)
  high: number;       // High priority (fast confirmation)
  veryHigh: number;   // Very high priority (fastest)
  unsafeMax: number;  // Maximum observed (not recommended)
}
```

### 2. Priority Selection Strategy

The system selects different priority levels based on the network:

| Network | Priority Level | Reasoning |
|---------|---------------|-----------|
| **Mainnet** | `high` | Fast confirmation is critical for production |
| **Devnet** | `medium` | Balance cost and speed for testing |

### 3. Caching Mechanism

To reduce API calls and improve performance:

- **Cache Duration:** 5 seconds
- **Cache Key:** `${rpcEndpoint}-${isMainnet}`
- **Cache Invalidation:** Automatic after TTL expires

**Benefits:**
- Reduces API calls for rapid transaction sequences
- Improves response time (no API latency)
- Reduces costs (fewer API requests)

**Example:**
```
Time 0s:  API call → 50,000 microlamports (cached)
Time 1s:  Cache hit → 50,000 microlamports (no API call)
Time 4s:  Cache hit → 50,000 microlamports (no API call)
Time 6s:  API call → 45,000 microlamports (cache expired, refresh)
```

### 4. Fallback Safety

If the QuickNode API fails, the system automatically falls back to safe default values:

| Scenario | Fallback Fee | Reasoning |
|----------|--------------|-----------|
| **Mainnet API Failure** | 50,000 microlamports | Safe default from historical data |
| **Devnet API Failure** | 5,000 microlamports | Safe default for testing |
| **Fee Out of Range** | Network-specific fallback | Sanity check protection |

**Sanity Check Range:**
- Minimum: 1,000 microlamports
- Maximum: 1,000,000 microlamports

## Architecture

### PriorityFeeService

**Location:** `src/services/priority-fee.service.ts`

**Key Methods:**

#### `getRecommendedPriorityFee(connection, isMainnet)`

Main method to fetch priority fees with caching and fallback.

```typescript
const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
  connection,
  isMainnet
);
```

**Flow:**
1. Check cache for existing fee (within 5-second TTL)
2. If cache hit: Return cached fee
3. If cache miss: Fetch fresh fee from QuickNode API
4. If API success: Cache and return fee
5. If API failure: Return fallback fee

#### `fetchPriorityFee(connection, isMainnet)` [Private]

Fetches priority fees from QuickNode API.

```typescript
const response = await connection._rpcRequest('qn_estimatePriorityFees', [{}]);
const estimates = response.result as PriorityFeeEstimate;
const recommendedFee = isMainnet ? estimates.high : estimates.medium;
```

#### `clearCache()`

Clears the priority fee cache (useful for testing).

```typescript
PriorityFeeService.clearCache();
```

#### `getCacheStats()`

Returns cache statistics for monitoring.

```typescript
const stats = PriorityFeeService.getCacheStats();
// {
//   size: 2,
//   entries: [
//     { key: 'https://...mainnet', age: 2341 },
//     { key: 'https://...devnet', age: 1203 }
//   ]
// }
```

### Integration with EscrowProgramService

The dynamic priority fee service is integrated into all transaction methods:

**Before (Static Fees):**
```typescript
const priorityFee = isMainnet ? 50_000 : 5_000;
```

**After (Dynamic Fees):**
```typescript
const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
  this.provider.connection,
  isMainnet
);
```

**Applied To:**
- ✅ `initAgreement()` - Agreement initialization
- ✅ `depositNft()` - NFT deposit
- ✅ `depositUsdc()` - USDC deposit

## Cost Analysis

### Transaction Cost Breakdown (Mainnet)

| Component | Cost | Type |
|-----------|------|------|
| **Dynamic Priority Fee** | 5k-200k microlamports | Variable |
| **Jito Tip** | 1,000,000 lamports (0.001 SOL) | Fixed |
| **Compute Budget** | Based on actual CU usage | Variable |

### Example Scenarios

#### Low Congestion Period
```
Priority Fee (Dynamic): 5,000 microlamports
Compute Units Used:     150,000 CU
Fee Cost:              5k × 150k / 1M = 0.00075 SOL

Jito Tip:              0.001 SOL (fixed)

Total Transaction Cost: ~0.00175 SOL
vs. Static (50k fee):   ~0.0085 SOL
Savings:               ~79%
```

#### High Congestion Period
```
Priority Fee (Dynamic): 150,000 microlamports
Compute Units Used:     150,000 CU
Fee Cost:              150k × 150k / 1M = 0.0225 SOL

Jito Tip:              0.001 SOL (fixed)

Total Transaction Cost: ~0.0235 SOL
vs. Static (50k fee):   ~0.0085 SOL (but transaction fails/slow)
Benefit:               Transaction lands fast instead of failing
```

## Monitoring & Observability

### Log Messages

The system provides comprehensive logging for monitoring fee optimization:

#### Cache Hit
```
[PriorityFeeService] Using cached fee: 50000 microlamports (age: 2341ms)
```

#### Fresh API Fetch
```
[PriorityFeeService] Priority fee estimates from QuickNode:
  min: 1000
  low: 5000
  medium: 25000
  high: 50000
  veryHigh: 100000
  unsafeMax: 500000

[PriorityFeeService] Fetched fresh fee: 50000 microlamports (cached for 5000ms)
```

#### Fallback Usage
```
[PriorityFeeService] Failed to fetch priority fee, using fallback: Error: Network timeout
[PriorityFeeService] Using fallback fee: 50000 microlamports (mainnet)
```

#### Sanity Check Warning
```
[PriorityFeeService] Recommended fee 1500000 outside safe range [1000, 1000000], using fallback
```

#### Transaction Application
```
[EscrowProgramService] Using priority fee: 50000 microlamports per CU (mainnet)
```

### Metrics to Monitor

**Key Performance Indicators:**

1. **Cache Hit Rate**
   - Target: > 80% for rapid transaction sequences
   - Calculation: `cache_hits / (cache_hits + cache_misses)`

2. **API Response Time**
   - Target: < 500ms
   - Monitor: Time between API request and response

3. **Fallback Usage Rate**
   - Target: < 1%
   - Monitor: Percentage of transactions using fallback fees

4. **Fee Variation**
   - Monitor: Range of fees returned by API over time
   - Helps identify congestion patterns

5. **Transaction Confirmation Time**
   - Target: < 30 seconds
   - Monitor: Time from submission to confirmation

6. **Cost Savings**
   - Calculate: `(static_fee - dynamic_fee) × transaction_volume`
   - Track over time to measure optimization benefit

### Monitoring Dashboard Example

```
Priority Fee Service - Last 24 Hours
=====================================
Total Transactions:        1,234
Cache Hit Rate:            87.3%
API Response Time (avg):   234ms
Fallback Usage:            0.3%

Fee Statistics:
  Average Fee:    45,231 microlamports
  Minimum Fee:     5,000 microlamports
  Maximum Fee:   180,000 microlamports
  Median Fee:     42,000 microlamports

Cost Savings vs. Static:
  Static Cost (50k):     0.0617 SOL
  Dynamic Cost (avg):    0.0556 SOL
  Total Savings:         0.0061 SOL (9.9%)
```

## Configuration

### Environment Variables

No additional environment variables required. The system uses the existing Solana RPC connection configured in your environment.

**Existing Configuration:**
```bash
# Devnet
SOLANA_RPC_URL=https://your-quicknode-devnet.solana-devnet.quiknode.pro/...

# Mainnet (Production)
SOLANA_RPC_URL=https://your-quicknode-mainnet.solana-mainnet.quiknode.pro/...
```

### Cache Configuration

Cache settings are defined in `PriorityFeeService`:

```typescript
private static readonly CACHE_TTL_MS = 5000; // 5 seconds
```

**To Adjust Cache Duration:**

Edit `src/services/priority-fee.service.ts`:
```typescript
// Increase for longer cache (reduces API calls, less responsive to changes)
private static readonly CACHE_TTL_MS = 10000; // 10 seconds

// Decrease for shorter cache (more API calls, more responsive to changes)
private static readonly CACHE_TTL_MS = 2000; // 2 seconds
```

**Recommendations:**
- **Low-volume systems:** 5-10 seconds (default is optimal)
- **High-volume systems:** 2-3 seconds (more responsive to network changes)
- **Testing/Development:** 0 seconds (disable caching for testing)

### Fallback Fee Configuration

Fallback fees are defined in `PriorityFeeService`:

```typescript
private static readonly FALLBACK_DEVNET_FEE = 5_000;   // 5k microlamports
private static readonly FALLBACK_MAINNET_FEE = 50_000; // 50k microlamports
```

**To Adjust Fallback Fees:**

Based on historical network data, adjust if needed:
```typescript
// More conservative (higher fees, faster confirmation)
private static readonly FALLBACK_MAINNET_FEE = 100_000; // 100k microlamports

// More aggressive (lower fees, cost savings)
private static readonly FALLBACK_MAINNET_FEE = 25_000; // 25k microlamports
```

## Troubleshooting

### Issue 1: High Fallback Usage Rate

**Symptoms:**
- Logs show frequent fallback usage
- API failures in logs

**Possible Causes:**
1. QuickNode API endpoint issues
2. Network connectivity problems
3. Invalid RPC configuration
4. QuickNode plan doesn't support `qn_estimatePriorityFees`

**Solutions:**
1. **Check QuickNode Dashboard:**
   - Verify endpoint is active
   - Check rate limits
   - Verify plan includes Priority Fee API

2. **Test API Manually:**
   ```typescript
   const response = await connection._rpcRequest('qn_estimatePriorityFees', [{}]);
   console.log(response);
   ```

3. **Check Network Connectivity:**
   ```bash
   curl -X POST https://your-quicknode-endpoint \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"qn_estimatePriorityFees","params":[]}'
   ```

4. **Verify RPC URL:**
   - Ensure using QuickNode RPC (not public RPC)
   - Confirm endpoint is correct for network (devnet/mainnet)

### Issue 2: Fees Outside Safe Range

**Symptoms:**
- Warning logs about fees outside safe range
- System using fallback fees instead of API fees

**Possible Causes:**
1. Extreme network congestion
2. API returning invalid data
3. Sanity check thresholds too restrictive

**Solutions:**
1. **Review Sanity Check Range:**
   ```typescript
   const MIN_SAFE_FEE = 1_000;       // 1k microlamports
   const MAX_SAFE_FEE = 1_000_000;   // 1M microlamports
   ```

2. **Adjust if Necessary:**
   - If legitimate high fees during congestion, increase `MAX_SAFE_FEE`
   - If API returning consistently high values, investigate API behavior

3. **Monitor QuickNode API:**
   - Check if API is returning accurate data
   - Compare with other priority fee sources

### Issue 3: Transactions Still Slow Despite Dynamic Fees

**Symptoms:**
- Transactions taking > 60 seconds to confirm
- Dynamic fees applied but confirmation slow

**Possible Causes:**
1. Network is extremely congested
2. Fee still too low for current conditions
3. Other transaction issues (not fee-related)

**Solutions:**
1. **Check Current Network State:**
   - Use Solana Explorer to check recent blocks
   - Compare your fees with successful transactions

2. **Temporarily Increase Priority:**
   ```typescript
   // Use veryHigh instead of high for critical transactions
   const recommendedFee = isMainnet ? estimates.veryHigh : estimates.medium;
   ```

3. **Consider Using Jito Bundles:**
   - For guaranteed inclusion, use Jito's bundle API
   - See `docs/optimization/JITO_BUNDLES.md` (future)

4. **Check Non-Fee Issues:**
   - Verify compute budget is sufficient (300k CU)
   - Check Jito tip is included (mainnet)
   - Verify blockhash is recent

### Issue 4: Cache Not Working

**Symptoms:**
- Every transaction shows "Fetched fresh fee" instead of "Using cached fee"
- High API call rate

**Possible Causes:**
1. Cache key mismatch
2. TTL too short
3. Multiple connection instances

**Solutions:**
1. **Check Cache Key:**
   ```typescript
   console.log('Cache key:', `${connection.rpcEndpoint}-${isMainnet}`);
   ```

2. **Verify TTL:**
   ```typescript
   console.log('Cache TTL:', this.CACHE_TTL_MS);
   ```

3. **Check Cache Stats:**
   ```typescript
   const stats = PriorityFeeService.getCacheStats();
   console.log('Cache stats:', stats);
   ```

4. **Ensure Single Connection:**
   - Verify you're not creating multiple Connection instances
   - Reuse connection across transactions

## Testing

### Unit Tests

**Test Cache Behavior:**
```typescript
describe('PriorityFeeService', () => {
  beforeEach(() => {
    PriorityFeeService.clearCache();
  });

  it('should cache priority fees', async () => {
    const connection = new Connection('https://...');
    
    // First call - should fetch from API
    const fee1 = await PriorityFeeService.getRecommendedPriorityFee(connection, true);
    
    // Second call - should use cache
    const fee2 = await PriorityFeeService.getRecommendedPriorityFee(connection, true);
    
    expect(fee1).toBe(fee2);
    expect(stats.size).toBe(1);
  });

  it('should expire cache after TTL', async () => {
    const connection = new Connection('https://...');
    
    const fee1 = await PriorityFeeService.getRecommendedPriorityFee(connection, true);
    
    // Wait for cache to expire
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    const fee2 = await PriorityFeeService.getRecommendedPriorityFee(connection, true);
    
    // Fees may be different (cache expired, new API call)
    expect(typeof fee2).toBe('number');
  });
});
```

### Integration Tests

**Test Dynamic Fees in Transactions:**
```typescript
describe('EscrowProgramService with Dynamic Fees', () => {
  it('should use dynamic priority fees for initAgreement', async () => {
    const escrowService = new EscrowProgramService();
    
    // Mock PriorityFeeService to return known fee
    const mockFee = 75000;
    jest.spyOn(PriorityFeeService, 'getRecommendedPriorityFee')
      .mockResolvedValue(mockFee);
    
    const result = await escrowService.initAgreement(...);
    
    // Verify mock was called
    expect(PriorityFeeService.getRecommendedPriorityFee).toHaveBeenCalled();
    
    // Verify transaction succeeded
    expect(result.txId).toBeDefined();
  });
});
```

### Manual Testing on Devnet

**Test Different Network Conditions:**

```bash
# 1. Clear cache and test fresh fetch
curl -X POST http://localhost:8080/api/test/clear-fee-cache

# 2. Create agreement and observe fees
curl -X POST http://localhost:8080/api/agreements \
  -H "Content-Type: application/json" \
  -d '{...}'

# 3. Immediately create another (should use cache)
curl -X POST http://localhost:8080/api/agreements \
  -H "Content-Type: application/json" \
  -d '{...}'

# 4. Check logs for cache hit
docker compose logs -f backend | grep PriorityFeeService
```

## Performance Considerations

### API Call Optimization

**Best Practices:**
1. **Batch Transactions:** When creating multiple transactions, they'll benefit from cache
2. **Reuse Connections:** Don't create new Connection instances unnecessarily
3. **Monitor Cache Hit Rate:** Target > 80% for optimal performance

### Cost-Benefit Analysis

**API Costs:**
- QuickNode API calls: Free (included in plan)
- Caching reduces API calls: ~80% reduction

**Transaction Cost Savings:**
- Average savings: 5-15% vs. static fees
- Higher savings during low congestion periods
- Faster confirmation during high congestion

**ROI Calculation:**
```
Assumptions:
- 1,000 transactions/day
- Average savings: 10%
- Static fee cost: 0.01 SOL/tx

Daily Savings:  1,000 × 0.01 × 0.10 = 1 SOL/day
Monthly Savings: 1 SOL × 30 = 30 SOL/month
At $100/SOL:    30 × $100 = $3,000/month
```

## Best Practices

### 1. Monitor Regularly

- Set up alerts for high fallback usage (> 5%)
- Track fee trends over time
- Monitor transaction confirmation times

### 2. Adjust Strategy Based on Data

- Review fee logs weekly
- Adjust priority levels if needed (high vs. veryHigh)
- Update fallback fees based on network trends

### 3. Handle Edge Cases

- Implement retry logic for failed transactions
- Consider using higher priorities for critical transactions
- Have manual override capability for emergencies

### 4. Test Before Production

- Test dynamic fees thoroughly on devnet
- Verify fallback behavior
- Monitor cache performance under load

### 5. Document Changes

- Log all configuration changes
- Track cost savings metrics
- Share insights with team

## Future Enhancements

### 1. Multi-Provider Fallback

Fetch fees from multiple providers and use median:
```typescript
const quickNodeFee = await fetchFromQuickNode();
const heliusFee = await fetchFromHelius();
const tritonFee = await fetchFromTriton();

const medianFee = median([quickNodeFee, heliusFee, tritonFee]);
```

### 2. Machine Learning Optimization

Train model to predict optimal fees based on:
- Time of day
- Historical network patterns
- Transaction type
- Urgency level

### 3. User-Configurable Priority

Allow users to choose priority level:
```typescript
enum PriorityLevel {
  ECO = 'low',      // Cheapest, slower
  STANDARD = 'medium', // Balanced
  FAST = 'high',    // Faster, more expensive
  URGENT = 'veryHigh' // Fastest, most expensive
}
```

### 4. Adaptive Cache TTL

Adjust cache duration based on network volatility:
```typescript
// High volatility: shorter cache (2s)
// Low volatility: longer cache (10s)
const adaptiveTTL = calculateTTL(networkVolatility);
```

### 5. Fee Simulation

Simulate transaction with different fees to predict confirmation time:
```typescript
const simulation = await simulateFees(transaction, [low, medium, high]);
// { low: 45s, medium: 15s, high: 5s }
```

## Related Documentation

- [Jito Tips Implementation](./JITO_TIPS.md)
- [Transaction Optimization Guide](./TRANSACTION_OPTIMIZATION_GUIDE.md) *(coming soon)*
- [Compute Unit Simulation](./COMPUTE_UNIT_SIMULATION.md) *(coming soon)*
- [QuickNode Integration](./QUICKNODE_INTEGRATION.md) *(coming soon)*

## References

- [QuickNode Priority Fee API Documentation](https://www.quicknode.com/docs/solana/qn_estimatePriorityFees)
- [Solana Priority Fees Guide](https://solana.com/developers/guides/advanced/how-to-use-priority-fees)
- [Solana Compute Budget Program](https://docs.solana.com/developing/programming-model/runtime#compute-budget)

## Support

For issues or questions about dynamic priority fees:

1. Check this documentation
2. Review logs for error messages
3. Test API manually with curl
4. Contact DevOps team for QuickNode access issues
5. File GitHub issue with detailed logs

---

**Last Updated:** October 28, 2024  
**Version:** 1.0.0  
**Status:** ✅ Production Ready







