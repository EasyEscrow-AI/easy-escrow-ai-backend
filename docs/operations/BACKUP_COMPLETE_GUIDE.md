# Complete Backup System Guide

Complete reference for the Easy Escrow backup system.

## 📚 Documentation Index

### Quick Start
1. [GitHub Secrets Setup](../setup/GITHUB_SECRETS_SETUP.md) - **⭐ Start Here**
2. [Backup Scheduling](./BACKUP_SCHEDULING.md) - Set up automated backups
3. [Test Your Setup](#quick-test) - Verify everything works

### Core Documentation
- [Database Backup to S3](../../scripts/utilities/DATABASE_BACKUP_TO_S3.md) - Database dump guide
- [DigitalOcean Backup Guide](./DIGITALOCEAN_BACKUP_GUIDE.md) - DO integration
- [Backup Comparison](./BACKUP_COMPARISON.md) - Understand backup types

### Advanced Topics
- [Backup Storage Management](./BACKUP_STORAGE_MANAGEMENT.md) - Cleanup & lifecycle
- [Backup Best Practices](./BACKUP_BEST_PRACTICES.md) - Production best practices
- [AWS S3 Integration](./AWS_S3_BACKUP_INTEGRATION.md) - S3 configuration

---

## 🚀 Quick Start (5 Minutes)

### 1. Setup GitHub Secrets

Follow [GitHub Secrets Setup Guide](../setup/GITHUB_SECRETS_SETUP.md) to add:
- `DIGITAL_OCEAN_API_KEY`
- `AWS_S3_BUCKET`
- `AWS_S3_KEY`
- `AWS_S3_SECRET`
- `AWS_S3_REGION`

### 2. Test Manually

```bash
# Test locally first
npm run backup:complete

# Or trigger GitHub Action
# Go to: Repository → Actions → Daily Database Backup → Run workflow
```

### 3. Verify

```bash
# Check S3 for backups
aws s3 ls s3://easyescrow-backups/database-backups/$(date +%Y/%m/%d)/

# Or check AWS Console
# https://s3.console.aws.amazon.com/s3/buckets/easyescrow-backups
```

### 4. Done! 🎉

Backups will now run automatically:
- **Daily**: 2 AM UTC
- **Weekly**: Sunday 2 AM UTC (with logs)

---

## 🎯 System Overview

```
┌─────────────────────────────────────────────────────────┐
│              GitHub Actions (Scheduled)                  │
│  ┌──────────────┐    ┌──────────────┐                  │
│  │ Daily Backup │    │Weekly Backup │                  │
│  │   2 AM UTC   │    │ Sunday 2 AM  │                  │
│  └──────┬───────┘    └──────┬───────┘                  │
└─────────┼───────────────────┼──────────────────────────┘
          │                   │
          └───────┬───────────┘
                  │
       ┌──────────▼──────────┐
       │ npm run backup:     │
       │     complete        │
       └──────────┬──────────┘
                  │
      ┌───────────┴───────────┐
      │                       │
      ▼                       ▼
┌──────────┐           ┌──────────┐
│App Meta  │           │Database  │
│Backup    │           │Dumps     │
└────┬─────┘           └────┬─────┘
     │                      │
     ▼                      ▼
┌────────────────────────────────┐
│         AWS S3                 │
│  easyescrow-backups/           │
│  ├─ backups/                   │
│  │  └─ 2025/11/03/            │
│  │     └─ backup-*.json       │
│  └─ database-backups/          │
│     └─ 2025/11/03/            │
│        ├─ prod-db-*.dump      │
│        └─ staging-db-*.dump   │
└────────────────────────────────┘
```

---

## 📦 What Gets Backed Up

### 1. App Metadata (`backup:apps:s3`)
**Size**: < 1KB  
**Content**: Deployment IDs, Git commits, configuration  
**Location**: `s3://easyescrow-backups/backups/YYYY/MM/DD/`

### 2. Database Dumps (`backup:db-dumps`)
**Size**: 10MB - 10GB  
**Content**: Complete PostgreSQL data  
**Location**: `s3://easyescrow-backups/database-backups/YYYY/MM/DD/`

### 3. DigitalOcean Automatic Backups
**Frequency**: Daily  
**Retention**: 7-30 days (depends on plan)  
**Location**: DigitalOcean servers (automatic)

---

## 🛠️ Available Commands

### Local Execution

```bash
# Complete backup (apps + databases)
npm run backup:complete

# Database dumps only
npm run backup:db-dumps
npm run backup:db-dumps:production
npm run backup:db-dumps:staging

# App metadata only
npm run backup:apps:s3

# Cleanup
npm run backup:cleanup
npm run backup:cleanup:dry-run
npm run backup:cleanup:all

# Security test
npm run backup:test-s3-security
```

### GitHub Actions

**Manual Trigger**:
1. Go to **Actions** tab
2. Select workflow
3. Click **Run workflow**

**View Logs**:
1. Go to **Actions** tab
2. Click on workflow run
3. Click on job to see logs

---

## 🔍 Monitoring

### Check Backup Status

**GitHub Actions**:
```
Repository → Actions → Check workflow status
Green ✅ = Success
Red ❌ = Failed
```

**S3 Console**:
```
https://s3.console.aws.amazon.com/s3/buckets/easyescrow-backups
```

**AWS CLI**:
```bash
# Today's backups
aws s3 ls s3://easyescrow-backups/database-backups/$(date +%Y/%m/%d)/

# This month
aws s3 ls s3://easyescrow-backups/database-backups/$(date +%Y/%m)/ --recursive

# Total size
aws s3 ls s3://easyescrow-backups/ --recursive --summarize --human-readable
```

### Notifications

**Default**: GitHub sends email on workflow failures

**Setup custom**: See [Backup Scheduling Guide](./BACKUP_SCHEDULING.md#email-notifications)

---

## 🔄 Restore Procedures

### Restore Database

```bash
# 1. Download backup from S3
aws s3 cp s3://easyescrow-backups/database-backups/2025/11/03/prod-db.dump ./restore.dump

# 2. Restore to database
pg_restore -h your-db-host \
           -U doadmin \
           -d defaultdb \
           -c \
           restore.dump

# Options:
#   -c           Clean (drop) objects before recreating
#   -j 4         Use 4 parallel jobs (faster)
#   --no-owner   Skip ownership restoration
#   --no-acl     Skip access privileges
```

### Restore App Deployment

```bash
# 1. Get deployment ID from metadata JSON
# deploymentId: "0bc3fba5-afaa-42da-8e82-1d301f052037"

# 2. Redeploy via DigitalOcean console or CLI
doctl apps create-deployment <app-id> --deployment-id <deployment-id>
```

**Or via Console**:
1. Go to App Platform → Your App
2. Scroll to deployments list
3. Find the deployment
4. Click **⋮** → **Redeploy**

---

## 💰 Cost Breakdown

### Storage Costs (S3)

| Scenario | Size | Monthly Cost |
|----------|------|--------------|
| **Daily for 30 days** | ~7.5GB | $0.17 |
| **Daily for 365 days** | ~91GB | $2.09 |
| **With Glacier (30+ days)** | Same | $0.51 |

### Compute Costs

| Service | Cost |
|---------|------|
| **GitHub Actions** | Free (public repos) |
| **DigitalOcean DB Backups** | Included in plan |

**Total Monthly**: < $0.60 with Glacier, ~$2 without

---

## 🔒 Security

### Credentials

- ✅ **Write-only S3 access** (verified with `backup:test-s3-security`)
- ✅ **GitHub Secrets** (encrypted at rest)
- ✅ **No secrets in code**
- ✅ **Automatic cleanup** (no sensitive data on disk)

### Test Security

```bash
npm run backup:test-s3-security
```

Expected results:
- ✅ PUT (upload) succeeds
- 🔒 GET (download) fails with 403
- 🔒 DELETE fails with 403
- 🔒 LIST fails with 403

---

## 📋 Maintenance Checklist

### Daily (Automatic)
- ✅ Backup runs via GitHub Actions
- ✅ Temp files cleaned up automatically

### Weekly
- 🔄 Check GitHub Actions status
- 🔄 Verify backups in S3

### Monthly
- 🔄 Review S3 costs
- 🔄 Test restore procedure
- 🔄 Verify S3 lifecycle policy

### Quarterly
- 🔄 Rotate API tokens (DigitalOcean + AWS)
- 🔄 Test full disaster recovery
- 🔄 Review retention policy

---

## 🆘 Troubleshooting

### Backup Fails

**Check**:
1. GitHub Secrets are set correctly
2. DigitalOcean API token is valid
3. AWS credentials are valid
4. Database is accessible

**Test locally**:
```bash
npm run backup:complete
```

### S3 Upload Fails

**Test permissions**:
```bash
npm run backup:test-s3-security
```

**Check IAM policy**:
```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject"],
  "Resource": "arn:aws:s3:::easyescrow-backups/*"
}
```

### Database Connection Timeout

**Check**:
1. Database firewall allows GitHub Actions IPs
2. Database is running
3. Connection string is correct

**Or**: Run backups from DigitalOcean App Platform (same network)

---

## 📚 Full Documentation Links

### Setup
- [GitHub Secrets Setup](../setup/GITHUB_SECRETS_SETUP.md)
- [Backup Scheduling](./BACKUP_SCHEDULING.md)

### Operation
- [Database Backup to S3](../../scripts/utilities/DATABASE_BACKUP_TO_S3.md)
- [Storage Management](./BACKUP_STORAGE_MANAGEMENT.md)
- [Best Practices](./BACKUP_BEST_PRACTICES.md)

### Reference
- [DigitalOcean Integration](./DIGITALOCEAN_BACKUP_GUIDE.md)
- [AWS S3 Integration](./AWS_S3_BACKUP_INTEGRATION.md)
- [Backup Comparison](./BACKUP_COMPARISON.md)

---

## 🎯 Quick Reference Card

```bash
# Run complete backup
npm run backup:complete

# Test security
npm run backup:test-s3-security

# View backups
aws s3 ls s3://easyescrow-backups/database-backups/$(date +%Y/%m/%d)/

# Cleanup temp files
npm run backup:cleanup

# Restore database
pg_restore -h DB_HOST -U doadmin -d defaultdb restore.dump
```

**GitHub Actions**: Repository → Actions → Run workflow

---

**Last Updated**: November 3, 2025

