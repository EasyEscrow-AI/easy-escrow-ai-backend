/**
 * Agreement Data Audit Script
 * 
 * Performs comprehensive audit of existing agreement data:
 * - Validates expiry field completeness and correctness
 * - Checks for data inconsistencies
 * - Analyzes expiry time distributions
 * - Identifies data quality issues
 * 
 * Usage: npx ts-node scripts/utilities/audit-agreements.ts
 */

import { PrismaClient, AgreementStatus } from '../../src/generated/prisma';

const prisma = new PrismaClient();

interface AuditResults {
  totalAgreements: number;
  statusDistribution: Record<AgreementStatus, number>;
  expiryValidation: {
    valid: number;
    missing: number;
    pastExpiry: number;
    futureExpiry: number;
  };
  expiryDurationStats: {
    min: number;
    max: number;
    avg: number;
    median: number;
    distribution: Record<string, number>;
  };
  dataQualityIssues: Array<{
    agreementId: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  indexUsage: {
    hasExpiryIndex: boolean;
    hasStatusIndex: boolean;
    hasCompositeIndex: boolean;
  };
}

async function auditAgreements(): Promise<AuditResults> {
  console.log('🔍 Starting agreement data audit...\n');

  const results: AuditResults = {
    totalAgreements: 0,
    statusDistribution: {} as Record<AgreementStatus, number>,
    expiryValidation: {
      valid: 0,
      missing: 0,
      pastExpiry: 0,
      futureExpiry: 0,
    },
    expiryDurationStats: {
      min: Infinity,
      max: 0,
      avg: 0,
      median: 0,
      distribution: {},
    },
    dataQualityIssues: [],
    indexUsage: {
      hasExpiryIndex: false,
      hasStatusIndex: false,
      hasCompositeIndex: false,
    },
  };

  // 1. Get total count
  console.log('📊 Fetching agreement count...');
  results.totalAgreements = await prisma.agreement.count();
  console.log(`   Total agreements: ${results.totalAgreements}\n`);

  if (results.totalAgreements === 0) {
    console.log('✅ No agreements found. Database is empty.');
    return results;
  }

  // 2. Analyze status distribution
  console.log('📊 Analyzing status distribution...');
  const statusGroups = await prisma.agreement.groupBy({
    by: ['status'],
    _count: true,
  });

  statusGroups.forEach((group) => {
    results.statusDistribution[group.status] = group._count;
    console.log(`   ${group.status}: ${group._count}`);
  });
  console.log('');

  // 3. Fetch all agreements for detailed analysis
  console.log('📥 Fetching all agreements for analysis...');
  const agreements = await prisma.agreement.findMany({
    select: {
      id: true,
      agreementId: true,
      status: true,
      expiry: true,
      createdAt: true,
      updatedAt: true,
      seller: true,
      buyer: true,
      price: true,
      feeBps: true,
      settledAt: true,
      cancelledAt: true,
    },
  });

  console.log(`   Fetched ${agreements.length} agreements\n`);

  // 4. Validate expiry fields
  console.log('🔍 Validating expiry fields...');
  const now = new Date();
  const expiryDurations: number[] = [];

  agreements.forEach((agreement) => {
    // Check for missing expiry (shouldn't happen with schema constraints)
    if (!agreement.expiry) {
      results.expiryValidation.missing++;
      results.dataQualityIssues.push({
        agreementId: agreement.agreementId,
        issue: 'Missing expiry field',
        severity: 'high',
      });
      return;
    }

    // Check if expiry is in the past or future
    if (agreement.expiry < now) {
      results.expiryValidation.pastExpiry++;
    } else {
      results.expiryValidation.futureExpiry++;
    }

    // Calculate expiry duration from creation
    const durationMs = agreement.expiry.getTime() - agreement.createdAt.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    expiryDurations.push(durationHours);

    // Track duration distribution
    const durationBucket = getDurationBucket(durationHours);
    results.expiryDurationStats.distribution[durationBucket] =
      (results.expiryDurationStats.distribution[durationBucket] || 0) + 1;

    // Check for expired agreements that should be in EXPIRED status
    if (agreement.expiry < now && agreement.status !== 'EXPIRED' && 
        agreement.status !== 'SETTLED' && agreement.status !== 'CANCELLED' &&
        agreement.status !== 'REFUNDED' && agreement.status !== 'ARCHIVED') {
      results.dataQualityIssues.push({
        agreementId: agreement.agreementId,
        issue: `Agreement expired at ${agreement.expiry.toISOString()} but has status ${agreement.status}`,
        severity: 'high',
      });
    }

    // Check for illogical expiry times (very short < 1 min or extremely long > 30 days)
    if (durationHours < 0.017) { // < 1 minute
      results.dataQualityIssues.push({
        agreementId: agreement.agreementId,
        issue: `Expiry duration too short: ${durationHours.toFixed(2)} hours`,
        severity: 'medium',
      });
    } else if (durationHours > 720) { // > 30 days
      results.dataQualityIssues.push({
        agreementId: agreement.agreementId,
        issue: `Expiry duration unusually long: ${durationHours.toFixed(2)} hours`,
        severity: 'low',
      });
    }

    // Check for settled agreements with future expiry
    if (agreement.status === 'SETTLED' && agreement.expiry > now) {
      results.dataQualityIssues.push({
        agreementId: agreement.agreementId,
        issue: 'Agreement settled before expiry time',
        severity: 'low',
      });
    }

    results.expiryValidation.valid++;
  });

  console.log(`   Valid expiry fields: ${results.expiryValidation.valid}`);
  console.log(`   Missing expiry fields: ${results.expiryValidation.missing}`);
  console.log(`   Past expiry: ${results.expiryValidation.pastExpiry}`);
  console.log(`   Future expiry: ${results.expiryValidation.futureExpiry}\n`);

  // 5. Calculate expiry duration statistics
  if (expiryDurations.length > 0) {
    console.log('📈 Calculating expiry duration statistics...');
    results.expiryDurationStats.min = Math.min(...expiryDurations);
    results.expiryDurationStats.max = Math.max(...expiryDurations);
    results.expiryDurationStats.avg =
      expiryDurations.reduce((a, b) => a + b, 0) / expiryDurations.length;
    
    // Calculate median
    const sorted = [...expiryDurations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    results.expiryDurationStats.median =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

    console.log(`   Min duration: ${formatDuration(results.expiryDurationStats.min)}`);
    console.log(`   Max duration: ${formatDuration(results.expiryDurationStats.max)}`);
    console.log(`   Avg duration: ${formatDuration(results.expiryDurationStats.avg)}`);
    console.log(`   Median duration: ${formatDuration(results.expiryDurationStats.median)}\n`);

    console.log('📊 Duration distribution:');
    Object.entries(results.expiryDurationStats.distribution)
      .sort((a, b) => sortDurationBuckets(a[0], b[0]))
      .forEach(([bucket, count]) => {
        const percentage = ((count / agreements.length) * 100).toFixed(1);
        console.log(`   ${bucket.padEnd(20)}: ${count.toString().padStart(4)} (${percentage}%)`);
      });
    console.log('');
  }

  // 6. Check database indexes
  console.log('🔍 Checking database indexes...');
  try {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'agreements' 
      AND schemaname = 'public'
    `;

    results.indexUsage.hasExpiryIndex = indexes.some((idx) =>
      idx.indexname.toLowerCase().includes('expiry')
    );
    results.indexUsage.hasStatusIndex = indexes.some((idx) =>
      idx.indexname.toLowerCase().includes('status')
    );
    
    console.log(`   Expiry index: ${results.indexUsage.hasExpiryIndex ? '✅' : '❌'}`);
    console.log(`   Status index: ${results.indexUsage.hasStatusIndex ? '✅' : '❌'}`);
    console.log(`   Composite (status, expiry) index: ${results.indexUsage.hasCompositeIndex ? '✅' : '❌'}\n`);
  } catch (error) {
    console.error('   Error checking indexes:', error);
  }

  return results;
}

function getDurationBucket(hours: number): string {
  if (hours < 0.25) return '< 15 minutes';
  if (hours < 1) return '15-60 minutes';
  if (hours < 6) return '1-6 hours';
  if (hours < 12) return '6-12 hours';
  if (hours < 24) return '12-24 hours';
  if (hours < 48) return '24-48 hours';
  if (hours < 168) return '2-7 days';
  return '> 7 days';
}

function sortDurationBuckets(a: string, b: string): number {
  const order = [
    '< 15 minutes',
    '15-60 minutes',
    '1-6 hours',
    '6-12 hours',
    '12-24 hours',
    '24-48 hours',
    '2-7 days',
    '> 7 days',
  ];
  return order.indexOf(a) - order.indexOf(b);
}

function formatDuration(hours: number): string {
  if (hours < 1) {
    return `${(hours * 60).toFixed(1)} minutes`;
  } else if (hours < 24) {
    return `${hours.toFixed(1)} hours`;
  } else {
    return `${(hours / 24).toFixed(1)} days`;
  }
}

function printSummary(results: AuditResults): void {
  console.log('═══════════════════════════════════════════════════');
  console.log('                  AUDIT SUMMARY                     ');
  console.log('═══════════════════════════════════════════════════\n');

  console.log(`📊 Total Agreements: ${results.totalAgreements}`);
  console.log(`✅ Valid Expiry Fields: ${results.expiryValidation.valid}`);
  console.log(`⚠️  Data Quality Issues: ${results.dataQualityIssues.length}\n`);

  if (results.dataQualityIssues.length > 0) {
    console.log('🚨 Data Quality Issues:');
    
    // Group by severity
    const highSeverity = results.dataQualityIssues.filter((i) => i.severity === 'high');
    const mediumSeverity = results.dataQualityIssues.filter((i) => i.severity === 'medium');
    const lowSeverity = results.dataQualityIssues.filter((i) => i.severity === 'low');

    if (highSeverity.length > 0) {
      console.log(`\n   🔴 High Severity (${highSeverity.length}):`);
      highSeverity.slice(0, 10).forEach((issue) => {
        console.log(`      - ${issue.agreementId}: ${issue.issue}`);
      });
      if (highSeverity.length > 10) {
        console.log(`      ... and ${highSeverity.length - 10} more`);
      }
    }

    if (mediumSeverity.length > 0) {
      console.log(`\n   🟡 Medium Severity (${mediumSeverity.length}):`);
      mediumSeverity.slice(0, 5).forEach((issue) => {
        console.log(`      - ${issue.agreementId}: ${issue.issue}`);
      });
      if (mediumSeverity.length > 5) {
        console.log(`      ... and ${mediumSeverity.length - 5} more`);
      }
    }

    if (lowSeverity.length > 0) {
      console.log(`\n   🟢 Low Severity (${lowSeverity.length}):`);
      lowSeverity.slice(0, 3).forEach((issue) => {
        console.log(`      - ${issue.agreementId}: ${issue.issue}`);
      });
      if (lowSeverity.length > 3) {
        console.log(`      ... and ${lowSeverity.length - 3} more`);
      }
    }
    console.log('');
  }

  console.log('💡 Recommendations:');
  
  if (results.totalAgreements === 0) {
    console.log('   - Database is empty, ready for new feature implementation');
  } else {
    if (results.expiryValidation.missing > 0) {
      console.log('   - Fix missing expiry fields before deploying new features');
    }
    
    if (results.dataQualityIssues.filter((i) => i.severity === 'high').length > 0) {
      console.log('   - Address high-severity data quality issues immediately');
    }

    if (!results.indexUsage.hasCompositeIndex) {
      console.log('   - Add composite (status, expiry) index for batch processing optimization');
    }

    if (results.expiryDurationStats.max > 24) {
      console.log(`   - Current max expiry duration: ${formatDuration(results.expiryDurationStats.max)}`);
      console.log('   - New feature will support up to 24 hours');
    }
  }

  console.log('\n═══════════════════════════════════════════════════\n');
}

// Main execution
async function main() {
  try {
    const results = await auditAgreements();
    
    // Print summary
    printSummary(results);

    // Save full results to JSON file
    const fs = require('fs');
    const path = require('path');
    const outputDir = path.join(__dirname, '../../temp');
    const outputPath = path.join(outputDir, `agreement-audit-${Date.now()}.json`);
    
    // Ensure temp directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`📄 Full audit results saved to: ${outputPath}\n`);

  } catch (error) {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

