# Production Deployment with Automated Migrations

This guide walks through deploying the production environment with the new PRE_DEPLOY migration job.

---

## Overview

The new production configuration (`production-app.yaml`) includes:
- ✅ **PRE_DEPLOY migration job** - Runs `prisma migrate deploy` before each deployment
- ✅ **Dual database connections** - Direct for migrations, pooled for runtime
- ✅ **Secret placeholders** - Preserves secrets when updating app spec
- ✅ **High availability** - 2 instances for zero-downtime deployments

---

## Architecture: Database Connections

```
┌─────────────────────────────────────────────────────┐
│  PRE_DEPLOY Job (db-migrate)                        │
│  Uses: DATABASE_URL                                 │
│  Port: 25060 (direct)                              │
│  Purpose: Schema migrations (DDL)                  │
│  ✅ Can CREATE/ALTER tables                        │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
           [PostgreSQL Database]
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  App Service (api-production)                       │
│  Uses: DATABASE_URL_POOL                            │
│  Port: 25061 (PgBouncer pool)                      │
│  Purpose: Runtime queries (DML)                    │
│  ✅ Efficient connection pooling                   │
│  ✅ Handles high concurrency                       │
└─────────────────────────────────────────────────────┘
```

---

## Prerequisites

### 1. Database Permissions

Grant schema permissions to the production database user:

```powershell
# Set environment variable
$env:DATABASE_ADMIN_URL = "postgresql://doadmin:PASSWORD@PRODUCTION_HOST:25060/easyescrow_production?sslmode=require"

# Run permission setup script
npx ts-node scripts/database/setup-staging-permissions.ts
```

**Note:** Replace `setup-staging-permissions.ts` script references with `easyescrow_production` database name.

### 2. Required Secrets

Ensure these secrets are set in DigitalOcean App Platform console:

#### For `db-migrate` job:
- `DATABASE_URL` (Direct connection, port 25060)
  ```
  postgresql://prod_user:PASSWORD@HOST:25060/easyescrow_production?sslmode=require
  ```

#### For `api-production` service:
- `DATABASE_URL_POOL` (Connection pool, port 25061)
  ```
  postgresql://prod_user:PASSWORD@HOST:25061/easyescrow_production?sslmode=require&pgbouncer=true&connection_limit=10&pool_timeout=10
  ```
- `REDIS_URL` (Production Redis connection)
- `JWT_SECRET` (Strong secret, `openssl rand -base64 32`)
- `SOLANA_RPC_URL` (Premium RPC like Helius/QuickNode mainnet)
- `ESCROW_PROGRAM_ID` (Mainnet program: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`)
- `USDC_MINT_ADDRESS` (Mainnet USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
- `MAINNET_PROD_ADMIN_PRIVATE_KEY` (Production admin wallet)
- `MAINNET_PROD_ADMIN_ADDRESS` (Production admin public key)
- `SPACES_ACCESS_KEY_ID` (DigitalOcean Spaces)
- `SPACES_SECRET_ACCESS_KEY` (DigitalOcean Spaces)
- `SPACES_BUCKET` (e.g., `easyescrow-production`)
- `SPACES_ENDPOINT` (e.g., `https://sgp1.digitaloceanspaces.com`)
- `SPACES_REGION` (e.g., `sgp1`)

#### Optional (Webhooks):
- `WEBHOOK_URL` (Production webhook receiver)
- `WEBHOOK_SECRET` (Webhook signing secret)

**All secrets should:**
- ✅ Be encrypted
- ✅ Have scope: `RUN_AND_BUILD_TIME`

---

## Deployment Steps

### Step 1: Test on Staging First

Always test migrations on staging before deploying to production:

```powershell
# Ensure staging is working
doctl apps logs ea13cdbb-c74e-40da-a0eb-6c05b0d0432d --type deploy --tail 50
```

Look for:
```
✅ Applying migration `YYYYMMDD_migration_name`
✅ All migrations have been successfully applied.
```

### Step 2: Update Production App Spec

```powershell
# Get production app ID
doctl apps list --format ID,Spec.Name

# Update the app spec
doctl apps update <PRODUCTION_APP_ID> --spec .do/production-app.yaml
```

### Step 3: Trigger Deployment

```powershell
# Trigger deployment
doctl apps create-deployment <PRODUCTION_APP_ID>
```

### Step 4: Monitor Migration Progress

```powershell
# Watch build logs for PRE_DEPLOY job
doctl apps logs <PRODUCTION_APP_ID> --type build --follow
```

Look for:
```
db-migrate | Prisma schema loaded from prisma/schema.prisma
db-migrate | Datasource "db": PostgreSQL database "easyescrow_production"...
db-migrate | 
db-migrate | X migrations found in prisma/migrations
db-migrate | 
db-migrate | Applying migration `YYYYMMDD_migration_name`
db-migrate | 
db-migrate | ✅ All migrations have been successfully applied.
```

### Step 5: Verify Deployment

```powershell
# Wait 5-10 minutes for full deployment
Start-Sleep -Seconds 600

# Check deployment logs
doctl apps logs <PRODUCTION_APP_ID> --type deploy --tail 100
```

Look for:
```
api-production | [Prisma] Using connection pool (DATABASE_URL_POOL)
api-production | ✅ Database connected successfully
api-production | ✅ Redis connected
api-production | 🚀 Server is running on port 8080
api-production | ✅ All background services started
```

### Step 6: Verify Health

```bash
# Check health endpoint
curl https://api.easyescrow.ai/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "...",
  "services": {
    "database": "connected",
    "redis": "connected",
    "solana": "connected"
  }
}
```

---

## Rollback Procedure

If deployment fails:

### Option 1: Quick Rollback (No Code Changes)

```powershell
# Get previous deployment ID
doctl apps deployments list <PRODUCTION_APP_ID> --format ID,Phase,CreatedAt

# Rollback to previous deployment
doctl apps deployments create <PRODUCTION_APP_ID> --deployment-id <PREVIOUS_DEPLOYMENT_ID>
```

### Option 2: Rollback Migration (Database Changes)

If a migration needs to be rolled back:

1. **Connect to production database:**
   ```powershell
   psql "postgresql://doadmin:PASSWORD@HOST:25060/easyescrow_production"
   ```

2. **Check applied migrations:**
   ```sql
   SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;
   ```

3. **Manual rollback (if needed):**
   - Prisma doesn't support automatic rollbacks
   - You must manually write and execute DOWN migration SQL
   - See: `docs/database/MIGRATION_ROLLBACK.md`

---

## Troubleshooting

### Migration Fails: "permission denied for schema public"

**Cause:** Database user lacks schema modification permissions.

**Fix:**
```powershell
# Run permission setup script
$env:DATABASE_ADMIN_URL = "postgresql://doadmin:PASSWORD@HOST:25060/easyescrow_production?sslmode=require"
npx ts-node scripts/database/setup-staging-permissions.ts
```

### App Fails: "FATAL: no such database: easyescrow_production"

**Cause:** `DATABASE_URL_POOL` is pointing to wrong database name.

**Fix:** Ensure `DATABASE_URL_POOL` uses `easyescrow_production` (not `easyescrow_production_pool`):
```
postgresql://prod_user:PASSWORD@HOST:25061/easyescrow_production?sslmode=require&pgbouncer=true
```

### Migration Timeout

**Cause:** Migration takes longer than default timeout.

**Fix:** Increase timeout in job configuration:
```yaml
jobs:
  - name: db-migrate
    # ... other config ...
    timeout_seconds: 300  # 5 minutes
```

---

## Best Practices

### 1. Always Test on Staging First
- Run migrations on staging
- Verify app functionality
- Check for performance issues
- Only then deploy to production

### 2. Database Backups
- DigitalOcean creates automatic backups
- Create manual backup before major migrations:
  ```powershell
  # Via DigitalOcean console: Databases → Backups → Create Backup
  ```

### 3. Low-Traffic Deployment
- Deploy during low-traffic periods
- Monitor error rates during deployment
- Have rollback plan ready

### 4. Zero-Downtime Migrations
- Use Prisma's `$executeRawUnsafe` for complex migrations
- Avoid breaking schema changes
- Use additive migrations when possible:
  1. Add new column (nullable)
  2. Backfill data
  3. Make non-nullable (if needed)
  4. Deploy code using new column
  5. Remove old column (separate migration)

### 5. Monitoring Post-Deployment
- Monitor error rates in logs
- Check database connection pool usage
- Verify RPC health and response times
- Monitor Redis cache hit rates

---

## Migration History

Keep track of important migrations:

| Date | Migration | Description | Deployed By |
|------|-----------|-------------|-------------|
| 2025-11-01 | `20251101030555_add_archived_status` | Added ARCHIVED status for test cleanup | Automated |
| ... | ... | ... | ... |

---

## Related Documentation

- [Database Permissions Setup](../setup/STAGING_DATABASE_PERMISSIONS.md)
- [Staging Database Fix](../STAGING_DATABASE_FIX.md)
- [Production Deployment Guide](./PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Migration Rollback Guide](../database/MIGRATION_ROLLBACK.md)
- [Secrets Management](../security/SECRETS_MANAGEMENT.md)

---

## Emergency Contacts

**If production is down:**
1. Check #incidents Slack channel
2. Page on-call engineer
3. Rollback to previous deployment
4. Investigate and fix in non-production environment first

---

**Remember:** Production deployments affect real users. Always be cautious, test thoroughly, and have a rollback plan ready! 🚨

