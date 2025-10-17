use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd");

#[program]
pub mod escrow {
    use super::*;

    /// Initialize an escrow agreement
    pub fn init_agreement(
        ctx: Context<InitAgreement>,
        escrow_id: u64,
        usdc_amount: u64,
        expiry_timestamp: i64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        
        require!(usdc_amount > 0, EscrowError::InvalidAmount);
        require!(expiry_timestamp > Clock::get()?.unix_timestamp, EscrowError::InvalidExpiry);
        
        escrow.escrow_id = escrow_id;
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.seller = ctx.accounts.seller.key();
        escrow.usdc_amount = usdc_amount;
        escrow.nft_mint = ctx.accounts.nft_mint.key();
        escrow.buyer_usdc_deposited = false;
        escrow.seller_nft_deposited = false;
        escrow.status = EscrowStatus::Pending;
        escrow.expiry_timestamp = expiry_timestamp;
        escrow.bump = ctx.bumps.escrow_state;
        escrow.admin = ctx.accounts.admin.key();
        
        msg!("Escrow agreement initialized with ID: {}", escrow_id);
        Ok(())
    }

    /// Deposit USDC into escrow
    pub fn deposit_usdc(ctx: Context<DepositUsdc>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        
        require!(escrow.status == EscrowStatus::Pending, EscrowError::InvalidStatus);
        require!(!escrow.buyer_usdc_deposited, EscrowError::AlreadyDeposited);
        require!(
            ctx.accounts.buyer.key() == escrow.buyer,
            EscrowError::Unauthorized
        );
        
        // Transfer USDC from buyer to escrow PDA
        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer_usdc_account.to_account_info(),
            to: ctx.accounts.escrow_usdc_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, escrow.usdc_amount)?;
        
        escrow.buyer_usdc_deposited = true;
        
        msg!("USDC deposited: {} tokens", escrow.usdc_amount);
        Ok(())
    }

    /// Deposit NFT into escrow
    pub fn deposit_nft(ctx: Context<DepositNft>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        
        require!(escrow.status == EscrowStatus::Pending, EscrowError::InvalidStatus);
        require!(!escrow.seller_nft_deposited, EscrowError::AlreadyDeposited);
        require!(
            ctx.accounts.seller.key() == escrow.seller,
            EscrowError::Unauthorized
        );
        require!(
            ctx.accounts.nft_mint.key() == escrow.nft_mint,
            EscrowError::InvalidNftMint
        );
        
        // Transfer NFT from seller to escrow PDA
        let cpi_accounts = Transfer {
            from: ctx.accounts.seller_nft_account.to_account_info(),
            to: ctx.accounts.escrow_nft_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, 1)?; // NFTs have amount of 1
        
        escrow.seller_nft_deposited = true;
        
        msg!("NFT deposited successfully");
        Ok(())
    }

    /// Settle the escrow and exchange assets with fee distribution
    pub fn settle(ctx: Context<Settle>, platform_fee_bps: u16) -> Result<()> {
        let escrow = &ctx.accounts.escrow_state;
        
        require!(escrow.status == EscrowStatus::Pending, EscrowError::InvalidStatus);
        require!(escrow.buyer_usdc_deposited, EscrowError::DepositNotComplete);
        require!(escrow.seller_nft_deposited, EscrowError::DepositNotComplete);
        require!(
            Clock::get()?.unix_timestamp <= escrow.expiry_timestamp,
            EscrowError::Expired
        );
        require!(platform_fee_bps <= 10000, EscrowError::InvalidFeeBps);
        
        let escrow_id = escrow.escrow_id;
        let bump = escrow.bump;
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let seeds = &[
            b"escrow",
            escrow_id_bytes.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];
        
        // Calculate fee distribution
        let total_amount = escrow.usdc_amount;
        let platform_fee = (total_amount as u128)
            .checked_mul(platform_fee_bps as u128)
            .ok_or(EscrowError::CalculationOverflow)?
            .checked_div(10000)
            .ok_or(EscrowError::CalculationOverflow)? as u64;
        let seller_amount = total_amount
            .checked_sub(platform_fee)
            .ok_or(EscrowError::CalculationOverflow)?;
        
        msg!("Settlement - Total: {}, Fee: {}, Seller: {}", total_amount, platform_fee, seller_amount);
        
        // Transfer fee to platform fee collector (if fee > 0)
        if platform_fee > 0 {
            let fee_transfer_accounts = Transfer {
                from: ctx.accounts.escrow_usdc_account.to_account_info(),
                to: ctx.accounts.fee_collector_usdc_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let fee_cpi_program = ctx.accounts.token_program.to_account_info();
            let fee_cpi_ctx = CpiContext::new_with_signer(
                fee_cpi_program,
                fee_transfer_accounts,
                signer,
            );
            token::transfer(fee_cpi_ctx, platform_fee)?;
            msg!("Platform fee transferred: {}", platform_fee);
        }
        
        // Transfer remaining USDC to seller
        let usdc_transfer_accounts = Transfer {
            from: ctx.accounts.escrow_usdc_account.to_account_info(),
            to: ctx.accounts.seller_usdc_account.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        };
        let usdc_cpi_program = ctx.accounts.token_program.to_account_info();
        let usdc_cpi_ctx = CpiContext::new_with_signer(
            usdc_cpi_program,
            usdc_transfer_accounts,
            signer,
        );
        token::transfer(usdc_cpi_ctx, seller_amount)?;
        msg!("Seller payment transferred: {}", seller_amount);
        
        // Transfer NFT to buyer
        let nft_transfer_accounts = Transfer {
            from: ctx.accounts.escrow_nft_account.to_account_info(),
            to: ctx.accounts.buyer_nft_account.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        };
        let nft_cpi_program = ctx.accounts.token_program.to_account_info();
        let nft_cpi_ctx = CpiContext::new_with_signer(
            nft_cpi_program,
            nft_transfer_accounts,
            signer,
        );
        token::transfer(nft_cpi_ctx, 1)?;
        msg!("NFT transferred to buyer");
        
        let escrow_mut = &mut ctx.accounts.escrow_state;
        escrow_mut.status = EscrowStatus::Completed;
        
        msg!("Escrow settled successfully with fee distribution");
        Ok(())
    }

    /// Cancel escrow if expired
    pub fn cancel_if_expired(ctx: Context<CancelIfExpired>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_state;
        
        require!(escrow.status == EscrowStatus::Pending, EscrowError::InvalidStatus);
        require!(
            Clock::get()?.unix_timestamp > escrow.expiry_timestamp,
            EscrowError::NotExpired
        );
        
        let escrow_id = escrow.escrow_id;
        let bump = escrow.bump;
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let seeds = &[
            b"escrow",
            escrow_id_bytes.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];
        
        // Return USDC to buyer if deposited
        if escrow.buyer_usdc_deposited {
            let usdc_transfer_accounts = Transfer {
                from: ctx.accounts.escrow_usdc_account.to_account_info(),
                to: ctx.accounts.buyer_usdc_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let usdc_cpi_program = ctx.accounts.token_program.to_account_info();
            let usdc_cpi_ctx = CpiContext::new_with_signer(
                usdc_cpi_program,
                usdc_transfer_accounts,
                signer,
            );
            token::transfer(usdc_cpi_ctx, escrow.usdc_amount)?;
        }
        
        // Return NFT to seller if deposited
        if escrow.seller_nft_deposited {
            let nft_transfer_accounts = Transfer {
                from: ctx.accounts.escrow_nft_account.to_account_info(),
                to: ctx.accounts.seller_nft_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let nft_cpi_program = ctx.accounts.token_program.to_account_info();
            let nft_cpi_ctx = CpiContext::new_with_signer(
                nft_cpi_program,
                nft_transfer_accounts,
                signer,
            );
            token::transfer(nft_cpi_ctx, 1)?;
        }
        
        let escrow_mut = &mut ctx.accounts.escrow_state;
        escrow_mut.status = EscrowStatus::Cancelled;
        
        msg!("Escrow cancelled due to expiration");
        Ok(())
    }

    /// Admin cancel escrow (emergency)
    pub fn admin_cancel(ctx: Context<AdminCancel>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_state;
        
        require!(escrow.status == EscrowStatus::Pending, EscrowError::InvalidStatus);
        require!(
            ctx.accounts.admin.key() == escrow.admin,
            EscrowError::Unauthorized
        );
        
        let escrow_id = escrow.escrow_id;
        let bump = escrow.bump;
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let seeds = &[
            b"escrow",
            escrow_id_bytes.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];
        
        // Return USDC to buyer if deposited
        if escrow.buyer_usdc_deposited {
            let usdc_transfer_accounts = Transfer {
                from: ctx.accounts.escrow_usdc_account.to_account_info(),
                to: ctx.accounts.buyer_usdc_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let usdc_cpi_program = ctx.accounts.token_program.to_account_info();
            let usdc_cpi_ctx = CpiContext::new_with_signer(
                usdc_cpi_program,
                usdc_transfer_accounts,
                signer,
            );
            token::transfer(usdc_cpi_ctx, escrow.usdc_amount)?;
        }
        
        // Return NFT to seller if deposited
        if escrow.seller_nft_deposited {
            let nft_transfer_accounts = Transfer {
                from: ctx.accounts.escrow_nft_account.to_account_info(),
                to: ctx.accounts.seller_nft_account.to_account_info(),
                authority: ctx.accounts.escrow_state.to_account_info(),
            };
            let nft_cpi_program = ctx.accounts.token_program.to_account_info();
            let nft_cpi_ctx = CpiContext::new_with_signer(
                nft_cpi_program,
                nft_transfer_accounts,
                signer,
            );
            token::transfer(nft_cpi_ctx, 1)?;
        }
        
        let escrow_mut = &mut ctx.accounts.escrow_state;
        escrow_mut.status = EscrowStatus::Cancelled;
        
        msg!("Escrow cancelled by admin");
        Ok(())
    }
}

// Account Structures

#[derive(Accounts)]
#[instruction(escrow_id: u64)]
pub struct InitAgreement<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"escrow", escrow_id.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    /// CHECK: Buyer address is validated by storing in escrow state
    pub buyer: UncheckedAccount<'info>,
    
    /// CHECK: Seller address is validated by storing in escrow state
    pub seller: UncheckedAccount<'info>,
    
    pub nft_mint: Account<'info, Mint>,
    
    /// Admin pays for escrow account creation
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositUsdc<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    #[account(
        mut,
        constraint = buyer_usdc_account.owner == buyer.key()
    )]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositNft<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == seller.key()
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = seller,
        associated_token::mint = nft_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    pub nft_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_usdc_account.owner == escrow_state.seller
    )]
    pub seller_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = buyer_nft_account.owner == escrow_state.buyer
    )]
    pub buyer_nft_account: Account<'info, TokenAccount>,
    
    /// Platform fee collector USDC account
    #[account(mut)]
    pub fee_collector_usdc_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelIfExpired<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = buyer_usdc_account.owner == escrow_state.buyer
    )]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == escrow_state.seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminCancel<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_state.escrow_id.to_le_bytes().as_ref()],
        bump = escrow_state.bump,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    pub admin: Signer<'info>,
    
    #[account(mut)]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = buyer_usdc_account.owner == escrow_state.buyer
    )]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == escrow_state.seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

// State Account

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub escrow_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub usdc_amount: u64,
    pub nft_mint: Pubkey,
    pub buyer_usdc_deposited: bool,
    pub seller_nft_deposited: bool,
    pub status: EscrowStatus,
    pub expiry_timestamp: i64,
    pub bump: u8,
    pub admin: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Pending,
    Completed,
    Cancelled,
}

// Errors

#[error_code]
pub enum EscrowError {
    #[msg("Invalid amount provided")]
    InvalidAmount,
    
    #[msg("Invalid expiry timestamp")]
    InvalidExpiry,
    
    #[msg("Invalid escrow status for this operation")]
    InvalidStatus,
    
    #[msg("Assets already deposited")]
    AlreadyDeposited,
    
    #[msg("Unauthorized to perform this action")]
    Unauthorized,
    
    #[msg("Invalid NFT mint address")]
    InvalidNftMint,
    
    #[msg("Deposits not complete")]
    DepositNotComplete,
    
    #[msg("Escrow has expired")]
    Expired,
    
    #[msg("Escrow has not expired yet")]
    NotExpired,
    
    #[msg("Invalid fee basis points (must be <= 10000)")]
    InvalidFeeBps,
    
    #[msg("Calculation overflow")]
    CalculationOverflow,
}

