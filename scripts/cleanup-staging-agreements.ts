#!/usr/bin/env ts-node
/**
 * Cleanup Script for Staging Environment
 * 
 * Archives (or optionally deletes) old test agreements stuck in PENDING status.
 * Useful for cleaning up after failed/interrupted E2E tests.
 * 
 * DEFAULT BEHAVIOR: Archives agreements (status → ARCHIVED) to preserve audit trail.
 * Archived agreements are excluded from monitoring but preserved for analysis.
 * 
 * Usage:
 *   npm run staging:cleanup                    # Archive agreements older than 7 days
 *   npm run staging:cleanup -- --days=1        # Archive agreements older than 1 day
 *   npm run staging:cleanup -- --dry-run       # Preview what would be archived
 *   npm run staging:cleanup -- --delete        # Permanently delete (use with caution!)
 */

import axios from 'axios';

interface CleanupOptions {
  daysOld?: number;
  dryRun?: boolean;
  apiUrl?: string;
  deleteMode?: boolean; // When true, permanently DELETE instead of ARCHIVE
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
    deleteMode = false,
    apiUrl = 'https://easyescrow-backend-staging-mwx9s.ondigitalocean.app'
  } = options;

  console.log('\n' + '='.repeat(80));
  console.log('🧹 STAGING AGREEMENT CLEANUP');
  console.log('='.repeat(80));
  console.log(`API URL: ${apiUrl}`);
  console.log(`Target: PENDING agreements older than ${daysOld} days`);
  console.log(`Action: ${deleteMode ? 'DELETE (permanent)' : 'ARCHIVE (preserved for audit)'}`);
  console.log(`Dry Run: ${dryRun ? 'YES (no changes)' : 'NO (will modify)'}`);
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
      console.log(`\n🔍 DRY RUN: Would ${deleteMode ? 'delete' : 'archive'} ${oldPendingAgreements.length} agreements`);
      console.log(`Run without --dry-run to actually ${deleteMode ? 'delete' : 'archive'} them.\n`);
      return;
    }

    // Confirm action
    if (deleteMode) {
      console.log('\n⚠️  WARNING: DELETE MODE - This will PERMANENTLY DELETE these agreements!');
    } else {
      console.log('\n📦 ARCHIVE MODE: Agreements will be marked as ARCHIVED (preserved for audit)');
    }
    console.log('Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    let successCount = 0;
    let failCount = 0;

    if (deleteMode) {
      // DELETE MODE: Permanently remove agreements
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
    } else {
      // ARCHIVE MODE: Mark as ARCHIVED (default, preserves for audit)
      console.log('📦 Archiving agreements...\n');

      const agreementIds = oldPendingAgreements.map(a => a.agreementId);
      const reason = `Auto-archived by cleanup script: PENDING agreements older than ${daysOld} days`;

      // Archive in batches of 100 (API limit)
      const batchSize = 100;
      for (let i = 0; i < agreementIds.length; i += batchSize) {
        const batch = agreementIds.slice(i, i + batchSize);
        
        try {
          const response = await axios.post(`${apiUrl}/v1/agreements/archive`, {
            agreementIds: batch,
            reason
          });

          if (response.data.success) {
            const archived = response.data.data.archived;
            successCount += archived;
            console.log(`  ✅ Archived batch ${Math.floor(i / batchSize) + 1}: ${archived} agreements`);
            
            // Log individual IDs for this batch
            batch.forEach(id => {
              console.log(`     • ${id}`);
            });
          }
        } catch (error: any) {
          console.error(`  ❌ Failed batch ${Math.floor(i / batchSize) + 1}:`, error.response?.data?.message || error.message);
          failCount += batch.length;
        }

        // Rate limiting between batches
        if (i + batchSize < agreementIds.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ CLEANUP COMPLETE');
    console.log('='.repeat(80));
    console.log(`Successfully ${deleteMode ? 'deleted' : 'archived'}: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    if (!deleteMode && successCount > 0) {
      console.log(`\nℹ️  Archived agreements are preserved in database with ARCHIVED status`);
      console.log(`   They can be reviewed for audit/analysis purposes but won't be monitored`);
    }
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
  } else if (arg === '--delete') {
    options.deleteMode = true;
  } else if (arg.startsWith('--api-url=')) {
    options.apiUrl = arg.split('=')[1];
  } else if (arg === '--help') {
    console.log(`
Usage: npm run staging:cleanup [options]

IMPORTANT: By default, this script ARCHIVES old agreements (preserves for audit).
Use --delete flag only if you need to permanently remove them.

Options:
  --days=<number>    Target agreements older than N days (default: 7)
  --dry-run          Preview what would be changed without making changes
  --delete           PERMANENTLY DELETE instead of ARCHIVE (use with caution!)
  --api-url=<url>    Custom API URL (default: staging)
  --help             Show this help message

Behavior:
  • Default: Archives PENDING agreements older than threshold (status → ARCHIVED)
  • With --delete: Permanently removes agreements from database

Examples:
  # Archive old PENDING agreements (safe, default)
  npm run staging:cleanup

  # Preview what would be archived (no changes)
  npm run staging:cleanup -- --dry-run

  # Archive agreements older than 1 day
  npm run staging:cleanup -- --days=1

  # Preview with custom threshold
  npm run staging:cleanup -- --days=3 --dry-run

  # Permanently delete (use with extreme caution!)
  npm run staging:cleanup -- --delete --days=7

Why Archive Instead of Delete?
  • Preserves failed test data for analysis
  • Maintains audit trail of test failures
  • Allows investigation of bugs/issues
  • Can query archived agreements for debugging
  • Archived agreements are excluded from monitoring service
    `);
    process.exit(0);
  }
}

// Run cleanup
cleanupStagingAgreements(options).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

