# Security Testing Framework

Comprehensive security testing suite for the Easy Escrow AI Backend platform, covering API security, blockchain security, dependency vulnerabilities, and penetration testing.

## Overview

This security testing framework provides automated and manual security testing capabilities for the STAGING and PRODUCTION environments. It includes:

1. **API & Infrastructure Security Tests** - Rate limiting, CORS, input validation, SQL injection, XSS, authentication, authorization
2. **Blockchain Security Tests** - PDA security, admin controls, signer validation, reentrancy, integer overflow
3. **Dependency & Secret Scanning** - npm audit, cargo audit, secret exposure, outdated dependencies
4. **Penetration Testing** - Settlement manipulation, fund theft, race conditions, replay attacks, privilege escalation

## Quick Start

### Run All Security Tests

```bash
# For STAGING environment
npm run security:test

# Or with specific environment
npx ts-node scripts/testing/security/run-all-security-tests.ts staging
```

### Run Individual Test Suites

```bash
# API Security Tests
npx ts-node tests/security/api-security-tests.ts https://staging-api.easyescrow.ai

# Blockchain Security Tests
npx ts-node tests/security/blockchain-security-tests.ts https://api.devnet.solana.com EscrowProgramId11111111111111111111111111111

# Dependency Scanning
pwsh scripts/testing/security/run-security-scans.ps1 -Environment staging

# Penetration Tests
npx ts-node tests/security/penetration-tests.ts https://staging-api.easyescrow.ai
```

## Test Suites

### 1. API & Infrastructure Security

**File:** `tests/security/api-security-tests.ts`

**Tests:**
- Rate Limiting Effectiveness
- CORS Configuration Security
- Input Validation and Sanitization
- SQL Injection Prevention
- Cross-Site Scripting (XSS) Prevention
- Authentication Bypass Prevention
- Authorization and Access Control
- Environment Variable Exposure
- Error Message Information Leakage
- CSRF Protection

**Usage:**
```bash
npx ts-node tests/security/api-security-tests.ts [BASE_URL] [OUTPUT_PATH]
```

**Exit Codes:**
- `0` - All tests passed
- `1` - Critical or high severity issues found

### 2. Blockchain Security

**File:** `tests/security/blockchain-security-tests.ts`

**Tests:**
- Unauthorized Program Access Prevention
- PDA Derivation Security
- Admin Function Authorization
- Transaction Signer Validation
- Account Ownership Validation
- Race Condition Prevention
- Reentrancy Attack Prevention
- Integer Overflow/Underflow Protection
- PDA Bump Collision Prevention
- Cross-Program Invocation (CPI) Security

**Usage:**
```bash
npx ts-node tests/security/blockchain-security-tests.ts [RPC_URL] [PROGRAM_ID] [WALLET_PATH] [OUTPUT_PATH]
```

**Environment Variables:**
- `SOLANA_RPC_URL` - Solana RPC endpoint
- `PROGRAM_ID` - Escrow program ID
- `WALLET_PATH` - Path to authorized wallet keypair

### 3. Dependency & Secret Scanning

**File:** `scripts/testing/security/run-security-scans.ps1`

**Scans:**
- NPM Dependency Audit
- Cargo Dependency Audit (Rust)
- Git Secrets Scanning
- Environment Variable Exposure Check
- Outdated Dependencies Check
- TypeScript Type Safety
- License Compliance Check

**Usage:**
```powershell
.\scripts\testing\security\run-security-scans.ps1 `
  -Environment staging `
  -OutputDir temp `
  -FailOnHigh
```

**Parameters:**
- `-Environment` - Target environment (staging, production, devnet)
- `-OutputDir` - Directory for scan reports (default: temp/)
- `-FailOnHigh` - Exit with error if high/critical issues found

### 4. Penetration Testing

**File:** `tests/security/penetration-tests.ts`

**Attack Scenarios:**
- Settlement Manipulation
- Fund Theft Attempts
- Platform Fee Bypass
- Price Manipulation
- Race Condition Exploitation
- Double Spend Attack
- Replay Attack
- Signature Malleability
- Vertical Privilege Escalation
- Horizontal Privilege Escalation
- Data Tampering
- NFT Ownership Spoofing
- Resource Exhaustion DoS
- Slow Loris Attack
- Business Logic Bypass
- State Machine Violation

**Usage:**
```bash
npx ts-node tests/security/penetration-tests.ts [BASE_URL] [RPC_URL] [OUTPUT_PATH]
```

## Master Security Runner

**File:** `scripts/testing/security/run-all-security-tests.ts`

Orchestrates all security test suites and generates comprehensive security audit report.

**Features:**
- Runs all test suites sequentially
- Aggregates results from all tests
- Generates master security report (JSON)
- Creates markdown audit report
- Assesses production readiness
- Provides remediation recommendations

**Usage:**
```bash
# Run all tests
npx ts-node scripts/testing/security/run-all-security-tests.ts staging

# With custom URLs
npx ts-node scripts/testing/security/run-all-security-tests.ts staging \
  https://staging-api.easyescrow.ai \
  https://api.devnet.solana.com \
  EscrowProgramId11111111111111111111111111111
```

**Output Files:**
- `temp/security-master-report-{env}-{timestamp}.json` - Master report (JSON)
- `docs/security/STAGING_SECURITY_AUDIT.md` - Audit report (Markdown)
- Individual test suite reports in `temp/`

## Security Report Structure

### Master Report (JSON)

```json
{
  "metadata": {
    "environment": "STAGING",
    "startTime": "2025-10-24T12:00:00.000Z",
    "endTime": "2025-10-24T12:15:00.000Z",
    "duration": "15m 0s",
    "reportVersion": "1.0.0"
  },
  "summary": {
    "totalTests": 50,
    "passed": 48,
    "failed": 2,
    "criticalIssues": 0,
    "highIssues": 0,
    "mediumIssues": 2,
    "lowIssues": 0,
    "overallStatus": "PASS",
    "productionReady": true
  },
  "testSuites": {
    "apiSecurity": { ... },
    "blockchainSecurity": { ... },
    "dependencySecurity": { ... },
    "penetrationTests": { ... }
  },
  "vulnerabilities": [...],
  "recommendations": [...],
  "complianceChecklist": [...]
}
```

### Audit Report (Markdown)

Generated at `docs/security/STAGING_SECURITY_AUDIT.md` with:
- Executive summary
- Test results by suite
- Detailed vulnerabilities
- Remediation recommendations
- Production readiness checklist
- Conclusion and next steps

## Interpreting Results

### Severity Levels

- **🔴 Critical** - Immediate threat, blocks production deployment
- **🟠 High** - Serious security risk, requires prompt remediation
- **🟡 Medium** - Moderate risk, should be addressed before production
- **🔵 Low** - Minor issue, can be addressed in future releases
- **ℹ️ Info** - Informational finding, no immediate action required

### Overall Status

- **PASS** - No critical or high severity issues, production ready
- **WARNING** - High severity issues found, remediation recommended
- **FAIL** - Critical issues found, production deployment blocked

### Production Readiness

System is production ready when:
- Zero critical vulnerabilities
- Zero high severity vulnerabilities
- All compliance checklist items passed
- Security documentation complete

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Security Tests

on:
  pull_request:
    branches: [staging, main]
  schedule:
    - cron: '0 0 * * 0' # Weekly

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Install dependencies
        run: npm ci
      - name: Run security tests
        run: npm run security:test
        env:
          STAGING_API_URL: ${{ secrets.STAGING_API_URL }}
          SOLANA_RPC_URL: ${{ secrets.SOLANA_RPC_URL }}
          PROGRAM_ID: ${{ secrets.PROGRAM_ID }}
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: security-reports
          path: temp/security-*.json
```

## Best Practices

### Pre-Production Checklist

1. **Run Security Tests**
   ```bash
   npm run security:test
   ```

2. **Review Security Report**
   - Check `docs/security/STAGING_SECURITY_AUDIT.md`
   - Address all critical and high severity issues

3. **Update Dependencies**
   ```bash
   npm audit fix
   cargo update
   ```

4. **Scan for Secrets**
   ```bash
   git secrets --scan --recursive .
   ```

5. **Manual Security Review**
   - Review authentication logic
   - Verify authorization checks
   - Check for sensitive data exposure
   - Validate input sanitization

6. **Document Findings**
   - Update security documentation
   - Create tickets for remediation
   - Schedule follow-up testing

### Regular Security Maintenance

- **Weekly:** Run automated security scans
- **Monthly:** Review security logs and alerts
- **Quarterly:** Conduct penetration testing
- **Annually:** Complete security audit with external firm

## Troubleshooting

### Tests Fail to Run

**Issue:** TypeScript compilation errors
```bash
# Solution: Rebuild TypeScript
npm run build
```

**Issue:** Missing dependencies
```bash
# Solution: Install dependencies
npm install
cargo build
```

**Issue:** Connection errors
```bash
# Solution: Check network and API availability
curl -I https://staging-api.easyescrow.ai
solana cluster-version --url https://api.devnet.solana.com
```

### False Positives

Some tests may report false positives if:
- Test endpoints don't exist (404 is acceptable)
- Rate limiting is very aggressive (expected behavior)
- Authentication is correctly enforcing restrictions

Review the detailed test output to understand the context.

### Test Timeouts

If tests timeout:
```bash
# Increase timeout in test configuration
export TEST_TIMEOUT=60000  # 60 seconds
```

## Contributing

When adding new security tests:

1. Follow existing test structure
2. Include clear test descriptions
3. Add appropriate severity ratings
4. Document expected behavior
5. Include remediation guidance

## Security Contacts

- **Security Team:** security@easyescrow.ai
- **Bug Bounty:** hackerone.com/easyescrow
- **Emergency:** emergency-security@easyescrow.ai

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [Solana Security Best Practices](https://docs.solana.com/developing/programming-model/security)
- [Anchor Security](https://book.anchor-lang.com/anchor_bts/security.html)

---

**Last Updated:** 2025-10-24  
**Framework Version:** 1.0.0

