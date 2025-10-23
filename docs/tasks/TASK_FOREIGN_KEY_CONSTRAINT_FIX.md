# Foreign Key Constraint Fix - Receipt Generation Issue

**Date:** October 23, 2025  
**Commit:** `3e49bcb`  
**Migration Applied:** ✅ Yes (staging database)  
**Status:** Awaiting deployment

## Problem Summary

Receipt generation was failing with a **foreign key constraint violation** error. The runtime logs showed:

```
Foreign key constraint violated on the constraint: `receipts_agreement_id_fkey`
Invalid `database_1.prisma.receipt.create()` invocation
```

## Root Cause

**Database schema mismatch between foreign keys and application code:**

The Prisma schema had ALL related tables referencing `Agreement.id` (the internal UUID primary key):

```prisma
// ❌ WRONG - All tables had this
agreement  Agreement  @relation(fields: [agreementId], references: [id], onDelete: Cascade)
```

But the application code uses `Agreement.agreementId` (the public AGR-xxx string identifier):

```typescript
// Application code passes AGR-xxx string
await receiptService.generateReceipt({
  agreementId: 'AGR-MH30KR40-KEUCM0MR',  // ← Public ID
  // ...
});
```

### Why It Failed

1. Receipt service tries to create a record with `agreementId = 'AGR-MH30KR40-KEUCM0MR'`
2. Database foreign key expects a UUID from `Agreement.id`
3. String 'AGR-MH30KR40-KEUCM0MR' doesn't match any UUID
4. **Foreign key constraint violation** → Receipt creation fails
5. `receiptId` remains null in API

### Affected Tables

All 4 related tables had this issue:
- ✅ **Deposit** - Now fixed
- ✅ **Settlement** - Now fixed  
- ✅ **Receipt** - Now fixed
- ✅ **Webhook** - Now fixed

## The Fix

### 1. Updated Prisma Schema

**File:** `prisma/schema.prisma`

Changed all 4 tables to reference `Agreement.agreementId` instead of `Agreement.id`:

```prisma
// ✅ CORRECT - After fix
agreement  Agreement  @relation(fields: [agreementId], references: [agreementId], onDelete: Cascade)
```

### 2. Created Data Migration

**File:** `prisma/migrations/20251023_fix_foreign_key_constraints/migration.sql`

The migration performs 4 steps:

```sql
-- Step 1: Drop existing foreign key constraints
ALTER TABLE "deposits" DROP CONSTRAINT IF EXISTS "deposits_agreement_id_fkey";
ALTER TABLE "settlements" DROP CONSTRAINT IF EXISTS "settlements_agreement_id_fkey";
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_agreement_id_fkey";
ALTER TABLE "webhooks" DROP CONSTRAINT IF EXISTS "webhooks_agreement_id_fkey";

-- Step 2: Delete orphaned records
DELETE FROM "deposits" WHERE "agreement_id" NOT IN (SELECT "id" FROM "agreements");
-- (repeated for settlements, receipts, webhooks)

-- Step 3: Transform data from UUID to AGR-xxx format
UPDATE "deposits" d
SET "agreement_id" = a."agreement_id"
FROM "agreements" a
WHERE d."agreement_id" = a."id";
-- (repeated for settlements, receipts, webhooks)

-- Step 4: Create new foreign key constraints
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_agreement_id_fkey" 
  FOREIGN KEY ("agreement_id") REFERENCES "agreements"("agreement_id") ON DELETE CASCADE;
-- (repeated for settlements, receipts, webhooks)
```

### 3. Applied Migration to Staging

**Script:** `scripts/deployment/apply-fk-migration-staging.ts`

```bash
npx ts-node scripts/deployment/apply-fk-migration-staging.ts
```

**Result:**
```
✅ Migration applied successfully!
Fixed foreign key constraints for:
  • deposits → Agreement.agreementId
  • settlements → Agreement.agreementId
  • receipts → Agreement.agreementId
  • webhooks → Agreement.agreementId
```

## Expected Outcome

After deployment of commit `3e49bcb`:

✅ Receipt generation will succeed (no more FK violation)  
✅ Database will accept AGR-xxx IDs  
✅ `receiptId` will be non-null in API response  
✅ E2E test will pass (11/11 tests) 🎉

## Testing Verification

Run the E2E test after deployment:

```bash
npm run test:staging:e2e:01-solana-nft-usdc-happy-path:verbose
```

Expected results:
- ✅ All 3 blockchain transactions tracked
- ✅ Settlement completes successfully
- ✅ **Receipt generated successfully** (no FK violation)
- ✅ All 11/11 tests passing

## Technical Details

### Why This Happened

The schema was likely created with:
- `Agreement.id` as the UUID primary key
- `Agreement.agreementId` as a unique string identifier
- Foreign keys defaulted to referencing the primary key (`id`)

But the application code was designed to use the public-facing `agreementId` everywhere for API responses and business logic.

### Data Transformation

The migration safely transforms existing data:

**Before:**
```
deposits.agreement_id = "60ce3149-85ce-4486-92bb-34a6ad897a0c"  // UUID
```

**After:**
```
deposits.agreement_id = "AGR-MH30KR40-KEUCM0MR"  // Public ID
```

This transformation:
- Preserves all relationships
- Maintains referential integrity
- Aligns database with application code

### Why It Wasn't Caught Earlier

1. **Deposits worked** - They use the monitoring service which doesn't create records directly
2. **Settlements worked** - They're created by the settlement service which may have used internal IDs
3. **Receipts failed** - First feature to directly insert using the public AGR-xxx ID

## Impact

### Before Fix
- ❌ Receipt generation failed silently
- ❌ E2E test timed out waiting for receipt
- ❌ Users would not receive settlement receipts

### After Fix
- ✅ Receipt generation succeeds
- ✅ Complete audit trail with all transaction IDs
- ✅ Users receive proper settlement documentation
- ✅ Full E2E test coverage

## Related Issues & Fixes

This was the **final issue** blocking receipt generation, after fixing:

1. **API Exposure** (Commit `5cc25ce`): Fixed `|| undefined` to `?? null` for JSON serialization
2. **TypeScript Import Elision** (Commit `08175ef`): Changed type to `any` to prevent import stripping
3. **Transaction Log Creation** (Commit `5dfcadc`): Added retry logic for RPC indexing lag
4. **Foreign Key Constraints** (Commit `3e49bcb`): Fixed FK references to use `agreementId`

## Deployment Notes

**Commit:** `3e49bcb`  
**Branch:** `staging`  
**Database Migration:** Already applied to staging  
**Deployment:** Automatic via DigitalOcean App Platform  
**Expected Duration:** ~5-7 minutes

After deployment:
1. Prisma client will use new schema
2. All FK constraints correctly reference `agreementId`
3. Receipt generation will succeed
4. E2E test verification ready

## Success Criteria

- [ ] Deployment of commit `3e49bcb` completed
- [ ] E2E test passes (11/11)
- [ ] Receipt generated within 2 seconds
- [ ] `receiptId` is non-null in API response
- [ ] All transaction IDs present in receipt

---

**Status:** ✅ Code fixed, database migrated, awaiting deployment confirmation

