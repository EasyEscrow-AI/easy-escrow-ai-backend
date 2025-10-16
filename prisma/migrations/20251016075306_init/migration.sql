-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('PENDING', 'FUNDED', 'USDC_LOCKED', 'NFT_LOCKED', 'BOTH_LOCKED', 'SETTLED', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('USDC', 'NFT');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('ESCROW_FUNDED', 'ESCROW_ASSET_LOCKED', 'ESCROW_SETTLED', 'ESCROW_EXPIRED', 'ESCROW_REFUNDED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "agreements" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "escrow_pda" TEXT NOT NULL,
    "nft_mint" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "buyer" TEXT,
    "price" DECIMAL(20,9) NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "honor_royalties" BOOLEAN NOT NULL DEFAULT false,
    "status" "AgreementStatus" NOT NULL DEFAULT 'PENDING',
    "expiry" TIMESTAMP(3) NOT NULL,
    "usdc_deposit_addr" TEXT,
    "nft_deposit_addr" TEXT,
    "init_tx_id" TEXT,
    "settle_tx_id" TEXT,
    "cancel_tx_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "settled_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "type" "DepositType" NOT NULL,
    "depositor" TEXT NOT NULL,
    "amount" DECIMAL(20,9),
    "token_account" TEXT,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "tx_id" TEXT,
    "block_height" BIGINT,
    "nft_metadata" JSONB,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "nft_mint" TEXT NOT NULL,
    "price" DECIMAL(20,9) NOT NULL,
    "platform_fee" DECIMAL(20,9) NOT NULL,
    "creator_royalty" DECIMAL(20,9),
    "seller_received" DECIMAL(20,9) NOT NULL,
    "settle_tx_id" TEXT NOT NULL,
    "block_height" BIGINT NOT NULL,
    "buyer" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "fee_collector" TEXT,
    "royalty_recipient" TEXT,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "nft_mint" TEXT NOT NULL,
    "price" DECIMAL(20,9) NOT NULL,
    "platform_fee" DECIMAL(20,9) NOT NULL,
    "creator_royalty" DECIMAL(20,9),
    "buyer" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "escrow_tx_id" TEXT NOT NULL,
    "settlement_tx_id" TEXT NOT NULL,
    "receipt_hash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_logs" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT,
    "tx_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "block_height" BIGINT,
    "slot" BIGINT,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "event_type" "WebhookEventType" NOT NULL,
    "target_url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_attempt_at" TIMESTAMP(3),
    "last_response_code" INTEGER,
    "last_response_body" TEXT,
    "delivered_at" TIMESTAMP(3),
    "signature" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_for" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agreements_agreement_id_key" ON "agreements"("agreement_id");

-- CreateIndex
CREATE INDEX "agreements_agreement_id_idx" ON "agreements"("agreement_id");

-- CreateIndex
CREATE INDEX "agreements_seller_idx" ON "agreements"("seller");

-- CreateIndex
CREATE INDEX "agreements_buyer_idx" ON "agreements"("buyer");

-- CreateIndex
CREATE INDEX "agreements_status_idx" ON "agreements"("status");

-- CreateIndex
CREATE INDEX "agreements_expiry_idx" ON "agreements"("expiry");

-- CreateIndex
CREATE INDEX "agreements_created_at_idx" ON "agreements"("created_at");

-- CreateIndex
CREATE INDEX "deposits_agreement_id_idx" ON "deposits"("agreement_id");

-- CreateIndex
CREATE INDEX "deposits_type_idx" ON "deposits"("type");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE INDEX "deposits_depositor_idx" ON "deposits"("depositor");

-- CreateIndex
CREATE INDEX "deposits_detected_at_idx" ON "deposits"("detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "idempotency_keys_key_idx" ON "idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "idempotency_keys_endpoint_idx" ON "idempotency_keys"("endpoint");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_agreement_id_key" ON "settlements"("agreement_id");

-- CreateIndex
CREATE INDEX "settlements_agreement_id_idx" ON "settlements"("agreement_id");

-- CreateIndex
CREATE INDEX "settlements_buyer_idx" ON "settlements"("buyer");

-- CreateIndex
CREATE INDEX "settlements_seller_idx" ON "settlements"("seller");

-- CreateIndex
CREATE INDEX "settlements_nft_mint_idx" ON "settlements"("nft_mint");

-- CreateIndex
CREATE INDEX "settlements_settled_at_idx" ON "settlements"("settled_at");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_agreement_id_key" ON "receipts"("agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_hash_key" ON "receipts"("receipt_hash");

-- CreateIndex
CREATE INDEX "receipts_agreement_id_idx" ON "receipts"("agreement_id");

-- CreateIndex
CREATE INDEX "receipts_buyer_idx" ON "receipts"("buyer");

-- CreateIndex
CREATE INDEX "receipts_seller_idx" ON "receipts"("seller");

-- CreateIndex
CREATE INDEX "receipts_nft_mint_idx" ON "receipts"("nft_mint");

-- CreateIndex
CREATE INDEX "receipts_receipt_hash_idx" ON "receipts"("receipt_hash");

-- CreateIndex
CREATE INDEX "receipts_generated_at_idx" ON "receipts"("generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_logs_tx_id_key" ON "transaction_logs"("tx_id");

-- CreateIndex
CREATE INDEX "transaction_logs_agreement_id_idx" ON "transaction_logs"("agreement_id");

-- CreateIndex
CREATE INDEX "transaction_logs_tx_id_idx" ON "transaction_logs"("tx_id");

-- CreateIndex
CREATE INDEX "transaction_logs_operation_type_idx" ON "transaction_logs"("operation_type");

-- CreateIndex
CREATE INDEX "transaction_logs_status_idx" ON "transaction_logs"("status");

-- CreateIndex
CREATE INDEX "transaction_logs_timestamp_idx" ON "transaction_logs"("timestamp");

-- CreateIndex
CREATE INDEX "webhooks_agreement_id_idx" ON "webhooks"("agreement_id");

-- CreateIndex
CREATE INDEX "webhooks_event_type_idx" ON "webhooks"("event_type");

-- CreateIndex
CREATE INDEX "webhooks_status_idx" ON "webhooks"("status");

-- CreateIndex
CREATE INDEX "webhooks_scheduled_for_idx" ON "webhooks"("scheduled_for");

-- CreateIndex
CREATE INDEX "webhooks_created_at_idx" ON "webhooks"("created_at");

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
