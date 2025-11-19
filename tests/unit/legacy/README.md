# Legacy Escrow Agreement Tests

These tests are for the **old custodial escrow agreement model** (pre-atomic swaps).

## Why Are These Here?

The atomic swap MVP uses a completely different architecture:
- **Old Model:** Custodial, multi-step flow with on-chain escrow state
- **New Model:** Non-custodial, single atomic transaction with durable nonces

These tests are **not compatible** with the atomic swap system.

## Can We Use Them Again?

**Yes!** If we bring back agreement-based escrows, these tests can be re-enabled:

1. Move files back to `tests/unit/`
2. Add test scripts back to `package.json`
3. Update tests to work with current codebase

## Test Files

### Agreement Core
- `agreement-cache.service.test.ts` - Agreement caching service
- `agreement-cancellation.test.ts` - Multi-signature cancellation
- `agreement.service.test.ts` - Main agreement service
- `close-escrow.test.ts` - Escrow account closure

### Deposits
- `deposit.service.test.ts` - Generic deposit service
- `nft-deposit.service.test.ts` - NFT deposit handling
- `usdc-deposit.service.test.ts` - USDC deposit handling

### Validation
- `amount-validation.test.ts` - Amount validation rules
- `expiry-extension-validation.test.ts` - Expiry extension logic
- `expiry-timestamp-validation.test.ts` - Expiry timestamp validation

### Solana Program
- `escrow-program-token-accounts.test.ts` - Token account handling

### Fees & Refunds
- `nft-for-nft-fee.test.ts` - NFT↔NFT fee calculation
- `refund.service.test.ts` - Refund processing
- `settlement-automatic-refund.test.ts` - Automatic refunds

### Receipts & Logging
- `receipt-signing.service.test.ts` - Receipt signature generation
- `receipt.service.test.ts` - Receipt creation
- `transaction-log.service.test.ts` - Transaction logging

### Integrations
- `jito-confirmation.test.ts` - Jito transaction confirmation
- `jito-integration.test.ts` - Jito bundle integration

## What Replaced These?

**Atomic Swap Tests** (in `tests/unit/`):
- `atomic-swap-idempotency.test.ts` - Idempotency protection
- `nonce-pool-creation.test.ts` - Nonce account creation
- `assetValidator.test.ts` - Asset ownership validation
- `feeCalculator.test.ts` - Fee calculation
- `noncePoolManager.test.ts` - Nonce pool management
- `offerManager.test.ts` - Offer lifecycle
- `transactionBuilder.test.ts` - Transaction building
- `idempotency.test.ts` - Idempotency service (reused)

## Notes

- These files are kept for reference
- They may need updates to work with current dependencies
- Some services (like idempotency) were kept and adapted for atomic swaps
- Test scripts were removed from `package.json`

---

**Last Updated:** November 19, 2025  
**Reason:** Moved to legacy for atomic swap MVP  
**Status:** Preserved for potential future use

