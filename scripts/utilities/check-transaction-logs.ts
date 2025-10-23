/**
 * Check Transaction Logs and Receipts in Staging Database
 * 
 * This script queries the staging database to investigate receipt generation issues.
 */

import { PrismaClient } from '../../src/generated/prisma';
import dotenv from 'dotenv';
import path from 'path';

// Load staging environment
dotenv.config({ path: path.resolve(__dirname, '../../.env.staging') });

const prisma = new PrismaClient();

async function checkTransactionLogs(agreementId: string) {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 DATABASE INVESTIGATION: Transaction Logs & Receipts');
  console.log('='.repeat(80));
  console.log(`\nAgreement ID: ${agreementId}\n`);

  try {
    // 1. Check if agreement exists
    console.log('📋 Step 1: Check Agreement');
    console.log('─'.repeat(80));
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
      select: {
        id: true,
        agreementId: true,
        status: true,
        nftMint: true,
        initTxId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!agreement) {
      console.log('❌ Agreement not found in database');
      return;
    }

    console.log('✅ Agreement found:');
    console.log(`   Internal ID: ${agreement.id}`);
    console.log(`   Agreement ID: ${agreement.agreementId}`);
    console.log(`   Status: ${agreement.status}`);
    console.log(`   NFT Mint: ${agreement.nftMint}`);
    console.log(`   Init TxID: ${agreement.initTxId || 'NULL'}`);
    console.log(`   Created: ${agreement.createdAt}`);
    console.log(`   Updated: ${agreement.updatedAt}`);

    // 2. Check transaction logs
    console.log('\n📋 Step 2: Check Transaction Logs');
    console.log('─'.repeat(80));
    const transactionLogs = await prisma.transactionLog.findMany({
      where: { agreementId: agreement.agreementId },
      orderBy: { timestamp: 'asc' },
    });

    if (transactionLogs.length === 0) {
      console.log('❌ No transaction logs found');
      console.log('   This is why receipt generation is failing!');
      console.log('   Settlement service needs deposit transaction IDs from transaction logs.');
    } else {
      console.log(`✅ Found ${transactionLogs.length} transaction log(s):`);
      transactionLogs.forEach((log: any, idx: number) => {
        console.log(`\n   ${idx + 1}. Transaction Log:`);
        console.log(`      ID: ${log.id}`);
        console.log(`      TxID: ${log.txId}`);
        console.log(`      Operation: ${log.operationType}`);
        console.log(`      Status: ${log.status}`);
        console.log(`      Block Height: ${log.blockHeight?.toString() || 'NULL'}`);
        console.log(`      Timestamp: ${log.timestamp}`);
      });
    }

    // 3. Check receipts
    console.log('\n📋 Step 3: Check Receipts');
    console.log('─'.repeat(80));
    const receipt = await prisma.receipt.findUnique({
      where: { agreementId: agreement.agreementId },
    });

    if (!receipt) {
      console.log('❌ No receipt found');
      console.log('   Receipt was not generated during settlement.');
    } else {
      console.log('✅ Receipt found:');
      console.log(`   Receipt ID: ${receipt.id}`);
      console.log(`   Escrow TxID: ${receipt.escrowTxId}`);
      console.log(`   Deposit NFT TxID: ${receipt.depositNftTxId || 'NULL'}`);
      console.log(`   Deposit USDC TxID: ${receipt.depositUsdcTxId || 'NULL'}`);
      console.log(`   Settlement TxID: ${receipt.settlementTxId}`);
      console.log(`   Generated At: ${receipt.generatedAt}`);
    }

    // 4. Check deposits
    console.log('\n📋 Step 4: Check Deposits');
    console.log('─'.repeat(80));
    const deposits = await prisma.deposit.findMany({
      where: { agreementId: agreement.id },
      orderBy: { detectedAt: 'asc' },
    });

    if (deposits.length === 0) {
      console.log('❌ No deposits found');
    } else {
      console.log(`✅ Found ${deposits.length} deposit(s):`);
      deposits.forEach((deposit: any, idx: number) => {
        console.log(`\n   ${idx + 1}. Deposit:`);
        console.log(`      ID: ${deposit.id}`);
        console.log(`      Type: ${deposit.type}`);
        console.log(`      Status: ${deposit.status}`);
        console.log(`      Depositor: ${deposit.depositor}`);
        console.log(`      Amount: ${deposit.amount?.toString() || 'N/A'}`);
        console.log(`      Detected: ${deposit.detectedAt}`);
        console.log(`      Confirmed: ${deposit.confirmedAt || 'NULL'}`);
      });
    }

    // 5. Summary
    console.log('\n📊 SUMMARY');
    console.log('═'.repeat(80));
    const hasAgreement = !!agreement;
    const hasTransactionLogs = transactionLogs.length > 0;
    const hasReceipt = !!receipt;
    const hasDeposits = deposits.length > 0;

    console.log(`   Agreement exists: ${hasAgreement ? '✅' : '❌'}`);
    console.log(`   Transaction logs: ${hasTransactionLogs ? '✅' : '❌'} (${transactionLogs.length})`);
    console.log(`   Deposits recorded: ${hasDeposits ? '✅' : '❌'} (${deposits.length})`);
    console.log(`   Receipt generated: ${hasReceipt ? '✅' : '❌'}`);

    if (!hasTransactionLogs) {
      console.log('\n🔥 ROOT CAUSE IDENTIFIED:');
      console.log('   Transaction logs were NOT created during deposit processing.');
      console.log('   This means the fix in commit 7e3fa88 was not deployed or is not working.');
      console.log('\n💡 LIKELY CAUSES:');
      console.log('   1. Deployment is still in progress (wait ~5-10 minutes)');
      console.log('   2. Deployment failed or is using cached code');
      console.log('   3. The deposit services are not calling transactionLogService.captureTransaction');
      console.log('   4. An error occurred but was caught and swallowed');
    } else if (!hasReceipt) {
      console.log('\n🔥 ROOT CAUSE IDENTIFIED:');
      console.log('   Transaction logs exist, but receipt was NOT generated.');
      console.log('   This means settlement.service.ts failed to generate the receipt.');
      console.log('\n💡 LIKELY CAUSES:');
      console.log('   1. Error in receiptService.generateReceipt() that was caught');
      console.log('   2. Missing agreementId mapping or query issue');
      console.log('   3. Receipt generation logic not executed during settlement');
    }

    console.log('\n' + '='.repeat(80));
  } catch (error) {
    console.error('❌ Database query failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get agreement ID from command line or use default
const agreementId = process.argv[2] || 'AGR-MH2QDUCG-0UY6ILML';

checkTransactionLogs(agreementId).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

