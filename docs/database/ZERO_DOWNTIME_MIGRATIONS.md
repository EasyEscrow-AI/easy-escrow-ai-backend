# Zero-Downtime Database Migration Strategy

Complete guide for performing database schema changes on production systems without service interruption.

## Overview

Zero-downtime migrations allow you to update database schemas while keeping your application running continuously. This is achieved through a multi-phase approach where schema changes and application deployments are carefully coordinated.

## Core Principles

1. **Backward Compatibility**: New schema must work with both old and new application code
2. **Phased Deployment**: Changes are deployed in stages, never all at once
3. **Monitoring**: Continuous health checks ensure no service degradation
4. **Rollback Plan**: Each phase can be reversed if issues arise
5. **Data Safety**: No data loss at any stage

## 5-Phase Migration Strategy

### Phase 1: Deploy Backward-Compatible Schema Changes

**Goal**: Add new database structures without breaking existing application code.

**Allowed Operations:**
- ✅ Add new tables
- ✅ Add nullable columns
- ✅ Add indexes (with CONCURRENTLY)
- ✅ Add constraints (if data already complies)
- ✅ Create new foreign keys (if properly validated)

**Forbidden Operations:**
- ❌ Drop or rename columns
- ❌ Change column types incompatibly
- ❌ Add non-nullable columns (without default)
- ❌ Remove tables or indexes

**Example:**
```sql
-- Phase 1 Migration: Add new column that doesn't break existing code
-- File: migrations/001_add_user_status_phase1.sql

BEGIN;

-- Add new nullable column (safe - won't break existing queries)
ALTER TABLE users 
ADD COLUMN account_status VARCHAR(50);

-- Add index concurrently (won't lock table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_account_status 
ON users(account_status);

-- Add comment for documentation
COMMENT ON COLUMN users.account_status IS 'User account status - Phase 1 of status migration';

COMMIT;
```

**Verification:**
```sql
-- Verify column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name = 'account_status';

-- Verify index exists
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'users' 
AND indexname = 'idx_users_account_status';
```

**Deployment:**
```bash
# Apply migration
npx prisma migrate deploy

# Verify application still works
curl -f https://staging-api.easyescrow.ai/health || exit 1

# Monitor logs for errors
docker compose logs -f backend --tail 100
```

### Phase 2: Deploy Application Code Supporting Both Schemas

**Goal**: Update application to read/write using BOTH old and new schema structures.

**Implementation Patterns:**

#### Pattern A: Dual-Write Strategy
```typescript
// services/user.service.ts

export class UserService {
  async updateUser(userId: string, updates: UserUpdate) {
    // Write to BOTH old and new fields during transition
    await prisma.user.update({
      where: { id: userId },
      data: {
        // Old field (still exists)
        status: updates.status,
        
        // New field (added in Phase 1)
        account_status: updates.status, // Dual write
      },
    });
  }

  async getUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    // Read from new field, fallback to old
    return {
      ...user,
      status: user.account_status || user.status, // Dual read
    };
  }
}
```

#### Pattern B: Conditional Reading
```typescript
export class UserService {
  async getUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    // Prefer new field if available
    const status = user.account_status ?? user.status;

    return {
      ...user,
      status,
    };
  }
}
```

**Prisma Schema Update:**
```prisma
// prisma/schema.prisma

model User {
  id              String   @id @default(uuid())
  email           String   @unique
  name            String
  
  // OLD field (deprecated, to be removed in Phase 5)
  status          String?  // Made optional for transition
  
  // NEW field (added in Phase 1)
  account_status  String?  // Will become required in Phase 4
  
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
}
```

**Deployment:**
```bash
# Build application with new code
npm run build

# Deploy to staging
docker compose up -d --build backend

# Verify both old and new paths work
npm run test:staging:e2e
```

### Phase 3: Run Data Migration & Breaking Schema Changes

**Goal**: Migrate existing data and apply schema changes that would break old code.

**Data Migration:**
```sql
-- Phase 3 Migration: Migrate existing data
-- File: migrations/002_migrate_user_status_phase3.sql

BEGIN;

-- Migrate data from old column to new column
UPDATE users 
SET account_status = status 
WHERE account_status IS NULL 
AND status IS NOT NULL;

-- Verify all data migrated
DO $$
DECLARE
  unmigrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmigrated_count
  FROM users 
  WHERE status IS NOT NULL 
  AND account_status IS NULL;
  
  IF unmigrated_count > 0 THEN
    RAISE EXCEPTION 'Data migration incomplete: % rows not migrated', unmigrated_count;
  END IF;
END $$;

-- Set default for new column
ALTER TABLE users 
ALTER COLUMN account_status SET DEFAULT 'active';

-- Make new column non-nullable (breaking change)
-- This is safe now because all existing rows have values
ALTER TABLE users 
ALTER COLUMN account_status SET NOT NULL;

COMMIT;
```

**Verification:**
```sql
-- Verify data migration completed
SELECT 
  COUNT(*) as total_users,
  COUNT(account_status) as users_with_new_status,
  COUNT(status) as users_with_old_status
FROM users;

-- Verify no NULL values in new column
SELECT COUNT(*) as null_count 
FROM users 
WHERE account_status IS NULL;
-- Should return 0

-- Verify constraint applied
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name = 'account_status';
-- Should show is_nullable = 'NO'
```

**Deployment:**
```bash
# Apply migration
npx prisma migrate deploy

# Verify migration success
npm run db:test-connection

# Run data integrity checks
npm run test:data-integrity
```

### Phase 4: Deploy Final Application Code

**Goal**: Update application to use ONLY the new schema, remove references to old fields.

**Code Cleanup:**
```typescript
// services/user.service.ts

export class UserService {
  async updateUser(userId: string, updates: UserUpdate) {
    // Only write to new field
    await prisma.user.update({
      where: { id: userId },
      data: {
        account_status: updates.status, // Only new field
      },
    });
  }

  async getUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    // Only read from new field
    return {
      ...user,
      status: user.account_status, // Only new field
    };
  }
}
```

**Prisma Schema Update:**
```prisma
// prisma/schema.prisma

model User {
  id              String   @id @default(uuid())
  email           String   @unique
  name            String
  
  // OLD field removed from schema
  // status will be dropped in Phase 5
  
  // NEW field (now required)
  account_status  String   @default("active")
  
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
}
```

**Deployment:**
```bash
# Build application without old field references
npm run build

# Deploy
docker compose up -d --build backend

# Verify application works correctly
npm run test:staging:e2e

# Monitor for any errors
docker compose logs -f backend | grep -i "status"
```

### Phase 5: Clean Up Deprecated Schema Elements

**Goal**: Remove old database structures that are no longer used.

**Cleanup Migration:**
```sql
-- Phase 5 Migration: Remove deprecated column
-- File: migrations/003_cleanup_user_status_phase5.sql

BEGIN;

-- Drop old column (now safe - no code references it)
ALTER TABLE users 
DROP COLUMN IF EXISTS status;

-- Remove old indexes related to dropped column
DROP INDEX IF EXISTS idx_users_status;

-- Update table comment
COMMENT ON TABLE users IS 'Users table - Status migration completed';

COMMIT;
```

**Verification:**
```sql
-- Verify old column is gone
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name = 'status';
-- Should return no rows

-- Verify new column is primary status field
SELECT column_name, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name = 'account_status';
```

**Deployment:**
```bash
# Apply cleanup migration
npx prisma migrate deploy

# Final verification
npm run test:staging:e2e

# Document completion
echo "User status migration completed on $(date)" >> migration-log.txt
```

## Complete Example: Renaming a Column

Let's walk through a complete example of renaming `users.role` to `users.user_role`.

### Phase 1: Add New Column

```sql
-- migrations/001_add_user_role_phase1.sql
ALTER TABLE users ADD COLUMN user_role VARCHAR(50);
CREATE INDEX CONCURRENTLY idx_users_user_role ON users(user_role);
```

### Phase 2: Dual Read/Write Code

```typescript
// Before
user.role = 'admin';

// During Phase 2
await prisma.user.update({
  data: {
    role: 'admin',      // Write to old
    user_role: 'admin', // Write to new
  },
});

// Read with fallback
const role = user.user_role || user.role;
```

### Phase 3: Migrate Data

```sql
-- migrations/002_migrate_user_role_phase3.sql
UPDATE users SET user_role = role WHERE user_role IS NULL;
ALTER TABLE users ALTER COLUMN user_role SET NOT NULL;
```

### Phase 4: Use Only New Column

```typescript
// After
user.user_role = 'admin'; // Only new column
```

### Phase 5: Drop Old Column

```sql
-- migrations/003_cleanup_user_role_phase5.sql
ALTER TABLE users DROP COLUMN role;
```

## Monitoring During Migration

### Health Checks

```bash
#!/bin/bash
# scripts/deployment/staging/monitor-migration.sh

# Check application health
check_health() {
  response=$(curl -s -o /dev/null -w "%{http_code}" https://staging-api.easyescrow.ai/health)
  if [ "$response" -eq 200 ]; then
    echo "✅ Health check passed"
    return 0
  else
    echo "❌ Health check failed: $response"
    return 1
  fi
}

# Check database connectivity
check_database() {
  npm run db:test-connection
}

# Monitor error logs
monitor_logs() {
  docker compose logs -f backend --tail 50 | grep -i "error\|exception\|fail" &
  LOG_PID=$!
  sleep 30
  kill $LOG_PID
}

# Main monitoring loop
echo "Starting migration monitoring..."
for i in {1..10}; do
  echo "\n--- Check $i/10 ---"
  check_health || exit 1
  check_database || exit 1
  sleep 30
done

echo "✅ Migration monitoring completed successfully"
```

### Performance Monitoring

```sql
-- Monitor active queries during migration
SELECT 
  pid,
  usename,
  application_name,
  state,
  query_start,
  NOW() - query_start as duration,
  LEFT(query, 100) as query_preview
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- Monitor lock waits
SELECT 
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

## Rollback Procedures

Each phase should have a documented rollback procedure:

### Phase 1 Rollback
```sql
-- Safe to rollback - just drop new structures
ALTER TABLE users DROP COLUMN IF EXISTS account_status;
DROP INDEX IF EXISTS idx_users_account_status;
```

### Phase 2 Rollback
```bash
# Redeploy old application version
git checkout previous-release
npm run build
docker compose up -d --build backend
```

### Phase 3 Rollback
```sql
-- Revert data migration
UPDATE users SET account_status = NULL;
ALTER TABLE users ALTER COLUMN account_status DROP NOT NULL;
```

### Phase 4 Rollback
```bash
# Redeploy Phase 2 code (dual read/write)
git checkout phase-2-tag
npm run build
docker compose up -d --build backend
```

### Phase 5 Rollback
```sql
-- Cannot rollback dropped column without restore
-- This is why Phase 4 must be stable before Phase 5
```

## Best Practices

1. **Test on Staging First**: Always run complete migration on STAGING before production
2. **Time Between Phases**: Wait 24-48 hours between phases to detect issues
3. **Monitor Continuously**: Watch logs, metrics, and health checks during and after each phase
4. **Document Everything**: Keep detailed notes of what was done and when
5. **Backup Before Each Phase**: Create database backup before applying any changes
6. **Use Feature Flags**: Consider feature flags to toggle between old/new behavior
7. **Communicate**: Notify team before each phase, especially for production

## When Zero-Downtime Isn't Necessary

Zero-downtime migrations add complexity. Use simpler approaches when:
- Working on development/test environments
- Application can tolerate brief downtime
- Migration is very simple (e.g., adding nullable column)
- User base is small and can be notified of maintenance

## Tools and Automation

### Migration Orchestration Script

```bash
#!/bin/bash
# scripts/deployment/staging/zero-downtime-migration.sh

PHASE=$1

case $PHASE in
  phase1)
    echo "Phase 1: Deploying backward-compatible schema..."
    npx prisma migrate deploy
    npm run test:staging:smoke
    ;;
  phase2)
    echo "Phase 2: Deploying dual-support application code..."
    npm run build
    docker compose up -d --build backend
    npm run test:staging:e2e
    ;;
  phase3)
    echo "Phase 3: Running data migration and breaking changes..."
    npx prisma migrate deploy
    npm run test:data-integrity
    ;;
  phase4)
    echo "Phase 4: Deploying final application code..."
    npm run build
    docker compose up -d --build backend
    npm run test:staging:e2e
    ;;
  phase5)
    echo "Phase 5: Cleaning up deprecated schema elements..."
    npx prisma migrate deploy
    echo "Migration complete!" >> migration-log.txt
    ;;
  *)
    echo "Usage: $0 {phase1|phase2|phase3|phase4|phase5}"
    exit 1
    ;;
esac
```

## Related Documentation

- [Migration Testing Framework](../../tests/migrations/README.md)
- [STAGING Migration Procedures](./STAGING_MIGRATION_PROCEDURES.md)
- [Database Setup Guide](../setup/DATABASE_SETUP.md)

## References

- [PostgreSQL ALTER TABLE Documentation](https://www.postgresql.org/docs/current/sql-altertable.html)
- [Prisma Migrations Guide](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Database Reliability Engineering](https://www.oreilly.com/library/view/database-reliability-engineering/9781491925935/)

