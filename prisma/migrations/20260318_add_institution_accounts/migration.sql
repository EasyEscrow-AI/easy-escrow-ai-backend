-- CreateEnum
CREATE TYPE "InstitutionAccountType" AS ENUM ('TREASURY', 'OPERATIONS', 'SETTLEMENT', 'COLLATERAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "AccountVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('AUTO', 'SINGLE_APPROVAL', 'MULTI_APPROVAL');

-- CreateTable
CREATE TABLE "institution_accounts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "account_type" "InstitutionAccountType" NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "wallet_address" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'solana',
    "wallet_provider" TEXT,
    "custody_type" "WalletCustodyType",
    "verification_status" "AccountVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "verification_notes" TEXT,
    "max_transaction_amount" DECIMAL(20,6),
    "min_transaction_amount" DECIMAL(20,6),
    "daily_volume_limit" DECIMAL(20,6),
    "monthly_volume_limit" DECIMAL(20,6),
    "daily_transaction_count_limit" INTEGER,
    "monthly_transaction_count_limit" INTEGER,
    "approval_mode" "ApprovalMode" NOT NULL DEFAULT 'AUTO',
    "approval_threshold" DECIMAL(20,6),
    "whitelisted_addresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whitelist_enforced" BOOLEAN NOT NULL DEFAULT false,
    "notification_email" TEXT,
    "webhook_url" TEXT,
    "notify_on_escrow_created" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_escrow_funded" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_escrow_released" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_compliance_alert" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "institution_accounts_client_id_idx" ON "institution_accounts"("client_id");

-- CreateIndex
CREATE INDEX "institution_accounts_wallet_address_idx" ON "institution_accounts"("wallet_address");

-- CreateIndex
CREATE INDEX "institution_accounts_account_type_idx" ON "institution_accounts"("account_type");

-- CreateIndex
CREATE INDEX "institution_accounts_verification_status_idx" ON "institution_accounts"("verification_status");

-- CreateIndex
CREATE INDEX "institution_accounts_is_active_idx" ON "institution_accounts"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "institution_accounts_client_id_name_key" ON "institution_accounts"("client_id", "name");

-- AddForeignKey
ALTER TABLE "institution_accounts" ADD CONSTRAINT "institution_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
