# Test Folder Reorganization

**Date:** January 23, 2025  
**Branch:** staging  
**Status:** ✅ COMPLETE

## Overview

Reorganized the test folder structure to be environment-based, providing clear separation between local, development, staging, and production test environments. This makes it easier to understand which tests run in which environment and improves maintainability.

## New Structure

```
tests/
├── local/                    # Localnet environment tests
│   ├── e2e/                  # End-to-end tests on localnet
│   │   ├── escrow-comprehensive.test.ts
│   │   └── escrow-comprehensive.test.ts.bak
│   └── unit/                 # Localnet-specific unit tests (future)
│
├── development/              # Development environment tests (devnet)
│   ├── e2e/                  # End-to-end tests on devnet
│   │   ├── devnet-nft-usdc-swap.test.ts
│   │   ├── README.md
│   │   └── README_USDC_SETUP.md
│   └── unit/                 # Dev-specific unit tests (future)
│
├── staging/                  # Staging environment tests
│   ├── e2e/                  # End-to-end tests on staging
│   │   ├── 01-solana-nft-usdc-happy-path.test.ts
│   │   ├── 02-agreement-expiry-refund.test.ts
│   │   ├── 03-admin-cancellation.test.ts
│   │   ├── 04-platform-fee-collection.test.ts
│   │   ├── 05-webhook-delivery.test.ts
│   │   ├── 06-idempotency-handling.test.ts
│   │   ├── 07-concurrent-operations.test.ts
│   │   ├── 08-edge-cases-validation.test.ts
│   │   ├── staging-all-e2e.test.ts
│   │   ├── shared-test-utils.ts
│   │   ├── test-config.ts
│   │   ├── test-helpers.ts
│   │   └── README.md
│   ├── unit/                 # Staging-specific unit tests (future)
│   └── smoke/                # Staging smoke tests
│       └── staging-smoke.test.ts
│
├── production/               # Production environment tests (future)
│   ├── e2e/
│   └── unit/
│
├── unit/                     # General, non-environment-specific unit tests
│   ├── nft-deposit.service.test.ts
│   ├── usdc-deposit.service.test.ts
│   ├── transaction-log.service.test.ts
│   ├── refund.service.test.ts
│   ├── receipt.service.test.ts
│   ├── agreement.service.test.ts
│   ├── solana.service.test.ts
│   └── ... (14 files total)
│
├── integration/              # General integration tests
│   └── agreement-api.test.ts
│
├── helpers/                  # Shared test helpers
│   ├── devnet-nft-setup.ts
│   ├── devnet-token-setup.ts
│   ├── devnet-wallet-manager.ts
│   ├── localnet-test-helpers.ts
│   ├── mock-services.ts
│   ├── test-app.ts
│   ├── test-database.ts
│   └── test-utils.ts
│
└── fixtures/                 # Test fixtures and data
    ├── devnet-config.json
    ├── devnet-config.example.json
    ├── devnet-static-wallets.json
    ├── test-data.ts
    └── README.md
```

## Migration Summary

### Files Moved

| Old Location | New Location | Type |
|-------------|--------------|------|
| `tests/e2e/staging/*` | `tests/staging/e2e/` | Staging E2E tests |
| `tests/e2e/devnet-*` | `tests/development/e2e/` | Development E2E tests |
| `tests/on-chain/*` | `tests/local/e2e/` | Local E2E tests |
| `tests/staging/staging-smoke.test.ts` | `tests/staging/smoke/` | Staging smoke tests |

### Folders Removed

- ✅ `tests/e2e/` (contents distributed to environment folders)
- ✅ `tests/on-chain/` (moved to `tests/local/e2e/`)
- ✅ `tests/localnet/` (was empty, removed)

### Folders Kept As-Is

- ✅ `tests/unit/` - General unit tests (not environment-specific)
- ✅ `tests/integration/` - General integration tests
- ✅ `tests/helpers/` - Shared test helpers
- ✅ `tests/fixtures/` - Test fixtures and data

## Updated NPM Scripts

### Local Environment (Localnet)
```json
"test:local:e2e": "tests/local/e2e/**/*.test.ts"
"test:local:e2e:comprehensive": "tests/local/e2e/escrow-comprehensive.test.ts"
```

### Development Environment (Devnet)
```json
"test:development:e2e": "tests/development/e2e/devnet-nft-usdc-swap.test.ts"
"test:development:e2e:verbose": "tests/development/e2e/devnet-nft-usdc-swap.test.ts (verbose)"
```

### Staging Environment
```json
"test:staging:smoke": "tests/staging/smoke/staging-smoke.test.ts"
"test:staging:e2e": "tests/staging/e2e/staging-all-e2e.test.ts"
"test:staging:e2e:verbose": "tests/staging/e2e/staging-all-e2e.test.ts (verbose)"
"test:staging:e2e:01-solana-nft-usdc-happy-path": "tests/staging/e2e/01-solana-nft-usdc-happy-path.test.ts"
"test:staging:e2e:02-agreement-expiry-refund": "tests/staging/e2e/02-agreement-expiry-refund.test.ts"
"test:staging:e2e:03-admin-cancellation": "tests/staging/e2e/03-admin-cancellation.test.ts"
"test:staging:e2e:04-platform-fee-collection": "tests/staging/e2e/04-platform-fee-collection.test.ts"
"test:staging:e2e:05-webhook-delivery": "tests/staging/e2e/05-webhook-delivery.test.ts"
"test:staging:e2e:06-idempotency-handling": "tests/staging/e2e/06-idempotency-handling.test.ts"
"test:staging:e2e:07-concurrent-operations": "tests/staging/e2e/07-concurrent-operations.test.ts"
"test:staging:e2e:08-edge-cases-validation": "tests/staging/e2e/08-edge-cases-validation.test.ts"
```

### General Tests (No Environment Prefix)
```json
"test:unit": "tests/unit/**/*.test.ts"
"test:unit:core-services": "tests/unit/{nft-deposit,usdc-deposit,transaction-log,refund,receipt}.service.test.ts"
"test:integration": "tests/integration/**/*.test.ts"
```

## Benefits

### 1. **Clear Environment Separation**
- Easy to identify which tests run in which environment
- Prevents accidental execution of staging tests in local environment
- Clear boundaries for CI/CD pipelines

### 2. **Better Organization**
- Environment-based structure mirrors deployment environments
- Each environment has dedicated `e2e/` and `unit/` subfolders
- Room for future `production/` tests

### 3. **Improved Maintainability**
- Easier to find tests for specific environments
- Clearer test ownership and responsibility
- Better suited for team collaboration

### 4. **Future-Ready**
- `tests/production/` structure ready for production monitoring tests
- Environment-specific unit tests can be added as needed
- Scalable structure for additional environments

## Usage Examples

### Run all staging E2E tests
```bash
npm run test:staging:e2e
```

### Run specific staging E2E test
```bash
npm run test:staging:e2e:01-solana-nft-usdc-happy-path
```

### Run development E2E tests
```bash
npm run test:development:e2e
```

### Run local E2E tests
```bash
npm run test:local:e2e
```

### Run all unit tests (environment-agnostic)
```bash
npm run test:unit
```

### Run core service unit tests
```bash
npm run test:unit:core-services
```

## Breaking Changes

### Old Script Names (Removed)
- ❌ `test:e2e` → Use `test:development:e2e`
- ❌ `test:localnet` → Use `test:local:e2e`
- ❌ `test:on-chain` → Use `test:local:e2e` (or specific test)

### Import Path Changes

If any test files import from other test files, update paths:

**Old:**
```typescript
import { STAGING_CONFIG } from '../test-config';
```

**New:**
```typescript
import { STAGING_CONFIG } from './test-config';
```

Most imports should remain unchanged as helper/fixture imports use absolute paths.

## Files Modified

1. `package.json` - Updated all test script paths
2. Test files moved to new locations (no code changes needed)

## Verification

All test scripts have been updated and verified:
- ✅ Local E2E tests: `npm run test:local:e2e`
- ✅ Development E2E tests: `npm run test:development:e2e`
- ✅ Staging E2E tests: `npm run test:staging:e2e`
- ✅ Staging smoke tests: `npm run test:staging:smoke`
- ✅ Unit tests: `npm run test:unit`
- ✅ Core service tests: `npm run test:unit:core-services`

## Next Steps

1. Update CI/CD pipelines if they reference old test paths
2. Add environment-specific unit tests to `staging/unit/` and `development/unit/` as needed
3. Create `production/` tests for production monitoring
4. Update team documentation with new structure

---

**Related Documentation:**
- [Core Service Unit Tests](./CORE_SERVICE_UNIT_TESTS_IMPLEMENTATION.md)
- [E2E Test Split Summary](./E2E_TEST_SPLIT_SUMMARY.md)
- [Staging E2E Tests README](../../tests/staging/e2e/README.md)

