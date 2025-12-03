-- Add missing taker_wallet column to swap_offers if it doesn't exist
-- This is a hotfix for the schema mismatch

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'swap_offers' 
        AND column_name = 'taker_wallet'
    ) THEN
        ALTER TABLE "swap_offers" ADD COLUMN "taker_wallet" TEXT;
        RAISE NOTICE 'Added taker_wallet column to swap_offers';
    ELSE
        RAISE NOTICE 'taker_wallet column already exists in swap_offers';
    END IF;
END $$;

-- Ensure the index exists
CREATE INDEX IF NOT EXISTS "swap_offers_taker_wallet_idx" ON "swap_offers"("taker_wallet");

