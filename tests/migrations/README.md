# Migration Testing Framework

Comprehensive testing framework for database migrations on STAGING environment with backup, rollback, and data integrity verification capabilities.

## Overview

This framework provides:
- **Pre-migration backups** - Automatic database backups before each migration
- **Migration execution** - Safe execution of up/down migrations with timing
- **Data integrity checks** - Automated verification of schema and data consistency
- **Rollback testing** - Validates that migrations can be safely rolled back
- **Comprehensive reporting** - JSON and Markdown reports with detailed results

## Quick Start

### Prerequisites

1. **PostgreSQL Tools**: `pg_dump` must be available in your PATH
2. **Environment Variables**: Set `STAGING_DATABASE_URL` or `DATABASE_URL`
3. **Database Access**: Connection string must include STAGING or TEST environment

### Running Tests

```bash
# Run all migration tests
npm run test:migrations

# Run only low-risk tests
npm run test:migrations:low

# Run only medium-risk tests
npm run test:migrations:medium

# Run without high-risk tests
npm run test:migrations:safe

# Stop on first failure
npm run test:migrations -- --stop-on-failure
```

## Architecture

### Core Components

#### 1. Migration Test Framework (`migration-test-framework.ts`)

The `MigrationTester` class provides the core testing functionality:

```typescript
import { MigrationTester } from './migration-test-framework';

const tester = new MigrationTester({
  databaseUrl: process.env.STAGING_DATABASE_URL,
  backupDirectory: './backups/migrations',
  enableBackups: true,
  enableRollbackTests: true,
  timeoutMs: 60000,
});

const result = await tester.testMigration(migrationTest);
```

**Key Features:**
- Automatic database backups using `pg_dump`
- SQL migration execution with error handling
- Configurable data integrity checks
- Rollback testing with state verification
- Detailed logging and timing

#### 2. Migration Test Scenarios (`migration-test-scenarios.ts`)

Pre-defined test scenarios for different types of migrations:

**Low Risk (Additive Changes):**
- Add new table
- Add nullable column
- Add index (using CONCURRENTLY)

**Medium Risk (Modificative Changes):**
- Rename column
- Change column type (compatible widening)
- Add non-nullable column with default value

**High Risk (Destructive Changes):**
- Drop column
- Drop table
- Data transformations

#### 3. Test Suite Runner (`run-migration-tests.ts`)

Orchestrates test execution with:
- Environment validation
- Risk-level filtering
- Report generation (JSON + Markdown)
- Exit code handling

## Test Structure

### MigrationTest Interface

```typescript
interface MigrationTest {
  name: string;                          // Unique test identifier
  riskLevel: 'low' | 'medium' | 'high'; // Risk classification
  upMigration: string;                   // SQL for forward migration
  downMigration: string;                 // SQL for rollback
  dataIntegrityChecks: DataIntegrityCheck[]; // Verification functions
  setupData?: () => Promise<void>;       // Optional pre-test setup
  teardownData?: () => Promise<void>;    // Optional post-test cleanup
}
```

### Data Integrity Checks

```typescript
interface DataIntegrityCheck {
  name: string;                           // Check description
  check: (prisma: PrismaClient) => Promise<boolean>; // Verification function
  errorMessage: string;                   // Failure message
}
```

Example:
```typescript
createIntegrityCheck(
  'Table exists',
  async (prisma) => {
    const result = await prisma.$queryRaw<any[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'my_table'
      );
    `;
    return result[0].exists;
  },
  'Table was not created'
)
```

## Risk Levels

### Low Risk - Additive Changes
Changes that add new structures without modifying existing data:
- ✅ Add new tables
- ✅ Add nullable columns
- ✅ Add indexes with CONCURRENTLY
- ✅ Add foreign keys (if properly validated)

**Recommended for:** All environments, including production

### Medium Risk - Modificative Changes
Changes that modify existing structures but preserve data:
- ⚠️  Rename columns
- ⚠️  Change column types (compatible)
- ⚠️  Add non-nullable columns with defaults
- ⚠️  Add constraints

**Recommended for:** Test on STAGING first, requires careful validation

### High Risk - Destructive Changes
Changes that can result in data loss:
- ❌ Drop columns
- ❌ Drop tables
- ❌ Data transformations
- ❌ Change column types (incompatible)

**Recommended for:** Extensive testing, requires backup, should be last resort

## Migration Lifecycle

Each test follows this lifecycle:

```
1. SETUP
   ├─ Connect to database
   ├─ Run setupData() (if provided)
   └─ Create backup

2. UP MIGRATION
   ├─ Execute upMigration SQL
   └─ Verify execution success

3. INTEGRITY CHECKS
   ├─ Run all data integrity checks
   └─ Log results for each check

4. ROLLBACK TEST
   ├─ Execute downMigration SQL
   ├─ Verify rollback success
   └─ Re-apply upMigration (for final state)

5. TEARDOWN
   ├─ Run teardownData() (if provided)
   └─ Disconnect from database

6. REPORTING
   ├─ Generate test result
   ├─ Save logs
   └─ Create reports
```

## Creating Custom Tests

### Basic Example

```typescript
import { MigrationTest, createIntegrityCheck } from './migration-test-framework';

export const myCustomTest: MigrationTest = {
  name: 'add-user-preferences',
  riskLevel: 'low',
  
  upMigration: `
    CREATE TABLE user_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      preferences JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    
    CREATE INDEX idx_user_preferences_user_id 
    ON user_preferences(user_id);
  `,
  
  downMigration: `
    DROP TABLE IF EXISTS user_preferences CASCADE;
  `,
  
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Table created',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'user_preferences'
          );
        `;
        return result[0].exists;
      },
      'User preferences table was not created'
    ),
  ],
};
```

### Advanced Example with Setup/Teardown

```typescript
export const complexMigrationTest: MigrationTest = {
  name: 'user-role-migration',
  riskLevel: 'high',
  
  setupData: async () => {
    const prisma = new PrismaClient();
    try {
      // Create test data
      await prisma.$executeRaw`
        INSERT INTO users (id, role) 
        VALUES ('test-1', 'admin'), ('test-2', 'user');
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
  
  upMigration: `
    -- Add new role column
    ALTER TABLE users ADD COLUMN new_role VARCHAR(50);
    
    -- Migrate data
    UPDATE users SET new_role = 
      CASE 
        WHEN role = 'admin' THEN 'administrator'
        WHEN role = 'user' THEN 'standard_user'
        ELSE 'guest'
      END;
    
    -- Drop old column
    ALTER TABLE users DROP COLUMN role;
    
    -- Rename new column
    ALTER TABLE users RENAME COLUMN new_role TO role;
  `,
  
  downMigration: `
    -- Reverse the migration
    ALTER TABLE users RENAME COLUMN role TO new_role;
    ALTER TABLE users ADD COLUMN role VARCHAR(50);
    
    UPDATE users SET role = 
      CASE 
        WHEN new_role = 'administrator' THEN 'admin'
        WHEN new_role = 'standard_user' THEN 'user'
        ELSE 'user'
      END;
    
    ALTER TABLE users DROP COLUMN new_role;
  `,
  
  dataIntegrityChecks: [
    createIntegrityCheck(
      'All users have roles',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count 
          FROM users 
          WHERE role IS NULL;
        `;
        return result[0].count === '0';
      },
      'Some users have NULL roles after migration'
    ),
  ],
  
  teardownData: async () => {
    const prisma = new PrismaClient();
    try {
      // Clean up test data
      await prisma.$executeRaw`
        DELETE FROM users WHERE id LIKE 'test-%';
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
};
```

## Reports

### JSON Report

Location: `reports/migration-tests/migration-test-report-{timestamp}.json`

```json
{
  "timestamp": "2025-10-24T12:00:00.000Z",
  "environment": {
    "databaseUrl": "postgresql://staging_user@cluster-host...",
    "nodeVersion": "v20.0.0"
  },
  "summary": {
    "total": 9,
    "passed": 8,
    "failed": 1,
    "totalDuration": 12500
  },
  "results": [...]
}
```

### Markdown Report

Location: `reports/migration-tests/migration-test-report-{timestamp}.md`

Human-readable format with:
- Test summary
- Individual test results
- Error details
- Backup locations

## Environment Configuration

### Required Variables

```bash
# Staging database URL (required)
STAGING_DATABASE_URL="postgresql://staging_user:password@cluster-host:25060/easyescrow_staging?sslmode=require"

# Alternative: Use DATABASE_URL
DATABASE_URL="postgresql://staging_user:password@cluster-host:25060/easyescrow_staging?sslmode=require"
```

### Safety Checks

The framework includes safety checks to prevent accidental production use:

1. **URL Validation**: Database URL must contain "staging" or "test"
2. **Environment Verification**: Warns if URL pattern is suspicious
3. **Backup Verification**: Confirms backup creation before migration
4. **User Confirmation**: Prompts for high-risk operations

## Best Practices

### Before Running Tests

1. **Verify Environment**: Ensure you're connected to STAGING database
2. **Check Backups**: Verify backup directory has write permissions
3. **Test Locally First**: Run on local development database before STAGING
4. **Review Tests**: Understand what each test does before running

### During Development

1. **Start with Low Risk**: Begin with additive changes
2. **Test Incrementally**: Test each migration individually
3. **Verify Rollbacks**: Ensure down migrations actually work
4. **Document Changes**: Add comments explaining migration logic

### In Production

1. **Test on STAGING First**: Always validate on STAGING before production
2. **Backup Before Migration**: Create manual backup before running
3. **Plan Downtime**: Schedule maintenance window for risky migrations
4. **Have Rollback Plan**: Know how to revert if something goes wrong
5. **Monitor Closely**: Watch application logs during migration

## Troubleshooting

### Common Issues

**pg_dump not found:**
```bash
# Install PostgreSQL client tools
# Windows: Install from postgresql.org
# macOS: brew install postgresql
# Linux: apt-get install postgresql-client
```

**Permission denied for backup directory:**
```bash
# Create backup directory with write permissions
mkdir -p backups/migrations
chmod 755 backups/migrations
```

**Migration timeout:**
```typescript
// Increase timeout in configuration
const tester = new MigrationTester({
  timeoutMs: 120000, // 2 minutes
});
```

**Rollback test fails:**
- Verify down migration SQL is correct
- Check for dependencies (foreign keys, views, etc.)
- Review migration logs for errors

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Migration Tests

on:
  pull_request:
    branches: [staging, main]

jobs:
  test-migrations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run migration tests
        env:
          STAGING_DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
        run: npm run test:migrations:safe
```

## Related Documentation

- [STAGING Migration Procedures](../../docs/database/STAGING_MIGRATION_PROCEDURES.md)
- [Database Setup Guide](../../docs/setup/DATABASE_SETUP.md)
- [Zero-Downtime Migration Strategy](../../docs/database/ZERO_DOWNTIME_MIGRATIONS.md)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review test logs in `reports/migration-tests/`
3. Check backup files in `backups/migrations/`
4. Contact the development team

