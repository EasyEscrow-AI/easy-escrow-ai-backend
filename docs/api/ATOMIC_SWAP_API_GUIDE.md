# Atomic Swap API Integration Guide

**Last Updated:** December 2, 2025  
**API Version:** 1.0.0  
**Base URL:** https://api.easyescrow.ai

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Workflow Examples](#workflow-examples)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [WebSocket Events](#websocket-events)
8. [SDK Usage](#sdk-usage)

---

## Quick Start

### Complete Swap Flow

```typescript
// 1. Maker creates an offer
const offerResponse = await fetch('https://api.easyescrow.ai/api/offers', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': uuidv4(), // Prevents duplicate offers
  },
  body: JSON.stringify({
    makerWallet: 'ABC...DEF',  // Your wallet address
    takerWallet: '123...456',  // Optional: specific taker
    offeredAssets: [
      {
        mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        isCompressed: false
      }
    ],
    requestedAssets: [],
    offeredSol: '0',
    requestedSol: '1000000000'  // 1 SOL in lamports
  })
});

const { offer } = await offerResponse.json();

// 2. Taker accepts the offer
const acceptResponse = await fetch(`https://api.easyescrow.ai/api/offers/${offer.id}/accept`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': uuidv4(),
  },
  body: JSON.stringify({
    takerWallet: '123...456'
  })
});

const { transaction } = await acceptResponse.json();

// 3. Taker signs and broadcasts transaction
const tx = Transaction.from(Buffer.from(transaction.serialized, 'base64'));
const signedTx = await wallet.signTransaction(tx);
const signature = await connection.sendRawTransaction(signedTx.serialize());

// 4. Taker confirms with backend
await fetch(`https://api.easyescrow.ai/api/offers/${offer.id}/confirm`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': uuidv4(),
  },
  body: JSON.stringify({
    signature,
    takerWallet: '123...456'
  })
});

// ✅ Swap complete! Assets transferred atomically
```

---

## Authentication

### API Key (Optional)

For higher rate limits, request an API key:

```typescript
headers: {
  'X-API-Key': 'your-api-key-here'
}
```

**Rate Limits:**
- Without API key: 100 requests / 15 minutes
- With API key: 1000 requests / 15 minutes

### Wallet Signature Verification

Some endpoints require wallet signature verification:

```typescript
// Sign message with your wallet
const message = `EasyEscrow.ai authentication: ${Date.now()}`;
const signature = await wallet.signMessage(Buffer.from(message));

headers: {
  'X-Wallet-Address': 'your-wallet-address',
  'X-Wallet-Signature': bs58.encode(signature),
  'X-Wallet-Message': message
}
```

---

## API Endpoints

### 1. Create Offer

**Endpoint:** `POST /api/offers`

**Description:** Create a new atomic swap offer.

**Headers:**
```
Content-Type: application/json
Idempotency-Key: <uuid>  # Required to prevent duplicate offers
```

**Request Body:**
```typescript
{
  makerWallet: string;           // Your wallet address
  takerWallet?: string;          // Optional: restrict to specific taker
  offeredAssets: Asset[];        // Assets you're offering
  requestedAssets: Asset[];      // Assets you're requesting
  offeredSol: string;            // SOL you're offering (lamports)
  requestedSol: string;          // SOL you're requesting (lamports)
  customFee?: string;            // Optional: Override platform fee
}

interface Asset {
  mint: string;                  // NFT mint address or cNFT asset ID
  isCompressed: boolean;         // true for cNFTs, false for standard NFTs
}
```

**Response (201 Created):**
```typescript
{
  success: true,
  data: {
    offer: {
      id: "1",
      status: "PENDING",
      makerWallet: "ABC...DEF",
      takerWallet: "123...456",
      offeredAssets: [...],
      requestedAssets: [...],
      offeredSol: "0",
      requestedSol: "1000000000",
      platformFeeLamports: "10000000",
      expiresAt: "2025-12-09T10:00:00.000Z",
      createdAt: "2025-12-02T10:00:00.000Z"
    },
    transaction: {
      nonceAccount: "GHI...JKL",
      message: "Transaction will be built when offer is accepted"
    }
  },
  timestamp: "2025-12-02T10:00:00.000Z"
}
```

**Examples:**

**NFT ↔ SOL:**
```json
{
  "makerWallet": "498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R",
  "takerWallet": "8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ",
  "offeredAssets": [
    {
      "mint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "isCompressed": false
    }
  ],
  "requestedAssets": [],
  "offeredSol": "0",
  "requestedSol": "1000000000"
}
```

**cNFT ↔ SOL:**
```json
{
  "makerWallet": "498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R",
  "offeredAssets": [
    {
      "mint": "DRiP2Pn2K6fuMLKQmt5rZWqHheXMyUtCeXhe8kDQdxRu",
      "isCompressed": true
    }
  ],
  "requestedAssets": [],
  "offeredSol": "0",
  "requestedSol": "2000000000"
}
```

**Bulk cNFT Swap (3+ cNFTs):**
```json
{
  "makerWallet": "498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R",
  "offeredAssets": [
    {
      "mint": "DRiP2Pn2K6fuMLKQmt5rZWqHheXMyUtCeXhe8kDQdxRu",
      "isCompressed": true
    },
    {
      "mint": "DRiP2Pn2K6fuMLKQmt5rZWqHheXMyUtCeXhe8kDQdxRu2",
      "isCompressed": true
    },
    {
      "mint": "DRiP2Pn2K6fuMLKQmt5rZWqHheXMyUtCeXhe8kDQdxRu3",
      "isCompressed": true
    }
  ],
  "requestedAssets": [],
  "offeredSol": "0",
  "requestedSol": "5000000000"
}
```

**Response for Bulk Swap:**
```json
{
  "success": true,
  "data": {
    "offer": {
      "id": "1",
      "status": "ACTIVE",
      "isBulkSwap": true,
      "transactionGroup": {
        "strategy": "DIRECT_BUBBLEGUM_BUNDLE",
        "transactionCount": 3,
        "requiresJitoBundle": true,
        "transactions": [
          {
            "index": 0,
            "purpose": "Platform fee + first cNFT batch",
            "serializedTransaction": "base64-encoded-tx-1",
            "assets": {
              "makerAssets": [{"identifier": "...", "type": "CNFT"}],
              "takerAssets": []
            }
          },
          {
            "index": 1,
            "purpose": "Second cNFT batch",
            "serializedTransaction": "base64-encoded-tx-2",
            "assets": {
              "makerAssets": [{"identifier": "...", "type": "CNFT"}],
              "takerAssets": []
            }
          },
          {
            "index": 2,
            "purpose": "Final cNFT + SOL transfer",
            "serializedTransaction": "base64-encoded-tx-3",
            "assets": {
              "makerAssets": [{"identifier": "...", "type": "CNFT"}],
              "takerAssets": []
            }
          }
        ]
      }
    }
  }
}
```

**NFT ↔ NFT:**
```json
{
  "makerWallet": "498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R",
  "takerWallet": "8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ",
  "offeredAssets": [
    {
      "mint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "isCompressed": false
    }
  ],
  "requestedAssets": [
    {
      "mint": "8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "isCompressed": false
    }
  ],
  "offeredSol": "0",
  "requestedSol": "0"
}
```

---

### 2. List Offers

**Endpoint:** `GET /api/offers`

**Query Parameters:**
```
status?: PENDING | ACCEPTED | FILLED | CANCELLED | EXPIRED
makerWallet?: string
takerWallet?: string
limit?: number (default: 50, max: 100)
offset?: number (default: 0)
```

**Response (200 OK):**
```typescript
{
  success: true,
  data: {
    offers: Offer[],
    total: number,
    limit: number,
    offset: number
  },
  timestamp: string
}
```

**Example:**
```bash
GET /api/offers?status=PENDING&limit=20
```

---

### 3. Get Offer Details

**Endpoint:** `GET /api/offers/:offerId`

**Response (200 OK):**
```typescript
{
  success: true,
  data: {
    id: "1",
    status: "PENDING",
    makerWallet: "...",
    takerWallet: "...",
    offeredAssets: [...],
    requestedAssets: [...],
    offeredSol: "0",
    requestedSol: "1000000000",
    platformFeeLamports: "10000000",
    nonceAccount: "...",
    currentNonceValue: "...",
    parentOfferId: null,
    expiresAt: "2025-12-09T10:00:00.000Z",
    createdAt: "2025-12-02T10:00:00.000Z",
    filledAt: null,
    cancelledAt: null
  },
  timestamp: string
}
```

---

### 4. Accept Offer

**Endpoint:** `POST /api/offers/:offerId/accept`

**Description:** Accept an offer and receive the transaction to sign.

**Headers:**
```
Idempotency-Key: <uuid>  # Required
```

**Request Body:**
```typescript
{
  takerWallet: string;  // Your wallet address
}
```

**Response (200 OK):**
```typescript
{
  success: true,
  data: {
    offer: {...},
    transaction: {
      serialized: string;        // Base64-encoded transaction
      nonceAccount: string;      // Nonce account used
    }
  },
  timestamp: string
}
```

**Next Steps:**
1. Deserialize transaction
2. Sign with wallet
3. Broadcast to Solana
4. Call `/confirm` with signature

---

### 5. Confirm Swap Execution

**Endpoint:** `POST /api/offers/:offerId/confirm`

**Description:** Confirm that the swap transaction was broadcast.

**Headers:**
```
Idempotency-Key: <uuid>  # Required
```

**Request Body:**
```typescript
{
  signature: string;        // Transaction signature
  takerWallet: string;      // Your wallet address
}
```

**Response (200 OK):**
```typescript
{
  success: true,
  data: {
    offerId: "1",
    status: "FILLED",
    signature: "...",
    confirmedAt: "2025-12-02T10:05:00.000Z"
  },
  timestamp: string
}
```

---

### 6. Cancel Offer

**Endpoint:** `POST /api/offers/:offerId/cancel`

**Description:** Cancel your own offer (maker only).

**Request Body:**
```typescript
{
  walletAddress: string;  // Must be maker's address
}
```

**Response (200 OK):**
```typescript
{
  success: true,
  data: {
    offerId: "1",
    status: "CANCELLED",
    cancelledAt: "2025-12-02T10:03:00.000Z",
    message: "Offer cancelled and nonce advanced"
  },
  timestamp: string
}
```

---

### 7. Create Counter-Offer

**Endpoint:** `POST /api/offers/:offerId/counter`

**Description:** Create a counter-offer with different terms.

**Headers:**
```
Idempotency-Key: <uuid>
```

**Request Body:** Same as Create Offer

**Response (201 Created):** Same as Create Offer, with `parentOfferId` set

---

## Workflow Examples

### Example 1: Open Offer (Anyone Can Accept)

```typescript
// Maker: "I'll give 1 SOL for any Cool Cat NFT"
const offer = await createOffer({
  makerWallet: 'ABC...DEF',
  // No takerWallet specified = open offer
  offeredAssets: [],
  requestedAssets: [
    { mint: 'CoolCatMint...', isCompressed: false }
  ],
  offeredSol: '1000000000',  // 1 SOL
  requestedSol: '0'
});

// Taker: "I have a Cool Cat, I'll accept!"
const { transaction } = await acceptOffer(offer.id, 'XYZ...123');

// Taker signs, broadcasts, confirms
await signAndBroadcast(transaction);
await confirmSwap(offer.id, signature, 'XYZ...123');
```

### Example 2: Direct Offer (Specific Taker)

```typescript
// Maker: "Hey @alice, I'll trade my NFT for 2 SOL"
const offer = await createOffer({
  makerWallet: 'ABC...DEF',
  takerWallet: 'alice...wallet',  // Only alice can accept
  offeredAssets: [
    { mint: 'MyNFT...', isCompressed: false }
  ],
  requestedAssets: [],
  offeredSol: '0',
  requestedSol: '2000000000'  // 2 SOL
});

// Alice: "Deal!"
// ... accept flow
```

### Example 3: Counter-Offer Negotiation

```typescript
// Maker: "I offer 1 SOL for your NFT"
const originalOffer = await createOffer({
  makerWallet: 'ABC...DEF',
  offeredAssets: [],
  requestedAssets: [{ mint: 'NFT...', isCompressed: false }],
  offeredSol: '1000000000',
  requestedSol: '0'
});

// Taker: "How about 1.5 SOL?"
const counterOffer = await createCounterOffer(originalOffer.id, {
  makerWallet: 'XYZ...123',  // Now taker becomes maker
  takerWallet: 'ABC...DEF',  // Original maker becomes taker
  offeredAssets: [{ mint: 'NFT...', isCompressed: false }],
  requestedAssets: [],
  offeredSol: '0',
  requestedSol: '1500000000'  // 1.5 SOL
});

// Original maker: "Okay, deal!"
await acceptOffer(counterOffer.id, 'ABC...DEF');
```

---

## Error Handling

### Error Response Format

```typescript
{
  success: false,
  error: {
    code: string;
    message: string;
    details?: any;
  },
  timestamp: string
}
```

### Common Error Codes

| Code | HTTP | Description | Solution |
|------|------|-------------|----------|
| `INVALID_REQUEST` | 400 | Malformed request body | Check request format |
| `ASSET_NOT_OWNED` | 422 | Asset not owned by wallet | Verify asset ownership |
| `ASSET_VALIDATION_FAILED` | 422 | Asset validation error | Check mint address, ensure not burned |
| `INSUFFICIENT_BALANCE` | 422 | Insufficient SOL balance | Add more SOL to wallet |
| `OFFER_NOT_FOUND` | 404 | Offer doesn't exist | Check offer ID |
| `OFFER_ALREADY_FILLED` | 409 | Offer already accepted | Find another offer |
| `OFFER_EXPIRED` | 410 | Offer has expired | Offer is >7 days old |
| `UNAUTHORIZED` | 403 | Not authorized for action | Check wallet address |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait and retry |
| `INTERNAL_ERROR` | 500 | Server error | Contact support |

### Example Error Handling

```typescript
try {
  const offer = await createOffer(data);
} catch (error) {
  if (error.status === 422 && error.data.error.code === 'ASSET_NOT_OWNED') {
    alert('You do not own this NFT. Please refresh and try again.');
  } else if (error.status === 429) {
    alert('Rate limit exceeded. Please wait a moment and try again.');
  } else {
    alert(`Error: ${error.data.error.message}`);
  }
}
```

---

## Rate Limiting

### Limits

| Endpoint | Without API Key | With API Key |
|----------|----------------|--------------|
| `GET /api/offers` | 100/15min | 1000/15min |
| `GET /api/offers/:id` | 100/15min | 1000/15min |
| `POST /api/offers` | 10/15min | 50/15min |
| `POST /api/offers/:id/accept` | 10/15min | 50/15min |
| `POST /api/offers/:id/confirm` | 10/15min | 50/15min |
| `POST /api/offers/:id/cancel` | 20/15min | 100/15min |

### Rate Limit Headers

Response includes headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1733149200
```

### Handling Rate Limits

```typescript
const response = await fetch('/api/offers', { ... });

if (response.status === 429) {
  const resetTime = parseInt(response.headers.get('X-RateLimit-Reset'));
  const waitSeconds = resetTime - Math.floor(Date.now() / 1000);
  
  console.log(`Rate limited. Retry in ${waitSeconds} seconds`);
  await sleep(waitSeconds * 1000);
  
  // Retry request
  return fetch('/api/offers', { ... });
}
```

---

## WebSocket Events

**⚠️ Coming Soon:** Real-time offer updates via WebSocket.

**Planned Events:**
- `offer.created`
- `offer.accepted`
- `offer.filled`
- `offer.cancelled`
- `offer.expired`
- `counter-offer.created`

---

## SDK Usage

### JavaScript/TypeScript SDK

**Installation:**
```bash
npm install @easyescrow/sdk
```

**Usage:**
```typescript
import { EasyEscrowClient } from '@easyescrow/sdk';

const client = new EasyEscrowClient({
  network: 'mainnet-beta',  // or 'devnet'
  wallet: yourWallet         // Solana wallet adapter
});

// Create offer
const offer = await client.offers.create({
  offeredAssets: [{ mint: '...', isCompressed: false }],
  requestedSol: '1000000000'
});

// Accept offer
const transaction = await client.offers.accept(offer.id);
const signature = await client.signAndBroadcast(transaction);
await client.offers.confirm(offer.id, signature);

// List offers
const offers = await client.offers.list({ status: 'PENDING' });

// Cancel offer
await client.offers.cancel(offer.id);
```

---

## Best Practices

### 1. Always Use Idempotency Keys

Prevents duplicate offers/acceptances:
```typescript
import { v4 as uuidv4 } from 'uuid';

headers: {
  'Idempotency-Key': uuidv4()
}
```

### 2. Verify Asset Ownership Before Creating Offer

```typescript
// Check if you own the NFT before creating offer
const tokenAccount = await connection.getTokenAccountsByOwner(
  wallet.publicKey,
  { mint: nftMint }
);

if (tokenAccount.value.length === 0) {
  throw new Error('You do not own this NFT');
}
```

### 3. Handle Transaction Failures Gracefully

```typescript
try {
  const signature = await connection.sendRawTransaction(signedTx);
  await connection.confirmTransaction(signature);
  
  // Only confirm with backend after on-chain confirmation
  await confirmSwap(offerId, signature);
} catch (error) {
  // Transaction failed - do NOT confirm with backend
  console.error('Transaction failed:', error);
  // Offer remains in ACCEPTED state
  // Can retry or cancel
}
```

### 4. Check Offer Expiry Before Accepting

```typescript
const offer = await getOffer(offerId);

if (new Date(offer.expiresAt) < new Date()) {
  alert('This offer has expired');
  return;
}

// Accept within next 5 minutes buffer
if (new Date(offer.expiresAt) < new Date(Date.now() + 5 * 60 * 1000)) {
  alert('Warning: This offer expires soon!');
}
```

### 5. Monitor Solana Network Status

```typescript
// Check if network is healthy before initiating swap
const health = await connection.getHealth();

if (health !== 'ok') {
  alert('Solana network is experiencing issues. Please try again later.');
  return;
}
```

---

## Testing

### Devnet Testing

**Endpoints:**
- Staging API: `https://staging-api.easyescrow.ai`
- Devnet RPC: `https://api.devnet.solana.com`

**Test Tokens:**
1. Get devnet SOL: `solana airdrop 2`
2. Mint test NFTs using Metaplex CLI
3. Create test offers
4. Practice full swap flow

---

## Support

**Documentation:** https://docs.easyescrow.ai  
**API Reference:** https://api.easyescrow.ai/docs  
**Discord:** https://discord.gg/easyescrow  
**Email:** support@easyescrow.ai

---

**Last Updated:** December 2, 2025  
**API Version:** 1.0.0  
**Maintained By:** EasyEscrow.ai Development Team



