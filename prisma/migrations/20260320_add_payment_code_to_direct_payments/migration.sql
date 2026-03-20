-- Add human-readable payment code (EE-XXX-XXX format) to direct payments
ALTER TABLE "direct_payments" ADD COLUMN "payment_code" TEXT;

-- Create unique index for payment code lookups
CREATE UNIQUE INDEX "direct_payments_payment_code_key" ON "direct_payments"("payment_code");

-- Create index for fast lookups
CREATE INDEX "direct_payments_payment_code_idx" ON "direct_payments"("payment_code");
