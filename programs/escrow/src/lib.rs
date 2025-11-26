use anchor_lang::prelude::*;
use solana_security_txt::security_txt;

// Modules
pub mod state;
pub mod instructions;
pub mod errors;

use instructions::*;

// Environment-specific Program IDs
// Automatically selected based on build features
// Build with: anchor build --features <environment>

#[cfg(feature = "mainnet")]
declare_id!("2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx");

#[cfg(feature = "staging")]
declare_id!("AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei");

#[cfg(feature = "devnet")]
declare_id!("GpvN8LB1xXTu9N541x9rrbxD7HwH6xi1Gkp84P7rUAEZ");

#[cfg(feature = "localnet")]
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// Security contact information embedded in the program
// This allows security researchers and auditors to easily find contact information
#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Easy Escrow - Atomic Swap Program",
    project_url: "https://easyescrow.ai",
    contacts: "email:security@easyescrow.ai",
    policy: "https://easyescrow.ai/security-policy",
    preferred_languages: "en",
    auditors: "Pending - Audit scheduled Q1 2026",
    source_code: "https://github.com/easyescrow-ai/atomic-swap"
}

/// Compile-time check: Ensure exactly one environment feature is enabled
/// This prevents security issues from multiple features being enabled simultaneously
#[cfg(all(feature = "mainnet", feature = "staging"))]
compile_error!("Cannot enable both 'mainnet' and 'staging' features simultaneously");

#[cfg(all(feature = "mainnet", feature = "devnet"))]
compile_error!("Cannot enable both 'mainnet' and 'devnet' features simultaneously");

#[cfg(all(feature = "mainnet", feature = "localnet"))]
compile_error!("Cannot enable both 'mainnet' and 'localnet' features simultaneously");

#[cfg(all(feature = "staging", feature = "devnet"))]
compile_error!("Cannot enable both 'staging' and 'devnet' features simultaneously");

#[cfg(all(feature = "staging", feature = "localnet"))]
compile_error!("Cannot enable both 'staging' and 'localnet' features simultaneously");

#[cfg(all(feature = "devnet", feature = "localnet"))]
compile_error!("Cannot enable both 'devnet' and 'localnet' features simultaneously");

/// Authorized admin public keys for different environments
/// 
/// These keys are extracted from the wallets/ directory:
/// - DEVNET: wallets/dev/dev-admin.json (7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u)
/// - STAGING: wallets/staging/staging-admin.json (498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R)
/// - MAINNET: wallets/production/production-admin.json (HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2)
/// 
/// Only these addresses can execute atomic swaps, ensuring:
/// 1. All swaps are tracked in the database
/// 2. Platform fees are properly controlled
/// 3. No unauthorized swap execution
///
/// SECURITY: Compile-time checks ensure only ONE admin key is ever included.
/// Attempting to build with multiple features will result in a compilation error.
fn get_authorized_admins() -> Vec<Pubkey> {
    #[cfg(feature = "mainnet")]
    {
        vec![pubkey!("HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2")] // MAINNET
    }
    
    #[cfg(feature = "staging")]
    {
        vec![pubkey!("498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R")] // STAGING
    }
    
    #[cfg(feature = "devnet")]
    {
        vec![pubkey!("7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u")] // DEVNET
    }
    
    #[cfg(feature = "localnet")]
    {
        vec![pubkey!("7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u")] // LOCALNET (uses devnet admin)
    }
    
    #[cfg(not(any(feature = "mainnet", feature = "staging", feature = "devnet", feature = "localnet")))]
    {
        vec![] // Fail safely: no admins authorized
    }
}

#[program]
pub mod escrow {
    use super::*;
    
    /// Initialize the Treasury PDA (one-time setup per authority)
    /// 
    /// Creates a Treasury account that will track platform fees and swap statistics.
    /// This must be called once by the platform authority before any swaps can be executed.
    ///
    /// # Arguments
    /// * `ctx` - Context containing authority and treasury accounts
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        instructions::initialize::initialize_treasury_handler(ctx)
    }
    
    /// Execute an atomic swap with platform fee collection
    /// 
    /// This is the core instruction that executes a complete NFT/cNFT/SOL swap atomically.
    /// All asset transfers and fee collection happen in a single transaction.
    ///
    /// # Process
    /// 1. Check if program is paused
    /// 2. Validate swap parameters
    /// 3. Collect platform fee from taker
    /// 4. Transfer maker's NFTs to taker
    /// 5. Transfer taker's NFTs to maker
    /// 6. Transfer SOL between parties (if any)
    /// 7. Update treasury statistics
    ///
    /// # Arguments
    /// * `ctx` - Context containing all accounts needed for the swap
    /// * `params` - Swap parameters including asset counts, SOL amounts, fee, and swap ID
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    ///
    /// # Security
    /// * Checks program pause state before execution
    /// * Requires signatures from maker, taker, and platform authority
    /// * Validates asset ownership before transfer
    /// * Enforces fee collection before any asset transfers
    /// * All-or-nothing execution (atomic)
    ///
    /// # Errors
    /// * `ProgramPaused` - Operations are temporarily disabled
    /// * `Unauthorized` - Platform authority signature missing or invalid
    /// * `InvalidFee` - Fee is zero or exceeds maximum
    /// * `TooManyAssets` - Asset count exceeds maximum per side
    /// * `InvalidSwapId` - Swap ID exceeds maximum length
    /// * `ArithmeticOverflow` - Fee calculation overflow
    pub fn atomic_swap_with_fee(
        ctx: Context<AtomicSwapWithFee>,
        params: SwapParams,
    ) -> Result<()> {
        instructions::atomic_swap::atomic_swap_handler(ctx, params)
    }
    
    /// Withdraw accumulated fees from Treasury PDA to treasury wallet
    /// 
    /// Allows the platform authority to withdraw SOL from the Treasury PDA to the
    /// designated treasury wallet. Withdrawals are rate-limited to once per week (7 days).
    ///
    /// # Arguments
    /// * `ctx` - Context containing authority, treasury PDA, and treasury wallet
    /// * `amount` - Amount of lamports to withdraw
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    ///
    /// # Security
    /// * Only platform authority can withdraw
    /// * Program must not be paused
    /// * Enforces 7-day minimum between withdrawals
    /// * Maintains rent-exempt minimum in Treasury PDA
    ///
    /// # Errors
    /// * `Unauthorized` - Caller is not platform authority
    /// * `ProgramPaused` - Program is currently paused
    /// * `WithdrawalTooFrequent` - Less than 7 days since last withdrawal
    /// * `InsufficientTreasuryBalance` - Not enough funds available
    pub fn withdraw_treasury_fees(
        ctx: Context<WithdrawTreasuryFees>,
        amount: u64,
    ) -> Result<()> {
        instructions::withdraw::withdraw_treasury_fees_handler(ctx, amount)
    }
    
    /// Emergency pause - stops all swaps and withdrawals
    /// 
    /// Allows the platform authority to immediately halt all program operations.
    /// Used in case of security issues, bugs, or regulatory requirements.
    ///
    /// # Arguments
    /// * `ctx` - Context containing authority and treasury
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    ///
    /// # Security
    /// * Only platform authority can pause
    /// * Cannot pause if already paused
    ///
    /// # Errors
    /// * `Unauthorized` - Caller is not platform authority
    /// * `AlreadyPaused` - Program is already in paused state
    pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
        instructions::pause::emergency_pause_handler(ctx)
    }
    
    /// Resume operations after emergency pause
    /// 
    /// Allows the platform authority to resume program operations after a pause.
    ///
    /// # Arguments
    /// * `ctx` - Context containing authority and treasury
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    ///
    /// # Security
    /// * Only platform authority can unpause
    /// * Cannot unpause if not paused
    ///
    /// # Errors
    /// * `Unauthorized` - Caller is not platform authority
    /// * `NotPaused` - Program is not currently paused
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }
}

/// Verify that a signer is an authorized admin
/// 
/// # Arguments
/// * `admin` - Public key to verify
///
/// # Returns
/// * `bool` - True if authorized, false otherwise
pub fn is_authorized_admin(admin: &Pubkey) -> bool {
    let authorized_admins = get_authorized_admins();
    authorized_admins.contains(admin)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_authorized_admins_not_empty() {
        let admins = get_authorized_admins();
        assert!(!admins.is_empty(), "At least one admin should be authorized");
    }
    
    #[test]
    fn test_authorized_admin_check() {
        // This test will pass if any feature is enabled
        let admins = get_authorized_admins();
        if !admins.is_empty() {
            let first_admin = admins[0];
            assert!(is_authorized_admin(&first_admin));
        }
    }
}
