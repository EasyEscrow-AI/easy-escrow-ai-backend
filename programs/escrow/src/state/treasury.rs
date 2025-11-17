use anchor_lang::prelude::*;

/// Treasury PDA account that tracks platform fees and swap statistics
/// 
/// Seeds: ["treasury", platform_authority.key()]
#[account]
pub struct Treasury {
    /// Platform authority that controls the treasury
    pub authority: Pubkey,
    
    /// Total platform fees collected (in lamports)
    pub total_fees_collected: u64,
    
    /// Total number of successful swaps executed
    pub total_swaps_executed: u64,
    
    /// PDA bump seed for Treasury derivation
    pub bump: u8,
}

impl Treasury {
    /// Space required for Treasury account
    /// Discriminator (8) + Pubkey (32) + u64 (8) + u64 (8) + u8 (1) = 57 bytes
    pub const LEN: usize = 8 + 32 + 8 + 8 + 1;
    
    /// Treasury PDA seeds
    pub const SEED_PREFIX: &'static [u8] = b"treasury";
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_treasury_size() {
        assert_eq!(Treasury::LEN, 57);
    }
}

