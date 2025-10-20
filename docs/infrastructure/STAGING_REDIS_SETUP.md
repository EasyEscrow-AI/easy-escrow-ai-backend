# STAGING Redis Setup

This document describes the Redis Cloud configuration for the STAGING environment.

## Overview

STAGING uses **Redis Cloud** (redis.io) for caching, idempotency keys, and Bull job queues.

## Why Redis Cloud?

After migrating from Upstash, we chose Redis Cloud because:

✅ **Full Redis Compatibility**: Supports all Lua scripts required by Bull queues  
✅ **No Limitations**: Unlike Upstash, no restrictions on dynamic key generation  
✅ **Production-Grade**: Same infrastructure as production  
✅ **TLS Encryption**: Secure connections out of the box  
✅ **Geographic Distribution**: Available in multiple regions  

## STAGING Redis Instance Details

| Property | Value |
|----------|-------|
| **Provider** | Redis Cloud (redis.io) |
| **Region** | AP Southeast 1 (Singapore) |
| **Host** | `redis-19320.c1.ap-southeast-1-1.ec2.redns.redis-cloud.com` |
| **Port** | `19320` |
| **TLS** | ✅ Enabled |
| **Password** | `C2FFCNjuy43x5U0GwWCdMIFjNoLpbEQJ` |
| **Environment** | STAGING (isolated from DEV/PROD) |

## Connection String

```bash
REDIS_URL="redis://default:C2FFCNjuy43x5U0GwWCdMIFjNoLpbEQJ@redis-19320.c1.ap-southeast-1-1.ec2.redns.redis-cloud.com:19320"
```

**Location**: `.env.staging`  
**⚠️ WARNING**: This file contains credentials and must NEVER be committed to git!

## Environment Configuration

### .env.staging

```bash
REDIS_URL=redis://default:C2FFCNjuy43x5U0GwWCdMIFjNoLpbEQJ@redis-19320.c1.ap-southeast-1-1.ec2.redns.redis-cloud.com:19320
```

### Application Usage

The application will automatically connect using the `REDIS_URL` environment variable:

```typescript
// Automatic connection via ioredis
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  tls: {
    rejectUnauthorized: false // For Redis Cloud TLS
  }
});
```

## Use Cases

### 1. Bull Job Queues

**Purpose**: Asynchronous task processing

```typescript
import Queue from 'bull';

const settlementQueue = new Queue('settlement', process.env.REDIS_URL, {
  redis: {
    tls: {
      rejectUnauthorized: false
    }
  }
});
```

**Queues in STAGING**:
- `settlement` - Settlement processing
- `monitoring` - Blockchain monitoring
- `webhooks` - Webhook delivery
- `cleanup` - Periodic cleanup tasks

### 2. Idempotency Keys

**Purpose**: Prevent duplicate operations

```typescript
// Store idempotency key for 24 hours
await redis.setex(
  `idempotency:${idempotencyKey}`,
  86400,
  JSON.stringify(result)
);
```

**Key Pattern**: `idempotency:{key}:{endpoint}`

### 3. Caching

**Purpose**: Reduce database load

```typescript
// Cache agreement data for 5 minutes
await redis.setex(
  `agreement:${agreementId}`,
  300,
  JSON.stringify(agreement)
);
```

**Cached Entities**:
- Agreement lookups
- Program account data
- RPC responses
- Fee calculations

### 4. Rate Limiting

**Purpose**: API protection

```typescript
// Rate limit by IP address
const key = `ratelimit:${ipAddress}`;
const current = await redis.incr(key);
if (current === 1) {
  await redis.expire(key, 60); // 1 minute window
}
```

## Connection Testing

### Test Connection

```bash
# Using redis-cli
redis-cli -u "redis://default:C2FFCNjuy43x5U0GwWCdMIFjNoLpbEQJ@redis-19320.c1.ap-southeast-1-1.ec2.redns.redis-cloud.com:19320" --tls ping
# Should return: PONG
```

### Test from Application

```typescript
// Test script
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  tls: { rejectUnauthorized: false }
});

redis.ping()
  .then(result => console.log('✅ Redis connected:', result))
  .catch(err => console.error('❌ Redis error:', err));
```

### Health Check Endpoint

```bash
# Check Redis health via API
curl https://staging-api.easyescrow.ai/health
```

Expected response includes:
```json
{
  "redis": {
    "status": "healthy",
    "latency": 15
  }
}
```

## Monitoring

### Key Metrics to Monitor

1. **Connection Status**
   - Active connections
   - Failed connection attempts
   - Connection latency

2. **Memory Usage**
   - Used memory
   - Peak memory
   - Eviction policy: `allkeys-lru`

3. **Command Statistics**
   - Commands per second
   - Slow queries
   - Failed commands

4. **Queue Depth**
   - Pending jobs per queue
   - Processing rate
   - Failed jobs

### Redis Cloud Dashboard

Access the Redis Cloud dashboard at: https://app.redislabs.com/

**Metrics Available**:
- Real-time operations/sec
- Memory usage
- Network throughput
- Connection count

## Security

### Access Control

- ✅ **TLS Encryption**: All connections encrypted
- ✅ **Password Protected**: Strong password authentication
- ✅ **IP Allowlist**: Only DigitalOcean IPs allowed (configure in Redis Cloud)
- ✅ **Isolated Instance**: Separate from DEV and PROD

### Secret Management

**DO NOT**:
- ❌ Commit `.env.staging` to git
- ❌ Share credentials in Slack/email
- ❌ Use production credentials in STAGING

**DO**:
- ✅ Store credentials in `.env.staging` (gitignored)
- ✅ Use DigitalOcean Secrets for deployed apps
- ✅ Rotate passwords periodically
- ✅ Use separate credentials per environment

### Rotating Credentials

1. Generate new password in Redis Cloud dashboard
2. Update `.env.staging` with new URL
3. Update DigitalOcean App Platform secrets
4. Deploy backend with new configuration
5. Verify connection works
6. Delete old password from Redis Cloud

## Troubleshooting

### "Connection refused"

**Possible Causes**:
- IP not allowlisted in Redis Cloud
- Firewall blocking port 19320
- Incorrect host/port

**Solution**:
```bash
# Check Redis Cloud IP allowlist
# Add DigitalOcean STAGING app IPs
# Format: 1.2.3.4/32
```

### "Authentication failed"

**Possible Causes**:
- Wrong password in connection string
- Password recently rotated

**Solution**:
```bash
# Verify password in Redis Cloud dashboard
# Update .env.staging with correct credentials
```

### "TLS handshake failed"

**Possible Causes**:
- TLS not configured in client
- Certificate verification issues

**Solution**:
```typescript
// Disable strict certificate verification for Redis Cloud
const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});
```

### "Queue jobs not processing"

**Possible Causes**:
- Worker not started
- Redis connection lost
- Queue stalled

**Solution**:
```bash
# Check worker logs
# Restart worker process
# Clear stalled jobs if needed
```

## Best Practices

### 1. Connection Pooling

```typescript
// Use connection pool for efficiency
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => {
    return Math.min(times * 50, 2000);
  }
});
```

### 2. Error Handling

```typescript
redis.on('error', (err) => {
  console.error('Redis error:', err);
  // Alert monitoring system
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});
```

### 3. Key Naming Convention

```
{environment}:{resource}:{identifier}:{subkey}

Examples:
staging:agreement:123:cache
staging:idempotency:abc123:create
staging:queue:settlement:job:456
```

### 4. TTL (Time To Live)

Always set TTL for temporary data:
```typescript
// Cache with 5 minute TTL
await redis.setex(key, 300, value);

// Idempotency with 24 hour TTL
await redis.setex(idempotencyKey, 86400, result);
```

## Migration from Upstash

STAGING has been migrated from Upstash to Redis Cloud due to Bull queue compatibility issues.

**Key Changes**:
- ✅ Full Lua script support (Bull queues work perfectly)
- ✅ No dynamic key generation restrictions
- ✅ Better performance and reliability
- ✅ Same Redis Cloud infrastructure as PROD

**See**: `docs/REDIS_CLOUD_MIGRATION.md` for migration details

## Related Documentation

- [STAGING Strategy](../architecture/STAGING_STRATEGY.md) - Overall STAGING approach
- [STAGING Reference](../STAGING_REFERENCE.md) - Complete infrastructure reference
- [Redis Cloud Migration](../REDIS_CLOUD_MIGRATION.md) - Migration from Upstash

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team

