-- Add REJECTED status to OfferStatus enum
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- Add rejected tracking columns to swap_offers table
ALTER TABLE "swap_offers" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3);
ALTER TABLE "swap_offers" ADD COLUMN IF NOT EXISTS "rejected_by" TEXT;
