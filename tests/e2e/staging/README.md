# STAGING E2E Tests

Modular end-to-end test suite for STAGING environment validation.

## Quick Start

### Run All Scenarios

```bash
# Run all 8 scenarios in sequence (via staging-all-e2e.test.ts orchestrator)
npm run test:staging:e2e
npm run test:staging:e2e:verbose
```

**Note:** The `staging-all-e2e.test.ts` file imports all individual test scenarios in sequence. This eliminates code duplication while allowing both comprehensive and individual test execution.

### Run Individual Scenarios

```bash
# 01 - Happy Path
npm run test:staging:e2e:01-solana-nft-usdc-happy-path
npm run test:staging:e2e:01-solana-nft-usdc-happy-path:verbose

# 02 - Agreement Expiry & Refund
npm run test:staging:e2e:02-agreement-expiry-refund
npm run test:staging:e2e:02-agreement-expiry-refund:verbose

# 03 - Admin Cancellation
npm run test:staging:e2e:03-admin-cancellation
npm run test:staging:e2e:03-admin-cancellation:verbose

# 04 - Platform Fee Collection
npm run test:staging:e2e:04-platform-fee-collection
npm run test:staging:e2e:04-platform-fee-collection:verbose

# 05 - Webhook Delivery
npm run test:staging:e2e:05-webhook-delivery
npm run test:staging:e2e:05-webhook-delivery:verbose

# 06 - Idempotency Handling
npm run test:staging:e2e:06-idempotency-handling
npm run test:staging:e2e:06-idempotency-handling:verbose

# 07 - Concurrent Operations
npm run test:staging:e2e:07-concurrent-operations
npm run test:staging:e2e:07-concurrent-operations:verbose

# 08 - Edge Cases & Validation
npm run test:staging:e2e:08-edge-cases-validation
npm run test:staging:e2e:08-edge-cases-validation:verbose
```

## Test Architecture

### File Structure

```
tests/e2e/staging/
├── staging-all-e2e.test.ts              # Master orchestrator (imports all tests)
├── 01-solana-nft-usdc-happy-path.test.ts
├── 02-agreement-expiry-refund.test.ts
├── 03-admin-cancellation.test.ts
├── 04-platform-fee-collection.test.ts
├── 05-webhook-delivery.test.ts
├── 06-idempotency-handling.test.ts
├── 07-concurrent-operations.test.ts
├── 08-edge-cases-validation.test.ts
├── shared-test-utils.ts                 # Common utilities
├── test-config.ts                       # Configuration
└── README.md                            # This file
```

### How It Works

**Single Source of Truth:**
- Each test scenario exists in ONE file only
- `staging-all-e2e.test.ts` imports all individual test files
- No code duplication = easier maintenance
- Changes to individual tests automatically reflect in "run all" mode

**Run Options:**
- `npm run test:staging:e2e` → Runs all 8 scenarios via orchestrator
- `npm run test:staging:e2e:01-*` → Runs specific scenario independently

### Shared Utilities
- **`shared-test-utils.ts`** - Common functions, types, and helpers
- **`test-config.ts`** - Centralized configuration

### Test Scenarios

#### 01. Solana NFT-for-USDC Happy Path ✅
**File:** `01-solana-nft-usdc-happy-path.test.ts`  
**Commands:** 
- `npm run test:staging:e2e:01-solana-nft-usdc-happy-path`
- `npm run test:staging:e2e:01-solana-nft-usdc-happy-path:verbose`

**Duration:** ~46 seconds  
**Tests:** 11 test cases

**Flow:**
1. Setup USDC accounts for all parties
2. Create test NFT on Solana
3. Create escrow agreement via API
4. Deposit NFT from sender
5. Deposit USDC from receiver
6. Wait for automatic settlement
7. Verify NFT transfer to receiver
8. Verify USDC distribution with platform fees
9. Verify receipt generation with all transaction IDs

**Status:** ✅ 11/11 passing (100% success rate)

---

#### 02. Agreement Expiry & Refund ✅
**File:** `02-agreement-expiry-refund.test.ts`  
**Commands:**
- `npm run test:staging:e2e:02-agreement-expiry-refund`
- `npm run test:staging:e2e:02-agreement-expiry-refund:verbose`

**Duration:** ~30 seconds  
**Tests:** 2 test cases

**Flow:**
1. Create agreement with 15-second expiry
2. Optionally deposit NFT (partial deposit)
3. Wait for agreement to expire
4. Verify status changes to EXPIRED
5. Verify refund processing triggered
6. Verify NFT returned to sender

**Note:** Tests automatic expiry handling and refund workflows.

---

#### 03. Admin Cancellation ✅
**File:** `03-admin-cancellation.test.ts`  
**Commands:**
- `npm run test:staging:e2e:03-admin-cancellation`
- `npm run test:staging:e2e:03-admin-cancellation:verbose`

**Duration:** ~15 seconds  
**Tests:** 1 test case

**Flow:**
1. Create escrow agreement
2. Admin initiates cancellation (via API with admin key)
3. Verify status changes to CANCELLED
4. Verify refund processing (if deposits were made)

**Note:** Requires `ADMIN_API_KEY` in environment.

---

#### 04. Platform Fee Collection ✅
**File:** `04-platform-fee-collection.test.ts`  
**Commands:**
- `npm run test:staging:e2e:04-platform-fee-collection`
- `npm run test:staging:e2e:04-platform-fee-collection:verbose`

**Duration:** ~10 seconds  
**Tests:** 2 test cases

**Tests:**
1. Verify standard fee collection (1% platform fee)
2. Zero-fee transactions acceptance

**Note:** Fee distribution is also thoroughly tested in Test 01 (Happy Path).

---

#### 05. Webhook Delivery ⏭️
**File:** `05-webhook-delivery.test.ts`  
**Commands:**
- `npm run test:staging:e2e:05-webhook-delivery`
- `npm run test:staging:e2e:05-webhook-delivery:verbose`

**Duration:** ~5 seconds  
**Tests:** 1 test case (currently skipped)

**Note:** Requires external webhook receiver (webhook.site or similar). Skipped in automated E2E suite.

**Events to verify:**
- AGREEMENT_CREATED
- DEPOSIT_DETECTED
- AGREEMENT_SETTLED
- AGREEMENT_CANCELLED

---

#### 06. Idempotency Handling ✅
**File:** `06-idempotency-handling.test.ts`  
**Commands:**
- `npm run test:staging:e2e:06-idempotency-handling`
- `npm run test:staging:e2e:06-idempotency-handling:verbose`

**Duration:** ~15 seconds  
**Tests:** 1 test case

**Flow:**
1. Create agreement with idempotency key
2. Retry same request with same idempotency key
3. Verify same agreement is returned (no duplicate)
4. Verify no new agreement created

**Note:** Tests duplicate request prevention via idempotency keys.

---

#### 07. Concurrent Operations ✅
**File:** `07-concurrent-operations.test.ts`  
**Commands:**
- `npm run test:staging:e2e:07-concurrent-operations`
- `npm run test:staging:e2e:07-concurrent-operations:verbose`

**Duration:** ~25 seconds  
**Tests:** 1 test case

**Flow:**
1. Create 5 NFTs for testing
2. Create 5 agreements concurrently (parallel requests)
3. Verify all succeed
4. Verify all agreements have unique IDs
5. Verify no race conditions detected

**Note:** Tests database transaction isolation and concurrent request handling.

---

#### 08. Edge Cases & Validation ✅
**File:** `08-edge-cases-validation.test.ts`  
**Commands:**
- `npm run test:staging:e2e:08-edge-cases-validation`
- `npm run test:staging:e2e:08-edge-cases-validation:verbose`

**Duration:** ~30 seconds  
**Tests:** 3 test cases

**Tests:**
1. Invalid mint address handling
2. Insufficient funds detection
3. Invalid signature rejection

**Note:** Tests error handling and input validation across the system.

## Configuration

### Environment Variables

Tests use the following environment variables from `.env.staging`:

```bash
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=...  # Helius RPC (fast, reliable)
STAGING_API_BASE_URL=https://staging-api.easyescrow.ai
NODE_ENV=staging
```

**Note:** Tests automatically load `.env.staging` with `override: true` to use Helius RPC instead of the public devnet RPC.

### Test Configuration

Located in `test-config.ts`:

```typescript
{
  programId: 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei',
  network: 'devnet',
  usdcMint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
  apiBaseUrl: 'https://staging-api.easyescrow.ai',
  testAmounts: {
    swap: 0.1,      // USDC
    fee: 0.01,      // 1%
    minSOL: 0.1,
  }
}
```

### Wallets

Tests use static wallets from `wallets/staging/`:
- `staging-sender.json` - NFT seller
- `staging-receiver.json` - USDC buyer  
- `staging-admin.json` - Agreement signer
- `staging-fee-collector.json` - Platform fee recipient

**⚠️ Important:** Ensure wallets have sufficient SOL and USDC before running tests.

## Writing New Test Scenarios

### Template

```typescript
import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Connection } from '@solana/web3.js';
import { STAGING_CONFIG } from './test-config';
import {
  loadStagingWallets,
  createTestNFT,
  // ... other utilities
  type StagingWallets,
} from './shared-test-utils';

describe('STAGING E2E - Your Scenario', function () {
  this.timeout(180000); // 3 minutes

  let connection: Connection;
  let wallets: StagingWallets;

  before(async function () {
    connection = new Connection(STAGING_CONFIG.rpcUrl, 'confirmed');
    wallets = loadStagingWallets();
    // Additional setup...
  });

  it('should do something', async function () {
    // Your test logic here
  });
});
```

### Best Practices

1. **Use Shared Utilities** - Don't duplicate code
2. **Descriptive Test Names** - Use "should..." format
3. **Console Logging** - Add visual feedback with emojis
4. **Proper Timeouts** - Set realistic timeouts per test
5. **Clean Setup** - Initialize in `before()` hook
6. **Assertions** - Use Chai's expect syntax
7. **Error Handling** - Log detailed error information

### Example Test

```typescript
it('should create test NFT for sender', async function () {
  console.log('🎨 Creating test NFT...\n');
  
  const nft = await createTestNFT(connection, wallets.sender);
  
  console.log(`   NFT Mint: ${nft.mint.toBase58()}`);
  console.log(`   Owner: ${wallets.sender.publicKey.toBase58()}\n`);
  
  expect(nft.mint).to.be.instanceOf(PublicKey);
  expect(nft.tokenAccount).to.be.instanceOf(PublicKey);
});
```

## Troubleshooting

### Rate Limiting (429 Errors)

**Problem:** `Too many creation requests from this IP`

**Solution:**
- Run tests individually instead of all at once
- Add delays between test runs
- Wait a few minutes before retrying

### Insufficient Funds

**Problem:** `insufficient funds` errors

**Solution:**
```bash
# Check wallet balances
npm run staging:verify

# Fund wallets with SOL
npm run staging:fund-wallets
```

### Account Not Found

**Problem:** `TokenAccountNotFoundError`

**Solution:**
- Ensure USDC accounts are created before use
- Use `setupUSDCAccounts()` helper in test setup
- Check that wallets have been funded

### Connection Timeout

**Problem:** RPC connection timeouts

**Solution:**
- Use a reliable RPC endpoint (Helius, QuickNode)
- Increase timeout values in test config
- Check network connectivity

## Utilities Reference

### Wallet Management

```typescript
// Load all staging wallets
const wallets = loadStagingWallets();

// Access individual wallets
wallets.sender
wallets.receiver
wallets.admin
wallets.feeCollector
```

### Token Operations

```typescript
// Create test NFT
const nft = await createTestNFT(connection, owner);

// Setup USDC accounts
const accounts = await setupUSDCAccounts(
  connection,
  usdcMint,
  sender,
  receiver,
  feeCollector // optional
);

// Get token balance (handles decimals automatically)
const balance = await getTokenBalance(connection, tokenAccount);
```

### Balance Tracking

```typescript
// Get comprehensive balances
const balances = await getInitialBalances(
  connection,
  wallets,
  usdcAccounts
);

// Display formatted balances
displayBalances(balances, 'Initial Balances');
```

### API Helpers

```typescript
// Generate unique idempotency key
const key = generateIdempotencyKey('my-test');

// Get explorer URL
const url = getExplorerUrl(txId, 'tx');
const addressUrl = getExplorerUrl(pubkey, 'address');

// Wait for agreement status
const agreement = await waitForAgreementStatus(
  agreementId,
  'SETTLED',
  60,    // max attempts
  2000   // interval ms
);
```

## Known Issues

1. **Rate Limiting** - Running all scenarios together triggers 429 errors
2. **Receipt Generation** - Receipt ID may not be immediately available (async processing)

## Contributing

To add a new test scenario:

1. Create new test file: `0X-scenario-name.test.ts`
2. Import shared utilities from `shared-test-utils.ts`
3. Follow the template structure above
4. Add npm scripts to `package.json`:
   ```json
   "test:staging:e2e:scenario-name": "mocha --require ts-node/register --no-config tests/e2e/staging/0X-scenario-name.test.ts --timeout 180000 --reporter spec --colors"
   ```
5. Update this README with new scenario details
6. Test thoroughly before committing

## Support

For issues or questions:
- Check existing test implementations for examples
- Review shared utilities documentation
- Consult staging deployment docs
- Check API documentation at `/api-docs`

---

**Last Updated:** 2025-10-22  
**Status:** All tests passing (11/11) ✅  
**Maintained By:** Development Team
