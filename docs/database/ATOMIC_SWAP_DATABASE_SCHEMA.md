# Atomic Swap Database Schema

**Last Updated:** December 2, 2025  
**Database:** PostgreSQL 14+  
**ORM:** Prisma 5.x

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Table Definitions](#table-definitions)
4. [Indexes & Performance](#indexes--performance)
5. [Sample Queries](#sample-queries)
6. [Migration History](#migration-history)

---

## Overview

The atomic swap database schema supports the complete lifecycle of peer-to-peer asset exchanges on Solana. The design emphasizes:

- **Atomic Operations**: Single-transaction swaps with no escrow deposits
- **Durable Nonces**: Nonce pool management for transaction durability
- **Asset Flexibility**: Support for NFTs, cNFTs, and SOL
- **Audit Trail**: Complete transaction history and state transitions

### Core Tables

| Table | Purpose | Records |
|-------|---------|---------|
| `offers` | Swap offers (pending, filled, cancelled) | ~10K/month |
| `nonce_accounts` | Durable nonce pool management | 50-100 static |
| `transaction_history` | On-chain transaction records | ~10K/month |
| `users` (future) | User profiles and statistics | Growing |

---

## Entity Relationship Diagram

```
┌──────────────────────┐
│      OFFERS          │
├──────────────────────┤
│ PK id                │
│    maker_wallet      │────┐
│    taker_wallet      │    │
│    offered_assets    │    │ 1:1
│    requested_assets  │    │
│    offered_sol       │    │
│    requested_sol     │    ↓
│    platform_fee      │ ┌──────────────────────┐
│ FK nonce_account  ───┼─│  NONCE_ACCOUNTS      │
│    nonce_value       │ ├──────────────────────┤
│    status            │ │ PK id                │
│    parent_offer_id ──┼─│    public_key        │
│    expires_at        │ │    status            │
│    created_at        │ │    assigned_to_offer │
│    filled_at         │ │    last_used_at      │
│    cancelled_at      │ │    created_at        │
└───────┬──────────────┘ └──────────────────────┘
        │
        │ 1:N
        ↓
┌──────────────────────┐
│ TRANSACTION_HISTORY  │
├──────────────────────┤
│ PK id                │
│ FK offer_id          │
│    signature         │
│    status            │
│    error_message     │
│    created_at        │
│    confirmed_at      │
└──────────────────────┘
```

---

## Table Definitions

### 1. `offers`

Stores atomic swap offers from creation to completion.

```sql
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
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "parent_offer_id" INTEGER REFERENCES "offers"("id"),
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "filled_at" TIMESTAMP,
  "cancelled_at" TIMESTAMP,
  
  CONSTRAINT "chk_status" CHECK ("status" IN (
    'PENDING', 'ACCEPTED', 'FILLED', 'CANCELLED', 'EXPIRED'
  ))
);
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | SERIAL | NO | Primary key, auto-increment |
| `maker_wallet` | TEXT | NO | Wallet address of offer creator |
| `taker_wallet` | TEXT | YES | Optional: specific taker (null = open offer) |
| `offered_assets` | JSONB | NO | Array of assets maker is offering |
| `requested_assets` | JSONB | NO | Array of assets maker is requesting |
| `offered_sol_lamports` | BIGINT | NO | SOL amount maker offers (lamports) |
| `requested_sol_lamports` | BIGINT | NO | SOL amount maker requests (lamports) |
| `platform_fee_lamports` | BIGINT | NO | Platform fee amount (lamports) |
| `nonce_account` | TEXT | NO | Durable nonce account public key |
| `nonce_value` | TEXT | YES | Current nonce value (hash) |
| `status` | TEXT | NO | Offer lifecycle status |
| `parent_offer_id` | INTEGER | YES | FK to parent offer (for counter-offers) |
| `expires_at` | TIMESTAMP | NO | Offer expiration time (default: +7 days) |
| `created_at` | TIMESTAMP | NO | Offer creation timestamp |
| `filled_at` | TIMESTAMP | YES | Swap execution timestamp |
| `cancelled_at` | TIMESTAMP | YES | Cancellation timestamp |

#### Asset JSON Structure

```typescript
interface Asset {
  mint: string;          // NFT mint address or cNFT asset ID
  isCompressed: boolean; // true = cNFT, false = standard NFT
  metadata?: {           // Optional: cached metadata
    name: string;
    image: string;
    collection?: string;
  };
  proofData?: {          // For cNFTs only
    root: string;
    dataHash: string;
    creatorHash: string;
    nonce: string;
    leafIndex: number;
  };
}
```

**Example `offered_assets`:**
```json
[
  {
    "mint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "isCompressed": false,
    "metadata": {
      "name": "Cool Cat #123",
      "image": "https://arweave.net/...",
      "collection": "Cool Cats"
    }
  }
]
```

**Example cNFT `offered_assets`:**
```json
[
  {
    "mint": "DRiP2Pn2K6fuMLKQmt5rZWqHheXMyUtCeXhe8kDQdxRu",
    "isCompressed": true,
    "metadata": {
      "name": "DRiP #456",
      "image": "https://arweave.net/..."
    },
    "proofData": {
      "root": "abc123...",
      "dataHash": "def456...",
      "creatorHash": "ghi789...",
      "nonce": "12345",
      "leafIndex": 67
    }
  }
]
```

#### Status Lifecycle

```
PENDING → ACCEPTED → FILLED (successful swap)
   ↓         ↓
CANCELLED  CANCELLED (maker cancels at any time)
   ↓
EXPIRED (after 7 days)
```

---

### 2. `nonce_accounts`

Manages the pool of durable nonce accounts for transaction durability.

```sql
CREATE TABLE "nonce_accounts" (
  "id" SERIAL PRIMARY KEY,
  "public_key" TEXT UNIQUE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "assigned_to_offer_id" INTEGER REFERENCES "offers"("id"),
  "last_used_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "chk_nonce_status" CHECK ("status" IN (
    'AVAILABLE', 'ASSIGNED', 'EXPIRED'
  ))
);
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | SERIAL | NO | Primary key |
| `public_key` | TEXT | NO | Nonce account address (unique) |
| `status` | TEXT | NO | Pool status (AVAILABLE/ASSIGNED/EXPIRED) |
| `assigned_to_offer_id` | INTEGER | YES | FK to offer using this nonce |
| `last_used_at` | TIMESTAMP | YES | Last time nonce was used |
| `created_at` | TIMESTAMP | NO | Nonce account creation time |

#### Status States

| Status | Description | Count (typical) |
|--------|-------------|-----------------|
| `AVAILABLE` | Ready to be assigned | 30-40 |
| `ASSIGNED` | Currently assigned to an offer | 10-15 |
| `EXPIRED` | Stale, needs cleanup/recreation | 0-5 |

#### Pool Management

**Pool Size:** 50 nonce accounts (configurable via `NONCE_POOL_SIZE`)  
**Replenishment Trigger:** When available < 10  
**Cleanup Interval:** Every 5 minutes

---

### 3. `transaction_history`

Records all blockchain transactions related to offers.

```sql
CREATE TABLE "transaction_history" (
  "id" SERIAL PRIMARY KEY,
  "offer_id" INTEGER NOT NULL REFERENCES "offers"("id") ON DELETE CASCADE,
  "signature" TEXT UNIQUE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "error_message" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "confirmed_at" TIMESTAMP,
  
  CONSTRAINT "chk_tx_status" CHECK ("status" IN (
    'PENDING', 'CONFIRMED', 'FAILED'
  ))
);
```

#### Column Details

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | SERIAL | NO | Primary key |
| `offer_id` | INTEGER | NO | FK to offer |
| `signature` | TEXT | NO | Solana transaction signature (unique) |
| `status` | TEXT | NO | Transaction status |
| `error_message` | TEXT | YES | Error details if failed |
| `created_at` | TIMESTAMP | NO | When tx was submitted |
| `confirmed_at` | TIMESTAMP | YES | When tx was confirmed on-chain |

---

## Indexes & Performance

### Primary Indexes

```sql
-- Primary keys (auto-indexed)
CREATE INDEX "offers_pkey" ON "offers"("id");
CREATE INDEX "nonce_accounts_pkey" ON "nonce_accounts"("id");
CREATE INDEX "transaction_history_pkey" ON "transaction_history"("id");
```

### Performance Indexes

```sql
-- Offers table
CREATE INDEX "idx_offers_status" ON "offers"("status");
CREATE INDEX "idx_offers_maker_wallet" ON "offers"("maker_wallet");
CREATE INDEX "idx_offers_taker_wallet" ON "offers"("taker_wallet");
CREATE INDEX "idx_offers_created_at" ON "offers"("created_at" DESC);
CREATE INDEX "idx_offers_expires_at" ON "offers"("expires_at") WHERE "status" = 'PENDING';
CREATE INDEX "idx_offers_nonce_account" ON "offers"("nonce_account");

-- Nonce accounts table
CREATE UNIQUE INDEX "idx_nonce_public_key" ON "nonce_accounts"("public_key");
CREATE INDEX "idx_nonce_status" ON "nonce_accounts"("status");
CREATE INDEX "idx_nonce_assigned_offer" ON "nonce_accounts"("assigned_to_offer_id");

-- Transaction history table
CREATE UNIQUE INDEX "idx_tx_signature" ON "transaction_history"("signature");
CREATE INDEX "idx_tx_offer_id" ON "transaction_history"("offer_id");
CREATE INDEX "idx_tx_status" ON "transaction_history"("status");
```

### Composite Indexes

```sql
-- Find pending offers for a wallet
CREATE INDEX "idx_offers_wallet_status" ON "offers"("maker_wallet", "status");

-- Find available nonces
CREATE INDEX "idx_nonce_status_available" ON "nonce_accounts"("status") 
  WHERE "status" = 'AVAILABLE';
```

---

## Sample Queries

### Find Active Offers by Wallet

```sql
SELECT 
  id,
  maker_wallet,
  taker_wallet,
  offered_assets,
  requested_assets,
  offered_sol_lamports,
  requested_sol_lamports,
  platform_fee_lamports,
  status,
  expires_at,
  created_at
FROM offers
WHERE maker_wallet = '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R'
  AND status IN ('PENDING', 'ACCEPTED')
ORDER BY created_at DESC;
```

### Find Open Offers (No Specific Taker)

```sql
SELECT *
FROM offers
WHERE status = 'PENDING'
  AND taker_wallet IS NULL
  AND expires_at > NOW()
ORDER BY created_at DESC
LIMIT 50;
```

### Get Nonce Pool Status

```sql
SELECT 
  status,
  COUNT(*) as count
FROM nonce_accounts
GROUP BY status;

-- Expected result:
-- AVAILABLE | 35
-- ASSIGNED  | 12
-- EXPIRED   | 3
```

### Get Available Nonce

```sql
UPDATE nonce_accounts
SET status = 'ASSIGNED',
    assigned_to_offer_id = $1,
    last_used_at = NOW()
WHERE id = (
  SELECT id
  FROM nonce_accounts
  WHERE status = 'AVAILABLE'
  ORDER BY last_used_at ASC NULLS FIRST
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING public_key;
```

### Get Swap Success Rate (Last 24h)

```sql
SELECT 
  COUNT(CASE WHEN status = 'FILLED' THEN 1 END) as filled,
  COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled,
  COUNT(CASE WHEN status = 'EXPIRED' THEN 1 END) as expired,
  COUNT(*) as total,
  ROUND(
    100.0 * COUNT(CASE WHEN status = 'FILLED' THEN 1 END) / COUNT(*),
    2
  ) as success_rate_pct
FROM offers
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Get Counter-Offer Chain

```sql
WITH RECURSIVE offer_chain AS (
  -- Base case: original offer
  SELECT 
    id, 
    parent_offer_id, 
    maker_wallet,
    status,
    created_at,
    1 as level
  FROM offers
  WHERE id = $1  -- Starting offer ID
  
  UNION ALL
  
  -- Recursive case: counter-offers
  SELECT 
    o.id,
    o.parent_offer_id,
    o.maker_wallet,
    o.status,
    o.created_at,
    oc.level + 1
  FROM offers o
  INNER JOIN offer_chain oc ON o.parent_offer_id = oc.id
)
SELECT * FROM offer_chain
ORDER BY level, created_at;
```

---

## Migration History

### Initial Schema (2025-11-20)

**Migration:** `20251120_init`

- Created `offers` table
- Created `nonce_accounts` table
- Created `transaction_history` table
- Added basic indexes

### Nonce Pool Enhancements (2025-11-25)

**Migration:** `20251125_add_nonce_pool`

- Added `assigned_to_offer_id` column to `nonce_accounts`
- Added `last_used_at` column for better pool management
- Added indexes for nonce pool queries

### Atomic Swap Pivot (2025-11-28)

**Migration:** `20251128_add_atomic_swap_offers`

- Modified `offers` table structure for atomic swaps
- Removed escrow-related columns
- Added `nonce_account` and `nonce_value` columns
- Added `platform_fee_lamports` column
- Updated status enum values

---

## Prisma Schema

**File:** `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Offer {
  id                     Int      @id @default(autoincrement())
  makerWallet            String   @map("maker_wallet")
  takerWallet            String?  @map("taker_wallet")
  offeredAssets          Json     @default("[]") @map("offered_assets")
  requestedAssets        Json     @default("[]") @map("requested_assets")
  offeredSolLamports     BigInt   @default(0) @map("offered_sol_lamports")
  requestedSolLamports   BigInt   @default(0) @map("requested_sol_lamports")
  platformFeeLamports    BigInt   @map("platform_fee_lamports")
  nonceAccount           String   @map("nonce_account")
  nonceValue             String?  @map("nonce_value")
  status                 String   @default("PENDING")
  parentOfferId          Int?     @map("parent_offer_id")
  expiresAt              DateTime @map("expires_at")
  createdAt              DateTime @default(now()) @map("created_at")
  filledAt               DateTime? @map("filled_at")
  cancelledAt            DateTime? @map("cancelled_at")

  parentOffer            Offer? @relation("OfferCounters", fields: [parentOfferId], references: [id])
  counterOffers          Offer[] @relation("OfferCounters")
  transactions           TransactionHistory[]

  @@index([status])
  @@index([makerWallet])
  @@index([takerWallet])
  @@index([createdAt(sort: Desc)])
  @@index([expiresAt], map: "idx_offers_pending_expires")
  @@map("offers")
}

model NonceAccount {
  id                Int       @id @default(autoincrement())
  publicKey         String    @unique @map("public_key")
  status            String    @default("AVAILABLE")
  assignedToOfferId Int?      @map("assigned_to_offer_id")
  lastUsedAt        DateTime? @map("last_used_at")
  createdAt         DateTime  @default(now()) @map("created_at")

  @@index([status])
  @@index([assignedToOfferId])
  @@map("nonce_accounts")
}

model TransactionHistory {
  id           Int       @id @default(autoincrement())
  offerId      Int       @map("offer_id")
  signature    String    @unique
  status       String    @default("PENDING")
  errorMessage String?   @map("error_message")
  createdAt    DateTime  @default(now()) @map("created_at")
  confirmedAt  DateTime? @map("confirmed_at")

  offer Offer @relation(fields: [offerId], references: [id], onDelete: Cascade)

  @@index([offerId])
  @@index([status])
  @@map("transaction_history")
}
```

---

## Backup & Recovery

### Automated Backups

- **Frequency:** Daily at 2 AM UTC
- **Retention:** 14 days (production), 7 days (staging)
- **Provider:** DigitalOcean Managed PostgreSQL

### Manual Backup

```bash
# Via DigitalOcean console
# Database → Settings → "Create Backup Now"

# Via CLI
doctl databases backup create <database-id>
```

### Restore from Backup

```bash
# Via DigitalOcean console
# Database → Backups → Select backup → "Restore"

# Creates new cluster from backup
# Update DATABASE_URL in app to point to restored cluster
```

---

## Related Documentation

- **[Architecture](../ARCHITECTURE.md)** - System architecture overview
- **[API Guide](../api/ATOMIC_SWAP_API_GUIDE.md)** - API integration guide
- **[Deployment Architecture](../deployment/ATOMIC_SWAP_DEPLOYMENT_ARCHITECTURE.md)** - Deployment procedures

---

**Last Updated:** December 2, 2025  
**Database Version:** PostgreSQL 14.x  
**Maintained By:** EasyEscrow.ai Data Team

