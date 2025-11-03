-- CreateIndex
CREATE INDEX "idx_status_expiry" ON "agreements"("status", "expiry");

-- CreateIndex
CREATE INDEX "idx_expiry_seller_buyer" ON "agreements"("expiry", "seller", "buyer");
