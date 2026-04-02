use anchor_lang::prelude::*;

/// Pool vault status lifecycle:
/// Created -> Active (first deposit) -> Settling (first release) -> Settled (all released)
/// Created/Active -> Cancelled (refund)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum PoolVaultStatus {
    Created = 0,
    Active = 1,
    Settling = 2,
    Settled = 3,
    Cancelled = 4,
}

impl Default for PoolVaultStatus {
    fn default() -> Self {
        PoolVaultStatus::Created
    }
}

/// Pool Vault PDA account for transaction pool USDC escrow
///
/// Seeds: ["pool_vault", pool_id[32]]
#[account]
pub struct PoolVault {
    /// Unique pool identifier (UUID bytes from backend)
    pub pool_id: [u8; 32],
    /// Authority that controls the pool (settlement authority)
    pub authority: Pubkey,
    /// SPL token mint (USDC)
    pub mint: Pubkey,
    /// Token program used (Token or Token2022)
    pub token_program: Pubkey,
    /// Fee collector wallet
    pub fee_collector: Pubkey,
    /// Total escrow amount (sum of member amounts, excludes fees)
    pub total_amount: u64,
    /// Total platform fees collected
    pub total_fees: u64,
    /// Total USDC deposited into vault (amount + fees)
    pub total_deposited: u64,
    /// Total USDC released from vault
    pub total_released: u64,
    /// Number of members (deposits)
    pub member_count: u32,
    /// Number of members released
    pub released_count: u32,
    /// Current pool status
    pub status: PoolVaultStatus,
    /// Corridor code (e.g. "SG-CH" padded to 8 bytes)
    pub corridor: [u8; 8],
    /// Creation timestamp
    pub created_at: i64,
    /// Expiry timestamp (Unix)
    pub expiry_timestamp: i64,
    /// PDA bump seed
    pub bump: u8,
    /// Token vault PDA bump seed
    pub vault_bump: u8,
}

impl PoolVault {
    /// Account size calculation
    /// Discriminator(8) + pool_id(32) + authority(32) + mint(32) + token_program(32) +
    /// fee_collector(32) + total_amount(8) + total_fees(8) + total_deposited(8) +
    /// total_released(8) + member_count(4) + released_count(4) + status(1) +
    /// corridor(8) + created_at(8) + expiry_timestamp(8) + bump(1) + vault_bump(1)
    /// = 235
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 4 + 4 + 1 + 8 + 8 + 8 + 1 + 1;

    pub const SEED_PREFIX: &'static [u8] = b"pool_vault";
    pub const VAULT_SEED: &'static [u8] = b"pool_vault_token";
    pub const RECEIPT_SEED: &'static [u8] = b"pool_receipt";

    /// Minimum expiry: 1 hour
    pub const MIN_EXPIRY_SECONDS: i64 = 60 * 60;
    /// Maximum expiry: 90 days
    pub const MAX_EXPIRY_SECONDS: i64 = 90 * 24 * 60 * 60;
}

/// Pool receipt status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum PoolReceiptStatus {
    Created = 0,
    Settled = 1,
    Failed = 2,
}

impl Default for PoolReceiptStatus {
    fn default() -> Self {
        PoolReceiptStatus::Created
    }
}

/// Pool Receipt PDA account - on-chain proof of a pool member release
///
/// Seeds: ["pool_receipt", pool_id[32], escrow_id[32]]
#[account]
pub struct PoolReceipt {
    /// Pool identifier this receipt belongs to
    pub pool_id: [u8; 32],
    /// Individual escrow identifier within the pool
    pub escrow_id: [u8; 32],
    /// Unique receipt identifier
    pub receipt_id: [u8; 16],
    /// Timestamp of receipt creation
    pub timestamp: i64,
    /// Receipt status
    pub status: PoolReceiptStatus,
    /// Commitment hash for verification
    pub commitment_hash: [u8; 32],
    /// Encrypted payload (privacy-preserving transaction details)
    /// Layout: [12 IV][16 tag][2 ciphertext-length][482 ciphertext (zero-padded)]
    pub encrypted_payload: [u8; 512],
    /// PDA bump seed
    pub bump: u8,
}

impl PoolReceipt {
    /// Account size calculation
    /// Discriminator(8) + pool_id(32) + escrow_id(32) + receipt_id(16) +
    /// timestamp(8) + status(1) + commitment_hash(32) + encrypted_payload(512) + bump(1)
    /// = 642
    pub const LEN: usize = 8 + 32 + 32 + 16 + 8 + 1 + 32 + 512 + 1;
}

/// Escrow Receipt PDA — encrypted receipt for individual (non-pooled) escrows.
///
/// Same encryption format as PoolReceipt (AES-256-GCM, 512-byte payload, SHA-256 commitment).
/// Created during escrow release when PRIVACY_ENABLED and TRANSACTION_POOLS_ENABLED.
///
/// Seeds: ["escrow_receipt", escrow_id[32]]
#[account]
pub struct EscrowReceipt {
    /// Escrow identifier
    pub escrow_id: [u8; 32],
    /// Unique receipt identifier
    pub receipt_id: [u8; 16],
    /// Timestamp of receipt creation
    pub timestamp: i64,
    /// Receipt status
    pub status: PoolReceiptStatus,
    /// SHA-256 commitment hash for public verification
    pub commitment_hash: [u8; 32],
    /// AES-256-GCM encrypted payload (same 512-byte format as PoolReceipt)
    /// Layout: [12 IV][16 tag][2 ciphertext-length][482 ciphertext (zero-padded)]
    pub encrypted_payload: [u8; 512],
    /// PDA bump seed
    pub bump: u8,
}

impl EscrowReceipt {
    /// Discriminator(8) + escrow_id(32) + receipt_id(16) + timestamp(8) + status(1)
    /// + commitment_hash(32) + encrypted_payload(512) + bump(1) = 610
    pub const LEN: usize = 8 + 32 + 16 + 8 + 1 + 32 + 512 + 1;
    pub const SEED_PREFIX: &'static [u8] = b"escrow_receipt";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pool_vault_size() {
        assert_eq!(PoolVault::LEN, 235);
    }

    #[test]
    fn test_pool_receipt_size() {
        assert_eq!(PoolReceipt::LEN, 642);
    }

    #[test]
    fn test_escrow_receipt_size() {
        assert_eq!(EscrowReceipt::LEN, 610);
    }
}
