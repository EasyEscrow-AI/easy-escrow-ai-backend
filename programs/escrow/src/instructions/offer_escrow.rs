use anchor_lang::prelude::*;
use crate::state::offer_escrow::{OfferEscrow, OfferEscrowStatus};
use crate::EscrowError;

/// Create a new offer escrow - bidder deposits SOL to PDA
///
/// This instruction:
/// 1. Creates the OfferEscrow state account
/// 2. Transfers SOL from bidder to the SOL vault PDA
/// 3. Sets offer status to Active
#[derive(Accounts)]
#[instruction(offer_id: [u8; 32], asset_id: [u8; 32], merkle_tree: Pubkey, leaf_index: u32, offer_amount: u64, platform_fee: u64, expiry_timestamp: i64)]
pub struct CreateOfferEscrow<'info> {
    /// Bidder creating the offer (signer, pays for account creation)
    #[account(mut)]
    pub bidder: Signer<'info>,

    /// cNFT owner (seller) - must be validated off-chain via DAS API
    /// CHECK: Validated by backend before building transaction
    pub owner: UncheckedAccount<'info>,

    /// Offer escrow state PDA
    #[account(
        init,
        payer = bidder,
        space = OfferEscrow::LEN,
        seeds = [OfferEscrow::SEED_PREFIX, offer_id.as_ref()],
        bump
    )]
    pub offer_escrow: Account<'info, OfferEscrow>,

    /// SOL vault PDA - holds the escrowed SOL
    /// CHECK: PDA derived from offer_id, receives SOL via System Program transfer
    #[account(
        mut,
        seeds = [OfferEscrow::SOL_VAULT_SEED, offer_id.as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// Platform fee collector wallet
    /// CHECK: Validated by backend, receives platform fee
    #[account(mut)]
    pub fee_collector: UncheckedAccount<'info>,

    /// System program for account creation and SOL transfers
    pub system_program: Program<'info, System>,
}

/// Accept offer - seller accepts, cNFT transfers via Bubblegum, SOL releases to seller
///
/// NOTE: cNFT transfer happens via DirectBubblegumService in backend, not on-chain
/// This instruction only handles the SOL release from escrow to seller
#[derive(Accounts)]
#[instruction(offer_id: [u8; 32])]
pub struct AcceptOfferEscrow<'info> {
    /// cNFT owner (seller) accepting the offer
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Bidder wallet (receives nothing in this instruction, cNFT transferred separately)
    /// CHECK: Must match offer_escrow.bidder
    pub bidder: UncheckedAccount<'info>,

    /// Offer escrow state PDA
    #[account(
        mut,
        seeds = [OfferEscrow::SEED_PREFIX, offer_id.as_ref()],
        bump = offer_escrow.bump,
        constraint = offer_escrow.owner == owner.key() @ EscrowError::Unauthorized,
        constraint = offer_escrow.bidder == bidder.key() @ EscrowError::InvalidBidder,
        constraint = offer_escrow.status == OfferEscrowStatus::Active @ EscrowError::InvalidOfferStatus
    )]
    pub offer_escrow: Account<'info, OfferEscrow>,

    /// SOL vault PDA - holds the escrowed SOL
    /// CHECK: PDA derived from offer_id, SOL transfers out via System Program
    #[account(
        mut,
        seeds = [OfferEscrow::SOL_VAULT_SEED, offer_id.as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// Platform fee collector wallet
    /// CHECK: Must match the fee collector used at creation
    #[account(mut)]
    pub fee_collector: UncheckedAccount<'info>,

    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

/// Cancel offer - bidder cancels, SOL refunded
#[derive(Accounts)]
#[instruction(offer_id: [u8; 32])]
pub struct CancelOfferEscrow<'info> {
    /// Bidder cancelling the offer
    #[account(mut)]
    pub bidder: Signer<'info>,

    /// Offer escrow state PDA
    #[account(
        mut,
        seeds = [OfferEscrow::SEED_PREFIX, offer_id.as_ref()],
        bump = offer_escrow.bump,
        constraint = offer_escrow.bidder == bidder.key() @ EscrowError::Unauthorized,
        constraint = offer_escrow.status == OfferEscrowStatus::Active @ EscrowError::InvalidOfferStatus
    )]
    pub offer_escrow: Account<'info, OfferEscrow>,

    /// SOL vault PDA - holds the escrowed SOL
    /// CHECK: PDA derived from offer_id, SOL transfers out via System Program
    #[account(
        mut,
        seeds = [OfferEscrow::SOL_VAULT_SEED, offer_id.as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

/// Reject offer - seller rejects, SOL refunded to bidder
#[derive(Accounts)]
#[instruction(offer_id: [u8; 32])]
pub struct RejectOfferEscrow<'info> {
    /// cNFT owner (seller) rejecting the offer
    pub owner: Signer<'info>,

    /// Bidder wallet (receives refund)
    /// CHECK: Must match offer_escrow.bidder
    #[account(mut)]
    pub bidder: UncheckedAccount<'info>,

    /// Offer escrow state PDA
    #[account(
        mut,
        seeds = [OfferEscrow::SEED_PREFIX, offer_id.as_ref()],
        bump = offer_escrow.bump,
        constraint = offer_escrow.owner == owner.key() @ EscrowError::Unauthorized,
        constraint = offer_escrow.bidder == bidder.key() @ EscrowError::InvalidBidder,
        constraint = offer_escrow.status == OfferEscrowStatus::Active @ EscrowError::InvalidOfferStatus
    )]
    pub offer_escrow: Account<'info, OfferEscrow>,

    /// SOL vault PDA - holds the escrowed SOL
    /// CHECK: PDA derived from offer_id, SOL transfers out via System Program
    #[account(
        mut,
        seeds = [OfferEscrow::SOL_VAULT_SEED, offer_id.as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

/// Expire offer - admin/backend expires, SOL refunded to bidder
/// This is permissionless if the offer is past its expiry timestamp
#[derive(Accounts)]
#[instruction(offer_id: [u8; 32])]
pub struct ExpireOfferEscrow<'info> {
    /// Anyone can trigger expiry (permissionless after expiry_timestamp)
    pub authority: Signer<'info>,

    /// Bidder wallet (receives refund)
    /// CHECK: Must match offer_escrow.bidder
    #[account(mut)]
    pub bidder: UncheckedAccount<'info>,

    /// Offer escrow state PDA
    #[account(
        mut,
        seeds = [OfferEscrow::SEED_PREFIX, offer_id.as_ref()],
        bump = offer_escrow.bump,
        constraint = offer_escrow.bidder == bidder.key() @ EscrowError::InvalidBidder,
        constraint = offer_escrow.status == OfferEscrowStatus::Active @ EscrowError::InvalidOfferStatus
    )]
    pub offer_escrow: Account<'info, OfferEscrow>,

    /// SOL vault PDA - holds the escrowed SOL
    /// CHECK: PDA derived from offer_id, SOL transfers out via System Program
    #[account(
        mut,
        seeds = [OfferEscrow::SOL_VAULT_SEED, offer_id.as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

/// Close offer escrow account - reclaim rent after resolution
#[derive(Accounts)]
#[instruction(offer_id: [u8; 32])]
pub struct CloseOfferEscrow<'info> {
    /// Bidder who created the offer (receives rent refund)
    #[account(mut)]
    pub bidder: Signer<'info>,

    /// Offer escrow state PDA to close
    #[account(
        mut,
        seeds = [OfferEscrow::SEED_PREFIX, offer_id.as_ref()],
        bump = offer_escrow.bump,
        constraint = offer_escrow.bidder == bidder.key() @ EscrowError::Unauthorized,
        constraint = offer_escrow.status != OfferEscrowStatus::Active @ EscrowError::OfferStillActive,
        close = bidder
    )]
    pub offer_escrow: Account<'info, OfferEscrow>,

    /// System program
    pub system_program: Program<'info, System>,
}

// ============================================================================
// Instruction Handlers
// ============================================================================

/// Create a new offer escrow
pub fn create_offer_escrow(
    ctx: Context<CreateOfferEscrow>,
    offer_id: [u8; 32],
    asset_id: [u8; 32],
    merkle_tree: Pubkey,
    leaf_index: u32,
    offer_amount: u64,
    platform_fee: u64,
    expiry_timestamp: i64,
) -> Result<()> {
    let clock = Clock::get()?;

    // Validate offer amount
    require!(
        offer_amount >= OfferEscrow::MIN_OFFER_AMOUNT,
        EscrowError::OfferAmountTooLow
    );
    require!(
        offer_amount <= OfferEscrow::MAX_OFFER_AMOUNT,
        EscrowError::OfferAmountTooHigh
    );

    // Validate expiry timestamp
    let duration = expiry_timestamp - clock.unix_timestamp;
    require!(
        duration >= OfferEscrow::MIN_OFFER_DURATION,
        EscrowError::OfferDurationTooShort
    );
    require!(
        duration <= OfferEscrow::MAX_OFFER_DURATION,
        EscrowError::OfferDurationTooLong
    );

    // Validate bidder is not the owner
    require!(
        ctx.accounts.bidder.key() != ctx.accounts.owner.key(),
        EscrowError::BidderCannotBeOwner
    );

    // Calculate total amount to escrow (offer + fee)
    let total_escrow = offer_amount
        .checked_add(platform_fee)
        .ok_or(EscrowError::CalculationOverflow)?;

    // Transfer SOL from bidder to SOL vault PDA
    let transfer_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.bidder.to_account_info(),
            to: ctx.accounts.sol_vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(transfer_ctx, total_escrow)?;

    // Initialize offer escrow state
    let offer_escrow = &mut ctx.accounts.offer_escrow;
    offer_escrow.offer_id = offer_id;
    offer_escrow.bidder = ctx.accounts.bidder.key();
    offer_escrow.owner = ctx.accounts.owner.key();
    offer_escrow.asset_id = asset_id;
    offer_escrow.merkle_tree = merkle_tree;
    offer_escrow.leaf_index = leaf_index;
    offer_escrow.offer_amount = offer_amount;
    offer_escrow.platform_fee = platform_fee;
    offer_escrow.status = OfferEscrowStatus::Active;
    offer_escrow.expiry_timestamp = expiry_timestamp;
    offer_escrow.created_at = clock.unix_timestamp;
    offer_escrow.resolved_at = 0;
    offer_escrow.bump = ctx.bumps.offer_escrow;

    msg!("Offer escrow created: {} lamports escrowed", total_escrow);
    msg!("Offer amount: {}, Platform fee: {}", offer_amount, platform_fee);
    msg!("Expiry: {}", expiry_timestamp);

    Ok(())
}

/// Accept an offer - release SOL to seller and fee to collector
pub fn accept_offer_escrow(ctx: Context<AcceptOfferEscrow>, offer_id: [u8; 32]) -> Result<()> {
    let clock = Clock::get()?;
    let offer_escrow = &ctx.accounts.offer_escrow;

    // Check offer hasn't expired
    require!(
        clock.unix_timestamp <= offer_escrow.expiry_timestamp,
        EscrowError::OfferExpired
    );

    // Get amounts
    let offer_amount = offer_escrow.offer_amount;
    let platform_fee = offer_escrow.platform_fee;

    // Derive vault signer seeds
    let vault_seeds: &[&[&[u8]]] = &[&[
        OfferEscrow::SOL_VAULT_SEED,
        offer_id.as_ref(),
        &[ctx.bumps.sol_vault],
    ]];

    // Transfer platform fee to fee collector
    if platform_fee > 0 {
        let fee_transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.sol_vault.to_account_info(),
                to: ctx.accounts.fee_collector.to_account_info(),
            },
            vault_seeds,
        );
        anchor_lang::system_program::transfer(fee_transfer_ctx, platform_fee)?;
        msg!("Platform fee transferred: {} lamports", platform_fee);
    }

    // Transfer offer amount to seller (owner)
    let seller_transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.sol_vault.to_account_info(),
            to: ctx.accounts.owner.to_account_info(),
        },
        vault_seeds,
    );
    anchor_lang::system_program::transfer(seller_transfer_ctx, offer_amount)?;
    msg!("Seller payment transferred: {} lamports", offer_amount);

    // Update offer status
    let offer_escrow = &mut ctx.accounts.offer_escrow;
    offer_escrow.status = OfferEscrowStatus::Accepted;
    offer_escrow.resolved_at = clock.unix_timestamp;

    msg!("Offer accepted successfully");

    Ok(())
}

/// Cancel an offer - refund SOL to bidder
pub fn cancel_offer_escrow(ctx: Context<CancelOfferEscrow>, offer_id: [u8; 32]) -> Result<()> {
    let clock = Clock::get()?;
    let offer_escrow = &ctx.accounts.offer_escrow;

    // Calculate total to refund
    let total_refund = offer_escrow
        .offer_amount
        .checked_add(offer_escrow.platform_fee)
        .ok_or(EscrowError::CalculationOverflow)?;

    // Derive vault signer seeds
    let vault_seeds: &[&[&[u8]]] = &[&[
        OfferEscrow::SOL_VAULT_SEED,
        offer_id.as_ref(),
        &[ctx.bumps.sol_vault],
    ]];

    // Transfer SOL back to bidder
    let refund_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.sol_vault.to_account_info(),
            to: ctx.accounts.bidder.to_account_info(),
        },
        vault_seeds,
    );
    anchor_lang::system_program::transfer(refund_ctx, total_refund)?;

    // Update offer status
    let offer_escrow = &mut ctx.accounts.offer_escrow;
    offer_escrow.status = OfferEscrowStatus::Cancelled;
    offer_escrow.resolved_at = clock.unix_timestamp;

    msg!("Offer cancelled, {} lamports refunded to bidder", total_refund);

    Ok(())
}

/// Reject an offer - refund SOL to bidder
pub fn reject_offer_escrow(ctx: Context<RejectOfferEscrow>, offer_id: [u8; 32]) -> Result<()> {
    let clock = Clock::get()?;
    let offer_escrow = &ctx.accounts.offer_escrow;

    // Check offer hasn't expired
    require!(
        clock.unix_timestamp <= offer_escrow.expiry_timestamp,
        EscrowError::OfferExpired
    );

    // Calculate total to refund
    let total_refund = offer_escrow
        .offer_amount
        .checked_add(offer_escrow.platform_fee)
        .ok_or(EscrowError::CalculationOverflow)?;

    // Derive vault signer seeds
    let vault_seeds: &[&[&[u8]]] = &[&[
        OfferEscrow::SOL_VAULT_SEED,
        offer_id.as_ref(),
        &[ctx.bumps.sol_vault],
    ]];

    // Transfer SOL back to bidder
    let refund_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.sol_vault.to_account_info(),
            to: ctx.accounts.bidder.to_account_info(),
        },
        vault_seeds,
    );
    anchor_lang::system_program::transfer(refund_ctx, total_refund)?;

    // Update offer status
    let offer_escrow = &mut ctx.accounts.offer_escrow;
    offer_escrow.status = OfferEscrowStatus::Rejected;
    offer_escrow.resolved_at = clock.unix_timestamp;

    msg!("Offer rejected, {} lamports refunded to bidder", total_refund);

    Ok(())
}

/// Expire an offer - permissionless after expiry timestamp
pub fn expire_offer_escrow(ctx: Context<ExpireOfferEscrow>, offer_id: [u8; 32]) -> Result<()> {
    let clock = Clock::get()?;
    let offer_escrow = &ctx.accounts.offer_escrow;

    // Validate offer has expired
    require!(
        clock.unix_timestamp > offer_escrow.expiry_timestamp,
        EscrowError::OfferNotExpired
    );

    // Calculate total to refund
    let total_refund = offer_escrow
        .offer_amount
        .checked_add(offer_escrow.platform_fee)
        .ok_or(EscrowError::CalculationOverflow)?;

    // Derive vault signer seeds
    let vault_seeds: &[&[&[u8]]] = &[&[
        OfferEscrow::SOL_VAULT_SEED,
        offer_id.as_ref(),
        &[ctx.bumps.sol_vault],
    ]];

    // Transfer SOL back to bidder
    let refund_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.sol_vault.to_account_info(),
            to: ctx.accounts.bidder.to_account_info(),
        },
        vault_seeds,
    );
    anchor_lang::system_program::transfer(refund_ctx, total_refund)?;

    // Update offer status
    let offer_escrow = &mut ctx.accounts.offer_escrow;
    offer_escrow.status = OfferEscrowStatus::Expired;
    offer_escrow.resolved_at = clock.unix_timestamp;

    msg!("Offer expired, {} lamports refunded to bidder", total_refund);

    Ok(())
}
