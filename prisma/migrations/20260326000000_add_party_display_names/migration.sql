-- AlterTable: Add optional party display name columns to institution_escrows
ALTER TABLE "institution_escrows" ADD COLUMN "payer_name" TEXT;
ALTER TABLE "institution_escrows" ADD COLUMN "payer_account_label" TEXT;
ALTER TABLE "institution_escrows" ADD COLUMN "payer_branch_name" TEXT;
ALTER TABLE "institution_escrows" ADD COLUMN "recipient_name" TEXT;
ALTER TABLE "institution_escrows" ADD COLUMN "recipient_account_label" TEXT;
ALTER TABLE "institution_escrows" ADD COLUMN "recipient_branch_name" TEXT;
