# API Wrapper Integration Guide

This guide helps marketplace applications integrate with EasyEscrow.ai's atomic swap API for NFT sales, swaps, and bundle transactions.

## Base URL

| Environment | URL |
|-------------|-----|
| Production | `https://api.easyescrow.ai` |
| Staging | `https://staging-api.easyescrow.ai` |

## Authentication

All requests should include:
```
Content-Type: application/json
Idempotency-Key: <unique-uuid>  // Required for write operations
```

For zero-fee swaps (partner integrations):
```
x-api-key: <your-api-key>
```

---

## Core Features

### 1. List NFT for Sale

Create a public or private sale listing where you offer an NFT for SOL.

**Endpoint:** `POST /api/swaps/offers`

```typescript
// Request
{
  "makerWallet": "YOUR_SELLER_WALLET",
  "takerWallet": null,  // null = public, or specify buyer wallet for private sale
  "offeredAssets": [
    {
      "mint": "NFT_MINT_ADDRESS",
      "isCompressed": false,  // true for cNFTs
      "isCoreNft": false      // true for Metaplex Core NFTs
    }
  ],
  "requestedAssets": [],
  "offeredSol": "0",
  "requestedSol": "1000000000"  // Price in lamports (1 SOL = 1B lamports)
}

// Response
{
  "success": true,
  "data": {
    "offer": {
      "id": "12345",
      "status": "ACTIVE",
      "makerWallet": "...",
      "offeredAssets": [...],
      "requestedSol": "1000000000",
      "createdAt": "2025-01-15T10:00:00Z",
      "expiresAt": "2025-01-22T10:00:00Z"
    },
    "offerType": "ATOMIC",
    "transaction": {
      "serialized": "base64...",
      "nonceAccount": "..."
    }
  }
}
```

**Frontend Flow:**
1. User selects NFT and sets price
2. Call create offer endpoint
3. Have user sign the returned transaction
4. Listing is now active

---

### 2. Swap NFTs (NFT-for-NFT or NFT-for-NFT+SOL)

Exchange NFTs between two parties with optional SOL on either side.

**Endpoint:** `POST /api/swaps/offers`

```typescript
// NFT-for-NFT swap
{
  "makerWallet": "PARTY_A_WALLET",
  "takerWallet": "PARTY_B_WALLET",  // Optional: specify counterparty
  "offeredAssets": [
    { "mint": "NFT_A_MINT", "isCompressed": false, "isCoreNft": false }
  ],
  "requestedAssets": [
    { "mint": "NFT_B_MINT", "isCompressed": false, "isCoreNft": false }
  ],
  "offeredSol": "0",
  "requestedSol": "0"
}

// NFT + SOL for NFT swap
{
  "makerWallet": "PARTY_A_WALLET",
  "offeredAssets": [
    { "mint": "NFT_A_MINT", "isCompressed": false, "isCoreNft": false }
  ],
  "requestedAssets": [
    { "mint": "NFT_B_MINT", "isCompressed": true, "isCoreNft": false }  // cNFT
  ],
  "offeredSol": "500000000",  // Adding 0.5 SOL to sweeten deal
  "requestedSol": "0"
}
```

---

### 3. Bundle Swaps (Multiple NFTs)

Swap multiple NFTs in a single atomic transaction. Supports up to 10 assets per side.

**Endpoint:** `POST /api/swaps/offers`

```typescript
// Bundle swap (auto-detects execution strategy)
{
  "makerWallet": "PARTY_A_WALLET",
  "takerWallet": "PARTY_B_WALLET",
  "offeredAssets": [
    { "mint": "NFT_1", "isCompressed": false, "isCoreNft": false },
    { "mint": "CNFT_2", "isCompressed": true, "isCoreNft": false },
    { "mint": "CNFT_3", "isCompressed": true, "isCoreNft": false }
  ],
  "requestedAssets": [
    { "mint": "NFT_4", "isCompressed": false, "isCoreNft": false },
    { "mint": "CORE_NFT_5", "isCompressed": false, "isCoreNft": true }
  ],
  "offeredSol": "0",
  "requestedSol": "1000000000"
}
```

**Execution Strategies (Auto-Selected):**

| Condition | Strategy | Execution |
|-----------|----------|-----------|
| < 3 cNFTs, fits in 1 tx | `SINGLE_TRANSACTION` | Immediate atomic |
| 3+ cNFTs or 5+ assets | `BULK_TWO_PHASE` | Lock → Settle phases |
| Large bundles | `JITO_BUNDLE` | Bundled transactions |

**Two-Phase Flow for Large Bundles:**

```typescript
// 1. Create offer
POST /api/swaps/offers
// Returns: { offerType: "BULK_TWO_PHASE", ... }

// 2. Accept (Party B)
POST /api/swaps/offers/bulk/{id}/accept
{ "partyB": "PARTY_B_WALLET" }
// Returns lock transaction for Party A

// 3. Lock Phase - Party A signs
POST /api/swaps/offers/bulk/{id}/lock
{ "party": "A", "signature": "base58_signature" }

// 4. Lock Phase - Party B signs
POST /api/swaps/offers/bulk/{id}/lock
{ "party": "B", "signature": "base58_signature" }

// 5. Settlement (automatic or manual trigger)
POST /api/swaps/offers/bulk/{id}/settle

// 6. Track progress
GET /api/swaps/offers/bulk/{id}/progress
```

---

### 4. Counter Offers on NFT Sales

Allow buyers to make counter offers on existing listings.

**Endpoint:** `POST /api/swaps/offers/{id}/counter`

```typescript
// Get original offer first
GET /api/swaps/offers/12345

// Create counter offer
POST /api/swaps/offers/12345/counter
{
  "counterMakerWallet": "COUNTER_OFFERER_WALLET"
}

// Response: New offer created with swapped maker/taker roles
{
  "success": true,
  "data": {
    "offer": {
      "id": "12346",  // New offer ID
      "status": "ACTIVE",
      "makerWallet": "COUNTER_OFFERER_WALLET",
      "takerWallet": "ORIGINAL_MAKER_WALLET",
      // Assets swapped from original
    },
    "originalOfferId": "12345"
  }
}
```

**Counter Offer Flow:**
1. Buyer views listing (offer 12345)
2. Buyer clicks "Make Counter Offer"
3. Call counter endpoint - creates new offer with roles swapped
4. Original seller can accept the counter offer

---

### 5. Cancel NFT Listing

Cancel an active listing you created.

**Endpoint:** `POST /api/swaps/offers/{id}/cancel`

```typescript
// Request
{
  "walletAddress": "YOUR_MAKER_WALLET"
}

// Response
{
  "success": true,
  "data": {
    "message": "Offer 12345 cancelled successfully",
    "cancelledBy": "YOUR_MAKER_WALLET",
    "role": "maker"
  }
}
```

**Notes:**
- Only the maker can cancel their own offer
- Offer must be in `ACTIVE` status
- Cancellation is immediate - no on-chain transaction needed

---

### 6. Cancel Swap

Cancel a pending swap before it's executed.

**Endpoint:** `POST /api/swaps/offers/{id}/cancel`

```typescript
// For atomic swaps
POST /api/swaps/offers/12345/cancel
{ "walletAddress": "MAKER_WALLET" }

// For two-phase swaps (before settlement)
POST /api/swaps/offers/bulk/{uuid}/cancel
{ "walletAddress": "PARTY_A_OR_B_WALLET" }
```

**Cancellation Rules:**
- Atomic swaps: Maker can cancel anytime before acceptance
- Two-phase swaps: Either party can cancel before both lock
- After lock: Cannot cancel (assets are committed)

---

### 7. Private Sale

Create a sale only a specific buyer can accept.

**Endpoint:** `POST /api/swaps/offers`

```typescript
{
  "makerWallet": "SELLER_WALLET",
  "takerWallet": "SPECIFIC_BUYER_WALLET",  // Only this wallet can buy
  "offeredAssets": [
    { "mint": "NFT_MINT", "isCompressed": false, "isCoreNft": false }
  ],
  "requestedAssets": [],
  "offeredSol": "0",
  "requestedSol": "5000000000"  // 5 SOL
}
```

**Error if wrong buyer tries to accept:**
```json
{
  "success": false,
  "error": "Only the designated taker can accept this offer"
}
```

---

### 8. Private Swap

Create a swap only a specific counterparty can accept.

**Endpoint:** `POST /api/swaps/offers`

```typescript
{
  "makerWallet": "PARTY_A_WALLET",
  "takerWallet": "PARTY_B_WALLET",  // Only Party B can accept
  "offeredAssets": [
    { "mint": "NFT_A", "isCompressed": false, "isCoreNft": false }
  ],
  "requestedAssets": [
    { "mint": "NFT_B", "isCompressed": true, "isCoreNft": false }
  ],
  "offeredSol": "0",
  "requestedSol": "0"
}
```

---

### 9. Custom Fees

#### Percentage Fees for Sales (Default)

Sales with SOL automatically use percentage-based fees:

```typescript
// Sale for 10 SOL
{
  "offeredAssets": [{ "mint": "NFT", ... }],
  "requestedSol": "10000000000"  // 10 SOL
}

// Fee calculation:
// 1% of 10 SOL = 0.1 SOL platform fee
// Minimum: 0.001 SOL
// Maximum: 0.5 SOL (capped)
```

#### Flat Fees for Swaps (Default)

NFT-for-NFT swaps use flat fees:

```typescript
// NFT-for-NFT swap (no SOL)
{
  "offeredAssets": [{ "mint": "NFT_A", ... }],
  "requestedAssets": [{ "mint": "NFT_B", ... }],
  "offeredSol": "0",
  "requestedSol": "0"
}

// Fee: Flat 0.005 SOL
```

#### Custom Fee Override

Specify exact fee amount in lamports:

```typescript
{
  "makerWallet": "...",
  "offeredAssets": [...],
  "requestedAssets": [...],
  "customFee": "2500000"  // 0.0025 SOL custom fee
}
```

#### Zero-Fee Swaps (Partner API Key Required)

```typescript
// With API key header
Headers: {
  "x-api-key": "your-partner-api-key"
}

// Request body
{
  "makerWallet": "...",
  "offeredAssets": [...],
  "customFee": "0"  // Zero fee
}
```

---

## Get Quote Before Creating Offer

Get a comprehensive quote including fees, transaction size, and execution strategy.

**Endpoint:** `POST /api/quote`

```typescript
// Request
{
  "makerAssets": [
    { "mint": "NFT_A", "isCompressed": false }
  ],
  "takerAssets": [
    { "mint": "CNFT_B", "isCompressed": true }
  ],
  "makerSolLamports": 0,
  "takerSolLamports": 1000000000
}

// Response
{
  "success": true,
  "data": {
    "platformFee": {
      "lamports": 10000000,
      "sol": 0.01,
      "type": "percentage",
      "rate": 0.01,
      "display": "0.01 SOL (1%)"
    },
    "networkFee": {
      "lamports": 5000,
      "sol": 0.000005,
      "display": "~0.000005 SOL"
    },
    "transactionSize": {
      "estimated": 892,
      "maxSize": 1232,
      "willFit": true,
      "status": "ok"
    },
    "swapAnalysis": {
      "strategy": "SINGLE_TRANSACTION",
      "transactionCount": 1
    },
    "canSwap": true,
    "warnings": []
  }
}
```

---

## Accept an Offer

**Endpoint:** `POST /api/swaps/offers/{id}/accept`

```typescript
// Request
{
  "takerWallet": "BUYER_WALLET"
}

// Response
{
  "success": true,
  "data": {
    "offer": {
      "id": "12345",
      "status": "ACCEPTED"
    },
    "transaction": {
      "serialized": "base64_encoded_transaction",
      "nonceAccount": "nonce_account_address"
    },
    "executionStrategy": "atomic"
  }
}
```

**Frontend Flow:**
1. Buyer clicks "Accept" on listing
2. Call accept endpoint
3. Deserialize transaction: `Transaction.from(Buffer.from(serialized, 'base64'))`
4. Have buyer sign with their wallet
5. Submit signed transaction to network

---

## List Active Offers

**Endpoint:** `GET /api/swaps/offers`

```typescript
// Query parameters
?status=ACTIVE
&makerWallet=OPTIONAL_FILTER
&limit=20
&offset=0

// Response
{
  "success": true,
  "data": {
    "offers": [
      {
        "id": "12345",
        "status": "ACTIVE",
        "makerWallet": "...",
        "takerWallet": null,
        "offeredAssets": [...],
        "requestedAssets": [...],
        "offeredSol": "0",
        "requestedSol": "5000000000",
        "createdAt": "...",
        "expiresAt": "..."
      }
    ],
    "total": 150,
    "limit": 20,
    "offset": 0
  }
}
```

---

## Error Handling

### Standard Error Response

```typescript
{
  "success": false,
  "error": "Error message",
  "details": ["Additional context"],
  "timestamp": "2025-01-15T10:00:00Z"
}
```

### Common Error Codes

| Status | Error | Resolution |
|--------|-------|------------|
| 400 | `Invalid wallet address` | Check wallet format |
| 400 | `Asset not found` | Verify NFT mint/asset ID |
| 403 | `Only the designated taker can accept` | Wrong wallet for private sale |
| 404 | `Offer not found` | Check offer ID |
| 422 | `Asset not owned by wallet` | User doesn't own the NFT |
| 422 | `Transaction too large` | Reduce assets or use bundle |
| 429 | `Rate limit exceeded` | Wait and retry |

---

## TypeScript Types

```typescript
interface Asset {
  mint: string;           // Mint address or Asset ID
  isCompressed: boolean;  // true for cNFTs
  isCoreNft: boolean;     // true for Metaplex Core
}

interface CreateOfferRequest {
  makerWallet: string;
  takerWallet?: string | null;  // null for public offers
  offeredAssets: Asset[];
  requestedAssets: Asset[];
  offeredSol: string;           // Lamports as string
  requestedSol: string;         // Lamports as string
  customFee?: string;           // Optional custom fee in lamports
}

interface Offer {
  id: string;
  status: 'ACTIVE' | 'ACCEPTED' | 'EXECUTED' | 'EXPIRED' | 'CANCELLED';
  makerWallet: string;
  takerWallet: string | null;
  offeredAssets: Asset[];
  requestedAssets: Asset[];
  offeredSol: string;
  requestedSol: string;
  createdAt: string;
  expiresAt: string;
}

type OfferType = 'ATOMIC' | 'CNFT_BID' | 'BULK_TWO_PHASE';
type ExecutionStrategy = 'atomic' | 'two-phase' | 'cnft-escrow';
```

---

## Test Page Reference

Visit `/test` on the API to see a working implementation of all features:
- Wallet selection and NFT loading
- Asset selection UI with drag-and-drop
- Real-time transaction size estimation
- Quote display with fee breakdown
- Full swap creation and acceptance flow

Use the test page as a reference for implementing your frontend integration.
