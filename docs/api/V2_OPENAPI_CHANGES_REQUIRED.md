# V2 OpenAPI Documentation Changes Required

**Date:** November 4, 2025  
**Status:** Changes Identified - Implementation Pending  
**Branch:** staging

## Summary

This document outlines all OpenAPI specification changes required to document the v2 SOL-based escrow endpoints. The backend implementation is complete, but the OpenAPI spec needs updating to reflect the new swap types, parameters, and endpoints.

## Overview of Changes

The v2 API introduces three new SOL-based swap types while maintaining backward compatibility with v1 (USDC-based) endpoints:

1. **NFT_FOR_SOL** - NFT in exchange for SOL payment
2. **NFT_FOR_NFT_WITH_FEE** - NFT for NFT with SOL platform fee
3. **NFT_FOR_NFT_PLUS_SOL** - NFT for NFT + SOL payment

## 1. Schema Changes

### 1.1 New Enum: `SwapType`

**Location:** `#/components/schemas/SwapType`

```yaml
SwapType:
  type: string
  enum:
    - NFT_FOR_SOL
    - NFT_FOR_NFT_WITH_FEE
    - NFT_FOR_NFT_PLUS_SOL
  description: |
    Type of swap transaction:
    - NFT_FOR_SOL: Seller provides NFT, buyer pays SOL
    - NFT_FOR_NFT_WITH_FEE: Both parties provide NFTs, buyer pays SOL platform fee
    - NFT_FOR_NFT_PLUS_SOL: Both parties provide NFTs, buyer pays additional SOL to seller
```

### 1.2 New Enum: `FeePayer`

**Location:** `#/components/schemas/FeePayer`

```yaml
FeePayer:
  type: string
  enum:
    - BUYER
    - SELLER
    - SPLIT
  default: BUYER
  description: Party responsible for paying platform fees
```

### 1.3 Update: `CreateAgreementDTO`

**Location:** `#/components/schemas/CreateAgreementDTO`

**Add new fields:**
- `swapType` (SwapType, required, default: NFT_FOR_SOL)
- `solAmount` (string, optional) - SOL amount in human-readable form (e.g., "1.5")
- `nftBMint` (string, optional) - Buyer's NFT mint address (for NFT<>NFT swaps)
- `feePayer` (FeePayer, optional, default: BUYER)

**Deprecate:**
- `price` (number, deprecated) - Use `solAmount` instead

**Update validation rules:**
- `solAmount` required for NFT_FOR_SOL and NFT_FOR_NFT_PLUS_SOL
- `nftBMint` required for NFT_FOR_NFT_WITH_FEE and NFT_FOR_NFT_PLUS_SOL
- `solAmount` range: 0.01 to 15 SOL

### 1.4 Update: `AgreementResponseDTO`

**Location:** `#/components/schemas/AgreementResponseDTO`

**Add new fields:**
- `swapType` (SwapType)
- `solAmount` (string, nullable)
- `nftBMint` (string, nullable)
- `feePayer` (FeePayer)

**Deprecate:**
- `price` (number, deprecated)
- `usdcDepositAddr` (string, deprecated)

### 1.5 Update: `CreateAgreementResponseDTO`

**Location:** `#/components/schemas/CreateAgreementResponseDTO`

**Add to `depositAddresses`:**
- `nftB` (string, optional) - Buyer's NFT deposit address (for NFT<>NFT swaps)
- `swapType` (SwapType)

**Deprecate in `depositAddresses`:**
- `usdc` (string, deprecated)

### 1.6 Update: `AgreementBalanceDTO`

**Location:** `#/components/schemas/AgreementBalanceDTO`

**Add new fields:**
- `swapType` (SwapType)
- `solLocked` (boolean)
- `nftBLocked` (boolean)
- `expectedSolAmount` (string, nullable)
- `actualSolAmount` (string, nullable)

**Deprecate:**
- `usdcLocked` (boolean, deprecated)
- `expectedUsdcAmount` (string, deprecated)
- `actualUsdcAmount` (string, deprecated)

### 1.7 Update: `DepositType` Enum

**Location:** `#/components/schemas/DepositType`

**Add new values:**
- `SOL` - SOL deposit (buyer funds)
- `NFT_BUYER` - Buyer's NFT deposit (for NFT<>NFT swaps)

**Existing:**
- `USDC` (deprecated but supported)
- `NFT` - Seller's NFT deposit

### 1.8 Update: `DepositInfoDTO`

**Location:** `#/components/schemas/DepositInfoDTO`

**Add field:**
- `tokenMint` (string, optional) - NFT mint address for NFT deposits

## 2. Endpoint Changes

### 2.1 Update: `POST /v1/agreements`

**Request Body Updates:**
- Add new optional fields: `swapType`, `solAmount`, `nftBMint`, `feePayer`
- Mark `price` as deprecated

**Response Updates:**
- Add new fields to response schema
- Include `nftB` deposit address in response when applicable

**Examples to Add:**

#### Example 1: NFT_FOR_SOL Swap
```json
{
  "nftMint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "seller": "5uBU2zUG8xTLA6XwwcTFWib1p7EjCBzWbiy44eVASTfV",
  "buyer": "CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq",
  "swapType": "NFT_FOR_SOL",
  "solAmount": "1.5",
  "feeBps": 100,
  "expiry": "2025-11-10T12:00:00Z"
}
```

#### Example 2: NFT_FOR_NFT_WITH_FEE Swap
```json
{
  "nftMint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "seller": "5uBU2zUG8xTLA6XwwcTFWib1p7EjCBzWbiy44eVASTfV",
  "buyer": "CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq",
  "swapType": "NFT_FOR_NFT_WITH_FEE",
  "nftBMint": "8yKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBtV",
  "solAmount": "0.01",
  "feeBps": 100,
  "expiry": "2025-11-10T12:00:00Z"
}
```

#### Example 3: NFT_FOR_NFT_PLUS_SOL Swap
```json
{
  "nftMint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "seller": "5uBU2zUG8xTLA6XwwcTFWib1p7EjCBzWbiy44eVASTfV",
  "buyer": "CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq",
  "swapType": "NFT_FOR_NFT_PLUS_SOL",
  "nftBMint": "8yKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBtV",
  "solAmount": "2.0",
  "feeBps": 100,
  "expiry": "2025-11-10T12:00:00Z"
}
```

### 2.2 Update: `GET /v1/agreements`

**Query Parameters - Add:**
- `swapType` (SwapType, optional) - Filter by swap type
- `nftBMint` (string, optional) - Filter by buyer's NFT mint

**Example:**
```
GET /v1/agreements?swapType=NFT_FOR_SOL&status=pending
GET /v1/agreements?nftBMint=8yKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBtV
```

### 2.3 Update: `GET /v1/agreements/{agreementId}`

**Response Updates:**
- Include all new v2 fields in the detailed response
- Show SOL balances for v2 agreements
- Show NFT B balances for NFT<>NFT swaps

### 2.4 New: `POST /v1/agreements/{agreementId}/deposit-sol/prepare`

**Description:** Returns an unsigned SOL deposit transaction for client-side signing (PRODUCTION endpoint)

**Path Parameters:**
- `agreementId` (string, required)

**Response Schema:**
```yaml
DepositSolPrepareResponse:
  type: object
  properties:
    success:
      type: boolean
    data:
      type: object
      properties:
        transaction:
          type: string
          description: Base64-encoded unsigned transaction
        message:
          type: string
          description: Human-readable instructions
    timestamp:
      type: string
      format: date-time
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEDp...",
    "message": "Transaction prepared. Sign with buyer's wallet and submit to Solana network."
  },
  "timestamp": "2025-11-04T10:30:00Z"
}
```

**Error Responses:**
- 400: Agreement not found, invalid swap type, or already deposited
- 404: Agreement not found
- 500: Transaction preparation failed

### 2.5 Deprecated: `POST /v1/agreements/{agreementId}/deposit-sol`

**Status:** Deprecated (use `/deposit-sol/prepare` instead)

**Description:** Server-side SOL deposit endpoint (for testing/development only)

**Add deprecation notice to documentation**

### 2.6 Deprecation Notices for v1 Endpoints

**Mark as deprecated but supported:**
- `POST /v1/agreements/{agreementId}/deposit-usdc/prepare`
- `POST /v1/agreements/{agreementId}/deposit-usdc`

**Add note:** "These endpoints support v1 (USDC-based) escrow. For new integrations, use v2 (SOL-based) endpoints."

## 3. Validation Rules Documentation

### 3.1 SwapType-Specific Validations

**Document in API description:**

#### NFT_FOR_SOL
- **Required:** `solAmount` (0.01-15 SOL)
- **Prohibited:** `nftBMint`
- **Deposits:** Seller deposits NFT, buyer deposits SOL
- **Settlement:** NFT → buyer, SOL → seller (minus fees)

#### NFT_FOR_NFT_WITH_FEE
- **Required:** `nftBMint`, `solAmount` (platform fee only)
- **Deposits:** Seller deposits NFT A, buyer deposits NFT B + SOL fee
- **Settlement:** NFT A → buyer, NFT B → seller, SOL fee → platform

#### NFT_FOR_NFT_PLUS_SOL
- **Required:** `nftBMint`, `solAmount` (payment to seller + fee)
- **Deposits:** Seller deposits NFT A, buyer deposits NFT B + SOL
- **Settlement:** NFT A → buyer, NFT B + SOL → seller (minus fees)

### 3.2 Field Interdependencies

Document validation matrix:

| SwapType | solAmount | nftBMint | Description |
|----------|-----------|----------|-------------|
| NFT_FOR_SOL | Required | Prohibited | Buyer pays SOL to seller |
| NFT_FOR_NFT_WITH_FEE | Required (fee) | Required | Buyer pays SOL platform fee |
| NFT_FOR_NFT_PLUS_SOL | Required (payment) | Required | Buyer pays SOL to seller + fee |

## 4. Error Response Documentation

### 4.1 New Validation Errors

**Document new error codes:**

#### 400 Bad Request - Validation Errors

```json
{
  "success": false,
  "error": "Validation Error",
  "message": "SOL amount is required for NFT_FOR_SOL swap type",
  "timestamp": "2025-11-04T10:30:00Z"
}
```

**Common validation error messages:**
- "SOL amount is required for {swapType} swap type"
- "SOL amount should not be provided for {swapType} swap type"
- "Buyer's NFT mint (nftBMint) is required for {swapType} swap type"
- "Buyer's NFT mint (nftBMint) should not be provided for {swapType} swap type"
- "SOL amount must be between 0.01 and 15 SOL"
- "Platform fee amount (in SOL) is required for NFT_FOR_NFT_WITH_FEE swap type"

## 5. Migration Guide

### 5.1 For Frontend Developers

**Add section to documentation:**

#### Migrating from v1 to v2

**Old (v1 - USDC):**
```javascript
const agreement = await createAgreement({
  nftMint: "7xKXtg...",
  seller: "5uBU2z...",
  buyer: "CuieVD...",
  price: 1.5, // USDC
  feeBps: 100,
  expiry: "2025-11-10T12:00:00Z"
});

// Deposit USDC
await depositUsdc(agreement.agreementId, transaction);
```

**New (v2 - SOL):**
```javascript
const agreement = await createAgreement({
  nftMint: "7xKXtg...",
  seller: "5uBU2z...",
  buyer: "CuieVD...",
  swapType: "NFT_FOR_SOL",
  solAmount: "1.5", // SOL
  feeBps: 100,
  expiry: "2025-11-10T12:00:00Z"
});

// Prepare SOL deposit transaction (client signs)
const { transaction } = await prepareDepositSol(agreement.agreementId);
const signedTx = await wallet.signTransaction(transaction);
await connection.sendRawTransaction(signedTx.serialize());
```

### 5.2 Backward Compatibility

**Document:**
- v1 (USDC-based) endpoints remain fully functional
- No breaking changes to existing v1 integrations
- Frontend can conditionally use v1 or v2 based on `swapType` field presence
- Filtering and listing endpoints support both v1 and v2 agreements

## 6. Security Considerations

**Add documentation section:**

### 6.1 On-Chain Validation

- All deposit amounts are validated on-chain
- SOL amounts are read from escrow state (cannot be manipulated)
- Platform fees are immutable after agreement initialization

### 6.2 Client-Side Signing

- Production endpoints return unsigned transactions
- Clients must sign with their own wallets
- Server never handles private keys for deposits

### 6.3 Rate Limiting

- Standard rate limits apply to v2 endpoints
- Stricter limits on agreement creation (5 req/min per IP)

## 7. Testing Endpoints

**Add section for staging/testnet:**

### 7.1 Staging Environment

- Base URL: `https://staging-api.easyescrow.ai`
- Network: Solana Devnet
- Test tokens: Use devnet SOL from faucet

### 7.2 Example Test Scenarios

Provide complete curl examples for:
1. Creating NFT_FOR_SOL agreement
2. Depositing seller NFT
3. Preparing buyer SOL deposit
4. Checking agreement status
5. Verifying settlement

## 8. Implementation Checklist

- [ ] Update all schema definitions
- [ ] Add new endpoint documentation
- [ ] Update existing endpoint documentation
- [ ] Add validation rules section
- [ ] Document error responses
- [ ] Create migration guide
- [ ] Add security considerations
- [ ] Provide test examples
- [ ] Update Postman collection (if exists)
- [ ] Regenerate client SDKs (if applicable)
- [ ] Update API versioning strategy
- [ ] Add deprecation timeline for v1 endpoints

## 9. Files to Update

### 9.1 OpenAPI Specification Files

- `docs/api/openapi.yaml` or `docs/api/swagger.yaml`
- Component schemas
- Path definitions
- Examples
- Error responses

### 9.2 Additional Documentation

- `README.md` - Update API section
- `docs/API.md` - Comprehensive API guide
- `docs/INTEGRATION_GUIDE.md` - Integration examples
- Postman collection JSON files

## 10. Notes

### Implementation Priority

1. **High Priority:**
   - Schema changes (required for type safety)
   - New endpoint documentation
   - Validation rules

2. **Medium Priority:**
   - Migration guide
   - Error responses
   - Testing examples

3. **Low Priority:**
   - Deprecation notices
   - Security considerations section

### Known Limitations

- v1 and v2 settlements use different on-chain instructions
- Monitoring handles both v1 (USDC) and v2 (SOL) automatically
- Receipt generation supports both formats

---

**Status:** Ready for OpenAPI spec implementation  
**Estimated Effort:** 4-6 hours for complete documentation update  
**Dependencies:** None - backend implementation is complete

