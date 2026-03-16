use anchor_lang::prelude::*;

/// Institution Escrow PDA account for cross-border USDC escrow payments
///
/// Seeds: ["inst_escrow", escrow_id[32]]
#[account]
pub struct InstitutionEscrow {
    /// Unique escrow identifier (UUID bytes from backend)
    pub escrow_id: [u8; 32],
    /// Payer wallet (depositor of USDC)
    pub payer: Pubkey,
    /// Recipient wallet (receives USDC on release)
    pub recipient: Pubkey,
    /// USDC SPL token mint
    pub mint: Pubkey,
    /// USDC amount (in micro-USDC, 6 decimals)
    pub amount: u64,
    /// Platform fee (in micro-USDC)
    pub platform_fee: u64,
    /// Fee collector wallet
    pub fee_collector: Pubkey,
    /// Release condition type
    pub condition_type: InstitutionConditionType,
    /// Corridor code (e.g. "SG-CH" padded to 8 bytes)
    pub corridor: [u8; 8],
    /// Current escrow status
    pub status: InstitutionEscrowOnChainStatus,
    /// Settlement authority pubkey (can release funds)
    pub settlement_authority: Pubkey,
    /// Expiry timestamp (Unix)
    pub expiry_timestamp: i64,
    /// Creation timestamp
    pub created_at: i64,
    /// Resolution timestamp (0 if unresolved)
    pub resolved_at: i64,
    /// PDA bump seed
    pub bump: u8,
    /// Token vault PDA bump seed
    pub vault_bump: u8,
}

impl InstitutionEscrow {
    /// Account size calculation
    /// Discriminator(8) + escrow_id(32) + payer(32) + recipient(32) + mint(32) +
    /// amount(8) + platform_fee(8) + fee_collector(32) + condition_type(1) +
    /// corridor(8) + status(1) + settlement_authority(32) + expiry_timestamp(8) +
    /// created_at(8) + resolved_at(8) + bump(1) + vault_bump(1) = 262
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 32 + 1 + 8 + 1 + 32 + 8 + 8 + 8 + 1 + 1;

    pub const SEED_PREFIX: &'static [u8] = b"inst_escrow";
    pub const VAULT_SEED: &'static [u8] = b"inst_vault";

    /// Minimum escrow amount: 1 USDC (1_000_000 micro-USDC)
    pub const MIN_AMOUNT: u64 = 1_000_000;
    /// Maximum escrow amount: 10M USDC
    pub const MAX_AMOUNT: u64 = 10_000_000_000_000;
    /// Maximum expiry: 90 days
    pub const MAX_EXPIRY_SECONDS: i64 = 90 * 24 * 60 * 60;
    /// Minimum expiry: 1 hour
    pub const MIN_EXPIRY_SECONDS: i64 = 60 * 60;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum InstitutionEscrowOnChainStatus {
    Created = 0,
    Funded = 1,
    Released = 2,
    Cancelled = 3,
    Expired = 4,
}

impl Default for InstitutionEscrowOnChainStatus {
    fn default() -> Self {
        InstitutionEscrowOnChainStatus::Created
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum InstitutionConditionType {
    AdminRelease = 0,
    TimeLock = 1,
    ComplianceCheck = 2,
}

impl Default for InstitutionConditionType {
    fn default() -> Self {
        InstitutionConditionType::AdminRelease
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_institution_escrow_size() {
        assert_eq!(InstitutionEscrow::LEN, 262);
    }
}
