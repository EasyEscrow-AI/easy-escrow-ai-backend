# Pre-Deployment Validation Guide

## Overview

Pre-deployment validation is a critical step before merging STAGING to master branch. This comprehensive validation ensures the STAGING environment is production-ready by running all smoke tests and E2E tests.

## What Gets Validated

### 1. Smoke Tests (8 Tests)
Critical health checks that verify infrastructure is working:

- ✅ **API Health Check** - Verify API is responding
- ✅ **API Version Check** - Confirm correct version is deployed
- ✅ **API Authentication** - Verify auth middleware is working
- ✅ **Solana RPC Connection** - Test devnet connectivity
- ✅ **Program Account Verification** - Confirm program is deployed
- ✅ **Database Connectivity** - Verify PostgreSQL connection
- ✅ **Redis Connectivity** - Verify Redis connection
- ✅ **CORS Configuration** - Validate CORS headers

**Duration:** ~30-60 seconds

### 2. E2E Tests (18 Tests, 7 Scenarios)
Comprehensive end-to-end validation of all workflows:

1. **Happy Path (11 tests)** - Complete NFT-for-USDC swap with settlement
2. **Agreement Expiry (2 tests)** - Automatic expiry and refund handling
3. **Admin Cancellation (1 test)** - Admin-initiated cancellation workflow
4. **Zero-Fee Transactions (1 test)** - Edge case of agreements with zero platform fees
5. **Idempotency Handling (1 test)** - Duplicate request prevention
6. **Concurrent Operations (1 test)** - Race condition and isolation testing
7. **Edge Cases & Validation (3 tests)** - Error handling and input validation

**Duration:** ~170 seconds (~3 minutes)

**Total Validation Time:** ~4-5 minutes

---

## Usage

### Method 1: NPM Script (Recommended)

```bash
# Run complete validation
npm run validate:pre-deployment

# Returns:
# Exit code 0 - All tests passed, production ready
# Exit code 1 - Tests failed, DO NOT merge
```

### Method 2: PowerShell Script

```powershell
# Run with wrapper script
.\scripts\deployment\pre-deployment-validation.ps1

# With verbose output
.\scripts\deployment\pre-deployment-validation.ps1 -Verbose
```

### Method 3: Direct Execution

```bash
# Execute TypeScript validator directly
ts-node tests/pre-deployment/staging-validation.ts
```

---

## Output and Reports

### Console Output

The validation provides real-time console output with:

```
═══════════════════════════════════════════════════════════════════
    PRE-DEPLOYMENT VALIDATION - STAGING ENVIRONMENT
═══════════════════════════════════════════════════════════════════

Validating production readiness before master merge...

Test Suites:
  1. Smoke Tests (8 tests) - Critical health checks
  2. E2E Tests (18 tests) - Complete agreement lifecycle

═══════════════════════════════════════════════════════════════════
STEP 1: SMOKE TESTS
═══════════════════════════════════════════════════════════════════
Running critical health checks...

Executing: npm run test:staging:smoke

[Smoke test output...]

✅ Smoke tests passed - proceeding to E2E tests

═══════════════════════════════════════════════════════════════════
STEP 2: END-TO-END TESTS
═══════════════════════════════════════════════════════════════════
Running comprehensive E2E test suite...

Executing: npm run test:staging:e2e

[E2E test output...]

═══════════════════════════════════════════════════════════════════
    VALIDATION SUMMARY
═══════════════════════════════════════════════════════════════════

Environment: STAGING
Timestamp: 2025-01-15T10:30:45.123Z
Total Duration: 245.67s

Test Suites:
  Total: 2
  Passed: 2
  Failed: 0

Test Cases:
  Total: 26
  Passed: 26
  Failed: 0

Detailed Results:
  Smoke Tests: ✅ PASSED (45.23s)
    Tests: 8/8 passed
  E2E Tests: ✅ PASSED (200.44s)
    Tests: 18/18 passed

──────────────────────────────────────────────────────────────────
PRODUCTION READINESS: ✅ READY
──────────────────────────────────────────────────────────────────

Recommendations:
  ✅ All tests passed - STAGING is production-ready
  Safe to merge to master branch
  Proceed with production deployment

═══════════════════════════════════════════════════════════════════
```

### Generated Reports

Two report files are automatically generated:

#### 1. JSON Report
**Location:** `.taskmaster/reports/pre-deployment-validation.json`

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "environment": "staging",
  "totalDuration": 245670,
  "overallStatus": "PASSED",
  "productionReady": true,
  "results": [
    {
      "testSuite": "Smoke Tests",
      "passed": true,
      "duration": 45230,
      "testsRun": 8,
      "testsPassed": 8,
      "testsFailed": 0
    },
    {
      "testSuite": "E2E Tests",
      "passed": true,
      "duration": 200440,
      "testsRun": 18,
      "testsPassed": 18,
      "testsFailed": 0
    }
  ],
  "summary": {
    "totalSuites": 2,
    "suitesPassed": 2,
    "suitesFailed": 0,
    "totalTests": 26,
    "testsPassed": 26,
    "testsFailed": 0
  },
  "recommendations": [
    "✅ All tests passed - STAGING is production-ready",
    "Safe to merge to master branch",
    "Proceed with production deployment"
  ]
}
```

#### 2. Markdown Report
**Location:** `.taskmaster/reports/pre-deployment-validation.md`

Human-readable markdown report with complete test results and recommendations.

---

## Integration with DigitalOcean App Platform

### Option 1: Pre-Deploy Job (Recommended)

Add a pre-deploy job to your `staging-app.yaml`:

```yaml
jobs:
  - name: pre-deployment-validation
    kind: PRE_DEPLOY
    source_dir: /
    github:
      branch: staging
      deploy_on_push: false  # Manual trigger only
    run_command: |
      echo "Running pre-deployment validation..."
      npm ci
      npm run validate:pre-deployment
    environment_slug: node-js
    envs:
      - key: NODE_ENV
        value: staging
      - key: STAGING_VALIDATION
        value: "true"
      # Add other required environment variables
      - key: STAGING_API_URL
        value: ${STAGING_API_URL}
        type: SECRET
      - key: STAGING_RPC_URL
        value: ${STAGING_RPC_URL}
        type: SECRET
      - key: STAGING_PROGRAM_ID
        value: ${STAGING_PROGRAM_ID}
        type: SECRET
```

**Note:** This is a PRE_DEPLOY job, which means:
- It runs BEFORE the actual deployment
- If validation fails, deployment is blocked
- Manual trigger recommended to avoid accidental deployments

### Option 2: Manual Validation Before Merge

For maximum control:

1. **Deploy to STAGING** (automatic on push to staging branch)
2. **Wait for deployment to complete**
3. **Manually run validation:**
   ```bash
   npm run validate:pre-deployment
   ```
4. **If validation passes:**
   - Merge staging → master
   - Trigger production deployment

### Option 3: Post-Deploy Hook

Add validation as a post-deploy hook:

```yaml
services:
  - name: backend
    # ... other config ...
    run_command: node dist/index.js
    http_port: 3000
    
    # Post-deploy validation
    health_check:
      http_path: /health
      initial_delay_seconds: 30
      period_seconds: 10
      timeout_seconds: 5
      success_threshold: 1
      failure_threshold: 3
    
    # Run validation after deployment
    post_deploy:
      run_command: |
        npm run validate:pre-deployment || echo "Validation failed - review logs"
```

---

## CI/CD Integration (DigitalOcean Native)

### Using DigitalOcean App Platform Jobs

DigitalOcean App Platform supports native job runners. Configure validation as a job:

```yaml
# staging-app.yaml
name: easyescrow-staging
region: nyc

# Main service
services:
  - name: backend
    source_dir: /
    github:
      branch: staging
      deploy_on_push: true
    build_command: npm ci && npm run build
    run_command: node dist/index.js
    http_port: 3000
    # ... environment variables ...

# Validation job (runs separately)
jobs:
  - name: staging-validation
    kind: POST_DEPLOY
    source_dir: /
    github:
      branch: staging
    run_command: |
      npm ci
      npm run validate:pre-deployment
      
      # Upload report to DO Spaces (optional)
      # doctl spaces objects put .taskmaster/reports/pre-deployment-validation.json \
      #   --space-name easyescrow-reports \
      #   --acl public-read
    environment_slug: node-js
    envs:
      # Same envs as backend service
      - key: NODE_ENV
        value: staging
```

### Trigger Validation Manually

```bash
# Using doctl CLI
doctl apps create-deployment <app-id> --wait

# Then manually trigger validation job
doctl apps run-job <app-id> <job-id>
```

---

## Workflow

### Pre-Merge Validation Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Code changes pushed to staging branch                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  2. DigitalOcean deploys to STAGING environment             │
│     (automatic on push)                                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Deployment completes successfully                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Run pre-deployment validation                           │
│     npm run validate:pre-deployment                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                ┌───────┴────────┐
                │                │
                ▼                ▼
        ┌─────────────┐  ┌─────────────┐
        │   PASSED    │  │   FAILED    │
        └──────┬──────┘  └──────┬──────┘
               │                │
               ▼                ▼
    ┌──────────────────┐  ┌──────────────────┐
    │ Safe to merge    │  │ Fix failures     │
    │ staging→master   │  │ Re-run validation│
    └──────┬───────────┘  └──────────────────┘
           │
           ▼
    ┌──────────────────┐
    │ Merge to master  │
    └──────┬───────────┘
           │
           ▼
    ┌──────────────────┐
    │ Production ready │
    └──────────────────┘
```

---

## Failure Handling

### If Smoke Tests Fail

Smoke test failures indicate critical infrastructure issues:

```
❌ Smoke Tests FAILED

Common causes:
- API not responding (check deployment status)
- Database connection failed (check connection string)
- Redis connection failed (check Redis service)
- Solana RPC not accessible (check network/API key)
- Program not deployed (check program ID)

Next steps:
1. Review smoke test output for specific failure
2. Check DigitalOcean deployment logs
3. Verify environment variables are set correctly
4. Check external service status (database, Redis, Solana RPC)
5. Fix the issue
6. Redeploy if necessary
7. Re-run validation
```

**Important:** E2E tests are NOT run if smoke tests fail to save time.

### If E2E Tests Fail

E2E test failures indicate functional issues:

```
❌ E2E Tests FAILED

Common causes:
- Agreement creation fails (check Solana program)
- Deposit transactions fail (check wallet balances)
- Settlement fails (check escrow logic)
- Database operations fail (check migrations)
- API validation fails (check request schemas)

Next steps:
1. Review E2E test output for specific failure
2. Check specific test scenario that failed
3. Run individual test for debugging:
   npm run test:staging:e2e:0X-scenario-name:verbose
4. Fix the issue (code or configuration)
5. Redeploy if necessary
6. Re-run validation
```

### Viewing Individual Test Results

```bash
# Run specific E2E test with verbose output
npm run test:staging:e2e:01-solana-nft-usdc-happy-path:verbose
npm run test:staging:e2e:02-agreement-expiry-refund:verbose
npm run test:staging:e2e:03-admin-cancellation:verbose
# ... etc

# Run smoke tests standalone
npm run test:staging:smoke

# Run all E2E tests
npm run test:staging:e2e
```

---

## Exit Codes

The validation script returns standard exit codes:

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| `0` | ✅ All tests passed | Safe to merge to master |
| `1` | ❌ Tests failed | Fix failures, DO NOT merge |

Use these exit codes in CI/CD pipelines to automatically block merges if validation fails.

---

## Best Practices

### 1. Always Run Before Merging
- **NEVER** merge staging → master without running validation
- Validation is quick (~4-5 minutes) compared to production issues

### 2. Review Reports
- Check generated reports in `.taskmaster/reports/`
- Archive reports for historical reference
- Compare reports over time to identify trends

### 3. Investigate Failures
- Don't ignore failures or retry blindly
- Understand root cause before fixing
- Update tests if behavior has legitimately changed

### 4. Keep Tests Updated
- Add new smoke tests for new critical services
- Add new E2E scenarios for new workflows
- Update test data as schema evolves

### 5. Monitor Test Performance
- Track validation duration over time
- Investigate if tests become significantly slower
- Optimize slow tests without sacrificing coverage

---

## Troubleshooting

### Validation Hangs or Times Out

```bash
# Check if services are running
curl https://staging-api.easyescrow.ai/health

# Check Solana RPC connectivity
solana cluster-version --url devnet

# Check environment variables
echo $STAGING_API_URL
echo $STAGING_RPC_URL
echo $STAGING_PROGRAM_ID
```

### Tests Pass Locally but Fail in CI

Common causes:
- Environment variables not set in CI
- Network restrictions
- Service timeouts due to cold starts
- Different test data

Solution:
- Verify all environment variables in DigitalOcean
- Check service logs during test execution
- Add retry logic for transient failures

### Missing Dependencies

```bash
# Ensure all dependencies are installed
npm ci

# Check for required global tools
node --version  # Should be v18+
npm --version
```

---

## Related Documentation

- [STAGING Deployment Guide](./STAGING_DEPLOYMENT_GUIDE.md)
- [Smoke Tests Documentation](../testing/SMOKE_TESTS.md)
- [E2E Tests Documentation](../testing/E2E_TESTS.md)
- [DigitalOcean Deployment](./DIGITALOCEAN_DEPLOYMENT.md)

---

## Version History

- **v1.0.0** (2025-01-15) - Initial pre-deployment validation system
  - Smoke tests integration
  - E2E tests integration
  - Automated reporting
  - DigitalOcean App Platform integration

---

## Support

For issues with pre-deployment validation:

1. Check troubleshooting section above
2. Review validation reports in `.taskmaster/reports/`
3. Check individual test documentation
4. Review DigitalOcean deployment logs
5. Check service health endpoints

---

**Remember:** Pre-deployment validation is your last line of defense before production. Take failures seriously and investigate thoroughly.

