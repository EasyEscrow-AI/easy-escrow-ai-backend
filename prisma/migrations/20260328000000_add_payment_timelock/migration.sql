-- AlterTable: Add payment timelock fields to institution_escrows
ALTER TABLE "institution_escrows" ADD COLUMN "unlock_at" TIMESTAMP(3),
ADD COLUMN "timelock_hours" INTEGER;

-- AlterTable: Add default timelock hours to institution_client_settings
ALTER TABLE "institution_client_settings" ADD COLUMN "default_timelock_hours" INTEGER;

-- CreateIndex
CREATE INDEX "idx_inst_escrow_unlock_at" ON "institution_escrows"("unlock_at");
