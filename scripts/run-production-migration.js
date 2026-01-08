/**
 * Run DataSales migrations on production database using admin credentials
 *
 * Usage:
 *   Set PRODUCTION_DATABASE_URL env var or pass as argument:
 *   DATABASE_URL="postgresql://..." node scripts/run-production-migration.js
 *
 * IMPORTANT: Run with admin credentials (doadmin user) for DDL operations
 */

const { Client } = require('pg');

// Get database URL from environment or fail
const databaseUrl = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('ERROR: No database URL provided');
  console.error('Set PRODUCTION_DATABASE_URL or DATABASE_URL environment variable');
  console.error('Example: PRODUCTION_DATABASE_URL="postgresql://doadmin:PASSWORD@host:25060/easyescrow_production" node scripts/run-production-migration.js');
  process.exit(1);
}

// SSL config for DigitalOcean managed databases
const ssl = { rejectUnauthorized: false };

async function runMigrations() {
  const client = new Client({ connectionString: databaseUrl, ssl });

  try {
    await client.connect();
    console.log('Connected to production database');
    console.log('Host:', databaseUrl.split('@')[1]?.split('/')[0] || 'unknown');

    // Create DataSalesStatus enum if not exists
    console.log('\n1. Creating DataSalesStatus enum...');
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "DataSalesStatus" AS ENUM (
          'PENDING_DEPOSITS',
          'DATA_LOCKED',
          'SOL_LOCKED',
          'BOTH_LOCKED',
          'APPROVED',
          'SETTLED',
          'EXPIRED',
          'CANCELLED',
          'ARCHIVED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);
    console.log('   DataSalesStatus enum ready');

    // Create DataSalesAgreement table if not exists
    console.log('\n2. Creating datasales_agreements table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "datasales_agreements" (
        "id" TEXT NOT NULL,
        "agreement_id" TEXT NOT NULL,
        "seller_wallet" TEXT NOT NULL,
        "buyer_wallet" TEXT,
        "price_lamports" BIGINT NOT NULL,
        "platform_fee_lamports" BIGINT NOT NULL,
        "platform_fee_bps" INTEGER NOT NULL DEFAULT 250,
        "deposit_window_ends_at" TIMESTAMP(3) NOT NULL,
        "access_duration_hours" INTEGER NOT NULL DEFAULT 168,
        "access_expires_at" TIMESTAMP(3),
        "s3_bucket_name" TEXT NOT NULL,
        "s3_region" TEXT NOT NULL DEFAULT 'us-east-1',
        "files" JSONB,
        "total_size_bytes" BIGINT,
        "escrow_pda" TEXT,
        "escrow_bump" INTEGER,
        "sol_vault_pda" TEXT,
        "seller_deposited_at" TIMESTAMP(3),
        "seller_deposit_tx_id" TEXT,
        "buyer_deposited_at" TIMESTAMP(3),
        "buyer_deposit_tx_id" TEXT,
        "verified_at" TIMESTAMP(3),
        "verified_by" TEXT,
        "rejection_reason" TEXT,
        "rejection_count" INTEGER NOT NULL DEFAULT 0,
        "status" "DataSalesStatus" NOT NULL DEFAULT 'PENDING_DEPOSITS',
        "settle_tx_signature" TEXT,
        "settled_at" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,
        "cancelled_at" TIMESTAMP(3),
        "archived_at" TIMESTAMP(3),
        CONSTRAINT "datasales_agreements_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('   datasales_agreements table ready');

    // Create indexes
    console.log('\n3. Creating indexes...');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "datasales_agreements_agreement_id_key" ON "datasales_agreements"("agreement_id")
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "datasales_agreements_s3_bucket_name_key" ON "datasales_agreements"("s3_bucket_name")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "datasales_agreements_seller_wallet_idx" ON "datasales_agreements"("seller_wallet")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "datasales_agreements_buyer_wallet_idx" ON "datasales_agreements"("buyer_wallet")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "datasales_agreements_status_idx" ON "datasales_agreements"("status")
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "datasales_agreements_deposit_window_ends_at_idx" ON "datasales_agreements"("deposit_window_ends_at")
    `);
    console.log('   All indexes created');

    // Grant permissions to production_user if it exists
    console.log('\n4. Granting permissions...');
    try {
      await client.query(`GRANT ALL ON TABLE "datasales_agreements" TO production_user`);
      await client.query(`GRANT USAGE ON TYPE "DataSalesStatus" TO production_user`);
      console.log('   Permissions granted to production_user');
    } catch (err) {
      // Try with alternative user name
      try {
        await client.query(`GRANT ALL ON TABLE "datasales_agreements" TO easyescrow_user`);
        await client.query(`GRANT USAGE ON TYPE "DataSalesStatus" TO easyescrow_user`);
        console.log('   Permissions granted to easyescrow_user');
      } catch (err2) {
        console.log('   Note: Could not grant permissions (admin user may own the table)');
      }
    }

    // Verify table exists
    console.log('\n5. Verifying migration...');
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'datasales_agreements'
    `);

    if (result.rows.length > 0) {
      console.log('   datasales_agreements table exists');
    } else {
      throw new Error('Table verification failed - datasales_agreements not found');
    }

    // Check column count
    const columns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'datasales_agreements'
    `);
    console.log(`   Table has ${columns.rows.length} columns`);

    console.log('\n========================================');
    console.log('PRODUCTION MIGRATION COMPLETED SUCCESSFULLY');
    console.log('========================================\n');

  } catch (error) {
    console.error('\nMigration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
