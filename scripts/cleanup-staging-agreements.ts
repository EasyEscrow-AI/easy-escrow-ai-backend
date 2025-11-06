#!/usr/bin/env ts-node
/**
 * Cleanup Script for Staging Environment
 * 
 * Deletes old test agreements that are stuck in PENDING status
 * Useful for cleaning up after failed/interrupted E2E tests
 * 
 * Usage:
 *   npm run cleanup:staging
 *   npm run cleanup:staging -- --days=1    # Delete agreements older than 1 day
 *   npm run cleanup:staging -- --dry-run   # Preview what would be deleted
 */

import axios from 'axios';

interface CleanupOptions {
  daysOld?: number;
  dryRun?: boolean;
  apiUrl?: string;
}

interface Agreement {
  agreementId: string;
  status: string;
  swapType: string;
  createdAt: string;
  seller: string;
  buyer: string | null;
}

async function cleanupStagingAgreements(options: CleanupOptions = {}) {
  const {
    daysOld = 7,
    dryRun = false,
    apiUrl = 'https://easyescrow-backend-staging-mwx9s.ondigitalocean.app'
  } = options;

  console.log('\n' + '='.repeat(80));
  console.log('🧹 STAGING AGREEMENT CLEANUP');
  console.log('='.repeat(80));
  console.log(`API URL: ${apiUrl}`);
  console.log(`Deleting agreements older than: ${daysOld} days`);
  console.log(`Dry Run: ${dryRun ? 'YES (no actual deletions)' : 'NO (will delete)'}`);
  console.log('='.repeat(80) + '\n');

  try {
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    console.log(`Fetching agreements created before: ${cutoffDate.toISOString()}\n`);

    // Fetch all agreements (we'll filter by date locally)
    const response = await axios.get<{ success: boolean; data: Agreement[] }>(
      `${apiUrl}/v1/agreements`,
      {
        params: {
          limit: 1000, // Increase limit to get all
        }
      }
    );

    if (!response.data.success || !Array.isArray(response.data.data)) {
      console.error('❌ Failed to fetch agreements:', response.data);
      process.exit(1);
    }

    const allAgreements = response.data.data;
    console.log(`📊 Total agreements in database: ${allAgreements.length}`);

    // Filter agreements that are:
    // 1. In PENDING status (never completed)
    // 2. Older than cutoff date
    const oldPendingAgreements = allAgreements.filter(agreement => {
      const createdAt = new Date(agreement.createdAt);
      return (
        agreement.status === 'PENDING' &&
        createdAt < cutoffDate
      );
    });

    console.log(`🔍 Found ${oldPendingAgreements.length} old PENDING agreements to clean up\n`);

    if (oldPendingAgreements.length === 0) {
      console.log('✅ No agreements to clean up. All done!');
      return;
    }

    // Display agreements to be deleted
    console.log('Agreements to be deleted:');
    console.log('-'.repeat(80));
    for (const agreement of oldPendingAgreements) {
      const age = Math.floor((Date.now() - new Date(agreement.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      console.log(`  • ${agreement.agreementId}`);
      console.log(`    Status: ${agreement.status} | Type: ${agreement.swapType || 'N/A'}`);
      console.log(`    Created: ${agreement.createdAt} (${age} days ago)`);
      console.log(`    Seller: ${agreement.seller}`);
      console.log(`    Buyer: ${agreement.buyer || 'None'}`);
      console.log('');
    }

    if (dryRun) {
      console.log('\n🔍 DRY RUN: Would delete ' + oldPendingAgreements.length + ' agreements');
      console.log('Run without --dry-run to actually delete them.\n');
      return;
    }

    // Confirm deletion
    console.log('\n⚠️  WARNING: This will permanently delete these agreements!');
    console.log('Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Delete agreements
    let successCount = 0;
    let failCount = 0;

    console.log('🗑️  Deleting agreements...\n');

    for (const agreement of oldPendingAgreements) {
      try {
        await axios.delete(`${apiUrl}/v1/agreements/${agreement.agreementId}`);
        console.log(`  ✅ Deleted: ${agreement.agreementId}`);
        successCount++;
      } catch (error: any) {
        if (error.response?.status === 404) {
          console.log(`  ℹ️  Already deleted: ${agreement.agreementId}`);
          successCount++;
        } else {
          console.error(`  ❌ Failed: ${agreement.agreementId} - ${error.message}`);
          failCount++;
        }
      }

      // Rate limiting: wait 100ms between deletions
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ CLEANUP COMPLETE');
    console.log('='.repeat(80));
    console.log(`Successfully deleted: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log('='.repeat(80) + '\n');

  } catch (error: any) {
    console.error('\n❌ Cleanup failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options: CleanupOptions = {};

for (const arg of args) {
  if (arg.startsWith('--days=')) {
    options.daysOld = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg.startsWith('--api-url=')) {
    options.apiUrl = arg.split('=')[1];
  } else if (arg === '--help') {
    console.log(`
Usage: npm run cleanup:staging [options]

Options:
  --days=<number>    Delete agreements older than N days (default: 7)
  --dry-run          Preview what would be deleted without actually deleting
  --api-url=<url>    Custom API URL (default: staging)
  --help             Show this help message

Examples:
  npm run cleanup:staging
  npm run cleanup:staging -- --days=1
  npm run cleanup:staging -- --dry-run
  npm run cleanup:staging -- --days=3 --dry-run
    `);
    process.exit(0);
  }
}

// Run cleanup
cleanupStagingAgreements(options).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

