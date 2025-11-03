# App Platform Backup Cron Guide

Automated database backups running from within DigitalOcean App Platform.

## 🎯 Overview

Instead of GitHub Actions (which can't access databases due to firewall), backups run as a **cron job inside your App Platform app**. This works because the app is already in the DigitalOcean network with database access.

## ✅ Benefits

| Feature | App Platform Cron | GitHub Actions |
|---------|-------------------|----------------|
| **Database Access** | ✅ Direct (no firewall) | ❌ Blocked by firewall |
| **Setup Complexity** | ✅ Simple | ⚠️ Requires IP whitelisting |
| **Security** | ✅ Stays in DO network | ⚠️ External access needed |
| **Cost** | ✅ Uses existing app | ✅ Free (public repos) |
| **Reliability** | ✅ Same uptime as app | ✅ GitHub infrastructure |

## 🚀 How It Works

```
┌─────────────────────────────────────────┐
│     App Platform (Production)           │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Express App (your backend)       │  │
│  │                                   │  │
│  │  ┌───────────────────────────┐   │  │
│  │  │ Backup Scheduler Service  │   │  │
│  │  │  - node-cron              │   │  │
│  │  │  - Runs weekly (Sunday)   │   │  │
│  │  │  - Leader election        │   │  │
│  │  └───────────┬───────────────┘   │  │
│  │              │                    │  │
│  │              ▼                    │  │
│  │  ┌───────────────────────────┐   │  │
│  │  │ npm run backup:complete   │   │  │
│  │  │  1. App metadata → S3     │   │  │
│  │  │  2. Database dumps → S3   │   │  │
│  │  └───────────────────────────┘   │  │
│  └──────────────────────────────────┘  │
│                                         │
│  Direct Access (No Firewall!) ↓        │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  PostgreSQL Databases            │  │
│  │  - Production DB                 │  │
│  │  - Staging DB                    │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │    AWS S3      │
         │ Backup Storage │
         └────────────────┘
```

## 📋 Default Configuration

### Schedule
- **Frequency**: Weekly
- **Day**: Sunday
- **Time**: 2:00 AM
- **Timezone**: `America/Los_Angeles` (configurable)

### Leader Election
- **Multi-Instance**: Only the first instance runs backups
- **Environment Variable**: Set `BACKUP_LEADER=true` to force leadership
- **Detection**: Auto-detects based on hostname or DYNO

## 🔧 Configuration

### Environment Variables

Add to your `.env` or App Platform environment:

```env
# Backup Configuration
NODE_ENV=production                    # Required: Only runs in production
TZ=America/Los_Angeles                # Optional: Timezone for schedule

# Force this instance to be backup leader (optional)
BACKUP_LEADER=true                    # Optional: Force leader election

# Database & S3 credentials (already configured)
DIGITAL_OCEAN_API_KEY=dop_v1_xxxxx
AWS_S3_BUCKET=easyescrow-backups
AWS_S3_KEY=AKIA...
AWS_S3_SECRET=xxx...
AWS_S3_REGION=us-east-1
```

### Change Schedule

To change from weekly to daily, edit `src/index.ts`:

```typescript
// Change from weekly to daily
backupScheduler.startWeeklyBackup();  // ❌ Remove this
backupScheduler.startDailyBackup();   // ✅ Add this
```

**Cron Syntax**: Edit `src/services/backup-scheduler.service.ts`:

```typescript
// Weekly: Every Sunday at 2 AM
cron.schedule('0 2 * * 0', ...)

// Daily: Every day at 2 AM
cron.schedule('0 2 * * *', ...)

// Every 6 hours
cron.schedule('0 */6 * * *', ...)

// Monday-Friday at 2 AM
cron.schedule('0 2 * * 1-5', ...)
```

## 🎛️ Leader Election

### How It Works

With multiple app instances, only ONE should run backups to avoid:
- ❌ Duplicate backups
- ❌ Race conditions
- ❌ Excessive resource usage

**Detection Logic**:
1. Check `BACKUP_LEADER` env var (explicit)
2. Check hostname contains `web-0` (App Platform)
3. Check `DYNO === web.1` (Heroku-style)
4. Default to leader in local development

### Force Leadership

**Option 1**: Environment Variable (Recommended)
```env
BACKUP_LEADER=true
```

**Option 2**: Programmatic (Advanced)
```typescript
// In src/index.ts
if (process.env.FORCE_BACKUP_LEADER === 'true') {
  // Force this instance to run backups
}
```

### Multiple Apps Strategy

If you have separate apps (prod, staging, dev):

```
Production App → Backs up production databases
Staging App → Backs up staging databases
Dev App → No automated backups
```

Set different schedules per app:
- **Production**: Daily at 2 AM
- **Staging**: Weekly on Sunday at 3 AM

## 📊 Monitoring

### Check Logs

**App Platform Console**:
1. Go to https://cloud.digitalocean.com/apps
2. Select your app
3. Go to **Logs** or **Runtime Logs**
4. Search for: "Scheduled Backup Started"

**Expected Output**:
```
╔═══════════════════════════════════════════════════════════╗
║         Scheduled Backup Started                          ║
╚═══════════════════════════════════════════════════════════╝

🚀 Starting backup at 2025-11-03T09:00:00.000Z
📦 Creating database dump...
✅ Dump created: 234.56MB
☁️  Uploading to S3...
✅ Uploaded successfully

╔═══════════════════════════════════════════════════════════╗
║         Backup Summary                                     ║
╚═══════════════════════════════════════════════════════════╝
✅ Completed at: 2025-11-03T09:05:00.000Z
📧 Notification: Success
```

### Verify Backups in S3

```bash
# Check today's backups
aws s3 ls s3://easyescrow-backups/database-backups/$(date +%Y/%m/%d)/

# Check this week
aws s3 ls s3://easyescrow-backups/database-backups/$(date +%Y/%m)/ --recursive
```

### Startup Logs

When app starts, you'll see:

```
Starting background services...
Starting monitoring orchestrator...
✅ Monitoring orchestrator started
...
Starting backup scheduler...
📍 Instance: app-name-xxxxx - Leader: true
📅 Weekly backup scheduled: Every Sunday at 2 AM
   Timezone: America/Los_Angeles
✅ Backup scheduler started (1 job(s))
✅ All background services started
```

Or for follower instances:
```
Starting backup scheduler...
📍 Instance: app-name-yyyyy - Leader: false
⏭️  Backup scheduler - follower instance (not running backups)
```

## 🧪 Testing

### Manual Trigger

Add a test endpoint (for admin use only):

```typescript
// In src/routes/health.routes.ts or admin routes
router.post('/admin/trigger-backup', async (req, res) => {
  // TODO: Add authentication!
  try {
    await backupScheduler.triggerManualBackup();
    res.json({ message: 'Backup triggered' });
  } catch (error) {
    res.status(500).json({ error: 'Backup failed' });
  }
});
```

**Better**: Use CLI on running container:

```bash
# SSH into App Platform container
doctl apps ssh <app-id>

# Trigger backup manually
cd /workspace
npm run backup:complete
```

### Local Testing

```typescript
// In src/index.ts, temporarily remove production check
// backupScheduler.startWeeklyBackup();  // Remove NODE_ENV check
```

Or set environment:
```bash
NODE_ENV=production npm run dev
```

## 🔧 Troubleshooting

### Backup Not Running

**Check**:
1. Is `NODE_ENV=production`?
   ```bash
   echo $NODE_ENV
   ```

2. Is this instance the leader?
   - Look for logs: "Leader: true"
   - Check `BACKUP_LEADER` env var

3. Has the schedule time passed?
   - Weekly: Sunday 2 AM
   - Check server timezone: `echo $TZ`

### Backup Fails

**Common Issues**:

1. **Database connection timeout**
   - ✅ Should NOT happen (in DO network)
   - Check database is running
   - Check app has correct DATABASE_URL

2. **S3 upload fails**
   - Check AWS credentials in env
   - Test: `npm run backup:test-s3-security`

3. **Out of memory**
   - Increase app resources
   - Reduce backup compression level

### Multiple Backups Running

**Problem**: Both instances running backups

**Solution**:
```env
# Set on only ONE instance
BACKUP_LEADER=true
```

Or use Redis for distributed leader election (advanced).

## 📈 Resource Usage

### During Backup

| Resource | Usage | Duration |
|----------|-------|----------|
| **CPU** | 20-40% | 2-5 minutes |
| **Memory** | +200-500MB | 2-5 minutes |
| **Network** | Moderate | 1-3 minutes |
| **Storage** | Temp (cleaned up) | Seconds |

**Recommendations**:
- ✅ Run during low-traffic hours (2 AM)
- ✅ Ensure app has 512MB+ memory
- ✅ Monitor app performance during backup
- ✅ Consider dedicated backup worker app for large DBs

### At Rest

| Resource | Usage |
|----------|-------|
| **CPU** | < 1% (cron scheduler only) |
| **Memory** | < 10MB (node-cron) |
| **Storage** | 0 (no persistent files) |

## 🔔 Notifications (TODO)

Add failure notifications:

```typescript
// In backup-scheduler.service.ts, executeBackup() catch block:

// Option 1: Email via SendGrid
await sendEmail({
  to: 'ops@yourdomain.com',
  subject: '❌ Backup Failed',
  body: `Backup failed at ${new Date().toISOString()}\n\n${error.message}`
});

// Option 2: Slack webhook
await fetch(process.env.SLACK_WEBHOOK_URL, {
  method: 'POST',
  body: JSON.stringify({
    text: `❌ Backup failed: ${error.message}`
  })
});

// Option 3: PagerDuty
await triggerPagerDutyAlert({
  severity: 'error',
  summary: 'Database backup failed'
});
```

## 🔄 Comparison: App Platform vs GitHub Actions

| Aspect | App Platform Cron | GitHub Actions |
|--------|-------------------|----------------|
| **Database Access** | ✅ Direct | ❌ Firewall blocked |
| **Setup** | ✅ Simple | ⚠️ Complex (IP whitelist) |
| **Security** | ✅ Internal network | ⚠️ External access |
| **Reliability** | ✅ Same as app | ✅ GitHub infra |
| **Scalability** | ⚠️ Leader election needed | ✅ Single execution |
| **Resource Impact** | ⚠️ Uses app resources | ✅ Separate compute |
| **Monitoring** | ⚠️ App logs | ✅ GitHub Actions UI |
| **Cost** | ✅ Included | ✅ Free |

**Verdict**: App Platform is **better for DigitalOcean** because it avoids firewall issues entirely.

## 📚 Related Documentation

- [Backup Scheduling Guide](./BACKUP_SCHEDULING.md)
- [Database Backup to S3](../../scripts/utilities/DATABASE_BACKUP_TO_S3.md)
- [Backup Storage Management](./BACKUP_STORAGE_MANAGEMENT.md)

---

**Last Updated**: November 3, 2025

