# STAGING Environment Deployment Guide

**Environment:** STAGING  
**Platform:** DigitalOcean App Platform  
**Network:** Solana Devnet  
**Date:** January 2025

## Overview

This guide provides comprehensive instructions for deploying the Easy Escrow backend application to the STAGING environment on DigitalOcean App Platform. The STAGING environment mirrors production configuration but uses Solana devnet for testing and validation.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Methods](#deployment-methods)
   - [Automated CI/CD Deployment](#automated-cicd-deployment)
   - [Manual Deployment](#manual-deployment)
4. [Post-Deployment Verification](#post-deployment-verification)
5. [Troubleshooting](#troubleshooting)
6. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Required Tools

1. **DigitalOcean CLI (`doctl`)**
   ```bash
   # Install doctl
   # Windows (via Chocolatey)
   choco install doctl
   
   # macOS (via Homebrew)
   brew install doctl
   
   # Linux
   cd ~
   wget https://github.com/digitalocean/doctl/releases/download/v1.104.0/doctl-1.104.0-linux-amd64.tar.gz
   tar xf doctl-1.104.0-linux-amd64.tar.gz
   sudo mv doctl /usr/local/bin
   ```

2. **Authentication**
   ```bash
   # Authenticate with DigitalOcean
   doctl auth init
   # Enter your DigitalOcean API token when prompted
   ```

3. **Node.js & npm** (v18 or higher)
   ```bash
   node --version  # Should be v18+
   npm --version
   ```

4. **Git**
   ```bash
   git --version
   ```

### Required Credentials

Ensure you have access to the following secrets:

- ✅ DigitalOcean API token
- ✅ Helius API key for Solana RPC
- ✅ Database credentials (from Task 67)
- ✅ Redis credentials (from Task 68)
- ✅ STAGING wallet private keys (Base58 format)
- ✅ JWT secret (48 characters)
- ✅ Webhook secret (48 characters)

### Dependency Verification

Before deploying, verify all dependencies are complete:

```bash
# Check Task 67: Database setup
# - easyescrow_staging database exists
# - staging_user has proper permissions

# Check Task 68: Redis setup
# - Redis Cloud instance provisioned
# - Connection string available

# Check Task 66: Program deployment
# - STAGING program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
# - Program deployed to devnet

# Check Task 69: Environment configuration
# - .env.staging file created
# - All variables populated
```

---

## Pre-Deployment Checklist

### 1. Verify Environment Configuration

```powershell
# Ensure .env.staging exists
npm run staging:setup-env

# Validate all variables are set
$envFile = Get-Content .env.staging
$requiredVars = @(
    'DEVNET_STAGING_PROGRAM_ID',
    'DEVNET_STAGING_SENDER_PRIVATE_KEY',
    'DATABASE_URL',
    'REDIS_URL'
)

foreach ($var in $requiredVars) {
    if (-not ($envFile | Select-String -Pattern "^$var=")) {
        Write-Host "❌ Missing: $var" -ForegroundColor Red
    } else {
        Write-Host "✅ Found: $var" -ForegroundColor Green
    }
}
```

### 2. Update `staging-app.yaml`

Replace all placeholder values in `staging-app.yaml`:

```yaml
# Example placeholders to replace:
SOLANA_RPC_URL: https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
DEVNET_STAGING_SENDER_PRIVATE_KEY: YOUR_STAGING_SENDER_PRIVATE_KEY
DATABASE_URL: postgresql://staging_user:PASSWORD@host...
REDIS_URL: redis://default:PASSWORD@redis-xxxxx...
JWT_SECRET: YOUR_JWT_SECRET
WEBHOOK_SECRET: YOUR_WEBHOOK_SECRET
```

**Security Note:** Never commit `staging-app.yaml` with actual secrets to git. Use environment-specific copies or DigitalOcean's secret management.

### 3. Validate App Specification

```bash
# Validate the app spec before deployment
doctl apps spec validate staging-app.yaml
```

Expected output: `✅ App spec is valid`

### 4. Build and Test Locally (Optional)

```bash
# Build the application
npm ci
npm run build

# Run unit tests
npm test

# Run linting
npm run lint
```

---

## Deployment Methods

### Automated CI/CD Deployment

**Recommended for regular deployments.**

#### Setup GitHub Secrets

Configure the following secrets in your GitHub repository:

1. Navigate to: **Settings → Secrets and variables → Actions**
2. Add the following repository secrets:

```yaml
# DigitalOcean
DIGITALOCEAN_ACCESS_TOKEN: <your-do-api-token>
STAGING_APP_ID: <app-id-after-first-deployment>

# Solana
STAGING_RPC_URL: https://devnet.helius-rpc.com/?api-key=<key>
STAGING_PROGRAM_ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
STAGING_DEPLOYER_KEYPAIR: <staging-deployer.json contents>

# Database
STAGING_DATABASE_URL: postgresql://staging_user:password@host...

# API
STAGING_API_URL: https://staging-api.easyescrow.ai
```

#### Trigger Deployment

**Option 1: Push to `staging` branch**
```bash
git checkout staging
git pull origin master  # Merge latest changes
git push origin staging  # Triggers build → deploy workflow
```

**Option 2: Manual workflow dispatch**
```bash
# Via GitHub UI: Actions → Deploy to STAGING → Run workflow
# Or via CLI:
gh workflow run "Deploy to STAGING"
```

#### Monitor Deployment

```bash
# View workflow run
gh run list --workflow="Deploy to STAGING"

# View logs
gh run view --log
```

---

### Manual Deployment

**Use for initial setup or troubleshooting.**

#### Step 1: Prepare Application

```bash
# Ensure you're on the right branch
git checkout staging
git pull origin staging

# Install dependencies
npm ci

# Build the application
npm run build

# Verify build artifacts
ls -la dist/
```

#### Step 2: Create or Update App on DigitalOcean

**For First-Time Deployment:**

```bash
# Create new app
doctl apps create --spec staging-app.yaml

# Note the App ID from output
# Example: easyescrow-staging (ID: 12345678-1234-1234-1234-123456789abc)
```

**For Updates:**

```bash
# List existing apps
doctl apps list

# Update existing app
doctl apps update <app-id> --spec staging-app.yaml
```

#### Step 3: Configure Environment Variables in DO Console

1. Go to: [DigitalOcean App Platform Console](https://cloud.digitalocean.com/apps)
2. Select: `easyescrow-staging`
3. Navigate to: **Settings → App-Level Environment Variables**
4. Add/Update all SECRET variables:

```yaml
# Mark as ENCRYPTED
SOLANA_RPC_URL
DEVNET_STAGING_SENDER_PRIVATE_KEY
DEVNET_STAGING_RECEIVER_PRIVATE_KEY
DEVNET_STAGING_ADMIN_PRIVATE_KEY
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY
DATABASE_URL
DATABASE_POOL_URL
REDIS_URL
JWT_SECRET
WEBHOOK_SECRET
SMTP_USER
SMTP_PASS
DO_SPACES_KEY
DO_SPACES_SECRET
DIGITAL_OCEAN_API_KEY
```

#### Step 4: Trigger Deployment

```bash
# Create a new deployment
doctl apps create-deployment <app-id> --wait --timeout 10m
```

#### Step 5: Monitor Deployment

```bash
# Check deployment status
doctl apps list-deployments <app-id>

# View build logs
doctl apps logs <app-id> --type build --follow

# View runtime logs
doctl apps logs <app-id> --type run --follow
```

---

## Post-Deployment Verification

### 1. Run Verification Script

```powershell
# Automated verification
.\scripts\deployment\verify-staging-deployment.ps1
```

### 2. Manual Health Check

```bash
# Check API health endpoint
curl https://staging-api.easyescrow.ai/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-01-20T12:00:00.000Z",
  "environment": "staging",
  "network": "devnet",
  "checks": {
    "database": "connected",
    "redis": "connected",
    "solana": "connected",
    "program": "deployed"
  },
  "versions": {
    "api": "1.0.0",
    "programId": "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
  }
}
```

### 3. Run Smoke Tests

```bash
# Run comprehensive smoke tests
npm run test:staging:smoke

# Expected: All tests pass ✅
```

### 4. Database Migration Verification

```bash
# Check migration status
npm run staging:migrate:status

# Run migrations if needed
npm run staging:migrate
```

### 5. Test Core Endpoints

```bash
# Test escrow creation endpoint
curl -X POST https://staging-api.easyescrow.ai/api/escrow/create \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "token": "USDC",
    "receiverAddress": "..."
  }'
```

### 6. Verify Monitoring

```bash
# Check DigitalOcean monitoring dashboard
# Verify:
# - CPU usage < 50%
# - Memory usage < 70%
# - Response time < 500ms
# - Error rate < 1%
```

---

## Troubleshooting

### Issue: Deployment Fails with Build Error

**Symptoms:**
- Build logs show compilation errors
- Deployment status: "Failed"

**Solution:**
```bash
# 1. Check build logs
doctl apps logs <app-id> --type build

# 2. Verify locally
npm ci
npm run build

# 3. Check TypeScript errors
npm run lint

# 4. Fix errors and redeploy
git add .
git commit -m "fix: Build errors"
git push origin staging
```

### Issue: Health Check Failing

**Symptoms:**
- App shows "Unhealthy" status
- HTTP 503 errors on endpoints

**Solution:**
```bash
# 1. Check runtime logs
doctl apps logs <app-id> --type run --follow

# 2. Verify environment variables
# In DO Console: Settings → Environment Variables

# 3. Check database connectivity
# Ensure DATABASE_URL is correct and accessible

# 4. Check Redis connectivity
# Ensure REDIS_URL is correct and accessible

# 5. Restart the app
doctl apps create-deployment <app-id>
```

### Issue: Database Connection Timeout

**Symptoms:**
- Logs show "Unable to connect to database"
- Prisma errors in logs

**Solution:**
```bash
# 1. Verify database is running
# In DO Console: Databases → easyescrow-postgres

# 2. Check connection string
# Ensure DATABASE_URL has correct host, port, and credentials

# 3. Verify IP allowlist
# In DO Console: Databases → Settings → Trusted Sources
# Add App Platform IP ranges

# 4. Test connection manually
npm run staging:db:test
```

### Issue: Redis Connection Error

**Symptoms:**
- Logs show "Redis connection failed"
- Bull queue errors

**Solution:**
```bash
# 1. Verify Redis Cloud is running
# Login to Redis Cloud console

# 2. Check connection string format
# Format: redis://default:password@host:port

# 3. Verify IP allowlist in Redis Cloud
# Add App Platform IP ranges

# 4. Test connection
npm run staging:redis:test
```

### Issue: Solana RPC Connection Fails

**Symptoms:**
- Logs show "RPC request failed"
- Program interactions timeout

**Solution:**
```bash
# 1. Verify Helius API key
# Check SOLANA_RPC_URL contains valid key

# 2. Test RPC endpoint
curl https://devnet.helius-rpc.com/?api-key=<key> \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# 3. Check rate limits
# Verify Helius account has sufficient quota

# 4. Use fallback RPC if needed
# SOLANA_RPC_URL_FALLBACK: https://api.devnet.solana.com
```

### Issue: Environment Variables Not Loading

**Symptoms:**
- App crashes on startup
- Logs show "Missing required environment variable"

**Solution:**
```bash
# 1. Verify all variables are set in DO Console
# Settings → App-Level Environment Variables

# 2. Check variable names match exactly
# Use DEVNET_STAGING_* prefix for staging-specific vars

# 3. Ensure SECRET variables are marked as encrypted
# Type: SECRET in staging-app.yaml

# 4. Redeploy after updating variables
doctl apps create-deployment <app-id>
```

---

## Rollback Procedures

### Automated Rollback (Recommended)

```bash
# Trigger rollback workflow
gh workflow run "Rollback STAGING" \
  --field target_deployment_id=<previous-deployment-id>
```

### Manual Rollback

#### Option 1: Via DigitalOcean Console

1. Navigate to: **App Platform → easyescrow-staging**
2. Go to: **Deployments** tab
3. Find the last successful deployment
4. Click: **Rollback to this deployment**
5. Confirm rollback

#### Option 2: Via CLI

```bash
# 1. List recent deployments
doctl apps list-deployments <app-id>

# 2. Rollback to specific deployment
doctl apps rollback <app-id> --deployment-id <deployment-id>

# 3. Monitor rollback
doctl apps list-deployments <app-id>
```

#### Option 3: Redeploy Previous Version

```bash
# 1. Find last working commit
git log --oneline

# 2. Checkout that commit
git checkout <commit-hash>

# 3. Create rollback branch
git checkout -b rollback-staging-<date>

# 4. Push to staging
git push origin rollback-staging-<date>:staging --force

# 5. Verify deployment
curl https://staging-api.easyescrow.ai/health
```

### Post-Rollback Verification

```bash
# 1. Check health
curl https://staging-api.easyescrow.ai/health

# 2. Run smoke tests
npm run test:staging:smoke

# 3. Verify database migrations
npm run staging:migrate:status

# 4. Check logs for errors
doctl apps logs <app-id> --type run --follow
```

---

## Deployment Checklist

Use this checklist for each deployment:

### Pre-Deployment
- [ ] All dependencies completed (Tasks 66, 67, 68, 69)
- [ ] .env.staging file created and populated
- [ ] staging-app.yaml updated with real values
- [ ] App spec validated (`doctl apps spec validate`)
- [ ] Local build successful (`npm run build`)
- [ ] Unit tests passing (`npm test`)
- [ ] Git branch up to date (`git pull`)

### Deployment
- [ ] Deployment triggered (CI/CD or manual)
- [ ] Build logs checked for errors
- [ ] Deployment status: "Active"
- [ ] Health check passing

### Post-Deployment
- [ ] `/health` endpoint returns healthy status
- [ ] Database connectivity verified
- [ ] Redis connectivity verified
- [ ] Solana RPC connectivity verified
- [ ] Program ID matches expected value
- [ ] Smoke tests pass
- [ ] Core API endpoints responding correctly
- [ ] Monitoring dashboard shows normal metrics

### Documentation
- [ ] Deployment record created
- [ ] Team notified of deployment
- [ ] Any issues documented
- [ ] Rollback plan reviewed

---

## Maintenance

### Regular Tasks

**Daily:**
- Monitor health endpoint
- Check error logs
- Verify monitoring dashboards

**Weekly:**
- Review performance metrics
- Check resource utilization
- Run smoke tests

**Monthly:**
- Review and rotate secrets
- Update dependencies
- Review and optimize database queries

**Quarterly:**
- Full security audit
- Load testing
- Disaster recovery drill

---

## Additional Resources

- [DigitalOcean App Platform Documentation](https://docs.digitalocean.com/products/app-platform/)
- [STAGING Environment Variables Reference](../environments/STAGING_ENV_VARS.md)
- [STAGING Database Setup](../infrastructure/STAGING_DATABASE_SETUP.md)
- [STAGING Redis Setup](../infrastructure/STAGING_REDIS_SETUP.md)
- [Program IDs Reference](../PROGRAM_IDS.md)
- [Task 69 Completion](../tasks/TASK_69_COMPLETION.md)

---

## Support

For deployment issues:
1. Check troubleshooting section above
2. Review deployment logs
3. Contact DevOps team
4. Escalate to platform team if needed

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Maintained By:** DevOps Team

