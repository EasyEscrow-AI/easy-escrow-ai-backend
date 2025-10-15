# Database Migration Management Guide

This guide covers how to manage database migrations across different environments for the EasyEscrow.ai backend.

## Table of Contents

1. [Migration Overview](#migration-overview)
2. [Development Workflow](#development-workflow)
3. [Production Deployment](#production-deployment)
4. [Migration Best Practices](#migration-best-practices)
5. [Rollback Strategies](#rollback-strategies)
6. [Troubleshooting](#troubleshooting)

## Migration Overview

Prisma Migrate is used to manage database schema changes. All migrations are stored in the `prisma/migrations/` directory and tracked in the `_prisma_migrations` table.

### Migration States

- **Pending**: Migration exists but hasn't been applied
- **Applied**: Migration has been successfully executed
- **Failed**: Migration execution failed
- **Rolled Back**: Migration was applied then rolled back

## Development Workflow

### Creating a New Migration

1. **Modify the schema** in `prisma/schema.prisma`

2. **Create migration**:
   ```bash
   npm run db:migrate
   # or
   npx prisma migrate dev --name descriptive_migration_name
   ```

3. **Review the generated SQL** in `prisma/migrations/[timestamp]_[name]/migration.sql`

4. **Test the migration** locally before committing

### Example: Adding a New Field

```prisma
// In prisma/schema.prisma
model Agreement {
  // ... existing fields
  metadata  Json?  // New field
}
```

Then run:
```bash
npx prisma migrate dev --name add_agreement_metadata
```

### Updating the Prisma Client

After any schema changes, regenerate the Prisma Client:
```bash
npm run db:generate
```

## Production Deployment

### Pre-Deployment Checklist

- [ ] All migrations tested in development
- [ ] Database backup created
- [ ] Migrations reviewed by team
- [ ] Downtime window scheduled (if required)
- [ ] Rollback plan prepared

### Deployment Process

1. **Backup the production database**:
   ```bash
   # For DigitalOcean Managed Database
   # Use the web console or API to create a backup
   ```

2. **Deploy migrations**:
   ```bash
   npm run db:migrate:deploy
   # or
   npx prisma migrate deploy
   ```

3. **Verify migration status**:
   ```bash
   npx prisma migrate status
   ```

4. **Test the application** to ensure everything works correctly

### Automated Deployment (CI/CD)

In your deployment pipeline (e.g., GitHub Actions, DigitalOcean App Platform):

```yaml
# Example: In .github/workflows/deploy.yml
- name: Run Database Migrations
  run: npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Migration Best Practices

### DO:

✅ **Write descriptive migration names**
```bash
npx prisma migrate dev --name add_webhook_retry_count
```

✅ **Test migrations in development first**
```bash
npm run db:migrate
npm run db:reset  # If needed to test fresh state
```

✅ **Keep migrations small and focused**
- One logical change per migration
- Easier to review and rollback if needed

✅ **Review generated SQL before committing**
- Check for unintended changes
- Verify indexes are created correctly

✅ **Document complex migrations**
- Add comments in migration SQL
- Update this guide for special procedures

✅ **Use transactions when possible**
- Prisma Migrate wraps migrations in transactions by default
- Ensures atomic application

### DON'T:

❌ **Don't modify existing migration files**
- Once applied, migrations are immutable
- Create a new migration instead

❌ **Don't delete migration files**
- Breaks migration history
- Can cause issues in other environments

❌ **Don't bypass migrations**
- Always use `prisma migrate` commands
- Manual schema changes will cause drift

❌ **Don't run migrations without backups**
- Always backup production before migrating
- Be prepared to restore if needed

## Rollback Strategies

### Development Rollback

To undo a migration in development:

```bash
# Reset database to previous state
npm run db:reset

# Or manually rollback
npx prisma migrate resolve --rolled-back [migration_name]
```

### Production Rollback

Production rollbacks are more complex. Options:

#### Option 1: Restore from Backup (Recommended)
```bash
# 1. Stop application
# 2. Restore database from backup
# 3. Deploy previous application version
# 4. Restart application
```

#### Option 2: Manual Rollback Migration
```bash
# 1. Create a new migration that reverses changes
npx prisma migrate dev --name rollback_[original_migration]

# 2. Test thoroughly in staging
# 3. Deploy to production
npm run db:migrate:deploy
```

### Creating Rollback Migrations

Example: Rolling back an added column

```sql
-- Original migration: add_user_status.sql
ALTER TABLE "users" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- Rollback migration: rollback_add_user_status.sql
ALTER TABLE "users" DROP COLUMN "status";
```

## Migration Commands Reference

### Development

```bash
# Create and apply migration
npm run db:migrate
npx prisma migrate dev --name [name]

# Apply migrations without creating new ones
npx prisma db push

# Reset database (deletes all data)
npm run db:reset
npx prisma migrate reset

# Generate Prisma Client
npm run db:generate

# Open Prisma Studio
npm run db:studio
```

### Production

```bash
# Deploy pending migrations
npm run db:migrate:deploy
npx prisma migrate deploy

# Check migration status
npx prisma migrate status

# Mark migration as applied (use with caution)
npx prisma migrate resolve --applied [migration_name]

# Mark migration as rolled back
npx prisma migrate resolve --rolled-back [migration_name]
```

## Environment-Specific Considerations

### Local Development

- Use `migrate dev` for interactive development
- Safe to reset database frequently
- Test all migrations before pushing

### Staging

- Mirror production environment
- Deploy with `migrate deploy`
- Test migrations before production deployment

### Production

- **Always backup first**
- Use `migrate deploy` only
- Schedule migrations during low-traffic periods
- Monitor application after deployment

## Troubleshooting

### Migration Failed

**Problem**: Migration fails partway through

**Solution**:
```bash
# 1. Check migration status
npx prisma migrate status

# 2. If failed, mark as rolled back
npx prisma migrate resolve --rolled-back [migration_name]

# 3. Fix the issue in schema
# 4. Create new migration
npx prisma migrate dev --name fix_[issue]
```

### Schema Drift

**Problem**: Database schema doesn't match Prisma schema

**Solution**:
```bash
# Check for drift
npx prisma migrate status

# Option 1: Pull current database schema
npx prisma db pull

# Option 2: Push Prisma schema to database (development only)
npx prisma db push --accept-data-loss
```

### Prisma Client Out of Sync

**Problem**: Types don't match database

**Solution**:
```bash
# Regenerate Prisma Client
npm run db:generate
npx prisma generate
```

### Migration Conflicts

**Problem**: Multiple developers created migrations

**Solution**:
1. Coordinate with team
2. One person applies their migration first
3. Others rebase and create new migrations
4. Never modify existing migration files

## Advanced Topics

### Custom Migration SQL

Sometimes you need custom SQL not generated by Prisma:

```bash
# 1. Create empty migration
npx prisma migrate dev --create-only --name custom_indexes

# 2. Edit the migration.sql file
# Add your custom SQL

# 3. Apply the migration
npx prisma migrate dev
```

### Data Migrations

For migrations that transform data:

```sql
-- In migration.sql
-- 1. Add new column
ALTER TABLE "agreements" ADD COLUMN "new_field" TEXT;

-- 2. Populate from existing data
UPDATE "agreements" SET "new_field" = CONCAT('prefix_', "old_field");

-- 3. Make not nullable if needed
ALTER TABLE "agreements" ALTER COLUMN "new_field" SET NOT NULL;

-- 4. Optionally drop old column
ALTER TABLE "agreements" DROP COLUMN "old_field";
```

### Zero-Downtime Migrations

For changes requiring zero downtime:

1. **Phase 1**: Add new column (nullable)
   ```sql
   ALTER TABLE "users" ADD COLUMN "email_verified" BOOLEAN;
   ```

2. **Phase 2**: Deploy code that writes to both old and new
   
3. **Phase 3**: Backfill data
   ```sql
   UPDATE "users" SET "email_verified" = true WHERE "verified_at" IS NOT NULL;
   ```

4. **Phase 4**: Make column NOT NULL
   ```sql
   ALTER TABLE "users" ALTER COLUMN "email_verified" SET NOT NULL;
   ```

5. **Phase 5**: Remove old column
   ```sql
   ALTER TABLE "users" DROP COLUMN "verified_at";
   ```

## Useful Resources

- [Prisma Migrate Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [PostgreSQL Migration Best Practices](https://www.postgresql.org/docs/current/ddl-alter.html)
- [Database Migration Patterns](https://martinfowler.com/articles/evodb.html)

## Support

For issues or questions:
- Check Prisma documentation
- Review migration logs
- Contact development team
- Create an issue in the repository

