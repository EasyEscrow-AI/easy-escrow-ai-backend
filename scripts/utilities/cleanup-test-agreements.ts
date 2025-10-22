#!/usr/bin/env ts-node
/**
 * Utility Script: Clean up test agreements from database
 * 
 * This script removes test agreements from the database after E2E test runs.
 * It helps prevent database bloat and unnecessary monitoring overhead.
 * 
 * Usage:
 *   npx ts-node scripts/utilities/cleanup-test-agreements.ts [agreementIds...]
 *   npx ts-node scripts/utilities/cleanup-test-agreements.ts --all-test
 *   npx ts-node scripts/utilities/cleanup-test-agreements.ts --older-than=24h
 * 
 * Examples:
 *   # Clean specific agreements
 *   npx ts-node scripts/utilities/cleanup-test-agreements.ts AGR-123 AGR-456
 * 
 *   # Clean all test agreements (created in last 7 days)
 *   npx ts-node scripts/utilities/cleanup-test-agreements.ts --all-test
 * 
 *   # Clean agreements older than 24 hours
 *   npx ts-node scripts/utilities/cleanup-test-agreements.ts --older-than=24h
 */

import { PrismaClient, AgreementStatus } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

interface CleanupOptions {
  agreementIds?: string[];
  allTest?: boolean;
  olderThan?: string;
  dryRun?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2);
  const options: CleanupOptions = {};

  for (const arg of args) {
    if (arg === '--all-test') {
      options.allTest = true;
    } else if (arg.startsWith('--older-than=')) {
      options.olderThan = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (!arg.startsWith('--')) {
      if (!options.agreementIds) {
        options.agreementIds = [];
      }
      options.agreementIds.push(arg);
    }
  }

  return options;
}

/**
 * Parse time duration (e.g., "24h", "7d", "2w")
 */
function parseTimeDuration(duration: string): Date | null {
  const match = duration.match(/^(\d+)([hdwm])$/);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2];
  const now = new Date();

  switch (unit) {
    case 'h':
      return new Date(now.getTime() - value * 60 * 60 * 1000);
    case 'd':
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    case 'w':
      return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
    case 'm':
      return new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

/**
 * Prompt user for confirmation
 */
function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Find agreements to cleanup
 */
async function findAgreements(options: CleanupOptions) {
  const where: any = {};

  if (options.agreementIds && options.agreementIds.length > 0) {
    where.agreementId = { in: options.agreementIds };
  }

  if (options.allTest) {
    // Identify test agreements by:
    // 1. Recent creation (last 7 days)
    // 2. Status is PENDING, EXPIRED, or CANCELLED (not SETTLED)
    // 3. Or agreements with specific test patterns
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    where.createdAt = { gte: sevenDaysAgo };
    where.status = { in: [AgreementStatus.PENDING, AgreementStatus.EXPIRED, AgreementStatus.CANCELLED] };
  }

  if (options.olderThan) {
    const cutoffDate = parseTimeDuration(options.olderThan);
    if (!cutoffDate) {
      console.error('❌ Invalid time duration format. Use: 24h, 7d, 2w, 1m');
      process.exit(1);
    }
    where.createdAt = { lte: cutoffDate };
  }

  return prisma.agreement.findMany({
    where,
    select: {
      agreementId: true,
      nftMint: true,
      status: true,
      createdAt: true,
      seller: true,
      buyer: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Delete agreements and related data
 */
async function deleteAgreements(agreementIds: string[], dryRun: boolean = false) {
  const results = {
    agreements: 0,
    receipts: 0,
    webhooks: 0,
    errors: [] as string[],
  };

  for (const agreementId of agreementIds) {
    try {
      if (dryRun) {
        console.log(`   [DRY RUN] Would delete: ${agreementId}`);
        results.agreements++;
      } else {
        // Delete in transaction to ensure consistency
        await prisma.$transaction(async (tx) => {
          // Delete related receipts
          const deletedReceipts = await tx.receipt.deleteMany({
            where: { agreementId },
          });
          results.receipts += deletedReceipts.count;

          // Delete related webhook deliveries
          const deletedWebhooks = await tx.webhookDelivery.deleteMany({
            where: { agreementId },
          });
          results.webhooks += deletedWebhooks.count;

          // Delete the agreement
          await tx.agreement.delete({
            where: { agreementId },
          });
          results.agreements++;
        });

        console.log(`   ✅ Deleted: ${agreementId}`);
      }
    } catch (error: any) {
      const errorMsg = `Failed to delete ${agreementId}: ${error.message}`;
      console.error(`   ❌ ${errorMsg}`);
      results.errors.push(errorMsg);
    }
  }

  return results;
}

/**
 * Main execution
 */
async function main() {
  console.log('🧹 Agreement Cleanup Utility\n');
  console.log('='.repeat(80));

  const options = parseArgs();

  // Validate options
  if (!options.agreementIds && !options.allTest && !options.olderThan) {
    console.log('\nUsage:');
    console.log('  npx ts-node scripts/utilities/cleanup-test-agreements.ts [agreementIds...]');
    console.log('  npx ts-node scripts/utilities/cleanup-test-agreements.ts --all-test');
    console.log('  npx ts-node scripts/utilities/cleanup-test-agreements.ts --older-than=24h');
    console.log('\nOptions:');
    console.log('  --all-test        Clean all test agreements (pending/expired/cancelled, last 7 days)');
    console.log('  --older-than=24h  Clean agreements older than specified duration (h=hours, d=days, w=weeks)');
    console.log('  --dry-run         Preview what would be deleted without actually deleting');
    console.log('\nExamples:');
    console.log('  npx ts-node scripts/utilities/cleanup-test-agreements.ts AGR-123 AGR-456');
    console.log('  npx ts-node scripts/utilities/cleanup-test-agreements.ts --all-test --dry-run');
    console.log('  npx ts-node scripts/utilities/cleanup-test-agreements.ts --older-than=7d\n');
    process.exit(0);
  }

  // Find agreements
  console.log('🔍 Finding agreements to cleanup...\n');
  const agreements = await findAgreements(options);

  if (agreements.length === 0) {
    console.log('✅ No agreements found to cleanup\n');
    process.exit(0);
  }

  // Display found agreements
  console.log(`Found ${agreements.length} agreement(s):\n`);
  agreements.forEach((agreement, index) => {
    console.log(`${index + 1}. ${agreement.agreementId}`);
    console.log(`   Status: ${agreement.status}`);
    console.log(`   Created: ${agreement.createdAt.toISOString()}`);
    console.log(`   Seller: ${agreement.seller}`);
    console.log(`   Buyer: ${agreement.buyer}`);
    console.log(`   NFT: ${agreement.nftMint}`);
    console.log('');
  });

  // Confirm deletion
  if (!options.dryRun) {
    const confirmed = await promptConfirmation(`\n⚠️  Delete ${agreements.length} agreement(s)?`);
    if (!confirmed) {
      console.log('❌ Cleanup cancelled\n');
      process.exit(0);
    }
  }

  // Delete agreements
  console.log(`\n${options.dryRun ? '[DRY RUN] ' : ''}🗑️  Deleting agreements...\n`);
  const agreementIds = agreements.map((a) => a.agreementId);
  const results = await deleteAgreements(agreementIds, options.dryRun);

  // Display results
  console.log('\n' + '='.repeat(80));
  console.log('✅ Cleanup Complete!\n');
  console.log(`   Agreements deleted: ${results.agreements}`);
  console.log(`   Receipts deleted: ${results.receipts}`);
  console.log(`   Webhooks deleted: ${results.webhooks}`);

  if (results.errors.length > 0) {
    console.log(`\n   ⚠️  Errors: ${results.errors.length}`);
    results.errors.forEach((error) => console.log(`   - ${error}`));
  }

  console.log('='.repeat(80) + '\n');

  if (options.dryRun) {
    console.log('ℹ️  This was a dry run. No data was actually deleted.');
    console.log('ℹ️  Remove --dry-run flag to perform actual deletion.\n');
  }
}

// Run the script
main()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

