/**
 * Check Migration Status Script
 * 
 * Checks what migrations are in the database vs. what Prisma expects
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

async function checkMigrationStatus() {
  console.log('🔍 Checking migration status...\n');

  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    // Get all migrations from database
    const dbMigrations = await prisma.$queryRaw<Array<{
      migration_name: string;
      finished_at: Date | null;
      started_at: Date;
      applied_steps_count: number;
    }>>`
      SELECT migration_name, finished_at, started_at, applied_steps_count 
      FROM "_prisma_migrations" 
      ORDER BY started_at ASC
    `;

    console.log(`📊 Found ${dbMigrations.length} migrations in database:\n`);

    dbMigrations.forEach((m, i) => {
      const status = m.finished_at ? '✅' : '⏱️';
      const date = m.started_at.toISOString().split('T')[0];
      console.log(`${i + 1}. ${status} ${m.migration_name}`);
      console.log(`   Started: ${date}, Steps: ${m.applied_steps_count}, Finished: ${m.finished_at ? 'Yes' : 'NO (FAILED)'}`);
    });

    // Check for failed migrations
    const failedMigrations = dbMigrations.filter(m => m.finished_at === null);
    if (failedMigrations.length > 0) {
      console.log(`\n⚠️  Found ${failedMigrations.length} FAILED migration(s):`);
      failedMigrations.forEach(m => {
        console.log(`   - ${m.migration_name}`);
      });
      console.log('\n💡 Run this SQL to fix:');
      failedMigrations.forEach(m => {
        console.log(`   DELETE FROM "_prisma_migrations" WHERE migration_name = '${m.migration_name}';`);
      });
    } else {
      console.log('\n✅ All migrations completed successfully!');
    }

    // Check if the problematic migration exists
    const problematicMigration = dbMigrations.find(
      m => m.migration_name === '20251117192727_add_atomic_swap_models'
    );

    if (problematicMigration) {
      console.log('\n🚨 Found the problematic migration in database!');
      console.log(`   Status: ${problematicMigration.finished_at ? 'Completed' : 'FAILED'}`);
    } else {
      console.log('\n✅ The problematic migration (20251117192727_add_atomic_swap_models) is NOT in the database');
      console.log('   This is correct - the migration file was deleted from codebase');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to check migration status:\n');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkMigrationStatus();


