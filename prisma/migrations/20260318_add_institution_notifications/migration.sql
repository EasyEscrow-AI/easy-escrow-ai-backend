-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ESCROW_CREATED', 'ESCROW_FUNDED', 'ESCROW_RELEASED', 'ESCROW_CANCELLED', 'ESCROW_EXPIRED', 'ESCROW_COMPLIANCE_HOLD', 'KYC_APPROVED', 'KYC_REJECTED', 'KYC_EXPIRING', 'KYB_VERIFIED', 'KYB_REJECTED', 'KYB_EXPIRING', 'WALLET_WHITELISTED', 'WALLET_REMOVED', 'WALLET_VERIFICATION_PENDING', 'COMPLIANCE_CHECK_PASSED', 'COMPLIANCE_CHECK_FAILED', 'COMPLIANCE_REVIEW_REQUIRED', 'ACCOUNT_VERIFIED', 'ACCOUNT_SUSPENDED', 'DEPOSIT_CONFIRMED', 'SETTLEMENT_COMPLETE', 'SYSTEM_MAINTENANCE', 'SECURITY_ALERT');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "institution_notifications" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "escrow_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "institution_notifications_client_id_idx" ON "institution_notifications"("client_id");

-- CreateIndex
CREATE INDEX "institution_notifications_client_id_is_read_idx" ON "institution_notifications"("client_id", "is_read");

-- CreateIndex
CREATE INDEX "institution_notifications_type_idx" ON "institution_notifications"("type");

-- CreateIndex
CREATE INDEX "institution_notifications_created_at_idx" ON "institution_notifications"("created_at");

-- AddForeignKey
ALTER TABLE "institution_notifications" ADD CONSTRAINT "institution_notifications_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
