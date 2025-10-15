# API Error Codes and Response Formats

## Overview

This document describes all error codes, response formats, and troubleshooting guidance for the EasyEscrow.ai API.

## Standard Error Response Format

All API errors follow a consistent JSON response format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error message",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `false` for errors |
| `error` | string | High-level error category (e.g., "Bad Request", "Not Found") |
| `message` | string | Detailed human-readable error message |
| `timestamp` | string | ISO 8601 timestamp when the error occurred |

---

## HTTP Status Codes

### 2xx Success

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully (e.g., new agreement) |

### 4xx Client Errors

| Code | Status | Description |
|------|--------|-------------|
| 400 | Bad Request | Invalid request data or business logic violation |
| 401 | Unauthorized | Invalid or missing authentication (future feature) |
| 404 | Not Found | Requested resource does not exist |
| 409 | Conflict | Idempotency key conflict or duplicate resource |
| 422 | Unprocessable Entity | Validation errors in request body |
| 429 | Too Many Requests | Rate limit exceeded |

### 5xx Server Errors

| Code | Status | Description |
|------|--------|-------------|
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Service temporarily unavailable (e.g., during maintenance) |

---

## Error Categories

### 1. Validation Errors (400, 422)

Occur when request data fails validation rules.

#### Common Validation Errors

**Invalid Wallet Address**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Invalid seller wallet address format",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Missing Required Field**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "nftMint is required",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Invalid Price**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Price must be a positive number",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Invalid Date Format**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Expiry must be a valid ISO 8601 date string",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Expiry in the Past**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Expiry date must be in the future",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Invalid Fee Basis Points**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "feeBps must be between 0 and 10000 (0% to 100%)",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Invalid USDC Mint Address**
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Invalid USDC mint address. Must use mainnet USDC or devnet USDC.",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### 2. Not Found Errors (404)

Occur when requested resources don't exist.

**Agreement Not Found**
```json
{
  "success": false,
  "error": "Not Found",
  "message": "Agreement not found",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Receipt Not Found**
```json
{
  "success": false,
  "error": "Not Found",
  "message": "Receipt not found",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Transaction Not Found**
```json
{
  "success": false,
  "error": "Not Found",
  "message": "No transaction log found for txId: 5KqZ9Z...",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Webhook Not Found**
```json
{
  "success": false,
  "error": "Not Found",
  "message": "Webhook not found",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### 3. Business Logic Errors (400)

Occur when operations violate business rules.

**Agreement Already Settled**
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Cannot cancel a settled agreement",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Agreement Not Expired**
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Agreement has not expired yet. Expiry date: 2024-12-31T23:59:59Z",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Agreement Already Cancelled**
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Agreement is already cancelled",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Agreement Already Refunded**
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Agreement is already refunded",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### 4. Idempotency Errors (409)

Occur when idempotency key conflicts are detected.

**Idempotency Key Required**
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "X-Idempotency-Key header is required for this endpoint",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Idempotency Key Conflict**
```json
{
  "success": false,
  "error": "Conflict",
  "message": "Idempotency key has been used with different request data",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### 5. Rate Limit Errors (429)

Occur when API rate limits are exceeded.

**Rate Limit Exceeded**
```json
{
  "success": false,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 900 seconds.",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705318200
Retry-After: 900
```

---

### 6. Blockchain Errors (500)

Occur when blockchain operations fail.

**Transaction Failed**
```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "Failed to initialize escrow on blockchain: Transaction simulation failed",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Insufficient Funds**
```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "Insufficient SOL balance for transaction fees",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Network Error**
```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "Failed to connect to Solana RPC endpoint",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### 7. Database Errors (500, 503)

Occur when database operations fail.

**Database Connection Error**
```json
{
  "success": false,
  "error": "Service Unavailable",
  "message": "Database connection failed",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Query Timeout**
```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "Database query timeout",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Error Handling Best Practices

### 1. Check HTTP Status Code

Always check the HTTP status code first to determine the error category:

```typescript
try {
  const response = await fetch('https://api.easyescrow.ai/v1/agreements', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': generateIdempotencyKey(),
    },
    body: JSON.stringify(agreementData),
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error(`Error ${response.status}:`, error.message);
    
    // Handle specific error types
    switch (response.status) {
      case 400:
        // Validation or business logic error
        showValidationError(error.message);
        break;
      case 404:
        // Resource not found
        showNotFoundError();
        break;
      case 429:
        // Rate limit exceeded
        const retryAfter = response.headers.get('Retry-After');
        scheduleRetry(parseInt(retryAfter || '60'));
        break;
      case 500:
        // Server error - retry with exponential backoff
        retryWithBackoff(requestOptions);
        break;
      default:
        // Generic error
        showGenericError(error.message);
    }
    
    return;
  }
  
  const result = await response.json();
  console.log('Success:', result);
  
} catch (error) {
  console.error('Network error:', error);
  showNetworkError();
}
```

### 2. Implement Retry Logic

For transient errors (5xx), implement exponential backoff:

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on 4xx errors (client errors)
      if (error instanceof Response && error.status < 500) {
        throw error;
      }
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

// Usage
const agreement = await retryWithBackoff(() =>
  createAgreement(agreementData)
);
```

### 3. Handle Rate Limits Gracefully

Respect rate limit headers and implement backoff:

```typescript
async function makeRequest(url: string, options: RequestInit): Promise<Response> {
  const response = await fetch(url, options);
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
    
    console.log(`Rate limited. Retrying after ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return makeRequest(url, options);
  }
  
  return response;
}
```

### 4. Log All Errors

Implement comprehensive error logging:

```typescript
function logError(error: any, context: Record<string, any> = {}): void {
  const errorLog = {
    timestamp: new Date().toISOString(),
    message: error.message,
    status: error.status,
    context,
    stack: error.stack,
  };
  
  // Log to your logging service
  console.error('API Error:', JSON.stringify(errorLog, null, 2));
  
  // Send to error tracking service (e.g., Sentry, Datadog)
  errorTracker.captureException(error, { extra: context });
}
```

### 5. Provide User-Friendly Messages

Don't expose raw error messages to end users:

```typescript
function getUserFriendlyMessage(error: any): string {
  if (error.status === 429) {
    return 'Too many requests. Please try again in a few minutes.';
  }
  
  if (error.status === 404) {
    return 'The requested resource was not found.';
  }
  
  if (error.status >= 500) {
    return 'Service temporarily unavailable. Please try again later.';
  }
  
  if (error.message.includes('validation')) {
    return 'Please check your input and try again.';
  }
  
  return 'An unexpected error occurred. Please contact support.';
}
```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue: "Invalid USDC mint address"

**Cause**: Using wrong USDC mint for the network

**Solution**:
- Mainnet: Use `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Devnet: Use `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

#### Issue: "Expiry date must be in the future"

**Cause**: Expiry date is not properly set or is in the past

**Solution**:
```typescript
// Correct: Set expiry to 24 hours from now
const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
```

#### Issue: "Rate limit exceeded"

**Cause**: Too many requests in short time period

**Solution**:
- Implement request throttling
- Add delays between requests
- Use exponential backoff
- Cache responses when possible

#### Issue: "Agreement not found"

**Cause**: Using wrong agreement ID or agreement was deleted

**Solution**:
- Verify the agreement ID is correct
- Check if agreement exists: `GET /v1/agreements/{agreementId}`
- Ensure you're using the correct environment (dev/prod)

#### Issue: "Idempotency key has been used with different request data"

**Cause**: Same idempotency key used with different request payload

**Solution**:
- Generate a new idempotency key for each unique request
- Don't reuse idempotency keys across different operations
- Store and reuse the same key only for exact retry of failed request

#### Issue: "Transaction simulation failed"

**Cause**: Blockchain transaction would fail (insufficient funds, invalid accounts, etc.)

**Solution**:
- Check wallet has sufficient SOL for transaction fees
- Verify all account addresses are valid
- Check NFT ownership and metadata
- Ensure USDC mint address is correct

---

## Development vs Production Errors

### Development Mode

In development (`NODE_ENV=development`), error messages include:
- Full error stack traces
- Detailed blockchain error messages
- Database query errors
- Internal service errors

### Production Mode

In production (`NODE_ENV=production`), error messages are sanitized:
- Generic error messages for security
- No stack traces exposed
- Internal errors logged server-side only
- User-facing messages only

---

## Error Monitoring

### Health Check Endpoint

Use the health check endpoint to monitor service status:

```bash
GET /health
```

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "easy-escrow-ai-backend",
  "database": "connected",
  "redis": "connected",
  "monitoring": {
    "status": "running",
    "solanaHealthy": true
  }
}
```

### Setting Up Alerts

Monitor these metrics:
- 5xx error rate (should be < 0.1%)
- 429 rate limit errors (indicates need to scale)
- Average response time (should be < 1s)
- Database connection health
- Solana RPC health

---

## Support

If you encounter an error that's not documented here:

1. Check the [API documentation](./openapi.yaml)
2. Review [integration guide](./INTEGRATION_GUIDE.md)
3. Check [webhook events](./WEBHOOK_EVENTS.md) if related to webhooks
4. Contact support with:
   - Request ID (from response headers)
   - Timestamp
   - Full error response
   - Steps to reproduce

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-15 | Initial error codes documentation |


