use anchor_lang::prelude::*;
use crate::state::Treasury;

/// Initialize the Treasury PDA (one-time setup)
#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    /// Platform authority that will control the treasury
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// Treasury PDA to initialize
    #[account(
        init,
        payer = authority,
        space = Treasury::LEN,
        seeds = [Treasury::SEED_PREFIX, authority.key().as_ref()],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_treasury_handler(
    ctx: Context<InitializeTreasury>,
    authorized_withdrawal_wallet: Pubkey,
) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    
    treasury.authority = ctx.accounts.authority.key();
    treasury.total_fees_collected = 0;
    treasury.total_swaps_executed = 0;
    treasury.total_fees_withdrawn = 0;
    treasury.is_paused = false;
    treasury.paused_at = 0;
    treasury.last_withdrawal_at = 0;
    treasury.authorized_withdrawal_wallet = authorized_withdrawal_wallet;
    treasury.bump = ctx.bumps.treasury;
    
    msg!("Treasury initialized with authority: {}", treasury.authority);
    msg!("Authorized withdrawal wallet: {}", authorized_withdrawal_wallet);
    
    Ok(())
}

