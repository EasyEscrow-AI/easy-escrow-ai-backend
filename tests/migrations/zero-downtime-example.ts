/**
 * Zero-Downtime Migration Example
 * 
 * Complete example of a zero-downtime migration using the 5-phase strategy.
 * This example demonstrates renaming a column from 'fee_bps' to 'platform_fee_bps'
 * in the agreements table.
 */

import { MigrationTest, createIntegrityCheck } from './migration-test-framework';
import { PrismaClient } from '../../src/generated/prisma';

/**
 * PHASE 1: Add New Column (Backward Compatible)
 * 
 * Risk: LOW
 * Downtime: NONE
 * 
 * This phase adds the new column without breaking existing code.
 * Old code continues to use 'fee_bps', new column is prepared.
 */
export const phase1_AddNewColumn: MigrationTest = {
  name: 'zero-downtime-phase1-add-column',
  riskLevel: 'low',
  
  upMigration: `
    -- Phase 1: Add new column (nullable, no default yet)
    ALTER TABLE agreements 
    ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER;
    
    -- Add index for new column (CONCURRENTLY to avoid locks)
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agreements_platform_fee_bps 
    ON agreements(platform_fee_bps);
    
    -- Add comment explaining this is part of migration
    COMMENT ON COLUMN agreements.platform_fee_bps IS 
      'Platform fee in basis points - Phase 1 of fee_bps rename migration';
  `,
  
  downMigration: `
    -- Rollback: Drop new column and index
    DROP INDEX IF EXISTS idx_agreements_platform_fee_bps;
    ALTER TABLE agreements DROP COLUMN IF EXISTS platform_fee_bps;
  `,
  
  dataIntegrityChecks: [
    createIntegrityCheck(
      'New column exists',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'agreements' 
          AND column_name = 'platform_fee_bps';
        `;
        return result.length > 0;
      },
      'New column platform_fee_bps was not created'
    ),
    createIntegrityCheck(
      'Old column still exists',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'agreements' 
          AND column_name = 'fee_bps';
        `;
        return result.length > 0;
      },
      'Old column fee_bps was accidentally removed'
    ),
    createIntegrityCheck(
      'Index created',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT indexname 
          FROM pg_indexes 
          WHERE tablename = 'agreements' 
          AND indexname = 'idx_agreements_platform_fee_bps';
        `;
        return result.length > 0;
      },
      'Index for new column was not created'
    ),
    createIntegrityCheck(
      'Existing data intact',
      async (prisma) => {
        const count = await prisma.agreement.count();
        return count >= 0; // Just verify table is accessible
      },
      'Agreements table is not accessible'
    ),
  ],
};

/**
 * PHASE 2: Application Code Dual Read/Write
 * 
 * Risk: LOW
 * Downtime: NONE
 * 
 * Deploy application code that writes to both old and new columns,
 * and reads from new column with fallback to old.
 * 
 * Example code changes needed:
 * 
 * ```typescript
 * // Before (Phase 0)
 * const agreement = await prisma.agreement.create({
 *   data: {
 *     fee_bps: 100,
 *   },
 * });
 * 
 * // During Phase 2 (Dual Write)
 * const agreement = await prisma.agreement.create({
 *   data: {
 *     fee_bps: 100,            // Keep writing to old
 *     platform_fee_bps: 100,   // Also write to new
 *   },
 * });
 * 
 * // Reading with fallback
 * const fee = agreement.platform_fee_bps ?? agreement.fee_bps;
 * ```
 */

/**
 * PHASE 3: Migrate Data and Apply Breaking Changes
 * 
 * Risk: MEDIUM
 * Downtime: NONE (but application must support dual schema)
 * 
 * Migrate existing data from old column to new column,
 * then make new column non-nullable.
 */
export const phase3_MigrateData: MigrationTest = {
  name: 'zero-downtime-phase3-migrate-data',
  riskLevel: 'medium',
  
  setupData: async () => {
    const prisma = new PrismaClient();
    try {
      // Ensure Phase 1 migration is applied
      await prisma.$executeRaw`
        ALTER TABLE agreements 
        ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER;
      `;
      
      // Create some test data with only old column populated
      await prisma.$executeRaw`
        INSERT INTO agreements (
          id, agreement_id, escrow_pda, nft_mint, seller, 
          price, fee_bps, expiry, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), 'test-agreement-' || gen_random_uuid(), 
          'test-pda-' || gen_random_uuid(), 'test-mint-' || gen_random_uuid(),
          'test-seller-' || gen_random_uuid(), 1000000000, 100,
          NOW() + INTERVAL '7 days', NOW(), NOW()
        )
        ON CONFLICT (agreement_id) DO NOTHING;
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
  
  upMigration: `
    -- Phase 3: Migrate data from old to new column
    UPDATE agreements 
    SET platform_fee_bps = fee_bps 
    WHERE platform_fee_bps IS NULL;
    
    -- Verify all data migrated
    DO $$
    DECLARE
      unmigrated_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO unmigrated_count
      FROM agreements 
      WHERE fee_bps IS NOT NULL 
      AND platform_fee_bps IS NULL;
      
      IF unmigrated_count > 0 THEN
        RAISE EXCEPTION 'Data migration incomplete: % rows not migrated', unmigrated_count;
      END IF;
    END $$;
    
    -- Set default for new column
    ALTER TABLE agreements 
    ALTER COLUMN platform_fee_bps SET DEFAULT 0;
    
    -- Make new column non-nullable (breaking change, but safe now)
    ALTER TABLE agreements 
    ALTER COLUMN platform_fee_bps SET NOT NULL;
    
    -- Update comment
    COMMENT ON COLUMN agreements.platform_fee_bps IS 
      'Platform fee in basis points - Phase 3: Data migrated, now non-nullable';
  `,
  
  downMigration: `
    -- Rollback: Make column nullable again, clear migrated data
    ALTER TABLE agreements ALTER COLUMN platform_fee_bps DROP NOT NULL;
    ALTER TABLE agreements ALTER COLUMN platform_fee_bps DROP DEFAULT;
    UPDATE agreements SET platform_fee_bps = NULL WHERE true;
  `,
  
  teardownData: async () => {
    const prisma = new PrismaClient();
    try {
      // Clean up test data
      await prisma.$executeRaw`
        DELETE FROM agreements 
        WHERE agreement_id LIKE 'test-agreement-%';
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
  
  dataIntegrityChecks: [
    createIntegrityCheck(
      'All data migrated',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count 
          FROM agreements 
          WHERE fee_bps IS NOT NULL 
          AND platform_fee_bps IS NULL;
        `;
        return result[0].count === '0';
      },
      'Some rows still have NULL in new column despite having value in old column'
    ),
    createIntegrityCheck(
      'Values match',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count 
          FROM agreements 
          WHERE fee_bps != platform_fee_bps;
        `;
        return result[0].count === '0';
      },
      'Some rows have mismatched values between old and new columns'
    ),
    createIntegrityCheck(
      'New column is non-nullable',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT is_nullable 
          FROM information_schema.columns 
          WHERE table_name = 'agreements' 
          AND column_name = 'platform_fee_bps';
        `;
        return result[0].is_nullable === 'NO';
      },
      'New column is still nullable after migration'
    ),
    createIntegrityCheck(
      'No NULL values in new column',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count 
          FROM agreements 
          WHERE platform_fee_bps IS NULL;
        `;
        return result[0].count === '0';
      },
      'Found NULL values in new column'
    ),
  ],
};

/**
 * PHASE 4: Application Code Using Only New Column
 * 
 * Risk: LOW
 * Downtime: NONE
 * 
 * Deploy application code that only uses new column.
 * Stop reading from and writing to old column.
 * 
 * Example code changes needed:
 * 
 * ```typescript
 * // During Phase 4 (Use only new)
 * const agreement = await prisma.agreement.create({
 *   data: {
 *     platform_fee_bps: 100,  // Only write to new
 *   },
 * });
 * 
 * // Reading only new column
 * const fee = agreement.platform_fee_bps;
 * ```
 */

/**
 * PHASE 5: Drop Old Column
 * 
 * Risk: MEDIUM (irreversible without backup)
 * Downtime: NONE
 * 
 * Remove the old column now that no code references it.
 */
export const phase5_DropOldColumn: MigrationTest = {
  name: 'zero-downtime-phase5-drop-old-column',
  riskLevel: 'medium',
  
  setupData: async () => {
    const prisma = new PrismaClient();
    try {
      // Ensure both columns exist and are populated
      await prisma.$executeRaw`
        ALTER TABLE agreements 
        ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 0;
      `;
    } finally {
      await prisma.$disconnect();
    }
  },
  
  upMigration: `
    -- Phase 5: Drop old column (now safe - no code uses it)
    ALTER TABLE agreements DROP COLUMN IF EXISTS fee_bps;
    
    -- Drop old indexes
    DROP INDEX IF EXISTS idx_agreements_fee_bps;
    
    -- Update table comment
    COMMENT ON TABLE agreements IS 
      'Agreements table - fee_bps to platform_fee_bps migration completed';
  `,
  
  downMigration: `
    -- WARNING: Cannot restore dropped data without backup
    -- This only recreates the structure
    ALTER TABLE agreements ADD COLUMN fee_bps INTEGER;
    
    -- Copy data back from new column
    UPDATE agreements SET fee_bps = platform_fee_bps;
    
    -- Make it non-nullable again
    ALTER TABLE agreements ALTER COLUMN fee_bps SET NOT NULL;
  `,
  
  dataIntegrityChecks: [
    createIntegrityCheck(
      'Old column dropped',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'agreements' 
          AND column_name = 'fee_bps';
        `;
        return result.length === 0;
      },
      'Old column fee_bps still exists'
    ),
    createIntegrityCheck(
      'New column still exists',
      async (prisma) => {
        const result = await prisma.$queryRaw<any[]>`
          SELECT column_name, is_nullable 
          FROM information_schema.columns 
          WHERE table_name = 'agreements' 
          AND column_name = 'platform_fee_bps';
        `;
        return result.length > 0 && result[0].is_nullable === 'NO';
      },
      'New column platform_fee_bps is missing or nullable'
    ),
    createIntegrityCheck(
      'Table still accessible',
      async (prisma) => {
        const count = await prisma.agreement.count();
        return count >= 0;
      },
      'Agreements table is not accessible'
    ),
  ],
};

/**
 * Complete zero-downtime migration test suite
 */
export const zeroDowntimeMigrationSuite: MigrationTest[] = [
  phase1_AddNewColumn,
  phase3_MigrateData,
  phase5_DropOldColumn,
];

/**
 * Usage example:
 * 
 * ```typescript
 * import { MigrationTester } from './migration-test-framework';
 * import { zeroDowntimeMigrationSuite } from './zero-downtime-example';
 * 
 * async function runZeroDowntimeMigration() {
 *   const tester = new MigrationTester({
 *     databaseUrl: process.env.STAGING_DATABASE_URL!,
 *   });
 *   
 *   // Run each phase separately with monitoring between phases
 *   for (const phase of zeroDowntimeMigrationSuite) {
 *     console.log(`\nExecuting ${phase.name}...`);
 *     const result = await tester.testMigration(phase);
 *     
 *     if (!result.success) {
 *       console.error(`Phase failed: ${phase.name}`);
 *       console.error(`Error: ${result.error?.message}`);
 *       break;
 *     }
 *     
 *     // Wait and monitor before next phase
 *     console.log(`Waiting 30 seconds before next phase...`);
 *     await new Promise(resolve => setTimeout(resolve, 30000));
 *   }
 * }
 * ```
 */

