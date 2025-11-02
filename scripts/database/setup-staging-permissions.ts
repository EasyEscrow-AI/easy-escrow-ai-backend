#!/usr/bin/env ts-node
/**
 * Grant database permissions to staging_user for migrations
 * 
 * This script grants all necessary permissions to staging_user so that
 * Prisma migrations can run via the PRE_DEPLOY job in DigitalOcean.
 * 
 * Usage:
 *   DATABASE_ADMIN_URL=postgresql://doadmin:pass@host:25060/db npx ts-node scripts/database/setup-staging-permissions.ts
 * 
 * Requirements:
 *   - Node.js with ts-node
 *   - DATABASE_ADMIN_URL environment variable (doadmin connection string)
 */

import { Client } from 'pg';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

function writeSuccess(msg: string) {
  console.log(`${colors.green}✅ ${msg}${colors.reset}`);
}

function writeError(msg: string) {
  console.log(`${colors.red}❌ ${msg}${colors.reset}`);
}

function writeInfo(msg: string) {
  console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`);
}

function writeStep(msg: string) {
  console.log(`${colors.yellow}🔧 ${msg}${colors.reset}`);
}

async function setupPermissions() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Staging Database Permissions Setup');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Get admin connection string
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  
  if (!adminUrl) {
    writeError('DATABASE_ADMIN_URL not found');
    writeInfo('');
    writeInfo('Please set DATABASE_ADMIN_URL environment variable:');
    writeInfo('');
    writeInfo('PowerShell:');
    writeInfo('  $env:DATABASE_ADMIN_URL = "postgresql://doadmin:pass@host:25060/easyescrow_staging"');
    writeInfo('  npx ts-node scripts/database/setup-staging-permissions.ts');
    writeInfo('');
    writeInfo('Bash:');
    writeInfo('  export DATABASE_ADMIN_URL="postgresql://doadmin:pass@host:25060/easyescrow_staging"');
    writeInfo('  npx ts-node scripts/database/setup-staging-permissions.ts');
    writeInfo('');
    process.exit(1);
  }

  // Parse connection string to show host info
  try {
    const url = new URL(adminUrl);
    writeInfo(`Using admin connection string`);
    writeInfo(`Connection: ${url.host}`);
    console.log('');
  } catch (err) {
    writeError('Invalid DATABASE_ADMIN_URL format');
    process.exit(1);
  }

  // Parse connection string and configure SSL
  // The pg library doesn't handle sslmode parameter in the URL, so we need to remove it
  // and configure SSL separately
  let cleanUrl = adminUrl;
  let useSsl = false;
  
  if (adminUrl.includes('sslmode=require')) {
    cleanUrl = adminUrl.replace(/[?&]sslmode=require/, '');
    useSsl = true;
  }

  const connectionOptions: any = {
    connectionString: cleanUrl
  };

  // Configure SSL to accept self-signed certificates (DigitalOcean managed databases)
  if (useSsl) {
    connectionOptions.ssl = {
      rejectUnauthorized: false
    };
  }

  const client = new Client(connectionOptions);

  try {
    writeStep('Connecting to database...');
    await client.connect();
    writeSuccess('Connected to database');
    console.log('');

    writeStep('Granting permissions to staging_user...');
    console.log('');

    // Grant all permissions to staging_user
    const sqlCommands = [
      // Grant schema permissions
      `GRANT ALL PRIVILEGES ON SCHEMA public TO staging_user;`,
      `GRANT CREATE ON SCHEMA public TO staging_user;`,
      
      // Grant permissions on existing objects
      `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;`,
      `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;`,
      
      // Set default privileges for future objects
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO staging_user;`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO staging_user;`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO staging_user;`,
      
      // Grant database connection
      `GRANT CONNECT ON DATABASE easyescrow_staging TO staging_user;`,
    ];

    for (const sql of sqlCommands) {
      try {
        await client.query(sql);
        console.log(`  ✓ ${sql.split('TO staging_user')[0].trim()}`);
      } catch (err) {
        writeError(`Failed: ${sql}`);
        throw err;
      }
    }

    console.log('');
    writeSuccess('All permissions granted successfully!');
    console.log('');

    // Verify permissions
    writeStep('Verifying permissions...');
    const verifyQuery = `
      SELECT 
        nspname as schema,
        CASE 
          WHEN has_schema_privilege('staging_user', nspname, 'USAGE') THEN '✅ USAGE'
          ELSE '❌ USAGE'
        END as usage,
        CASE 
          WHEN has_schema_privilege('staging_user', nspname, 'CREATE') THEN '✅ CREATE'
          ELSE '❌ CREATE'
        END as create
      FROM pg_namespace 
      WHERE nspname = 'public';
    `;

    const result = await client.query(verifyQuery);
    console.log('');
    console.log('📋 Current permissions for staging_user:');
    console.log(`  Schema: ${result.rows[0].schema}`);
    console.log(`  USAGE:  ${result.rows[0].usage}`);
    console.log(`  CREATE: ${result.rows[0].create}`);
    console.log('');

    // Verify it worked
    const hasUsage = result.rows[0].usage.includes('✅');
    const hasCreate = result.rows[0].create.includes('✅');

    if (hasUsage && hasCreate) {
      writeSuccess('Permissions verified successfully! ✅');
      console.log('');
      writeInfo('Next steps:');
      writeInfo('1. Trigger a new deployment:');
      writeInfo('   doctl apps create-deployment ea13cdbb-c74e-40da-a0eb-6c05b0d0432d');
      writeInfo('');
      writeInfo('2. Or wait for next git push to staging branch');
      writeInfo('');
      writeInfo('3. The PRE_DEPLOY migration job will now succeed! ✅');
      console.log('');
    } else {
      writeError('Permissions verification failed');
      writeInfo('Some permissions may not have been granted correctly');
      console.log('');
      process.exit(1);
    }

  } catch (err) {
    console.log('');
    writeError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    console.log('');
    writeInfo('Troubleshooting:');
    writeInfo('1. Verify admin connection string is correct');
    writeInfo('2. Check that you\'re using doadmin user (has all privileges)');
    writeInfo('3. Ensure database name is \'easyescrow_staging\'');
    writeInfo('4. Check network connectivity to DigitalOcean');
    console.log('');
    process.exit(1);
  } finally {
    await client.end();
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('');
}

// Run the setup
setupPermissions().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});

