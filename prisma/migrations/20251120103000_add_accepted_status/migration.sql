-- Add ACCEPTED status to OfferStatus enum
-- This status represents offers that have been accepted by a taker but not yet confirmed on-chain

ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';


