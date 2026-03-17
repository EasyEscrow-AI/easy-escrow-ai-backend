-- CreateEnum
CREATE TYPE "AiAnalysisType" AS ENUM ('DOCUMENT', 'ESCROW', 'CLIENT');

-- AlterTable: add analysis_type, client_id, summary; make escrow_id optional
ALTER TABLE "institution_ai_analyses"
  ADD COLUMN "analysis_type" "AiAnalysisType" NOT NULL DEFAULT 'DOCUMENT',
  ADD COLUMN "client_id" TEXT,
  ADD COLUMN "summary" TEXT;

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
