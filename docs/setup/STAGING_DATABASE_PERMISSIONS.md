# Staging Database Permissions Setup

## Overview

The staging database PRE_DEPLOY migration job needs special permissions to modify the database schema (create tables, add columns, etc.). This guide walks through granting those permissions to `staging_user`.

---

## Problem

When the PRE_DEPLOY job runs `npx prisma migrate deploy`, it fails with:

```
Error: ERROR: permission denied for schema public
```

This happens because `staging_user` (the normal app user) doesn't have permission to:
- Create the `_prisma_migrations` table
- Modify schema (ALTER TABLE, CREATE INDEX, etc.)

---

## Solution: One-Time Permissions Setup

### Prerequisites

- **psql** (PostgreSQL client) installed
  - Windows: https://www.postgresql.org/download/windows/
  - Or via scoop: `scoop install postgresql`
- Admin access to DigitalOcean

---

## Step 1: Get Admin Connection String

1. Go to **DigitalOcean Console**
2. Navigate to: **Databases** → **easyescrow-staging-postgres**
3. Click: **Connection Details**
4. Select user: **doadmin**
5. Copy the connection string (looks like):
   ```
   postgresql://doadmin:AVNS_DG9maU3rRLpkAsMIZBw@app-6edf36b5-2060-49ea-af5d-f834223cbb8a-do-user-11230012-0.f.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require
   ```

---

## Step 2: Set Environment Variable

### PowerShell (Windows):
```powershell
$env:DATABASE_ADMIN_URL = "postgresql://doadmin:PASSWORD@HOST:25060/easyescrow_staging?sslmode=require"
```

### Bash (Linux/Mac):
```bash
export DATABASE_ADMIN_URL="postgresql://doadmin:PASSWORD@HOST:25060/easyescrow_staging?sslmode=require"
```

### Alternative: Create `.env.staging` (Local Only)

Create `.env.staging` in project root (gitignored):

```bash
DATABASE_ADMIN_URL=postgresql://doadmin:PASSWORD@HOST:25060/easyescrow_staging?sslmode=require
```

Then load it:
```powershell
# PowerShell
Get-Content .env.staging | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}
```

---

## Step 3: Run Setup Script

### Using PowerShell Script (Recommended):

```powershell
# Navigate to project root
cd C:\websites\VENTURE\easy-escrow-ai-backend

# Run the setup script
.\scripts\database\setup-staging-permissions.ps1
```

The script will:
1. ✅ Connect to the database as `doadmin`
2. ✅ Grant all necessary permissions to `staging_user`
3. ✅ Set default privileges for future objects
4. ✅ Verify permissions were applied

### Expected Output:

```
═══════════════════════════════════════════════════════
  Staging Database Permissions Setup
═══════════════════════════════════════════════════════

ℹ️  Using admin connection string
ℹ️  Connection: app-6edf36b5-2060-49ea-af5d-f834223cbb8a-do-user-11230012-0.f.db.ondigitalocean.com:25060

🔧 Granting permissions to staging_user...

NOTICE:  🔧 Granting permissions to staging_user...
GRANT
GRANT
GRANT
GRANT
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
GRANT
NOTICE:  ✅ Permissions granted successfully

📋 Current permissions for staging_user:
 schema | usage    | create
--------+----------+-----------
 public | ✅ USAGE | ✅ CREATE

✅ Permissions granted successfully!

ℹ️  Next steps:
ℹ️  1. Trigger a new deployment:
ℹ️     doctl apps create-deployment ea13cdbb-c74e-40da-a0eb-6c05b0d0432d
ℹ️  
ℹ️  2. Or wait for next git push to staging branch
ℹ️  
ℹ️  3. The PRE_DEPLOY migration job will now succeed! ✅

═══════════════════════════════════════════════════════
```

---

## Step 4: Trigger Deployment

After permissions are granted, trigger a new deployment:

```powershell
doctl apps create-deployment ea13cdbb-c74e-40da-a0eb-6c05b0d0432d
```

Or simply push to the `staging` branch and the PRE_DEPLOY job will run automatically.

---

## Step 5: Verify It Worked

### Check Deployment Logs:

```powershell
# Wait ~5 minutes for build + deploy
Start-Sleep -Seconds 300

# Check logs for migration success
doctl apps logs ea13cdbb-c74e-40da-a0eb-6c05b0d0432d --type run --tail 50
```

### Look for:

✅ **SUCCESS** - No errors, service starts normally:
```
[SettlementService] Checking for agreements ready to settle...
[ExpiryService] Started successfully
✅ All background services started
```

❌ **FAILURE** - Still seeing errors:
```
The column `agreements.archived_at` does not exist
```

If still failing, the migration didn't run. Check build logs for PRE_DEPLOY job output.

---

## Manual Verification (Optional)

Connect to the database and verify permissions:

```sql
-- Connect as staging_user
psql "postgresql://staging_user:PASSWORD@HOST:25060/easyescrow_staging"

-- Check schema permissions
SELECT 
    nspname as schema,
    has_schema_privilege('staging_user', nspname, 'USAGE') as usage,
    has_schema_privilege('staging_user', nspname, 'CREATE') as create
FROM pg_namespace 
WHERE nspname = 'public';

-- Should return:
--  schema | usage | create
-- --------+-------+--------
--  public | t     | t
```

---

## Troubleshooting

### Error: `psql: command not found`

Install PostgreSQL client:
- **Windows**: https://www.postgresql.org/download/windows/
- **Scoop**: `scoop install postgresql`
- **Chocolatey**: `choco install postgresql`

### Error: `connection refused`

- Check that connection string is correct
- Verify database cluster is running in DigitalOcean
- Ensure firewall allows your IP (check DigitalOcean database settings)

### Error: `password authentication failed`

- Verify you're using the correct admin password
- Get fresh connection string from DigitalOcean (passwords may rotate)

### Error: `permission denied` (even after running script)

- Verify you connected as `doadmin` (not `staging_user`)
- Check that SQL commands completed without errors
- Try running the manual SQL commands via DigitalOcean console instead

---

## Alternative: Manual SQL via DigitalOcean Console

If the script doesn't work, run SQL commands directly in DigitalOcean:

1. Go to: **Databases** → **easyescrow-staging-postgres** → **Console**
2. Paste these commands:

```sql
-- Connect to staging database
\c easyescrow_staging

-- Grant all permissions to staging_user
GRANT ALL PRIVILEGES ON SCHEMA public TO staging_user;
GRANT CREATE ON SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO staging_user;

-- Verify
\dp
```

---

## Summary

This is a **ONE-TIME setup** needed when:
- ✅ First setting up staging environment
- ✅ After recreating the database
- ✅ After adding new database users

Once permissions are granted, the PRE_DEPLOY migration job will work automatically on every deployment! 🎉

---

## Related Documentation

- [DigitalOcean Secrets Configuration](../DIGITALOCEAN_SECRETS_CONFIGURATION.md)
- [Staging Environment Setup](./STAGING_ENV_TEMPLATE.md)
- [Database Migration Guide](../deployment/DATABASE_MIGRATIONS.md)


