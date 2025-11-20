# Legacy Orchestrator E2E Tests

## ⚠️ DEPRECATED

These tests use the **legacy orchestrator pattern** that is being phased out in favor of the new **atomic swap architecture**.

## What Are These Tests?

These E2E tests validate the original agreement-based escrow system that uses:
- Backend orchestration (agreement creation, deposits, settlements)
- Multiple API endpoints per transaction
- Database state management
- Legacy monitoring services

## Why Are They Here?

1. **Backwards Compatibility** - Still needed for existing agreements
2. **Regression Testing** - Ensure legacy flows still work
3. **Transition Period** - Bridge while migrating to atomic swaps
4. **Reference** - Historical implementation patterns

## Test Files

### Orchestrator Tests (Legacy)
- `01-nft-for-sol-happy-path.test.ts` - Basic NFT swap flow
- `02-nft-for-nft-with-fee.test.ts` - NFT-NFT swap with fees
- `03-nft-for-nft-plus-sol.test.ts` - Hybrid swap (NFT + SOL)
- `04-agreement-expiry-refund.test.ts` - Expiry and refund logic
- `05-admin-cancellation.test.ts` - Admin intervention
- `06-admin-cancel-with-refunds.test.ts` - Cancel with refunds
- `06-zero-fee-transactions.test.ts` - Zero fee scenarios
- `07-idempotency-handling.test.ts` - Idempotency validation
- `08-concurrent-operations.test.ts` - Concurrency testing
- `09-edge-cases-validation.test.ts` - Edge case coverage

### Orchestrator File
- `staging-all-e2e.test.ts` - Runs all scenarios in sequence

### Helper Files
- `setup-test-nfts.ts` - NFT setup utilities
- `shared-test-utils.ts` - Shared utilities
- `test-config.ts` - Test configuration
- `test-helpers.ts` - Test helpers

## Running Legacy Tests

```bash
# Run all legacy tests via orchestrator
npm run test:staging:e2e

# Or run individual legacy tests (if scripts exist)
# Check package.json for available scripts
```

## Migration Status

- ✅ New atomic swap tests are in `tests/staging/e2e/` (parent folder)
- 🔄 Legacy tests kept for backwards compatibility
- ⏳ Will be removed after full migration to atomic swaps

## For New Features

**DO NOT add new tests here.** Use the new atomic swap test structure in the parent directory:

```
tests/staging/e2e/
  ├── 01-atomic-nft-for-sol-happy-path.test.ts
  ├── 02-atomic-cnft-for-sol-happy-path.test.ts
  ├── 03-atomic-nft-for-nft-happy-path.test.ts
  ├── 04-atomic-nft-for-cnft-happy-path.test.ts
  └── legacy/ (this folder)
```

## Related Documentation

- [Atomic Swap E2E Tests](../README.md) - New test architecture
- [Atomic Swap Implementation Plan](../../../../docs/tasks/ATOMIC_SWAP_E2E_IMPLEMENTATION_PLAN.md)
- [Legacy Orchestrator Documentation](../../../../docs/architecture/legacy-orchestrator.md) (if exists)

---

**Status:** 🟡 LEGACY - Kept for backwards compatibility  
**Last Updated:** November 20, 2025  
**Migration Target:** Q1 2026 (estimated)

