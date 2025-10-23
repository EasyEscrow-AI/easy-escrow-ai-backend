/**
 * STAGING All E2E Tests - Master Test Suite
 * 
 * This file orchestrates all 8 modular E2E test scenarios in sequence.
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
 * 4. Platform Fee Collection: Fee calculation and distribution
 * 5. Webhook Delivery: Event notification system (skipped - needs external receiver)
 * 6. Idempotency Handling: Duplicate request prevention
 * 7. Concurrent Operations: Race condition and isolation testing
 * 8. Edge Cases & Validation: Error handling and input validation
 * 
 * Total Duration: ~176 seconds (~3 minutes)
 * Total Tests: 21 test cases
 */

// Import all test scenarios in execution order
// Each import registers its test suite with Mocha

import './01-solana-nft-usdc-happy-path.test';      // 11 tests, ~46s
import './02-agreement-expiry-refund.test';         //  2 tests, ~30s
import './03-admin-cancellation.test';              //  1 test,  ~15s
import './04-platform-fee-collection.test';         //  2 tests, ~10s
import './05-webhook-delivery.test';                //  1 test,  ~5s  (skipped)
import './06-idempotency-handling.test';            //  1 test,  ~15s
import './07-concurrent-operations.test';           //  1 test,  ~25s
import './08-edge-cases-validation.test';           //  3 tests, ~30s

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
