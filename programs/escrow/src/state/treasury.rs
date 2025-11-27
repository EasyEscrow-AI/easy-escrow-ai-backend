use anchor_lang::prelude::*;

/// Treasury PDA account that tracks platform fees and swap statistics
///
/// Seeds: ["treasury_v3", platform_authority.key()]
#[account]
pub struct Treasury {
    /// Platform authority that controls the treasury
    pub authority: Pubkey,

    /// Total platform fees collected (in lamports)
    pub total_fees_collected: u64,

    /// Total number of successful swaps executed
    pub total_swaps_executed: u64,

    /// Total fees withdrawn to treasury wallet (in lamports)
    pub total_fees_withdrawn: u64,

    /// Emergency pause flag - when true, all swaps are blocked
    pub is_paused: bool,

    /// Timestamp when pause was activated (0 if not paused)
    pub paused_at: i64,

    /// Last withdrawal timestamp
    pub last_withdrawal_at: i64,

    /// SECURITY: Authorized wallet for withdrawals
    /// Treasury can ONLY withdraw to this address
    /// Prevents fund redirection even if authority is compromised
    pub authorized_withdrawal_wallet: Pubkey,

    /// PDA bump seed for Treasury derivation
    pub bump: u8,
}

impl Treasury {
    /// Space required for Treasury account
    /// Discriminator (8) + Pubkey (32) + u64 (8) + u64 (8) + u64 (8) + bool (1) + i64 (8) + i64 (8) + Pubkey (32) + u8 (1) = 114 bytes
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 1 + 8 + 8 + 32 + 1;

    /// Treasury PDA seeds
    /// v3: Adds authorized_withdrawal_wallet for security (114 bytes)
    /// v2: Basic tracking with pause (82 bytes, deprecated)
    /// v1: Original structure (57 bytes, deprecated)
    pub const SEED_PREFIX: &'static [u8] = b"treasury_v3";
    
    /// Minimum time between withdrawals (7 days in seconds)
    pub const MIN_WITHDRAWAL_INTERVAL: i64 = 7 * 24 * 60 * 60;
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_treasury_size() {
        assert_eq!(Treasury::LEN, 114);
    }
}

