/**
 * PRODUCTION All E2E Tests - Master Test Suite
 * 
 * This file orchestrates all 9 modular E2E test scenarios in sequence.
 * Each test scenario is maintained in its own file for independent execution.
 * 
 * Benefits:
 * - Single source of truth (no code duplication)
 * - Run all scenarios with: npm run test:production:e2e
 * - Run individual scenarios with: npm run test:production:e2e:0X-scenario-name
 * - Easy maintenance (update once, reflects everywhere)
 * 
 * Test Scenarios (in execution order):
 * 1. NFT-for-SOL Happy Path [WITH TIMING] - Complete swap with settlement
 * 2. NFT-for-NFT with Fee Happy Path [WITH TIMING] - NFT exchange with platform fee
 * 3. NFT-for-NFT + SOL Happy Path [WITH TIMING] - NFT exchange with SOL payment
 * 4. Agreement Expiry: Automatic expiry and refund handling
 * 5. Admin Cancellation: Admin-initiated cancellation workflow
 * 6. Zero-Fee Transactions: Edge case of agreements with zero platform fees
 * 7. Idempotency Handling: Duplicate request prevention
 * 8. Concurrent Operations: Race condition and isolation testing
 * 9. Edge Cases & Validation: Error handling and input validation
 * 
 * Total Duration: ~300 seconds (~5 minutes)
 * Total Tests: 20+ test cases
 */

// Import all test scenarios in execution order
// Each import registers its test suite with Mocha

import './01-nft-for-sol-happy-path.test';          // Happy path with timing
import './02-nft-for-nft-with-fee.test';            // Happy path with timing
import './03-nft-for-nft-plus-sol.test';            // Happy path with timing
import './04-agreement-expiry-refund.test';         //  2 tests, ~30s
import './05-admin-cancellation.test';              //  1 test,  ~15s
import './06-zero-fee-transactions.test';           //  1 test,  ~10s
import './07-idempotency-handling.test';            //  1 test,  ~15s
import './08-concurrent-operations.test';           //  1 test,  ~25s
import './09-edge-cases-validation.test';           //  3 tests, ~30s

/**
 * Note: Mocha automatically discovers and runs all test suites from imported files.
 * 
 * To run this complete suite:
 *   npm run test:production:e2e
 * 
 * To run with verbose output:
 *   npm run test:production:e2e:verbose
 * 
 * To run individual happy path scenarios with timing:
 *   npm run test:production:e2e:nft-sol
 *   npm run test:production:e2e:nft-nft-fee
 *   npm run test:production:e2e:nft-nft-sol
 * 
 * To run all happy path tests:
 *   npm run test:production:happy-path
 * 
 * See tests/production/e2e/README.md for complete documentation.
 */

