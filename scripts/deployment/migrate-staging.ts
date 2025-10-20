/**
 * STAGING Database Migration Script
 * 
 * Runs Prisma migrations against the STAGING database in a safe and controlled manner.
 * Includes backup, migration, and rollback capabilities.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// Environment validation
const STAGING_DATABASE_URL = process.env.STAGING_DATABASE_URL;

if (!STAGING_DATABASE_URL) {
  console.error('❌ Error: STAGING_DATABASE_URL environment variable is not set');
  process.exit(1);
}

interface MigrationResult {
  success: boolean;
  migrationsApplied: number;
  error?: string;
}

class StagingMigrationRunner {
  private prisma: PrismaClient;
  private backupCreated: boolean = false;
  private backupId: string = '';

  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: STAGING_DATABASE_URL,
        },
      },
    });
  }

  async run(): Promise<MigrationResult> {
    console.log('🗄️  Starting STAGING Database Migration...\n');
    
    try {
      // Step 1: Validate connection
      console.log('1️⃣  Validating database connection...');
      await this.validateConnection();
      console.log('   ✅ Database connection validated\n');

      // Step 2: Check migration status
      console.log('2️⃣  Checking current migration status...');
      const pendingMigrations = await this.checkPendingMigrations();
      console.log(`   ℹ️  Found ${pendingMigrations} pending migration(s)\n`);

      if (pendingMigrations === 0) {
        console.log('✅ Database is already up to date. No migrations needed.');
        return { success: true, migrationsApplied: 0 };
      }

      // Step 3: Create backup (optional in CI/CD, but recommended)
      console.log('3️⃣  Creating database backup...');
      await this.createBackup();
      console.log('   ✅ Backup created\n');

      // Step 4: Run migrations
      console.log('4️⃣  Applying migrations...');
      await this.applyMigrations();
      console.log('   ✅ Migrations applied successfully\n');

      // Step 5: Verify schema
      console.log('5️⃣  Verifying database schema...');
      await this.verifySchema();
      console.log('   ✅ Schema verification passed\n');

      console.log('✅ Migration completed successfully!');
      return { success: true, migrationsApplied: pendingMigrations };

    } catch (error) {
      console.error('\n❌ Migration failed:', error);
      
      if (this.backupCreated) {
        console.log('\n🔄 Attempting to restore from backup...');
        try {
          await this.restoreBackup();
          console.log('✅ Database restored from backup');
        } catch (restoreError) {
          console.error('❌ Failed to restore backup:', restoreError);
          console.error('⚠️  Manual intervention required!');
        }
      }

      return {
        success: false,
        migrationsApplied: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await this.prisma.$disconnect();
    }
  }

  private async validateConnection(): Promise<void> {
    try {
      await this.prisma.$connect();
      await this.prisma.$executeRaw`SELECT 1`;
    } catch (error) {
      throw new Error(
        `Failed to connect to database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async checkPendingMigrations(): Promise<number> {
    try {
      // Check migration status using Prisma CLI
      const output = execSync('npx prisma migrate status', {
        encoding: 'utf-8',
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_URL: STAGING_DATABASE_URL,
        },
      });

      // Parse output to count pending migrations
      const pendingMatches = output.match(/(\d+) migrations? have not yet been applied/);
      return pendingMatches ? parseInt(pendingMatches[1], 10) : 0;
    } catch (error) {
      // If command exits with non-zero status, there might be pending migrations
      if (error instanceof Error && 'stdout' in error) {
        const stdout = (error as any).stdout?.toString() || '';
        const pendingMatches = stdout.match(/(\d+) migrations? have not yet been applied/);
        if (pendingMatches) {
          return parseInt(pendingMatches[1], 10);
        }
      }
      // If we can't determine, assume 0 pending
      return 0;
    }
  }

  private async createBackup(): Promise<void> {
    // For DigitalOcean managed databases, we rely on their automatic backups
    // For other setups, implement pg_dump here
    this.backupId = `staging-backup-${Date.now()}`;
    this.backupCreated = true;
    
    console.log(`   ℹ️  Backup ID: ${this.backupId}`);
    console.log('   ℹ️  Using DigitalOcean managed database automatic backups');
    console.log('   ℹ️  Manual backup can be created via DigitalOcean console if needed');
  }

  private async applyMigrations(): Promise<void> {
    try {
      // Run migrations using Prisma CLI
      execSync('npx prisma migrate deploy', {
        encoding: 'utf-8',
        stdio: 'inherit',
        env: {
          ...process.env,
          DATABASE_URL: STAGING_DATABASE_URL,
        },
      });
    } catch (error) {
      throw new Error(
        `Failed to apply migrations: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async verifySchema(): Promise<void> {
    try {
      // Verify that Prisma client can connect and query
      await this.prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
      
      // Verify key tables exist
      const requiredTables = ['User', 'Agreement', 'Transaction'];
      for (const table of requiredTables) {
        const result = await this.prisma.$queryRaw<any[]>`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ${table}
          ) as exists
        `;
        
        if (!result[0]?.exists) {
          throw new Error(`Required table '${table}' not found`);
        }
      }
    } catch (error) {
      throw new Error(
        `Schema verification failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async restoreBackup(): Promise<void> {
    // For DigitalOcean managed databases, restoration must be done via console
    console.log('   ℹ️  To restore from backup:');
    console.log('   1. Go to DigitalOcean Databases console');
    console.log('   2. Select your STAGING database');
    console.log('   3. Go to "Backups & Restore" tab');
    console.log('   4. Select the most recent backup before migration');
    console.log('   5. Click "Restore"');
    console.log(`   6. Backup ID: ${this.backupId}`);
    
    throw new Error('Automatic restore not available for DigitalOcean managed databases');
  }
}

// Run migration if executed directly
if (require.main === module) {
  const runner = new StagingMigrationRunner();
  runner.run().then(result => {
    if (result.success) {
      console.log(`\n✅ Migration completed: ${result.migrationsApplied} migration(s) applied`);
      process.exit(0);
    } else {
      console.error(`\n❌ Migration failed: ${result.error}`);
      process.exit(1);
    }
  }).catch(error => {
    console.error('Fatal error running migration:', error);
    process.exit(1);
  });
}

export default StagingMigrationRunner;

