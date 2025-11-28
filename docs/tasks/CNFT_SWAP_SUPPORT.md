# Compressed NFT (cNFT) Swap Support Implementation Plan

## 🎯 Goal

Enable atomic swaps for compressed NFTs in addition to standard NFTs.

---

## 📊 Current Status

| Feature | Standard NFTs | Compressed NFTs |
|---------|---------------|-----------------|
| **Validation** | ✅ Working | ✅ Working (PR #300) |
| **Transaction Building** | ✅ Working | ❌ Not Implemented |
| **Program Transfer** | ✅ Working | ❌ Not Implemented |
| **E2E Swaps** | ✅ Working | ❌ Blocked by above |

---

## 🔍 Technical Background

### Standard NFT Transfer (Current):
```rust
// SPL Token transfer - simple!
token::transfer(
    CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: maker_nft_account,
            to: taker_nft_destination,
            authority: maker,
        },
        &[maker_seeds]
    ),
    1
)?;
```

### Compressed NFT Transfer (Needed):
```rust
// Bubblegum transfer - complex!
bubblegum::transfer(
    CpiContext::new_with_signer(
        ctx.accounts.bubblegum_program.to_account_info(),
        BubblegumTransfer {
            tree_authority,
            leaf_owner: maker,
            leaf_delegate,
            new_leaf_owner: taker,
            merkle_tree,
            log_wrapper,
            compression_program,
            system_program,
        },
        &[maker_seeds]
    ),
    root,          // Merkle root
    data_hash,     // Asset data hash
    creator_hash,  // Creator hash
    nonce,         // Leaf nonce
    index,         // Leaf index
)?;
```

**Key Differences:**
- cNFTs need **Merkle proof** (root, data_hash, creator_hash, nonce, index)
- cNFTs need **7 additional accounts** (tree_authority, merkle_tree, log_wrapper, etc.)
- cNFTs use **Bubblegum program** not SPL Token program

---

## 📦 Implementation Tasks

### Phase 1: Solana Program (Rust)

#### Task 1.1: Add Bubblegum Dependencies
**File:** `programs/escrow/Cargo.toml`

```toml
[dependencies]
mpl-bubblegum = "0.7.0"
spl-account-compression = "0.2.0"
```

#### Task 1.2: Update Atomic Swap Instruction
**File:** `programs/escrow/src/instructions/atomic_swap.rs`

**Changes Needed:**
1. Add optional cNFT accounts to `AtomicSwapWithFee` struct:
   ```rust
   // Maker cNFT accounts (optional)
   pub maker_merkle_tree: Option<AccountInfo<'info>>,
   pub maker_tree_authority: Option<AccountInfo<'info>>,
   
   // Taker cNFT accounts (optional)  
   pub taker_merkle_tree: Option<AccountInfo<'info>>,
   pub taker_tree_authority: Option<AccountInfo<'info>>,
   
   // Bubblegum dependencies
   pub bubblegum_program: Option<AccountInfo<'info>>,
   pub compression_program: Option<AccountInfo<'info>>,
   pub log_wrapper: Option<AccountInfo<'info>>,
   ```

2. Add cNFT proof parameters to instruction data:
   ```rust
   pub struct AtomicSwapParams {
       pub maker_sol_amount: u64,
       pub taker_sol_amount: u64,
       pub platform_fee: u64,
       
       // Maker cNFT proof (optional)
       pub maker_cnft_proof: Option<CnftProof>,
       
       // Taker cNFT proof (optional)
       pub taker_cnft_proof: Option<CnftProof>,
   }
   
   pub struct CnftProof {
       pub root: [u8; 32],
       pub data_hash: [u8; 32],
       pub creator_hash: [u8; 32],
       pub nonce: u64,
       pub index: u32,
   }
   ```

3. Add transfer logic that handles both types:
   ```rust
   // Transfer maker asset
   if maker_sends_standard_nft {
       // Existing SPL token transfer
       transfer_standard_nft(ctx, maker, taker)?;
   } else if maker_sends_cnft {
       // New Bubblegum transfer
       transfer_cnft(
           ctx,
           maker,
           taker,
           ctx.maker_cnft_proof.unwrap()
       )?;
   }
   
   // Transfer taker asset
   if taker_sends_standard_nft {
       transfer_standard_nft(ctx, taker, maker)?;
   } else if taker_sends_cnft {
       transfer_cnft(
           ctx,
           taker,
           maker,
           ctx.taker_cnft_proof.unwrap()
       )?;
   }
   ```

4. Implement `transfer_cnft` helper:
   ```rust
   fn transfer_cnft<'info>(
       ctx: Context<'_, '_, '_, 'info, AtomicSwapWithFee<'info>>,
       from: &AccountInfo<'info>,
       to: &AccountInfo<'info>,
       proof: CnftProof,
   ) -> Result<()> {
       let bubblegum_program = ctx.accounts.bubblegum_program
           .as_ref()
           .ok_or(ErrorCode::MissingBubblegumProgram)?;
       
       // Call Bubblegum transfer instruction
       mpl_bubblegum::cpi::transfer(
           CpiContext::new(
               bubblegum_program.to_account_info(),
               mpl_bubblegum::cpi::accounts::Transfer {
                   tree_authority: ctx.accounts.maker_tree_authority.unwrap(),
                   leaf_owner: from.clone(),
                   leaf_delegate: from.clone(),
                   new_leaf_owner: to.clone(),
                   merkle_tree: ctx.accounts.maker_merkle_tree.unwrap(),
                   log_wrapper: ctx.accounts.log_wrapper.unwrap(),
                   compression_program: ctx.accounts.compression_program.unwrap(),
                   system_program: ctx.accounts.system_program.to_account_info(),
               },
           ),
           proof.root,
           proof.data_hash,
           proof.creator_hash,
           proof.nonce,
           proof.index,
       )?;
       
       Ok(())
   }
   ```

#### Task 1.3: Add Error Codes
**File:** `programs/escrow/src/error.rs`

```rust
#[error_code]
pub enum ErrorCode {
    // ... existing errors ...
    
    #[msg("Bubblegum program account is required for cNFT transfers")]
    MissingBubblegumProgram,
    
    #[msg("Merkle tree account is required for cNFT transfers")]
    MissingMerkleTree,
    
    #[msg("Invalid cNFT proof provided")]
    InvalidCnftProof,
}
```

#### Task 1.4: Testing
**File:** `tests/atomic-swap-cnft.ts`

Create comprehensive tests for:
- cNFT ↔ SOL swaps
- cNFT ↔ cNFT swaps
- cNFT ↔ standard NFT swaps
- Mixed scenarios

---

### Phase 2: Backend (TypeScript)

#### Task 2.1: Update Transaction Builder
**File:** `src/services/transactionBuilder.ts`

**Changes:**

1. Detect asset type in `createAtomicSwapInstruction`:
   ```typescript
   const makerAssetType = inputs.makerAssets[0]?.type;
   const takerAssetType = inputs.takerAssets[0]?.type;
   
   const makerSendsCnft = makerAssetType === AssetType.CNFT;
   const takerSendsCnft = takerAssetType === AssetType.CNFT;
   ```

2. Build accounts object conditionally:
   ```typescript
   const accounts: any = {
       maker: inputs.makerPubkey,
       taker: inputs.takerPubkey,
       platformAuthority: this.platformAuthority.publicKey,
       treasury: inputs.treasuryPDA,
       systemProgram: SystemProgram.programId,
   };
   
   // Add standard NFT accounts OR cNFT accounts
   if (makerSendsStandardNft) {
       accounts.makerNftAccount = makerNftAccount;
       accounts.takerNftDestination = takerNftDestination;
       accounts.tokenProgram = TOKEN_PROGRAM_ID;
   } else if (makerSendsCnft) {
       const makerProof = inputs.makerAssets[0].assetInfo!.proofData!;
       accounts.makerMerkleTree = new PublicKey(makerProof.tree);
       accounts.makerTreeAuthority = await this.getTreeAuthority(makerProof.tree);
       accounts.bubblegumProgram = BUBBLEGUM_PROGRAM_ID;
       accounts.compressionProgram = SPL_ACCOUNT_COMPRESSION_PROGRAM_ID;
       accounts.logWrapper = SPL_NOOP_PROGRAM_ID;
   }
   
   // Same for taker...
   ```

3. Build instruction data with proofs:
   ```typescript
   const instructionData: any = {
       makerSolAmount: new anchor.BN(inputs.makerSolLamports.toString()),
       takerSolAmount: new anchor.BN(inputs.takerSolLamports.toString()),
       platformFee: new anchor.BN(inputs.platformFeeLamports.toString()),
   };
   
   if (makerSendsCnft) {
       const proof = inputs.makerAssets[0].assetInfo!.proofData!;
       instructionData.makerCnftProof = {
           root: Array.from(Buffer.from(proof.root, 'base64')),
           dataHash: Array.from(Buffer.from(proof.dataHash, 'base64')),
           creatorHash: Array.from(Buffer.from(proof.creatorHash, 'base64')),
           nonce: new anchor.BN(proof.nonce),
           index: proof.leafIndex,
       };
   }
   
   // Same for taker...
   ```

4. Add program IDs as constants:
   ```typescript
   const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
   const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');
   const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
   ```

5. Helper to derive tree authority:
   ```typescript
   private async getTreeAuthority(merkleTree: string): Promise<PublicKey> {
       const [treeAuthority] = await PublicKey.findProgramAddress(
           [Buffer.from('TreeConfig'), new PublicKey(merkleTree).toBuffer()],
           BUBBLEGUM_PROGRAM_ID
       );
       return treeAuthority;
   }
   ```

#### Task 2.2: Update Asset Validator
**File:** `src/services/assetValidator.ts`

Ensure `proofData` is always included in validated cNFT assets:
```typescript
return {
    isValid: true,
    asset: {
        type: AssetType.CNFT,
        identifier: assetId,
        owner: walletAddress,
        metadata: assetData.content?.metadata,
        proofData,  // ✅ Already included!
        status: AssetStatus.VALID,
        validatedAt: new Date(),
    },
};
```

#### Task 2.3: Update IDL
**File:** `src/generated/anchor/escrow-idl-staging.json`

After rebuilding the program, regenerate the IDL:
```bash
anchor build
cp target/idl/escrow.json src/generated/anchor/escrow-idl-staging.json
```

---

### Phase 3: Testing

#### Task 3.1: Unit Tests
**Files:** `tests/unit/*.test.ts`

- Test cNFT proof generation
- Test transaction building with cNFT accounts
- Test mixed asset types

#### Task 3.2: Integration Tests
**Files:** `tests/staging/e2e/*.test.ts`

- E2E cNFT ↔ SOL swap
- E2E cNFT ↔ cNFT swap
- E2E cNFT ↔ standard NFT swap

#### Task 3.3: Manual Testing
**Page:** `/test`

- Test all cNFT swap scenarios via UI
- Verify transactions on Solscan
- Check asset ownership post-swap

---

## 🚀 Deployment Steps

### Step 1: Deploy Updated Program
```bash
# Build program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Update program ID in backend
# (if address changed)
```

### Step 2: Update Backend
```bash
# Install Bubblegum dependencies
npm install @metaplex-foundation/mpl-bubblegum

# Deploy backend
# (Digital Ocean auto-deploy via GitHub)
```

### Step 3: Verify
- Test on `/test` page
- Run E2E tests
- Check Solscan for successful cNFT transfers

---

## ⚠️ Important Considerations

### 1. **Transaction Size**
cNFT transfers require **Merkle proof accounts** which can make transactions large.

**Solution:** Use `AddressLookupTable` for account compression if needed.

### 2. **Proof Freshness**
Merkle proofs can become stale if the tree changes.

**Solution:** 
- Fetch proof right before transaction creation
- Add retry logic with fresh proof on failure

### 3. **Simultaneous cNFT Transfers**
Both maker AND taker sending cNFTs requires **many accounts**.

**Solution:**
- May need to split into two transactions
- Or use lookup tables

### 4. **Tree Authority Derivation**
Must correctly derive PDA for tree authority.

**Formula:**
```typescript
[
  Buffer.from('TreeConfig'),
  merkleTree.toBuffer()
]
```

**Seed with:** Bubblegum Program ID

---

## 📚 References

### Metaplex Bubblegum Documentation
- **Program:** https://developers.metaplex.com/bubblegum
- **Transfer CPI:** https://github.com/metaplex-foundation/mpl-bubblegum/blob/main/programs/bubblegum/src/processor/transfer.rs

### Solana Compression
- **SPL Account Compression:** https://github.com/solana-labs/solana-program-library/tree/master/account-compression

### Example Implementations
- **Tensor Trade:** https://github.com/tensor-foundation/marketplace (cNFT swaps)
- **Magic Eden:** https://github.com/magiceden-oss/open_creator_protocol

---

## 🎯 Estimated Effort

| Phase | Complexity | Time Estimate |
|-------|-----------|---------------|
| **Phase 1: Program** | High | 2-3 days |
| **Phase 2: Backend** | Medium | 1-2 days |
| **Phase 3: Testing** | Medium | 1 day |
| **Total** | - | **4-6 days** |

**Skills Required:**
- Rust (Solana programs)
- Anchor framework
- TypeScript
- Merkle tree concepts
- Bubblegum protocol

---

## ✅ Success Criteria

- [x] Standard NFT swaps work (DONE)
- [ ] cNFT ↔ SOL swaps work
- [ ] cNFT ↔ cNFT swaps work
- [ ] cNFT ↔ standard NFT swaps work
- [ ] All E2E tests passing
- [ ] `/test` page fully functional with cNFTs
- [ ] Production-ready documentation

---

## 🔗 Related PRs

- **PR #290:** USD display (merged) ✅
- **PR #300:** cNFT validation (merged) ✅
- **PR #301:** Signature fix (merged) ✅
- **PR #XXX:** cNFT swap support (pending)

---

**Status:** Ready for implementation
**Priority:** High (required for full feature parity)
**Blocker:** None (validation already works)

