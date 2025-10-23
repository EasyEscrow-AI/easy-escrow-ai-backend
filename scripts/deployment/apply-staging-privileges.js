/**
 * Apply Staging User Privileges
 * 
 * Connects as doadmin and grants necessary privileges to staging_user
 * for running Prisma migrations.
 */

const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.staging
dotenv.config({ path: path.resolve(__dirname, '../../.env.staging') });

const adminUrl = process.env.DATABASE_ADMIN_URL;

if (!adminUrl) {
  console.error('❌ DATABASE_ADMIN_URL not found in .env.staging');
  process.exit(1);
}

console.log('\n🔐 APPLYING PRIVILEGES TO staging_user\n');
console.log('='.repeat(70));
console.log('Connecting as doadmin...');
console.log('Database: easyescrow_staging\n');

// Remove query parameters from URL and configure SSL separately
const cleanUrl = adminUrl.split('?')[0];

const client = new Client({
  connectionString: cleanUrl,
  ssl: {
    rejectUnauthorized: false, // Accept self-signed certificates from DigitalOcean
  },
});

const sql = `
-- Grant privileges to staging_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO staging_user;
GRANT CREATE ON SCHEMA public TO staging_user;
ALTER USER staging_user WITH CREATEDB CREATEROLE;

-- Transfer ownership of all tables to staging_user (CRITICAL for ALTER TABLE)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO staging_user';
  END LOOP;
END $$;

-- Transfer ownership of all sequences to staging_user
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequencename) || ' OWNER TO staging_user';
  END LOOP;
END $$;
`;

async function applyPrivileges() {
  try {
    await client.connect();
    console.log('✅ Connected to database as doadmin\n');
    
    console.log('Executing privilege grants...');
    await client.query(sql);
    console.log('✅ All privileges granted successfully!\n');
    
    // Verify
    console.log('Verifying staging_user privileges...');
    const result = await client.query(`
      SELECT 
        rolname, 
        rolcreatedb, 
        rolcreaterole
      FROM pg_roles 
      WHERE rolname = 'staging_user'
    `);
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      console.log('✅ User verification:');
      console.log(`   Username: ${user.rolname}`);
      console.log(`   Can create databases: ${user.rolcreatedb}`);
      console.log(`   Can create roles: ${user.rolcreaterole}`);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ SUCCESS! staging_user now has full migration privileges');
    console.log('='.repeat(70));
    console.log('\nNext step: Run migration');
    console.log('  npx prisma migrate deploy\n');
    
  } catch (error) {
    console.error('❌ Error applying privileges:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyPrivileges();

