# Migration Failure P3009 - Failed Migration Recovery

**Date**: November 17, 2025  
**Error**: P3009 - migrate found failed migrations  
**Status**: ✅ SCRIPTS DEPLOYED - ⚠️ CONFIGURATION UPDATE REQUIRED  
**Commits**: `f06a697`, `32c5db6`

---

## Issue Timeline

### 23:39 UTC - First Deployment Failure
**Error**: `P3018 - column "taker_wallet" does not exist`
- Two conflicting migrations trying to create atomic swap tables
- First migration incomplete, second migration failed

### 23:43 UTC - Hotfix #1 (Consolidated Migration)
**Commit**: `f06a697`
- Deleted conflicting migrations
- Created single consolidated migration: `20251117234309_fix_atomic_swap_schema`
- Pushed to staging

### 23:48 UTC - Second Deployment Failure
**Error**: `P3009 - migrate found failed migrations`
```
The `20251117192727_add_atomic_swap_models` migration started at 2025-11-17 23:39:06.883395 UTC failed
```
- Failed migration record still in database's `_prisma_migrations` table
- Prisma refuses to run new migrations until failed one is resolved

### 23:50 UTC - Hotfix #2 (Migration Resolve Scripts)
**Commit**: `32c5db6`
- Created migration resolve scripts (bash + PowerShell)
- Updated package.json with new scripts
- Pushed to staging
- **⚠️ REQUIRES DIGITALOCEAN CONFIGURATION UPDATE**

---

## Root Cause Analysis

### Technical Details
1. **Prisma Migration Tracking**: Prisma maintains a `_prisma_migrations` table tracking all migration attempts
2. **Failed State**: Migration `20251117192727_add_atomic_swap_models` is marked as "failed" in this table
3. **Safety Lock**: Prisma won't apply new migrations when failed migrations exist (prevents data corruption)
4. **Resolution Required**: Failed migration must be marked as "rolled back" before new migrations can run

### Why This Happened
1. First deployment attempted to apply conflicting migrations
2. First migration partially succeeded (created tables without all columns)
3. Second migration failed (tried to create indexes on missing columns)
4. Failed migration recorded in `_prisma_migrations` table
5. Even after we deleted the migration file, the database still has the failure record

---

## Solution

### Scripts Created

#### 1. Linux/Mac Script: `scripts/database/migrate-with-resolve.sh`
```bash
#!/bin/bash

echo "🔄 Checking for failed migrations..."

# Try to mark the known failed migration as rolled back
npx prisma migrate resolve --rolled-back 20251117192727_add_atomic_swap_models 2>/dev/null || \
  echo "⚠️  Migration already resolved or not found"

echo "📦 Deploying migrations..."
npx prisma migrate deploy

if [ $? -eq 0 ]; then
  echo "✅ Migrations deployed successfully"
  exit 0
else
  echo "❌ Migration deployment failed"
  exit 1
fi
```

#### 2. Windows Script: `scripts/database/migrate-with-resolve.ps1`
```powershell
Write-Host "🔄 Checking for failed migrations..." -ForegroundColor Cyan

try {
    npx prisma migrate resolve --rolled-back 20251117192727_add_atomic_swap_models 2>&1 | Out-Null
    Write-Host "✅ Failed migration resolved" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Migration already resolved or not found" -ForegroundColor Yellow
}

Write-Host "📦 Deploying migrations..." -ForegroundColor Cyan
npx prisma migrate deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migrations deployed successfully" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ Migration deployment failed" -ForegroundColor Red
    exit 1
}
```

### NPM Scripts Added
```json
{
  "scripts": {
    "db:migrate:resolve": "bash scripts/database/migrate-with-resolve.sh",
    "db:migrate:resolve:win": "powershell -ExecutionPolicy Bypass -File scripts/database/migrate-with-resolve.ps1"
  }
}
```

---

## Required Configuration Update

### DigitalOcean App Platform Pre-Deploy Job

**Current Configuration:**
```yaml
jobs:
  - name: db-migrate
    kind: PRE_DEPLOY
    run_command: npm run db:migrate:deploy
```

**Required Change:**
```yaml
jobs:
  - name: db-migrate
    kind: PRE_DEPLOY
    run_command: npm run db:migrate:resolve  # ← CHANGE THIS
```

### How to Update

1. **Go to DigitalOcean Console**
   - Navigate to Apps → Your Staging App
   - Click Settings → App Spec (or Components)

2. **Find Pre-Deploy Job**
   - Look for the `db-migrate` job
   - Find the `run_command` line

3. **Update Command**
   - Change: `npm run db:migrate:deploy`
   - To: `npm run db:migrate:resolve`

4. **Save and Deploy**
   - Click "Save"
   - Trigger a new deployment (or wait for auto-deploy)

---

## How It Works

### Script Behavior
1. **Check for Failed Migration**
   - Runs: `prisma migrate resolve --rolled-back 20251117192727_add_atomic_swap_models`
   - If migration exists and is failed: marks it as rolled back ✅
   - If migration doesn't exist: continues gracefully ✅
   - If migration already resolved: continues gracefully ✅

2. **Deploy New Migrations**
   - Runs: `prisma migrate deploy`
   - Applies all pending migrations
   - In this case: `20251117234309_fix_atomic_swap_schema`

3. **Return Status**
   - Exit 0 if successful (green checkmark in DigitalOcean)
   - Exit 1 if failed (red X in DigitalOcean)

### Expected Output
```
🔄 Checking for failed migrations...
✅ Failed migration resolved
📦 Deploying migrations...
Applying migration `20251117234309_fix_atomic_swap_schema`
✅ Migrations deployed successfully
```

---

## Alternative Solutions

### Option 1: Manual Resolution (If SSH Access Available)
```bash
# SSH into staging environment
ssh your-staging-server

# Mark failed migration as rolled back
npx prisma migrate resolve --rolled-back 20251117192727_add_atomic_swap_models

# Deploy new migrations
npx prisma migrate deploy
```

### Option 2: Database Direct SQL (Last Resort)
```sql
-- Connect to staging PostgreSQL database
UPDATE _prisma_migrations
SET rolled_back_at = NOW()
WHERE migration_name = '20251117192727_add_atomic_swap_models'
AND finished_at IS NULL;
```
**⚠️ NOT RECOMMENDED** - Only use if other options fail

---

## Verification Steps

After deployment with the new script:

### 1. Check Deployment Logs
```
✅ Look for "Migrations deployed successfully"
❌ If you see errors, check the error message
```

### 2. Verify Database Tables
```sql
-- Check if atomic swap tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('users', 'nonce_pool', 'swap_offers', 'swap_transactions');
```

Expected: All 4 tables should be present

### 3. Check Migration History
```sql
-- Check Prisma migration tracking
SELECT migration_name, finished_at, rolled_back_at 
FROM _prisma_migrations 
ORDER BY started_at DESC 
LIMIT 5;
```

Expected Results:
- `20251117234309_fix_atomic_swap_schema` - finished_at: timestamp, rolled_back_at: NULL
- `20251117192727_add_atomic_swap_models` - finished_at: NULL, rolled_back_at: timestamp

### 4. Test Backend Startup
```
✅ Backend should start without errors
✅ No database connection errors
✅ API endpoints accessible
```

---

## Long-Term Fix

### After Successful Deployment

Once the migration is successfully applied, you can optionally:

1. **Revert to Standard Script** (Recommended after confirmed working)
   ```yaml
   # After migration succeeds, change back to:
   run_command: npm run db:migrate:deploy
   ```

2. **Or Keep the Resolve Script** (Safer for future)
   - The resolve script is safe to use permanently
   - It will always check for failed migrations first
   - Provides better resilience for future issues

**Recommendation**: Keep using `npm run db:migrate:resolve` permanently as it provides an extra safety layer.

---

## Related Documentation

- **First Hotfix**: `docs/tasks/HOTFIX_ATOMIC_SWAP_MIGRATION_RESOLVED.md`
- **Consolidated Migration**: `prisma/migrations/20251117234309_fix_atomic_swap_schema/migration.sql`
- **Original PR**: #246 (feat: Atomic Swap Configuration)

---

## Lessons Learned

### What Went Wrong
1. **Conflicting Migrations**: Two separate migrations created instead of one
2. **Incomplete Testing**: Didn't catch the issue on a clean database
3. **Migration Recovery**: No automated way to handle failed migrations

### Improvements Made
1. **Automated Recovery**: Created scripts to handle failed migrations automatically
2. **Better Resilience**: Scripts handle edge cases gracefully
3. **Cross-Platform Support**: Both Linux and Windows scripts provided
4. **Documentation**: Comprehensive docs for future reference

### Future Recommendations
1. **Always test migrations on clean database** before deploying
2. **Use the resolve script** as standard practice
3. **Monitor `_prisma_migrations` table** for failed states
4. **Have rollback strategy** for all migrations
5. **Consider database backups** before major schema changes

---

## Quick Reference

### Commands
```bash
# Mark failed migration as rolled back
npx prisma migrate resolve --rolled-back 20251117192727_add_atomic_swap_models

# Deploy pending migrations
npx prisma migrate deploy

# Combined (Linux/Mac)
npm run db:migrate:resolve

# Combined (Windows)
npm run db:migrate:resolve:win
```

### Status Codes
- **P3009**: Failed migrations found, new migrations blocked
- **P3018**: Migration failed during execution (column doesn't exist)
- **Exit 0**: Success
- **Exit 1**: Failure

---

**Status**: ✅ SCRIPTS READY - ⚠️ AWAITING DIGITALOCEAN CONFIG UPDATE  
**Next Action**: Update DigitalOcean pre-deploy job to use `npm run db:migrate:resolve`

