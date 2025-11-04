# SOL Migration Architecture Design

## Overview
This document outlines the architecture for migrating from USDC-based escrow to SOL-based escrow with support for three swap types.

## Swap Types

### 1. NFT <> SOL Swap
**Description:** Direct swap where buyer pays SOL for seller's NFT

**Flow:**
1. Seller lists NFT for X SOL
2. Buyer deposits X SOL (escrow PDA holds SOL)
3. Seller deposits NFT (escrow PDA holds NFT)
4. Settlement:
   - Calculate platform fee from SOL amount
   - Transfer fee to platform collector
   - Transfer remaining SOL to seller
   - Transfer NFT to buyer

**Accounts Needed:**
- Escrow state PDA (holds SOL via lamports)
- Escrow NFT token account (ATA)
- Platform fee collector (receives SOL)

### 2. NFT <> NFT Swap (Fee in SOL)
**Description:** NFT-for-NFT swap where buyer pays commission fee separately in SOL

**Flow:**
1. Seller lists NFT A for NFT B
2. Buyer deposits NFT B + fee amount in SOL
3. Seller deposits NFT A
4. Settlement:
   - Transfer fee (SOL) to platform collector
   - Transfer NFT A to buyer
   - Transfer NFT B to seller

**Accounts Needed:**
- Escrow state PDA (holds SOL fee via lamports)
- Escrow NFT A token account (ATA)
- Escrow NFT B token account (ATA)
- Platform fee collector (receives SOL)

### 3. NFT <> NFT+SOL Swap (Fee Extracted from SOL)
**Description:** Complex swap where buyer pays NFT + SOL, and fee is deducted from SOL amount

**Flow:**
1. Seller lists NFT A for NFT B + Y SOL
2. Buyer deposits NFT B + Y SOL
3. Seller deposits NFT A
4. Settlement:
   - Calculate platform fee from Y SOL
   - Transfer fee to platform collector
   - Transfer (Y - fee) SOL to seller
   - Transfer NFT A to buyer
   - Transfer NFT B to seller

**Accounts Needed:**
- Escrow state PDA (holds SOL via lamports)
- Escrow NFT A token account (ATA)
- Escrow NFT B token account (ATA)
- Platform fee collector (receives SOL)

## State Account Structure

### New EscrowState
```rust
#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub escrow_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    
    // Swap type determines which fields are used
    pub swap_type: SwapType, // NEW: Enum to identify swap type
    
    // SOL amount (if applicable to swap type)
    pub sol_amount: u64, // NEW: Replaces usdc_amount
    
    // NFT mints (one or two depending on swap type)
    pub nft_a_mint: Pubkey, // Seller's NFT
    pub nft_b_mint: Option<Pubkey>, // NEW: Buyer's NFT (for NFT<>NFT swaps)
    
    // Platform fee configuration
    pub platform_fee_bps: u16,
    pub fee_payer: FeePayer, // NEW: Who pays the fee (buyer/seller)
    
    // Deposit tracking
    pub buyer_sol_deposited: bool, // NEW
    pub buyer_nft_deposited: bool, // NEW
    pub seller_nft_deposited: bool,
    
    // Status and metadata
    pub status: EscrowStatus,
    pub expiry_timestamp: i64,
    pub bump: u8,
    pub admin: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum SwapType {
    NftForSol,        // NFT <> SOL
    NftForNftWithFee, // NFT <> NFT (fee in SOL)
    NftForNftPlusSol, // NFT <> NFT+SOL (fee from SOL)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum FeePayer {
    Buyer,  // Default
    Seller,
}
```

## Instructions

### 1. `init_agreement_v2`
**Purpose:** Initialize escrow with swap type specification

**Parameters:**
- `escrow_id: u64`
- `swap_type: SwapType`
- `sol_amount: Option<u64>` (only for SOL-involving swaps)
- `nft_a_mint: Pubkey` (seller's NFT)
- `nft_b_mint: Option<Pubkey>` (buyer's NFT for NFT<>NFT swaps)
- `expiry_timestamp: i64`
- `platform_fee_bps: u16`
- `fee_payer: FeePayer`

**Validation:**
- Admin authorization check
- SOL amount validation (min/max limits)
- Swap type and parameter consistency check

### 2. `deposit_sol`
**Purpose:** Buyer deposits SOL into escrow PDA

**Accounts:**
- Escrow state (mut, PDA)
- Buyer (signer, mut) - SOL comes from here
- System program

**Logic:**
- Transfer SOL from buyer to escrow PDA using system program
- Mark `buyer_sol_deposited = true`

### 3. `deposit_buyer_nft`
**Purpose:** Buyer deposits NFT (for NFT<>NFT swaps)

**Accounts:**
- Escrow state (mut, PDA)
- Buyer (signer, mut)
- Buyer NFT token account (mut)
- Escrow NFT B token account (mut, ATA, init_if_needed)
- NFT B mint
- Token program, ATA program, System program

**Logic:**
- Transfer NFT from buyer to escrow PDA
- Mark `buyer_nft_deposited = true`

### 4. `deposit_seller_nft`
**Purpose:** Seller deposits NFT (all swap types)

**Accounts:**
- Escrow state (mut, PDA)
- Seller (signer, mut)
- Seller NFT token account (mut)
- Escrow NFT A token account (mut, ATA, init_if_needed)
- NFT A mint
- Token program, ATA program, System program

**Logic:**
- Transfer NFT from seller to escrow PDA
- Mark `seller_nft_deposited = true`

### 5. `settle_v2`
**Purpose:** Settle escrow based on swap type

**Logic depends on swap_type:**

**For NftForSol:**
1. Verify SOL deposited, NFT A deposited
2. Calculate fee from sol_amount
3. Transfer fee (SOL) to platform collector
4. Transfer remaining SOL to seller
5. Transfer NFT A to buyer
6. Mark status = Completed

**For NftForNftWithFee:**
1. Verify SOL fee deposited, NFT A deposited, NFT B deposited
2. Transfer fee (SOL) to platform collector
3. Transfer NFT A to buyer
4. Transfer NFT B to seller
5. Mark status = Completed

**For NftForNftPlusSol:**
1. Verify SOL deposited, NFT A deposited, NFT B deposited
2. Calculate fee from sol_amount
3. Transfer fee (SOL) to platform collector
4. Transfer remaining SOL to seller
5. Transfer NFT A to buyer
6. Transfer NFT B to seller
7. Mark status = Completed

### 6. `cancel_if_expired_v2`
**Purpose:** Cancel and refund based on what was deposited

**Logic:**
- Return SOL to buyer if deposited
- Return NFT A to seller if deposited
- Return NFT B to buyer if deposited

### 7. `admin_cancel_v2`
**Purpose:** Admin emergency cancel with full refunds

## SOL Transfer Mechanism

### Using System Program
```rust
use anchor_lang::system_program::{transfer, Transfer as SystemTransfer};

// Transfer SOL from buyer to escrow PDA
let transfer_ctx = CpiContext::new(
    ctx.accounts.system_program.to_account_info(),
    SystemTransfer {
        from: ctx.accounts.buyer.to_account_info(),
        to: ctx.accounts.escrow_state.to_account_info(),
    },
);
transfer(transfer_ctx, sol_amount)?;

// Transfer SOL from escrow PDA to recipient (with PDA signer)
let seeds = &[
    b"escrow",
    escrow_id_bytes.as_ref(),
    &[bump],
];
let signer = &[&seeds[..]];

let transfer_ctx = CpiContext::new_with_signer(
    ctx.accounts.system_program.to_account_info(),
    SystemTransfer {
        from: ctx.accounts.escrow_state.to_account_info(),
        to: ctx.accounts.recipient.to_account_info(),
    },
    signer,
);
transfer(transfer_ctx, amount)?;
```

### Lamports Calculation
- SOL has 9 decimals (1 SOL = 1_000_000_000 lamports)
- Fee calculation: `fee_lamports = (total_lamports * fee_bps) / 10000`

## Fee Distribution

### Platform Fee Calculation
```rust
fn calculate_platform_fee(total_amount: u64, fee_bps: u16) -> Result<(u64, u64)> {
    let platform_fee = (total_amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(EscrowError::CalculationOverflow)?
        .checked_div(10000)
        .ok_or(EscrowError::CalculationOverflow)? as u64;
    
    let recipient_amount = total_amount
        .checked_sub(platform_fee)
        .ok_or(EscrowError::CalculationOverflow)?;
    
    Ok((platform_fee, recipient_amount))
}
```

### Fee Payer Logic
- **Buyer pays (default):** Fee deducted from buyer's payment
- **Seller pays:** Fee deducted from seller's receipt

## Minimum SOL Amounts

### New Limits (BETA)
```rust
// SOL has 9 decimals: 1 SOL = 1_000_000_000 lamports
const MIN_SOL_AMOUNT: u64 = 10_000_000;      // 0.01 SOL (~$2 at $200/SOL)
const MAX_SOL_AMOUNT: u64 = 15_000_000_000;  // 15 SOL (~$3000 at $200/SOL)
```

**Rationale:**
- Min: 0.01 SOL to cover rent + fees + prevent spam
- Max: 15 SOL maintains $3000 BETA limit at typical SOL prices

## Account Rent Considerations

### PDA Rent
- Escrow state PDA requires rent-exempt balance
- SOL held in PDA must exceed rent-exempt minimum
- On settlement/cancel, ensure rent is preserved for PDA closure

### Token Account Rent
- NFT ATAs still require ~0.002 SOL rent
- Platform continues to pay rent for user ATAs (existing pattern)

## Error Codes

### New Errors
```rust
#[error_code]
pub enum EscrowError {
    // ... existing errors ...
    
    #[msg("Invalid swap type for this operation")]
    InvalidSwapType,
    
    #[msg("SOL amount below minimum: 0.01 SOL (BETA limit)")]
    SolAmountTooLow,
    
    #[msg("SOL amount exceeds maximum: 15 SOL (BETA limit)")]
    SolAmountTooHigh,
    
    #[msg("Buyer's NFT not deposited")]
    BuyerNftNotDeposited,
    
    #[msg("Insufficient SOL for operation")]
    InsufficientSol,
}
```

## USDC Feature Flag Implementation

### Cargo.toml Configuration
```toml
[features]
default = []
usdc = []  # Enable with: anchor build -- --features usdc

# Environment features (mutually exclusive)
devnet = []
staging = []
mainnet = []
localnet = []
```

### Conditional Compilation Pattern
```rust
// USDC instruction (disabled by default for legal compliance)
#[cfg(feature = "usdc")]
pub fn deposit_usdc(ctx: Context<DepositUsdc>) -> Result<()> {
    // ... USDC-specific logic ...
}

#[cfg(feature = "usdc")]
#[derive(Accounts)]
pub struct DepositUsdc<'info> {
    // ... USDC-specific accounts ...
}

// Internal ATA utilities (ALWAYS compiled - no feature flag)
fn get_associated_token_address_internal(
    wallet: &Pubkey,
    mint: &Pubkey,
) -> Pubkey {
    // ... ATA derivation logic ...
}
```

### IDL Generation
- Default build (`anchor build`): IDL has NO USDC references
- USDC build (`anchor build -- --features usdc`): IDL includes USDC instructions

## Backwards Compatibility Strategy

### Option 1: Hard Cutover (Recommended)
- Deploy new program with SOL-only support
- No USDC functionality in production
- USDC code preserved behind feature flag for future

### Option 2: Parallel Programs (If Needed)
- Deploy SOL program separately
- Maintain existing USDC program until migration complete
- Frontend/backend route to appropriate program based on swap type

### Recommendation
**Use Option 1** - Hard cutover with feature-flagged USDC code. Simpler, cleaner, meets legal requirements.

## Migration Checklist

### Solana Program
- [x] Design new state structure
- [x] Design new instructions
- [x] Plan SOL transfer logic
- [x] Plan fee calculations
- [ ] Implement feature flags for USDC
- [ ] Write new program code
- [ ] Write unit tests
- [ ] Write integration tests

### Backend
- [ ] Update escrow program service
- [ ] Create SOL deposit service
- [ ] Update settlement service
- [ ] Update cancellation service
- [ ] Modify agreement service
- [ ] Update database schema (if needed)

### API
- [ ] Update agreement creation endpoints
- [ ] Update deposit endpoints
- [ ] Update settlement endpoints
- [ ] Add swap type parameters
- [ ] Update API documentation

### Frontend
- [ ] Update swap type selection UI
- [ ] Update SOL amount inputs
- [ ] Update fee displays
- [ ] Update wallet integration
- [ ] Update confirmation flows

### Testing
- [ ] E2E test: NFT <> SOL
- [ ] E2E test: NFT <> NFT with SOL fee
- [ ] E2E test: NFT <> NFT+SOL
- [ ] Load testing
- [ ] Security audit

### Deployment
- [ ] Deploy to devnet
- [ ] Test on devnet
- [ ] Deploy to staging
- [ ] Test on staging
- [ ] Deploy to production
- [ ] Monitor production

## Security Considerations

### 1. SOL Transfer Security
- Always use system program for SOL transfers
- Verify PDA signer seeds correctly
- Check for sufficient lamports before transfer
- Prevent rent-exempt threshold violations

### 2. Fee Manipulation Prevention
- Fee BPS stored in escrow state (set by admin)
- Cannot be modified after initialization
- Validated during init (max 10000 BPS = 100%)

### 3. Deposit Validation
- Verify correct accounts provided
- Check deposit amounts match expected values
- Prevent double-deposits
- Validate NFT mints match escrow state

### 4. Settlement Atomicity
- All transfers in single transaction
- Revert entirely on any failure
- Update status only after successful transfers

### 5. Admin Authorization
- Only authorized admin can initialize escrows
- Admin key varies by environment (devnet/staging/mainnet)
- Compile-time checks prevent multiple admin keys

## Performance Considerations

### Compute Units
- SOL transfers: ~1000 CU (vs USDC SPL token: ~50,000 CU)
- Expected savings: ~49,000 CU per transaction
- Allows for more complex logic in same transaction

### Transaction Size
- Fewer accounts needed (no USDC mint, fewer ATAs)
- Smaller serialized transaction size
- Faster confirmation times

### Cost Comparison
- USDC swap: Rent + priority fee + compute
- SOL swap: Priority fee + compute (no SPL token overhead)
- Estimated 30-40% reduction in transaction costs

## Next Steps

1. **Review and approve architecture** ✓
2. **Implement feature flags** (Subtask 1.4)
3. **Implement swap type 1: NFT <> SOL** (Subtask 1.5)
4. **Implement swap type 2: NFT <> NFT + fee** (Subtask 1.6)
5. **Implement swap type 3: NFT <> NFT+SOL** (Subtask 1.7)
6. **Update backend services** (Subtask 1.8)
7. **Update API endpoints** (Subtask 1.9)
8. **Create E2E tests** (Subtasks 1.13-1.15)
9. **Deploy and test** (Subtask 1.12)

---

**Document Status:** Draft  
**Last Updated:** 2025-11-04  
**Author:** AI Assistant  
**Reviewers:** Pending

