use anchor_lang::prelude::*;
use crate::state::Treasury;
use crate::errors::AtomicSwapError;

/// Close Treasury PDA and refund rent to authority
/// 
/// This instruction is used to close an existing Treasury PDA, typically:
/// - When migrating from old structure to new structure
/// - When shutting down the platform
/// - When consolidating treasury accounts
#[derive(Accounts)]
pub struct CloseTreasury<'info> {
    /// Platform authority (must sign and match treasury authority)
    /// CHECK: Validated by treasury.authority constraint and signer requirement
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,

    /// Treasury PDA to close
    #[account(
        mut,
        seeds = [Treasury::SEED_PREFIX, authority.key().as_ref()],
        bump = treasury.bump,
        constraint = treasury.authority == authority.key() @ AtomicSwapError::Unauthorized,
        close = authority
    )]
    pub treasury: Account<'info, Treasury>,
}

pub fn close_treasury_handler(ctx: Context<CloseTreasury>) -> Result<()> {
    let treasury = &ctx.accounts.treasury;
    
    msg!("🚨 Closing Treasury PDA");
    msg!("Treasury: {}", ctx.accounts.treasury.key());
    msg!("Authority: {}", ctx.accounts.authority.key());
    msg!("Total Fees Collected: {} lamports", treasury.total_fees_collected);
    msg!("Total Swaps Executed: {}", treasury.total_swaps_executed);
    
    // The `close = authority` constraint automatically transfers remaining
    // lamports to authority and marks account for deletion
    
    msg!("✅ Treasury closed successfully - rent refunded to authority");
    Ok(())
}

