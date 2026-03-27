# Transaction Pools API Reference

## Overview

The Transaction Pools API enables batching multiple funded institution escrows into a single pooled settlement operation. All endpoints are under `/api/v1/institution/pools` and require institution JWT authentication.

**Base URL:** `https://api.easyescrow.ai/api/v1/institution`

**Feature flag:** All endpoints return `404` unless `TRANSACTION_POOLS_ENABLED=true`.

## Authentication

All endpoints require a valid institution JWT in the `Authorization` header:

```text
Authorization: Bearer <jwt_token>
```

Settlement endpoints (`settle`, `retry`) additionally require the `X-Settlement-Authority` header:

```text
X-Settlement-Authority: <settlement_authority_api_key>
```

## Rate Limits

| Endpoint Group                                                          | Limit       | Window   |
| ----------------------------------------------------------------------- | ----------- | -------- |
| Standard (create, list, get, add, remove, lock, cancel, audit, receipt) | 30 requests | 1 minute |
| Settlement (settle, retry)                                              | 10 requests | 1 minute |

Rate limit headers are returned in responses:

- `RateLimit-Limit` — max requests per window
- `RateLimit-Remaining` — requests remaining
- `RateLimit-Reset` — seconds until window resets

## Common Response Format

All successful responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-03-26T12:00:00.000Z"
}
```

Error responses:

```json
{
  "error": "Error Category",
  "message": "Human-readable description",
  "timestamp": "2026-03-26T12:00:00.000Z"
}
```

Validation errors:

```json
{
  "error": "Validation Error",
  "details": [
    {
      "type": "field",
      "msg": "corridor must be in format XX-XX (e.g. SG-CH)",
      "path": "corridor",
      "location": "body"
    }
  ],
  "timestamp": "2026-03-26T12:00:00.000Z"
}
```

## Pool Identifier

The `:id` parameter in all pool endpoints accepts either:

- A UUID: `550e8400-e29b-41d4-a716-446655440000`
- A pool code: `TP-A3K-9MN`

## Endpoints

---

### 1. Create Pool

Create a new transaction pool.

**`POST /api/v1/institution/pools`**

**Request Body:**

| Field            | Type    | Required | Description                                               |
| ---------------- | ------- | -------- | --------------------------------------------------------- |
| `corridor`       | string  | No       | Payment corridor filter (e.g., `SG-CH`). Format: `XX-XX`. |
| `settlementMode` | string  | No       | `SEQUENTIAL` (default) or `PARALLEL`                      |
| `expiryHours`    | integer | No       | Hours until pool expires. Range: 1-168. Default: 24.      |

**Example:**

```bash
curl -X POST https://api.easyescrow.ai/api/v1/institution/pools \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "corridor": "SG-CH",
    "settlementMode": "SEQUENTIAL",
    "expiryHours": 48
  }'
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "poolCode": "TP-A3K-9MN",
    "clientId": "client-abc-123",
    "status": "OPEN",
    "statusLabel": "Open",
    "settlementMode": "SEQUENTIAL",
    "corridor": "SG-CH",
    "totalAmount": 0,
    "totalFees": 0,
    "memberCount": 0,
    "settledCount": 0,
    "failedCount": 0,
    "poolVaultPda": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "poolRiskScore": null,
    "compliancePassed": null,
    "settledBy": null,
    "settledAt": null,
    "lockedAt": null,
    "createdAt": "2026-03-26T12:00:00.000Z",
    "updatedAt": "2026-03-26T12:00:00.000Z",
    "expiresAt": "2026-03-28T12:00:00.000Z"
  },
  "timestamp": "2026-03-26T12:00:00.000Z"
}
```

**Errors:**

| Code | Message                                        |
| ---- | ---------------------------------------------- |
| 400  | Client not found                               |
| 400  | Client account is SUSPENDED. Must be ACTIVE.   |
| 400  | KYC status is PENDING. Must be VERIFIED.       |
| 400  | On-chain pool vault initialization failed: ... |

---

### 2. List Pools

List pools for the authenticated client with optional filters.

**`GET /api/v1/institution/pools`**

**Query Parameters:**

| Param      | Type    | Required | Description                                                                                      |
| ---------- | ------- | -------- | ------------------------------------------------------------------------------------------------ |
| `status`   | string  | No       | Filter by status: `OPEN`, `LOCKED`, `SETTLING`, `SETTLED`, `PARTIAL_FAIL`, `FAILED`, `CANCELLED` |
| `corridor` | string  | No       | Filter by corridor (e.g., `SG-CH`)                                                               |
| `limit`    | integer | No       | Results per page. Range: 1-100. Default: 20.                                                     |
| `offset`   | integer | No       | Pagination offset. Default: 0.                                                                   |

**Example:**

```bash
curl -X GET "https://api.easyescrow.ai/api/v1/institution/pools?status=OPEN&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "pools": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "poolCode": "TP-A3K-9MN",
        "clientId": "client-abc-123",
        "status": "OPEN",
        "statusLabel": "Open",
        "settlementMode": "SEQUENTIAL",
        "corridor": "SG-CH",
        "totalAmount": 5000,
        "totalFees": 2.5,
        "memberCount": 3,
        "settledCount": 0,
        "failedCount": 0,
        "members": [
          {
            "id": "member-uuid-1",
            "escrowId": "escrow-uuid-1",
            "status": "PENDING",
            "amount": 2000,
            "platformFee": 1.0,
            "corridor": "SG-CH",
            "sequenceNumber": 1,
            "addedAt": "2026-03-26T12:01:00.000Z"
          }
        ],
        "createdAt": "2026-03-26T12:00:00.000Z",
        "expiresAt": "2026-03-27T12:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  },
  "timestamp": "2026-03-26T12:00:00.000Z"
}
```

---

### 3. Get Pool Detail

Get a single pool with its members.

**`GET /api/v1/institution/pools/:id`**

**Example:**

```bash
curl -X GET https://api.easyescrow.ai/api/v1/institution/pools/TP-A3K-9MN \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**

Same structure as the pool object in list response, with full member details.

**Errors:**

| Code | Message                                       |
| ---- | --------------------------------------------- |
| 404  | Pool not found: TP-XXX-XXX                    |
| 403  | Access denied: pool belongs to another client |

---

### 4. Add Member

Add a funded escrow to the pool.

**`POST /api/v1/institution/pools/:id/add`**

**Request Body:**

| Field      | Type   | Required | Description                               |
| ---------- | ------ | -------- | ----------------------------------------- |
| `escrowId` | string | Yes      | Escrow UUID or escrow code (`EE-XXX-XXX`) |

**Example:**

```bash
curl -X POST https://api.easyescrow.ai/api/v1/institution/pools/TP-A3K-9MN/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"escrowId": "EE-7KMN-AB3D"}'
```

**Response (200):**

Returns the updated pool with members (same structure as get pool).

**Errors:**

| Code | Message                                                 |
| ---- | ------------------------------------------------------- |
| 400  | Cannot add member: pool status is LOCKED, expected OPEN |
| 400  | Pool has reached maximum member count (50)              |
| 400  | Escrow EE-XXX-XXX status is CREATED, expected FUNDED    |
| 400  | Escrow EE-XXX-XXX is already in pool ...                |
| 400  | Corridor mismatch: pool is SG-CH, escrow is US-MX       |
| 404  | Escrow not found: ...                                   |

---

### 5. Remove Member

Remove a member from an OPEN pool.

**`DELETE /api/v1/institution/pools/:id/members/:memberId`**

**Example:**

```bash
curl -X DELETE https://api.easyescrow.ai/api/v1/institution/pools/TP-A3K-9MN/members/member-uuid-1 \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**

Returns the updated pool with members.

**Errors:**

| Code | Message                                                    |
| ---- | ---------------------------------------------------------- |
| 400  | Cannot remove member: pool status is LOCKED, expected OPEN |
| 404  | Member member-uuid-1 not found in pool TP-A3K-9MN          |
| 400  | Member member-uuid-1 is already removed                    |

---

### 6. Lock Pool

Lock the pool to freeze membership and run an aggregate compliance check.

**`POST /api/v1/institution/pools/:id/lock`**

**Example:**

```bash
curl -X POST https://api.easyescrow.ai/api/v1/institution/pools/TP-A3K-9MN/lock \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "poolCode": "TP-A3K-9MN",
    "status": "LOCKED",
    "statusLabel": "Locked \u2014 Ready for Settlement",
    "poolRiskScore": 15,
    "compliancePassed": true,
    "lockedAt": "2026-03-26T14:00:00.000Z",
    "memberCount": 3,
    "totalAmount": 5000,
    "members": [...]
  },
  "timestamp": "2026-03-26T14:00:00.000Z"
}
```

**Errors:**

| Code | Message                                           |
| ---- | ------------------------------------------------- |
| 400  | Cannot lock: pool status is LOCKED, expected OPEN |
| 400  | Cannot lock: pool has no members                  |

---

### 7. Settle Pool

Settle all pool members. Requires settlement authority.

**`POST /api/v1/institution/pools/:id/settle`**

**Request Body:**

| Field   | Type   | Required | Description                           |
| ------- | ------ | -------- | ------------------------------------- |
| `notes` | string | No       | Settlement notes. Max 500 characters. |

**Example:**

```bash
curl -X POST https://api.easyescrow.ai/api/v1/institution/pools/TP-A3K-9MN/settle \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Settlement-Authority: $SETTLEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Monthly batch settlement"}'
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "poolId": "550e8400-e29b-41d4-a716-446655440000",
    "poolCode": "TP-A3K-9MN",
    "status": "SETTLED",
    "totalMembers": 3,
    "settledCount": 3,
    "failedCount": 0,
    "members": [
      {
        "memberId": "member-uuid-1",
        "escrowId": "escrow-uuid-1",
        "status": "SETTLED",
        "releaseTxSignature": "5KtH...abc",
        "receiptPda": "9WzD...xyz",
        "commitmentHash": "a1b2c3d4..."
      },
      {
        "memberId": "member-uuid-2",
        "escrowId": "escrow-uuid-2",
        "status": "SETTLED",
        "releaseTxSignature": "3Jkl...def",
        "receiptPda": "4Abc...uvw",
        "commitmentHash": "e5f6a7b8..."
      },
      {
        "memberId": "member-uuid-3",
        "escrowId": "escrow-uuid-3",
        "status": "SETTLED",
        "releaseTxSignature": "8Mno...ghi",
        "receiptPda": "2Def...rst",
        "commitmentHash": "c9d0e1f2..."
      }
    ],
    "settledAt": "2026-03-26T14:05:00.000Z"
  },
  "timestamp": "2026-03-26T14:05:00.000Z"
}
```

**Partial Failure Response (200):**

```json
{
  "success": true,
  "data": {
    "poolId": "550e8400-e29b-41d4-a716-446655440000",
    "poolCode": "TP-A3K-9MN",
    "status": "PARTIAL_FAIL",
    "totalMembers": 3,
    "settledCount": 2,
    "failedCount": 1,
    "members": [
      {
        "memberId": "member-uuid-1",
        "escrowId": "escrow-uuid-1",
        "status": "SETTLED",
        "releaseTxSignature": "5KtH...abc"
      },
      {
        "memberId": "member-uuid-2",
        "escrowId": "escrow-uuid-2",
        "status": "FAILED",
        "errorMessage": "Insufficient vault balance"
      },
      {
        "memberId": "member-uuid-3",
        "escrowId": "escrow-uuid-3",
        "status": "SETTLED",
        "releaseTxSignature": "8Mno...ghi"
      }
    ]
  },
  "timestamp": "2026-03-26T14:05:00.000Z"
}
```

**Errors:**

| Code | Message                                             |
| ---- | --------------------------------------------------- |
| 400  | Cannot settle: pool status is OPEN, expected LOCKED |
| 400  | Cannot settle: pool compliance check did not pass   |

---

### 8. Retry Failed Members

Retry settlement for FAILED members only.

**`POST /api/v1/institution/pools/:id/retry`**

**Example:**

```bash
curl -X POST https://api.easyescrow.ai/api/v1/institution/pools/TP-A3K-9MN/retry \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Settlement-Authority: $SETTLEMENT_KEY"
```

**Response (200):**

Same structure as settle response, showing retry results.

**Errors:**

| Code | Message                                                               |
| ---- | --------------------------------------------------------------------- |
| 400  | Cannot retry: pool status is SETTLED, expected PARTIAL_FAIL or FAILED |
| 400  | No failed members to retry                                            |

---

### 9. Cancel Pool

Cancel a pool and refund all members.

**`POST /api/v1/institution/pools/:id/cancel`**

**Request Body:**

| Field    | Type   | Required | Description                              |
| -------- | ------ | -------- | ---------------------------------------- |
| `reason` | string | No       | Cancellation reason. Max 500 characters. |

**Example:**

```bash
curl -X POST https://api.easyescrow.ai/api/v1/institution/pools/TP-A3K-9MN/cancel \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Client requested cancellation"}'
```

**Response (200):**

Returns the cancelled pool object.

**Errors:**

| Code | Message                               |
| ---- | ------------------------------------- |
| 400  | Cannot cancel: pool status is SETTLED |

---

### 10. Get Audit Log

Get the paginated audit trail for a pool.

**`GET /api/v1/institution/pools/:id/audit`**

**Query Parameters:**

| Param    | Type    | Required | Description                                  |
| -------- | ------- | -------- | -------------------------------------------- |
| `limit`  | integer | No       | Results per page. Range: 1-100. Default: 20. |
| `offset` | integer | No       | Pagination offset. Default: 0.               |

**Example:**

```bash
curl -X GET "https://api.easyescrow.ai/api/v1/institution/pools/TP-A3K-9MN/audit?limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log-uuid-1",
        "poolId": "550e8400-e29b-41d4-a716-446655440000",
        "escrowId": null,
        "action": "POOL_CREATED",
        "actor": "admin@example.com",
        "details": {
          "corridor": "SG-CH",
          "settlementMode": "SEQUENTIAL",
          "expiryHours": 48,
          "message": "Pool TP-A3K-9MN created"
        },
        "createdAt": "2026-03-26T12:00:00.000Z"
      },
      {
        "id": "log-uuid-2",
        "poolId": "550e8400-e29b-41d4-a716-446655440000",
        "escrowId": "escrow-uuid-1",
        "action": "MEMBER_ADDED",
        "actor": "admin@example.com",
        "details": {
          "memberId": "member-uuid-1",
          "escrowCode": "EE-7KMN-AB3D",
          "amount": 2000,
          "message": "Escrow EE-7KMN-AB3D added to pool"
        },
        "createdAt": "2026-03-26T12:01:00.000Z"
      }
    ],
    "total": 2,
    "limit": 5,
    "offset": 0
  },
  "timestamp": "2026-03-26T12:00:00.000Z"
}
```

---

### 11. Decrypt Receipt

Decrypt the on-chain encrypted receipt for a settled pool member.

**`GET /api/v1/institution/pools/:id/receipt/:escrowId`**

The `:escrowId` parameter accepts either a UUID or escrow code (`EE-XXX-XXX`).

**Example:**

```bash
curl -X GET https://api.easyescrow.ai/api/v1/institution/pools/TP-A3K-9MN/receipt/EE-7KMN-AB3D \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "poolId": "550e8400-e29b-41d4-a716-446655440000",
    "poolCode": "TP-A3K-9MN",
    "escrowId": "escrow-uuid-1",
    "escrowCode": "EE-7KMN-AB3D",
    "amount": "2000.000000",
    "corridor": "SG-CH",
    "payerWallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "recipientWallet": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "releaseTxSignature": "5KtH...abc",
    "settledAt": "2026-03-26T14:05:00.000Z"
  },
  "timestamp": "2026-03-26T14:05:00.000Z"
}
```

**Errors:**

| Code | Message                                               |
| ---- | ----------------------------------------------------- |
| 404  | Escrow escrow-uuid is not a member of pool TP-XXX-XXX |
| 400  | Member has not been settled yet (status: PENDING)     |
| 400  | Pool vault program service not available              |
| 400  | On-chain receipt not found                            |

---

## Error Codes Summary

### HTTP Status Codes

| Code | Usage                                             |
| ---- | ------------------------------------------------- |
| 200  | Successful operation                              |
| 201  | Pool created                                      |
| 400  | Validation error, business logic error            |
| 403  | Access denied (pool belongs to another client)    |
| 404  | Pool/escrow/member not found; or feature disabled |
| 429  | Rate limit exceeded                               |
| 500  | Internal server error                             |

### Common Business Logic Errors

| Error                                        | Cause                            | Resolution                                  |
| -------------------------------------------- | -------------------------------- | ------------------------------------------- |
| Client not found                             | Invalid JWT or client deleted    | Re-authenticate                             |
| Client account is SUSPENDED                  | Client status not ACTIVE         | Contact support                             |
| KYC status is PENDING                        | Client KYC not completed         | Complete KYC verification                   |
| Cannot add member: pool status is LOCKED     | Pool already locked              | Create a new pool                           |
| Pool has reached maximum member count        | 50-member limit                  | Create additional pools                     |
| Escrow status is CREATED, expected FUNDED    | Escrow not funded yet            | Record deposit first                        |
| Escrow is already in pool                    | Escrow already pooled            | Remove from other pool first                |
| Corridor mismatch                            | Pool and escrow corridors differ | Use matching corridor or remove restriction |
| Cannot lock: pool has no members             | Empty pool                       | Add at least one member                     |
| Cannot settle: compliance check did not pass | High aggregate risk score        | Review flagged members                      |
| Cannot cancel: pool status is SETTLED        | Already settled                  | Cannot undo settlement                      |

### Validation Errors

| Field            | Rule                                               |
| ---------------- | -------------------------------------------------- |
| `corridor`       | Must match `XX-XX` format (e.g., `SG-CH`)          |
| `settlementMode` | Must be `SEQUENTIAL` or `PARALLEL`                 |
| `expiryHours`    | Integer between 1 and 168                          |
| `escrowId`       | Must be a valid UUID or escrow code (`EE-XXX-XXX`) |
| `memberId`       | Must be a valid UUID                               |
| `notes`          | Max 500 characters                                 |
| `reason`         | Max 500 characters                                 |
| `limit`          | Integer between 1 and 100                          |
| `offset`         | Non-negative integer                               |
| `:id` (pool)     | Must be a valid UUID or pool code (`TP-XXX-XXX`)   |

## Pool Code Format

Pool codes follow the pattern `TP-XXX-XXX` where `X` is an uppercase alphanumeric character from the set `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (30 characters, excluding ambiguous 0/O/1/I/L).

Examples: `TP-A3K-9MN`, `TP-7FH-B2P`, `TP-XQ5-NJR`

## Escrow Code Format

Escrow codes follow the pattern `EE-XXXX-XXXX` (accepted wherever `escrowId` is required).

Examples: `EE-7KMN-AB3D`, `EE-9FHP-QR2T`
