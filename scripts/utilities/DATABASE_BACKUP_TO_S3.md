# Database Backup to S3 - Complete Guide

This utility creates **actual PostgreSQL database dumps** and uploads them to AWS S3 for true off-site backups.

## 🆚 vs. Metadata-Only Backups

| Feature | Metadata Backups (`backup-digitalocean.ts`) | Database Dumps (`backup-databases-to-s3.ts`) |
|---------|---------------------------------------------|---------------------------------------------|
| **What's backed up** | Deployment IDs, references | Actual database data |
| **File size** | < 1KB (JSON) | 10MB - 10GB+ (SQL dump) |
| **Restore speed** | Depends on DigitalOcean | Immediate with pg_restore |
| **Off-site protection** | Partial (metadata only) | Complete (full data) |
| **Use case** | Tracking/auditing | Disaster recovery |

## 📦 What This Script Does

1. **Connects to DigitalOcean databases** via API
2. **Runs `pg_dump`** to export database data
3. **Compresses the dump** (custom format with compression)
4. **Uploads to AWS S3** using native Node.js (no SDK needed)
5. **Cleans up** local temp files

## 🔧 Prerequisites

### Required Tools

```powershell
# Check if you have the required tools
node --version          # Should show v18+
npm --version           # Should show v9+
pg_dump --version       # Should show PostgreSQL 12+
```

**If missing:**
- **Node.js**: https://nodejs.org/
- **PostgreSQL Client**: https://www.postgresql.org/download/
  - Windows: Download installer and select "Command Line Tools"
  - Mac: `brew install postgresql@15`
  - Linux: `sudo apt-get install postgresql-client`

### Environment Variables

Add to your `.env` file:

```env
# DigitalOcean
DIGITAL_OCEAN_API_KEY=dop_v1_xxxxx

# AWS S3
AWS_S3_BUCKET=easyescrow-backups
AWS_S3_KEY=your-aws-access-key-id
AWS_S3_SECRET=your-aws-secret-access-key
AWS_S3_REGION=us-east-1
```

## 🚀 Quick Start

### Backup All Databases

```bash
# npm
npm run backup:db-dumps

# Or PowerShell
.\scripts\utilities\backup-databases-to-s3.ps1 -All
```

### Backup Specific Database

```bash
# Production database only
npm run backup:db-dumps:production

# Staging database only
npm run backup:db-dumps:staging

# Or specify any database ID
npm run ts-node scripts/utilities/backup-databases-to-s3.ts --database YOUR_DB_ID
```

### Dry Run (Preview)

```bash
# See what would be backed up without actually doing it
npm run backup:db-dumps:dry-run
```

## 📋 npm Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run backup:db-dumps` | Backup all databases to S3 |
| `npm run backup:db-dumps:dry-run` | Preview what would be backed up |
| `npm run backup:db-dumps:production` | Backup production database only |
| `npm run backup:db-dumps:staging` | Backup staging database only |

## 🎯 Command Line Options

### TypeScript

```bash
ts-node scripts/utilities/backup-databases-to-s3.ts [options]

Options:
  --database <id>       Backup specific database by ID (comma-separated for multiple)
  --all                 Backup all databases
  --dry-run             Show what would be backed up without executing
  --compression <1-9>   Compression level (default: 1 for fastest)
  --output-dir <path>   Local temp directory (default: temp/db-backups)
  --s3-prefix <path>    S3 path prefix (default: database-backups/YYYY/MM/DD)
  --help                Show help message

Examples:
  # Backup all databases
  ts-node scripts/utilities/backup-databases-to-s3.ts --all

  # Backup specific database
  ts-node scripts/utilities/backup-databases-to-s3.ts --database b0f97f57-f399-4727-8abf-dc741cc9a5d2

  # Backup multiple databases
  ts-node scripts/utilities/backup-databases-to-s3.ts --database db1-id,db2-id

  # Higher compression (slower but smaller files)
  ts-node scripts/utilities/backup-databases-to-s3.ts --all --compression 6

  # Custom S3 path
  ts-node scripts/utilities/backup-databases-to-s3.ts --all --s3-prefix backups/weekly
```

### PowerShell

```powershell
.\scripts\utilities\backup-databases-to-s3.ps1 [options]

Parameters:
  -Database <id>        Backup specific database by ID
  -All                  Backup all databases
  -DryRun               Preview what would be backed up
  -Compression <1-9>    Compression level (default: 1)
  -OutputDir <path>     Local temp directory
  -S3Prefix <path>      S3 path prefix

Examples:
  # Backup all databases
  .\backup-databases-to-s3.ps1 -All

  # Backup specific database
  .\backup-databases-to-s3.ps1 -Database "b0f97f57-f399-4727-8abf-dc741cc9a5d2"

  # Dry run
  .\backup-databases-to-s3.ps1 -All -DryRun

  # Higher compression
  .\backup-databases-to-s3.ps1 -All -Compression 6
```

## 📁 S3 Storage Structure

Dumps are organized by date for easy management:

```
s3://easyescrow-backups/
└── database-backups/
    └── 2025/
        └── 11/
            └── 03/
                ├── production-db-2025-11-03T14-30-00.dump
                ├── staging-db-2025-11-03T14-30-45.dump
                └── dev-db-2025-11-03T14-31-20.dump
```

**Custom prefix example:**

```bash
# Use custom prefix
ts-node scripts/utilities/backup-databases-to-s3.ts --all --s3-prefix backups/weekly

# Results in:
# s3://easyescrow-backups/backups/weekly/production-db-2025-11-03T14-30-00.dump
```

## 🔒 Compression Levels

The `-Fc` flag uses PostgreSQL's custom format with compression:

| Level | Speed | Size | Best For |
|-------|-------|------|----------|
| **1** (default) | Fastest | 60-70% compression | Daily automated backups |
| **3-5** | Balanced | 70-80% compression | Weekly backups |
| **6-9** | Slowest | 80-90% compression | Long-term archival |

**Example:**

```bash
# Fast daily backup (level 1, ~3 minutes for 1GB)
npm run backup:db-dumps

# Balanced weekly backup (level 5, ~8 minutes for 1GB)
ts-node scripts/utilities/backup-databases-to-s3.ts --all --compression 5

# Archival backup (level 9, ~15 minutes for 1GB)
ts-node scripts/utilities/backup-databases-to-s3.ts --all --compression 9
```

## 📊 Example Output

```
╔═══════════════════════════════════════════════════════════╗
║      Database Backup to S3 Utility                        ║
╚═══════════════════════════════════════════════════════════╝

💾 Backing up databases...

  • easyescrow-production (b0f97f57-f399-4727-8abf-dc741cc9a5d2)
    Engine: pg 15
    Size: db-s-2vcpu-4gb
    📦 Creating database dump...
    ✅ Dump created: 234.56MB
    ☁️  Uploading to S3: s3://easyescrow-backups/database-backups/2025/11/03/easyescrow-production-2025-11-03T14-30-00.dump
    ✅ Uploaded to S3 successfully
    📍 S3 Location: s3://easyescrow-backups/database-backups/2025/11/03/easyescrow-production-2025-11-03T14-30-00.dump

  • easyescrow-staging (c172d515-f258-412a-b8e8-6e821eb953be)
    Engine: pg 15
    Size: db-s-1vcpu-2gb
    📦 Creating database dump...
    ✅ Dump created: 45.67MB
    ☁️  Uploading to S3: s3://easyescrow-backups/database-backups/2025/11/03/easyescrow-staging-2025-11-03T14-30-45.dump
    ✅ Uploaded to S3 successfully
    📍 S3 Location: s3://easyescrow-backups/database-backups/2025/11/03/easyescrow-staging-2025-11-03T14-30-45.dump

╔═══════════════════════════════════════════════════════════╗
║                    Backup Summary                          ║
╚═══════════════════════════════════════════════════════════╝

Databases: 2 succeeded, 0 failed
Timestamp: 2025-11-03T14:31:00.000Z
```

## 🔄 Restoring from Backups

### Download from S3

```bash
# Using AWS CLI
aws s3 cp s3://easyescrow-backups/database-backups/2025/11/03/production-db-2025-11-03T14-30-00.dump ./restore.dump

# Or download via S3 console
```

### Restore to Database

```bash
# Restore to local database
pg_restore -h localhost -U postgres -d mydatabase restore.dump

# Restore to DigitalOcean database
pg_restore -h <db-host> -U doadmin -d defaultdb restore.dump

# Options:
#   -c            Clean (drop) database objects before recreating
#   -d <dbname>   Connect to database name
#   -j <jobs>     Use parallel restore (faster for large databases)
#   --no-owner    Skip ownership restoration
#   --no-acl      Skip access privileges restoration
```

### Example Restore Workflow

```bash
# 1. Download backup
aws s3 cp s3://easyescrow-backups/database-backups/2025/11/03/production-db.dump ./restore.dump

# 2. Create fresh database
createdb my_restored_db

# 3. Restore
pg_restore -d my_restored_db restore.dump

# 4. Verify
psql -d my_restored_db -c "SELECT COUNT(*) FROM users;"
```

## ⏰ Scheduling Automated Backups

### GitHub Actions (Recommended)

Create `.github/workflows/database-backup.yml`:

```yaml
name: Database Backup to S3

on:
  schedule:
    # Daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch: # Manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install PostgreSQL Client
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run Database Backup
        env:
          DIGITAL_OCEAN_API_KEY: ${{ secrets.DIGITAL_OCEAN_API_KEY }}
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_S3_KEY: ${{ secrets.AWS_S3_KEY }}
          AWS_S3_SECRET: ${{ secrets.AWS_S3_SECRET }}
        run: npm run backup:db-dumps
```

### Cron Job (Linux/Mac)

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/project && /usr/bin/npm run backup:db-dumps >> /var/log/db-backup.log 2>&1
```

### Windows Task Scheduler

```powershell
# Create scheduled task
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -File C:\path\to\scripts\utilities\backup-databases-to-s3.ps1 -All"

$trigger = New-ScheduledTaskTrigger -Daily -At 2am

Register-ScheduledTask -Action $action -Trigger $trigger `
  -TaskName "DatabaseBackupToS3" -Description "Daily database backup to S3"
```

## 🛡️ Security Best Practices

### Environment Variables

- ✅ **DO**: Store in `.env` (gitignored)
- ✅ **DO**: Use GitHub Secrets for CI/CD
- ❌ **DON'T**: Hardcode in scripts
- ❌ **DON'T**: Commit to git

### SSL Verification

This script uses `sslmode=require` for database connections. **Never disable SSL verification** in production.

### S3 Bucket Security

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl"
      ],
      "Resource": "arn:aws:s3:::easyescrow-backups/database-backups/*"
    }
  ]
}
```

## 💰 Cost Considerations

### Storage Costs (AWS S3 Standard)

| Database Size | Compressed Size (Level 1) | Monthly Cost (30 days) |
|---------------|---------------------------|------------------------|
| 100MB | ~70MB | $0.002/month |
| 1GB | ~700MB | $0.016/month |
| 10GB | ~7GB | $0.16/month |
| 100GB | ~70GB | $1.61/month |

**Formula**: $0.023/GB/month for S3 Standard

### Cost Optimization

- **S3 Intelligent-Tiering**: Auto-moves to cheaper storage after 30 days
- **S3 Glacier**: For long-term archival ($0.004/GB/month)
- **Lifecycle Policies**: Auto-delete old backups after N days

**Example lifecycle policy:**

```json
{
  "Rules": [{
    "Id": "DeleteOldBackups",
    "Prefix": "database-backups/",
    "Status": "Enabled",
    "Expiration": { "Days": 90 },
    "Transitions": [{
      "Days": 30,
      "StorageClass": "GLACIER"
    }]
  }]
}
```

## 🔍 Troubleshooting

### Error: `pg_dump: command not found`

**Solution**: Install PostgreSQL client tools
```bash
# Windows
# Download from https://www.postgresql.org/download/windows/

# Mac
brew install postgresql@15

# Linux
sudo apt-get install postgresql-client
```

### Error: `connection refused`

**Issue**: Database firewall or SSL configuration

**Solution**:
1. Verify database is running
2. Check firewall allows connections from your IP
3. Ensure SSL is properly configured

### Error: `S3 Upload failed: 403 Forbidden`

**Issue**: Invalid AWS credentials or insufficient permissions

**Solution**:
1. Verify `AWS_S3_KEY` and `AWS_S3_SECRET` in `.env`
2. Check IAM user has `s3:PutObject` permission
3. Verify bucket name is correct

### Error: `timeout of 600000ms exceeded`

**Issue**: Database dump taking too long (> 10 minutes)

**Solution**: Increase timeout in script or use lower compression level
```bash
# Use faster compression
npm run ts-node scripts/utilities/backup-databases-to-s3.ts --all --compression 1
```

## 📚 Related Documentation

- [Backup Storage Management](../../docs/operations/BACKUP_STORAGE_MANAGEMENT.md) - Storage cleanup and management
- [DigitalOcean Backup Guide](../../docs/operations/DIGITALOCEAN_BACKUP_GUIDE.md)
- [Backup Best Practices](../../docs/operations/BACKUP_BEST_PRACTICES.md)
- [AWS S3 Integration](../../docs/operations/AWS_S3_BACKUP_INTEGRATION.md)
- [Backup Comparison](../../docs/operations/BACKUP_COMPARISON.md)

## 🆘 Support

For issues or questions:
1. Check troubleshooting section above
2. Review related documentation
3. Check backup logs in console output
4. Verify environment variables are set correctly

