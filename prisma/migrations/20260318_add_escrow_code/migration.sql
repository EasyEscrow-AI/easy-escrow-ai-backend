-- AlterTable: Add escrow_code column to institution_escrows
-- This adds a human-readable escrow identifier in EE-XXXX-XXXX format.
-- The existing escrow_id (UUID) is kept for on-chain PDA derivation.

-- Step 1: Add the column as nullable first
ALTER TABLE "institution_escrows" ADD COLUMN "escrow_code" TEXT;

-- Step 2: Backfill existing rows with generated codes based on escrow_id
-- Uses first 8 chars of UUID formatted as EE-XXXX-XXXX
UPDATE "institution_escrows"
SET "escrow_code" = 'EE-' || UPPER(SUBSTRING(REPLACE("escrow_id"::text, '-', '') FROM 1 FOR 4)) || '-' || UPPER(SUBSTRING(REPLACE("escrow_id"::text, '-', '') FROM 5 FOR 4))
WHERE "escrow_code" IS NULL;

-- Step 3: Make the column NOT NULL
ALTER TABLE "institution_escrows" ALTER COLUMN "escrow_code" SET NOT NULL;

-- Step 4: Add unique constraint and index
CREATE UNIQUE INDEX "institution_escrows_escrow_code_key" ON "institution_escrows"("escrow_code");
CREATE INDEX "institution_escrows_escrow_code_idx" ON "institution_escrows"("escrow_code");
