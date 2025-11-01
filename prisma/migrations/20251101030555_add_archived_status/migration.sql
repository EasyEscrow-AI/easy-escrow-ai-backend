-- AlterEnum
ALTER TYPE "AgreementStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "agreements" ADD COLUMN     "archive_reason" TEXT,
ADD COLUMN     "archived_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "agreements_archived_at_idx" ON "agreements"("archived_at");
