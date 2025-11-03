# Database Connection Pooling Configuration

## Overview

The application uses separate Prisma connection pools for different workload types:
- **Main Pool**: User-facing API requests (30 connections)
- **Batch Pool**: Background batch operations (50 connections)

This isolation ensures high-volume batch processing doesn't impact API performance.

## Configuration

### Environment Variables

```bash
# Main Pool (User-Facing API)
DB_CONNECTION_LIMIT=30          # Max connections (default: 30)
DB_POOL_TIMEOUT=30              # Pool timeout in seconds (default: 30)
DB_CONNECTION_TIMEOUT=5         # Connection timeout in seconds (default: 5)

# Batch Pool (Background Operations)
DB_BATCH_CONNECTION_LIMIT=50    # Max connections (default: 50)
DB_BATCH_POOL_TIMEOUT=60        # Pool timeout in seconds (default: 60)
DB_BATCH_CONNECTION_TIMEOUT=10  # Connection timeout in seconds (default: 10)
```

### Connection String Parameters

These parameters are automatically appended to your `DATABASE_URL`:

```
?connection_limit=30&pool_timeout=30&connect_timeout=5
```

## Pool Sizing Guidelines

### Development
- Main Pool: **10-20 connections**
- Batch Pool: **20-30 connections**
- Total: 30-50 connections

### Staging
- Main Pool: **20-30 connections**
- Batch Pool: **30-50 connections**
- Total: 50-80 connections

### Production
- Main Pool: **30-50 connections**
- Batch Pool: **50-100 connections**
- Total: 80-150 connections

## Usage

### Standard Prisma Client (Main Pool)

Use for all user-facing API operations:

```typescript
import { prisma } from '../config/database';

// User creates an agreement
const agreement = await prisma.agreement.create({
  data: { ... }
});
```

### Batch Prisma Client (Batch Pool)

Use for all background batch operations:

```typescript
import { batchPrisma } from '../config/database';

// Batch processing expired agreements
const expiredAgreements = await batchPrisma.agreement.findMany({
  where: {
    status: 'PENDING',
    expiry: { lte: new Date() }
  },
  take: 200
});
```

## Services Using Batch Pool

The following services automatically use the batch pool:
- `expiry.service.ts` - Expiry checking
- `refund.service.ts` - Refund processing

## Performance Benefits

### Before (Single Pool: 50 connections)
- API requests compete with batch operations
- Slow batch processing impacts API response times
- Connection exhaustion during high load

### After (Separate Pools: 30 + 50 connections)
- ✅ API performance isolated from batch operations
- ✅ Predictable response times for users
- ✅ Higher batch throughput (200 escrows/minute)
- ✅ Total capacity: 80 connections

## Monitoring

Monitor connection pool utilization:

```sql
-- Check active connections
SELECT 
  datname,
  count(*) as connections,
  max_connections
FROM pg_stat_activity
GROUP BY datname
LIMIT 10;

-- Check connection pool stats
SELECT * FROM pg_stat_database WHERE datname = 'easyescrow_production';
```

## PostgreSQL Server Configuration

Ensure PostgreSQL `max_connections` is sufficient:

```sql
-- Check max connections
SHOW max_connections;

-- Recommended: 200+ for production
-- Set in postgresql.conf:
max_connections = 200
```

## Troubleshooting

### Connection Timeout Errors

```
Error: Connection timeout
```

**Solution:** Increase `DB_CONNECTION_TIMEOUT` or `DB_POOL_TIMEOUT`

### Pool Exhaustion

```
Error: Too many connections
```

**Solution:**
1. Increase `DB_CONNECTION_LIMIT` or `DB_BATCH_CONNECTION_LIMIT`
2. Check PostgreSQL `max_connections`
3. Implement PgBouncer (see below)

### Slow Batch Processing

**Solution:**
1. Increase `DB_BATCH_CONNECTION_LIMIT`
2. Increase batch sizes via `EXPIRY_BATCH_SIZE` and `REFUND_BATCH_SIZE`
3. Optimize queries using composite indexes

## Advanced: PgBouncer (Recommended for Production)

For production deployments with 100+ concurrent connections, use PgBouncer:

### Benefits
- Connection multiplexing (thousands of client connections → dozens of PostgreSQL connections)
- Reduced PostgreSQL overhead
- Better resource utilization

### Configuration

```ini
[databases]
easyescrow = host=localhost dbname=easyescrow_production

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 100
reserve_pool_size = 20
reserve_pool_timeout = 5
```

### Connection String

```bash
# Use PgBouncer URL instead of direct PostgreSQL
DATABASE_URL_POOL=postgresql://user:password@pgbouncer:6432/easyescrow_production
```

## Related Documentation

- [Database Configuration](./DATABASE_CONFIGURATION.md)
- [Batch Processing Optimization](../optimization/BATCH_PROCESSING.md)
- [Performance Tuning](../optimization/PERFORMANCE_TUNING.md)

## References

- [Prisma Connection Pooling](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management)
- [PostgreSQL Connection Pooling](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [PgBouncer Documentation](https://www.pgbouncer.org/config.html)

