use anchor_lang::prelude::*;
use crate::state::Treasury;
use crate::errors::AtomicSwapError;

/// Withdraw accumulated fees from Treasury PDA to treasury wallet
/// 
/// This instruction allows the platform authority to withdraw SOL from the Treasury PDA
/// to the designated treasury wallet. Withdrawals are rate-limited to once per week.
#[derive(Accounts)]
pub struct WithdrawTreasuryFees<'info> {
    /// Platform authority (must sign and match treasury authority)
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// Treasury PDA (source of funds)
    #[account(
        mut,
        seeds = [Treasury::SEED_PREFIX, authority.key().as_ref()],
        bump = treasury.bump,
        constraint = treasury.authority == authority.key() @ AtomicSwapError::Unauthorized,
        constraint = !treasury.is_paused @ AtomicSwapError::ProgramPaused,
    )]
    pub treasury: Account<'info, Treasury>,
    
    /// Destination treasury wallet (receives withdrawn fees)
    /// 
    /// CHECK: Validated via constraint - must match treasury.authorized_withdrawal_wallet
    /// This ensures funds can only be withdrawn to the pre-authorized wallet,
    /// preventing redirection even if authority is compromised.
    #[account(
        mut,
        constraint = treasury_wallet.key() == treasury.authorized_withdrawal_wallet 
            @ AtomicSwapError::UnauthorizedWithdrawalDestination
    )]
    pub treasury_wallet: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn withdraw_treasury_fees_handler(
    ctx: Context<WithdrawTreasuryFees>,
    amount: u64,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    
    msg!("Withdrawing {} lamports from Treasury PDA", amount);
    msg!("Treasury wallet: {}", ctx.accounts.treasury_wallet.key());
    
    // Validate withdrawal timing (at least 7 days since last withdrawal)
    if ctx.accounts.treasury.last_withdrawal_at > 0 {
        let time_since_last = current_time - ctx.accounts.treasury.last_withdrawal_at;
        require!(
            time_since_last >= Treasury::MIN_WITHDRAWAL_INTERVAL,
            AtomicSwapError::WithdrawalTooFrequent
        );
    }
    
    // Validate amount doesn't exceed available balance
    let treasury_balance = ctx.accounts.treasury.to_account_info().lamports();
    let rent_exempt_minimum = Rent::get()?.minimum_balance(Treasury::LEN);
    let available_balance = treasury_balance.checked_sub(rent_exempt_minimum)
        .ok_or(AtomicSwapError::InsufficientTreasuryBalance)?;
    
    require!(
        amount <= available_balance,
        AtomicSwapError::InsufficientTreasuryBalance
    );
    
    msg!("Treasury balance: {} lamports", treasury_balance);
    msg!("Rent exempt minimum: {} lamports", rent_exempt_minimum);
    msg!("Available for withdrawal: {} lamports", available_balance);
    
    // Transfer SOL from Treasury PDA to treasury wallet
    **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.treasury_wallet.try_borrow_mut_lamports()? += amount;
    
    // Update treasury statistics
    let treasury = &mut ctx.accounts.treasury;
    treasury.total_fees_withdrawn = treasury
        .total_fees_withdrawn
        .checked_add(amount)
        .ok_or(AtomicSwapError::ArithmeticOverflow)?;
    
    treasury.last_withdrawal_at = current_time;
    
    msg!("✅ Withdrawal successful!");
    msg!("Total fees collected: {}", treasury.total_fees_collected);
    msg!("Total fees withdrawn: {}", treasury.total_fees_withdrawn);
    msg!("Remaining in treasury: {}", treasury.total_fees_collected - treasury.total_fees_withdrawn);
    
    Ok(())
}

