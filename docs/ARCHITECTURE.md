# EasyEscrow.ai Atomic Swap Architecture

**Last Updated:** December 2, 2025  
**Status:** Production Active  
**Focus:** 100% Atomic Swaps

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Atomic Swap Flow](#atomic-swap-flow)
4. [Asset Types & Validation](#asset-types--validation)
5. [Transaction Building](#transaction-building)
6. [Durable Nonce System](#durable-nonce-system)
7. [Fee Calculation](#fee-calculation)
8. [Security Considerations](#security-considerations)
9. [cNFT Support](#cnft-support)

---

## Overview

EasyEscrow.ai is a **non-custodial atomic swap platform** that enables instant, trustless peer-to-peer exchanges of digital assets on Solana blockchain. The platform supports standard NFTs, compressed NFTs (cNFTs), and SOL tokens.

### Key Principles

- **Atomic Execution**: All transfers happen in a single transaction or none at all
- **Non-Custodial**: Assets never leave user wallets until swap execution
- **Trustless**: No escrow deposits, no backend coordination required
- **Instant**: Single transaction settlement with no waiting periods

---

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (User)                       │
│  - Phantom Wallet / Solflare                                │
│  - Transaction signing                                       │
└────────────┬────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────┐
│                      Backend API (Node.js)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Offer     │  │  Asset       │  │  Transaction    │   │
│  │  Manager    │  │  Validator   │  │  Builder        │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Nonce     │  │     Fee      │  │     Solana      │   │
│  │   Pool      │  │  Calculator  │  │    Service      │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
└────────────┬────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────┐
│                   Solana Blockchain                          │
│  ┌──────────────────┐  ┌─────────────────────────────┐     │
│  │  Escrow Program  │  │  External Programs          │     │
│  │  (Atomic Swaps)  │  │  - Token Program            │     │
│  └──────────────────┘  │  - Bubblegum (cNFT)        │     │
│                        │  - System Program           │     │
│                        └─────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  PostgreSQL  │  │    Redis     │  │  Helius RPC  │     │
│  │  (Offers)    │  │  (Caching)   │  │  (Indexing)  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **Offer Manager** | CRUD operations for swap offers, status management |
| **Asset Validator** | Verify NFT/cNFT/SOL ownership and metadata |
| **Transaction Builder** | Construct atomic swap transactions with proper accounts |
| **Nonce Pool Manager** | Manage durable nonce accounts for transaction durability |
| **Fee Calculator** | Calculate platform fees (percentage or flat-rate) |
| **Solana Service** | RPC communication, transaction submission |

---

## Atomic Swap Flow

### Complete Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. OFFER CREATION                                               │
│    Maker → Backend: POST /api/offers                           │
│    - Specify offered assets (NFTs/cNFTs/SOL)                   │
│    - Specify requested assets                                   │
│    - Backend validates asset ownership                          │
│    - Nonce account assigned from pool                          │
│    - Offer stored as PENDING                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. OFFER ACCEPTANCE                                             │
│    Taker → Backend: POST /api/offers/{id}/accept              │
│    - Backend validates taker owns requested assets             │
│    - Transaction built with both parties' assets               │
│    - Serialized transaction returned to taker                  │
│    - Offer status → ACCEPTED                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. TRANSACTION SIGNING & BROADCAST                              │
│    Taker (Client-side):                                         │
│    - Deserialize transaction                                    │
│    - Sign with wallet (Phantom/Solflare)                       │
│    - Broadcast to Solana RPC                                   │
│    - Obtain transaction signature                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. CONFIRMATION                                                 │
│    Taker → Backend: POST /api/offers/{id}/confirm             │
│    - Provide transaction signature                             │
│    - Backend verifies transaction on-chain                     │
│    - Offer status → FILLED                                     │
│    - Assets atomically transferred                             │
└─────────────────────────────────────────────────────────────────┘
```

### Alternative Flows

#### Cancellation
```
Maker → Backend: POST /api/offers/{id}/cancel
- Nonce account advanced (invalidates transaction)
- Offer status → CANCELLED
```

#### Counter-Offer
```
Taker → Backend: POST /api/offers/{id}/counter
- Create new offer with different terms
- Links to parent offer
- Original offer remains active
```

#### Expiration
```
Backend (Automatic):
- After 7 days, offer status → EXPIRED
- Nonce returned to pool
```

---

## Asset Types & Validation

### Supported Asset Types

| Asset Type | Description | Validation Method |
|------------|-------------|-------------------|
| **Standard NFT** | SPL tokens (Metaplex) | Token account ownership via RPC |
| **Compressed NFT** | Bubblegum cNFTs | Asset indexer (Helius/QuickNode) + Merkle proof |
| **SOL** | Native Solana tokens | Account balance check via RPC |

### Asset Validation Flow

```typescript
// Standard NFT Validation
1. Query token account via RPC
2. Verify ownership matches wallet
3. Verify mint address exists
4. Check for freeze authority
5. Return validated asset metadata

// Compressed NFT Validation  
1. Query asset via Helius DAS API
2. Verify ownership matches wallet
3. Fetch Merkle proof data:
   - root (32 bytes)
   - dataHash (32 bytes) 
   - creatorHash (32 bytes)
   - nonce (u64)
   - leafIndex (u32)
4. Verify asset not burned/transferred
5. Return validated asset + proof

// SOL Validation
1. Query account balance via RPC
2. Verify balance >= requested amount
3. Account for transaction fees (~0.005 SOL)
4. Return validated SOL amount
```

### Asset Status States

- **VALID**: Asset verified and ready for swap
- **INVALID_OWNERSHIP**: Asset not owned by specified wallet
- **INVALID_METADATA**: Asset metadata malformed or missing
- **BURNED**: cNFT has been burned
- **FROZEN**: NFT has active freeze authority

---

## Transaction Building

### Atomic Swap Transaction Structure

```
┌──────────────────────────────────────────────────────────────┐
│ Transaction (Single Atomic Execution)                         │
├──────────────────────────────────────────────────────────────┤
│ INSTRUCTION 1: Advance Durable Nonce                         │
│   - Nonce account                                            │
│   - Platform authority (signer)                              │
├──────────────────────────────────────────────────────────────┤
│ INSTRUCTION 2: Atomic Swap (Escrow Program)                  │
│   Accounts:                                                  │
│   - maker (signer)                                           │
│   - taker (signer)                                           │
│   - maker_nft_account (if NFT offered)                       │
│   - taker_nft_destination (if NFT offered)                   │
│   - taker_nft_account (if NFT requested)                     │
│   - maker_nft_destination (if NFT requested)                 │
│   - treasury (platform fee collector)                        │
│   - token_program                                            │
│   - system_program                                           │
│                                                              │
│   Data:                                                      │
│   - maker_sol_amount (u64 lamports)                         │
│   - taker_sol_amount (u64 lamports)                         │
│   - platform_fee (u64 lamports)                             │
└──────────────────────────────────────────────────────────────┘
```

### Account Resolution

The transaction builder must resolve all required accounts:

**For Standard NFT Transfers:**
```typescript
- Maker NFT source: getAssociatedTokenAddress(mint, makerPubkey)
- Taker NFT destination: getAssociatedTokenAddress(mint, takerPubkey)
- Create ATA if it doesn't exist (prepend CreateATA instruction)
```

**For SOL Transfers:**
```typescript
- No token accounts needed
- SOL transfers via System Program
- Deducted from wallet balance directly
```

**For cNFT Transfers (In Development):**
```typescript
- Merkle tree account
- Tree authority PDA
- Bubblegum program
- Compression program  
- Log wrapper program
- Proof data (root, dataHash, creatorHash, nonce, index)
```

---

## Durable Nonce System

### Why Durable Nonces?

Standard Solana transactions expire after ~2 minutes due to blockhash expiration. Atomic swaps require transactions that can remain valid indefinitely until the taker signs them.

**Durable nonces** provide:
- Transactions that never expire
- Ability to pre-build transactions
- Cancellation by nonce advancement

### Nonce Pool Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Nonce Pool Manager                         │
├──────────────────────────────────────────────────────────────┤
│ Pool Size: 50 nonce accounts (configurable)                  │
│                                                              │
│ States:                                                      │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│ │ AVAILABLE│  │ ASSIGNED │  │  EXPIRED │                  │
│ │   (30)   │  │   (15)   │  │    (5)   │                  │
│ └──────────┘  └──────────┘  └──────────┘                  │
│                                                              │
│ Operations:                                                  │
│ - assign(): Get available nonce → ASSIGNED                   │
│ - release(): Return nonce → AVAILABLE                        │
│ - advance(): Invalidate transaction, return to pool          │
│ - cleanup(): Reclaim expired/stale nonces                    │
└──────────────────────────────────────────────────────────────┘
```

### Nonce Lifecycle

```
1. INITIALIZATION
   - Create nonce account (rent: ~0.00144 SOL)
   - Fund with rent-exempt balance
   - Initialize with platform authority
   - Status: AVAILABLE

2. ASSIGNMENT
   - Offer created → nonce assigned
   - Status: ASSIGNED
   - Database: offer.nonceAccount = pubkey

3. USAGE
   - Transaction built with nonce
   - First instruction: NonceAdvance
   - Transaction remains valid until nonce advances

4. COMPLETION (Success)
   - Transaction confirmed on-chain
   - Nonce automatically advanced
   - Status: AVAILABLE (returned to pool)

5. COMPLETION (Cancel)
   - Explicit nonce advance instruction
   - Transaction invalidated
   - Status: AVAILABLE (returned to pool)

6. EXPIRATION
   - Offer expires (7 days)
   - Nonce released automatically
   - Status: AVAILABLE
```

---

## Fee Calculation

### Fee Structure

| Swap Type | Fee Type | Amount |
|-----------|----------|--------|
| **NFT ↔ NFT** | Flat | 0.005 SOL |
| **NFT ↔ SOL** | Percentage | 1% of SOL amount |
| **SOL ↔ NFT** | Percentage | 1% of SOL amount |
| **cNFT ↔ SOL** | Percentage | 1% of SOL amount |
| **cNFT ↔ NFT** | Flat | 0.005 SOL |

### Fee Calculation Logic

```typescript
function calculatePlatformFee(
  offeredSol: bigint,
  requestedSol: bigint,
  offeredAssets: Asset[],
  requestedAssets: Asset[]
): bigint {
  const totalSol = offeredSol + requestedSol;
  
  // NFT-only or cNFT-only swap (no SOL involved)
  if (totalSol === 0n) {
    return 5_000_000n; // 0.005 SOL flat fee
  }
  
  // SOL involved: 1% fee with min/max bounds
  const percentageFee = totalSol * 100n / 10_000n; // 1%
  const minFee = 1_000_000n;   // 0.001 SOL
  const maxFee = 500_000_000n; // 0.5 SOL
  
  return BigInt(Math.max(
    Number(minFee),
    Math.min(Number(percentageFee), Number(maxFee))
  ));
}
```

### Fee Collection

- Fees paid by **taker** (accepter of the offer)
- Collected during atomic swap execution
- Transferred to platform treasury PDA
- No escrow, no delays—instant collection

---

## Security Considerations

### Asset Ownership Verification

**Standard NFTs:**
- Query token account via RPC
- Verify `owner` field matches wallet
- Check token `amount` === 1

**Compressed NFTs:**
- Query via DAS API (Helius/QuickNode)
- Verify `ownership.owner` matches wallet
- Verify `burnt === false`
- Fetch fresh Merkle proof before transaction

**SOL:**
- Query account balance via RPC
- Ensure balance >= (requested + fees + rent)

### Transaction Security

**Durable Nonce Protection:**
- Each offer has unique nonce
- Cancellation advances nonce (invalidates transaction)
- Prevents replay attacks

**Atomic Execution:**
- All transfers in single transaction
- If any transfer fails, entire transaction reverts
- No partial execution possible

**Rate Limiting:**
- Standard endpoints: 100 req/15min
- Create offer: 10 req/15min
- Prevents spam and DoS attacks

**Input Validation:**
- All inputs validated with Joi schemas
- Wallet addresses verified as valid Solana pubkeys
- Asset identifiers validated against on-chain data

### On-Chain Security (Solana Program)

**Account Validation:**
```rust
// Verify maker owns offered NFT
require!(
    ctx.accounts.maker_nft_account.owner == ctx.accounts.maker.key(),
    ErrorCode::InvalidNFTOwnership
);

// Verify correct token program
require!(
    ctx.accounts.token_program.key() == token::ID,
    ErrorCode::InvalidTokenProgram
);
```

**SOL Transfer Protection:**
```rust
// Prevent overflow
let total_lamports = maker_sol_amount
    .checked_add(platform_fee)
    .ok_or(ErrorCode::ArithmeticOverflow)?;

// Verify sufficient balance
require!(
    ctx.accounts.taker.lamports() >= total_lamports,
    ErrorCode::InsufficientFunds
);
```

---

## cNFT Support

### Current Status

✅ **COMPLETED:**
- Asset validation via Helius DAS API
- Merkle proof fetching
- Ownership verification
- Burn status checking

⚠️ **IN DEVELOPMENT:**
- Transaction building with Bubblegum accounts
- On-chain cNFT transfer instruction
- E2E testing for cNFT swaps

### cNFT Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ cNFT Validation Flow                                          │
├──────────────────────────────────────────────────────────────┤
│ 1. Query Asset via DAS API                                   │
│    GET /v1/assets/{assetId}                                  │
│    → Metadata, ownership, compression info                   │
│                                                              │
│ 2. Verify Ownership                                          │
│    asset.ownership.owner === walletAddress                   │
│    asset.burnt === false                                     │
│                                                              │
│ 3. Fetch Merkle Proof                                        │
│    POST /v1/assets/{assetId}/proof                          │
│    → root, dataHash, creatorHash, nonce, leafIndex          │
│                                                              │
│ 4. Return Validated Asset                                    │
│    {                                                         │
│      type: "CNFT",                                           │
│      identifier: assetId,                                    │
│      owner: walletAddress,                                   │
│      metadata: {...},                                        │
│      proofData: {...}  // For transaction building           │
│    }                                                         │
└──────────────────────────────────────────────────────────────┘
```

### cNFT Transaction Building (Planned)

**Additional Accounts Required:**
```typescript
{
  // Standard accounts
  maker: PublicKey,
  taker: PublicKey,
  treasury: PublicKey,
  systemProgram: PublicKey,
  
  // cNFT-specific accounts
  merkleTree: PublicKey,           // Concurrent merkle tree
  treeAuthority: PublicKey,        // PDA: ["TreeConfig", merkleTree]
  bubblegumProgram: PublicKey,     // Metaplex Bubblegum
  compressionProgram: PublicKey,   // SPL Account Compression
  logWrapper: PublicKey,           // SPL Noop (for logging)
}
```

**Proof Data Structure:**
```typescript
interface CnftProof {
  root: Buffer;          // 32 bytes - Merkle tree root
  dataHash: Buffer;      // 32 bytes - Asset data hash
  creatorHash: Buffer;   // 32 bytes - Creator list hash
  nonce: bigint;         // u64 - Leaf nonce
  leafIndex: number;     // u32 - Position in tree
}
```

### cNFT Transfer Instruction (On-Chain - Planned)

```rust
// Bubblegum CPI transfer
mpl_bubblegum::cpi::transfer(
    CpiContext::new(
        ctx.accounts.bubblegum_program.to_account_info(),
        Transfer {
            tree_authority: ctx.accounts.tree_authority,
            leaf_owner: ctx.accounts.maker,
            leaf_delegate: ctx.accounts.maker,
            new_leaf_owner: ctx.accounts.taker,
            merkle_tree: ctx.accounts.merkle_tree,
            log_wrapper: ctx.accounts.log_wrapper,
            compression_program: ctx.accounts.compression_program,
            system_program: ctx.accounts.system_program,
        },
    ),
    proof.root,
    proof.data_hash,
    proof.creator_hash,
    proof.nonce,
    proof.index,
)?;
```

### cNFT Challenges & Solutions

**Challenge 1: Transaction Size**
- cNFT transfers require many accounts (Merkle tree, authority, programs, etc.)
- Combined with standard NFT accounts can exceed transaction limits

**Solution:**
- Use Address Lookup Tables (ALTs) for account compression
- Split into multiple transactions if necessary

**Challenge 2: Proof Freshness**
- Merkle proofs can become stale if tree is modified
- Another cNFT from same tree gets transferred → root changes

**Solution:**
- Fetch proof immediately before transaction building
- Implement retry logic with fresh proof on failure
- Validate proof age (< 30 seconds old)

**Challenge 3: Tree Authority Derivation**
- Must correctly derive PDA for tree authority

**Solution:**
```typescript
const [treeAuthority] = await PublicKey.findProgramAddress(
  [
    Buffer.from("TreeConfig"),
    merkleTree.toBuffer()
  ],
  BUBBLEGUM_PROGRAM_ID
);
```

---

## Implementation References

### Key Files

**Backend Services:**
- `src/services/offerManager.ts` - Offer lifecycle management
- `src/services/assetValidator.ts` - NFT/cNFT/SOL validation
- `src/services/transactionBuilder.ts` - Transaction construction
- `src/services/noncePoolManager.ts` - Durable nonce management
- `src/services/feeCalculator.ts` - Platform fee calculation
- `src/services/solana.service.ts` - RPC communication

**Backend Routes:**
- `src/routes/offers.routes.ts` - Atomic swap API endpoints

**Solana Program:**
- `programs/escrow/src/lib.rs` - Program entrypoint
- `programs/escrow/src/instructions/atomic_swap.rs` - Swap instruction
- `programs/escrow/src/state/` - Program state structures

**Tests:**
- `tests/unit/atomic-swap-*.test.ts` - Unit tests
- `tests/integration/` - Integration tests
- `tests/staging/e2e/` - End-to-end staging tests

### External Dependencies

**Solana:**
- `@solana/web3.js` - Solana RPC client
- `@solana/spl-token` - Token program interactions
- `@metaplex-foundation/umi` - Metaplex tooling
- `@metaplex-foundation/mpl-bubblegum` - cNFT program (planned)

**Backend:**
- `express` - REST API framework
- `@prisma/client` - Database ORM
- `ioredis` - Redis caching
- `@coral-xyz/anchor` - Anchor client

---

## Related Documentation

- **[Strategic Pivot](STRATEGIC_PIVOT_ATOMIC_SWAPS.md)** - Why atomic swaps?
- **[API Documentation](api/openapi.yaml)** - OpenAPI 3.0 specification
- **[cNFT Implementation Plan](tasks/CNFT_SWAP_SUPPORT.md)** - Detailed cNFT roadmap
- **[Testing Strategy](testing/TESTING_STRATEGY.md)** - Comprehensive test approach
- **[Deployment Guide](deployment/DEPLOYMENT_GUIDE.md)** - Production deployment

---

**Last Updated:** December 2, 2025  
**Maintained By:** EasyEscrow.ai Development Team  
**Status:** Living Document - Updated as system evolves



