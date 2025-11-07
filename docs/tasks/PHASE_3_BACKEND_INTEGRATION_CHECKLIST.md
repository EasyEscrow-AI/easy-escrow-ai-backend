# Phase 3: Backend Integration - Implementation Checklist

**Status:** 🔄 In Progress  
**Started:** 2025-11-04  
**Estimated Duration:** 3-5 days  
**Complexity:** High  

---

## Overview

This checklist guides the complete integration of the SOL-based escrow program with the backend services, database, and APIs. Each section must be completed in order due to dependencies.

**Prerequisites:**
- ✅ Phase 2 Complete (All 3 swap types implemented in Solana program)
- ✅ Smart contract compiles successfully
- ✅ Changes committed to `feature/sol-migration` branch

---

## 1. IDL Generation & TypeScript Types

### 1.1 Build Solana Program
- [ ] Set HOME environment variable (if needed): `$env:HOME = $env:USERPROFILE`
- [ ] Run `anchor build` to generate fresh IDL
- [ ] Verify `target/idl/escrow.json` exists and is updated
- [ ] Check IDL contains all v2 instructions:
  - [ ] `initAgreementV2`
  - [ ] `depositSol`
  - [ ] `depositSellerNft`
  - [ ] `depositBuyerNft`
  - [ ] `settleV2`
  - [ ] `cancelIfExpiredV2`
  - [ ] `adminCancelV2`
- [ ] Verify `SwapType` enum in IDL (NftForSol, NftForNftWithFee, NftForNftPlusSol)
- [ ] Verify `FeePayer` enum in IDL (Buyer, Seller)
- [ ] Verify `EscrowStateV2` struct in IDL

### 1.2 Copy IDL to Project
- [ ] Copy `target/idl/escrow.json` to `src/generated/anchor/escrow.json`
- [ ] Backup old IDL (rename to `escrow.json.backup`)
- [ ] Verify IDL format is valid JSON

### 1.3 Generate TypeScript Types
- [ ] Run `anchor-client-gen` or equivalent to generate types
- [ ] Verify `src/generated/anchor/escrow.ts` is created/updated
- [ ] Check TypeScript types match IDL structures
- [ ] Verify no TypeScript compilation errors: `npm run build`
- [ ] Update imports in services if type names changed

---

## 2. Database Schema Updates

### 2.1 Review Current Schema
- [ ] Review `prisma/schema.prisma` - Agreement model
- [ ] Review `prisma/schema.prisma` - Deposit model
- [ ] Review `prisma/schema.prisma` - DepositType enum
- [ ] Document current fields that need modification

### 2.2 Create Migration for SwapType
- [ ] Add `SwapType` enum to Prisma schema:
  ```prisma
  enum SwapType {
    NFT_FOR_SOL
    NFT_FOR_NFT_WITH_FEE
    NFT_FOR_NFT_PLUS_SOL
  }
  ```
- [ ] Add `swapType` field to Agreement model: `swapType SwapType @default(NFT_FOR_SOL)`

### 2.3 Create Migration for SOL Amount
- [ ] Add `solAmount` field to Agreement model: `solAmount Decimal? @db.Decimal(20, 9)`
- [ ] Keep `usdcAmount` field for backward compatibility (mark as optional)
- [ ] Add validation: At least one of `solAmount` or `usdcAmount` must be set

### 2.4 Create Migration for NFT B
- [ ] Add `nftBMint` field to Agreement model: `nftBMint String?`
- [ ] Add index on `nftBMint` for query performance

### 2.5 Create Migration for Fee Payer
- [ ] Add `FeePayer` enum to Prisma schema:
  ```prisma
  enum FeePayer {
    BUYER
    SELLER
  }
  ```
- [ ] Add `feePayer` field to Agreement model: `feePayer FeePayer @default(BUYER)`

### 2.6 Update DepositType Enum
- [ ] Add `SOL` to DepositType enum
- [ ] Add `NFT_BUYER` to DepositType enum (for buyer's NFT in NFT<>NFT swaps)
- [ ] Update Deposit model if needed

### 2.7 Run Migrations
- [ ] Create migration: `npx prisma migrate dev --name sol_migration`
- [ ] Review generated SQL migration file
- [ ] Apply migration: Migration should auto-apply in dev
- [ ] Verify schema changes: `npx prisma db pull` (should show no changes)
- [ ] Regenerate Prisma client: `npx prisma generate`
- [ ] Update TypeScript types if Prisma changed them

### 2.8 Database Truncation (Per Deployment Strategy)
- [ ] **Development:** Truncate now before Phase 3 testing
  - [ ] Backup: `pg_dump DATABASE_URL > backup-dev-$(date +%Y%m%d).sql`
  - [ ] Truncate: `npx prisma migrate reset --force`
  - [ ] Verify: Check all tables empty except system tables
- [ ] **Staging:** Plan truncation before staging deployment
- [ ] **Production:** Plan truncation during production deployment window

---

## 3. Backend Service Updates - EscrowProgramService

**File:** `src/services/escrow-program.service.ts`

### 3.1 Add New Method: initAgreementV2
- [ ] Create method signature with parameters:
  - escrowId: BN
  - buyer: PublicKey
  - seller: PublicKey
  - swapType: SwapType enum value
  - solAmount: BN | null
  - nftAMint: PublicKey
  - nftBMint: PublicKey | null
  - expiryTimestamp: BN
  - platformFeeBps: number
  - feePayer: FeePayer enum value
- [ ] Derive escrow PDA using escrowId
- [ ] Build `init_agreement_v2` instruction via Anchor
- [ ] Apply account signer fixes (buyer/seller should NOT be signers)
- [ ] Add compute budget instructions (300k CU)
- [ ] Add priority fee (dynamic via PriorityFeeService)
- [ ] Add Jito tip for mainnet
- [ ] Sign with admin keypair
- [ ] Send via Jito or regular RPC
- [ ] Return { pda, txId }
- [ ] Add comprehensive logging
- [ ] Add error handling

### 3.2 Add New Method: depositSol
- [ ] Create method signature: depositSol(escrowPda, buyer)
- [ ] Get escrow state to read sol_amount
- [ ] Build SOL transfer using SystemProgram
- [ ] Transfer from buyer to escrowPda using system program
- [ ] Build `deposit_sol` instruction via Anchor
- [ ] Apply account signer fixes
- [ ] Add compute budget and priority fee
- [ ] Add Jito tip for mainnet
- [ ] Sign with admin keypair
- [ ] Send transaction
- [ ] Return txId
- [ ] Add logging and error handling

### 3.3 Add New Method: depositBuyerNft
- [ ] Create method signature: depositBuyerNft(escrowPda, buyer, nftBMint)
- [ ] Derive buyer's NFT B token account
- [ ] Derive escrow's NFT B token account (PDA owner)
- [ ] Build `deposit_buyer_nft` instruction
- [ ] Apply signer fixes
- [ ] Add compute budget and priority fee
- [ ] Add Jito tip for mainnet
- [ ] Sign with admin keypair
- [ ] Send transaction
- [ ] Return txId
- [ ] Add logging and error handling

### 3.4 Update Existing Method: depositNft → depositSellerNft
- [ ] Verify depositNft calls correct on-chain instruction
- [ ] Update to use `deposit_seller_nft` if instruction name changed
- [ ] Ensure it handles NFT A (seller's NFT) correctly
- [ ] No other changes needed (already working)

### 3.5 Add New Method: settleV2
- [ ] Create method signature with parameters:
  - escrowPda: PublicKey
  - swapType: SwapType
  - seller: PublicKey
  - buyer: PublicKey
  - nftAMint: PublicKey
  - nftBMint: PublicKey | null
  - feeCollector: PublicKey
- [ ] Derive all required token accounts based on swapType
- [ ] Build `settle_v2` instruction
- [ ] **Handle remaining_accounts for NFT<>NFT swaps:**
  - If swapType is NftForNftWithFee or NftForNftPlusSol:
    - [ ] Derive escrow's NFT B account
    - [ ] Derive seller's NFT B account (ATA)
    - [ ] Add both as remaining_accounts in correct order
- [ ] Apply signer fixes
- [ ] Add compute budget (may need higher for NFT<>NFT swaps)
- [ ] Add priority fee
- [ ] Add Jito tip for mainnet
- [ ] Sign with admin keypair
- [ ] Send transaction
- [ ] Return txId
- [ ] Add detailed logging per swap type
- [ ] Add error handling with swap-type-specific messages

### 3.6 Add New Method: cancelIfExpiredV2
- [ ] Create method signature: cancelIfExpiredV2(escrowPda, buyer, seller, nftAMint, nftBMint?)
- [ ] Build `cancel_if_expired_v2` instruction
- [ ] Handle remaining_accounts if nftBMint is provided:
  - [ ] Derive escrow's NFT B account
  - [ ] Derive buyer's NFT B account (ATA)
  - [ ] Add as remaining_accounts
- [ ] Apply signer fixes
- [ ] Add compute budget and priority fee
- [ ] Add Jito tip for mainnet
- [ ] Sign with admin keypair
- [ ] Send transaction
- [ ] Return txId
- [ ] Add logging and error handling

### 3.7 Add New Method: adminCancelV2
- [ ] Create method signature: adminCancelV2(escrowPda, buyer, seller, nftAMint, nftBMint?)
- [ ] Build `admin_cancel_v2` instruction
- [ ] Handle remaining_accounts if nftBMint provided (same as cancelIfExpiredV2)
- [ ] Apply signer fixes
- [ ] Add compute budget and priority fee
- [ ] Add Jito tip for mainnet
- [ ] Sign with admin keypair
- [ ] Send transaction
- [ ] Return txId
- [ ] Add logging and error handling

### 3.8 Add Build Transaction Methods (Client-Side Signing)
- [ ] Create `buildDepositSolTransaction(escrowPda, buyer)` - unsigned
- [ ] Create `buildDepositBuyerNftTransaction(escrowPda, buyer, nftBMint)` - unsigned
- [ ] Create `buildSettleV2Transaction(...)` - unsigned
- [ ] Follow same patterns as existing `buildDepositNftTransaction`
- [ ] Set feePayer to the user who will sign
- [ ] Return base64 serialized unsigned transaction

### 3.9 Add Helper Methods
- [ ] Create `deriveEscrowPDAV2(escrowId)` if PDA derivation changed
- [ ] Create `validateSwapType(swapType)` helper
- [ ] Create `getRemainingAccountsForSwapType(swapType, nftBMint, escrowPda, recipientPubkey)` helper
- [ ] Update existing helpers if needed

---

## 4. Backend Service Updates - SettlementService

**File:** `src/services/settlement.service.ts`

### 4.1 Update Settlement Orchestration
- [ ] Review current `settle()` method
- [ ] Add logic to detect swap type from agreement
- [ ] Branch settlement flow based on swapType:
  - [ ] NFT_FOR_SOL: Call settleV2 with SOL params
  - [ ] NFT_FOR_NFT_WITH_FE: Call settleV2 with both NFT params
  - [ ] NFT_FOR_NFT_PLUS_SOL: Call settleV2 with both NFT + SOL params

### 4.2 Update Fee Calculation
- [ ] Keep existing `calculateFees()` method
- [ ] Update to use `solAmount` if present, otherwise `usdcAmount`
- [ ] Ensure platform fee calculation works for SOL (lamports)
- [ ] Update fee calculation logging

### 4.3 Update executeOnChainSettlement
- [ ] Replace call to old `settle()` with new `settleV2()`
- [ ] Pass swapType parameter
- [ ] Pass nftBMint if present (for NFT<>NFT swaps)
- [ ] Remove USDC-specific logic (usdcMint parameter)
- [ ] Update logging to show SOL amounts instead of USDC

### 4.4 Update Database Updates
- [ ] Ensure settlement status updates Agreement.status
- [ ] Log settlement transaction ID
- [ ] Update any fee-related fields with SOL values

---

## 5. Backend Service Updates - AgreementService

**File:** `src/services/agreement.service.ts`

### 5.1 Update Agreement Creation
- [ ] Add swapType parameter to createAgreement method
- [ ] Add solAmount parameter (optional)
- [ ] Add nftBMint parameter (optional, required for NFT<>NFT)
- [ ] Add feePayer parameter (default: BUYER)
- [ ] Validate parameters based on swapType:
  - NFT_FOR_SOL: Require solAmount, no nftBMint
  - NFT_FOR_NFT_WITH_FEE: No solAmount, require nftBMint
  - NFT_FOR_NFT_PLUS_SOL: Require solAmount and nftBMint
- [ ] Call `initAgreementV2` instead of old `initAgreement`
- [ ] Update database Agreement creation with new fields
- [ ] Update logging

### 5.2 Update Agreement Validation
- [ ] Add swap type validation logic
- [ ] Validate SOL amount is within limits (0.01-15 SOL for BETA)
- [ ] Validate nftBMint is valid NFT address if provided
- [ ] Add validation for parameter combinations per swap type

---

## 6. Backend Service Updates - Deposit Monitoring

### 6.1 Update NFT Deposit Service
**File:** `src/services/nft-deposit.service.ts`
- [ ] Keep existing seller NFT deposit monitoring
- [ ] Add buyer NFT deposit monitoring for NFT<>NFT swaps
- [ ] Check agreement.nftBMint to determine if buyer NFT expected
- [ ] Monitor buyer's NFT B account for transfers to escrow
- [ ] Update Deposit table with NFT_BUYER deposit type
- [ ] Trigger settlement when all deposits complete

### 6.2 Create SOL Deposit Service
**File:** `src/services/sol-deposit.service.ts` (NEW)
- [ ] Create new service for SOL deposit monitoring
- [ ] Monitor escrow PDA SOL balance for agreements
- [ ] Detect when SOL deposit matches agreement.solAmount
- [ ] Update Deposit table with SOL deposit type
- [ ] Mark agreement as ready for settlement when deposits complete
- [ ] Add polling interval configuration
- [ ] Add error handling and retry logic

### 6.3 Remove/Deprecate USDC Deposit Service
**File:** `src/services/usdc-deposit.service.ts`
- [ ] Add deprecation notice to file
- [ ] Disable monitoring for new agreements
- [ ] Keep code for reference (may re-enable with feature flag)
- [ ] Update service exports to not include USDC service

---

## 7. API Endpoint Updates

### 7.1 Agreement Creation Endpoint
**File:** `src/routes/agreements.ts` or similar
- [ ] Add swapType to request body schema
- [ ] Add solAmount to request body (optional)
- [ ] Add nftBMint to request body (optional)
- [ ] Add feePayer to request body (default: BUYER)
- [ ] Update request validation:
  - [ ] Validate swapType is valid enum value
  - [ ] Validate solAmount within BETA limits
  - [ ] Validate parameter combinations per swap type
- [ ] Update response to include new fields
- [ ] Update API documentation

### 7.2 Deposit Endpoints
- [ ] Create `/deposits/sol` endpoint (POST)
  - [ ] Accept agreementId
  - [ ] Validate buyer is caller
  - [ ] Return unsigned transaction for client signing OR
  - [ ] Call depositSol and return txId if backend signs
- [ ] Update `/deposits/nft` endpoint
  - [ ] Determine if seller NFT or buyer NFT based on request
  - [ ] Route to depositSellerNft or depositBuyerNft accordingly
- [ ] Deprecate `/deposits/usdc` endpoint
  - [ ] Add deprecation warning
  - [ ] Return 400 error with message about SOL migration

### 7.3 Settlement Endpoint
**File:** `src/routes/settlements.ts` or similar
- [ ] Update settlement trigger to use v2 methods
- [ ] Ensure swapType is passed from agreement
- [ ] Update response to show SOL amounts instead of USDC
- [ ] Update error messages

### 7.4 Query Endpoints
- [ ] Update `/agreements/:id` endpoint to return new fields
- [ ] Update `/agreements` list endpoint to include swapType filter
- [ ] Add swap type statistics endpoint (optional)

---

## 8. Configuration Updates

### 8.1 Environment Variables
**File:** `.env`, `.env.staging`, `.env.production`
- [ ] Remove USDC_MINT_ADDRESS or mark as optional
- [ ] Update ESCROW_PROGRAM_ID if redeployed
- [ ] Add SOL_DEPOSIT_POLL_INTERVAL (e.g., 5000ms)
- [ ] Document new environment variables in README

### 8.2 Config Service
**File:** `src/config/index.ts` or similar
- [ ] Remove USDC mint address requirement (make optional)
- [ ] Add SOL-specific config options
- [ ] Add swap type defaults
- [ ] Update config validation

---

## 9. Testing

### 9.1 Unit Tests
- [ ] Test initAgreementV2 with all swap types
- [ ] Test depositSol
- [ ] Test depositBuyerNft
- [ ] Test settleV2 for each swap type
- [ ] Test cancelIfExpiredV2
- [ ] Test adminCancelV2
- [ ] Test fee calculations for SOL
- [ ] Test swap type validation logic
- [ ] Test remaining_accounts generation

### 9.2 Integration Tests
- [ ] Test full flow: NFT <> SOL swap
  - Create agreement → Deposit SOL → Deposit NFT → Settle
- [ ] Test full flow: NFT <> NFT with Fee swap
  - Create agreement → Deposit SOL fee → Deposit both NFTs → Settle
- [ ] Test full flow: NFT <> NFT+SOL swap
  - Create agreement → Deposit SOL+NFT from buyer → Deposit NFT from seller → Settle
- [ ] Test expiry cancellation
- [ ] Test admin cancellation
- [ ] Test deposit monitoring for all types

### 9.3 API Tests
- [ ] Test agreement creation API with all swap types
- [ ] Test SOL deposit API
- [ ] Test NFT deposit APIs (seller and buyer)
- [ ] Test settlement API
- [ ] Test query APIs with new fields
- [ ] Test validation errors

---

## 10. Documentation

### 10.1 Code Documentation
- [ ] Add JSDoc comments to all new methods
- [ ] Document swap type parameter requirements
- [ ] Document remaining_accounts usage
- [ ] Add code examples for each swap type

### 10.2 API Documentation
- [ ] Update OpenAPI/Swagger specs
- [ ] Document new request/response schemas
- [ ] Add examples for each swap type
- [ ] Update error response documentation

### 10.3 Developer Guide
- [ ] Create guide for SOL-based escrow creation
- [ ] Document swap type selection logic
- [ ] Add diagrams for each swap type flow
- [ ] Update migration guide for developers

---

## 11. Deployment Preparation

### 11.1 Pre-Deployment Checklist
- [ ] All tests passing locally
- [ ] TypeScript compilation successful
- [ ] No linter errors
- [ ] Database migrations tested
- [ ] Environment variables configured
- [ ] Solana program deployed to devnet

### 11.2 Deployment Steps (Development)
- [ ] Deploy updated Solana program to devnet
- [ ] Update ESCROW_PROGRAM_ID in .env
- [ ] Run database migrations
- [ ] Deploy backend services
- [ ] Verify health checks pass
- [ ] Run smoke tests on devnet
- [ ] Monitor logs for errors

### 11.3 Rollback Plan
- [ ] Document rollback steps
- [ ] Keep previous program ID handy
- [ ] Have database backup ready
- [ ] Test rollback procedure

---

## 12. Final Verification

### 12.1 Smoke Tests
- [ ] Create NFT <> SOL agreement via API
- [ ] Deposit SOL successfully
- [ ] Deposit NFT successfully
- [ ] Settle escrow successfully
- [ ] Verify on-chain state
- [ ] Verify database state
- [ ] Check logs for errors

### 12.2 Performance Checks
- [ ] Verify transaction times < 5 seconds
- [ ] Verify API response times < 500ms
- [ ] Check compute unit usage < 300k
- [ ] Monitor priority fees
- [ ] Check database query performance

### 12.3 Security Review
- [ ] Verify admin keypair properly secured
- [ ] Check PDA derivation matches on-chain
- [ ] Verify fee calculations are correct
- [ ] Check for potential exploits in swap logic
- [ ] Review access control on API endpoints

---

## Progress Tracking

**Overall Progress:** 0/150+ items  
**Current Section:** Not Started  
**Blockers:** None  
**Notes:**  

---

## Quick Reference

### Key Files to Modify
1. `src/services/escrow-program.service.ts` (~800 lines of changes)
2. `src/services/settlement.service.ts` (~200 lines)
3. `src/services/agreement.service.ts` (~150 lines)
4. `src/services/sol-deposit.service.ts` (NEW, ~300 lines)
5. `prisma/schema.prisma` (~50 lines)
6. `src/routes/agreements.ts` (~100 lines)
7. `src/routes/deposits.ts` (~200 lines)

### Estimated Time per Section
1. IDL & Types: 1-2 hours
2. Database: 2-3 hours
3. EscrowProgramService: 1-2 days
4. SettlementService: 4-6 hours
5. AgreementService: 3-4 hours
6. Deposit Monitoring: 6-8 hours
7. API Endpoints: 4-6 hours
8. Configuration: 1 hour
9. Testing: 1-2 days
10. Documentation: 4-6 hours
11. Deployment: 2-3 hours
12. Verification: 2-3 hours

**Total Estimated Time:** 3-5 days full-time

---

## Notes
- Keep old USDC code commented/feature-flagged, don't delete
- Test each swap type independently before integration testing
- Monitor Solana devnet for rate limits during testing
- Use proper transaction confirmation strategies
- Keep detailed logs of all blockchain interactions

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-04  
**Owner:** Development Team  
**Status:** Ready for Implementation

