# Backup Storage Management

This guide explains how backup files are managed, cleaned up, and how to prevent storage issues on DigitalOcean servers.

## 🎯 Storage Strategy Overview

### Where Backups Are Stored

| Location | Purpose | Persistence | Cleanup |
|----------|---------|-------------|---------|
| **Local `temp/` directory** | Temporary staging | Until upload completes | ✅ Automatic |
| **AWS S3** | Long-term off-site storage | Permanent | 🔄 Lifecycle policies |
| **DigitalOcean** | Automatic daily backups | 7-30 days | ✅ Automatic |

---

## 🧹 Automatic Cleanup

### ✅ What's Cleaned Up Automatically

Both backup scripts now automatically clean up temp files after successful S3 upload:

#### Database Dumps (`backup-databases-to-s3.ts`)
```
📦 Creating database dump...             → Creates temp/db-backups/*.dump
☁️  Uploading to S3...                   → Uploads to S3
🧹 Cleaning up local file...             → ✅ Deletes temp file
```

#### App Metadata (`backup-digitalocean.ts`)
```
💾 Backup metadata saved...              → Creates temp/backup-metadata.json
☁️  Uploading to S3...                   → Uploads to S3
🧹 Cleaned up local backup file          → ✅ Deletes temp file
```

### ✅ Error Handling

Files are also cleaned up if operations fail:

```typescript
// If S3 upload fails after dump creation
catch (error) {
  if (dumpFilePath && fs.existsSync(dumpFilePath)) {
    fs.unlinkSync(dumpFilePath);  // Clean up failed dump
  }
}
```

---

## 🏢 DigitalOcean App Platform Storage

### Ephemeral Filesystem

**Important**: App Platform instances have **ephemeral** storage:

- **2GB limit** total filesystem size
- **Resets on every deployment** or restart
- **Not persistent** across restarts
- **Should not** store stateful data

### How This Affects Backups

When running backups on App Platform:

1. **Dump files are temporary** - Created in `/workspace/temp/`
2. **Automatically cleaned** - Deleted after S3 upload
3. **Reset on redeploy** - Any orphaned files vanish on restart
4. **No accumulation** - Files don't persist between runs

**Best Practice**: Always upload to S3 and clean up immediately (which our scripts do).

---

## 🧹 Manual Cleanup Utility

For cleaning up orphaned temp files (e.g., if a backup was interrupted):

### Quick Commands

```bash
# Preview what would be cleaned (dry run)
npm run backup:cleanup:dry-run

# Remove files older than 7 days (default)
npm run backup:cleanup

# Remove ALL temp backup files
npm run backup:cleanup:all
```

### Advanced Usage

```bash
# Remove files older than 1 day
ts-node scripts/utilities/cleanup-temp-backups.ts --older-than 1

# Remove files older than 30 days
ts-node scripts/utilities/cleanup-temp-backups.ts --older-than 30

# Dry run with custom age
ts-node scripts/utilities/cleanup-temp-backups.ts --older-than 3 --dry-run
```

### What Gets Cleaned

The cleanup utility scans:
- `temp/backup-metadata.json` - App metadata backup file
- `temp/db-backups/` - Database dump files
- All subdirectories recursively

---

## 📊 Storage Usage Monitoring

### Check Local Storage

```bash
# Check temp directory size
du -sh temp/

# List all backup files with sizes
du -h temp/db-backups/*

# Count backup files
ls -1 temp/db-backups/ | wc -l
```

### Check S3 Storage

```bash
# List all backup files in S3
aws s3 ls s3://easyescrow-backups/ --recursive --human-readable --summarize

# Check specific date
aws s3 ls s3://easyescrow-backups/database-backups/2025/11/03/ --human-readable

# Get total bucket size
aws s3 ls s3://easyescrow-backups/ --recursive | awk '{sum += $3} END {print sum/1024/1024/1024 " GB"}'
```

---

## ☁️ S3 Lifecycle Policies

Manage long-term S3 costs with lifecycle policies:

### Recommended Policy

```json
{
  "Rules": [
    {
      "Id": "TransitionOldBackups",
      "Status": "Enabled",
      "Prefix": "database-backups/",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "GLACIER"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    },
    {
      "Id": "DeleteOldMetadata",
      "Status": "Enabled",
      "Prefix": "backups/",
      "Expiration": {
        "Days": 90
      }
    }
  ]
}
```

### What This Does

| Age | Database Dumps | Metadata Files |
|-----|----------------|----------------|
| **0-30 days** | S3 Standard ($0.023/GB/month) | S3 Standard |
| **30-365 days** | S3 Glacier ($0.004/GB/month) | Deleted after 90 days |
| **365+ days** | Deleted automatically | N/A |

### Apply Lifecycle Policy

```bash
# Save policy to file
cat > lifecycle-policy.json << 'EOF'
{
  "Rules": [
    {
      "Id": "TransitionOldBackups",
      "Status": "Enabled",
      "Prefix": "database-backups/",
      "Transitions": [{"Days": 30, "StorageClass": "GLACIER"}],
      "Expiration": {"Days": 365}
    }
  ]
}
EOF

# Apply to bucket
aws s3api put-bucket-lifecycle-configuration \
  --bucket easyescrow-backups \
  --lifecycle-configuration file://lifecycle-policy.json
```

---

## 🔄 DigitalOcean Automatic Backups

DigitalOcean automatically backs up managed databases:

### Automatic Backup Retention

| Plan | Retention Period | Point-in-Time Recovery |
|------|------------------|------------------------|
| **Basic** | 7 days | Last 7 days |
| **Professional** | 14 days | Last 14 days |
| **Enterprise** | 30 days | Last 30 days |

### View DigitalOcean Backups

```bash
# List automatic backups
doctl databases backups list <database-id>

# View backup details
doctl databases backups get <database-id> <backup-id>
```

**Note**: These backups are managed by DigitalOcean and do not consume your storage.

---

## 📅 Scheduled Cleanup (GitHub Actions)

Automate cleanup in CI/CD:

```yaml
name: Weekly Backup Cleanup

on:
  schedule:
    # Every Sunday at 3 AM
    - cron: '0 3 * * 0'
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run cleanup
        run: npm run backup:cleanup
```

---

## 🚨 Storage Emergency Procedures

### If Temp Directory Fills Up

**On Local Development**:
```bash
# Remove all temp backup files immediately
npm run backup:cleanup:all

# Or manually
rm -rf temp/backup-metadata.json
rm -rf temp/db-backups/*
```

**On App Platform**:
- Temp files reset on every deployment
- Deploy a new version to clear filesystem
- Or restart the app (loses all ephemeral data)

### If S3 Costs Are Too High

1. **Check current usage**:
   ```bash
   aws s3 ls s3://easyescrow-backups/ --recursive --summarize
   ```

2. **Apply lifecycle policy** (see above)

3. **Delete old backups manually**:
   ```bash
   # Delete backups older than specific date
   aws s3 rm s3://easyescrow-backups/database-backups/2024/ --recursive
   ```

4. **Adjust backup frequency** in GitHub Actions

---

## 💰 Cost Optimization

### S3 Storage Costs

| Scenario | Storage | Monthly Cost |
|----------|---------|--------------|
| **Daily backups (30 days)** | 30 × 250MB = 7.5GB | $0.17/month |
| **Daily backups (365 days)** | 365 × 250MB = 91GB | $2.09/month |
| **With Glacier transition** | Same data | $0.51/month |

**Recommendation**: Use lifecycle policies to transition old backups to Glacier.

### DigitalOcean Database Backups

**Cost**: Included in database plan (no additional charge)

**Storage**: Does not count against your account quota

---

## 📋 Cleanup Checklist

### Daily (Automated)
- ✅ Temp files auto-deleted after S3 upload
- ✅ DigitalOcean creates automatic database backup

### Weekly (Optional)
- 🔄 Run manual cleanup to catch orphaned files
- 🔄 Verify S3 storage usage

### Monthly
- 🔄 Review S3 costs
- 🔄 Verify lifecycle policies are working
- 🔄 Check DigitalOcean automatic backups exist

### Quarterly
- 🔄 Test restore procedure
- 🔄 Review backup retention policy
- 🔄 Clean up old S3 backups if needed

---

## 🔍 Troubleshooting

### Orphaned Files in `temp/`

**Cause**: Backup script was interrupted (e.g., Ctrl+C, server restart)

**Solution**:
```bash
npm run backup:cleanup:all
```

### `temp/` Directory Doesn't Exist

**Cause**: Never run backups, or directory was deleted

**Solution**: Directory is created automatically on first backup

### Can't Delete Files (Permission Error)

**Cause**: Files owned by different user or locked

**Solution**:
```bash
# Force delete (Windows)
Remove-Item -Recurse -Force temp\db-backups\*

# Force delete (Linux/Mac)
sudo rm -rf temp/db-backups/*
```

### S3 Lifecycle Not Working

**Verify policy**:
```bash
aws s3api get-bucket-lifecycle-configuration --bucket easyescrow-backups
```

**Check transition status**:
```bash
aws s3api list-objects-v2 --bucket easyescrow-backups --query 'Contents[?StorageClass==`GLACIER`]'
```

---

## 📚 Related Documentation

- [Backup Best Practices](./BACKUP_BEST_PRACTICES.md)
- [Database Backup to S3](./DATABASE_BACKUP_TO_S3.md)
- [AWS S3 Integration](./AWS_S3_BACKUP_INTEGRATION.md)
- [Backup Comparison](./BACKUP_COMPARISON.md)

---

## 🎯 Summary

**Automatic Cleanup**: ✅ Both scripts clean up after S3 upload  
**Manual Cleanup**: `npm run backup:cleanup`  
**App Platform**: Ephemeral filesystem resets on deploy  
**S3 Management**: Use lifecycle policies for cost control  
**DigitalOcean**: Automatic backups included, no action needed  

**Best Practice**: Let automatic cleanup handle normal operations, use manual cleanup for emergencies.

