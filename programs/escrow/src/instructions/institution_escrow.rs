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
    /// CHECK: Validated by backend, receives platform fee at deposit time
    pub fee_collector: UncheckedAccount<'info>,

    /// Settlement authority (can release funds)
    /// CHECK: Validated by backend, stored in state for authorization checks
    pub settlement_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

/// Deposit USDC into the institution escrow vault
/// Fee is collected immediately at deposit time; only the escrow amount goes to the vault.
#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct DepositInstitutionEscrow<'info> {
    /// Payer depositing USDC (must match escrow_state.payer)
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Payer's USDC token account (source of deposit).
    /// Owner validated in handler body — either escrow_state.payer (standard)
    /// or stealth_payer (when stealth sender privacy is enabled).
    #[account(
        mut,
        constraint = payer_token_account.mint == escrow_state.mint @ EscrowError::InstitutionDepositMismatch,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    /// Institution escrow state PDA
    #[account(
        mut,
        seeds = [InstitutionEscrow::SEED_PREFIX, escrow_id.as_ref()],
        bump = escrow_state.bump,
        constraint = escrow_state.status == InstitutionEscrowOnChainStatus::Created @ EscrowError::InstitutionInvalidStatus,
    )]
    pub escrow_state: Account<'info, InstitutionEscrow>,

    /// SPL token vault PDA (holds only escrow amount for recipient)
    #[account(
        mut,
        seeds = [InstitutionEscrow::VAULT_SEED, escrow_id.as_ref()],
        bump = escrow_state.vault_bump,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// Fee collector's USDC token account (receives platform fee at deposit time)
    #[account(
        mut,
        constraint = fee_collector_token_account.mint == escrow_state.mint @ EscrowError::InstitutionDepositMismatch,
        constraint = fee_collector_token_account.owner == escrow_state.fee_collector @ EscrowError::InstitutionUnauthorized,
    )]
    pub fee_collector_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Release USDC from institution escrow to recipient.
/// For new escrows (fee collected at deposit), vault contains only the escrow amount.
/// For legacy escrows (fee in vault), vault contains amount + fee — excess sent to fee collector.
#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct ReleaseInstitutionEscrow<'info> {
    /// Settlement authority releasing funds (must match escrow_state.settlement_authority)
    pub authority: Signer<'info>,

    /// Institution escrow state PDA — closed on release to remove plaintext data
    /// from chain and reclaim rent. The encrypted receipt PDA is the permanent record.
    #[account(
        mut,
        close = rent_receiver,
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

    /// Recipient's USDC token account (receives escrow amount).
    /// Owner is validated in the handler body — either escrow_state.recipient (standard)
    /// or stealth_recipient (when stealth privacy is enabled).
    #[account(
        mut,
        constraint = recipient_token_account.mint == escrow_state.mint @ EscrowError::InstitutionDepositMismatch,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    /// Fee collector's USDC token account (receives any remaining vault balance after recipient transfer)
    #[account(
        mut,
        constraint = fee_collector_token_account.mint == escrow_state.mint @ EscrowError::InstitutionDepositMismatch,
        constraint = fee_collector_token_account.owner == escrow_state.fee_collector @ EscrowError::InstitutionUnauthorized,
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
        constraint = payer_token_account.owner == escrow_state.payer @ EscrowError::InstitutionUnauthorized,
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

/// Deposit USDC into the institution escrow vault.
/// Fee is collected immediately: escrow amount goes to vault, platform fee goes to fee collector.
pub fn deposit_institution_escrow(
    ctx: Context<DepositInstitutionEscrow>,
    _escrow_id: [u8; 32],
    stealth_payer: Option<Pubkey>,
) -> Result<()> {
    let clock = Clock::get()?;
    let escrow_state = &ctx.accounts.escrow_state;

    // Validate payer: use stealth_payer if provided (payer deposits from a
    // one-time stealth-derived address for privacy), otherwise enforce the
    // original payer stored at init time.
    let expected_payer = stealth_payer.unwrap_or(escrow_state.payer);
    require!(
        ctx.accounts.payer.key() == expected_payer || ctx.accounts.payer.key() == escrow_state.payer,
        EscrowError::InstitutionUnauthorized
    );
    require!(
        ctx.accounts.payer_token_account.owner == expected_payer,
        EscrowError::InstitutionUnauthorized
    );

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

    // Transfer escrow amount to vault (what recipient will receive on release)
    let vault_transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.payer_token_account.to_account_info(),
            to: ctx.accounts.token_vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        },
    );
    token::transfer(vault_transfer_ctx, escrow_state.amount)?;
    msg!("Deposited {} USDC to vault for recipient", escrow_state.amount);

    // Transfer platform fee directly to fee collector (non-refundable)
    if escrow_state.platform_fee > 0 {
        let fee_transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer_token_account.to_account_info(),
                to: ctx.accounts.fee_collector_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        token::transfer(fee_transfer_ctx, escrow_state.platform_fee)?;
        msg!("Platform fee {} USDC sent to fee collector", escrow_state.platform_fee);
    }

    // Update status to Funded
    let escrow_state = &mut ctx.accounts.escrow_state;
    escrow_state.status = InstitutionEscrowOnChainStatus::Funded;

    msg!("Institution escrow funded: {} USDC total ({} to vault, {} fee collected)",
        total_deposit, escrow_state.amount, escrow_state.platform_fee);

    Ok(())
}

/// Release USDC from institution escrow to recipient.
/// Handles both flows:
///   - New flow (fee collected at deposit): vault contains only `amount`
///   - Legacy flow (fee in vault): vault contains `amount + fee`, excess goes to fee collector
pub fn release_institution_escrow(
    ctx: Context<ReleaseInstitutionEscrow>,
    escrow_id: [u8; 32],
    stealth_recipient: Option<Pubkey>,
) -> Result<()> {
    let clock = Clock::get()?;
    let escrow_state = &ctx.accounts.escrow_state;

    // Validate recipient: use stealth_recipient if provided (settlement authority
    // approves the stealth destination by signing this transaction), otherwise
    // enforce the original recipient stored at init time.
    let expected_recipient = stealth_recipient.unwrap_or(escrow_state.recipient);
    require!(
        ctx.accounts.recipient_token_account.owner == expected_recipient,
        EscrowError::InstitutionUnauthorized
    );

    let amount = escrow_state.amount;
    let platform_fee = escrow_state.platform_fee;

    // Enforce condition type
    match escrow_state.condition_type {
        InstitutionConditionType::AdminRelease => {
            // Settlement authority check (already validated by account constraint) is sufficient
        },
        InstitutionConditionType::TimeLock => {
            // Time lock: funds cannot be released until after the expiry timestamp
            require!(
                clock.unix_timestamp >= escrow_state.expiry_timestamp,
                EscrowError::InstitutionTimeLockNotReached
            );
        },
        InstitutionConditionType::ComplianceCheck => {
            // Compliance is verified off-chain by the backend before building the release transaction.
            // The settlement authority signature serves as attestation that compliance was verified.
            // Future enhancement: add on-chain compliance_passed flag to state.
        },
    }

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

    // Transfer any remaining vault balance to fee collector.
    // For new escrows (fee collected at deposit), vault is now empty.
    // For legacy escrows (fee in vault), this sends the platform fee to fee collector.
    // Using reload() to get the updated balance after the recipient transfer.
    ctx.accounts.token_vault.reload()?;
    let remaining = ctx.accounts.token_vault.amount;
    if remaining > 0 {
        let fee_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.fee_collector_token_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(fee_transfer_ctx, remaining)?;
        msg!("Transferred {} USDC remaining balance to fee collector", remaining);
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

    // Escrow state PDA is closed automatically by Anchor's `close = rent_receiver`
    // attribute on AccountsExit — lamports transferred, data zeroed, owner reassigned
    // to system program. The encrypted receipt PDA is the permanent record.
    msg!("Institution escrow released and PDA closed — plaintext data removed from chain");

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
