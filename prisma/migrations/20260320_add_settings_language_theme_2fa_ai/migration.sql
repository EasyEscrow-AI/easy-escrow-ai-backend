-- Add language, theme, twoFactorEnabled, aiRecommendations to institution_client_settings
ALTER TABLE "institution_client_settings" ADD COLUMN "language" TEXT;
ALTER TABLE "institution_client_settings" ADD COLUMN "theme" TEXT;
ALTER TABLE "institution_client_settings" ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "institution_client_settings" ADD COLUMN "ai_recommendations" BOOLEAN NOT NULL DEFAULT true;
