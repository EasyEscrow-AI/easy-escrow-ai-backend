/**
 * Cleanup Failed Migration Script
 * 
 * Removes the problematic migration record from _prisma_migrations table
 * to fix P3011 errors.
 * 
 * Usage:
 *   DATABASE_ADMIN_URL="postgresql://..." npx ts-node scripts/database/cleanup-failed-migration.ts
 */

import { PrismaClient } from '../../src/generated/prisma';

const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
  datasources: {
    db: {
      url: process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL,
    },
  },
});

const MIGRATION_TO_DELETE = '20251117192727_add_atomic_swap_models';

async function cleanupFailedMigration() {
  console.log('🔧 Cleaning up failed migration record...\n');

  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    // Step 1: Check if migration exists
    console.log(`1️⃣  Checking for migration: ${MIGRATION_TO_DELETE}`);
    
    const existingMigration = await prisma.$queryRaw<Array<{
      migration_name: string;
      finished_at: Date | null;
      started_at: Date;
      applied_steps_count: number;
    }>>`
      SELECT migration_name, finished_at, started_at, applied_steps_count 
      FROM "_prisma_migrations" 
      WHERE migration_name = ${MIGRATION_TO_DELETE}
    `;

    if (existingMigration.length === 0) {
      console.log('   ℹ️  Migration record not found in database');
      console.log('   ✅ Database is already clean!\n');
      process.exit(0);
    }

    console.log('   ⚠️  Found migration record:');
    console.log(`      - Started: ${existingMigration[0].started_at}`);
    console.log(`      - Finished: ${existingMigration[0].finished_at || 'NULL (failed)'}`);
    console.log(`      - Steps: ${existingMigration[0].applied_steps_count}\n`);

    // Step 2: Delete the migration record
    console.log('2️⃣  Deleting migration record...');
    
    await prisma.$executeRaw`
      DELETE FROM "_prisma_migrations" 
      WHERE migration_name = ${MIGRATION_TO_DELETE}
    `;

    console.log('   ✅ Migration record deleted\n');

    // Step 3: Verify it's gone
    console.log('3️⃣  Verifying deletion...');
    
    const checkAgain = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name 
      FROM "_prisma_migrations" 
      WHERE migration_name = ${MIGRATION_TO_DELETE}
    `;

    if (checkAgain.length === 0) {
      console.log('   ✅ Migration record successfully removed\n');
    } else {
      console.log('   ❌ Migration record still exists!\n');
      process.exit(1);
    }

    // Step 4: Show current migrations
    console.log('4️⃣  Current migration status:');
    
    const allMigrations = await prisma.$queryRaw<Array<{
      migration_name: string;
      finished_at: Date | null;
      started_at: Date;
    }>>`
      SELECT migration_name, finished_at, started_at
      FROM "_prisma_migrations" 
      ORDER BY started_at DESC 
      LIMIT 10
    `;

    console.log('\n   Recent migrations:');
    allMigrations.forEach((m, i) => {
      const status = m.finished_at ? '✅' : '⏱️';
      console.log(`   ${status} ${m.migration_name}`);
    });
    console.log('');

    // Summary
    console.log('============================================================================');
    console.log('✅ CLEANUP COMPLETE');
    console.log('============================================================================\n');
    console.log('Next steps:');
    console.log('  1. Push an empty commit to staging to trigger fresh deploy:');
    console.log('     git commit --allow-empty -m "chore: trigger deploy after migration cleanup"');
    console.log('     git push origin staging');
    console.log('');
    console.log('  2. Monitor DigitalOcean logs for successful migration');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Cleanup failed:\n');
    console.error(error);
    console.log('\n');
    console.log('Troubleshooting:');
    console.log('  1. Verify DATABASE_ADMIN_URL is set correctly');
    console.log('  2. Check you have admin permissions');
    console.log('  3. Try connecting manually with psql to verify credentials');
    console.log('');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupFailedMigration();


