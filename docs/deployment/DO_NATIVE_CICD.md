# DigitalOcean Native CI/CD Pipeline Documentation

## Overview

This document describes the DigitalOcean App Platform native CI/CD pipeline for deploying the EasyEscrow backend application to the STAGING environment. Unlike GitHub Actions, this approach keeps all secrets and configuration within DigitalOcean, eliminating secret duplication and simplifying deployment.

## Table of Contents

- [Architecture](#architecture)
- [Pipeline Flow](#pipeline-flow)
- [Configuration](#configuration)
- [Pre-Deploy Jobs](#pre-deploy-jobs)
- [Deployment Process](#deployment-process)
- [Post-Deploy Verification](#post-deploy-verification)
- [Rollback Procedures](#rollback-procedures)
- [Monitoring & Alerts](#monitoring--alerts)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│          DigitalOcean Native CI/CD Pipeline                  │
└─────────────────────────────────────────────────────────────┘

Developer pushes to staging branch
         ↓
GitHub webhook notifies DigitalOcean (deploy_on_push: true)
         ↓
┌─────────────────────────────────────┐
│   PRE-DEPLOY JOBS (Sequential)      │
├─────────────────────────────────────┤
│ Job 1: Pre-Deploy Tests             │
│   - npm ci                           │
│   - npm run lint                     │
│   - npm run test:unit                │
│   - npm run db:generate              │
│   ✅ All tests must pass             │
├─────────────────────────────────────┤
│ Job 2: Database Migrations           │
│   - npm ci                           │
│   - npx prisma migrate deploy        │
│   - npx prisma generate              │
│   ✅ Migrations must succeed         │
└─────────────────────────────────────┘
         ↓ (only if all jobs pass)
┌─────────────────────────────────────┐
│   BUILD (Dockerfile)                 │
│   - npm ci                           │
│   - npm run build                    │
│   - Copy production files            │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│   DEPLOY to STAGING                  │
│   - Start container                  │
│   - Wait for health check            │
│   - Monitor /health endpoint         │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│   POST-DEPLOY (Optional Worker)      │
│   - Wait 60s for stabilization       │
│   - npm run test:staging:smoke       │
│   - Send notifications               │
└─────────────────────────────────────┘
         ↓
    ✅ Deployment Complete
```

## Pipeline Flow

### 1. Trigger

Deployments are automatically triggered when code is pushed to the `staging` branch:

```yaml
github:
  repo: VENTURE-AI-LABS/easy-escrow-ai-backend
  branch: staging
  deploy_on_push: true
```

**Supported triggers:**
- Direct push to staging branch
- Merge pull request to staging branch
- Manual deployment via DO console
- Manual deployment via `doctl` CLI

### 2. Pre-Deploy Jobs

Pre-deploy jobs run **before** building. If any job fails, the entire deployment stops.

#### Job 1: Pre-Deploy Tests

**Purpose**: Validate code quality and correctness before building

```bash
# Runs automatically before every deployment
npm ci                 # Install dependencies
npm run lint          # Code quality checks
npm run test:unit     # Unit tests
npm run db:generate   # Generate Prisma client
```

**Requirements:**
- All linting rules must pass
- All unit tests must pass
- Prisma client must generate successfully

**Failure Handling:**
- Deployment **stops immediately**
- No build or deployment occurs
- DO console shows failure reason
- Alerts sent (if configured)

#### Job 2: Database Migrations

**Purpose**: Apply schema changes before deploying new code

```bash
# Runs automatically after tests pass
npm ci                      # Install dependencies
npx prisma migrate deploy   # Apply pending migrations
npx prisma generate         # Regenerate client
```

**Requirements:**
- All migrations must apply successfully
- No migration conflicts
- Database must be accessible

**Failure Handling:**
- Deployment **stops immediately**
- Database may be in partial state (requires manual intervention)
- Rollback migrations manually if needed

### 3. Build Phase

After pre-deploy jobs pass, DO builds the Docker image:

```dockerfile
# Uses Dockerfile in repository root
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["npm", "start"]
```

**Build artifacts:**
- Production dependencies
- Compiled TypeScript (dist/)
- Prisma client
- Static assets

### 4. Deployment Phase

Container is deployed with health check monitoring:

```yaml
health_check:
  http_path: /health
  initial_delay_seconds: 60
  period_seconds: 30
  timeout_seconds: 20
  success_threshold: 1
  failure_threshold: 5
```

**Health check validation:**
- API must respond to `/health` with 200 status
- Must include database and Redis connectivity checks
- Must succeed within 60 seconds of startup
- Allows 5 consecutive failures before marking unhealthy

**Deployment completion:**
- Health checks pass consistently
- Old container is terminated
- Traffic routed to new container
- DO marks deployment as "Live"

### 5. Post-Deploy Verification (Optional)

A worker service can run smoke tests after deployment:

```bash
# Optional post-deploy smoke tests
sleep 60                        # Wait for stabilization
npm run test:staging:smoke      # Comprehensive smoke tests
curl -X POST $SLACK_WEBHOOK     # Send notification
```

**Note:** This is an optional worker that must be triggered manually or scheduled.

## Configuration

All configuration is in `staging-app.yaml`:

### Pre-Deploy Jobs Configuration

```yaml
jobs:
  - name: pre-deploy-tests
    kind: PRE_DEPLOY
    run_command: |
      #!/bin/bash
      set -e  # Exit on any error
      npm ci
      npm run lint
      npm run test:unit
      npm run db:generate
    environment_slug: node-js
    instance_size_slug: basic-xxs
    envs:
      - key: NODE_ENV
        value: staging
      - key: DATABASE_URL
        type: SECRET
        scope: BUILD_TIME
```

### Environment Variables

All secrets are configured in **DigitalOcean App Platform console only**:

**In `staging-app.yaml`:**
```yaml
- key: DATABASE_URL
  type: SECRET
  scope: RUN_AND_BUILD_TIME
```

**In DO Console:**
```
Settings → Environment Variables → Add Secret
Name: DATABASE_URL
Value: postgresql://user:pass@host:5432/db
```

**No duplication** - secrets exist only in DO, not GitHub!

## Pre-Deploy Jobs

### Running Pre-Deploy Jobs

Pre-deploy jobs run **automatically** on every deployment. You don't trigger them manually.

### Viewing Job Logs

1. Go to **App Platform → Your App → Activity** tab
2. Click on the deployment
3. View logs for each pre-deploy job
4. Check for failures or warnings

### Job Failure Scenarios

#### Scenario 1: Linting Errors

```
Error: npm run lint failed
Prettier found 3 formatting issues
```

**Resolution:**
```bash
# Fix locally
npm run lint:fix
git add .
git commit -m "fix: resolve linting errors"
git push origin staging
```

#### Scenario 2: Unit Test Failures

```
Error: npm run test:unit failed
3 failing tests
```

**Resolution:**
```bash
# Fix tests locally
npm run test:unit
# Fix failing tests
git add .
git commit -m "fix: resolve test failures"
git push origin staging
```

#### Scenario 3: Migration Failures

```
Error: Migration 20250115_add_column failed
Column 'new_field' already exists
```

**Resolution:**
```bash
# Create migration to fix conflict
npx prisma migrate dev --name fix_column_conflict

# Or manually fix in database
psql $DATABASE_URL
# ALTER TABLE ... 

# Push corrected migration
git push origin staging
```

### Customizing Pre-Deploy Jobs

Edit `staging-app.yaml` to modify job behavior:

```yaml
jobs:
  - name: pre-deploy-tests
    run_command: |
      #!/bin/bash
      set -e
      
      # Add custom steps
      echo "Running custom validation..."
      npm run custom:validate
      
      # Conditional logic
      if [ "$NODE_ENV" = "staging" ]; then
        npm run staging:specific:tests
      fi
```

Then update the app:

```bash
doctl apps update <app-id> --spec staging-app.yaml
```

## Deployment Process

### Automatic Deployment

Deployments happen automatically on push to `staging`:

```bash
git checkout staging
git pull origin master
git push origin staging
# Deployment starts automatically
```

### Manual Deployment via Console

1. Go to **App Platform → Your App**
2. Click **Create Deployment**
3. Select **staging** branch (or specific commit)
4. Click **Deploy**
5. Monitor deployment progress

### Manual Deployment via CLI

```bash
# Force redeploy current staging branch
doctl apps create-deployment <app-id>

# Deploy specific commit
doctl apps create-deployment <app-id> --force-build --commit <commit-sha>
```

### Deployment Monitoring

**Via DO Console:**
1. Go to **App Platform → Your App → Activity**
2. View real-time deployment logs
3. Check pre-deploy job status
4. Monitor build progress
5. Watch health checks

**Via CLI:**
```bash
# Get deployment status
doctl apps get-deployment <app-id> <deployment-id>

# Watch logs in real-time
doctl apps logs <app-id> --type build --follow
doctl apps logs <app-id> --type run --follow
```

### Deployment Duration

Typical timing:
- Pre-deploy tests: 2-3 minutes
- Migrations: 30 seconds - 2 minutes
- Build: 3-5 minutes
- Health checks: 1-2 minutes
- **Total: 7-12 minutes**

## Post-Deploy Verification

### Health Check Verification

After deployment, verify health:

```bash
# Check health endpoint
curl https://staging.easyescrow.ai/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-10-26T12:00:00.000Z",
  "checks": {
    "database": true,
    "redis": true,
    "solana": true,
    "escrowProgram": true
  }
}
```

### Manual Smoke Tests

Run comprehensive smoke tests:

```bash
# Set environment variables
export STAGING_API_URL="https://staging.easyescrow.ai"
export STAGING_RPC_URL="<your-rpc-url>"
export STAGING_PROGRAM_ID="AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"

# Run smoke tests locally
npm run test:staging:smoke
```

### Automated Smoke Tests (Optional)

To run smoke tests automatically after deployment:

1. **Enable the smoke test worker** in `staging-app.yaml`
2. **Trigger manually** via DO console or CLI:
   ```bash
   doctl apps logs <app-id> --type run_component smoke-tests --follow
   ```

3. **View results** in DO console logs

## Rollback Procedures

### When to Rollback

Rollback when:
- ✅ Critical bug discovered after deployment
- ✅ Health checks failing consistently
- ✅ Smoke tests revealing major issues
- ✅ Database migrations causing problems
- ✅ Performance degradation detected

### How to Rollback via DO Console

1. Go to **App Platform → Your App → Settings**
2. Scroll to **Deployments** section
3. Click **Rollback** button next to previous deployment
4. Confirm rollback
5. Wait for deployment to complete
6. Verify health checks pass

### How to Rollback via CLI

```bash
# List recent deployments
doctl apps list-deployments <app-id>

# Get specific deployment details
doctl apps get-deployment <app-id> <deployment-id>

# Rollback by redeploying previous version
# Note: DO doesn't have direct "rollback" command
# Instead, trigger deployment of previous commit

git log --oneline  # Find previous commit
doctl apps create-deployment <app-id> --force-build --commit <previous-commit-sha>
```

### Database Rollback Considerations

⚠️ **Important**: Pre-deploy migrations are NOT automatically rolled back.

**If you need to rollback migrations:**

```bash
# Option 1: Create reverse migration
npx prisma migrate dev --name revert_problematic_change

# Option 2: Restore from backup
doctl databases backups list <db-cluster-id>
doctl databases backups restore <db-cluster-id> <backup-id>

# Option 3: Manual SQL rollback
psql $DATABASE_URL < rollback.sql
```

### Rollback Verification

After rollback:

```bash
# 1. Check deployment status
doctl apps get <app-id>

# 2. Verify health
curl https://staging.easyescrow.ai/health

# 3. Run smoke tests
npm run test:staging:smoke

# 4. Check application logs
doctl apps logs <app-id> --type run --follow
```

## Monitoring & Alerts

### Built-in DO Alerts

DigitalOcean sends alerts for:

```yaml
alerts:
  - rule: DEPLOYMENT_FAILED
  - rule: DOMAIN_FAILED
  - rule: DEPLOYMENT_LIVE
```

**Configure alert destinations:**
1. Go to **App Platform → Your App → Settings → Alerts**
2. Add email addresses
3. Configure Slack webhook (optional)
4. Save settings

### Custom Notifications

Add notifications to pre-deploy jobs:

```yaml
jobs:
  - name: pre-deploy-tests
    run_command: |
      #!/bin/bash
      set -e
      
      # Send start notification
      curl -X POST "$SLACK_WEBHOOK" \
        -d '{"text":"🚀 Starting STAGING deployment..."}'
      
      # Run tests
      npm run test:unit
      
      # Send success notification
      curl -X POST "$SLACK_WEBHOOK" \
        -d '{"text":"✅ Pre-deploy tests passed!"}'
      
      # On failure (set trap)
      trap 'curl -X POST "$SLACK_WEBHOOK" \
        -d "{\"text\":\"❌ Pre-deploy tests failed!\"}"' ERR
    envs:
      - key: SLACK_WEBHOOK
        type: SECRET
        scope: BUILD_TIME
```

### Application Monitoring

Use DO's built-in metrics:

1. Go to **App Platform → Your App → Insights**
2. View metrics:
   - Request rate
   - Response time
   - Error rate
   - CPU usage
   - Memory usage
3. Set up custom metric alerts

## Troubleshooting

### Issue: Pre-Deploy Job Timeout

**Symptom**: Job runs for 15+ minutes and times out

**Possible Causes:**
- Slow npm install (network issues)
- Hanging tests
- Database connection timeout

**Resolution:**
```yaml
# Increase timeout in staging-app.yaml
jobs:
  - name: pre-deploy-tests
    timeout_seconds: 1800  # 30 minutes
```

### Issue: Build Fails After Tests Pass

**Symptom**: Pre-deploy jobs pass, but Docker build fails

**Possible Causes:**
- Missing files in Dockerfile
- Build-time dependency issues
- Incorrect Dockerfile commands

**Resolution:**
```bash
# Test Dockerfile locally
docker build -t test-build .
docker run -p 8080:8080 test-build

# Check logs
doctl apps logs <app-id> --type build
```

### Issue: Health Checks Failing

**Symptom**: Deployment completes but health checks never pass

**Possible Causes:**
- `/health` endpoint not responding
- Database connection issues
- Port misconfiguration
- Application crash on startup

**Resolution:**
```bash
# Check application logs
doctl apps logs <app-id> --type run --follow

# Test health endpoint directly
curl https://staging.easyescrow.ai/health

# Check if container is running
doctl apps get <app-id> --format ID,ActiveDeployment.Phase
```

### Issue: Database Migration Conflicts

**Symptom**: Migration job fails with "Column already exists" or similar

**Possible Causes:**
- Migration already applied manually
- Conflicting migrations from different branches
- Database out of sync

**Resolution:**
```bash
# Check migration status
psql $DATABASE_URL
SELECT * FROM _prisma_migrations ORDER BY finished_at DESC;

# Mark problematic migration as applied (if already exists)
# WARNING: Only do this if you're sure the schema is correct
npx prisma migrate resolve --applied <migration_name>

# Or create a fix migration
npx prisma migrate dev --name fix_migration_conflict
```

### Issue: Environment Variables Not Available

**Symptom**: Application crashes with "Missing env var" errors

**Possible Causes:**
- Secret not configured in DO console
- Wrong scope (BUILD_TIME vs RUN_TIME)
- Typo in variable name

**Resolution:**
1. Go to **App Platform → Your App → Settings → Environment Variables**
2. Verify all required secrets are set
3. Check scope matches usage:
   - `BUILD_TIME` - Available during pre-deploy jobs and build
   - `RUN_TIME` - Available in running application
   - `RUN_AND_BUILD_TIME` - Available in both
4. Restart deployment after fixing

## Best Practices

### Development Workflow

1. **Test locally first**
   ```bash
   npm run lint
   npm run test:unit
   npm run test:integration
   npm run build
   ```

2. **Create feature branches**
   ```bash
   git checkout -b feature/my-feature
   # ... make changes ...
   git push origin feature/my-feature
   ```

3. **Open PR to staging**
   - Ensure CI checks pass
   - Get code review
   - Merge to staging

4. **Monitor deployment**
   - Watch DO console
   - Check health endpoint
   - Run smoke tests

### Pre-Deploy Job Best Practices

- ✅ Keep jobs fast (< 5 minutes each)
- ✅ Use `set -e` to fail fast on errors
- ✅ Add descriptive echo statements
- ✅ Run only critical tests (save comprehensive tests for post-deploy)
- ✅ Cache dependencies when possible
- ❌ Don't run long-running tests
- ❌ Don't include flaky tests
- ❌ Don't skip error checking

### Secret Management

- ✅ Store ALL secrets in DO console only
- ✅ Use descriptive secret names
- ✅ Document required secrets
- ✅ Rotate secrets quarterly
- ✅ Use appropriate scopes (BUILD_TIME vs RUN_TIME)
- ❌ Never commit secrets to staging-app.yaml
- ❌ Never share secrets via chat/email
- ❌ Don't use same secrets for dev and staging

### Migration Best Practices

- ✅ Test migrations locally first
- ✅ Back up database before risky migrations
- ✅ Create reversible migrations when possible
- ✅ Keep migrations small and focused
- ✅ Document breaking changes
- ❌ Don't skip migrations in staging
- ❌ Don't edit already-applied migrations
- ❌ Don't run destructive operations without backup

### Monitoring Best Practices

- ✅ Monitor deployment logs in real-time
- ✅ Set up email alerts for failures
- ✅ Check health endpoint after each deployment
- ✅ Run smoke tests manually if automatic tests aren't set up
- ✅ Review application logs for errors
- ❌ Don't ignore deployment warnings
- ❌ Don't skip post-deploy verification
- ❌ Don't deploy on Friday afternoons (unless necessary)

## Comparison: DO Native vs GitHub Actions

| Feature | DO Native CI/CD | GitHub Actions |
|---------|----------------|----------------|
| **Secret Management** | ✅ Single source (DO only) | ❌ Duplicate (GitHub + DO) |
| **Configuration** | ✅ staging-app.yaml only | ❌ Multiple workflow files |
| **Cost** | ✅ Included in DO pricing | 💰 GitHub Actions minutes |
| **Integration** | ✅ Native DO resources access | ⚠️ Requires API calls |
| **Deployment Speed** | ✅ Faster (same infrastructure) | ⚠️ Slower (external runner) |
| **Rollback** | ✅ One-click in DO console | ⚠️ Requires workflow re-run |
| **Logs** | ✅ Unified in DO console | ⚠️ Split (GitHub + DO) |
| **Setup Complexity** | ✅ Simple (one file) | ⚠️ Complex (multiple files + secrets) |
| **Maintenance** | ✅ Low | ⚠️ Higher (sync secrets) |

## Additional Resources

- [DigitalOcean App Platform Documentation](https://docs.digitalocean.com/products/app-platform/)
- [App Spec Reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
- [Pre-Deploy Jobs Documentation](https://docs.digitalocean.com/products/app-platform/reference/app-spec/#jobs)
- [doctl CLI Reference](https://docs.digitalocean.com/reference/doctl/)

## Support

For issues with the CI/CD pipeline:

1. Check this documentation
2. Review deployment logs in DO console
3. Check #devops Slack channel
4. Contact DevOps team

---

**Last Updated**: 2025-10-26  
**Version**: 2.0.0 (DO Native)  
**Maintained by**: DevOps Team

