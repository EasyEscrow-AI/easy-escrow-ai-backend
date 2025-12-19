-- CreateEnum: DelegationStatus for cNFT listings
CREATE TYPE "DelegationStatus" AS ENUM ('PENDING', 'DELEGATED', 'FROZEN', 'REVOKED');

-- CreateEnum: ListingStatus for marketplace listings
CREATE TYPE "ListingStatus" AS ENUM ('PENDING', 'ACTIVE', 'SOLD', 'CANCELLED', 'EXPIRED');

-- CreateEnum: OfferEscrowStatus for cNFT offer escrow
CREATE TYPE "OfferEscrowStatus" AS ENUM ('PENDING', 'ACTIVE', 'ACCEPTED', 'COUNTERED', 'CANCELLED', 'EXPIRED', 'REJECTED');

-- CreateEnum: TwoPhaseSwapStatus for two-phase swap state machine
CREATE TYPE "TwoPhaseSwapStatus" AS ENUM ('CREATED', 'ACCEPTED', 'LOCKING_PARTY_A', 'PARTY_A_LOCKED', 'LOCKING_PARTY_B', 'FULLY_LOCKED', 'SETTLING', 'PARTIAL_SETTLE', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable: listings (cNFT marketplace listings with delegation)
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "merkle_tree" TEXT NOT NULL,
    "leaf_index" INTEGER NOT NULL,
    "price_lamports" BIGINT NOT NULL,
    "delegation_status" "DelegationStatus" NOT NULL DEFAULT 'PENDING',
    "delegate_pda" TEXT,
    "delegated_at" TIMESTAMP(3),
    "is_frozen" BOOLEAN NOT NULL DEFAULT false,
    "status" "ListingStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "delegate_tx_id" TEXT,
    "settle_tx_id" TEXT,
    "revoke_tx_id" TEXT,
    "buyer" TEXT,
    "sold_at" TIMESTAMP(3),
    "fee_bps" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cnft_offers (cNFT offer escrow system)
CREATE TABLE "cnft_offers" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "bidder_wallet" TEXT NOT NULL,
    "target_asset_id" TEXT NOT NULL,
    "merkle_tree" TEXT,
    "leaf_index" INTEGER,
    "owner_wallet" TEXT NOT NULL,
    "offer_lamports" BIGINT NOT NULL,
    "fee_lamports" BIGINT NOT NULL,
    "fee_bps" INTEGER NOT NULL DEFAULT 100,
    "escrow_pda" TEXT NOT NULL,
    "escrow_bump" INTEGER NOT NULL,
    "status" "OfferEscrowStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "escrow_tx_id" TEXT,
    "accept_tx_id" TEXT,
    "cancel_tx_id" TEXT,
    "reject_tx_id" TEXT,
    "counter_offer_id" TEXT,
    "parent_offer_id" TEXT,
    "accepted_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "listing_id" TEXT,

    CONSTRAINT "cnft_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: two_phase_swaps (Two-phase swap state machine for bulk and cNFT swaps)
CREATE TABLE "two_phase_swaps" (
    "id" TEXT NOT NULL,
    "status" "TwoPhaseSwapStatus" NOT NULL DEFAULT 'CREATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "party_a" TEXT NOT NULL,
    "party_b" TEXT,
    "assets_a" JSONB NOT NULL,
    "assets_b" JSONB NOT NULL,
    "sol_amount_a" BIGINT,
    "sol_amount_b" BIGINT,
    "lock_tx_a" TEXT,
    "lock_tx_b" TEXT,
    "lock_confirmed_a" TIMESTAMP(3),
    "lock_confirmed_b" TIMESTAMP(3),
    "settle_txs" JSONB NOT NULL DEFAULT '[]',
    "current_settle_index" INTEGER NOT NULL DEFAULT 0,
    "total_settle_txs" INTEGER NOT NULL DEFAULT 1,
    "final_settle_tx" TEXT,
    "settled_at" TIMESTAMP(3),
    "error_message" TEXT,
    "error_code" TEXT,
    "failed_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "platform_fee_lamports" BIGINT NOT NULL,
    "swap_offer_id" INTEGER,
    "delegation_status" JSONB NOT NULL DEFAULT '{}',
    "state_history" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "two_phase_swaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: listings indexes
CREATE UNIQUE INDEX "listings_listing_id_key" ON "listings"("listing_id");
CREATE INDEX "listings_listing_id_idx" ON "listings"("listing_id");
CREATE INDEX "listings_seller_idx" ON "listings"("seller");
CREATE INDEX "listings_asset_id_idx" ON "listings"("asset_id");
CREATE INDEX "listings_status_idx" ON "listings"("status");
CREATE INDEX "listings_delegation_status_idx" ON "listings"("delegation_status");
CREATE INDEX "listings_expires_at_idx" ON "listings"("expires_at");
CREATE INDEX "listings_created_at_idx" ON "listings"("created_at");
CREATE INDEX "idx_listing_status_expiry" ON "listings"("status", "expires_at");

-- CreateIndex: cnft_offers indexes
CREATE UNIQUE INDEX "cnft_offers_offer_id_key" ON "cnft_offers"("offer_id");
CREATE INDEX "cnft_offers_offer_id_idx" ON "cnft_offers"("offer_id");
CREATE INDEX "cnft_offers_bidder_wallet_idx" ON "cnft_offers"("bidder_wallet");
CREATE INDEX "cnft_offers_owner_wallet_idx" ON "cnft_offers"("owner_wallet");
CREATE INDEX "cnft_offers_target_asset_id_idx" ON "cnft_offers"("target_asset_id");
CREATE INDEX "cnft_offers_status_idx" ON "cnft_offers"("status");
CREATE INDEX "cnft_offers_expires_at_idx" ON "cnft_offers"("expires_at");
CREATE INDEX "cnft_offers_created_at_idx" ON "cnft_offers"("created_at");
CREATE INDEX "cnft_offers_listing_id_idx" ON "cnft_offers"("listing_id");
CREATE INDEX "idx_offer_escrow_status_expiry" ON "cnft_offers"("status", "expires_at");

-- CreateIndex: two_phase_swaps indexes
CREATE UNIQUE INDEX "two_phase_swaps_swap_offer_id_key" ON "two_phase_swaps"("swap_offer_id");
CREATE INDEX "two_phase_swaps_status_idx" ON "two_phase_swaps"("status");
CREATE INDEX "two_phase_swaps_party_a_idx" ON "two_phase_swaps"("party_a");
CREATE INDEX "two_phase_swaps_party_b_idx" ON "two_phase_swaps"("party_b");
CREATE INDEX "two_phase_swaps_expires_at_idx" ON "two_phase_swaps"("expires_at");
CREATE INDEX "two_phase_swaps_created_at_idx" ON "two_phase_swaps"("created_at");
CREATE INDEX "idx_two_phase_status_expiry" ON "two_phase_swaps"("status", "expires_at");

-- AddForeignKey: cnft_offers -> cnft_offers (counter_offer self-reference)
ALTER TABLE "cnft_offers" ADD CONSTRAINT "cnft_offers_counter_offer_id_fkey" FOREIGN KEY ("counter_offer_id") REFERENCES "cnft_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: cnft_offers -> cnft_offers (parent_offer self-reference)
ALTER TABLE "cnft_offers" ADD CONSTRAINT "cnft_offers_parent_offer_id_fkey" FOREIGN KEY ("parent_offer_id") REFERENCES "cnft_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: cnft_offers -> listings
ALTER TABLE "cnft_offers" ADD CONSTRAINT "cnft_offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: two_phase_swaps -> swap_offers
ALTER TABLE "two_phase_swaps" ADD CONSTRAINT "two_phase_swaps_swap_offer_id_fkey" FOREIGN KEY ("swap_offer_id") REFERENCES "swap_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
