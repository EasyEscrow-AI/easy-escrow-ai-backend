-- Add SOL amount columns to swap_offers table
-- These columns store the lamport amounts for SOL being offered or requested in atomic swaps

ALTER TABLE "swap_offers" 
ADD COLUMN IF NOT EXISTS "offered_sol_lamports" BIGINT,
ADD COLUMN IF NOT EXISTS "requested_sol_lamports" BIGINT;

