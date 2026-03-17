-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('CORPORATION', 'LLC', 'PARTNERSHIP', 'SOLE_PROPRIETORSHIP', 'TRUST', 'FOUNDATION', 'COOPERATIVE', 'NON_PROFIT', 'GOVERNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "KybStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RiskRating" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNRATED');

-- CreateEnum
CREATE TYPE "RegulatoryStatus" AS ENUM ('REGULATED', 'UNREGULATED', 'EXEMPT', 'PENDING_LICENSE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SanctionsStatus" AS ENUM ('CLEAR', 'FLAGGED', 'BLOCKED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "WalletCustodyType" AS ENUM ('SELF_CUSTODY', 'THIRD_PARTY', 'MPC', 'MULTISIG', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "EmployeeCountRange" AS ENUM ('RANGE_1_10', 'RANGE_11_50', 'RANGE_51_200', 'RANGE_201_500', 'RANGE_501_1000', 'RANGE_1001_5000', 'RANGE_5001_PLUS');

-- CreateEnum
CREATE TYPE "AnnualRevenueRange" AS ENUM ('UNDER_1M', 'RANGE_1M_10M', 'RANGE_10M_50M', 'RANGE_50M_100M', 'RANGE_100M_500M', 'RANGE_500M_1B', 'OVER_1B');

-- AlterTable: Add expanded profile fields to institution_clients
ALTER TABLE "institution_clients" ADD COLUMN "legal_name" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "trading_name" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "registration_number" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "registration_country" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "entity_type" "EntityType";
ALTER TABLE "institution_clients" ADD COLUMN "lei" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "tax_id" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "tax_country" TEXT;

-- Registered Address
ALTER TABLE "institution_clients" ADD COLUMN "address_line_1" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "address_line_2" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "city" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "state" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "postal_code" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "country" TEXT;

-- Primary Contact
ALTER TABLE "institution_clients" ADD COLUMN "contact_first_name" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "contact_last_name" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "contact_email" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "contact_phone" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "contact_title" TEXT;

-- Compliance
ALTER TABLE "institution_clients" ADD COLUMN "kyb_status" "KybStatus";
ALTER TABLE "institution_clients" ADD COLUMN "kyb_verified_at" TIMESTAMP(3);
ALTER TABLE "institution_clients" ADD COLUMN "kyb_expires_at" TIMESTAMP(3);
ALTER TABLE "institution_clients" ADD COLUMN "risk_rating" "RiskRating";
ALTER TABLE "institution_clients" ADD COLUMN "risk_notes" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "sanctions_status" "SanctionsStatus";
ALTER TABLE "institution_clients" ADD COLUMN "source_of_funds" TEXT;

-- Regulatory
ALTER TABLE "institution_clients" ADD COLUMN "is_regulated_entity" BOOLEAN;
ALTER TABLE "institution_clients" ADD COLUMN "regulatory_status" "RegulatoryStatus";
ALTER TABLE "institution_clients" ADD COLUMN "license_type" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "license_number" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "regulatory_body" TEXT;

-- Business
ALTER TABLE "institution_clients" ADD COLUMN "industry" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "website_url" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "business_description" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "year_established" INTEGER;
ALTER TABLE "institution_clients" ADD COLUMN "employee_count_range" "EmployeeCountRange";
ALTER TABLE "institution_clients" ADD COLUMN "annual_revenue_range" "AnnualRevenueRange";
ALTER TABLE "institution_clients" ADD COLUMN "expected_monthly_volume" DECIMAL(20,6);
ALTER TABLE "institution_clients" ADD COLUMN "purpose_of_account" TEXT;

-- Crypto
ALTER TABLE "institution_clients" ADD COLUMN "wallet_custody_type" "WalletCustodyType";
ALTER TABLE "institution_clients" ADD COLUMN "custodian_name" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "preferred_settlement_chain" TEXT;

-- Account Management
ALTER TABLE "institution_clients" ADD COLUMN "account_manager_name" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "account_manager_email" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "onboarding_completed_at" TIMESTAMP(3);
ALTER TABLE "institution_clients" ADD COLUMN "next_review_date" TIMESTAMP(3);
ALTER TABLE "institution_clients" ADD COLUMN "referral_source" TEXT;
ALTER TABLE "institution_clients" ADD COLUMN "is_test_account" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "institution_clients" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "institution_clients_is_archived_idx" ON "institution_clients"("is_archived");
CREATE INDEX "institution_clients_industry_idx" ON "institution_clients"("industry");
CREATE INDEX "institution_clients_country_idx" ON "institution_clients"("country");
CREATE INDEX "institution_clients_kyb_status_idx" ON "institution_clients"("kyb_status");

-- CreateTable: InstitutionWallet
CREATE TABLE "institution_wallets" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'solana',
    "description" TEXT,
    "provider" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_settlement" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "institution_wallets_client_id_idx" ON "institution_wallets"("client_id");
CREATE INDEX "institution_wallets_address_idx" ON "institution_wallets"("address");
CREATE INDEX "institution_wallets_is_primary_idx" ON "institution_wallets"("is_primary");
CREATE INDEX "institution_wallets_is_settlement_idx" ON "institution_wallets"("is_settlement");

-- AddForeignKey
ALTER TABLE "institution_wallets" ADD CONSTRAINT "institution_wallets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
