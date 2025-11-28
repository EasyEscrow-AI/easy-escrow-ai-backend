use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use crate::state::Treasury;
use crate::errors::AtomicSwapError;

/// Maximum swap ID length
const MAX_SWAP_ID_LEN: usize = 64;

/// Maximum platform fee (0.5 SOL = 500_000_000 lamports)
const MAX_PLATFORM_FEE: u64 = 500_000_000;

/// Bubblegum program ID for cNFT transfers
use anchor_lang::solana_program::pubkey;
const BUBBLEGUM_PROGRAM_ID: Pubkey = pubkey!("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");

/// cNFT Merkle proof for ownership verification
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CnftProof {
    /// Merkle tree root hash
    pub root: [u8; 32],
    
    /// Asset data hash
    pub data_hash: [u8; 32],
    
    /// Creator hash
    pub creator_hash: [u8; 32],
    
    /// Leaf nonce (for uniqueness)
    pub nonce: u64,
    
    /// Leaf index in the tree
    pub index: u32,
    
    // Future: Support for delegated transfers
    // pub leaf_delegate: Option<Pubkey>,
}

/// Execute atomic swap with platform fee collection
/// 
/// MVP Version: Supports 1 NFT per side + optional SOL
#[derive(Accounts)]
#[instruction(params: SwapParams)]
pub struct AtomicSwapWithFee<'info> {
    /// Maker (initiator of the swap)
    #[account(mut)]
    pub maker: Signer<'info>,
    
    /// Taker (accepter of the swap)
    #[account(mut)]
    pub taker: Signer<'info>,
    
    /// Platform authority (must sign for fee validation)
    pub platform_authority: Signer<'info>,
    
    /// Treasury PDA (receives platform fees)
    #[account(
        mut,
        seeds = [Treasury::SEED_PREFIX, platform_authority.key().as_ref()],
        bump = treasury.bump,
        constraint = treasury.authority == platform_authority.key() @ AtomicSwapError::Unauthorized
    )]
    pub treasury: Account<'info, Treasury>,
    
    /// Maker's NFT token account (optional - for NFT swaps)
    #[account(
        mut,
        constraint = maker_nft_account.amount == 1 @ AtomicSwapError::InvalidTokenAccount,
        constraint = maker_nft_account.owner == maker.key() @ AtomicSwapError::MakerAssetOwnershipFailed
    )]
    pub maker_nft_account: Option<Account<'info, anchor_spl::token::TokenAccount>>,
    
    /// Taker's destination for maker's NFT (optional)
    #[account(mut)]
    pub taker_nft_destination: Option<Account<'info, anchor_spl::token::TokenAccount>>,
    
    /// Taker's NFT token account (optional - for NFT swaps)
    #[account(
        mut,
        constraint = taker_nft_account.amount == 1 @ AtomicSwapError::InvalidTokenAccount,
        constraint = taker_nft_account.owner == taker.key() @ AtomicSwapError::TakerAssetOwnershipFailed
    )]
    pub taker_nft_account: Option<Account<'info, anchor_spl::token::TokenAccount>>,
    
    /// Maker's destination for taker's NFT (optional)
    #[account(mut)]
    pub maker_nft_destination: Option<Account<'info, anchor_spl::token::TokenAccount>>,
    
    /// Token program for SPL token transfers
    pub token_program: Program<'info, Token>,
    
    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
    
    // === cNFT Transfer Accounts (Optional) ===
    
    /// Maker's Merkle tree (for cNFT transfers)
    /// CHECK: Verified by Bubblegum CPI
    #[account(mut)]
    pub maker_merkle_tree: Option<AccountInfo<'info>>,
    
    /// Maker's tree authority PDA
    /// CHECK: Verified by Bubblegum CPI
    pub maker_tree_authority: Option<AccountInfo<'info>>,
    
    /// Taker's Merkle tree (for cNFT transfers)
    /// CHECK: Verified by Bubblegum CPI
    #[account(mut)]
    pub taker_merkle_tree: Option<AccountInfo<'info>>,
    
    /// Taker's tree authority PDA
    /// CHECK: Verified by Bubblegum CPI
    pub taker_tree_authority: Option<AccountInfo<'info>>,
    
    /// Bubblegum program for cNFT transfers
    /// CHECK: Program ID verified in instruction
    pub bubblegum_program: Option<AccountInfo<'info>>,
    
    /// SPL Account Compression program
    /// CHECK: Program ID verified by Bubblegum
    pub compression_program: Option<AccountInfo<'info>>,
    
    /// SPL Noop program (for logging)
    /// CHECK: Program ID verified by Bubblegum
    pub log_wrapper: Option<AccountInfo<'info>>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SwapParams {
    /// Whether maker is sending a standard NFT
    pub maker_sends_nft: bool,
    
    /// Whether taker is sending a standard NFT
    pub taker_sends_nft: bool,
    
    /// Whether maker is sending a compressed NFT
    pub maker_sends_cnft: bool,
    
    /// Whether taker is sending a compressed NFT
    pub taker_sends_cnft: bool,
    
    /// SOL amount maker is sending (in lamports)
    pub maker_sol_amount: u64,
    
    /// SOL amount taker is sending (in lamports)
    pub taker_sol_amount: u64,
    
    /// Platform fee in lamports (paid by taker)
    pub platform_fee: u64,
    
    /// Unique swap identifier for backend tracking (max 64 chars)
    pub swap_id: String,
    
    /// Maker's cNFT proof (if sending compressed NFT)
    pub maker_cnft_proof: Option<CnftProof>,
    
    /// Taker's cNFT proof (if sending compressed NFT)
    pub taker_cnft_proof: Option<CnftProof>,
}

pub fn atomic_swap_handler(ctx: Context<AtomicSwapWithFee>, params: SwapParams) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    
    // Check if program is paused
    require!(!treasury.is_paused, AtomicSwapError::ProgramPaused);
    
    // Validate parameters
    validate_params(&params)?;
    
    msg!("Executing atomic swap: {}", params.swap_id);
    msg!("Maker: {}", ctx.accounts.maker.key());
    msg!("Taker: {}", ctx.accounts.taker.key());
    msg!("Platform fee: {} lamports", params.platform_fee);
    
    // Step 1: Collect platform fee from taker to treasury
    collect_platform_fee(
        &ctx.accounts.taker.to_account_info(),
        &treasury.to_account_info(),
        &ctx.accounts.system_program,
        params.platform_fee,
    )?;
    
    msg!("Platform fee collected: {} lamports", params.platform_fee);
    
    // Step 2: Transfer maker's asset to taker
    if params.maker_sends_nft {
        // Standard NFT transfer
        if let (Some(maker_nft), Some(taker_dest)) = (
            &ctx.accounts.maker_nft_account,
            &ctx.accounts.taker_nft_destination,
        ) {
            anchor_spl::token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: maker_nft.to_account_info(),
                        to: taker_dest.to_account_info(),
                        authority: ctx.accounts.maker.to_account_info(),
                    },
                ),
                1, // NFT amount is always 1
            )?;
            
            msg!("Transferred maker standard NFT to taker");
        } else {
            return Err(AtomicSwapError::MakerAssetOwnershipFailed.into());
        }
    } else if params.maker_sends_cnft {
        // Compressed NFT transfer
        let proof = params.maker_cnft_proof.as_ref()
            .ok_or(AtomicSwapError::MissingMerkleTree)?;
        
        let merkle_tree = ctx.accounts.maker_merkle_tree.as_ref()
            .ok_or(AtomicSwapError::MissingMerkleTree)?;
        let tree_authority = ctx.accounts.maker_tree_authority.as_ref()
            .ok_or(AtomicSwapError::MissingMerkleTree)?;
        let bubblegum = ctx.accounts.bubblegum_program.as_ref()
            .ok_or(AtomicSwapError::MissingBubblegumProgram)?;
        let compression = ctx.accounts.compression_program.as_ref()
            .ok_or(AtomicSwapError::MissingBubblegumProgram)?;
        let log_wrapper = ctx.accounts.log_wrapper.as_ref()
            .ok_or(AtomicSwapError::MissingBubblegumProgram)?;
        
        transfer_cnft(
            &ctx.accounts.maker.to_account_info(),
            &ctx.accounts.taker.to_account_info(),
            merkle_tree,
            tree_authority,
            bubblegum,
            compression,
            log_wrapper,
            &ctx.accounts.system_program.to_account_info(),
            proof,
        )?;
        
        msg!("Transferred maker cNFT to taker");
    }
    
    // Step 3: Transfer taker's asset to maker
    if params.taker_sends_nft {
        // Standard NFT transfer
        if let (Some(taker_nft), Some(maker_dest)) = (
            &ctx.accounts.taker_nft_account,
            &ctx.accounts.maker_nft_destination,
        ) {
            anchor_spl::token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: taker_nft.to_account_info(),
                        to: maker_dest.to_account_info(),
                        authority: ctx.accounts.taker.to_account_info(),
                    },
                ),
                1, // NFT amount is always 1
            )?;
            
            msg!("Transferred taker standard NFT to maker");
        } else {
            return Err(AtomicSwapError::TakerAssetOwnershipFailed.into());
        }
    } else if params.taker_sends_cnft {
        // Compressed NFT transfer
        let proof = params.taker_cnft_proof.as_ref()
            .ok_or(AtomicSwapError::MissingMerkleTree)?;
        
        let merkle_tree = ctx.accounts.taker_merkle_tree.as_ref()
            .ok_or(AtomicSwapError::MissingMerkleTree)?;
        let tree_authority = ctx.accounts.taker_tree_authority.as_ref()
            .ok_or(AtomicSwapError::MissingMerkleTree)?;
        let bubblegum = ctx.accounts.bubblegum_program.as_ref()
            .ok_or(AtomicSwapError::MissingBubblegumProgram)?;
        let compression = ctx.accounts.compression_program.as_ref()
            .ok_or(AtomicSwapError::MissingBubblegumProgram)?;
        let log_wrapper = ctx.accounts.log_wrapper.as_ref()
            .ok_or(AtomicSwapError::MissingBubblegumProgram)?;
        
        transfer_cnft(
            &ctx.accounts.taker.to_account_info(),
            &ctx.accounts.maker.to_account_info(),
            merkle_tree,
            tree_authority,
            bubblegum,
            compression,
            log_wrapper,
            &ctx.accounts.system_program.to_account_info(),
            proof,
        )?;
        
        msg!("Transferred taker cNFT to maker");
    }
    
    // Step 4: Transfer SOL from maker to taker (if any)
    if params.maker_sol_amount > 0 {
        transfer_sol(
            &ctx.accounts.maker.to_account_info(),
            &ctx.accounts.taker.to_account_info(),
            &ctx.accounts.system_program,
            params.maker_sol_amount,
        )?;
        
        msg!("Transferred {} lamports from maker to taker", params.maker_sol_amount);
    }
    
    // Step 5: Transfer SOL from taker to maker (if any)
    if params.taker_sol_amount > 0 {
        transfer_sol(
            &ctx.accounts.taker.to_account_info(),
            &ctx.accounts.maker.to_account_info(),
            &ctx.accounts.system_program,
            params.taker_sol_amount,
        )?;
        
        msg!("Transferred {} lamports from taker to maker", params.taker_sol_amount);
    }
    
    // Step 6: Update treasury statistics
    treasury.total_fees_collected = treasury
        .total_fees_collected
        .checked_add(params.platform_fee)
        .ok_or(AtomicSwapError::ArithmeticOverflow)?;
    
    treasury.total_swaps_executed = treasury
        .total_swaps_executed
        .checked_add(1)
        .ok_or(AtomicSwapError::ArithmeticOverflow)?;
    
    msg!("Swap completed successfully!");
    msg!("Treasury total fees: {}", treasury.total_fees_collected);
    msg!("Treasury total swaps: {}", treasury.total_swaps_executed);
    
    Ok(())
}

/// Validate swap parameters
fn validate_params(params: &SwapParams) -> Result<()> {
    // Validate fee
    require!(params.platform_fee > 0, AtomicSwapError::InvalidFee);
    require!(
        params.platform_fee <= MAX_PLATFORM_FEE,
        AtomicSwapError::FeeTooHigh
    );
    
    // Validate swap ID length
    require!(
        params.swap_id.len() <= MAX_SWAP_ID_LEN,
        AtomicSwapError::InvalidSwapId
    );
    
    // Validate that at least one asset is being swapped
    require!(
        params.maker_sends_nft || params.taker_sends_nft || 
        params.maker_sends_cnft || params.taker_sends_cnft ||
        params.maker_sol_amount > 0 || params.taker_sol_amount > 0,
        AtomicSwapError::InvalidFee
    );
    
    Ok(())
}

/// Collect platform fee from taker to treasury
fn collect_platform_fee<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    amount: u64,
) -> Result<()> {
    let cpi_context = CpiContext::new(
        system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: from.clone(),
            to: to.clone(),
        },
    );
    
    anchor_lang::system_program::transfer(cpi_context, amount)?;
    
    Ok(())
}

/// Transfer SOL between accounts
fn transfer_sol<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    amount: u64,
) -> Result<()> {
    let cpi_context = CpiContext::new(
        system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: from.clone(),
            to: to.clone(),
        },
    );
    
    anchor_lang::system_program::transfer(cpi_context, amount)?;
    
    Ok(())
}

/// Transfer a compressed NFT using Bubblegum CPI
fn transfer_cnft<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    merkle_tree: &AccountInfo<'info>,
    tree_authority: &AccountInfo<'info>,
    bubblegum_program: &AccountInfo<'info>,
    compression_program: &AccountInfo<'info>,
    log_wrapper: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    proof: &CnftProof,
) -> Result<()> {
    // Verify Bubblegum program ID
    require!(
        bubblegum_program.key() == BUBBLEGUM_PROGRAM_ID,
        AtomicSwapError::InvalidCnftProof
    );
    
    msg!("Transferring cNFT via Bubblegum");
    msg!("  From: {}", from.key());
    msg!("  To: {}", to.key());
    msg!("  Tree: {}", merkle_tree.key());
    msg!("  Leaf Index: {}", proof.index);
    msg!("  Proof Root: {:?}", &proof.root[..8]);  // First 8 bytes for brevity
    
    // Create Bubblegum transfer CPI context (v0.7.0 API)
    let cpi_ctx = CpiContext::new(
        bubblegum_program.clone(),
        mpl_bubblegum::cpi::accounts::Transfer {
            tree_authority: tree_authority.clone(),
            leaf_owner: from.clone(),
            leaf_delegate: from.clone(),  // Owner is delegate for non-delegated NFTs
            new_leaf_owner: to.clone(),
            merkle_tree: merkle_tree.clone(),
            log_wrapper: log_wrapper.clone(),
            compression_program: compression_program.clone(),
            system_program: system_program.clone(),
        },
    );
    
    // Call Bubblegum transfer instruction
    mpl_bubblegum::cpi::transfer(
        cpi_ctx,
        proof.root,
        proof.data_hash,
        proof.creator_hash,
        proof.nonce,
        proof.index,
    )?;
    
    msg!("cNFT transferred successfully");
    
    Ok(())
}

