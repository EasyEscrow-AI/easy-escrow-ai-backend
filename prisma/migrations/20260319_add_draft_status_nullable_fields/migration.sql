-- Add DRAFT status to InstitutionEscrowStatus enum
ALTER TYPE "InstitutionEscrowStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'CREATED';

-- Make fields nullable for draft escrows (partial data allowed)
ALTER TABLE "institution_escrows" ALTER COLUMN "recipient_wallet" DROP NOT NULL;
ALTER TABLE "institution_escrows" ALTER COLUMN "corridor" DROP NOT NULL;
ALTER TABLE "institution_escrows" ALTER COLUMN "condition_type" DROP NOT NULL;
ALTER TABLE "institution_escrows" ALTER COLUMN "expires_at" DROP NOT NULL;

-- Enforce non-null fields for non-DRAFT escrows at the DB level
ALTER TABLE "institution_escrows" ADD CONSTRAINT "chk_institution_escrows_draft_nullable"
  CHECK (status = 'DRAFT' OR (
    recipient_wallet IS NOT NULL AND
    corridor IS NOT NULL AND
    condition_type IS NOT NULL AND
    expires_at IS NOT NULL
  ));
