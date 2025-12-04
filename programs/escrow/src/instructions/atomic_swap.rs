use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use crate::state::Treasury;
use crate::errors::AtomicSwapError;

/// Maximum swap ID length
const MAX_SWAP_ID_LEN: usize = 64;

/// Maximum platform fee (0.5 SOL = 500_000_000 lamports)
const MAX_PLATFORM_FEE: u64 = 500_000_000;

/// Bubblegum program ID for cNFT transfers
const BUBBLEGUM_PROGRAM_ID: Pubkey = mpl_bubblegum::ID;

/// Authorized apps that can perform zero-fee swaps
/// Add your trusted app public keys here
/// 
/// SECURITY: Only whitelisted apps can execute swaps with platform_fee = 0
/// This prevents unauthorized parties from bypassing platform fees
fn get_zero_fee_authorized_apps() -> Vec<Pubkey> {
    vec![
        // Staging backend admin (498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R)
        // Used by staging backend to sign zero-fee swaps when valid API key provided
        Pubkey::new_from_array([
            0x2e, 0xa7, 0xec, 0x9b, 0xaa, 0xe0, 0xb3, 0xea,
            0xa4, 0x76, 0xd3, 0x1c, 0x53, 0x77, 0xfa, 0x65,
            0xb7, 0x39, 0x8f, 0xa5, 0x1e, 0x26, 0x5e, 0x0b,
            0x9d, 0xe3, 0xdd, 0x7f, 0xc2, 0x01, 0x3a, 0xc2,
        ]),
        // Production backend admin (HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2)
        // Used by production backend to sign zero-fee swaps when valid API key provided
        Pubkey::new_from_array([
            0xf1, 0xca, 0xdb, 0x11, 0xef, 0x69, 0xa6, 0xf9,
            0xc4, 0x71, 0x95, 0x46, 0xaf, 0x05, 0x86, 0x9f,
            0x27, 0x3c, 0x80, 0x4f, 0xff, 0xa4, 0xa8, 0x48,
            0xf6, 0x6c, 0xf3, 0x67, 0xbe, 0x23, 0x45, 0xad,
        ]),
    ]
}

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
    
    /// Merkle proof path (array of sibling hashes from leaf to root)
    /// Required for Bubblegum verification via remaining accounts
    pub proof: Vec<[u8; 32]>,
    
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
    /// Maker's NFT token account (optional - validated in handler based on params)
    #[account(mut)]
    pub maker_nft_account: Option<Account<'info, anchor_spl::token::TokenAccount>>,
    
    /// Taker's destination for maker's NFT (optional)
    #[account(mut)]
    pub taker_nft_destination: Option<Account<'info, anchor_spl::token::TokenAccount>>,
    
    /// Taker's NFT token account (optional - validated in handler based on params)
    #[account(mut)]
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
    
    /// Optional: Authorized app signer for zero-fee swaps
    /// Must sign transaction to prove ownership
    pub authorized_app: Option<Signer<'info>>,
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
    /// Can be 0 if authorized_app_id is provided and whitelisted
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
    
    // Validate parameters including zero-fee authorization
    validate_params(&params, ctx.accounts.authorized_app.as_ref())?;
    
    // Validate NFT accounts if NFTs are being sent
    if params.maker_sends_nft {
        let maker_nft = ctx.accounts.maker_nft_account
            .as_ref()
            .ok_or(AtomicSwapError::InvalidTokenAccount)?;
        require!(maker_nft.amount == 1, AtomicSwapError::InvalidTokenAccount);
        require!(maker_nft.owner == ctx.accounts.maker.key(), AtomicSwapError::MakerAssetOwnershipFailed);
    }
    
    if params.taker_sends_nft {
        let taker_nft = ctx.accounts.taker_nft_account
            .as_ref()
            .ok_or(AtomicSwapError::InvalidTokenAccount)?;
        require!(taker_nft.amount == 1, AtomicSwapError::InvalidTokenAccount);
        require!(taker_nft.owner == ctx.accounts.taker.key(), AtomicSwapError::TakerAssetOwnershipFailed);
    }
    
    msg!("Executing atomic swap: {}", params.swap_id);
    msg!("Maker: {}", ctx.accounts.maker.key());
    msg!("Taker: {}", ctx.accounts.taker.key());
    msg!("Platform fee: {} lamports", params.platform_fee);
    
    // Step 1: Collect platform fee from taker to treasury (if non-zero)
    if params.platform_fee > 0 {
        collect_platform_fee(
            &ctx.accounts.taker.to_account_info(),
            &treasury.to_account_info(),
            &ctx.accounts.system_program,
            params.platform_fee,
        )?;
        
        msg!("Platform fee collected: {} lamports", params.platform_fee);
    } else {
        msg!("Zero-fee swap - no fee collected");
    }
    
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

/// Validate swap parameters including zero-fee authorization
fn validate_params(params: &SwapParams, authorized_app: Option<&Signer>) -> Result<()> {
    // Check if this is a zero-fee swap (requires authorization)
    if params.platform_fee == 0 {
        // Zero-fee swaps require an authorized app SIGNER (proves ownership)
        let app_signer = authorized_app.ok_or(AtomicSwapError::UnauthorizedZeroFeeSwap)?;
        
        // Check if app signer is in whitelist
        let authorized_apps = get_zero_fee_authorized_apps();
        require!(
            authorized_apps.contains(&app_signer.key()),
            AtomicSwapError::UnauthorizedZeroFeeSwap
        );
        
        msg!("Zero-fee swap authorized for app: {}", app_signer.key());
    }
    
    // Validate fee doesn't exceed maximum
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
    
    // Validate mutual exclusivity: Cannot send both standard NFT and cNFT
    require!(
        !(params.maker_sends_nft && params.maker_sends_cnft),
        AtomicSwapError::ConflictingAssetFlags
    );
    require!(
        !(params.taker_sends_nft && params.taker_sends_cnft),
        AtomicSwapError::ConflictingAssetFlags
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
    
    // Build Bubblegum transfer CPI (v1.4.0 API)
    // CRITICAL: In atomic swaps, both maker and taker ARE signers
    // Must mark leaf_owner and leaf_delegate as signers (true)
    //
    // NOTE: Proof nodes are NOT passed as remaining accounts here.
    // With canopy depth 11 (standard for our trees), Bubblegum reads proof nodes
    // directly from the on-chain canopy storage. The proof field in CnftProof
    // is kept for compatibility but currently unused by the transfer.
    //
    // If trees without sufficient canopy are used, proof nodes would need to be
    // passed as remaining accounts. This is a TODO for future enhancement.
    mpl_bubblegum::instructions::TransferCpiBuilder::new(bubblegum_program)
        .tree_config(tree_authority)
        .leaf_owner(from, true)  // Mark as signer (maker/taker both sign in atomic swaps)
        .leaf_delegate(from, true)  // Mark as signer
        .new_leaf_owner(to)
        .merkle_tree(merkle_tree)
        .log_wrapper(log_wrapper)
        .compression_program(compression_program)
        .system_program(system_program)
        .root(proof.root)
        .data_hash(proof.data_hash)
        .creator_hash(proof.creator_hash)
        .nonce(proof.nonce)
        .index(proof.index)
        .invoke()?;
    
    msg!("cNFT transferred successfully");
    
    Ok(())
}

