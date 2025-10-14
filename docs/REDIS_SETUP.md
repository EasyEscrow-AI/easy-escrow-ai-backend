# Redis Setup Guide

## Overview
This guide covers Redis setup options for EasyEscrow backend across different environments.

## DigitalOcean Redis Issue
Currently, DigitalOcean Redis is not enabled on the account. You'll see this error:
```
Error: not enabled to create a REDIS cluster
```

**Solution**: Contact DigitalOcean support to enable Redis, or use alternative providers below.

---

## Redis Alternatives

### Option 1: Upstash Redis (Recommended) ⭐

**Benefits:**
- ✅ FREE tier: 10,000 commands/day
- ✅ Global edge network (ultra-low latency)
- ✅ Serverless, pay-per-use
- ✅ REST API support
- ✅ Easy setup (5 minutes)

**Pricing:**
- Free: 10,000 commands/day
- After free: ~$0.20 per 100k commands
- Regional: $0.20 per 100k requests
- Global: $2 per 1M requests

**Setup:**
1. Go to https://upstash.com
2. Sign up (GitHub or email)
3. Create Redis database
   - Choose region: `ap-southeast-1` (Singapore)
   - Select: **Regional** (lower cost)
4. Copy connection details:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

**Environment Variables:**
```bash
# Option A: Redis URL (for node-redis)
REDIS_URL=rediss://default:YOUR_PASSWORD@region-redis.upstash.io:6379

# Option B: REST API (for @upstash/redis)
UPSTASH_REDIS_REST_URL=https://region-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR_TOKEN
```

---

### Option 2: Redis Cloud (RedisLabs)

**Benefits:**
- ✅ FREE tier: 30MB storage
- ✅ Fully managed
- ✅ Auto-scaling

**Pricing:**
- Free: 30MB, 30 connections
- Essentials: $5/month (1GB)
- Professional: $10+/month

**Setup:**
1. Go to https://redis.com/try-free/
2. Sign up
3. Create database
   - Choose region: Asia Pacific
4. Copy connection string

---

### Option 3: Railway

**Benefits:**
- ✅ $5 free credit per month
- ✅ Simple deployment
- ✅ Auto-scaling

**Pricing:**
- Free: $5 credit/month
- After: ~$0.01/GB-hour

**Setup:**
1. Go to https://railway.app
2. Sign up with GitHub
3. New Project → Redis
4. Copy connection URL

---

### Option 4: DigitalOcean Redis (After Enabling)

**Pricing:**
- `db-s-1vcpu-1gb`: ~$15/month

**Setup:**
1. Contact DO support to enable Redis
2. Once enabled:
```bash
doctl databases create easyescrow-staging-redis \
  --engine redis \
  --region sgp1 \
  --size db-s-1vcpu-1gb \
  --version 7
```

---

## Current Setup

### DEV Environment
- **Provider**: Docker Compose (local)
- **Connection**: `redis://localhost:6379`

### STAGING Environment
- **Provider**: Upstash Redis (Regional)
- **Region**: Singapore (ap-southeast-1)
- **Connection**: Set via `REDIS_URL` in App Platform

### PROD Environment
- **Provider**: Upstash Redis (Regional)
- **Region**: Singapore (ap-southeast-1)
- **Connection**: Set via `REDIS_URL` in App Platform

---

## Migration from Local to Upstash

### 1. Install Upstash Redis Client (Optional)

If using REST API:
```bash
npm install @upstash/redis
```

### 2. Update Redis Client

**Option A: Keep using `ioredis` (recommended)**
```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
```

**Option B: Use Upstash REST API**
```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

### 3. Environment Variables

Update your `.env` files:

**.env.development**
```bash
REDIS_URL=redis://localhost:6379
```

**.env.staging** (App Platform)
```bash
REDIS_URL=${upstash-redis-staging.REDIS_URL}
```

**.env.production** (App Platform)
```bash
REDIS_URL=${upstash-redis-prod.REDIS_URL}
```

---

## Testing Connection

### From Node.js
```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

redis.ping((err, result) => {
  console.log('Redis ping:', result); // Should print "PONG"
});
```

### Using redis-cli
```bash
# Connect to Upstash
redis-cli -u "rediss://default:PASSWORD@region-redis.upstash.io:6379"

# Test
PING
# Should return: PONG
```

---

## Cost Comparison

| Provider | FREE Tier | Paid Tier | Best For |
|----------|-----------|-----------|----------|
| **Upstash** | 10k cmds/day | $0.20/100k | Pay-per-use, LOW traffic |
| **Redis Cloud** | 30MB | $5/month | Fixed costs, predictable |
| **Railway** | $5 credit | ~$5-10/month | Developer-friendly |
| **DigitalOcean** | None | $15/month | All-in-one DO setup |

**Recommendation**: Start with **Upstash** (free tier covers most dev/staging needs), upgrade to DO Redis when traffic increases.

---

## Next Steps

1. ✅ Sign up for Upstash
2. ✅ Create Redis databases for STAGING and PROD
3. ✅ Copy connection URLs
4. ✅ Add to App Platform environment variables
5. ✅ Test connection
6. ✅ Monitor usage
7. 🔄 Migrate to DO Redis when enabled (optional)

## Support

- Upstash Docs: https://docs.upstash.com/redis
- Redis Cloud Docs: https://docs.redis.com
- Railway Docs: https://docs.railway.app

