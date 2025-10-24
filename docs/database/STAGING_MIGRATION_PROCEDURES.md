# STAGING Migration Procedures

Comprehensive guide for performing database migrations on the STAGING environment with safety, testing, and rollback procedures.

## Table of Contents

- [Overview](#overview)
- [Pre-Migration Checklist](#pre-migration-checklist)
- [Migration Types](#migration-types)
- [Standard Migration Procedure](#standard-migration-procedure)
- [Zero-Downtime Migration Procedure](#zero-downtime-migration-procedure)
- [Testing Requirements](#testing-requirements)
- [Rollback Procedures](#rollback-procedures)
- [Performance Benchmarks](#performance-benchmarks)
- [Approval Process](#approval-process)
- [Post-Migration Verification](#post-migration-verification)
- [Troubleshooting](#troubleshooting)

## Overview

The STAGING environment serves as the final validation step before production deployment. All database migrations must be thoroughly tested on STAGING to ensure:

- Schema changes work correctly
- Data migrations complete successfully
- Application continues functioning
- Performance is acceptable
- Rollback procedures are validated

**Golden Rule**: Never deploy a migration to production that hasn't been successfully tested on STAGING.

## Pre-Migration Checklist

Before running any migration on STAGING, complete this checklist:

### Required Steps

- [ ] **Migration Reviewed**: Code review completed, approved by at least one other developer
- [ ] **Tests Written**: Migration testing framework tests created for this migration
- [ ] **Rollback Plan**: Down migration tested and documented
- [ ] **Backup Verified**: Backup process tested, restoration procedure documented
- [ ] **Approval Obtained**: Required approvals obtained (see Approval Process section)
- [ ] **Maintenance Window**: Scheduled time communicated to team
- [ ] **Monitoring Ready**: Dashboard/logs ready for post-migration monitoring

### Environment Verification

```bash
# Verify you're connected to STAGING
echo $DATABASE_URL
# Should contain: ...easyescrow_staging...

# Test database connection
npm run db:test-connection

# Check Prisma migrations status
npx prisma migrate status
```

### Risk Assessment

Categorize your migration:

| Risk Level | Description | Examples | Required Approvals |
|------------|-------------|----------|-------------------|
| **Low** | Additive only, no data changes | Add nullable column, add index | Developer |
| **Medium** | Modifies structure, preserves data | Rename column, change type | Developer + Tech Lead |
| **High** | Can result in data loss | Drop column, data transformation | Developer + Tech Lead + CTO |

## Migration Types

### Type 1: Simple Additive Migration

**Characteristics:**
- Adds new tables, columns, or indexes
- No modifications to existing data
- Fully backward compatible

**Procedure:**
```bash
# Standard migration procedure applies
./scripts/deployment/staging/staging-migration.sh --name "add-user-preferences"
```

**Rollback:**
- Simple - just drop the added structures

### Type 2: Schema Modification

**Characteristics:**
- Renames or modifies existing structures
- Requires application code changes
- May require zero-downtime strategy

**Procedure:**
- Use zero-downtime migration strategy (see dedicated section)
- Test each phase thoroughly

**Rollback:**
- Reverse each phase in order

### Type 3: Data Migration

**Characteristics:**
- Transforms or moves data
- Can be time-consuming on large tables
- High risk of data inconsistency

**Procedure:**
- Create comprehensive data integrity tests
- Run migration during low-traffic period
- Monitor closely during execution

**Rollback:**
- Restore from backup (data transformation may be irreversible)

## Standard Migration Procedure

For simple migrations that don't require zero-downtime strategy.

### Step 1: Prepare Migration

```bash
# Create Prisma migration
npx prisma migrate dev --name add_user_preferences

# Review generated SQL
cat prisma/migrations/<timestamp>_add_user_preferences/migration.sql
```

### Step 2: Test Locally

```bash
# Reset local database
npm run db:reset

# Apply migration
npx prisma migrate deploy

# Run tests
npm run test:unit
npm run test:integration
```

### Step 3: Test with Migration Framework

```typescript
// Add test to tests/migrations/migration-test-scenarios.ts
export const myMigrationTest: MigrationTest = {
  name: 'add-user-preferences',
  riskLevel: 'low',
  upMigration: `
    CREATE TABLE user_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      preferences JSONB NOT NULL DEFAULT '{}'
    );
  `,
  downMigration: `
    DROP TABLE IF EXISTS user_preferences CASCADE;
  `,
  dataIntegrityChecks: [
    // Add checks
  ],
};
```

```bash
# Run migration test
npm run test:migrations:low
```

### Step 4: Apply to STAGING

```bash
# Set STAGING database URL
export DATABASE_URL=$STAGING_DATABASE_URL

# Run automated migration script
./scripts/deployment/staging/staging-migration.sh \
  --name "add-user-preferences"
```

### Step 5: Verify

```bash
# Run smoke tests
npm run test:staging:smoke

# Run E2E tests
npm run test:staging:e2e

# Manual verification
# - Check health endpoint
# - Test affected features
# - Review application logs
```

## Zero-Downtime Migration Procedure

For migrations that modify existing schema and require application code changes.

See detailed guide: [Zero-Downtime Migrations](./ZERO_DOWNTIME_MIGRATIONS.md)

### Quick Reference

**Phase 1**: Add new structures (backward compatible)
```bash
./scripts/deployment/staging/zero-downtime-migration.ps1 \
  -Phase phase1 \
  -MigrationName "rename-fee-bps"
```

**Phase 2**: Deploy dual-support application code
```bash
./scripts/deployment/staging/zero-downtime-migration.ps1 \
  -Phase phase2 \
  -MigrationName "rename-fee-bps"
```

**Phase 3**: Migrate data and apply breaking changes
```bash
./scripts/deployment/staging/zero-downtime-migration.ps1 \
  -Phase phase3 \
  -MigrationName "rename-fee-bps"
```

**Phase 4**: Deploy final application code
```bash
./scripts/deployment/staging/zero-downtime-migration.ps1 \
  -Phase phase4 \
  -MigrationName "rename-fee-bps"
```

**Phase 5**: Clean up deprecated structures
```bash
./scripts/deployment/staging/zero-downtime-migration.ps1 \
  -Phase phase5 \
  -MigrationName "rename-fee-bps"
```

## Testing Requirements

### Automated Tests

All migrations must have:

1. **Migration Framework Tests**
   ```bash
   npm run test:migrations
   ```

2. **Data Integrity Tests**
   - Verify all data migrated correctly
   - Check no data loss occurred
   - Validate referential integrity

3. **Smoke Tests**
   ```bash
   npm run test:staging:smoke
   ```

4. **E2E Tests**
   ```bash
   npm run test:staging:e2e
   ```

### Manual Tests

After automated tests pass:

1. **Feature Testing**
   - Test all features affected by migration
   - Verify CRUD operations work correctly
   - Check reports and queries return correct data

2. **Performance Testing**
   - Measure query performance on affected tables
   - Check for slow queries or table scans
   - Verify indexes are being used

3. **Edge Case Testing**
   - Test with NULL values
   - Test with boundary values
   - Test with large datasets

## Rollback Procedures

### Immediate Rollback (During Migration)

If issues detected during migration:

```bash
# Stop the migration process
Ctrl+C

# Check backup location
ls -lh backups/staging/

# Restore from backup
./scripts/deployment/staging/restore-backup.sh \
  backups/staging/staging-20251024-120000.sql
```

### Delayed Rollback (After Migration)

If issues discovered after migration completion:

**Step 1**: Assess Impact
```bash
# Check migration log
cat migration-log.txt | grep "add-user-preferences"

# Identify what was changed
npx prisma migrate status
```

**Step 2**: Prepare Rollback
```bash
# Locate backup
BACKUP_FILE="backups/staging/staging-20251024-120000.sql"

# Verify backup integrity
pg_restore --list $BACKUP_FILE
```

**Step 3**: Execute Rollback
```bash
# Create snapshot of current state (for comparison)
./scripts/deployment/staging/staging-migration.sh \
  --name "pre-rollback-snapshot"

# Restore from backup
psql $STAGING_DATABASE_URL < $BACKUP_FILE

# Verify restoration
npm run test:staging:smoke
```

**Step 4**: Update Application Code
```bash
# Revert to previous application version
git checkout previous-release

# Redeploy
npm run build
docker compose up -d --build backend
```

## Performance Benchmarks

Track migration execution times and query performance.

### Execution Time Tracking

```bash
# Timed migration execution
time npx prisma migrate deploy

# Log results
echo "Migration: add-user-preferences, Duration: 5.2s" >> migration-benchmarks.txt
```

### Query Performance

Before and after migration, measure:

```sql
-- Sample queries to benchmark
EXPLAIN ANALYZE SELECT * FROM agreements WHERE status = 'PENDING';
EXPLAIN ANALYZE SELECT * FROM agreements WHERE created_at > NOW() - INTERVAL '7 days';
```

### Expected Benchmarks

| Operation | Table Size | Expected Duration |
|-----------|-----------|-------------------|
| Add nullable column | Any | < 1s |
| Add index (CONCURRENTLY) | < 100K rows | < 30s |
| Add index (CONCURRENTLY) | 100K - 1M rows | < 5m |
| Data migration | < 100K rows | < 1m |
| Data migration | 100K - 1M rows | < 10m |

### Performance Degradation Threshold

**Alert if:**
- Migration takes > 2x expected duration
- Post-migration queries are > 20% slower
- Table locks exceed 5 seconds

## Approval Process

### Low Risk Migrations

**Required Approvals:**
- Developer (author)
- Code review (any team member)

**Process:**
1. Create PR with migration
2. Get code review approval
3. Merge to staging branch
4. Run migration on STAGING
5. Verify and document results

### Medium Risk Migrations

**Required Approvals:**
- Developer (author)
- Code review (any team member)
- Tech Lead approval

**Process:**
1. Create detailed migration plan document
2. Present plan in team meeting
3. Get Tech Lead approval
4. Create PR with migration
5. Get code review approval
6. Merge to staging branch
7. Schedule migration window
8. Run migration on STAGING with team monitoring
9. Verify and document results

### High Risk Migrations

**Required Approvals:**
- Developer (author)
- Code review (any team member)
- Tech Lead approval
- CTO/VP Engineering approval

**Process:**
1. Create comprehensive migration plan:
   - Risk assessment
   - Rollback plan
   - Zero-downtime strategy (if applicable)
   - Data migration validation plan
   - Monitoring plan
2. Present to engineering leadership
3. Get all required approvals
4. Schedule dedicated migration window
5. Assign dedicated team member for monitoring
6. Run migration with full team availability
7. Extended post-migration monitoring (24-48 hours)
8. Comprehensive documentation of results

## Post-Migration Verification

### Immediate Verification (0-1 hours)

```bash
# 1. Health checks
curl https://staging-api.easyescrow.ai/health

# 2. Smoke tests
npm run test:staging:smoke

# 3. Application logs
docker compose logs -f backend | grep -i "error\|exception"

# 4. Database queries
psql $STAGING_DATABASE_URL -c "SELECT COUNT(*) FROM agreements;"
```

### Short-term Verification (1-24 hours)

- Monitor error rates in application logs
- Check for increased response times
- Verify no database errors
- Review user reports (if applicable)
- Monitor database CPU/memory usage

### Long-term Verification (24-72 hours)

- Compare before/after performance metrics
- Analyze query performance trends
- Review data consistency
- Verify backup/restore procedures work
- Document lessons learned

### Verification Checklist

- [ ] Health endpoint returns 200
- [ ] All smoke tests pass
- [ ] E2E tests pass
- [ ] No errors in application logs
- [ ] Database queries perform within benchmarks
- [ ] Manual feature testing completed
- [ ] Data integrity verified
- [ ] Rollback procedure validated
- [ ] Documentation updated
- [ ] Team notified of completion

## Troubleshooting

### Migration Fails to Apply

**Symptoms:**
- Prisma migrate deploy fails
- SQL errors in output

**Solution:**
```bash
# 1. Check migration SQL for syntax errors
cat prisma/migrations/*/migration.sql

# 2. Test SQL manually
psql $STAGING_DATABASE_URL -f prisma/migrations/*/migration.sql

# 3. Check for schema conflicts
npx prisma db pull
# Compare pulled schema with expected schema

# 4. If irreparable, rollback
# Restore from backup
```

### Migration Applies But Application Fails

**Symptoms:**
- Health check fails
- Application returns errors
- Database connection issues

**Solution:**
```bash
# 1. Check application logs
docker compose logs -f backend

# 2. Verify environment variables
docker compose exec backend env | grep DATABASE

# 3. Test database connection
npm run db:test-connection

# 4. Regenerate Prisma client
npx prisma generate

# 5. Rebuild and restart application
npm run build
docker compose restart backend
```

### Performance Degradation

**Symptoms:**
- Slow queries after migration
- Increased response times
- Database CPU spike

**Solution:**
```sql
-- 1. Check for missing indexes
SELECT * FROM pg_stat_user_tables WHERE seq_scan > 1000;

-- 2. Analyze query plans
EXPLAIN ANALYZE <your-slow-query>;

-- 3. Update table statistics
ANALYZE agreements;

-- 4. Consider adding indexes
CREATE INDEX CONCURRENTLY idx_name ON table(column);
```

### Data Inconsistency

**Symptoms:**
- Data doesn't match expectations
- NULL values where not expected
- Foreign key violations

**Solution:**
```sql
-- 1. Run data integrity checks
SELECT COUNT(*) FROM agreements WHERE column_name IS NULL;

-- 2. Check referential integrity
SELECT * FROM agreements a 
LEFT JOIN deposits d ON a.agreement_id = d.agreement_id
WHERE d.id IS NULL;

-- 3. If data issues found:
-- - Document the issue
-- - Restore from backup if critical
-- - Create fix-up migration if minor
```

## Related Documentation

- [Zero-Downtime Migrations](./ZERO_DOWNTIME_MIGRATIONS.md)
- [Migration Testing Framework](../../tests/migrations/README.md)
- [Database Setup Guide](../setup/DATABASE_SETUP.md)
- [Prisma Migration Guide](https://www.prisma.io/docs/concepts/components/prisma-migrate)

## Migration Log Template

Keep a log of all STAGING migrations in `migration-log.txt`:

```
[2025-10-24 12:00:00] Starting migration: add-user-preferences
[2025-10-24 12:00:05] SUCCESS: Backup created
[2025-10-24 12:00:15] SUCCESS: Migration completed in 8s
[2025-10-24 12:00:20] SUCCESS: Health check passed
[2025-10-24 12:00:30] SUCCESS: Smoke tests passed
[2025-10-24 12:00:30] Migration completed successfully: add-user-preferences (Duration: 30s)
```

## Contact and Support

For migration support:

1. **Before Migration**: Slack #engineering channel
2. **During Migration**: On-call engineer (see schedule)
3. **Issues/Rollback**: Escalate to Tech Lead immediately

---

**Remember**: When in doubt, don't proceed. Consult with the team before executing risky migrations.

