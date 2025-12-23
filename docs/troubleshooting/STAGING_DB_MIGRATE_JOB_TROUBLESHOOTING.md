# PRE_DEPLOY Job Not Running - Troubleshooting

## Issue

The `db-migrate` PRE_DEPLOY job is configured in `.do/app-staging.yaml` but the database migration is NOT being applied on deployment.

**Evidence:**
- Configuration exists: Lines 21-42 in `.do/app-staging.yaml`
- Job command: `npx prisma migrate deploy`
- Result: Database still missing `offered_sol_lamports` and `requested_sol_lamports` columns

## Common Causes

### 1. Job Failing Silently

**Symptoms:**
- Deployment succeeds
- App starts normally
- But database schema is outdated

**Check:**
```bash
# View logs for the db-migrate job
doctl apps logs <app-id> --type run_pre_deploy
```

Or via console:
1. Go to app in DigitalOcean
2. Click "Runtime Logs"
3. Filter by component: `db-migrate`
4. Look for errors

### 2. DATABASE_URL Not Accessible

**Issue:** The PRE_DEPLOY job might not have access to the `${DATABASE_URL}` secret.

**Fix:**
1. Go to DigitalOcean Console → App → Settings → Environment Variables
2. Verify `DATABASE_URL` has scope: `RUN_AND_BUILD_TIME`
3. If it only has `RUN_TIME`, the PRE_DEPLOY job can't see it

**Check current config:**
```yaml
envs:
  - key: DATABASE_URL
    scope: RUN_AND_BUILD_TIME  # ← Must include BUILD_TIME
    type: SECRET
    value: ${DATABASE_URL}
```

### 3. Missing Prisma Files

**Issue:** The job container might not have Prisma schema/migrations.

**Verify:** Check that these are committed:
- `prisma/schema.prisma`
- `prisma/migrations/*/migration.sql`
- `package.json` (includes `@prisma/client`)

### 4. Wrong DATABASE_URL Format

**Issue:** The URL might use connection pooler (port 25061) instead of direct connection (port 25060).

**PRE_DEPLOY jobs need direct connection because:**
- PgBouncer (pooler) doesn't support DDL (ALTER TABLE)
- Migrations use schema migrations table

**Correct format:**
```
postgresql://user:password@host:25060/database?sslmode=require
         Direct connection ↑
```

**Wrong format:**
```
postgresql://user:password@host:25061/database?sslmode=require
         Connection pooler ↑ (doesn't support migrations)
```

### 5. Job Not Configured to Deploy on Push

**Check:**
```yaml
jobs:
  - name: db-migrate
    kind: PRE_DEPLOY
    github:
      repo: VENTURE-AI-LABS/easy-escrow-ai-backend
      branch: staging
      deploy_on_push: true  # ← Must be true
```

## Solutions

### Solution 1: Check Job Logs (Immediate)

1. Go to: https://cloud.digitalocean.com/apps
2. Select: `easyescrow-backend-staging`
3. Click: **Runtime Logs**
4. Filter by: Component = `db-migrate`
5. Look for the last run

**Expected output:**
```
Prisma schema loaded from prisma/schema.prisma
13 migrations found in prisma/migrations
Applying migration '20241118045835_add_sol_lamports_to_swap_offer'
Migration applied successfully
```

**If you see errors**, note them and fix accordingly.

### Solution 2: Verify Environment Variable Scope

1. Go to: DigitalOcean Console → App → Settings
2. Click: **Environment Variables**
3. Find: `DATABASE_URL`
4. Verify: Scope includes `BUILD_TIME` (not just `RUN_TIME`)
5. If wrong, update and redeploy

### Solution 3: Manual Migration (Temporary Fix)

Until the PRE_DEPLOY job is fixed, run migration manually:

**Option A: Via App Console**
```bash
# In DigitalOcean App Console
npx prisma migrate deploy
```

**Option B: Via Database Console**
```sql
-- In PostgreSQL Query Console
ALTER TABLE swap_offers 
ADD COLUMN IF NOT EXISTS offered_sol_lamports BIGINT,
ADD COLUMN IF NOT EXISTS requested_sol_lamports BIGINT;
```

### Solution 4: Force Redeploy

Sometimes DigitalOcean needs a forced redeploy to pick up job changes:

```bash
# Via doctl
doctl apps update <app-id> --spec .do/app-staging.yaml
doctl apps create-deployment <app-id>
```

Or via console:
1. Go to app
2. Click **Settings** tab
3. Click **Force Rebuild & Deploy**

### Solution 5: Add Deployment Log

Add logging to the job to debug:

```yaml
jobs:
  - name: db-migrate
    kind: PRE_DEPLOY
    run_command: |
      echo "Starting database migration..."
      echo "DATABASE_URL is set: $([[ -n "$DATABASE_URL" ]] && echo 'YES' || echo 'NO')"
      npx prisma migrate deploy
      echo "Migration complete"
```

## Verification

After fixing, verify the migration ran:

1. **Check logs:**
   ```bash
   doctl apps logs <app-id> --type run_pre_deploy
   ```

2. **Check database:**
   ```bash
   # In app console
   npx prisma studio
   # Or query directly
   psql $DATABASE_URL -c "\d swap_offers"
   ```

3. **Run E2E test:**
   ```bash
   npm run test:staging:e2e:atomic:nft-sol
   ```

## Prevention

### Add Health Check for Migrations

Add this to your schema validation:

```typescript
// src/config/validation.ts
async function validateSchema() {
  const result = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'swap_offers' 
    AND column_name IN ('offered_sol_lamports', 'requested_sol_lamports')
  `;
  
  if (result.length !== 2) {
    throw new Error('Missing required database columns. Run: npx prisma migrate deploy');
  }
}
```

### Add CI/CD Check

```yaml
# .github/workflows/deploy-staging.yml
- name: Check for pending migrations
  run: |
    npx prisma migrate status
    if npx prisma migrate status | grep -q "pending"; then
      echo "⚠️  WARNING: Pending migrations detected!"
      exit 1
    fi
```

## Next Steps

1. **Check db-migrate logs** for errors
2. **Verify DATABASE_URL scope** includes BUILD_TIME
3. **Run manual migration** as temporary fix
4. **Force redeploy** to test PRE_DEPLOY job
5. **Add logging** to job for debugging

---

**Created:** 2025-11-20  
**Related:** PR #263, PR #268, STAGING_MIGRATION_REQUIRED.md


