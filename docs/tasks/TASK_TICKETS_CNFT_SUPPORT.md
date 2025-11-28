# Task Tickets: Compressed NFT (cNFT) Swap Support

**Epic:** Add full compressed NFT support to atomic swap program
**Priority:** Medium
**Est. Timeline:** 4-6 days
**Dependencies:** None (standard NFT validation already works)

---

## 📊 Task Breakdown

| Task ID | Title | Type | Priority | Est. Time | Assignee |
|---------|-------|------|----------|-----------|----------|
| **CNFT-1** | Add Bubblegum dependencies to Solana program | Setup | High | 30 min | Rust Dev |
| **CNFT-2** | Create cNFT proof data structures | Program | High | 1 hour | Rust Dev |
| **CNFT-3** | Add optional cNFT accounts to atomic swap | Program | High | 2 hours | Rust Dev |
| **CNFT-4** | Implement `transfer_cnft()` helper | Program | High | 4 hours | Rust Dev |
| **CNFT-5** | Update atomic swap handler for mixed transfers | Program | High | 3 hours | Rust Dev |
| **CNFT-6** | Add comprehensive program tests | Testing | High | 4 hours | Rust Dev |
| **CNFT-7** | Update backend transaction builder | Backend | Medium | 3 hours | TS Dev |
| **CNFT-8** | Add Bubblegum constants and helpers | Backend | Medium | 1 hour | TS Dev |
| **CNFT-9** | Update TypeScript types for cNFT proofs | Backend | Medium | 1 hour | TS Dev |
| **CNFT-10** | Create E2E tests for cNFT swaps | Testing | Medium | 4 hours | TS Dev |
| **CNFT-11** | Update documentation | Docs | Low | 2 hours | Any |
| **CNFT-12** | Deploy and verify on devnet | DevOps | High | 1 hour | DevOps |

**Total Estimated Time:** ~26 hours (~4-6 days for one developer)

---

## 🔍 Production Enhancements (Based on Sorare Research)

**Research Source:** Sorare's verified Solana cNFT transfer proxy program
- **Program ID:** `Gz9o1yxV5kVfyC53fFu7StTVeetPZWa2sohzvxJiLxMP`
- **Repository:** https://gitlab.com/sorare/solana-public-programs-transfer-proxy

### Key Enhancements Adopted:

1. **Granular Error Codes** (CNFT-2)
   - `InvalidCnftProof`: Merkle proof validation failed
   - `MissingBubblegumProgram`: Missing Bubblegum program account
   - `MissingMerkleTree`: Missing Merkle tree account
   - `StaleProof`: Merkle root changed since proof generation

2. **Enhanced Logging** (CNFT-4)
   - From/to addresses for every transfer
   - Tree key and leaf index
   - Proof root (first 8 bytes) for debugging
   - Success/failure confirmation messages

3. **Address Lookup Table Support** (CNFT-7, new subtask)
   - Reduces transaction size by ~60%
   - Critical for complex swaps with multiple assets
   - Handles 7+ additional cNFT accounts efficiently

4. **Stale Proof Retry** (CNFT-10, new test)
   - Automatic retry with fresh proof on failure
   - Handles dynamic Merkle tree changes
   - Production-critical edge case handling

5. **Future Delegation Support** (CNFT-2)
   - Commented `leaf_delegate` field ready for implementation
   - Supports delegated cNFT transfers when needed

---

## 🎫 Detailed Task Tickets

### CNFT-1: Add Bubblegum Dependencies

**Priority:** High
**Type:** Setup
**Est. Time:** 30 minutes
**Assignee:** Rust Developer

#### Description
Add required Metaplex Bubblegum and SPL Account Compression dependencies to the Solana program.

#### Acceptance Criteria
- [ ] `mpl-bubblegum = "0.7.0"` added to `Cargo.toml`
- [ ] `spl-account-compression = "0.2.0"` added to `Cargo.toml`
- [ ] Program compiles successfully with new dependencies
- [ ] No version conflicts with existing dependencies

#### Implementation
**File:** `programs/escrow/Cargo.toml`

```toml
[dependencies]
anchor-lang = { version = "0.32.1", features = ["init-if-needed"] }
anchor-spl = "0.32.1"
solana-security-txt = "1.1.1"
mpl-bubblegum = "0.7.0"          # ADD THIS
spl-account-compression = "0.2.0" # ADD THIS
```

#### Verification
```bash
cd programs/escrow
cargo build-sbf
# Should compile without errors
```

#### Notes
- Check latest versions on crates.io
- Ensure compatibility with anchor-lang 0.32.1

---

### CNFT-2: Create cNFT Proof Data Structures

**Priority:** High
**Type:** Program Development
**Est. Time:** 1 hour
**Assignee:** Rust Developer
**Depends On:** CNFT-1

#### Description
Define Rust data structures for cNFT Merkle proofs that will be passed in instruction data, with enhanced error handling based on Sorare's production implementation.

#### Acceptance Criteria
- [ ] `CnftProof` struct defined with all required fields
- [ ] Struct implements `AnchorSerialize` and `AnchorDeserialize`
- [ ] Optional proof fields added to `SwapParams`
- [ ] **Granular error codes added:** `InvalidCnftProof`, `MissingBubblegumProgram`, `MissingMerkleTree`, `StaleProof`
- [ ] **Future delegation support:** Commented `leaf_delegate: Option<Pubkey>` field
- [ ] Program compiles with new structures

#### Implementation
**File:** `programs/escrow/src/instructions/atomic_swap.rs`

```rust
use mpl_bubblegum::state::metaplex_adapter::MetadataArgs;

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

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SwapParams {
    // ... existing fields ...
    
    /// Maker's cNFT proof (if sending compressed NFT)
    pub maker_cnft_proof: Option<CnftProof>,
    
    /// Taker's cNFT proof (if sending compressed NFT)
    pub taker_cnft_proof: Option<CnftProof>,
    
    /// Whether maker is sending a compressed NFT
    pub maker_sends_cnft: bool,
    
    /// Whether taker is sending a compressed NFT
    pub taker_sends_cnft: bool,
}
```

**File:** `programs/escrow/src/errors.rs`

```rust
// Add to existing error enum (based on Sorare's production implementation)
#[error_code]
pub enum AtomicSwapError {
    // ... existing errors ...
    
    #[msg("Invalid cNFT proof: Merkle proof validation failed")]
    InvalidCnftProof,
    
    #[msg("Missing required account: Bubblegum program")]
    MissingBubblegumProgram,
    
    #[msg("Missing required account: Merkle tree")]
    MissingMerkleTree,
    
    #[msg("Stale proof: Merkle root has changed since proof generation")]
    StaleProof,
}
```

#### Verification
```bash
cd programs/escrow
cargo build-sbf
# Should compile successfully
```

#### Notes
- Merkle proof hashes are 32 bytes
- Nonce is u64, index is u32 (matches Bubblegum spec)
- Make proofs optional for backward compatibility

---

### CNFT-3: Add Optional cNFT Accounts

**Priority:** High  
**Type:** Program Development
**Est. Time:** 2 hours
**Assignee:** Rust Developer
**Depends On:** CNFT-1, CNFT-2

#### Description
Add optional Bubblegum-related accounts to the `AtomicSwapWithFee` instruction accounts struct.

#### Acceptance Criteria
- [ ] Maker cNFT accounts added (merkle_tree, tree_authority)
- [ ] Taker cNFT accounts added (merkle_tree, tree_authority)
- [ ] Bubblegum program accounts added
- [ ] All accounts are optional (for backward compatibility)
- [ ] Program compiles successfully

#### Implementation
**File:** `programs/escrow/src/instructions/atomic_swap.rs`

```rust
#[derive(Accounts)]
#[instruction(params: SwapParams)]
pub struct AtomicSwapWithFee<'info> {
    // ... existing accounts ...
    
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
```

#### Verification
```rust
// Test that accounts can be None for standard NFT swaps
// Test that accounts are required for cNFT swaps
```

#### Notes
- Use `Option<AccountInfo>` for flexibility
- `CHECK` comments explain why unsafe accounts are acceptable
- Bubblegum CPI handles validation

---

### CNFT-4: Implement `transfer_cnft()` Helper

**Priority:** High
**Type:** Program Development
**Est. Time:** 4 hours
**Assignee:** Rust Developer
**Depends On:** CNFT-1, CNFT-2, CNFT-3

#### Description
Implement the core helper function that performs cNFT transfers via Bubblegum CPI.

#### Acceptance Criteria
- [ ] Function signature matches requirements
- [ ] Proper Bubblegum CPI context setup
- [ ] All required accounts passed correctly
- [ ] Error handling for invalid proofs
- [ ] Logging for debugging
- [ ] Program compiles and tests pass

#### Implementation
**File:** `programs/escrow/src/instructions/atomic_swap.rs`

```rust
use mpl_bubblegum::cpi::{accounts::Transfer as BubblegumTransfer, transfer as bubblegum_transfer};

const BUBBLEGUM_PROGRAM_ID: Pubkey = pubkey!("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");

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
        bubblegum_program.key() == &BUBBLEGUM_PROGRAM_ID,
        AtomicSwapError::InvalidMerkleProof
    );
    
    msg!("Transferring cNFT via Bubblegum");
    msg!("  From: {}", from.key());
    msg!("  To: {}", to.key());
    msg!("  Tree: {}", merkle_tree.key());
    msg!("  Leaf Index: {}", proof.index);
    msg!("  Proof Root: {:?}", &proof.root[..8]);  // First 8 bytes for brevity
    
    // Create Bubblegum transfer CPI context
    let cpi_ctx = CpiContext::new(
        bubblegum_program.clone(),
        BubblegumTransfer {
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
    bubblegum_transfer(
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
```

#### Test Cases
1. Valid proof → Transfer succeeds
2. Invalid root → Returns error
3. Wrong tree → Returns error
4. Stale proof → Returns error
5. Already transferred cNFT → Returns error

#### Notes
- `leaf_delegate` = `leaf_owner` for non-delegated NFTs
- Bubblegum handles all validation internally
- Error logs help debug proof issues

---

### CNFT-5: Update Atomic Swap Handler for Mixed Transfers

**Priority:** High
**Type:** Program Development
**Est. Time:** 3 hours
**Assignee:** Rust Developer
**Depends On:** CNFT-4

#### Description
Update the main `atomic_swap_handler` to support all combinations of standard NFTs, cNFTs, and SOL.

#### Acceptance Criteria
- [ ] Handles standard NFT ↔ SOL
- [ ] Handles cNFT ↔ SOL
- [ ] Handles cNFT ↔ cNFT
- [ ] Handles cNFT ↔ standard NFT
- [ ] Validates required accounts are present
- [ ] Backward compatible with existing swaps

#### Implementation
**File:** `programs/escrow/src/instructions/atomic_swap.rs`

```rust
pub fn atomic_swap_handler(ctx: Context<AtomicSwapWithFee>, params: SwapParams) -> Result<()> {
    // ... existing validation and fee collection ...
    
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
                1,
            )?;
            msg!("Transferred maker standard NFT to taker");
        } else {
            return Err(AtomicSwapError::MakerAssetOwnershipFailed.into());
        }
    } else if params.maker_sends_cnft {
        // Compressed NFT transfer
        let proof = params.maker_cnft_proof.as_ref()
            .ok_or(AtomicSwapError::InvalidMerkleProof)?;
        
        let merkle_tree = ctx.accounts.maker_merkle_tree.as_ref()
            .ok_or(AtomicSwapError::InvalidMerkleProof)?;
        let tree_authority = ctx.accounts.maker_tree_authority.as_ref()
            .ok_or(AtomicSwapError::InvalidMerkleProof)?;
        let bubblegum = ctx.accounts.bubblegum_program.as_ref()
            .ok_or(AtomicSwapError::InvalidMerkleProof)?;
        let compression = ctx.accounts.compression_program.as_ref()
            .ok_or(AtomicSwapError::InvalidMerkleProof)?;
        let log_wrapper = ctx.accounts.log_wrapper.as_ref()
            .ok_or(AtomicSwapError::InvalidMerkleProof)?;
        
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
    
    // Step 3: Transfer taker's asset to maker (similar logic)
    if params.taker_sends_nft {
        // Standard NFT logic...
    } else if params.taker_sends_cnft {
        // Compressed NFT logic (similar to maker)...
    }
    
    // ... rest of handler (SOL transfers, treasury updates) ...
    
    Ok(())
}
```

#### Test Scenarios
| Maker Sends | Taker Sends | Should Work |
|-------------|-------------|-------------|
| Standard NFT | SOL | ✅ (existing) |
| cNFT | SOL | ✅ (new) |
| SOL | cNFT | ✅ (new) |
| cNFT | cNFT | ✅ (new) |
| cNFT | Standard NFT | ✅ (new) |
| Standard NFT | cNFT | ✅ (new) |

#### Notes
- Check for proof presence before transfer
- Validate all required accounts are `Some()`
- Error early if accounts missing

---

### CNFT-6: Add Comprehensive Program Tests

**Priority:** High
**Type:** Testing
**Est. Time:** 4 hours
**Assignee:** Rust Developer
**Depends On:** CNFT-5

#### Description
Create comprehensive Rust tests for all cNFT swap scenarios in the Solana program test suite.

#### Acceptance Criteria
- [ ] Test cNFT ↔ SOL swap
- [ ] Test cNFT ↔ cNFT swap
- [ ] Test cNFT ↔ standard NFT swap
- [ ] Test invalid proof rejection
- [ ] Test missing accounts rejection
- [ ] Test stale proof handling
- [ ] All tests pass

#### Implementation
**File:** `programs/escrow/tests/cnft_swaps.rs` (new file)

```rust
use anchor_lang::prelude::*;
use solana_program_test::*;
use solana_sdk::{signature::Keypair, signer::Signer};
use mpl_bubblegum::utils::get_asset_id;

#[tokio::test]
async fn test_cnft_for_sol_swap() {
    let mut context = program_test().start_with_context().await;
    
    // Setup: Create Merkle tree and mint cNFT to maker
    let tree = create_merkle_tree(&mut context).await;
    let cnft = mint_cnft_to(&mut context, &tree, &maker.pubkey()).await;
    
    // Get cNFT proof
    let proof = get_cnft_proof(&mut context, &cnft.asset_id).await;
    
    // Execute swap: maker sends cNFT, taker sends 1 SOL
    let result = execute_atomic_swap(
        &mut context,
        &maker,
        &taker,
        Some(cnft.clone()),
        None,
        0,
        1_000_000_000,  // 1 SOL
        proof,
    ).await;
    
    assert!(result.is_ok());
    
    // Verify: cNFT now owned by taker
    let asset = get_asset(&mut context, &cnft.asset_id).await;
    assert_eq!(asset.ownership.owner, taker.pubkey());
    
    // Verify: Maker received SOL
    let maker_balance = context.banks_client
        .get_balance(maker.pubkey()).await.unwrap();
    assert_eq!(maker_balance, initial_balance + 1_000_000_000);
}

#[tokio::test]
async fn test_cnft_for_cnft_swap() {
    // Test swapping two cNFTs directly
}

#[tokio::test]
async fn test_cnft_for_standard_nft() {
    // Test cNFT ↔ standard NFT swap
}

#[tokio::test]
async fn test_invalid_proof_rejected() {
    // Test that invalid Merkle proof is rejected
}

#[tokio::test]
async fn test_missing_accounts_rejected() {
    // Test that missing Bubblegum accounts cause error
}
```

#### Notes
- Use `solana-program-test` for integration tests
- Mock Merkle tree and cNFT minting
- Test both success and failure cases

---

### CNFT-7: Update Backend Transaction Builder

**Priority:** Medium
**Type:** Backend Development
**Est. Time:** 3 hours
**Assignee:** TypeScript Developer
**Depends On:** CNFT-5 (program ready)

#### Description
Update the TypeScript transaction builder to construct transactions with cNFT accounts and proofs.

#### Acceptance Criteria
- [ ] Detects asset type (standard vs compressed)
- [ ] Adds correct accounts based on asset type
- [ ] Passes Merkle proof data for cNFTs
- [ ] Derives tree authority PDA correctly
- [ ] Backward compatible with standard NFTs
- [ ] All TypeScript tests pass

#### Implementation
**File:** `src/services/transactionBuilder.ts`

```typescript
// Add imports
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from '@metaplex-foundation/mpl-bubblegum';
import { SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, SPL_NOOP_PROGRAM_ID } from '@solana/spl-account-compression';

// In createAtomicSwapInstruction():
private async createAtomicSwapInstruction(inputs: TransactionBuildInputs): Promise<TransactionInstruction> {
    const makerAssetType = inputs.makerAssets[0]?.type;
    const takerAssetType = inputs.takerAssets[0]?.type;
    
    const makerSendsStandardNft = makerAssetType === AssetType.NFT;
    const makerSendsCnft = makerAssetType === AssetType.CNFT;
    const takerSendsStandardNft = takerAssetType === AssetType.NFT;
    const takerSendsCnft = takerAssetType === AssetType.CNFT;
    
    // Build accounts object
    const accounts: any = {
        maker: inputs.makerPubkey,
        taker: inputs.takerPubkey,
        platformAuthority: this.platformAuthority.publicKey,
        treasury: inputs.treasuryPDA,
        systemProgram: SystemProgram.programId,
    };
    
    // Add standard NFT accounts OR cNFT accounts for maker
    if (makerSendsStandardNft) {
        const nftMint = new PublicKey(inputs.makerAssets[0].identifier);
        accounts.makerNftAccount = await getAssociatedTokenAddress(nftMint, inputs.makerPubkey);
        accounts.takerNftDestination = await getAssociatedTokenAddress(nftMint, inputs.takerPubkey);
        accounts.tokenProgram = TOKEN_PROGRAM_ID;
    } else if (makerSendsCnft) {
        const proof = inputs.makerAssets[0].assetInfo!.proofData!;
        accounts.makerMerkleTree = new PublicKey(proof.tree);
        accounts.makerTreeAuthority = await this.getTreeAuthority(proof.tree);
        accounts.bubblegumProgram = BUBBLEGUM_PROGRAM_ID;
        accounts.compressionProgram = SPL_ACCOUNT_COMPRESSION_PROGRAM_ID;
        accounts.logWrapper = SPL_NOOP_PROGRAM_ID;
    }
    
    // Similar for taker...
    
    // Build instruction data
    const instructionData: any = {
        makerSendsNft: makerSendsStandardNft,
        takerSendsNft: takerSendsStandardNft,
        makerSendsCnft,
        takerSendsCnft,
        makerSolAmount: new anchor.BN(inputs.makerSolLamports.toString()),
        takerSolAmount: new anchor.BN(inputs.takerSolLamports.toString()),
        platformFee: new anchor.BN(inputs.platformFeeLamports.toString()),
        swapId: inputs.swapId,
    };
    
    // Add cNFT proofs if applicable
    if (makerSendsCnft) {
        const proof = inputs.makerAssets[0].assetInfo!.proofData!;
        instructionData.makerCnftProof = {
            root: Array.from(Buffer.from(proof.root, 'hex')),
            dataHash: Array.from(Buffer.from(proof.dataHash, 'hex')),
            creatorHash: Array.from(Buffer.from(proof.creatorHash, 'hex')),
            nonce: new anchor.BN(proof.nonce),
            index: proof.leafIndex,
        };
    }
    
    // Similar for taker...
    
    // Call program instruction
    const program = this.getProgram(inputs.escrowProgramId);
    return await program.methods
        .atomicSwapWithFee(instructionData)
        .accounts(accounts)
        .instruction();
}

// Helper to derive tree authority
private async getTreeAuthority(merkleTree: string): Promise<PublicKey> {
    const [treeAuthority] = await PublicKey.findProgramAddress(
        [
            Buffer.from('TreeConfig'),
            new PublicKey(merkleTree).toBuffer(),
        ],
        BUBBLEGUM_PROGRAM_ID
    );
    return treeAuthority;
}
```

#### Test Cases
- Standard NFT swap still works
- cNFT swap includes correct accounts
- Tree authority derived correctly
- Proof data formatted correctly

---

### CNFT-8: Add Bubblegum Constants and Helpers

**Priority:** Medium
**Type:** Backend Development
**Est. Time:** 1 hour
**Assignee:** TypeScript Developer
**Depends On:** None

#### Description
Add Bubblegum program IDs and helper utilities to the backend codebase.

#### Acceptance Criteria
- [ ] Bubblegum dependencies installed
- [ ] Program IDs exported as constants
- [ ] Helper functions for common operations
- [ ] All TypeScript compiles

#### Implementation
**File:** `src/constants/programs.ts` (new file)

```typescript
import { PublicKey } from '@solana/web3.js';

// Metaplex Bubblegum Program
export const BUBBLEGUM_PROGRAM_ID = new PublicKey(
    'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY'
);

// SPL Account Compression
export const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
    'cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'
);

// SPL Noop (for logging)
export const SPL_NOOP_PROGRAM_ID = new PublicKey(
    'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'
);
```

**File:** `package.json`

```json
{
  "dependencies": {
    "@metaplex-foundation/mpl-bubblegum": "^0.7.0",
    "@solana/spl-account-compression": "^0.2.0"
  }
}
```

#### Verification
```bash
npm install
npm run build
# Should compile successfully
```

---

### CNFT-9: Update TypeScript Types for cNFT Proofs

**Priority:** Medium
**Type:** Backend Development
**Est. Time:** 1 hour
**Assignee:** TypeScript Developer
**Depends On:** None

#### Description
Update TypeScript type definitions to include cNFT proof data structures.

#### Acceptance Criteria
- [ ] `CnftProof` interface matches Rust struct
- [ ] `AssetInfo` includes optional proof data
- [ ] `SwapParams` updated for cNFT flags
- [ ] All TypeScript compiles without errors

#### Implementation
**File:** `src/types/cnft.ts` (new file)

```typescript
export interface CnftProof {
    /** Merkle tree root hash (32 bytes, hex encoded) */
    root: string;
    
    /** Asset data hash (32 bytes, hex encoded) */
    dataHash: string;
    
    /** Creator hash (32 bytes, hex encoded) */
    creatorHash: string;
    
    /** Leaf nonce */
    nonce: number;
    
    /** Leaf index in tree */
    leafIndex: number;
    
    /** Merkle tree public key */
    tree: string;
}
```

**File:** `src/services/assetValidator.ts`

Update `AssetInfo` interface:
```typescript
export interface AssetInfo {
    type: AssetType;
    identifier: string;
    owner: string;
    metadata?: any;
    proofData?: CnftProof;  // ✅ Already present!
    status: AssetStatus;
    validatedAt: Date;
}
```

---

### CNFT-10: Create E2E Tests for cNFT Swaps

**Priority:** Medium
**Type:** Testing
**Est. Time:** 4 hours
**Assignee:** TypeScript Developer
**Depends On:** CNFT-7, CNFT-8, CNFT-9

#### Description
Create comprehensive end-to-end tests for cNFT swaps in the staging environment.

#### Acceptance Criteria
- [ ] Test cNFT ↔ SOL swap (maker offers cNFT)
- [ ] Test SOL ↔ cNFT swap (taker offers cNFT)
- [ ] Test cNFT ↔ cNFT swap
- [ ] Test cNFT ↔ standard NFT swap
- [ ] All tests pass on devnet
- [ ] Test results documented

#### Implementation
**File:** `tests/staging/e2e/05-atomic-cnft-swaps.test.ts` (new file)

```typescript
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createAssetValidator } from '../../../src/services/assetValidator';
import { createTransactionBuilder } from '../../../src/services/transactionBuilder';

describe('Atomic cNFT Swaps E2E', () => {
    let connection: Connection;
    let maker: Keypair;
    let taker: Keypair;
    let platformAuthority: Keypair;
    
    beforeAll(async () => {
        connection = new Connection(/* devnet RPC */);
        // Load test keypairs...
    });
    
    test('cNFT for SOL swap', async () => {
        // 1. Validate maker owns cNFT
        const validator = createAssetValidator(connection);
        const validation = await validator.validateAsset(
            maker.publicKey.toBase58(),
            cnftAssetId,
            AssetType.CNFT
        );
        
        expect(validation.isValid).toBe(true);
        expect(validation.asset?.proofData).toBeDefined();
        
        // 2. Build transaction
        const builder = createTransactionBuilder(connection, platformAuthority);
        const tx = await builder.buildSwapTransaction({
            makerPubkey: maker.publicKey,
            takerPubkey: taker.publicKey,
            makerAssets: [{
                type: AssetType.CNFT,
                identifier: cnftAssetId,
                assetInfo: validation.asset
            }],
            takerAssets: [],
            makerSolLamports: 0n,
            takerSolLamports: 1_000_000_000n,  // 1 SOL
            platformFeeLamports: 5_000_000n,
            // ... other params
        });
        
        expect(tx.serializedTransaction).toBeDefined();
        
        // 3. Sign and send
        const signature = await sendAndConfirmTransaction(
            connection,
            Transaction.from(Buffer.from(tx.serializedTransaction, 'base64')),
            [maker, taker]
        );
        
        expect(signature).toBeTruthy();
        
        // 4. Verify ownership changed
        const afterValidation = await validator.validateAsset(
            taker.publicKey.toBase58(),
            cnftAssetId,
            AssetType.CNFT
        );
        
        expect(afterValidation.isValid).toBe(true);
    });
    
    test('cNFT for cNFT swap', async () => {
        // Similar test for two cNFTs
    });
    
    test('cNFT for standard NFT swap', async () => {
        // Test cNFT ↔ standard NFT
    });
});
```

#### Notes
- Use real devnet cNFTs for testing
- Verify ownership changes on-chain
- Check transaction logs for errors

---

### CNFT-11: Update Documentation

**Priority:** Low
**Type:** Documentation
**Est. Time:** 2 hours
**Assignee:** Any
**Depends On:** CNFT-10 (verification complete)

#### Description
Update all documentation to reflect cNFT support and provide examples.

#### Acceptance Criteria
- [ ] API documentation updated
- [ ] OpenAPI spec includes cNFT examples
- [ ] README mentions cNFT support
- [ ] Test page instructions updated
- [ ] Architecture docs updated

#### Files to Update
1. `docs/api/openapi.yaml` - Add cNFT examples
2. `README.md` - Mention cNFT support
3. `docs/ARCHITECTURE.md` - Explain cNFT flow
4. `docs/tasks/CNFT_SWAP_SUPPORT.md` - Mark complete
5. `src/public/test.html` - Update instructions

#### Example Updates
**OpenAPI:**
```yaml
components:
  schemas:
    Asset:
      properties:
        mint:
          type: string
          description: Token mint address (standard NFT) or asset ID (cNFT)
        isCompressed:
          type: boolean
          description: Whether this is a compressed NFT
      examples:
        standard:
          mint: "DK4MyFEDQMjsKGDWgyuSdDWLHrcFrA6emGCuXSnAmXwo"
          isCompressed: false
        compressed:
          mint: "7NPB8YFQiyc4pzBxBT941cLLJu4ytK7AVQNhLj6NqHfJ"
          isCompressed: true
```

---

### CNFT-12: Deploy and Verify on Devnet

**Priority:** High
**Type:** DevOps
**Est. Time:** 1 hour
**Assignee:** DevOps / Rust Developer
**Depends On:** CNFT-6, CNFT-10

#### Description
Deploy updated program to devnet and verify cNFT swaps work end-to-end.

#### Acceptance Criteria
- [ ] Program builds successfully
- [ ] Program deployed to devnet
- [ ] IDL uploaded to devnet
- [ ] Backend updated with new IDL
- [ ] Manual test on `/test` page successful
- [ ] E2E tests pass on devnet
- [ ] Solscan shows successful cNFT transfer

#### Implementation Steps

1. **Build program:**
```bash
cd programs/escrow
cargo build-sbf
cd ../..
```

2. **Generate IDL:**
```bash
anchor idl build
```

3. **Deploy to devnet:**
```bash
anchor upgrade target/deploy/easyescrow.so \
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster devnet \
  --provider.wallet wallets/staging/staging-deployer.json
```

4. **Upload IDL:**
```bash
anchor idl upgrade AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --filepath target/idl/escrow.json \
  --provider.cluster devnet \
  --provider.wallet wallets/staging/staging-deployer.json
```

5. **Update backend:**
```bash
cp target/idl/escrow.json src/generated/anchor/escrow-idl-staging.json
git add src/generated/anchor/escrow-idl-staging.json
git commit -m "chore: update IDL with cNFT support"
git push origin staging
```

6. **Manual test:**
- Open https://staging-api.easyescrow.ai/test
- Select a cNFT
- Execute swap
- Verify on Solscan

#### Verification Checklist
- [ ] Program deployed successfully
- [ ] IDL uploaded successfully
- [ ] Backend shows new IDL
- [ ] `/test` page loads correctly
- [ ] cNFT swaps execute successfully
- [ ] Solscan shows cNFT ownership transfer
- [ ] No errors in backend logs

#### Rollback Plan
If deployment fails:
```bash
# Rollback to previous version
anchor upgrade target/deploy/easyescrow.so.backup \
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster devnet \
  --provider.wallet wallets/staging/staging-deployer.json
```

---

## 📊 Progress Tracking

### Sprint Board

**To Do:**
- CNFT-1: Add Bubblegum dependencies
- CNFT-2: Create cNFT proof structures
- CNFT-8: Add Bubblegum constants
- CNFT-9: Update TypeScript types

**In Progress:**
- (none)

**Code Review:**
- (none)

**Testing:**
- (none)

**Done:**
- (none)

### Milestones

- **M1: Program Ready** (CNFT-1 to CNFT-6 complete)
- **M2: Backend Ready** (CNFT-7 to CNFT-9 complete)
- **M3: Tested** (CNFT-10 complete)
- **M4: Deployed** (CNFT-11, CNFT-12 complete)

---

## 🔗 Related Documents

- [CNFT_SWAP_SUPPORT.md](mdc:docs/tasks/CNFT_SWAP_SUPPORT.md) - Implementation plan
- [solana-program-build.mdc](mdc:.cursor/rules/solana-program-build.mdc) - Build instructions
- [openapi.yaml](mdc:docs/api/openapi.yaml) - API specification

---

**Status:** Ready for assignment
**Created:** 2025-11-27
**Last Updated:** 2025-11-27

