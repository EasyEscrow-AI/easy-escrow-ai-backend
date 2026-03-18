-- CreateEnum
CREATE TYPE "AiAnalysisType" AS ENUM ('DOCUMENT', 'ESCROW', 'CLIENT');

-- AlterTable: add analysis_type, client_id, summary; make escrow_id optional
ALTER TABLE "institution_ai_analyses"
  ADD COLUMN "analysis_type" "AiAnalysisType" NOT NULL DEFAULT 'DOCUMENT',
  ADD COLUMN "client_id" TEXT,
  ADD COLUMN "summary" TEXT;

-- Backfill client_id from escrow's client for existing rows
UPDATE "institution_ai_analyses" a
  SET "client_id" = e."client_id"
  FROM "institution_escrows" e
  WHERE a."escrow_id" = e."escrow_id" AND a."client_id" IS NULL;

-- Ensure at least one of escrow_id or client_id is present
ALTER TABLE "institution_ai_analyses"
  ADD CONSTRAINT "institution_ai_analyses_ownership_chk"
  CHECK ("escrow_id" IS NOT NULL OR "client_id" IS NOT NULL);

-- Make escrow_id nullable (was required, now optional for CLIENT analyses)
ALTER TABLE "institution_ai_analyses"
  ALTER COLUMN "escrow_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "institution_ai_analyses_analysis_type_idx" ON "institution_ai_analyses"("analysis_type");
CREATE INDEX "institution_ai_analyses_client_id_idx" ON "institution_ai_analyses"("client_id");

-- AddForeignKey (client relation)
ALTER TABLE "institution_ai_analyses"
  ADD CONSTRAINT "institution_ai_analyses_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
