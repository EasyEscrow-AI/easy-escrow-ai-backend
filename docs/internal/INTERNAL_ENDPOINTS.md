# Internal Endpoints

These endpoints are **not documented in the public API** but remain functional for internal use (testing, support, monitoring).

## Bundle Recovery Endpoints

### POST /api/swaps/offers/:id/retry-bundle

Retry a failed or timed-out Jito bundle with fresh Merkle proofs.

**Use cases:**
- E2E testing of bundle retry logic
- Manual recovery by support team when automatic retries fail
- Debugging bundle failures in staging

**Requirements:**
- Offer must have `bundleStatus` of `Failed` or `Timeout`
- Requires `X-Idempotency-Key` header

**Rate limit:** 20 requests per 15 minutes (strict)

---

### POST /api/swaps/offers/:id/rebuild-transaction

Rebuild swap transaction with fresh cNFT Merkle proofs.

**Use cases:**
- E2E testing of stale proof recovery
- Manual recovery when automatic retries exhaust (3 attempts)
- Used internally by `test-execute.routes.ts` for JIT rebuilds

**Requirements:**
- Offer must be in `ACCEPTED` status
- Requires `X-Idempotency-Key` header

**Rate limit:** 100 requests per 15 minutes (standard)

---

### GET /api/swaps/offers/metrics/bundles

Get 24-hour bundle execution metrics.

**Use cases:**
- Internal monitoring dashboards
- Debugging bundle success rates
- Identifying systemic Jito issues

**Returns:**
- Total bundles (landed, failed, timeout, pending)
- Success/failure rates
- Last 10 failed bundles for debugging

**Rate limit:** 100 requests per 15 minutes (standard)

---

## Why These Are Internal

These endpoints were removed from public documentation because:

1. **Automatic handling**: The backend automatically retries bundles up to 3 times with fresh proofs
2. **TwoPhase fallback**: Failed Jito bundles automatically fall back to TwoPhase delegation
3. **Reduced API surface**: Simpler public API for frontend integrations
4. **Operational concerns**: These are primarily for ops/support, not end users

The functionality remains for internal tooling and edge case recovery.
