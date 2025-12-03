-- Fix Atomic Swap Schema Migration (Updated with column checks)
-- This migration consolidates the atomic swap schema changes and is safe to run even if some objects already exist
-- Updated: Added checks for all swap_transactions columns before creating indexes

-- ============================================================================
-- STEP 1: Create Enums (if they don't exist)
-- ============================================================================

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

-- Create OfferStatus enum with correct values or verify existing enum matches
DO $$ 
DECLARE
  enum_exists BOOLEAN;
  has_wrong_values BOOLEAN;
BEGIN
  -- Check if enum exists
  SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OfferStatus') INTO enum_exists;
  
  IF enum_exists THEN
    -- Check if it has the wrong values (MATCHED or COMPLETED)
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'OfferStatus' 
      AND e.enumlabel IN ('MATCHED', 'COMPLETED')
    ) INTO has_wrong_values;
    
    IF has_wrong_values THEN
      RAISE EXCEPTION 'OfferStatus enum exists with incompatible values (MATCHED, COMPLETED). Please run: DROP TYPE "OfferStatus" CASCADE; before re-running this migration.';
    END IF;
    
    -- Enum exists with correct values, skip creation
    RAISE NOTICE 'OfferStatus enum already exists with correct values, skipping creation';
  ELSE
    -- Create new enum with correct values
    CREATE TYPE "OfferStatus" AS ENUM ('ACTIVE', 'FILLED', 'CANCELLED', 'EXPIRED');
    RAISE NOTICE 'Created OfferStatus enum with values: ACTIVE, FILLED, CANCELLED, EXPIRED';
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- STEP 2: Create Tables (if they don't exist)
-- ============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "maker_wallet" TEXT,
    "taker_wallet" TEXT,
    "nonce_account" TEXT,
    "is_subsidized" BOOLEAN NOT NULL DEFAULT false,
    "total_swaps_completed" INTEGER NOT NULL DEFAULT 0,
    "total_fees_paid_lamports" BIGINT NOT NULL DEFAULT 0,
    "swap_stats" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Nonce Pool table
CREATE TABLE IF NOT EXISTS "nonce_pool" (
    "id" SERIAL NOT NULL,
    "nonce_account" TEXT NOT NULL,
    "status" "NonceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nonce_pool_pkey" PRIMARY KEY ("id")
);

-- Swap Offers table
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

-- Swap Transactions table
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

-- ============================================================================
-- STEP 3: Add missing columns if they don't exist
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'maker_wallet') THEN
        ALTER TABLE "users" ADD COLUMN "maker_wallet" TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'taker_wallet') THEN
        ALTER TABLE "users" ADD COLUMN "taker_wallet" TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'swap_offers' AND column_name = 'taker_wallet') THEN
        ALTER TABLE "swap_offers" ADD COLUMN "taker_wallet" TEXT;
    END IF;
END $$;

-- Add missing columns to swap_transactions table if needed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'swap_transactions' AND column_name = 'signature') THEN
        ALTER TABLE "swap_transactions" ADD COLUMN "signature" TEXT NOT NULL DEFAULT '';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'swap_transactions' AND column_name = 'transaction_signature') THEN
        ALTER TABLE "swap_transactions" ADD COLUMN "transaction_signature" TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'swap_transactions' AND column_name = 'status') THEN
        ALTER TABLE "swap_transactions" ADD COLUMN "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'swap_transactions' AND column_name = 'gas_fee') THEN
        ALTER TABLE "swap_transactions" ADD COLUMN "gas_fee" BIGINT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'swap_transactions' AND column_name = 'is_subsidized') THEN
        ALTER TABLE "swap_transactions" ADD COLUMN "is_subsidized" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'swap_transactions' AND column_name = 'error_message') THEN
        ALTER TABLE "swap_transactions" ADD COLUMN "error_message" TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'swap_transactions' AND column_name = 'confirmed_at') THEN
        ALTER TABLE "swap_transactions" ADD COLUMN "confirmed_at" TIMESTAMP(3);
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Create Indexes (if they don't exist)
-- ============================================================================

-- Users indexes
CREATE UNIQUE INDEX IF NOT EXISTS "users_wallet_address_key" ON "users"("wallet_address");
CREATE INDEX IF NOT EXISTS "users_wallet_address_idx" ON "users"("wallet_address");
CREATE INDEX IF NOT EXISTS "users_nonce_account_idx" ON "users"("nonce_account");
CREATE INDEX IF NOT EXISTS "users_maker_wallet_idx" ON "users"("maker_wallet");
CREATE INDEX IF NOT EXISTS "users_taker_wallet_idx" ON "users"("taker_wallet");

-- Nonce Pool indexes
CREATE UNIQUE INDEX IF NOT EXISTS "nonce_pool_nonce_account_key" ON "nonce_pool"("nonce_account");
CREATE INDEX IF NOT EXISTS "nonce_pool_status_idx" ON "nonce_pool"("status");
CREATE INDEX IF NOT EXISTS "nonce_pool_last_used_at_idx" ON "nonce_pool"("last_used_at");

-- Swap Offers indexes
CREATE INDEX IF NOT EXISTS "swap_offers_maker_wallet_idx" ON "swap_offers"("maker_wallet");
CREATE INDEX IF NOT EXISTS "swap_offers_taker_wallet_idx" ON "swap_offers"("taker_wallet");
CREATE INDEX IF NOT EXISTS "swap_offers_status_idx" ON "swap_offers"("status");
CREATE INDEX IF NOT EXISTS "swap_offers_expires_at_idx" ON "swap_offers"("expires_at");
CREATE INDEX IF NOT EXISTS "swap_offers_parent_offer_id_idx" ON "swap_offers"("parent_offer_id");
CREATE INDEX IF NOT EXISTS "swap_offers_nonce_account_idx" ON "swap_offers"("nonce_account");
CREATE INDEX IF NOT EXISTS "idx_offer_status_expiry" ON "swap_offers"("status", "expires_at");

-- Swap Transactions indexes
CREATE UNIQUE INDEX IF NOT EXISTS "swap_transactions_signature_key" ON "swap_transactions"("signature");
CREATE UNIQUE INDEX IF NOT EXISTS "swap_transactions_transaction_signature_key" ON "swap_transactions"("transaction_signature");
CREATE INDEX IF NOT EXISTS "swap_transactions_offer_id_idx" ON "swap_transactions"("offer_id");
CREATE INDEX IF NOT EXISTS "swap_transactions_counter_offer_id_idx" ON "swap_transactions"("counter_offer_id");
CREATE INDEX IF NOT EXISTS "swap_transactions_maker_wallet_idx" ON "swap_transactions"("maker_wallet");
CREATE INDEX IF NOT EXISTS "swap_transactions_taker_wallet_idx" ON "swap_transactions"("taker_wallet");
CREATE INDEX IF NOT EXISTS "swap_transactions_status_idx" ON "swap_transactions"("status");
CREATE INDEX IF NOT EXISTS "swap_transactions_transaction_signature_idx" ON "swap_transactions"("transaction_signature");
CREATE INDEX IF NOT EXISTS "swap_transactions_confirmed_at_idx" ON "swap_transactions"("confirmed_at");

-- ============================================================================
-- STEP 5: Add Foreign Keys (if they don't exist)
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE "swap_offers" ADD CONSTRAINT "swap_offers_maker_wallet_fkey" 
    FOREIGN KEY ("maker_wallet") REFERENCES "users"("wallet_address") 
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_offers" ADD CONSTRAINT "swap_offers_nonce_account_fkey" 
    FOREIGN KEY ("nonce_account") REFERENCES "nonce_pool"("nonce_account") 
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_offers" ADD CONSTRAINT "swap_offers_parent_offer_id_fkey" 
    FOREIGN KEY ("parent_offer_id") REFERENCES "swap_offers"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_offer_id_fkey" 
    FOREIGN KEY ("offer_id") REFERENCES "swap_offers"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_counter_offer_id_fkey" 
    FOREIGN KEY ("counter_offer_id") REFERENCES "swap_offers"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_maker_wallet_fkey" 
    FOREIGN KEY ("maker_wallet") REFERENCES "users"("wallet_address") 
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "swap_transactions" ADD CONSTRAINT "swap_transactions_taker_wallet_fkey" 
    FOREIGN KEY ("taker_wallet") REFERENCES "users"("wallet_address") 
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

