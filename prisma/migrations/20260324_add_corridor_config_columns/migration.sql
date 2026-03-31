-- Add corridor configuration columns for the GET /institution/corridors endpoint
-- These columns provide display names, compliance info, and threshold configuration

ALTER TABLE "institution_corridors" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "institution_corridors" ADD COLUMN IF NOT EXISTS "compliance" TEXT;
ALTER TABLE "institution_corridors" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "institution_corridors" ADD COLUMN IF NOT EXISTS "risk_reason" TEXT;
ALTER TABLE "institution_corridors" ADD COLUMN IF NOT EXISTS "travel_rule_threshold" DECIMAL(18, 2) NOT NULL DEFAULT 1000;
ALTER TABLE "institution_corridors" ADD COLUMN IF NOT EXISTS "edd_threshold" DECIMAL(18, 2) NOT NULL DEFAULT 10000;
ALTER TABLE "institution_corridors" ADD COLUMN IF NOT EXISTS "reporting_threshold" DECIMAL(18, 2) NOT NULL DEFAULT 15000;
