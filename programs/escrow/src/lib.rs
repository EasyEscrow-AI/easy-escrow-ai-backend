use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_spl::associated_token::AssociatedToken;
use solana_security_txt::security_txt;

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
    name: "Easy Escrow",
    project_url: "https://easyescrow.ai",
    contacts: "email:security@easyescrow.ai",
    policy: "https://easyescrow.ai/security-policy",
    preferred_languages: "en",
    auditors: "Pending - Audit scheduled Q1 2026"
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
/// Only these addresses can initialize escrow agreements, ensuring:
/// 1. All escrows are tracked in the database
/// 2. Platform fees are properly controlled
/// 3. No unauthorized escrow creation
///
/// SECURITY: Compile-time checks ensure only ONE admin key is ever included.
/// Attempting to build with multiple features will result in a compilation error.
fn get_authorized_admins() -> Vec<Pubkey> {
    // Use mutually exclusive if-else chain to guarantee only one admin key
    // This is more secure than independent cfg attributes which could allow multiple keys
    
    #[cfg(feature = "mainnet")]
    return vec![pubkey!("HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2")]; // MAINNET
    
    #[cfg(feature = "staging")]
    return vec![pubkey!("498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R")]; // STAGING
    
    #[cfg(feature = "devnet")]
    return vec![pubkey!("7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u")]; // DEVNET
    
    #[cfg(feature = "localnet")]
    return vec![pubkey!("7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u")]; // LOCALNET (uses devnet admin)
    
    // This should never be reached due to default feature in Cargo.toml
    // But if it is, fail safely by returning an empty vec (no admins authorized)
    #[cfg(not(any(feature = "mainnet", feature = "staging", feature = "devnet", feature = "localnet")))]
    vec![]
}

/// BETA Launch Limits: $1.00 minimum, $3,000.00 maximum
/// These limits will be reassessed after BETA period
/// USDC has 6 decimals: 1 USDC = 1_000_000 lamports
#[cfg(feature = "usdc")]
const MIN_USDC_AMOUNT: u64 = 1_000_000;      // $1.00
#[cfg(feature = "usdc")]
const MAX_USDC_AMOUNT: u64 = 3_000_000_000;  // $3,000.00

#[program]
pub mod escrow {
    use super::*;

    /// Initialize an escrow agreement
    /// Platform fee is set during initialization and stored in escrow state
    /// Only authorized admins can initialize escrows
    /// FEATURE: usdc - This instruction is only available when the usdc feature is enabled
    #[cfg(feature = "usdc")]
    pub fn init_agreement(
        ctx: Context<InitAgreement>,
        escrow_id: u64,
        usdc_amount: u64,
        expiry_timestamp: i64,
        platform_fee_bps: u16,
    ) -> Result<()> {
        // SECURITY: Only authorized admins can initialize escrows
        // This prevents:
        // 1. Unauthorized escrow creation
        // 2. Bypassing of service tracking
        // 3. Fee manipulation (fee is set here and stored in state)
        let admin_pubkey = ctx.accounts.admin.key();
        let authorized_admins = get_authorized_admins();
        
        require!(
            authorized_admins.contains(&admin_pubkey),
            EscrowError::UnauthorizedAdmin
        );
        
        let escrow = &mut ctx.accounts.escrow_state;
        
        // Validate USDC amount is within BETA launch limits
        require!(usdc_amount >= MIN_USDC_AMOUNT, EscrowError::AmountTooLow);
        require!(usdc_amount <= MAX_USDC_AMOUNT, EscrowError::AmountTooHigh);
        require!(expiry_timestamp > Clock::get()?.unix_timestamp, EscrowError::InvalidExpiry);
        require!(platform_fee_bps <= 10000, EscrowError::InvalidFeeBps);
        
        escrow.escrow_id = escrow_id;
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.seller = ctx.accounts.seller.key();
        escrow.usdc_amount = usdc_amount;
        escrow.nft_mint = ctx.accounts.nft_mint.key();
        escrow.platform_fee_bps = platform_fee_bps; // Store fee in escrow state
        escrow.buyer_usdc_deposited = false;
        escrow.seller_nft_deposited = false;
        escrow.status = EscrowStatus::Pending;
        escrow.expiry_timestamp = expiry_timestamp;
        escrow.bump = ctx.bumps.escrow_state;
        escrow.admin = ctx.accounts.admin.key();
        
        Ok(())
    }

    /// Deposit USDC into escrow
    /// FEATURE: usdc - This instruction is only available when the usdc feature is enabled
    #[cfg(feature = "usdc")]
    pub fn deposit_usdc(ctx: Context<DepositUsdc>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        
        require!(escrow.status == EscrowStatus::Pending, EscrowError::InvalidStatus);
        require!(!escrow.buyer_usdc_deposited, EscrowError::AlreadyDeposited);
        require!(
            ctx.accounts.buyer.key() == escrow.buyer,
            EscrowError::Unauthorized
        );
        
        // Transfer USDC from buyer to escrow PDA
        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer_usdc_account.to_account_info(),
            to: ctx.accounts.escrow_usdc_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, escrow.usdc_amount)?;
        
        escrow.buyer_usdc_deposited = true;
        
        Ok(())
    }

    /// Deposit NFT into escrow (LEGACY - USDC-based)
    /// FEATURE: usdc - This instruction is only available when the usdc feature is enabled
    #[cfg(feature = "usdc")]
    pub fn deposit_nft(ctx: Context<DepositNft>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        
        require!(escrow.status == EscrowStatus::Pending, EscrowError::InvalidStatus);
        require!(!escrow.seller_nft_deposited, EscrowError::AlreadyDeposited);
        require!(
            ctx.accounts.seller.key() == escrow.seller,
            EscrowError::Unauthorized
        );
        require!(
            ctx.accounts.nft_mint.key() == escrow.nft_mint,
            EscrowError::InvalidNftMint
        );
        
        // Transfer NFT from seller to escrow PDA
        let cpi_accounts = Transfer {
            from: ctx.accounts.seller_nft_account.to_account_info(),
            to: ctx.accounts.escrow_nft_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, 1)?; // NFTs have amount of 1
        
        escrow.seller_nft_deposited = true;
        
        Ok(())
    }

    /// Settle the escrow and exchange assets with fee distribution
    /// Uses the platform fee that was set during escrow initialization
    /// FEATURE: usdc - This instruction is only available when the usdc feature is enabled
    #[cfg(feature = "usdc")]
    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_state;
        
        require!(escrow.status == EscrowStatus::Pending, EscrowError::InvalidStatus);
        require!(escrow.buyer_usdc_deposited, EscrowError::DepositNotComplete);
        require!(escrow.seller_nft_deposited, EscrowError::DepositNotComplete);
        require!(
            Clock::get()?.unix_timestamp <= escrow.expiry_timestamp,
            EscrowError::Expired
        );
        
        // Use platform fee from escrow state (set during init by authorized admin)
        // This prevents users from bypassing fees by calling settle directly
        let platform_fee_bps = escrow.platform_fee_bps;
        
        let escrow_id = escrow.escrow_id;
        let bump = escrow.bump;
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let seeds = &[
            b"escrow",
            escrow_id_bytes.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];
        
        // Calculate fee distribution
        let total_amount = escrow.usdc_amount;
        let platform_fee = (total_amount as u128)
            .checked_mul(platform_fee_bps as u128)
            .ok_or(EscrowError::CalculationOverflow)?
            .checked_div(10000)
            .ok_or(EscrowError::CalculationOverflow)? as u64;
        let seller_amount = total_amount
            .checked_sub(platform_fee)
            .ok_or(EscrowError::CalculationOverflow)?;
        
        // Transfer fee to platform fee collector (if fee > 0)
        if platform_fee > 0 {
            let fee_transfer_accounts = Transfer {
                from: ctx.accounts.escrow_usdc_account.to_account_info(),
                to: ctx.accounts.fee_collector_usdc_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let fee_cpi_program = ctx.accounts.token_program.to_account_info();
            let fee_cpi_ctx = CpiContext::new_with_signer(
                fee_cpi_program,
                fee_transfer_accounts,
                signer,
            );
            token::transfer(fee_cpi_ctx, platform_fee)?;
        }
        
        // Transfer remaining USDC to seller
        let usdc_transfer_accounts = Transfer {
            from: ctx.accounts.escrow_usdc_account.to_account_info(),
            to: ctx.accounts.seller_usdc_account.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        };
        let usdc_cpi_program = ctx.accounts.token_program.to_account_info();
        let usdc_cpi_ctx = CpiContext::new_with_signer(
            usdc_cpi_program,
            usdc_transfer_accounts,
            signer,
        );
        token::transfer(usdc_cpi_ctx, seller_amount)?;
        
        // Transfer NFT to buyer
        let nft_transfer_accounts = Transfer {
            from: ctx.accounts.escrow_nft_account.to_account_info(),
            to: ctx.accounts.buyer_nft_account.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        };
        let nft_cpi_program = ctx.accounts.token_program.to_account_info();
        let nft_cpi_ctx = CpiContext::new_with_signer(
            nft_cpi_program,
            nft_transfer_accounts,
            signer,
        );
        token::transfer(nft_cpi_ctx, 1)?;
        
        let escrow_mut = &mut ctx.accounts.escrow_state;
        escrow_mut.status = EscrowStatus::Completed;
        
        Ok(())
    }

    /// Cancel escrow if expired
    /// FEATURE: usdc - This instruction is only available when the usdc feature is enabled
    #[cfg(feature = "usdc")]
    pub fn cancel_if_expired(ctx: Context<CancelIfExpired>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_state;
        
        require!(escrow.status == EscrowStatus::Pending, EscrowError::InvalidStatus);
        require!(
            Clock::get()?.unix_timestamp > escrow.expiry_timestamp,
            EscrowError::NotExpired
        );
        
        let escrow_id = escrow.escrow_id;
        let bump = escrow.bump;
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let seeds = &[
            b"escrow",
            escrow_id_bytes.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];
        
        // Return USDC to buyer if deposited
        if escrow.buyer_usdc_deposited {
            let usdc_transfer_accounts = Transfer {
                from: ctx.accounts.escrow_usdc_account.to_account_info(),
                to: ctx.accounts.buyer_usdc_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let usdc_cpi_program = ctx.accounts.token_program.to_account_info();
            let usdc_cpi_ctx = CpiContext::new_with_signer(
                usdc_cpi_program,
                usdc_transfer_accounts,
                signer,
            );
            token::transfer(usdc_cpi_ctx, escrow.usdc_amount)?;
        }
        
        // Return NFT to seller if deposited
        if escrow.seller_nft_deposited {
            let nft_transfer_accounts = Transfer {
                from: ctx.accounts.escrow_nft_account.to_account_info(),
                to: ctx.accounts.seller_nft_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let nft_cpi_program = ctx.accounts.token_program.to_account_info();
            let nft_cpi_ctx = CpiContext::new_with_signer(
                nft_cpi_program,
                nft_transfer_accounts,
                signer,
            );
            token::transfer(nft_cpi_ctx, 1)?;
        }
        
        let escrow_mut = &mut ctx.accounts.escrow_state;
        escrow_mut.status = EscrowStatus::Cancelled;
        
        Ok(())
    }

    /// Admin cancel escrow (emergency)
    /// FEATURE: usdc - This instruction is only available when the usdc feature is enabled
    #[cfg(feature = "usdc")]
    pub fn admin_cancel(ctx: Context<AdminCancel>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_state;
        
        require!(escrow.status == EscrowStatus::Pending, EscrowError::InvalidStatus);
        require!(
            ctx.accounts.admin.key() == escrow.admin,
            EscrowError::Unauthorized
        );
        
        let escrow_id = escrow.escrow_id;
        let bump = escrow.bump;
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let seeds = &[
            b"escrow",
            escrow_id_bytes.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];
        
        // Return USDC to buyer if deposited
        if escrow.buyer_usdc_deposited {
            let usdc_transfer_accounts = Transfer {
                from: ctx.accounts.escrow_usdc_account.to_account_info(),
                to: ctx.accounts.buyer_usdc_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let usdc_cpi_program = ctx.accounts.token_program.to_account_info();
            let usdc_cpi_ctx = CpiContext::new_with_signer(
                usdc_cpi_program,
                usdc_transfer_accounts,
                signer,
            );
            token::transfer(usdc_cpi_ctx, escrow.usdc_amount)?;
        }
        
        // Return NFT to seller if deposited
        if escrow.seller_nft_deposited {
            let nft_transfer_accounts = Transfer {
                from: ctx.accounts.escrow_nft_account.to_account_info(),
                to: ctx.accounts.seller_nft_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let nft_cpi_program = ctx.accounts.token_program.to_account_info();
            let nft_cpi_ctx = CpiContext::new_with_signer(
                nft_cpi_program,
                nft_transfer_accounts,
                signer,
            );
            token::transfer(nft_cpi_ctx, 1)?;
        }
        
        let escrow_mut = &mut ctx.accounts.escrow_state;
        escrow_mut.status = EscrowStatus::Cancelled;
        
        Ok(())
    }

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
        nft_b_mint: Option<Pubkey>,
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

        // Validate parameters based on swap type
        match swap_type {
            SwapType::NftForSol => {
                // For NFT<>SOL: must have sol_amount, no nft_b_mint
                require!(sol_amount.is_some(), EscrowError::InvalidSwapParameters);
                require!(nft_b_mint.is_none(), EscrowError::InvalidSwapParameters);
                
                let amount = sol_amount.unwrap();
                require!(amount >= MIN_SOL_AMOUNT, EscrowError::SolAmountTooLow);
                require!(amount <= MAX_SOL_AMOUNT, EscrowError::SolAmountTooHigh);
            },
            SwapType::NftForNftWithFee => {
                // For NFT<>NFT with fee: must have nft_b_mint, sol_amount is platform fee
                // No minimum on fees - minimum only applies to transaction values
                require!(nft_b_mint.is_some(), EscrowError::InvalidSwapParameters);
                require!(sol_amount.is_some(), EscrowError::InvalidSwapParameters);
                
                let fee = sol_amount.unwrap();
                require!(fee > 0, EscrowError::InvalidAmount);
                require!(fee <= MAX_SOL_AMOUNT, EscrowError::SolAmountTooHigh);
            },
            SwapType::NftForNftPlusSol => {
                // For NFT<>NFT+SOL: must have nft_b_mint and sol_amount
                require!(nft_b_mint.is_some(), EscrowError::InvalidSwapParameters);
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
        escrow_state.nft_b_mint = nft_b_mint;
        escrow_state.platform_fee_bps = platform_fee_bps;
        escrow_state.fee_payer = fee_payer;
        escrow_state.buyer_sol_deposited = false;
        escrow_state.seller_sol_deposited = false;  // NEW: Initialize seller SOL deposit flag
        escrow_state.buyer_nft_deposited = false;
        escrow_state.seller_nft_deposited = false;
        escrow_state.status = EscrowStatus::Pending;
        escrow_state.expiry_timestamp = expiry_timestamp;
        escrow_state.bump = ctx.bumps.escrow_state;
        escrow_state.admin = ctx.accounts.admin.key();

        msg!("Escrow agreement initialized: ID {}", escrow_id);
        msg!("Swap type: {:?}", swap_type);
        msg!("SOL amount: {}", sol_amount.unwrap_or(0));

        Ok(())
    }

    /// Buyer deposits SOL into the SOL vault PDA
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

    /// Seller deposits SOL fee into the escrow (for NFT_FOR_NFT_WITH_FEE)
    /// Both parties contribute 50% of the platform fee
    pub fn deposit_seller_sol_fee(ctx: Context<DepositSellerSolFee>) -> Result<()> {
        // Validate escrow status
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
    /// Permissionless: Anyone can trigger settlement once both deposits are confirmed
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
                // CRITICAL: Both parties deposited to sol_vault, so transfer FROM sol_vault!
                let platform_fee = ctx.accounts.escrow_state.sol_amount; // Full amount is the fee (0.01 SOL total)
                
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
                require!(
                    ctx.remaining_accounts.len() >= 2,
                    EscrowError::InvalidSwapParameters
                );

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

                // Transfer SOL using direct lamport manipulation
                // Get rent-exempt minimum for this account
                let rent = Rent::get()?;
                let escrow_account_info = ctx.accounts.escrow_state.to_account_info();
                let min_rent_exempt = rent.minimum_balance(escrow_account_info.data_len());
                
                // Calculate transferable amount
                let current_balance = escrow_account_info.lamports();
                let transferable = current_balance.checked_sub(min_rent_exempt)
                    .ok_or(EscrowError::InsufficientFunds)?;
                
                // Verify we have enough to cover both transfers
                let total_to_transfer = platform_fee.checked_add(seller_sol_amount)
                    .ok_or(EscrowError::CalculationOverflow)?;
                
                require!(
                    transferable >= total_to_transfer,
                    EscrowError::InsufficientFunds
                );
                
                // CRITICAL FIX: Get escrow_account reference ONCE to avoid RefCell tracking issues
                // Research: https://github.com/solana-labs/solana/issues/20311
                // Multiple to_account_info() calls create separate references that don't sync properly
                let escrow_account = ctx.accounts.escrow_state.to_account_info();
                
                // Perform direct lamport transfers SEQUENTIALLY (one at a time)
                // Transfer 1: escrow -> fee_collector
                {
                    let fee_collector_account = ctx.accounts.platform_fee_collector.to_account_info();
                    
                    let mut escrow_lamports = escrow_account.try_borrow_mut_lamports()?;
                    let mut fee_collector_lamports = fee_collector_account.try_borrow_mut_lamports()?;

                    **escrow_lamports = escrow_lamports.checked_sub(platform_fee)
                        .ok_or(EscrowError::InsufficientFunds)?;
                    **fee_collector_lamports = fee_collector_lamports.checked_add(platform_fee)
                        .ok_or(EscrowError::CalculationOverflow)?;
                } // Borrows released here
                
                // Transfer 2: escrow -> seller
                {
                    let seller_account = ctx.accounts.seller.to_account_info();
                    
                    let mut escrow_lamports = escrow_account.try_borrow_mut_lamports()?;
                    let mut seller_lamports = seller_account.try_borrow_mut_lamports()?;

                    **escrow_lamports = escrow_lamports.checked_sub(seller_sol_amount)
                        .ok_or(EscrowError::InsufficientFunds)?;
                    **seller_lamports = seller_lamports.checked_add(seller_sol_amount)
                        .ok_or(EscrowError::CalculationOverflow)?;
                } // Borrows released here

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
                require!(
                    ctx.remaining_accounts.len() >= 2,
                    EscrowError::InvalidSwapParameters
                );

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
}

// Account Structures

/// FEATURE: usdc - This account structure is only available when the usdc feature is enabled
#[cfg(feature = "usdc")]
#[derive(Accounts)]
#[instruction(escrow_id: u64)]
pub struct InitAgreement<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"escrow", escrow_id.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    /// CHECK: Buyer address is validated by storing in escrow state
    pub buyer: UncheckedAccount<'info>,
    
    /// CHECK: Seller address is validated by storing in escrow state
    pub seller: UncheckedAccount<'info>,
    
    pub nft_mint: Account<'info, Mint>,
    
    /// Admin pays for escrow account creation
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

/// FEATURE: usdc - This account structure is only available when the usdc feature is enabled
#[cfg(feature = "usdc")]
#[derive(Accounts)]
pub struct DepositUsdc<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    #[account(
        mut,
        constraint = buyer_usdc_account.owner == buyer.key()
    )]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// FEATURE: usdc - This account structure is only available when the usdc feature is enabled
#[cfg(feature = "usdc")]
#[derive(Accounts)]
pub struct DepositNft<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == seller.key()
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = seller,
        associated_token::mint = nft_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    pub nft_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// FEATURE: usdc - This account structure is only available when the usdc feature is enabled
#[cfg(feature = "usdc")]
#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_usdc_account.owner == escrow_state.seller
    )]
    pub seller_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = buyer_nft_account.owner == escrow_state.buyer
    )]
    pub buyer_nft_account: Account<'info, TokenAccount>,
    
    /// Platform fee collector USDC account
    #[account(mut)]
    pub fee_collector_usdc_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

/// FEATURE: usdc - This account structure is only available when the usdc feature is enabled
#[cfg(feature = "usdc")]
#[derive(Accounts)]
pub struct CancelIfExpired<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = buyer_usdc_account.owner == escrow_state.buyer
    )]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == escrow_state.seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

/// FEATURE: usdc - This account structure is only available when the usdc feature is enabled
#[cfg(feature = "usdc")]
#[derive(Accounts)]
pub struct AdminCancel<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    pub admin: Signer<'info>,
    
    #[account(mut)]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = buyer_usdc_account.owner == escrow_state.buyer
    )]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == escrow_state.seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

// State Account (LEGACY - USDC-based)

/// LEGACY: Escrow state account for USDC-based escrow (deprecated)
/// FEATURE: usdc - This state is only available when the usdc feature is enabled
#[cfg(feature = "usdc")]
#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub escrow_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub usdc_amount: u64,
    
    /// The NFT's mint address (unique identifier).
    /// 
    /// Important: This is NOT "minting" (creating) an NFT.
    /// The NFT must ALREADY EXIST in the seller's wallet.
    /// This field stores the mint address to identify WHICH specific NFT
    /// is being traded in this escrow agreement.
    pub nft_mint: Pubkey,
    
    /// Platform fee in basis points (1 bps = 0.01%)
    /// Set during initialization by authorized admin
    /// Range: 0-10000 (0% to 100%)
    /// This fee is enforced during settlement and cannot be bypassed
    pub platform_fee_bps: u16,
    
    pub buyer_usdc_deposited: bool,
    pub seller_nft_deposited: bool,
    pub status: EscrowStatus,
    pub expiry_timestamp: i64,
    pub bump: u8,
    pub admin: Pubkey,
}

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
    
    #[msg("Executable accounts (programs) cannot send or receive lamports")]
    ExecutableAccountNotAllowed,
    
    #[msg("Amount below minimum: $1.00 (BETA limit)")]
    AmountTooLow,
    
    #[msg("Amount exceeds maximum: $3,000.00 (BETA limit)")]
    AmountTooHigh,
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

// ============================================================================
// Instructions - NFT <> SOL Swap (Subtask 1.5)
// ============================================================================

/// Initialize a new SOL-based escrow agreement
/// Admin-only operation to ensure all escrows are tracked in the database
pub fn init_agreement(
    ctx: Context<InitAgreement>,
    escrow_id: u64,
    swap_type: SwapType,
    sol_amount: Option<u64>,
    nft_a_mint: Pubkey,
    nft_b_mint: Option<Pubkey>,
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

    // Validate parameters based on swap type
    match swap_type {
        SwapType::NftForSol => {
            // For NFT<>SOL: must have sol_amount, no nft_b_mint
            require!(sol_amount.is_some(), EscrowError::InvalidSwapParameters);
            require!(nft_b_mint.is_none(), EscrowError::InvalidSwapParameters);
            
            let amount = sol_amount.unwrap();
            require!(amount >= MIN_SOL_AMOUNT, EscrowError::SolAmountTooLow);
            require!(amount <= MAX_SOL_AMOUNT, EscrowError::SolAmountTooHigh);
        },
        SwapType::NftForNftWithFee => {
            // For NFT<>NFT with fee: must have nft_b_mint, sol_amount is platform fee
            // No minimum on fees - minimum only applies to transaction values
            require!(nft_b_mint.is_some(), EscrowError::InvalidSwapParameters);
            require!(sol_amount.is_some(), EscrowError::InvalidSwapParameters);
            
            let fee = sol_amount.unwrap();
            require!(fee > 0, EscrowError::InvalidAmount);
            require!(fee <= MAX_SOL_AMOUNT, EscrowError::SolAmountTooHigh);
        },
        SwapType::NftForNftPlusSol => {
            // For NFT<>NFT+SOL: must have nft_b_mint and sol_amount
            require!(nft_b_mint.is_some(), EscrowError::InvalidSwapParameters);
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
    escrow_state.nft_b_mint = nft_b_mint;
    escrow_state.platform_fee_bps = platform_fee_bps;
    escrow_state.fee_payer = fee_payer;
    escrow_state.buyer_sol_deposited = false;
    escrow_state.buyer_nft_deposited = false;
    escrow_state.seller_nft_deposited = false;
    escrow_state.status = EscrowStatus::Pending;
    escrow_state.expiry_timestamp = expiry_timestamp;
    escrow_state.bump = ctx.bumps.escrow_state;
    escrow_state.admin = ctx.accounts.admin.key();

    msg!("Escrow agreement initialized: ID {}", escrow_id);
    msg!("Swap type: {:?}", swap_type);
    msg!("SOL amount: {}", sol_amount.unwrap_or(0));

    Ok(())
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
            require!(
                ctx.remaining_accounts.len() >= 2,
                EscrowError::InvalidSwapParameters
            );

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
            require!(
                ctx.remaining_accounts.len() >= 2,
                EscrowError::InvalidSwapParameters
            );

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

    // Mark escrow as cancelled
    let escrow_id = ctx.accounts.escrow_state.escrow_id;
    ctx.accounts.escrow_state.status = EscrowStatus::Cancelled;

    msg!("Escrow cancelled due to expiry: ID {}", escrow_id);

    Ok(())
}

/// Admin emergency cancel with full refunds
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
    
    #[account(
        init_if_needed,
        payer = seller,
        associated_token::mint = nft_mint,
        associated_token::authority = escrow_state,
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
    
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = nft_mint,
        associated_token::authority = escrow_state,
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
    
    #[account(
        mut,
        constraint = escrow_nft_account.mint == escrow_state.nft_a_mint
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
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
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == escrow_state.seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
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
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == escrow_state.seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
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

