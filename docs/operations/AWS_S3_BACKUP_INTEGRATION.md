# AWS S3 Backup Integration

**Date:** November 3, 2025  
**Status:** ✅ Complete

---

## Overview

The DigitalOcean backup utility now supports automatically uploading backup metadata to AWS S3 for secure, off-site storage.

**Key Benefits:**
- ✅ **Automatic S3 uploads** - Backup metadata stored securely in your S3 bucket
- ✅ **Organized structure** - Automatic date-based folder organization
- ✅ **No dependencies** - Uses native Node.js `https` and `crypto` modules (no AWS SDK required)
- ✅ **AWS Signature V4** - Secure authentication using AWS standards
- ✅ **Flexible paths** - Custom S3 paths or automatic date-based structure

---

## Setup

### 1. Create AWS S3 Bucket

If you don't already have one:

```bash
# Via AWS CLI
aws s3 mb s3://easyescrow-backups --region us-east-1

# Or create via AWS Console:
# https://s3.console.aws.amazon.com/s3/bucket/create
```

### 2. Create IAM User with S3 Access

**Create IAM user** with programmatic access:

1. Go to: https://console.aws.amazon.com/iam/home#/users
2. Click "Add users"
3. Username: `easyescrow-backup-service`
4. Access type: **Programmatic access**
5. Attach policy: `AmazonS3FullAccess` (or custom policy below)

**Recommended Custom Policy** (least privilege):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::easyescrow-backups",
        "arn:aws:s3:::easyescrow-backups/*"
      ]
    }
  ]
}
```

### 3. Add Credentials to `.env`

```bash
# AWS S3 Backup Configuration
AWS_S3_BUCKET=easyescrow-backups
AWS_S3_KEY=your-aws-access-key-id
AWS_S3_SECRET=your-aws-secret-access-key
AWS_S3_REGION=us-east-1  # Optional, defaults to us-east-1
```

⚠️ **Security Notes:**
- Never commit `.env` file to git
- Store secrets in secure secret management system
- Rotate keys quarterly
- Use separate IAM users for different environments

---

## Usage

### Basic Usage with S3

```bash
# Backup everything and upload to S3
npm run backup:all:s3

# PowerShell
npm run backup:all:s3:ps
```

### Custom S3 Path

```bash
# Specify custom S3 path
ts-node scripts/utilities/backup-digitalocean.ts --all --s3 --s3-path production/backup-20251103.json

# PowerShell
.\scripts\utilities\backup-digitalocean.ps1 -All -S3 -S3Path 'production/backup-20251103.json'
```

### Default S3 Path Structure

If no `--s3-path` is specified, backups are organized automatically:

```
s3://easyescrow-backups/
└── backups/
    └── 2025/
        └── 11/
            └── 03/
                ├── backup-2025-11-03_10-30-00.json
                ├── backup-2025-11-03_14-00-00.json
                └── backup-2025-11-03_20-00-00.json
```

**Pattern:** `backups/YYYY/MM/DD/backup-YYYY-MM-DD_HH-MM-SS.json`

---

## Available npm Scripts

### With S3 Upload

| Script | Description |
|--------|-------------|
| `backup:all:s3` | Backup everything and upload to S3 (TypeScript) |
| `backup:all:s3:ps` | Backup everything and upload to S3 (PowerShell) |
| `backup:apps:s3` | Backup all apps and upload to S3 (TypeScript) |
| `backup:apps:s3:ps` | Backup all apps and upload to S3 (PowerShell) |
| `backup:databases:s3` | Backup all databases and upload to S3 (TypeScript) |
| `backup:databases:s3:ps` | Backup all databases and upload to S3 (PowerShell) |

### Without S3 Upload (Local Only)

| Script | Description |
|--------|-------------|
| `backup:all` | Backup everything locally (TypeScript) |
| `backup:all:ps` | Backup everything locally (PowerShell) |

---

## Command Line Options

### TypeScript

```bash
ts-node scripts/utilities/backup-digitalocean.ts [options]

New Options:
  --s3                Upload backup metadata to AWS S3
  --s3-path <path>    Custom S3 path (default: backups/YYYY/MM/DD/backup-TIMESTAMP.json)

Examples:
  # Backup with default S3 path
  ts-node scripts/utilities/backup-digitalocean.ts --all --s3

  # Backup with custom S3 path
  ts-node scripts/utilities/backup-digitalocean.ts --all --s3 --s3-path staging/backup-manual.json

  # Backup specific resources to S3
  ts-node scripts/utilities/backup-digitalocean.ts --app abc123 --database xyz789 --s3
```

### PowerShell

```powershell
.\scripts\utilities\backup-digitalocean.ps1 [options]

New Options:
  -S3                 Upload backup metadata to AWS S3
  -S3Path <path>      Custom S3 path (default: backups/YYYY/MM/DD/backup-TIMESTAMP.json)

Examples:
  # Backup with default S3 path
  .\scripts\utilities\backup-digitalocean.ps1 -All -S3

  # Backup with custom S3 path
  .\scripts\utilities\backup-digitalocean.ps1 -All -S3 -S3Path 'staging/backup-manual.json'

  # Backup specific resources to S3
  .\scripts\utilities\backup-digitalocean.ps1 -Apps 'abc123' -Databases 'xyz789' -S3
```

---

## How It Works

### Authentication

Uses **AWS Signature Version 4** for secure authentication:

1. Creates canonical request with file content hash
2. Generates signing key using secret key + date + region + service
3. Signs request with HMAC-SHA256
4. Includes signature in Authorization header

**No AWS SDK required** - uses native Node.js modules (`https`, `crypto`)

### Upload Process

```
1. Execute backup (create DO snapshots)
   ↓
2. Save metadata locally (temp/backup-metadata.json)
   ↓
3. If --s3 flag present:
   - Generate S3 path (custom or automatic)
   - Sign request with AWS Signature V4
   - Upload to S3 via HTTPS
   ↓
4. Verify upload success
   ↓
5. Display S3 location
```

### Error Handling

If S3 upload fails:
- Backup metadata is still saved locally
- Error message displayed
- Exit with error code
- Local backup remains intact

---

## Accessing Backups from S3

### AWS CLI

```bash
# List all backups
aws s3 ls s3://easyescrow-backups/backups/ --recursive

# Download specific backup
aws s3 cp s3://easyescrow-backups/backups/2025/11/03/backup-2025-11-03_10-30-00.json ./

# Download all backups from a date
aws s3 sync s3://easyescrow-backups/backups/2025/11/03/ ./backups/

# List backups from specific month
aws s3 ls s3://easyescrow-backups/backups/2025/11/ --recursive
```

### AWS Console

Navigate to: https://s3.console.aws.amazon.com/s3/buckets/easyescrow-backups

Browse the folder structure to find backups by date.

### Programmatic Access

```typescript
import * as https from 'https';
import * as crypto from 'crypto';

// Use same AWS Signature V4 process to download files
// Or use AWS SDK: aws-sdk or @aws-sdk/client-s3
```

---

## Automation with S3

### GitHub Actions (Daily Backup to S3)

```yaml
name: Daily Backup to S3

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
      
      - name: Execute Backup and Upload to S3
        env:
          DIGITAL_OCEAN_API_KEY: ${{ secrets.DIGITAL_OCEAN_API_KEY }}
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_S3_KEY: ${{ secrets.AWS_S3_KEY }}
          AWS_S3_SECRET: ${{ secrets.AWS_S3_SECRET }}
          AWS_S3_REGION: us-east-1
        run: npm run backup:all:s3
      
      - name: Upload local copy as artifact (redundancy)
        uses: actions/upload-artifact@v4
        with:
          name: backup-metadata
          path: temp/backup-*.json
          retention-days: 7
```

### Cron Job with S3

```bash
# Daily at 2 AM
0 2 * * * cd /path/to/project && npm run backup:all:s3 >> logs/backup.log 2>&1
```

### Pre-Deployment Backup to S3

```bash
# Before deploying to production
npm run backup:all:s3

# Then deploy
npm run deploy:production
```

---

## S3 Lifecycle Policies

### Automatic Backup Retention

Configure S3 lifecycle rules to manage backup retention:

```json
{
  "Rules": [
    {
      "Id": "DeleteOldBackups",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "backups/"
      },
      "Expiration": {
        "Days": 90
      }
    },
    {
      "Id": "ArchiveToGlacier",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "backups/"
      },
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

**Apply via AWS CLI:**

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket easyescrow-backups \
  --lifecycle-configuration file://lifecycle-policy.json
```

---

## Cost Considerations

### S3 Storage Costs (us-east-1)

| Storage Class | Cost per GB/month | Use Case |
|---------------|-------------------|----------|
| Standard | $0.023 | Active backups (0-30 days) |
| Glacier | $0.004 | Archive (30-90 days) |
| Glacier Deep Archive | $0.00099 | Long-term (90+ days) |

### Example Costs

**Assumptions:**
- Backup file size: 50 KB (0.00005 GB)
- Daily backups: 30 per month
- Total storage: 0.0015 GB per month

**Monthly cost:**
- Standard: $0.000035 (~$0.00004/month)
- With Glacier transition: ~$0.00002/month

**Annual cost:** Less than $0.01/year

### PUT Request Costs

- $0.005 per 1,000 PUT requests
- Daily backups: 365 requests/year
- Annual cost: $0.001825 (~$0.002/year)

**Total annual cost:** ~$0.01-0.02 (**negligible**)

---

## Security Best Practices

### IAM User

✅ **DO:**
- Use dedicated IAM user for backups
- Rotate access keys quarterly
- Use least-privilege policy
- Enable MFA for sensitive operations

❌ **DON'T:**
- Use root account credentials
- Share IAM credentials across projects
- Commit credentials to version control

### S3 Bucket

✅ **DO:**
- Enable versioning (protects against accidental deletion)
- Enable encryption (SSE-S3 or SSE-KMS)
- Block public access
- Enable access logging

❌ **DON'T:**
- Make bucket public
- Allow anonymous uploads
- Disable encryption

### Environment Variables

✅ **DO:**
- Store in `.env` file (gitignored)
- Use secret management systems (GitHub Secrets, etc.)
- Rotate credentials regularly

❌ **DON'T:**
- Commit `.env` to git
- Store in plaintext files
- Share credentials via email/chat

---

## Troubleshooting

### Error: "AWS S3 credentials not configured"

**Cause:** Missing AWS credentials in `.env`

**Solution:**
```bash
# Add to .env
echo "AWS_S3_BUCKET=easyescrow-backups" >> .env
echo "AWS_S3_KEY=AKIA..." >> .env
echo "AWS_S3_SECRET=..." >> .env
```

### Error: "S3 Upload failed: 403"

**Causes:**
- Invalid AWS credentials
- Insufficient IAM permissions
- Bucket doesn't exist
- Wrong region

**Solution:**
1. Verify credentials are correct
2. Check IAM policy grants `s3:PutObject` permission
3. Verify bucket exists: `aws s3 ls s3://easyescrow-backups/`
4. Check region matches bucket region

### Error: "S3 Upload failed: 404"

**Causes:**
- Bucket doesn't exist
- Wrong bucket name
- Wrong region

**Solution:**
1. Create bucket: `aws s3 mb s3://easyescrow-backups`
2. Verify bucket name in `.env`
3. Verify region matches

### Error: "S3 Upload failed: SignatureDoesNotMatch"

**Causes:**
- Incorrect secret key
- Clock skew (time difference)
- Region mismatch

**Solution:**
1. Verify `AWS_S3_SECRET` is correct
2. Sync system clock
3. Verify `AWS_S3_REGION` matches bucket region

---

## Verification

### Test S3 Upload

```bash
# Test with dry run first
npm run backup:all:dry-run

# Then test actual backup with S3
npm run backup:all:s3

# Verify upload
aws s3 ls s3://easyescrow-backups/backups/ --recursive | tail -n 5
```

### Verify File Contents

```bash
# Download latest backup
aws s3 cp s3://easyescrow-backups/backups/2025/11/03/backup-2025-11-03_10-30-00.json ./test-backup.json

# Verify JSON structure
cat test-backup.json | jq .
```

---

## Related Documentation

- [BACKUP_BEST_PRACTICES.md](./BACKUP_BEST_PRACTICES.md) - **⭐ Production best practices & security**
- [DIGITALOCEAN_BACKUP_GUIDE.md](./DIGITALOCEAN_BACKUP_GUIDE.md) - Complete backup guide
- [BACKUP_QUICK_START.md](./BACKUP_QUICK_START.md) - Quick start guide
- [BACKUP_README.md](../../scripts/utilities/BACKUP_README.md) - Utility reference
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [AWS Signature V4](https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html)

---

**Last Updated:** November 3, 2025  
**Status:** Production Ready ✅

