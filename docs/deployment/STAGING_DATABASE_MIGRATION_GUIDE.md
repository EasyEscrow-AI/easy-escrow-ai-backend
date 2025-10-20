# Staging Database Migration & Seeding Guide

This guide provides step-by-step instructions for running database migrations and seeding data in the staging environment.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Method 1: Local Migration (Recommended)](#method-1-local-migration-recommended)
- [Method 2: CI/CD Automated Migration](#method-2-cicd-automated-migration)
- [Seeding Staging Database](#seeding-staging-database)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)

## Overview

Database migrations apply schema changes (defined in `prisma/migrations/`) to the staging database. Seeding populates the database with test data for comprehensive testing.

## Prerequisites

Before running migrations, ensure:

- ✅ Staging database created (`easyescrow_staging`)
- ✅ `staging_user` created with proper permissions
- ✅ Database connection credentials available
- ✅ PostgreSQL client tools installed (`psql`, `pg_dump`)
- ✅ Node.js and npm installed
- ✅ Prisma CLI available (`npx prisma`)

## Method 1: Local Migration (Recommended)

Run migrations from your local development machine for better control and visibility.

### Step 1: Get Database Connection String

From your staging database setup output (see `setup-staging-database.ps1`):

```
postgresql://staging_user:PASSWORD@host.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require
```

### Step 2: Set Environment Variable

**Windows PowerShell:**
```powershell
# Set staging database URL
$env:STAGING_DATABASE_URL="postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require"

# Or create .env.staging.local (gitignored)
@"
STAGING_DATABASE_URL=postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require
"@ | Out-File -FilePath .env.staging.local -Encoding UTF8
```

**macOS/Linux:**
```bash
# Set staging database URL
export STAGING_DATABASE_URL="postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require"

# Or add to .env.staging.local
echo 'STAGING_DATABASE_URL=postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require' > .env.staging.local
```

### Step 3: Verify Connection

Test database connectivity before running migrations:

```powershell
# Test connection using psql
psql $env:STAGING_DATABASE_URL -c "SELECT version();"

# Expected output: PostgreSQL version information
```

### Step 4: Check Migration Status

```powershell
# Set DATABASE_URL to staging
$env:DATABASE_URL = $env:STAGING_DATABASE_URL

# Check current migration status
npx prisma migrate status

# Expected output:
# - List of applied migrations
# - List of pending migrations (if any)
```

### Step 5: Run Migrations

**Option A: Use npm script (Simple)**

```powershell
# Set DATABASE_URL
$env:DATABASE_URL = $env:STAGING_DATABASE_URL

# Run migrations
npm run db:migrate:deploy
```

**Option B: Use TypeScript migration script (Advanced)**

```powershell
# Set STAGING_DATABASE_URL
$env:STAGING_DATABASE_URL = "postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require"

# Run migration script with backup and verification
npm run staging:migrate:ci
```

This script will:
1. ✅ Validate database connection
2. ✅ Check pending migrations
3. ✅ Create backup reference
4. ✅ Apply migrations
5. ✅ Verify schema integrity
6. ✅ Handle rollback on failure

### Step 6: Verify Migrations

```powershell
# Check migration status again
$env:DATABASE_URL = $env:STAGING_DATABASE_URL
npx prisma migrate status

# Should show: "Database schema is up to date!"

# Verify tables exist
psql $env:STAGING_DATABASE_URL -c "\dt"

# Expected output: List of all tables
```

## Method 2: CI/CD Automated Migration

Migrations run automatically during deployment via GitHub Actions (`.github/workflows/deploy-staging.yml`).

### How It Works

1. Code pushed to `staging` branch
2. GitHub Actions workflow triggered
3. Build completes successfully
4. **Post-deploy job runs:**
   ```yaml
   - name: Run Database Migrations
     run: |
       export STAGING_DATABASE_URL="${{ secrets.STAGING_DATABASE_URL }}"
       npm run staging:migrate:ci
   ```
5. Migrations applied automatically
6. Deployment marked successful

### Prerequisites for CI/CD

Ensure these secrets are configured in GitHub:

- `STAGING_DATABASE_URL` - Full connection string
- `DIGITALOCEAN_ACCESS_TOKEN` - DO API token

**Add secrets:**
1. Go to: **GitHub Repo > Settings > Secrets and Variables > Actions**
2. Click **New repository secret**
3. Add `STAGING_DATABASE_URL` with the connection string
4. Save

### Manual Trigger (If Needed)

If migrations fail during deployment, manually trigger via GitHub Actions:

1. Go to **Actions** tab
2. Select **Deploy Staging** workflow
3. Click **Run workflow**
4. Select `staging` branch
5. Click **Run workflow**

## Seeding Staging Database

After migrations are applied, populate the database with test data.

### Step 1: Review Seed Data

The staging seed script (`prisma/seed-staging.ts`) creates:

- ✅ 5 test escrow agreements (various states)
- ✅ 8 deposits (USDC and NFT)
- ✅ 12 transaction logs
- ✅ 1 settlement with receipt
- ✅ 2 webhooks (delivered and pending)
- ✅ 2 idempotency keys

**Test Scenarios:**
1. Fresh pending agreement (no deposits)
2. USDC locked (waiting for NFT)
3. NFT locked (waiting for USDC)
4. Both deposits locked (ready for settlement)
5. Completed settlement with receipt

### Step 2: Run Seed Script

```powershell
# Set DATABASE_URL to staging
$env:DATABASE_URL = $env:STAGING_DATABASE_URL

# Run staging seed script
npm run db:seed:staging
```

**Expected Output:**
```
🌱 Seeding staging database...
🧹 Cleaning existing data...
✅ Existing data cleared
📝 Creating Scenario 1: Fresh pending agreement...
✅ Scenario 1 created
📝 Creating Scenario 2: USDC locked, waiting for NFT...
✅ Scenario 2 created
...
🎉 Staging database seeding completed successfully!
```

### Step 3: Verify Seed Data

```powershell
# Connect to database
psql $env:STAGING_DATABASE_URL

# Check agreement count
SELECT status, COUNT(*) FROM "Agreement" GROUP BY status;

# Expected output:
#   status      | count
# --------------+-------
#   PENDING     |     1
#   USDC_LOCKED |     1
#   NFT_LOCKED  |     1
#   BOTH_LOCKED |     1
#   SETTLED     |     1

# Check deposits
SELECT type, status, COUNT(*) FROM "Deposit" GROUP BY type, status;

# Check transactions
SELECT "operationType", COUNT(*) FROM "TransactionLog" GROUP BY "operationType";

# Exit psql
\q
```

### Step 4: Test API Endpoints

Verify seeded data is accessible via API:

```powershell
# Get all agreements
curl https://staging-api.easyescrow.ai/v1/agreements

# Get specific agreement
curl https://staging-api.easyescrow.ai/v1/agreements/stg-agreement-001-pending

# Get deposits for agreement
curl https://staging-api.easyescrow.ai/v1/agreements/stg-agreement-002-usdc-locked/deposits
```

## Verification

After migrations and seeding, run comprehensive verification:

```powershell
# Run staging verification script
.\scripts\deployment\verify-staging-deployment.ps1

# This checks:
# ✅ Database connectivity
# ✅ Schema integrity
# ✅ Seed data presence
# ✅ API health
# ✅ Wallet connectivity
```

**Verification Checklist:**

- [ ] All migrations applied successfully
- [ ] No pending migrations remain
- [ ] All required tables exist
- [ ] Seed data created (5 agreements, 8 deposits, etc.)
- [ ] API returns seeded data correctly
- [ ] Database user has proper permissions
- [ ] Connection pooling works
- [ ] SSL/TLS enabled (`sslmode=require`)

## Troubleshooting

### Issue: Cannot Connect to Database

**Symptoms:**
```
Error: connect ETIMEDOUT
```

**Solutions:**
1. Verify database cluster is running in DO dashboard
2. Check firewall rules allow your IP
3. Confirm `sslmode=require` is set
4. Test connection:
   ```powershell
   psql "$env:STAGING_DATABASE_URL" -c "SELECT 1"
   ```

### Issue: Permission Denied During Migration

**Symptoms:**
```
ERROR: permission denied for schema public
```

**Solutions:**
```sql
-- Connect as doadmin
\c easyescrow_staging

-- Grant missing permissions
GRANT ALL PRIVILEGES ON SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO staging_user;

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO staging_user;
```

### Issue: Migration Failed Midway

**Symptoms:**
```
Migration failed to apply cleanly
```

**Solutions:**
1. Check migration status:
   ```powershell
   npx prisma migrate status
   ```

2. Resolve the failed migration manually in psql

3. Mark migration as applied:
   ```powershell
   npx prisma migrate resolve --applied "20231201_migration_name"
   ```

4. Continue with remaining migrations:
   ```powershell
   npx prisma migrate deploy
   ```

### Issue: Seed Script Fails

**Symptoms:**
```
❌ Error seeding staging database: ...
```

**Solutions:**
1. Check if tables exist:
   ```sql
   \dt
   ```

2. Ensure migrations were applied first

3. Check for conflicting data:
   ```sql
   SELECT * FROM "Agreement" WHERE "agreementId" LIKE 'stg-%';
   DELETE FROM "Agreement" WHERE "agreementId" LIKE 'stg-%'; -- if needed
   ```

4. Run seed script again:
   ```powershell
   npm run db:seed:staging
   ```

### Issue: Old Seed Data Remains

**Symptoms:**
- Duplicate test records
- Old test data interfering with tests

**Solutions:**
```powershell
# The seed script automatically cleans old data, but you can manually clean:
psql $env:STAGING_DATABASE_URL <<EOF
DELETE FROM "Webhook";
DELETE FROM "Receipt";
DELETE FROM "Settlement";
DELETE FROM "Deposit";
DELETE FROM "Agreement" WHERE "agreementId" LIKE 'stg-%';
DELETE FROM "IdempotencyKey";
DELETE FROM "TransactionLog";
EOF

# Then re-run seed
npm run db:seed:staging
```

## Rollback Procedures

If migrations cause issues, follow these rollback steps:

### Option 1: Point-in-Time Recovery (Recommended)

DigitalOcean Managed PostgreSQL supports point-in-time recovery:

1. **Navigate to:** DigitalOcean > Databases > Your Cluster > Backups
2. **Click:** "Restore to a Point in Time"
3. **Select:** Time before migration (check migration timestamp)
4. **Choose:** Restore to same cluster (or new cluster for testing)
5. **Wait:** for restoration to complete
6. **Verify:** data integrity after restoration

### Option 2: Manual Rollback

If you have a backup created before migration:

```powershell
# Restore from backup file
psql $env:STAGING_DATABASE_URL < staging-backup-YYYYMMDD.sql

# Verify restoration
psql $env:STAGING_DATABASE_URL -c "SELECT COUNT(*) FROM \"Agreement\""
```

### Option 3: Revert Migration

If only the last migration needs to be reverted:

```powershell
# Note: Prisma doesn't support automatic rollback
# You must manually write and execute a down migration

# 1. Connect to database
psql $env:STAGING_DATABASE_URL

# 2. Manually revert schema changes (example)
DROP TABLE IF EXISTS "NewTable";
ALTER TABLE "ExistingTable" DROP COLUMN "new_column";

# 3. Mark migration as rolled back in _prisma_migrations table
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20231201_migration_name';

# 4. Verify
\q
npx prisma migrate status
```

## Best Practices

### ✅ DO

- ✅ Test migrations on local database first
- ✅ Create backups before running migrations
- ✅ Run migrations during low-traffic periods
- ✅ Monitor migration progress
- ✅ Verify schema after migrations
- ✅ Test API functionality after migrations
- ✅ Document migration procedures
- ✅ Keep migration scripts idempotent

### ❌ DON'T

- ❌ Run migrations without testing locally first
- ❌ Skip backups before migrations
- ❌ Run migrations during peak traffic
- ❌ Manually edit `_prisma_migrations` table (unless rollback)
- ❌ Mix manual SQL changes with Prisma migrations
- ❌ Delete migration files from `prisma/migrations/`
- ❌ Run migrations as `doadmin` user (use `staging_user`)

## Additional Resources

- [Staging Database Setup Guide](../infrastructure/STAGING_DATABASE_SETUP.md)
- [Prisma Migration Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [DigitalOcean PostgreSQL Backups](https://docs.digitalocean.com/products/databases/postgresql/how-to/backup-and-restore/)
- [Database Seeding Best Practices](https://www.prisma.io/docs/guides/database/seed-database)

---

**Last Updated:** January 2025  
**Maintained By:** DevOps Team

