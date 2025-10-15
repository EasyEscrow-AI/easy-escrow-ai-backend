# EasyEscrow.ai API Documentation

## Base URL
```
http://localhost:3000
```

## Agreements API

### Create Agreement

Creates a new escrow agreement on the Solana blockchain.

**Endpoint:** `POST /v1/agreements`

**Request Body:**
```json
{
  "nft_mint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "price": 100.50,
  "seller": "SellerPublicKey11111111111111111111111111111",
  "buyer": "BuyerPublicKey111111111111111111111111111111",
  "expiry": "2025-12-31T23:59:59Z",
  "fee_bps": 250,
  "honor_royalties": true
}
```

**Parameters:**
- `nft_mint` (string, required): The NFT mint address
- `price` (number, required): The price in USDC (positive number)
- `seller` (string, required): The seller's Solana wallet address
- `buyer` (string, optional): The buyer's Solana wallet address (if specified, only this buyer can purchase)
- `expiry` (string, required): ISO 8601 datetime when the agreement expires
- `fee_bps` (number, required): Platform fee in basis points (0-10000, where 250 = 2.5%)
- `honor_royalties` (boolean, required): Whether to honor creator royalties

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "agreementId": "AGR-L3K5J9-8H2F4G1D",
    "escrowPda": "EscrowPDA111111111111111111111111111111111",
    "depositAddresses": {
      "usdc": "USDCDepositAddress111111111111111111111111",
      "nft": "NFTDepositAddress1111111111111111111111111"
    },
    "expiry": "2025-12-31T23:59:59.000Z",
    "transactionId": "mock_tx_1234567890_abc123"
  },
  "timestamp": "2025-10-13T10:30:00.000Z"
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Validation Error",
  "message": "Invalid request data",
  "details": [
    {
      "field": "nft_mint",
      "message": "Invalid NFT mint address"
    }
  ],
  "timestamp": "2025-10-13T10:30:00.000Z"
}
```

---

### Get Agreement by ID

Retrieves details of a specific agreement.

**Endpoint:** `GET /v1/agreements/:agreementId`

**Parameters:**
- `agreementId` (string, required): The unique agreement ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "agreementId": "AGR-L3K5J9-8H2F4G1D",
    "nftMint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "price": "100.5",
    "seller": "SellerPublicKey11111111111111111111111111111",
    "buyer": "BuyerPublicKey111111111111111111111111111111",
    "status": "PENDING",
    "expiry": "2025-12-31T23:59:59.000Z",
    "feeBps": 250,
    "honorRoyalties": true,
    "escrowPda": "EscrowPDA111111111111111111111111111111111",
    "usdcDepositAddr": "USDCDepositAddress111111111111111111111111",
    "nftDepositAddr": "NFTDepositAddress1111111111111111111111111",
    "createdAt": "2025-10-13T10:30:00.000Z",
    "updatedAt": "2025-10-13T10:30:00.000Z"
  },
  "timestamp": "2025-10-13T10:35:00.000Z"
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "error": "Not Found",
  "message": "Agreement not found",
  "timestamp": "2025-10-13T10:35:00.000Z"
}
```

---

### List Agreements

Retrieves a list of agreements with optional filters.

**Endpoint:** `GET /v1/agreements`

**Query Parameters:**
- `status` (string, optional): Filter by status (PENDING, FUNDED, USDC_LOCKED, NFT_LOCKED, BOTH_LOCKED, SETTLED, EXPIRED, CANCELLED, REFUNDED)
- `seller` (string, optional): Filter by seller address
- `buyer` (string, optional): Filter by buyer address
- `nft_mint` (string, optional): Filter by NFT mint address
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20)

**Example Request:**
```
GET /v1/agreements?status=PENDING&seller=SellerPublicKey11111111111111111111111111111&page=1&limit=10
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "agreementId": "AGR-L3K5J9-8H2F4G1D",
      "nftMint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "price": "100.5",
      "seller": "SellerPublicKey11111111111111111111111111111",
      "buyer": "BuyerPublicKey111111111111111111111111111111",
      "status": "PENDING",
      "expiry": "2025-12-31T23:59:59.000Z",
      "feeBps": 250,
      "honorRoyalties": true,
      "escrowPda": "EscrowPDA111111111111111111111111111111111",
      "usdcDepositAddr": "USDCDepositAddress111111111111111111111111",
      "nftDepositAddr": "NFTDepositAddress1111111111111111111111111",
      "createdAt": "2025-10-13T10:30:00.000Z",
      "updatedAt": "2025-10-13T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "pages": 1
  },
  "timestamp": "2025-10-13T10:40:00.000Z"
}
```

---

## Agreement Status Values

- `PENDING`: Agreement created, waiting for deposits
- `FUNDED`: Initial funding received
- `USDC_LOCKED`: USDC has been deposited
- `NFT_LOCKED`: NFT has been deposited
- `BOTH_LOCKED`: Both USDC and NFT are locked in escrow
- `SETTLED`: Agreement successfully completed
- `EXPIRED`: Agreement expired before completion
- `CANCELLED`: Agreement cancelled
- `REFUNDED`: Funds refunded to participants

---

## Error Codes

| Status Code | Description |
|------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Testing the API

### Using cURL

**Create Agreement:**
```bash
curl -X POST http://localhost:3000/v1/agreements \
  -H "Content-Type: application/json" \
  -d '{
    "nft_mint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "price": 100.50,
    "seller": "SellerPublicKey11111111111111111111111111111",
    "buyer": "BuyerPublicKey111111111111111111111111111111",
    "expiry": "2025-12-31T23:59:59Z",
    "fee_bps": 250,
    "honor_royalties": true
  }'
```

**Get Agreement:**
```bash
curl http://localhost:3000/v1/agreements/AGR-L3K5J9-8H2F4G1D
```

**List Agreements:**
```bash
curl "http://localhost:3000/v1/agreements?status=PENDING&page=1&limit=10"
```

### Using PowerShell

**Create Agreement:**
```powershell
$body = @{
  nft_mint = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  price = 100.50
  seller = "SellerPublicKey11111111111111111111111111111"
  buyer = "BuyerPublicKey111111111111111111111111111111"
  expiry = "2025-12-31T23:59:59Z"
  fee_bps = 250
  honor_royalties = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

**Get Agreement:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements/AGR-L3K5J9-8H2F4G1D"
```

**List Agreements:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/v1/agreements?status=PENDING&page=1&limit=10"
```

---

## Notes

### Current Implementation

- ✅ Agreement creation API endpoint
- ✅ Request validation and error handling
- ✅ Database storage with PostgreSQL
- ✅ Escrow PDA derivation (mock implementation)
- ✅ Deposit monitoring service (Task 25 completed)
- ✅ Automatic monitoring of USDC and NFT deposits
- ✅ Health checks and metrics for monitoring service
- ⏳ Actual on-chain program integration (pending Task 22 completion)

### Next Steps

1. Complete Task 22 (Deploy Solana Program)
2. Update `initializeEscrow` function to call actual on-chain program
3. Implement settlement API (Task 26)
4. Add webhook notifications

---

## Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-13T10:45:00.000Z",
  "service": "easy-escrow-ai-backend",
  "database": "connected",
  "monitoring": {
    "status": "running",
    "monitoredAccounts": 5,
    "uptime": "120 minutes",
    "restartCount": 0,
    "solanaHealthy": true
  }
}
```

**Response Fields:**
- `status`: Overall system health (healthy/unhealthy)
- `database`: Database connection status
- `monitoring.status`: Monitoring service status (running/stopped)
- `monitoring.monitoredAccounts`: Number of accounts currently being monitored for deposits
- `monitoring.uptime`: How long the monitoring service has been running
- `monitoring.restartCount`: Number of times the monitoring service has restarted
- `monitoring.solanaHealthy`: Solana connection health status

