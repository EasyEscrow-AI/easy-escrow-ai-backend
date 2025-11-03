# Backup Systems Comparison

This document explains the two complementary backup systems in this project.

## 🆚 Two Backup Systems

### System 1: Metadata Backup (`backup-digitalocean.ts`)

**Purpose**: Create references to DigitalOcean-hosted backups

**What it backs up**:
- ✅ App deployment snapshots (IDs only, actual data stays in DigitalOcean)
- ❌ Database backups (API doesn't support this - 405 error)

**Output**: Small JSON file (~1KB) with references

**Example**:
```json
{
  "timestamp": "2025-11-03T01:00:52.906Z",
  "apps": [
    {
      "id": "a6e6452b-1ec6-4316-82fe-e4069d089b49",
      "name": "easyescrow-backend-production",
      "status": "success",
      "deploymentId": "0bc3fba5-afaa-42da-8e82-1d301f052037"
    }
  ],
  "databases": []  // ← Empty because DigitalOcean API doesn't support on-demand DB backups
}
```

**Commands**:
```bash
npm run backup:apps:s3          # Backup app metadata to S3
npm run backup:databases:s3     # Tries DB backup via API (will fail with 405)
```

**S3 Location**: `s3://easyescrow-backups/digitalocean-backups/YYYY/MM/DD/`

---

### System 2: Database Dumps (`backup-databases-to-s3.ts`)

**Purpose**: Create actual PostgreSQL dumps for true off-site backups

**What it backs up**:
- ✅ Complete database data (all tables, records, schema)
- ✅ Can be restored to any PostgreSQL server
- ✅ True disaster recovery

**Output**: Large `.dump` files (10MB - 10GB+)

**Example**:
```
easyescrow-prod-postgres-2025-11-03T14-30-00.dump      (234 MB)
easyescrow-staging-postgres-2025-11-03T14-30-00.dump   (0.03 MB)
```

**Commands**:
```bash
npm run backup:db-dumps              # Backup all databases
npm run backup:db-dumps:production   # Backup production only
npm run backup:db-dumps:staging      # Backup staging only
```

**S3 Location**: `s3://easyescrow-backups/database-backups/YYYY/MM/DD/`

---

## 🔄 Complete Backup Strategy

### Run Both Systems

```bash
# One command to rule them all
npm run backup:complete
```

This runs:
1. `npm run backup:apps:s3` → App deployment metadata
2. `npm run backup:db-dumps` → Actual database dumps

### What You Get

| What | Where | How to Restore |
|------|-------|----------------|
| **App Config** | DigitalOcean (referenced by deployment ID) | Console → Apps → Select deployment |
| **Source Code** | GitHub (referenced by commit hash) | Git checkout |
| **Database Data** | S3 (actual .dump files) | `pg_restore` command |
| **Backup Metadata** | S3 (JSON file) | Reference for tracking |

---

## 📊 Comparison Table

| Feature | Metadata Backup | Database Dumps |
|---------|-----------------|----------------|
| **Script** | `backup-digitalocean.ts` | `backup-databases-to-s3.ts` |
| **File Size** | < 1KB | 10MB - 10GB+ |
| **Contains** | References/IDs | Actual data |
| **App Backups** | ✅ Yes (deployment IDs) | ❌ No |
| **Database Backups** | ❌ No (API limitation) | ✅ Yes (full dumps) |
| **Restore Speed** | Depends on DigitalOcean | Immediate with `pg_restore` |
| **Off-site Protection** | Partial (metadata only) | Complete (full data) |
| **DigitalOcean Dependency** | High | None (portable) |
| **Use Case** | Tracking/auditing | Disaster recovery |

---

## 🎯 When to Use Each

### Use Metadata Backup When:
- ✅ Tracking which deployments were created
- ✅ Auditing backup history
- ✅ Recording deployment configurations
- ✅ Need lightweight reference files

### Use Database Dumps When:
- ✅ True disaster recovery planning
- ✅ Restoring to non-DigitalOcean servers
- ✅ Migrating between environments
- ✅ Need complete data independence

### Use Both When:
- ✅ **Always** (recommended)
- ✅ Production environments
- ✅ Compliance requirements
- ✅ Maximum backup coverage

---

## ❓ Why is `databases` Array Empty?

### The Technical Reason

The DigitalOcean API **does not support on-demand database backups**:

```bash
POST /v2/databases/{database_id}/backups
# Returns: 405 Method Not Allowed
```

DigitalOcean only provides:
- **Automatic daily backups** (cannot be triggered via API)
- **Point-in-time recovery** (last 7 days)
- **Manual snapshots** (via console only)

### The Solution

That's why we created the **Database Dumps** system (`backup-databases-to-s3.ts`):
- ✅ Uses `pg_dump` to export data directly from the database
- ✅ Uploads actual data to S3
- ✅ Provides true off-site backups
- ✅ Not dependent on DigitalOcean's API limitations

---

## 🔒 DigitalOcean Automatic Backups

DigitalOcean **still backs up your databases automatically**:

### View DigitalOcean's Automatic Backups

```bash
# List automatic backups for production database
doctl databases backups list b0f97f57-f399-4727-8abf-dc741cc9a5d2

# List automatic backups for staging database
doctl databases backups list c172d515-f258-412a-b8e8-6e821eb953be
```

**Or in the Console**:
1. Go to: https://cloud.digitalocean.com/databases
2. Select your database
3. Click "Backups & Restore" tab
4. See daily automatic backups (last 7 days for basic plan)

---

## 📋 Recommended Backup Schedule

### Daily (Automated)
```bash
# Run via GitHub Actions at 2 AM
npm run backup:complete
```

**Result**:
- Latest app deployment metadata → S3
- Fresh database dumps → S3

### Weekly (Optional)
```bash
# Higher compression for long-term storage
npx ts-node scripts/utilities/backup-databases-to-s3.ts --all --compression 6 --s3-prefix database-backups/weekly
```

**Result**:
- Smaller files (better compression)
- Organized in separate folder
- Good for long-term archival

### Monthly (Optional)
```bash
# Maximum compression for archival
npx ts-node scripts/utilities/backup-databases-to-s3.ts --all --compression 9 --s3-prefix database-backups/monthly
```

---

## 🔄 Restoration Examples

### Restore App from Metadata

```bash
# 1. Get deployment ID from metadata JSON
# deploymentId: "0bc3fba5-afaa-42da-8e82-1d301f052037"

# 2. Use DigitalOcean console or CLI to redeploy
doctl apps create-deployment a6e6452b-1ec6-4316-82fe-e4069d089b49 --deployment-id 0bc3fba5-afaa-42da-8e82-1d301f052037
```

### Restore Database from Dump

```bash
# 1. Download dump from S3
aws s3 cp s3://easyescrow-backups/database-backups/2025/11/03/easyescrow-prod-postgres-2025-11-03T14-30-00.dump ./restore.dump

# 2. Restore to database
pg_restore -h easyescrow-prod-postgres-do-user-11230012-0.d.db.ondigitalocean.com \
           -U doadmin \
           -d defaultdb \
           -c \
           restore.dump
```

---

## 💰 Cost Analysis

### Metadata Backups
- **Size**: < 1KB per backup
- **Monthly Cost**: $0.00 (negligible)

### Database Dumps
- **Size**: ~0.03MB (staging), ~234MB (production)
- **Monthly Cost**: ~$0.005/month (30 days × 234MB)

**Total Monthly Cost**: < $0.01/month 💰

---

## 🆘 Troubleshooting

### Why is my databases array empty?

**This is expected and normal.** The DigitalOcean API doesn't support on-demand database backups (405 error). Use `npm run backup:db-dumps` instead.

### Can I populate the databases array?

No, the API limitation cannot be worked around. The `databases` array in the metadata backup will always be empty. This is why we created the separate Database Dumps system.

### Should I still run the metadata backup?

Yes! It provides valuable tracking of app deployments and serves as an audit trail. Just don't rely on it for database backups.

---

## 📚 Related Documentation

- [Database Backup to S3 Guide](./DATABASE_BACKUP_TO_S3.md)
- [DigitalOcean Backup Guide](./DIGITALOCEAN_BACKUP_GUIDE.md)
- [Backup Best Practices](./BACKUP_BEST_PRACTICES.md)
- [AWS S3 Integration](./AWS_S3_BACKUP_INTEGRATION.md)

---

## 🎯 Summary

**TL;DR**:
- ✅ Use `backup:complete` for full coverage
- ✅ App metadata → tracks deployments
- ✅ Database dumps → real data backups
- ✅ `databases` array is empty (expected)
- ✅ Run both systems together for best protection

**Quick Command**:
```bash
npm run backup:complete
```

