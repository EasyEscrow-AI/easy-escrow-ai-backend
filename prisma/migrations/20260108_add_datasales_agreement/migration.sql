-- CreateEnum
CREATE TYPE "DataSalesStatus" AS ENUM ('PENDING_DEPOSITS', 'DATA_LOCKED', 'SOL_LOCKED', 'BOTH_LOCKED', 'APPROVED', 'SETTLED', 'EXPIRED', 'CANCELLED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "datasales_agreements" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "seller_wallet" TEXT NOT NULL,
    "buyer_wallet" TEXT,
    "price_lamports" BIGINT NOT NULL,
    "platform_fee_lamports" BIGINT NOT NULL,
    "platform_fee_bps" INTEGER NOT NULL DEFAULT 250,
    "deposit_window_ends_at" TIMESTAMP(3) NOT NULL,
    "access_duration_hours" INTEGER NOT NULL DEFAULT 168,
    "access_expires_at" TIMESTAMP(3),
    "s3_bucket_name" TEXT NOT NULL,
    "s3_region" TEXT NOT NULL DEFAULT 'us-east-1',
    "files" JSONB,
    "total_size_bytes" BIGINT,
    "escrow_pda" TEXT,
    "escrow_bump" INTEGER,
    "sol_vault_pda" TEXT,
    "seller_deposited_at" TIMESTAMP(3),
    "seller_deposit_tx_id" TEXT,
    "buyer_deposited_at" TIMESTAMP(3),
    "buyer_deposit_tx_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "rejection_reason" TEXT,
    "rejection_count" INTEGER NOT NULL DEFAULT 0,
    "status" "DataSalesStatus" NOT NULL DEFAULT 'PENDING_DEPOSITS',
    "settle_tx_signature" TEXT,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "datasales_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "datasales_agreements_agreement_id_key" ON "datasales_agreements"("agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "datasales_agreements_s3_bucket_name_key" ON "datasales_agreements"("s3_bucket_name");

-- CreateIndex
CREATE INDEX "datasales_agreements_seller_wallet_idx" ON "datasales_agreements"("seller_wallet");

-- CreateIndex
CREATE INDEX "datasales_agreements_buyer_wallet_idx" ON "datasales_agreements"("buyer_wallet");

-- CreateIndex
CREATE INDEX "datasales_agreements_status_idx" ON "datasales_agreements"("status");

-- CreateIndex
CREATE INDEX "datasales_agreements_deposit_window_ends_at_idx" ON "datasales_agreements"("deposit_window_ends_at");
