-- CreateEnum
CREATE TYPE "InstitutionEscrowStatus" AS ENUM ('CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'RELEASING', 'RELEASED', 'CANCELLING', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "InstitutionConditionType" AS ENUM ('ADMIN_RELEASE', 'TIME_LOCK', 'COMPLIANCE_CHECK');

-- CreateEnum
CREATE TYPE "ClientTier" AS ENUM ('STANDARD', 'PREMIUM', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'CONTRACT', 'SHIPPING_DOC', 'LETTER_OF_CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "CorridorStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEPRECATED');

-- CreateTable
CREATE TABLE "institution_clients" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "tier" "ClientTier" NOT NULL DEFAULT 'STANDARD',
    "status" "ClientStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "kyc_status" TEXT NOT NULL DEFAULT 'PENDING',
    "jurisdiction" TEXT,
    "primary_wallet" TEXT,
    "settled_wallets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "institution_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_refresh_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "device_info" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_client_settings" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "default_corridor" TEXT,
    "default_currency" TEXT NOT NULL DEFAULT 'USDC',
    "notification_email" TEXT,
    "webhook_url" TEXT,
    "webhook_secret" TEXT,
    "settlement_authority_wallet" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "auto_approve_threshold" DECIMAL(20,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_client_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_api_keys" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_escrows" (
    "id" TEXT NOT NULL,
    "escrow_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "payer_wallet" TEXT NOT NULL,
    "recipient_wallet" TEXT NOT NULL,
    "usdc_mint" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "platform_fee" DECIMAL(20,6) NOT NULL,
    "corridor" TEXT NOT NULL,
    "condition_type" "InstitutionConditionType" NOT NULL,
    "status" "InstitutionEscrowStatus" NOT NULL DEFAULT 'CREATED',
    "settlement_authority" TEXT NOT NULL,
    "risk_score" INTEGER,
    "escrow_pda" TEXT,
    "vault_pda" TEXT,
    "deposit_tx_signature" TEXT,
    "release_tx_signature" TEXT,
    "cancel_tx_signature" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "funded_at" TIMESTAMP(3),

    CONSTRAINT "institution_escrows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_deposits" (
    "id" TEXT NOT NULL,
    "escrow_id" TEXT NOT NULL,
    "tx_signature" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "block_height" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_audit_logs" (
    "id" TEXT NOT NULL,
    "escrow_id" TEXT,
    "client_id" TEXT,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_ai_analyses" (
    "id" TEXT NOT NULL,
    "escrow_id" TEXT NOT NULL,
    "file_id" TEXT,
    "document_hash" TEXT,
    "risk_score" INTEGER NOT NULL,
    "factors" JSONB NOT NULL DEFAULT '[]',
    "recommendation" TEXT NOT NULL,
    "extracted_fields" JSONB NOT NULL DEFAULT '{}',
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_corridors" (
    "id" TEXT NOT NULL,
    "source_country" TEXT NOT NULL,
    "dest_country" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "min_amount" DECIMAL(20,6) NOT NULL,
    "max_amount" DECIMAL(20,6) NOT NULL,
    "daily_limit" DECIMAL(20,6) NOT NULL,
    "monthly_limit" DECIMAL(20,6) NOT NULL,
    "required_documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risk_level" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" "CorridorStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_corridors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_files" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "escrow_id" TEXT,
    "file_name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institution_clients_email_key" ON "institution_clients"("email");
CREATE INDEX "institution_clients_email_idx" ON "institution_clients"("email");
CREATE INDEX "institution_clients_status_idx" ON "institution_clients"("status");
CREATE INDEX "institution_clients_tier_idx" ON "institution_clients"("tier");
CREATE INDEX "institution_clients_primary_wallet_idx" ON "institution_clients"("primary_wallet");
CREATE INDEX "institution_clients_created_at_idx" ON "institution_clients"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "institution_refresh_tokens_token_hash_key" ON "institution_refresh_tokens"("token_hash");
CREATE INDEX "institution_refresh_tokens_client_id_idx" ON "institution_refresh_tokens"("client_id");
CREATE INDEX "institution_refresh_tokens_expires_at_idx" ON "institution_refresh_tokens"("expires_at");
CREATE INDEX "institution_refresh_tokens_token_hash_idx" ON "institution_refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "institution_client_settings_client_id_key" ON "institution_client_settings"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "institution_api_keys_key_hash_key" ON "institution_api_keys"("key_hash");
CREATE INDEX "institution_api_keys_client_id_idx" ON "institution_api_keys"("client_id");
CREATE INDEX "institution_api_keys_key_hash_idx" ON "institution_api_keys"("key_hash");
CREATE INDEX "institution_api_keys_active_idx" ON "institution_api_keys"("active");

-- CreateIndex
CREATE UNIQUE INDEX "institution_escrows_escrow_id_key" ON "institution_escrows"("escrow_id");
CREATE INDEX "institution_escrows_client_id_idx" ON "institution_escrows"("client_id");
CREATE INDEX "institution_escrows_escrow_id_idx" ON "institution_escrows"("escrow_id");
CREATE INDEX "institution_escrows_status_idx" ON "institution_escrows"("status");
CREATE INDEX "institution_escrows_corridor_idx" ON "institution_escrows"("corridor");
CREATE INDEX "institution_escrows_payer_wallet_idx" ON "institution_escrows"("payer_wallet");
CREATE INDEX "institution_escrows_recipient_wallet_idx" ON "institution_escrows"("recipient_wallet");
CREATE INDEX "institution_escrows_expires_at_idx" ON "institution_escrows"("expires_at");
CREATE INDEX "institution_escrows_created_at_idx" ON "institution_escrows"("created_at");
CREATE INDEX "idx_inst_escrow_status_expiry" ON "institution_escrows"("status", "expires_at");
CREATE INDEX "idx_inst_escrow_client_status" ON "institution_escrows"("client_id", "status");

-- CreateIndex
CREATE INDEX "institution_deposits_escrow_id_idx" ON "institution_deposits"("escrow_id");
CREATE INDEX "institution_deposits_tx_signature_idx" ON "institution_deposits"("tx_signature");

-- CreateIndex
CREATE INDEX "institution_audit_logs_escrow_id_idx" ON "institution_audit_logs"("escrow_id");
CREATE INDEX "institution_audit_logs_client_id_idx" ON "institution_audit_logs"("client_id");
CREATE INDEX "institution_audit_logs_action_idx" ON "institution_audit_logs"("action");
CREATE INDEX "institution_audit_logs_created_at_idx" ON "institution_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "institution_ai_analyses_escrow_id_idx" ON "institution_ai_analyses"("escrow_id");
CREATE INDEX "institution_ai_analyses_risk_score_idx" ON "institution_ai_analyses"("risk_score");
CREATE INDEX "institution_ai_analyses_recommendation_idx" ON "institution_ai_analyses"("recommendation");
CREATE INDEX "institution_ai_analyses_created_at_idx" ON "institution_ai_analyses"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "institution_corridors_code_key" ON "institution_corridors"("code");
CREATE INDEX "institution_corridors_code_idx" ON "institution_corridors"("code");
CREATE INDEX "institution_corridors_status_idx" ON "institution_corridors"("status");
CREATE INDEX "idx_corridor_countries" ON "institution_corridors"("source_country", "dest_country");

-- CreateIndex
CREATE INDEX "institution_files_client_id_idx" ON "institution_files"("client_id");
CREATE INDEX "institution_files_escrow_id_idx" ON "institution_files"("escrow_id");
CREATE INDEX "institution_files_document_type_idx" ON "institution_files"("document_type");
CREATE INDEX "institution_files_uploaded_at_idx" ON "institution_files"("uploaded_at");

-- AddForeignKey
ALTER TABLE "institution_refresh_tokens" ADD CONSTRAINT "institution_refresh_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_client_settings" ADD CONSTRAINT "institution_client_settings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_api_keys" ADD CONSTRAINT "institution_api_keys_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_escrows" ADD CONSTRAINT "institution_escrows_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_deposits" ADD CONSTRAINT "institution_deposits_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "institution_escrows"("escrow_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_audit_logs" ADD CONSTRAINT "institution_audit_logs_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "institution_escrows"("escrow_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_audit_logs" ADD CONSTRAINT "institution_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_ai_analyses" ADD CONSTRAINT "institution_ai_analyses_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "institution_escrows"("escrow_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_files" ADD CONSTRAINT "institution_files_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_files" ADD CONSTRAINT "institution_files_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "institution_escrows"("escrow_id") ON DELETE SET NULL ON UPDATE CASCADE;
