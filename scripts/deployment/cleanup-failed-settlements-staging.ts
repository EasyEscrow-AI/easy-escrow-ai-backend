/**
 * Cleanup Script: Remove Failed Settlement Attempts
 * 
 * This script cleans up the staging database after the UUID → AGR-xxx migration fixes.
 * It removes incomplete settlement records and clears idempotency keys to allow
 * the fixed settlement service to retry.
 * 
 * Run this BEFORE the new deployment goes live to ensure clean state.
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load staging environment
dotenv.config({ path: path.join(__dirname, '../../.env.staging') });

async function cleanupFailedSettlements() {
  console.log('\n====================================================================');
  console.log('🧹 CLEANUP: Failed Settlement Attempts');
  console.log('====================================================================\n');

  // Bypass SSL certificate validation for DigitalOcean managed DB
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // Use admin connection
  const client = new Client({
    connectionString: process.env.DATABASE_ADMIN_URL!,
  });

  try {
    await client.connect();
    console.log('✅ Connected to staging database\n');

    // 1. Find agreements that are ready to settle but have no settlement record
    console.log('📊 Step 1: Finding agreements ready to settle...');
    const readyAgreements = await client.query(`
      SELECT 
        a.agreement_id,
        a.status,
        COUNT(DISTINCT d.id) FILTER (WHERE d.type = 'USDC' AND d.status = 'CONFIRMED') as usdc_deposits,
        COUNT(DISTINCT d.id) FILTER (WHERE d.type = 'NFT' AND d.status = 'CONFIRMED') as nft_deposits
      FROM agreements a
      LEFT JOIN deposits d ON d.agreement_id = a.agreement_id
      WHERE a.status IN ('BOTH_LOCKED', 'USDC_LOCKED', 'NFT_LOCKED', 'FUNDED')
      GROUP BY a.agreement_id, a.status
      HAVING 
        COUNT(DISTINCT d.id) FILTER (WHERE d.type = 'USDC' AND d.status = 'CONFIRMED') > 0
        AND COUNT(DISTINCT d.id) FILTER (WHERE d.type = 'NFT' AND d.status = 'CONFIRMED') > 0
    `);

    console.log(`   Found ${readyAgreements.rows.length} agreements ready to settle:`);
    readyAgreements.rows.forEach((row: any) => {
      console.log(`   - ${row.agreement_id} (Status: ${row.status}, USDC: ${row.usdc_deposits}, NFT: ${row.nft_deposits})`);
    });
    console.log('');

    // 2. Check for incomplete settlement records (shouldn't exist due to FK constraint, but check anyway)
    console.log('📊 Step 2: Checking for incomplete settlement records...');
    const incompleteSettlements = await client.query(`
      SELECT id, agreement_id, settle_tx_id, settled_at
      FROM settlements
      WHERE agreement_id NOT IN (SELECT agreement_id FROM agreements WHERE status = 'SETTLED')
    `);

    if (incompleteSettlements.rows.length > 0) {
      console.log(`   ⚠️  Found ${incompleteSettlements.rows.length} incomplete settlement records:`);
      incompleteSettlements.rows.forEach((row: any) => {
        console.log(`   - Settlement ID: ${row.id}, Agreement: ${row.agreement_id}`);
      });

      console.log('   🗑️  Deleting incomplete settlement records...');
      const deleteResult = await client.query(`
        DELETE FROM settlements
        WHERE agreement_id NOT IN (SELECT agreement_id FROM agreements WHERE status = 'SETTLED')
      `);
      console.log(`   ✅ Deleted ${deleteResult.rowCount} incomplete settlement records\n`);
    } else {
      console.log('   ✅ No incomplete settlement records found\n');
    }

    // 3. Clear idempotency keys for agreements ready to settle
    if (readyAgreements.rows.length > 0) {
      console.log('📊 Step 3: Clearing idempotency keys for ready agreements...');
      
      const agreementIds = readyAgreements.rows.map((row: any) => row.agreement_id);
      const idempotencyKeys = agreementIds.map((id: string) => `settlement_${id}`);

      console.log(`   Clearing ${idempotencyKeys.length} idempotency keys...`);
      
      for (const key of idempotencyKeys) {
        await client.query(`DELETE FROM idempotency_keys WHERE key = $1`, [key]);
      }

      console.log(`   ✅ Cleared idempotency keys for ${agreementIds.length} agreements\n`);
    }

    // 4. Summary
    console.log('====================================================================');
    console.log('✅ CLEANUP COMPLETE');
    console.log('====================================================================');
    console.log(`   Ready agreements: ${readyAgreements.rows.length}`);
    console.log(`   Incomplete settlements deleted: ${incompleteSettlements.rows.length}`);
    console.log(`   Idempotency keys cleared: ${readyAgreements.rows.length}`);
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('   1. Wait for deployment 424066f to go live');
    console.log('   2. Settlement service will automatically retry these agreements');
    console.log('   3. Run E2E test to verify everything works');
    console.log('====================================================================\n');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run cleanup
cleanupFailedSettlements()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

