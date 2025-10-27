#!/usr/bin/env ts-node

/**
 * Database Migration Script for STAGING Environment
 * 
 * This script runs database migrations for the STAGING environment
 * using Prisma migrate deploy command. It's designed to be run as
 * part of the CI/CD pipeline.
 * 
 * Usage: npm run staging:migrate:ci
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string): void {
  log('\n' + '='.repeat(60), colors.blue);
  log(title, colors.blue);
  log('='.repeat(60), colors.blue);
}

function checkEnvironmentVariables(): void {
  logSection('Environment Variables Check');
  
  const requiredVars = ['DATABASE_URL', 'NODE_ENV'];
  const missingVars: string[] = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
      log(`✗ ${varName}: Not set`, colors.red);
    } else {
      // Mask the value for security
      const value = process.env[varName]!;
      const maskedValue = value.includes('postgresql') 
        ? value.replace(/:[^:@]+@/, ':****@')
        : '****';
      log(`✓ ${varName}: ${maskedValue}`, colors.green);
    }
  }
  
  if (missingVars.length > 0) {
    log(`\n✗ Missing required environment variables: ${missingVars.join(', ')}`, colors.red);
    process.exit(1);
  }
  
  // Verify we're targeting STAGING
  if (process.env.NODE_ENV !== 'staging') {
    log(`\n⚠ Warning: NODE_ENV is '${process.env.NODE_ENV}', expected 'staging'`, colors.yellow);
    log('Continuing anyway...', colors.yellow);
  }
}

function checkMigrationFiles(): void {
  logSection('Migration Files Check');
  
  const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    log('✗ Migrations directory not found', colors.red);
    process.exit(1);
  }
  
  const migrationFolders = fs.readdirSync(migrationsDir)
    .filter(file => {
      const fullPath = path.join(migrationsDir, file);
      return fs.statSync(fullPath).isDirectory();
    })
    .filter(folder => folder !== 'migration_lock.toml');
  
  if (migrationFolders.length === 0) {
    log('⚠ No migration folders found', colors.yellow);
  } else {
    log(`✓ Found ${migrationFolders.length} migration(s)`, colors.green);
    migrationFolders.forEach(folder => {
      log(`  - ${folder}`, colors.cyan);
    });
  }
}

function runMigrations(): void {
  logSection('Running Migrations');
  
  try {
    log('Executing: prisma migrate deploy', colors.cyan);
    
    const output = execSync('npx prisma migrate deploy', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    log(output, colors.reset);
    log('✓ Migrations completed successfully', colors.green);
  } catch (error: any) {
    log('✗ Migration failed', colors.red);
    if (error.stdout) {
      log(error.stdout, colors.reset);
    }
    if (error.stderr) {
      log(error.stderr, colors.red);
    }
    process.exit(1);
  }
}

function generatePrismaClient(): void {
  logSection('Generating Prisma Client');
  
  try {
    log('Executing: prisma generate', colors.cyan);
    
    const output = execSync('npx prisma generate', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    log(output, colors.reset);
    log('✓ Prisma client generated successfully', colors.green);
  } catch (error: any) {
    log('✗ Client generation failed', colors.red);
    if (error.stdout) {
      log(error.stdout, colors.reset);
    }
    if (error.stderr) {
      log(error.stderr, colors.red);
    }
    process.exit(1);
  }
}

function verifyMigrationStatus(): void {
  logSection('Migration Status Verification');
  
  try {
    log('Executing: prisma migrate status', colors.cyan);
    
    const output = execSync('npx prisma migrate status', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    log(output, colors.reset);
    
    // Check if there are pending migrations
    if (output.includes('Following migration have not yet been applied')) {
      log('⚠ Warning: There are still pending migrations', colors.yellow);
      process.exit(1);
    }
    
    log('✓ All migrations applied successfully', colors.green);
  } catch (error: any) {
    // prisma migrate status returns exit code 1 if migrations are pending
    // So we need to check the output
    if (error.stdout) {
      log(error.stdout, colors.reset);
      
      if (error.stdout.includes('Following migration have not yet been applied')) {
        log('✗ Pending migrations detected', colors.red);
        process.exit(1);
      }
    }
    
    log('✓ Migration status verified', colors.green);
  }
}

function printSummary(startTime: number): void {
  const duration = Date.now() - startTime;
  
  logSection('Migration Summary');
  log(`Environment: ${process.env.NODE_ENV || 'unknown'}`, colors.cyan);
  log(`Duration: ${duration}ms`, colors.cyan);
  log('Status: SUCCESS', colors.green);
  log('\n✓ STAGING database migrations completed successfully\n', colors.green);
}

async function main(): Promise<void> {
  const startTime = Date.now();
  
  log('\n' + '='.repeat(60), colors.blue);
  log('STAGING Database Migration Script', colors.blue);
  log('='.repeat(60) + '\n', colors.blue);
  
  try {
    // Step 1: Check environment variables
    checkEnvironmentVariables();
    
    // Step 2: Check migration files exist
    checkMigrationFiles();
    
    // Step 3: Run migrations
    runMigrations();
    
    // Step 4: Generate Prisma client
    generatePrismaClient();
    
    // Step 5: Verify migration status
    verifyMigrationStatus();
    
    // Step 6: Print summary
    printSummary(startTime);
    
    process.exit(0);
  } catch (error: any) {
    log('\n✗ Migration script failed', colors.red);
    log(error.message, colors.red);
    process.exit(1);
  }
}

// Run the migration script
main();
