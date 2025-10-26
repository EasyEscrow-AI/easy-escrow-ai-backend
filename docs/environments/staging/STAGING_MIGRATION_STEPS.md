# Staging Database Migration - Quick Reference

## Migration: Add Deposit Transaction IDs to Receipt

**Date:** October 23, 2025  
**Migration:** `20251023094344_add_deposit_transaction_ids_to_receipt`

---

## Issue

The `staging_user` database account lacks owner privileges to alter the `receipts` table.

**Error:**
```
ERROR: must be owner of table receipts
Database error code: 42501
```

---

## Solution 1: Grant Permissions (Recommended)

### Step 1: Login to DigitalOcean Database Console

1. Go to DigitalOcean Dashboard
2. Navigate to **Databases** → **easyescrow-staging-postgres**
3. Click **"Console"** or use connection string with admin user

### Step 2: Grant Permissions

```sql
-- Grant permissions to staging_user
GRANT ALL PRIVILEGES ON TABLE receipts TO staging_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;

-- Verify permissions
\dp receipts
```

### Step 3: Re-run Migration

```bash
# From your local machine
npx prisma migrate deploy
```

---

## Solution 2: Run SQL Manually

### Step 1: Login to DigitalOcean Database Console (as admin)

### Step 2: Execute Migration SQL

```sql
-- Add deposit transaction ID columns
ALTER TABLE "receipts" 
  ADD COLUMN "deposit_nft_tx_id" TEXT,
  ADD COLUMN "deposit_usdc_tx_id" TEXT;

-- Add comments for documentation
COMMENT ON COLUMN "receipts"."deposit_nft_tx_id" IS 'Transaction ID for NFT deposit';
COMMENT ON COLUMN "receipts"."deposit_usdc_tx_id" IS 'Transaction ID for USDC deposit';
```

### Step 3: Mark Migration as Applied

```bash
# From your local machine
npx prisma migrate resolve --applied 20251023094344_add_deposit_transaction_ids_to_receipt
```

---

## Solution 3: Temporary Admin Connection

### Step 1: Update .env.staging (temporarily)

```bash
# Replace with admin credentials
DATABASE_URL=postgresql://admin_user:admin_password@easyescrow-staging-postgres-do-user-11230012-0.d.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require
```

### Step 2: Run Migration

```bash
npx prisma migrate deploy
```

### Step 3: Revert .env.staging

```bash
# Change back to staging_user credentials
DATABASE_URL=postgresql://staging_user:password@easyescrow-staging-postgres-do-user-11230012-0.d.db.ondigitalocean.com:25060/easyescrow_staging?sslmode=require
```

---

## Verification

After applying the migration, verify the changes:

```sql
-- Check table structure
\d receipts

-- Expected new columns:
-- deposit_nft_tx_id  | text |
-- deposit_usdc_tx_id | text |
```

---

## DigitalOcean Database Access

### Via Console (Web Interface)

1. Go to: https://cloud.digitalocean.com/databases
2. Select: **easyescrow-staging-postgres**
3. Click: **"Console"** button (top right)
4. Executes commands as admin user automatically

### Via CLI (doctl)

```bash
# Login
doctl auth init

# Get connection string
doctl databases connection easyescrow-staging-postgres

# Or connect directly
doctl databases connection easyescrow-staging-postgres --get-connection-string
```

### Via psql (Direct Connection)

```bash
# Get connection details from DigitalOcean dashboard
psql "postgresql://admin_user:password@host:25060/easyescrow_staging?sslmode=require"
```

---

## Migration Impact

**Tables Affected:** `receipts`

**Changes:**
- Added `deposit_nft_tx_id` column (TEXT, nullable)
- Added `deposit_usdc_tx_id` column (TEXT, nullable)

**No Data Loss:** Migration only adds columns, doesn't modify existing data

**Backwards Compatible:** Existing code continues to work, new fields are optional

---

## Post-Migration Steps

After migration is successful:

1. **Restart Staging Backend**
   ```bash
   # Via DigitalOcean Console
   # Go to Apps → easy-escrow-staging → Settings → Force Redeploy
   ```

2. **Verify Receipt Generation**
   ```bash
   # Run E2E test
   npm run test:staging:e2e:happy-path:verbose
   ```

3. **Check Receipt JSON Files**
   - Receipts should now include `depositNftTxId` and `depositUsdcTxId`
   - JSON files saved to `/receipts` folder on server
   - `transactions` array should have all 4 transaction types

---

## Rollback (If Needed)

If you need to rollback the migration:

```sql
-- Remove columns
ALTER TABLE "receipts" 
  DROP COLUMN IF EXISTS "deposit_nft_tx_id",
  DROP COLUMN IF EXISTS "deposit_usdc_tx_id";
```

**Note:** Only rollback if migration causes issues. The changes are additive and safe.

---

## Support

If you encounter issues:

1. Check DigitalOcean database logs
2. Verify connection string and credentials
3. Ensure admin user has SUPERUSER or table owner privileges
4. Review Prisma migration status: `npx prisma migrate status`

---

## Related Files

- Migration SQL: `prisma/migrations/20251023094344_add_deposit_transaction_ids_to_receipt/migration.sql`
- Schema: `prisma/schema.prisma` (Receipt model)
- Documentation: `docs/tasks/RECEIPT_COMPLETE_AUDIT_TRAIL.md`

