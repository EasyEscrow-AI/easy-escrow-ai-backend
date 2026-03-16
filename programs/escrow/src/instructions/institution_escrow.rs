use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, CloseAccount};
use crate::state::institution_escrow::{
    InstitutionEscrow, InstitutionEscrowOnChainStatus, InstitutionConditionType,
};
use crate::EscrowError;

// ============================================================================
// Account Structures
// ============================================================================

/// Initialize a new institution escrow - creates state PDA + SPL token vault
#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct InitInstitutionEscrow<'info> {
    /// Authority creating the escrow (signer, pays for account creation)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Payer wallet (depositor of USDC)
    /// CHECK: Validated by backend before building transaction
    pub payer_wallet: UncheckedAccount<'info>,

    /// Recipient wallet (receives USDC on release)
    /// CHECK: Validated by backend before building transaction
    pub recipient_wallet: UncheckedAccount<'info>,

    /// Institution escrow state PDA
    #[account(
        init,
        payer = authority,
        space = InstitutionEscrow::LEN,
        seeds = [InstitutionEscrow::SEED_PREFIX, escrow_id.as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, InstitutionEscrow>,

    /// SPL token vault PDA - holds USDC deposits, controlled by escrow_state PDA
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = escrow_state,
        seeds = [InstitutionEscrow::VAULT_SEED, escrow_id.as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// USDC SPL token mint
    pub usdc_mint: Account<'info, Mint>,

    /// Fee collector wallet
    /// CHECK: Validated by backend, receives platform fee on release
    pub fee_collector: UncheckedAccount<'info>,

    /// Settlement authority (can release funds)
    /// CHECK: Validated by backend, stored in state for authorization checks
    pub settlement_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

/// Deposit USDC into the institution escrow vault
#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct DepositInstitutionEscrow<'info> {
    /// Payer depositing USDC (must match escrow_state.payer)
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Payer's USDC token account (source of deposit)
    #[account(
        mut,
        constraint = payer_token_account.owner == payer.key() @ EscrowError::InstitutionUnauthorized,
        constraint = payer_token_account.mint == escrow_state.mint @ EscrowError::InstitutionDepositMismatch,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    /// Institution escrow state PDA
    #[account(
        mut,
        seeds = [InstitutionEscrow::SEED_PREFIX, escrow_id.as_ref()],
        bump = escrow_state.bump,
        constraint = escrow_state.payer == payer.key() @ EscrowError::InstitutionUnauthorized,
        constraint = escrow_state.status == InstitutionEscrowOnChainStatus::Created @ EscrowError::InstitutionInvalidStatus,
    )]
    pub escrow_state: Account<'info, InstitutionEscrow>,

    /// SPL token vault PDA
    #[account(
        mut,
        seeds = [InstitutionEscrow::VAULT_SEED, escrow_id.as_ref()],
        bump = escrow_state.vault_bump,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Release USDC from institution escrow to recipient and fee collector
#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct ReleaseInstitutionEscrow<'info> {
    /// Settlement authority releasing funds (must match escrow_state.settlement_authority)
    pub authority: Signer<'info>,

    /// Institution escrow state PDA
    #[account(
        mut,
        seeds = [InstitutionEscrow::SEED_PREFIX, escrow_id.as_ref()],
        bump = escrow_state.bump,
        constraint = escrow_state.settlement_authority == authority.key() @ EscrowError::InstitutionUnauthorized,
        constraint = escrow_state.status == InstitutionEscrowOnChainStatus::Funded @ EscrowError::InstitutionInvalidStatus,
    )]
    pub escrow_state: Account<'info, InstitutionEscrow>,

    /// SPL token vault PDA
    #[account(
        mut,
        seeds = [InstitutionEscrow::VAULT_SEED, escrow_id.as_ref()],
        bump = escrow_state.vault_bump,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// Recipient's USDC token account (receives escrow amount)
    #[account(
        mut,
        constraint = recipient_token_account.mint == escrow_state.mint @ EscrowError::InstitutionDepositMismatch,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    /// Fee collector's USDC token account (receives platform fee)
    #[account(
        mut,
        constraint = fee_collector_token_account.mint == escrow_state.mint @ EscrowError::InstitutionDepositMismatch,
    )]
    pub fee_collector_token_account: Account<'info, TokenAccount>,

    /// Authority to receive rent from closed vault account
    /// CHECK: Receives remaining lamports when vault is closed
    #[account(mut)]
    pub rent_receiver: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

/// Cancel institution escrow - refund USDC to payer
#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct CancelInstitutionEscrow<'info> {
    /// Caller cancelling the escrow
    /// Must be settlement_authority OR (payer AND expired)
    pub caller: Signer<'info>,

    /// Institution escrow state PDA
    #[account(
        mut,
        seeds = [InstitutionEscrow::SEED_PREFIX, escrow_id.as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, InstitutionEscrow>,

    /// SPL token vault PDA
    #[account(
        mut,
        seeds = [InstitutionEscrow::VAULT_SEED, escrow_id.as_ref()],
        bump = escrow_state.vault_bump,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// Payer's USDC token account (receives refund)
    #[account(
        mut,
        constraint = payer_token_account.mint == escrow_state.mint @ EscrowError::InstitutionDepositMismatch,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    /// Receiver of rent from closed vault account
    /// CHECK: Receives remaining lamports when vault is closed
    #[account(mut)]
    pub rent_receiver: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

// ============================================================================
// Instruction Handlers
// ============================================================================

/// Initialize a new institution escrow
pub fn init_institution_escrow(
    ctx: Context<InitInstitutionEscrow>,
    escrow_id: [u8; 32],
    amount: u64,
    platform_fee: u64,
    condition_type: InstitutionConditionType,
    corridor: [u8; 8],
    expiry_timestamp: i64,
) -> Result<()> {
    let clock = Clock::get()?;

    // Validate amount
    require!(
        amount >= InstitutionEscrow::MIN_AMOUNT,
        EscrowError::InstitutionAmountTooLow
    );
    require!(
        amount <= InstitutionEscrow::MAX_AMOUNT,
        EscrowError::InstitutionAmountTooHigh
    );

    // Validate expiry timestamp
    let duration = expiry_timestamp - clock.unix_timestamp;
    require!(
        duration >= InstitutionEscrow::MIN_EXPIRY_SECONDS,
        EscrowError::InstitutionExpiryTooShort
    );
    require!(
        duration <= InstitutionEscrow::MAX_EXPIRY_SECONDS,
        EscrowError::InstitutionExpiryTooLong
    );

    // Validate payer is not recipient
    require!(
        ctx.accounts.payer_wallet.key() != ctx.accounts.recipient_wallet.key(),
        EscrowError::InstitutionPayerIsRecipient
    );

    // Initialize escrow state
    let escrow_state = &mut ctx.accounts.escrow_state;
    escrow_state.escrow_id = escrow_id;
    escrow_state.payer = ctx.accounts.payer_wallet.key();
    escrow_state.recipient = ctx.accounts.recipient_wallet.key();
    escrow_state.mint = ctx.accounts.usdc_mint.key();
    escrow_state.amount = amount;
    escrow_state.platform_fee = platform_fee;
    escrow_state.fee_collector = ctx.accounts.fee_collector.key();
    escrow_state.condition_type = condition_type;
    escrow_state.corridor = corridor;
    escrow_state.status = InstitutionEscrowOnChainStatus::Created;
    escrow_state.settlement_authority = ctx.accounts.settlement_authority.key();
    escrow_state.expiry_timestamp = expiry_timestamp;
    escrow_state.created_at = clock.unix_timestamp;
    escrow_state.resolved_at = 0;
    escrow_state.bump = ctx.bumps.escrow_state;
    escrow_state.vault_bump = ctx.bumps.token_vault;

    msg!("Institution escrow created: amount={} fee={}", amount, platform_fee);
    msg!("Expiry: {}", expiry_timestamp);

    Ok(())
}

/// Deposit USDC into the institution escrow vault
pub fn deposit_institution_escrow(
    ctx: Context<DepositInstitutionEscrow>,
    _escrow_id: [u8; 32],
) -> Result<()> {
    let clock = Clock::get()?;
    let escrow_state = &ctx.accounts.escrow_state;

    // Check not expired
    require!(
        clock.unix_timestamp <= escrow_state.expiry_timestamp,
        EscrowError::InstitutionExpired
    );

    // Calculate total deposit (amount + platform fee)
    let total_deposit = escrow_state.amount
        .checked_add(escrow_state.platform_fee)
        .ok_or(EscrowError::CalculationOverflow)?;

    // Verify payer token account has sufficient balance
    require!(
        ctx.accounts.payer_token_account.amount >= total_deposit,
        EscrowError::InstitutionDepositMismatch
    );

    // Transfer USDC from payer to vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.payer_token_account.to_account_info(),
            to: ctx.accounts.token_vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, total_deposit)?;

    // Update status to Funded
    let escrow_state = &mut ctx.accounts.escrow_state;
    escrow_state.status = InstitutionEscrowOnChainStatus::Funded;

    msg!("Institution escrow funded: {} USDC deposited", total_deposit);

    Ok(())
}

/// Release USDC from institution escrow to recipient and fee collector
pub fn release_institution_escrow(
    ctx: Context<ReleaseInstitutionEscrow>,
    escrow_id: [u8; 32],
) -> Result<()> {
    let clock = Clock::get()?;
    let escrow_state = &ctx.accounts.escrow_state;

    let amount = escrow_state.amount;
    let platform_fee = escrow_state.platform_fee;

    // Derive PDA signer seeds for the escrow_state (vault authority)
    let signer_seeds: &[&[&[u8]]] = &[&[
        InstitutionEscrow::SEED_PREFIX,
        escrow_id.as_ref(),
        &[escrow_state.bump],
    ]];

    // Transfer escrow amount to recipient
    let recipient_transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.token_vault.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(recipient_transfer_ctx, amount)?;
    msg!("Released {} USDC to recipient", amount);

    // Transfer platform fee to fee collector
    if platform_fee > 0 {
        let fee_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.fee_collector_token_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(fee_transfer_ctx, platform_fee)?;
        msg!("Platform fee transferred: {} USDC", platform_fee);
    }

    // Close vault account to recover rent
    let close_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.token_vault.to_account_info(),
            destination: ctx.accounts.rent_receiver.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        },
        signer_seeds,
    );
    token::close_account(close_ctx)?;
    msg!("Token vault closed, rent recovered");

    // Update status to Released
    let escrow_state = &mut ctx.accounts.escrow_state;
    escrow_state.status = InstitutionEscrowOnChainStatus::Released;
    escrow_state.resolved_at = clock.unix_timestamp;

    msg!("Institution escrow released successfully");

    Ok(())
}

/// Cancel institution escrow - refund USDC to payer
pub fn cancel_institution_escrow(
    ctx: Context<CancelInstitutionEscrow>,
    escrow_id: [u8; 32],
) -> Result<()> {
    let clock = Clock::get()?;
    let escrow_state = &ctx.accounts.escrow_state;
    let caller = ctx.accounts.caller.key();

    // Validate caller authorization:
    // - settlement_authority can cancel at any time
    // - payer can cancel only if expired
    let is_settlement_authority = caller == escrow_state.settlement_authority;
    let is_payer = caller == escrow_state.payer;
    let is_expired = clock.unix_timestamp > escrow_state.expiry_timestamp;

    require!(
        is_settlement_authority || (is_payer && is_expired),
        EscrowError::InstitutionUnauthorized
    );

    // Validate status allows cancellation (Created or Funded)
    require!(
        escrow_state.status == InstitutionEscrowOnChainStatus::Created
            || escrow_state.status == InstitutionEscrowOnChainStatus::Funded,
        EscrowError::InstitutionInvalidStatus
    );

    // Derive PDA signer seeds for the escrow_state (vault authority)
    let signer_seeds: &[&[&[u8]]] = &[&[
        InstitutionEscrow::SEED_PREFIX,
        escrow_id.as_ref(),
        &[escrow_state.bump],
    ]];

    // If funded, refund USDC to payer
    if escrow_state.status == InstitutionEscrowOnChainStatus::Funded {
        let vault_balance = ctx.accounts.token_vault.amount;

        if vault_balance > 0 {
            let refund_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.payer_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(refund_ctx, vault_balance)?;
            msg!("Refunded {} USDC to payer", vault_balance);
        }
    }

    // Close vault account to recover rent
    let close_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.token_vault.to_account_info(),
            destination: ctx.accounts.rent_receiver.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        },
        signer_seeds,
    );
    token::close_account(close_ctx)?;
    msg!("Token vault closed, rent recovered");

    // Determine final status
    let final_status = if is_payer && is_expired {
        InstitutionEscrowOnChainStatus::Expired
    } else {
        InstitutionEscrowOnChainStatus::Cancelled
    };

    // Update status
    let escrow_state = &mut ctx.accounts.escrow_state;
    escrow_state.status = final_status;
    escrow_state.resolved_at = clock.unix_timestamp;

    msg!("Institution escrow {:?}", final_status);

    Ok(())
}
