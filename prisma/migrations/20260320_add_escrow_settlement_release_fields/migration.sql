-- Add settlement and release configuration fields to institution escrows
ALTER TABLE "institution_escrows" ADD COLUMN "settlement_mode" TEXT;
ALTER TABLE "institution_escrows" ADD COLUMN "release_mode" TEXT;
ALTER TABLE "institution_escrows" ADD COLUMN "approval_parties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "institution_escrows" ADD COLUMN "release_conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "institution_escrows" ADD COLUMN "approval_instructions" TEXT;
