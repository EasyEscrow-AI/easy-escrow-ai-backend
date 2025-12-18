# ADR-001: Delegation-Based Settlement for cNFT Atomic Swaps

## Status

**Proposed**

## Context

EasyEscrow.ai requires a settlement mechanism for compressed NFT (cNFT) atomic swaps that balances security, cost efficiency, and user experience. The platform needs to support trustless swaps between cNFTs and SOL while protecting against front-running, double-spend, and MEV attacks.

### Current Challenge

Compressed NFTs on Solana use Merkle tree state compression, which changes how ownership and transfers work compared to traditional SPL NFTs:

1. **No Token Accounts**: cNFTs don't have token accounts that can be transferred to escrow PDAs
2. **Proof Requirements**: Every operation requires fresh Merkle proofs
3. **State Mutability**: Tree state changes invalidate previous proofs
4. **Delegation Model**: Bubblegum provides delegation instead of custody transfer

### Options Considered

1. **Option A: Transfer-to-Escrow (Traditional)**
2. **Option B: Delegation + Freeze (Non-Custodial)**
3. **Option C: No Lock (Rejected)**

## Decision

**We will implement Option B: Delegation + Freeze with sequential transaction settlement.**

This approach uses Bubblegum V2's `delegateAndFreezeV2` for secure asset locking, with sequential transactions for settlement execution.

## Rationale

### Option A: Transfer-to-Escrow (Rejected)

```
Flow:
1. Seller transfers cNFT to escrow vault
2. Buyer deposits SOL to escrow
3. On settlement: transfer cNFT to buyer, SOL to seller
4. On cancel: return cNFT to seller
```

**Pros:**
- Simple mental model
- Full custody = full control
- Works with existing infrastructure

**Cons:**
- Extra transfer transactions (higher cost)
- cNFT leaves user wallet during listing
- UX friction (users see empty wallet)
- Requires managing cNFT vault PDAs

**Verdict**: Rejected due to UX and cost overhead.

---

### Option B: Delegation + Freeze (Selected)

```
Flow:
1. Seller delegates cNFT to escrow PDA + freezes (atomic)
2. Buyer deposits SOL to escrow
3. On settlement: thaw + transfer via delegate (sequential txs)
4. On cancel: thaw + revoke delegation
```

**Pros:**
- Non-custodial (cNFT stays in user wallet)
- Frozen asset prevents double-spend
- Delegate PDA can authorize transfer
- Lower transaction count
- Better UX (user retains visual ownership)

**Cons:**
- Requires Bubblegum V2 features
- Slightly more complex implementation
- Freeze state must be tracked

**Verdict**: Selected as optimal balance of security, cost, and UX.

---

### Option C: No Lock (Rejected)

```
Flow:
1. Seller signs transfer authorization offline
2. Buyer deposits SOL
3. Backend transfers SOL + cNFT sequentially
4. No pre-lock mechanism
```

**Pros:**
- Minimal on-chain state
- Lowest transaction count
- Fastest settlement

**Cons:**
- No protection during listing window
- Seller can transfer cNFT before settlement
- Higher risk if transactions fail between steps

**Verdict**: Rejected due to insufficient security guarantees.

---

## Architecture

### Settlement Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     LISTING PHASE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Seller                    Escrow Program                        │
│    │                            │                                │
│    │── delegateAndFreezeV2 ────▶│  cNFT delegated to PDA        │
│    │                            │  cNFT frozen (no transfers)    │
│    │                            │                                │
│    │◀── Agreement Created ──────│  Store: seller, price, expiry │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     FUNDING PHASE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Buyer                     Escrow Program                        │
│    │                            │                                │
│    │── Deposit SOL ────────────▶│  SOL locked in escrow PDA     │
│    │                            │                                │
│    │◀── Deposit Confirmed ──────│  Track: buyer, amount, time   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   SETTLEMENT PHASE (Sequential)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Backend                                         Blockchain      │
│    │                                                  │          │
│    │── 1. Thaw cNFT ─────────────────────────────────▶│          │
│    │◀── Confirmed ────────────────────────────────────│          │
│    │                                                  │          │
│    │── 2. Transfer cNFT to buyer ────────────────────▶│          │
│    │◀── Confirmed ────────────────────────────────────│          │
│    │                                                  │          │
│    │── 3. Transfer SOL to seller (minus fees) ───────▶│          │
│    │◀── Confirmed ────────────────────────────────────│          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Account Structure

```rust
#[account]
pub struct EscrowAgreement {
    // Identifiers
    pub agreement_id: [u8; 32],
    pub bump: u8,

    // Participants
    pub seller: Pubkey,
    pub buyer: Option<Pubkey>,  // None for open offers

    // Asset Details
    pub cnft_asset_id: Pubkey,
    pub cnft_merkle_tree: Pubkey,
    pub price: u64,  // Price in lamports (SOL)

    // State
    pub status: EscrowStatus,
    pub cnft_delegated: bool,
    pub cnft_frozen: bool,
    pub sol_deposited: u64,

    // Timing
    pub created_at: i64,
    pub expires_at: i64,

    // Fees
    pub fee_bps: u16,
    pub honor_royalties: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum EscrowStatus {
    Created,        // Agreement initialized
    CnftLocked,     // cNFT delegated + frozen
    Funded,         // SOL deposited
    Settled,        // Swap complete
    Cancelled,      // Expired or cancelled
    Refunded,       // Assets returned
}
```

### PDA Seeds

```rust
// Escrow Agreement PDA
seeds = [b"escrow", agreement_id.as_ref()]

// SOL Vault PDA (escrow holds native SOL)
seeds = [b"sol_vault", agreement_id.as_ref()]

// This PDA becomes the cNFT delegate
// allowing it to authorize transfers via CPI
```

### Settlement Instruction

```rust
pub fn settle(ctx: Context<Settle>) -> Result<()> {
    let agreement = &mut ctx.accounts.agreement;

    // Validate state
    require!(agreement.status == EscrowStatus::Funded, EscrowError::NotFunded);
    require!(agreement.cnft_frozen, EscrowError::CnftNotLocked);
    require!(!is_expired(agreement), EscrowError::Expired);

    // 1. Thaw cNFT
    thaw_cnft_cpi(&ctx)?;

    // 2. Transfer cNFT to buyer (delegate-signed)
    transfer_cnft_cpi(&ctx)?;

    // 3. Calculate fees
    let fee_amount = calculate_fee(agreement.price, agreement.fee_bps);
    let seller_amount = agreement.price - fee_amount;

    // 4. Transfer SOL to seller
    transfer_sol_to_seller(&ctx, seller_amount)?;

    // 5. Transfer fee to platform
    transfer_sol_to_fee_vault(&ctx, fee_amount)?;

    // 6. Update state
    agreement.status = EscrowStatus::Settled;

    emit!(SettlementEvent {
        agreement_id: agreement.agreement_id,
        seller: agreement.seller,
        buyer: agreement.buyer.unwrap(),
        price: agreement.price,
        fee: fee_amount,
    });

    Ok(())
}
```

### Sequential Settlement Execution

```typescript
async function executeSettlement(agreement: EscrowAgreement) {
  // Get fresh proof
  const assetProof = await getAssetWithProof(umi, agreement.cnftAssetId, {
    truncateCanopy: true
  });

  // Step 1: Thaw cNFT
  const thawTx = await createThawV2Transaction({
    authority: escrowPda,
    leafOwner: agreement.seller,
    merkleTree: agreement.cnftMerkleTree,
    ...assetProof,
  });
  await sendAndConfirmTransaction(connection, thawTx);

  // Step 2: Transfer cNFT to buyer (delegate-signed)
  const transferCnftTx = await createTransferTransaction({
    leafOwner: agreement.seller,
    leafDelegate: escrowPda,
    newLeafOwner: agreement.buyer,
    merkleTree: agreement.cnftMerkleTree,
    ...assetProof,
  });
  await sendAndConfirmTransaction(connection, transferCnftTx);

  // Step 3: Transfer SOL + fees via settle instruction
  const settleTx = await program.methods
    .settle()
    .accounts({
      agreement: agreementPda,
      seller: agreement.seller,
      buyer: agreement.buyer,
      solVault: solVaultPda,
      feeVault: feeVaultPda,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  await sendAndConfirmTransaction(connection, settleTx);

  return { success: true };
}
```

## Consequences

### Positive

1. **Non-Custodial**: Users retain visual ownership during listing
2. **Secure**: Frozen assets cannot be double-spent
3. **Simple**: Sequential transactions are straightforward to implement
4. **Cost Efficient**: Fewer transactions than transfer-to-escrow
5. **Recoverable**: Cancellation returns asset to owner
6. **Reliable**: No dependency on third-party bundle services

### Negative

1. **V2 Dependency**: Requires Bubblegum V2 features
2. **Non-Atomic**: Sequential transactions could fail mid-settlement
3. **Complexity**: More moving parts than simple escrow
4. **Proof Freshness**: Must fetch proofs just before settlement

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Transaction fails mid-settlement | Low | High | Retry logic, admin recovery |
| Stale proof at settlement | Medium | Medium | Retry with fresh proof |
| Freeze state desync | Low | Medium | On-chain verification |
| Network congestion | Medium | Low | Priority fees, exponential backoff |

## Implementation Plan

### Phase 1: Core Infrastructure
- [ ] Implement escrow program with delegation support
- [ ] Add freeze/thaw CPI wrappers
- [ ] Create SOL vault management

### Phase 2: Settlement Engine
- [ ] Build sequential settlement execution
- [ ] Implement proof fetching service
- [ ] Add settlement monitoring
- [ ] Implement retry logic for failed transactions

### Phase 3: Safety Features
- [ ] Expiry-based cancellation
- [ ] Admin emergency controls
- [ ] Recovery for partial settlements
- [ ] Circuit breaker for repeated failures

### Phase 4: Testing
- [ ] Unit tests for all instructions
- [ ] Integration tests on devnet
- [ ] Load testing settlement engine
- [ ] Failure scenario testing

## Alternatives Not Selected

### Metaplex Auctioneer Delegate Pattern

Used by Holaplex Reward Center. Rejected because:
- Designed for auction houses, not atomic swaps
- Requires additional program integration
- Overkill for simple two-party swaps

### Token-2022 Transfer Hooks

Could implement custom transfer logic. Rejected because:
- cNFTs don't use Token-2022
- Would require token standard migration
- Unnecessary complexity

### Time-Locked Signatures

Pre-sign transactions with time validity. Rejected because:
- No on-chain enforcement during window
- Seller can still transfer elsewhere
- Insufficient security guarantees

## Related Decisions

- **ADR-002**: Fee Distribution Model (pending)
- **ADR-003**: Proof Caching Strategy (pending)
- **ADR-004**: Recovery Procedures (pending)

## References

- [Bubblegum V2 Documentation](https://developers.metaplex.com/bubblegum-v2)
- [Solana State Compression](https://solana.com/docs/advanced/state-compression)
- [EasyEscrow PRD](../.taskmaster/docs/prd.txt)
- [Sorare cNFT Analysis](../.taskmaster/docs/research/2025-11-28_analyze-sorares-solana-cnft-transfer-proxy-program.md)

---

*ADR Version: 1.1*
*Authors: Engineering Team*
*Date: December 2024*
*Task: cnft-delegation-swap #2*
