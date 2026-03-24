-- Add settlement and release configuration fields to institution escrows
ALTER TABLE "institution_escrows" ADD COLUMN "settlement_mode" TEXT CHECK ("settlement_mode" IN ('escrow', 'direct'));
ALTER TABLE "institution_escrows" ADD COLUMN "release_mode" TEXT CHECK ("release_mode" IN ('manual', 'ai'));
ALTER TABLE "institution_escrows" ADD COLUMN "approval_parties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "institution_escrows" ADD COLUMN "release_conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "institution_escrows" ADD COLUMN "approval_instructions" TEXT;
