# Redis Setup Guide

This document describes the Redis configuration and setup for EasyEscrow.ai caching and job queues.

## Overview

Redis is used in the EasyEscrow.ai backend for:

1. **Caching**: Agreement data caching to improve lookup performance and reduce database load
2. **Job Queues**: Asynchronous task processing for blockchain monitoring and settlement operations

## Dependencies

The following npm packages are installed:

- `ioredis`: Redis client library for Node.js
- `bull`: Redis-based job queue system
- `@types/ioredis`: TypeScript types for ioredis
- `@types/bull`: TypeScript types for Bull

## Environment Variables

Add the following environment variables to your `.env` file:

### Simple Configuration (using REDIS_URL)

```env
REDIS_URL=redis://localhost:6379
```

### Detailed Configuration

If you need more control, you can use individual configuration variables:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TLS=false
```

### Production Configuration

For production environments (e.g., Redis Cloud, AWS ElastiCache):

```env
REDIS_URL=rediss://username:password@your-redis-host:6380
REDIS_TLS=true
```

## Local Development Setup

### Option 1: Using Docker

```bash
docker run -d -p 6379:6379 --name redis redis:latest
```

### Option 2: Using Windows

1. Download Redis from [Redis Windows](https://github.com/microsoftarchive/redis/releases)
2. Install and run Redis service
3. Default configuration will run on `localhost:6379`

### Option 3: Using WSL2

```bash
sudo apt-get update
sudo apt-get install redis-server
sudo service redis-server start
```

## Verify Redis Connection

After starting Redis, you can verify the connection:

```bash
# Using redis-cli
redis-cli ping
# Should return: PONG
```

Or test from the application:

```bash
npm run dev
# Look for: ✅ Redis client connected
```

## Services

### Cache Service (`cache.service.ts`)

Generic caching service with:
- Get/Set/Delete operations
- TTL (Time To Live) management
- Pattern-based deletion
- Bulk operations (mget, mset)

### Agreement Cache Service (`agreement-cache.service.ts`)

Specialized caching for agreements:
- Cache-aside pattern implementation
- Lookup by ID or escrow address
- Automatic cache invalidation on updates
- User agreement caching

### Queue Service (`queue.service.ts`)

Base job queue infrastructure:
- Job priority handling
- Automatic retry with exponential backoff
- Dead letter queue for failed jobs
- Job metrics and monitoring

### Blockchain Monitoring Queue (`blockchain-monitoring-queue.service.ts`)

Handles blockchain-related background tasks:
- Deposit scanning
- Transaction confirmation verification
- Agreement monitoring
- Expiry checks
- Blockchain reorganization handling

### Settlement Processing Queue (`settlement-processing-queue.service.ts`)

Handles settlement-related background tasks:
- Release funds operations
- Refund processing
- Scheduled settlements
- Dispute resolution
- Fee distribution

## Usage Examples

### Caching an Agreement

```typescript
import { agreementCacheService } from './services/agreement-cache.service';

// Get agreement (with caching)
const agreement = await agreementCacheService.getAgreementById(agreementId);

// Manually cache an agreement
await agreementCacheService.cacheAgreement(agreement);

// Invalidate cache when agreement is updated
await agreementCacheService.invalidateAgreement(agreement);
```

### Scheduling Blockchain Monitoring

```typescript
import { blockchainMonitoringQueue } from './services/blockchain-monitoring-queue.service';

// Schedule agreement monitoring
await blockchainMonitoringQueue.scheduleAgreementMonitoring(
  agreementId,
  escrowAddress,
  monitorUntilTimestamp
);

// Schedule expiry check
await blockchainMonitoringQueue.scheduleExpiryCheck(
  agreementId,
  expiryTimestamp
);
```

### Scheduling Settlement

```typescript
import { settlementProcessingQueue } from './services/settlement-processing-queue.service';

// Schedule release funds
await settlementProcessingQueue.scheduleReleaseFunds(
  agreementId,
  escrowAddress,
  buyerWallet,
  sellerWallet,
  amount,
  platformFee,
  initiatedBy
);

// Schedule timed settlement
await settlementProcessingQueue.scheduleTimedSettlement(
  agreementId,
  escrowAddress,
  scheduledTimestamp,
  'release',
  initiatedBy
);
```

## Configuration Options

### Cache TTL Configuration

Default TTL values:
- Generic cache: 3600 seconds (1 hour)
- Agreement cache: 1800 seconds (30 minutes)
- User agreements list: 300 seconds (5 minutes)

You can customize TTL when creating cache services:

```typescript
const customCache = new CacheService({
  ttl: 7200, // 2 hours
  prefix: 'custom:',
});
```

### Queue Job Options

Default job options:
- Blockchain monitoring: 5 attempts, 5-second backoff
- Settlement processing: 3 attempts, 10-second backoff
- Completed job retention: 24-72 hours
- Job timeout: 2 minutes (settlements)

## Monitoring and Maintenance

### View Queue Metrics

```typescript
import { blockchainMonitoringQueue } from './services/blockchain-monitoring-queue.service';

const metrics = await blockchainMonitoringQueue.getMetrics();
console.log(metrics);
// Output: { waiting, active, completed, failed, delayed, paused }
```

### Retry Failed Jobs

```typescript
// Retry all failed jobs in a queue
const retriedCount = await blockchainMonitoringQueue.retryFailedJobs();

// Retry a specific job
await blockchainMonitoringQueue.retryJob(jobId);
```

### Clean Old Jobs

```typescript
// Clean jobs older than 24 hours
await blockchainMonitoringQueue.cleanOldJobs(86400000);
```

### Clear Cache

```typescript
// Clear all agreement caches
await agreementCacheService.clearAllCache();

// Clear specific cache
await cacheService.delete(cacheKey);
```

## Production Considerations

### Redis Persistence

Configure Redis persistence for production:

```conf
# redis.conf
save 900 1
save 300 10
save 60 10000
```

### Redis Memory Management

Set max memory and eviction policy:

```conf
maxmemory 2gb
maxmemory-policy allkeys-lru
```

### Connection Pooling

The Redis configuration includes connection pooling:
- Automatic reconnection on failure
- Connection health checks
- Retry strategy with exponential backoff

### Monitoring

Monitor Redis in production:
- Use `redis-cli INFO` for server stats
- Monitor queue metrics via application endpoints
- Set up alerts for failed jobs
- Track cache hit/miss ratios

## Troubleshooting

### Connection Issues

If Redis connection fails:

1. Check Redis is running: `redis-cli ping`
2. Verify REDIS_URL is correct
3. Check firewall rules
4. Review application logs for connection errors

### Job Processing Issues

If jobs are not processing:

1. Check queue metrics for stalled jobs
2. Review failed jobs: `getFailedJobs()`
3. Check worker concurrency settings
4. Verify job processor is running

### Cache Issues

If cache is not working:

1. Verify Redis connection
2. Check cache key patterns
3. Review TTL settings
4. Monitor cache hit/miss ratios

## Additional Resources

- [ioredis Documentation](https://github.com/luin/ioredis)
- [Bull Queue Documentation](https://github.com/OptimalBits/bull)
- [Redis Documentation](https://redis.io/documentation)
- [Redis Best Practices](https://redis.io/topics/best-practices)

