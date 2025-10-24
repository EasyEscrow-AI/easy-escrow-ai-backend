/**
 * Migration Test Suite Runner
 * 
 * Main entry point for running migration tests on STAGING environment
 */

import { MigrationTester, MigrationResult } from './migration-test-framework';
import {
  allTests,
  lowRiskTests,
  mediumRiskTests,
  highRiskTests,
} from './migration-test-scenarios';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Test suite options
 */
interface TestSuiteOptions {
  riskLevels?: ('low' | 'medium' | 'high')[];
  stopOnFailure?: boolean;
  generateReport?: boolean;
  reportPath?: string;
}

/**
 * Run migration test suite
 */
async function runMigrationTestSuite(options: TestSuiteOptions = {}) {
  const {
    riskLevels = ['low', 'medium', 'high'],
    stopOnFailure = false,
    generateReport = true,
    reportPath = path.join(process.cwd(), 'reports', 'migration-tests'),
  } = options;

  console.log('\n' + '='.repeat(80));
  console.log('STAGING MIGRATION TEST SUITE');
  console.log('='.repeat(80) + '\n');

  // Validate environment
  if (!process.env.STAGING_DATABASE_URL && !process.env.DATABASE_URL) {
    console.error('❌ ERROR: No database URL configured');
    console.error('   Set STAGING_DATABASE_URL or DATABASE_URL environment variable');
    process.exit(1);
  }

  const databaseUrl = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
  
  // Validate this is STAGING environment
  if (!databaseUrl?.includes('staging') && !databaseUrl?.includes('test')) {
    console.error('⚠️  WARNING: Database URL does not appear to be STAGING or TEST environment');
    console.error('   URL: ' + databaseUrl?.substring(0, 50) + '...');
    console.error('\n❌ Aborting to prevent accidental production data modification');
    process.exit(1);
  }

  console.log('✅ Environment validated');
  console.log(`   Database: ${databaseUrl?.substring(0, 50)}...`);
  console.log(`   Risk levels to test: ${riskLevels.join(', ')}`);
  console.log(`   Stop on failure: ${stopOnFailure}`);
  console.log('');

  // Select tests based on risk levels
  let testsToRun = [];
  if (riskLevels.includes('low')) {
    testsToRun.push(...lowRiskTests);
  }
  if (riskLevels.includes('medium')) {
    testsToRun.push(...mediumRiskTests);
  }
  if (riskLevels.includes('high')) {
    testsToRun.push(...highRiskTests);
  }

  console.log(`📋 Running ${testsToRun.length} migration tests...`);
  console.log('');

  // Initialize tester
  const tester = new MigrationTester({
    databaseUrl: databaseUrl!,
    backupDirectory: path.join(process.cwd(), 'backups', 'migrations'),
    enableBackups: true,
    enableRollbackTests: true,
    timeoutMs: 60000,
  });

  // Run tests
  const results: MigrationResult[] = [];
  
  try {
    for (const test of testsToRun) {
      const result = await tester.testMigration(test);
      results.push(result);

      // Stop on failure if configured
      if (!result.success && stopOnFailure) {
        console.log('\n⚠️  Stopping test suite due to failure (stopOnFailure=true)');
        break;
      }
    }
  } finally {
    await tester.cleanup();
  }

  // Generate report
  if (generateReport) {
    await generateTestReport(results, reportPath);
  }

  // Print final summary
  printFinalSummary(results);

  // Exit with appropriate code
  const allPassed = results.every(r => r.success);
  process.exit(allPassed ? 0 : 1);
}

/**
 * Generate test report
 */
async function generateTestReport(results: MigrationResult[], reportPath: string): Promise<void> {
  try {
    // Ensure report directory exists
    if (!fs.existsSync(reportPath)) {
      fs.mkdirSync(reportPath, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(reportPath, `migration-test-report-${timestamp}.json`);
    const markdownFile = path.join(reportPath, `migration-test-report-${timestamp}.md`);

    // Generate JSON report
    const jsonReport = {
      timestamp: new Date().toISOString(),
      environment: {
        databaseUrl: (process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || '').substring(0, 50) + '...',
        nodeVersion: process.version,
      },
      summary: {
        total: results.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      },
      results: results.map(r => ({
        name: r.migrationName,
        riskLevel: r.riskLevel,
        success: r.success,
        duration: r.duration,
        backupPath: r.backupPath,
        integrityChecksPassed: r.integrityChecksPassed,
        rollbackTested: r.rollbackTested,
        rollbackSuccess: r.rollbackSuccess,
        error: r.error?.message,
        logs: r.logs,
      })),
    };

    fs.writeFileSync(reportFile, JSON.stringify(jsonReport, null, 2));
    console.log(`\n📄 JSON report generated: ${reportFile}`);

    // Generate Markdown report
    const markdownReport = generateMarkdownReport(jsonReport);
    fs.writeFileSync(markdownFile, markdownReport);
    console.log(`📄 Markdown report generated: ${markdownFile}`);

  } catch (error) {
    console.error('❌ Failed to generate report:', error);
  }
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(report: any): string {
  const { summary, results, timestamp, environment } = report;
  
  let markdown = `# Migration Test Report\n\n`;
  markdown += `**Generated:** ${timestamp}\n`;
  markdown += `**Environment:** ${environment.databaseUrl}\n`;
  markdown += `**Node Version:** ${environment.nodeVersion}\n\n`;
  
  markdown += `## Summary\n\n`;
  markdown += `- **Total Tests:** ${summary.total}\n`;
  markdown += `- **Passed:** ✅ ${summary.passed}\n`;
  markdown += `- **Failed:** ❌ ${summary.failed}\n`;
  markdown += `- **Total Duration:** ${(summary.totalDuration / 1000).toFixed(2)}s\n\n`;
  
  markdown += `## Test Results\n\n`;
  
  results.forEach((result: any, index: number) => {
    const icon = result.success ? '✅' : '❌';
    const duration = (result.duration / 1000).toFixed(2);
    
    markdown += `### ${index + 1}. ${icon} ${result.name}\n\n`;
    markdown += `- **Risk Level:** ${result.riskLevel.toUpperCase()}\n`;
    markdown += `- **Duration:** ${duration}s\n`;
    markdown += `- **Integrity Checks:** ${result.integrityChecksPassed ? '✅ Passed' : '❌ Failed'}\n`;
    markdown += `- **Rollback Test:** ${result.rollbackSuccess ? '✅ Passed' : '❌ Failed'}\n`;
    
    if (result.backupPath) {
      markdown += `- **Backup:** \`${result.backupPath}\`\n`;
    }
    
    if (result.error) {
      markdown += `\n**Error:**\n\`\`\`\n${result.error}\n\`\`\`\n`;
    }
    
    markdown += `\n`;
  });
  
  return markdown;
}

/**
 * Print final summary
 */
function printFinalSummary(results: MigrationResult[]): void {
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('\n' + '='.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`Passed: ✅ ${passed}`);
  console.log(`Failed: ❌ ${failed}`);
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log('\n⚠️  FAILURES DETECTED:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`   - ${r.migrationName} (${r.riskLevel})`);
        if (r.error) {
          console.log(`     Error: ${r.error.message}`);
        }
      });
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Main execution
 */
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: TestSuiteOptions = {};

  if (args.includes('--low-only')) {
    options.riskLevels = ['low'];
  } else if (args.includes('--medium-only')) {
    options.riskLevels = ['medium'];
  } else if (args.includes('--high-only')) {
    options.riskLevels = ['high'];
  } else if (args.includes('--no-high')) {
    options.riskLevels = ['low', 'medium'];
  }

  if (args.includes('--stop-on-failure')) {
    options.stopOnFailure = true;
  }

  if (args.includes('--no-report')) {
    options.generateReport = false;
  }

  runMigrationTestSuite(options).catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

export { runMigrationTestSuite };

