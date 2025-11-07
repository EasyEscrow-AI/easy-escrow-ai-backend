# Phase 3 Section 2: Database Schema Updates - COMPLETED ✅

**Date:** November 4, 2025  
**Branch:** `feature/sol-migration`  
**Duration:** ~5 minutes  
**Status:** ✅ ALL COMPLETE

---

## Summary

Successfully updated the PostgreSQL database schema to support SOL-based escrow swaps. The database now mirrors the Solana program's `EscrowStateV2` structure and is ready for backend integration.

---

## Changes Made

### 1. New Enums Added

#### SwapType
```prisma
enum SwapType {
  NFT_FOR_SOL           // NFT <> SOL: Direct exchange
  NFT_FOR_NFT_WITH_FEE  // NFT <> NFT: Buyer pays separate SOL fee
  NFT_FOR_NFT_PLUS_SOL  // NFT <> NFT+SOL: Fee extracted from SOL amount
}
```

#### FeePayer
```prisma
enum FeePayer {
  BUYER   // Default: Buyer pays the platform fee
  SELLER  // Alternative: Seller pays the platform fee
}
```

#### Updated DepositType
```prisma
enum DepositType {
  USDC       // Legacy: USDC deposits
  NFT        // NFT deposits (seller's NFT A or buyer's NFT B)
  SOL        // NEW: SOL deposits from buyer
  NFT_BUYER  // NEW: Buyer's NFT deposit (for NFT<>NFT swaps)
}
```

### 2. Agreement Model Updates

Added 4 new nullable fields to support SOL swaps:

```prisma
model Agreement {
  // ... existing fields ...
  
  // SOL Migration fields
  swapType  SwapType? @map("swap_type")           // Type of swap
  solAmount Decimal?  @map("sol_amount") @db.Decimal(20, 9)  // SOL amount in lamports
  nftBMint  String?   @map("nft_b_mint")          // Buyer's NFT mint (for NFT<>NFT)
  feePayer  FeePayer? @default(BUYER) @map("fee_payer")  // Who pays the fee
  
  // ... relations ...
  
  @@index([nftBMint])  // NEW: Index for NFT B lookups
  @@index([swapType])  // NEW: Index for filtering by swap type
}
```

### 3. Database Migration

**Migration:** `20251104041915_sol_migration_support`

**SQL Operations:**
```sql
-- Create new enums
CREATE TYPE "SwapType" AS ENUM ('NFT_FOR_SOL', 'NFT_FOR_NFT_WITH_FEE', 'NFT_FOR_NFT_PLUS_SOL');
CREATE TYPE "FeePayer" AS ENUM ('BUYER', 'SELLER');

-- Extend existing enum
ALTER TYPE "DepositType" ADD VALUE 'SOL';
ALTER TYPE "DepositType" ADD VALUE 'NFT_BUYER';

-- Add new columns
ALTER TABLE "agreements" 
  ADD COLUMN "fee_payer" "FeePayer" DEFAULT 'BUYER',
  ADD COLUMN "nft_b_mint" TEXT,
  ADD COLUMN "sol_amount" DECIMAL(20,9),
  ADD COLUMN "swap_type" "SwapType";

-- Create indexes
CREATE INDEX "agreements_nft_b_mint_idx" ON "agreements"("nft_b_mint");
CREATE INDEX "agreements_swap_type_idx" ON "agreements"("swap_type");
```

### 4. Database Truncation

As per the deployment strategy, the development database was completely truncated:
- ✅ All tables dropped
- ✅ Schema recreated from scratch
- ✅ Previous migrations reapplied
- ✅ New SOL migration applied
- ✅ Fresh Prisma client generated

**Previous Data:** None (no active users)

---

## Files Modified

### Schema Files
- `prisma/schema.prisma` - Updated with SOL fields and enums

### Migration Files
- `prisma/migrations/20251104041915_sol_migration_support/migration.sql` - New migration

### Generated Files
- `src/generated/prisma/` - Regenerated Prisma Client (gitignored, but verified)

---

## Verification

### ✅ Schema Validation
```bash
npx prisma format  # No errors
```

### ✅ Migration Applied
```bash
npx prisma migrate dev --name sol_migration_support
# Success: Database is now in sync with your schema
```

### ✅ Prisma Client Generated
```typescript
// New types confirmed in src/generated/prisma/index.d.ts:
export type SwapType = 'NFT_FOR_SOL' | 'NFT_FOR_NFT_WITH_FEE' | 'NFT_FOR_NFT_PLUS_SOL'
export type FeePayer = 'BUYER' | 'SELLER'

// Agreement model includes new fields:
swapType: SwapType | null
solAmount: Decimal | null
nftBMint: string | null
feePayer: FeePayer | null
```

---

## Database State

### Before
- Legacy USDC-based schema
- No support for SOL swaps
- No NFT<>NFT swap support

### After
- ✅ Supports all 3 swap types
- ✅ SOL amount tracking (lamports as Decimal 20,9)
- ✅ NFT B mint tracking for NFT<>NFT swaps
- ✅ Flexible fee payer configuration
- ✅ Indexed for performance (nftBMint, swapType)
- ✅ Backward compatible (all new fields nullable)

---

## Alignment with Solana Program

The database schema now mirrors the Solana program's `EscrowStateV2`:

| Solana Program | Database Schema |
|----------------|-----------------|
| `SwapType` enum | `SwapType` enum |
| `sol_amount: u64` | `solAmount: Decimal(20,9)` |
| `nft_b_mint: Option<Pubkey>` | `nftBMint: String?` |
| `FeePayer` enum | `FeePayer` enum |

---

## Next Steps

**Phase 3 Section 3: Backend Service Updates** (NEXT)

Priority tasks:
1. Update `escrow-program.service.ts` with v2 instruction methods
2. Update `settlement.service.ts` for SOL-based settlements
3. Update `solana.service.ts` with SOL transfer utilities
4. Add swap type validation logic
5. Update transaction monitoring for v2 instructions

---

## Checklist Completion

- ✅ Review current Prisma schema
- ✅ Add SwapType enum (3 variants)
- ✅ Add FeePayer enum (2 variants)
- ✅ Update DepositType enum (added SOL, NFT_BUYER)
- ✅ Add solAmount field to Agreement
- ✅ Add nftBMint field to Agreement (indexed)
- ✅ Add swapType field to Agreement (indexed)
- ✅ Add feePayer field to Agreement (default: BUYER)
- ✅ Create and apply migration
- ✅ Truncate development database
- ✅ Verify Prisma client generation
- ✅ Commit changes to feature branch

---

## Commit

```
feat(database): Add SOL migration schema support

Phase 3 Section 2: Database Schema Updates

Added:
- SwapType enum (NFT_FOR_SOL, NFT_FOR_NFT_WITH_FEE, NFT_FOR_NFT_PLUS_SOL)
- FeePayer enum (BUYER, SELLER)
- Updated DepositType enum (added SOL, NFT_BUYER)
- Agreement model fields:
  * swapType (nullable, indexed)
  * solAmount (Decimal 20,9, nullable)
  * nftBMint (nullable, indexed)
  * feePayer (defaults to BUYER)

Database Changes:
- Truncated development database (clean slate)
- Created migration: 20251104041915_sol_migration_support
- Regenerated Prisma client with new types

This schema now supports all three SOL-based swap types and aligns
with the Solana program's EscrowStateV2 structure.

Related: Phase 3 Backend Integration
```

**Commit Hash:** `9ea1f58`

---

## Time Estimate vs Actual

- **Estimated:** 30-60 minutes
- **Actual:** ~5 minutes
- **Reason for speed:** Clean database reset simplified the process, no data migration needed

---

## 🎉 Milestone Achieved

The database is now **fully prepared** for SOL-based escrow swaps. All three swap types are supported at the schema level, with proper indexing and type safety.

**Ready for:** Backend service integration and API endpoint updates.

