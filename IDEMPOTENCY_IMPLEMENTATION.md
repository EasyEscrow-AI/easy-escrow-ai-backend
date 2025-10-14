# Idempotency Implementation - Task 40

## Overview

Implemented idempotency key support for critical endpoints to prevent double-processing of requests. This implementation ensures that duplicate requests with the same idempotency key will return the cached response instead of re-executing the operation.

## Components Implemented

### 1. Database Schema (`prisma/schema.prisma`)

Added `IdempotencyKey` model:
```prisma
model IdempotencyKey {
  id                String    @id @default(uuid())
  key               String    @unique
  endpoint          String
  requestHash       String    @map("request_hash")
  responseStatus    Int       @map("response_status")
  responseBody      Json      @map("response_body")
  createdAt         DateTime  @default(now()) @map("created_at")
  expiresAt         DateTime  @map("expires_at")
  
  @@index([key])
  @@index([endpoint])
  @@index([expiresAt])
  @@map("idempotency_keys")
}
```

### 2. Idempotency Service (`src/services/idempotency.service.ts`)

Core service that handles:
- **Key Validation**: Validates format of idempotency keys (minimum 16 characters, alphanumeric + hyphens/underscores)
- **Request Hashing**: Generates SHA-256 hash of request body for duplicate detection
- **Duplicate Detection**: Checks if a request with the same key has been processed
- **Response Caching**: Stores responses for successful and failed requests
- **Automatic Cleanup**: Periodically removes expired idempotency keys (configurable)

Key methods:
- `checkIdempotency(key, endpoint, body)`: Check if request is duplicate
- `storeIdempotency(key, endpoint, body, status, response)`: Store idempotency record
- `validateKeyFormat(key)`: Validate idempotency key format
- `generateRequestHash(body)`: Generate hash of request body

Configuration:
- `expirationHours`: How long to keep keys (default: 24 hours)
- `cleanupIntervalMinutes`: Cleanup frequency (default: 60 minutes)

### 3. Idempotency Middleware (`src/middleware/idempotency.middleware.ts`)

Express middleware that:
- Extracts idempotency key from `Idempotency-Key` header
- Validates key format
- Checks for duplicate requests
- Returns cached response for duplicates
- Intercepts response to cache it for future requests

Two variants:
- `requiredIdempotency`: Idempotency key is mandatory (400 error if missing)
- `optionalIdempotency`: Idempotency key is optional but validated if provided

### 4. Integration Points

#### Agreement Creation Endpoint
**Route**: `POST /v1/agreements`
**Middleware**: `requiredIdempotency` (idempotency key is required)

```typescript
router.post(
  '/v1/agreements',
  strictRateLimiter,
  requiredIdempotency,  // ← Added idempotency
  validateUSDCMintMiddleware,
  validateAgreementCreation,
  async (req: Request, res: Response): Promise<void> => {
    // ... handler
  }
);
```

#### Settlement Service
**Service**: `SettlementService.executeSettlement()`
**Implementation**: Automatic idempotency based on agreement ID

```typescript
// Generated idempotency key format: settlement_{agreementId}
const idempotencyKey = `settlement_${agreement.agreementId}`;

// Check before processing
const idempotencyCheck = await idempotencyService.checkIdempotency(
  idempotencyKey,
  'SETTLEMENT',
  { agreementId: agreement.agreementId, operation: 'settle' }
);

if (idempotencyCheck.isDuplicate) {
  // Return cached result or skip
}

// After successful settlement, store the result
await idempotencyService.storeIdempotency(
  idempotencyKey,
  'SETTLEMENT',
  requestBody,
  200,
  settlementResult
);
```

### 5. Service Initialization (`src/index.ts`)

Idempotency service is initialized at startup and included in health checks:

```typescript
const idempotencyService = getIdempotencyService({
  expirationHours: 24,
  cleanupIntervalMinutes: 60,
});

// Started with other services
await idempotencyService.start();

// Included in health check
idempotency: {
  status: idempotencyStatus.isRunning ? 'running' : 'stopped',
  expirationHours: idempotencyStatus.expirationHours,
  cleanupIntervalMinutes: idempotencyStatus.cleanupIntervalMinutes,
}

// Graceful shutdown
await idempotencyService.stop();
```

## Usage

### For Agreement Creation

Send requests with an `Idempotency-Key` header:

```bash
curl -X POST http://localhost:3000/v1/agreements \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-1234567890abcdef" \
  -d '{
    "nft_mint": "...",
    "price": 1000000,
    "seller": "...",
    "buyer": "...",
    "expiry": "2025-12-31T23:59:59Z",
    "fee_bps": 250,
    "honor_royalties": true
  }'
```

If the same request is sent again with the same idempotency key:
- **Same body**: Returns the cached response (no new agreement created)
- **Different body**: Returns 422 error (idempotency key mismatch)
- **Different endpoint**: Returns 422 error (idempotency key mismatch)

### Idempotency Key Requirements

- **Minimum length**: 16 characters
- **Allowed characters**: alphanumeric, hyphens (-), underscores (_)
- **Recommended format**: UUID v4 or similar random string

Examples:
✅ `550e8400-e29b-41d4-a716-446655440000` (UUID)
✅ `req-2025-10-14-abc123def456` (custom format)
✅ `user123_order456_retry1` (descriptive)
❌ `short` (too short)
❌ `key with spaces` (invalid characters)
❌ `key@special#chars` (invalid characters)

## Error Handling

### 400 Bad Request
- Missing required idempotency key
- Invalid key format (too short, invalid characters)

### 422 Unprocessable Entity
- Idempotency key used with different endpoint
- Idempotency key used with different request body

### 200 OK (Duplicate)
- Request with same key, endpoint, and body returns cached response
- Response includes original status code and body

## Testing

### Manual Testing

1. **Start the server**:
```bash
npm start
```

2. **Create first agreement**:
```bash
curl -X POST http://localhost:3000/v1/agreements \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-1234567890" \
  -d '{ "nft_mint": "...", "price": 1000000, ... }'
```

3. **Retry with same key** (should return cached response):
```bash
curl -X POST http://localhost:3000/v1/agreements \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-1234567890" \
  -d '{ "nft_mint": "...", "price": 1000000, ... }'
```

4. **Try with different body** (should return 422 error):
```bash
curl -X POST http://localhost:3000/v1/agreements \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-1234567890" \
  -d '{ "nft_mint": "different", "price": 2000000, ... }'
```

### Health Check

Check idempotency service status:
```bash
curl http://localhost:3000/health
```

Expected response includes:
```json
{
  "status": "healthy",
  "idempotency": {
    "status": "running",
    "expirationHours": 24,
    "cleanupIntervalMinutes": 60
  }
}
```

## Benefits

1. **Prevents Double-Processing**: Duplicate requests are safely handled without side effects
2. **Network Resilience**: Clients can safely retry failed requests without worry
3. **Automatic Cleanup**: Expired keys are automatically removed to prevent database bloat
4. **Flexible Configuration**: Expiration and cleanup intervals are configurable
5. **Transparent Integration**: Works seamlessly with existing endpoints via middleware

## Database Management

Idempotency keys are automatically cleaned up after expiration (default: 24 hours).

Manual cleanup (if needed):
```sql
DELETE FROM idempotency_keys WHERE expires_at < NOW();
```

Check stored keys:
```sql
SELECT * FROM idempotency_keys ORDER BY created_at DESC LIMIT 10;
```

## Future Enhancements

Potential improvements for future iterations:
1. Redis-based storage for faster lookups (current: PostgreSQL)
2. Configurable expiration per endpoint
3. Metrics and monitoring for idempotency hits/misses
4. Admin API to manually invalidate keys
5. Support for request replay protection
6. Distributed idempotency for multi-instance deployments

## Files Modified

### New Files
- `src/services/idempotency.service.ts` - Core idempotency service
- `src/middleware/idempotency.middleware.ts` - Express middleware
- `tests/unit/idempotency.test.ts` - Unit tests
- `IDEMPOTENCY_IMPLEMENTATION.md` - This documentation

### Modified Files
- `prisma/schema.prisma` - Added IdempotencyKey model
- `src/routes/agreement.routes.ts` - Added idempotency to POST /v1/agreements
- `src/services/settlement.service.ts` - Added idempotency to settlement execution
- `src/middleware/index.ts` - Export idempotency middleware
- `src/services/index.ts` - Export idempotency service
- `src/index.ts` - Initialize and integrate idempotency service

## Completion Status

✅ Subtask 40.1: Design Idempotency Key Schema and Storage
✅ Subtask 40.2: Implement Idempotency Key Validation Middleware
✅ Subtask 40.3: Implement Duplicate Request Detection Logic
✅ Subtask 40.4: Integrate Idempotency with Create Agreement Endpoint
✅ Subtask 40.5: Integrate Idempotency with Settlement Service

**Task 40 Status**: ✅ COMPLETED

