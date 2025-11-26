use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use crate::state::Treasury;
use crate::errors::AtomicSwapError;

/// Maximum swap ID length
const MAX_SWAP_ID_LEN: usize = 64;

/// Maximum platform fee (0.5 SOL = 500_000_000 lamports)
const MAX_PLATFORM_FEE: u64 = 500_000_000;

/// Execute atomic swap with platform fee collection
/// 
/// MVP Version: Supports 1 NFT per side + optional SOL
#[derive(Accounts)]
#[instruction(params: SwapParams)]
pub struct AtomicSwapWithFee<'info> {
    /// Maker (initiator of the swap)
    #[account(mut)]
    pub maker: Signer<'info>,
    
    /// Taker (accepter of the swap)
    #[account(mut)]
    pub taker: Signer<'info>,
    
    /// Platform authority (must sign for fee validation)
    pub platform_authority: Signer<'info>,
    
    /// Treasury PDA (receives platform fees)
    #[account(
        mut,
        seeds = [Treasury::SEED_PREFIX, platform_authority.key().as_ref()],
        bump = treasury.bump,
        constraint = treasury.authority == platform_authority.key() @ AtomicSwapError::Unauthorized
    )]
    pub treasury: Account<'info, Treasury>,
    
    /// Maker's NFT token account (optional - for NFT swaps)
    #[account(
        mut,
        constraint = maker_nft_account.amount == 1 @ AtomicSwapError::InvalidTokenAccount,
        constraint = maker_nft_account.owner == maker.key() @ AtomicSwapError::MakerAssetOwnershipFailed
    )]
    pub maker_nft_account: Option<Account<'info, anchor_spl::token::TokenAccount>>,
    
    /// Taker's destination for maker's NFT (optional)
    #[account(mut)]
    pub taker_nft_destination: Option<Account<'info, anchor_spl::token::TokenAccount>>,
    
    /// Taker's NFT token account (optional - for NFT swaps)
    #[account(
        mut,
        constraint = taker_nft_account.amount == 1 @ AtomicSwapError::InvalidTokenAccount,
        constraint = taker_nft_account.owner == taker.key() @ AtomicSwapError::TakerAssetOwnershipFailed
    )]
    pub taker_nft_account: Option<Account<'info, anchor_spl::token::TokenAccount>>,
    
    /// Maker's destination for taker's NFT (optional)
    #[account(mut)]
    pub maker_nft_destination: Option<Account<'info, anchor_spl::token::TokenAccount>>,
    
    /// Token program for SPL token transfers
    pub token_program: Program<'info, Token>,
    
    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SwapParams {
    /// Whether maker is sending an NFT
    pub maker_sends_nft: bool,
    
    /// Whether taker is sending an NFT
    pub taker_sends_nft: bool,
    
    /// SOL amount maker is sending (in lamports)
    pub maker_sol_amount: u64,
    
    /// SOL amount taker is sending (in lamports)
    pub taker_sol_amount: u64,
    
    /// Platform fee in lamports (paid by taker)
    pub platform_fee: u64,
    
    /// Unique swap identifier for backend tracking (max 64 chars)
    pub swap_id: String,
}

pub fn atomic_swap_handler(ctx: Context<AtomicSwapWithFee>, params: SwapParams) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    
    // Check if program is paused
    require!(!treasury.is_paused, AtomicSwapError::ProgramPaused);
    
    // Validate parameters
    validate_params(&params)?;
    
    msg!("Executing atomic swap: {}", params.swap_id);
    msg!("Maker: {}", ctx.accounts.maker.key());
    msg!("Taker: {}", ctx.accounts.taker.key());
    msg!("Platform fee: {} lamports", params.platform_fee);
    
    // Step 1: Collect platform fee from taker to treasury
    collect_platform_fee(
        &ctx.accounts.taker.to_account_info(),
        &treasury.to_account_info(),
        &ctx.accounts.system_program,
        params.platform_fee,
    )?;
    
    msg!("Platform fee collected: {} lamports", params.platform_fee);
    
    // Step 2: Transfer maker's NFT to taker (if any)
    if params.maker_sends_nft {
        if let (Some(maker_nft), Some(taker_dest)) = (
            &ctx.accounts.maker_nft_account,
            &ctx.accounts.taker_nft_destination,
        ) {
            anchor_spl::token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: maker_nft.to_account_info(),
                        to: taker_dest.to_account_info(),
                        authority: ctx.accounts.maker.to_account_info(),
                    },
                ),
                1, // NFT amount is always 1
            )?;
            
            msg!("Transferred maker NFT to taker");
        } else {
            return Err(AtomicSwapError::MakerAssetOwnershipFailed.into());
        }
    }
    
    // Step 3: Transfer taker's NFT to maker (if any)
    if params.taker_sends_nft {
        if let (Some(taker_nft), Some(maker_dest)) = (
            &ctx.accounts.taker_nft_account,
            &ctx.accounts.maker_nft_destination,
        ) {
            anchor_spl::token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: taker_nft.to_account_info(),
                        to: maker_dest.to_account_info(),
                        authority: ctx.accounts.taker.to_account_info(),
                    },
                ),
                1, // NFT amount is always 1
            )?;
            
            msg!("Transferred taker NFT to maker");
        } else {
            return Err(AtomicSwapError::TakerAssetOwnershipFailed.into());
        }
    }
    
    // Step 4: Transfer SOL from maker to taker (if any)
    if params.maker_sol_amount > 0 {
        transfer_sol(
            &ctx.accounts.maker.to_account_info(),
            &ctx.accounts.taker.to_account_info(),
            &ctx.accounts.system_program,
            params.maker_sol_amount,
        )?;
        
        msg!("Transferred {} lamports from maker to taker", params.maker_sol_amount);
    }
    
    // Step 5: Transfer SOL from taker to maker (if any)
    if params.taker_sol_amount > 0 {
        transfer_sol(
            &ctx.accounts.taker.to_account_info(),
            &ctx.accounts.maker.to_account_info(),
            &ctx.accounts.system_program,
            params.taker_sol_amount,
        )?;
        
        msg!("Transferred {} lamports from taker to maker", params.taker_sol_amount);
    }
    
    // Step 6: Update treasury statistics
    treasury.total_fees_collected = treasury
        .total_fees_collected
        .checked_add(params.platform_fee)
        .ok_or(AtomicSwapError::ArithmeticOverflow)?;
    
    treasury.total_swaps_executed = treasury
        .total_swaps_executed
        .checked_add(1)
        .ok_or(AtomicSwapError::ArithmeticOverflow)?;
    
    msg!("Swap completed successfully!");
    msg!("Treasury total fees: {}", treasury.total_fees_collected);
    msg!("Treasury total swaps: {}", treasury.total_swaps_executed);
    
    Ok(())
}

/// Validate swap parameters
fn validate_params(params: &SwapParams) -> Result<()> {
    // Validate fee
    require!(params.platform_fee > 0, AtomicSwapError::InvalidFee);
    require!(
        params.platform_fee <= MAX_PLATFORM_FEE,
        AtomicSwapError::FeeTooHigh
    );
    
    // Validate swap ID length
    require!(
        params.swap_id.len() <= MAX_SWAP_ID_LEN,
        AtomicSwapError::InvalidSwapId
    );
    
    // Validate that at least one asset is being swapped
    require!(
        params.maker_sends_nft || params.taker_sends_nft || 
        params.maker_sol_amount > 0 || params.taker_sol_amount > 0,
        AtomicSwapError::InvalidFee
    );
    
    Ok(())
}

/// Collect platform fee from taker to treasury
fn collect_platform_fee<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    amount: u64,
) -> Result<()> {
    let cpi_context = CpiContext::new(
        system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: from.clone(),
            to: to.clone(),
        },
    );
    
    anchor_lang::system_program::transfer(cpi_context, amount)?;
    
    Ok(())
}

/// Transfer SOL between accounts
fn transfer_sol<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    amount: u64,
) -> Result<()> {
    let cpi_context = CpiContext::new(
        system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: from.clone(),
            to: to.clone(),
        },
    );
    
    anchor_lang::system_program::transfer(cpi_context, amount)?;
    
    Ok(())
}

