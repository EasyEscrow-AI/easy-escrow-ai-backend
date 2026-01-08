# DataSales Settlement Layer API

## Overview

EasyEscrow provides the **settlement layer** for DataSales.ai - a data buy/sell marketplace. This API handles:
- Secure file storage (S3 buckets per agreement)
- SOL escrow (Solana PDAs)
- Settlement execution
- Time-limited download access control

## Base URL

```
Production: https://api.easyescrow.ai
Staging: https://staging-api.easyescrow.ai
Development: http://localhost:3000
```

## Authentication

### DataSales API Key

Protected endpoints require the `X-DataSales-API-Key` header:

```http
X-DataSales-API-Key: your-api-key-here
```

### Public Endpoints

Some endpoints (seller uploads, buyer deposits, download access) are public but require wallet ownership verification.

## Agreement Lifecycle Flow

```
┌─────────────────┐
│ PENDING_DEPOSITS │ ←── Agreement created
└────────┬────────┘
         │
   ┌─────┴─────┐
   ↓           ↓
DATA_LOCKED  SOL_LOCKED
(seller up)  (buyer paid)
   └─────┬─────┘
         ↓
  ┌─────────────┐
  │ BOTH_LOCKED │ ←── Both deposits confirmed
  └──────┬──────┘
         │
   ┌─────┴─────┐
   ↓           ↓
APPROVED    REJECTED → Seller re-uploads
   │
   ↓
┌─────────┐
│ SETTLED │ ←── SOL released, access granted
└────┬────┘
     │
     ↓
┌─────────┐
│ EXPIRED │ ←── Access period ended
└────┬────┘
     │
     ↓
┌──────────┐
│ ARCHIVED │ ←── Cleanup complete
└──────────┘
```

---

## Endpoints Reference

### Agreement Lifecycle

#### Create Agreement

Create a new DataSales agreement with S3 bucket.

**Endpoint:** `POST /api/datasales/agreements`

**Auth:** DataSales API key required

**Request Body:**
```json
{
  "sellerWallet": "SellerPublicKey...",
  "buyerWallet": "BuyerPublicKey...",      // Optional: for specific buyer
  "priceLamports": "1000000000",           // Price in lamports (1 SOL = 1B)
  "platformFeeBps": 250,                    // Optional: default 2.5%
  "depositWindowHours": 72,                 // Optional: default 72 hours
  "accessDurationHours": 168,               // Optional: default 7 days
  "files": [                                // Optional: initial files
    {
      "key": "data.csv",
      "contentType": "text/csv"
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "agreement": {
      "id": "db-uuid",
      "agreementId": "uuid-v4",
      "sellerWallet": "SellerPublicKey...",
      "buyerWallet": null,
      "priceLamports": "1000000000",
      "platformFeeLamports": "25000000",
      "status": "PENDING_DEPOSITS",
      "depositWindowEndsAt": "2024-01-18T10:00:00.000Z",
      "accessDurationHours": 168,
      "s3BucketName": "datasales-uuid-v4"
    },
    "uploadUrls": [
      {
        "url": "https://s3.amazonaws.com/bucket/data.csv?signed...",
        "key": "data.csv",
        "expiresAt": "2024-01-15T11:00:00.000Z",
        "method": "PUT"
      }
    ],
    "payment": {
      "priceLamports": "1000000000",
      "platformFeeLamports": "25000000",
      "totalLamports": "1025000000",
      "solVaultPda": "VaultPdaAddress..."
    }
  },
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

---

#### Get Agreement

Retrieve agreement details.

**Endpoint:** `GET /api/datasales/agreements/:id`

**Auth:** Public

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "db-uuid",
    "agreementId": "uuid-v4",
    "sellerWallet": "SellerPublicKey...",
    "buyerWallet": "BuyerPublicKey...",
    "priceLamports": "1000000000",
    "platformFeeLamports": "25000000",
    "platformFeeBps": 250,
    "status": "PENDING_DEPOSITS",
    "depositWindowEndsAt": "2024-01-18T10:00:00.000Z",
    "accessDurationHours": 168,
    "s3BucketName": "datasales-uuid-v4",
    "s3Region": "us-east-1",
    "files": null,
    "totalSizeBytes": null,
    "sellerDepositedAt": null,
    "buyerDepositedAt": null,
    "verifiedAt": null,
    "rejectionReason": null,
    "settledAt": null,
    "accessExpiresAt": null,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  },
  "timestamp": "2024-01-15T10:05:00.000Z"
}
```

---

#### Cancel Agreement

Cancel an agreement (refund SOL if buyer deposited, delete S3 bucket).

**Endpoint:** `POST /api/datasales/agreements/:id/cancel`

**Auth:** DataSales API key required

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Agreement cancelled successfully",
  "timestamp": "2024-01-15T10:10:00.000Z"
}
```

---

### Seller Endpoints

#### Get Upload URLs

Generate presigned URLs for file uploads.

**Endpoint:** `GET /api/datasales/agreements/:id/upload-urls`

**Auth:** Public

**Query Parameters:**
- `files` (string, required): JSON array of files

**Example:**
```
GET /api/datasales/agreements/uuid/upload-urls?files=[{"key":"data.csv","contentType":"text/csv"}]
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "uploadUrls": [
      {
        "url": "https://s3.amazonaws.com/bucket/data.csv?signed...",
        "key": "data.csv",
        "expiresAt": "2024-01-15T11:00:00.000Z",
        "method": "PUT"
      }
    ]
  },
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

---

#### Confirm Upload

Confirm that seller has uploaded files.

**Endpoint:** `POST /api/datasales/agreements/:id/confirm-upload`

**Auth:** Public (wallet verification recommended)

**Request Body:**
```json
{
  "sellerWallet": "SellerPublicKey...",
  "files": [
    {
      "key": "data.csv",
      "name": "data.csv",
      "size": 1048576,
      "contentType": "text/csv",
      "sha256": "abc123def456..."
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Upload confirmed successfully",
  "timestamp": "2024-01-15T10:15:00.000Z"
}
```

**Status Transition:**
- `PENDING_DEPOSITS` → `DATA_LOCKED`
- `SOL_LOCKED` → `BOTH_LOCKED`

---

### Buyer Endpoints

#### Build Deposit Transaction

Build SOL deposit transaction for buyer.

**Endpoint:** `POST /api/datasales/agreements/:id/deposit`

**Auth:** Public

**Request Body:**
```json
{
  "buyerWallet": "BuyerPublicKey..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "serializedTransaction": "base64-encoded-tx...",
      "blockhash": "recent-blockhash",
      "lastValidBlockHeight": 12345678
    }
  },
  "timestamp": "2024-01-15T10:20:00.000Z"
}
```

---

#### Confirm Deposit

Confirm buyer's SOL deposit.

**Endpoint:** `POST /api/datasales/agreements/:id/confirm-deposit`

**Auth:** Public

**Request Body:**
```json
{
  "buyerWallet": "BuyerPublicKey...",
  "txSignature": "tx-signature..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Deposit confirmed successfully",
  "timestamp": "2024-01-15T10:25:00.000Z"
}
```

**Status Transition:**
- `PENDING_DEPOSITS` → `SOL_LOCKED`
- `DATA_LOCKED` → `BOTH_LOCKED`

---

#### Get Download URLs

Get presigned download URLs (only after settlement).

**Endpoint:** `GET /api/datasales/agreements/:id/download-urls`

**Auth:** Public (buyer wallet verification)

**Query Parameters:**
- `buyerWallet` (string, required): Buyer's wallet address

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "downloadUrls": [
      {
        "url": "https://s3.amazonaws.com/bucket/data.csv?signed...",
        "key": "data.csv",
        "expiresAt": "2024-01-16T10:00:00.000Z",
        "method": "GET"
      }
    ]
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Errors:**
- `403`: Agreement not settled yet
- `403`: Access period has expired
- `403`: Not authorized (wrong buyer wallet)

---

### DataSales Verification Endpoints

#### Get Files for Verification

Get files with read URLs for data quality verification.

**Endpoint:** `GET /api/datasales/agreements/:id/files`

**Auth:** DataSales API key required

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "key": "data.csv",
        "name": "data.csv",
        "size": 1048576,
        "contentType": "text/csv",
        "sha256": "abc123def456...",
        "downloadUrl": "https://s3.amazonaws.com/bucket/data.csv?signed...",
        "downloadUrlExpiresAt": "2024-01-15T11:00:00.000Z"
      }
    ]
  },
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

---

#### Approve Data Quality

Approve data quality after verification.

**Endpoint:** `POST /api/datasales/agreements/:id/approve`

**Auth:** DataSales API key required

**Request Body:**
```json
{
  "verifierAddress": "datasales-service-account"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Agreement approved successfully",
  "timestamp": "2024-01-15T10:40:00.000Z"
}
```

**Status Transition:** `BOTH_LOCKED` → `APPROVED`

---

#### Reject Data Quality

Reject data quality (seller can re-upload within window).

**Endpoint:** `POST /api/datasales/agreements/:id/reject`

**Auth:** DataSales API key required

**Request Body:**
```json
{
  "reason": "Data format is incorrect, missing required columns"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Agreement rejected. Seller can re-upload within the deposit window.",
  "timestamp": "2024-01-15T10:45:00.000Z"
}
```

**Note:** Status stays `BOTH_LOCKED` but `rejectionReason` is set. Seller can request new upload URLs and re-upload.

---

### Settlement

#### Execute Settlement

Execute settlement (SOL to seller, access to buyer).

**Endpoint:** `POST /api/datasales/agreements/:id/settle`

**Auth:** DataSales API key required

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "agreement": {
      "id": "db-uuid",
      "agreementId": "uuid-v4",
      "status": "SETTLED",
      "settledAt": "2024-01-15T10:50:00.000Z",
      "accessExpiresAt": "2024-01-22T10:50:00.000Z"
    },
    "downloadUrls": [
      {
        "url": "https://s3.amazonaws.com/bucket/data.csv?signed...",
        "key": "data.csv",
        "expiresAt": "2024-01-16T10:50:00.000Z",
        "method": "GET"
      }
    ],
    "settleTxSignature": "tx-signature..."
  },
  "timestamp": "2024-01-15T10:50:00.000Z"
}
```

**Status Transition:** `APPROVED` → `SETTLED`

---

### Query Endpoints

#### List Agreements

List agreements by seller or buyer wallet.

**Endpoint:** `GET /api/datasales/agreements`

**Auth:** Public

**Query Parameters:**
- `seller` (string): Filter by seller wallet (required if no buyer)
- `buyer` (string): Filter by buyer wallet (required if no seller)
- `status` (string): Filter by status
- `limit` (number): Max results (default: 20)
- `offset` (number): Skip results (default: 0)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "agreements": [
      {
        "id": "db-uuid",
        "agreementId": "uuid-v4",
        "sellerWallet": "SellerPublicKey...",
        "buyerWallet": "BuyerPublicKey...",
        "priceLamports": "1000000000",
        "platformFeeLamports": "25000000",
        "status": "SETTLED",
        ...
      }
    ]
  },
  "timestamp": "2024-01-15T10:55:00.000Z"
}
```

---

## Status Values

| Status | Description |
|--------|-------------|
| `PENDING_DEPOSITS` | Waiting for seller upload and/or buyer SOL |
| `DATA_LOCKED` | Seller uploaded, waiting for buyer SOL |
| `SOL_LOCKED` | Buyer paid, waiting for seller upload |
| `BOTH_LOCKED` | Both deposited, awaiting DataSales verification |
| `APPROVED` | DataSales approved, ready to settle |
| `SETTLED` | SOL released, buyer has download access |
| `EXPIRED` | Access period ended |
| `CANCELLED` | Timeout or manual cancel |
| `ARCHIVED` | Cleanup complete |

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error message",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Validation error or invalid status transition |
| 401 | Unauthorized - Missing API key |
| 403 | Forbidden - Invalid API key or unauthorized access |
| 404 | Not Found - Agreement not found |
| 500 | Internal Server Error |
| 503 | Service Unavailable - DataSales integration disabled |

---

## Rate Limits

| Endpoint Type | Rate Limit | Window |
|---------------|------------|--------|
| Standard | 100 requests | 15 minutes |
| Strict (Create/Settle) | 10 requests | 15 minutes |

Rate limit headers:
- `X-RateLimit-Limit` - Total allowed requests
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Unix timestamp when limit resets

---

## Environment Variables

```bash
# Enable DataSales integration
DATASALES_ENABLED=true

# API key for DataSales service authentication
DATASALES_API_KEY=your-secret-api-key

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_REGION=us-east-1
AWS_S3_BUCKET_PREFIX=datasales-

# Allowed origins for CORS (S3 upload URLs)
DATASALES_ALLOWED_ORIGINS=https://datasales.ai,https://www.datasales.ai
```

---

## Integration Example

### Complete Flow (cURL)

```bash
# 1. Create Agreement (DataSales backend)
curl -X POST https://api.easyescrow.ai/api/datasales/agreements \
  -H "Content-Type: application/json" \
  -H "X-DataSales-API-Key: your-api-key" \
  -d '{
    "sellerWallet": "SellerWallet...",
    "priceLamports": "1000000000",
    "files": [{"key": "data.csv", "contentType": "text/csv"}]
  }'

# 2. Seller uploads file using presigned URL
curl -X PUT "https://s3.amazonaws.com/bucket/data.csv?signed..." \
  -H "Content-Type: text/csv" \
  --data-binary @data.csv

# 3. Seller confirms upload
curl -X POST https://api.easyescrow.ai/api/datasales/agreements/{id}/confirm-upload \
  -H "Content-Type: application/json" \
  -d '{
    "files": [{"key": "data.csv", "name": "data.csv", "size": 1024, "contentType": "text/csv", "sha256": "abc123"}]
  }'

# 4. Buyer builds deposit transaction
curl -X POST https://api.easyescrow.ai/api/datasales/agreements/{id}/deposit \
  -H "Content-Type: application/json" \
  -d '{"buyerWallet": "BuyerWallet..."}'

# 5. Buyer signs & submits tx, then confirms
curl -X POST https://api.easyescrow.ai/api/datasales/agreements/{id}/confirm-deposit \
  -H "Content-Type: application/json" \
  -d '{"buyerWallet": "BuyerWallet...", "txSignature": "tx-sig..."}'

# 6. DataSales verifies data quality
curl https://api.easyescrow.ai/api/datasales/agreements/{id}/files \
  -H "X-DataSales-API-Key: your-api-key"

# 7. DataSales approves
curl -X POST https://api.easyescrow.ai/api/datasales/agreements/{id}/approve \
  -H "X-DataSales-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"verifierAddress": "datasales-verifier"}'

# 8. DataSales triggers settlement
curl -X POST https://api.easyescrow.ai/api/datasales/agreements/{id}/settle \
  -H "X-DataSales-API-Key: your-api-key"

# 9. Buyer downloads files
curl "https://api.easyescrow.ai/api/datasales/agreements/{id}/download-urls?buyerWallet=BuyerWallet..."
```

---

## Scheduled Jobs

The system runs automated jobs:

| Job | Schedule | Purpose |
|-----|----------|---------|
| Timeout Handler | Every 5 minutes | Auto-cancel expired deposit windows |
| Access Expiry Handler | Every hour | Mark settled agreements as expired |
| Cleanup Handler | Daily at 3 AM | Archive old agreements, delete S3 buckets |

---

## Support

- **Email**: support@easyescrow.ai
- **Discord**: [Join our community](https://discord.gg/easyescrow)
- **Documentation**: https://docs.easyescrow.ai

---

**Last Updated:** January 2026
