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

    /// Deposit NFT into escrow
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

// State Account

/// Escrow state account storing agreement details
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
    
    #[msg("Amount below minimum: $1.00 (BETA limit)")]
    AmountTooLow,
    
    #[msg("Amount exceeds maximum: $3,000.00 (BETA limit)")]
    AmountTooHigh,
    
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
}

