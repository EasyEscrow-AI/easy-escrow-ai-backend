# Pre-Deployment Validation

## Overview

This directory contains the pre-deployment validation infrastructure for ensuring STAGING environment is production-ready before merging to master branch.

## Files

### `staging-validation.ts`
Main orchestrator that runs comprehensive validation:
- Executes smoke tests
- Executes E2E tests
- Generates detailed reports
- Returns appropriate exit codes

## Usage

### Run Complete Validation

```bash
# Using npm script (recommended)
npm run validate:pre-deployment

# Direct execution
ts-node tests/pre-deployment/staging-validation.ts

# Using PowerShell wrapper
.\scripts\deployment\pre-deployment-validation.ps1
```

### Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| `0` | ✅ All tests passed | Safe to merge to master |
| `1` | ❌ Tests failed | Fix failures, DO NOT merge |

## What Gets Validated

### 1. Smoke Tests (8 Tests)
Located in: `scripts/testing/smoke-tests.ts`

Critical health checks:
- API Health Check
- API Version Check
- API Authentication
- Solana RPC Connection
- Program Account Verification
- Database Connectivity
- Redis Connectivity
- CORS Configuration

**Duration:** ~30-60 seconds

### 2. E2E Tests (18 Tests)
Located in: `tests/staging/e2e/staging-all-e2e.test.ts`

Comprehensive scenarios:
1. Happy Path - Complete NFT-for-USDC swap (11 tests)
2. Agreement Expiry & Refund (2 tests)
3. Admin Cancellation (1 test)
4. Zero-Fee Transactions (1 test)
5. Idempotency Handling (1 test)
6. Concurrent Operations (1 test)
7. Edge Cases & Validation (3 tests)

**Duration:** ~170 seconds (~3 minutes)

**Total Time:** ~4-5 minutes

## Output

### Console Output
Real-time progress with color-coded results:
- 🔵 Blue: Headers and sections
- 🟢 Green: Passed tests
- 🔴 Red: Failed tests
- 🟡 Yellow: Warnings and info

### Generated Reports

Two reports are automatically saved:

#### 1. JSON Report
**Path:** `.taskmaster/reports/pre-deployment-validation.json`

Structured data for programmatic access:
```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "environment": "staging",
  "totalDuration": 245670,
  "overallStatus": "PASSED",
  "productionReady": true,
  "results": [...],
  "summary": {...},
  "recommendations": [...]
}
```

#### 2. Markdown Report
**Path:** `.taskmaster/reports/pre-deployment-validation.md`

Human-readable report with:
- Executive summary
- Detailed test results
- Recommendations
- Next steps

## Integration

### DigitalOcean App Platform

Add to `staging-app.yaml`:

```yaml
jobs:
  - name: pre-deployment-validation
    kind: PRE_DEPLOY
    run_command: npm run validate:pre-deployment
    # ... other config
```

See [PRE_DEPLOYMENT_VALIDATION.md](../../docs/deployment/PRE_DEPLOYMENT_VALIDATION.md) for complete integration guide.

## Class: PreDeploymentValidator

Main validator class with methods:

### `runFullValidation(): Promise<ValidationReport>`
Orchestrates complete validation suite.

**Returns:** Comprehensive validation report

**Throws:** Error on fatal failures

### Private Methods

- `runSmokeTests()` - Execute smoke test suite
- `runE2ETests()` - Execute E2E test suite
- `parseSmokeTestOutput(output)` - Extract test counts from smoke test output
- `parseE2ETestOutput(output)` - Extract test counts from E2E test output
- `generateReport(allPassed)` - Create comprehensive validation report
- `printHeader()` - Display validation header
- `printSummary(report)` - Display validation summary
- `saveReport(report)` - Save reports to disk
- `generateMarkdownReport(report)` - Generate markdown version

## Interfaces

### `ValidationResult`
Single test suite result:
```typescript
{
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
```

### `ValidationReport`
Complete validation report:
```typescript
{
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
```

## Environment Variables

The validator uses these environment variables:

```bash
NODE_ENV=staging              # Set environment
STAGING_VALIDATION=true       # Flag for validation mode
STAGING_API_URL=...          # Staging API URL
STAGING_RPC_URL=...          # Solana RPC URL
STAGING_PROGRAM_ID=...       # Program ID
```

## Error Handling

### Smoke Tests Fail
- E2E tests are NOT executed
- Validation fails immediately
- Report shows smoke test failures

### E2E Tests Fail
- Smoke tests must pass first
- Validation fails
- Report shows E2E test failures

### Fatal Errors
- Unhandled exceptions
- Exit code 1
- Error message displayed

## Best Practices

1. **Always run before merging** staging → master
2. **Review reports** in `.taskmaster/reports/`
3. **Investigate failures** before retrying
4. **Don't ignore warnings** - they indicate potential issues
5. **Archive reports** for historical reference
6. **Monitor trends** - track validation duration over time

## Troubleshooting

### Validation Hangs
- Check service health endpoints
- Verify environment variables
- Check network connectivity

### Tests Fail Unexpectedly
- Review individual test logs
- Run tests individually with verbose flag
- Check recent code changes
- Verify test data is current

### Reports Not Generated
- Check `.taskmaster/reports/` directory exists
- Verify write permissions
- Check disk space

## Related Documentation

- [Pre-Deployment Validation Guide](../../docs/deployment/PRE_DEPLOYMENT_VALIDATION.md) - Complete guide
- [Smoke Tests](../staging/smoke/README.md) - Smoke test details
- [E2E Tests](../staging/e2e/README.md) - E2E test details
- [STAGING Deployment](../../docs/deployment/STAGING_DEPLOYMENT_GUIDE.md) - Deployment guide

## Development

### Adding New Validation Steps

To add new validation steps:

1. Add method to `PreDeploymentValidator` class
2. Call method in `runFullValidation()`
3. Return `ValidationResult` object
4. Update documentation

Example:
```typescript
private async runSecurityTests(): Promise<ValidationResult> {
  const startTime = Date.now();
  
  try {
    execSync('npm run security:test', { stdio: 'pipe' });
    
    return {
      testSuite: 'Security Tests',
      passed: true,
      duration: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      testSuite: 'Security Tests',
      passed: false,
      duration: Date.now() - startTime,
      error: error.message
    };
  }
}
```

### Testing Changes

Test validator locally:
```bash
# Run full validation
npm run validate:pre-deployment

# Check exit code
echo $?  # 0 = passed, 1 = failed
```

## Version History

- **v1.0.0** (2025-01-15) - Initial implementation
  - Smoke test integration
  - E2E test integration
  - Automated reporting
  - DO App Platform support

---

**Last Updated:** 2025-01-15

