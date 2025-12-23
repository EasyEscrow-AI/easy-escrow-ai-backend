# 🚨 URGENT: Staging Database Migration Required

## Issue

E2E tests on staging are failing with:
```
The column `offered_sol_lamports` does not exist in the current database.
```

## Root Cause

The database migration from PR #263 (adding `offeredSolLamports` and `requestedSolLamports` to the `SwapOffer` model) has not been deployed to the staging database.

## Solution

### Step 1: Run Migration on Staging

**Option A: Via DigitalOcean Console**
1. Go to DigitalOcean App Platform Console
2. Navigate to the staging app
3. Open the Console tab
4. Run:
   ```bash
   npx prisma migrate deploy
   ```

**Option B: Via DigitalOcean CLI** (if you have `doctl` installed)
```bash
doctl apps exec <app-id> -- npx prisma migrate deploy
```

### Step 2: Verify Migration

After running the migration, verify the columns exist:
```bash
npx prisma studio
```

Or query the database directly to check the `swap_offers` table schema.

### Step 3: Re-run E2E Tests

Once the migration is complete, re-run the E2E tests:
```bash
npm run test:staging:e2e:atomic:nft-sol
npm run test:staging:e2e:atomic:nft-for-nft
```

## Migration Details

**Migration Name:** `add_sol_lamports_to_swap_offer`

**Columns Added:**
- `offered_sol_lamports` (BigInt, nullable)
- `requested_sol_lamports` (BigInt, nullable)

**Affected Table:** `swap_offers`

## Related PRs

- **PR #263:** Implement transaction building in acceptOffer endpoint
  - Added `offeredSolLamports` and `requestedSolLamports` to Prisma schema
  - Created migration file
  - Updated `OfferManager` to store and retrieve SOL amounts

- **PR #266:** Add ACCEPTED status to offer lifecycle
  - Updated `OfferStatus` enum to include `ACCEPTED`
  - Modified offer lifecycle flow

## Prevention

To prevent this in the future:

1. **Add Migration Check to Deployment:**
   Add a pre-deploy job in `.do/app-staging.yaml`:
   ```yaml
   jobs:
     - name: db-migrate
       kind: PRE_DEPLOY
       run_command: npx prisma migrate deploy
   ```

2. **Document Migration Steps:**
   Always document required migrations in PR descriptions

3. **CI/CD Pipeline:**
   Add migration checks to the CI/CD pipeline

## Current Status

- ✅ Migration created and committed to repository
- ❌ Migration NOT yet deployed to staging database
- ⏳ Waiting for manual deployment

## Next Steps

1. **IMMEDIATE:** Run `npx prisma migrate deploy` on staging
2. **VERIFY:** Check that columns exist in database
3. **TEST:** Run E2E tests to confirm fix
4. **UPDATE:** Check off this document once complete

---

**Created:** 2025-11-20
**Author:** AI Assistant
**Priority:** URGENT - Blocks all E2E testing

