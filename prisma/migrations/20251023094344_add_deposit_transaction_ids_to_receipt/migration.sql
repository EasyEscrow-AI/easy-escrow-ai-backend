-- AlterTable
ALTER TABLE "receipts" ADD COLUMN "deposit_nft_tx_id" TEXT,
ADD COLUMN "deposit_usdc_tx_id" TEXT;

-- Add comments for documentation
COMMENT ON COLUMN "receipts"."deposit_nft_tx_id" IS 'Transaction ID for NFT deposit';
COMMENT ON COLUMN "receipts"."deposit_usdc_tx_id" IS 'Transaction ID for USDC deposit';

