# DigitalOcean Backup - Quick Start

Fast guide to backing up your DigitalOcean infrastructure.

---

## 1️⃣ Setup (One Time)

### Set API Key

Get your API key from: https://cloud.digitalocean.com/account/api/tokens

**Scopes needed:** `read` and `write`

```bash
# Add to .env file
echo "DIGITAL_OCEAN_API_KEY=dop_v1_xxxxxxxxxxxxxxxxxxxxxxxx" >> .env

# Or export for current session
export DIGITAL_OCEAN_API_KEY=dop_v1_xxxxxxxx  # Linux/macOS
$env:DIGITAL_OCEAN_API_KEY="dop_v1_xxxxxxxx"  # Windows PowerShell
```

---

## 2️⃣ List Resources

See what can be backed up:

```bash
npm run backup:list
```

**Output:**
```
📱 App Platform Applications:
  • easyescrow-backend-staging
    ID: abc123def456

💾 Database Clusters:
  • easyescrow-staging-db
    ID: xyz789
```

---

## 3️⃣ Test Backup (Dry Run)

Test without creating actual backups:

```bash
npm run backup:all:dry-run
```

This shows what would be backed up without executing.

---

## 4️⃣ Execute Backup

### Backup Everything

```bash
npm run backup:all
```

### Backup Only Apps

```bash
npm run backup:apps
```

### Backup Only Databases

```bash
npm run backup:databases
```

---

## 5️⃣ Verify Backup

Check the backup metadata:

```bash
cat temp/backup-metadata.json
```

**Example output:**
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

---

## 🔄 Restore Backup

### Restore App Deployment

**Console:**
1. Go to: https://cloud.digitalocean.com/apps
2. Select your app → Settings → Deployments
3. Find the deployment → Click "Redeploy"

**CLI:**
```bash
doctl apps list-deployments <app-id>
doctl apps create-deployment <app-id> --deployment-id <deployment-id>
```

### Restore Database

**Console:**
1. Go to: https://cloud.digitalocean.com/databases
2. Select cluster → Backups & Restore
3. Find backup → Click "Fork" (recommended) or "Restore"

**CLI:**
```bash
# List backups
doctl databases backups list <database-id>

# Fork to new cluster (safer - creates a copy)
doctl databases fork <database-id> --backup-restore <backup-id> --name "restored-db"

# Or restore to existing (overwrites!)
doctl databases backups restore <database-id> <backup-id>
```

⚠️ **Always fork first, test, then switch over!**

---

## 📅 Automate Backups

### GitHub Actions (Recommended)

Create `.github/workflows/backup.yml`:

```yaml
name: Daily Backup
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC
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

### Cron (Linux/macOS)

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

---

## 🚨 Troubleshooting

### "DIGITAL_OCEAN_API_KEY not set"
```bash
# Add to .env
echo "DIGITAL_OCEAN_API_KEY=dop_v1_xxxxxxxx" >> .env
```

### "API Error 401: Unauthorized"
- Generate new token: https://cloud.digitalocean.com/account/api/tokens
- Ensure `read` and `write` scopes
- Update `.env` file

### "API Error 404: Not Found"
- Run `npm run backup:list` to see available resources
- Verify correct API token (check team/account)

### "Failed to create backup"
- Wait 5-10 minutes and retry
- Check resource status in DigitalOcean console
- Delete old backups if storage is full

---

## 📚 Complete Documentation

- [BACKUP_README.md](../../scripts/utilities/BACKUP_README.md) - Detailed usage guide
- [DIGITALOCEAN_BACKUP_GUIDE.md](./DIGITALOCEAN_BACKUP_GUIDE.md) - Complete backup guide
- [DigitalOcean API Docs](https://docs.digitalocean.com/reference/api/) - API reference

---

## 💡 Quick Tips

✅ **Pre-deployment backup:**
```bash
npm run backup:all
# Then deploy
npm run deploy:production
```

✅ **Backup specific resources:**
```bash
ts-node scripts/utilities/backup-digitalocean.ts --app abc123 --database xyz789
```

✅ **Custom output path:**
```bash
ts-node scripts/utilities/backup-digitalocean.ts --all --output backups/backup-$(date +%Y%m%d).json
```

✅ **Test monthly:** Restore database to verify backup integrity

✅ **Security:** Never commit API tokens to git

---

**Need help?** Check the [complete backup guide](./DIGITALOCEAN_BACKUP_GUIDE.md) or [troubleshooting section](#-troubleshooting).

