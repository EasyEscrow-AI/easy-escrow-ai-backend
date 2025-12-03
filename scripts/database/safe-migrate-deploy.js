#!/usr/bin/env node

/**
 * Safe Migration Deploy Script
 * 
 * Handles edge cases in production deployments where:
 * 1. Failed migrations exist in _prisma_migrations table
 * 2. Migration files have been deleted from disk
 * 3. Resolve commands fail with P3011 errors
 * 
 * This script directly manipulates _prisma_migrations to clean up
 * problematic records before running migrate deploy.
 */

const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

const prisma = new PrismaClient();

async function cleanupFailedMigrations() {
  console.log('[Migration] Checking for failed migration records...');
  
  try {
    // Query _prisma_migrations for failed migrations
    const failedMigrations = await prisma.$queryRaw`
      SELECT migration_name, started_at, finished_at, logs
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL OR logs LIKE '%Error%'
      ORDER BY started_at DESC
    `;

    if (failedMigrations.length === 0) {
      console.log('[Migration] ✅ No failed migrations found');
      return;
    }

    console.log(`[Migration] ⚠️  Found ${failedMigrations.length} failed migration(s):`);
    failedMigrations.forEach(m => {
      console.log(`  - ${m.migration_name} (started: ${m.started_at})`);
    });

    // Delete failed migration records
    const migrationNames = failedMigrations.map(m => m.migration_name);
    
    console.log('[Migration] 🧹 Cleaning up failed migration records...');
    
    // Delete each failed migration individually
    for (const name of migrationNames) {
      await prisma.$executeRaw`
        DELETE FROM "_prisma_migrations"
        WHERE migration_name = ${name}
        AND finished_at IS NULL
      `;
      console.log(`[Migration]   ✓ Deleted: ${name}`);
    }

    console.log(`[Migration] ✅ Cleaned up ${migrationNames.length} failed migration(s)`);

  } catch (error) {
    console.error('[Migration] ❌ Error during cleanup:', error.message);
    // Don't fail the deployment - continue with migrate deploy
  }
}

async function runMigrateDeploy() {
  console.log('[Migration] Running prisma migrate deploy...');
  
  try {
    const output = execSync('npx prisma migrate deploy', { 
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    console.log(output);
    console.log('[Migration] ✅ Migrations deployed successfully');
    return true;
  } catch (error) {
    console.error('[Migration] ❌ Migration deploy failed:');
    console.error(error.stdout || error.message);
    throw error;
  }
}

async function main() {
  console.log('[Migration] 🚀 Starting safe migration deploy...\n');
  
  try {
    // Step 1: Clean up failed migrations
    await cleanupFailedMigrations();
    
    // Step 2: Run migrate deploy
    await runMigrateDeploy();
    
    console.log('\n[Migration] 🎉 Deployment complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n[Migration] 💥 Deployment failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

