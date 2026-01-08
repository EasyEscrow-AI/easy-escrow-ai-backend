use anchor_lang::prelude::*;

/// DataSales Escrow PDA account for data buy/sell agreements
///
/// Seeds: ["datasales_escrow", agreement_id]
/// This PDA tracks the state of a DataSales agreement, with a separate vault holding SOL.
///
/// Flow:
/// 1. Agreement created (PENDING_DEPOSITS)
/// 2. Seller uploads data to S3 → DATA_LOCKED
/// 3. Buyer deposits SOL → SOL_LOCKED
/// 4. Both complete → BOTH_LOCKED
/// 5. DataSales verifies → APPROVED
/// 6. Settlement executed → SETTLED
/// 7. Access expires → EXPIRED → ARCHIVED
#[account]
pub struct DataSalesEscrow {
    /// Unique agreement identifier (UUID bytes, matches database agreement_id)
    pub agreement_id: [u8; 32],

    /// Seller wallet address (data provider)
    pub seller: Pubkey,

    /// Buyer wallet address (None for open listings)
    pub buyer: Option<Pubkey>,

    /// Price in lamports (what seller receives)
    pub price_lamports: u64,

    /// Platform fee in lamports (sent to treasury)
    pub platform_fee_lamports: u64,

    /// Fee collector wallet address (treasury PDA or designated address)
    pub fee_collector: Pubkey,

    /// Deposit window end timestamp (Unix timestamp)
    /// Both parties must deposit before this time
    pub deposit_window_end: i64,

    /// Access duration in seconds after settlement
    pub access_duration_seconds: i64,

    /// Whether seller has confirmed data upload
    pub seller_deposited: bool,

    /// Whether buyer has deposited SOL
    pub buyer_deposited: bool,

    /// Whether DataSales has approved the data
    pub data_approved: bool,

    /// Agreement status
    pub status: DataSalesStatus,

    /// Timestamp when agreement was created
    pub created_at: i64,

    /// Timestamp when settlement was executed
    pub settled_at: i64,

    /// Timestamp when access expires (set at settlement)
    pub access_expires_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

impl DataSalesEscrow {
    /// Space required for DataSalesEscrow account
    /// Discriminator (8) + agreement_id (32) + seller (32) + buyer (1 + 32 Option) +
    /// price_lamports (8) + platform_fee_lamports (8) + fee_collector (32) +
    /// deposit_window_end (8) + access_duration_seconds (8) +
    /// seller_deposited (1) + buyer_deposited (1) + data_approved (1) +
    /// status (1) + created_at (8) + settled_at (8) + access_expires_at (8) + bump (1) = 198 bytes
    pub const LEN: usize = 8 + 32 + 32 + (1 + 32) + 8 + 8 + 32 + 8 + 8 + 1 + 1 + 1 + 1 + 8 + 8 + 8 + 1;

    /// DataSalesEscrow PDA seeds prefix
    pub const SEED_PREFIX: &'static [u8] = b"datasales_escrow";

    /// SOL Vault PDA seeds prefix (separate account holding buyer's SOL)
    pub const SOL_VAULT_SEED: &'static [u8] = b"datasales_vault";

    /// Minimum price (0.01 SOL = 10M lamports)
    pub const MIN_PRICE: u64 = 10_000_000;

    /// Maximum price (100,000 SOL = 100T lamports) - higher for data sales
    pub const MAX_PRICE: u64 = 100_000_000_000_000;

    /// Minimum deposit window (1 hour in seconds)
    pub const MIN_DEPOSIT_WINDOW: i64 = 60 * 60;

    /// Maximum deposit window (30 days in seconds)
    pub const MAX_DEPOSIT_WINDOW: i64 = 30 * 24 * 60 * 60;

    /// Minimum access duration (1 hour in seconds)
    pub const MIN_ACCESS_DURATION: i64 = 60 * 60;

    /// Maximum access duration (365 days in seconds)
    pub const MAX_ACCESS_DURATION: i64 = 365 * 24 * 60 * 60;

    /// Default platform fee in basis points (2.5% = 250 bps)
    pub const DEFAULT_PLATFORM_FEE_BPS: u16 = 250;
}

/// DataSales agreement status enum matching the Prisma DataSalesStatus
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum DataSalesStatus {
    /// Waiting for seller upload and/or buyer SOL deposit
    PendingDeposits = 0,
    /// Seller uploaded data, waiting for buyer SOL
    DataLocked = 1,
    /// Buyer deposited SOL, waiting for seller upload
    SolLocked = 2,
    /// Both parties deposited, awaiting DataSales verification
    BothLocked = 3,
    /// DataSales approved data quality, ready to settle
    Approved = 4,
    /// Settlement executed, buyer has access
    Settled = 5,
    /// Access period ended
    Expired = 6,
    /// Agreement cancelled (timeout or manual)
    Cancelled = 7,
    /// Cleanup complete, PDAs closed
    Archived = 8,
}

impl Default for DataSalesStatus {
    fn default() -> Self {
        DataSalesStatus::PendingDeposits
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_datasales_escrow_size() {
        assert_eq!(DataSalesEscrow::LEN, 198);
    }

    #[test]
    fn test_datasales_escrow_constants() {
        assert_eq!(DataSalesEscrow::MIN_PRICE, 10_000_000); // 0.01 SOL
        assert_eq!(DataSalesEscrow::MAX_PRICE, 100_000_000_000_000); // 100,000 SOL
        assert_eq!(DataSalesEscrow::MIN_DEPOSIT_WINDOW, 3600); // 1 hour
        assert_eq!(DataSalesEscrow::MAX_DEPOSIT_WINDOW, 2592000); // 30 days
        assert_eq!(DataSalesEscrow::MIN_ACCESS_DURATION, 3600); // 1 hour
        assert_eq!(DataSalesEscrow::MAX_ACCESS_DURATION, 31536000); // 365 days
        assert_eq!(DataSalesEscrow::DEFAULT_PLATFORM_FEE_BPS, 250); // 2.5%
    }

    #[test]
    fn test_datasales_status_values() {
        assert_eq!(DataSalesStatus::PendingDeposits as u8, 0);
        assert_eq!(DataSalesStatus::DataLocked as u8, 1);
        assert_eq!(DataSalesStatus::SolLocked as u8, 2);
        assert_eq!(DataSalesStatus::BothLocked as u8, 3);
        assert_eq!(DataSalesStatus::Approved as u8, 4);
        assert_eq!(DataSalesStatus::Settled as u8, 5);
        assert_eq!(DataSalesStatus::Expired as u8, 6);
        assert_eq!(DataSalesStatus::Cancelled as u8, 7);
        assert_eq!(DataSalesStatus::Archived as u8, 8);
    }
}
