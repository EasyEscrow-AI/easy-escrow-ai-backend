# Backup Scheduling Guide

This guide explains how to schedule automated backups for your DigitalOcean databases.

## 🎯 Recommended Approach: App Platform Cron

**Best Practice**: Use App Platform cron for scheduled backups due to DigitalOcean database firewall restrictions.

### Why App Platform Cron?

| Feature | App Platform Cron | GitHub Actions |
|---------|-------------------|----------------|
| **Database Access** | ✅ Direct (no firewall) | ❌ Blocked by firewall |
| **Setup Complexity** | ✅ Simple | ⚠️ Requires IP whitelisting |
| **Security** | ✅ Internal network | ⚠️ External access needed |
| **Resource Impact** | ⚠️ Uses app resources | ✅ Separate compute |
| **Reliability** | ✅ Same as app | ✅ GitHub infrastructure |
| **Monitoring** | ⚠️ App logs | ✅ GitHub Actions UI |
| **Cost** | ✅ Included | ✅ Free |

**Key Advantage**: App Platform apps are **already in the DigitalOcean network** with database access, avoiding firewall issues entirely.

---

## 🚀 App Platform Cron Setup (Recommended)

### How It Works

The backup scheduler runs **inside your production app** as a background service:

```
Production App → Backup Scheduler → Database Dumps → AWS S3
```

**No external access needed!** Everything stays within the DigitalOcean network.

### Features

- ✅ **Automatic**: Runs weekly (Sunday 2 AM) without manual intervention
- ✅ **Leader Election**: Only one instance runs backups (multi-instance safe)
- ✅ **Built-in**: Already integrated in `src/index.ts`
- ✅ **Monitored**: View logs in App Platform console
- ✅ **Zero Setup**: Works out of the box in production

### Configuration

**Already configured!** The scheduler is enabled when:
- `NODE_ENV=production`
- All required env vars are set (DIGITAL_OCEAN_API_KEY, AWS_S3_*)

**View Logs**:
1. Go to DigitalOcean App Platform Console
2. Select your app → **Logs**
3. Search for: "Scheduled Backup Started"

**Customize Schedule**:

Edit `src/index.ts` (line ~380):
```typescript
// Change from weekly to daily
backupScheduler.startWeeklyBackup();  // ❌ Remove
backupScheduler.startDailyBackup();   // ✅ Add
```

Or customize in `src/services/backup-scheduler.service.ts`:
```typescript
// Sunday 2 AM
cron.schedule('0 2 * * 0', ...)

// Daily 2 AM
cron.schedule('0 2 * * *', ...)

// Every 6 hours
cron.schedule('0 */6 * * *', ...)
```

**Manual Trigger** (for testing):
```bash
# SSH into app container
doctl apps ssh <app-id>

# Run backup
npm run backup:complete
```

📚 **Full Documentation**: [App Platform Backup Cron Guide](./APP_PLATFORM_BACKUP_CRON.md)

---

## 🔄 Alternative: GitHub Actions (Requires Firewall Configuration)

**Note**: GitHub Actions cannot access DigitalOcean databases by default due to firewall restrictions. You must either:
1. Open database firewall to all IPs (⚠️ security risk)
2. Use GitHub's IP ranges (frequently changes)
3. Use a proxy with static IP (complex)

**We recommend App Platform Cron instead.**

If you still want to use GitHub Actions:

## 🚀 GitHub Actions Setup

### Step 1: Add GitHub Secrets

Go to your repository → **Settings** → **Secrets and variables** → **Actions**

Add these secrets:

| Secret Name | Value | Where to Find |
|-------------|-------|---------------|
| `DIGITAL_OCEAN_API_KEY` | `dop_v1_xxxxx` | DigitalOcean → API → Tokens |
| `AWS_S3_BUCKET` | `easyescrow-backups` | Your S3 bucket name |
| `AWS_S3_KEY` | `AKIA...` | AWS IAM → Users → Security credentials |
| `AWS_S3_SECRET` | `xxx...` | AWS IAM (shown only once) |
| `AWS_S3_REGION` | `us-east-1` | Your S3 bucket region |

### Step 2: Workflows Created

Two workflows are already set up:

#### Daily Backup (`.github/workflows/daily-backup.yml`)
- **Schedule**: Every day at 2 AM UTC
- **Purpose**: Regular daily backups
- **Retention**: Managed by S3 lifecycle policies

#### Weekly Backup (`.github/workflows/weekly-backup.yml`)
- **Schedule**: Every Sunday at 2 AM UTC
- **Purpose**: Weekly backups with logs
- **Logs**: Saved as artifacts for 7 days

### Step 3: Test the Workflow

**Manual Trigger**:
1. Go to **Actions** tab in GitHub
2. Select **Daily Database Backup** or **Weekly Database Backup**
3. Click **Run workflow**
4. Select branch: `staging` or `master`
5. Click **Run workflow**

**Monitor**:
- Check the workflow logs
- Verify files appear in S3
- Check for email notifications (if configured)

### Step 4: Customize Schedule (Optional)

Edit `.github/workflows/daily-backup.yml` or `weekly-backup.yml`:

```yaml
on:
  schedule:
    # Syntax: minute hour day-of-month month day-of-week
    - cron: '0 2 * * *'  # 2 AM UTC daily
```

**Common Schedules**:
```yaml
# Every 6 hours
- cron: '0 */6 * * *'

# Every day at 2 AM and 2 PM UTC
- cron: '0 2,14 * * *'

# Monday-Friday at 2 AM UTC
- cron: '0 2 * * 1-5'

# First day of each month at 2 AM UTC
- cron: '0 2 1 * *'
```

**UTC to Your Timezone**:
- PST: UTC - 8 hours
- EST: UTC - 5 hours
- CET: UTC + 1 hour

Example: 2 AM PST = 10 AM UTC
```yaml
- cron: '0 10 * * *'
```

---

## 📧 Email Notifications

### Option 1: GitHub Notifications (Default)

GitHub sends emails on workflow failures automatically.

**Enable**:
1. Go to GitHub → **Settings** (your profile)
2. **Notifications**
3. Enable **Actions** notifications

### Option 2: Custom Email (Advanced)

Add email notification step to workflow:

```yaml
- name: Send Email Notification
  if: failure()
  uses: dawidd6/action-send-mail@v3
  with:
    server_address: smtp.gmail.com
    server_port: 465
    username: ${{ secrets.EMAIL_USERNAME }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: '❌ Backup Failed - ${{ github.repository }}'
    to: your-email@example.com
    from: GitHub Actions
    body: |
      Backup workflow failed!
      
      Repository: ${{ github.repository }}
      Workflow: ${{ github.workflow }}
      Run: ${{ github.run_id }}
      
      Check logs: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
```

### Option 3: Slack Notifications

```yaml
- name: Slack Notification
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: 'Backup failed! Check logs.'
    webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## 🔍 Monitoring & Verification

### Check Workflow Status

**GitHub UI**:
1. Go to **Actions** tab
2. View recent workflow runs
3. Green checkmark = success
4. Red X = failure

**GitHub CLI**:
```bash
# View recent workflow runs
gh run list --workflow=daily-backup.yml

# View specific run details
gh run view <run-id>

# View run logs
gh run view <run-id> --log
```

### Verify Backups in S3

```bash
# List today's backups
aws s3 ls s3://easyescrow-backups/database-backups/$(date +%Y/%m/%d)/

# List all backups this month
aws s3 ls s3://easyescrow-backups/database-backups/$(date +%Y/%m)/ --recursive

# Check backup sizes
aws s3 ls s3://easyescrow-backups/database-backups/ --recursive --human-readable --summarize
```

### Automated Verification Script

Create `.github/workflows/verify-backups.yml`:

```yaml
name: Verify Backups Exist

on:
  schedule:
    # Check daily at 3 AM (1 hour after backup)
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Check Today's Backups
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_S3_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_S3_SECRET }}
          AWS_DEFAULT_REGION: ${{ secrets.AWS_S3_REGION }}
        run: |
          TODAY=$(date +%Y/%m/%d)
          echo "Checking for backups on $TODAY..."
          
          COUNT=$(aws s3 ls s3://easyescrow-backups/database-backups/$TODAY/ | wc -l)
          
          if [ $COUNT -eq 0 ]; then
            echo "❌ No backups found for today!"
            exit 1
          else
            echo "✅ Found $COUNT backup file(s) for today"
          fi
```

---

## 📊 Backup Retention & Lifecycle

### S3 Lifecycle Policy

Automatically manage old backups:

```json
{
  "Rules": [
    {
      "Id": "BackupRetention",
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
    }
  ]
}
```

**Apply**:
```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket easyescrow-backups \
  --lifecycle-configuration file://lifecycle-policy.json
```

**What This Does**:
- **0-30 days**: S3 Standard (fast access)
- **30-365 days**: Glacier (cheaper storage)
- **365+ days**: Automatically deleted

**Estimated Costs**:
- Daily backups for 30 days: ~$0.20/month
- Daily backups for 1 year with Glacier: ~$0.60/month

---

## 🔧 Alternative: In-App Cron (Not Recommended)

If you **must** run backups from within the app:

### Setup with node-cron

**Install**:
```bash
npm install node-cron
npm install --save-dev @types/node-cron
```

**Create** `src/services/backup-scheduler.service.ts`:

```typescript
import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BackupScheduler {
  private static instance: BackupScheduler;
  private jobs: cron.ScheduledTask[] = [];

  private constructor() {}

  static getInstance(): BackupScheduler {
    if (!BackupScheduler.instance) {
      BackupScheduler.instance = new BackupScheduler();
    }
    return BackupScheduler.instance;
  }

  /**
   * Start weekly backup schedule
   */
  startWeeklyBackup() {
    // Every Sunday at 2 AM
    const job = cron.schedule('0 2 * * 0', async () => {
      console.log('🚀 Starting scheduled weekly backup...');
      
      try {
        const { stdout, stderr } = await execAsync('npm run backup:complete');
        console.log('✅ Backup completed successfully');
        console.log(stdout);
        
        if (stderr) {
          console.warn('Backup warnings:', stderr);
        }
      } catch (error) {
        console.error('❌ Backup failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "America/Los_Angeles"  // Adjust to your timezone
    });

    this.jobs.push(job);
    console.log('📅 Weekly backup scheduled: Every Sunday at 2 AM PST');
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll() {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    console.log('🛑 All backup schedules stopped');
  }
}
```

**Update** `src/index.ts`:

```typescript
import { BackupScheduler } from './services/backup-scheduler.service';

// ... existing code ...

// Start backup scheduler (only in production)
if (process.env.NODE_ENV === 'production') {
  const scheduler = BackupScheduler.getInstance();
  scheduler.startWeeklyBackup();
  console.log('✅ Backup scheduler initialized');
}

// ... rest of server setup ...
```

### ⚠️ Important Considerations

1. **Single Instance Only**: Add this check to prevent multiple backups:

```typescript
// Check if this is the leader instance
const isLeader = process.env.HOSTNAME?.includes('web-0') || 
                 process.env.DYNO === 'web.1';

if (process.env.NODE_ENV === 'production' && isLeader) {
  scheduler.startWeeklyBackup();
}
```

2. **Resource Limits**: Database dumps can use significant memory:
   - Monitor app memory during backups
   - Consider upgrading app plan if needed
   - Schedule during low-traffic periods

3. **Failure Recovery**: App restart = missed backups
   - Implement persistent job tracking
   - Use external monitoring

---

## 🎯 Recommendation Summary

### Choose GitHub Actions If:
- ✅ You want reliability
- ✅ You want separation of concerns
- ✅ You want easy monitoring
- ✅ You want to avoid app complexity

### Choose In-App Cron If:
- ⚠️ You need backups triggered by app events
- ⚠️ You have specific app-state requirements
- ⚠️ You're willing to manage complexity

**Best Practice**: Start with GitHub Actions. Add in-app scheduling only if you have specific requirements that can't be met externally.

---

## 📋 Setup Checklist

### GitHub Actions Setup
- [ ] Add secrets to GitHub repository
- [ ] Test manual workflow trigger
- [ ] Verify backups appear in S3
- [ ] Set up email notifications
- [ ] Configure S3 lifecycle policy
- [ ] Schedule regular verification checks

### In-App Cron Setup (If Used)
- [ ] Install node-cron
- [ ] Create backup scheduler service
- [ ] Add leader election logic
- [ ] Update app startup code
- [ ] Test in staging environment
- [ ] Monitor memory usage
- [ ] Set up failure alerts

---

## 🔍 Troubleshooting

### GitHub Actions Issues

**Issue**: Workflow doesn't run
- **Check**: Verify cron syntax with https://crontab.guru
- **Check**: Ensure secrets are set correctly
- **Check**: Repository has Actions enabled

**Issue**: Workflow fails with "pg_dump: command not found"
- **Solution**: Already included in workflow (installs postgresql-client)

**Issue**: Workflow timeout
- **Solution**: Increase timeout in workflow file:
  ```yaml
  timeout-minutes: 60  # Increase from 30
  ```

### In-App Cron Issues

**Issue**: Backup runs multiple times
- **Solution**: Implement leader election (see above)

**Issue**: App runs out of memory
- **Solution**: 
  - Upgrade app plan
  - Run backups during low traffic
  - Use external scheduling instead

**Issue**: Missed backups after restart
- **Solution**: Use GitHub Actions (more reliable)

---

## 📚 Related Documentation

- [Database Backup to S3](./DATABASE_BACKUP_TO_S3.md)
- [Backup Storage Management](./BACKUP_STORAGE_MANAGEMENT.md)
- [Backup Best Practices](./BACKUP_BEST_PRACTICES.md)
- [AWS S3 Integration](./AWS_S3_BACKUP_INTEGRATION.md)

---

## 🎯 Quick Start

**Easiest Setup (5 minutes)**:

1. Add GitHub Secrets (see Step 1 above)
2. Commit the workflow files to your repo
3. Go to Actions tab
4. Click "Run workflow" to test
5. Done! Backups will run automatically

**Command to verify**:
```bash
# Check if workflows exist
ls -la .github/workflows/

# Test backup manually
npm run backup:complete
```

---

**Last Updated**: November 3, 2025

