-- CreateTable
CREATE TABLE "institution_transfers" (
    "id" TEXT NOT NULL,
    "transfer_code" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "from_account_id" TEXT NOT NULL,
    "to_account_id" TEXT NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "signer_public_key" TEXT NOT NULL,
    "tx_signature" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institution_transfers_transfer_code_key" ON "institution_transfers"("transfer_code");

-- CreateIndex
CREATE INDEX "institution_transfers_client_id_idx" ON "institution_transfers"("client_id");

-- CreateIndex
CREATE INDEX "institution_transfers_from_account_id_idx" ON "institution_transfers"("from_account_id");

-- CreateIndex
CREATE INDEX "institution_transfers_to_account_id_idx" ON "institution_transfers"("to_account_id");

-- CreateIndex
CREATE INDEX "institution_transfers_status_idx" ON "institution_transfers"("status");

-- CreateIndex
CREATE INDEX "institution_transfers_created_at_idx" ON "institution_transfers"("created_at");

-- AddForeignKey
ALTER TABLE "institution_transfers" ADD CONSTRAINT "institution_transfers_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "institution_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_transfers" ADD CONSTRAINT "institution_transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "institution_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_transfers" ADD CONSTRAINT "institution_transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "institution_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
