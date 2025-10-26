# STAGING Resource Usage Tracking System

**Date:** October 27, 2025  
**Status:** ✅ IMPLEMENTED  
**Version:** 1.0.0

## Overview

This document describes the comprehensive resource usage tracking and monitoring system implemented for the STAGING environment. The system enables production cost prediction, efficiency optimization, and resource leak identification across all infrastructure components.

## Purpose

The resource tracking system serves three primary objectives:

1. **Cost Prediction**: Project mainnet production costs based on staging usage patterns
2. **Optimization**: Identify inefficiencies and opportunities for resource optimization
3. **Monitoring**: Detect resource leaks, anomalies, and performance degradation

## Architecture

### Core Services

#### 1. Resource Tracker Service (`resource-tracker.service.ts`)

The central hub for all resource metrics collection and storage.

**Responsibilities:**
- Collect metrics from all resource categories
- Store metrics in Redis with TTL
- Generate alerts when thresholds are exceeded
- Produce daily and weekly reports
- Maintain historical data for trend analysis

**Tracked Metrics:**
- SOL usage (transaction fees, wallet balances)
- Database performance (query duration, slow queries, connections)
- Redis metrics (memory usage, hit rate, key count)
- RPC calls (request count, response time, error rate)
- Compute resources (CPU, memory, network bandwidth)

#### 2. SOL Tracker Service (`sol-tracker.service.ts`)

Specialized service for tracking Solana blockchain costs.

**Features:**
- Track SOL consumption per agreement lifecycle stage
- Monitor wallet balances and alert on low balances
- Track wallet refill frequency and patterns
- Calculate average SOL consumption per operation type
- Estimate total agreement lifecycle costs

**Lifecycle Stages Tracked:**
- `initialization`: Agreement creation
- `usdc_deposit`: USDC deposit confirmation
- `nft_deposit`: NFT deposit confirmation
- `settlement`: Agreement settlement
- `cancellation`: Agreement cancellation
- `refund`: Refund processing

#### 3. Database Tracker Service (`database-tracker.service.ts`)

Monitors PostgreSQL database performance and health.

**Features:**
- Track query execution times
- Identify and log slow queries
- Monitor active connection count
- Track database storage growth
- Generate performance reports by query type and table
- Monitor database health status

#### 4. Cost Analyzer Service (`cost-analyzer.service.ts`)

Analyzes usage patterns and projects production costs.

**Features:**
- Calculate mainnet cost projections from devnet usage
- Compare devnet vs mainnet costs
- Identify optimization opportunities
- Calculate ROI for optimization implementations
- Track cost trends over time
- Generate weekly cost reports

## Alert Thresholds

### SOL Thresholds

```typescript
SOL_PER_TX: 0.01              // Alert if transaction > 0.01 SOL
WALLET_BALANCE_LOW: 1.0       // Alert if wallet < 1 SOL
WALLET_BALANCE_CRITICAL: 0.5  // Critical alert if wallet < 0.5 SOL
```

### Database Thresholds

```typescript
SLOW_QUERY: 1000              // Alert if query > 1 second
ACTIVE_CONNECTIONS_HIGH: 50   // Alert if > 50 active connections
```

### Redis Thresholds

```typescript
MEMORY_USAGE_HIGH: 500MB      // Alert if memory > 500MB
HIT_RATE_LOW: 0.7            // Alert if hit rate < 70%
```

### RPC Thresholds

```typescript
RPC_RESPONSE_SLOW: 2000       // Alert if response > 2 seconds
RPC_ERROR_RATE_HIGH: 0.05     // Alert if error rate > 5%
```

### Compute Thresholds

```typescript
CPU_USAGE_HIGH: 80            // Alert if CPU > 80%
MEMORY_USAGE_HIGH: 85         // Alert if memory > 85%
```

## Usage Examples

### Tracking SOL Usage in Agreement Operations

```typescript
import { solTracker, AgreementStage } from '../services/sol-tracker.service';

// Track agreement initialization
const txSignature = await solTracker.trackAgreementLifecycle(
  agreementId,
  AgreementStage.INITIALIZATION,
  senderWallet.publicKey,
  async () => {
    // Your transaction logic here
    return await sendTransaction();
  }
);
```

### Tracking Database Queries

```typescript
import { databaseTracker } from '../services/database-tracker.service';

const startTime = Date.now();

// Execute your query
const result = await prisma.agreement.findMany({
  where: { status: 'PENDING' }
});

// Track the query
await databaseTracker.trackQueryPerformance(
  'SELECT * FROM agreements WHERE status = $1',
  startTime,
  'SELECT',
  'agreements',
  result.length
);
```

### Tracking Redis Operations

```typescript
import { resourceTracker } from '../services/resource-tracker.service';

// Track Redis metrics periodically
await resourceTracker.trackRedisMetrics('GET');
```

### Tracking RPC Calls

```typescript
import { resourceTracker } from '../services/resource-tracker.service';

const startTime = Date.now();

// Make RPC call
const balance = await connection.getBalance(publicKey);

// Track the call
await resourceTracker.trackRpcCall(
  'getBalance',
  Date.now() - startTime,
  'https://api.devnet.solana.com'
);
```

### Generating Cost Projections

```typescript
import { costAnalyzer } from '../services/cost-analyzer.service';

// Generate mainnet cost projection based on 7 days of devnet usage
const projection = await costAnalyzer.calculateMainnetProjection(7);

console.log(`Estimated monthly SOL cost: ${projection.estimatedMonthlySol} SOL`);
console.log(`Estimated monthly USD cost: $${projection.estimatedMonthlySolUsd}`);
console.log(`Total monthly cost: $${projection.totalMonthlyCost}`);

// Review optimization opportunities
for (const opportunity of projection.optimizationOpportunities) {
  console.log(`[${opportunity.severity}] ${opportunity.title}`);
  console.log(`  Savings: $${opportunity.estimatedSavings}/month (${opportunity.estimatedSavingsPercent}%)`);
  console.log(`  Implementation: ${opportunity.implementation}`);
}
```

### Generating Reports

```typescript
import { resourceTracker } from '../services/resource-tracker.service';
import { costAnalyzer } from '../services/cost-analyzer.service';
import { databaseTracker } from '../services/database-tracker.service';
import { solTracker } from '../services/sol-tracker.service';

// Daily resource report
const dailyReport = await resourceTracker.generateDailyReport();

// Weekly cost analysis
const weeklyReport = await costAnalyzer.generateWeeklyReport();

// Database performance report
const dbReport = await databaseTracker.getDatabasePerformanceReport();

// SOL consumption report
const solReport = await solTracker.getSolConsumptionReport(7);
```

## Report Structure

### Resource Report

```typescript
{
  period: { start: Date, end: Date },
  summary: {
    totalSolConsumed: number,
    totalTransactions: number,
    averageSolPerTransaction: number,
    totalDatabaseQueries: number,
    slowQueryCount: number,
    averageQueryDuration: number,
    redisMemoryPeak: number,
    redisHitRate: number,
    totalRpcCalls: number,
    averageRpcResponseTime: number,
    rpcErrorRate: number
  },
  recommendations: string[],
  alerts: ResourceAlert[]
}
```

### Cost Projection

```typescript
{
  period: 'monthly',
  estimatedMonthlySol: number,
  estimatedMonthlySolUsd: number,
  databaseCosts: {
    monthly: number,
    storage: number,
    compute: number
  },
  redisCosts: {
    monthly: number,
    memory: number,
    operations: number
  },
  rpcCosts: {
    monthly: number,
    requestCount: number,
    estimatedCostPerRequest: number
  },
  totalMonthlyCost: number,
  optimizationOpportunities: OptimizationOpportunity[],
  assumptions: string[]
}
```

## Cost Calculation Formulas

### SOL Costs

```
Mainnet SOL per Transaction = Devnet SOL per Transaction × 1.2
Monthly SOL Cost = Mainnet SOL per Transaction × Monthly Transactions
Monthly USD Cost = Monthly SOL Cost × Current SOL Price
```

### Database Costs

```
Monthly Database Cost = Database Size (GB) × $0.25 × 30 days
  - Storage: 60% of total
  - Compute: 40% of total
```

### Redis Costs

```
Monthly Redis Cost = Redis Memory (GB) × $0.30 × 30 days
  - Memory: 70% of total
  - Operations: 30% of total
```

### RPC Costs

```
Monthly RPC Cost = (Monthly Requests / 1,000,000) × $50
```

## Optimization Recommendations

### High Priority

1. **Transaction Optimization**
   - **Trigger**: Average SOL per transaction > 0.005
   - **Action**: Batch operations, optimize instruction data
   - **Expected Savings**: 20-30%

2. **Database Query Optimization**
   - **Trigger**: Slow query rate > 10%
   - **Action**: Add indexes, optimize JOINs, implement caching
   - **Expected Savings**: 15-25%

### Medium Priority

3. **Cache Hit Rate Improvement**
   - **Trigger**: Redis hit rate < 80%
   - **Action**: Adjust TTLs, implement cache warming
   - **Expected Savings**: 10-15%

4. **RPC Call Optimization**
   - **Trigger**: Average RPC response time > 1 second
   - **Action**: Batch requests, use WebSocket subscriptions
   - **Expected Savings**: 8-12%

## Alert Response Procedures

### Critical Alerts (Immediate Action Required)

#### Low Wallet Balance (< 0.5 SOL)
1. Immediately check wallet balance
2. Initiate SOL airdrop or transfer
3. Verify transaction processing continues
4. Document refill in tracking system

#### High Active Connections (> 50)
1. Check for connection leaks in application code
2. Review recent deployments for connection pool issues
3. Restart application if necessary
4. Monitor connection count for 30 minutes

### High Alerts (Action Within 1 Hour)

#### High SOL Usage per Transaction (> 0.01 SOL)
1. Identify the operation causing high usage
2. Review transaction structure
3. Check for unnecessary account creation
4. Optimize if pattern persists

#### High Redis Memory (> 500MB)
1. Check for memory leaks
2. Review cache key patterns
3. Adjust TTLs if necessary
4. Consider increasing Redis instance size

### Medium Alerts (Action Within 24 Hours)

#### Slow Queries
1. Log query for analysis
2. Check execution plan
3. Add indexes if beneficial
4. Optimize query structure

#### Low Cache Hit Rate (< 70%)
1. Review cache key strategies
2. Analyze cache miss patterns
3. Adjust TTLs
4. Implement cache warming if needed

## Monitoring Schedule

### Real-Time Monitoring
- SOL wallet balances (continuous)
- Active database connections (continuous)
- RPC error rates (continuous)

### Hourly Monitoring
- Redis memory usage
- Database query performance
- RPC response times

### Daily Reports
- Resource usage summary
- Alert summary
- Cost projections

### Weekly Reports
- Comprehensive cost analysis
- Optimization recommendations
- Trend analysis
- ROI calculations for optimizations

## Data Retention

- **Metrics**: 7 days (168 hours)
- **Alerts**: 24 hours
- **Reports**: 30 days (stored separately)

Old data is automatically cleaned up by the resource tracker service.

## Integration Points

### Existing Services

The resource tracking system integrates with:

1. **Agreement Service**: Track SOL usage during agreement operations
2. **Settlement Service**: Track settlement costs
3. **Deposit Services**: Track deposit confirmation costs
4. **Monitoring Services**: Track blockchain monitoring costs
5. **Queue Services**: Track queue processing costs

### Future Enhancements

1. **Grafana Dashboard**: Real-time visualization of metrics
2. **Automated Optimization**: Automatic implementation of low-risk optimizations
3. **Predictive Alerts**: ML-based anomaly detection
4. **Cost Attribution**: Track costs per user/agreement
5. **Budget Alerts**: Alert when approaching budget thresholds

## Testing

### Unit Tests

Test coverage includes:
- Metric collection and storage
- Alert threshold detection
- Report generation
- Cost calculation accuracy

### Integration Tests

Test coverage includes:
- End-to-end tracking flows
- Multi-service integration
- Report generation with real data
- Alert delivery

### Performance Tests

Test coverage includes:
- Metric collection overhead
- Storage performance
- Report generation speed
- Query performance impact

## Troubleshooting

### Metrics Not Being Collected

1. Check Redis connection
2. Verify service initialization
3. Check for errors in logs
4. Ensure tracking calls are being made

### Alerts Not Firing

1. Verify alert thresholds in configuration
2. Check Redis storage of alerts
3. Review alert creation logic
4. Check console output for alert logs

### Inaccurate Cost Projections

1. Verify sufficient historical data (minimum 7 days)
2. Check pricing assumptions in cost analyzer
3. Review transaction count estimates
4. Validate mainnet multiplier

### High Resource Tracking Overhead

1. Reduce metric collection frequency
2. Implement sampling for high-volume operations
3. Optimize Redis storage
4. Review data retention policies

## Security Considerations

1. **Sensitive Data**: Metrics do not contain sensitive user data
2. **Access Control**: Reports should be access-controlled
3. **Data Retention**: Automatic cleanup prevents data accumulation
4. **Alert Privacy**: Alerts do not expose private keys or sensitive information

## Maintenance

### Regular Tasks

- **Daily**: Review alerts and take action
- **Weekly**: Generate and review cost reports
- **Monthly**: Review optimization opportunities and implement high-ROI items
- **Quarterly**: Review and adjust alert thresholds

### Updates

When updating the system:
1. Review and update pricing assumptions
2. Adjust alert thresholds based on experience
3. Add new metrics as needed
4. Update documentation

## References

- [Resource Tracker Service](../../src/services/resource-tracker.service.ts)
- [SOL Tracker Service](../../src/services/sol-tracker.service.ts)
- [Database Tracker Service](../../src/services/database-tracker.service.ts)
- [Cost Analyzer Service](../../src/services/cost-analyzer.service.ts)

## Changelog

### Version 1.0.0 (October 27, 2025)
- Initial implementation
- Core tracking services
- Alert system
- Cost projection
- Comprehensive documentation

