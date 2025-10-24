/**
 * STAGING All E2E Tests - Master Test Suite
 * 
 * This file orchestrates all 7 modular E2E test scenarios in sequence.
 * Each test scenario is maintained in its own file for independent execution.
 * 
 * Benefits:
 * - Single source of truth (no code duplication)
 * - Run all scenarios with: npm run test:staging:e2e
 * - Run individual scenarios with: npm run test:staging:e2e:0X-scenario-name
 * - Easy maintenance (update once, reflects everywhere)
 * 
 * Test Scenarios (in execution order):
 * 1. Happy Path: Complete NFT-for-USDC swap with settlement
 * 2. Agreement Expiry: Automatic expiry and refund handling
 * 3. Admin Cancellation: Admin-initiated cancellation workflow
 * 4. Zero-Fee Transactions: Edge case of agreements with zero platform fees
 * 5. Idempotency Handling: Duplicate request prevention
 * 6. Concurrent Operations: Race condition and isolation testing
 * 7. Edge Cases & Validation: Error handling and input validation
 * 
 * Total Duration: ~170 seconds (~3 minutes)
 * Total Tests: 18 test cases
 */

// Import all test scenarios in execution order
// Each import registers its test suite with Mocha

import './01-solana-nft-usdc-happy-path.test';      // 11 tests, ~46s
import './02-agreement-expiry-refund.test';         //  2 tests, ~30s
import './03-admin-cancellation.test';              //  1 test,  ~15s
import './04-zero-fee-transactions.test';           //  1 test,  ~10s
import './05-idempotency-handling.test';            //  1 test,  ~15s
import './06-concurrent-operations.test';           //  1 test,  ~25s
import './07-edge-cases-validation.test';           //  3 tests, ~30s

/**
 * Note: Mocha automatically discovers and runs all test suites from imported files.
 * 
 * To run this complete suite:
 *   npm run test:staging:e2e
 * 
 * To run with verbose output:
 *   npm run test:staging:e2e:verbose
 * 
 * To run individual scenarios:
 *   npm run test:staging:e2e:01-solana-nft-usdc-happy-path
 *   npm run test:staging:e2e:02-agreement-expiry-refund
 *   ... etc.
 * 
 * See tests/e2e/staging/README.md for complete documentation.
 */
