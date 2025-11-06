# Production E2E Tests Conversion Guide

**Date:** 2025-01-06
**Status:** Tests 01-02 Complete ✅, Tests 03-09 Remaining 🔄

---

## Summary

Production tests 01 and 02 have been created with timing instrumentation. Tests 03-09 need to be converted from staging to production.

### ✅ Completed

- **Test 01:** NFT-for-SOL Happy Path (WITH TIMING) ⏱️
- **Test 02:** NFT-for-NFT with Fee (WITH TIMING) ⏱️

### 🔄 Remaining

- **Test 03:** NFT-for-NFT plus SOL (WITH TIMING) ⏱️ - Priority 1
- **Test 04:** Agreement Expiry Refund (no timing)
- **Test 05:** Admin Cancellation (no timing)
- **Test 06:** Zero Fee Transactions (no timing)
- **Test 07:** Idempotency Handling (no timing)
- **Test 08:** Concurrent Operations (no timing)
- **Test 09:** Edge Cases Validation (no timing)

---

## Conversion Pattern

### Step-by-Step Conversion (Staging → Production)

#### 1. Environment & Imports (ALL TESTS)

**Change FROM:**
```typescript
// Load .env.staging file
const envPath = path.resolve(process.cwd(), '.env.staging');

import { STAGING_CONFIG } from './test-config';
import {
  loadStagingWallets,
  createTestNFT,  // ← Remove for production
  type StagingWallets,
} from './shared-test-utils';
```

**Change TO:**
```typescript
// Load .env.production file
const envPath = path.resolve(process.cwd(), '.env.production');

import { PRODUCTION_CONFIG } from './test-config';
import {
  loadPRODUCTIONWallets,
  getRandomNFTFromWallet,  // ← Use existing NFTs in production
  archiveAgreements,  // ← Add for cleanup
  type PRODUCTIONWallets,
} from './shared-test-utils';
```

#### 2. Test Configuration (ALL TESTS)

**Change:**
- `STAGING_CONFIG` → `PRODUCTION_CONFIG`
- `StagingWallets` → `PRODUCTIONWallets`
- `loadStagingWallets()` → `loadPRODUCTIONWallets()`

#### 3. Test Amounts (ALL TESTS)

Production uses REAL mainnet values:

**Staging (devnet - free):**
```typescript
const SOL_AMOUNT = 0.1; // 0.1 SOL (free devnet)
```

**Production (mainnet - real money):**
```typescript
const SOL_AMOUNT = 0.01; // 0.01 SOL (~$2 @ $200/SOL)
```

#### 4. NFT Creation (ALL TESTS)

**Change FROM:**
```typescript
it('should create NFT A for the seller', async function () {
  nftA = await createTestNFT(connection, wallets.sender);
});
```

**Change TO:**
```typescript
it('should select random NFT A from seller wallet', async function () {
  nftA = await getRandomNFTFromWallet(connection, wallets.sender);
});
```

#### 5. Cleanup (ALL TESTS)

**Change FROM:**
```typescript
after(async function () {
  if (agreement?.agreementId) {
    await axios.delete(
      `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
    );
  }
});
```

**Change TO:**
```typescript
// Track agreement IDs
const agreementIds: string[] = [];

after(async function () {
  if (agreementIds.length > 0) {
    await archiveAgreements(agreementIds);
  }
  
  // Display timing metrics if applicable
});

// In agreement creation test:
agreementIds.push(agreement.agreementId);
```

#### 6. Timing Instrumentation (TESTS 03 ONLY)

Add timing for happy path tests (03):

```typescript
// Add at top of describe block
let agreementCreationTime: number = 0;
let settlementCompletionTime: number = 0;
let totalSwapDuration: number = 0;

// In "create agreement" test - START TIMER
agreementCreationTime = Date.now();
console.log(`⏱️  Timer started: ${new Date(agreementCreationTime).toISOString()}`);

// In "wait for settlement" test - STOP TIMER
settlementCompletionTime = Date.now();
totalSwapDuration = settlementCompletionTime - agreementCreationTime;
console.log(`⏱️  Timer stopped: ${new Date(settlementCompletionTime).toISOString()}`);
console.log(`⏱️  Total Duration: ${(totalSwapDuration / 1000).toFixed(2)}s`);

// In cleanup hook - DISPLAY TIMING
if (agreementCreationTime > 0 && settlementCompletionTime > 0) {
  console.log('\n⏱️  TIMING METRICS');
  console.log(`Agreement Creation: ${new Date(agreementCreationTime).toISOString()}`);
  console.log(`Settlement Complete: ${new Date(settlementCompletionTime).toISOString()}`);
  console.log(`Total Swap Duration: ${(totalSwapDuration / 1000).toFixed(2)}s`);
}
```

#### 7. Test Descriptions (ALL TESTS)

Update headers:

```typescript
/**
 * PRODUCTION E2E Test - Scenario X: [Test Name]
 * 
 * [Description]
 * 
 * **WITH TIMING**: Measures total escrow swap duration... (for tests 03 only)
 * 
 * Run: npm run test:production:e2e:[test-name]
 */
```

---

## Test-Specific Notes

### Test 03: NFT-for-NFT plus SOL (WITH TIMING) ⏱️

**Source:** `tests/staging/e2e/03-nft-for-nft-plus-sol.test.ts`  
**Target:** `tests/production/e2e/03-nft-for-nft-plus-sol.test.ts`

**Changes:**
- Add timing instrumentation (like tests 01-02)
- Use `getRandomNFTFromWallet` for both NFTs
- Update SOL payment amount for production
- Add cleanup with `archiveAgreements`

### Test 04: Agreement Expiry Refund

**Source:** `tests/staging/e2e/04-agreement-expiry-refund.test.ts`  
**Target:** `tests/production/e2e/04-agreement-expiry-refund.test.ts`

**Changes:**
- No timing instrumentation needed
- Use `getRandomNFTFromWallet`
- Update expiry times if needed
- Add cleanup with `archiveAgreements`

### Test 05: Admin Cancellation

**Source:** `tests/staging/e2e/05-admin-cancellation.test.ts`  
**Target:** `tests/production/e2e/05-admin-cancellation.test.ts`

**Changes:**
- No timing instrumentation needed
- Use `getRandomNFTFromWallet`
- Ensure admin wallet is properly configured
- Add cleanup with `archiveAgreements`

### Test 06: Zero Fee Transactions

**Source:** `tests/staging/e2e/06-zero-fee-transactions.test.ts`  
**Target:** `tests/production/e2e/06-zero-fee-transactions.test.ts`

**Changes:**
- No timing instrumentation needed
- Use `getRandomNFTFromWallet`
- Test zero-fee scenarios
- Add cleanup with `archiveAgreements`

### Test 07: Idempotency Handling

**Source:** `tests/staging/e2e/07-idempotency-handling.test.ts`  
**Target:** `tests/production/e2e/07-idempotency-handling.test.ts`

**Changes:**
- No timing instrumentation needed
- Use `getRandomNFTFromWallet`
- Test idempotency keys
- Add cleanup with `archiveAgreements`

### Test 08: Concurrent Operations

**Source:** `tests/staging/e2e/08-concurrent-operations.test.ts`  
**Target:** `tests/production/e2e/08-concurrent-operations.test.ts`

**Changes:**
- No timing instrumentation needed
- Use `getRandomNFTFromWallet` for multiple NFTs
- Test concurrent agreement creation
- Add cleanup with `archiveAgreements`

### Test 09: Edge Cases Validation

**Source:** `tests/staging/e2e/09-edge-cases-validation.test.ts`  
**Target:** `tests/production/e2e/09-edge-cases-validation.test.ts`

**Changes:**
- No timing instrumentation needed
- Use `getRandomNFTFromWallet`
- Test edge cases specific to production
- Add cleanup with `archiveAgreements`

---

## Quick Reference Checklist

For each test file:

### Imports & Config
- [ ] Change `.env.staging` → `.env.production`
- [ ] Change `STAGING_CONFIG` → `PRODUCTION_CONFIG`
- [ ] Change `loadStagingWallets` → `loadPRODUCTIONWallets`
- [ ] Change `StagingWallets` → `PRODUCTIONWallets`
- [ ] Remove `createTestNFT` import
- [ ] Add `getRandomNFTFromWallet` import
- [ ] Add `archiveAgreements` import

### Test Body
- [ ] Update all config references
- [ ] Change NFT creation to `getRandomNFTFromWallet`
- [ ] Update test amounts (SOL, USDC) for production
- [ ] Add `agreementIds` array for tracking
- [ ] Push agreement IDs to array after creation
- [ ] Update cleanup to use `archiveAgreements`

### For Happy Path Tests (03 Only)
- [ ] Add timing variables (creation, settlement, duration)
- [ ] Add timer start in agreement creation
- [ ] Add timer stop in settlement wait
- [ ] Add timing display in cleanup hook
- [ ] Update test description with "WITH TIMING"

### Documentation
- [ ] Update file header comments
- [ ] Update npm script reference
- [ ] Change "STAGING" → "PRODUCTION" in console output

---

## Example: Complete Conversion (Test 04)

### Before (Staging)
```typescript
// Load .env.staging
const envPath = path.resolve(process.cwd(), '.env.staging');

import { STAGING_CONFIG } from './test-config';
import {
  loadStagingWallets,
  createTestNFT,
  type StagingWallets,
} from './shared-test-utils';

describe('STAGING E2E - Agreement Expiry Refund', function () {
  let wallets: StagingWallets;
  
  before(async function () {
    wallets = loadStagingWallets();
  });
  
  it('should create NFT', async function () {
    nft = await createTestNFT(connection, wallets.sender);
  });
  
  after(async function () {
    await axios.delete(`${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`);
  });
});
```

### After (Production)
```typescript
// Load .env.production
const envPath = path.resolve(process.cwd(), '.env.production');

import { PRODUCTION_CONFIG } from './test-config';
import {
  loadPRODUCTIONWallets,
  getRandomNFTFromWallet,
  archiveAgreements,
  type PRODUCTIONWallets,
} from './shared-test-utils';

describe('PRODUCTION E2E - Agreement Expiry Refund', function () {
  let wallets: PRODUCTIONWallets;
  const agreementIds: string[] = [];
  
  before(async function () {
    wallets = loadPRODUCTIONWallets();
  });
  
  it('should select random NFT', async function () {
    nft = await getRandomNFTFromWallet(connection, wallets.sender);
  });
  
  // In create agreement test:
  agreementIds.push(agreement.agreementId);
  
  after(async function () {
    if (agreementIds.length > 0) {
      await archiveAgreements(agreementIds);
    }
  });
});
```

---

## Automated Conversion Script (Optional)

If you prefer automation, you can create a PowerShell script:

```powershell
# scripts/utilities/convert-staging-to-production-test.ps1

param(
    [Parameter(Mandatory=$true)]
    [string]$TestNumber  # e.g., "03", "04", etc.
)

$stagingFile = "tests/staging/e2e/$TestNumber-*.test.ts"
$productionFile = "tests/production/e2e/$TestNumber-*.test.ts"

# Copy file
Copy-Item $stagingFile $productionFile

# Perform replacements
(Get-Content $productionFile) `
    -replace '\.env\.staging', '.env.production' `
    -replace 'STAGING_CONFIG', 'PRODUCTION_CONFIG' `
    -replace 'loadStagingWallets', 'loadPRODUCTIONWallets' `
    -replace 'StagingWallets', 'PRODUCTIONWallets' `
    -replace 'createTestNFT', 'getRandomNFTFromWallet' `
    -replace 'STAGING E2E', 'PRODUCTION E2E' |
    Set-Content $productionFile

Write-Host "✅ Converted $stagingFile to $productionFile"
Write-Host "⚠️  Manual review required:"
Write-Host "  - Update test amounts"
Write-Host "  - Add archiveAgreements cleanup"
Write-Host "  - Add timing if test 03"
```

---

## Next Steps

### Option A: Continue with AI
Ask me to:
1. Create test 03 with timing
2. Create tests 04-09 without timing

### Option B: Manual Conversion
1. Follow this guide for each test
2. Test files are in `tests/staging/e2e/`
3. Target directory: `tests/production/e2e/`
4. Use tests 01-02 as reference

### Option C: Hybrid
1. Create test 03 yourself (has timing)
2. Ask me to batch-create tests 04-09 (no timing)

---

## Testing

After creating each test:

```powershell
# Test individually
npm run test:production:e2e:nft-nft-sol  # Test 03
npm run test:production:e2e:04-agreement-expiry-refund  # Test 04
# etc...

# Test all production
npm run test:production:e2e
```

---

## Estimated Time

- **Test 03 (with timing):** ~15 minutes
- **Tests 04-09 (no timing):** ~10 minutes each = ~60 minutes total
- **Total:** ~75 minutes

---

**Status:** Tests 01-02 complete, guide ready for remaining tests  
**Next:** Create tests 03-09 following this guide

