# STAGING CI/CD Pipeline Documentation

## Overview

This document describes the complete CI/CD pipeline for deploying the EasyEscrow backend application to the STAGING environment. The pipeline automates building, testing, deployment, and rollback procedures using GitHub Actions.

## Table of Contents

- [Architecture](#architecture)
- [Workflow Overview](#workflow-overview)
- [Required Secrets](#required-secrets)
- [Workflows](#workflows)
- [Manual Approval Process](#manual-approval-process)
- [Smoke Tests](#smoke-tests)
- [Database Migrations](#database-migrations)
- [Rollback Procedures](#rollback-procedures)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## Architecture

The CI/CD pipeline consists of three main GitHub Actions workflows:

```
┌─────────────────────────────────────────────────────────────┐
│                    STAGING CI/CD PIPELINE                    │
└─────────────────────────────────────────────────────────────┘

1. BUILD WORKFLOW (build-staging.yml)
   ├─ Triggered by: Push to 'staging' branch or 'staging-*' tags
   ├─ Runs on: ubuntu-latest
   └─ Steps:
      ├─ Checkout code
      ├─ Setup Node.js & install dependencies
      ├─ Build TypeScript
      ├─ Setup Solana CLI & Rust
      ├─ Build Anchor program
      ├─ Generate checksums
      ├─ Run tests
      └─ Upload artifacts (program + backend)

                    ↓ (on success)

2. DEPLOY WORKFLOW (deploy-staging.yml)
   ├─ Triggered by: Successful build workflow completion
   ├─ Requires: Manual approval (staging environment)
   ├─ Runs on: ubuntu-latest
   └─ Steps:
      ├─ Download build artifacts
      ├─ Verify checksums
      ├─ Deploy Solana program to devnet
      ├─ Update IDL
      ├─ Deploy backend to DigitalOcean App Platform
      ├─ Run smoke tests
      └─ Send notifications (Slack/Discord)

3. ROLLBACK WORKFLOW (rollback-staging.yml)
   ├─ Triggered by: Manual workflow dispatch
   ├─ Requires: Manual approval + deployment ID + reason
   ├─ Runs on: ubuntu-latest
   └─ Steps:
      ├─ Verify deployment exists
      ├─ Rollback DigitalOcean App to previous deployment
      ├─ Wait for completion
      ├─ Run smoke tests
      └─ Send notifications
```

## Workflow Overview

### 1. Build Workflow (`build-staging.yml`)

**Trigger:**
- Push to `staging` branch
- Push of tags matching `staging-*`

**Purpose:**
- Build and test the application
- Generate deployment artifacts
- Create checksums for verification

**Key Features:**
- Pins Solana CLI to version 1.18.26 for reproducibility
- Uses Rust toolchain from `rust-toolchain.toml`
- Generates SHA-256 checksums for artifacts
- Stores artifacts for 30 days
- Creates build summary in GitHub Actions UI

**Artifacts Generated:**
- `program-artifacts/`: Solana program binary and IDL with checksums
- `backend-artifacts/`: TypeScript build output and dependencies

### 2. Deploy Workflow (`deploy-staging.yml`)

**Trigger:**
- Successful completion of build workflow
- Manual workflow dispatch (for redeployments)

**Purpose:**
- Deploy built artifacts to STAGING environment
- Verify deployment success
- Run smoke tests

**Key Features:**
- Downloads artifacts from build workflow
- Verifies artifact integrity using checksums
- Deploys Solana program to devnet
- Updates IDL on-chain
- Deploys backend to DigitalOcean App Platform
- Runs comprehensive smoke tests
- Sends deployment notifications

**Manual Approval:**
This workflow requires manual approval via GitHub's environment protection rules before deploying. See [Manual Approval Process](#manual-approval-process) for details.

### 3. Rollback Workflow (`rollback-staging.yml`)

**Trigger:**
- Manual workflow dispatch only

**Purpose:**
- Rollback to a previous deployment
- Verify rollback success
- Maintain deployment history

**Required Inputs:**
- `deployment_id`: DigitalOcean App Platform deployment ID to rollback to
- `reason`: Explanation for the rollback (for audit trail)

**Key Features:**
- Verifies target deployment exists before rollback
- Updates DigitalOcean App to previous deployment spec
- Waits for rollback completion (10-minute timeout)
- Runs smoke tests to verify health
- Sends rollback notifications

## Required Secrets

The following secrets must be configured in GitHub repository settings:

### GitHub Secrets

Configure these in: **Settings → Secrets and variables → Actions → Repository secrets**

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `STAGING_DEPLOYER_KEYPAIR` | Solana keypair JSON for program deployment | `[123,45,...]` |
| `STAGING_RPC_URL` | Solana RPC endpoint URL | `https://devnet.helius-rpc.com/?api-key=xxx` |
| `STAGING_PROGRAM_ID` | Deployed program's public key | `AvdX6LEkoAmP...` |
| `STAGING_APP_ID` | DigitalOcean App Platform app ID | `abc123...` |
| `STAGING_API_URL` | STAGING backend API URL | `https://staging-api.easyescrow.ai` |
| `DIGITALOCEAN_ACCESS_TOKEN` | DigitalOcean API token with app management permissions | `dop_v1_abc...` |
| `SLACK_WEBHOOK` | Slack webhook URL for notifications (optional) | `https://hooks.slack.com/...` |

### Environment Secrets

The `staging` environment must be configured with protection rules. See [Configure GitHub Environment Protection Rules](#configure-github-environment-protection-rules).

## Workflows

### Running a Build

**Automatic:**
```bash
# Push to staging branch
git push origin staging

# Or create and push a staging tag
git tag staging-v1.0.0
git push origin staging-v1.0.0
```

**Manual:**
Not applicable - builds are only triggered by branch/tag pushes.

### Running a Deployment

**Automatic:**
Deployments are triggered automatically after successful builds but require manual approval.

**Manual Redeployment:**
1. Go to **Actions** tab in GitHub
2. Select **Deploy to STAGING** workflow
3. Click **Run workflow**
4. Select branch and click **Run workflow**
5. Wait for approval request
6. Approve the deployment

### Running a Rollback

1. Get the deployment ID to rollback to:
   ```bash
   doctl apps list-deployments <STAGING_APP_ID>
   ```

2. Go to **Actions** tab in GitHub

3. Select **Rollback STAGING** workflow

4. Click **Run workflow**

5. Enter:
   - **deployment_id**: The target deployment ID
   - **reason**: Clear explanation for the rollback

6. Click **Run workflow**

7. Approve the rollback when prompted

## Manual Approval Process

### Setting Up Environment Protection

1. Go to **Settings → Environments** in GitHub

2. Click **New environment** or select existing `staging` environment

3. Configure protection rules:
   - ✅ **Required reviewers**: Add team members who can approve deployments
   - ✅ **Wait timer**: Optional delay before deployment can proceed
   - ⬜ **Deployment branches**: Optionally restrict to specific branches

4. Add required secrets to the environment (if not using repository secrets)

### Approving a Deployment

When a deployment is waiting for approval:

1. GitHub will send notification to required reviewers

2. Navigate to the workflow run:
   - Go to **Actions** tab
   - Click on the pending workflow run
   - You'll see "Waiting for approval" status

3. Click **Review deployments**

4. Review the deployment details:
   - Branch/commit being deployed
   - Build artifacts and checksums
   - Who triggered the deployment

5. Add optional comment

6. Click **Approve and deploy** or **Reject**

### Approval Best Practices

- ✅ Review the commit history and changes being deployed
- ✅ Verify smoke tests passed in build workflow
- ✅ Check that no critical bugs are being deployed
- ✅ Ensure proper change management procedures are followed
- ✅ Document approval in commit/PR comments
- ❌ Don't approve without reviewing changes
- ❌ Don't approve if build artifacts failed verification

## Smoke Tests

### Overview

Smoke tests are critical post-deployment checks that verify the STAGING environment is functioning correctly.

### Test Coverage

The smoke test suite (`scripts/testing/smoke-tests.ts`) includes:

1. **API Health Check**: Verify `/health` endpoint responds with 200 status
2. **API Version Check**: Confirm API version endpoint is accessible
3. **Authentication Test**: Verify auth is properly enforced (401 for unauthenticated)
4. **Solana RPC Connection**: Test connectivity to Solana devnet
5. **Program Account Verification**: Confirm program is deployed and executable
6. **Database Connectivity**: Verify database connection via API
7. **Redis Connectivity**: Verify Redis connection via API
8. **CORS Configuration**: Confirm CORS headers are properly configured

### Running Smoke Tests Locally

```bash
# Set required environment variables
export STAGING_API_URL="https://staging-api.easyescrow.ai"
export STAGING_RPC_URL="https://devnet.helius-rpc.com/?api-key=xxx"
export STAGING_PROGRAM_ID="AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"

# Run smoke tests
npm run test:staging:smoke
```

### Smoke Test Failures

If smoke tests fail during deployment:

1. **Workflow automatically stops** - deployment is marked as failed
2. **Review logs** in GitHub Actions to identify which test failed
3. **Common issues:**
   - API not responding (DigitalOcean deployment still starting)
   - Database connection issues (check DATABASE_URL secret)
   - Redis connection issues (check REDIS_URL secret)
   - Program not found (wrong PROGRAM_ID or deployment failed)
4. **Resolution:**
   - If transient (API still starting), re-run the workflow
   - If persistent, investigate the specific failure and fix before redeploying
   - Consider rolling back if critical functionality is broken

## Database Migrations

### Overview

Database migrations are run as part of the deployment process using Prisma's `migrate deploy` command.

### Migration Script

The migration script (`scripts/deployment/migrate-staging.ts`) performs:

1. **Environment validation**: Checks DATABASE_URL and NODE_ENV
2. **Migration discovery**: Lists pending migrations
3. **Migration execution**: Runs `prisma migrate deploy`
4. **Client generation**: Generates Prisma client
5. **Status verification**: Confirms all migrations applied

### Running Migrations in CI/CD

Migrations are **automatically included** in the deploy workflow. The workflow runs migrations after deploying the backend but before running smoke tests.

### Running Migrations Manually

If you need to run migrations separately:

```bash
# Local development
npm run staging:migrate:ci

# Via doctl (on DigitalOcean App)
doctl apps exec <STAGING_APP_ID> npm run staging:migrate:ci
```

### Migration Best Practices

- ✅ Test migrations locally before pushing to staging
- ✅ Create reversible migrations when possible
- ✅ Back up database before running migrations
- ✅ Review migration SQL files before committing
- ✅ Keep migrations small and focused
- ❌ Don't edit existing migrations after they've been applied
- ❌ Don't delete migration files
- ❌ Don't run migrations that drop production data

### Migration Failures

If migrations fail during deployment:

1. **Workflow stops** - deployment marked as failed
2. **Database is left in potentially inconsistent state**
3. **Resolution steps:**
   ```bash
   # 1. Check migration status
   doctl apps exec <STAGING_APP_ID> npx prisma migrate status
   
   # 2. Review failed migration
   # Check logs in GitHub Actions for error details
   
   # 3. Fix the migration issue
   # - Create a new migration to fix the issue
   # - Or manually fix the database and mark migration as applied
   
   # 4. Redeploy
   git push origin staging
   ```

## Rollback Procedures

### When to Rollback

Rollback to a previous deployment when:

- ✅ Critical bug discovered in production
- ✅ Smoke tests fail persistently after deployment
- ✅ Performance degradation detected
- ✅ Breaking change deployed accidentally
- ✅ Security vulnerability introduced

### How to Rollback

1. **Identify the target deployment:**
   ```bash
   # List recent deployments
   doctl apps list-deployments <STAGING_APP_ID> --format ID,Phase,CreatedAt | head -10
   
   # Get details of a specific deployment
   doctl apps get-deployment <STAGING_APP_ID> <DEPLOYMENT_ID>
   ```

2. **Trigger rollback workflow:**
   - Go to **Actions → Rollback STAGING**
   - Click **Run workflow**
   - Enter deployment ID and reason
   - Approve the rollback

3. **Monitor rollback:**
   - Watch workflow progress in GitHub Actions
   - Check logs for any errors
   - Verify smoke tests pass after rollback

4. **Verify rollback:**
   ```bash
   # Check current deployment
   doctl apps get <STAGING_APP_ID> --format ActiveDeployment.ID,ActiveDeployment.Phase
   
   # Test the API
   curl https://staging-api.easyescrow.ai/health
   ```

### Rollback Limitations

- ⚠️ **Database migrations are NOT automatically rolled back**
  - You must manually rollback database changes if needed
  - Consider creating "down" migrations for critical schema changes
  
- ⚠️ **Solana program deployments are NOT rolled back**
  - Programs are immutable once deployed
  - Only backend API is rolled back
  
- ⚠️ **Redis data is NOT rolled back**
  - Cache and queue data may be inconsistent after rollback
  - Consider flushing Redis if necessary

### Manual Database Rollback

If you need to rollback database changes:

```bash
# Option 1: Run a "down" migration (if you created one)
# Create a new migration that reverses the changes
npx prisma migrate dev --name revert_problematic_change

# Option 2: Restore from backup
# Use DigitalOcean's backup restoration feature
doctl databases backup restore <DB_CLUSTER_ID> <BACKUP_ID>

# Option 3: Manual SQL rollback
# Write and execute SQL to reverse the changes
psql $DATABASE_URL -c "-- your rollback SQL here"
```

## Troubleshooting

### Build Failures

**Symptom**: Build workflow fails

**Common Causes:**
1. **TypeScript compilation errors**
   - Check `npm run build` logs
   - Fix type errors in code

2. **Anchor build failures**
   - Verify Rust toolchain version matches `rust-toolchain.toml`
   - Check Anchor.toml configuration

3. **Test failures**
   - Review test output in workflow logs
   - Fix failing tests before pushing

**Resolution:**
```bash
# Test locally before pushing
npm run build
npm test
anchor build
```

### Deployment Failures

**Symptom**: Deploy workflow fails

**Common Causes:**
1. **Missing or invalid secrets**
   - Verify all required secrets are set in GitHub
   - Check secret values are correct (especially keypairs)

2. **Solana program deployment fails**
   - Verify STAGING_DEPLOYER_KEYPAIR has sufficient SOL
   - Check STAGING_RPC_URL is accessible
   - Verify STAGING_PROGRAM_ID matches keypair

3. **DigitalOcean App Platform deployment fails**
   - Check DIGITALOCEAN_ACCESS_TOKEN is valid
   - Verify STAGING_APP_ID is correct
   - Review App Platform logs in DO console

4. **Smoke tests fail**
   - See [Smoke Test Failures](#smoke-test-failures) section

**Resolution:**
```bash
# Verify secrets locally
echo $STAGING_RPC_URL
solana-keygen pubkey <(echo $STAGING_DEPLOYER_KEYPAIR)

# Check DO app status
doctl apps get $STAGING_APP_ID

# Manually run smoke tests
npm run test:staging:smoke
```

### Rollback Failures

**Symptom**: Rollback workflow fails

**Common Causes:**
1. **Invalid deployment ID**
   - Verify deployment ID exists
   - Use `doctl apps list-deployments` to find valid IDs

2. **App Platform rollback timeout**
   - Deployment taking longer than 10 minutes
   - Check DO console for deployment progress

3. **Smoke tests fail after rollback**
   - Previous deployment may also have issues
   - Consider rolling back further

**Resolution:**
```bash
# Verify deployment exists
doctl apps get-deployment $STAGING_APP_ID $DEPLOYMENT_ID

# Check app status
doctl apps get $STAGING_APP_ID --format ActiveDeployment.Phase

# Manually verify health
curl https://staging-api.easyescrow.ai/health
```

### Notification Failures

**Symptom**: Slack/Discord notifications not sent

**Common Causes:**
1. **Invalid webhook URL**
   - Verify SLACK_WEBHOOK secret is correct
   - Test webhook manually

2. **Notification action fails**
   - Check workflow logs for specific error
   - Notification failures don't stop deployment (continue-on-error: true)

**Resolution:**
```bash
# Test Slack webhook manually
curl -X POST $SLACK_WEBHOOK \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test notification"}'
```

## Security Considerations

### Secret Management

- ✅ **Use GitHub Secrets** for all sensitive values
- ✅ **Use environment secrets** for deployment-specific values
- ✅ **Rotate secrets** regularly (at least quarterly)
- ✅ **Audit secret access** in GitHub settings
- ❌ **Never commit secrets** to version control
- ❌ **Never log secret values** in workflows

### Access Control

- ✅ **Limit approval permissions** to senior team members
- ✅ **Enable branch protection** on staging branch
- ✅ **Require code reviews** before merging to staging
- ✅ **Enable audit logging** for deployments
- ❌ **Don't share deployer keypairs** between environments

### Deployment Security

- ✅ **Verify checksums** before deploying artifacts
- ✅ **Use pinned versions** for tools (Solana CLI, Rust, Node)
- ✅ **Run security scans** in build workflow
- ✅ **Validate environment variables** before deployment
- ❌ **Don't deploy untested code** to staging
- ❌ **Don't skip smoke tests**

### Audit Trail

All deployments and rollbacks create an audit trail:

- **GitHub Actions logs**: Full workflow execution logs
- **Deployment notifications**: Slack/Discord messages with deployment details
- **Git history**: Commit and tag history shows what was deployed
- **DigitalOcean logs**: App Platform maintains deployment history

### Incident Response

If a security issue is discovered:

1. **Immediately rollback** to last known good deployment
2. **Rotate all secrets** that may have been compromised
3. **Investigate the issue** and create a post-mortem
4. **Fix the vulnerability** before redeploying
5. **Update security practices** to prevent recurrence

## Best Practices

### Deployment Workflow

1. **Test thoroughly** in development before pushing to staging
2. **Create descriptive commit messages** for audit trail
3. **Use semantic versioning** for staging tags (e.g., `staging-v1.2.3`)
4. **Review changes** before approving deployments
5. **Monitor deployments** via Slack/Discord notifications
6. **Verify smoke tests** pass before considering deployment successful

### Migration Workflow

1. **Test migrations locally** before committing
2. **Back up database** before running destructive migrations
3. **Create reversible migrations** when possible
4. **Keep migrations small** and focused on one change
5. **Document breaking changes** in migration comments

### Rollback Workflow

1. **Document rollback reason** clearly in workflow input
2. **Communicate rollback** to team via Slack/Discord
3. **Investigate root cause** of issue that caused rollback
4. **Fix the issue** before attempting to redeploy
5. **Consider database rollback** if schema changes were involved

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [DigitalOcean App Platform Documentation](https://docs.digitalocean.com/products/app-platform/)
- [Prisma Migrations Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Solana CLI Documentation](https://docs.solana.com/cli)
- [Anchor Framework Documentation](https://www.anchor-lang.com/)

## Support

For issues with the CI/CD pipeline:

1. Check [Troubleshooting](#troubleshooting) section
2. Review GitHub Actions workflow logs
3. Check DigitalOcean App Platform console
4. Contact DevOps team via Slack #devops channel

---

**Last Updated**: 2025-10-26  
**Version**: 1.0.0  
**Maintained by**: DevOps Team
