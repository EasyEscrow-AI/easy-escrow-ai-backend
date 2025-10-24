/**
 * Master Security Testing Runner
 * Orchestrates all security tests and generates comprehensive audit report
 */

import { APISecurityTester } from '../../../tests/security/api-security-tests';
import { BlockchainSecurityTester } from '../../../tests/security/blockchain-security-tests';
import { PenetrationTester } from '../../../tests/security/penetration-tests';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface MasterSecurityReport {
  metadata: {
    environment: string;
    startTime: string;
    endTime?: string;
    duration?: string;
    reportVersion: string;
  };
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    overallStatus: 'PASS' | 'FAIL' | 'WARNING';
    productionReady: boolean;
  };
  testSuites: {
    apiSecurity: any;
    blockchainSecurity: any;
    dependencySecurity: any;
    penetrationTests: any;
  };
  vulnerabilities: any[];
  recommendations: string[];
  complianceChecklist: {
    item: string;
    status: 'PASS' | 'FAIL' | 'N/A';
    notes?: string;
  }[];
}

class MasterSecurityRunner {
  private environment: string;
  private baseUrl: string;
  private rpcUrl: string;
  private programId: string;
  private outputDir: string;
  private report: MasterSecurityReport;

  constructor(
    environment: string = 'staging',
    baseUrl?: string,
    rpcUrl?: string,
    programId?: string
  ) {
    this.environment = environment.toLowerCase();
    this.baseUrl = baseUrl || process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
    this.rpcUrl = rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.programId = programId || process.env.PROGRAM_ID || 'EscrowProgramId11111111111111111111111111111';
    this.outputDir = path.join(__dirname, '../../../temp');

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.report = {
      metadata: {
        environment: this.environment.toUpperCase(),
        startTime: new Date().toISOString(),
        reportVersion: '1.0.0',
      },
      summary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0,
        overallStatus: 'PASS',
        productionReady: false,
      },
      testSuites: {
        apiSecurity: null,
        blockchainSecurity: null,
        dependencySecurity: null,
        penetrationTests: null,
      },
      vulnerabilities: [],
      recommendations: [],
      complianceChecklist: this.getComplianceChecklist(),
    };
  }

  /**
   * Run all security test suites
   */
  async runAllTests(): Promise<MasterSecurityReport> {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🔒 MASTER SECURITY TESTING SUITE');
    console.log(`  Environment: ${this.environment.toUpperCase()}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
      // Suite 1: API & Infrastructure Security
      await this.runAPISecurity();

      // Suite 2: Blockchain Security
      await this.runBlockchainSecurity();

      // Suite 3: Dependency & Secret Scanning
      await this.runDependencyScanning();

      // Suite 4: Penetration Testing
      await this.runPenetrationTests();

      // Generate final report
      this.calculateFinalSummary();
      this.generateRecommendations();
      this.assessProductionReadiness();

      this.report.metadata.endTime = new Date().toISOString();
      this.report.metadata.duration = this.calculateDuration();

      // Save reports
      this.saveReports();

      // Print summary
      this.printSummary();

      return this.report;
    } catch (error) {
      console.error('❌ Fatal error during security testing:', error);
      this.report.metadata.endTime = new Date().toISOString();
      this.report.summary.overallStatus = 'FAIL';
      throw error;
    }
  }

  /**
   * Run API Security Tests
   */
  private async runAPISecurity(): Promise<void> {
    console.log('\n🌐 Running API & Infrastructure Security Tests...\n');

    try {
      const apiTester = new APISecurityTester(this.baseUrl);
      const apiReport = await apiTester.runAllTests();

      this.report.testSuites.apiSecurity = apiReport;
      this.aggregateResults(apiReport);

      console.log('\n✅ API Security Tests Completed\n');
    } catch (error) {
      console.error('❌ API Security Tests Failed:', error);
      this.report.summary.failed++;
      this.report.summary.highIssues++;
    }
  }

  /**
   * Run Blockchain Security Tests
   */
  private async runBlockchainSecurity(): Promise<void> {
    console.log('\n⛓️  Running Blockchain Security Tests...\n');

    try {
      const blockchainTester = new BlockchainSecurityTester(
        this.rpcUrl,
        this.programId
      );
      const blockchainReport = await blockchainTester.runAllTests();

      this.report.testSuites.blockchainSecurity = blockchainReport;
      this.aggregateResults(blockchainReport);

      console.log('\n✅ Blockchain Security Tests Completed\n');
    } catch (error) {
      console.error('❌ Blockchain Security Tests Failed:', error);
      this.report.summary.failed++;
      this.report.summary.highIssues++;
    }
  }

  /**
   * Run Dependency Scanning
   */
  private async runDependencyScanning(): Promise<void> {
    console.log('\n📦 Running Dependency & Secret Scanning...\n');

    try {
      // Run PowerShell scanning script
      const scriptPath = path.join(
        __dirname,
        'run-security-scans.ps1'
      );

      const result = execSync(
        `pwsh -File "${scriptPath}" -Environment ${this.environment} -OutputDir ${this.outputDir}`,
        { encoding: 'utf-8', stdio: 'inherit' }
      );

      // Load the scan results
      const scanFiles = fs
        .readdirSync(this.outputDir)
        .filter(
          (f) =>
            f.startsWith(`security-scan-${this.environment}`) &&
            f.endsWith('-summary.json')
        );

      if (scanFiles.length > 0) {
        const latestScan = scanFiles.sort().reverse()[0];
        const scanData = JSON.parse(
          fs.readFileSync(path.join(this.outputDir, latestScan), 'utf-8')
        );

        this.report.testSuites.dependencySecurity = scanData;
        this.aggregateResults(scanData);
      }

      console.log('\n✅ Dependency Scanning Completed\n');
    } catch (error) {
      console.error('❌ Dependency Scanning Failed:', error);
      this.report.summary.failed++;
      this.report.summary.mediumIssues++;
    }
  }

  /**
   * Run Penetration Tests
   */
  private async runPenetrationTests(): Promise<void> {
    console.log('\n🎯 Running Penetration Tests...\n');

    try {
      const pentester = new PenetrationTester(this.baseUrl, this.rpcUrl);
      const pentestReport = await pentester.runAllTests();

      this.report.testSuites.penetrationTests = pentestReport;
      this.aggregateVulnerabilities(pentestReport.vulnerabilities);
      this.aggregateResults(pentestReport);

      console.log('\n✅ Penetration Tests Completed\n');
    } catch (error) {
      console.error('❌ Penetration Tests Failed:', error);
      this.report.summary.failed++;
      this.report.summary.highIssues++;
    }
  }

  /**
   * Aggregate results from individual test suites
   */
  private aggregateResults(suiteReport: any): void {
    if (!suiteReport) return;

    if (suiteReport.totalTests !== undefined) {
      this.report.summary.totalTests += suiteReport.totalTests;
    }

    if (suiteReport.passed !== undefined) {
      this.report.summary.passed += suiteReport.passed;
    }

    if (suiteReport.failed !== undefined) {
      this.report.summary.failed += suiteReport.failed;
    }

    if (suiteReport.summary) {
      this.report.summary.criticalIssues += suiteReport.summary.critical || 0;
      this.report.summary.highIssues += suiteReport.summary.high || 0;
      this.report.summary.mediumIssues += suiteReport.summary.medium || 0;
      this.report.summary.lowIssues += suiteReport.summary.low || 0;
    }
  }

  /**
   * Aggregate vulnerabilities
   */
  private aggregateVulnerabilities(vulnerabilities: any[]): void {
    if (!vulnerabilities) return;
    this.report.vulnerabilities.push(...vulnerabilities);
  }

  /**
   * Calculate final summary
   */
  private calculateFinalSummary(): void {
    // Determine overall status
    if (this.report.summary.criticalIssues > 0) {
      this.report.summary.overallStatus = 'FAIL';
    } else if (this.report.summary.highIssues > 0) {
      this.report.summary.overallStatus = 'WARNING';
    } else {
      this.report.summary.overallStatus = 'PASS';
    }

    // Assess production readiness
    this.report.summary.productionReady =
      this.report.summary.criticalIssues === 0 &&
      this.report.summary.highIssues === 0;
  }

  /**
   * Generate recommendations based on findings
   */
  private generateRecommendations(): void {
    const recommendations = new Set<string>();

    // Critical recommendations
    if (this.report.summary.criticalIssues > 0) {
      recommendations.add(
        '🔴 CRITICAL: Address all critical vulnerabilities before production deployment'
      );
      recommendations.add(
        '🔴 CRITICAL: Conduct security code review for affected components'
      );
    }

    // High severity recommendations
    if (this.report.summary.highIssues > 0) {
      recommendations.add(
        '🟠 HIGH: Remediate high severity issues and re-run security tests'
      );
    }

    // Medium severity recommendations
    if (this.report.summary.mediumIssues > 0) {
      recommendations.add(
        '🟡 MEDIUM: Review medium severity findings and create remediation plan'
      );
    }

    // General recommendations
    recommendations.add('✅ Implement automated security testing in CI/CD pipeline');
    recommendations.add('✅ Schedule regular penetration testing (quarterly)');
    recommendations.add('✅ Maintain security audit logs and review regularly');
    recommendations.add('✅ Update security documentation based on findings');
    recommendations.add('✅ Conduct security training for development team');

    this.report.recommendations = Array.from(recommendations);
  }

  /**
   * Assess production readiness
   */
  private assessProductionReadiness(): void {
    const checklist = this.report.complianceChecklist;

    // Update checklist based on test results
    checklist.forEach((item) => {
      if (item.item.includes('critical') && this.report.summary.criticalIssues === 0) {
        item.status = 'PASS';
      } else if (item.item.includes('high') && this.report.summary.highIssues === 0) {
        item.status = 'PASS';
      } else if (item.item.includes('dependency') && this.report.testSuites.dependencySecurity) {
        item.status = 'PASS';
      } else if (item.item.includes('penetration') && this.report.testSuites.penetrationTests) {
        item.status = 'PASS';
      }
    });
  }

  /**
   * Get compliance checklist
   */
  private getComplianceChecklist() {
    return [
      {
        item: 'No critical vulnerabilities detected',
        status: 'FAIL' as const,
        notes: 'Must be verified by security tests',
      },
      {
        item: 'No high severity vulnerabilities detected',
        status: 'FAIL' as const,
        notes: 'Must be verified by security tests',
      },
      {
        item: 'All dependencies are up to date and scanned',
        status: 'FAIL' as const,
        notes: 'Run npm audit and cargo audit',
      },
      {
        item: 'No exposed secrets or credentials in codebase',
        status: 'FAIL' as const,
        notes: 'Run git-secrets scan',
      },
      {
        item: 'API security controls validated (rate limiting, CORS, input validation)',
        status: 'FAIL' as const,
        notes: 'Run API security tests',
      },
      {
        item: 'Blockchain security validated (PDA, admin controls, signature verification)',
        status: 'FAIL' as const,
        notes: 'Run blockchain security tests',
      },
      {
        item: 'Penetration testing completed with no critical findings',
        status: 'FAIL' as const,
        notes: 'Run penetration tests',
      },
      {
        item: 'Authentication and authorization properly enforced',
        status: 'FAIL' as const,
        notes: 'Verified by security tests',
      },
      {
        item: 'Data integrity and validation mechanisms in place',
        status: 'FAIL' as const,
        notes: 'Verified by security tests',
      },
      {
        item: 'Security documentation is complete and up to date',
        status: 'N/A' as const,
        notes: 'Manual review required',
      },
    ];
  }

  /**
   * Calculate duration
   */
  private calculateDuration(): string {
    if (!this.report.metadata.endTime) return 'N/A';

    const start = new Date(this.report.metadata.startTime).getTime();
    const end = new Date(this.report.metadata.endTime).getTime();
    const durationMs = end - start;

    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    return `${minutes}m ${seconds}s`;
  }

  /**
   * Save reports to files
   */
  private saveReports(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save master report
    const masterReportPath = path.join(
      this.outputDir,
      `security-master-report-${this.environment}-${timestamp}.json`
    );
    fs.writeFileSync(masterReportPath, JSON.stringify(this.report, null, 2));
    console.log(`\n📝 Master report saved to: ${masterReportPath}`);

    // Generate markdown report
    const markdownReport = this.generateMarkdownReport();
    const markdownPath = path.join(
      __dirname,
      '../../../docs/security/STAGING_SECURITY_AUDIT.md'
    );
    fs.writeFileSync(markdownPath, markdownReport);
    console.log(`📝 Markdown report saved to: ${markdownPath}`);
  }

  /**
   * Generate markdown audit report
   */
  private generateMarkdownReport(): string {
    const report = this.report;

    return `# ${report.metadata.environment} Security Audit Report

## Executive Summary

**Report Date:** ${new Date(report.metadata.startTime).toLocaleDateString()}  
**Environment:** ${report.metadata.environment}  
**Overall Status:** ${report.summary.overallStatus}  
**Production Ready:** ${report.summary.productionReady ? '✅ YES' : '❌ NO'}

### Test Summary

- **Total Tests:** ${report.summary.totalTests}
- **Passed:** ${report.summary.passed}
- **Failed:** ${report.summary.failed}

### Vulnerabilities Summary

${report.summary.criticalIssues > 0 ? `- 🔴 **Critical:** ${report.summary.criticalIssues}` : ''}
${report.summary.highIssues > 0 ? `- 🟠 **High:** ${report.summary.highIssues}` : ''}
${report.summary.mediumIssues > 0 ? `- 🟡 **Medium:** ${report.summary.mediumIssues}` : ''}
${report.summary.lowIssues > 0 ? `- 🔵 **Low:** ${report.summary.lowIssues}` : ''}
${report.summary.criticalIssues === 0 && report.summary.highIssues === 0 && report.summary.mediumIssues === 0 && report.summary.lowIssues === 0 ? '✅ No vulnerabilities detected' : ''}

---

## Security Test Results

### 1. API & Infrastructure Security

${this.formatTestSuiteResults(report.testSuites.apiSecurity)}

### 2. Blockchain Security

${this.formatTestSuiteResults(report.testSuites.blockchainSecurity)}

### 3. Dependency & Secret Scanning

${this.formatTestSuiteResults(report.testSuites.dependencySecurity)}

### 4. Penetration Testing

${this.formatTestSuiteResults(report.testSuites.penetrationTests)}

---

## Detailed Vulnerabilities

${report.vulnerabilities.length > 0 ? report.vulnerabilities.map((v, i) => `
### Vulnerability ${i + 1}: ${v.testName}

- **Severity:** ${v.severity.toUpperCase()}
- **Category:** ${v.category}
- **Attack Vector:** ${v.attackVector}
- **Status:** ${v.passed ? 'Blocked ✅' : 'Vulnerable ❌'}
- **Details:** ${v.details}
${v.cve ? `- **CVE Reference:** ${v.cve}` : ''}
`).join('\n') : 'No vulnerabilities detected.'}

---

## Recommendations

${report.recommendations.map(r => `- ${r}`).join('\n')}

---

## Production Readiness Checklist

${report.complianceChecklist.map(item => `
- [${item.status === 'PASS' ? 'x' : ' '}] ${item.item}${item.notes ? `\n  - *${item.notes}*` : ''}`).join('\n')}

---

## Conclusion

${report.summary.productionReady ? `
The ${report.metadata.environment} environment has **PASSED** security testing with no critical or high severity vulnerabilities detected. The system is deemed **ready for production deployment** from a security perspective.

**Next Steps:**
1. Implement recommended security enhancements
2. Schedule regular security audits (quarterly)
3. Monitor security logs and alerts
4. Maintain security documentation
` : `
The ${report.metadata.environment} environment has **NOT PASSED** security testing due to ${report.summary.criticalIssues} critical and ${report.summary.highIssues} high severity issues. **Production deployment should be blocked** until these issues are resolved.

**Required Actions:**
1. Address all critical vulnerabilities immediately
2. Remediate high severity issues
3. Re-run security tests after fixes
4. Obtain security team sign-off before production deployment
`}

---

**Report Generated:** ${new Date().toISOString()}  
**Report Version:** ${report.metadata.reportVersion}
`;
  }

  /**
   * Format test suite results for markdown
   */
  private formatTestSuiteResults(suite: any): string {
    if (!suite) return 'No data available';

    return `
- **Total Tests:** ${suite.totalTests || 0}
- **Passed:** ${suite.passed || 0}
- **Failed:** ${suite.failed || 0}
${suite.summary ? `
- **Critical:** ${suite.summary.critical || 0}
- **High:** ${suite.summary.high || 0}
- **Medium:** ${suite.summary.medium || 0}
- **Low:** ${suite.summary.low || 0}
` : ''}
`;
  }

  /**
   * Print summary to console
   */
  private printSummary(): void {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  📊 FINAL SECURITY AUDIT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Environment:        ${this.report.metadata.environment}`);
    console.log(`  Overall Status:     ${this.report.summary.overallStatus}`);
    console.log(`  Production Ready:   ${this.report.summary.productionReady ? '✅ YES' : '❌ NO'}`);
    console.log(`  Duration:           ${this.report.metadata.duration}`);
    console.log('\n  Test Results:');
    console.log(`    Total Tests:      ${this.report.summary.totalTests}`);
    console.log(`    Passed:           ${this.report.summary.passed}`);
    console.log(`    Failed:           ${this.report.summary.failed}`);
    console.log('\n  Vulnerabilities:');
    if (this.report.summary.criticalIssues > 0) {
      console.log(`    🔴 Critical:      ${this.report.summary.criticalIssues}`);
    }
    if (this.report.summary.highIssues > 0) {
      console.log(`    🟠 High:          ${this.report.summary.highIssues}`);
    }
    if (this.report.summary.mediumIssues > 0) {
      console.log(`    🟡 Medium:        ${this.report.summary.mediumIssues}`);
    }
    if (this.report.summary.lowIssues > 0) {
      console.log(`    🔵 Low:           ${this.report.summary.lowIssues}`);
    }
    if (
      this.report.summary.criticalIssues === 0 &&
      this.report.summary.highIssues === 0 &&
      this.report.summary.mediumIssues === 0 &&
      this.report.summary.lowIssues === 0
    ) {
      console.log('    ✅ No vulnerabilities detected');
    }
    console.log('═══════════════════════════════════════════════════════════\n');
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const environment = args[0] || process.env.ENVIRONMENT || 'staging';
  const baseUrl = args[1] || process.env.STAGING_API_URL;
  const rpcUrl = args[2] || process.env.SOLANA_RPC_URL;
  const programId = args[3] || process.env.PROGRAM_ID;

  const runner = new MasterSecurityRunner(environment, baseUrl, rpcUrl, programId);

  runner
    .runAllTests()
    .then((report) => {
      if (!report.summary.productionReady) {
        console.error('\n❌ Security audit failed! Not ready for production.');
        process.exit(1);
      } else {
        console.log('\n✅ Security audit passed! Ready for production.');
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { MasterSecurityRunner, MasterSecurityReport };

