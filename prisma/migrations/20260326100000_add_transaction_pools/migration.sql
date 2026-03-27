-- CreateEnum: TransactionPoolStatus
CREATE TYPE "TransactionPoolStatus" AS ENUM ('OPEN', 'LOCKED', 'SETTLING', 'SETTLED', 'PARTIAL_FAIL', 'FAILED', 'CANCELLED');

-- CreateEnum: PoolMemberStatus
CREATE TYPE "PoolMemberStatus" AS ENUM ('PENDING', 'SETTLING', 'SETTLED', 'FAILED', 'REMOVED');

-- CreateEnum: PoolSettlementMode
CREATE TYPE "PoolSettlementMode" AS ENUM ('SEQUENTIAL', 'PARALLEL');

-- AlterEnum: Add pool notification types to NotificationType
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POOL_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POOL_LOCKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POOL_SETTLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POOL_PARTIAL_FAIL';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POOL_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POOL_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POOL_EXPIRED';

-- CreateTable: transaction_pools
CREATE TABLE "transaction_pools" (
    "id" TEXT NOT NULL,
    "pool_code" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "status" "TransactionPoolStatus" NOT NULL DEFAULT 'OPEN',
    "settlement_mode" "PoolSettlementMode" NOT NULL DEFAULT 'SEQUENTIAL',
    "corridor" TEXT,
    "total_amount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "total_fees" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "settled_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "pool_vault_pda" TEXT,
    "pool_vault_token_account" TEXT,
    "pool_risk_score" DECIMAL(5,2),
    "compliance_passed" BOOLEAN,
    "settled_by" TEXT,
    "settled_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    CONSTRAINT "transaction_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable: transaction_pool_members
CREATE TABLE "transaction_pool_members" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "escrow_id" TEXT NOT NULL,
    "status" "PoolMemberStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(20,6) NOT NULL,
    "platform_fee" DECIMAL(20,6) NOT NULL,
    "corridor" TEXT,
    "release_tx_signature" TEXT,
    "released_at" TIMESTAMP(3),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "receipt_pda" TEXT,
    "commitment_hash" TEXT,
    "privacy_level" "PrivacyLevel",
    "stealth_payment_id" TEXT,
    "sequence_number" INTEGER NOT NULL DEFAULT 0,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "transaction_pool_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: transaction_pool_audit_logs
CREATE TABLE "transaction_pool_audit_logs" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "escrow_id" TEXT,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transaction_pool_audit_logs_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add pool_id to institution_escrows
ALTER TABLE "institution_escrows" ADD COLUMN "pool_id" TEXT;

-- AlterTable: Add pool settings to institution_client_settings
ALTER TABLE "institution_client_settings" ADD COLUMN "pool_max_members" INTEGER;
ALTER TABLE "institution_client_settings" ADD COLUMN "pool_default_settlement_mode" TEXT;
ALTER TABLE "institution_client_settings" ADD COLUMN "pool_default_expiry_hours" INTEGER;

-- CreateIndex: transaction_pools
CREATE UNIQUE INDEX "transaction_pools_pool_code_key" ON "transaction_pools"("pool_code");
CREATE INDEX "transaction_pools_client_id_status_idx" ON "transaction_pools"("client_id", "status");
CREATE INDEX "transaction_pools_status_idx" ON "transaction_pools"("status");
CREATE INDEX "transaction_pools_corridor_idx" ON "transaction_pools"("corridor");
CREATE INDEX "transaction_pools_created_at_idx" ON "transaction_pools"("created_at");

-- CreateIndex: transaction_pool_members
CREATE UNIQUE INDEX "transaction_pool_members_pool_id_escrow_id_key" ON "transaction_pool_members"("pool_id", "escrow_id");
CREATE INDEX "transaction_pool_members_pool_id_idx" ON "transaction_pool_members"("pool_id");
CREATE INDEX "transaction_pool_members_escrow_id_idx" ON "transaction_pool_members"("escrow_id");

-- CreateIndex: transaction_pool_audit_logs
CREATE INDEX "transaction_pool_audit_logs_pool_id_idx" ON "transaction_pool_audit_logs"("pool_id");
CREATE INDEX "transaction_pool_audit_logs_escrow_id_idx" ON "transaction_pool_audit_logs"("escrow_id");
CREATE INDEX "transaction_pool_audit_logs_action_idx" ON "transaction_pool_audit_logs"("action");
CREATE INDEX "transaction_pool_audit_logs_created_at_idx" ON "transaction_pool_audit_logs"("created_at");

-- CreateIndex: institution_escrows pool_id
CREATE INDEX "institution_escrows_pool_id_idx" ON "institution_escrows"("pool_id");

-- AddForeignKey: transaction_pools -> institution_clients
ALTER TABLE "transaction_pools" ADD CONSTRAINT "transaction_pools_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: transaction_pool_members -> transaction_pools
ALTER TABLE "transaction_pool_members" ADD CONSTRAINT "transaction_pool_members_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "transaction_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: transaction_pool_audit_logs -> transaction_pools
ALTER TABLE "transaction_pool_audit_logs" ADD CONSTRAINT "transaction_pool_audit_logs_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "transaction_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: institution_escrows.pool_id -> transaction_pools
ALTER TABLE "institution_escrows" ADD CONSTRAINT "institution_escrows_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "transaction_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: transaction_pool_members.escrow_id -> institution_escrows
ALTER TABLE "transaction_pool_members" ADD CONSTRAINT "transaction_pool_members_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "institution_escrows"("escrow_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterColumn: Convert pool_default_settlement_mode from TEXT to PoolSettlementMode enum
ALTER TABLE "institution_client_settings" ALTER COLUMN "pool_default_settlement_mode" TYPE "PoolSettlementMode" USING "pool_default_settlement_mode"::"PoolSettlementMode";
