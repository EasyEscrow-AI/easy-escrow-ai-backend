-- CreateTable
CREATE TABLE "authorized_apps" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "zero_fee_enabled" BOOLEAN NOT NULL DEFAULT true,
    "rate_limit_per_day" INTEGER NOT NULL DEFAULT 1000,
    "total_swaps" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authorized_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zero_fee_swap_logs" (
    "id" TEXT NOT NULL,
    "authorized_app_id" TEXT NOT NULL,
    "swap_signature" TEXT NOT NULL,
    "maker_wallet" TEXT NOT NULL,
    "taker_wallet" TEXT NOT NULL,
    "platform_fee_bps" INTEGER NOT NULL,
    "total_value_lamports" BIGINT NOT NULL,
    "backend_signer" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zero_fee_swap_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "authorized_apps_api_key_key" ON "authorized_apps"("api_key");

-- CreateIndex
CREATE INDEX "authorized_apps_api_key_idx" ON "authorized_apps"("api_key");

-- CreateIndex
CREATE INDEX "authorized_apps_active_idx" ON "authorized_apps"("active");

-- CreateIndex
CREATE INDEX "authorized_apps_zero_fee_enabled_idx" ON "authorized_apps"("zero_fee_enabled");

-- CreateIndex
CREATE INDEX "authorized_apps_last_used_at_idx" ON "authorized_apps"("last_used_at");

-- CreateIndex
CREATE INDEX "zero_fee_swap_logs_authorized_app_id_idx" ON "zero_fee_swap_logs"("authorized_app_id");

-- CreateIndex
CREATE INDEX "zero_fee_swap_logs_swap_signature_idx" ON "zero_fee_swap_logs"("swap_signature");

-- CreateIndex
CREATE INDEX "zero_fee_swap_logs_maker_wallet_idx" ON "zero_fee_swap_logs"("maker_wallet");

-- CreateIndex
CREATE INDEX "zero_fee_swap_logs_taker_wallet_idx" ON "zero_fee_swap_logs"("taker_wallet");

-- CreateIndex
CREATE INDEX "zero_fee_swap_logs_executed_at_idx" ON "zero_fee_swap_logs"("executed_at");

-- AddForeignKey
ALTER TABLE "zero_fee_swap_logs" ADD CONSTRAINT "zero_fee_swap_logs_authorized_app_id_fkey" FOREIGN KEY ("authorized_app_id") REFERENCES "authorized_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

