# Staging API Test Plan - SOL-Based Escrow Endpoints

**Date:** 2025-01-04  
**Environment:** Staging (`https://easy-escrow-ai-backend-staging-7hhqp.ondigitalocean.app`)  
**Purpose:** Verify SOL-based escrow API endpoints functionality

## Prerequisites

### Test Accounts Required
- ✅ Seller Solana wallet (devnet)
- ✅ Buyer Solana wallet (devnet)
- ✅ Test NFT mints (2) for swap testing
- ✅ Devnet SOL for transactions

### Environment Setup
```bash
# Set staging URL
export STAGING_URL="https://easy-escrow-ai-backend-staging-7hhqp.ondigitalocean.app"

# Test accounts (populate with your test wallets)
export SELLER_WALLET="<devnet_seller_wallet>"
export BUYER_WALLET="<devnet_buyer_wallet>"
export NFT_MINT_A="<test_nft_1_mint>"
export NFT_MINT_B="<test_nft_2_mint>"
```

---

## Test Suite 1: Health & Basic Connectivity

### Test 1.1: Health Check
```bash
curl -X GET "$STAGING_URL/health"
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-04T...",
  "version": "1.0.0"
}
```

**Status:** ⏳ Pending

---

## Test Suite 2: Agreement Creation (SOL-Based)

### Test 2.1: Create NFT_FOR_SOL Agreement
```bash
curl -X POST "$STAGING_URL/v1/agreements" \
  -H "Content-Type: application/json" \
  -d '{
    "nftMint": "'"$NFT_MINT_A"'",
    "seller": "'"$SELLER_WALLET"'",
    "expiryHours": 24,
    "swapType": "NFT_FOR_SOL",
    "solAmount": 1.5,
    "feePayer": "BUYER",
    "feeBps": 100,
    "honorRoyalties": true
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "agreementId": "<uuid>",
    "escrowPda": "<pda_address>",
    "swapType": "NFT_FOR_SOL",
    "depositAddresses": {
      "nft": "<seller_nft_ata>",
      "sol": "<escrow_pda>"
    },
    "expiry": "2025-01-05T...",
    "status": "PENDING"
  }
}
```

**Fields to Verify:**
- ✅ `agreementId` is UUID
- ✅ `escrowPda` is valid Solana address
- ✅ `swapType` is "NFT_FOR_SOL"
- ✅ `depositAddresses.nft` is valid ATA
- ✅ `depositAddresses.sol` equals `escrowPda`

**Status:** ⏳ Pending  
**Agreement ID:** `_____________`

---

### Test 2.2: Create NFT_FOR_NFT_WITH_FEE Agreement
```bash
curl -X POST "$STAGING_URL/v1/agreements" \
  -H "Content-Type: application/json" \
  -d '{
    "nftMint": "'"$NFT_MINT_A"'",
    "nftBMint": "'"$NFT_MINT_B"'",
    "seller": "'"$SELLER_WALLET"'",
    "expiryHours": 24,
    "swapType": "NFT_FOR_NFT_WITH_FEE",
    "feePayer": "SELLER",
    "feeBps": 100,
    "honorRoyalties": true
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "agreementId": "<uuid>",
    "swapType": "NFT_FOR_NFT_WITH_FEE",
    "depositAddresses": {
      "nft": "<seller_nft_ata>",
      "nftB": "<buyer_nft_ata>"
    }
  }
}
```

**Status:** ⏳ Pending  
**Agreement ID:** `_____________`

---

### Test 2.3: Create NFT_FOR_NFT_PLUS_SOL Agreement
```bash
curl -X POST "$STAGING_URL/v1/agreements" \
  -H "Content-Type: application/json" \
  -d '{
    "nftMint": "'"$NFT_MINT_A"'",
    "nftBMint": "'"$NFT_MINT_B"'",
    "seller": "'"$SELLER_WALLET"'",
    "expiryHours": 24,
    "swapType": "NFT_FOR_NFT_PLUS_SOL",
    "solAmount": 0.5,
    "feePayer": "BUYER",
    "feeBps": 100,
    "honorRoyalties": true
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "agreementId": "<uuid>",
    "swapType": "NFT_FOR_NFT_PLUS_SOL",
    "depositAddresses": {
      "nft": "<seller_nft_ata>",
      "nftB": "<buyer_nft_ata>",
      "sol": "<escrow_pda>"
    }
  }
}
```

**Status:** ⏳ Pending  
**Agreement ID:** `_____________`

---

## Test Suite 3: Agreement Retrieval & Filtering

### Test 3.1: Get Agreement by ID
```bash
AGREEMENT_ID="<from_test_2.1>"
curl -X GET "$STAGING_URL/v1/agreements/$AGREEMENT_ID"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "agreementId": "<uuid>",
    "swapType": "NFT_FOR_SOL",
    "solAmount": "1500000000",
    "nftMint": "<nft_mint>",
    "seller": "<seller>",
    "buyer": null,
    "status": "PENDING",
    "feePayer": "BUYER",
    "balances": {
      "nftLocked": false,
      "solLocked": false,
      "expectedSolAmount": "1500000000"
    }
  }
}
```

**Status:** ⏳ Pending

---

### Test 3.2: List Agreements (All)
```bash
curl -X GET "$STAGING_URL/v1/agreements?limit=10"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [/* array of agreements */],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "pages": 1
  }
}
```

**Status:** ⏳ Pending

---

### Test 3.3: Filter by Swap Type
```bash
curl -X GET "$STAGING_URL/v1/agreements?swap_type=NFT_FOR_SOL&status=PENDING"
```

**Expected Response:**
- Only NFT_FOR_SOL agreements returned
- All have status PENDING

**Status:** ⏳ Pending

---

### Test 3.4: Filter by NFT B Mint
```bash
curl -X GET "$STAGING_URL/v1/agreements?nft_b_mint=$NFT_MINT_B"
```

**Expected Response:**
- Only agreements with nftBMint matching NFT_MINT_B
- Should include NFT_FOR_NFT_WITH_FEE and NFT_FOR_NFT_PLUS_SOL

**Status:** ⏳ Pending

---

## Test Suite 4: SOL Deposit Endpoints

### Test 4.1: Prepare SOL Deposit Transaction
```bash
AGREEMENT_ID="<from_test_2.1>"
curl -X POST "$STAGING_URL/v1/agreements/$AGREEMENT_ID/deposit-sol/prepare" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "transaction": "<base64_unsigned_transaction>",
    "message": "Transaction ready for client signing. Buyer must sign and submit."
  }
}
```

**Fields to Verify:**
- ✅ `transaction` is base64 string
- ✅ `message` contains signing instructions

**Status:** ⏳ Pending

---

### Test 4.2: Validate Transaction Structure
```bash
# Decode the transaction and inspect
echo "<base64_transaction>" | base64 -d | xxd | head -20
```

**Expected:**
- Transaction includes deposit_sol instruction
- Includes compute budget instructions
- Includes buyer as signer
- For mainnet: includes Jito tip

**Status:** ⏳ Pending

---

### Test 4.3: Error - SOL Deposit on Wrong Swap Type
```bash
# Use NFT_FOR_NFT_WITH_FEE agreement ID
WRONG_AGREEMENT_ID="<from_test_2.2>"
curl -X POST "$STAGING_URL/v1/agreements/$WRONG_AGREEMENT_ID/deposit-sol/prepare"
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Cannot deposit SOL: Agreement swap type is NFT_FOR_NFT_WITH_FEE..."
}
```

**Status:** ⏳ Pending

---

### Test 4.4: Error - No Buyer Assigned
```bash
# Create agreement without buyer
curl -X POST "$STAGING_URL/v1/agreements" \
  -d '{"nftMint": "...", "seller": "...", "swapType": "NFT_FOR_SOL", ...}'

# Try to prepare deposit
curl -X POST "$STAGING_URL/v1/agreements/<new_id>/deposit-sol/prepare"
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Cannot deposit SOL: No buyer assigned to agreement"
}
```

**Status:** ⏳ Pending

---

## Test Suite 5: Validation & Error Handling

### Test 5.1: Missing Required Fields
```bash
curl -X POST "$STAGING_URL/v1/agreements" \
  -H "Content-Type: application/json" \
  -d '{
    "swapType": "NFT_FOR_SOL",
    "seller": "'"$SELLER_WALLET"'"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "errors": [
    {"field": "nftMint", "message": "NFT mint address is required"},
    {"field": "solAmount", "message": "SOL amount is required for NFT_FOR_SOL swap type"}
  ]
}
```

**Status:** ⏳ Pending

---

### Test 5.2: Invalid Swap Type
```bash
curl -X POST "$STAGING_URL/v1/agreements" \
  -H "Content-Type: application/json" \
  -d '{
    "nftMint": "'"$NFT_MINT_A"'",
    "seller": "'"$SELLER_WALLET"'",
    "swapType": "INVALID_TYPE",
    "expiryHours": 24
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "errors": [
    {"field": "swapType", "message": "Invalid swap type..."}
  ]
}
```

**Status:** ⏳ Pending

---

### Test 5.3: SOL Amount Validation
```bash
# Test minimum SOL (0.01)
curl -X POST "$STAGING_URL/v1/agreements" \
  -d '{"solAmount": 0.005, ...}'

# Test maximum SOL (15)
curl -X POST "$STAGING_URL/v1/agreements" \
  -d '{"solAmount": 20, ...}'
```

**Expected Response:**
- 0.005 SOL: Error "SOL amount must be at least 0.01"
- 20 SOL: Error "SOL amount cannot exceed 15"

**Status:** ⏳ Pending

---

## Test Suite 6: Backward Compatibility

### Test 6.1: Legacy USDC Endpoint (Deprecated)
```bash
curl -X POST "$STAGING_URL/v1/agreements/:id/deposit-usdc/prepare"
```

**Expected:**
- Endpoint still works (deprecated but functional)
- Returns appropriate response or deprecation warning

**Status:** ⏳ Pending

---

### Test 6.2: Legacy Price Field
```bash
curl -X POST "$STAGING_URL/v1/agreements" \
  -d '{
    "nftMint": "...",
    "seller": "...",
    "price": 1.5,
    "expiryHours": 24
  }'
```

**Expected:**
- Agreement created successfully
- `swapType` defaults to NFT_FOR_SOL
- `solAmount` populated from `price`

**Status:** ⏳ Pending

---

## Test Results Summary

| Test Suite | Tests | Passed | Failed | Skipped |
|------------|-------|--------|--------|---------|
| 1. Health | 1 | 0 | 0 | 1 |
| 2. Agreement Creation | 3 | 0 | 0 | 3 |
| 3. Retrieval & Filtering | 4 | 0 | 0 | 4 |
| 4. SOL Deposits | 4 | 0 | 0 | 4 |
| 5. Validation | 3 | 0 | 0 | 3 |
| 6. Backward Compatibility | 2 | 0 | 0 | 2 |
| **Total** | **17** | **0** | **0** | **17** |

---

## Known Issues

### Blockers
- [ ] None identified

### Non-Blockers
- [ ] OpenAPI spec not yet updated
- [ ] Integration tests not yet written

---

## Manual Testing Checklist

### Pre-Testing Setup
- [ ] Verify staging deployment is live
- [ ] Verify database is accessible
- [ ] Verify Solana RPC endpoint connectivity
- [ ] Obtain test wallets and NFT mints
- [ ] Fund wallets with devnet SOL

### Core Functionality
- [ ] Create NFT_FOR_SOL agreement
- [ ] Create NFT_FOR_NFT_WITH_FEE agreement
- [ ] Create NFT_FOR_NFT_PLUS_SOL agreement
- [ ] Retrieve agreement by ID
- [ ] List agreements with pagination
- [ ] Filter by swap type
- [ ] Filter by NFT B mint
- [ ] Prepare SOL deposit transaction
- [ ] Verify transaction structure

### Error Handling
- [ ] Validate missing required fields
- [ ] Validate invalid swap type
- [ ] Validate SOL amount bounds
- [ ] Validate wrong swap type for deposit
- [ ] Validate no buyer for deposit

### Backward Compatibility
- [ ] Legacy USDC endpoints still work
- [ ] Legacy price field auto-converts

---

## Post-Testing Actions

### If All Tests Pass
- [ ] Update test results in this document
- [ ] Create test results summary document
- [ ] Mark Subtask 9 as fully complete
- [ ] Plan Subtask 10 (Settlement endpoints)

### If Tests Fail
- [ ] Document failures with screenshots
- [ ] Create GitHub issues for bugs
- [ ] Create hotfix branch
- [ ] Retest after fixes

---

## Notes

**Staging URL Verification:**
- Expected: `https://easy-escrow-ai-backend-staging-7hhqp.ondigitalocean.app`
- Actual: _____________
- Status: ⏳ Pending verification

**Test Data:**
- Store all test agreement IDs for cleanup
- Store transaction signatures for verification
- Keep test NFT mints for reuse

**Cleanup:**
- Use `/v1/agreements/archive` endpoint to clean up test data
- Or use admin endpoints if available

