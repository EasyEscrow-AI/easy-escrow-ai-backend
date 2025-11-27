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
}

