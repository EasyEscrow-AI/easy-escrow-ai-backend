# DigitalOcean Backup Utility

Automated backup scripts for DigitalOcean App Platform applications and Database clusters.

## Quick Start

### 1. Set API Keys

```bash
# DigitalOcean API Key (Required)
echo "DIGITAL_OCEAN_API_KEY=dop_v1_xxxxxxxx" >> .env

# AWS S3 Credentials (Optional - for automatic S3 uploads)
echo "AWS_S3_BUCKET=easyescrow-backups" >> .env
echo "AWS_S3_KEY=AKIA..." >> .env
echo "AWS_S3_SECRET=..." >> .env
echo "AWS_S3_REGION=us-east-1" >> .env
```

Get your DigitalOcean API key from: https://cloud.digitalocean.com/account/api/tokens  
Get your AWS credentials from: https://console.aws.amazon.com/iam/

### 2. List Resources

```bash
# See all backupable resources
npm run backup:list

# PowerShell
npm run backup:list:ps
```

### 3. Test Backup (Dry Run)

```bash
# Test without creating actual backups
npm run backup:all:dry-run

# PowerShell
npm run backup:all:dry-run:ps
```

### 4. Execute Backup

```bash
# Backup everything (local only)
npm run backup:all

# Backup everything and upload to S3 (if AWS credentials configured)
npm run backup:all:s3

# Backup only apps
npm run backup:apps

# Backup only apps to S3
npm run backup:apps:s3

# Backup only databases
npm run backup:databases

# Backup only databases to S3
npm run backup:databases:s3
```

## Features

✅ **App Platform Backups** - Creates deployment snapshots  
✅ **Database Backups** - Creates on-demand database backups  
✅ **AWS S3 Integration** - Automatic upload to S3 (optional)  
✅ **Dry Run Mode** - Test without executing  
✅ **Resource Listing** - View all backupable resources  
✅ **Selective Backup** - Backup specific apps or databases  
✅ **Metadata Storage** - Saves backup information for restoration  
✅ **Cross-Platform** - TypeScript (all platforms) + PowerShell (Windows convenience)

## Usage Examples

### List All Resources

```bash
# TypeScript (cross-platform)
ts-node scripts/utilities/backup-digitalocean.ts --list

# PowerShell (Windows)
.\scripts\utilities\backup-digitalocean.ps1 -List

# npm script
npm run backup:list
```

**Output:**
```
📱 App Platform Applications:
  • easyescrow-backend-staging
    ID: abc123def456
    Region: nyc
    Created: 11/3/2025

💾 Database Clusters:
  • easyescrow-staging-db
    ID: xyz789
    Engine: postgresql 14
    Region: nyc3
```

### Backup Everything

```bash
# TypeScript
ts-node scripts/utilities/backup-digitalocean.ts --all

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -All

# npm script
npm run backup:all
```

### Backup Specific Resources

```bash
# Single app
ts-node scripts/utilities/backup-digitalocean.ts --app abc123def456

# Multiple apps
ts-node scripts/utilities/backup-digitalocean.ts --app abc123,def456

# Single database
ts-node scripts/utilities/backup-digitalocean.ts --database xyz789

# App + Database
ts-node scripts/utilities/backup-digitalocean.ts --app abc123 --database xyz789

# PowerShell equivalents
.\scripts\utilities\backup-digitalocean.ps1 -Apps 'abc123def456'
.\scripts\utilities\backup-digitalocean.ps1 -Apps 'abc123,def456'
.\scripts\utilities\backup-digitalocean.ps1 -Databases 'xyz789'
.\scripts\utilities\backup-digitalocean.ps1 -Apps 'abc123' -Databases 'xyz789'
```

### Dry Run Mode

Test what would be backed up without creating actual backups:

```bash
ts-node scripts/utilities/backup-digitalocean.ts --all --dry-run
npm run backup:all:dry-run
```

### Custom Output Path

```bash
ts-node scripts/utilities/backup-digitalocean.ts --all --output backups/backup-20251103.json
```

## Available npm Scripts

### Without S3 Upload (Local Only)

| Script | Description |
|--------|-------------|
| `npm run backup:list` | List all backupable resources (TypeScript) |
| `npm run backup:list:ps` | List all backupable resources (PowerShell) |
| `npm run backup:all` | Backup everything (TypeScript) |
| `npm run backup:all:ps` | Backup everything (PowerShell) |
| `npm run backup:all:dry-run` | Test full backup without executing (TypeScript) |
| `npm run backup:all:dry-run:ps` | Test full backup without executing (PowerShell) |
| `npm run backup:apps` | Backup all App Platform apps (TypeScript) |
| `npm run backup:apps:ps` | Backup all App Platform apps (PowerShell) |
| `npm run backup:databases` | Backup all database clusters (TypeScript) |
| `npm run backup:databases:ps` | Backup all database clusters (PowerShell) |

### With S3 Upload (Requires AWS Credentials)

| Script | Description |
|--------|-------------|
| `npm run backup:all:s3` | Backup everything and upload to S3 (TypeScript) |
| `npm run backup:all:s3:ps` | Backup everything and upload to S3 (PowerShell) |
| `npm run backup:apps:s3` | Backup all apps and upload to S3 (TypeScript) |
| `npm run backup:apps:s3:ps` | Backup all apps and upload to S3 (PowerShell) |
| `npm run backup:databases:s3` | Backup all databases and upload to S3 (TypeScript) |
| `npm run backup:databases:s3:ps` | Backup all databases and upload to S3 (PowerShell) |

## Command Line Options

### TypeScript Script

```
ts-node scripts/utilities/backup-digitalocean.ts [options]

Options:
  --app <id>          Backup specific app by ID (comma-separated for multiple)
  --database <id>     Backup specific database by ID (comma-separated for multiple)
  --all-apps          Backup all App Platform apps
  --all-databases     Backup all database clusters
  --all               Backup everything (apps and databases)
  --list              List all resources without backing up
  --dry-run           Show what would be backed up without executing
  --output <path>     Save backup metadata to file (default: temp/backup-metadata.json)
  --s3                Upload backup metadata to AWS S3
  --s3-path <path>    Custom S3 path (default: backups/YYYY/MM/DD/backup-TIMESTAMP.json)
  --help              Show help message
```

### PowerShell Script

```
.\scripts\utilities\backup-digitalocean.ps1 [options]

Options:
  -Apps <ids>         Backup specific app(s) by ID (comma-separated)
  -Databases <ids>    Backup specific database(s) by ID (comma-separated)
  -AllApps            Backup all App Platform apps
  -AllDatabases       Backup all database clusters
  -All                Backup everything (apps and databases)
  -List               List all resources without backing up
  -DryRun             Show what would be backed up without executing
  -OutputPath <path>  Path to save backup metadata (default: temp/backup-metadata.json)
  -S3                 Upload backup metadata to AWS S3
  -S3Path <path>      Custom S3 path (default: backups/YYYY/MM/DD/backup-TIMESTAMP.json)
  -Help               Display help message
```

## What Gets Backed Up

### App Platform Applications

**Backup Method:** Creates a new deployment (snapshot)

**Includes:**
- Application source code (from connected repo)
- Build configuration
- Environment variables (not secret values)
- Service specifications
- Routing rules
- Health checks

**Retention:** Deployments kept indefinitely until manually deleted

**Cost:** Free (deployments don't count as running apps)

### Managed Database Clusters

**Backup Method:** Creates on-demand backup via API

**Includes:**
- Complete database dump
- All schemas, tables, data
- User accounts and permissions
- Database configuration

**Retention:**
- Free tier: 7 days
- Standard: 7-35 days (configurable)
- Premium: Up to 90 days

**Cost:** Included in database pricing

## Backup Metadata

Backup operations save metadata to a JSON file (default: `temp/backup-metadata.json`):

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

Use this metadata for restoration and audit trails.

## Automation

### GitHub Actions (Daily Backup)

Create `.github/workflows/backup.yml`:

```yaml
name: Daily Backup
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC daily
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - name: Backup
        env:
          DIGITAL_OCEAN_API_KEY: ${{ secrets.DIGITAL_OCEAN_API_KEY }}
        run: npm run backup:all
      - uses: actions/upload-artifact@v4
        with:
          name: backup-metadata
          path: temp/backup-*.json
          retention-days: 30
```

### Cron Job (Linux/macOS)

```bash
# Daily at 2 AM
0 2 * * * cd /path/to/project && npm run backup:all >> logs/backup.log 2>&1
```

### Windows Task Scheduler

**Task:** DigitalOcean Daily Backup  
**Trigger:** Daily at 2:00 AM  
**Action:**
```
powershell.exe -ExecutionPolicy Bypass -File "C:\path\to\project\scripts\utilities\backup-digitalocean.ps1" -All
```

## Restoration

### Restore App Deployment

**Via Console:**
1. Go to: https://cloud.digitalocean.com/apps
2. Select your app → Settings → Deployments
3. Find deployment → Click "Redeploy"

**Via CLI:**
```bash
doctl apps list-deployments <app-id>
doctl apps create-deployment <app-id> --deployment-id <deployment-id>
```

### Restore Database Backup

**Via Console:**
1. Go to: https://cloud.digitalocean.com/databases
2. Select cluster → Backups & Restore
3. Find backup → Click "Restore" or "Fork"

**Via CLI:**
```bash
# List backups
doctl databases backups list <database-id>

# Restore to existing (overwrites!)
doctl databases backups restore <database-id> <backup-id>

# Fork to new cluster (safer)
doctl databases fork <database-id> --backup-restore <backup-id> --name "restored-db"
```

⚠️ **Recommendation:** Always fork to a new cluster first, test, then switch over.

## Troubleshooting

### Error: "DIGITAL_OCEAN_API_KEY environment variable not set"

**Solution:**
```bash
# Add to .env
echo "DIGITAL_OCEAN_API_KEY=dop_v1_xxxxxxxx" >> .env

# Or export
export DIGITAL_OCEAN_API_KEY=dop_v1_xxxxxxxx
```

### Error: "API Error 401: Unauthorized"

**Causes:**
- Invalid API token
- Expired token
- Insufficient permissions

**Solution:**
1. Generate new token: https://cloud.digitalocean.com/account/api/tokens
2. Ensure `read` and `write` scopes
3. Update environment variable

### Error: "API Error 404: Not Found"

**Causes:**
- Wrong app/database ID
- Resource deleted
- Wrong account/team

**Solution:**
1. Run `npm run backup:list` to see available resources
2. Verify correct API token (check team/account)
3. Confirm resource exists in console

### Error: "Failed to create app deployment"

**Causes:**
- App currently deploying
- Build error in source
- Resource limits

**Solution:**
1. Wait for current deployment to finish
2. Check app logs in console
3. Retry after a few minutes

### Error: "Failed to create database backup"

**Causes:**
- Database in maintenance
- Previous backup in progress
- Storage quota exceeded

**Solution:**
1. Check database status in console
2. Wait 5-10 minutes and retry
3. Delete old backups if quota full

## Best Practices

### Backup Frequency

| Environment | Frequency | Reason |
|-------------|-----------|--------|
| Development | Weekly | Low risk |
| Staging | Daily | Testing |
| Production | Daily + Pre-deploy | Critical data |

### Pre-Deployment Backup

```bash
# Before deploying to production
npm run backup:all
# Then deploy
npm run deploy:production
```

### Backup Verification

**Monthly:**
1. Restore database to test cluster
2. Verify data integrity
3. Test application with restored data
4. Document results

### Security

- Never commit API tokens to git
- Use environment variables or secret management
- Rotate tokens quarterly
- Store metadata in secure location

## AWS S3 Integration

Upload backup metadata automatically to AWS S3 for secure, off-site storage.

### Setup

```bash
# Add to .env
AWS_S3_BUCKET=easyescrow-backups
AWS_S3_KEY=AKIA...
AWS_S3_SECRET=...
AWS_S3_REGION=us-east-1  # Optional, defaults to us-east-1
```

### Usage

```bash
# Backup and upload to S3
npm run backup:all:s3

# With custom S3 path
ts-node scripts/utilities/backup-digitalocean.ts --all --s3 --s3-path production/backup.json
```

### S3 Path Structure (Default)

```
s3://easyescrow-backups/
└── backups/
    └── 2025/
        └── 11/
            └── 03/
                └── backup-2025-11-03_10-30-00.json
```

**See:** [AWS_S3_BACKUP_INTEGRATION.md](../../docs/operations/AWS_S3_BACKUP_INTEGRATION.md) for complete S3 integration guide.

## Related Documentation

- [BACKUP_BEST_PRACTICES.md](../../docs/operations/BACKUP_BEST_PRACTICES.md) - **⭐ Production best practices & security**
- [AWS S3 Backup Integration](../../docs/operations/AWS_S3_BACKUP_INTEGRATION.md)
- [Complete Backup Guide](../../docs/operations/DIGITALOCEAN_BACKUP_GUIDE.md)
- [DigitalOcean API Docs](https://docs.digitalocean.com/reference/api/)
- [Asset Recovery Guide](../../docs/operations/ASSET_RECOVERY_GUIDE.md)

## Support

For issues or questions:
1. Check [Complete Backup Guide](../../docs/operations/DIGITALOCEAN_BACKUP_GUIDE.md)
2. Review [Troubleshooting section](#troubleshooting)
3. Check DigitalOcean status: https://status.digitalocean.com/

---

**Last Updated:** November 3, 2025

