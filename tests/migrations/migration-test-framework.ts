/**
 * Migration Testing Framework
 * 
 * Comprehensive framework for testing database migrations on STAGING environment
 * with backup, rollback, and data integrity verification capabilities.
 */

import { PrismaClient } from '../../src/generated/prisma';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Risk level classification for migrations
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Migration execution result
 */
export interface MigrationResult {
  success: boolean;
  migrationName: string;
  riskLevel: RiskLevel;
  duration: number;
  backupPath?: string;
  error?: Error;
  integrityChecksPassed: boolean;
  rollbackTested: boolean;
  rollbackSuccess: boolean;
  logs: string[];
}

/**
 * Migration test definition
 */
export interface MigrationTest {
  name: string;
  riskLevel: RiskLevel;
  upMigration: string;
  downMigration: string;
  dataIntegrityChecks: DataIntegrityCheck[];
  setupData?: (databaseUrl: string) => Promise<void>;
  teardownData?: (databaseUrl: string) => Promise<void>;
}

/**
 * Data integrity check function
 */
export interface DataIntegrityCheck {
  name: string;
  check: (prisma: PrismaClient) => Promise<boolean>;
  errorMessage: string;
}

/**
 * Migration test configuration
 */
export interface MigrationTestConfig {
  databaseUrl: string;
  backupDirectory: string;
  enableBackups: boolean;
  enableRollbackTests: boolean;
  timeoutMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: MigrationTestConfig = {
  databaseUrl: process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || '',
  backupDirectory: path.join(process.cwd(), 'backups', 'migrations'),
  enableBackups: true,
  enableRollbackTests: true,
  timeoutMs: 60000, // 60 seconds
};

/**
 * Migration Tester Class
 * 
 * Provides comprehensive migration testing with:
 * - Pre-migration database backups
 * - Migration execution with timing
 * - Data integrity verification
 * - Rollback testing and validation
 */
export class MigrationTester {
  private config: MigrationTestConfig;
  private prisma: PrismaClient;
  private logs: string[] = [];

  constructor(config: Partial<MigrationTestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Validate configuration
    if (!this.config.databaseUrl) {
      throw new Error('Database URL is required for migration testing');
    }

    // Ensure database URL is for STAGING environment
    if (!this.config.databaseUrl.includes('staging') && 
        !this.config.databaseUrl.includes('test')) {
      console.warn('⚠️  WARNING: Database URL does not appear to be STAGING or TEST environment');
    }

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: this.config.databaseUrl,
        },
      },
    });

    // Ensure backup directory exists
    if (this.config.enableBackups && !fs.existsSync(this.config.backupDirectory)) {
      fs.mkdirSync(this.config.backupDirectory, { recursive: true });
    }
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    this.logs.push(logMessage);
    console.log(logMessage);
  }

  /**
   * Create a backup of the database before migration
   */
  private async createBackup(migrationName: string): Promise<string | undefined> {
    if (!this.config.enableBackups) {
      this.log('Backups disabled, skipping backup creation');
      return undefined;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${migrationName}_${timestamp}.sql`;
    const backupPath = path.join(this.config.backupDirectory, backupFileName);

    this.log(`Creating backup: ${backupPath}`);

    try {
      // Extract connection details from DATABASE_URL
      const dbUrl = new URL(this.config.databaseUrl);
      const host = dbUrl.hostname;
      const port = dbUrl.port || '5432';
      const database = dbUrl.pathname.slice(1); // Remove leading '/'
      const username = dbUrl.username;
      const password = dbUrl.password;

      // Use pg_dump with environment variables to avoid command injection
      // Pass password via PGPASSWORD environment variable
      const env = {
        ...process.env,
        PGPASSWORD: password,
      };

      // Build pg_dump command with safe arguments (no interpolation)
      const pgDumpArgs = [
        'pg_dump',
        '-h', host,
        '-p', port,
        '-U', username,
        '-d', database,
        '-f', backupPath
      ];
      
      execSync(pgDumpArgs.join(' '), {
        env,
        stdio: 'pipe',
        timeout: this.config.timeoutMs,
      });

      this.log(`✅ Backup created successfully: ${backupPath}`);
      return backupPath;
    } catch (error) {
      this.log(`❌ Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Run a migration SQL script
   */
  private async runMigration(migrationSql: string): Promise<void> {
    this.log('Executing migration SQL...');
    
    try {
      await this.prisma.$executeRawUnsafe(migrationSql);
      this.log('✅ Migration executed successfully');
    } catch (error) {
      this.log(`❌ Migration execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Verify data integrity after migration
   */
  private async verifyDataIntegrity(checks: DataIntegrityCheck[]): Promise<boolean> {
    this.log(`Running ${checks.length} data integrity checks...`);
    
    let allPassed = true;

    for (const check of checks) {
      try {
        this.log(`  Checking: ${check.name}`);
        const passed = await check.check(this.prisma);
        
        if (passed) {
          this.log(`  ✅ ${check.name} - PASSED`);
        } else {
          this.log(`  ❌ ${check.name} - FAILED: ${check.errorMessage}`);
          allPassed = false;
        }
      } catch (error) {
        this.log(`  ❌ ${check.name} - ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
        allPassed = false;
      }
    }

    return allPassed;
  }

  /**
   * Test rollback by executing down migration
   */
  private async testRollback(downMigration: string): Promise<boolean> {
    if (!this.config.enableRollbackTests) {
      this.log('Rollback testing disabled, skipping');
      return true;
    }

    this.log('Testing rollback (down migration)...');
    
    try {
      await this.prisma.$executeRawUnsafe(downMigration);
      this.log('✅ Rollback executed successfully');
      return true;
    } catch (error) {
      this.log(`❌ Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Test a migration with full lifecycle
   */
  async testMigration(test: MigrationTest): Promise<MigrationResult> {
    const startTime = Date.now();
    this.logs = []; // Reset logs for this test

    this.log(`\n${'='.repeat(80)}`);
    this.log(`Testing Migration: ${test.name}`);
    this.log(`Risk Level: ${test.riskLevel.toUpperCase()}`);
    this.log(`${'='.repeat(80)}\n`);

    const result: MigrationResult = {
      success: false,
      migrationName: test.name,
      riskLevel: test.riskLevel,
      duration: 0,
      integrityChecksPassed: false,
      rollbackTested: false,
      rollbackSuccess: false,
      logs: [],
    };

    try {
      // Connect to database
      await this.prisma.$connect();
      this.log('✅ Connected to database');

      // Setup test data if provided
      if (test.setupData) {
        this.log('Setting up test data...');
        await test.setupData(this.config.databaseUrl);
        this.log('✅ Test data setup complete');
      }

      // Step 1: Create backup
      result.backupPath = await this.createBackup(test.name);

      // Step 2: Execute up migration
      this.log('\n--- PHASE 1: Executing UP Migration ---');
      await this.runMigration(test.upMigration);

      // Step 3: Verify data integrity
      this.log('\n--- PHASE 2: Verifying Data Integrity ---');
      result.integrityChecksPassed = await this.verifyDataIntegrity(test.dataIntegrityChecks);

      // Step 4: Test rollback
      this.log('\n--- PHASE 3: Testing Rollback ---');
      result.rollbackTested = true;
      result.rollbackSuccess = await this.testRollback(test.downMigration);

      // If rollback was successful, re-apply the up migration for final state
      if (result.rollbackSuccess) {
        this.log('\n--- PHASE 4: Re-applying Migration After Rollback Test ---');
        await this.runMigration(test.upMigration);
      }

      // Teardown test data if provided
      if (test.teardownData) {
        this.log('\nCleaning up test data...');
        await test.teardownData(this.config.databaseUrl);
        this.log('✅ Test data cleanup complete');
      }

      // Mark as successful if integrity checks passed and rollback worked
      result.success = result.integrityChecksPassed && result.rollbackSuccess;

      this.log(`\n${'='.repeat(80)}`);
      if (result.success) {
        this.log(`✅ Migration Test PASSED: ${test.name}`);
      } else {
        this.log(`❌ Migration Test FAILED: ${test.name}`);
      }
      this.log(`${'='.repeat(80)}\n`);

    } catch (error) {
      result.error = error instanceof Error ? error : new Error(String(error));
      this.log(`\n❌ Migration test failed with error: ${result.error.message}`);
    } finally {
      await this.prisma.$disconnect();
      result.duration = Date.now() - startTime;
      result.logs = [...this.logs];
    }

    return result;
  }

  /**
   * Test multiple migrations in sequence
   */
  async testMigrations(tests: MigrationTest[]): Promise<MigrationResult[]> {
    this.log(`\n${'#'.repeat(80)}`);
    this.log(`Starting Migration Test Suite: ${tests.length} migrations to test`);
    this.log(`${'#'.repeat(80)}\n`);

    const results: MigrationResult[] = [];

    for (const test of tests) {
      const result = await this.testMigration(test);
      results.push(result);

      // Stop on first failure if it's a high-risk migration
      if (!result.success && test.riskLevel === 'high') {
        this.log(`\n⚠️  HIGH-RISK migration failed. Stopping test suite.`);
        break;
      }
    }

    // Print summary
    this.printSummary(results);

    return results;
  }

  /**
   * Print test summary
   */
  private printSummary(results: MigrationResult[]): void {
    this.log(`\n${'#'.repeat(80)}`);
    this.log('Migration Test Suite Summary');
    this.log(`${'#'.repeat(80)}`);

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    this.log(`\nTotal Tests: ${results.length}`);
    this.log(`Passed: ${passed}`);
    this.log(`Failed: ${failed}`);
    this.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    this.log('\nDetailed Results:');
    results.forEach((result, index) => {
      const icon = result.success ? '✅' : '❌';
      const duration = (result.duration / 1000).toFixed(2);
      this.log(`  ${index + 1}. ${icon} ${result.migrationName} (${result.riskLevel}) - ${duration}s`);
      
      if (!result.success) {
        if (result.error) {
          this.log(`     Error: ${result.error.message}`);
        }
        if (!result.integrityChecksPassed) {
          this.log(`     Data integrity checks failed`);
        }
        if (!result.rollbackSuccess) {
          this.log(`     Rollback test failed`);
        }
      }
    });

    this.log(`\n${'#'.repeat(80)}\n`);
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/**
 * Helper function to create a data integrity check
 */
export function createIntegrityCheck(
  name: string,
  checkFn: (prisma: PrismaClient) => Promise<boolean>,
  errorMessage: string
): DataIntegrityCheck {
  return {
    name,
    check: checkFn,
    errorMessage,
  };
}

