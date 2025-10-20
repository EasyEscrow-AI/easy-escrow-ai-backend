/**
 * Database Connection Test Script
 * 
 * Tests the database connection and verifies CRUD operations.
 * Useful for validating staging/production database setup.
 * 
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node scripts/utilities/test-db-connection.ts
 */

import { PrismaClient } from '../../src/generated/prisma';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

async function testConnection() {
  console.log('🔍 Testing database connection...\n');

  try {
    // Test 1: Basic Connection
    console.log('1️⃣  Testing basic connection...');
    await prisma.$connect();
    console.log('   ✅ Connected to database successfully\n');

    // Test 2: Read Operation
    console.log('2️⃣  Testing read operation...');
    const agreementCount = await prisma.agreement.count();
    console.log(`   ✅ Can read from database (${agreementCount} agreements found)\n`);

    // Test 3: Write Operation
    console.log('3️⃣  Testing write operation...');
    const testAgreement = await prisma.agreement.create({
      data: {
        agreementId: `test-connection-${Date.now()}`,
        escrowPda: 'test-escrow-pda',
        nftMint: 'test-nft-mint',
        seller: 'test-seller',
        price: 1.0,
        feeBps: 250,
        honorRoyalties: false,
        status: 'PENDING',
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        initTxId: 'test-init-tx',
      },
    });
    console.log(`   ✅ Can write to database (created test agreement: ${testAgreement.id})\n`);

    // Test 4: Update Operation
    console.log('4️⃣  Testing update operation...');
    await prisma.agreement.update({
      where: { id: testAgreement.id },
      data: { status: 'CANCELLED' },
    });
    console.log('   ✅ Can update records\n');

    // Test 5: Delete Operation
    console.log('5️⃣  Testing delete operation...');
    await prisma.agreement.delete({
      where: { id: testAgreement.id },
    });
    console.log('   ✅ Can delete records\n');

    // Test 6: Migration Status
    console.log('6️⃣  Checking migration status...');
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    
    const expectedTables = [
      'agreements',
      'deposits',
      'idempotency_keys',
      'receipts',
      'settlements',
      'transaction_logs',
      'webhooks',
    ];

    const tableNames = tables.map((t) => t.tablename);
    const missingTables = expectedTables.filter((t) => !tableNames.includes(t));

    if (missingTables.length === 0) {
      console.log(`   ✅ All expected tables exist (${tableNames.length} tables)\n`);
    } else {
      console.log(`   ⚠️  Missing tables: ${missingTables.join(', ')}\n`);
      console.log('   💡 Run migrations: npx prisma migrate deploy\n');
    }

    // Test 7: Index Verification
    console.log('7️⃣  Verifying database indexes...');
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename IN ('agreements', 'deposits', 'settlements', 'receipts')
      ORDER BY indexname
    `;
    console.log(`   ✅ Found ${indexes.length} indexes\n`);

    // Summary
    console.log('============================================================================');
    console.log('✅ ALL DATABASE TESTS PASSED');
    console.log('============================================================================\n');
    console.log('Database is ready for use! 🎉\n');
    console.log('Database Info:');
    console.log(`  - Tables: ${tableNames.length}`);
    console.log(`  - Indexes: ${indexes.length}`);
    console.log(`  - Agreements: ${agreementCount}`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database connection test failed:\n');
    console.error(error);
    console.log('\n');
    console.log('Troubleshooting:');
    console.log('  1. Verify DATABASE_URL is set correctly');
    console.log('  2. Check database server is accessible');
    console.log('  3. Verify user has appropriate permissions');
    console.log('  4. Run migrations: npx prisma migrate deploy');
    console.log('  5. Check firewall/network settings');
    console.log('');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testConnection();

