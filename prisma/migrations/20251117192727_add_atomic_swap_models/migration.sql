-- Add atomic swap enums (only if they don't exist)
DO $$ BEGIN
  CREATE TYPE "NonceStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'EXPIRED', 'INVALID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OfferType" AS ENUM ('MAKER_OFFER', 'COUNTER_OFFER', 'COUNTER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OfferStatus" AS ENUM ('ACTIVE', 'MATCHED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'FILLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: users (atomic swap users)
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "nonce_account" TEXT,
    "is_subsidized" BOOLEAN NOT NULL DEFAULT false,
    "total_swaps_completed" INTEGER NOT NULL DEFAULT 0,
    "total_fees_paid_lamports" BIGINT NOT NULL DEFAULT 0,
    "swap_stats" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: nonce_pool
CREATE TABLE IF NOT EXISTS "nonce_pool" (
    "id" SERIAL NOT NULL,
    "nonce_account" TEXT NOT NULL,
    "status" "NonceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nonce_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable: swap_offers
CREATE TABLE IF NOT EXISTS "swap_offers" (
    "id" SERIAL NOT NULL,
    "maker_wallet" TEXT NOT NULL,
    "taker_wallet" TEXT,
    "offer_type" "OfferType" NOT NULL,
    "parent_offer_id" INTEGER,
    "offered_assets" JSONB NOT NULL,
    "requested_assets" JSONB NOT NULL,
    "platform_fee_lamports" BIGINT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "nonce_account" TEXT NOT NULL,
    "current_nonce_value" TEXT,
    "serialized_transaction" TEXT,
    "transaction_signature" TEXT,
    "filled_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swap_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: swap_transactions
CREATE TABLE IF NOT EXISTS "swap_transactions" (
    "id" SERIAL NOT NULL,
    "offer_id" INTEGER NOT NULL,
    "counter_offer_id" INTEGER,
    "signature" TEXT NOT NULL,
    "maker_wallet" TEXT NOT NULL,
    "taker_wallet" TEXT NOT NULL,
    "platform_fee_collected_lamports" BIGINT NOT NULL,
    "total_value_lamports" BIGINT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL,
    "transaction_signature" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "gas_fee" BIGINT,
    "is_subsidized" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swap_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_wallet_address_idx" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_nonce_account_idx" ON "users"("nonce_account");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "nonce_pool_nonce_account_key" ON "nonce_pool"("nonce_account");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "nonce_pool_status_idx" ON "nonce_pool"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "nonce_pool_last_used_at_idx" ON "nonce_pool"("last_used_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_offers_maker_wallet_idx" ON "swap_offers"("maker_wallet");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_offers_taker_wallet_idx" ON "swap_offers"("taker_wallet");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_offers_status_idx" ON "swap_offers"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_offers_expires_at_idx" ON "swap_offers"("expires_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_offers_parent_offer_id_idx" ON "swap_offers"("parent_offer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_offers_nonce_account_idx" ON "swap_offers"("nonce_account");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_offer_status_expiry" ON "swap_offers"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "swap_transactions_signature_key" ON "swap_transactions"("signature");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "swap_transactions_transaction_signature_key" ON "swap_transactions"("transaction_signature");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_transactions_offer_id_idx" ON "swap_transactions"("offer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_transactions_counter_offer_id_idx" ON "swap_transactions"("counter_offer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_transactions_maker_wallet_idx" ON "swap_transactions"("maker_wallet");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_transactions_taker_wallet_idx" ON "swap_transactions"("taker_wallet");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_transactions_status_idx" ON "swap_transactions"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_transactions_transaction_signature_idx" ON "swap_transactions"("transaction_signature");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swap_transactions_confirmed_at_idx" ON "swap_transactions"("confirmed_at");

-- AddForeignKey (only if tables exist)
DO $$ BEGIN
  ALTER TABLE "swap_offers" ADD CONSTRAINT "swap_offers_maker_wallet_fkey" FOREIGN KEY ("maker_wallet") REFERENCES "users"("wallet_address") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_offers" ADD CONSTRAINT "swap_offers_nonce_account_fkey" FOREIGN KEY ("nonce_account") REFERENCES "nonce_pool"("nonce_account") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_offers" ADD CONSTRAINT "swap_offers_parent_offer_id_fkey" FOREIGN KEY ("parent_offer_id") REFERENCES "swap_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "swap_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_counter_offer_id_fkey" FOREIGN KEY ("counter_offer_id") REFERENCES "swap_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_maker_wallet_fkey" FOREIGN KEY ("maker_wallet") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_taker_wallet_fkey" FOREIGN KEY ("taker_wallet") REFERENCES "users"("wallet_address") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
