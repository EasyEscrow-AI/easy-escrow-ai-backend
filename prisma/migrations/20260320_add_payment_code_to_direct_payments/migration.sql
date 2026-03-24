-- Add human-readable payment code (EE-XXX-XXX format) to direct payments
ALTER TABLE "direct_payments" ADD COLUMN "payment_code" TEXT;

-- Create unique index for payment code lookups (also serves as search index)
CREATE UNIQUE INDEX "direct_payments_payment_code_key" ON "direct_payments"("payment_code");
