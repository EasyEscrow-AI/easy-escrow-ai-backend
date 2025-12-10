-- Bulk cNFT Swap Support Migration
-- Created: 2024-12-10
-- Task: 50 - Database Schema Updates for Bulk cNFT Swaps

-- ============================================
-- SwapOffer Table Updates
-- ============================================

-- Add bulk swap tracking fields
ALTER TABLE "swap_offers" ADD COLUMN IF NOT EXISTS "is_bulk_swap" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "swap_offers" ADD COLUMN IF NOT EXISTS "bundle_id" VARCHAR(255);
ALTER TABLE "swap_offers" ADD COLUMN IF NOT EXISTS "transaction_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "swap_offers" ADD COLUMN IF NOT EXISTS "bundle_status" VARCHAR(50);

-- Add enhanced offer management fields
ALTER TABLE "swap_offers" ADD COLUMN IF NOT EXISTS "cancelled_by" VARCHAR(255);
ALTER TABLE "swap_offers" ADD COLUMN IF NOT EXISTS "update_count" INTEGER NOT NULL DEFAULT 0;

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS "swap_offers_bundle_id_idx" ON "swap_offers"("bundle_id");
CREATE INDEX IF NOT EXISTS "swap_offers_is_bulk_swap_idx" ON "swap_offers"("is_bulk_swap");

-- ============================================
-- SwapTransaction Table Updates
-- ============================================

-- Add Jito bundle tracking fields
ALTER TABLE "swap_transactions" ADD COLUMN IF NOT EXISTS "bundle_id" VARCHAR(255);
ALTER TABLE "swap_transactions" ADD COLUMN IF NOT EXISTS "transaction_index" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "swap_transactions" ADD COLUMN IF NOT EXISTS "bundle_slot" BIGINT;

-- Create index for bundle_id
CREATE INDEX IF NOT EXISTS "swap_transactions_bundle_id_idx" ON "swap_transactions"("bundle_id");

-- ============================================
-- Field Descriptions
-- ============================================
-- 
-- SwapOffer Fields:
--   is_bulk_swap: true if offer requires multiple transactions (3+ cNFTs)
--   bundle_id: Jito bundle ID (UUID) for tracking multi-transaction swaps
--   transaction_count: Number of transactions in the bundle (1-5)
--   bundle_status: Status from Jito (Pending, Landed, Failed, Timeout)
--   cancelled_by: Wallet address that cancelled the offer (maker or admin)
--   update_count: Number of times the offer has been modified
--
-- SwapTransaction Fields:
--   bundle_id: Jito bundle ID linking related transactions
--   transaction_index: Position in bundle (0 = first, 1 = second, etc.)
--   bundle_slot: Solana slot where the bundle landed

