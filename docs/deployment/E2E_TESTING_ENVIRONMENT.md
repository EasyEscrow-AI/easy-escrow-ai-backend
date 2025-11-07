# E2E Testing Environment Configuration

## Overview

The backend includes built-in support for E2E testing with relaxed rate limits to allow comprehensive test suites to run without hitting API limits.

## Environment Variable

**Variable:** `ENABLE_E2E_TESTING`  
**Type:** Boolean (`'true'` or `'false'`)  
**Default:** `false` (production rate limits)

## Rate Limit Changes

When `ENABLE_E2E_TESTING=true`:

| Limiter | Production Limit | E2E Testing Limit |
|---------|-----------------|-------------------|
| Standard | 100 req/15min | **1000 req/15min** |
| Strict (creation) | 20 req/15min | **500 req/15min** |
| Auth | 5 req/15min | **50 req/15min** |

## Configuration

### Local Development
Add to `.env`:
```bash
ENABLE_E2E_TESTING=true
```

### Staging Environment (DigitalOcean)
1. Navigate to: **App Platform** → **Backend App** → **Settings** → **Environment Variables**
2. Add new variable:
   - **Key:** `ENABLE_E2E_TESTING`
   - **Value:** `true`
   - **Scope:** `RUN_TIME`
   - **Type:** Plain Text
3. Save and redeploy

### Production Environment
**DO NOT** enable this in production. Rate limits are critical for security and preventing abuse.

## When to Use

Enable E2E testing mode when:
- Running comprehensive E2E test suites (e.g., `npm run test:staging:e2e:all`)
- Testing settlement flows that require frequent status polling
- Running multiple tests back-to-back
- Debugging rate limit issues

## Why This Is Needed

E2E tests for v2 SOL-based swaps involve:
1. Creating agreements
2. Depositing NFTs
3. Depositing SOL
4. **Polling agreement status every 1 second for up to 2 minutes**
5. Verifying settlements

Without relaxed rate limits, the polling step (#4) will hit the standard limit of 100 requests per 15 minutes after ~100 seconds.

## Security Considerations

- **Staging only:** This should only be enabled on staging environments
- **Temporary:** Consider enabling only during active E2E test runs
- **Monitoring:** Watch for abuse if enabled for extended periods
- **IP-based:** Rate limits are still per-IP, providing some protection

## Implementation

Rate limiters are defined in `src/middleware/rate-limit.middleware.ts`:

```typescript
export const standardRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.ENABLE_E2E_TESTING === 'true' ? 1000 : 100,
  // ...
});

export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.ENABLE_E2E_TESTING === 'true' ? 500 : 20,
  // ...
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.ENABLE_E2E_TESTING === 'true' ? 50 : 5,
  // ...
});
```

## Verification

After enabling, verify the rate limits are applied:

```bash
# Make a request and check the RateLimit-Limit header
curl -I https://easyescrow-backend-staging-mwx9s.ondigitalocean.app/v1/agreements

# Example response (E2E mode enabled):
# RateLimit-Limit: 1000
# RateLimit-Remaining: 999
# RateLimit-Reset: 1699564800
```

## Related Files

- **Rate limit middleware:** `src/middleware/rate-limit.middleware.ts`
- **Express config:** `src/index.ts` (trust proxy settings)
- **E2E tests:** `tests/staging/e2e/*.test.ts`

## Troubleshooting

### Still getting 429 errors with E2E mode enabled

1. **Verify environment variable is set:**
   ```bash
   # On staging, check runtime logs for:
   # process.env.ENABLE_E2E_TESTING
   ```

2. **Restart the app:**
   Environment variables require a deployment/restart to take effect

3. **Check trust proxy setting:**
   Ensure `app.set('trust proxy', 1)` is configured in `src/index.ts`

4. **Multiple IPs:**
   If running tests from multiple machines, each IP gets its own limit

### E2E tests still timing out

If settlement is failing despite relaxed rate limits, the issue is likely:
- Smart contract errors (check program logs)
- Settlement service not running
- Database query issues

Rate limits only affect **client API calls**, not the backend's internal settlement service.

