# Security Middleware Documentation

This document describes the security measures implemented in the EasyEscrow.ai backend API.

## Overview

Task 32 implements comprehensive security middleware to protect the API from common attacks and ensure secure operation. The security stack includes:

1. **Rate Limiting**
2. **CORS Configuration**
3. **Input Validation and Sanitization**
4. **USDC Mint Allowlist**
5. **Authentication Middleware**
6. **Security Headers (Helmet)**

---

## 1. Rate Limiting

### Purpose
Prevents API abuse, DDoS attacks, and ensures fair resource usage.

### Implementation
Uses `express-rate-limit` with three tiers:

#### Standard Rate Limiter
- **Applied to**: `/v1/*` routes (general API endpoints)
- **Limit**: 100 requests per 15 minutes per IP
- **Response**: 429 Too Many Requests

#### Strict Rate Limiter
- **Applied to**: Agreement creation (`POST /v1/agreements`)
- **Limit**: 20 requests per 15 minutes per IP
- **Response**: 429 Too Many Requests
- **Purpose**: Prevent spam agreement creation

#### Auth Rate Limiter
- **Applied to**: Authentication endpoints (future)
- **Limit**: 5 failed attempts per 15 minutes per IP
- **Skip successful requests**: Yes
- **Purpose**: Prevent brute force attacks

### Configuration
Located in: `src/middleware/rate-limit.middleware.ts`

### Headers
Rate limit information is exposed in response headers:
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining in window
- `RateLimit-Reset`: Time when limit resets (Unix timestamp)

### Applied Per-Route
Rate limiting is applied individually to each route to provide fine-grained control:
- `POST /v1/agreements` → `strictRateLimiter` (20 req/15min)
- `GET /v1/agreements/:id` → `standardRateLimiter` (100 req/15min)
- `GET /v1/agreements` → `standardRateLimiter` (100 req/15min)

This approach prevents double-limiting issues where a single request would consume quota in multiple limiters.

---

## 2. CORS Configuration

### Purpose
Controls which domains can access the API, preventing unauthorized cross-origin requests.

### Allowed Origins

#### Production
- `https://easyescrow.ai`
- `https://www.easyescrow.ai`
- `https://app.easyescrow.ai`

#### Development
- All production origins
- `http://localhost:3000-3001`
- `http://localhost:5173-5174`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:5173`
- `https://staging.easyescrow.ai`

### Configuration
Located in: `src/middleware/cors.middleware.ts`

### Features
- **Credentials**: Allowed (cookies, authentication headers)
- **Methods**: GET, POST, PUT, DELETE, OPTIONS, PATCH
- **Allowed Headers**: Content-Type, Authorization, X-Api-Key, X-Idempotency-Key
- **Exposed Headers**: Rate limit headers
- **Preflight Cache**: 24 hours

---

## 3. Input Validation and Sanitization

### Purpose
Prevents XSS attacks and ensures data integrity.

### Features

#### Automatic Sanitization
- Removes `<script>` tags
- Removes `javascript:` protocol
- Removes event handlers (`onclick`, etc.)
- Applied to query parameters and body fields

#### Skip Fields
Certain fields are not sanitized (raw values needed):
- `signature`
- `transaction`
- `memo`

### Implementation
Located in: `src/middleware/security.middleware.ts`

### Request Size Limiting
- **Default Maximum**: 10MB
- **Enforced by**: Express body parsers (`express.json()` and `express.urlencoded()`)
- **Response**: 413 Payload Too Large

---

## 4. USDC Mint Allowlist

### Purpose
Ensures only approved USDC token addresses are accepted, preventing fake token deposits.

### Approved Mints

#### Mainnet
- `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (Official USDC)

#### Devnet
- `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` (Devnet USDC)

#### Testnet
- `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Testnet USDC)

### Custom Mints
Additional mints can be added via environment variable:
```bash
ALLOWED_USDC_MINTS=mint1,mint2,mint3
```

### Validation
- Checks if mint is a valid Solana public key
- Verifies mint is in the allowlist
- Returns 400 Bad Request with list of allowed mints on failure

### Implementation
Located in: `src/middleware/usdc-allowlist.middleware.ts`

### Applied To
- Agreement creation endpoint (`POST /v1/agreements`)
- Any future endpoint accepting USDC mint addresses

**Note**: Applied per-endpoint to avoid validation on endpoints that don't need it.

---

## 5. Authentication Middleware

### Purpose
Protects sensitive endpoints from unauthorized access.

### Methods

#### API Key Authentication
Simple API key-based authentication for MVP.

**Header**: `X-Api-Key`

**Middleware**: `authenticateApiKey`

**Usage**:
```typescript
router.post('/protected', authenticateApiKey, handler);
```

#### Optional Authentication
Validates API key if provided but doesn't require it.

**Middleware**: `optionalAuth`

**Usage**:
```typescript
router.get('/data', optionalAuth, handler);
```

#### Admin Authentication
Requires special admin API key for sensitive operations.

**Middleware**: `authenticateAdmin`

**Usage**:
```typescript
router.post('/admin/cancel', authenticateAdmin, handler);
```

### Configuration
Environment variables:
```bash
# Regular API keys (comma-separated)
API_KEYS=key1,key2,key3

# Admin API keys (comma-separated)
ADMIN_API_KEYS=adminkey1,adminkey2
```

### Development
Default test keys for development:
- Regular: `test-api-key-dev`
- Admin: `test-admin-key-dev`

### Implementation
Located in: `src/middleware/auth.middleware.ts`

### Future Enhancement
Planned migration to JWT-based authentication with user roles and permissions.

---

## 6. Security Headers (Helmet)

### Purpose
Adds security headers to protect against common web vulnerabilities.

### Headers Applied

#### Content Security Policy (CSP)
- `default-src`: self
- `style-src`: self, unsafe-inline
- `script-src`: self
- `img-src`: self, data:, https:

#### Strict Transport Security (HSTS)
- Max Age: 1 year
- Include Subdomains: Yes
- Preload: Yes

#### Frame Options
- Action: DENY (prevents clickjacking)

#### XSS Protection
- Enabled with mode=block

#### Content Type Sniffing
- Prevented with noSniff

#### Referrer Policy
- `strict-origin-when-cross-origin`

### Additional Custom Headers
- `X-API-Version`: 1.0.0
- `X-Content-Type-Options`: nosniff
- `X-Frame-Options`: DENY
- `X-XSS-Protection`: 1; mode=block
- `Permissions-Policy`: Restricts geolocation, microphone, camera

### Implementation
Located in: `src/middleware/security.middleware.ts`

---

## Security Middleware Stack Order

The middleware is applied in the following order (important for security):

1. **Helmet** - Security headers
2. **Custom Security Headers** - Additional headers
3. **CORS** - Cross-origin configuration
4. **Body Parsers** - With 10MB size limits
5. **Input Sanitization** - XSS prevention
6. **Rate Limiting** - DDoS protection (applied per-route, not globally)
7. **USDC Allowlist** - Token validation (per-route)
8. **Authentication** - Access control (per-route)
9. **Request Validation** - Business logic validation (per-route)

**Important**: Rate limiting is applied individually to each route to avoid double-limiting. Sensitive endpoints like agreement creation use `strictRateLimiter`, while query endpoints use `standardRateLimiter`.

---

## Environment Variables

### Required for Production

```bash
# Solana Network
SOLANA_NETWORK=mainnet-beta

# API Keys
API_KEYS=your_secret_key_1,your_secret_key_2
ADMIN_API_KEYS=your_admin_key_1,your_admin_key_2

# Environment
NODE_ENV=production
```

### Optional

```bash
# Custom USDC Mints
ALLOWED_USDC_MINTS=custom_mint_1,custom_mint_2

# Port
PORT=3000
```

---

## Testing

### Manual Testing

#### Test Rate Limiting
```bash
# Send multiple requests quickly
for i in {1..30}; do
  curl http://localhost:3000/v1/agreements
done
```

#### Test CORS
```bash
# From disallowed origin
curl -H "Origin: https://malicious.com" \
  http://localhost:3000/v1/agreements
```

#### Test API Key
```bash
# Without API key (should fail if required)
curl http://localhost:3000/v1/protected

# With API key
curl -H "X-Api-Key: test-api-key-dev" \
  http://localhost:3000/v1/protected
```

#### Test USDC Allowlist
```bash
# Invalid USDC mint
curl -X POST http://localhost:3000/v1/agreements \
  -H "Content-Type: application/json" \
  -d '{
    "usdc_mint": "InvalidMint123",
    "nft_mint": "...",
    "price": 1000000,
    "seller": "..."
  }'
```

### Automated Testing
Security tests should be added to the test suite (Task 35).

---

## Security Best Practices

### 1. Never Commit Secrets
- Use environment variables for API keys
- Add sensitive files to `.gitignore`
- Use secret management services in production

### 2. Rotate API Keys Regularly
- Change API keys every 90 days
- Immediately rotate if compromised
- Use different keys per environment

### 3. Monitor Rate Limit Violations
- Log excessive rate limit hits
- Set up alerts for suspicious patterns
- Consider IP blocking for persistent abuse

### 4. Keep Dependencies Updated
```bash
npm audit
npm audit fix
```

### 5. Regular Security Audits
- Review security middleware configuration
- Test for vulnerabilities
- Update security headers as standards evolve

---

## Maintenance

### Adding New Protected Endpoints

1. Apply appropriate rate limiter:
```typescript
import { standardRateLimiter, strictRateLimiter } from '../middleware';

router.post('/endpoint', strictRateLimiter, handler);
```

2. Add authentication if needed:
```typescript
import { authenticateApiKey } from '../middleware';

router.post('/endpoint', authenticateApiKey, handler);
```

3. Add USDC validation if accepting mint:
```typescript
import { validateUSDCMintMiddleware } from '../middleware';

router.post('/endpoint', validateUSDCMintMiddleware, handler);
```

### Updating CORS Origins
Edit `src/middleware/cors.middleware.ts` and add new origin to appropriate environment list.

### Adjusting Rate Limits
Edit `src/middleware/rate-limit.middleware.ts` and modify `windowMs` or `max` values.

---

## Related Documentation

- [API Documentation](./API_DOCUMENTATION.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Setup Instructions](./SETUP_INSTRUCTIONS.md)

---

## Support

For security issues or concerns, please contact the development team immediately. Do not create public GitHub issues for security vulnerabilities.

