-- CreateTable
CREATE TABLE "stealth_meta_addresses" (
    "id" TEXT NOT NULL,
    "institution_client_id" TEXT NOT NULL,
    "label" TEXT,
    "scan_public_key" TEXT NOT NULL,
    "spend_public_key" TEXT NOT NULL,
    "encrypted_scan_key" TEXT NOT NULL,
    "encrypted_spend_key" TEXT NOT NULL,
    "viewing_key_shared" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stealth_meta_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stealth_payments" (
    "id" TEXT NOT NULL,
    "meta_address_id" TEXT NOT NULL,
    "stealth_address" TEXT NOT NULL,
    "ephemeral_public_key" TEXT NOT NULL,
    "escrow_id" TEXT,
    "token_mint" TEXT NOT NULL,
    "amount_raw" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "release_tx_signature" TEXT,
    "sweep_tx_signature" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "swept_at" TIMESTAMP(3),

    CONSTRAINT "stealth_payments_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "PrivacyLevel" AS ENUM ('NONE', 'STEALTH');

-- AlterTable: Add privacy fields to institution_escrows
-- Add column without default first (avoids backfilling existing rows with 'STEALTH')
ALTER TABLE "institution_escrows" ADD COLUMN "privacy_level" "PrivacyLevel";
ALTER TABLE "institution_escrows" ADD COLUMN "stealth_payment_id" TEXT;

-- Set default for new rows only (existing rows keep NULL = no privacy was used)
ALTER TABLE "institution_escrows" ALTER COLUMN "privacy_level" SET DEFAULT 'STEALTH';

-- AlterTable: Add stealth meta-address link to institution_accounts (1:1)
ALTER TABLE "institution_accounts" ADD COLUMN "stealth_meta_address_id" TEXT;

-- AddForeignKey
ALTER TABLE "institution_accounts" ADD CONSTRAINT "institution_accounts_stealth_meta_address_id_fkey" FOREIGN KEY ("stealth_meta_address_id") REFERENCES "stealth_meta_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (unique: 1:1 relationship between account and meta-address)
CREATE UNIQUE INDEX "institution_accounts_stealth_meta_address_id_key" ON "institution_accounts"("stealth_meta_address_id");

-- CreateIndex
CREATE INDEX "stealth_meta_addresses_institution_client_id_idx" ON "stealth_meta_addresses"("institution_client_id");

-- CreateIndex (unique constraint on client + label)
CREATE UNIQUE INDEX "stealth_meta_addresses_institution_client_id_label_key" ON "stealth_meta_addresses"("institution_client_id", "label");

-- CreateIndex
CREATE INDEX "stealth_payments_meta_address_id_idx" ON "stealth_payments"("meta_address_id");

-- CreateIndex
CREATE INDEX "stealth_payments_stealth_address_idx" ON "stealth_payments"("stealth_address");

-- CreateIndex
CREATE INDEX "stealth_payments_escrow_id_idx" ON "stealth_payments"("escrow_id");

-- CreateIndex
CREATE INDEX "stealth_payments_status_idx" ON "stealth_payments"("status");

-- AddForeignKey
ALTER TABLE "stealth_meta_addresses" ADD CONSTRAINT "stealth_meta_addresses_institution_client_id_fkey" FOREIGN KEY ("institution_client_id") REFERENCES "institution_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stealth_payments" ADD CONSTRAINT "stealth_payments_meta_address_id_fkey" FOREIGN KEY ("meta_address_id") REFERENCES "stealth_meta_addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
