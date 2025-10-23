# Manual Trigger API Endpoints

This document describes administrative API endpoints that allow manual triggering of background processes for testing, debugging, or immediate action scenarios.

## Overview

These endpoints are useful when you need to:
- **Test expiry/refund flows** without waiting for automatic timers
- **Debug issues** by forcing immediate checks
- **Recover from errors** by manually triggering processes
- **E2E testing** with deterministic timing

## Base URL

- **Staging:** `https://staging-api.easyescrow.ai/api/expiry-cancellation`
- **Production:** `https://api.easyescrow.ai/api/expiry-cancellation` (future)
- **Local:** `http://localhost:3000/api/expiry-cancellation`

---

## Expiry Management

### Manually Trigger Expiry Check

Immediately checks for expired agreements and marks them as `EXPIRED`.

**Endpoint:** `POST /api/expiry-cancellation/check-expired`

**Use Case:** Force immediate expiry detection instead of waiting for automatic 60-second check.

**Request:**
```bash
curl -X POST https://staging-api.easyescrow.ai/api/expiry-cancellation/check-expired
```

**Response:**
```json
{
  "success": true,
  "result": {
    "checkedCount": 1,
    "expiredCount": 1,
    "expiredAgreementIds": ["AGR-MH42JDI8-RY98DG3D"],
    "errorCount": 0
  }
}
```

**Fields:**
- `checkedCount`: Number of expired agreements found
- `expiredCount`: Number successfully marked as EXPIRED
- `expiredAgreementIds`: Array of agreement IDs that were expired
- `errorCount`: Number of errors encountered

**When to Use:**
- After an agreement's expiry time has passed
- In E2E tests to avoid waiting for automatic checks
- When debugging expiry detection issues
- To force immediate status updates

---

### Get Expiring Soon Agreements

Returns agreements that will expire within a specified time window.

**Endpoint:** `GET /api/expiry-cancellation/expiring-soon?withinMinutes={minutes}`

**Parameters:**
- `withinMinutes` (optional): Time window in minutes (default: 60, max: 1440)

**Request:**
```bash
curl https://staging-api.easyescrow.ai/api/expiry-cancellation/expiring-soon?withinMinutes=30
```

**Response:**
```json
{
  "success": true,
  "agreements": [
    {
      "agreementId": "AGR-XXX",
      "expiry": "2025-10-23T23:59:00.000Z",
      "status": "BOTH_LOCKED",
      "seller": "...",
      "buyer": "..."
    }
  ],
  "count": 1,
  "withinMinutes": 30
}
```

---

## Refund Management

### Check Refund Eligibility

Checks if an agreement is eligible for refunds.

**Endpoint:** `GET /api/expiry-cancellation/refund/eligibility/{agreementId}`

**Request:**
```bash
curl https://staging-api.easyescrow.ai/api/expiry-cancellation/refund/eligibility/AGR-MH42JDI8-RY98DG3D
```

**Response:**
```json
{
  "success": true,
  "eligibility": {
    "eligible": true,
    "hasDeposits": true,
    "agreementStatus": "EXPIRED"
  }
}
```

**Eligibility Criteria:**
- Agreement status is `EXPIRED`, `CANCELLED`, or partially locked
- Has at least one confirmed deposit
- Not already `SETTLED` or `REFUNDED`

---

### Calculate Refunds

Calculates what refunds would be processed for an agreement.

**Endpoint:** `GET /api/expiry-cancellation/refund/calculate/{agreementId}`

**Request:**
```bash
curl https://staging-api.easyescrow.ai/api/expiry-cancellation/refund/calculate/AGR-MH42JDI8-RY98DG3D
```

**Response:**
```json
{
  "success": true,
  "calculation": {
    "agreementId": "AGR-MH42JDI8-RY98DG3D",
    "refunds": [
      {
        "depositor": "8fwE87uYGfTxxQuRAKNjJExZmVPwPY8Avqca3oM8QiuT",
        "type": "NFT",
        "tokenAccount": "CsLwg5kzcib4ys72iXJCwFVP2UUJW2LtASAMR3JfLGcf"
      }
    ],
    "totalUsdcRefund": "0",
    "nftRefundCount": 1,
    "eligible": true
  }
}
```

---

### Process Refunds

Manually triggers refund processing for an agreement.

**Endpoint:** `POST /api/expiry-cancellation/refund/process/{agreementId}`

**Use Case:** Force immediate refund processing instead of waiting for automatic 5-minute check.

**Request:**
```bash
curl -X POST https://staging-api.easyescrow.ai/api/expiry-cancellation/refund/process/AGR-MH42JDI8-RY98DG3D
```

**Response:**
```json
{
  "success": true,
  "result": {
    "agreementId": "AGR-MH42JDI8-RY98DG3D",
    "success": true,
    "transactionIds": ["refund_NFT_1761262841920_f9glf"],
    "refundedDeposits": [
      {
        "depositId": "8831f880-197c-4845-86ae-ce8f51738864",
        "depositor": "8fwE87uYGfTxxQuRAKNjJExZmVPwPY8Avqca3oM8QiuT",
        "type": "NFT",
        "txId": "refund_NFT_1761262841920_f9glf"
      }
    ],
    "errors": []
  }
}
```

**When to Use:**
- After agreement status changes to EXPIRED
- In E2E tests to verify refund logic
- When debugging refund processing issues
- To force immediate refund execution

**Note:** Currently creates refund records in the database. On-chain execution may be asynchronous or require separate admin action.

---

## Status Management

### Update Agreement Status

Manually triggers status recalculation for an agreement.

**Endpoint:** `POST /api/expiry-cancellation/status/update/{agreementId}`

**Request:**
```bash
curl -X POST https://staging-api.easyescrow.ai/api/expiry-cancellation/status/update/AGR-MH42JDI8-RY98DG3D
```

**Response:**
```json
{
  "success": true,
  "result": {
    "agreementId": "AGR-MH42JDI8-RY98DG3D",
    "fromStatus": "NFT_LOCKED",
    "toStatus": "EXPIRED",
    "timestamp": "2025-10-23T23:29:50.031Z"
  }
}
```

---

### Process Expiry (Combined)

Processes both expiry detection and refund handling in one call.

**Endpoint:** `POST /api/expiry-cancellation/process-expiry/{agreementId}`

**Use Case:** One-step expiry and refund processing.

**Request:**
```bash
curl -X POST https://staging-api.easyescrow.ai/api/expiry-cancellation/process-expiry/AGR-MH42JDI8-RY98DG3D
```

**Response:**
```json
{
  "success": true,
  "result": {
    "expired": true,
    "refunded": true,
    "errors": []
  }
}
```

---

## Monitoring & Status

### Get Orchestrator Status

Returns overall status of expiry/refund orchestrator.

**Endpoint:** `GET /api/expiry-cancellation/status`

**Request:**
```bash
curl https://staging-api.easyescrow.ai/api/expiry-cancellation/status
```

**Response:**
```json
{
  "success": true,
  "status": {
    "running": true,
    "expiryService": {
      "running": true,
      "lastCheck": "2025-10-23T23:29:50.000Z"
    },
    "statistics": {
      "totalExpiredAgreements": 15,
      "totalRefundedAgreements": 12,
      "totalCancelledAgreements": 3,
      "pendingRefunds": 2
    },
    "errors": []
  }
}
```

---

### Health Check

Checks health of expiry/refund services.

**Endpoint:** `GET /api/expiry-cancellation/health`

**Request:**
```bash
curl https://staging-api.easyescrow.ai/api/expiry-cancellation/health
```

**Response:**
```json
{
  "success": true,
  "health": {
    "healthy": true,
    "services": {
      "expiry": true,
      "refund": true,
      "cancellation": true,
      "statusUpdate": true
    },
    "recentErrors": 0
  }
}
```

---

### Get Recent Errors

Returns recent errors from orchestrator services.

**Endpoint:** `GET /api/expiry-cancellation/errors?limit={limit}`

**Parameters:**
- `limit` (optional): Number of errors to return (default: 10, max: 100)

**Request:**
```bash
curl https://staging-api.easyescrow.ai/api/expiry-cancellation/errors?limit=5
```

**Response:**
```json
{
  "success": true,
  "errors": [
    {
      "timestamp": "2025-10-23T23:00:00.000Z",
      "service": "refund",
      "error": "Failed to process refund for AGR-XXX"
    }
  ],
  "count": 1
}
```

---

## Automatic Check Intervals

For reference, here are the automatic check intervals:

| Service | Interval | Configurable |
|---------|----------|--------------|
| **ExpiryService** | 60 seconds | Yes (planned: 30s for production) |
| **RefundOrchestrator** | 5 minutes (300s) | Yes |
| **SettlementService** | 15 seconds | Yes |

---

## E2E Testing Pattern

**Recommended pattern for E2E tests:**

```typescript
// 1. Create agreement with short expiry
const agreement = await createAgreement({ expiry: 15 seconds });

// 2. Make deposits
await depositNFT(agreement.agreementId);

// 3. Wait for expiry
await sleep(15000);

// 4. Manually trigger expiry check (don't wait for 60s)
await axios.post(`/api/expiry-cancellation/check-expired`);

// 5. Verify status changed to EXPIRED
const status = await getAgreement(agreement.agreementId);
expect(status).toBe('EXPIRED');

// 6. Manually trigger refund (don't wait for 5min)
await axios.post(`/api/expiry-cancellation/refund/process/${agreement.agreementId}`);

// 7. Verify refund processed
const refunds = await getRefunds(agreement.agreementId);
expect(refunds.length).toBeGreaterThan(0);
```

---

## Security Considerations

**Access Control (TODO):**
- These endpoints should be protected with admin authentication
- Rate limiting should be applied
- Audit logging for all manual triggers

**Current Status:**
- Endpoints are currently public (staging only)
- Production deployment should include authentication

---

## Related Documentation

- [Expiry Service Architecture](../architecture/EXPIRY_SERVICE.md)
- [Refund Service Architecture](../architecture/REFUND_SERVICE.md)
- [E2E Testing Guide](../testing/E2E_TESTING.md)
- [API Documentation](./API_DOCUMENTATION.md)

---

## Changelog

### 2025-10-23
- Initial documentation
- Added expiry and refund manual trigger endpoints
- Added monitoring and status endpoints
- Added E2E testing pattern examples

