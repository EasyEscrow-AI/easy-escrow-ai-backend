# STAGING Comprehensive E2E Tests

Complete end-to-end test suite for validating the STAGING environment before production deployment.

## Overview

These tests validate the entire escrow system on the STAGING environment, covering:

- ✅ Happy path flows (complete agreement lifecycle)
- ✅ Expiry and refund mechanisms
- ✅ Admin cancellation workflows
- ✅ Platform fee collection and distribution
- ✅ Webhook delivery and retry logic
- ✅ Idempotency key handling
- ✅ Concurrent operation safety
- ✅ Edge case error handling

## Prerequisites

### 1. STAGING Environment Setup

Ensure STAGING environment is fully deployed and configured:

```bash
# Verify STAGING deployment
npm run staging:verify

# Or run smoke tests first
npm run test:staging:smoke
```

### 2. Wallet Setup

STAGING wallets must be funded and ready:

```bash
# Fund STAGING wallets (if needed)
npm run staging:fund-wallets

# Check wallet balances
solana balance AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z --url devnet  # Sender
solana balance 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 --url devnet  # Receiver
solana balance 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R --url devnet  # Admin
solana balance 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ --url devnet  # Fee Collector
```

**Required Balances:**
- Sender: ~5 SOL
- Receiver: ~5 SOL + test USDC
- Admin: ~3 SOL
- Fee Collector: ~3 SOL

### 3. Environment Variables

Set the API endpoint:

```bash
# For deployed STAGING API
export STAGING_API_BASE_URL=https://staging-api.easyescrow.ai

# For local testing against STAGING backend
export STAGING_API_BASE_URL=http://localhost:3000
```

## Running Tests

### Run All E2E Tests

```bash
npm run test:staging:e2e
```

### Run with Verbose Output

```bash
npm run test:staging:e2e:verbose
```

### Run Specific Test Scenarios

```bash
# Run only happy path tests
npx mocha --require ts-node/register \
  tests/e2e/staging/staging-comprehensive-e2e.test.ts \
  --grep "Happy Path" \
  --timeout 300000

# Run only expiry tests
npx mocha --require ts-node/register \
  tests/e2e/staging/staging-comprehensive-e2e.test.ts \
  --grep "Expiry" \
  --timeout 300000
```

## Test Scenarios

### Scenario 1: Happy Path

**Description:** Complete agreement flow from creation to settlement

**Steps:**
1. Verify wallet balances
2. Create test NFT
3. Create escrow agreement via API
4. Deposit NFT (seller)
5. Deposit USDC (buyer)
6. Wait for automatic settlement
7. Verify fund distribution (seller, buyer, fee collector)
8. Verify receipt generation

**Expected Results:**
- Seller receives 99% of swap amount in USDC
- Buyer receives NFT
- Fee collector receives 1% platform fee
- Agreement status: `SETTLED`
- Receipt generated and stored

### Scenario 2: Expiry and Cancellation

**Description:** Test agreement expiry and admin cancellation workflows

**Test Cases:**

#### 2a. Expiry with Partial Deposits
1. Create agreement with short expiry (5 minutes)
2. Deposit only NFT (no USDC)
3. Wait for expiry
4. Verify refund process triggered
5. Verify NFT returned to sender

**Expected Results:**
- Agreement status: `EXPIRED`
- NFT refunded to seller
- No USDC transferred

#### 2b. Admin Cancellation
1. Create agreement
2. Make both deposits
3. Admin triggers cancellation
4. Verify refund process
5. Verify webhook notifications sent

**Expected Results:**
- Agreement status: `CANCELLED`
- Funds returned to original depositors
- Webhook events delivered

### Scenario 3: Platform Fee Collection

**Description:** Validate fee calculation and distribution

**Test Cases:**

#### 3a. Standard Fee (1%)
1. Execute settlement with 1% fee
2. Verify fee amount calculation
3. Verify fee sent to fee collector wallet
4. Verify seller received correct amount (99%)

**Expected Results:**
- Fee collector receives exactly 1% of swap amount
- Seller receives exactly 99% of swap amount

#### 3b. Zero Fee
1. Create agreement with `feeBps = 0`
2. Execute settlement
3. Verify no fees collected
4. Verify seller receives full amount (100%)

**Expected Results:**
- Fee collector receives 0 USDC
- Seller receives 100% of swap amount

### Scenario 4: Webhook Delivery

**Description:** Test webhook notification system

**Test Cases:**

#### 4a. Webhook Delivery
1. Configure test webhook endpoint
2. Create agreement
3. Trigger various events (deposit, settlement)
4. Verify webhook payloads received
5. Verify proper event data in payloads

**Expected Results:**
- All webhooks delivered successfully
- Payloads contain correct event data
- Proper retry behavior on failures

#### 4b. Idempotency
1. Create agreement with idempotency key
2. Submit same request again (same key)
3. Verify no duplicate created
4. Verify original agreement returned

**Expected Results:**
- Only one agreement created
- Second request returns existing agreement
- Redis stores idempotency keys correctly

### Scenario 5: Concurrent Operations & Edge Cases

**Description:** Test system robustness and error handling

**Test Cases:**

#### 5a. Concurrent Agreement Creation
1. Create multiple agreements simultaneously
2. Verify no race conditions
3. Verify database consistency

**Expected Results:**
- All agreements created successfully
- No duplicate IDs or corrupted state
- Proper locking mechanisms working

#### 5b. Wrong Mint Address
1. Attempt to create agreement with invalid NFT mint
2. Verify proper error handling
3. Verify no partial state created

**Expected Results:**
- Request rejected with clear error message
- No agreement record created
- No blockchain state modified

#### 5c. Insufficient Funds
1. Attempt deposit with insufficient balance
2. Verify transaction fails gracefully
3. Verify proper error message returned

**Expected Results:**
- Transaction rejected
- Clear error message about insufficient funds
- Agreement remains in `PENDING` state

#### 5d. Invalid Signatures
1. Submit transaction with wrong signer
2. Verify rejection
3. Verify security measures working

**Expected Results:**
- Transaction rejected
- Security validation working
- No unauthorized state changes

## Test Configuration

Configuration is centralized in `test-config.ts`:

```typescript
{
  programId: 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei',
  network: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',
  apiBaseUrl: process.env.STAGING_API_BASE_URL || 'http://localhost:3000',
  usdcMint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
  testAmounts: {
    swap: 0.1,
    fee: 0.01,
    minSOL: 0.1,
  },
}
```

## Helper Modules

### `test-config.ts`

- Centralized test configuration
- Explorer URL generators
- Idempotency key generators
- Amount calculators

### `test-helpers.ts`

- Wallet management functions
- Token balance checking
- Agreement creation helpers
- Status polling utilities
- Transaction signing helpers

## Troubleshooting

### "Wallet file not found"

**Solution:** Ensure STAGING wallets are generated and in the correct location:

```bash
ls -la wallets/staging/
# Should show:
# - staging-sender.json
# - staging-receiver.json
# - staging-admin.json
# - staging-fee-collector.json
```

### "Insufficient funds"

**Solution:** Fund the wallets:

```bash
npm run staging:fund-wallets
```

### "Connection timeout"

**Solution:** Verify RPC endpoint is accessible:

```bash
curl -X POST https://api.devnet.solana.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

### "API endpoint not responding"

**Solution:** Verify STAGING API is deployed and healthy:

```bash
# For deployed STAGING
curl https://staging-api.easyescrow.ai/health

# For local backend
curl http://localhost:3000/health
```

### "Test timeout"

**Solution:** Increase timeout or check network connectivity:

```bash
# Increase timeout (already set to 5 minutes)
# Check devnet status: https://status.solana.com/

# Verify wallet balances are sufficient
npm run staging:fund-wallets
```

## Expected Test Duration

| Scenario | Expected Duration |
|----------|-------------------|
| Happy Path | ~30-60 seconds |
| Expiry Tests | ~5-7 minutes (waiting for expiry) |
| Cancellation | ~20-30 seconds |
| Fee Collection | ~20-30 seconds |
| Webhooks | ~15-30 seconds |
| Idempotency | ~10-15 seconds |
| Concurrent Ops | ~30-60 seconds |
| Edge Cases | ~15-30 seconds each |
| **Total Suite** | **~10-15 minutes** |

## Output and Reporting

Test results are logged to console with:
- ✅ Success indicators
- ❌ Failure indicators
- 🔗 Explorer links for transactions
- 📊 Balance summaries
- ⏱️ Timing metrics

After tests complete, review results and document in:
- `docs/testing/STAGING_E2E_RESULTS.md`

## CI/CD Integration

These tests should be run:

1. **After STAGING deployment** (automatically via CI)
2. **Before production promotion** (manual verification)
3. **After significant backend changes** (regression testing)

## Related Documentation

- [STAGING Reference](../../../docs/STAGING_REFERENCE.md) - Complete STAGING infrastructure
- [STAGING Wallets](../../../docs/STAGING_WALLETS.md) - Wallet management
- [Program IDs](../../../docs/PROGRAM_IDS.md) - Program ID registry
- [STAGING Strategy](../../../docs/architecture/STAGING_STRATEGY.md) - Overall approach

---

**Last Updated:** 2025-01-21  
**Maintained By:** Development Team

