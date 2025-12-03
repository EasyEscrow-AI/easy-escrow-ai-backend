# Legacy Tests

This directory contains tests from the previous escrow agreement system. These tests are archived here in case we need to reference them or restore escrow functionality in the future.

## Contents

### Development E2E
- **Location:** `development-e2e/`
- **Purpose:** End-to-end tests for the old development/devnet environment
- **Includes:** NFT/USDC swap tests, setup guides

### Production E2E
- **Location:** `production-e2e/`
- **Purpose:** End-to-end tests for the old production escrow system
- **Includes:** 
  - 9 comprehensive test scenarios (happy path, edge cases, etc.)
  - Test helpers, NFT cache, configuration
  - Previous `production-all-e2e.test.ts`

### Staging E2E
- **Location:** `staging-e2e/`
- **Purpose:** End-to-end tests for the old staging environment
- **Includes:** Various staging validation tests

### Old Escrow Test
- **File:** `escrow.ts`
- **Purpose:** Original Anchor-based escrow program test

## Why Archived?

These tests were written for the **escrow agreement model**, where:
- Assets were held in on-chain escrow accounts
- Deposits happened over time
- Settlement occurred after all parties deposited
- Monitoring and refund services managed the lifecycle

## Current System

The new **atomic swap model** is fundamentally different:
- No on-chain escrow (assets never leave wallets until swap)
- Single atomic transaction
- Durable nonce-based transaction invalidation
- No monitoring or refund services needed

## Restoration

If we need to restore escrow functionality:
1. These tests provide reference implementations
2. The old agreement API logic is commented out in `src/`
3. Database tables still exist (agreements, deposits, etc.)
4. Solana program would need to be redeployed

## New Tests

The new atomic swap tests are located in:
- `tests/staging/` - Staging e2e tests for atomic swaps
- `tests/production/` - Production e2e tests for atomic swaps
- `tests/unit/` - Unit tests (including new atomic swap services)
- `tests/integration/` - Integration tests (including atomic swap flow)
- `tests/smoke/` - Smoke tests (including atomic swap smoke tests)

---

**Archived:** November 17, 2025  
**Reason:** System pivot from escrow agreements to atomic swaps  
**Status:** Retained for reference and potential future restoration

