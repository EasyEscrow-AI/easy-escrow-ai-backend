# STAGING E2E Tests

Modular end-to-end test suite for STAGING environment validation.

## Quick Start

### Run Specific Scenarios

```bash
# Happy Path: Complete NFT-for-USDC swap
npm run test:staging:e2e:happy-path

# Verbose mode with full stack traces
npm run test:staging:e2e:happy-path:verbose
```

### Run All Scenarios

```bash
# Comprehensive test (all scenarios)
npm run test:staging:e2e
npm run test:staging:e2e:verbose
```

## Test Structure

### Shared Utilities
- **`shared-test-utils.ts`** - Common functions, types, and helpers
- **`test-config.ts`** - Centralized configuration
- **`test-helpers.ts`** - Additional helper functions

### Test Scenarios

#### 01. Solana NFT-for-USDC Happy Path ✅ (Available)
**File:** `01-solana-nft-usdc-happy-path.test.ts`  
**Command:** `npm run test:staging:e2e:happy-path`  
**Duration:** ~46 seconds  
**Tests:** 11 test cases

**Flow:**
1. Setup USDC accounts
2. Create test NFT on Solana
3. Create escrow agreement via API
4. Deposit NFT from sender
5. Deposit USDC from receiver
6. Wait for automatic settlement
7. Verify NFT transfer
8. Verify USDC distribution with fees
9. Verify receipt generation

**Status:** ✅ 11/11 passing (100% success rate)

#### 02. Expiry & Cancellation (Planned)
**File:** `02-expiry-cancellation.test.ts`  
**Command:** `npm run test:staging:e2e:expiry` (not yet implemented)

**Tests:**
- Agreement expiry handling
- Automatic refunds
- Admin cancellation
- Refund verification

#### 03. Fee Collection (Planned)
**File:** `03-fee-collection.test.ts`  
**Command:** `npm run test:staging:e2e:fees` (not yet implemented)

**Tests:**
- Platform fee calculations
- Fee distribution verification
- Zero-fee transactions
- Variable fee rates

#### 04. Idempotency & Webhooks (Planned)
**File:** `04-idempotency-webhooks.test.ts`  
**Command:** `npm run test:staging:e2e:idempotency` (not yet implemented)

**Tests:**
- Duplicate request handling
- Webhook delivery
- Event notifications
- Retry logic

#### 05. Edge Cases (Planned)
**File:** `05-edge-cases.test.ts`  
**Command:** `npm run test:staging:e2e:edge-cases` (not yet implemented)

**Tests:**
- Concurrent operations
- Invalid inputs
- Insufficient funds
- Invalid signatures
- Rate limiting

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
