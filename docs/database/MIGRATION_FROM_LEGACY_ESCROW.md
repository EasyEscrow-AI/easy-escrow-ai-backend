# Migration Guide: Legacy Escrow to Atomic Swaps

**Last Updated:** December 2, 2025  
**Migration Date:** November 25, 2025  
**Status:** Complete

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Why We Migrated](#why-we-migrated)
3. [Key Differences](#key-differences)
4. [API Changes](#api-changes)
5. [Database Changes](#database-changes)
6. [Client Integration Updates](#client-integration-updates)
7. [What Was Deprecated](#what-was-deprecated)
8. [Rollback Strategy](#rollback-strategy)

---

## Overview

On November 25, 2025, EasyEscrow.ai completed a strategic pivot from a **legacy escrow system** (multi-step deposits with backend coordination) to a **100% atomic swap platform** (single-transaction, trustless exchanges).

### Migration Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Architecture** | Agreement-based escrow | Atomic swaps |
| **Transactions** | Multi-step (deposit NFT → deposit USDC → settle) | Single transaction |
| **Settlement** | Backend-coordinated | On-chain atomic |
| **Deposits** | Held in program accounts | No deposits (instant swap) |
| **Monitoring** | WebSocket deposit tracking | No monitoring needed |
| **Cancellation** | Admin-approved refunds | Instant nonce advancement |
| **Expiry** | Automatic refund processing | No refunds (no deposits) |

---

## Why We Migrated

### Problems with Legacy Escrow

1. **Complexity**: Multi-step flows confusing for users
2. **Risk**: Partial deposits created edge cases
3. **Cost**: High RPC usage for deposit monitoring
4. **Delay**: Users waited for counterparty deposits
5. **Support**: Refund requests required manual intervention

### Benefits of Atomic Swaps

1. **Simplicity**: One transaction, instant settlement
2. **Security**: All-or-nothing atomic execution
3. **Speed**: No waiting for deposits or settlement
4. **Cost**: Minimal RPC usage, no monitoring overhead
5. **Trustless**: No backend coordination required

---

## Key Differences

### Workflow Comparison

**Legacy Escrow Flow:**
```
1. Create Agreement (both parties agree on terms)
2. Buyer deposits USDC to escrow PDA
   ↓ (backend monitors via WebSocket)
3. Seller deposits NFT to escrow PDA
   ↓ (backend monitors via WebSocket)
4. Backend initiates settlement transaction
5. Assets transferred, fees collected
6. Agreement marked as settled

Total time: Minutes to hours
Transactions: 3-4 separate transactions
Backend involvement: Heavy (monitoring, settlement)
```

**Atomic Swap Flow:**
```
1. Maker creates offer (specifies assets to swap)
2. Taker accepts offer (gets pre-built transaction)
3. Taker signs & broadcasts transaction
4. Taker confirms with backend (for UI update)

Total time: Seconds
Transactions: 1 atomic transaction
Backend involvement: Minimal (just transaction building)
```

### Technical Architecture

**Legacy Escrow:**
```
┌─────────────────────────────────────────────────────┐
│                  Escrow Agreement                    │
│  - buyer: Wallet                                    │
│  - seller: Wallet                                   │
│  - usdc_amount: u64                                 │
│  - nft_mint: Pubkey                                 │
│  - escrow_usdc_account: Pubkey (holds USDC)        │
│  - escrow_nft_account: Pubkey (holds NFT)          │
│  - status: Enum (Created, Funded, Settled)          │
│  - deadline: i64                                    │
└─────────────────────────────────────────────────────┘
```

**Atomic Swaps:**
```
┌─────────────────────────────────────────────────────┐
│                   Atomic Swap Offer                  │
│  - maker: Wallet                                    │
│  - taker: Wallet (optional for open offers)         │
│  - offered_assets: Vec<Asset>                       │
│  - requested_assets: Vec<Asset>                     │
│  - offered_sol: u64                                 │
│  - requested_sol: u64                               │
│  - nonce_account: Pubkey (durable nonce)            │
│  - status: Enum (Pending, Accepted, Filled)         │
└─────────────────────────────────────────────────────┘

No escrow accounts! Assets never leave wallets until swap.
```

---

## API Changes

### Endpoints Mapping

| Legacy Endpoint | New Endpoint | Notes |
|----------------|--------------|-------|
| `POST /v1/agreements` | `POST /api/offers` | Create offer instead of agreement |
| `GET /v1/agreements` | `GET /api/offers` | List offers |
| `GET /v1/agreements/:id` | `GET /api/offers/:id` | Get details |
| `POST /v1/agreements/:id/deposit-usdc` | ❌ Removed | No deposits in atomic swaps |
| `POST /v1/agreements/:id/deposit-nft` | ❌ Removed | No deposits in atomic swaps |
| `POST /v1/agreements/:id/settle` | `POST /api/offers/:id/accept` | Accept offer, get transaction |
| `POST /v1/agreements/:id/cancel` | `POST /api/offers/:id/cancel` | Cancel offer |
| `GET /v1/agreements/:id/status` | `GET /api/offers/:id` | Status in offer details |
| - | `POST /api/offers/:id/counter` | ✨ New: Counter-offers |
| - | `POST /api/offers/:id/confirm` | ✨ New: Confirm tx broadcast |

### Request/Response Changes

**Legacy: Create Agreement**
```typescript
// POST /v1/agreements
{
  "buyer": "ABC...DEF",
  "seller": "GHI...JKL",
  "nftMint": "NFT...MINT",
  "usdcAmount": 1000000,  // 1 USDC
  "deadline": "2025-12-09T10:00:00.000Z"
}

// Response
{
  "agreementId": "123",
  "status": "CREATED",
  "escrowUsdcAccount": "USDC...PDA",
  "escrowNftAccount": "NFT...PDA"
}
```

**New: Create Offer**
```typescript
// POST /api/offers
{
  "makerWallet": "ABC...DEF",
  "takerWallet": "GHI...JKL",  // Optional
  "offeredAssets": [
    {
      "mint": "NFT...MINT",
      "isCompressed": false
    }
  ],
  "requestedAssets": [],
  "offeredSol": "0",
  "requestedSol": "1000000000"  // 1 SOL (not USDC)
}

// Response
{
  "offer": {
    "id": "123",
    "status": "PENDING",
    "nonceAccount": "NONCE...PDA",
    "expiresAt": "2025-12-09T10:00:00.000Z"
  }
}
```

**Key Changes:**
1. No `escrowUsdcAccount` or `escrowNftAccount` (no escrow!)
2. Assets use flexible `Asset` type (NFT, cNFT, SOL)
3. USDC replaced with SOL as primary payment token
4. `nonceAccount` instead of escrow PDAs
5. `takerWallet` is optional (supports open offers)

---

## Database Changes

### Schema Migration

**Legacy Tables (Removed):**
```sql
-- agreements
CREATE TABLE "agreements" (
  "id" SERIAL PRIMARY KEY,
  "buyer_wallet" TEXT NOT NULL,
  "seller_wallet" TEXT NOT NULL,
  "nft_mint" TEXT NOT NULL,
  "usdc_amount" BIGINT NOT NULL,
  "escrow_usdc_account" TEXT NOT NULL,
  "escrow_nft_account" TEXT NOT NULL,
  "status" TEXT NOT NULL,  -- CREATED, FUNDED_USDC, FUNDED_NFT, SETTLED, CANCELLED, EXPIRED
  "deadline" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "settled_at" TIMESTAMP,
  "cancelled_at" TIMESTAMP
);

-- deposit_logs
CREATE TABLE "deposit_logs" (
  "id" SERIAL PRIMARY KEY,
  "agreement_id" INTEGER REFERENCES "agreements"("id"),
  "type" TEXT NOT NULL,  -- USDC or NFT
  "amount" BIGINT,
  "detected_at" TIMESTAMP DEFAULT NOW()
);
```

**New Tables (Added):**
```sql
-- offers
CREATE TABLE "offers" (
  "id" SERIAL PRIMARY KEY,
  "maker_wallet" TEXT NOT NULL,
  "taker_wallet" TEXT,
  "offered_assets" JSONB NOT NULL DEFAULT '[]',
  "requested_assets" JSONB NOT NULL DEFAULT '[]',
  "offered_sol_lamports" BIGINT NOT NULL DEFAULT 0,
  "requested_sol_lamports" BIGINT NOT NULL DEFAULT 0,
  "platform_fee_lamports" BIGINT NOT NULL,
  "nonce_account" TEXT NOT NULL,
  "nonce_value" TEXT,
  "status" TEXT NOT NULL,  -- PENDING, ACCEPTED, FILLED, CANCELLED, EXPIRED
  "parent_offer_id" INTEGER REFERENCES "offers"("id"),
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "filled_at" TIMESTAMP,
  "cancelled_at" TIMESTAMP
);

-- nonce_accounts (NEW!)
CREATE TABLE "nonce_accounts" (
  "id" SERIAL PRIMARY KEY,
  "public_key" TEXT UNIQUE NOT NULL,
  "status" TEXT NOT NULL,  -- AVAILABLE, ASSIGNED, EXPIRED
  "assigned_to_offer_id" INTEGER REFERENCES "offers"("id"),
  "last_used_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW()
);
```

### Data Migration

**No direct data migration was performed** because:
- Legacy escrow system was deprecated (no active agreements)
- Atomic swaps use fundamentally different data model
- All legacy agreements were settled or expired before migration

If you had active agreements, you would need to:
1. Complete or cancel all legacy agreements
2. Wait for all refunds to process
3. Then switch to atomic swap system

---

## Client Integration Updates

### Frontend Changes

**Legacy: Multi-Step Deposit Flow**
```typescript
// Step 1: Create agreement
const agreement = await createAgreement({
  buyer: buyerWallet.publicKey,
  seller: sellerWallet.publicKey,
  nftMint,
  usdcAmount
});

// Step 2: Buyer deposits USDC
const depositUsdcTx = await buildDepositUsdcTx(agreement.id);
await buyerWallet.signAndSendTransaction(depositUsdcTx);

// Step 3: Wait for confirmation, backend updates status

// Step 4: Seller deposits NFT
const depositNftTx = await buildDepositNftTx(agreement.id);
await sellerWallet.signAndSendTransaction(depositNftTx);

// Step 5: Wait for confirmation, backend updates status

// Step 6: Backend automatically settles
// (or admin manually triggers settlement)

// Total: Multiple transactions, backend coordination required
```

**New: Single Atomic Swap**
```typescript
// Step 1: Maker creates offer
const offer = await createOffer({
  makerWallet: makerWallet.publicKey,
  offeredAssets: [{ mint: nftMint, isCompressed: false }],
  requestedSol: '1000000000'
});

// Step 2: Taker accepts offer
const { transaction } = await acceptOffer(offer.id, takerWallet.publicKey);

// Step 3: Taker signs and broadcasts
const tx = Transaction.from(Buffer.from(transaction.serialized, 'base64'));
const signedTx = await takerWallet.signTransaction(tx);
const signature = await connection.sendRawTransaction(signedTx.serialize());

// Step 4: Confirm with backend (for UI update)
await confirmSwap(offer.id, signature);

// Total: One transaction, instant settlement!
```

### SDK Changes

**Legacy SDK:**
```typescript
import { EscrowClient } from '@easyescrow/legacy-sdk';

const client = new EscrowClient({
  network: 'mainnet-beta',
  wallet: myWallet
});

// Create agreement
await client.agreements.create({...});

// Deposit USDC
await client.agreements.depositUsdc(agreementId);

// Deposit NFT
await client.agreements.depositNft(agreementId);
```

**New SDK:**
```typescript
import { EasyEscrowClient } from '@easyescrow/sdk';

const client = new EasyEscrowClient({
  network: 'mainnet-beta',
  wallet: myWallet
});

// Create and complete swap in one flow
const offer = await client.offers.create({...});
await client.offers.acceptAndExecute(offer.id);
// OR
const transaction = await client.offers.accept(offer.id);
const signature = await client.signAndBroadcast(transaction);
await client.offers.confirm(offer.id, signature);
```

---

## What Was Deprecated

### Backend Services (Removed/Commented Out)

1. **`deposit-monitoring.service.ts`**
   - WebSocket subscriptions for USDC deposits
   - WebSocket subscriptions for NFT deposits
   - Automatic status updates on deposit detection
   
2. **`expiry-cancellation.service.ts`**
   - Background job checking for expired agreements
   - Automatic refund processing
   - Admin cancellation workflows

3. **`settlement.service.ts`**
   - Backend-initiated settlement transactions
   - Multi-signature settlement coordination

4. **`refund.service.ts`**
   - Refund calculation logic
   - Partial refund execution

### API Routes (Removed)

```typescript
// Legacy routes (removed)
router.post('/v1/agreements/:id/deposit-usdc');
router.post('/v1/agreements/:id/deposit-nft');
router.post('/v1/agreements/:id/settle');
router.post('/v1/agreements/:id/refund');
router.get('/v1/agreements/:id/deposits');
```

### Solana Program Instructions (Deprecated)

```rust
// Legacy escrow instructions (still in program but unused)
pub fn init_agreement(...)  // Replaced by: No on-chain agreement needed
pub fn deposit_usdc(...)    // Replaced by: Atomic SOL transfer
pub fn deposit_nft(...)     // Replaced by: Atomic NFT transfer
pub fn settle(...)          // Replaced by: atomic_swap_with_fee instruction
pub fn cancel_if_expired()  // Replaced by: Nonce advancement
pub fn admin_cancel(...)    // Replaced by: Maker cancellation (nonce)
```

**New instruction:**
```rust
pub fn atomic_swap_with_fee(...)  // Single atomic swap instruction
```

### Test Suites (Parked)

The following E2E test files were parked (moved to `tests/legacy/`):

- `test-03-nft-for-nft-plus-sol.test.ts` (escrow version)
- `test-04-agreement-expiry-refund.test.ts`
- `test-05-admin-cancellation.test.ts`
- `test-06-zero-fee-transactions.test.ts` (escrow-specific)
- `test-07-idempotency-handling.test.ts` (escrow-specific)
- `test-08-concurrent-operations.test.ts` (escrow-specific)
- `test-09-edge-cases-validation.test.ts` (escrow-specific)

**New test suites:**
- `01-atomic-nft-for-sol-happy-path.test.ts` ✅ (atomic swap version)
- `atomic-swap-*.test.ts` (unit tests)
- `nonce-pool-*.test.ts` (nonce management tests)

---

## Rollback Strategy

⚠️ **Rollback to legacy escrow system is NOT supported.**

The atomic swap system is a **one-way migration**. The legacy escrow code remains in the repository (commented out) for reference but is not maintained.

### Why No Rollback?

1. **Database schema changed** (incompatible with legacy)
2. **On-chain program updated** (new atomic swap instruction)
3. **Legacy services removed** (deposit monitoring, settlement)
4. **API endpoints changed** (breaking changes)

### Contingency Plan

If critical issues arise with atomic swaps:

1. **Hotfix Forward**: Fix bugs in atomic swap system
2. **Feature Flags**: Disable problematic features temporarily
3. **Graceful Degradation**: Show maintenance message to users

**Do NOT attempt to rollback to legacy escrow without:**
- Full database restore
- Redeploying old Solana program
- Reactivating legacy services
- Reverting API changes

---

## Migration Checklist

If you're migrating a similar escrow system to atomic swaps, use this checklist:

### Pre-Migration
- [ ] Complete/cancel all active agreements
- [ ] Process all pending refunds
- [ ] Backup database
- [ ] Document all legacy API endpoints
- [ ] Freeze legacy feature development

### Migration
- [ ] Deploy new atomic swap program
- [ ] Update database schema
- [ ] Implement nonce pool management
- [ ] Update API endpoints
- [ ] Update client SDKs
- [ ] Update frontend flows
- [ ] Migrate test suites

### Post-Migration
- [ ] Verify all atomic swap types work
- [ ] Test nonce pool management
- [ ] Monitor error rates
- [ ] Update documentation
- [ ] Communicate changes to users
- [ ] Archive legacy code

---

## Support & Documentation

**Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)  
**API Guide:** [ATOMIC_SWAP_API_GUIDE.md](api/ATOMIC_SWAP_API_GUIDE.md)  
**Deployment:** [ATOMIC_SWAP_DEPLOYMENT_ARCHITECTURE.md](deployment/ATOMIC_SWAP_DEPLOYMENT_ARCHITECTURE.md)  
**Strategic Pivot:** [STRATEGIC_PIVOT_ATOMIC_SWAPS.md](STRATEGIC_PIVOT_ATOMIC_SWAPS.md)

**Questions?** Contact: support@easyescrow.ai

---

**Migration Completed:** November 25, 2025  
**Documentation Updated:** December 2, 2025  
**Maintained By:** EasyEscrow.ai Engineering Team



