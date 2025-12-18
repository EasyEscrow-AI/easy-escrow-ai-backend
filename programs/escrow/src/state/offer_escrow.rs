use anchor_lang::prelude::*;

/// Offer Escrow PDA account that holds bidder's SOL for cNFT purchase offers
///
/// Seeds: ["offer_escrow", offer_id.to_le_bytes()]
/// This PDA holds the bidder's SOL until the offer is accepted, cancelled, or expired.
#[account]
pub struct OfferEscrow {
    /// Unique offer identifier (matches database offer_id)
    pub offer_id: [u8; 32],

    /// Bidder wallet address (offer creator)
    pub bidder: Pubkey,

    /// cNFT owner wallet address (seller)
    pub owner: Pubkey,

    /// Target cNFT asset ID (DAS format)
    pub asset_id: [u8; 32],

    /// Merkle tree address containing the cNFT
    pub merkle_tree: Pubkey,

    /// Leaf index in the merkle tree
    pub leaf_index: u32,

    /// Offer amount in lamports (excluding fee)
    pub offer_amount: u64,

    /// Platform fee in lamports
    pub platform_fee: u64,

    /// Fee collector wallet address (stored at creation, validated at acceptance)
    pub fee_collector: Pubkey,

    /// Offer status
    pub status: OfferEscrowStatus,

    /// Expiry timestamp (Unix timestamp)
    pub expiry_timestamp: i64,

    /// Timestamp when offer was created
    pub created_at: i64,

    /// Timestamp when offer was resolved (accepted/cancelled/expired)
    pub resolved_at: i64,

    /// PDA bump seed for OfferEscrow derivation
    pub bump: u8,
}

impl OfferEscrow {
    /// Space required for OfferEscrow account
    /// Discriminator (8) + offer_id (32) + bidder (32) + owner (32) + asset_id (32) +
    /// merkle_tree (32) + leaf_index (4) + offer_amount (8) + platform_fee (8) +
    /// fee_collector (32) + status (1) + expiry_timestamp (8) + created_at (8) + resolved_at (8) + bump (1) = 246 bytes
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 32 + 4 + 8 + 8 + 32 + 1 + 8 + 8 + 8 + 1;

    /// OfferEscrow PDA seeds prefix
    pub const SEED_PREFIX: &'static [u8] = b"offer_escrow";

    /// SOL Vault PDA seeds prefix (separate account holding SOL)
    pub const SOL_VAULT_SEED: &'static [u8] = b"offer_sol_vault";

    /// Maximum offer duration (30 days in seconds)
    pub const MAX_OFFER_DURATION: i64 = 30 * 24 * 60 * 60;

    /// Minimum offer duration (1 hour in seconds)
    pub const MIN_OFFER_DURATION: i64 = 60 * 60;

    /// Minimum offer amount (0.01 SOL = 10M lamports)
    pub const MIN_OFFER_AMOUNT: u64 = 10_000_000;

    /// Maximum offer amount (10,000 SOL = 10T lamports)
    pub const MAX_OFFER_AMOUNT: u64 = 10_000_000_000_000;
}

/// Offer status enum matching the Prisma OfferEscrowStatus
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum OfferEscrowStatus {
    /// Offer created, SOL escrowed, awaiting seller response
    Active = 0,
    /// Seller accepted the offer
    Accepted = 1,
    /// Bidder cancelled the offer
    Cancelled = 2,
    /// Offer expired based on expiry_timestamp
    Expired = 3,
    /// Seller explicitly rejected the offer
    Rejected = 4,
}

impl Default for OfferEscrowStatus {
    fn default() -> Self {
        OfferEscrowStatus::Active
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_offer_escrow_size() {
        assert_eq!(OfferEscrow::LEN, 246);
    }

    #[test]
    fn test_offer_escrow_constants() {
        assert_eq!(OfferEscrow::MIN_OFFER_AMOUNT, 10_000_000); // 0.01 SOL
        assert_eq!(OfferEscrow::MAX_OFFER_AMOUNT, 10_000_000_000_000); // 10,000 SOL
        assert_eq!(OfferEscrow::MIN_OFFER_DURATION, 3600); // 1 hour
        assert_eq!(OfferEscrow::MAX_OFFER_DURATION, 2592000); // 30 days
    }
}
