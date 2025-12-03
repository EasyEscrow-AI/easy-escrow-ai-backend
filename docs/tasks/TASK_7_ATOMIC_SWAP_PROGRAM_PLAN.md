# Task 7: Atomic Swap Solana Program - Implementation Plan

**Date:** November 17, 2025  
**Status:** 🚧 In Progress  
**Estimated Time:** 8-12 hours

---

## 🎯 Objective

Completely rewrite the Solana escrow program to support atomic swaps for NFT/cNFT trading with:
- **NO on-chain asset escrow** (all atomic within single transaction)
- **Single instruction:** `atomic_swap_with_fee`
- **Platform fee collection** to treasury
- **Support for:** SPL NFTs, cNFTs, and SOL

---

## 📋 Requirements Summary

### Core Functionality
1. ✅ **Atomic Execution** - All transfers in one transaction
2. ✅ **No Escrow State** - No on-chain asset storage
3. ✅ **Fee Collection** - Platform fee to treasury PDA
4. ✅ **Asset Support** - NFTs, cNFTs (Bubblegum), SOL
5. ✅ **Durable Nonces** - Transaction lifetime management

### Security Requirements
1. ✅ **Signature Verification** - Both parties must sign
2. ✅ **Asset Ownership** - Verify ownership before transfer
3. ✅ **Fee Validation** - Ensure fee is collected
4. ✅ **Reentrancy Protection** - Single atomic execution
5. ✅ **Admin Controls** - Platform authority required

### Features to Remove
- ❌ Escrow state accounts
- ❌ Time-based expiry logic
- ❌ Refund mechanisms
- ❌ Deposit tracking
- ❌ Multi-step workflows

### Features to Keep
- ✅ Environment-based program IDs
- ✅ Admin authorization system
- ✅ Security.txt metadata
- ✅ Treasury PDA management
- ✅ Compile-time safety checks

---

## 🏗️ Program Architecture

### Program Accounts

#### 1. Treasury PDA (State Account)
```rust
pub struct Treasury {
    pub authority: Pubkey,      // Platform authority
    pub total_fees: u64,         // Total fees collected
    pub total_swaps: u64,        // Total successful swaps
    pub bump: u8,                // PDA bump seed
}
```

**Seeds:** `["treasury", authority.key()]`

#### 2. No Escrow Accounts Needed!
All transfers happen atomically within the single instruction.

### Single Instruction

#### `atomic_swap_with_fee`

**Purpose:** Execute atomic swap of assets and collect platform fee

**Accounts:**
```rust
pub struct AtomicSwapWithFee<'info> {
    // Core participants
    #[account(mut)]
    pub maker: Signer<'info>,
    
    #[account(mut)]
    pub taker: Signer<'info>,
    
    // Platform
    #[account(
        mut,
        seeds = [b"treasury", platform_authority.key().as_ref()],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,
    
    pub platform_authority: Signer<'info>,  // Must sign for fee validation
    
    // Maker's assets (NFTs/cNFTs)
    #[account(mut)]
    pub maker_nft_account: Option<Account<'info, TokenAccount>>,
    
    // Taker's assets (NFTs/cNFTs)
    #[account(mut)]
    pub taker_nft_account: Option<Account<'info, TokenAccount>>,
    
    // Programs
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    
    // Optional: Compression program for cNFTs
    /// CHECK: Metaplex Bubblegum program
    pub compression_program: Option<AccountInfo<'info>>,
}
```

**Logic Flow:**
1. **Verify Signatures** - Both maker and taker must sign
2. **Validate Assets** - Check ownership and balances
3. **Transfer Assets** - Execute all transfers atomically:
   - Maker NFTs → Taker
   - Taker NFTs → Maker
   - SOL transfers (if any)
4. **Collect Fee** - Transfer fee from taker to treasury
5. **Update Treasury** - Increment counters
6. **Emit Event** - Log swap details

**Parameters:**
```rust
pub struct SwapParams {
    pub maker_nfts: Vec<AssetTransfer>,
    pub taker_nfts: Vec<AssetTransfer>,
    pub maker_sol_amount: u64,
    pub taker_sol_amount: u64,
    pub platform_fee: u64,
    pub swap_id: String,  // For backend tracking
}

pub struct AssetTransfer {
    pub asset_type: AssetType,  // NFT or cNFT
    pub mint: Pubkey,
    pub amount: u64,
    // For cNFTs only:
    pub merkle_tree: Option<Pubkey>,
    pub leaf_index: Option<u32>,
    pub merkle_proof: Option<Vec<[u8; 32]>>,
}

pub enum AssetType {
    NFT,
    CNFT,
}
```

---

## 🔒 Security Features

### 1. Signature Requirements
- ✅ Maker must sign
- ✅ Taker must sign
- ✅ Platform authority must sign (for fee validation)

### 2. Asset Validation
- ✅ Verify maker owns maker assets
- ✅ Verify taker owns taker assets
- ✅ Check sufficient balances
- ✅ Validate token accounts

### 3. Fee Enforcement
- ✅ Fee must be > 0
- ✅ Fee must be collected before asset transfers
- ✅ Fee goes to treasury PDA only

### 4. Atomic Execution
- ✅ All transfers in single transaction
- ✅ All-or-nothing execution
- ✅ No partial state updates

### 5. Admin Controls
- ✅ Only authorized platform authority can facilitate swaps
- ✅ Environment-specific admin keys
- ✅ Compile-time admin validation

---

## 📝 Implementation Steps

### Phase 1: Program Structure (2 hours)
- [ ] Create new `lib.rs` with atomic swap module
- [ ] Define Treasury account structure
- [ ] Set up program ID declarations (keep existing)
- [ ] Keep security.txt and admin system
- [ ] Define error codes

### Phase 2: Treasury Management (1 hour)
- [ ] Implement `initialize_treasury` instruction
- [ ] Treasury PDA derivation
- [ ] Authority validation
- [ ] State management

### Phase 3: Core Swap Logic (3 hours)
- [ ] Implement `atomic_swap_with_fee` instruction
- [ ] Signature verification
- [ ] Asset validation
- [ ] NFT transfer logic
- [ ] SOL transfer logic
- [ ] Fee collection
- [ ] Treasury updates

### Phase 4: cNFT Support (2 hours)
- [ ] Metaplex Bubblegum integration
- [ ] Merkle proof validation
- [ ] cNFT transfer execution
- [ ] Compression program CPI calls

### Phase 5: Testing (2 hours)
- [ ] Unit tests for core logic
- [ ] Integration tests with local validator
- [ ] Test NFT swaps
- [ ] Test cNFT swaps
- [ ] Test SOL swaps
- [ ] Test fee collection

### Phase 6: Build & Deploy (1 hour)
- [ ] Build program with `cargo build-sbf`
- [ ] Generate IDL with `anchor idl build`
- [ ] Deploy to local validator
- [ ] Deploy to staging (AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei)
- [ ] Verify on-chain

---

## 🎨 Code Structure

```
programs/escrow/src/
├── lib.rs                 # Main program module
├── state/
│   └── treasury.rs       # Treasury account
├── instructions/
│   ├── mod.rs
│   ├── initialize.rs     # Initialize treasury
│   └── atomic_swap.rs    # Core swap logic
├── errors.rs             # Error definitions
└── utils/
    ├── mod.rs
    ├── validation.rs     # Asset validation
    └── transfer.rs       # Transfer helpers
```

---

## 🔄 Instruction Comparison

### Old Program (Escrow)
```
┌─────────────────────────────────────┐
│ 1. initialize_escrow                │
│ 2. deposit_nft                      │
│ 3. deposit_buyer_nft                │
│ 4. deposit_usdc                     │
│ 5. deposit_sol                      │
│ 6. deposit_seller_sol_fee           │
│ 7. settle_escrow                    │
│ 8. cancel_escrow                    │
│ 9. force_close_escrow               │
└─────────────────────────────────────┘
9 instructions, multi-step workflow
```

### New Program (Atomic Swap)
```
┌─────────────────────────────────────┐
│ 1. initialize_treasury (one-time)   │
│ 2. atomic_swap_with_fee (main)      │
└─────────────────────────────────────┘
2 instructions, single atomic operation
```

---

## 🧪 Test Cases

### 1. NFT for NFT Swap
- Maker has NFT A
- Taker has NFT B
- Both swap atomically
- Platform fee collected

### 2. NFT for NFT + SOL
- Maker has NFT A + 1 SOL
- Taker has NFT B
- Assets and SOL swap
- Fee collected

### 3. cNFT for cNFT Swap
- Maker has compressed NFT A
- Taker has compressed NFT B
- Merkle proofs validated
- Swap executed atomically

### 4. Mixed Asset Swap
- Maker has NFT + cNFT + SOL
- Taker has 2 NFTs
- All transfer atomically

### 5. Fee Validation
- Fee too low → Fails
- Fee missing → Fails
- Wrong treasury → Fails

### 6. Authorization
- Wrong admin → Fails
- Missing signature → Fails
- Invalid assets → Fails

---

## 🌐 Environment Configuration

### Staging (Primary Development)
```rust
#[cfg(feature = "staging")]
declare_id!("AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei");
```

### Localnet (Rapid Testing)
```rust
#[cfg(feature = "localnet")]
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
```

### Production (Future)
```rust
#[cfg(feature = "mainnet")]
declare_id!("2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx");
```

---

## 📦 Dependencies

### Current (Keep)
- `anchor-lang = "0.30.1"`
- `anchor-spl = "0.30.1"`
- `solana-security-txt = "1.1.1"`

### New (Add)
- `mpl-bubblegum` (for cNFT support)
- `spl-account-compression` (for cNFT Merkle proofs)

---

## 🚀 Deployment Strategy

### 1. Local Testing
```bash
cd programs/escrow
cargo build-sbf
cd ../..
anchor idl build
solana-test-validator --bpf-program Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS target/deploy/easyescrow.so
```

### 2. Staging Deployment
```bash
anchor upgrade target/deploy/easyescrow.so \
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster devnet \
  --provider.wallet wallets/staging/staging-deployer.json
```

### 3. Production (When Ready)
```bash
anchor upgrade target/deploy/easyescrow.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --provider.cluster mainnet \
  --provider.wallet wallets/production/mainnet-deployer.json
```

---

## 📊 Success Criteria

- ✅ Program compiles with `cargo build-sbf`
- ✅ IDL generates with `anchor idl build`
- ✅ Local tests pass
- ✅ Deploys to local validator successfully
- ✅ Atomic swaps execute correctly
- ✅ Platform fees collected
- ✅ Both NFT and cNFT swaps work
- ✅ Staging deployment successful
- ✅ Backend integration tests pass

---

## 🎯 Next Actions

1. **Start Implementation** - Begin with program structure
2. **Treasury Setup** - Initialize treasury instruction
3. **Core Swap** - Implement atomic_swap_with_fee
4. **Testing** - Comprehensive test suite
5. **Deployment** - Local → Staging → Production

---

**Estimated Completion:** 8-12 hours of focused development  
**Complexity:** High (Solana program development + cNFT integration)  
**Priority:** Critical (final major component)

---

**Ready to begin implementation!** 🚀

