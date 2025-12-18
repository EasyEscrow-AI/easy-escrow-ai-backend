# Bubblegum Delegation API - Technical Documentation

## Overview

This document provides comprehensive technical documentation for implementing compressed NFT (cNFT) delegation using Metaplex Bubblegum for the EasyEscrow.ai atomic swap platform. Delegation enables secure, trustless swaps by allowing a program-controlled PDA to authorize transfers without requiring custody.

## Table of Contents

1. [Bubblegum Delegate Instruction](#1-bubblegum-delegate-instruction)
2. [Freeze/Thaw for Swap Security](#2-freezethaw-for-swap-security)
3. [Transfer Authorization Patterns](#3-transfer-authorization-patterns)
4. [Security Considerations & Attack Vectors](#4-security-considerations--attack-vectors)
5. [Existing Implementations](#5-existing-implementations)
6. [Cost Analysis](#6-cost-analysis)

---

## 1. Bubblegum Delegate Instruction

### Core Concept

The delegation mechanism allows cNFT owners to grant operational authority to another account (the **Leaf Delegate**) while maintaining ownership. This is critical for escrow systems where a program PDA needs authority to execute transfers upon settlement.

### Delegate Authority Capabilities

The Leaf Delegate can perform the following actions:

| Action | Description | Post-Action State |
|--------|-------------|-------------------|
| **Transfer** | Move cNFT to new owner | Delegation resets to new owner |
| **Burn** | Permanently destroy the asset | N/A |
| **Freeze** | Prevent transfers (V2) | cNFT frozen until thawed |
| **Thaw** | Re-enable transfers (V2) | Normal transfer capability |

### Instruction Parameters

```rust
// Required accounts for delegate instruction
pub struct Delegate<'info> {
    pub leaf_owner: Signer<'info>,           // Current owner (must sign)
    pub previous_leaf_delegate: AccountInfo<'info>, // Existing delegate or owner
    pub new_leaf_delegate: AccountInfo<'info>,      // Account receiving delegation
    pub merkle_tree: AccountInfo<'info>,     // The Bubblegum tree
    pub tree_authority: AccountInfo<'info>,  // Tree config PDA
    // ... additional proof accounts
}
```

### JavaScript Implementation

```javascript
import { delegate, getAssetWithProof } from '@metaplex-foundation/mpl-bubblegum';

// Delegate cNFT to escrow PDA
const assetWithProof = await getAssetWithProof(umi, assetId, {
  truncateCanopy: true  // Optimize transaction size
});

await delegate(umi, {
  ...assetWithProof,
  leafOwner,
  previousLeafDelegate: leafOwner.publicKey,
  newLeafDelegate: escrowPda,  // PDA of escrow program
}).sendAndConfirm(umi);
```

### Rust CPI Implementation

```rust
use mpl_bubblegum::instructions::DelegateCpiBuilder;

// Delegate via CPI from escrow program
DelegateCpiBuilder::new(&ctx.accounts.bubblegum_program)
    .tree_config(&ctx.accounts.tree_authority)
    .leaf_owner(&ctx.accounts.leaf_owner)
    .previous_leaf_delegate(&ctx.accounts.previous_delegate)
    .new_leaf_delegate(&ctx.accounts.escrow_pda)
    .merkle_tree(&ctx.accounts.merkle_tree)
    .log_wrapper(&ctx.accounts.log_wrapper)
    .compression_program(&ctx.accounts.compression_program)
    .system_program(&ctx.accounts.system_program)
    // ... proof data from remaining accounts
    .invoke()?;
```

### PDA Derivation for Tree Authority

```rust
// Tree authority PDA (owned by Bubblegum program)
let (tree_authority, _bump) = Pubkey::find_program_address(
    &[b"TreeConfig", merkle_tree_pubkey.as_ref()],
    &mpl_bubblegum::ID
);
```

### Delegation to Program PDA

For escrow swaps, the delegate should be a PDA controlled by the escrow program:

```rust
// Escrow PDA seeds
let escrow_seeds = &[
    b"escrow",
    agreement_id.as_ref(),
    &[bump]
];

// The escrow PDA can then sign transfer CPIs
let signer_seeds = &[&escrow_seeds[..]];
```

### Revocation

To revoke delegation, the owner sets themselves as the new delegate:

```javascript
await delegate(umi, {
  ...assetWithProof,
  leafOwner: owner,
  previousLeafDelegate: currentDelegate,
  newLeafDelegate: owner.publicKey,  // Revoke by self-delegating
}).sendAndConfirm(umi);
```

---

## 2. Freeze/Thaw for Swap Security

### Overview

Bubblegum V2 introduces freeze/thaw capabilities that provide additional security for escrow scenarios by preventing transfers during the swap lock period.

### Available Instructions

| Instruction | Description | Use Case |
|-------------|-------------|----------|
| `freezeV2` | Freeze a delegated cNFT | Lock asset during swap |
| `delegateAndFreezeV2` | Atomic delegate + freeze | Single-tx escrow lock |
| `thawV2` | Unfreeze a cNFT | Cancel/release scenario |
| `thawAndRevokeV2` | Atomic thaw + revoke delegation | Cancel and return to owner |

### Delegation Models for Freeze

1. **Leaf Delegate (Asset-Level)**
   - Temporary authority over specific cNFT
   - Can freeze/thaw individual assets
   - Ideal for per-swap escrow

2. **Permanent Freeze Delegate (Collection-Level)**
   - Set via MPL-Core collection plugin
   - Collection-wide freeze authority
   - Useful for platform-wide controls

### Delegate and Freeze (Atomic)

```javascript
import { delegateAndFreezeV2, getAssetWithProof } from '@metaplex-foundation/mpl-bubblegum';

// Atomic delegation + freeze for secure escrow
const assetWithProof = await getAssetWithProof(umi, assetId, {
  truncateCanopy: true
});

await delegateAndFreezeV2(umi, {
  ...assetWithProof,
  leafOwner: seller,
  leafDelegate: escrowPda,
  authority: seller,  // Owner authorizes the freeze
}).sendAndConfirm(umi);
```

### Thaw and Transfer (Settlement)

```javascript
import { thawV2, transfer } from '@metaplex-foundation/mpl-bubblegum';

// On settlement: thaw then transfer
await thawV2(umi, {
  ...assetWithProof,
  leafOwner: seller,
  authority: escrowPda,  // Delegate thaws
}).sendAndConfirm(umi);

await transfer(umi, {
  ...assetWithProof,
  leafOwner: seller,
  newLeafOwner: buyer.publicKey,
}).sendAndConfirm(umi);
```

### Security Benefits for Escrow

1. **Prevents Owner Transfers**: Frozen cNFT cannot be transferred by owner
2. **Prevents Double-Spend**: Asset locked until explicit thaw
3. **Atomic Operations**: `delegateAndFreezeV2` ensures no race conditions
4. **Reversible**: Can thaw and return if swap cancelled

### Freeze vs Full Escrow Comparison

| Approach | Custody | Gas Cost | Complexity | Security |
|----------|---------|----------|------------|----------|
| **Freeze + Delegate** | Owner retains | Lower | Medium | High |
| **Transfer to Escrow** | Program holds | Higher | Lower | High |
| **JITO Bundle Only** | Owner retains | Variable | Low | Medium |

---

## 3. Transfer Authorization Patterns

### Authorization Options

Bubblegum transfers can be authorized by:

1. **Leaf Owner** - Current owner signs transaction
2. **Leaf Delegate** - Delegated authority signs (if set)
3. **Permanent Transfer Delegate** - Collection-level delegate (V2)

### Owner-Signed Transfer

```javascript
// Standard transfer by owner
await transfer(umi, {
  ...assetWithProof,
  leafOwner: currentOwner,
  newLeafOwner: recipient.publicKey,
}).sendAndConfirm(umi);
```

### Delegate-Signed Transfer (Escrow Pattern)

```rust
// CPI transfer from escrow program using PDA as delegate
TransferCpiBuilder::new(&ctx.accounts.bubblegum_program)
    .tree_config(&ctx.accounts.tree_authority)
    .leaf_owner(&ctx.accounts.seller)  // Original owner
    .leaf_delegate(&ctx.accounts.escrow_pda)  // PDA delegate signs
    .new_leaf_owner(&ctx.accounts.buyer)
    .merkle_tree(&ctx.accounts.merkle_tree)
    .log_wrapper(&ctx.accounts.log_wrapper)
    .compression_program(&ctx.accounts.compression_program)
    .system_program(&ctx.accounts.system_program)
    // Proof data in remaining accounts
    .invoke_signed(signer_seeds)?;  // PDA signs
```

### Permanent Transfer Delegate (V2)

For collection-wide authority:

```javascript
// Collection with PermanentTransferDelegate plugin
// Delegate can transfer without owner signature
await transfer(umi, {
  ...assetWithProof,
  leafOwner: currentOwner,  // For proof, not signing
  authority: permanentDelegate,  // Collection delegate signs
  newLeafOwner: recipient.publicKey,
}).sendAndConfirm(umi);
```

### Post-Transfer State

**Critical**: After any transfer:
- Leaf delegate resets to the new owner
- Previous delegation is automatically revoked
- New owner has full control

### Proof Requirements

All transfers require Merkle proof verification:

```javascript
// getAssetWithProof provides:
{
  root: PublicKey,        // Current tree root
  dataHash: Uint8Array,   // Hash of NFT data
  creatorHash: Uint8Array, // Hash of creators
  leafIndex: number,      // Position in tree
  proof: PublicKey[],     // Merkle proof nodes
}
```

---

## 4. Security Considerations & Attack Vectors

### 4.1 Merkle Proof Attacks

#### Stale Proof Attack

**Vector**: Attacker captures proof at time T1, waits for tree update at T2, attempts transfer with stale proof.

**Mitigation**:
- Bubblegum validates proof against current tree root
- Stale proofs are automatically rejected
- Always fetch fresh proofs before transaction submission

```javascript
// Always get fresh proof immediately before tx
const freshProof = await getAssetWithProof(umi, assetId);
// Submit transaction immediately
await transfer(umi, { ...freshProof, ... }).sendAndConfirm(umi);
```

#### Replay Attack

**Vector**: Re-submitting previously successful transaction.

**Mitigation**:
- Each transfer changes the Merkle leaf
- Previous proofs become invalid after any tree mutation
- Nonce/leaf index tracked on-chain

### 4.2 Front-Running & MEV

#### Sandwich Attack

**Vector**: Attacker front-runs swap transaction, manipulates state.

**Mitigation Strategies**:

1. **JITO Bundles** - Bundle swap transactions atomically
   ```javascript
   // Bundle ensures atomic execution
   const bundle = [
     delegateAndFreezeTx,
     settlementTx
   ];
   await jitoClient.sendBundle(bundle);
   ```

2. **Freeze Lock** - Freeze cNFT before swap window
   - Prevents any transfer until thaw
   - Attacker cannot front-run frozen asset

3. **Private RPC** - Use protected endpoints
   - Bypass public mempool
   - Reduce visibility to searchers

#### NFT Sniping

**Vector**: Bot front-runs listing/offer acceptance.

**Mitigation**:
- Use `delegateAndFreezeV2` for atomic locking
- Settlement only possible by designated delegate

### 4.3 Delegation Abuse

#### Unauthorized Delegation Revocation

**Vector**: Malicious owner revokes delegation before settlement.

**Mitigation**:
- Use `delegateAndFreezeV2` - frozen asset cannot be re-delegated
- Settlement must complete while asset frozen
- Track delegation state off-chain

#### Delegate Key Compromise

**Vector**: Escrow PDA's signing capability compromised.

**Mitigation**:
- Use program-derived addresses (PDAs)
- PDA seeds include unique identifiers
- No private key exists to compromise

### 4.4 Double-Spend Vectors

#### Race Condition Attack

**Vector**: Seller lists on multiple platforms, attempts concurrent sales.

**Mitigation**:
1. **Freeze on Lock**: Asset frozen prevents all transfers
2. **Proof Invalidation**: First successful transfer invalidates other proofs
3. **Off-chain Tracking**: Index delegation state, reject stale offers

### 4.5 Data Availability Concerns

#### RPC Provider Failure

**Vector**: RPC provider down, cannot fetch proofs.

**Mitigation**:
- Data is on Solana ledger (consensus-backed)
- Any node can replay transactions to derive state
- Use multiple RPC providers (Helius, Triton, etc.)
- Consider self-hosted indexer for critical operations

### 4.6 Security Checklist

```
[ ] Fresh proofs fetched immediately before transaction
[ ] PDA used as delegate (not EOA)
[ ] Freeze enabled during swap lock period
[ ] Program ID validation in CPI
[ ] Leaf owner/delegate verification
[ ] Expiry timestamp enforcement
[ ] Multi-sig for admin operations
[ ] Rate limiting on agreement creation
[ ] Transaction size optimization (truncateCanopy)
```

---

## 5. Existing Implementations

### 5.1 Magic Eden

**Architecture**:
- Traditional escrow model for listings
- NFTs transferred to marketplace escrow wallet
- Funds held in user escrow accounts for offers

**Key Patterns**:
```
Listing Flow:
1. User approves escrow
2. NFT transferred to ME escrow
3. On sale: NFT to buyer, funds to seller

Offer Flow:
1. Buyer deposits to escrow wallet
2. Funds locked for multiple offers (same balance)
3. On accept: Atomic swap via escrow
```

**Trade-offs**:
- Higher security (full custody)
- Higher gas costs (extra transfers)
- User trust in escrow contract required

### 5.2 Tensor

**Architecture**:
- AMM-integrated marketplace
- Supports compressed NFTs
- Aggregates liquidity across platforms

**Key Patterns**:
- Automated market making for NFT liquidity
- Pro trading features (limit orders, etc.)
- Cross-platform aggregation

### 5.3 Sorare (cNFT Reference)

Based on program analysis (`Gz9o1yxV5kVfyC53fFu7StTVeetPZWa2sohzvxJiLxMP`):

**Implementation Details**:
```rust
// CPI pattern for cNFT transfer
mpl_bubblegum::cpi::transfer(
    CpiContext::new_with_signer(
        bubblegum_program.to_account_info(),
        Transfer {
            tree_authority: tree_authority.to_account_info(),
            leaf_owner: seller.to_account_info(),
            leaf_delegate: escrow_pda.to_account_info(),
            new_leaf_owner: buyer.to_account_info(),
            merkle_tree: merkle_tree.to_account_info(),
            log_wrapper: log_wrapper.to_account_info(),
            compression_program: compression_program.to_account_info(),
            system_program: system_program.to_account_info(),
        },
        signer_seeds,
    ),
    root,
    data_hash,
    creator_hash,
    nonce,
    index,
)?;
```

**Security Measures**:
- Full Merkle proof validation
- Program ID verification
- Specific error codes for failure modes
- Optional accounts for backward compatibility

### 5.4 Metaplex Auctioneer Pattern

Reference implementation from Holaplex Reward Center:

```
Auctioneer Delegate Flow:
1. Auctioneer PDA given authority over listings
2. Cancel requests routed through reward center
3. Offers create escrow accounts
4. Settlement via CPI with PDA signing
```

### 5.5 Implementation Comparison

| Platform | cNFT Support | Delegation Model | Escrow Type | MEV Protection |
|----------|--------------|------------------|-------------|----------------|
| Magic Eden | Yes | Transfer to escrow | Full custody | Private RPC |
| Tensor | Yes | AMM pools | Pool-based | Priority fees |
| Sorare | Yes | Delegate to PDA | Non-custodial | Proof freshness |
| **Recommended** | Yes | Freeze + Delegate | Non-custodial | JITO bundles |

---

## 6. Cost Analysis

### 6.1 Compressed vs Regular NFT Costs

| Operation | Regular NFT | Compressed NFT | Savings |
|-----------|-------------|----------------|---------|
| Mint (1 NFT) | ~0.01 SOL | ~0.000005 SOL | 2000x |
| Mint (1M NFTs) | 12,000 SOL | 5.35 SOL | 2,243x |
| Transfer | ~0.000005 SOL | ~0.000005 SOL | Same |
| Delegate | ~0.000005 SOL | ~0.000005 SOL | Same |
| Storage (per NFT) | 0.002+ SOL | ~0 SOL | >1000x |

### 6.2 Transaction Fee Components

```
Base Fee:     0.000005 SOL (5,000 lamports) per signature
Priority Fee: Variable (0 - 0.001+ SOL based on congestion)
JITO Tip:     Minimum 1,000 lamports, typical 10,000-100,000+
```

### 6.3 JITO Bundles vs Priority Fees

| Factor | Priority Fees | JITO Bundles |
|--------|---------------|--------------|
| **Inclusion Guarantee** | Non-deterministic | High (auction winner) |
| **Atomicity** | Single tx only | Up to 5 transactions |
| **Cost Predictability** | Variable | Auction-based |
| **MEV Protection** | Low | High |
| **Speed** | Network dependent | ~200ms auction cycles |
| **Market Share** | ~34% of fees | ~66% of fees (Dec 2024) |

### 6.4 Swap Transaction Cost Estimates

**Basic Delegation Swap (3 transactions)**:
```
1. Delegate cNFT to escrow PDA:    ~0.00001 SOL
2. Lock USDC in escrow:            ~0.00001 SOL
3. Settlement (transfer both):     ~0.00002 SOL
                                   -----------
Total (no priority):               ~0.00004 SOL ($0.008 at $200/SOL)
```

**With Priority Fees (congested network)**:
```
Base fees:                         ~0.00004 SOL
Priority fees (3 tx):              ~0.0003 SOL
                                   -----------
Total:                             ~0.00034 SOL ($0.068)
```

**JITO Bundle (recommended for atomicity)**:
```
Base fees:                         ~0.00004 SOL
JITO tip (competitive):            ~0.0001-0.001 SOL
                                   -----------
Total:                             ~0.0001-0.001 SOL ($0.02-0.20)
```

### 6.5 Freeze vs Transfer Escrow Costs

| Approach | Transactions | Estimated Cost | Notes |
|----------|--------------|----------------|-------|
| **Delegate + Freeze** | 3 | ~0.00004 SOL | Non-custodial |
| **Transfer to Escrow** | 4 | ~0.00005 SOL | Extra transfer |
| **JITO Bundle (D+F)** | 3 (bundled) | ~0.0002 SOL | Atomic + MEV safe |

### 6.6 Cost Optimization Strategies

1. **Use `truncateCanopy: true`**
   - Reduces proof size in transaction
   - Lower compute units consumed
   - Fewer bytes = lower fees

2. **Batch Operations**
   - Combine multiple cNFT operations
   - Single transaction with multiple CPIs
   - Amortize base fee

3. **Address Lookup Tables (ALT)**
   - Compress account addresses
   - Critical for complex swaps
   - Required for large Merkle proofs

4. **Tree Configuration**
   - Larger canopy = smaller proofs
   - Trade-off: Higher upfront tree cost
   - Optimal for high-volume collections

### 6.7 Break-Even Analysis: JITO vs Priority Fees

```
JITO makes sense when:
- Swap value > 1 SOL (MEV risk increases with value)
- Network congestion high (priority fees spike)
- Atomicity required (multi-step swaps)
- Time-sensitive execution needed

Priority fees sufficient when:
- Low-value swaps (< 0.1 SOL)
- Network uncongested
- Single transaction operations
- Cost minimization priority
```

---

## References

- [Metaplex Bubblegum V1 Docs](https://developers.metaplex.com/bubblegum)
- [Metaplex Bubblegum V2 Docs](https://developers.metaplex.com/bubblegum-v2)
- [Delegating Compressed NFTs](https://developers.metaplex.com/bubblegum/delegate-cnfts)
- [Freezing and Thawing cNFTs](https://developers.metaplex.com/bubblegum-v2/freeze-cnfts)
- [Bubblegum FAQ](https://developers.metaplex.com/bubblegum/faq)
- [Helius Compression Guide](https://www.helius.dev/blog/all-you-need-to-know-about-compression-on-solana)
- [Solana State Compression](https://solana.com/news/state-compression-compressed-nfts-solana)
- [Solana Fees Guide](https://www.helius.dev/blog/solana-fees-in-theory-and-practice)
- [JITO MEV Economics](https://blog.quicknode.com/solana-mev-economics-jito-bundles-liquid-staking-guide/)
- [MEV Protection on Solana](https://www.quicknode.com/guides/solana-development/defi/mev-on-solana)

---

*Document Version: 1.0*
*Last Updated: December 2024*
*Task: cnft-delegation-swap #2*
