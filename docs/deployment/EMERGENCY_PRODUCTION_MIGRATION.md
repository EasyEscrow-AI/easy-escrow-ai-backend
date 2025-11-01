# Emergency Production Database Migration Guide

## Problem: Production Database Not Migrated

**Symptoms:**
- Application logs show: `The table 'public.agreements' does not exist`
- Prisma errors: `PrismaClientKnownRequestError: P2021`
- Application fails to start or crashes on database queries

**Root Cause:**
- Pre-deploy migration job failed or didn't run
- DATABASE_URL secret not configured in DigitalOcean
- First deployment without database schema

---

## Solution: Manual Migration

### Prerequisites

1. **Install Required Tools:**
   ```bash
   # PostgreSQL client (psql)
   # On Windows: Install from https://www.postgresql.org/download/windows/
   # On macOS: brew install postgresql
   # On Linux: sudo apt-get install postgresql-client
   
   # DigitalOcean CLI (doctl)
   # Already installed if you've deployed before
   ```

2. **Get Production Database URL:**

   **Option A: From DigitalOcean Console**
   ```
   1. Go to: DigitalOcean Console → Databases → easyescrow-production-db
   2. Click "Connection Details"
   3. Select "Connection String" format
   4. Copy the full connection string:
      postgresql://user:password@host:port/easyescrow_prod?sslmode=require
   ```

   **Option B: From App Platform Environment Variables**
   ```bash
   # List app environments
   doctl apps list
   
   # Get app spec (shows environment variables)
   doctl apps spec get <production-app-id>
   
   # Note: Secrets won't be shown, must get from Console
   ```

3. **Verify You Have a Backup:**
   ```bash
   # List recent backups
   doctl databases backups list <db-id>
   
   # Or create manual backup in DO Console:
   # Databases → easyescrow-production-db → Backups → Create Backup
   ```

---

## Running Emergency Migration

### Option 1: Using PowerShell (Windows - Recommended)

```powershell
# Navigate to project directory
cd C:\websites\VENTURE\easy-escrow-ai-backend

# Set DATABASE_URL environment variable
$env:DATABASE_URL = "postgresql://user:password@host:port/easyescrow_prod?sslmode=require"

# Run emergency migration script
.\scripts\deployment\digitalocean\emergency-migrate-prod.ps1

# Or provide URL as parameter
.\scripts\deployment\digitalocean\emergency-migrate-prod.ps1 -DatabaseUrl "postgresql://..."
```

### Option 2: Using Bash (Linux/macOS)

```bash
# Navigate to project directory
cd /path/to/easy-escrow-ai-backend

# Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://user:password@host:port/easyescrow_prod?sslmode=require"

# Run emergency migration script
chmod +x scripts/deployment/digitalocean/emergency-migrate-prod.sh
./scripts/deployment/digitalocean/emergency-migrate-prod.sh
```

### Option 3: Using npm Script (Direct Prisma)

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://..."  # Linux/macOS
# or
$env:DATABASE_URL = "postgresql://..."  # PowerShell

# Run migration directly
npx prisma migrate deploy
```

---

## Script Output & Verification

### Expected Output

```
╔══════════════════════════════════════════════╗
║  EMERGENCY PRODUCTION DATABASE MIGRATION    ║
╔══════════════════════════════════════════════╗

⚠️  WARNING: This will modify PRODUCTION database ⚠️

Database URL:
  postgresql://doadmin:****@db-host:25060/easyescrow_prod

Is this the PRODUCTION database? (type 'yes' to continue): yes

⚠️  DO YOU HAVE A RECENT BACKUP? ⚠️
Confirm you have a backup (type 'yes' to continue): yes

Step 1: Testing database connectivity...
✓ Database connection successful

Step 2: Checking current migration status...
⚠️  No _prisma_migrations table found (first migration)

Step 3: Ensuring dependencies are installed...
✓ Dependencies already installed

Step 4: Generating Prisma client...
✓ Prisma Client generated

Step 5: Running Prisma migrations...
Executing: npx prisma migrate deploy

Applying migration: 20240101000000_initial_schema
Applying migration: 20240102000000_add_receipts
[... more migrations ...]

✅ Migrations completed successfully

Step 6: Verifying tables...
  Total tables: 12

Tables in database:
  agreements
  deposits
  releases
  refunds
  transaction_logs
  nfts
  users
  receipts
  [... more tables ...]

Verifying critical tables:
  ✓ agreements
  ✓ deposits
  ✓ releases
  ✓ refunds
  ✓ transaction_logs
  ✓ nfts
  ✓ users
  ✓ receipts

╔══════════════════════════════════════════════╗
║  MIGRATION COMPLETE                          ║
╔══════════════════════════════════════════════╗
```

---

## Post-Migration Verification

### 1. Check Application Health

```bash
# Check health endpoint
curl https://api.easyescrow.ai/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-10-28T00:00:00.000Z",
  "checks": {
    "database": "healthy",
    "redis": "healthy",
    "solana": "connected",
    "escrowProgram": "deployed"
  }
}
```

### 2. View Application Logs

```bash
# Get app ID
doctl apps list

# View real-time logs
doctl apps logs <production-app-id> --follow

# Check for errors
doctl apps logs <production-app-id> --type run | grep -i error
```

### 3. Test Database Queries

```bash
# Connect to database
psql "$DATABASE_URL"

# Check tables
\dt

# Check agreements table
SELECT COUNT(*) FROM agreements;

# Check migration history
SELECT migration_name, finished_at, success 
FROM _prisma_migrations 
ORDER BY finished_at DESC;

# Exit
\q
```

### 4. Restart Application (If Still Failing)

```bash
# Force redeploy to pick up migrated database
doctl apps create-deployment <production-app-id> --force-rebuild
```

---

## Troubleshooting

### Error: Cannot connect to database

**Cause:** Firewall, wrong URL, or database not running

**Solution:**
```bash
# 1. Verify DATABASE_URL is correct (check for typos)
echo $DATABASE_URL  # Linux/macOS
echo $env:DATABASE_URL  # PowerShell

# 2. Test connection manually
psql "$DATABASE_URL" -c "SELECT 1"

# 3. Check database status in DO Console
# Databases → easyescrow-production-db → Status should be "Available"

# 4. Add your IP to trusted sources (if using DO Database)
# Databases → Settings → Trusted Sources → Add your IP
```

### Error: Permission denied

**Cause:** Database user doesn't have CREATE permission

**Solution:**
```bash
# 1. Verify you're using the admin connection string, not pool
# Admin: postgresql://doadmin:...@host:25060/db
# Pool:  postgresql://doadmin:...@host:25061/db (wrong for migrations)

# 2. Grant permissions (connect as superuser)
psql "$DATABASE_URL" -c "GRANT CREATE ON SCHEMA public TO doadmin;"
```

### Error: Migration already applied

**Cause:** Some migrations already exist, causing conflicts

**Solution:**
```bash
# 1. Check migration status
psql "$DATABASE_URL" -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"

# 2. Mark specific migration as applied (if schema matches)
npx prisma migrate resolve --applied <migration_name>

# 3. Or reset migrations (DANGEROUS - only if database is empty)
npx prisma migrate reset --force
```

### Application Still Shows Errors After Migration

**Possible causes:**

1. **Application not restarted:**
   ```bash
   doctl apps create-deployment <app-id> --force-rebuild
   ```

2. **Wrong DATABASE_URL in app:**
   ```bash
   # Check app environment variables
   doctl apps spec get <app-id> | grep DATABASE_URL
   
   # Verify in DO Console:
   # App Platform → App → Settings → Environment Variables
   # DATABASE_URL should point to correct database
   ```

3. **Prisma client not regenerated:**
   ```bash
   # Redeploy will regenerate, or:
   # Connect to app console and run:
   npx prisma generate
   ```

---

## Prevention: Fix Pre-Deploy Job

To prevent this in future deployments:

### 1. Verify DATABASE_URL Secret is Set

```bash
# In DigitalOcean Console:
# App Platform → easyescrow-backend-production → Settings → Environment Variables

# Ensure DATABASE_URL exists with:
# - Type: SECRET (encrypted)
# - Scope: RUN_AND_BUILD_TIME (important!)
# - Value: postgresql://doadmin:password@host:25060/easyescrow_prod?sslmode=require
```

### 2. Monitor Pre-Deploy Job Logs

On next deployment:
```
1. Go to: App Platform → Activity tab
2. Click on deployment
3. View "run-migrations" job logs
4. Verify it shows: "✅ MIGRATIONS COMPLETED SUCCESSFULLY"
```

### 3. Test Pre-Deploy Job Locally

```powershell
# Simulate pre-deploy job
$env:DATABASE_URL = "postgresql://..."
$env:NODE_ENV = "production"

# Run commands from production-app.yaml
npm ci
npx prisma migrate deploy
npx prisma generate
```

---

## Related Documentation

- [Production Deployment Guide](./PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Database Migration Guide](../database/MIGRATION_GUIDE.md)
- [Prisma Migration Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [DigitalOcean Database Documentation](https://docs.digitalocean.com/products/databases/)

---

## Emergency Contacts

If migrations fail repeatedly:

1. **Check DigitalOcean Status:** https://status.digitalocean.com
2. **Review Database Logs:** DigitalOcean Console → Databases → Logs
3. **Contact DigitalOcean Support:** If database issues persist
4. **Rollback Plan:** Restore from backup and revert deployment

---

**Created:** 2025-10-28  
**Last Updated:** 2025-10-28  
**Status:** Active Emergency Procedure



