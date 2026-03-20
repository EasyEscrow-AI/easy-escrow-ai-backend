-- CreateTable: InstitutionBranch
CREATE TABLE "institution_branches" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "compliance_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "compliance_note" TEXT,
    "regulatory_body" TEXT,
    "is_sanctioned" BOOLEAN NOT NULL DEFAULT false,
    "sanction_reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DirectPayment
CREATE TABLE "direct_payments" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "sender_country" TEXT NOT NULL,
    "sender_wallet" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipient_country" TEXT NOT NULL,
    "recipient_wallet" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "corridor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "tx_hash" TEXT,
    "platform_fee" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "risk_score" INTEGER,
    "settlement_mode" TEXT NOT NULL DEFAULT 'direct',
    "release_mode" TEXT NOT NULL DEFAULT 'manual',
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_payments_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add branchId to InstitutionAccount
ALTER TABLE "institution_accounts" ADD COLUMN "branch_id" TEXT;

-- AlterTable: Add new fields to InstitutionClientSettings
ALTER TABLE "institution_client_settings" ADD COLUMN "manual_review_threshold" DECIMAL(20,6);
ALTER TABLE "institution_client_settings" ADD COLUMN "auto_travel_rule" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "institution_client_settings" ADD COLUMN "active_sanctions_lists" TEXT[] DEFAULT ARRAY['OFAC SDN', 'EU Consolidated', 'UN Sanctions']::TEXT[];
ALTER TABLE "institution_client_settings" ADD COLUMN "ai_auto_release" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "institution_client_settings" ADD COLUMN "risk_tolerance" TEXT NOT NULL DEFAULT 'low';
ALTER TABLE "institution_client_settings" ADD COLUMN "default_token" TEXT NOT NULL DEFAULT 'usdc';
ALTER TABLE "institution_client_settings" ADD COLUMN "email_notifications" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "institution_branches_client_id_idx" ON "institution_branches"("client_id");
CREATE INDEX "institution_branches_country_code_idx" ON "institution_branches"("country_code");
CREATE INDEX "institution_branches_compliance_status_idx" ON "institution_branches"("compliance_status");

CREATE INDEX "direct_payments_client_id_idx" ON "direct_payments"("client_id");
CREATE INDEX "direct_payments_status_idx" ON "direct_payments"("status");
CREATE INDEX "direct_payments_corridor_idx" ON "direct_payments"("corridor");
CREATE INDEX "direct_payments_created_at_idx" ON "direct_payments"("created_at");

CREATE INDEX "institution_accounts_branch_id_idx" ON "institution_accounts"("branch_id");

-- AddForeignKey
ALTER TABLE "institution_branches" ADD CONSTRAINT "institution_branches_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_payments" ADD CONSTRAINT "direct_payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "institution_accounts" ADD CONSTRAINT "institution_accounts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "institution_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
