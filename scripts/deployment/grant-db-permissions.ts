/**
 * Grant Database Permissions to staging_user
 * Fixes "permission denied for table agreements" error
 */

import { Client } from 'pg';

// Get connection string from command line argument
const connectionString = process.argv[2];

if (!connectionString) {
  console.error('\n❌ Error: Connection string required\n');
  console.log('Usage:');
  console.log('  npx ts-node scripts/deployment/grant-db-permissions.ts "postgresql://doadmin:PASSWORD@HOST:PORT/easyescrow_staging?sslmode=require"\n');
  process.exit(1);
}

// Validate connection string
if (!connectionString.includes('easyescrow_staging')) {
  console.warn('\n⚠️  Warning: Connection string does not contain "easyescrow_staging"');
  console.warn('   Make sure you changed /defaultdb to /easyescrow_staging\n');
}

const sql = `
-- Grant all permissions to staging_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;
GRANT USAGE ON SCHEMA public TO staging_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO staging_user;
`;

async function grantPermissions() {
  const client = new Client({ 
    connectionString,
    ssl: {
      rejectUnauthorized: false // DigitalOcean uses self-signed certs for managed databases
    }
  });

  try {
    console.log('\n============================================');
    console.log('Grant Database Permissions to staging_user');
    console.log('============================================\n');

    console.log('📡 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    console.log('🔧 Granting permissions...');
    await client.query(sql);
    console.log('✅ Permissions granted successfully\n');

    // Verify by checking permissions on agreements table
    console.log('🔍 Verifying permissions on agreements table...');
    const result = await client.query(`
      SELECT 
        grantee,
        privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND table_name = 'agreements'
        AND grantee = 'staging_user';
    `);

    if (result.rows.length > 0) {
      console.log('✅ staging_user permissions on agreements table:');
      result.rows.forEach((row: any) => {
        console.log(`   - ${row.privilege_type}`);
      });
    } else {
      console.log('⚠️  Could not verify permissions (table may not exist yet)');
    }

    console.log('\n============================================');
    console.log('✅ SUCCESS: Database Permissions Fixed!');
    console.log('============================================\n');

    console.log('Next Steps:');
    console.log('  1. The staging app will automatically retry');
    console.log('  2. Wait 5-10 seconds for the monitoring service to start');
    console.log('  3. Check logs: doctl apps logs ea13cdbb-c74e-40da-a0eb-6c05b0d0432d --follow');
    console.log('  4. Look for: "[MonitoringService] Loaded X pending agreements"\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    console.error('\nMake sure:');
    console.error('  1. Connection string is correct');
    console.error('  2. Database is easyescrow_staging (not defaultdb)');
    console.error('  3. You can reach the database from your network\n');
    process.exit(1);
  } finally {
    await client.end();
  }
}

grantPermissions();

