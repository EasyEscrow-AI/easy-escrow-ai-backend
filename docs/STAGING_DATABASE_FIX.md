# Staging Database Connection Fix

## Root Cause

The `${easyescrow-staging-postgres.DATABASE_URL}` reference in the app spec points to the **`defaultdb`** database, not our actual **`easyescrow_staging`** database.

This is why migrations fail with "permission denied" - the app is connecting to the wrong database!

### Evidence:
```bash
$ doctl databases connection c172d515-f258-412a-b8e8-6e821eb953be
Database     Host                                                    Port     User       Password
defaultdb    easyescrow-staging-postgres-do-user-11230012-0...      25060    doadmin    AVNS_DG9maU3rRLpkAsMIZBw
```

## Solution

We use TWO environment variables with clear naming:
- `DATABASE_URL` = Direct connection (for migrations)
- `DATABASE_URL_POOL` = Connection pool (for app runtime)

### Step 1: Add Environment Variables (DigitalOcean Console)

1. Go to: **DigitalOcean → Apps → easyescrow-backend-staging → Settings → Environment Variables**

#### For the `db-migrate` job (Migrations):

   **Key:** `DATABASE_URL`  
   **Value:** 
   ```
   postgresql://staging_user:AVNS_Eat2QwFGOloJzUY0WrF@easyescrow-staging-postgres-do-user-11230012-0.d.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require
   ```
   **Encrypted:** ✅ YES  
   **Scope:** `RUN_AND_BUILD_TIME`

#### For the `api-staging` service (App Runtime):

   **Key:** `DATABASE_URL_POOL`  
   **Value:** 
   ```
   postgresql://staging_user:AVNS_Eat2QwFGOloJzUY0WrF@easyescrow-staging-postgres-do-user-11230012-0.d.db.ondigitalocean.com:25061/easyescrow_staging_pool?sslmode=require&pgbouncer=true&connection_limit=5&pool_timeout=10
   ```
   **Encrypted:** ✅ YES  
   **Scope:** `RUN_AND_BUILD_TIME`

2. Click: **Save**

### Step 2: Deploy Updated App Spec

The app spec has been updated to use `${DATABASE_URL}` instead of the managed database reference.

```bash
# Commit the updated spec
git add .do/app-staging.yaml
git commit -m "fix: use explicit DATABASE_URL for staging database connection"
git push origin staging

# Update the app
doctl apps update ea13cdbb-c74e-40da-a0eb-6c05b0d0432d --spec .do/app-staging.yaml
```

### Step 3: Trigger Deployment

```bash
doctl apps create-deployment ea13cdbb-c74e-40da-a0eb-6c05b0d0432d
```

## Verification

After deployment, check logs:

```bash
# Wait 5 minutes for build + migration
Start-Sleep -Seconds 300

# Check logs
doctl apps logs ea13cdbb-c74e-40da-a0eb-6c05b0d0432d --type build --tail 100
```

### Expected Success:
```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "easyescrow_staging" at "..."
4 migrations found in prisma/migrations
✓ Migration applied: 20251031175930_init
✓ Migration applied: 20251031180015_add_monitoring_fields
✓ Migration applied: 20251031200530_add_resource_tracking
✓ Migration applied: 20251101030555_add_archived_status
✅ Migrations complete!
```

## Why This Happened

1. **Wrong Database**: DigitalOcean managed database references (`${database-name.DATABASE_URL}`) point to the default system database (`defaultdb`), not our custom `easyescrow_staging` database.

2. **Wrong Connection Type**: Migrations need a **direct connection** (port 25060), not a **connection pool** (port 25061), because PgBouncer doesn't support DDL operations (CREATE TABLE, ALTER TABLE, etc.).

## Architecture: Two Connections

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
│  App Service (api-staging)                          │
│  Uses: DATABASE_URL_POOL                            │
│  Port: 25061 (PgBouncer pool)                      │
│  Purpose: Runtime queries (DML)                    │
│  ✅ Efficient connection pooling                   │
│  ✅ Handles high concurrency                       │
└─────────────────────────────────────────────────────┘
```

## Related Files

- `.do/app-staging.yaml` - Updated to use `${DATABASE_URL}` secret
- `scripts/database/setup-staging-permissions.ts` - Grants permissions (already run)
- `docs/setup/STAGING_DATABASE_PERMISSIONS.md` - Permission setup guide

