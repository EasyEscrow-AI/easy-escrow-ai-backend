use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::errors::AtomicSwapError;

// ============================================================================
// Two-Phase Swap Instructions
// ============================================================================
// These instructions handle SOL vault operations for the two-phase swap system.
// Two-phase swaps are used for bulk cNFT swaps when Jito bundles are disabled
// or when the swap exceeds Jito's 5-transaction bundle limit.
//
// PDAs created per swap:
// - SOL Vault (Party A): ["two_phase_sol_vault", swap_id, "A"]
// - SOL Vault (Party B): ["two_phase_sol_vault", swap_id, "B"]
//
// All PDAs are zero-data accounts (just hold SOL, no state).
// State is tracked off-chain in the TwoPhaseSwap database table.
// ============================================================================

/// Seed prefix for two-phase SOL vault PDAs
pub const TWO_PHASE_SOL_VAULT_SEED: &[u8] = b"two_phase_sol_vault";

/// Initialize a two-phase SOL vault PDA
///
/// Creates a rent-exempt PDA to hold SOL during the lock phase.
/// Called by the backend when a party locks their assets.
#[derive(Accounts)]
#[instruction(swap_id: [u8; 16], party: u8)]
pub struct InitTwoPhaseSolVault<'info> {
    /// Payer for rent (typically the party locking assets)
    #[account(mut)]
    pub payer: Signer<'info>,

    /// SOL vault PDA to create
    /// CHECK: This is a zero-data PDA, validated by seeds
    #[account(
        init,
        payer = payer,
        space = 0,
        seeds = [TWO_PHASE_SOL_VAULT_SEED, swap_id.as_ref(), &[party]],
        bump
    )]
    pub sol_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Settle a two-phase swap by releasing SOL from vault and closing it
///
/// This instruction:
/// 1. Transfers SOL from the vault to the recipient
/// 2. Transfers platform fee to the fee collector
/// 3. Closes the vault PDA and recovers rent to the rent recipient
///
/// Called during the settlement phase after both parties have locked assets.
#[derive(Accounts)]
#[instruction(swap_id: [u8; 16], party: u8)]
pub struct SettleTwoPhaseWithClose<'info> {
    /// Backend authority (must be authorized to call this)
    #[account(mut)]
    pub caller: Signer<'info>,

    /// SOL vault PDA to settle and close
    /// CHECK: Validated by seeds, this is a zero-data PDA
    #[account(
        mut,
        seeds = [TWO_PHASE_SOL_VAULT_SEED, swap_id.as_ref(), &[party]],
        bump
    )]
    pub sol_vault: AccountInfo<'info>,

    /// Recipient of the SOL (counterparty)
    /// CHECK: Recipient address is validated off-chain
    #[account(mut)]
    pub recipient: AccountInfo<'info>,

    /// Platform fee collector
    /// CHECK: Fee collector is validated off-chain
    #[account(mut)]
    pub platform_fee_collector: AccountInfo<'info>,

    /// Rent recipient (receives the vault's rent-exempt reserve)
    /// CHECK: Rent recipient is validated off-chain (typically treasury)
    #[account(mut)]
    pub rent_recipient: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Cancel a two-phase swap by returning SOL from vault and closing it
///
/// This instruction:
/// 1. Returns all SOL from the vault to the original depositor
/// 2. Closes the vault PDA and recovers rent
///
/// Called when a swap is cancelled, expired, or failed.
#[derive(Accounts)]
#[instruction(swap_id: [u8; 16], party: u8)]
pub struct CancelTwoPhaseWithClose<'info> {
    /// Caller (backend authority or the original depositor)
    #[account(mut)]
    pub caller: Signer<'info>,

    /// SOL vault PDA to cancel and close
    /// CHECK: Validated by seeds, this is a zero-data PDA
    #[account(
        mut,
        seeds = [TWO_PHASE_SOL_VAULT_SEED, swap_id.as_ref(), &[party]],
        bump
    )]
    pub sol_vault: AccountInfo<'info>,

    /// Original depositor (receives SOL refund)
    /// CHECK: Validated off-chain to match the party who locked
    #[account(mut)]
    pub depositor: AccountInfo<'info>,

    /// Rent recipient (receives the vault's rent-exempt reserve)
    /// CHECK: Validated off-chain (typically the depositor or treasury)
    #[account(mut)]
    pub rent_recipient: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

// ============================================================================
// Instruction Handlers
// ============================================================================

/// Initialize a two-phase SOL vault
pub fn init_two_phase_sol_vault_handler(
    ctx: Context<InitTwoPhaseSolVault>,
    swap_id: [u8; 16],
    party: u8,
) -> Result<()> {
    msg!("Initializing two-phase SOL vault");
    msg!("  Swap ID: {:?}", swap_id);
    msg!("  Party: {}", if party == b'A' { "A" } else { "B" });
    msg!("  Vault PDA: {}", ctx.accounts.sol_vault.key());

    Ok(())
}

/// Deposit SOL into a two-phase vault
///
/// This is a separate instruction from init to allow deposits after creation.
pub fn deposit_two_phase_sol_handler(
    ctx: Context<DepositTwoPhaseSol>,
    _swap_id: [u8; 16],
    _party: u8,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, AtomicSwapError::InvalidAmount);

    msg!("Depositing SOL into two-phase vault");
    msg!("  Amount: {} lamports", amount);
    msg!("  From: {}", ctx.accounts.depositor.key());
    msg!("  Vault: {}", ctx.accounts.sol_vault.key());

    // Transfer SOL from depositor to vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.sol_vault.to_account_info(),
            },
        ),
        amount,
    )?;

    msg!("✅ SOL deposited successfully");
    Ok(())
}

/// Settle two-phase swap: transfer SOL to recipient and close vault
pub fn settle_two_phase_with_close_handler(
    ctx: Context<SettleTwoPhaseWithClose>,
    swap_id: [u8; 16],
    party: u8,
    recipient_amount: u64,
    platform_fee: u64,
) -> Result<()> {
    let sol_vault = &ctx.accounts.sol_vault;
    let vault_balance = sol_vault.lamports();

    msg!("Settling two-phase swap vault");
    msg!("  Swap ID: {:?}", swap_id);
    msg!("  Party: {}", if party == b'A' { "A" } else { "B" });
    msg!("  Vault balance: {} lamports", vault_balance);
    msg!("  Recipient amount: {} lamports", recipient_amount);
    msg!("  Platform fee: {} lamports", platform_fee);

    let total_transfer = recipient_amount.checked_add(platform_fee)
        .ok_or(AtomicSwapError::ArithmeticOverflow)?;

    // Ensure vault has enough SOL (excluding rent)
    let rent = Rent::get()?;
    let rent_exempt_min = rent.minimum_balance(0);
    let available = vault_balance.saturating_sub(rent_exempt_min);

    require!(
        available >= total_transfer,
        AtomicSwapError::InsufficientFunds
    );

    // Transfer SOL to recipient
    if recipient_amount > 0 {
        **sol_vault.try_borrow_mut_lamports()? -= recipient_amount;
        **ctx.accounts.recipient.try_borrow_mut_lamports()? += recipient_amount;
        msg!("  ✅ Transferred {} lamports to recipient", recipient_amount);
    }

    // Transfer platform fee
    if platform_fee > 0 {
        **sol_vault.try_borrow_mut_lamports()? -= platform_fee;
        **ctx.accounts.platform_fee_collector.try_borrow_mut_lamports()? += platform_fee;
        msg!("  ✅ Transferred {} lamports platform fee", platform_fee);
    }

    // Close vault and recover rent
    let vault_remaining = sol_vault.lamports();
    msg!("  Closing vault, recovering {} lamports rent", vault_remaining);

    **sol_vault.try_borrow_mut_lamports()? = 0;
    **ctx.accounts.rent_recipient.try_borrow_mut_lamports()? += vault_remaining;

    msg!("✅ Two-phase vault settled and closed");
    Ok(())
}

/// Cancel two-phase swap: return SOL to depositor and close vault
pub fn cancel_two_phase_with_close_handler(
    ctx: Context<CancelTwoPhaseWithClose>,
    swap_id: [u8; 16],
    party: u8,
) -> Result<()> {
    let sol_vault = &ctx.accounts.sol_vault;
    let vault_balance = sol_vault.lamports();

    msg!("Cancelling two-phase swap vault");
    msg!("  Swap ID: {:?}", swap_id);
    msg!("  Party: {}", if party == b'A' { "A" } else { "B" });
    msg!("  Vault balance: {} lamports", vault_balance);

    // Calculate refund amount (vault balance minus rent)
    let rent = Rent::get()?;
    let rent_exempt_min = rent.minimum_balance(0);
    let refund_amount = vault_balance.saturating_sub(rent_exempt_min);

    // Refund SOL to original depositor
    if refund_amount > 0 {
        **sol_vault.try_borrow_mut_lamports()? -= refund_amount;
        **ctx.accounts.depositor.try_borrow_mut_lamports()? += refund_amount;
        msg!("  ✅ Refunded {} lamports to depositor", refund_amount);
    } else {
        msg!("  No SOL to refund (only rent-exempt reserve)");
    }

    // Close vault and recover rent
    let vault_remaining = sol_vault.lamports();
    msg!("  Closing vault, recovering {} lamports rent", vault_remaining);

    **sol_vault.try_borrow_mut_lamports()? = 0;
    **ctx.accounts.rent_recipient.try_borrow_mut_lamports()? += vault_remaining;

    msg!("✅ Two-phase vault cancelled and closed");
    Ok(())
}

// ============================================================================
// Additional Account Structures
// ============================================================================

/// Deposit SOL into an existing two-phase vault
#[derive(Accounts)]
#[instruction(swap_id: [u8; 16], party: u8)]
pub struct DepositTwoPhaseSol<'info> {
    /// Depositor (the party locking SOL)
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// SOL vault PDA to deposit into
    /// CHECK: Validated by seeds, must already exist
    #[account(
        mut,
        seeds = [TWO_PHASE_SOL_VAULT_SEED, swap_id.as_ref(), &[party]],
        bump
    )]
    pub sol_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
