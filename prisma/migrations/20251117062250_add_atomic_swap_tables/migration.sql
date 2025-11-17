-- CreateEnum
CREATE TYPE "NonceStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'EXPIRED', 'INVALID');

-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('MAKER_OFFER', 'COUNTER_OFFER');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('ACTIVE', 'MATCHED', 'CANCELLED', 'EXPIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "nonce_account" TEXT,
    "is_subsidized" BOOLEAN NOT NULL DEFAULT false,
    "swap_stats" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nonce_pool" (
    "id" SERIAL NOT NULL,
    "nonce_account" TEXT NOT NULL,
    "status" "NonceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nonce_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swap_offers" (
    "id" SERIAL NOT NULL,
    "maker_wallet" TEXT NOT NULL,
    "offer_type" "OfferType" NOT NULL,
    "parent_offer_id" INTEGER,
    "offered_assets" JSONB NOT NULL,
    "requested_assets" JSONB NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "nonce_account" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swap_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swap_transactions" (
    "id" SERIAL NOT NULL,
    "offer_id" INTEGER NOT NULL,
    "counter_offer_id" INTEGER,
    "maker_wallet" TEXT NOT NULL,
    "taker_wallet" TEXT NOT NULL,
    "transaction_signature" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "gas_fee" BIGINT NOT NULL,
    "is_subsidized" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swap_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "users_wallet_address_idx" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "users_nonce_account_idx" ON "users"("nonce_account");

-- CreateIndex
CREATE UNIQUE INDEX "nonce_pool_nonce_account_key" ON "nonce_pool"("nonce_account");

-- CreateIndex
CREATE INDEX "nonce_pool_status_idx" ON "nonce_pool"("status");

-- CreateIndex
CREATE INDEX "nonce_pool_last_used_at_idx" ON "nonce_pool"("last_used_at");

-- CreateIndex
CREATE INDEX "swap_offers_maker_wallet_idx" ON "swap_offers"("maker_wallet");

-- CreateIndex
CREATE INDEX "swap_offers_status_idx" ON "swap_offers"("status");

-- CreateIndex
CREATE INDEX "swap_offers_expires_at_idx" ON "swap_offers"("expires_at");

-- CreateIndex
CREATE INDEX "swap_offers_parent_offer_id_idx" ON "swap_offers"("parent_offer_id");

-- CreateIndex
CREATE INDEX "swap_offers_nonce_account_idx" ON "swap_offers"("nonce_account");

-- CreateIndex
CREATE INDEX "idx_offer_status_expiry" ON "swap_offers"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "swap_transactions_transaction_signature_key" ON "swap_transactions"("transaction_signature");

-- CreateIndex
CREATE INDEX "swap_transactions_offer_id_idx" ON "swap_transactions"("offer_id");

-- CreateIndex
CREATE INDEX "swap_transactions_counter_offer_id_idx" ON "swap_transactions"("counter_offer_id");

-- CreateIndex
CREATE INDEX "swap_transactions_maker_wallet_idx" ON "swap_transactions"("maker_wallet");

-- CreateIndex
CREATE INDEX "swap_transactions_taker_wallet_idx" ON "swap_transactions"("taker_wallet");

-- CreateIndex
CREATE INDEX "swap_transactions_status_idx" ON "swap_transactions"("status");

-- CreateIndex
CREATE INDEX "swap_transactions_transaction_signature_idx" ON "swap_transactions"("transaction_signature");

-- CreateIndex
CREATE INDEX "swap_transactions_confirmed_at_idx" ON "swap_transactions"("confirmed_at");

-- AddForeignKey
ALTER TABLE "swap_offers" ADD CONSTRAINT "swap_offers_maker_wallet_fkey" FOREIGN KEY ("maker_wallet") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_offers" ADD CONSTRAINT "swap_offers_nonce_account_fkey" FOREIGN KEY ("nonce_account") REFERENCES "nonce_pool"("nonce_account") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_offers" ADD CONSTRAINT "swap_offers_parent_offer_id_fkey" FOREIGN KEY ("parent_offer_id") REFERENCES "swap_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "swap_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_counter_offer_id_fkey" FOREIGN KEY ("counter_offer_id") REFERENCES "swap_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_maker_wallet_fkey" FOREIGN KEY ("maker_wallet") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_taker_wallet_fkey" FOREIGN KEY ("taker_wallet") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
