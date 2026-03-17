-- Add AMINA-approved token whitelist table for institution escrow
-- Run against staging and production databases

CREATE TABLE IF NOT EXISTS "institution_approved_tokens" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mint_address" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 6,
    "issuer" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "chain" TEXT NOT NULL DEFAULT 'solana',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "amina_approved" BOOLEAN NOT NULL DEFAULT true,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_approved_tokens_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "institution_approved_tokens_symbol_key" ON "institution_approved_tokens"("symbol");
CREATE UNIQUE INDEX IF NOT EXISTS "institution_approved_tokens_mint_address_key" ON "institution_approved_tokens"("mint_address");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "institution_approved_tokens_symbol_idx" ON "institution_approved_tokens"("symbol");
CREATE INDEX IF NOT EXISTS "institution_approved_tokens_mint_address_idx" ON "institution_approved_tokens"("mint_address");
CREATE INDEX IF NOT EXISTS "institution_approved_tokens_is_active_idx" ON "institution_approved_tokens"("is_active");
CREATE INDEX IF NOT EXISTS "institution_approved_tokens_amina_approved_idx" ON "institution_approved_tokens"("amina_approved");
