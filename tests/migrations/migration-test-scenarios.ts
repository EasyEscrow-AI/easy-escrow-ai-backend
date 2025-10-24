/**
 * Migration Test Scenarios
 * 
 * Comprehensive set of migration test scenarios covering:
 * - Additive changes (low risk)
 * - Modificative changes (medium risk)
 * - Destructive changes (high risk)
 */

import { PrismaClient } from '../../src/generated/prisma';
import { MigrationTest, createIntegrityCheck } from './migration-test-framework';

/**
 * LOW RISK: Additive Changes
 * These migrations add new structures without modifying existing data
 */

/**
 * Test 1: Add a new table
 */
export const addNewTableTest: MigrationTest = {
  name: 'add-test-table',
  riskLevel: 'low',
  upMigration: `
    CREATE TABLE IF NOT EXISTS test_table (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    
    CREATE INDEX idx_test_table_name ON test_table(name);
    CREATE INDEX idx_test_table_created_at ON test_table(created_at);
  `,
  downMigration: `
    DROP TABLE IF EXISTS test_table CASCADE;
  `,
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Test table exists',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'test_table'
          );
        `;
        return result[0].exists;
      },
      'Test table was not created'
    ),
    createIntegrityCheck(
      'Test table has correct columns',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'test_table'
          ORDER BY ordinal_position;
        `;
        const columnNames = result.map(r => r.column_name);
        return columnNames.includes('id') && 
               columnNames.includes('name') && 
               columnNames.includes('description') &&
               columnNames.includes('created_at') &&
               columnNames.includes('updated_at');
      },
      'Test table does not have expected columns'
    ),
    createIntegrityCheck(
      'Test table indexes exist',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT indexname 
          FROM pg_indexes 
          WHERE schemaname = 'public' 
          AND tablename = 'test_table';
        `;
        const indexNames = result.map(r => r.indexname);
        return indexNames.includes('idx_test_table_name') && 
               indexNames.includes('idx_test_table_created_at');
      },
      'Test table indexes were not created'
    ),
  ],
};

/**
 * Test 2: Add a nullable column to existing table
 */
export const addNullableColumnTest: MigrationTest = {
  name: 'add-nullable-column',
  riskLevel: 'low',
  upMigration: `
    ALTER TABLE agreements 
    ADD COLUMN IF NOT EXISTS test_notes TEXT;
    
    COMMENT ON COLUMN agreements.test_notes IS 'Test column for migration testing';
  `,
  downMigration: `
    ALTER TABLE agreements 
    DROP COLUMN IF EXISTS test_notes;
  `,
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Nullable column added',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT column_name, is_nullable 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'agreements'
          AND column_name = 'test_notes';
        `;
        return result.length > 0 && result[0].is_nullable === 'YES';
      },
      'Nullable column was not added or is not nullable'
    ),
    createIntegrityCheck(
      'Existing agreements data intact',
      async (prisma) => {
        const count = await prisma.agreement.count();
        return count >= 0; // Should not fail, just verifying table is accessible
      },
      'Agreements table is not accessible after migration'
    ),
  ],
};

/**
 * Test 3: Add an index to existing table
 */
export const addIndexTest: MigrationTest = {
  name: 'add-performance-index',
  riskLevel: 'low',
  upMigration: `
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agreements_test_composite 
    ON agreements(status, expiry);
  `,
  downMigration: `
    DROP INDEX IF EXISTS idx_agreements_test_composite;
  `,
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Composite index created',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT indexname 
          FROM pg_indexes 
          WHERE schemaname = 'public' 
          AND tablename = 'agreements'
          AND indexname = 'idx_agreements_test_composite';
        `;
        return result.length > 0;
      },
      'Composite index was not created'
    ),
  ],
};

/**
 * MEDIUM RISK: Modificative Changes
 * These migrations modify existing structures
 */

/**
 * Test 4: Rename a column
 */
export const renameColumnTest: MigrationTest = {
  name: 'rename-column',
  riskLevel: 'medium',
  upMigration: `
    -- First add the new column
    ALTER TABLE agreements 
    ADD COLUMN IF NOT EXISTS test_notes TEXT;
    
    -- Rename test column
    ALTER TABLE agreements 
    RENAME COLUMN test_notes TO test_remarks;
  `,
  downMigration: `
    -- Rename back
    ALTER TABLE agreements 
    RENAME COLUMN test_remarks TO test_notes;
    
    -- Drop the column
    ALTER TABLE agreements 
    DROP COLUMN IF EXISTS test_notes;
  `,
  setupData: async (databaseUrl: string) => {
    // Ensure test column exists before renaming
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    try {
      await prisma.$executeRaw`
        ALTER TABLE agreements 
        ADD COLUMN IF NOT EXISTS test_notes TEXT;
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Column renamed successfully',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'agreements'
          AND column_name = 'test_remarks';
        `;
        return result.length > 0;
      },
      'Column was not renamed'
    ),
    createIntegrityCheck(
      'Old column name no longer exists',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'agreements'
          AND column_name = 'test_notes';
        `;
        return result.length === 0;
      },
      'Old column name still exists after rename'
    ),
  ],
};

/**
 * Test 5: Change column type (compatible)
 */
export const changeColumnTypeTest: MigrationTest = {
  name: 'change-column-type',
  riskLevel: 'medium',
  upMigration: `
    -- Add a test column
    ALTER TABLE agreements 
    ADD COLUMN IF NOT EXISTS test_code VARCHAR(50);
    
    -- Change type from VARCHAR(50) to TEXT (compatible widening)
    ALTER TABLE agreements 
    ALTER COLUMN test_code TYPE TEXT;
  `,
  downMigration: `
    -- Change back to VARCHAR
    ALTER TABLE agreements 
    ALTER COLUMN test_code TYPE VARCHAR(50);
    
    -- Drop the column
    ALTER TABLE agreements 
    DROP COLUMN IF EXISTS test_code;
  `,
  setupData: async (databaseUrl: string) => {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    try {
      await prisma.$executeRaw`
        ALTER TABLE agreements 
        ADD COLUMN IF NOT EXISTS test_code VARCHAR(50);
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Column type changed',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT data_type, character_maximum_length 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'agreements'
          AND column_name = 'test_code';
        `;
        return result.length > 0 && result[0].data_type === 'text';
      },
      'Column type was not changed to TEXT'
    ),
  ],
};

/**
 * Test 6: Add non-nullable column with default value
 */
export const addNonNullableColumnTest: MigrationTest = {
  name: 'add-non-nullable-with-default',
  riskLevel: 'medium',
  upMigration: `
    ALTER TABLE agreements 
    ADD COLUMN IF NOT EXISTS test_priority INTEGER NOT NULL DEFAULT 0;
    
    CREATE INDEX IF NOT EXISTS idx_agreements_test_priority 
    ON agreements(test_priority);
  `,
  downMigration: `
    DROP INDEX IF EXISTS idx_agreements_test_priority;
    
    ALTER TABLE agreements 
    DROP COLUMN IF EXISTS test_priority;
  `,
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Non-nullable column added with default',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT column_name, is_nullable, column_default 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'agreements'
          AND column_name = 'test_priority';
        `;
        return result.length > 0 && 
               result[0].is_nullable === 'NO' && 
               result[0].column_default !== null;
      },
      'Non-nullable column not added correctly'
    ),
    createIntegrityCheck(
      'Existing rows have default value',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count 
          FROM agreements 
          WHERE test_priority IS NULL;
        `;
        return result[0].count === '0';
      },
      'Some existing rows have NULL values in non-nullable column'
    ),
  ],
};

/**
 * HIGH RISK: Destructive Changes
 * These migrations can result in data loss
 */

/**
 * Test 7: Drop a column
 */
export const dropColumnTest: MigrationTest = {
  name: 'drop-column',
  riskLevel: 'high',
  setupData: async (databaseUrl: string) => {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    try {
      // Add a test column first
      await prisma.$executeRaw`
        ALTER TABLE agreements 
        ADD COLUMN IF NOT EXISTS test_temp_data TEXT;
      `;
      
      // Add some test data
      await prisma.$executeRaw`
        UPDATE agreements 
        SET test_temp_data = 'test-value' 
        WHERE test_temp_data IS NULL;
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
  upMigration: `
    ALTER TABLE agreements 
    DROP COLUMN IF EXISTS test_temp_data;
  `,
  downMigration: `
    -- NOTE: Cannot restore dropped data, only recreate column structure
    ALTER TABLE agreements 
    ADD COLUMN IF NOT EXISTS test_temp_data TEXT;
  `,
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Column dropped successfully',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'agreements'
          AND column_name = 'test_temp_data';
        `;
        return result.length === 0;
      },
      'Column was not dropped'
    ),
    createIntegrityCheck(
      'Table still accessible',
      async (prisma) => {
        const count = await prisma.agreement.count();
        return count >= 0;
      },
      'Agreements table is not accessible after column drop'
    ),
  ],
};

/**
 * Test 8: Drop a table
 */
export const dropTableTest: MigrationTest = {
  name: 'drop-table',
  riskLevel: 'high',
  setupData: async (databaseUrl: string) => {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    try {
      // Create a temporary test table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS temp_test_table (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          data TEXT
        );
      `;
      
      // Insert some test data
      await prisma.$executeRaw`
        INSERT INTO temp_test_table (data) 
        VALUES ('test1'), ('test2'), ('test3');
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
  upMigration: `
    DROP TABLE IF EXISTS temp_test_table CASCADE;
  `,
  downMigration: `
    -- NOTE: Cannot restore dropped table data
    CREATE TABLE IF NOT EXISTS temp_test_table (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      data TEXT
    );
  `,
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Table dropped successfully',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'temp_test_table'
          );
        `;
        return !result[0].exists;
      },
      'Table was not dropped'
    ),
  ],
};

/**
 * Test 9: Data transformation
 */
export const dataTransformationTest: MigrationTest = {
  name: 'data-transformation',
  riskLevel: 'high',
  setupData: async (databaseUrl: string) => {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    try {
      // Add test columns
      await prisma.$executeRaw`
        ALTER TABLE agreements 
        ADD COLUMN IF NOT EXISTS test_old_format TEXT,
        ADD COLUMN IF NOT EXISTS test_new_format JSONB;
      `;
      
      // Insert test data in old format
      await prisma.$executeRaw`
        UPDATE agreements 
        SET test_old_format = 'key1:value1,key2:value2' 
        WHERE test_old_format IS NULL 
        LIMIT 5;
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
  upMigration: `
    -- Transform data from old format to new format
    UPDATE agreements 
    SET test_new_format = jsonb_build_object(
      'data', test_old_format,
      'migrated_at', NOW()::text
    )
    WHERE test_old_format IS NOT NULL;
    
    -- Add constraint to ensure data consistency
    ALTER TABLE agreements 
    ADD CONSTRAINT check_test_data_format 
    CHECK (test_new_format IS NULL OR jsonb_typeof(test_new_format) = 'object');
  `,
  downMigration: `
    -- Remove constraint
    ALTER TABLE agreements 
    DROP CONSTRAINT IF EXISTS check_test_data_format;
    
    -- Reverse transformation (simplified)
    UPDATE agreements 
    SET test_old_format = test_new_format->>'data'
    WHERE test_new_format IS NOT NULL;
    
    -- Clear new format
    UPDATE agreements 
    SET test_new_format = NULL;
  `,
  teardownData: async (databaseUrl: string) => {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    try {
      await prisma.$executeRaw`
        ALTER TABLE agreements 
        DROP CONSTRAINT IF EXISTS check_test_data_format;
      `;
      await prisma.$executeRaw`
        ALTER TABLE agreements 
        DROP COLUMN IF EXISTS test_old_format,
        DROP COLUMN IF EXISTS test_new_format;
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Data transformed to new format',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count 
          FROM agreements 
          WHERE test_old_format IS NOT NULL 
          AND test_new_format IS NOT NULL;
        `;
        return parseInt(result[0].count) > 0;
      },
      'Data was not transformed to new format'
    ),
    createIntegrityCheck(
      'New format is valid JSON',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count 
          FROM agreements 
          WHERE test_new_format IS NOT NULL 
          AND jsonb_typeof(test_new_format) = 'object';
        `;
        const totalWithNewFormat = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count 
          FROM agreements 
          WHERE test_new_format IS NOT NULL;
        `;
        return result[0].count === totalWithNewFormat[0].count;
      },
      'Some transformed data is not valid JSON'
    ),
  ],
};

/**
 * Export all test scenarios grouped by risk level
 */
export const lowRiskTests: MigrationTest[] = [
  addNewTableTest,
  addNullableColumnTest,
  addIndexTest,
];

export const mediumRiskTests: MigrationTest[] = [
  renameColumnTest,
  changeColumnTypeTest,
  addNonNullableColumnTest,
];

export const highRiskTests: MigrationTest[] = [
  dropColumnTest,
  dropTableTest,
  dataTransformationTest,
];

export const allTests: MigrationTest[] = [
  ...lowRiskTests,
  ...mediumRiskTests,
  ...highRiskTests,
];

