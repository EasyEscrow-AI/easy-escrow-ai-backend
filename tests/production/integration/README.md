# Production Integration Tests

**Environment:** Production (Mainnet)  
**Purpose:** Validate API endpoints and service interactions without executing full transactions

---

## Overview

Production integration tests verify that:
- API endpoints are accessible and respond correctly
- Service integrations (DAS API, Jito, Solana RPC) are working
- Error handling and validation work as expected
- Response formats are consistent
- Performance meets requirements

**⚠️ Important:** These tests do NOT execute actual transactions. They validate API responses, connectivity, and service health.

---

## Test Files

### 1. `01-api-endpoints.test.ts`
**Purpose:** Test core API endpoints and response formats

**Coverage:**
- Health check endpoints (`/health`)
- Offer management endpoints (`GET /api/swaps/offers`, `GET /api/swaps/offers/:id`)
- Quote endpoint (`POST /api/swaps/offers/quote`)
- Error handling and validation
- Response format consistency

**Runtime:** ~30 seconds

---

### 2. `02-cnft-api.test.ts`
**Purpose:** Test cNFT-specific API functionality

**Coverage:**
- cNFT asset validation
- Mixed asset type support (cNFT + SPL NFT + SOL)
- Bulk swap API endpoints
- Transaction group information
- Asset limit validation (max 10 per side)

**Runtime:** ~45 seconds

---

### 3. `03-service-connectivity.test.ts`
**Purpose:** Test external service connectivity

**Coverage:**
- Solana RPC connectivity
- DAS API integration
- Database connectivity
- API response times
- Error handling and resilience

**Runtime:** ~60 seconds

---

## Running Tests

### Prerequisites

1. **Environment Variables:**
   ```bash
   PRODUCTION_API_URL=https://api.easyescrow.ai
   MAINNET_RPC_URL=https://your-mainnet-rpc-url
   ```

2. **Production API Must Be Running:**
   - API should be deployed and accessible
   - Health endpoint should return 200 OK

### Run All Production Integration Tests

```bash
npm run test:production:integration
```

### Run Individual Test Files

```bash
# API endpoints
mocha --require ts-node/register --no-config tests/production/integration/01-api-endpoints.test.ts --timeout 30000

# cNFT API
mocha --require ts-node/register --no-config tests/production/integration/02-cnft-api.test.ts --timeout 45000

# Service connectivity
mocha --require ts-node/register --no-config tests/production/integration/03-service-connectivity.test.ts --timeout 60000
```

---

## Test Configuration

### API Base URL
- **Default:** `https://api.easyescrow.ai`
- **Override:** Set `PRODUCTION_API_URL` environment variable

### Solana RPC
- **Default:** `https://api.mainnet-beta.solana.com`
- **Override:** Set `MAINNET_RPC_URL` or `SOLANA_RPC_URL` environment variable

### Timeouts
- Individual tests: 30-60 seconds
- Total suite: ~2-3 minutes

---

## Expected Results

### Success Criteria
- ✅ All health checks pass
- ✅ API endpoints return 200 OK
- ✅ Response formats are correct
- ✅ Error handling works properly
- ✅ Response times < 2 seconds
- ✅ External services are accessible

### Failure Scenarios
- ❌ API endpoint returns 5xx error → Service issue
- ❌ Response time > 5 seconds → Performance issue
- ❌ Invalid response format → API contract issue
- ❌ External service timeout → Connectivity issue

---

## Notes

1. **No Transactions:** These tests do NOT execute actual swaps or transactions
2. **Read-Only:** Tests primarily use GET requests and validation endpoints
3. **Safe to Run:** Can be run frequently without cost or side effects
4. **Production Validation:** Validates production deployment health

---

## Related Tests

- **Smoke Tests:** `tests/production/smoke/` - Quick health checks
- **E2E Tests:** `tests/production/e2e/` - Full transaction tests (costs real SOL)
- **Integration Tests:** `tests/integration/` - Local/staging integration tests

---

**Status:** ✅ Ready for execution  
**Runtime:** ~2-3 minutes total  
**Cost:** $0 (no transactions executed)

