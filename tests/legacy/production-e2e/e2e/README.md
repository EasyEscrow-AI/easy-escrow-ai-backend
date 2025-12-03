# ⚠️ PRODUCTION E2E Tests

**⚠️ DANGER: These tests run against PRODUCTION with REAL MAINNET SOL and USDC**

Modular end-to-end test suite for PRODUCTION environment validation.

---

## ⚠️ CRITICAL WARNINGS ⚠️

### **BEFORE RUNNING THESE TESTS:**

1. **💸 REAL MONEY:** These tests use REAL SOL and USDC on Solana Mainnet
2. **💰 COSTS:** Each test run will cost real money for:
   - Transaction fees (~0.01 SOL per test)
   - USDC test amounts ($0.01 - $1.00 per test)
3. **🚫 NOT FOR REGULAR USE:** Only run these for:
   - Pre-release validation
   - Post-deployment verification
   - Critical hotfix verification
   - Manual smoke testing

4. **✋ NEVER RUN:** 
   - In CI/CD pipelines
   - Automatically on deployment
   - Multiple times in succession
   - Without explicit approval

5. **📝 ALWAYS:**
   - Get approval before running
   - Document why you're running them
   - Review costs and test amounts
   - Monitor test execution closely

---

## Quick Start

### ⚠️ Prerequisites

1. **Production wallets funded** - Ensure sufficient balances:
   ```bash
   # Check wallet balances (implement this script)
   npm run production:verify-balances
   ```

2. **Environment configured** - `.env.production` must exist with:
   ```bash
   SOLANA_RPC_URL=https://your-mainnet-rpc-url
   PRODUCTION_API_BASE_URL=https://api.easyescrow.ai
   NODE_ENV=production
   ```

3. **Manual approval** - Get team lead approval before running

### Run All Scenarios (NOT RECOMMENDED)

```bash
# ⚠️ WARNING: This will cost real money!
# Only run if explicitly approved by team lead
npm run test:production:e2e
npm run test:production:e2e:verbose
```

### Run Individual Scenarios (RECOMMENDED)

**Always run tests individually and monitor costs:**

```bash
# 01 - Happy Path (costs ~$0.05)
npm run test:production:e2e:01-solana-nft-usdc-happy-path

# 02 - Agreement Expiry & Refund (costs ~$0.03)
npm run test:production:e2e:02-agreement-expiry-refund

# 03 - Admin Cancellation (costs ~$0.02)
npm run test:production:e2e:03-admin-cancellation

# 04 - Zero Fee Transactions (costs ~$0.02)
npm run test:production:e2e:04-zero-fee-transactions

# 05 - Idempotency Handling (costs ~$0.02)
npm run test:production:e2e:05-idempotency-handling

# 06 - Concurrent Operations (costs ~$0.10)
npm run test:production:e2e:06-concurrent-operations

# 07 - Edge Cases & Validation (costs ~$0.03)
npm run test:production:e2e:07-edge-cases-validation
```

---

## Test Architecture

### File Structure

```
tests/production/e2e/
├── production-all-e2e.test.ts              # Master orchestrator (imports all tests)
├── 01-solana-nft-usdc-happy-path.test.ts
├── 02-agreement-expiry-refund.test.ts
├── 03-admin-cancellation.test.ts
├── 04-zero-fee-transactions.test.ts
├── 05-idempotency-handling.test.ts
├── 06-concurrent-operations.test.ts
├── 07-edge-cases-validation.test.ts
├── shared-test-utils.ts                   # Common utilities
├── test-config.ts                         # Production configuration
├── test-helpers.ts                        # Helper functions
└── README.md                              # This file
```

### Key Differences from Staging

| Aspect | Staging (Devnet) | Production (Mainnet) |
|--------|-----------------|---------------------|
| **Network** | Devnet | Mainnet Beta |
| **Program ID** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` |
| **USDC Mint** | Devnet Test USDC | Circle USDC (`EPjFW...`) |
| **API URL** | staging-api.easyescrow.ai | api.easyescrow.ai |
| **Test Amounts** | 0.1 USDC | 0.01 USDC (10x smaller) |
| **Costs** | FREE (devnet tokens) | REAL MONEY |
| **Explorer** | devnet.solana.com | solana.com |
| **Timeouts** | 60s | 90s (more conservative) |
| **Frequency** | Run anytime | Only when necessary |

---

## Test Scenarios

### 01. Solana NFT-for-USDC Happy Path

**Cost:** ~$0.03 (transaction fees + 0.01 USDC) - *Reduced! No NFT minting*  
**Duration:** ~45 seconds  
**Tests:** 11 test cases

**What it does:**
- Randomly selects an existing NFT from sender wallet (no minting!)
- Creates escrow agreement
- Deposits NFT and USDC
- Verifies automatic settlement
- Validates fee distribution

**When to run:** After major backend changes or platform fee updates

---

### 02. Agreement Expiry & Refund

**Cost:** ~$0.03  
**Duration:** ~30 seconds  
**Tests:** 2 test cases

**What it does:**
- Creates agreement with short expiry
- Verifies automatic refund processing

**When to run:** After expiry service changes

---

### 03. Admin Cancellation

**Cost:** ~$0.02  
**Duration:** ~15 seconds  
**Tests:** 1 test case

**What it does:**
- Tests admin cancellation flow
- Verifies refund processing

**When to run:** After admin functionality changes

---

### 04. Zero Fee Transactions

**Cost:** ~$0.02  
**Duration:** ~10 seconds  
**Tests:** 2 test cases

**What it does:**
- Tests zero-fee transaction handling

**When to run:** After fee calculation changes

---

### 05. Idempotency Handling

**Cost:** ~$0.02  
**Duration:** ~15 seconds  
**Tests:** 1 test case

**What it does:**
- Verifies duplicate request prevention

**When to run:** After idempotency middleware changes

---

### 06. Concurrent Operations

**Cost:** ~$0.04 (no NFT creation!)  
**Duration:** ~25 seconds  
**Tests:** 1 test case

**What it does:**
- Uses existing NFTs from wallet (randomly selected)
- Creates 5 agreements concurrently (parallel requests)
- Verifies all succeed
- Verifies all agreements have unique IDs
- Verifies no race conditions detected

**When to run:** After database schema changes

---

### 07. Edge Cases & Validation

**Cost:** ~$0.03  
**Duration:** ~30 seconds  
**Tests:** 3 test cases

**What it does:**
- Tests error handling
- Validates input validation

**When to run:** After validation changes

---

## Configuration

### Environment Variables

**Required in `.env.production`:**

```bash
# Mainnet RPC (use premium provider)
SOLANA_RPC_URL=https://your-mainnet-rpc-url

# Production API
PRODUCTION_API_BASE_URL=https://api.easyescrow.ai

# Environment
NODE_ENV=production
```

### Test Configuration

Located in `test-config.ts`:

```typescript
{
  programId: '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx', // Production program
  network: 'mainnet-beta',
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Circle USDC
  apiBaseUrl: 'https://api.easyescrow.ai',
  testAmounts: {
    swap: 0.01,      // 0.01 USDC ($0.01)
    fee: 0.01,       // 1%
    minSOL: 0.01,    // Minimum SOL balance
  }
}
```

### Wallets

Production wallets must exist in `wallets/production/`:

- `production-sender.json` - NFT seller 
  - **Address:** `B7jiNm8TKvaoad3N36pyDeXMSVPmvHLaXZMDC7udhTfr`
  - **Requirements:** Needs SOL for transactions + **must own at least 1 NFT**
  - **Note:** Tests randomly select an existing NFT (no new NFTs created!)
- `production-receiver.json` - USDC buyer
  - **Address:** `3qYD5LwHSuxwLi2mECzoVEmH2M7aehNjodUZCdmnCwtY`
  - **Requirements:** Needs SOL for transactions + **must have USDC balance**
  - **Note:** Tests use existing USDC (no minting/transfers needed!)
- `production-admin.json` - Agreement signer (needs SOL)
- `production-fee-collector.json` - Platform fees (receives USDC)

**⚠️ Security:** Keep production wallets secure. Never commit them to git.

**💡 Cost Optimizations:**
- **NFTs:** Tests use existing NFTs from sender wallet (no minting!)
  - Randomly selects from available NFTs each test run
  - Saves NFT creation costs and reduces blockchain clutter
  - Ensure sender wallet has at least 1 NFT before running tests
- **USDC:** Tests use existing USDC from receiver wallet (no minting!)
  - Verifies sufficient balance before test execution
  - No token minting or transfers needed
  - Ensure receiver wallet has sufficient USDC (minimum 0.01 USDC for tests)

---

## Cost Breakdown

### Per Test Scenario

| Test | Transaction Fees (SOL) | Token Costs (USDC) | Total Est. Cost |
|------|----------------------|-------------------|----------------|
| 01 - Happy Path | ~0.002 SOL | $0.01 | ~$0.50 |
| 02 - Expiry/Refund | ~0.002 SOL | $0.00 | ~$0.40 |
| 03 - Admin Cancel | ~0.002 SOL | $0.00 | ~$0.40 |
| 04 - Zero Fee | ~0.002 SOL | $0.00 | ~$0.40 |
| 05 - Idempotency | ~0.002 SOL | $0.01 | ~$0.50 |
| 06 - Concurrent | ~0.003 SOL | $0.05 | ~$0.70 |
| 07 - Edge Cases | ~0.002 SOL | $0.00 | ~$0.40 |
| **TOTAL (All Tests)** | **~0.015 SOL** | **~$0.07** | **~$3.30** |

*Costs based on SOL at ~$200. Significantly reduced by using existing NFTs instead of minting!*

---

## Safety Guidelines

### ✅ DO:

- Run tests individually
- Monitor costs closely
- Review test code before running
- Use minimal test amounts
- Document test runs
- Get approval for runs
- Check wallet balances first
- Run during low-traffic periods
- Keep production wallets secure

### ❌ DON'T:

- Run in CI/CD
- Run automatically
- Run all tests at once without approval
- Run frequently
- Share production wallet keys
- Commit production secrets
- Run without monitoring
- Run with large amounts
- Run during peak hours

---

## Pre-Flight Checklist

Before running ANY production tests:

- [ ] **Approval:** Team lead approval obtained
- [ ] **Documentation:** Reason documented
- [ ] **SOL Balances:** All wallets have sufficient SOL for transaction fees
- [ ] **NFTs:** Sender wallet (`B7jiNm8TKvaoad3N36pyDeXMSVPmvHLaXZMDC7udhTfr`) has at least 1 NFT
- [ ] **USDC Balance:** Receiver wallet (`3qYD5LwHSuxwLi2mECzoVEmH2M7aehNjodUZCdmnCwtY`) has sufficient USDC (minimum 0.01 USDC)
- [ ] **Environment:** `.env.production` configured correctly
- [ ] **RPC:** Premium RPC endpoint configured (not public)
- [ ] **Monitoring:** Ready to watch logs and dashboards
- [ ] **Backup:** Recent database backup verified
- [ ] **Time:** Running during low-traffic period
- [ ] **Communication:** Team notified of test run
- [ ] **Cost:** Budget approved for test costs

---

## Troubleshooting

### Insufficient Funds

**Problem:** `insufficient funds` errors

**Solution:**
```bash
# Check balances
# (Create script to check production wallet balances)

# Fund wallets (CAREFULLY - real money!)
# Use small amounts for testing
```

### RPC Rate Limits

**Problem:** 429 errors from RPC

**Solution:**
- Use premium RPC provider (Helius, QuickNode)
- Add delays between tests
- Don't run all tests at once

### Failed Transactions

**Problem:** Transaction failures on mainnet

**Solution:**
- Verify network is healthy (solanabeach.io)
- Check RPC endpoint status
- Increase timeouts in test config
- Retry individual failed tests

### Account Not Found

**Problem:** Token account errors

**Solution:**
- Ensure wallets are properly funded
- Verify USDC accounts are created
- Check circle USDC mint address

---

## Monitoring During Tests

### What to Watch:

1. **DigitalOcean Logs:**
   ```bash
   doctl apps logs <app-id> --follow
   ```

2. **Health Endpoint:**
   ```bash
   curl https://api.easyescrow.ai/health
   ```

3. **Solana Explorer:**
   - Watch transactions in real-time
   - Verify settlements
   - Check fee distributions

4. **Database:**
   - Monitor agreement status changes
   - Verify receipt generation
   - Check transaction logs

### Red Flags:

- ❌ Multiple failed transactions
- ❌ Unexpected error rates
- ❌ Slow RPC responses
- ❌ Health check failures
- ❌ Database connection issues

**→ If you see red flags: STOP TESTS IMMEDIATELY**

---

## Alternative: Manual Smoke Testing

Instead of running automated tests, consider manual smoke testing:

1. **Create Agreement Manually:**
   - Use API directly with Postman/curl
   - Test with minimal amounts (0.01 USDC)
   - Verify each step manually

2. **Monitor Specific Features:**
   - Focus on changed code paths
   - Test only affected endpoints
   - Use production-like data

3. **Gradual Rollout:**
   - Test with internal accounts first
   - Monitor for issues
   - Expand to broader testing if needed

---

## Reporting

### After Running Tests:

Create a test run report:

```markdown
# Production E2E Test Run Report

**Date:** YYYY-MM-DD  
**Run By:** [Your Name]  
**Approval:** [Team Lead Name]  
**Reason:** [Why tests were run]

## Tests Run:
- [ ] Test 01: Happy Path
- [ ] Test 02: Expiry/Refund
- [ ] ...

## Results:
- Passed: X/Y
- Failed: Y/Y
- Errors: [List any errors]

## Costs:
- SOL Spent: ~X SOL
- USDC Spent: ~$X
- Total Cost: ~$X

## Issues Found:
[List any issues discovered]

## Recommendations:
[Any recommendations for fixes or improvements]
```

---

## Contributing

### Adding New Tests:

1. **Justify the test** - Why is it needed for production?
2. **Minimize costs** - Use smallest amounts possible
3. **Add safety checks** - Prevent accidental runs
4. **Document costs** - Estimate and track expenses
5. **Get review** - Require code review before merging
6. **Update README** - Document the new test

---

## Support

**For issues or questions:**
- Review staging tests first (they're safer!)
- Check API documentation
- Consult deployment docs
- Ask team before running production tests

---

## Related Documentation

- [Staging E2E Tests](../../staging/e2e/README.md) - Safer alternative
- [Production Deployment](../../../docs/deployment/PRODUCTION_DEPLOYMENT_SUCCESS.md)
- [API Documentation](https://api.easyescrow.ai/)

---

**⚠️ REMEMBER: Production tests cost REAL MONEY. Use wisely!**

---

**Last Updated:** 2025-10-28  
**Status:** Ready (use with extreme caution)  
**Maintained By:** Development Team

