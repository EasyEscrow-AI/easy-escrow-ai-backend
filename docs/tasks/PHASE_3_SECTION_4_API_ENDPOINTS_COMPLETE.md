# Phase 3 Section 4 - API Endpoints & Deposit Services Complete

**Date:** 2025-01-04  
**Branch:** `feature/sol-migration-api-endpoints`  
**Status:** ✅ COMPLETE

## Summary

Successfully implemented complete API layer support for SOL-based escrow swaps, including:
- Agreement creation endpoints with swap type support
- SOL deposit endpoints (production + deprecated)
- Agreement listing with swap type filters
- Service layer integration with v2 smart contract methods

## Changes Made

### 1. Agreement Routes (`src/routes/agreement.routes.ts`)

#### Updated Endpoints

**GET /v1/agreements**
```typescript
// Added filters for swap types
filters: {
  status: string
  swapType: SwapType           // NEW
  seller: string
  buyer: string
  nftMint: string
  nftBMint: string             // NEW
  page: number
  limit: number
}
```

**New Endpoints Added**

```typescript
// Production endpoint (client-side signing)
POST /v1/agreements/:agreementId/deposit-sol/prepare
Response: { transaction: string, message: string }

// Deprecated endpoint (server-side signing)
POST /v1/agreements/:agreementId/deposit-sol
Response: { transactionId: string }
```

#### Validation
- Validates `swapType` (NFT_FOR_SOL, NFT_FOR_NFT_PLUS_SOL only)
- Validates agreement status (PENDING or NFT_LOCKED)
- Validates buyer existence
- Validates `solAmount` exists in agreement
- Returns 400 for invalid swap types, 404 for not found, 500 for errors

### 2. Agreement Service (`src/services/agreement.service.ts`)

#### New Functions

**`prepareDepositSolTransaction(agreementId: string)`**
- Validates swap type supports SOL deposits
- Validates agreement status and buyer
- Calls `EscrowProgramService.buildDepositSolTransaction`
- Returns unsigned transaction for client signing

**`depositSolToEscrow(agreementId: string)`** (@deprecated)
- Server-side SOL deposit execution
- Includes transaction logging
- Error handling and fallback logging

#### Updated Functions

**`createAgreement(data: CreateAgreementDTO)`**
- Calls `escrowProgramService.initAgreementV2`
- Stores `swapType`, `solAmount`, `nftBMint`, `feePayer`
- Generates NFT deposit addresses (ATAs) for seller and optionally buyer
- Removed USDC account creation logic
- Returns `CreateAgreementResponseDTO` with SOL fields

**`mapAgreementToDTO(agreement)`**
- Serializes `swapType`, `solAmount`, `nftBMint`, `feePayer`
- Deprecated USDC fields maintained for backward compatibility
- Handles null values gracefully

**`mapAgreementToDetailDTO(agreement)`**
- Calculates SOL balances (`solLocked`)
- Handles NFT_BUYER deposits
- Deprecated USDC equivalents for backward compatibility

**`listAgreements(filters: AgreementQueryDTO)`**
- Added `swapType` filter
- Added `nftBMint` filter
- Maintains pagination support

### 3. Escrow Program Service (`src/services/escrow-program.service.ts`)

#### New Method

**`buildDepositSolTransaction(escrowPda, buyer, solAmount)`**
```typescript
// Creates unsigned transaction for client signing
// Includes:
// - deposit_sol instruction
// - Compute budget instructions
// - Dynamic priority fees
// - Jito tips (mainnet only, 0.001 SOL)
// - Anchor SDK fix (buyer marked as non-signer)

Returns: {
  transaction: string,  // base64-encoded
  message: string
}
```

#### Updated Method

**`depositSol(escrowPda, buyer, solAmount)`**
- Now requires `solAmount` parameter
- Builds and signs transaction with admin keypair
- Includes priority fees and Jito tips
- Returns transaction ID

## API Endpoint Flow

### Creating SOL-Based Agreement

```typescript
POST /v1/agreements
Body: {
  nftMint: "seller_nft_mint",
  seller: "seller_wallet",
  expiryHours: 24,
  swapType: "NFT_FOR_SOL",        // NEW
  solAmount: 1.5,                  // NEW (in SOL)
  feePayer: "BUYER"                // NEW
}

Response: {
  success: true,
  data: {
    agreementId: "uuid",
    escrowPda: "pda_address",
    swapType: "NFT_FOR_SOL",       // NEW
    depositAddresses: {
      nft: "seller_nft_ata",
      sol: "escrow_pda"            // NEW (buyer sends SOL here)
    }
  }
}
```

### Depositing SOL (Production)

```typescript
POST /v1/agreements/:id/deposit-sol/prepare

Response: {
  success: true,
  data: {
    transaction: "base64_unsigned_tx",
    message: "Transaction ready for client signing. Buyer must sign and submit."
  }
}

// Client-side:
// 1. Decode base64 transaction
// 2. Sign with buyer wallet
// 3. Submit to Solana network
```

### Listing Agreements with Filters

```typescript
GET /v1/agreements?swap_type=NFT_FOR_SOL&status=PENDING

Response: {
  success: true,
  data: [{
    agreementId: "uuid",
    swapType: "NFT_FOR_SOL",      // NEW
    solAmount: "1500000000",      // NEW (lamports)
    nftMint: "seller_nft",
    nftBMint: null,               // NEW (null for NFT_FOR_SOL)
    status: "PENDING"
  }],
  pagination: { ... }
}
```

## Swap Type Support Matrix

| Swap Type | Create Agreement | Deposit NFT (Seller) | Deposit SOL | Deposit NFT (Buyer) | Settlement |
|-----------|------------------|---------------------|-------------|---------------------|-----------|
| **NFT_FOR_SOL** | ✅ | ✅ | ✅ | ❌ | 🔄 (Next) |
| **NFT_FOR_NFT_WITH_FEE** | ✅ | ✅ | ❌ | ✅ (Future) | 🔄 (Next) |
| **NFT_FOR_NFT_PLUS_SOL** | ✅ | ✅ | ✅ | ✅ (Future) | 🔄 (Next) |

**Legend:**
- ✅ = Implemented
- ❌ = Not applicable
- 🔄 = Pending

## Technical Details

### solAmount Storage

- **Database:** `Decimal` type (Prisma)
- **API:** `number` (SOL units, e.g., 1.5)
- **Smart Contract:** `BN` (lamports, e.g., 1_500_000_000)
- **Conversion:** `1 SOL = 1_000_000_000 lamports`

### Fee Payer Options

```typescript
enum FeePayer {
  SELLER = "SELLER",  // Seller pays platform fee
  BUYER = "BUYER"     // Buyer pays platform fee (default)
}
```

### Deposit Address Generation

```typescript
// NFT_FOR_SOL
depositAddresses: {
  nft: getAssociatedTokenAddress(nftMint, seller),  // Seller NFT ATA
  sol: escrowPda                                     // Escrow PDA receives SOL
}

// NFT_FOR_NFT_PLUS_SOL
depositAddresses: {
  nft: getAssociatedTokenAddress(nftMint, seller),   // Seller NFT ATA
  nftB: getAssociatedTokenAddress(nftBMint, buyer),  // Buyer NFT ATA
  sol: escrowPda                                     // Escrow PDA receives SOL
}
```

## Testing Status

### Unit Tests Needed
- [ ] `prepareDepositSolTransaction` validation
- [ ] `depositSolToEscrow` error handling
- [ ] Agreement creation with all swap types
- [ ] Agreement listing with swap type filters

### Integration Tests Needed
- [ ] End-to-end NFT_FOR_SOL flow
- [ ] End-to-end NFT_FOR_NFT_PLUS_SOL flow
- [ ] Client-side transaction signing
- [ ] Deposit validation and status updates

### Manual Testing (Devnet)
```bash
# Test agreement creation
curl -X POST http://localhost:8080/v1/agreements \
  -H "Content-Type: application/json" \
  -d '{
    "nftMint": "NFT_MINT_HERE",
    "seller": "SELLER_PUBKEY",
    "expiryHours": 24,
    "swapType": "NFT_FOR_SOL",
    "solAmount": 1.5,
    "feePayer": "BUYER"
  }'

# Test SOL deposit preparation
curl -X POST http://localhost:8080/v1/agreements/:id/deposit-sol/prepare

# Test listing with filters
curl -X GET "http://localhost:8080/v1/agreements?swap_type=NFT_FOR_SOL&status=PENDING"
```

## Documentation Updates Needed

### OpenAPI Spec (`docs/api/openapi.yaml`)
- [ ] Add `swapType` enum and descriptions
- [ ] Add `solAmount` field to schemas
- [ ] Add `nftBMint` field to schemas
- [ ] Add `feePayer` enum
- [ ] Add `/deposit-sol/prepare` endpoint
- [ ] Add `/deposit-sol` endpoint (deprecated)
- [ ] Update example requests/responses
- [ ] Add swap type filter parameters

### Integration Guide
- [ ] Update agreement creation examples
- [ ] Add SOL deposit workflow
- [ ] Add swap type selection guide
- [ ] Update error codes for SOL deposits
- [ ] Add client-side signing examples

## Files Modified

### Core Changes
- `src/routes/agreement.routes.ts` - Added SOL deposit endpoints, updated filters
- `src/services/agreement.service.ts` - Added SOL deposit functions, refactored createAgreement
- `src/services/escrow-program.service.ts` - Added buildDepositSolTransaction

### Previous Changes (Context)
- `src/models/dto/agreement.dto.ts` - Added SOL fields to DTOs
- `src/models/validators/agreement.validator.ts` - Added swap type validation
- `src/middleware/validation.middleware.ts` - Added nftBMint validation

## Known Limitations

1. **Buyer NFT Deposits**: Not yet implemented for NFT_FOR_NFT_WITH_FEE and NFT_FOR_NFT_PLUS_SOL
2. **Settlement**: V2 settlement endpoints not yet implemented
3. **Monitoring**: SOL deposit monitoring not yet integrated
4. **OpenAPI**: Spec not yet updated with new fields

## Next Steps

1. **Subtask 10:** Update settlement endpoints for SOL-based swaps
2. **Subtask 11:** Add monitoring for SOL deposits
3. **Subtask 12:** Update OpenAPI documentation
4. **Subtask 13:** Integration testing suite
5. **Subtask 14:** Frontend integration guide

## Commits

1. `e72519f` - feat(services): Refactor agreement service for SOL-based swaps
2. `6e15dcb` - feat(api): Add SOL deposit endpoints and update routes for swap types

## Verification Checklist

- [x] No TypeScript errors
- [x] No linting errors
- [x] All imports resolved
- [x] Service methods implemented
- [x] Route handlers added
- [x] Error handling in place
- [x] Validation logic updated
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] OpenAPI spec updated
- [ ] Manual testing completed

## Notes

- All USDC-related endpoints remain functional but are deprecated
- Backward compatibility maintained in all DTOs
- Client-side signing is the production approach for all deposits
- Server-side deposit endpoints kept for testing/development only

---

**Phase 3 Section 4 Status:** ✅ **COMPLETE**  
**Next Phase:** Settlement Endpoints & Monitoring

