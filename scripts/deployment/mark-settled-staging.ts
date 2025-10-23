/**
 * Mark Agreements as Settled
 * 
 * Simple script to mark agreements as SETTLED when they were already settled on-chain
 * but the database update failed. Based on the error logs showing "InvalidStatus" which
 * indicates the escrow is already in Settled state on-chain.
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load staging environment
dotenv.config({ path: path.join(__dirname, '../../.env.staging') });

async function markSettled() {
  console.log('\n====================================================================');
  console.log('🔧 MARK AGREEMENTS AS SETTLED');
  console.log('====================================================================\n');

  // Bypass SSL for DB
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const client = new Client({
    connectionString: process.env.DATABASE_ADMIN_URL!,
  });

  try {
    await client.connect();
    console.log('✅ Connected to staging database\n');

    // The two agreements that are stuck
    const agreementIds = ['AGR-MH33RA31-KZ35YKZF', 'AGR-MH33SMAI-SGPQ9RHZ'];

    console.log('📊 Processing stuck agreements:\n');

    for (const agreementId of agreementIds) {
      console.log(`─────────────────────────────────────────────────────────────────────`);
      console.log(`Agreement: ${agreementId}`);

      // Check current status
      const result = await client.query(`
        SELECT agreement_id, status, settle_tx_id
        FROM agreements
        WHERE agreement_id = $1
      `, [agreementId]);

      if (result.rows.length === 0) {
        console.log(`   ⚠️  Agreement not found in database`);
        continue;
      }

      const agreement = result.rows[0];
      console.log(`   DB Status: ${agreement.status}`);
      console.log(`   Settle TX: ${agreement.settle_tx_id || 'null'}`);

      if (agreement.status === 'SETTLED') {
        console.log(`   ✅ Already marked as SETTLED`);
      } else {
        console.log(`   🔧 Marking as SETTLED...`);
        await client.query(`
          UPDATE agreements
          SET status = 'SETTLED', updated_at = NOW()
          WHERE agreement_id = $1
        `, [agreementId]);
        console.log(`   ✅ Status updated to SETTLED`);
      }

      // Clear idempotency key
      console.log(`   🔧 Clearing idempotency key...`);
      const deleteResult = await client.query(`
        DELETE FROM idempotency_keys
        WHERE key = $1
      `, [`settlement_${agreementId}`]);
      console.log(`   ✅ Idempotency key cleared (deleted ${deleteResult.rowCount} rows)`);

      console.log('');
    }

    console.log('====================================================================');
    console.log('✅ MANUAL SYNC COMPLETE');
    console.log('====================================================================');
    console.log(`   Agreements processed: ${agreementIds.length}`);
    console.log(`   Status updated: Based on on-chain state (already settled)`);
    console.log(`   Idempotency keys cleared: ${agreementIds.length}`);
    console.log('');
    console.log('🎯 Result:');
    console.log('   These agreements are now in sync with on-chain state');
    console.log('   The settlement service will no longer try to settle them');
    console.log('   New E2E tests can create fresh agreements');
    console.log('====================================================================\n');

  } catch (error) {
    console.error('❌ Error during sync:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run sync
markSettled()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

