# STAGING CI Deployment Procedures

**Step-by-Step CI-Based Deployment Guide for STAGING Environment**  
**Last Updated:** January 2025  
**Related:** [STAGING Strategy](../architecture/STAGING_STRATEGY.md) | [CI/CD Complete](STAGING_CI_CD_COMPLETE.md)

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [Prerequisites](#2-prerequisites)
3. [Standard Deployment Flow](#3-standard-deployment-flow)
4. [Manual Deployment Trigger](#4-manual-deployment-trigger)
5. [Post-Deployment Verification](#5-post-deployment-verification)
6. [Emergency Rollback](#6-emergency-rollback)
7. [Database Migrations](#7-database-migrations)
8. [Monitoring Deployment](#8-monitoring-deployment)
9. [Common Deployment Scenarios](#9-common-deployment-scenarios)
10. [Troubleshooting Guide](#10-troubleshooting-guide)

---

## 1. Quick Reference

### Deployment Commands

```bash
# Standard deployment (automatic via push)
git push origin staging

# Manual deployment trigger
gh workflow run "Deploy to STAGING" --ref staging

# Check deployment status
gh workflow watch

# Rollback to previous deployment
gh workflow run "Rollback STAGING" \
  --field target_deployment_id=<deployment-id> \
  --field reason="<reason>"

# View deployment logs
doctl apps logs $STAGING_APP_ID --type run --follow
```

### Deployment Checklist

**Pre-Deployment:**
- ✅ All tests passing locally
- ✅ Code reviewed and approved
- ✅ CHANGELOG updated
- ✅ Database migrations tested
- ✅ Breaking changes documented

**During Deployment:**
- ✅ Monitor build logs
- ✅ Watch for errors
- ✅ Approve deployment (if manual gate)

**Post-Deployment:**
- ✅ Run smoke tests
- ✅ Check error rates
- ✅ Verify metrics
- ✅ Update team

---

## 2. Prerequisites

### Required Tools

```bash
# GitHub CLI (for workflow triggers)
gh --version  # Should be v2.0.0+

# DigitalOcean CLI (for app management)
doctl version  # Should be v1.98.0+

# Node.js (for running tests locally)
node --version  # Should be v20.x

# Git (obviously)
git --version
```

### Required Access

**GitHub Permissions:**
- ✅ Write access to repository
- ✅ Ability to approve workflow runs (for approval gate)
- ✅ Access to GitHub Secrets

**DigitalOcean Access:**
- ✅ Access to App Platform
- ✅ Permission to view logs
- ✅ Permission to trigger deployments

**Slack/Discord:**
- ✅ Access to deployment notifications channel

### Environment Setup

```bash
# Authenticate with GitHub
gh auth login

# Authenticate with DigitalOcean
doctl auth init

# Set project context
cd /path/to/easy-escrow-ai-backend

# Verify on correct branch
git branch --show-current  # Should be 'staging' or ready to push to staging
```

---

## 3. Standard Deployment Flow

### Step 1: Merge to Staging Branch

```bash
# Start from feature branch
git checkout feature/my-feature

# Ensure all changes committed
git status

# Switch to staging
git checkout staging

# Pull latest
git pull origin staging

# Merge feature branch
git merge feature/my-feature

# Resolve any conflicts
# (If conflicts, resolve, commit, then continue)

# Push to trigger deployment
git push origin staging
```

**This automatically triggers the CI/CD pipeline.**

### Step 2: Monitor Build Phase

**Watch GitHub Actions:**

```bash
# Open workflow in browser
gh workflow view "Build STAGING" --web

# Or watch from terminal
gh run watch
```

**Build phase includes:**

1. ✅ Checkout code
2. ✅ Install dependencies
3. ✅ Run linter
4. ✅ Run unit tests
5. ✅ Build Solana program
6. ✅ Build backend
7. ✅ Generate checksums
8. ✅ Upload artifacts

**Expected Duration:** 5-10 minutes

### Step 3: Approval Gate (If Configured)

**Approval Required:**

1. Navigate to: **GitHub → Actions → [Build Run] → Review Deployments**
2. Review:
   - ✅ Build logs for errors
   - ✅ Test results
   - ✅ Changes in this deployment
3. Click: **Approve and deploy** or **Reject**

**Approval Checklist:**

- ✅ All tests passing?
- ✅ No unexpected changes?
- ✅ Database migrations safe?
- ✅ Breaking changes communicated?

**If Rejected:**

- Deployment stops
- Fix issues in new commit
- Repeat from Step 1

### Step 4: Deploy Phase

**Automated deployment begins:**

1. ✅ Download build artifacts
2. ✅ Verify checksums
3. ✅ Deploy Solana program to devnet
4. ✅ Update IDL on-chain
5. ✅ Deploy backend to DigitalOcean
6. ✅ Run database migrations
7. ✅ Wait for health checks

**Expected Duration:** 3-5 minutes

**Monitor deployment:**

```bash
# Watch DigitalOcean deployment
doctl apps list
doctl apps get $STAGING_APP_ID

# View real-time logs
doctl apps logs $STAGING_APP_ID --type run --follow
```

### Step 5: Testing Phase

**Automated tests run:**

1. ✅ Smoke tests (30 seconds)
2. ✅ Canary tests (2 minutes)
3. ✅ E2E tests (10-15 minutes)

**Monitor test execution:**

```bash
# Watch test workflow
gh workflow view "E2E Test STAGING" --web

# Or from terminal
gh run watch
```

**Test Pass Criteria:**

- ✅ All smoke tests pass
- ✅ Canary transaction completes
- ✅ All E2E tests pass
- ✅ Error rate < 1%
- ✅ Response time within baseline

### Step 6: Deployment Complete

**Success indicators:**

- ✅ Green checkmark on GitHub Actions
- ✅ Slack/Discord notification sent
- ✅ Deployment marked as successful in DO App Platform
- ✅ All tests passing

**Update team:**

```markdown
# Slack message template
🚀 **STAGING Deployment Complete**

**Build:** #123 (abc123d)
**Deployed:** 2025-01-20 14:30 UTC
**Changes:** 
- Feature: Added XYZ functionality
- Fix: Resolved ABC issue
- Chore: Updated dependencies

**Tests:** ✅ All passing
**Status:** https://staging-api.easyescrow.ai/health
```

---

## 4. Manual Deployment Trigger

### When to Use Manual Trigger

**Use manual trigger when:**

- ⚠️ Need to redeploy without new commits
- ⚠️ Rolling back to specific commit
- ⚠️ CI/CD push trigger failed
- ⚠️ Testing deployment process

**Don't use manual trigger for:**

- ❌ Regular deployments (use push to staging branch)
- ❌ Bypassing approval gates (not possible)
- ❌ Deploying uncommitted changes (not possible)

### Triggering Manual Deployment

**Via GitHub CLI:**

```bash
# Trigger deployment workflow
gh workflow run "Deploy to STAGING" \
  --ref staging \
  --field build_sha=$(git rev-parse HEAD)

# Watch deployment
gh run watch
```

**Via GitHub Web UI:**

1. Navigate to: **GitHub → Actions**
2. Select workflow: **Deploy to STAGING**
3. Click: **Run workflow**
4. Select branch: **staging**
5. (Optional) Enter git SHA
6. Click: **Run workflow**

### Manual Deployment with Specific Commit

```bash
# Get commit SHA you want to deploy
git log --oneline

# Trigger deployment for specific commit
gh workflow run "Deploy to STAGING" \
  --ref staging \
  --field build_sha=abc123d  # Specific commit
```

---

## 5. Post-Deployment Verification

### Automated Verification

**CI/CD automatically runs:**

1. ✅ Health check endpoint
2. ✅ Smoke tests
3. ✅ Canary tests
4. ✅ E2E tests

### Manual Verification Steps

**1. Check API Health:**

```bash
# Health endpoint
curl https://staging-api.easyescrow.ai/health

# Expected output:
# {
#   "status": "ok",
#   "uptime": 123,
#   "version": "0.1.0",
#   "database": "connected",
#   "redis": "connected",
#   "solana": "connected"
# }
```

**2. Check Database Connectivity:**

```bash
# From backend logs
doctl apps logs $STAGING_APP_ID --type run | grep "Database connected"

# Or run manual query
npm run staging:db:status
```

**3. Check Solana Program:**

```bash
# Verify program deployed
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet

# Check IDL
anchor idl fetch AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster devnet \
  -o fetched-idl.json

# Compare with deployed IDL
diff target/idl/escrow.json fetched-idl.json
```

**4. Check Application Logs:**

```bash
# View last 100 lines
doctl apps logs $STAGING_APP_ID --type run | tail -100

# Check for errors
doctl apps logs $STAGING_APP_ID --type run | grep -i error

# Check for warnings
doctl apps logs $STAGING_APP_ID --type run | grep -i warn
```

**5. Run Manual Test Transaction:**

```bash
# Run canary test manually
npm run test:staging:canary

# Or run full E2E
npm run test:staging:e2e
```

**6. Check Metrics:**

```bash
# Error rate (should be < 1%)
curl https://staging-api.easyescrow.ai/metrics | grep error_rate

# Response time (should be < 500ms)
curl https://staging-api.easyescrow.ai/metrics | grep response_time

# Request count
curl https://staging-api.easyescrow.ai/metrics | grep request_count
```

### Verification Checklist

**✅ Deployment Successful If:**

- ✅ Health endpoint returns 200 OK
- ✅ Database connected
- ✅ Redis connected
- ✅ Solana RPC connected
- ✅ Program deployed and accessible
- ✅ IDL matches deployed version
- ✅ No critical errors in logs
- ✅ Smoke tests passing
- ✅ Canary test passing
- ✅ Error rate < 1%
- ✅ Response time within baseline

**⚠️ Investigate If:**

- ⚠️ Health endpoint slow (> 1s)
- ⚠️ Warnings in logs
- ⚠️ Error rate 1-5%
- ⚠️ Single test failure (may be flaky)

**❌ Rollback If:**

- ❌ Health endpoint fails
- ❌ Database connection fails
- ❌ Critical errors in logs
- ❌ Canary test fails
- ❌ Error rate > 5%
- ❌ Multiple test failures

---

## 6. Emergency Rollback

### When to Rollback

**Rollback immediately if:**

- ❌ Critical functionality broken
- ❌ High error rate (> 10%)
- ❌ Database corruption
- ❌ Security vulnerability exposed
- ❌ Unrecoverable state

### Rollback via GitHub Actions

```bash
# Find previous successful deployment
gh run list --workflow "Deploy to STAGING" --limit 10

# Trigger rollback
gh workflow run "Rollback STAGING" \
  --field target_deployment_id=<previous-deployment-id> \
  --field reason="Critical bug in feature X"
```

### Rollback via DigitalOcean

**Via Console:**

1. Navigate to: **App Platform → easyescrow-staging → Deployments**
2. Find last successful deployment (green checkmark)
3. Click: **••• → Rollback to this deployment**
4. Confirm rollback
5. Wait for redeployment (~3 minutes)

**Via CLI:**

```bash
# Get deployment history
doctl apps list-deployments $STAGING_APP_ID

# Rollback to specific deployment
doctl apps create-deployment $STAGING_APP_ID \
  --spec .do/app-staging.yaml
```

### Rollback via Git

```bash
# Find last working commit
git log --oneline

# Checkout that commit
git checkout <last-good-commit>

# Force push to staging (triggers new deployment)
git push origin HEAD:staging --force

# Tag as rollback
git tag -a rollback-$(date +%Y%m%d-%H%M) -m "Rollback due to: <reason>"
git push origin rollback-$(date +%Y%m%d-%H%M)
```

### Post-Rollback Steps

**After rollback:**

1. ✅ Run smoke tests to verify
2. ✅ Check logs for errors
3. ✅ Notify team via Slack
4. ✅ Create incident report
5. ✅ Fix issue in new branch
6. ✅ Test fix thoroughly
7. ✅ Redeploy with fix

**Incident Report Template:**

```markdown
# Incident Report: STAGING Rollback

**Date:** 2025-01-20
**Time:** 14:45 UTC
**Duration:** 15 minutes

## Summary
Brief description of what went wrong.

## Timeline
- 14:30: Deployed build #123
- 14:35: Users reported errors
- 14:40: Decision to rollback
- 14:45: Rollback complete, services restored

## Root Cause
Detailed explanation of what caused the issue.

## Resolution
How the issue was fixed.

## Action Items
- [ ] Fix bug in code
- [ ] Add test to prevent regression
- [ ] Update deployment checklist
- [ ] Redeploy to STAGING
```

---

## 7. Database Migrations

### Pre-Migration Checklist

**Before deploying migrations:**

- ✅ Tested migration locally
- ✅ Tested migration rollback (`down` migration)
- ✅ Verified migration is backward compatible
- ✅ Backed up database (DO automatic backups)
- ✅ Reviewed migration code
- ✅ Estimated migration duration
- ✅ Planned for potential downtime

### Migration Deployment

**Migrations run automatically during deployment:**

```yaml
# In CI/CD pipeline
- name: Run Database Migrations
  run: npm run staging:migrate
```

**Manual migration (if needed):**

```bash
# Run migrations
npm run staging:migrate

# Check migration status
npm run staging:migrate:status

# Rollback last migration (if needed)
npm run staging:migrate:down
```

### Zero-Downtime Migrations

**For critical migrations, use multi-step approach:**

**Step 1: Add new column (nullable)**

```sql
-- Migration #1: Add nullable column
ALTER TABLE agreements ADD COLUMN new_field VARCHAR(255);
```

**Step 2: Backfill data**

```sql
-- Migration #2: Backfill existing rows
UPDATE agreements SET new_field = 'default' WHERE new_field IS NULL;
```

**Step 3: Make required**

```sql
-- Migration #3: Add NOT NULL constraint
ALTER TABLE agreements ALTER COLUMN new_field SET NOT NULL;
```

### Migration Rollback

**If migration fails:**

```bash
# Automatic rollback in CI/CD
# Or manual rollback
npm run staging:migrate:down

# Restore from backup (if needed)
# Contact DO support for point-in-time restore
```

---

## 8. Monitoring Deployment

### Real-Time Monitoring

**Watch deployment progress:**

```bash
# GitHub Actions logs
gh run watch

# DigitalOcean deployment status
watch -n 5 'doctl apps get $STAGING_APP_ID | grep Status'

# Application logs
doctl apps logs $STAGING_APP_ID --type run --follow
```

### Key Metrics to Watch

**During Deployment:**

1. **Deployment Status**
   - Building → Deploying → Running
   - Expected: 3-5 minutes total

2. **Health Checks**
   - Wait for first successful health check
   - Expected: Within 60 seconds after deploy

3. **Error Rate**
   - Should remain at baseline (< 1%)
   - Spike indicates issue

4. **Response Time**
   - Should remain within 10% of baseline
   - Significant increase indicates issue

### Monitoring Dashboards

**DigitalOcean Insights:**

- Navigate to: **App Platform → easyescrow-staging → Insights**
- Monitor: CPU, Memory, Request Rate, Error Rate

**Custom Metrics:**

```bash
# Check metrics endpoint
curl https://staging-api.easyescrow.ai/metrics

# Expected metrics:
# - uptime
# - request_count
# - error_count
# - error_rate
# - response_time_p50
# - response_time_p95
# - response_time_p99
```

---

## 9. Common Deployment Scenarios

### Scenario 1: Feature Deployment

**Steps:**

1. Merge feature branch to staging
2. Push triggers automatic deployment
3. Monitor build and tests
4. Verify feature works in STAGING
5. Tag as release candidate

**Command:**

```bash
git checkout staging
git merge feature/my-feature
git push origin staging
```

### Scenario 2: Hotfix Deployment

**Steps:**

1. Create hotfix branch from staging
2. Make minimal fix
3. Test locally
4. Push to staging for CI/CD deployment
5. Monitor closely

**Commands:**

```bash
git checkout staging
git checkout -b hotfix/critical-bug
# Make fix
git add .
git commit -m "fix: Critical bug in payment processing"
git checkout staging
git merge hotfix/critical-bug
git push origin staging
```

### Scenario 3: Dependency Update

**Steps:**

1. Update dependencies locally
2. Run full test suite
3. Update CHANGELOG
4. Deploy via standard flow
5. Monitor for compatibility issues

**Commands:**

```bash
npm update
npm audit fix
npm test
git add package*.json
git commit -m "chore: Update dependencies"
git push origin staging
```

### Scenario 4: Database Schema Change

**Steps:**

1. Create and test migration locally
2. Create rollback migration
3. Test both migrations
4. Deploy via standard flow
5. Verify schema changes applied

**Commands:**

```bash
# Create migration
npm run migrate:create add_new_column

# Test migration
npm run staging:migrate:test

# Deploy (migrations run automatically)
git push origin staging

# Verify
npm run staging:migrate:status
```

---

## 10. Troubleshooting Guide

### Build Failures

**Problem:** TypeScript compilation errors

**Solution:**

```bash
# Run locally to see full errors
npm run build

# Check for type errors
npm run type-check

# Fix errors and recommit
```

**Problem:** Linting errors

**Solution:**

```bash
# Run linter locally
npm run lint

# Auto-fix where possible
npm run lint:fix

# Fix remaining errors manually
```

**Problem:** Unit tests failing

**Solution:**

```bash
# Run tests locally
npm test

# Run specific test
npm test -- path/to/test.ts

# Fix failing tests
```

### Deployment Failures

**Problem:** Program deployment fails with "insufficient funds"

**Solution:**

```bash
# Check deployer balance
DEPLOYER=$(solana address -k target/deploy/escrow-keypair-staging.json)
solana balance $DEPLOYER --url devnet

# Fund if needed
solana airdrop 5 $DEPLOYER --url devnet

# Retry deployment
gh workflow run "Deploy to STAGING" --ref staging
```

**Problem:** Backend deployment fails with "health check timeout"

**Solution:**

```bash
# Check application logs
doctl apps logs $STAGING_APP_ID --type run | tail -100

# Look for startup errors
doctl apps logs $STAGING_APP_ID --type run | grep -i error

# Common causes:
# - Database connection failure
# - Missing environment variable
# - Port binding issue
# - Startup script error
```

**Problem:** Migration fails

**Solution:**

```bash
# Check migration logs
doctl apps logs $STAGING_APP_ID --type run | grep migration

# Rollback migration
npm run staging:migrate:down

# Fix migration
# Redeploy
```

### Test Failures

**Problem:** Smoke tests fail

**Solution:**

```bash
# Check what's failing
npm run test:staging:smoke

# Common causes:
# - API not responding (check health endpoint)
# - Database not connected
# - Redis not connected
# - RPC not accessible

# Fix issue and redeploy
```

**Problem:** E2E tests fail

**Solution:**

```bash
# Run E2E tests locally
npm run test:staging:e2e

# Check for flaky tests
# Run multiple times to confirm

# If legitimate failure:
# - Rollback deployment
# - Fix issue
# - Redeploy
```

### Performance Issues

**Problem:** Slow response times after deployment

**Solution:**

```bash
# Check resource usage
doctl apps get $STAGING_APP_ID

# Check database query performance
# Check Redis connection pool

# Scale up if needed (unlikely for STAGING)
```

**Problem:** High error rate

**Solution:**

```bash
# Check error logs
doctl apps logs $STAGING_APP_ID --type run | grep ERROR

# Identify error pattern
# Fix code or configuration
# Redeploy
```

---

## Related Documentation

- [STAGING Strategy](../architecture/STAGING_STRATEGY.md) - Overall STAGING architecture
- [STAGING CI/CD Complete](STAGING_CI_CD_COMPLETE.md) - Complete CI/CD setup
- [Anchor Config Setup](ANCHOR_CONFIG_SETUP.md) - Anchor configuration guide

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team  
**Questions?** Contact the DevOps team or update this document via PR.
