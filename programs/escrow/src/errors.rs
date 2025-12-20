use anchor_lang::prelude::*;

#[error_code]
pub enum AtomicSwapError {
    #[msg("Unauthorized: Only platform authority can execute swaps")]
    Unauthorized,
    
    #[msg("Invalid fee: Platform fee must be greater than zero")]
    InvalidFee,
    
    #[msg("Invalid fee: Fee exceeds maximum allowed")]
    FeeTooHigh,
    
    #[msg("Invalid asset: Maker does not own the specified asset")]
    MakerAssetOwnershipFailed,
    
    #[msg("Invalid asset: Taker does not own the specified asset")]
    TakerAssetOwnershipFailed,
    
    #[msg("Insufficient balance: Maker has insufficient balance")]
    InsufficientMakerBalance,
    
    #[msg("Insufficient balance: Taker has insufficient balance")]
    InsufficientTakerBalance,
    
    #[msg("Invalid token account: Token account does not match expected mint")]
    InvalidTokenAccount,
    
    #[msg("Invalid merkle proof: cNFT ownership verification failed")]
    InvalidMerkleProof,
    
    #[msg("Too many assets: Maximum number of assets per side exceeded")]
    TooManyAssets,
    
    #[msg("Invalid swap ID: Swap ID exceeds maximum length")]
    InvalidSwapId,
    
    #[msg("Arithmetic overflow: Fee calculation overflowed")]
    ArithmeticOverflow,
    
    #[msg("Program is paused: All operations are temporarily disabled")]
    ProgramPaused,
    
    #[msg("Program is already paused")]
    AlreadyPaused,
    
    #[msg("Program is not paused")]
    NotPaused,
    
    #[msg("Withdrawal too frequent: Must wait 7 days between withdrawals")]
    WithdrawalTooFrequent,
    
    #[msg("Insufficient treasury balance: Not enough funds to withdraw")]
    InsufficientTreasuryBalance,

    #[msg("Unauthorized withdrawal destination: Treasury can only withdraw to authorized wallet")]
    UnauthorizedWithdrawalDestination,
    
    #[msg("Invalid cNFT proof: Merkle proof validation failed")]
    InvalidCnftProof,
    
    #[msg("Missing required account: Bubblegum program")]
    MissingBubblegumProgram,
    
    #[msg("Missing required account: Merkle tree")]
    MissingMerkleTree,
    
    #[msg("Stale proof: Merkle root has changed since proof generation")]
    StaleProof,
    
    #[msg("Invalid asset flags: Cannot send both standard NFT and compressed NFT")]
    ConflictingAssetFlags,
    
    #[msg("Unauthorized: Zero-fee swaps require authorized app signature")]
    UnauthorizedZeroFeeSwap,
    
    #[msg("Missing required account: Core NFT asset")]
    MissingCoreAsset,
    
    #[msg("Missing required account: mpl-core program")]
    MissingMplCoreProgram,
    
    #[msg("Invalid mpl-core program: Program ID does not match expected")]
    InvalidMplCoreProgram,
    // Two-phase swap errors
    #[msg("Invalid amount: Amount must be greater than zero")]
    InvalidAmount,

    #[msg("Insufficient funds: Vault does not have enough balance")]
    InsufficientFunds,
}

