# Pre-Deployment Validation Execution Guide

## Overview

This guide provides step-by-step instructions for executing the pre-deployment validation process on STAGING environment before merging to master.

## Prerequisites

Before running validation, ensure:

1. ✅ **Staging Environment is Deployed**
   - STAGING branch has been deployed to DigitalOcean App Platform
   - Deployment completed successfully
   - All services are healthy

2. ✅ **Environment Variables are Set**
   ```bash
   STAGING_API_URL=https://staging-api.easyescrow.ai
   STAGING_RPC_URL=<your-solana-rpc-url>
   STAGING_PROGRAM_ID=<your-program-id>
   DATABASE_URL=<your-database-url>
   REDIS_URL=<your-redis-url>
   ```

3. ✅ **Dependencies are Installed**
   ```bash
   npm ci
   ```

4. ✅ **Services are Accessible**
   ```bash
   # Test API connectivity
   curl https://staging-api.easyescrow.ai/health

   # Should return: { "status": "ok", "database": true, "redis": true }
   ```

---

## Execution Steps

### Step 1: Verify Staging Deployment

Before running tests, verify the staging deployment is complete and healthy:

```bash
# Check deployment status in DigitalOcean
doctl apps list

# Check service health
curl https://staging-api.easyescrow.ai/health
```

**Expected Output:**
```json
{
  "status": "ok",
  "database": true,
  "redis": true,
  "uptime": 12345,
  "timestamp": "2025-01-15T10:30:45.123Z"
}
```

### Step 2: Run Smoke Tests (Optional Standalone)

Run smoke tests independently to quickly verify critical services:

```bash
# Run smoke tests
npm run test:staging:smoke
```

**Duration:** ~30-60 seconds  
**Expected:** All 8 tests should pass

**If smoke tests fail:**
- Check service logs in DigitalOcean
- Verify environment variables
- Check database and Redis connectivity
- Verify Solana RPC accessibility
- **DO NOT proceed to E2E tests** until smoke tests pass

### Step 3: Run E2E Tests (Optional Standalone)

Run E2E tests independently to test complete workflows:

```bash
# Run all E2E tests
npm run test:staging:e2e

# Or run with verbose output
npm run test:staging:e2e:verbose

# Or run individual scenarios
npm run test:staging:e2e:01-solana-nft-usdc-happy-path
npm run test:staging:e2e:02-agreement-expiry-refund
# ... etc
```

**Duration:** ~170 seconds (~3 minutes)  
**Expected:** All 18 tests should pass

### Step 4: Run Complete Pre-Deployment Validation

Run the comprehensive validation suite:

```bash
# Method 1: Using npm script (recommended)
npm run validate:pre-deployment

# Method 2: Using PowerShell wrapper
.\scripts\deployment\pre-deployment-validation.ps1

# Method 3: Direct TypeScript execution
ts-node tests/pre-deployment/staging-validation.ts
```

**Duration:** ~4-5 minutes  
**Expected:** 26 tests pass (8 smoke + 18 E2E)

**Output Example:**
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
...
✅ Smoke tests passed - proceeding to E2E tests

═══════════════════════════════════════════════════════════════════
STEP 2: END-TO-END TESTS
═══════════════════════════════════════════════════════════════════
...
✅ All tests passed - STAGING is production-ready
```

### Step 5: Review Validation Reports

Check generated reports:

```bash
# View JSON report
cat .taskmaster/reports/pre-deployment-validation.json

# View Markdown report
cat .taskmaster/reports/pre-deployment-validation.md
```

**Reports include:**
- Test suite results
- Individual test results
- Performance metrics
- Production readiness status
- Recommendations

### Step 6: Analyze Staging Commit History

Review recent changes and lessons learned:

```bash
# Analyze last 100 commits
npm run analyze:staging-commits

# Analyze more commits
npm run analyze:staging-commits -- --count 200

# Generate JSON format
npm run analyze:staging-commits:json
```

**Output:**
- `docs/deployment/STAGING_LESSONS_LEARNED.md` - Comprehensive analysis
- Commit patterns
- Hotfixes and rollbacks identified
- Frequently changed files
- Actionable recommendations

### Step 7: Make Go/No-Go Decision

Based on validation results:

#### ✅ ALL TESTS PASSED

**Next Steps:**
1. Review validation report
2. Review lessons learned from commit history
3. **Merge staging → master**:
   ```bash
   git checkout master
   git pull origin master
   git merge staging
   git push origin master
   ```
4. Proceed with production deployment

#### ❌ TESTS FAILED

**Next Steps:**
1. **DO NOT MERGE** staging → master
2. Review failed test details
3. Check test logs for root cause
4. Fix issues:
   - Deploy fixes to staging
   - Wait for deployment to complete
5. **Re-run validation:**
   ```bash
   npm run validate:pre-deployment
   ```
6. Repeat until all tests pass

---

## Common Failure Scenarios

### Smoke Test Failures

#### API Not Responding
**Symptoms:**
```
❌ API Health Check
Error: connect ECONNREFUSED
```

**Solutions:**
1. Check DigitalOcean deployment status
2. Verify service is running: `doctl apps list`
3. Check service logs: `doctl apps logs <app-id> --type RUN`
4. Verify DNS/domain configuration

#### Database Connection Failed
**Symptoms:**
```
❌ Database Connectivity
Error: Database connection check failed
```

**Solutions:**
1. Check DATABASE_URL environment variable
2. Verify PostgreSQL service is running
3. Check database credentials
4. Test connection from DigitalOcean console

#### Solana RPC Not Accessible
**Symptoms:**
```
❌ Solana RPC Connection
Error: Timeout or connection refused
```

**Solutions:**
1. Check STAGING_RPC_URL is correct
2. Verify API key (if using Helius/QuickNode)
3. Test RPC directly: `curl <RPC_URL> -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'`
4. Check rate limits

### E2E Test Failures

#### Transaction Failures
**Symptoms:**
```
❌ Agreement creation failed
Error: Transaction simulation failed
```

**Solutions:**
1. Check admin wallet has sufficient SOL
2. Verify program is deployed correctly
3. Check Solana cluster status
4. Review transaction logs in Solana Explorer

#### Timing Issues
**Symptoms:**
```
❌ Test timeout
Error: Exceeded timeout of 120000ms
```

**Solutions:**
1. Check network connectivity
2. Verify Solana cluster is not congested
3. Check DigitalOcean region latency
4. Consider increasing timeout for specific tests

---

## Validation Checklist

Use this checklist before and after validation:

### Pre-Validation Checklist

- [ ] Staging branch deployed successfully
- [ ] All DigitalOcean services healthy
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Admin wallet has sufficient SOL
- [ ] No pending deployments
- [ ] All dependencies installed locally

### Post-Validation Checklist

- [ ] All 8 smoke tests passed
- [ ] All 18 E2E tests passed
- [ ] Validation report generated
- [ ] Commit history analyzed
- [ ] Lessons learned documented
- [ ] No critical issues identified
- [ ] Team notified of validation results
- [ ] Ready to merge to master

---

## Automation

### CI/CD Integration

To automate validation in CI/CD:

```yaml
# DigitalOcean App Platform job
jobs:
  - name: pre-deployment-validation
    kind: PRE_DEPLOY
    run_command: npm run validate:pre-deployment
```

See [PRE_DEPLOYMENT_VALIDATION.md](./PRE_DEPLOYMENT_VALIDATION.md) for complete integration guide.

### Scheduled Validation

Run validation on a schedule:

```bash
# Cron job (daily at 2 AM)
0 2 * * * cd /path/to/project && npm run validate:pre-deployment
```

---

## Troubleshooting

### Environment Variables Not Set

```bash
# Check which variables are missing
echo $STAGING_API_URL
echo $STAGING_RPC_URL
echo $STAGING_PROGRAM_ID

# Set temporarily for testing
export STAGING_API_URL=https://staging-api.easyescrow.ai
export STAGING_RPC_URL=https://api.devnet.solana.com
export STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
```

### Tests Pass Locally but Fail in CI

Common causes:
1. Different environment variables
2. Network restrictions
3. Service cold starts
4. Test data conflicts

**Solutions:**
1. Compare env vars: local vs CI
2. Add retry logic for transient failures
3. Increase timeouts for cold starts
4. Use isolated test data

### Report Not Generated

```bash
# Check reports directory
ls -la .taskmaster/reports/

# Create if missing
mkdir -p .taskmaster/reports/

# Check write permissions
chmod 755 .taskmaster/reports/
```

---

## Performance Benchmarks

Expected execution times:

| Component | Duration | Notes |
|-----------|----------|-------|
| Smoke Tests | 30-60s | Fast infrastructure checks |
| E2E Tests | 170-200s | Full workflow validation |
| Total Validation | 200-260s | Complete suite |
| Commit Analysis | 10-30s | Depends on commit count |

**If tests take significantly longer:**
- Check network latency
- Verify Solana cluster is not congested
- Check service response times
- Review test timeout configurations

---

## Best Practices

1. **Run validation regularly** - At least before every master merge
2. **Review reports thoroughly** - Don't just check pass/fail
3. **Archive reports** - Keep historical validation data
4. **Track trends** - Monitor validation duration over time
5. **Fix failures immediately** - Don't accumulate technical debt
6. **Update tests** - Keep tests current with new features
7. **Document issues** - Record and share lessons learned

---

## Related Documentation

- [Pre-Deployment Validation Guide](./PRE_DEPLOYMENT_VALIDATION.md) - Complete system documentation
- [Smoke Tests README](../../tests/staging/smoke/README.md) - Smoke test details
- [E2E Tests README](../../tests/staging/e2e/README.md) - E2E test details
- [STAGING Deployment Guide](./STAGING_DEPLOYMENT_GUIDE.md) - Deployment procedures

---

## Support

**For validation issues:**
1. Check this guide's troubleshooting section
2. Review validation reports
3. Check DigitalOcean service logs
4. Review recent commits for breaking changes
5. Contact team lead if issues persist

---

**Remember:** Pre-deployment validation is your safety net. Take failures seriously and investigate thoroughly before proceeding to production.

