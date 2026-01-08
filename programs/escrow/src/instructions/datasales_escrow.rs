use anchor_lang::prelude::*;
use crate::state::datasales_escrow::{DataSalesEscrow, DataSalesStatus};
use crate::EscrowError;

// ============================================================================
// Account Structs
// ============================================================================

/// Create a new DataSales escrow - initializes state PDA
///
/// Called by backend/admin after DataSales creates an agreement.
/// Buyer will deposit SOL in a separate transaction.
#[derive(Accounts)]
#[instruction(
    agreement_id: [u8; 32],
    price_lamports: u64,
    platform_fee_lamports: u64,
    deposit_window_end: i64,
    access_duration_seconds: i64
)]
pub struct CreateDataSalesEscrow<'info> {
    /// Backend authority creating the escrow (signer, pays for account creation)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Seller wallet address
    /// CHECK: Validated by backend
    pub seller: UncheckedAccount<'info>,

    /// Buyer wallet address (optional for open listings)
    /// CHECK: Validated by backend, None for open listings
    pub buyer: Option<UncheckedAccount<'info>>,

    /// Platform fee collector wallet (treasury)
    /// CHECK: Validated by backend
    pub fee_collector: UncheckedAccount<'info>,

    /// DataSales escrow state PDA
    #[account(
        init,
        payer = authority,
        space = DataSalesEscrow::LEN,
        seeds = [DataSalesEscrow::SEED_PREFIX, agreement_id.as_ref()],
        bump
    )]
    pub datasales_escrow: Account<'info, DataSalesEscrow>,

    /// SOL vault PDA - will hold buyer's SOL
    /// CHECK: PDA derived from agreement_id
    #[account(
        mut,
        seeds = [DataSalesEscrow::SOL_VAULT_SEED, agreement_id.as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// System program for account creation
    pub system_program: Program<'info, System>,
}

/// Buyer deposits SOL to vault
#[derive(Accounts)]
#[instruction(agreement_id: [u8; 32])]
pub struct DataSalesDepositSol<'info> {
    /// Buyer depositing SOL
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// DataSales escrow state PDA
    #[account(
        mut,
        seeds = [DataSalesEscrow::SEED_PREFIX, agreement_id.as_ref()],
        bump = datasales_escrow.bump,
        constraint = matches!(datasales_escrow.status, DataSalesStatus::PendingDeposits | DataSalesStatus::DataLocked) @ EscrowError::InvalidDataSalesStatus,
        constraint = !datasales_escrow.buyer_deposited @ EscrowError::AlreadyDeposited
    )]
    pub datasales_escrow: Account<'info, DataSalesEscrow>,

    /// SOL vault PDA
    /// CHECK: PDA derived from agreement_id
    #[account(
        mut,
        seeds = [DataSalesEscrow::SOL_VAULT_SEED, agreement_id.as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// System program for SOL transfer
    pub system_program: Program<'info, System>,
}

/// Confirm seller has uploaded data (backend-only)
#[derive(Accounts)]
#[instruction(agreement_id: [u8; 32])]
pub struct ConfirmSellerDeposit<'info> {
    /// Backend authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// DataSales escrow state PDA
    #[account(
        mut,
        seeds = [DataSalesEscrow::SEED_PREFIX, agreement_id.as_ref()],
        bump = datasales_escrow.bump,
        constraint = matches!(datasales_escrow.status, DataSalesStatus::PendingDeposits | DataSalesStatus::SolLocked) @ EscrowError::InvalidDataSalesStatus,
        constraint = !datasales_escrow.seller_deposited @ EscrowError::AlreadyDeposited
    )]
    pub datasales_escrow: Account<'info, DataSalesEscrow>,
}

/// Approve data quality (backend-only, after DataSales verification)
#[derive(Accounts)]
#[instruction(agreement_id: [u8; 32])]
pub struct ApproveDataSales<'info> {
    /// Backend authority
    #[account(mut)]
    pub authority: Signer<'info>,

    /// DataSales escrow state PDA
    #[account(
        mut,
        seeds = [DataSalesEscrow::SEED_PREFIX, agreement_id.as_ref()],
        bump = datasales_escrow.bump,
        constraint = datasales_escrow.status == DataSalesStatus::BothLocked @ EscrowError::InvalidDataSalesStatus
    )]
    pub datasales_escrow: Account<'info, DataSalesEscrow>,
}

/// Settle DataSales escrow - release SOL to seller and fee to treasury
#[derive(Accounts)]
#[instruction(agreement_id: [u8; 32])]
pub struct SettleDataSales<'info> {
    /// Backend authority triggering settlement
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Seller wallet (receives payment)
    /// CHECK: Must match escrow.seller
    #[account(
        mut,
        constraint = seller.key() == datasales_escrow.seller @ EscrowError::InvalidSeller
    )]
    pub seller: UncheckedAccount<'info>,

    /// DataSales escrow state PDA
    #[account(
        mut,
        seeds = [DataSalesEscrow::SEED_PREFIX, agreement_id.as_ref()],
        bump = datasales_escrow.bump,
        constraint = datasales_escrow.status == DataSalesStatus::Approved @ EscrowError::InvalidDataSalesStatus,
        constraint = datasales_escrow.data_approved @ EscrowError::DataNotApproved
    )]
    pub datasales_escrow: Account<'info, DataSalesEscrow>,

    /// SOL vault PDA
    /// CHECK: PDA derived from agreement_id
    #[account(
        mut,
        seeds = [DataSalesEscrow::SOL_VAULT_SEED, agreement_id.as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// Platform fee collector wallet
    /// CHECK: Must match escrow.fee_collector
    #[account(
        mut,
        constraint = fee_collector.key() == datasales_escrow.fee_collector @ EscrowError::InvalidFeeCollector
    )]
    pub fee_collector: UncheckedAccount<'info>,

    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

/// Cancel DataSales escrow - refund buyer if they deposited
#[derive(Accounts)]
#[instruction(agreement_id: [u8; 32])]
pub struct CancelDataSales<'info> {
    /// Authority triggering cancellation (backend or seller before buyer deposits)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Buyer wallet (receives refund if deposited)
    /// CHECK: Must match escrow.buyer if set
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,

    /// DataSales escrow state PDA
    #[account(
        mut,
        seeds = [DataSalesEscrow::SEED_PREFIX, agreement_id.as_ref()],
        bump = datasales_escrow.bump,
        constraint = !matches!(datasales_escrow.status, DataSalesStatus::Settled | DataSalesStatus::Archived) @ EscrowError::InvalidDataSalesStatus
    )]
    pub datasales_escrow: Account<'info, DataSalesEscrow>,

    /// SOL vault PDA
    /// CHECK: PDA derived from agreement_id
    #[account(
        mut,
        seeds = [DataSalesEscrow::SOL_VAULT_SEED, agreement_id.as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

/// Close DataSales escrow account - reclaim rent after settlement/cancellation
#[derive(Accounts)]
#[instruction(agreement_id: [u8; 32])]
pub struct CloseDataSalesEscrow<'info> {
    /// Authority (receives rent refund)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// DataSales escrow state PDA to close
    #[account(
        mut,
        seeds = [DataSalesEscrow::SEED_PREFIX, agreement_id.as_ref()],
        bump = datasales_escrow.bump,
        constraint = matches!(datasales_escrow.status, DataSalesStatus::Settled | DataSalesStatus::Cancelled | DataSalesStatus::Expired) @ EscrowError::DataSalesNotResolved,
        close = authority
    )]
    pub datasales_escrow: Account<'info, DataSalesEscrow>,

    /// System program
    pub system_program: Program<'info, System>,
}

// ============================================================================
// Instruction Handlers
// ============================================================================

/// Create a new DataSales escrow
pub fn create_datasales_escrow(
    ctx: Context<CreateDataSalesEscrow>,
    agreement_id: [u8; 32],
    price_lamports: u64,
    platform_fee_lamports: u64,
    deposit_window_end: i64,
    access_duration_seconds: i64,
) -> Result<()> {
    let clock = Clock::get()?;

    // Validate price
    require!(
        price_lamports >= DataSalesEscrow::MIN_PRICE,
        EscrowError::DataSalesPriceTooLow
    );
    require!(
        price_lamports <= DataSalesEscrow::MAX_PRICE,
        EscrowError::DataSalesPriceTooHigh
    );

    // Validate deposit window
    let deposit_duration = deposit_window_end - clock.unix_timestamp;
    require!(
        deposit_duration >= DataSalesEscrow::MIN_DEPOSIT_WINDOW,
        EscrowError::DataSalesDepositWindowTooShort
    );
    require!(
        deposit_duration <= DataSalesEscrow::MAX_DEPOSIT_WINDOW,
        EscrowError::DataSalesDepositWindowTooLong
    );

    // Validate access duration
    require!(
        access_duration_seconds >= DataSalesEscrow::MIN_ACCESS_DURATION,
        EscrowError::DataSalesAccessDurationTooShort
    );
    require!(
        access_duration_seconds <= DataSalesEscrow::MAX_ACCESS_DURATION,
        EscrowError::DataSalesAccessDurationTooLong
    );

    // Get buyer pubkey if provided
    let buyer_key = ctx.accounts.buyer.as_ref().map(|b| b.key());

    // Initialize escrow state
    let escrow = &mut ctx.accounts.datasales_escrow;
    escrow.agreement_id = agreement_id;
    escrow.seller = ctx.accounts.seller.key();
    escrow.buyer = buyer_key;
    escrow.price_lamports = price_lamports;
    escrow.platform_fee_lamports = platform_fee_lamports;
    escrow.fee_collector = ctx.accounts.fee_collector.key();
    escrow.deposit_window_end = deposit_window_end;
    escrow.access_duration_seconds = access_duration_seconds;
    escrow.seller_deposited = false;
    escrow.buyer_deposited = false;
    escrow.data_approved = false;
    escrow.status = DataSalesStatus::PendingDeposits;
    escrow.created_at = clock.unix_timestamp;
    escrow.settled_at = 0;
    escrow.access_expires_at = 0;
    escrow.bump = ctx.bumps.datasales_escrow;

    msg!("DataSales escrow created");
    msg!("Price: {} lamports, Fee: {} lamports", price_lamports, platform_fee_lamports);
    msg!("Deposit window ends: {}", deposit_window_end);
    msg!("Access duration: {} seconds", access_duration_seconds);

    Ok(())
}

/// Buyer deposits SOL to vault
pub fn deposit_sol(ctx: Context<DataSalesDepositSol>, _agreement_id: [u8; 32]) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &ctx.accounts.datasales_escrow;

    // Check deposit window hasn't expired
    require!(
        clock.unix_timestamp <= escrow.deposit_window_end,
        EscrowError::DataSalesDepositWindowExpired
    );

    // Validate buyer if specific buyer set
    if let Some(expected_buyer) = escrow.buyer {
        require!(
            ctx.accounts.buyer.key() == expected_buyer,
            EscrowError::UnauthorizedBuyer
        );
    }

    // Calculate total to deposit (price + fee)
    let total_deposit = escrow
        .price_lamports
        .checked_add(escrow.platform_fee_lamports)
        .ok_or(EscrowError::CalculationOverflow)?;

    // Transfer SOL from buyer to vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.sol_vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(transfer_ctx, total_deposit)?;

    // Update escrow state
    let escrow = &mut ctx.accounts.datasales_escrow;
    escrow.buyer_deposited = true;

    // Set buyer if open listing
    if escrow.buyer.is_none() {
        escrow.buyer = Some(ctx.accounts.buyer.key());
    }

    // Update status based on seller deposit
    escrow.status = if escrow.seller_deposited {
        DataSalesStatus::BothLocked
    } else {
        DataSalesStatus::SolLocked
    };

    msg!("Buyer deposited {} lamports", total_deposit);
    msg!("New status: {:?}", escrow.status);

    Ok(())
}

/// Confirm seller has uploaded data
pub fn confirm_seller_deposit(ctx: Context<ConfirmSellerDeposit>, _agreement_id: [u8; 32]) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &ctx.accounts.datasales_escrow;

    // Check deposit window hasn't expired
    require!(
        clock.unix_timestamp <= escrow.deposit_window_end,
        EscrowError::DataSalesDepositWindowExpired
    );

    // Update escrow state
    let escrow = &mut ctx.accounts.datasales_escrow;
    escrow.seller_deposited = true;

    // Update status based on buyer deposit
    escrow.status = if escrow.buyer_deposited {
        DataSalesStatus::BothLocked
    } else {
        DataSalesStatus::DataLocked
    };

    msg!("Seller deposit confirmed");
    msg!("New status: {:?}", escrow.status);

    Ok(())
}

/// Approve data quality
pub fn approve_datasales(ctx: Context<ApproveDataSales>, _agreement_id: [u8; 32]) -> Result<()> {
    let escrow = &mut ctx.accounts.datasales_escrow;

    escrow.data_approved = true;
    escrow.status = DataSalesStatus::Approved;

    msg!("Data approved, ready for settlement");

    Ok(())
}

/// Settle DataSales escrow - release SOL to seller and fee to treasury
pub fn settle_datasales(ctx: Context<SettleDataSales>, agreement_id: [u8; 32]) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &ctx.accounts.datasales_escrow;

    let price = escrow.price_lamports;
    let fee = escrow.platform_fee_lamports;
    let access_duration = escrow.access_duration_seconds;

    // Derive vault signer seeds
    let vault_seeds: &[&[&[u8]]] = &[&[
        DataSalesEscrow::SOL_VAULT_SEED,
        agreement_id.as_ref(),
        &[ctx.bumps.sol_vault],
    ]];

    // Transfer platform fee to fee collector
    if fee > 0 {
        let fee_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.sol_vault.to_account_info(),
                to: ctx.accounts.fee_collector.to_account_info(),
            },
            vault_seeds,
        );
        anchor_lang::system_program::transfer(fee_transfer_ctx, fee)?;
        msg!("Platform fee transferred: {} lamports", fee);
    }

    // Transfer price to seller
    let seller_transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.sol_vault.to_account_info(),
            to: ctx.accounts.seller.to_account_info(),
        },
        vault_seeds,
    );
    anchor_lang::system_program::transfer(seller_transfer_ctx, price)?;
    msg!("Seller payment transferred: {} lamports", price);

    // Update escrow state
    let escrow = &mut ctx.accounts.datasales_escrow;
    escrow.status = DataSalesStatus::Settled;
    escrow.settled_at = clock.unix_timestamp;
    escrow.access_expires_at = clock.unix_timestamp + access_duration;

    msg!("DataSales escrow settled");
    msg!("Access expires at: {}", escrow.access_expires_at);

    Ok(())
}

/// Cancel DataSales escrow - refund buyer if they deposited
pub fn cancel_datasales(ctx: Context<CancelDataSales>, agreement_id: [u8; 32]) -> Result<()> {
    let _clock = Clock::get()?;
    let escrow = &ctx.accounts.datasales_escrow;

    // Refund buyer if they deposited
    if escrow.buyer_deposited {
        // Validate buyer address
        if let Some(expected_buyer) = escrow.buyer {
            require!(
                ctx.accounts.buyer.key() == expected_buyer,
                EscrowError::InvalidBuyer
            );
        }

        let total_refund = escrow
            .price_lamports
            .checked_add(escrow.platform_fee_lamports)
            .ok_or(EscrowError::CalculationOverflow)?;

        // Derive vault signer seeds
        let vault_seeds: &[&[&[u8]]] = &[&[
            DataSalesEscrow::SOL_VAULT_SEED,
            agreement_id.as_ref(),
            &[ctx.bumps.sol_vault],
        ]];

        // Transfer SOL back to buyer
        let refund_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.sol_vault.to_account_info(),
                to: ctx.accounts.buyer.to_account_info(),
            },
            vault_seeds,
        );
        anchor_lang::system_program::transfer(refund_ctx, total_refund)?;

        msg!("Buyer refunded {} lamports", total_refund);
    }

    // Update escrow state
    let escrow = &mut ctx.accounts.datasales_escrow;
    escrow.status = DataSalesStatus::Cancelled;

    msg!("DataSales escrow cancelled");

    Ok(())
}

/// Close DataSales escrow account - reclaim rent
pub fn close_datasales_escrow(_ctx: Context<CloseDataSalesEscrow>, _agreement_id: [u8; 32]) -> Result<()> {
    msg!("DataSales escrow account closed");
    Ok(())
}
