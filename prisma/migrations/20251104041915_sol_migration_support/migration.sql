-- CreateEnum
CREATE TYPE "SwapType" AS ENUM ('NFT_FOR_SOL', 'NFT_FOR_NFT_WITH_FEE', 'NFT_FOR_NFT_PLUS_SOL');

-- CreateEnum
CREATE TYPE "FeePayer" AS ENUM ('BUYER', 'SELLER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DepositType" ADD VALUE 'SOL';
ALTER TYPE "DepositType" ADD VALUE 'NFT_BUYER';

-- AlterTable
ALTER TABLE "agreements" ADD COLUMN     "fee_payer" "FeePayer" DEFAULT 'BUYER',
ADD COLUMN     "nft_b_mint" TEXT,
ADD COLUMN     "sol_amount" DECIMAL(20,9),
ADD COLUMN     "swap_type" "SwapType";

-- CreateIndex
CREATE INDEX "agreements_nft_b_mint_idx" ON "agreements"("nft_b_mint");

-- CreateIndex
CREATE INDEX "agreements_swap_type_idx" ON "agreements"("swap_type");
