#!/usr/bin/env ts-node

/**
 * Pre-Deployment Validation - STAGING Environment
 * 
 * Comprehensive validation orchestrator that runs all critical tests
 * to ensure STAGING environment is production-ready before merging to master.
 * 
 * This script runs:
 * 1. Smoke Tests (8 tests) - Critical health checks
 * 2. E2E Tests (18 tests) - Complete agreement lifecycle validation
 * 
 * Usage:
 *   npm run validate:pre-deployment
 *   ts-node tests/pre-deployment/staging-validation.ts
 * 
 * Exit Codes:
 *   0 - All tests passed, production ready
 *   1 - Tests failed, DO NOT merge to master
 */

import { execSync } from 'child_process';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  testSuite: string;
  passed: boolean;
  duration: number;
  testsRun?: number;
  testsPassed?: number;
  testsFailed?: number;
  failedTests?: string[];
  error?: string;
  exitCode?: number;
}

interface ValidationReport {
  timestamp: string;
  environment: string;
  totalDuration: number;
  overallStatus: 'PASSED' | 'FAILED';
  productionReady: boolean;
  results: ValidationResult[];
  summary: {
    totalSuites: number;
    suitesPassed: number;
    suitesFailed: number;
    totalTests: number;
    testsPassed: number;
    testsFailed: number;
  };
  recommendations?: string[];
}

class PreDeploymentValidator {
  private results: ValidationResult[] = [];
  private startTime: number = 0;

  /**
   * Run complete pre-deployment validation
   */
  async runFullValidation(): Promise<ValidationReport> {
    this.startTime = Date.now();
    
    this.printHeader();
    
    // Step 1: Run smoke tests first
    console.log(chalk.blue('\n' + '='.repeat(70)));
    console.log(chalk.blue('STEP 1: SMOKE TESTS'));
    console.log(chalk.blue('='.repeat(70)));
    console.log(chalk.yellow('Running critical health checks...\n'));
    
    const smokeResult = await this.runSmokeTests();
    this.results.push(smokeResult);
    
    if (!smokeResult.passed) {
      console.log(chalk.red('\n❌ Smoke tests failed - aborting validation'));
      console.log(chalk.yellow('Fix smoke test failures before running E2E tests.\n'));
      return this.generateReport(false);
    }
    
    console.log(chalk.green('\n✅ Smoke tests passed - proceeding to E2E tests\n'));
    
    // Step 2: Run E2E tests
    console.log(chalk.blue('\n' + '='.repeat(70)));
    console.log(chalk.blue('STEP 2: END-TO-END TESTS'));
    console.log(chalk.blue('='.repeat(70)));
    console.log(chalk.yellow('Running comprehensive E2E test suite...\n'));
    
    const e2eResult = await this.runE2ETests();
    this.results.push(e2eResult);
    
    // Generate and save report
    const allPassed = this.results.every(r => r.passed);
    const report = this.generateReport(allPassed);
    
    this.printSummary(report);
    this.saveReport(report);
    
    return report;
  }

  /**
   * Run smoke tests
   */
  private async runSmokeTests(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      console.log(chalk.cyan('Executing: npm run test:staging:smoke\n'));
      
      const output = execSync('npm run test:staging:smoke', {
        stdio: 'pipe',
        encoding: 'utf-8',
        env: {
          ...process.env,
          NODE_ENV: 'staging',
          STAGING_VALIDATION: 'true'
        }
      });
      
      // Parse output for test counts
      const duration = Date.now() - startTime;
      const testCounts = this.parseSmokeTestOutput(output);
      
      console.log(output);
      
      return {
        testSuite: 'Smoke Tests',
        passed: true,
        duration,
        testsRun: testCounts.total,
        testsPassed: testCounts.passed,
        testsFailed: 0,
        exitCode: 0
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const output = error.stdout || error.stderr || '';
      const testCounts = this.parseSmokeTestOutput(output);
      
      console.log(output);
      
      return {
        testSuite: 'Smoke Tests',
        passed: false,
        duration,
        testsRun: testCounts.total,
        testsPassed: testCounts.passed,
        testsFailed: testCounts.failed,
        error: error.message,
        exitCode: error.status
      };
    }
  }

  /**
   * Run E2E tests
   */
  private async runE2ETests(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      console.log(chalk.cyan('Executing: npm run test:staging:e2e\n'));
      
      const output = execSync('npm run test:staging:e2e', {
        stdio: 'pipe',
        encoding: 'utf-8',
        env: {
          ...process.env,
          NODE_ENV: 'staging',
          STAGING_VALIDATION: 'true'
        }
      });
      
      const duration = Date.now() - startTime;
      const testCounts = this.parseE2ETestOutput(output);
      
      console.log(output);
      
      return {
        testSuite: 'E2E Tests',
        passed: true,
        duration,
        testsRun: testCounts.total,
        testsPassed: testCounts.passed,
        testsFailed: 0,
        exitCode: 0
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const output = error.stdout || error.stderr || '';
      const testCounts = this.parseE2ETestOutput(output);
      
      console.log(output);
      
      return {
        testSuite: 'E2E Tests',
        passed: false,
        duration,
        testsRun: testCounts.total,
        testsPassed: testCounts.passed,
        testsFailed: testCounts.failed,
        error: error.message,
        exitCode: error.status
      };
    }
  }

  /**
   * Parse smoke test output for test counts
   */
  private parseSmokeTestOutput(output: string): { total: number; passed: number; failed: number } {
    // Look for "Total Tests: X" and "Passed: Y" in smoke test output
    const totalMatch = output.match(/Total Tests:\s*(\d+)/i);
    const passedMatch = output.match(/Passed:\s*(\d+)/i);
    const failedMatch = output.match(/Failed:\s*(\d+)/i);
    
    return {
      total: totalMatch ? parseInt(totalMatch[1]) : 8, // Default to 8 smoke tests
      passed: passedMatch ? parseInt(passedMatch[1]) : 0,
      failed: failedMatch ? parseInt(failedMatch[1]) : 0
    };
  }

  /**
   * Parse E2E test output for test counts
   */
  private parseE2ETestOutput(output: string): { total: number; passed: number; failed: number } {
    // Look for Mocha output: "18 passing (170s)" or "1 failing"
    const passingMatch = output.match(/(\d+)\s+passing/i);
    const failingMatch = output.match(/(\d+)\s+failing/i);
    
    const passed = passingMatch ? parseInt(passingMatch[1]) : 0;
    const failed = failingMatch ? parseInt(failingMatch[1]) : 0;
    
    return {
      total: passed + failed,
      passed,
      failed
    };
  }

  /**
   * Generate validation report
   */
  private generateReport(allPassed: boolean): ValidationReport {
    const totalDuration = Date.now() - this.startTime;
    
    // Calculate summary
    const summary = {
      totalSuites: this.results.length,
      suitesPassed: this.results.filter(r => r.passed).length,
      suitesFailed: this.results.filter(r => !r.passed).length,
      totalTests: this.results.reduce((sum, r) => sum + (r.testsRun || 0), 0),
      testsPassed: this.results.reduce((sum, r) => sum + (r.testsPassed || 0), 0),
      testsFailed: this.results.reduce((sum, r) => sum + (r.testsFailed || 0), 0)
    };
    
    // Generate recommendations if tests failed
    const recommendations: string[] = [];
    if (!allPassed) {
      recommendations.push('❌ DO NOT merge to master branch');
      recommendations.push('Fix all failing tests before proceeding');
      recommendations.push('Review test logs above for specific failure details');
      
      const failedSuite = this.results.find(r => !r.passed);
      if (failedSuite?.testSuite === 'Smoke Tests') {
        recommendations.push('Smoke test failures indicate critical infrastructure issues');
        recommendations.push('Check API health, database connectivity, and Solana RPC before running E2E tests');
      }
    } else {
      recommendations.push('✅ All tests passed - STAGING is production-ready');
      recommendations.push('Safe to merge to master branch');
      recommendations.push('Proceed with production deployment');
    }
    
    return {
      timestamp: new Date().toISOString(),
      environment: 'staging',
      totalDuration,
      overallStatus: allPassed ? 'PASSED' : 'FAILED',
      productionReady: allPassed,
      results: this.results,
      summary,
      recommendations
    };
  }

  /**
   * Print header
   */
  private printHeader(): void {
    console.log(chalk.blue('\n' + '═'.repeat(70)));
    console.log(chalk.blue.bold('    PRE-DEPLOYMENT VALIDATION - STAGING ENVIRONMENT'));
    console.log(chalk.blue('═'.repeat(70)));
    console.log(chalk.yellow('\nValidating production readiness before master merge...\n'));
    console.log(chalk.white('Test Suites:'));
    console.log(chalk.white('  1. Smoke Tests (8 tests) - Critical health checks'));
    console.log(chalk.white('  2. E2E Tests (18 tests) - Complete agreement lifecycle\n'));
  }

  /**
   * Print summary
   */
  private printSummary(report: ValidationReport): void {
    console.log(chalk.blue('\n' + '═'.repeat(70)));
    console.log(chalk.blue.bold('    VALIDATION SUMMARY'));
    console.log(chalk.blue('═'.repeat(70) + '\n'));
    
    console.log(chalk.white(`Environment: ${report.environment.toUpperCase()}`));
    console.log(chalk.white(`Timestamp: ${report.timestamp}`));
    console.log(chalk.white(`Total Duration: ${(report.totalDuration / 1000).toFixed(2)}s\n`));
    
    console.log(chalk.white('Test Suites:'));
    console.log(chalk.white(`  Total: ${report.summary.totalSuites}`));
    console.log(chalk.green(`  Passed: ${report.summary.suitesPassed}`));
    console.log(report.summary.suitesFailed > 0 
      ? chalk.red(`  Failed: ${report.summary.suitesFailed}`) 
      : chalk.white(`  Failed: ${report.summary.suitesFailed}`)
    );
    
    console.log(chalk.white('\nTest Cases:'));
    console.log(chalk.white(`  Total: ${report.summary.totalTests}`));
    console.log(chalk.green(`  Passed: ${report.summary.testsPassed}`));
    console.log(report.summary.testsFailed > 0 
      ? chalk.red(`  Failed: ${report.summary.testsFailed}`) 
      : chalk.white(`  Failed: ${report.summary.testsFailed}`)
    );
    
    console.log(chalk.white('\nDetailed Results:'));
    report.results.forEach(result => {
      const status = result.passed ? chalk.green('✅ PASSED') : chalk.red('❌ FAILED');
      const duration = (result.duration / 1000).toFixed(2);
      console.log(chalk.white(`  ${result.testSuite}: ${status} (${duration}s)`));
      
      if (result.testsRun) {
        console.log(chalk.gray(`    Tests: ${result.testsPassed}/${result.testsRun} passed`));
      }
      
      if (result.error) {
        console.log(chalk.red(`    Error: ${result.error}`));
      }
    });
    
    console.log(chalk.white('\n' + '─'.repeat(70)));
    console.log(chalk.white.bold('PRODUCTION READINESS:'), report.productionReady 
      ? chalk.green.bold('✅ READY') 
      : chalk.red.bold('❌ NOT READY')
    );
    console.log(chalk.white('─'.repeat(70)));
    
    if (report.recommendations && report.recommendations.length > 0) {
      console.log(chalk.white('\nRecommendations:'));
      report.recommendations.forEach(rec => {
        console.log(chalk.white(`  ${rec}`));
      });
    }
    
    console.log(chalk.blue('\n' + '═'.repeat(70) + '\n'));
  }

  /**
   * Save report to file
   */
  private saveReport(report: ValidationReport): void {
    const reportsDir = path.join(process.cwd(), '.taskmaster', 'reports');
    
    // Ensure reports directory exists
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Save JSON report
    const jsonPath = path.join(reportsDir, 'pre-deployment-validation.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(chalk.gray(`Report saved: ${jsonPath}\n`));
    
    // Also save a markdown version
    const mdPath = path.join(reportsDir, 'pre-deployment-validation.md');
    const markdown = this.generateMarkdownReport(report);
    fs.writeFileSync(mdPath, markdown);
    console.log(chalk.gray(`Markdown report saved: ${mdPath}\n`));
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(report: ValidationReport): string {
    const status = report.productionReady ? '✅ READY' : '❌ NOT READY';
    
    return `# Pre-Deployment Validation Report

**Generated:** ${report.timestamp}  
**Environment:** ${report.environment.toUpperCase()}  
**Total Duration:** ${(report.totalDuration / 1000).toFixed(2)}s  
**Production Readiness:** ${status}

---

## Summary

- **Test Suites:** ${report.summary.suitesPassed}/${report.summary.totalSuites} passed
- **Test Cases:** ${report.summary.testsPassed}/${report.summary.totalTests} passed
- **Overall Status:** ${report.overallStatus}

---

## Test Results

${report.results.map(result => {
  const status = result.passed ? '✅ PASSED' : '❌ FAILED';
  const duration = (result.duration / 1000).toFixed(2);
  
  let details = `### ${result.testSuite}: ${status}

- **Duration:** ${duration}s`;
  
  if (result.testsRun) {
    details += `\n- **Tests:** ${result.testsPassed}/${result.testsRun} passed`;
  }
  
  if (result.error) {
    details += `\n- **Error:** ${result.error}`;
  }
  
  return details;
}).join('\n\n')}

---

## Recommendations

${report.recommendations?.map(rec => `- ${rec}`).join('\n') || 'None'}

---

## Next Steps

${report.productionReady 
  ? '✅ STAGING environment is validated and production-ready.\n- Safe to merge to master branch\n- Proceed with production deployment'
  : '❌ STAGING environment is NOT production-ready.\n- Fix all failing tests\n- Re-run validation\n- DO NOT merge to master'
}
`;
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const validator = new PreDeploymentValidator();
  
  try {
    const report = await validator.runFullValidation();
    
    // Exit with appropriate code
    process.exit(report.productionReady ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error during validation:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// Run validation if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('\n❌ Unhandled error:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}

export { PreDeploymentValidator, ValidationReport, ValidationResult };

