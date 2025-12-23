-- Add COUNTERED status to OfferStatus enum
-- This status indicates that an offer has received a counter-offer
-- Required for the cancel offer endpoint to properly handle offers with counter-offers

-- PostgreSQL allows adding new values to an enum using ALTER TYPE
-- The IF NOT EXISTS clause prevents errors if the value already exists
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'COUNTERED';
