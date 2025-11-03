# DigitalOcean Backup Guide

Complete guide for backing up DigitalOcean resources using the backup utility scripts.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [What Gets Backed Up](#what-gets-backed-up)
- [Quick Start](#quick-start)
- [Usage Examples](#usage-examples)
- [Automation](#automation)
- [Backup Storage & Retention](#backup-storage--retention)
- [Restoration Procedures](#restoration-procedures)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Overview

The DigitalOcean backup utility provides automated backup functionality for:

- **App Platform applications** - Creates deployment snapshots
- **Managed Database clusters** - Creates on-demand backups
- **Backup metadata** - Stores backup information for restoration

**Key Features:**
- ✅ Backs up individual or all resources
- ✅ Dry-run mode for testing
- ✅ Resource inventory listing
- ✅ Automated via CI/CD or cron jobs
- ✅ Cross-platform (TypeScript + PowerShell)

---

## Prerequisites

### Required

1. **DigitalOcean API Token**
   - Generate from: https://cloud.digitalocean.com/account/api/tokens
   - Required scopes: `read` and `write`
   - Set as `DIGITAL_OCEAN_API_KEY` environment variable

2. **Node.js & TypeScript**
   ```bash
   node --version  # v14+ required
   npm install -g ts-node typescript
   ```

3. **Environment Configuration**
   ```bash
   # Add to .env file
   DIGITAL_OCEAN_API_KEY=dop_v1_xxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Optional

- **PowerShell** (Windows users for convenience)
- **doctl** CLI (for manual operations)

---

## What Gets Backed Up

### App Platform Applications

**Backup Method:** Creates a new deployment (snapshot)

**What's included:**
- Application source code (from connected repo)
- Build configuration
- Environment variables (not secret values)
- Service specifications
- Routing rules
- Health checks

**What's NOT included:**
- Secret values (encrypted, cannot be exported)
- Runtime logs
- Application data (use database backups)

**Retention:** Deployments are kept indefinitely until manually deleted

**Cost:** Free (deployments don't count as running apps)

### Managed Database Clusters

**Backup Method:** Creates on-demand backup via API

**What's included:**
- Complete database dump
- All schemas, tables, data
- User accounts and permissions
- Database configuration

**What's NOT included:**
- Logs older than 7 days
- Connection pool state

**Retention:** 
- Free tier: 7 days
- Standard: Configurable (7-35 days)
- Premium: Up to 90 days

**Cost:** Included in database pricing

---

## Quick Start

### 1. List All Resources

View all backupable resources:

```bash
# TypeScript
ts-node scripts/utilities/backup-digitalocean.ts --list

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -List
```

**Output:**
```
📱 App Platform Applications:
  • easyescrow-backend-staging
    ID: abc123def456
    Region: nyc
    Created: 11/3/2025, 10:30:00 AM

💾 Database Clusters:
  • easyescrow-staging-db
    ID: xyz789
    Engine: postgresql 14
    Region: nyc3
    Size: db-s-1vcpu-1gb
```

### 2. Test Backup (Dry Run)

Test without creating actual backups:

```bash
# TypeScript
ts-node scripts/utilities/backup-digitalocean.ts --all --dry-run

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -All -DryRun
```

### 3. Execute Full Backup

Backup everything:

```bash
# TypeScript
ts-node scripts/utilities/backup-digitalocean.ts --all

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -All
```

---

## Usage Examples

### Backup Specific Resources

#### Backup Single App

```bash
# Get app ID from --list command
ts-node scripts/utilities/backup-digitalocean.ts --app abc123def456

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -Apps 'abc123def456'
```

#### Backup Multiple Apps

```bash
ts-node scripts/utilities/backup-digitalocean.ts --app abc123,def456,ghi789

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -Apps 'abc123,def456,ghi789'
```

#### Backup Single Database

```bash
ts-node scripts/utilities/backup-digitalocean.ts --database xyz789

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -Databases 'xyz789'
```

#### Backup App + Database Together

```bash
ts-node scripts/utilities/backup-digitalocean.ts --app abc123 --database xyz789

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -Apps 'abc123' -Databases 'xyz789'
```

### Backup All Resources by Type

#### All Apps Only

```bash
ts-node scripts/utilities/backup-digitalocean.ts --all-apps

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -AllApps
```

#### All Databases Only

```bash
ts-node scripts/utilities/backup-digitalocean.ts --all-databases

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -AllDatabases
```

#### Everything

```bash
ts-node scripts/utilities/backup-digitalocean.ts --all

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -All
```

### Custom Output Path

Save metadata to a specific location:

```bash
ts-node scripts/utilities/backup-digitalocean.ts --all --output backups/backup-$(date +%Y%m%d).json

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -All -OutputPath "backups/backup-$(Get-Date -Format 'yyyyMMdd').json"
```

---

## Automation

### Scheduled Backups via npm Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "backup:staging": "ts-node scripts/utilities/backup-digitalocean.ts --app staging-app-id --database staging-db-id",
    "backup:production": "ts-node scripts/utilities/backup-digitalocean.ts --app prod-app-id --database prod-db-id",
    "backup:all": "ts-node scripts/utilities/backup-digitalocean.ts --all"
  }
}
```

Run with:
```bash
npm run backup:staging
npm run backup:production
npm run backup:all
```

### GitHub Actions Workflow

Create `.github/workflows/backup.yml`:

```yaml
name: Daily Backup

on:
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Execute backup
        env:
          DIGITAL_OCEAN_API_KEY: ${{ secrets.DIGITAL_OCEAN_API_KEY }}
        run: |
          ts-node scripts/utilities/backup-digitalocean.ts --all --output "backups/backup-$(date +%Y%m%d-%H%M%S).json"
      
      - name: Upload backup metadata
        uses: actions/upload-artifact@v4
        with:
          name: backup-metadata
          path: backups/backup-*.json
          retention-days: 30
      
      - name: Notify on failure
        if: failure()
        run: echo "Backup failed! Check logs."
```

### Windows Task Scheduler

Create a scheduled task:

**Task Name:** DigitalOcean Daily Backup

**Trigger:** Daily at 2:00 AM

**Action:**
```
Program: powershell.exe
Arguments: -ExecutionPolicy Bypass -File "C:\path\to\project\scripts\utilities\backup-digitalocean.ps1" -All
Start in: C:\path\to\project
```

**Environment:**
Set `DIGITAL_OCEAN_API_KEY` in:
- User environment variables, or
- Load from `.env` file (script handles this)

### Linux Cron Job

Add to crontab (`crontab -e`):

```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/project && /usr/local/bin/ts-node scripts/utilities/backup-digitalocean.ts --all >> logs/backup.log 2>&1

# Weekly full backup (Sundays at 3 AM)
0 3 * * 0 cd /path/to/project && /usr/local/bin/ts-node scripts/utilities/backup-digitalocean.ts --all --output "backups/weekly-$(date +\%Y\%m\%d).json"
```

---

## Backup Storage & Retention

### App Platform Deployments

**Storage Location:** DigitalOcean's infrastructure

**Access:** Via DigitalOcean Console or API
- Console: Apps → [Your App] → Settings → Deployments
- API: `GET /v2/apps/{app_id}/deployments`

**Retention:**
- Kept indefinitely (no automatic deletion)
- Manually delete old deployments to save storage

**Cleanup:**
```bash
# List deployments
doctl apps list-deployments <app-id>

# Delete old deployment
doctl apps delete-deployment <app-id> <deployment-id>
```

### Database Backups

**Storage Location:** DigitalOcean's infrastructure (separate from cluster)

**Access:** Via DigitalOcean Console or API
- Console: Databases → [Your DB] → Backups & Restore
- API: `GET /v2/databases/{db_id}/backups`

**Retention Policy:**
| Plan | Retention |
|------|-----------|
| Basic | 7 days |
| Professional | 14 days (configurable 7-35) |
| Business | 30 days (configurable up to 90) |

**Automatic Deletion:** Old backups are automatically removed based on retention policy

**Cost:** Included in database cluster pricing

### Backup Metadata (Local)

**Location:** `temp/backup-metadata.json` (or custom path)

**Contents:**
```json
{
  "timestamp": "2025-11-03T10:30:00.000Z",
  "apps": [
    {
      "id": "abc123",
      "name": "easyescrow-backend-staging",
      "status": "success",
      "deploymentId": "def456"
    }
  ],
  "databases": [
    {
      "id": "xyz789",
      "name": "easyescrow-staging-db",
      "status": "success",
      "backupId": "backup-20251103-103000"
    }
  ]
}
```

**Retention:** Manage manually or via scripts

**Recommended:** Upload to secure storage (S3, Spaces, etc.)

---

## Restoration Procedures

### Restore App Platform Deployment

#### Via Console

1. Go to: https://cloud.digitalocean.com/apps
2. Select your app
3. Go to **Settings → Deployments**
4. Find the deployment you want to restore
5. Click **Redeploy** button
6. Confirm the redeployment

#### Via doctl CLI

```bash
# List available deployments
doctl apps list-deployments <app-id>

# Redeploy a specific deployment
doctl apps create-deployment <app-id> --deployment-id <deployment-id>
```

#### Via API (TypeScript)

```typescript
const deploymentId = 'def456'; // From backup metadata
const appId = 'abc123';

const response = await fetch(
  `https://api.digitalocean.com/v2/apps/${appId}/deployments/${deploymentId}/actions/redeploy`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DIGITAL_OCEAN_API_KEY}`,
      'Content-Type': 'application/json',
    },
  }
);
```

### Restore Database Backup

#### Via Console

1. Go to: https://cloud.digitalocean.com/databases
2. Select your database cluster
3. Go to **Backups & Restore** tab
4. Find the backup you want to restore
5. Click **Restore** button
6. Choose:
   - **Restore to existing cluster** (overwrites current data)
   - **Fork to new cluster** (creates a copy)
7. Confirm restoration

⚠️ **Warning:** "Restore to existing cluster" will overwrite all current data!

#### Via doctl CLI

```bash
# List available backups
doctl databases backups list <database-id>

# Restore backup to existing cluster
doctl databases backups restore <database-id> <backup-id>

# Fork backup to new cluster (safer)
doctl databases fork <database-id> --backup-restore <backup-id> --name "restored-db"
```

#### Via API (TypeScript)

```typescript
// Fork to new cluster (recommended)
const response = await fetch(
  `https://api.digitalocean.com/v2/databases`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DIGITAL_OCEAN_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'restored-database',
      engine: 'pg',
      version: '14',
      region: 'nyc3',
      size: 'db-s-1vcpu-1gb',
      num_nodes: 1,
      restore_from_backup: {
        database_cluster_id: 'xyz789',
        backup_id: 'backup-20251103-103000',
      },
    }),
  }
);
```

### Best Practice Restoration Workflow

1. **Create a fork** of the database backup (don't overwrite production)
2. **Test the restored data** in the forked database
3. **If valid**, update your app's `DATABASE_URL` to point to the restored database
4. **Verify application functionality**
5. **If needed**, migrate data back to original cluster or keep the fork

---

## Troubleshooting

### Common Issues

#### Issue: "DIGITAL_OCEAN_API_KEY environment variable not set"

**Solution:**
```bash
# Option 1: Add to .env file
echo "DIGITAL_OCEAN_API_KEY=dop_v1_xxxxxxxx" >> .env

# Option 2: Set in current session
export DIGITAL_OCEAN_API_KEY=dop_v1_xxxxxxxx  # Linux/macOS
$env:DIGITAL_OCEAN_API_KEY="dop_v1_xxxxxxxx"  # Windows PowerShell
```

#### Issue: "API Error 401: Unauthorized"

**Causes:**
- Invalid API token
- Expired API token
- Token lacks required permissions

**Solution:**
1. Generate new token: https://cloud.digitalocean.com/account/api/tokens
2. Ensure token has `read` and `write` scopes
3. Update `DIGITAL_OCEAN_API_KEY` environment variable

#### Issue: "API Error 404: Not Found"

**Causes:**
- Incorrect app/database ID
- Resource was deleted
- Resource in different team/account

**Solution:**
1. Run `--list` to see available resources
2. Verify you're using the correct API token (check team/account)
3. Check DigitalOcean console to confirm resource exists

#### Issue: "Failed to create app deployment"

**Causes:**
- App is currently deploying
- Build error in source code
- Insufficient resources

**Solution:**
1. Wait for current deployment to finish
2. Check app logs in DigitalOcean console
3. Verify source code builds successfully
4. Try again after a few minutes

#### Issue: "Failed to create database backup"

**Causes:**
- Database is in maintenance mode
- Previous backup still in progress
- Storage quota exceeded

**Solution:**
1. Check database status in console
2. Wait 5-10 minutes and retry
3. Delete old backups if storage is full
4. Contact DO support if issue persists

### Debug Mode

Enable verbose output:

```typescript
// Modify script to add debug logging
console.log('DEBUG: API Request:', method, endpoint, body);
console.log('DEBUG: API Response:', response);
```

### API Rate Limits

**Limits:**
- 5,000 requests per hour per token
- Burst: 250 requests per minute

**If exceeded:**
- Script will fail with 429 error
- Wait until limit resets (check `RateLimit-Reset` header)
- Consider spacing out backups

---

## Best Practices

### Backup Frequency

**Recommendations:**

| Environment | Frequency | Reason |
|-------------|-----------|--------|
| **Development** | Weekly | Low risk, frequent changes |
| **Staging** | Daily | Pre-production testing |
| **Production** | Daily + Pre-deploy | Critical data protection |

**Pre-deployment backups:**
```bash
# Before deploying to production
ts-node scripts/utilities/backup-digitalocean.ts --app prod-app-id --database prod-db-id --output "backups/pre-deploy-$(date +%Y%m%d-%H%M%S).json"

# Then deploy
npm run deploy:production
```

### Backup Verification

Periodically test restorations:

1. **Monthly:** Restore database backup to a test cluster
2. **Verify data integrity:** Run queries to confirm data is complete
3. **Test application:** Connect app to restored database
4. **Document results:** Keep restoration test logs

### Metadata Management

**Store backup metadata securely:**

```bash
# Upload to DigitalOcean Spaces
s3cmd put temp/backup-metadata.json s3://your-bucket/backups/

# Or use DigitalOcean Spaces API
curl -X PUT \
  -H "Authorization: Bearer $SPACES_ACCESS_KEY" \
  --upload-file temp/backup-metadata.json \
  https://nyc3.digitaloceanspaces.com/your-bucket/backups/backup-$(date +%Y%m%d).json
```

### Disaster Recovery Plan

1. **Document resource IDs:**
   - Keep app IDs, database IDs in secure location
   - Include in disaster recovery runbook

2. **Test restoration quarterly:**
   - Full restoration simulation
   - Measure recovery time objective (RTO)
   - Update procedures based on learnings

3. **Automate critical backups:**
   - Pre-deployment
   - Daily production
   - Weekly full system

4. **Monitor backup success:**
   - Set up alerts for backup failures
   - Review backup logs weekly

### Security Considerations

1. **API Token Security:**
   - Never commit API tokens to git
   - Use environment variables or secret management
   - Rotate tokens quarterly
   - Limit token scope (use separate token for backups if possible)

2. **Metadata Security:**
   - Backup metadata files contain resource IDs
   - Store in secure location (encrypted storage)
   - Don't expose publicly

3. **Access Control:**
   - Limit who has access to backup scripts
   - Use role-based access in DigitalOcean teams
   - Audit backup operations regularly

### Cost Optimization

1. **Clean up old deployments:**
   ```bash
   # Delete deployments older than 30 days
   doctl apps list-deployments <app-id> | grep "$(date -d '30 days ago' +%Y-%m-%d)" | awk '{print $1}' | xargs -I {} doctl apps delete-deployment <app-id> {}
   ```

2. **Adjust database retention:**
   - Production: 30 days
   - Staging: 14 days
   - Development: 7 days

3. **Monitor backup storage:**
   ```bash
   # Check backup count
   doctl databases backups list <db-id> | wc -l
   ```

---

## Related Documentation

- [BACKUP_STORAGE_MANAGEMENT.md](./BACKUP_STORAGE_MANAGEMENT.md) - **⭐ Storage cleanup & management**
- [BACKUP_BEST_PRACTICES.md](./BACKUP_BEST_PRACTICES.md) - **⭐ Production best practices & security**
- [AWS_S3_BACKUP_INTEGRATION.md](./AWS_S3_BACKUP_INTEGRATION.md) - S3 integration guide
- [BACKUP_COMPARISON.md](./BACKUP_COMPARISON.md) - Compare backup systems
- [DigitalOcean API Documentation](https://docs.digitalocean.com/reference/api/)
- [App Platform Backups](https://docs.digitalocean.com/products/app-platform/how-to/manage-deployments/)
- [Database Backups](https://docs.digitalocean.com/products/databases/postgresql/how-to/backup-restore/)
- [Asset Recovery Guide](./ASSET_RECOVERY_GUIDE.md)
- [Staging Resource Tracking](./STAGING_RESOURCE_TRACKING.md)

---

**Last Updated:** November 3, 2025

