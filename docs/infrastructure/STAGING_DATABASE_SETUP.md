# Staging Database Setup Guide

This guide provides detailed instructions for setting up the isolated STAGING database infrastructure using the existing DigitalOcean Managed PostgreSQL cluster.

## Overview

The staging environment uses a dedicated database (`easyescrow_staging`) within the same managed PostgreSQL cluster, with its own user, permissions, and configuration to ensure complete isolation from production and development environments.

## Prerequisites

- Access to DigitalOcean Managed PostgreSQL cluster
- `psql` client installed locally
- Admin credentials for the PostgreSQL cluster
- Access to DigitalOcean App Platform for secret management

## Architecture

```
DO Managed PostgreSQL Cluster
├── easyescrow_prod       (Production database)
├── easyescrow_dev        (Development database)
└── easyescrow_staging    (Staging database) ← NEW
    ├── staging_user      (Dedicated user with limited privileges)
    ├── Connection Pool   (Configured for staging workload)
    └── Daily Backups     (7-day retention)
```

## Setup Steps

### Step 1: Connect to PostgreSQL Cluster

Connect to your DigitalOcean Managed PostgreSQL cluster using the admin credentials:

```bash
# Get connection string from DigitalOcean Dashboard
# Navigate to: Databases > Your Cluster > Connection Details

psql "postgresql://doadmin:PASSWORD@your-cluster-host.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
```

**Windows (PowerShell):**
```powershell
# Use the connection script
.\scripts\deployment\connect-staging-db.ps1
```

### Step 2: Create Staging Database

Execute the following SQL commands in your `psql` session:

```sql
-- Create the staging database
CREATE DATABASE easyescrow_staging;

-- Verify creation
\l

-- You should see easyescrow_staging in the list
```

### Step 3: Create Staging Database User

Create a dedicated user with least-privilege permissions:

```sql
-- Create staging user with a strong password
CREATE USER staging_user WITH PASSWORD 'YOUR_SECURE_PASSWORD_HERE';

-- Grant connection privilege to the staging database
GRANT CONNECT ON DATABASE easyescrow_staging TO staging_user;

-- Connect to the staging database
\c easyescrow_staging

-- Grant schema usage and creation privileges
GRANT USAGE ON SCHEMA public TO staging_user;
GRANT CREATE ON SCHEMA public TO staging_user;

-- Grant all privileges on all tables in public schema (for migrations)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO staging_user;

-- Ensure future tables also get these privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO staging_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO staging_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON FUNCTIONS TO staging_user;
```

**Alternative: Use the automated script**

```bash
# Unix/Linux/macOS
./scripts/deployment/setup-staging-database.sh

# Windows
.\scripts\deployment\setup-staging-database.ps1
```

### Step 4: Configure Environment Variables

#### Local Testing

Create or update `.env.staging`:

```env
# Staging Database Configuration
NODE_ENV=staging
DATABASE_URL="postgresql://staging_user:PASSWORD@your-cluster-host.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require"
DATABASE_POOL_URL="postgresql://staging_user:PASSWORD@your-cluster-pooler.db.ondigitalocean.com:25061/easyescrow_staging?sslmode=require"
DATABASE_POOL_SIZE=10
DATABASE_POOL_TIMEOUT=30

# Staging Solana Configuration
SOLANA_RPC_ENDPOINT=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
ANCHOR_WALLET=/path/to/staging-wallet.json

# Staging Program IDs
ESCROW_PROGRAM_ID=your_staging_program_id

# Redis Configuration (Staging)
REDIS_HOST=your-staging-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS=true

# API Configuration
PORT=8080
LOG_LEVEL=debug
```

#### DigitalOcean App Platform

Add these secrets to your staging app in the DigitalOcean dashboard:

1. Navigate to: **Apps > Your Staging App > Settings > App-Level Environment Variables**
2. Add the following variables:

| Variable Name | Value | Encrypt |
|---------------|-------|---------|
| `DATABASE_URL` | `postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require` | ✅ Yes |
| `DATABASE_POOL_URL` | `postgresql://staging_user:PASSWORD@pooler-host:25061/easyescrow_staging?sslmode=require` | ✅ Yes |
| `DATABASE_POOL_SIZE` | `10` | ❌ No |
| `DATABASE_POOL_TIMEOUT` | `30` | ❌ No |
| `NODE_ENV` | `staging` | ❌ No |

### Step 5: Run Database Migrations

Apply Prisma migrations to create the database schema:

```bash
# Set the staging database URL
export DATABASE_URL="postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require"

# Generate Prisma client
npx prisma generate

# Deploy migrations (production-safe, no prompts)
npx prisma migrate deploy

# Verify migration status
npx prisma migrate status
```

**Windows (PowerShell):**
```powershell
# Set the staging database URL
$env:DATABASE_URL="postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require"

# Run migrations
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```

### Step 6: Seed Staging Data

Populate the staging database with test data:

```bash
# Using the staging-specific seed script
npm run seed:staging

# Or manually
npx ts-node prisma/seed-staging.ts
```

The staging seed script creates:
- Test escrow agreements (active, completed, expired)
- Sample deposits (USDC and NFT)
- Transaction logs
- Settlement records
- Test webhooks
- Idempotency keys

See `prisma/seed-staging.ts` for details.

### Step 7: Configure Connection Pooling

DigitalOcean Managed PostgreSQL includes built-in connection pooling. Configure it for staging:

1. **Navigate to**: Databases > Your Cluster > Connection Pools
2. **Create a new pool** (if not exists):
   - Name: `easyescrow-staging-pool`
   - Database: `easyescrow_staging`
   - User: `staging_user`
   - Mode: `Transaction` (recommended for most use cases)
   - Pool Size: `10-15` connections

3. **Use the pooled connection string** in your application:
   ```
   postgresql://staging_user:PASSWORD@pooler-host:25061/easyescrow_staging?sslmode=require
   ```

**Pool Configuration Recommendations:**

| Setting | Production | Staging | Reasoning |
|---------|-----------|---------|-----------|
| Pool Size | 25-50 | 10-15 | Lower traffic expected |
| Mode | Transaction | Transaction | Efficient for API servers |
| Timeout | 30s | 30s | Standard timeout |

### Step 8: Configure Backups

DigitalOcean automatically creates backups for managed databases. Configure staging-specific settings:

1. **Navigate to**: Databases > Your Cluster > Settings > Backups
2. **Verify backup schedule**:
   - Frequency: Daily (automatic)
   - Retention: 7 days (sufficient for staging)
   - Point-in-Time Recovery: Available (last 2 days)

**Backup Strategy:**
- **Production**: 30-day retention, hourly backups
- **Staging**: 7-day retention, daily backups
- **Development**: 7-day retention, daily backups

### Step 9: Test Database Connectivity

Verify the staging database is accessible:

```bash
# Test connection
npx ts-node scripts/utilities/test-db-connection.ts

# Test CRUD operations
npm run test:staging:db

# Run integration tests against staging
npm run test:staging
```

**Expected Output:**
```
✅ Database connection successful
✅ Can read from database
✅ Can write to database
✅ Can update records
✅ Can delete records
✅ Migrations are up to date
```

### Step 10: Update Documentation

Document the staging database details in your team wiki or internal docs:

**Required Information:**
- Database name: `easyescrow_staging`
- User: `staging_user`
- Connection strings (direct and pooled)
- Backup schedule and retention policy
- Migration process
- Seed data strategy
- Troubleshooting guide

## Connection Strings Reference

### Direct Connection (Admin Operations)
```
postgresql://staging_user:PASSWORD@your-cluster-host.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require
```

**Use for:**
- Running migrations
- Database administration
- One-off queries

### Pooled Connection (Application Runtime)
```
postgresql://staging_user:PASSWORD@your-cluster-pooler.db.ondigitalocean.com:25061/easyescrow_staging?sslmode=require
```

**Use for:**
- Application runtime (Express server)
- Connection pooling
- High-concurrency scenarios

## Security Best Practices

### 1. Password Management
- ✅ Use strong, randomly generated passwords (min 32 characters)
- ✅ Store passwords in DigitalOcean Secrets (encrypted)
- ✅ Rotate passwords quarterly
- ❌ Never commit passwords to Git
- ❌ Never log connection strings

### 2. Access Control
- ✅ Use dedicated `staging_user` (not `doadmin`)
- ✅ Grant minimal required permissions
- ✅ Revoke unused privileges
- ✅ Audit user permissions regularly

### 3. SSL/TLS
- ✅ Always use `sslmode=require` in production/staging
- ✅ Verify SSL certificates
- ❌ Never disable SSL in staging (only local dev)

### 4. Network Security
- ✅ Restrict database access to trusted IPs (if possible)
- ✅ Use VPC networking (if available)
- ✅ Enable firewall rules

## Monitoring and Maintenance

### Database Metrics to Monitor

1. **Connection Pool**
   - Active connections
   - Idle connections
   - Connection wait time

2. **Query Performance**
   - Slow queries (> 1s)
   - Query execution plans
   - Index usage

3. **Database Size**
   - Table sizes
   - Index sizes
   - Growth rate

4. **Backup Status**
   - Last backup time
   - Backup success rate
   - Restoration test results

### DigitalOcean Dashboard

Monitor your staging database at:
```
https://cloud.digitalocean.com/databases/[your-cluster-id]
```

**Key Metrics:**
- CPU usage
- Memory usage
- Disk I/O
- Connection count
- Query latency

## Troubleshooting

### Issue: Cannot Connect to Database

**Symptoms:**
```
Error: connect ETIMEDOUT
```

**Solutions:**
1. Verify cluster is running in DO dashboard
2. Check firewall rules allow your IP
3. Confirm `sslmode=require` is set
4. Test connection with `psql` directly

### Issue: Permission Denied

**Symptoms:**
```
ERROR: permission denied for table agreements
```

**Solutions:**
```sql
-- Connect as admin user
\c easyescrow_staging

-- Grant missing permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;
```

### Issue: Migration Failed

**Symptoms:**
```
Error: Migration failed to apply cleanly
```

**Solutions:**
1. Check migration status: `npx prisma migrate status`
2. Review failed migration logs
3. Resolve conflicts manually
4. Mark migration as applied: `npx prisma migrate resolve --applied MIGRATION_NAME`

### Issue: Connection Pool Exhausted

**Symptoms:**
```
ERROR: remaining connection slots are reserved
```

**Solutions:**
1. Increase pool size in DO dashboard
2. Optimize application connection usage
3. Check for connection leaks
4. Implement connection retry logic

### Issue: Slow Queries

**Solutions:**
1. Analyze query plans: `EXPLAIN ANALYZE <query>`
2. Add missing indexes
3. Optimize N+1 queries
4. Use connection pooling

## Backup and Recovery

### Creating Manual Backup

```bash
# Connect to cluster and export
pg_dump "postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require" > staging-backup-$(date +%Y%m%d).sql

# Compress backup
gzip staging-backup-$(date +%Y%m%d).sql
```

### Restoring from Backup

```bash
# Restore from SQL dump
psql "postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require" < backup.sql

# Or use DigitalOcean point-in-time recovery
# Navigate to: Databases > Your Cluster > Backups > Restore
```

### Point-in-Time Recovery

DigitalOcean allows restoring to any point within the last 2 days:

1. Navigate to: **Databases > Your Cluster > Backups**
2. Click **Restore to a Point in Time**
3. Select date and time
4. Choose restoration target (new cluster or overwrite)

## Migration from Development to Staging

When promoting changes from development to staging:

```bash
# 1. Create migration in development
npx prisma migrate dev --name add_new_feature

# 2. Test migration locally
npm run test

# 3. Commit migration to Git
git add prisma/migrations/
git commit -m "feat: add new database migration"

# 4. Deploy to staging
git push origin main

# 5. Apply migration in staging (automated in deployment)
# Or manually:
DATABASE_URL="$STAGING_DATABASE_URL" npx prisma migrate deploy
```

## Environment-Specific Configuration

### Development
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/easyescrow_dev"
DATABASE_POOL_SIZE=5
```

### Staging
```env
DATABASE_URL="postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require"
DATABASE_POOL_SIZE=10
```

### Production
```env
DATABASE_URL="postgresql://prod_user:PASSWORD@host:25060/easyescrow_prod?sslmode=require"
DATABASE_POOL_SIZE=25
```

## Automated Deployment

The staging database is automatically managed during deployments:

**On Deploy:**
1. ✅ Migrations are applied automatically (`npx prisma migrate deploy`)
2. ✅ Prisma client is regenerated
3. ✅ Database connection is tested
4. ✅ Health checks verify database connectivity

**Pre-Deployment Checklist:**
- [ ] All migrations tested locally
- [ ] No breaking schema changes
- [ ] Rollback plan documented
- [ ] Backup created before deployment

## Additional Resources

- [DigitalOcean Managed PostgreSQL Docs](https://docs.digitalocean.com/products/databases/postgresql/)
- [Prisma Migration Guide](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [PostgreSQL Connection Pooling](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [Database Security Best Practices](https://www.postgresql.org/docs/current/auth-methods.html)

## Support

For issues or questions:
- Check this guide first
- Review DigitalOcean documentation
- Contact the DevOps team
- Check #staging-support channel

---

**Last Updated:** January 2025  
**Maintained By:** DevOps Team

