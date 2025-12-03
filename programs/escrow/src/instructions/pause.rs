use anchor_lang::prelude::*;
use crate::state::Treasury;
use crate::errors::AtomicSwapError;

/// Emergency pause - stops all swaps and withdrawals
#[derive(Accounts)]
pub struct EmergencyPause<'info> {
    /// Platform authority (must sign and match treasury authority)
    pub authority: Signer<'info>,
    
    /// Treasury PDA to pause
    #[account(
        mut,
        seeds = [Treasury::SEED_PREFIX, authority.key().as_ref()],
        bump = treasury.bump,
        constraint = treasury.authority == authority.key() @ AtomicSwapError::Unauthorized,
        constraint = !treasury.is_paused @ AtomicSwapError::AlreadyPaused,
    )]
    pub treasury: Account<'info, Treasury>,
}

pub fn emergency_pause_handler(ctx: Context<EmergencyPause>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    let current_time = Clock::get()?.unix_timestamp;
    
    treasury.is_paused = true;
    treasury.paused_at = current_time;
    
    msg!("🚨 EMERGENCY PAUSE ACTIVATED");
    msg!("Paused at: {}", current_time);
    msg!("Authority: {}", treasury.authority);
    msg!("All swaps and withdrawals are now blocked");
    
    Ok(())
}

/// Resume operations after emergency pause
#[derive(Accounts)]
pub struct Unpause<'info> {
    /// Platform authority (must sign and match treasury authority)
    pub authority: Signer<'info>,
    
    /// Treasury PDA to unpause
    #[account(
        mut,
        seeds = [Treasury::SEED_PREFIX, authority.key().as_ref()],
        bump = treasury.bump,
        constraint = treasury.authority == authority.key() @ AtomicSwapError::Unauthorized,
        constraint = treasury.is_paused @ AtomicSwapError::NotPaused,
    )]
    pub treasury: Account<'info, Treasury>,
}

pub fn unpause_handler(ctx: Context<Unpause>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    let current_time = Clock::get()?.unix_timestamp;
    let pause_duration = current_time - treasury.paused_at;
    
    treasury.is_paused = false;
    treasury.paused_at = 0;
    
    msg!("✅ EMERGENCY PAUSE DEACTIVATED");
    msg!("Resumed at: {}", current_time);
    msg!("Pause duration: {} seconds ({} hours)", pause_duration, pause_duration / 3600);
    msg!("Operations now active");
    
    Ok(())
}

