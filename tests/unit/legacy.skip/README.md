# Legacy Orchestrator Unit Tests

⚠️ **DEPRECATED**: These tests are for the legacy escrow orchestrator system and are not actively maintained for the new atomic swap architecture.

## Overview

This directory contains unit tests for the legacy escrow orchestrator services that handled:
- Traditional escrow agreements
- USDC and NFT deposits
- Automatic refunds and settlements
- Receipt generation and signing
- Transaction logging and status updates

## Current Status

🔴 **Not Run by Default** - These tests are excluded from the main `npm run test:unit` command to focus on atomic swap development.

## Test Categories

### Agreement Management
- `agreement.service.test.ts` - Agreement creation and management
- `agreement-cache.service.test.ts` - Agreement caching
- `agreement-cancellation.test.ts` - Agreement cancellation logic

### Deposits
- `deposit.service.test.ts` - General deposit handling
- `usdc-deposit.service.test.ts` - USDC-specific deposits
- `nft-deposit.service.test.ts` - NFT deposit validation

### Settlements & Refunds
- `settlement-automatic-refund.test.ts` - Automatic refund triggers
- `refund.service.test.ts` - Refund processing

### Receipts
- `receipt.service.test.ts` - Receipt generation
- `receipt-signing.service.test.ts` - Receipt signing and verification

### Validation
- `amount-validation.test.ts` - Amount validation rules
- `expiry-timestamp-validation.test.ts` - Expiry time validation
- `expiry-extension-validation.test.ts` - Extension validation

### Infrastructure
- `close-escrow.test.ts` - Escrow closure logic
- `transaction-log.service.test.ts` - Transaction logging
- `queue.service.test.ts` - Job queue management
- `resource-tracking.test.ts` - Resource usage tracking
- `status-update.service.test.ts` - Status transition validation
- `global-teardown.test.ts` - Test cleanup

### Jito Integration
- `jito-confirmation.test.ts` - Jito transaction confirmation
- `jito-integration.test.ts` - Jito bundle integration

### Solana
- `solana.service.test.ts` - Solana utility functions
- `escrow-program-token-accounts.test.ts` - Token account management

### Fees
- `nft-for-nft-fee.test.ts` - NFT swap fee calculations

## Running Legacy Tests

### Run all legacy tests:
```bash
npm run test:unit:legacy
```

### Run specific legacy test:
```bash
npm run test:unit:mocha:legacy
```

### Run legacy tests with mocha:
```bash
cross-env NODE_ENV=test mocha --require ts-node/register --no-config 'tests/unit/legacy/**/*.test.ts' --timeout 10000
```

## Known Issues

Most legacy tests are failing due to:
- ❌ Database connection mocking issues
- ❌ Service initialization problems
- ❌ Outdated mock configurations
- ❌ Missing dependencies for legacy services

## Maintenance Strategy

### Short Term
- Keep tests as historical reference
- Do not invest time fixing failing tests
- Focus on atomic swap test suite

### Long Term Options
1. **Archive** - Move to separate repository for historical purposes
2. **Adapt** - Refactor to test shared services (cache, database, idempotency)
3. **Remove** - Delete entirely if services are fully deprecated

## Atomic Swap Tests

✅ **Active Tests** - The following tests remain in the main `tests/unit/` directory and are actively maintained:

### Core Atomic Swap Services
- `offerManager.test.ts` - Offer lifecycle management
- `offerManager-sol-amounts.test.ts` - SOL amount handling
- `transactionBuilder.test.ts` - Transaction construction
- `assetValidator.test.ts` - NFT/cNFT ownership validation
- `noncePoolManager.test.ts` - Durable nonce management
- `feeCalculator.test.ts` - Platform fee calculations

### Atomic Swap Infrastructure
- `atomic-swap-idempotency.test.ts` - Request idempotency
- `idempotency.test.ts` - Idempotency middleware
- `cache.service.test.ts` - Caching layer
- `database.test.ts` - Database operations
- `nonce-pool-creation.test.ts` - Nonce account creation

## Migration Path

If you need to resurrect a legacy test:
1. Check if equivalent functionality exists in atomic swap services
2. Adapt test to new service architecture
3. Move back to main `tests/unit/` directory
4. Update imports and mocks for new services

## Questions?

For questions about:
- **Atomic swap tests** - See main `tests/unit/README.md`
- **Legacy system architecture** - See `docs/LEGACY_ORCHESTRATOR_ARCHITECTURE.md` (if exists)
- **Test organization** - See `.cursor/rules/taskmaster/testing.mdc`

---

**Last Updated:** 2024-11-20  
**Status:** Deprecated, not actively maintained  
**Maintainer:** Focus on atomic swap tests instead
