# Atomic Swap Testing Guide

## Quick Reference

### Run All Unit Tests (Recommended)
```bash
npm run test:unit
```
This will automatically run ALL unit tests in `tests/unit/` including:
- ✅ `atomic-swap-idempotency.test.ts` (NEW)
- ✅ `nonce-pool-creation.test.ts` (NEW)
- ✅ `idempotency.test.ts` (existing)
- ✅ Any other test files in `tests/unit/`

### Run Specific Atomic Swap Tests
```bash
# Test idempotency middleware
npm run test:unit:atomic-swap-idempotency

# Test nonce creation fix
npm run test:unit:nonce-pool-creation

# Test idempotency service
npm run test:unit:idempotency
```

### Run Integration Tests
```bash
# All integration tests
npm run test:integration

# Atomic swap flow tests
npm run test:integration:atomic-swap

# Atomic swap API tests
npm run test:integration:atomic-swap-api
```

### Run Smoke Tests
```bash
# All smoke tests
npm run test:smoke

# Atomic swap smoke tests
npm run test:smoke:atomic-swap
```

### Run E2E Tests
```bash
# Staging E2E (all tests)
npm run test:staging:e2e:all

# Production E2E (all tests)
npm run test:production:e2e:all
```

---

## Test Coverage

### Unit Tests (Fast, No External Dependencies)
- **`atomic-swap-idempotency.test.ts`** - Tests idempotency middleware
  - Rejects requests without idempotency keys
  - Rejects invalid key formats
  - Returns cached responses for duplicates
  - Tests all 5 critical POST endpoints
  - Tests error handling

- **`nonce-pool-creation.test.ts`** - Tests nonce account creation
  - Verifies two-transaction approach
  - Proves combined transaction fails
  - Tests proper transaction sequencing
  - Tests rent exemption calculations
  - Tests commitment levels

- **`idempotency.test.ts`** - Tests idempotency service
  - Key storage and retrieval
  - Expiration handling
  - Concurrent request handling

### Integration Tests (Medium, Uses Local Services)
- **`atomic-swap-flow.test.ts`** - End-to-end swap flow
  - Create offer → Accept → Confirm
  - Nonce pool management
  - Asset validation

- **`atomic-swap-api.test.ts`** - API endpoint testing
  - HTTP request/response validation
  - Error handling
  - Status codes

### Smoke Tests (Quick, Production-Like)
- **`atomic-swap-smoke.test.ts`** - Basic health checks
  - Services start properly
  - Nonce pool initializes
  - Database connectivity

### E2E Tests (Slow, Full System)
- **`staging-all-e2e.test.ts`** - Full staging validation
- **`production-all-e2e.test.ts`** - Production smoke tests

---

## Legacy Tests (Moved to tests/unit/legacy/)

**20 legacy escrow agreement tests** have been moved to `tests/unit/legacy/`:

### Location
All legacy test files are in: `tests/unit/legacy/`

See the complete README: `tests/unit/legacy/README.md`

### Test Files Moved
- `agreement-cache.service.test.ts` - Agreement caching
- `agreement-cancellation.test.ts` - Multi-signature cancellation
- `agreement.service.test.ts` - Main agreement service
- `amount-validation.test.ts` - Amount validation
- `close-escrow.test.ts` - Escrow closure
- `deposit.service.test.ts` - Generic deposits
- `escrow-program-token-accounts.test.ts` - Token accounts
- `expiry-extension-validation.test.ts` - Expiry extensions
- `expiry-timestamp-validation.test.ts` - Expiry timestamps
- `jito-confirmation.test.ts` - Jito confirmations
- `jito-integration.test.ts` - Jito integration
- `nft-deposit.service.test.ts` - NFT deposits
- `nft-for-nft-fee.test.ts` - NFT fee calculation
- `receipt-signing.service.test.ts` - Receipt signing
- `receipt.service.test.ts` - Receipt creation
- `refund.service.test.ts` - Refund processing
- `settlement-automatic-refund.test.ts` - Auto refunds
- `transaction-log.service.test.ts` - Transaction logging
- `usdc-deposit.service.test.ts` - USDC deposits

**Why moved?** These tests are for the legacy escrow agreement model (custodial, multi-step flow). Atomic swaps use a completely different model (non-custodial, single transaction).

**Can we re-enable them?** Yes! If we bring back agreement-based escrows:
1. Move files back to `tests/unit/`
2. Add test scripts back to `package.json`
3. Update tests for current codebase

See `tests/unit/legacy/README.md` for full details.

---

## Test Workflow for Atomic Swaps

### Before Committing
```bash
# Run all unit tests
npm run test:unit

# Run atomic swap integration tests
npm run test:integration:atomic-swap
```

### Before Merging to Staging
```bash
# Run full test suite
npm run test:ci

# Run atomic swap smoke tests
npm run test:smoke:atomic-swap
```

### After Deploy to Staging
```bash
# Run staging E2E tests
npm run test:staging:e2e:all
```

### Before Production Deploy
```bash
# Run production smoke tests
npm run test:production:e2e:all
```

---

## CI/CD Integration

```bash
# CI/CD should run:
npm run test:ci

# This runs:
# - npm run test:unit (all unit tests with coverage)
# - npm run test:integration (all integration tests)
```

---

## Test Development Guidelines

### Adding New Unit Tests
1. Create test file: `tests/unit/my-feature.test.ts`
2. Add dedicated script to `package.json`:
   ```json
   "test:unit:my-feature": "jest tests/unit/my-feature.test.ts --coverage"
   ```
3. Test will automatically run with `npm run test:unit`

### Adding New Integration Tests
1. Create test file: `tests/integration/my-feature.test.ts`
2. Add dedicated script if frequently run:
   ```json
   "test:integration:my-feature": "mocha --require ts-node/register --no-config tests/integration/my-feature.test.ts --timeout 20000 --exit"
   ```
3. Test will automatically run with `npm run test:integration`

### Test Timeouts
- **Unit tests:** 10 seconds
- **Integration tests:** 20-30 seconds
- **E2E tests:** 180 seconds (3 minutes)

---

## Debugging Tests

### Run with Verbose Output
```bash
# Jest tests
npm run test:unit -- --verbose

# Mocha tests
npm run test:unit:mocha -- --reporter spec
```

### Run Single Test File
```bash
# Using dedicated script
npm run test:unit:atomic-swap-idempotency

# Using Jest directly
npx jest tests/unit/atomic-swap-idempotency.test.ts

# Using Mocha directly
npx mocha --require ts-node/register --no-config tests/unit/nonce-pool-creation.test.ts
```

### Watch Mode
```bash
# Jest watch mode
npm run test:unit:watch
```

---

## Coverage Reports

```bash
# Generate coverage for all unit tests
npm run test:unit

# Coverage report saved to: coverage/
# Open: coverage/lcov-report/index.html
```

---

## What Gets Tested?

### ✅ Idempotency Protection
- Missing idempotency keys rejected
- Invalid key formats rejected
- Duplicate requests return cached responses
- All 5 POST endpoints protected:
  - `POST /api/offers`
  - `POST /api/offers/:id/counter`
  - `POST /api/offers/:id/accept`
  - `POST /api/offers/:id/cancel`
  - `POST /api/offers/:id/confirm`

### ✅ Nonce Account Creation
- Two-transaction approach (create → initialize)
- Proper blockhash handling
- Rent exemption calculations
- Error prevention (`invalid account data`)

### ✅ Atomic Swap Flow
- Offer creation and validation
- Asset ownership verification
- Transaction building
- Fee calculations
- Nonce pool management

---

## Summary

**Main Commands:**
```bash
npm run test:unit               # All unit tests (recommended)
npm run test:integration        # All integration tests
npm run test:ci                 # CI/CD test suite
npm run test:staging:e2e:all    # Staging validation
```

**New Test Files:**
- `tests/unit/atomic-swap-idempotency.test.ts`
- `tests/unit/nonce-pool-creation.test.ts`

**Legacy Tests:** Disabled with `_` prefix (can be re-enabled later)

**Coverage:** Included in `npm run test:unit`

