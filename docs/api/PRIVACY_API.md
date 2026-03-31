# Privacy API Reference

All endpoints require institution JWT authentication (`Authorization: Bearer <token>`).

**Privacy is enabled by default for all institutional operations.** Each institution account automatically receives a stealth meta-address on creation. Escrow releases use stealth addresses when available, falling back gracefully to standard addresses when no meta-address exists. No per-request opt-in is needed.

## Meta-Address Management

### POST /api/v1/privacy/meta-address

Generate and register a new stealth meta-address.

**Request:**
```json
{
  "label": "treasury-stealth"  // optional
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "scanPublicKey": "base58...",
    "spendPublicKey": "base58...",
    "label": "treasury-stealth"
  }
}
```

### GET /api/v1/privacy/meta-address/:clientId

Get all active meta-addresses for a client (own client ID only).

> **Note:** The path `:clientId` is validated against the authenticated JWT's `clientId`. Returns `403 Forbidden` if they do not match.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "scanPublicKey": "base58...",
      "spendPublicKey": "base58...",
      "label": "treasury-stealth",
      "viewingKeyShared": false,
      "createdAt": "2026-03-25T00:00:00.000Z"
    }
  ]
}
```

### DELETE /api/v1/privacy/meta-address/:id

Deactivate a meta-address (soft delete). Existing payments remain sweepable.

**Response (200):**
```json
{
  "success": true,
  "message": "Meta-address deactivated"
}
```

## Stealth Payments

### POST /api/v1/privacy/scan

Scan for incoming stealth payments.

**Request:**
```json
{
  "status": "CONFIRMED"  // optional filter: PENDING, CONFIRMED, SWEPT, FAILED
}
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "paymentId": "uuid",
      "stealthAddress": "base58...",
      "amount": "1000000",
      "status": "CONFIRMED",
      "createdAt": "2026-03-25T00:00:00.000Z"
    }
  ]
}
```

### POST /api/v1/privacy/sweep/:paymentId

Sweep funds from a stealth address to a destination wallet.

**Request:**
```json
{
  "destinationWallet": "base58..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "txSignature": "base58...",
    "destinationWallet": "base58...",
    "amount": "1000000"
  }
}
```

### GET /api/v1/privacy/payments

List stealth payments with pagination.

**Query Parameters:**
- `limit` (default: 20)
- `offset` (default: 0)
- `status` (optional): PENDING, CONFIRMED, SWEPT, FAILED

**Response (200):**
```json
{
  "success": true,
  "data": {
    "payments": [...],
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

### GET /api/v1/privacy/payments/:id

Get stealth payment details.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "metaAddressId": "uuid",
    "metaAddressLabel": "treasury-stealth",
    "stealthAddress": "base58...",
    "ephemeralPublicKey": "base58...",
    "escrowId": "uuid",
    "tokenMint": "base58...",
    "amount": "1000000",
    "status": "CONFIRMED",
    "releaseTxSignature": "base58...",
    "sweepTxSignature": null,
    "createdAt": "2026-03-25T00:00:00.000Z",
    "confirmedAt": "2026-03-25T00:01:00.000Z",
    "sweptAt": null
  }
}
```

## Escrow Release with Stealth

### POST /api/v1/institution-escrow/:id/release

**Default behavior:** STEALTH is used automatically when the recipient wallet has an associated meta-address. No extra fields needed — just release as normal. The system auto-looks up the meta-address by wallet. If the recipient has no meta-address, falls back to standard transfer.

**Optional overrides:**

```json
{
  "notes": "Release approved",
  "privacyLevel": "NONE",
  "useJito": false
}
```

## Error Codes

| HTTP | Error | When |
|------|-------|------|
| 400 | Validation Error | Missing required fields |
| 401 | Unauthorized | Missing/invalid JWT |
| 403 | Forbidden | Accessing another client's data |
| 404 | Not Found | Meta-address or payment not found |
| 503 | Service Unavailable | Privacy features disabled |

## Authentication

All endpoints require:
```
Authorization: Bearer <institution-jwt-token>
```

Sweep operations additionally validate that the caller owns the meta-address associated with the payment.
