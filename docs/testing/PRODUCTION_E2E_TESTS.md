# Production E2E Tests Documentation

**⚠️ WARNING: These tests run against PRODUCTION with REAL SOL and USDC**

## Overview

Production E2E tests are adapted from staging tests to validate critical production functionality after deployment or major changes.

**Location:** `tests/production/e2e/`

---

## ⚠️ Critical Safety Information

### Before Running ANY Production Tests:

1. **GET APPROVAL** - Never run without team lead approval
2. **UNDERSTAND COSTS** - Each test costs REAL money ($0.02 - $0.70 per test)
3. **READ DOCUMENTATION** - Review `tests/production/e2e/README.md` first
4. **CHECK BALANCES** - Ensure production wallets have sufficient funds
5. **CHECK NFTs** - Ensure sender wallet has at least 1 NFT (tests use existing NFTs!)
6. **CHECK USDC** - Ensure receiver wallet has sufficient USDC (tests use existing USDC!)
7. **MONITOR EXECUTION** - Watch logs and health checks during tests
8. **DOCUMENT EVERYTHING** - Record why tests were run and results

### When to Run Production Tests:

- ✅ After major production deployment
- ✅ After critical hotfix
- ✅ Before announcing new features
- ✅ During post-mortem validation
- ❌ NOT in CI/CD pipelines
- ❌ NOT automatically
- ❌ NOT without approval

---

## Test Scenarios

| Test | Cost | Duration | Purpose |
|------|------|----------|---------|
| **01 - Happy Path** | ~$0.50 | 45s | Full escrow flow validation |
| **02 - Expiry/Refund** | ~$0.40 | 30s | Automatic expiry handling |
| **03 - Admin Cancel** | ~$0.40 | 15s | Admin cancellation flow |
| **04 - Zero Fee** | ~$0.40 | 10s | Fee calculation validation |
| **05 - Idempotency** | ~$0.50 | 15s | Duplicate prevention |
| **06 - Concurrent** | ~$0.70 | 25s | Parallel operations |
| **07 - Edge Cases** | ~$0.40 | 30s | Error handling |
| **ALL TESTS** | **~$3.30** | **3+ min** | **Full validation** |

*Costs based on SOL at ~$200 - **Reduced by 40% using existing NFTs!***

---

## Quick Start (With Safety Checks)

### 1. Review Requirements

```bash
# Read the comprehensive guide
cat tests/production/e2e/README.md
```

### 2. Verify Environment

```bash
# Check .env.production exists
ls .env.production

# Verify API is healthy
curl https://api.easyescrow.ai/health
```

### 3. Check Wallet Balances

```bash
# npm run production:verify-balances
```

### 4. Get Approval

- Document reason for running tests
- Get team lead approval
- Communicate with team

### 5. Run Individual Test (Recommended)

```bash
# Run single test (safest)
npm run test:production:e2e:01-solana-nft-usdc-happy-path

# With verbose output
npm run test:production:e2e:01-solana-nft-usdc-happy-path:verbose
```

### 6. Monitor Execution

```bash
# In another terminal, watch logs
doctl apps logs a6e6452b-1ec6-4316-82fe-e4069d089b49 --follow
```

---

## Configuration Differences

### Staging vs Production

| Aspect | Staging (Devnet) | Production (Mainnet) |
|--------|-----------------|---------------------|
| **Network** | devnet | mainnet-beta |
| **Program ID** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` |
| **USDC Mint** | Test USDC (Devnet) | Circle USDC (Mainnet) |
| **API** | staging-api.easyescrow.ai | api.easyescrow.ai |
| **Test Amounts** | 0.1 USDC | 0.01 USDC (10x smaller) |
| **Costs** | FREE | REAL MONEY |
| **Frequency** | Run anytime | Only when necessary |

### Environment Variables

**`.env.production`** must contain:

```bash
SOLANA_RPC_URL=https://your-premium-mainnet-rpc-url
PRODUCTION_API_BASE_URL=https://api.easyescrow.ai
NODE_ENV=production
```

**Never use public RPC endpoints for production tests!**

---

## Available Commands

### Run All Tests (NOT RECOMMENDED)

```bash
# Costs ~$5.60 - requires approval!
npm run test:production:e2e
npm run test:production:e2e:verbose
```

### Run Individual Tests (RECOMMENDED)

```bash
# Test 01: Happy Path (~$0.50 - reduced!)
npm run test:production:e2e:01-solana-nft-usdc-happy-path
npm run test:production:e2e:01-solana-nft-usdc-happy-path:verbose

# Test 02: Expiry/Refund (~$0.60)
npm run test:production:e2e:02-agreement-expiry-refund
npm run test:production:e2e:02-agreement-expiry-refund:verbose

# Test 03: Admin Cancellation (~$0.40)
npm run test:production:e2e:03-admin-cancellation
npm run test:production:e2e:03-admin-cancellation:verbose

# Test 04: Zero Fee (~$0.40)
npm run test:production:e2e:04-zero-fee-transactions
npm run test:production:e2e:04-zero-fee-transactions:verbose

# Test 05: Idempotency (~$0.50)
npm run test:production:e2e:05-idempotency-handling
npm run test:production:e2e:05-idempotency-handling:verbose

# Test 06: Concurrent (~$0.70 - reduced!)
npm run test:production:e2e:06-concurrent-operations
npm run test:production:e2e:06-concurrent-operations:verbose

# Test 07: Edge Cases (~$0.60)
npm run test:production:e2e:07-edge-cases-validation
npm run test:production:e2e:07-edge-cases-validation:verbose
```

---

## Production Wallets

### Required Wallets

Production tests require these wallets in `wallets/production/`:

1. **production-sender.json** - NFT seller
   - **Address:** `B7jiNm8TKvaoad3N36pyDeXMSVPmvHLaXZMDC7udhTfr`
   - **Needs:** SOL for transactions + **at least 1 NFT**
   - **Note:** Tests randomly select existing NFTs (no minting!)
2. **production-receiver.json** - USDC buyer
   - **Address:** `3qYD5LwHSuxwLi2mECzoVEmH2M7aehNjodUZCdmnCwtY`
   - **Needs:** SOL for transactions + **sufficient USDC** (minimum 0.01 USDC)
   - **Note:** Tests use existing USDC (no minting!)
3. **production-admin.json** - Agreement signer (needs SOL)
4. **production-fee-collector.json** - Platform fees (receives USDC)

**💡 Cost Optimizations:**
- **NFTs:** Use existing NFTs (no minting!) - saves creation costs
- **USDC:** Use existing USDC (no minting/transfers!) - saves transaction fees
- **Combined savings:** ~40% cost reduction per test run!

### Security

- ⚠️ **Never commit production wallets to git**
- 🔒 **Keep private keys secure**
- 💰 **Fund with minimal amounts** (only what's needed for testing)
- 📊 **Monitor balances** after each test run

---

## Monitoring During Tests

### What to Watch:

1. **Application Logs:**
   ```bash
   doctl apps logs a6e6452b-1ec6-4316-82fe-e4069d089b49 --follow
   ```

2. **Health Endpoint:**
   ```bash
   watch -n 2 curl https://api.easyescrow.ai/health
   ```

3. **Solana Explorer:**
   - https://explorer.solana.com/
   - Monitor transactions in real-time
   - Verify settlements

4. **Database:**
   - Check agreement status changes
   - Verify receipt generation
   - Monitor transaction logs

### Stop Immediately If:

- ❌ Multiple failed transactions
- ❌ Health check failures
- ❌ Database connection errors
- ❌ Unexpected error rates
- ❌ Slow RPC responses (>5s)

---

## Test Run Checklist

### Before Running:

- [ ] Read `tests/production/e2e/README.md`
- [ ] Get team lead approval
- [ ] Document reason for tests
- [ ] Verify `.env.production` configured
- [ ] Check production API health
- [ ] Verify wallet balances
- [ ] Ensure premium RPC configured
- [ ] Confirm database backup recent
- [ ] Notify team of test run
- [ ] Low traffic period confirmed

### During Tests:

- [ ] Monitoring logs in real-time
- [ ] Watching health endpoint
- [ ] Tracking Solana transactions
- [ ] Recording any errors
- [ ] Documenting costs

### After Tests:

- [ ] Document results
- [ ] Calculate total costs
- [ ] Report any issues found
- [ ] Update team on findings
- [ ] Archive test run report

---

## Troubleshooting

### Insufficient Funds

**Symptom:** `insufficient funds` errors

**Solution:**
- Check wallet balances
- Fund wallets with minimal amounts
- Verify USDC accounts exist

### RPC Rate Limits

**Symptom:** 429 errors from RPC

**Solution:**
- Use premium RPC (Helius, QuickNode)
- Don't run all tests at once
- Add delays between tests

### Failed Transactions

**Symptom:** Transaction failures

**Solution:**
- Check Solana network health (solanabeach.io)
- Verify RPC endpoint status
- Increase timeouts
- Retry failed test individually

### Account Errors

**Symptom:** Token account not found

**Solution:**
- Ensure USDC accounts created
- Verify Circle USDC mint address
- Check wallet funding

---

## Alternative: Manual Smoke Testing

Instead of automated tests, consider:

1. **Manual API Testing:**
   - Use Postman/curl
   - Test with minimal amounts
   - Verify each step manually

2. **Focused Testing:**
   - Test only changed code paths
   - Use production-like data
   - Monitor specific features

3. **Gradual Validation:**
   - Test with internal accounts first
   - Monitor for issues
   - Expand testing gradually

---

## Cost Tracking Template

```markdown
# Production E2E Test Run

**Date:** YYYY-MM-DD  
**Run By:** [Your Name]  
**Approval:** [Team Lead]  
**Reason:** [Why tests were run]

## Tests Executed:
- [ ] Test 01: Happy Path
- [ ] Test 02: Expiry/Refund
- [ ] Test 03: Admin Cancel
- [ ] Test 04: Zero Fee
- [ ] Test 05: Idempotency
- [ ] Test 06: Concurrent
- [ ] Test 07: Edge Cases

## Results:
- **Passed:** X/Y
- **Failed:** Y/Y
- **Errors:** [List]

## Costs:
- **SOL Spent:** ~X SOL
- **USDC Spent:** ~$X
- **Total Cost:** ~$X

## Issues Found:
[Details of any issues]

## Recommendations:
[Suggestions for improvements]
```

---

## Related Documentation

- **Staging Tests:** `tests/staging/e2e/README.md`
- **Test Setup:** `docs/testing/TEST_SETUP.md`
- **Production Deployment:** `docs/deployment/PRODUCTION_DEPLOYMENT_SUCCESS.md`
- **API Documentation:** https://api.easyescrow.ai/

---

## Support

**Questions or Issues:**
- Review staging tests first (safer)
- Check comprehensive README
- Consult team lead
- Document all concerns

---

**⚠️ REMEMBER: Production tests cost REAL MONEY. Only run when absolutely necessary!**

---

**Created:** 2025-10-28  
**Last Updated:** 2025-10-28  
**Maintained By:** Development Team

