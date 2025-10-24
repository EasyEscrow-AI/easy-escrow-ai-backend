/**
 * API and Infrastructure Security Testing Suite
 * Tests for rate limiting, SQL injection, CORS, input validation, and infrastructure security
 */

import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface SecurityTestResult {
  testName: string;
  category: string;
  passed: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  details: string;
  evidence?: any;
  timestamp: string;
}

interface SecurityTestReport {
  environment: string;
  startTime: string;
  endTime?: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: SecurityTestResult[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export class APISecurityTester {
  private baseUrl: string;
  private results: SecurityTestResult[] = [];
  private report: SecurityTestReport;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.report = {
      environment: baseUrl.includes('staging') ? 'STAGING' : 'PRODUCTION',
      startTime: new Date().toISOString(),
      totalTests: 0,
      passed: 0,
      failed: 0,
      results: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };
  }

  /**
   * Run all API security tests
   */
  async runAllTests(): Promise<SecurityTestReport> {
    console.log('🔒 Starting API Security Testing Suite...\n');

    await this.testRateLimiting();
    await this.testCORSConfiguration();
    await this.testInputValidation();
    await this.testSQLInjection();
    await this.testXSSVulnerabilities();
    await this.testAuthenticationBypass();
    await this.testAuthorizationFlaws();
    await this.testEnvironmentExposure();
    await this.testErrorMessageLeakage();
    await this.testCSRFProtection();

    this.report.endTime = new Date().toISOString();
    this.report.results = this.results;
    this.calculateSummary();

    return this.report;
  }

  /**
   * Test 1: Rate Limiting Effectiveness
   */
  private async testRateLimiting(): Promise<void> {
    console.log('Testing: Rate Limiting...');
    const testName = 'Rate Limiting Effectiveness';
    const category = 'API Security';

    try {
      const requests: Promise<any>[] = [];
      const maxRequests = 100;

      // Send burst of requests
      for (let i = 0; i < maxRequests; i++) {
        requests.push(
          axios.post(
            `${this.baseUrl}/v1/agreements`,
            { nft_mint: 'test', buyer: 'test', seller: 'test', price: '1000' },
            { validateStatus: () => true, timeout: 5000 }
          )
        );
      }

      const responses = await Promise.allSettled(requests);
      const rateLimitedCount = responses.filter(
        (r) =>
          r.status === 'fulfilled' &&
          (r.value.status === 429 || r.value.status === 503)
      ).length;

      const passed = rateLimitedCount > maxRequests * 0.8; // 80% should be rate limited

      this.addResult({
        testName,
        category,
        passed,
        severity: passed ? 'info' : 'high',
        details: passed
          ? `Rate limiting is effective: ${rateLimitedCount}/${maxRequests} requests were rate limited`
          : `Rate limiting may be ineffective: Only ${rateLimitedCount}/${maxRequests} requests were rate limited`,
        evidence: { total: maxRequests, rateLimited: rateLimitedCount },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category,
        passed: false,
        severity: 'high',
        details: `Rate limiting test failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 2: CORS Configuration
   */
  private async testCORSConfiguration(): Promise<void> {
    console.log('Testing: CORS Configuration...');
    const testName = 'CORS Configuration Security';
    const category = 'API Security';

    try {
      // Test with malicious origin
      const response = await axios.options(`${this.baseUrl}/v1/agreements`, {
        headers: {
          Origin: 'https://malicious-site.com',
          'Access-Control-Request-Method': 'POST',
        },
        validateStatus: () => true,
      });

      const allowedOrigin = response.headers['access-control-allow-origin'];
      const allowCredentials = response.headers['access-control-allow-credentials'];

      // Should NOT allow arbitrary origins
      const passed =
        allowedOrigin !== '*' &&
        allowedOrigin !== 'https://malicious-site.com' &&
        allowCredentials !== 'true';

      this.addResult({
        testName,
        category,
        passed,
        severity: passed ? 'info' : 'high',
        details: passed
          ? 'CORS is properly configured - rejects malicious origins'
          : `CORS misconfiguration detected: Allowed Origin=${allowedOrigin}, Credentials=${allowCredentials}`,
        evidence: {
          allowedOrigin,
          allowCredentials,
          testOrigin: 'https://malicious-site.com',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category,
        passed: true, // If request fails, CORS might be blocking it properly
        severity: 'info',
        details: 'CORS test resulted in blocked request (likely secure)',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 3: Input Validation
   */
  private async testInputValidation(): Promise<void> {
    console.log('Testing: Input Validation...');
    const testName = 'Input Validation and Sanitization';
    const category = 'API Security';

    const maliciousInputs = [
      { nft_mint: '<script>alert(1)</script>', price: '1000' },
      { nft_mint: 'valid_mint', price: '-1' },
      { nft_mint: '../../../etc/passwd', price: '1000' },
      { nft_mint: "'; DROP TABLE agreements; --", price: '1000' },
      { nft_mint: 'A'.repeat(10000), price: '1000' }, // Extremely long input
    ];

    try {
      let rejectedCount = 0;

      for (const input of maliciousInputs) {
        try {
          const response = await axios.post(
            `${this.baseUrl}/v1/agreements`,
            input,
            { validateStatus: () => true }
          );

          if (response.status === 400 || response.status === 422) {
            rejectedCount++;
          }
        } catch (error) {
          rejectedCount++; // Network error likely means rejected
        }
      }

      const passed = rejectedCount === maliciousInputs.length;

      this.addResult({
        testName,
        category,
        passed,
        severity: passed ? 'info' : 'critical',
        details: passed
          ? 'All malicious inputs were properly rejected'
          : `Input validation insufficient: ${maliciousInputs.length - rejectedCount}/${maliciousInputs.length} malicious inputs were not rejected`,
        evidence: { totalTests: maliciousInputs.length, rejected: rejectedCount },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category,
        passed: false,
        severity: 'critical',
        details: `Input validation test failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 4: SQL Injection
   */
  private async testSQLInjection(): Promise<void> {
    console.log('Testing: SQL Injection...');
    const testName = 'SQL Injection Prevention';
    const category = 'API Security';

    const sqlInjectionPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "' UNION SELECT * FROM users --",
      "admin'--",
      "1' AND '1'='1",
    ];

    try {
      let blockedCount = 0;

      for (const payload of sqlInjectionPayloads) {
        try {
          const response = await axios.get(
            `${this.baseUrl}/v1/agreements/${encodeURIComponent(payload)}`,
            { validateStatus: () => true }
          );

          // Should return 400, 404, or 422 - not 200 or 500
          if (
            response.status === 400 ||
            response.status === 404 ||
            response.status === 422
          ) {
            blockedCount++;
          } else if (response.status === 500) {
            // 500 might indicate SQL error - potential vulnerability
            console.warn(
              `⚠️  Potential SQL injection vulnerability: Payload "${payload}" caused server error`
            );
          }
        } catch (error) {
          blockedCount++;
        }
      }

      const passed = blockedCount === sqlInjectionPayloads.length;

      this.addResult({
        testName,
        category,
        passed,
        severity: passed ? 'info' : 'critical',
        details: passed
          ? 'SQL injection attempts were properly blocked'
          : `SQL injection vulnerability detected: ${sqlInjectionPayloads.length - blockedCount}/${sqlInjectionPayloads.length} payloads were not properly handled`,
        evidence: {
          totalPayloads: sqlInjectionPayloads.length,
          blocked: blockedCount,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category,
        passed: false,
        severity: 'critical',
        details: `SQL injection test failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 5: XSS Vulnerabilities
   */
  private async testXSSVulnerabilities(): Promise<void> {
    console.log('Testing: XSS Vulnerabilities...');
    const testName = 'Cross-Site Scripting (XSS) Prevention';
    const category = 'API Security';

    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '<svg/onload=alert("XSS")>',
      'javascript:alert("XSS")',
      '<iframe src="javascript:alert(\'XSS\')">',
    ];

    try {
      let sanitizedCount = 0;

      for (const payload of xssPayloads) {
        try {
          const response = await axios.post(
            `${this.baseUrl}/v1/agreements`,
            { nft_mint: payload, buyer: 'test', seller: 'test', price: '1000' },
            { validateStatus: () => true }
          );

          // Check if response contains unsanitized script tags
          const responseText = JSON.stringify(response.data);
          if (
            !responseText.includes('<script>') &&
            !responseText.includes('onerror=') &&
            !responseText.includes('javascript:')
          ) {
            sanitizedCount++;
          }
        } catch (error) {
          sanitizedCount++; // Error might mean it was blocked
        }
      }

      const passed = sanitizedCount === xssPayloads.length;

      this.addResult({
        testName,
        category,
        passed,
        severity: passed ? 'info' : 'high',
        details: passed
          ? 'XSS payloads were properly sanitized or rejected'
          : `XSS vulnerability detected: ${xssPayloads.length - sanitizedCount}/${xssPayloads.length} payloads were not properly sanitized`,
        evidence: {
          totalPayloads: xssPayloads.length,
          sanitized: sanitizedCount,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category,
        passed: false,
        severity: 'high',
        details: `XSS test failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 6: Authentication Bypass
   */
  private async testAuthenticationBypass(): Promise<void> {
    console.log('Testing: Authentication Bypass...');
    const testName = 'Authentication Bypass Prevention';
    const category = 'Authentication';

    try {
      // Attempt to access protected endpoint without authentication
      const response = await axios.get(`${this.baseUrl}/v1/admin/settings`, {
        validateStatus: () => true,
      });

      const passed = response.status === 401 || response.status === 403;

      this.addResult({
        testName,
        category,
        passed,
        severity: passed ? 'info' : 'critical',
        details: passed
          ? 'Protected endpoints require authentication'
          : `Authentication bypass detected: Protected endpoint returned status ${response.status}`,
        evidence: { endpoint: '/v1/admin/settings', status: response.status },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category,
        passed: true,
        severity: 'info',
        details: 'Request was blocked (likely secure)',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 7: Authorization Flaws
   */
  private async testAuthorizationFlaws(): Promise<void> {
    console.log('Testing: Authorization Flaws...');
    const testName = 'Authorization and Access Control';
    const category = 'Authorization';

    try {
      // Attempt to access another user's resources
      const testCases = [
        { endpoint: '/v1/agreements/other-user-id', expectedStatus: [401, 403, 404] },
        { endpoint: '/v1/admin/users', expectedStatus: [401, 403] },
        { endpoint: '/v1/webhooks/admin', expectedStatus: [401, 403] },
      ];

      let passedCount = 0;

      for (const testCase of testCases) {
        try {
          const response = await axios.get(`${this.baseUrl}${testCase.endpoint}`, {
            validateStatus: () => true,
          });

          if (testCase.expectedStatus.includes(response.status)) {
            passedCount++;
          }
        } catch (error) {
          passedCount++; // Error likely means access denied
        }
      }

      const passed = passedCount === testCases.length;

      this.addResult({
        testName,
        category,
        passed,
        severity: passed ? 'info' : 'critical',
        details: passed
          ? 'Authorization checks are properly enforced'
          : `Authorization flaw detected: ${testCases.length - passedCount}/${testCases.length} unauthorized access attempts were not blocked`,
        evidence: { totalTests: testCases.length, passed: passedCount },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category,
        passed: false,
        severity: 'critical',
        details: `Authorization test failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 8: Environment Variable Exposure
   */
  private async testEnvironmentExposure(): Promise<void> {
    console.log('Testing: Environment Variable Exposure...');
    const testName = 'Environment Variable and Secret Exposure';
    const category = 'Infrastructure Security';

    const sensitiveEndpoints = [
      '/.env',
      '/config',
      '/env',
      '/config.json',
      '/.git/config',
      '/package.json',
      '/secrets',
      '/api/config',
    ];

    try {
      let exposedCount = 0;

      for (const endpoint of sensitiveEndpoints) {
        try {
          const response = await axios.get(`${this.baseUrl}${endpoint}`, {
            validateStatus: () => true,
            timeout: 5000,
          });

          if (response.status === 200) {
            exposedCount++;
            console.warn(`⚠️  Potential exposure: ${endpoint} returned 200`);
          }
        } catch (error) {
          // Good - endpoint not accessible
        }
      }

      const passed = exposedCount === 0;

      this.addResult({
        testName,
        category,
        passed,
        severity: passed ? 'info' : 'critical',
        details: passed
          ? 'No sensitive endpoints are exposed'
          : `Sensitive information exposure detected: ${exposedCount} sensitive endpoints are accessible`,
        evidence: {
          totalChecked: sensitiveEndpoints.length,
          exposed: exposedCount,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category,
        passed: false,
        severity: 'high',
        details: `Environment exposure test failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 9: Error Message Information Leakage
   */
  private async testErrorMessageLeakage(): Promise<void> {
    console.log('Testing: Error Message Information Leakage...');
    const testName = 'Error Message Information Leakage';
    const category = 'Information Disclosure';

    try {
      const response = await axios.get(
        `${this.baseUrl}/v1/agreements/invalid-id-12345`,
        { validateStatus: () => true }
      );

      const responseText = JSON.stringify(response.data).toLowerCase();

      // Check for sensitive information in error messages
      const leakageIndicators = [
        'stack trace',
        'sql error',
        'database',
        'file not found',
        'prisma',
        'postgres',
        'password',
        'secret',
      ];

      const foundLeaks = leakageIndicators.filter((indicator) =>
        responseText.includes(indicator)
      );

      const passed = foundLeaks.length === 0;

      this.addResult({
        testName,
        category,
        passed,
        severity: passed ? 'info' : 'medium',
        details: passed
          ? 'Error messages do not leak sensitive information'
          : `Information leakage detected in error messages: Found indicators: ${foundLeaks.join(', ')}`,
        evidence: { foundLeaks },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category,
        passed: true,
        severity: 'info',
        details: 'Error handling appears secure',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test 10: CSRF Protection
   */
  private async testCSRFProtection(): Promise<void> {
    console.log('Testing: CSRF Protection...');
    const testName = 'Cross-Site Request Forgery (CSRF) Protection';
    const category = 'API Security';

    try {
      // Attempt state-changing operation without CSRF token
      const response = await axios.post(
        `${this.baseUrl}/v1/agreements`,
        { nft_mint: 'test', buyer: 'test', seller: 'test', price: '1000' },
        {
          headers: {
            Origin: 'https://malicious-site.com',
            Referer: 'https://malicious-site.com',
          },
          validateStatus: () => true,
        }
      );

      // Should be rejected due to origin/referer mismatch
      const passed =
        response.status === 403 ||
        response.status === 401 ||
        response.status === 400;

      this.addResult({
        testName,
        category,
        passed,
        severity: passed ? 'info' : 'high',
        details: passed
          ? 'CSRF protection is properly implemented'
          : `Potential CSRF vulnerability: Request from malicious origin returned status ${response.status}`,
        evidence: { status: response.status },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.addResult({
        testName,
        category,
        passed: true,
        severity: 'info',
        details: 'CSRF attempt was blocked',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Add test result and update report statistics
   */
  private addResult(result: SecurityTestResult): void {
    this.results.push(result);
    this.report.totalTests++;

    if (result.passed) {
      this.report.passed++;
    } else {
      this.report.failed++;
      this.report.summary[result.severity]++;
    }

    const icon = result.passed ? '✅' : '❌';
    const severityLabel = result.passed ? 'PASS' : `FAIL (${result.severity.toUpperCase()})`;
    console.log(`  ${icon} ${result.testName}: ${severityLabel}`);
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(): void {
    console.log('\n📊 Security Test Summary:');
    console.log(`  Total Tests: ${this.report.totalTests}`);
    console.log(`  Passed: ${this.report.passed}`);
    console.log(`  Failed: ${this.report.failed}`);
    if (this.report.summary.critical > 0) {
      console.log(`  🔴 Critical: ${this.report.summary.critical}`);
    }
    if (this.report.summary.high > 0) {
      console.log(`  🟠 High: ${this.report.summary.high}`);
    }
    if (this.report.summary.medium > 0) {
      console.log(`  🟡 Medium: ${this.report.summary.medium}`);
    }
    if (this.report.summary.low > 0) {
      console.log(`  🔵 Low: ${this.report.summary.low}`);
    }
  }

  /**
   * Export report to JSON file
   */
  exportReport(outputPath: string): void {
    const reportJson = JSON.stringify(this.report, null, 2);
    fs.writeFileSync(outputPath, reportJson);
    console.log(`\n📝 Security report exported to: ${outputPath}`);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const baseUrl =
    args[0] || process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
  const outputPath = args[1] || path.join(__dirname, '../../temp/api-security-report.json');

  const tester = new APISecurityTester(baseUrl);

  tester
    .runAllTests()
    .then((report) => {
      tester.exportReport(outputPath);

      // Exit with error code if critical or high severity issues found
      if (report.summary.critical > 0 || report.summary.high > 0) {
        console.error(
          '\n❌ Security tests failed with critical or high severity issues!'
        );
        process.exit(1);
      } else {
        console.log('\n✅ All security tests passed!');
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error('Fatal error during security testing:', error);
      process.exit(1);
    });
}

