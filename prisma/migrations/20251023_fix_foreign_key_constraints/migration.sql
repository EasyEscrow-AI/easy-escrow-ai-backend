-- Fix foreign key constraints to reference Agreement.agreementId instead of Agreement.id

-- Step 1: Drop existing foreign key constraints
ALTER TABLE "deposits" DROP CONSTRAINT IF EXISTS "deposits_agreement_id_fkey";
ALTER TABLE "settlements" DROP CONSTRAINT IF EXISTS "settlements_agreement_id_fkey";
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_agreement_id_fkey";
ALTER TABLE "webhooks" DROP CONSTRAINT IF EXISTS "webhooks_agreement_id_fkey";

-- Step 2: Delete orphaned records (records referencing non-existent agreements)
DELETE FROM "deposits" WHERE "agreement_id" NOT IN (SELECT "id" FROM "agreements");
DELETE FROM "settlements" WHERE "agreement_id" NOT IN (SELECT "id" FROM "agreements");
DELETE FROM "receipts" WHERE "agreement_id" NOT IN (SELECT "id" FROM "agreements");
DELETE FROM "webhooks" WHERE "agreement_id" NOT IN (SELECT "id" FROM "agreements");

-- Step 3: Update existing data to use agreementId instead of id
UPDATE "deposits" d
SET "agreement_id" = a."agreement_id"
FROM "agreements" a
WHERE d."agreement_id" = a."id";

UPDATE "settlements" s
SET "agreement_id" = a."agreement_id"
FROM "agreements" a
WHERE s."agreement_id" = a."id";

UPDATE "receipts" r
SET "agreement_id" = a."agreement_id"
FROM "agreements" a
WHERE r."agreement_id" = a."id";

UPDATE "webhooks" w
SET "agreement_id" = a."agreement_id"
FROM "agreements" a
WHERE w."agreement_id" = a."id";

-- Step 4: Add new foreign key constraints referencing agreementId
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_agreement_id_fkey" 
  FOREIGN KEY ("agreement_id") REFERENCES "agreements"("agreement_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_agreement_id_fkey" 
  FOREIGN KEY ("agreement_id") REFERENCES "agreements"("agreement_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_agreement_id_fkey" 
  FOREIGN KEY ("agreement_id") REFERENCES "agreements"("agreement_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_agreement_id_fkey" 
  FOREIGN KEY ("agreement_id") REFERENCES "agreements"("agreement_id") ON DELETE CASCADE ON UPDATE CASCADE;

