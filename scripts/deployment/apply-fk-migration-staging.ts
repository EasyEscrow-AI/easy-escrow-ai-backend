import * as dotenv from 'dotenv';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.staging' });

const migrationSQL = fs.readFileSync(
  path.join(__dirname, '../../prisma/migrations/20251023_fix_foreign_key_constraints/migration.sql'),
  'utf-8'
);

const client = new Client({
  connectionString: process.env.DATABASE_ADMIN_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('🔌 Connecting to staging database...');
    await client.connect();
    console.log('✅ Connected to staging database\n');
    
    console.log('🔧 Applying migration: Fix Foreign Key Constraints\n');
    await client.query(migrationSQL);
    
    console.log('✅ Migration applied successfully!\n');
    console.log('Fixed foreign key constraints for:');
    console.log('  • deposits → Agreement.agreementId');
    console.log('  • settlements → Agreement.agreementId');
    console.log('  • receipts → Agreement.agreementId');
    console.log('  • webhooks → Agreement.agreementId\n');
    
    console.log('🎉 All tables now correctly reference Agreement.agreementId instead of Agreement.id\n');
    
  } catch (error) {
    console.error('❌ Migration failed:',error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Disconnected from database');
  }
})();

