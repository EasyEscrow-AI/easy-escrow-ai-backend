use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, TransferChecked, TokenAccount, Mint, TokenInterface,
    CloseAccount, close_account,
};
use crate::state::pool_vault::{PoolVault, PoolVaultStatus, PoolReceipt, PoolReceiptStatus, EscrowReceipt};
use crate::EscrowError;

// ============================================================================
// Account Structures
// ============================================================================

/// Initialize a new pool vault - creates state PDA + SPL token vault
#[derive(Accounts)]
#[instruction(pool_id: [u8; 32])]
pub struct InitPoolVault<'info> {
    /// Authority creating the pool (signer, pays for account creation)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool vault state PDA
    #[account(
        init,
        payer = authority,
        space = PoolVault::LEN,
        seeds = [PoolVault::SEED_PREFIX, pool_id.as_ref()],
        bump,
    )]
    pub pool_vault: Account<'info, PoolVault>,

    /// USDC token mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Pool vault token account PDA (holds USDC, authority = pool_vault)
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = pool_vault,
        seeds = [PoolVault::VAULT_SEED, pool_id.as_ref()],
        bump,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Fee collector wallet
    /// CHECK: Validated by backend
    pub fee_collector: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Deposit USDC into the pool vault
#[derive(Accounts)]
#[instruction(pool_id: [u8; 32])]
pub struct DepositToPool<'info> {
    /// Depositor (signer)
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// Depositor's USDC token account (source)
    #[account(
        mut,
        constraint = depositor_token_account.mint == pool_vault.mint @ EscrowError::PoolMintMismatch,
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Pool vault state PDA
    #[account(
        mut,
        seeds = [PoolVault::SEED_PREFIX, pool_id.as_ref()],
        bump = pool_vault.bump,
        constraint = pool_vault.status == PoolVaultStatus::Created
            || pool_vault.status == PoolVaultStatus::Active
            @ EscrowError::PoolVaultNotActive,
    )]
    pub pool_vault: Account<'info, PoolVault>,

    /// Pool vault token account PDA (destination)
    #[account(
        mut,
        seeds = [PoolVault::VAULT_SEED, pool_id.as_ref()],
        bump = pool_vault.vault_bump,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint (needed for transfer_checked)
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

/// Release funds for one pool member - PDA-signed transfer + create receipt
#[derive(Accounts)]
#[instruction(pool_id: [u8; 32], escrow_id: [u8; 32])]
pub struct ReleasePoolMember<'info> {
    /// Authority releasing funds (must match pool_vault.authority)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool vault state PDA
    #[account(
        mut,
        seeds = [PoolVault::SEED_PREFIX, pool_id.as_ref()],
        bump = pool_vault.bump,
        has_one = authority @ EscrowError::Unauthorized,
        constraint = pool_vault.status == PoolVaultStatus::Created
            || pool_vault.status == PoolVaultStatus::Active
            || pool_vault.status == PoolVaultStatus::Settling
            @ EscrowError::PoolVaultNotActive,
    )]
    pub pool_vault: Account<'info, PoolVault>,

    /// Pool vault token account PDA (source of USDC)
    #[account(
        mut,
        seeds = [PoolVault::VAULT_SEED, pool_id.as_ref()],
        bump = pool_vault.vault_bump,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Recipient's USDC token account (destination)
    #[account(
        mut,
        constraint = recipient_token_account.mint == pool_vault.mint @ EscrowError::PoolMintMismatch,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint (needed for transfer_checked)
    pub mint: InterfaceAccount<'info, Mint>,

    /// Pool receipt PDA (created on release)
    #[account(
        init,
        payer = authority,
        space = PoolReceipt::LEN,
        seeds = [PoolVault::RECEIPT_SEED, pool_id.as_ref(), escrow_id.as_ref()],
        bump,
    )]
    pub pool_receipt: Account<'info, PoolReceipt>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Release accumulated platform fees to fee collector
#[derive(Accounts)]
#[instruction(pool_id: [u8; 32])]
pub struct ReleasePoolFees<'info> {
    /// Authority (must match pool_vault.authority)
    pub authority: Signer<'info>,

    /// Pool vault state PDA
    #[account(
        mut,
        seeds = [PoolVault::SEED_PREFIX, pool_id.as_ref()],
        bump = pool_vault.bump,
        has_one = authority @ EscrowError::Unauthorized,
        constraint = pool_vault.status == PoolVaultStatus::Settled
            @ EscrowError::PoolNotSettledOrCancelled,
    )]
    pub pool_vault: Account<'info, PoolVault>,

    /// Pool vault token account PDA (source of fees)
    #[account(
        mut,
        seeds = [PoolVault::VAULT_SEED, pool_id.as_ref()],
        bump = pool_vault.vault_bump,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Fee collector's USDC token account (destination)
    #[account(
        mut,
        constraint = fee_collector_token_account.mint == pool_vault.mint @ EscrowError::PoolMintMismatch,
        constraint = fee_collector_token_account.owner == pool_vault.fee_collector @ EscrowError::Unauthorized,
    )]
    pub fee_collector_token_account: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint (needed for transfer_checked)
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

/// Close pool vault - close vault token account + state account, reclaim rent
#[derive(Accounts)]
#[instruction(pool_id: [u8; 32])]
pub struct ClosePoolVault<'info> {
    /// Authority (must match pool_vault.authority, receives rent)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool vault state PDA (will be closed)
    #[account(
        mut,
        seeds = [PoolVault::SEED_PREFIX, pool_id.as_ref()],
        bump = pool_vault.bump,
        has_one = authority @ EscrowError::Unauthorized,
        constraint = pool_vault.status == PoolVaultStatus::Settled
            || pool_vault.status == PoolVaultStatus::Cancelled
            @ EscrowError::PoolNotSettledOrCancelled,
        close = authority,
    )]
    pub pool_vault: Account<'info, PoolVault>,

    /// Pool vault token account PDA (will be closed)
    #[account(
        mut,
        seeds = [PoolVault::VAULT_SEED, pool_id.as_ref()],
        bump,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

/// Cancel pool vault - refund one member's deposit
#[derive(Accounts)]
#[instruction(pool_id: [u8; 32])]
pub struct CancelPoolVault<'info> {
    /// Authority (must match pool_vault.authority)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool vault state PDA — allow Cancelled status so multi-member refunds work
    /// (each call refunds one member; first call sets Cancelled, subsequent calls still need access)
    #[account(
        mut,
        seeds = [PoolVault::SEED_PREFIX, pool_id.as_ref()],
        bump = pool_vault.bump,
        has_one = authority @ EscrowError::Unauthorized,
        constraint = pool_vault.status == PoolVaultStatus::Created
            || pool_vault.status == PoolVaultStatus::Active
            || pool_vault.status == PoolVaultStatus::Cancelled
            @ EscrowError::PoolVaultNotActive,
    )]
    pub pool_vault: Account<'info, PoolVault>,

    /// Pool vault token account PDA (source of refund)
    #[account(
        mut,
        seeds = [PoolVault::VAULT_SEED, pool_id.as_ref()],
        bump = pool_vault.vault_bump,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Refund recipient's USDC token account
    #[account(
        mut,
        constraint = refund_token_account.mint == pool_vault.mint @ EscrowError::PoolMintMismatch,
    )]
    pub refund_token_account: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint (needed for transfer_checked)
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

/// Close a pool receipt PDA - reclaim rent after pool is settled/cancelled
#[derive(Accounts)]
#[instruction(pool_id: [u8; 32], escrow_id: [u8; 32])]
pub struct ClosePoolReceipt<'info> {
    /// Authority (must match pool_vault.authority, receives rent)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Pool vault state PDA (read-only, used for authorization)
    #[account(
        seeds = [PoolVault::SEED_PREFIX, pool_id.as_ref()],
        bump = pool_vault.bump,
        has_one = authority @ EscrowError::Unauthorized,
        constraint = pool_vault.status == PoolVaultStatus::Settled
            || pool_vault.status == PoolVaultStatus::Cancelled
            @ EscrowError::PoolNotSettledOrCancelled,
    )]
    pub pool_vault: Account<'info, PoolVault>,

    /// Pool receipt PDA (will be closed)
    #[account(
        mut,
        seeds = [PoolVault::RECEIPT_SEED, pool_id.as_ref(), escrow_id.as_ref()],
        bump = pool_receipt.bump,
        close = authority,
    )]
    pub pool_receipt: Account<'info, PoolReceipt>,
}

// ============================================================================
// Instruction Handlers
// ============================================================================

/// Initialize a new pool vault with state PDA and token vault PDA
pub fn handle_init_pool_vault(
    ctx: Context<InitPoolVault>,
    pool_id: [u8; 32],
    corridor: [u8; 8],
    expiry_timestamp: i64,
) -> Result<()> {
    let clock = Clock::get()?;

    // Validate expiry
    let duration = expiry_timestamp - clock.unix_timestamp;
    require!(
        duration >= PoolVault::MIN_EXPIRY_SECONDS,
        EscrowError::PoolExpiryTooShort
    );
    require!(
        duration <= PoolVault::MAX_EXPIRY_SECONDS,
        EscrowError::PoolExpiryTooLong
    );

    let pool_vault = &mut ctx.accounts.pool_vault;
    pool_vault.pool_id = pool_id;
    pool_vault.authority = ctx.accounts.authority.key();
    pool_vault.mint = ctx.accounts.mint.key();
    pool_vault.token_program = ctx.accounts.token_program.key();
    pool_vault.fee_collector = ctx.accounts.fee_collector.key();
    pool_vault.total_amount = 0;
    pool_vault.total_fees = 0;
    pool_vault.total_deposited = 0;
    pool_vault.total_released = 0;
    pool_vault.member_count = 0;
    pool_vault.released_count = 0;
    pool_vault.status = PoolVaultStatus::Created;
    pool_vault.corridor = corridor;
    pool_vault.created_at = clock.unix_timestamp;
    pool_vault.expiry_timestamp = expiry_timestamp;
    pool_vault.bump = ctx.bumps.pool_vault;
    pool_vault.vault_bump = ctx.bumps.vault_token_account;

    msg!("Pool vault created: corridor={:?}", corridor);

    Ok(())
}

/// Deposit USDC into the pool vault, incrementing counters and activating
pub fn handle_deposit_to_pool(
    ctx: Context<DepositToPool>,
    _pool_id: [u8; 32],
    amount: u64,
    platform_fee: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let pool_vault = &ctx.accounts.pool_vault;

    // Check not expired
    require!(
        clock.unix_timestamp <= pool_vault.expiry_timestamp,
        EscrowError::PoolVaultExpired
    );

    // Validate amount
    require!(amount > 0, EscrowError::PoolInvalidAmount);

    let total_deposit = amount
        .checked_add(platform_fee)
        .ok_or(EscrowError::CalculationOverflow)?;

    // Transfer USDC from depositor to vault
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.depositor_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        total_deposit,
        ctx.accounts.mint.decimals,
    )?;

    // Update pool vault state
    let pool_vault = &mut ctx.accounts.pool_vault;
    pool_vault.total_amount = pool_vault.total_amount
        .checked_add(amount)
        .ok_or(EscrowError::CalculationOverflow)?;
    pool_vault.total_fees = pool_vault.total_fees
        .checked_add(platform_fee)
        .ok_or(EscrowError::CalculationOverflow)?;
    pool_vault.total_deposited = pool_vault.total_deposited
        .checked_add(total_deposit)
        .ok_or(EscrowError::CalculationOverflow)?;
    pool_vault.member_count = pool_vault.member_count
        .checked_add(1)
        .ok_or(EscrowError::CalculationOverflow)?;

    // Transition from Created -> Active on first deposit
    if pool_vault.status == PoolVaultStatus::Created {
        pool_vault.status = PoolVaultStatus::Active;
    }

    msg!(
        "Pool deposit: amount={} fee={} members={}",
        amount,
        platform_fee,
        pool_vault.member_count
    );

    Ok(())
}

/// Release funds for one pool member via PDA-signed transfer, create receipt PDA
pub fn handle_release_pool_member(
    ctx: Context<ReleasePoolMember>,
    pool_id: [u8; 32],
    escrow_id: [u8; 32],
    amount: u64,
    receipt_id: [u8; 16],
    commitment_hash: [u8; 32],
    encrypted_payload: [u8; 512],
) -> Result<()> {
    let clock = Clock::get()?;
    let pool_vault = &ctx.accounts.pool_vault;

    // Check not expired
    require!(
        clock.unix_timestamp <= pool_vault.expiry_timestamp,
        EscrowError::PoolVaultExpired
    );

    let bump = pool_vault.bump;

    // Transfer from pool vault to recipient (skip if amount == 0 for receipt-only mode,
    // where funds were already released from individual escrow vaults)
    if amount > 0 {
        let signer_seeds: &[&[&[u8]]] = &[&[
            PoolVault::SEED_PREFIX,
            pool_id.as_ref(),
            &[bump],
        ]];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.pool_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
    }

    // Update pool vault state — skip counters and status transitions in receipt-only
    // mode (amount == 0), where funds were already released from individual escrow vaults
    let pool_vault = &mut ctx.accounts.pool_vault;
    if amount > 0 {
        pool_vault.total_released = pool_vault.total_released
            .checked_add(amount)
            .ok_or(EscrowError::CalculationOverflow)?;
        pool_vault.released_count = pool_vault.released_count
            .checked_add(1)
            .ok_or(EscrowError::CalculationOverflow)?;

        // Transition to Settling on first release
        if pool_vault.status == PoolVaultStatus::Active {
            pool_vault.status = PoolVaultStatus::Settling;
        }

        // Auto-complete if all members released
        if pool_vault.released_count >= pool_vault.member_count {
            pool_vault.status = PoolVaultStatus::Settled;
        }
    }

    // Initialize receipt PDA
    let receipt = &mut ctx.accounts.pool_receipt;
    receipt.pool_id = pool_id;
    receipt.escrow_id = escrow_id;
    receipt.receipt_id = receipt_id;
    receipt.timestamp = clock.unix_timestamp;
    receipt.status = PoolReceiptStatus::Settled;
    receipt.commitment_hash = commitment_hash;
    receipt.encrypted_payload = encrypted_payload;
    receipt.bump = ctx.bumps.pool_receipt;

    msg!(
        "Pool member released: amount={} released={}/{}",
        amount,
        pool_vault.released_count,
        pool_vault.member_count
    );

    Ok(())
}

/// Release accumulated platform fees to the fee collector
pub fn handle_release_pool_fees(
    ctx: Context<ReleasePoolFees>,
    pool_id: [u8; 32],
) -> Result<()> {
    let pool_vault = &ctx.accounts.pool_vault;
    let fees = pool_vault.total_fees;

    require!(fees > 0, EscrowError::PoolInvalidAmount);

    let bump = pool_vault.bump;

    let signer_seeds: &[&[&[u8]]] = &[&[
        PoolVault::SEED_PREFIX,
        pool_id.as_ref(),
        &[bump],
    ]];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.fee_collector_token_account.to_account_info(),
                authority: ctx.accounts.pool_vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        ),
        fees,
        ctx.accounts.mint.decimals,
    )?;

    // Zero out fees after transfer
    let pool_vault = &mut ctx.accounts.pool_vault;
    pool_vault.total_fees = 0;

    msg!("Pool fees released: {}", fees);

    Ok(())
}

/// Close pool vault - close token vault account and state account, reclaim rent
pub fn handle_close_pool_vault(
    ctx: Context<ClosePoolVault>,
    pool_id: [u8; 32],
) -> Result<()> {
    // Verify vault is empty
    require!(
        ctx.accounts.vault_token_account.amount == 0,
        EscrowError::PoolVaultNotEmpty
    );

    let bump = ctx.accounts.pool_vault.bump;

    let signer_seeds: &[&[&[u8]]] = &[&[
        PoolVault::SEED_PREFIX,
        pool_id.as_ref(),
        &[bump],
    ]];

    // Close the vault token account, reclaim rent to authority
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault_token_account.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.pool_vault.to_account_info(),
        },
        signer_seeds,
    ))?;

    // State account is closed via `close = authority` constraint

    msg!("Pool vault closed");

    Ok(())
}

/// Cancel pool vault - refund one member's deposit, set status to Cancelled
pub fn handle_cancel_pool_vault(
    ctx: Context<CancelPoolVault>,
    pool_id: [u8; 32],
    amount: u64,
) -> Result<()> {
    require!(amount > 0, EscrowError::PoolInvalidAmount);

    let pool_vault = &ctx.accounts.pool_vault;
    let bump = pool_vault.bump;

    let signer_seeds: &[&[&[u8]]] = &[&[
        PoolVault::SEED_PREFIX,
        pool_id.as_ref(),
        &[bump],
    ]];

    // PDA-signed transfer from vault to refund recipient
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.refund_token_account.to_account_info(),
                authority: ctx.accounts.pool_vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let pool_vault = &mut ctx.accounts.pool_vault;
    pool_vault.status = PoolVaultStatus::Cancelled;

    msg!("Pool vault cancelled: refunded {}", amount);

    Ok(())
}

/// Close a pool receipt PDA - reclaim rent after pool is settled/cancelled
pub fn handle_close_pool_receipt(
    _ctx: Context<ClosePoolReceipt>,
    _pool_id: [u8; 32],
    _escrow_id: [u8; 32],
) -> Result<()> {
    // Receipt is closed via `close = authority` constraint
    msg!("Pool receipt closed");
    Ok(())
}

// ============================================================================
// Escrow Receipt (standalone, no pool required)
// ============================================================================

/// Create an encrypted receipt PDA for an individual escrow (no pool required).
/// Used when PRIVACY_ENABLED + TRANSACTION_POOLS_ENABLED for non-pooled escrows.
#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct CreateEscrowReceipt<'info> {
    /// Authority creating the receipt (admin/settlement authority)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Escrow receipt PDA (created)
    #[account(
        init,
        payer = authority,
        space = EscrowReceipt::LEN,
        seeds = [EscrowReceipt::SEED_PREFIX, escrow_id.as_ref()],
        bump,
    )]
    pub escrow_receipt: Account<'info, EscrowReceipt>,

    pub system_program: Program<'info, System>,
}

/// Create an encrypted receipt for a single escrow — stores AES-256-GCM encrypted
/// payload and SHA-256 commitment hash on-chain. No pool vault required.
pub fn handle_create_escrow_receipt(
    ctx: Context<CreateEscrowReceipt>,
    escrow_id: [u8; 32],
    receipt_id: [u8; 16],
    commitment_hash: [u8; 32],
    encrypted_payload: [u8; 512],
) -> Result<()> {
    let clock = Clock::get()?;

    let receipt = &mut ctx.accounts.escrow_receipt;
    receipt.escrow_id = escrow_id;
    receipt.receipt_id = receipt_id;
    receipt.timestamp = clock.unix_timestamp;
    receipt.status = PoolReceiptStatus::Settled;
    receipt.commitment_hash = commitment_hash;
    receipt.encrypted_payload = encrypted_payload;
    receipt.bump = ctx.bumps.escrow_receipt;

    msg!("Escrow receipt created with encrypted payload (512 bytes)");

    Ok(())
}

/// Close an escrow receipt PDA — reclaim rent
#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct CloseEscrowReceipt<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [EscrowReceipt::SEED_PREFIX, escrow_id.as_ref()],
        bump = escrow_receipt.bump,
    )]
    pub escrow_receipt: Account<'info, EscrowReceipt>,
}
