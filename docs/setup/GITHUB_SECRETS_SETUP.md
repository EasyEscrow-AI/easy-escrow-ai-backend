# GitHub Secrets Setup for Automated Backups

Quick guide to set up GitHub Secrets for automated backup workflows.

## 🎯 Required Secrets

You need to add 5 secrets to your GitHub repository:

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `DIGITAL_OCEAN_API_KEY` | `dop_v1_xxxxx` | Access DigitalOcean databases |
| `AWS_S3_BUCKET` | `easyescrow-backups` | S3 bucket name |
| `AWS_S3_KEY` | `your-aws-access-key-id` | AWS access key ID |
| `AWS_S3_SECRET` | `xxx...xxx` | AWS secret access key |
| `AWS_S3_REGION` | `us-east-1` | S3 bucket region |

---

## 📝 Step-by-Step Setup

### 1. Go to Repository Settings

1. Open your repository on GitHub
2. Click **Settings** (top right)
3. In the left sidebar, click **Secrets and variables** → **Actions**

### 2. Add Each Secret

For each secret, click **New repository secret**:

#### DIGITAL_OCEAN_API_KEY

**Where to find**:
1. Go to https://cloud.digitalocean.com/account/api/tokens
2. Click **Generate New Token**
3. Name: `backup-automation`
4. Scopes: Select **Read** (for database info)
5. Expiration: `No expiry` or `90 days`
6. Click **Generate Token**
7. **Copy the token immediately** (shown only once!)

**Add to GitHub**:
- Name: `DIGITAL_OCEAN_API_KEY`
- Secret: Paste the token
- Click **Add secret**

---

#### AWS_S3_BUCKET

**Value**: `easyescrow-backups` (your S3 bucket name)

**Add to GitHub**:
- Name: `AWS_S3_BUCKET`
- Secret: `easyescrow-backups`
- Click **Add secret**

---

#### AWS_S3_KEY

**Where to find**:
1. Go to AWS IAM Console: https://console.aws.amazon.com/iam/
2. Click **Users** → Select your backup user
3. Click **Security credentials** tab
4. Under **Access keys**, click **Create access key**
5. Use case: **Application running outside AWS**
6. Copy the **Access key ID**

**Add to GitHub**:
- Name: `AWS_S3_KEY`
- Secret: Paste the access key ID (e.g., `AKIA...`)
- Click **Add secret**

---

#### AWS_S3_SECRET

**Where to find**:
- Same as above, but copy the **Secret access key**
- ⚠️ **Only shown once!** Download the CSV or copy immediately

**Add to GitHub**:
- Name: `AWS_S3_SECRET`
- Secret: Paste the secret access key
- Click **Add secret**

---

#### AWS_S3_REGION

**Value**: Your S3 bucket region (e.g., `us-east-1`)

**Where to find**:
1. Go to S3 Console: https://s3.console.aws.amazon.com/s3/
2. Click on your bucket name
3. Look for **AWS Region** (e.g., `US East (N. Virginia) us-east-1`)
4. Use the code part: `us-east-1`

**Common regions**:
- US East (N. Virginia): `us-east-1`
- US West (Oregon): `us-west-2`
- EU (Ireland): `eu-west-1`

**Add to GitHub**:
- Name: `AWS_S3_REGION`
- Secret: `us-east-1` (or your region)
- Click **Add secret**

---

## ✅ Verify Secrets

After adding all secrets, you should see:

```
DIGITAL_OCEAN_API_KEY    Updated X minutes ago
AWS_S3_BUCKET           Updated X minutes ago
AWS_S3_KEY              Updated X minutes ago
AWS_S3_SECRET           Updated X minutes ago
AWS_S3_REGION           Updated X minutes ago
```

---

## 🧪 Test the Setup

### Manual Workflow Trigger

1. Go to **Actions** tab in your repository
2. Click **Daily Database Backup** (left sidebar)
3. Click **Run workflow** (right side)
4. Select branch: `staging` or `master`
5. Click **Run workflow**

### Monitor the Run

1. Click on the workflow run
2. Click on the **Backup Databases to S3** job
3. Watch the logs
4. Look for:
   - ✅ "Backup completed successfully!"
   - File uploaded to S3

### Verify in S3

```bash
# List today's backups
aws s3 ls s3://easyescrow-backups/database-backups/$(date +%Y/%m/%d)/

# Or check in AWS Console
# https://s3.console.aws.amazon.com/s3/buckets/easyescrow-backups
```

---

## 🔒 Security Best Practices

### DO ✅
- ✅ Use write-only S3 credentials (see `test-s3-security`)
- ✅ Set DigitalOcean token to read-only if possible
- ✅ Use repository secrets (not environment secrets)
- ✅ Rotate tokens periodically (every 90 days)
- ✅ Monitor token usage in DigitalOcean/AWS

### DON'T ❌
- ❌ Share tokens publicly
- ❌ Commit tokens to code
- ❌ Use tokens with more permissions than needed
- ❌ Reuse tokens across projects
- ❌ Leave expired tokens in GitHub

---

## 🔄 Rotating Secrets

### When to Rotate
- Every 90 days (recommended)
- After team member leaves
- After suspected compromise
- After repository visibility change

### How to Rotate

1. **Create new token/key** (DigitalOcean/AWS)
2. **Update GitHub secret** with new value
3. **Test workflow** to verify it works
4. **Delete old token/key** (DigitalOcean/AWS)

---

## 🆘 Troubleshooting

### "API key is invalid"

**Issue**: DigitalOcean API key not working

**Solutions**:
- Check if token has expired
- Verify token has correct permissions (read)
- Ensure no extra spaces when pasting
- Regenerate token in DigitalOcean

### "Access Denied" (S3)

**Issue**: AWS credentials not working

**Solutions**:
- Verify IAM user has `s3:PutObject` permission
- Check bucket name is correct
- Verify region matches bucket location
- Test credentials locally: `npm run backup:test-s3-security`

### Workflow doesn't trigger

**Issue**: Scheduled workflow not running

**Solutions**:
- Wait up to 1 hour (GitHub Actions can be delayed)
- Check if Actions are enabled in repository settings
- Verify workflow file has correct cron syntax
- Test with manual trigger first

---

## 📋 Setup Checklist

- [ ] DigitalOcean API token created
- [ ] AWS IAM user created with write-only S3 policy
- [ ] AWS access key created
- [ ] All 5 secrets added to GitHub
- [ ] Manual workflow trigger tested
- [ ] Backup verified in S3
- [ ] Notifications configured (optional)
- [ ] Calendar reminder set for token rotation (90 days)

---

## 📚 Related Documentation

- [Backup Scheduling Guide](../operations/BACKUP_SCHEDULING.md)
- [S3 Security Test](../operations/BACKUP_STORAGE_MANAGEMENT.md#security-verification)
- [Backup Best Practices](../operations/BACKUP_BEST_PRACTICES.md)

---

## 🎯 Quick Reference

**Add Secret**:
```
Repository → Settings → Secrets and variables → Actions → New repository secret
```

**Test Backup**:
```
Repository → Actions → Daily Database Backup → Run workflow
```

**View Logs**:
```
Repository → Actions → Click workflow run → Click job
```

---

**Last Updated**: November 3, 2025

