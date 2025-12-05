# Production Database Truncation Guide

**Created:** December 5, 2025  
**Task:** 31.6 - Truncate Production Database Before Deployment  
**Status:** Ready for Execution

---

## 🎯 Purpose

Clear all data from the production PostgreSQL database before deploying the atomic swap system to ensure a clean slate with no test data or residual records.

**Important:** This is a **zero-user deployment** - there is no production user data to preserve, making this operation safe.

---

## ⚠️ Safety Considerations

### Why This Is Safe
- **Zero Users:** No production users exist
- **No Production Data:** All existing data is from testing/staging
- **Fresh Start:** Atomic swap system requires clean database
- **No Migration:** No backwards compatibility concerns

### What Gets Deleted
**Old Escrow System:**
- `agreements` - Old escrow agreements
- `deposits` - Deposit records
- `settlements` - Settlement records
- `receipts` - Receipt records
- `webhooks` - Webhook delivery logs
- `transaction_logs` - Transaction logs

**Atomic Swap System:**
- `swap_offers` - Swap offers
- `swap_transactions` - Transaction records
- `zero_fee_swap_logs` - Audit logs

**Supporting Tables:**
- `idempotency_keys` - Idempotency tracking
- `nonce_pool` - Nonce accounts
- `users` - User records
- **`authorized_apps`** - API key management (⚠️ See note below)

### Important Note: Authorized Apps

The truncation script **WILL DELETE** all entries from `authorized_apps` table, including any API keys configured for zero-fee swaps.

**Action Required After Truncation:**
1. Re-run the API key seeding script
2. Verify authorized apps are configured correctly

See: `temp/seed-staging.sql` (update for production)

---

## 📋 Pre-Truncation Checklist

Before running truncation:

- [ ] **Verify Database:** Confirm you're connected to **PRODUCTION** database
- [ ] **Backup (Optional):** If desired, create a backup of current state:
  ```bash
  pg_dump $DATABASE_ADMIN_URL > backup-before-truncation-$(date +%Y%m%d).sql
  ```
- [ ] **Check Record Counts:** Review current data to confirm it's test data
- [ ] **Team Notification:** Inform team that truncation is about to occur
- [ ] **Maintenance Mode (Optional):** Put API in maintenance mode if desired

---

## 🚀 Truncation Methods

### Method 1: Interactive (Recommended for Manual Execution)

**Script:** `scripts/truncate-production-database.sql`

**Features:**
- Requires explicit `YES` confirmation
- Shows before/after record counts
- Transaction-wrapped (can rollback if needed)
- Detailed progress output

**Usage:**
```bash
# Using environment variable
psql $DATABASE_ADMIN_URL -f scripts/truncate-production-database.sql

# Or with explicit connection
psql -h easyescrow-production-postgres-do-user-11230012-0.d.db.ondigitalocean.com \
     -p 25060 \
     -U doadmin \
     -d easyescrow_production \
     -f scripts/truncate-production-database.sql

# You will be prompted:
# Type YES to confirm truncation: YES
```

**Expected Output:**
```
╔════════════════════════════════════════════════════════════════╗
║     PRODUCTION DATABASE TRUNCATION - CONFIRMATION REQUIRED     ║
╚════════════════════════════════════════════════════════════════╝

Connected to database:
 current_database 
------------------
 easyescrow_production

⚠️  WARNING: This will DELETE ALL DATA from the following tables:
   - agreements (old escrow system)
   - deposits
   ... (list of all tables)

Type YES to confirm truncation: YES

✅ Confirmation received. Proceeding with truncation...

📊 Counting records before truncation...

      table_name      | record_count 
----------------------+--------------
 agreements           |            5
 deposits             |            3
 ...

🗑️  Truncating tables...

📊 Verifying truncation (all counts should be 0)...

      table_name      | record_count 
----------------------+--------------
 agreements           |            0
 deposits             |            0
 ...

✅ All tables truncated successfully!
✅ Transaction committed. Database is now clean!
```

### Method 2: Automated (No Confirmation)

**Script:** `scripts/truncate-production-database-no-confirm.sql`

**Features:**
- No confirmation prompts (runs automatically)
- Suitable for automated deployment scripts
- Still shows before/after counts
- Transaction-wrapped

**Usage:**
```bash
# Using environment variable
psql $DATABASE_ADMIN_URL -f scripts/truncate-production-database-no-confirm.sql

# Or with explicit connection
psql -h <host> -p <port> -U <user> -d <database> \
     -f scripts/truncate-production-database-no-confirm.sql
```

**⚠️ Warning:** This script runs WITHOUT confirmation. Use with caution!

### Method 3: Manual SQL Execution

If you prefer to run commands manually:

```sql
-- Connect to production database
\c easyescrow_production

-- Begin transaction
BEGIN;

-- Show record counts before
SELECT 'agreements' AS table_name, COUNT(*) AS count FROM agreements
UNION ALL SELECT 'swap_offers', COUNT(*) FROM swap_offers
UNION ALL SELECT 'swap_transactions', COUNT(*) FROM swap_transactions;

-- Truncate tables (CASCADE handles foreign keys)
TRUNCATE TABLE zero_fee_swap_logs CASCADE;
TRUNCATE TABLE swap_transactions CASCADE;
TRUNCATE TABLE swap_offers CASCADE;
TRUNCATE TABLE webhooks CASCADE;
TRUNCATE TABLE transaction_logs CASCADE;
TRUNCATE TABLE receipts CASCADE;
TRUNCATE TABLE settlements CASCADE;
TRUNCATE TABLE deposits CASCADE;
TRUNCATE TABLE agreements CASCADE;
TRUNCATE TABLE idempotency_keys CASCADE;
TRUNCATE TABLE nonce_pool CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE authorized_apps CASCADE;

-- Verify truncation
SELECT 'agreements' AS table_name, COUNT(*) AS count FROM agreements
UNION ALL SELECT 'swap_offers', COUNT(*) FROM swap_offers
UNION ALL SELECT 'swap_transactions', COUNT(*) FROM swap_transactions;

-- Commit (or ROLLBACK if something looks wrong)
COMMIT;
```

---

## ✅ Post-Truncation Checklist

After successful truncation:

- [ ] **Verify Empty Tables:** Confirm all record counts are 0
- [ ] **Re-seed Authorized Apps:**
  ```bash
  # Update production API key in seed script
  # Then run:
  psql $DATABASE_ADMIN_URL -f scripts/seed-production-authorized-apps.sql
  ```
- [ ] **Verify Authorized Apps:** Confirm API keys are configured
- [ ] **Test Database Connection:** Verify application can connect
- [ ] **Run Migrations (if any pending):**
  ```bash
  npm run prisma:migrate:deploy
  ```
- [ ] **Restart Application (if running):** Clear any cached data
- [ ] **Document Completion:** Note truncation in deployment log

---

## 🔍 Verification Commands

### Check Record Counts
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  (SELECT COUNT(*) FROM pg_class WHERE relname = tablename) AS row_count
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

### Check Specific Tables
```sql
SELECT COUNT(*) FROM agreements;      -- Should be 0
SELECT COUNT(*) FROM swap_offers;     -- Should be 0
SELECT COUNT(*) FROM authorized_apps; -- Should be 0 (until re-seeded)
SELECT COUNT(*) FROM nonce_pool;      -- Should be 0
```

### Verify Database Size
```sql
SELECT pg_database_size('easyescrow_production');
SELECT pg_size_pretty(pg_database_size('easyescrow_production'));
```

---

## 🐛 Troubleshooting

### Issue: Permission Denied
```
ERROR: permission denied for table agreements
```

**Solution:** Ensure you're using the admin user with proper permissions:
```bash
# Use DATABASE_ADMIN_URL instead of DATABASE_URL
psql $DATABASE_ADMIN_URL -f scripts/truncate-production-database.sql
```

### Issue: Foreign Key Constraint Errors
```
ERROR: cannot truncate table "agreements" because other objects depend on it
```

**Solution:** The script uses `CASCADE` which should handle this. If you see this error, ensure the SQL includes `CASCADE`:
```sql
TRUNCATE TABLE agreements CASCADE;
```

### Issue: Transaction Still Open
```
WARNING: there is no transaction in progress
```

**Solution:** This is harmless. It means a previous transaction was already committed or rolled back.

### Issue: Cannot Connect to Database
```
psql: error: connection to server failed
```

**Solution:** 
1. Verify `DATABASE_ADMIN_URL` is set correctly
2. Check database is running: `doctl databases list`
3. Verify connection string format:
   ```
   postgresql://user:password@host:port/database?sslmode=require
   ```

---

## 📝 Example Execution Flow

**Complete truncation workflow:**

```bash
# 1. Set up environment
export DATABASE_ADMIN_URL="postgresql://doadmin:PASSWORD@host:25060/easyescrow_production?sslmode=require"

# 2. Optional: Create backup
pg_dump $DATABASE_ADMIN_URL > backup-$(date +%Y%m%d-%H%M%S).sql
echo "✅ Backup created"

# 3. Run truncation (interactive)
psql $DATABASE_ADMIN_URL -f scripts/truncate-production-database.sql
# Type: YES

# 4. Verify empty database
psql $DATABASE_ADMIN_URL -c "SELECT COUNT(*) FROM agreements;"
psql $DATABASE_ADMIN_URL -c "SELECT COUNT(*) FROM swap_offers;"
psql $DATABASE_ADMIN_URL -c "SELECT COUNT(*) FROM authorized_apps;"
echo "✅ Verification complete"

# 5. Re-seed authorized apps
# First, update the SQL with production API key hash
psql $DATABASE_ADMIN_URL -f scripts/seed-production-authorized-apps.sql
echo "✅ Authorized apps re-seeded"

# 6. Final verification
psql $DATABASE_ADMIN_URL -c "SELECT id, name, zero_fee_enabled FROM authorized_apps;"
echo "✅ Database ready for deployment"
```

---

## 🔒 Security Notes

### Connection String Safety
- **Never commit** `DATABASE_ADMIN_URL` to version control
- Store in `.env.production` (gitignored)
- Use DigitalOcean secrets for production deployment

### Password Protection
- Production database password should be rotated after initial setup
- Limit access to database admin credentials
- Use separate read-only credentials for monitoring

### Audit Trail
- Log truncation execution with timestamp
- Document who performed the truncation
- Include in deployment documentation

---

## 📅 When to Run

**Timing:**
1. **Before First Production Deployment** ← **Required**
2. After any failed deployments that left partial data
3. When resetting production environment for major updates

**Frequency:** Should only need to run **ONCE** before initial production launch.

---

## 📞 Support

If issues arise during truncation:

1. **Stop immediately** - Do not proceed if errors occur
2. **Rollback transaction** - If still in transaction, run `ROLLBACK;`
3. **Check logs** - Review PostgreSQL logs in DigitalOcean console
4. **Verify connection** - Ensure connected to correct database
5. **Contact team** - If unsure, consult with team before proceeding

---

## ✅ Success Criteria

Truncation is considered successful when:
- ✅ All table record counts are 0 (except system tables)
- ✅ No errors during truncation process
- ✅ Authorized apps successfully re-seeded
- ✅ Application can connect to database
- ✅ Migrations can run successfully

---

**Last Updated:** December 5, 2025  
**Next Step:** Deploy application to production (Task 37)

