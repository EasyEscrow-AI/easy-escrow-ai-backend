use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint, spl_token};
use anchor_spl::associated_token::AssociatedToken;
use anchor_lang::solana_program::program_pack::Pack;
use solana_security_txt::security_txt;

// Modules
pub mod state;
pub mod instructions;
pub mod errors;

use instructions::*;

// Re-export offer escrow types for use in program module
pub use instructions::offer_escrow::{
    CreateOfferEscrow, AcceptOfferEscrow, CancelOfferEscrow,
    RejectOfferEscrow, ExpireOfferEscrow, CloseOfferEscrow,
    create_offer_escrow as offer_escrow_create,
    accept_offer_escrow as offer_escrow_accept,
    cancel_offer_escrow as offer_escrow_cancel,
    reject_offer_escrow as offer_escrow_reject,
    expire_offer_escrow as offer_escrow_expire,
};

// Environment-specific Program IDs
// Automatically selected based on build features
// Build with: anchor build --features <environment>
// Default: staging (devnet)

#[cfg(feature = "mainnet")]
declare_id!("2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"); // Production on mainnet-beta

#[cfg(feature = "devnet")]
declare_id!("AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"); // Staging on devnet

#[cfg(feature = "localnet")]
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"); // Local validator

// Fallback: staging (if no feature specified, use staging)
#[cfg(not(any(feature = "mainnet", feature = "devnet", feature = "localnet")))]
declare_id!("AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei");

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
        // HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2
        vec![Pubkey::new_from_array([
            0xf1, 0xca, 0xdb, 0x11, 0xef, 0x69, 0xa6, 0xf9,
            0xc4, 0x71, 0x95, 0x46, 0xaf, 0x05, 0x86, 0x9f,
            0x27, 0x3c, 0x80, 0x4f, 0xff, 0xa4, 0xa8, 0x48,
            0xf6, 0x6c, 0xf3, 0x67, 0xbe, 0x23, 0x45, 0xad,
        ])]
    }
    
    #[cfg(not(any(feature = "mainnet", feature = "devnet", feature = "localnet")))]
    {
        // 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
        vec![Pubkey::new_from_array([
            0x2e, 0xa7, 0xec, 0x9b, 0xaa, 0xe0, 0xb3, 0xea,
            0xa4, 0x76, 0xd3, 0x1c, 0x53, 0x77, 0xfa, 0x65,
            0xb7, 0x39, 0x8f, 0xa5, 0x1e, 0x26, 0x5e, 0x0b,
            0x9d, 0xe3, 0xdd, 0x7f, 0xc2, 0x01, 0x3a, 0xc2,
        ])]
    }
    
    #[cfg(feature = "devnet")]
    {
        // 7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u
        vec![Pubkey::new_from_array([
            0x5c, 0x0c, 0xd2, 0x20, 0x73, 0x74, 0xdf, 0xe8,
            0x44, 0xb9, 0xad, 0x40, 0x67, 0xea, 0xde, 0x8d,
            0xb3, 0xfd, 0x64, 0x28, 0x2d, 0xea, 0x18, 0xfc,
            0xad, 0xf2, 0x43, 0xa2, 0xd7, 0x80, 0x9b, 0xd0,
        ])]
    }
    
    #[cfg(feature = "localnet")]
    {
        // 7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u (uses devnet admin)
        vec![Pubkey::new_from_array([
            0x5c, 0x0c, 0xd2, 0x20, 0x73, 0x74, 0xdf, 0xe8,
            0x44, 0xb9, 0xad, 0x40, 0x67, 0xea, 0xde, 0x8d,
            0xb3, 0xfd, 0x64, 0x28, 0x2d, 0xea, 0x18, 0xfc,
            0xad, 0xf2, 0x43, 0xa2, 0xd7, 0x80, 0x9b, 0xd0,
        ])]
    }
    
    #[cfg(not(any(feature = "mainnet", feature = "staging", feature = "devnet", feature = "localnet")))]
    {
        vec![] // Fail safely: no admins authorized
    }
}

#[program]
pub mod escrow {
    use super::*;

    // ============================================================================
    // SOL-BASED ESCROW INSTRUCTIONS (All Swap Types)
    // ============================================================================

    /// Initialize a new SOL-based escrow agreement
    /// Admin-only operation to ensure all escrows are tracked in the database
    pub fn init_agreement(
        ctx: Context<InitAgreement>,
        escrow_id: u64,
        swap_type: SwapType,
        sol_amount: Option<u64>,
        nft_a_mint: Pubkey,
        nft_b_mint: Pubkey,  // Changed from Option<Pubkey> - use Pubkey::default() for "None"
        expiry_timestamp: i64,
        platform_fee_bps: u16,
        fee_payer: FeePayer,
    ) -> Result<()> {
        // Validate admin authorization
        let authorized_admins = get_authorized_admins();
        require!(
            authorized_admins.contains(&ctx.accounts.admin.key()),
            EscrowError::UnauthorizedAdmin
        );

        // Validate fee basis points (0-10000 = 0%-100%)
        require!(platform_fee_bps <= 10000, EscrowError::InvalidFeeBps);

        // Validate expiry timestamp
        let clock = Clock::get()?;
        require!(
            expiry_timestamp > clock.unix_timestamp,
            EscrowError::InvalidExpiry
        );

        // Helper: Check if NFT B is provided (not the sentinel zero pubkey)
        let has_nft_b = nft_b_mint != Pubkey::default();

        // Validate parameters based on swap type
        match swap_type {
            SwapType::NftForSol => {
                // For NFT<>SOL: must have sol_amount, no nft_b_mint
                require!(sol_amount.is_some(), EscrowError::InvalidSwapParameters);
                require!(!has_nft_b, EscrowError::InvalidSwapParameters);
                
                let amount = sol_amount.unwrap();
                require!(amount >= MIN_SOL_AMOUNT, EscrowError::SolAmountTooLow);
                require!(amount <= MAX_SOL_AMOUNT, EscrowError::SolAmountTooHigh);
            },
            SwapType::NftForNftWithFee => {
                // For NFT<>NFT with fee: must have nft_b_mint, sol_amount is platform fee
                // No minimum on fees - minimum only applies to transaction values
                require!(has_nft_b, EscrowError::InvalidSwapParameters);
                require!(sol_amount.is_some(), EscrowError::InvalidSwapParameters);
                
                let fee = sol_amount.unwrap();
                require!(fee > 0, EscrowError::InvalidAmount);
                require!(fee <= MAX_SOL_AMOUNT, EscrowError::SolAmountTooHigh);
            },
            SwapType::NftForNftPlusSol => {
                // For NFT<>NFT+SOL: must have nft_b_mint and sol_amount
                require!(has_nft_b, EscrowError::InvalidSwapParameters);
                require!(sol_amount.is_some(), EscrowError::InvalidSwapParameters);
                
                let amount = sol_amount.unwrap();
                require!(amount >= MIN_SOL_AMOUNT, EscrowError::SolAmountTooLow);
                require!(amount <= MAX_SOL_AMOUNT, EscrowError::SolAmountTooHigh);
            },
        }

        // Initialize escrow state
        let escrow_state = &mut ctx.accounts.escrow_state;
        escrow_state.escrow_id = escrow_id;
        escrow_state.buyer = ctx.accounts.buyer.key();
        escrow_state.seller = ctx.accounts.seller.key();
        escrow_state.swap_type = swap_type;
        escrow_state.sol_amount = sol_amount.unwrap_or(0);
        escrow_state.nft_a_mint = nft_a_mint;
        // Store NFT B mint - Option<Pubkey> can accept Pubkey::default()
        escrow_state.nft_b_mint = if has_nft_b { Some(nft_b_mint) } else { None };
        escrow_state.platform_fee_bps = platform_fee_bps;
        escrow_state.fee_payer = fee_payer;
        escrow_state.buyer_sol_deposited = false;
        escrow_state.seller_sol_deposited = false;
        escrow_state.buyer_nft_deposited = false;
        escrow_state.seller_nft_deposited = false;
        escrow_state.status = EscrowStatus::Pending;
        escrow_state.expiry_timestamp = expiry_timestamp;
        escrow_state.bump = ctx.bumps.escrow_state;
        escrow_state.admin = ctx.accounts.admin.key();

        // NFT A escrow account is created automatically via init_if_needed constraint
        // NFT B escrow account needs to be created manually for NFT<>NFT swaps
        if has_nft_b {
            // Validate NFT B mint matches the provided account
            require!(
                ctx.accounts.nft_b_mint.key() == nft_b_mint,
                EscrowError::InvalidNftMint
            );

            // Check if NFT B escrow account exists, create if not
            // Account doesn't exist if it has no lamports (rent-exempt accounts have lamports)
            let escrow_nft_b_account_info = ctx.accounts.escrow_nft_b_account.to_account_info();
            let account_exists = escrow_nft_b_account_info.lamports() > 0 
                && escrow_nft_b_account_info.data_len() > 0;
            
            if !account_exists {
                // Account doesn't exist, create it via CPI to Associated Token Program
                let escrow_id_bytes = escrow_id.to_le_bytes();
                let escrow_signer_seeds: &[&[&[u8]]] = &[&[
                    b"escrow",
                    escrow_id_bytes.as_ref(),
                    &[ctx.bumps.escrow_state],
                ]];

                let create_ata_ctx = CpiContext::new_with_signer(
                    ctx.accounts.associated_token_program.to_account_info(),
                    anchor_spl::associated_token::Create {
                        payer: ctx.accounts.admin.to_account_info(),
                        associated_token: escrow_nft_b_account_info,
                        authority: ctx.accounts.escrow_state.to_account_info(),
                        mint: ctx.accounts.nft_b_mint.to_account_info(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                        token_program: ctx.accounts.token_program.to_account_info(),
                    },
                    escrow_signer_seeds,
                );
                anchor_spl::associated_token::create(create_ata_ctx)?;

                msg!("NFT B escrow account created: {}", ctx.accounts.escrow_nft_b_account.key());
            } else {
                msg!("NFT B escrow account already exists: {}", ctx.accounts.escrow_nft_b_account.key());
            }
        }

        msg!("Escrow agreement initialized: ID {}", escrow_id);
        msg!("Swap type: {:?}", swap_type);
        msg!("SOL amount: {}", sol_amount.unwrap_or(0));
        msg!("NFT A escrow account: {}", ctx.accounts.escrow_nft_account.key());

        Ok(())
    }

    /// Buyer deposits SOL into the SOL vault PDA
    /// For NftForSol and NftForNftPlusSol swap types
    pub fn deposit_sol(ctx: Context<DepositSol>) -> Result<()> {
        // Check expiry - prevent deposits to expired agreements
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= ctx.accounts.escrow_state.expiry_timestamp,
            EscrowError::Expired
        );

        // Validate escrow status - only allow deposits when active
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            EscrowError::InvalidStatus
        );

        // Verify not already deposited
        require!(
            !ctx.accounts.escrow_state.buyer_sol_deposited,
            EscrowError::AlreadyDeposited
        );

        // Validate swap type requires SOL
        require!(
            ctx.accounts.escrow_state.swap_type == SwapType::NftForSol || 
            ctx.accounts.escrow_state.swap_type == SwapType::NftForNftPlusSol ||
            ctx.accounts.escrow_state.swap_type == SwapType::NftForNftWithFee,
            EscrowError::InvalidSwapType
        );

        // Verify buyer authority
        require!(
            ctx.accounts.buyer.key() == ctx.accounts.escrow_state.buyer,
            EscrowError::Unauthorized
        );

        // Extract sol_amount before transfer
        let sol_amount = ctx.accounts.escrow_state.sol_amount;

        // Transfer SOL from buyer to SOL vault PDA (NOT the state PDA)
        // This mirrors the USDC design where tokens go to a separate account
        // System Program can transfer to zero-data PDAs (unlike data-bearing PDAs)
        let transfer_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.sol_vault.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(transfer_ctx, sol_amount)?;

        // Mark SOL as deposited
        ctx.accounts.escrow_state.buyer_sol_deposited = true;

        msg!("SOL deposited to vault: {} lamports", sol_amount);

        Ok(())
    }

    /// Seller deposits SOL fee into the escrow (for NFT_FOR_NFT_WITH_FEE)
    /// Both parties contribute 50% of the platform fee
    pub fn deposit_seller_sol_fee(ctx: Context<DepositSellerSolFee>) -> Result<()> {
        // Check expiry - prevent deposits to expired agreements
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= ctx.accounts.escrow_state.expiry_timestamp,
            EscrowError::Expired
        );

        // Validate escrow status - only allow deposits when active
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            EscrowError::InvalidStatus
        );

        // Verify not already deposited
        require!(
            !ctx.accounts.escrow_state.seller_sol_deposited,
            EscrowError::AlreadyDeposited
        );

        // Validate swap type is NFT_FOR_NFT_WITH_FEE (only type where seller pays SOL)
        require!(
            ctx.accounts.escrow_state.swap_type == SwapType::NftForNftWithFee,
            EscrowError::InvalidSwapType
        );

        // Verify seller authority
        require!(
            ctx.accounts.seller.key() == ctx.accounts.escrow_state.seller,
            EscrowError::Unauthorized
        );

        // Extract sol_amount before transfer
        let sol_amount = ctx.accounts.escrow_state.sol_amount;

        // Transfer SOL from seller to SOL vault PDA
        let transfer_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.seller.to_account_info(),
                to: ctx.accounts.sol_vault.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(transfer_ctx, sol_amount)?;

        // Mark seller SOL as deposited
        ctx.accounts.escrow_state.seller_sol_deposited = true;

        msg!("Seller SOL fee deposited to vault: {} lamports", sol_amount);

        Ok(())
    }

    /// Seller deposits NFT A into the escrow
    /// Used for all swap types (seller always deposits NFT A)
    pub fn deposit_seller_nft(ctx: Context<DepositSellerNft>) -> Result<()> {
        let escrow_state = &mut ctx.accounts.escrow_state;

        // Check expiry - prevent deposits to expired agreements
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= escrow_state.expiry_timestamp,
            EscrowError::Expired
        );

        // Validate escrow status - only allow deposits when active
        require!(
            escrow_state.status == EscrowStatus::Pending,
            EscrowError::InvalidStatus
        );

        // Verify not already deposited
        require!(
            !escrow_state.seller_nft_deposited,
            EscrowError::AlreadyDeposited
        );

        // Verify seller authority
        require!(
            ctx.accounts.seller.key() == escrow_state.seller,
            EscrowError::Unauthorized
        );

        // Verify NFT mint matches
        require!(
            ctx.accounts.nft_mint.key() == escrow_state.nft_a_mint,
            EscrowError::InvalidNftMint
        );

        // Transfer NFT from seller to escrow using token program
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seller_nft_account.to_account_info(),
                to: ctx.accounts.escrow_nft_account.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, 1)?; // NFTs have amount = 1

        // Mark seller NFT as deposited
        escrow_state.seller_nft_deposited = true;

        msg!("Seller NFT deposited: {}", escrow_state.nft_a_mint);

        Ok(())
    }

    /// Buyer deposits NFT B into the escrow (for NFT<>NFT swaps)
    /// Used for NftForNftWithFee and NftForNftPlusSol swap types
    pub fn deposit_buyer_nft(ctx: Context<DepositBuyerNft>) -> Result<()> {
        // Check expiry - prevent deposits to expired agreements
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= ctx.accounts.escrow_state.expiry_timestamp,
            EscrowError::Expired
        );

        // Validate escrow status - only allow deposits when active
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            EscrowError::InvalidStatus
        );

        // Verify not already deposited
        require!(
            !ctx.accounts.escrow_state.buyer_nft_deposited,
            EscrowError::AlreadyDeposited
        );

        // Validate swap type requires buyer NFT
        require!(
            ctx.accounts.escrow_state.swap_type == SwapType::NftForNftWithFee || 
            ctx.accounts.escrow_state.swap_type == SwapType::NftForNftPlusSol,
            EscrowError::InvalidSwapType
        );

        // Verify buyer authority
        require!(
            ctx.accounts.buyer.key() == ctx.accounts.escrow_state.buyer,
            EscrowError::Unauthorized
        );

        // Verify NFT mint matches expected NFT B
        let expected_nft_b = ctx.accounts.escrow_state.nft_b_mint
            .ok_or(EscrowError::InvalidNftMint)?;
        require!(
            ctx.accounts.nft_mint.key() == expected_nft_b,
            EscrowError::InvalidNftMint
        );

        // Transfer NFT from buyer to escrow using token program
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buyer_nft_account.to_account_info(),
                to: ctx.accounts.escrow_nft_b_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, 1)?; // NFTs have amount = 1

        // Mark buyer NFT as deposited
        ctx.accounts.escrow_state.buyer_nft_deposited = true;

        msg!("Buyer NFT deposited: {}", expected_nft_b);

        Ok(())
    }

    /// Settle the escrow and distribute assets
    /// Handles NFT<>SOL, NFT<>NFT with fee, and NFT<>NFT+SOL swap types
    /// Permissionless: Anyone can trigger settlement once both deposits are confirmed
    /// 
    /// **Remaining Accounts** (for NFT<>NFT swaps):
    /// - [0] NFT B mint (buyer's NFT)
    /// - [1] Escrow NFT B account (buyer's NFT held in escrow) [writable]
    /// - [2] Seller NFT B account (destination for NFT B) [writable]
    /// - [3] Token program (for NFT B transfer)
    pub fn settle<'info>(ctx: Context<'_, '_, '_, 'info, Settle<'info>>) -> Result<()> {
        // Validate escrow status
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            EscrowError::InvalidStatus
        );

        // NOTE: Settlement is permissionless - anyone can trigger it
        // The contract validates that all deposits are present before settling
        // This allows automated backend settlement or user-triggered settlement

        // Prepare PDA signer seeds
        let escrow_id_bytes = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
        let bump = ctx.accounts.escrow_state.bump;
        let seeds = &[
            b"escrow",
            escrow_id_bytes.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        // Handle settlement based on swap type
        match ctx.accounts.escrow_state.swap_type {
            SwapType::NftForSol => {
                // Validate deposits
                require!(
                    ctx.accounts.escrow_state.buyer_sol_deposited && ctx.accounts.escrow_state.seller_nft_deposited,
                    EscrowError::DepositNotComplete
                );

                // Calculate platform fee
                let (platform_fee, seller_receives) = calculate_platform_fee(
                    ctx.accounts.escrow_state.sol_amount,
                    ctx.accounts.escrow_state.platform_fee_bps,
                )?;

                msg!("Settlement transfers:");
                msg!("  Platform fee: {} lamports", platform_fee);
                msg!("  Seller receives: {} lamports", seller_receives);

                // Transfer SOL using Anchor v0.32 helper methods
                // NOTE: Cannot use SystemProgram::transfer() from PDA with data
                // Research: https://osec.io/blog/2025-05-14-king-of-the-sol/
                // Research: https://www.anchor-lang.com/docs/updates/release-notes/0-32-0
                
                // CRITICAL: Verify no executable accounts (programs cannot send/receive lamports)
                require!(
                    !ctx.accounts.escrow_state.to_account_info().executable 
                    && !ctx.accounts.platform_fee_collector.to_account_info().executable 
                    && !ctx.accounts.seller.to_account_info().executable,
                    EscrowError::ExecutableAccountNotAllowed
                );
                
                // Get rent for validation
                let rent = Rent::get()?;
                
                msg!("Balances before settlement:");
                msg!("  SOL Vault: {} lamports", ctx.accounts.sol_vault.to_account_info().lamports());
                msg!("  Escrow State: {} lamports", ctx.accounts.escrow_state.to_account_info().lamports());
                msg!("  Fee collector: {} lamports", ctx.accounts.platform_fee_collector.to_account_info().lamports());
                msg!("  Seller: {} lamports", ctx.accounts.seller.to_account_info().lamports());
                
                // CRITICAL: Validate rent exemption BEFORE any transfers
                // Research: Most common cause of "sum of account balances do not match" error
                // All accounts must remain rent-exempt after transfers
                
                // Check fee collector will be rent-exempt after receiving fee
                let fee_collector_balance_after = ctx.accounts.platform_fee_collector.to_account_info().lamports()
                    .checked_add(platform_fee)
                    .ok_or(EscrowError::CalculationOverflow)?;
                    
                require!(
                    rent.is_exempt(fee_collector_balance_after, ctx.accounts.platform_fee_collector.to_account_info().data_len()),
                    EscrowError::InsufficientFeeCollectorRent
                );
                
                // Check seller will be rent-exempt after receiving payment
                let seller_balance_after = ctx.accounts.seller.to_account_info().lamports()
                    .checked_add(seller_receives)
                    .ok_or(EscrowError::CalculationOverflow)?;
                    
                require!(
                    rent.is_exempt(seller_balance_after, ctx.accounts.seller.to_account_info().data_len()),
                    EscrowError::InsufficientSellerRent
                );
                
                // Check sol_vault will have sufficient funds for transfers
                // NOTE: sol_vault is a zero-data PDA, so 0 lamports remaining is fine (no rent requirement)
                // We just need to verify we have enough to make the transfers
                let vault_balance = ctx.accounts.sol_vault.to_account_info().lamports();
                let total_to_transfer = platform_fee
                    .checked_add(seller_receives)
                    .ok_or(EscrowError::CalculationOverflow)?;
                    
                require!(
                    vault_balance >= total_to_transfer,
                    EscrowError::InsufficientFunds
                );
                
                msg!("Rent exemption validation passed - all accounts will remain rent-exempt");
                
                // SOL VAULT ARCHITECTURE: Transfer FROM vault PDA (zero-data, like USDC account)
                // This mirrors the USDC design where tokens are held in a separate account
                // System Program CPI works for zero-data PDAs (unlike data-bearing PDAs)
                
                // Vault PDA signer seeds (different from state PDA!)
                let escrow_id_bytes = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
                let vault_signer_seeds: &[&[&[u8]]] = &[&[
                    b"sol_vault",
                    escrow_id_bytes.as_ref(),
                    &[ctx.bumps.sol_vault],  // Use vault's bump, not state's bump!
                ]];
                
                msg!("Transferring {} lamports from SOL vault to recipients", ctx.accounts.escrow_state.sol_amount);
                msg!("  Platform fee: {} lamports", platform_fee);
                msg!("  Seller receives: {} lamports", seller_receives);
                
                // Transfer 1: vault -> fee_collector using System Program CPI
                let fee_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.sol_vault.to_account_info(),
                        to: ctx.accounts.platform_fee_collector.to_account_info(),
                    },
                    vault_signer_seeds,
                );
                anchor_lang::system_program::transfer(fee_transfer_ctx, platform_fee)?;
                msg!("Platform fee transferred: {} lamports", platform_fee);
                
                // Transfer 2: vault -> seller using System Program CPI
                let seller_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.sol_vault.to_account_info(),
                        to: ctx.accounts.seller.to_account_info(),
                    },
                    vault_signer_seeds,
                );
                anchor_lang::system_program::transfer(seller_transfer_ctx, seller_receives)?;
                msg!("Seller payment transferred: {} lamports", seller_receives);
                
                msg!("SOL settlement complete - all transfers successful");

                // Transfer NFT A from escrow to buyer
                let nft_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_nft_account.to_account_info(),
                        to: ctx.accounts.buyer_nft_account.to_account_info(),
                        authority: ctx.accounts.escrow_state.to_account_info(),
                    },
                    signer,
                );
                token::transfer(nft_transfer_ctx, 1)?;

                msg!("NFT<>SOL settled: Platform fee {} SOL, Seller received {} SOL", platform_fee, seller_receives);
            },
            SwapType::NftForNftWithFee => {
                // Validate deposits - both parties must deposit SOL fee + their NFTs
                require!(
                    ctx.accounts.escrow_state.buyer_sol_deposited && 
                    ctx.accounts.escrow_state.seller_sol_deposited &&  // NEW: Require seller SOL deposit
                    ctx.accounts.escrow_state.buyer_nft_deposited && 
                    ctx.accounts.escrow_state.seller_nft_deposited,
                    EscrowError::DepositNotComplete
                );

                // Transfer platform fee (SOL) to fee collector
                // CRITICAL: sol_amount stores buyer's portion (half), but BOTH parties deposited
                // Total fee = sol_amount * 2 (e.g., 0.005 * 2 = 0.01 SOL)
                let platform_fee = ctx.accounts.escrow_state.sol_amount
                    .checked_mul(2)
                    .ok_or(EscrowError::CalculationOverflow)?;
                
                // Validate sol_vault has sufficient funds
                let vault_balance = ctx.accounts.sol_vault.to_account_info().lamports();
                require!(
                    vault_balance >= platform_fee,
                    EscrowError::InsufficientFunds
                );
                
                // Vault PDA signer seeds (transfer FROM sol_vault, not escrow_state!)
                let escrow_id_bytes = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
                let vault_signer_seeds: &[&[&[u8]]] = &[&[
                    b"sol_vault",
                    escrow_id_bytes.as_ref(),
                    &[ctx.bumps.sol_vault],  // Use vault's bump!
                ]];
                
                // Transfer platform fee from sol_vault to fee_collector using System Program CPI
                let fee_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.sol_vault.to_account_info(),
                        to: ctx.accounts.platform_fee_collector.to_account_info(),
                    },
                    vault_signer_seeds,
                );
                anchor_lang::system_program::transfer(fee_transfer_ctx, platform_fee)?;
                msg!("Platform fee transferred from sol_vault: {} lamports", platform_fee);

                // Transfer NFT A from escrow to buyer
                let nft_a_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_nft_account.to_account_info(),
                        to: ctx.accounts.buyer_nft_account.to_account_info(),
                        authority: ctx.accounts.escrow_state.to_account_info(),
                    },
                    signer,
                );
                token::transfer(nft_a_transfer_ctx, 1)?;

                // Transfer NFT B from escrow to seller
                // Get escrow NFT B account and seller NFT B account from remaining accounts
                // Backend provides: [0]=mint, [1]=escrow_account, [2]=seller_account, [3]=token_program
                require!(
                    ctx.remaining_accounts.len() >= 4,
                    EscrowError::InvalidSwapParameters
                );

                let nft_b_transfer_accounts = Transfer {
                    from: ctx.remaining_accounts[1].to_account_info(),  // Escrow NFT B account
                    to: ctx.remaining_accounts[2].to_account_info(),    // Seller NFT B account
                    authority: ctx.accounts.escrow_state.to_account_info(),
                };
                let nft_b_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    nft_b_transfer_accounts,
                    signer,
                );
                token::transfer(nft_b_transfer_ctx, 1)?;

                msg!("NFT<>NFT settled: Platform fee {} SOL", platform_fee);
            },
            SwapType::NftForNftPlusSol => {
                // Validate deposits
                require!(
                    ctx.accounts.escrow_state.buyer_sol_deposited && 
                    ctx.accounts.escrow_state.buyer_nft_deposited && 
                    ctx.accounts.escrow_state.seller_nft_deposited,
                    EscrowError::DepositNotComplete
                );

                // Calculate platform fee and seller's SOL amount
                let (platform_fee, seller_sol_amount) = calculate_platform_fee(
                    ctx.accounts.escrow_state.sol_amount,
                    ctx.accounts.escrow_state.platform_fee_bps,
                )?;

                // FIXED: Use sol_vault PDA (same as NftForNftWithFee)
                // SOL is stored in sol_vault, not in escrow_state account
                let vault_signer_seeds: &[&[&[u8]]] = &[&[
                    b"sol_vault",
                    escrow_id_bytes.as_ref(),
                    &[ctx.bumps.sol_vault],  // Use vault's bump!
                ]];
                
                // Transfer platform fee from sol_vault to fee_collector using System Program CPI
                let fee_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.sol_vault.to_account_info(),
                        to: ctx.accounts.platform_fee_collector.to_account_info(),
                    },
                    vault_signer_seeds,
                );
                anchor_lang::system_program::transfer(fee_transfer_ctx, platform_fee)?;
                msg!("Platform fee transferred from sol_vault: {} lamports", platform_fee);

                // Transfer seller's SOL from sol_vault to seller using System Program CPI
                let seller_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.sol_vault.to_account_info(),
                        to: ctx.accounts.seller.to_account_info(),
                    },
                    vault_signer_seeds,
                );
                anchor_lang::system_program::transfer(seller_transfer_ctx, seller_sol_amount)?;
                msg!("Seller SOL transferred from sol_vault: {} lamports", seller_sol_amount);

                // Transfer NFT A from escrow to buyer
                let nft_a_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_nft_account.to_account_info(),
                        to: ctx.accounts.buyer_nft_account.to_account_info(),
                        authority: ctx.accounts.escrow_state.to_account_info(),
                    },
                    signer,
                );
                token::transfer(nft_a_transfer_ctx, 1)?;

                // Transfer NFT B from escrow to seller
                // Get escrow NFT B account and seller NFT B account from remaining accounts
                // Backend provides: [0]=mint, [1]=escrow_account, [2]=seller_account, [3]=token_program
                require!(
                    ctx.remaining_accounts.len() >= 4,
                    EscrowError::InvalidSwapParameters
                );

                let nft_b_transfer_accounts = Transfer {
                    from: ctx.remaining_accounts[1].to_account_info(),  // Escrow NFT B account
                    to: ctx.remaining_accounts[2].to_account_info(),    // Seller NFT B account
                    authority: ctx.accounts.escrow_state.to_account_info(),
                };
                let nft_b_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    nft_b_transfer_accounts,
                    signer,
                );
                token::transfer(nft_b_transfer_ctx, 1)?;

                msg!("NFT<>NFT+SOL settled: Platform fee {} SOL, Seller received {} SOL", platform_fee, seller_sol_amount);
            },
        }

        // NOTE: Escrow status is NOT updated here (permissionless settlement)
        // Backend monitoring service will detect the settlement and update status
        // Account will be closed separately via close_escrow() instruction after status update
        msg!("Escrow settlement completed successfully");

        Ok(())
    }

    /// Cancel expired escrow and return assets to original owners
    /// 
    /// **Remaining Accounts** (for NFT<>NFT swaps):
    /// - [0] Escrow NFT B account (buyer's NFT held in escrow) [writable]
    /// - [1] Buyer NFT B account (refund destination for NFT B) [writable]
    pub fn cancel_if_expired<'info>(ctx: Context<'_, '_, '_, 'info, CancelIfExpired<'info>>) -> Result<()> {
        // Validate escrow status
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            EscrowError::InvalidStatus
        );

        // Check if escrow has expired
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp > ctx.accounts.escrow_state.expiry_timestamp,
            EscrowError::NotExpired
        );

        // Prepare PDA signer seeds
        let escrow_id_bytes = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
        let bump = ctx.accounts.escrow_state.bump;
        let seeds = &[
            b"escrow",
            escrow_id_bytes.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        // Return SOL to buyer if deposited (from sol_vault PDA, not escrow_state)
        if ctx.accounts.escrow_state.buyer_sol_deposited {
            let sol_amount = ctx.accounts.escrow_state.sol_amount;
            
            // Vault PDA signer seeds (different from state PDA!)
            let escrow_id_bytes_vault = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
            let vault_signer_seeds: &[&[&[u8]]] = &[&[
                b"sol_vault",
                escrow_id_bytes_vault.as_ref(),
                &[ctx.bumps.sol_vault],
            ]];
            
            let sol_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.sol_vault.to_account_info(),
                    to: ctx.accounts.buyer.to_account_info(),
                },
                vault_signer_seeds,
            );
            anchor_lang::system_program::transfer(sol_transfer_ctx, sol_amount)?;
            msg!("Returned {} lamports to buyer", sol_amount);
        }

        // Return SOL to seller if deposited (for NFT_FOR_NFT_WITH_FEE - seller's half of fee)
        if ctx.accounts.escrow_state.seller_sol_deposited {
            let sol_amount = ctx.accounts.escrow_state.sol_amount;
            
            // Vault PDA signer seeds
            let escrow_id_bytes_vault = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
            let vault_signer_seeds: &[&[&[u8]]] = &[&[
                b"sol_vault",
                escrow_id_bytes_vault.as_ref(),
                &[ctx.bumps.sol_vault],
            ]];
            
            let sol_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.sol_vault.to_account_info(),
                    to: ctx.accounts.seller.to_account_info(),
                },
                vault_signer_seeds,
            );
            anchor_lang::system_program::transfer(sol_transfer_ctx, sol_amount)?;
            msg!("Returned {} lamports to seller", sol_amount);
        }

        // Return NFT A to seller if deposited
        if ctx.accounts.escrow_state.seller_nft_deposited {
            let nft_mint = ctx.accounts.escrow_state.nft_a_mint;
            let nft_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_nft_account.to_account_info(),
                    to: ctx.accounts.seller_nft_account.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer,
            );
            token::transfer(nft_transfer_ctx, 1)?;
            msg!("Returned NFT A to seller: {}", nft_mint);
        }

        // Return NFT B to buyer if deposited (for NFT<>NFT swaps)
        if ctx.accounts.escrow_state.buyer_nft_deposited {
            // Get escrow NFT B account and buyer NFT B account from remaining accounts
            if ctx.remaining_accounts.len() >= 2 {
                let nft_b_transfer_accounts = Transfer {
                    from: ctx.remaining_accounts[0].to_account_info(),
                    to: ctx.remaining_accounts[1].to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                };
                let nft_b_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    nft_b_transfer_accounts,
                    signer,
                );
                token::transfer(nft_b_transfer_ctx, 1)?;
                
                if let Some(nft_b_mint) = ctx.accounts.escrow_state.nft_b_mint {
                    msg!("Returned NFT B to buyer: {}", nft_b_mint);
                }
            }
        }

        // Mark escrow as cancelled
        let escrow_id = ctx.accounts.escrow_state.escrow_id;
        ctx.accounts.escrow_state.status = EscrowStatus::Cancelled;

        msg!("Escrow cancelled due to expiry: ID {}", escrow_id);
        
        // NOTE: Account will be closed separately via close_escrow() instruction
        // This allows backend to read the cancelled status before closure

        Ok(())
    }

    /// Admin emergency cancel with full refunds
    pub fn admin_cancel<'info>(ctx: Context<'_, '_, '_, 'info, AdminCancel<'info>>) -> Result<()> {
        // Validate escrow status - allow cancel for Pending (includes escrows with deposits)
        // Cannot cancel if already Completed or Cancelled
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Pending,
            EscrowError::InvalidStatus
        );

        // Validate admin authorization
        require!(
            ctx.accounts.admin.key() == ctx.accounts.escrow_state.admin,
            EscrowError::Unauthorized
        );

        // Prepare PDA signer seeds
        let escrow_id_bytes = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
        let bump = ctx.accounts.escrow_state.bump;
        let seeds = &[
            b"escrow",
            escrow_id_bytes.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        // Return SOL to buyer if deposited (from sol_vault PDA, not escrow_state)
        if ctx.accounts.escrow_state.buyer_sol_deposited {
            let sol_amount = ctx.accounts.escrow_state.sol_amount;
            
            // Vault PDA signer seeds (different from state PDA!)
            let escrow_id_bytes_vault = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
            let vault_signer_seeds: &[&[&[u8]]] = &[&[
                b"sol_vault",
                escrow_id_bytes_vault.as_ref(),
                &[ctx.bumps.sol_vault],
            ]];
            
            let sol_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.sol_vault.to_account_info(),
                    to: ctx.accounts.buyer.to_account_info(),
                },
                vault_signer_seeds,
            );
            anchor_lang::system_program::transfer(sol_transfer_ctx, sol_amount)?;
            msg!("Admin refund: Returned {} lamports to buyer", sol_amount);
        }

        // Return SOL to seller if deposited (for NFT_FOR_NFT_WITH_FEE - seller's half of fee)
        if ctx.accounts.escrow_state.seller_sol_deposited {
            let sol_amount = ctx.accounts.escrow_state.sol_amount;
            
            // Vault PDA signer seeds
            let escrow_id_bytes_vault = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
            let vault_signer_seeds: &[&[&[u8]]] = &[&[
                b"sol_vault",
                escrow_id_bytes_vault.as_ref(),
                &[ctx.bumps.sol_vault],
            ]];
            
            let sol_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.sol_vault.to_account_info(),
                    to: ctx.accounts.seller.to_account_info(),
                },
                vault_signer_seeds,
            );
            anchor_lang::system_program::transfer(sol_transfer_ctx, sol_amount)?;
            msg!("Admin refund: Returned {} lamports to seller", sol_amount);
        }

        // Return NFT A to seller if deposited
        if ctx.accounts.escrow_state.seller_nft_deposited {
            let nft_mint = ctx.accounts.escrow_state.nft_a_mint;
            let nft_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_nft_account.to_account_info(),
                    to: ctx.accounts.seller_nft_account.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer,
            );
            token::transfer(nft_transfer_ctx, 1)?;
            msg!("Admin refund: Returned NFT A to seller: {}", nft_mint);
        }

        // Return NFT B to buyer if deposited (for NFT<>NFT swaps)
        if ctx.accounts.escrow_state.buyer_nft_deposited {
            // Get escrow NFT B account and buyer NFT B account from remaining accounts
            if ctx.remaining_accounts.len() >= 2 {
                let nft_b_transfer_accounts = Transfer {
                    from: ctx.remaining_accounts[0].to_account_info(),
                    to: ctx.remaining_accounts[1].to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                };
                let nft_b_transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    nft_b_transfer_accounts,
                    signer,
                );
                token::transfer(nft_b_transfer_ctx, 1)?;
                
                if let Some(nft_b_mint) = ctx.accounts.escrow_state.nft_b_mint {
                    msg!("Admin refund: Returned NFT B to buyer: {}", nft_b_mint);
                }
            }
        }

        // Mark escrow as cancelled
        let escrow_id = ctx.accounts.escrow_state.escrow_id;
        ctx.accounts.escrow_state.status = EscrowStatus::Cancelled;

        msg!("Admin cancelled escrow: ID {}", escrow_id);
        
        // NOTE: Account will be closed separately via close_escrow() instruction
        // This allows backend to read the cancelled status before closure

        Ok(())
    }

    /// Close escrow account and recover rent-exempt reserve
    /// Can only be called after escrow reaches terminal state (Completed or Cancelled)
    /// Returns rent to admin wallet (who paid for account creation)
    pub fn close_escrow(ctx: Context<CloseEscrow>) -> Result<()> {
        // Validate escrow is in terminal state
        require!(
            ctx.accounts.escrow_state.status == EscrowStatus::Completed ||
            ctx.accounts.escrow_state.status == EscrowStatus::Cancelled,
            EscrowError::InvalidStatus
        );

        // Validate admin authorization (only admin who created it can close)
        require!(
            ctx.accounts.admin.key() == ctx.accounts.escrow_state.admin,
            EscrowError::Unauthorized
        );

        let escrow_id = ctx.accounts.escrow_state.escrow_id;
        let escrow_lamports = ctx.accounts.escrow_state.to_account_info().lamports();
        
        msg!("Closing escrow {} and recovering {} lamports rent", escrow_id, escrow_lamports);
        
        // Close account and return rent to admin
        **ctx.accounts.escrow_state.to_account_info().lamports.borrow_mut() = 0;
        **ctx.accounts.admin.to_account_info().lamports.borrow_mut() += escrow_lamports;
        
        msg!("Rent recovered: {} lamports returned to admin", escrow_lamports);

        Ok(())
    }

    /// Admin force close with asset recovery
    /// 
    /// **EMERGENCY ONLY**: Closes legacy/stuck escrow accounts without deserializing state.
    /// Returns trapped assets (NFTs, SOL) to original depositors before closing.
    /// 
    /// **Safety**: Admin-only, requires careful off-chain preparation to determine recipients.
    /// 
    /// **Usage**:
    /// - Used for accounts from old program versions (can't deserialize)
    /// - Used for permanently stuck accounts (abandoned, non-terminal state)
    /// - Recovers rent-exempt reserves back to admin
    /// 
    /// **Remaining Accounts** (in order):
    /// - [0..n] Escrow-owned token accounts (NFTs) [writable]
    /// - [n+1..n+1+n] Recipient token accounts for NFTs [writable]
    /// - [n+2..n+2+n] Recipient wallets (for creating ATAs) [writable]
    /// - [n+3] SOL vault PDA (optional) [writable]
    /// - [n+4] SOL recipient wallet (optional) [writable]
    pub fn admin_force_close_with_recovery<'info>(
        ctx: Context<'_, '_, '_, 'info, AdminForceClose<'info>>,
        escrow_id: u64, // Must be provided by caller (from off-chain tracing)
    ) -> Result<()> {
        msg!("FORCE CLOSE: Starting emergency closure with asset recovery");
        msg!("Escrow ID: {}", escrow_id);
        
        // Verify the provided escrow_id matches the escrow PDA
        let (expected_pda, bump) = Pubkey::find_program_address(
            &[b"escrow", escrow_id.to_le_bytes().as_ref()],
            ctx.program_id,
        );
        
        require!(
            expected_pda == ctx.accounts.escrow_state.key(),
            EscrowError::InvalidEscrowAccount
        );
        
        msg!("Verified escrow PDA matches ID {}", escrow_id);
        
        // Get escrow PDA signer seeds
        let escrow_pda = ctx.accounts.escrow_state.key();
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"escrow",
            escrow_id_bytes.as_ref(),
            &[bump],
        ]];
        
        // Process remaining_accounts for asset recovery
        let remaining = &ctx.remaining_accounts;
        let mut account_idx = 0;
        
        // Count token accounts (all consecutive accounts that are token accounts)
        let mut nft_count = 0;
        while account_idx < remaining.len() {
            let account = &remaining[account_idx];
            
            // Check if this is a token account owned by escrow
            if account.owner == &spl_token::ID {
                // Try to deserialize as token account
                match spl_token::state::Account::unpack(&account.try_borrow_data()?) {
                    Ok(token_account) => {
                        if token_account.owner == escrow_pda {
                            nft_count += 1;
                            account_idx += 1;
                            continue;
                        }
                    }
                    Err(_) => {}
                }
            }
            
            // Not a token account, stop counting
            break;
        }
        
        msg!("Found {} NFT token accounts to recover", nft_count);
        
        // Transfer and close each NFT token account
        for i in 0..nft_count {
            let escrow_token_account = &remaining[i];
            let recipient_token_account = &remaining[nft_count + i];
            let _recipient_wallet = &remaining[nft_count * 2 + i]; // Kept for future use (ATA creation)
            
            msg!("Processing NFT {}/{}", i + 1, nft_count);
            msg!("  From: {}", escrow_token_account.key());
            msg!("  To: {}", recipient_token_account.key());
            
            // Deserialize token account to get amount
            let token_data = spl_token::state::Account::unpack(&escrow_token_account.try_borrow_data()?)?;
            
            if token_data.amount == 0 {
                msg!("  Skipping empty token account");
                
                // Just close empty account
                anchor_spl::token::close_account(
                    CpiContext::new(
                        ctx.accounts.token_program.to_account_info(),
                        anchor_spl::token::CloseAccount {
                            account: escrow_token_account.to_account_info(),
                            destination: ctx.accounts.admin.to_account_info(),
                            authority: ctx.accounts.escrow_state.to_account_info(),
                        },
                    ).with_signer(signer_seeds)
                )?;
                
                continue;
            }
            
            msg!("  Transferring {} tokens", token_data.amount);
            
            // Transfer NFT to recipient
            anchor_spl::token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: escrow_token_account.to_account_info(),
                        to: recipient_token_account.to_account_info(),
                        authority: ctx.accounts.escrow_state.to_account_info(),
                    },
                ).with_signer(signer_seeds),
                token_data.amount,
            )?;
            
            // Close token account, return rent to admin
            anchor_spl::token::close_account(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::CloseAccount {
                        account: escrow_token_account.to_account_info(),
                        destination: ctx.accounts.admin.to_account_info(),
                        authority: ctx.accounts.escrow_state.to_account_info(),
                    },
                ).with_signer(signer_seeds)
            )?;
            
            msg!("  ✅ NFT recovered and token account closed");
        }
        
        // Check for SOL vault and SOL recipient
        let sol_vault_idx = nft_count * 3;
        let sol_recipient_idx = sol_vault_idx + 1;
        
        if sol_recipient_idx < remaining.len() {
            let sol_vault = &remaining[sol_vault_idx];
            let sol_recipient = &remaining[sol_recipient_idx];
            
            msg!("Processing SOL vault");
            msg!("  Vault: {}", sol_vault.key());
            msg!("  Recipient: {}", sol_recipient.key());
            
            let vault_balance = sol_vault.lamports();
            let rent = Rent::get()?;
            let rent_exempt_min = rent.minimum_balance(0);
            
            if vault_balance > rent_exempt_min {
                let refund_amount = vault_balance - rent_exempt_min;
                msg!("  Refunding {} lamports SOL", refund_amount);
                
                // Transfer SOL to recipient
                **sol_vault.try_borrow_mut_lamports()? -= refund_amount;
                **sol_recipient.try_borrow_mut_lamports()? += refund_amount;
                
                msg!("  ✅ SOL refunded");
            } else {
                msg!("  No excess SOL to refund (only rent-exempt reserve)");
            }
            
            // Close sol_vault, return rent to admin
            let vault_remaining = sol_vault.lamports();
            msg!("  Closing vault, recovering {} lamports rent", vault_remaining);
            
            **sol_vault.try_borrow_mut_lamports()? = 0;
            **ctx.accounts.admin.try_borrow_mut_lamports()? += vault_remaining;
            
            msg!("  ✅ SOL vault closed");
        } else {
            msg!("No SOL vault to process");
        }
        
        // Close escrow PDA, return rent to admin
        let escrow_lamports = ctx.accounts.escrow_state.to_account_info().lamports();
        msg!("Closing escrow PDA, recovering {} lamports rent", escrow_lamports);
        
        **ctx.accounts.escrow_state.to_account_info().try_borrow_mut_lamports()? = 0;
        **ctx.accounts.admin.try_borrow_mut_lamports()? += escrow_lamports;
        
        msg!("✅ FORCE CLOSE COMPLETE: All assets recovered and rent returned");
        
        Ok(())
    }

    // ============================================================================
    // ATOMIC SWAP INSTRUCTIONS (New Architecture - Single Transaction)
    // ============================================================================

    /// Initialize the Treasury PDA
    /// 
    /// Creates a Treasury account that tracks:
    /// - Total fees collected
    /// - Total swaps executed
    /// - Program pause state
    /// - Authorized withdrawal wallet
    ///
    /// # Security
    /// * Only platform authority can initialize
    /// * Locks withdrawals to specified wallet only
    /// * Prevents fund redirection even if authority is compromised
    /// * Can only be changed via program upgrade
    pub fn initialize_treasury(
        ctx: Context<InitializeTreasury>,
        authorized_withdrawal_wallet: Pubkey,
    ) -> Result<()> {
        instructions::initialize::initialize_treasury_handler(ctx, authorized_withdrawal_wallet)
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
    
    /// Close Treasury PDA and refund rent to authority
    ///
    /// Closes an existing Treasury PDA account and refunds rent to the authority.
    /// Typically used for:
    /// - Migrating from old structure to new structure
    /// - Shutting down platform operations
    /// - Consolidating treasury accounts
    ///
    /// # Arguments
    /// * `ctx` - Context containing authority and treasury
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    ///
    /// # Security
    /// * Only platform authority can close treasury
    /// * Authority receives refunded rent lamports
    ///
    /// # Errors
    /// * `Unauthorized` - Caller is not platform authority
    pub fn close_treasury(ctx: Context<CloseTreasury>) -> Result<()> {
        instructions::close::close_treasury_handler(ctx)
    }

    // ============================================================================
    // CNFT OFFER ESCROW INSTRUCTIONS
    // ============================================================================

    /// Create a new cNFT offer with SOL escrow
    ///
    /// Bidder deposits SOL to a PDA to make an offer on a cNFT. The SOL is held
    /// in escrow until the offer is accepted, cancelled, rejected, or expired.
    ///
    /// # Arguments
    /// * `ctx` - Context with bidder, owner, and escrow accounts
    /// * `offer_id` - Unique 32-byte offer identifier (matches database)
    /// * `asset_id` - Target cNFT asset ID (32 bytes, DAS format)
    /// * `merkle_tree` - Merkle tree address containing the cNFT
    /// * `leaf_index` - Leaf index in the merkle tree
    /// * `offer_amount` - SOL amount for the offer (lamports)
    /// * `platform_fee` - Platform fee (lamports)
    /// * `expiry_timestamp` - Unix timestamp when offer expires
    pub fn create_offer_escrow(
        ctx: Context<CreateOfferEscrow>,
        offer_id: [u8; 32],
        asset_id: [u8; 32],
        merkle_tree: Pubkey,
        leaf_index: u32,
        offer_amount: u64,
        platform_fee: u64,
        expiry_timestamp: i64,
    ) -> Result<()> {
        offer_escrow_create(
            ctx, offer_id, asset_id, merkle_tree, leaf_index,
            offer_amount, platform_fee, expiry_timestamp
        )
    }

    /// Accept a cNFT offer
    ///
    /// cNFT owner accepts the offer. SOL is released from escrow to the seller
    /// and platform fee is sent to fee collector. cNFT transfer happens via
    /// DirectBubblegumService in the backend (separate instruction).
    ///
    /// # Arguments
    /// * `ctx` - Context with owner, bidder, and escrow accounts
    /// * `offer_id` - The offer identifier to accept
    pub fn accept_offer_escrow(
        ctx: Context<AcceptOfferEscrow>,
        offer_id: [u8; 32],
    ) -> Result<()> {
        offer_escrow_accept(ctx, offer_id)
    }

    /// Cancel a cNFT offer
    ///
    /// Bidder cancels their offer. SOL is refunded from escrow back to the bidder.
    ///
    /// # Arguments
    /// * `ctx` - Context with bidder and escrow accounts
    /// * `offer_id` - The offer identifier to cancel
    pub fn cancel_offer_escrow(
        ctx: Context<CancelOfferEscrow>,
        offer_id: [u8; 32],
    ) -> Result<()> {
        offer_escrow_cancel(ctx, offer_id)
    }

    /// Reject a cNFT offer
    ///
    /// cNFT owner rejects the offer. SOL is refunded from escrow to the bidder.
    ///
    /// # Arguments
    /// * `ctx` - Context with owner, bidder, and escrow accounts
    /// * `offer_id` - The offer identifier to reject
    pub fn reject_offer_escrow(
        ctx: Context<RejectOfferEscrow>,
        offer_id: [u8; 32],
    ) -> Result<()> {
        offer_escrow_reject(ctx, offer_id)
    }

    /// Expire a cNFT offer (permissionless after expiry)
    ///
    /// Anyone can trigger expiry once the offer has passed its expiry timestamp.
    /// SOL is refunded from escrow to the bidder.
    ///
    /// # Arguments
    /// * `ctx` - Context with authority, bidder, and escrow accounts
    /// * `offer_id` - The offer identifier to expire
    pub fn expire_offer_escrow(
        ctx: Context<ExpireOfferEscrow>,
        offer_id: [u8; 32],
    ) -> Result<()> {
        offer_escrow_expire(ctx, offer_id)
    }

    /// Close an offer escrow account
    ///
    /// After an offer is resolved (accepted, cancelled, rejected, or expired),
    /// the bidder can close the escrow account to reclaim rent.
    ///
    /// # Arguments
    /// * `ctx` - Context with bidder and escrow accounts
    /// * `offer_id` - The offer identifier to close
    pub fn close_offer_escrow(
        _ctx: Context<CloseOfferEscrow>,
        _offer_id: [u8; 32],
    ) -> Result<()> {
        // The close = bidder constraint handles the account closure
        msg!("Closing offer escrow account, rent returned to bidder");
        Ok(())
    }
}

// Account Structures

// Malformed USDC-gated struct removed (Task 10) - had functions inside struct definition

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Pending,
    Completed,
    Cancelled,
}

// Errors

#[error_code]
pub enum EscrowError {
    #[msg("Invalid amount provided")]
    InvalidAmount,
    
    #[msg("Invalid expiry timestamp")]
    InvalidExpiry,
    
    #[msg("Invalid escrow status for this operation")]
    InvalidStatus,
    
    #[msg("Assets already deposited")]
    AlreadyDeposited,
    
    #[msg("Unauthorized to perform this action")]
    Unauthorized,
    
    #[msg("Only authorized admin can initialize escrows")]
    UnauthorizedAdmin,
    
    #[msg("Invalid NFT mint address")]
    InvalidNftMint,
    
    #[msg("Deposits not complete")]
    DepositNotComplete,
    
    #[msg("Escrow has expired")]
    Expired,
    
    #[msg("Escrow has not expired yet")]
    NotExpired,
    
    #[msg("Invalid fee basis points (must be <= 10000)")]
    InvalidFeeBps,
    
    #[msg("Calculation overflow")]
    CalculationOverflow,
    
    #[msg("Invalid swap type for this operation")]
    InvalidSwapType,
    
    #[msg("SOL amount below minimum: 0.01 SOL (BETA limit)")]
    SolAmountTooLow,
    
    #[msg("SOL amount exceeds maximum: 15 SOL (BETA limit)")]
    SolAmountTooHigh,
    
    #[msg("Insufficient funds in escrow account after accounting for rent exemption")]
    InsufficientFunds,
    
    #[msg("Invalid parameter combination for swap type")]
    InvalidSwapParameters,
    
    #[msg("Fee collector account would not be rent-exempt after receiving fee")]
    InsufficientFeeCollectorRent,
    
    #[msg("Seller account would not be rent-exempt after receiving payment")]
    InsufficientSellerRent,
    
    #[msg("Escrow account would not be rent-exempt after transfers")]
    InsufficientEscrowRent,
    
    #[msg("Invalid escrow account provided (PDA mismatch)")]
    InvalidEscrowAccount,
    
    #[msg("Executable accounts (programs) cannot send or receive lamports")]
    ExecutableAccountNotAllowed,
    
    #[msg("Amount below minimum: $1.00 (BETA limit)")]
    AmountTooLow,

    #[msg("Amount exceeds maximum: $3,000.00 (BETA limit)")]
    AmountTooHigh,

    // Offer Escrow errors
    #[msg("Offer amount below minimum (0.01 SOL)")]
    OfferAmountTooLow,

    #[msg("Offer amount exceeds maximum (10,000 SOL)")]
    OfferAmountTooHigh,

    #[msg("Offer duration too short (minimum 1 hour)")]
    OfferDurationTooShort,

    #[msg("Offer duration too long (maximum 30 days)")]
    OfferDurationTooLong,

    #[msg("Bidder cannot be the same as owner")]
    BidderCannotBeOwner,

    #[msg("Invalid bidder address")]
    InvalidBidder,

    #[msg("Invalid offer status for this operation")]
    InvalidOfferStatus,

    #[msg("Offer has expired")]
    OfferExpired,

    #[msg("Offer has not expired yet")]
    OfferNotExpired,

    #[msg("Offer is still active - cannot close")]
    OfferStillActive,
}

// ============================================================================
// SOL-Based Escrow Implementation
// ============================================================================

/// BETA Launch Limits for SOL: 0.01 SOL minimum, 15 SOL maximum
/// SOL has 9 decimals: 1 SOL = 1_000_000_000 lamports
const MIN_SOL_AMOUNT: u64 = 10_000_000;      // 0.01 SOL (~$2 at $200/SOL)
const MAX_SOL_AMOUNT: u64 = 15_000_000_000;  // 15 SOL (~$3000 at $200/SOL)

/// Swap type determines how the escrow settlement works
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum SwapType {
    NftForSol,        // NFT <> SOL: Direct exchange
    NftForNftWithFee, // NFT <> NFT: Buyer pays separate SOL fee
    NftForNftPlusSol, // NFT <> NFT+SOL: Fee extracted from SOL amount
}

/// Who pays the platform fee
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum FeePayer {
    Buyer,  // Default: Buyer pays the fee
    Seller, // Alternative: Seller pays the fee
}

/// Escrow state account for SOL-based swaps
#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub escrow_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    
    /// Swap type determines which fields are used
    pub swap_type: SwapType,
    
    /// SOL amount (if applicable to swap type)
    pub sol_amount: u64,
    
    /// NFT mints (one or two depending on swap type)
    pub nft_a_mint: Pubkey,        // Seller's NFT (always present)
    pub nft_b_mint: Option<Pubkey>, // Buyer's NFT (only for NFT<>NFT swaps)
    
    /// Platform fee configuration
    pub platform_fee_bps: u16,
    pub fee_payer: FeePayer,
    
    /// Deposit tracking
    pub buyer_sol_deposited: bool,
    pub seller_sol_deposited: bool,  // NEW: For NFT_FOR_NFT_WITH_FEE (both parties pay fee)
    pub buyer_nft_deposited: bool,
    pub seller_nft_deposited: bool,
    
    /// Status and metadata
    pub status: EscrowStatus,
    pub expiry_timestamp: i64,
    pub bump: u8,
    pub admin: Pubkey,
}

/// Buyer deposits SOL into the escrow PDA
/// For NftForSol and NftForNftPlusSol swap types
pub fn deposit_sol(ctx: Context<DepositSol>) -> Result<()> {
    // Validate escrow status
    require!(
        ctx.accounts.escrow_state.status == EscrowStatus::Pending,
        EscrowError::InvalidStatus
    );

    // Verify not already deposited
    require!(
        !ctx.accounts.escrow_state.buyer_sol_deposited,
        EscrowError::AlreadyDeposited
    );

    // Validate swap type requires SOL
    require!(
        ctx.accounts.escrow_state.swap_type == SwapType::NftForSol || 
        ctx.accounts.escrow_state.swap_type == SwapType::NftForNftPlusSol ||
        ctx.accounts.escrow_state.swap_type == SwapType::NftForNftWithFee,
        EscrowError::InvalidSwapType
    );

    // Verify buyer authority
    require!(
        ctx.accounts.buyer.key() == ctx.accounts.escrow_state.buyer,
        EscrowError::Unauthorized
    );

    // Extract sol_amount before transfer
    let sol_amount = ctx.accounts.escrow_state.sol_amount;

    // Transfer SOL from buyer to SOL vault PDA (NOT the state PDA)
    // This mirrors the USDC design where tokens go to a separate account
    // System Program can transfer to zero-data PDAs (unlike data-bearing PDAs)
    let transfer_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.sol_vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(transfer_ctx, sol_amount)?;

    // Mark SOL as deposited
    ctx.accounts.escrow_state.buyer_sol_deposited = true;

    msg!("SOL deposited to vault: {} lamports", sol_amount);

    Ok(())
}

/// Seller deposits NFT A into the escrow
/// Used for all swap types (seller always deposits NFT A)
pub fn deposit_seller_nft(ctx: Context<DepositSellerNft>) -> Result<()> {
    let escrow_state = &mut ctx.accounts.escrow_state;

    // Validate escrow status
    require!(
        escrow_state.status == EscrowStatus::Pending,
        EscrowError::InvalidStatus
    );

    // Verify not already deposited
    require!(
        !escrow_state.seller_nft_deposited,
        EscrowError::AlreadyDeposited
    );

    // Verify seller authority
    require!(
        ctx.accounts.seller.key() == escrow_state.seller,
        EscrowError::Unauthorized
    );

    // Verify NFT mint matches
    require!(
        ctx.accounts.nft_mint.key() == escrow_state.nft_a_mint,
        EscrowError::InvalidNftMint
    );

    // Transfer NFT from seller to escrow using token program
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.seller_nft_account.to_account_info(),
            to: ctx.accounts.escrow_nft_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, 1)?; // NFTs have amount = 1

    // Mark seller NFT as deposited
    escrow_state.seller_nft_deposited = true;

    msg!("Seller NFT deposited: {}", escrow_state.nft_a_mint);

    Ok(())
}

/// Buyer deposits NFT B into the escrow (for NFT<>NFT swaps)
/// Used for NftForNftWithFee and NftForNftPlusSol swap types
pub fn deposit_buyer_nft(ctx: Context<DepositBuyerNft>) -> Result<()> {
    // Validate escrow status
    require!(
        ctx.accounts.escrow_state.status == EscrowStatus::Pending,
        EscrowError::InvalidStatus
    );

    // Verify not already deposited
    require!(
        !ctx.accounts.escrow_state.buyer_nft_deposited,
        EscrowError::AlreadyDeposited
    );

    // Validate swap type requires buyer NFT
    require!(
        ctx.accounts.escrow_state.swap_type == SwapType::NftForNftWithFee || 
        ctx.accounts.escrow_state.swap_type == SwapType::NftForNftPlusSol,
        EscrowError::InvalidSwapType
    );

    // Verify buyer authority
    require!(
        ctx.accounts.buyer.key() == ctx.accounts.escrow_state.buyer,
        EscrowError::Unauthorized
    );

    // Verify NFT mint matches expected NFT B
    let expected_nft_b = ctx.accounts.escrow_state.nft_b_mint
        .ok_or(EscrowError::InvalidNftMint)?;
    require!(
        ctx.accounts.nft_mint.key() == expected_nft_b,
        EscrowError::InvalidNftMint
    );

    // Verify escrow NFT B account mint matches
    require!(
        ctx.accounts.escrow_nft_b_account.mint == expected_nft_b,
        EscrowError::InvalidNftMint
    );

    // Transfer NFT from buyer to escrow using token program
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.buyer_nft_account.to_account_info(),
            to: ctx.accounts.escrow_nft_b_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, 1)?; // NFTs have amount = 1

    // Mark buyer NFT as deposited
    ctx.accounts.escrow_state.buyer_nft_deposited = true;

    msg!("Buyer NFT deposited: {}", expected_nft_b);

    Ok(())
}

/// Settle the escrow and distribute assets
/// Handles both NFT<>SOL and NFT<>NFT with SOL fee swap types
pub fn settle<'info>(ctx: Context<'_, '_, '_, 'info, Settle<'info>>) -> Result<()> {
    // Validate escrow status
    require!(
        ctx.accounts.escrow_state.status == EscrowStatus::Pending,
        EscrowError::InvalidStatus
    );

    // Verify caller is either buyer or seller
    let caller = ctx.accounts.caller.key();
    require!(
        caller == ctx.accounts.escrow_state.buyer || caller == ctx.accounts.escrow_state.seller,
        EscrowError::Unauthorized
    );

    // Prepare PDA signer seeds
    let escrow_id_bytes = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
    let bump = ctx.accounts.escrow_state.bump;
    let seeds = &[
        b"escrow",
        escrow_id_bytes.as_ref(),
        &[bump],
    ];
    let signer = &[&seeds[..]];

    // Handle settlement based on swap type
    match ctx.accounts.escrow_state.swap_type {
        SwapType::NftForSol => {
            // Validate deposits
            require!(
                ctx.accounts.escrow_state.buyer_sol_deposited && ctx.accounts.escrow_state.seller_nft_deposited,
                EscrowError::DepositNotComplete
            );

            // Transfer SOL using direct lamport manipulation
            // NOTE: Cannot use SystemProgram::transfer() from PDA with data
            // Research: https://osec.io/blog/2025-05-14-king-of-the-sol/
            
            // Calculate fee from deposited SOL amount
            let sol_amount = ctx.accounts.escrow_state.sol_amount;
            let (platform_fee, seller_receives) = calculate_platform_fee(
                sol_amount,
                ctx.accounts.escrow_state.platform_fee_bps,
            )?;
            
            // Get account references ONCE - multiple to_account_info() calls break RefCell
            let escrow_account = ctx.accounts.escrow_state.to_account_info();
            let fee_collector_account = ctx.accounts.platform_fee_collector.to_account_info();
            let seller_account = ctx.accounts.seller.to_account_info();
            
            // Verify escrow has enough balance (including rent-exempt minimum)
            let rent = Rent::get()?;
            let min_rent_exempt = rent.minimum_balance(escrow_account.data_len());
            let current_balance = escrow_account.lamports();
            let transferable = current_balance.checked_sub(min_rent_exempt)
                .ok_or(EscrowError::InsufficientFunds)?;
            
            require!(
                transferable >= sol_amount,
                EscrowError::InsufficientFunds
            );
            
            // Perform ATOMIC lamport transfers (all borrows held simultaneously)
            let mut escrow_lamports = escrow_account.try_borrow_mut_lamports()?;
            let mut fee_collector_lamports = fee_collector_account.try_borrow_mut_lamports()?;
            let mut seller_lamports = seller_account.try_borrow_mut_lamports()?;

            // Transfer 1: escrow -> fee_collector
            **escrow_lamports = escrow_lamports.checked_sub(platform_fee)
                .ok_or(EscrowError::InsufficientFunds)?;
            **fee_collector_lamports = fee_collector_lamports.checked_add(platform_fee)
                .ok_or(EscrowError::CalculationOverflow)?;
            
            // Transfer 2: escrow -> seller
            **escrow_lamports = escrow_lamports.checked_sub(seller_receives)
                .ok_or(EscrowError::InsufficientFunds)?;
            **seller_lamports = seller_lamports.checked_add(seller_receives)
                .ok_or(EscrowError::CalculationOverflow)?;
            
            // All borrows released together here

            // Transfer NFT A from escrow to buyer
            let nft_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_nft_account.to_account_info(),
                    to: ctx.accounts.buyer_nft_account.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer,
            );
            token::transfer(nft_transfer_ctx, 1)?;

            msg!("NFT<>SOL settled: Platform fee {} SOL, Seller received {} SOL", platform_fee, seller_receives);
        },
        SwapType::NftForNftWithFee => {
            // Validate deposits
            require!(
                ctx.accounts.escrow_state.buyer_sol_deposited && 
                ctx.accounts.escrow_state.buyer_nft_deposited && 
                ctx.accounts.escrow_state.seller_nft_deposited,
                EscrowError::DepositNotComplete
            );

            // Transfer platform fee (SOL) using direct lamport manipulation
            // NOTE: Cannot use SystemProgram::transfer() from PDA with data
            
            // Full deposited SOL amount goes to platform as fee
            let platform_fee = ctx.accounts.escrow_state.sol_amount;
            
            // Get account references ONCE
            let escrow_account = ctx.accounts.escrow_state.to_account_info();
            let fee_collector_account = ctx.accounts.platform_fee_collector.to_account_info();
            
            // Verify escrow has enough balance (including rent-exempt minimum)
            let rent = Rent::get()?;
            let min_rent_exempt = rent.minimum_balance(escrow_account.data_len());
            let current_balance = escrow_account.lamports();
            let transferable = current_balance.checked_sub(min_rent_exempt)
                .ok_or(EscrowError::InsufficientFunds)?;
            
            require!(
                transferable >= platform_fee,
                EscrowError::InsufficientFunds
            );
            
            // Perform ATOMIC lamport transfer
            let mut escrow_lamports = escrow_account.try_borrow_mut_lamports()?;
            let mut fee_collector_lamports = fee_collector_account.try_borrow_mut_lamports()?;

            **escrow_lamports = escrow_lamports.checked_sub(platform_fee)
                .ok_or(EscrowError::InsufficientFunds)?;
            **fee_collector_lamports = fee_collector_lamports.checked_add(platform_fee)
                .ok_or(EscrowError::CalculationOverflow)?;
            
            // Borrows released together here

            // Transfer NFT A from escrow to buyer
            let nft_a_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_nft_account.to_account_info(),
                    to: ctx.accounts.buyer_nft_account.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer,
            );
            token::transfer(nft_a_transfer_ctx, 1)?;

            // Transfer NFT B from escrow to seller
            // Get escrow NFT B account and seller NFT B account from remaining accounts
            // Backend provides: [0]=mint, [1]=escrow_account, [2]=seller_account, [3]=token_program
            require!(
                ctx.remaining_accounts.len() >= 4,
                EscrowError::InvalidSwapParameters
            );

            let nft_b_transfer_accounts = Transfer {
                from: ctx.remaining_accounts[1].to_account_info(),  // Escrow NFT B account
                to: ctx.remaining_accounts[2].to_account_info(),    // Seller NFT B account
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let nft_b_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                nft_b_transfer_accounts,
                signer,
            );
            token::transfer(nft_b_transfer_ctx, 1)?;

            msg!("NFT<>NFT settled: Platform fee {} SOL", platform_fee);
        },
        SwapType::NftForNftPlusSol => {
            // Validate deposits
            require!(
                ctx.accounts.escrow_state.buyer_sol_deposited && 
                ctx.accounts.escrow_state.buyer_nft_deposited && 
                ctx.accounts.escrow_state.seller_nft_deposited,
                EscrowError::DepositNotComplete
            );

            // Transfer SOL using direct lamport manipulation
            // NOTE: Cannot use SystemProgram::transfer() from PDA with data
            
            // Calculate fee from deposited SOL amount
            let sol_amount = ctx.accounts.escrow_state.sol_amount;
            let (platform_fee, seller_sol_amount) = calculate_platform_fee(
                sol_amount,
                ctx.accounts.escrow_state.platform_fee_bps,
            )?;
            
            // Get account references ONCE
            let escrow_account = ctx.accounts.escrow_state.to_account_info();
            let fee_collector_account = ctx.accounts.platform_fee_collector.to_account_info();
            let seller_account = ctx.accounts.seller.to_account_info();
            
            // Verify escrow has enough balance (including rent-exempt minimum)
            let rent = Rent::get()?;
            let min_rent_exempt = rent.minimum_balance(escrow_account.data_len());
            let current_balance = escrow_account.lamports();
            let transferable = current_balance.checked_sub(min_rent_exempt)
                .ok_or(EscrowError::InsufficientFunds)?;
            
            require!(
                transferable >= sol_amount,
                EscrowError::InsufficientFunds
            );
            
            // Perform ATOMIC lamport transfers (all borrows held simultaneously)
            let mut escrow_lamports = escrow_account.try_borrow_mut_lamports()?;
            let mut fee_collector_lamports = fee_collector_account.try_borrow_mut_lamports()?;
            let mut seller_lamports = seller_account.try_borrow_mut_lamports()?;

            // Transfer 1: escrow -> fee_collector
            **escrow_lamports = escrow_lamports.checked_sub(platform_fee)
                .ok_or(EscrowError::InsufficientFunds)?;
            **fee_collector_lamports = fee_collector_lamports.checked_add(platform_fee)
                .ok_or(EscrowError::CalculationOverflow)?;
            
            // Transfer 2: escrow -> seller
            **escrow_lamports = escrow_lamports.checked_sub(seller_sol_amount)
                .ok_or(EscrowError::InsufficientFunds)?;
            **seller_lamports = seller_lamports.checked_add(seller_sol_amount)
                .ok_or(EscrowError::CalculationOverflow)?;
            
            // All borrows released together here

            // Transfer NFT A from escrow to buyer
            let nft_a_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_nft_account.to_account_info(),
                    to: ctx.accounts.buyer_nft_account.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer,
            );
            token::transfer(nft_a_transfer_ctx, 1)?;

            // Transfer NFT B from escrow to seller
            // Get escrow NFT B account and seller NFT B account from remaining accounts
            // Backend provides: [0]=mint, [1]=escrow_account, [2]=seller_account, [3]=token_program
            require!(
                ctx.remaining_accounts.len() >= 4,
                EscrowError::InvalidSwapParameters
            );

            let nft_b_transfer_accounts = Transfer {
                from: ctx.remaining_accounts[1].to_account_info(),  // Escrow NFT B account
                to: ctx.remaining_accounts[2].to_account_info(),    // Seller NFT B account
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let nft_b_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                nft_b_transfer_accounts,
                signer,
            );
            token::transfer(nft_b_transfer_ctx, 1)?;

            msg!("NFT<>NFT+SOL settled: Platform fee {} SOL, Seller received {} SOL", platform_fee, seller_sol_amount);
        },
    }

    // Mark escrow as completed
    ctx.accounts.escrow_state.status = EscrowStatus::Completed;

    msg!("Escrow settlement completed successfully");

    Ok(())
}

/// Cancel expired escrow and return assets to original owners
pub fn cancel_if_expired<'info>(ctx: Context<'_, '_, '_, 'info, CancelIfExpired<'info>>) -> Result<()> {
    // Validate escrow status
    require!(
        ctx.accounts.escrow_state.status == EscrowStatus::Pending,
        EscrowError::InvalidStatus
    );

    // Check if escrow has expired
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp > ctx.accounts.escrow_state.expiry_timestamp,
        EscrowError::NotExpired
    );

    // Prepare PDA signer seeds
    let escrow_id_bytes = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
    let bump = ctx.accounts.escrow_state.bump;
    let seeds = &[
        b"escrow",
        escrow_id_bytes.as_ref(),
        &[bump],
    ];
    let signer = &[&seeds[..]];

    // Return SOL to buyer if deposited (from vault PDA, not state PDA)
    if ctx.accounts.escrow_state.buyer_sol_deposited {
        let sol_amount = ctx.accounts.escrow_state.sol_amount;
        
        // Vault PDA signer seeds (different from state PDA!)
        let escrow_id_bytes_vault = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
        let vault_signer_seeds: &[&[&[u8]]] = &[&[
            b"sol_vault",
            escrow_id_bytes_vault.as_ref(),
            &[ctx.bumps.sol_vault],
        ]];
        
        let sol_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.sol_vault.to_account_info(),
                to: ctx.accounts.buyer.to_account_info(),
            },
            vault_signer_seeds,
        );
        anchor_lang::system_program::transfer(sol_transfer_ctx, sol_amount)?;
        msg!("Returned {} lamports to buyer from SOL vault", sol_amount);
    }

    // Return NFT A to seller if deposited
    if ctx.accounts.escrow_state.seller_nft_deposited {
        let nft_mint = ctx.accounts.escrow_state.nft_a_mint;
        let nft_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_nft_account.to_account_info(),
                to: ctx.accounts.seller_nft_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            },
            signer,
        );
        token::transfer(nft_transfer_ctx, 1)?;
        msg!("Returned NFT A to seller: {}", nft_mint);
    }

    // Return NFT B to buyer if deposited (for NFT<>NFT swaps)
    if ctx.accounts.escrow_state.buyer_nft_deposited {
        // Get escrow NFT B account and buyer NFT B account from remaining accounts
        if ctx.remaining_accounts.len() >= 2 {
            let nft_b_transfer_accounts = Transfer {
                from: ctx.remaining_accounts[0].to_account_info(),
                to: ctx.remaining_accounts[1].to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let nft_b_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                nft_b_transfer_accounts,
                signer,
            );
            token::transfer(nft_b_transfer_ctx, 1)?;
            
            if let Some(nft_b_mint) = ctx.accounts.escrow_state.nft_b_mint {
                msg!("Returned NFT B to buyer: {}", nft_b_mint);
            }
        }
    }
    
    Ok(())
}

/// Admin emergency cancel with full refunds
/// 
/// **Remaining Accounts** (for NFT<>NFT swaps):
/// - [0] Escrow NFT B account (buyer's NFT held in escrow) [writable]
/// - [1] Buyer NFT B account (refund destination for NFT B) [writable]
pub fn admin_cancel<'info>(ctx: Context<'_, '_, '_, 'info, AdminCancel<'info>>) -> Result<()> {
    // Validate escrow status
    require!(
        ctx.accounts.escrow_state.status == EscrowStatus::Pending,
        EscrowError::InvalidStatus
    );

    // Validate admin authorization
    require!(
        ctx.accounts.admin.key() == ctx.accounts.escrow_state.admin,
        EscrowError::Unauthorized
    );

    // Prepare PDA signer seeds
    let escrow_id_bytes = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
    let bump = ctx.accounts.escrow_state.bump;
    let seeds = &[
        b"escrow",
        escrow_id_bytes.as_ref(),
        &[bump],
    ];
    let signer = &[&seeds[..]];

    // Return SOL to buyer if deposited (from vault PDA, not state PDA)
    if ctx.accounts.escrow_state.buyer_sol_deposited {
        let sol_amount = ctx.accounts.escrow_state.sol_amount;
        
        // Vault PDA signer seeds (different from state PDA!)
        let escrow_id_bytes_vault = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
        let vault_signer_seeds: &[&[&[u8]]] = &[&[
            b"sol_vault",
            escrow_id_bytes_vault.as_ref(),
            &[ctx.bumps.sol_vault],
        ]];
        
        let sol_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.sol_vault.to_account_info(),
                to: ctx.accounts.buyer.to_account_info(),
            },
            vault_signer_seeds,
        );
        anchor_lang::system_program::transfer(sol_transfer_ctx, sol_amount)?;
        msg!("Admin refund: Returned {} lamports to buyer from SOL vault", sol_amount);
    }

    // Return NFT A to seller if deposited
    if ctx.accounts.escrow_state.seller_nft_deposited {
        let nft_mint = ctx.accounts.escrow_state.nft_a_mint;
        let nft_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_nft_account.to_account_info(),
                to: ctx.accounts.seller_nft_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            },
            signer,
        );
        token::transfer(nft_transfer_ctx, 1)?;
        msg!("Admin refund: Returned NFT A to seller: {}", nft_mint);
    }

    // Return NFT B to buyer if deposited (for NFT<>NFT swaps)
    if ctx.accounts.escrow_state.buyer_nft_deposited {
        // Get escrow NFT B account and buyer NFT B account from remaining accounts
        if ctx.remaining_accounts.len() >= 2 {
            let nft_b_transfer_accounts = Transfer {
                from: ctx.remaining_accounts[0].to_account_info(),
                to: ctx.remaining_accounts[1].to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let nft_b_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                nft_b_transfer_accounts,
                signer,
            );
            token::transfer(nft_b_transfer_ctx, 1)?;
            
            if let Some(nft_b_mint) = ctx.accounts.escrow_state.nft_b_mint {
                msg!("Admin refund: Returned NFT B to buyer: {}", nft_b_mint);
            }
        }
    }

    // Mark escrow as cancelled
    let escrow_id = ctx.accounts.escrow_state.escrow_id;
    ctx.accounts.escrow_state.status = EscrowStatus::Cancelled;

    msg!("Admin cancelled escrow: ID {}", escrow_id);

    Ok(())
}

// ============================================================================
// Account Structures - NFT <> SOL Swap (Subtask 1.5)
// ============================================================================

#[derive(Accounts)]
#[instruction(escrow_id: u64)]
pub struct InitAgreement<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    /// CHECK: Buyer address verified in state
    pub buyer: UncheckedAccount<'info>,
    
    /// CHECK: Seller address verified in state
    pub seller: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"escrow", escrow_id.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    /// SOL vault PDA - separate zero-data account for holding SOL lamports
    /// This mirrors the USDC design where tokens are held in a separate account
    /// System Program can transfer from zero-data PDAs (unlike data-bearing PDAs)
    /// Uses UncheckedAccount to handle both new and existing PDAs (reused after settlement)
    /// CHECK: Zero-data PDA validated via seeds, initialized during first deposit if needed
    #[account(
        seeds = [b"sol_vault", escrow_id.to_le_bytes().as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,
    
    /// NFT A mint (seller's NFT) - used to create escrow NFT A account
    pub nft_a_mint: Account<'info, Mint>,
    
    /// Escrow NFT A account (seller's NFT held in escrow)
    /// Created by admin during agreement initialization to avoid charging users for infrastructure
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = nft_a_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    /// NFT B mint (buyer's NFT) - only needed for NFT<>NFT swaps
    /// CHECK: Optional - only validated/used for NFT<>NFT swap types
    pub nft_b_mint: UncheckedAccount<'info>,
    
    /// Escrow NFT B account (buyer's NFT held in escrow)
    /// Created by admin during agreement initialization for NFT<>NFT swaps
    /// CHECK: Optional - only created/used for NFT<>NFT swap types
    #[account(mut)]
    pub escrow_nft_b_account: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    /// SOL vault PDA - receives SOL deposit from buyer
    /// CHECK: Validated via seeds, buyer transfers SOL here
    #[account(
        mut,
        seeds = [b"sol_vault", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositSellerSolFee<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    /// SOL vault PDA - receives SOL fee from seller
    /// CHECK: Validated via seeds, seller transfers SOL here
    #[account(
        mut,
        seeds = [b"sol_vault", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositSellerNft<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == seller.key()
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    /// Escrow NFT A account (seller's NFT held in escrow)
    /// Created by admin during agreement initialization - account must already exist
    #[account(
        mut,
        constraint = escrow_nft_account.mint == escrow_state.nft_a_mint,
        constraint = escrow_nft_account.owner == escrow_state.key()
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    pub nft_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// Account Structures - NFT <> NFT Swap (Subtask 1.6)
// ============================================================================

#[derive(Accounts)]
pub struct DepositBuyerNft<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(
        mut,
        constraint = buyer_nft_account.owner == buyer.key()
    )]
    pub buyer_nft_account: Account<'info, TokenAccount>,
    
    /// Escrow NFT B account (buyer's NFT held in escrow)
    /// Created by admin during agreement initialization - account must already exist
    #[account(
        mut,
        constraint = escrow_nft_b_account.owner == escrow_state.key()
    )]
    pub escrow_nft_b_account: Account<'info, TokenAccount>,
    
    pub nft_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    /// SOL vault PDA - holds SOL to be distributed during settlement
    /// CHECK: Validated via seeds, System Program transfers from here
    #[account(
        mut,
        seeds = [b"sol_vault", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,
    
    /// CHECK: Seller receives SOL
    #[account(
        mut,
        constraint = seller.key() == escrow_state.seller
    )]
    pub seller: UncheckedAccount<'info>,
    
    /// CHECK: Platform fee collector address
    #[account(mut)]
    pub platform_fee_collector: UncheckedAccount<'info>,
    
    /// Escrow NFT A account (seller's NFT held in escrow)
    #[account(
        mut,
        constraint = escrow_nft_account.mint == escrow_state.nft_a_mint
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    /// Buyer NFT A account (destination for seller's NFT)
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = nft_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_nft_account: Account<'info, TokenAccount>,
    
    /// CHECK: Buyer receives NFT (mut required for init_if_needed constraint)
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,
    
    /// NFT A mint (seller's NFT being traded)
    pub nft_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelIfExpired<'info> {
    /// Caller who triggers the cancellation (receives rent refund as reward for cleanup)
    #[account(mut)]
    pub caller: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    /// SOL vault PDA - refunds SOL to buyer and seller if deposited
    /// CHECK: Validated via seeds, System Program transfers from here
    #[account(
        mut,
        seeds = [b"sol_vault", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,
    
    /// CHECK: Buyer receives refund if deposited
    #[account(
        mut,
        constraint = buyer.key() == escrow_state.buyer
    )]
    pub buyer: UncheckedAccount<'info>,
    
    /// CHECK: Seller receives refund if deposited (for NFT_FOR_NFT_WITH_FEE)
    #[account(
        mut,
        constraint = seller.key() == escrow_state.seller
    )]
    pub seller: UncheckedAccount<'info>,
    
    /// Seller NFT A account (refund destination for seller's NFT)
    #[account(
        mut,
        constraint = seller_nft_account.owner == escrow_state.seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    /// Escrow NFT A account (seller's NFT held in escrow)
    #[account(
        mut,
        constraint = escrow_nft_account.mint == escrow_state.nft_a_mint
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminCancel<'info> {
    /// Admin who authorized the cancellation
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    /// SOL vault PDA - refunds SOL to buyer and seller if deposited
    /// CHECK: Validated via seeds, System Program transfers from here
    #[account(
        mut,
        seeds = [b"sol_vault", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,
    
    /// CHECK: Buyer receives refund if deposited
    #[account(
        mut,
        constraint = buyer.key() == escrow_state.buyer
    )]
    pub buyer: UncheckedAccount<'info>,
    
    /// CHECK: Seller receives refund if deposited (for NFT_FOR_NFT_WITH_FEE)
    #[account(
        mut,
        constraint = seller.key() == escrow_state.seller
    )]
    pub seller: UncheckedAccount<'info>,
    
    /// Seller NFT A account (refund destination for seller's NFT)
    #[account(
        mut,
        constraint = seller_nft_account.owner == escrow_state.seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    /// Escrow NFT A account (seller's NFT held in escrow)
    #[account(
        mut,
        constraint = escrow_nft_account.mint == escrow_state.nft_a_mint
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Close escrow account and recover rent
/// Only callable after escrow reaches terminal state (Completed or Cancelled)
#[derive(Accounts)]
pub struct CloseEscrow<'info> {
    /// Admin who created the escrow (receives rent refund)
    #[account(mut)]
    pub admin: Signer<'info>,
    
    /// Escrow state account (will be closed)
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
}

/// Admin force close - emergency closure without state deserialization
/// 
/// **IMPORTANT**: This is for recovering rent and assets from legacy/stuck escrows
/// that cannot be closed via normal methods due to:
/// - State deserialization failures (old program versions)
/// - Permanently stuck in non-terminal states
/// 
/// **Remaining Accounts** (provided by off-chain script):
/// - [0..n] Escrow-owned token accounts (NFTs to recover) [writable]
/// - [n+1..2n+1] Recipient token accounts (destination for NFTs) [writable]  
/// - [2n+2..3n+2] Recipient wallets (for ATA rent) [writable]
/// - [3n+3] SOL vault PDA (optional, if exists) [writable]
/// - [3n+4] SOL recipient wallet (optional) [writable]
#[derive(Accounts)]
pub struct AdminForceClose<'info> {
    /// Admin who will receive recovered rent
    /// Must be the global admin (hardcoded check in instruction)
    #[account(mut)]
    pub admin: Signer<'info>,
    
    /// Escrow PDA to force close
    /// CHECK: We intentionally DON'T deserialize this account since that's why we need force close.
    /// The instruction verifies the PDA belongs to our program and admin authorizes the action.
    /// Off-chain script must provide the correct escrow PDA address.
    #[account(mut)]
    pub escrow_state: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    
    // remaining_accounts handled dynamically based on what needs recovery
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Calculate platform fee and recipient amount
/// Returns (platform_fee, recipient_amount)
fn calculate_platform_fee(total_amount: u64, fee_bps: u16) -> Result<(u64, u64)> {
    let platform_fee = (total_amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(EscrowError::CalculationOverflow)?
        .checked_div(10000)
        .ok_or(EscrowError::CalculationOverflow)? as u64;
    
    let recipient_amount = total_amount
        .checked_sub(platform_fee)
        .ok_or(EscrowError::CalculationOverflow)?;
    
    Ok((platform_fee, recipient_amount))
}

