# STAGING CI/CD Pipeline Documentation

## Overview

The STAGING environment uses a fully automated CI/CD pipeline built with GitHub Actions. This pipeline provides reproducible builds, safe deployments, automated testing, and rollback capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions Workflow                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────┐      ┌────────────────┐      ┌────────────────┐ │
│  │  Build Stage   │ ───▶ │ Deploy Stage   │ ───▶ │ Verify Stage   │ │
│  └────────────────┘      └────────────────┘      └────────────────┘ │
│         │                        │                        │           │
│         ▼                        ▼                        ▼           │
│   ┌──────────┐            ┌──────────┐            ┌──────────┐      │
│   │ Compile  │            │ Program  │            │  Smoke   │      │
│   │ Test     │            │ Backend  │            │  Tests   │      │
│   │ Artifact │            │ Database │            │  Health  │      │
│   └──────────┘            └──────────┘            └──────────┘      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Workflows

### 1. Build Workflow (`build-staging.yml`)

**Trigger**: Push to `staging` branch or `staging-*` tags

**Purpose**: Compile, test, and create deployment artifacts

**Steps**:
1. **Checkout Code**: Get latest code from repository
2. **Setup Node.js**: Install Node.js 18 with npm caching
3. **Install Dependencies**: Run `npm ci` for clean install
4. **Setup Solana CLI**: Install Solana CLI v1.18.x
5. **Setup Rust**: Use pinned toolchain from `rust-toolchain.toml`
6. **Install Anchor**: Install Anchor CLI using avm
7. **Build Program**: Compile Solana program with `anchor build`
8. **Generate Checksums**: Create SHA256 checksums for verification
9. **Build Backend**: Compile TypeScript with `npm run build`
10. **Run Tests**: Execute unit tests
11. **Upload Artifacts**: Store compiled program and backend

**Artifacts Produced**:
- `target/deploy/escrow.so` - Compiled Solana program
- `target/deploy/escrow.so.sha256` - Program checksum
- `target/idl/escrow.json` - Program IDL
- `target/idl/escrow.json.sha256` - IDL checksum
- `dist/` - Compiled TypeScript backend

**Runtime**: ~5-10 minutes

### 2. Deploy Workflow (`deploy-staging.yml`)

**Trigger**: Successful completion of Build workflow, or manual trigger

**Environment**: `staging` (requires manual approval)

**Purpose**: Deploy artifacts to STAGING environment

**Steps**:
1. **Checkout Code**: Get deployment scripts
2. **Download Artifacts**: Retrieve artifacts from build workflow
3. **Setup Tools**: Install Node.js, Solana CLI, Anchor CLI
4. **Configure Deployer**: Set up staging deployer wallet
5. **Verify Checksums**: Validate artifact integrity
6. **Deploy Program**: Deploy to Solana devnet
7. **Update IDL**: Upgrade program IDL
8. **Run Migrations**: Apply database schema changes
9. **Deploy Backend**: Push to DigitalOcean App Platform
10. **Run Smoke Tests**: Verify critical functionality
11. **Notify**: Send deployment status to Slack

**Required Secrets**:
- `STAGING_DEPLOYER_KEYPAIR` - Wallet for program deployment
- `STAGING_RPC_URL` - Solana RPC endpoint
- `STAGING_PROGRAM_ID` - Expected program address
- `STAGING_DATABASE_URL` - PostgreSQL connection string
- `DIGITALOCEAN_ACCESS_TOKEN` - DigitalOcean API token
- `STAGING_APP_ID` - App Platform application ID
- `STAGING_API_URL` - Backend API URL
- `SLACK_WEBHOOK` - Slack notification webhook (optional)

**Runtime**: ~10-15 minutes

**Manual Approval**: Required before deployment starts

### 3. Rollback Workflow (`rollback-staging.yml`)

**Trigger**: Manual workflow dispatch

**Environment**: `staging` (requires manual approval)

**Purpose**: Restore previous working deployment

**Inputs**:
- `deployment_id` - DigitalOcean deployment ID to restore
- `reason` - Explanation for rollback (audit purposes)

**Steps**:
1. **Verify Deployment**: Confirm deployment exists
2. **Rollback Backend**: Restore previous deployment
3. **Run Smoke Tests**: Verify system health
4. **Create Audit Log**: Document rollback action
5. **Notify**: Send rollback status to Slack

**Required Secrets**: Same as Deploy workflow

**Runtime**: ~5-10 minutes

**Manual Approval**: Required before rollback starts

## Required GitHub Secrets

### Configure in Repository Settings → Secrets and variables → Actions

| Secret Name | Description | Example |
|------------|-------------|---------|
| `STAGING_DEPLOYER_KEYPAIR` | JSON keypair for program deployment | `[123,45,...]` |
| `STAGING_RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` |
| `STAGING_PROGRAM_ID` | Expected program public key | `ABC123...` |
| `STAGING_DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db` |
| `DIGITALOCEAN_ACCESS_TOKEN` | DO API token | `dop_v1_...` |
| `STAGING_APP_ID` | DO App Platform app ID | `abc-123-xyz` |
| `STAGING_API_URL` | Backend API URL | `https://staging-api.easyescrow.ai` |
| `SLACK_WEBHOOK` | Slack webhook URL (optional) | `https://hooks.slack.com/...` |

## GitHub Environment Protection Rules

### Configure in Repository Settings → Environments → staging

1. **Required Reviewers**: 
   - Add at least one reviewer
   - Reviewers must approve before deployment proceeds

2. **Wait Timer**: 
   - Optional: Add 5-minute wait before deployment
   - Allows time to cancel if needed

3. **Deployment Branches**:
   - Restrict to `staging` branch only
   - Prevents accidental deployments from other branches

## NPM Scripts

The following scripts support the CI/CD pipeline:

```bash
# Build
npm run build                  # Compile TypeScript backend
npm run staging:build          # Build with checksums (PowerShell)
npm run staging:build:clean    # Clean build

# Deploy
npm run staging:deploy         # Deploy to staging (PowerShell)

# Database
npm run staging:migrate        # Run migrations (PowerShell)
npm run staging:migrate:ci     # Run migrations (TypeScript, for CI)

# Testing
npm run test:unit                    # Unit tests
npm run test:staging:smoke           # Smoke tests (Mocha)
npm run test:staging:smoke:ci        # Smoke tests (TypeScript, for CI)
```

## Smoke Tests

### Purpose
Quick validation that critical functionality works after deployment.

### Tests Included
1. **API Health Check** - Verify API is responding
2. **Database Connectivity** - Confirm DB connection
3. **Solana RPC Connection** - Test blockchain access
4. **Program Deployment** - Verify program is deployed
5. **API Authentication** - Check auth endpoints
6. **Core API Endpoints** - Validate key endpoints exist

### Running Locally
```bash
# Set environment variables
export STAGING_API_URL="https://staging-api.easyescrow.ai"
export STAGING_RPC_URL="https://api.devnet.solana.com"
export STAGING_PROGRAM_ID="YourProgramIdHere"

# Run smoke tests
npm run test:staging:smoke:ci
```

### Expected Output
```
🚬 Running STAGING Smoke Tests...

✅ API Health Check (125ms)
✅ Database Connectivity (89ms)
✅ Solana RPC Connection (234ms)
✅ Program Deployment Verification (156ms)
✅ API Authentication (78ms)
✅ Core API Endpoints (201ms)

============================================================
SMOKE TEST RESULTS
============================================================

Total: 6 tests
Passed: 6 ✅
Failed: 0 ❌
Duration: 883ms

============================================================

✅ All smoke tests passed!
```

## Database Migrations

### Purpose
Apply schema changes to STAGING database safely with rollback capability.

### Process
1. **Validate Connection** - Ensure DB is accessible
2. **Check Status** - Identify pending migrations
3. **Create Backup** - Record backup point (via DO auto-backups)
4. **Apply Migrations** - Run `prisma migrate deploy`
5. **Verify Schema** - Confirm critical tables exist
6. **Rollback on Failure** - Restore from backup if needed

### Running Locally
```bash
# Set database URL
export STAGING_DATABASE_URL="postgresql://user:pass@host:25060/db?sslmode=require"

# Run migrations
npm run staging:migrate:ci
```

### Expected Output
```
🗄️  Starting STAGING Database Migration...

1️⃣  Validating database connection...
   ✅ Database connection validated

2️⃣  Checking current migration status...
   ℹ️  Found 2 pending migration(s)

3️⃣  Creating database backup...
   ℹ️  Backup ID: staging-backup-1234567890
   ℹ️  Using DigitalOcean managed database automatic backups

4️⃣  Applying migrations...
   ✅ Migrations applied successfully

5️⃣  Verifying database schema...
   ✅ Schema verification passed

✅ Migration completed successfully!
```

## Deployment Process

### Standard Deployment

1. **Merge to Staging Branch**
   ```bash
   git checkout staging
   git merge feature-branch
   git push origin staging
   ```

2. **Build Workflow Runs** (automatic)
   - Compiles code
   - Runs tests
   - Creates artifacts

3. **Deploy Workflow Triggers** (automatic, requires approval)
   - GitHub sends approval notification
   - Reviewer approves deployment
   - Workflow deploys to STAGING
   - Smoke tests run automatically
   - Slack notification sent

4. **Verify Deployment**
   - Check smoke test results
   - Review application logs
   - Test critical features manually

### Manual Deployment

1. **Navigate to Actions Tab**
2. **Select "Deploy to STAGING" workflow**
3. **Click "Run workflow" button**
4. **Select `staging` branch**
5. **Click "Run workflow" to start**
6. **Approve when prompted**

## Rollback Process

### When to Rollback
- Critical bugs discovered in production
- Performance degradation
- Data integrity issues
- Failed smoke tests

### Steps

1. **Find Deployment ID**
   ```bash
   # Using doctl
   doctl auth init --access-token $DIGITALOCEAN_ACCESS_TOKEN
   doctl apps list-deployments $STAGING_APP_ID
   ```

2. **Trigger Rollback Workflow**
   - Navigate to Actions → Rollback STAGING
   - Click "Run workflow"
   - Enter deployment ID
   - Enter reason for rollback
   - Click "Run workflow"
   - Approve when prompted

3. **Verify Rollback**
   - Check smoke test results
   - Review application logs
   - Confirm issue is resolved

4. **Post-Rollback**
   - Fix the issue in code
   - Test thoroughly
   - Deploy again when ready

## Monitoring & Notifications

### Slack Notifications

Deployment events are sent to Slack (if configured):

**Success**:
```
✅ STAGING deployment completed successfully!
Commit: abc123def
Branch: staging
```

**Failure**:
```
❌ STAGING deployment failed!
Commit: abc123def
Branch: staging
Check: [GitHub Actions Link]
```

**Rollback**:
```
🔄 STAGING rollback completed successfully!
Deployment ID: xyz789
Reason: Critical bug in payment processing
Executed by: username
```

### GitHub Actions Logs

View detailed logs:
1. Navigate to repository → Actions tab
2. Select workflow run
3. Click on job to view logs
4. Download logs if needed

## Troubleshooting

### Build Fails

**Problem**: Compilation errors

**Solution**:
1. Check build logs for specific errors
2. Verify dependencies are compatible
3. Test build locally: `npm run build`
4. Fix issues and push again

### Deploy Fails - Program Deployment

**Problem**: Solana program deployment fails

**Solutions**:
- Verify deployer wallet has sufficient SOL
- Check program ID matches expected value
- Confirm RPC endpoint is accessible
- Verify Anchor.staging.toml configuration

**Check Deployer Balance**:
```bash
solana balance --keypair /path/to/deployer.json --url devnet
```

### Deploy Fails - Backend Deployment

**Problem**: DigitalOcean deployment fails

**Solutions**:
- Verify DIGITALOCEAN_ACCESS_TOKEN is valid
- Check app ID is correct
- Review DigitalOcean logs in console
- Ensure staging-app.yaml is valid

### Smoke Tests Fail

**Problem**: Tests fail after deployment

**Investigation**:
1. Check which test failed
2. Review smoke test output
3. Check application logs
4. Verify environment variables
5. Test endpoints manually

**Common Issues**:
- Database connection: Check DATABASE_URL
- RPC connection: Verify RPC endpoint is up
- Program not found: Confirm deployment succeeded
- API not responding: Check DigitalOcean app status

### Migration Fails

**Problem**: Database migration fails

**Solutions**:
1. Check migration logs for SQL errors
2. Verify database connection string
3. Ensure database user has permissions
4. Rollback via DigitalOcean console if needed

**Manual Rollback**:
1. Go to DigitalOcean → Databases
2. Select STAGING database
3. Go to "Backups & Restore" tab
4. Select pre-migration backup
5. Click "Restore"

## Security Considerations

### Secrets Management
- ✅ Never commit secrets to repository
- ✅ Use GitHub Secrets for sensitive values
- ✅ Rotate deployer keypairs periodically
- ✅ Use read-only tokens where possible
- ✅ Audit secret access regularly

### Wallet Security
- ✅ Staging deployer wallet is separate from production
- ✅ Wallet stored as GitHub Secret
- ✅ Cleaned up after deployment
- ✅ Limited permissions (deploy only)

### Code Review
- ✅ Require PR reviews before merging to staging
- ✅ Run tests in CI before merge
- ✅ Manual approval required for deployment
- ✅ Multiple reviewers for critical changes

### Access Control
- ✅ Limit who can approve deployments
- ✅ Restrict who can trigger workflows
- ✅ Use branch protection rules
- ✅ Enable audit logging

## Best Practices

### Before Deployment
1. Review all changes thoroughly
2. Test locally and in development
3. Update documentation if needed
4. Create database backup if major changes
5. Notify team of deployment

### During Deployment
1. Monitor workflow progress
2. Watch for errors or warnings
3. Review smoke test results
4. Check application logs
5. Be ready to rollback if needed

### After Deployment
1. Verify critical features work
2. Monitor error rates
3. Check performance metrics
4. Document any issues
5. Update team on status

### Regular Maintenance
1. Review and update workflows monthly
2. Rotate secrets quarterly
3. Update dependencies regularly
4. Test rollback procedure quarterly
5. Audit access permissions monthly

## Workflow Diagrams

### Deployment Flow

```
┌─────────────────┐
│  Push to        │
│  staging branch │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Build Workflow │
│  - Compile      │
│  - Test         │
│  - Create       │
│    Artifacts    │
└────────┬────────┘
         │
         ▼
    ┌────────┐
    │Success?│──No──▶ Stop, Fix Issues
    └───┬────┘
        │Yes
        ▼
┌─────────────────┐
│ Deploy Workflow │
│ (Approval       │
│  Required)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Reviewer      │
│   Approves      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Deploy Steps   │
│  - Program      │
│  - Backend      │
│  - Database     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Smoke Tests    │
└────────┬────────┘
         │
         ▼
    ┌────────┐
    │ Pass?  │──No──▶ Alert, Consider Rollback
    └───┬────┘
        │Yes
        ▼
┌─────────────────┐
│  Send Success   │
│  Notification   │
└─────────────────┘
```

### Rollback Flow

```
┌─────────────────┐
│  Issue          │
│  Detected       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Find Previous  │
│  Deployment ID  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Trigger        │
│  Rollback       │
│  Workflow       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Approval       │
│  Required       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Rollback       │
│  Deployment     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Smoke Tests    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Create Audit   │
│  Log            │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Send           │
│  Notification   │
└─────────────────┘
```

## Related Documentation

- [Deployment Guide](../DEPLOYMENT_GUIDE.md)
- [STAGING Environment Setup](../environments/STAGING.md)
- [Secrets Management](../SECRETS_MANAGEMENT.md)
- [Testing Guide](../testing/TESTING_GUIDE.md)

## Support

For issues with the CI/CD pipeline:

1. Check GitHub Actions logs
2. Review this documentation
3. Check related docs above
4. Contact DevOps team
5. Create GitHub issue if needed

## Changelog

### 2025-01-20
- Initial CI/CD pipeline implementation
- Added build, deploy, and rollback workflows
- Created smoke test runner
- Implemented database migration script
- Added comprehensive documentation

