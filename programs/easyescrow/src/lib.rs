use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod easyescrow {
    use super::*;

    /// Initialize a new escrow agreement
    pub fn init_agreement(
        ctx: Context<InitAgreement>,
        escrow_id: u64,
        usdc_amount: u64,
        nft_mint: Pubkey,
        expiry_timestamp: i64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        // Validate inputs
        require!(usdc_amount > 0, ErrorCode::InvalidAmount);
        require!(expiry_timestamp > Clock::get()?.unix_timestamp, ErrorCode::InvalidExpiry);
        
        // Initialize escrow state
        escrow.escrow_id = escrow_id;
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.seller = ctx.accounts.seller.key();
        escrow.usdc_amount = usdc_amount;
        escrow.nft_mint = nft_mint;
        escrow.nft_token_account = ctx.accounts.nft_token_account.key();
        escrow.status = EscrowStatus::Pending;
        escrow.expiry_timestamp = expiry_timestamp;
        escrow.bump = *ctx.bumps.get("escrow").unwrap();
        
        msg!("Escrow agreement initialized with ID: {}", escrow_id);
        Ok(())
    }

    /// Deposit USDC into the escrow
    pub fn deposit_usdc(ctx: Context<DepositUsdc>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        
        // Validate escrow is in pending status
        require!(escrow.status == EscrowStatus::Pending, ErrorCode::InvalidStatus);
        
        // Validate the depositor is the buyer
        require!(ctx.accounts.buyer.key() == escrow.buyer, ErrorCode::Unauthorized);
        
        // Transfer USDC from buyer to escrow
        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer_usdc_account.to_account_info(),
            to: ctx.accounts.escrow_usdc_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, escrow.usdc_amount)?;
        
        msg!("USDC deposited into escrow: {}", escrow.usdc_amount);
        Ok(())
    }

    /// Deposit NFT into the escrow
    pub fn deposit_nft(ctx: Context<DepositNft>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        
        // Validate escrow is in pending status
        require!(escrow.status == EscrowStatus::Pending, ErrorCode::InvalidStatus);
        
        // Validate the depositor is the seller
        require!(ctx.accounts.seller.key() == escrow.seller, ErrorCode::Unauthorized);
        
        // Validate the NFT mint matches
        require!(ctx.accounts.nft_mint.key() == escrow.nft_mint, ErrorCode::InvalidNftMint);
        
        // Transfer NFT from seller to escrow
        let cpi_accounts = Transfer {
            from: ctx.accounts.seller_nft_account.to_account_info(),
            to: ctx.accounts.escrow_nft_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, 1)?; // NFTs are typically 1 token
        
        msg!("NFT deposited into escrow");
        Ok(())
    }

    /// Settle the escrow (transfer USDC to seller, NFT to buyer)
    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        // Validate escrow is in pending status
        require!(escrow.status == EscrowStatus::Pending, ErrorCode::InvalidStatus);
        
        // Validate both assets are deposited
        require!(escrow.usdc_amount > 0, ErrorCode::UsdcNotDeposited);
        
        // Transfer USDC from escrow to seller
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_usdc_account.to_account_info(),
            to: ctx.accounts.seller_usdc_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, escrow.usdc_amount)?;
        
        // Transfer NFT from escrow to buyer
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_nft_account.to_account_info(),
            to: ctx.accounts.buyer_nft_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, 1)?; // NFTs are typically 1 token
        
        // Update escrow status
        escrow.status = EscrowStatus::Completed;
        
        msg!("Escrow settled successfully");
        Ok(())
    }

    /// Cancel escrow if expired (return assets to original owners)
    pub fn cancel_if_expired(ctx: Context<CancelIfExpired>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        // Validate escrow is in pending status
        require!(escrow.status == EscrowStatus::Pending, ErrorCode::InvalidStatus);
        
        // Check if expired
        require!(
            Clock::get()?.unix_timestamp > escrow.expiry_timestamp,
            ErrorCode::NotExpired
        );
        
        // Return USDC to buyer if deposited
        if escrow.usdc_amount > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.escrow_usdc_account.to_account_info(),
                to: ctx.accounts.buyer_usdc_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            
            token::transfer(cpi_ctx, escrow.usdc_amount)?;
        }
        
        // Return NFT to seller if deposited
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_nft_account.to_account_info(),
            to: ctx.accounts.seller_nft_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, 1)?; // NFTs are typically 1 token
        
        // Update escrow status
        escrow.status = EscrowStatus::Cancelled;
        
        msg!("Escrow cancelled due to expiry");
        Ok(())
    }

    /// Admin cancel (emergency cancellation)
    pub fn admin_cancel(ctx: Context<AdminCancel>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        
        // Validate escrow is in pending status
        require!(escrow.status == EscrowStatus::Pending, ErrorCode::InvalidStatus);
        
        // Return USDC to buyer if deposited
        if escrow.usdc_amount > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.escrow_usdc_account.to_account_info(),
                to: ctx.accounts.buyer_usdc_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            
            token::transfer(cpi_ctx, escrow.usdc_amount)?;
        }
        
        // Return NFT to seller if deposited
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_nft_account.to_account_info(),
            to: ctx.accounts.seller_nft_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, 1)?; // NFTs are typically 1 token
        
        // Update escrow status
        escrow.status = EscrowStatus::Cancelled;
        
        msg!("Escrow cancelled by admin");
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(escrow_id: u64)]
pub struct InitAgreement<'info> {
    #[account(
        init,
        payer = buyer,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"escrow", escrow_id.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub seller: UncheckedAccount<'info>,
    
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub nft_token_account: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositUsdc<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.escrow_id.to_le_bytes().as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    #[account(
        mut,
        constraint = buyer_usdc_account.owner == buyer.key(),
        constraint = buyer_usdc_account.mint == usdc_mint.key()
    )]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = escrow_usdc_account.owner == escrow.key(),
        constraint = escrow_usdc_account.mint == usdc_mint.key()
    )]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        constraint = usdc_mint.key() == spl_token::native_mint::id()
    )]
    pub usdc_mint: Account<'info, token::Mint>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DepositNft<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.escrow_id.to_le_bytes().as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == seller.key(),
        constraint = seller_nft_account.mint == nft_mint.key()
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = escrow_nft_account.owner == escrow.key(),
        constraint = escrow_nft_account.mint == nft_mint.key()
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        constraint = nft_mint.key() == escrow.nft_mint
    )]
    pub nft_mint: Account<'info, token::Mint>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.escrow_id.to_le_bytes().as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, EscrowState>,
    
    #[account(
        mut,
        constraint = escrow_usdc_account.owner == escrow.key()
    )]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_usdc_account.owner == escrow.seller
    )]
    pub seller_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = escrow_nft_account.owner == escrow.key()
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = buyer_nft_account.owner == escrow.buyer
    )]
    pub buyer_nft_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelIfExpired<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.escrow_id.to_le_bytes().as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, EscrowState>,
    
    #[account(
        mut,
        constraint = escrow_usdc_account.owner == escrow.key()
    )]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = buyer_usdc_account.owner == escrow.buyer
    )]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = escrow_nft_account.owner == escrow.key()
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == escrow.seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminCancel<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.escrow_id.to_le_bytes().as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, EscrowState>,
    
    #[account(
        mut,
        constraint = escrow_usdc_account.owner == escrow.key()
    )]
    pub escrow_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = buyer_usdc_account.owner == escrow.buyer
    )]
    pub buyer_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = escrow_nft_account.owner == escrow.key()
    )]
    pub escrow_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_nft_account.owner == escrow.seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    /// CHECK: Admin authority - in production this should be a multisig
    pub admin: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub escrow_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub usdc_amount: u64,
    pub nft_mint: Pubkey,
    pub nft_token_account: Pubkey,
    pub status: EscrowStatus,
    pub expiry_timestamp: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Pending,
    Completed,
    Cancelled,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid expiry timestamp")]
    InvalidExpiry,
    #[msg("Invalid status")]
    InvalidStatus,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid NFT mint")]
    InvalidNftMint,
    #[msg("USDC not deposited")]
    UsdcNotDeposited,
    #[msg("Not expired")]
    NotExpired,
}