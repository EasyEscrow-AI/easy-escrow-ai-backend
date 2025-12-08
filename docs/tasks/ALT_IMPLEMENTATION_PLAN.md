# Address Lookup Tables (ALT) Implementation Plan

**Goal:** Enable cNFT swaps that currently exceed Solana's 1232-byte transaction limit by using Address Lookup Tables to compress account addresses.

**Scope:** Single PR → master + Single on-chain Program Upgrade (Production)

---

## Executive Summary

### Problem
cNFT swaps require large Merkle proofs. Collections with low canopy depth (0-4) generate transactions >1232 bytes, causing swap failures.

### Solution
Address Lookup Tables (ALTs) compress 32-byte account addresses to 1-byte indices, saving ~750 bytes per transaction.

### Expected Impact
| Swap Type | Without ALT | With ALT | Improvement |
|-----------|-------------|----------|-------------|
| cNFT ↔ SOL (high canopy) | ✅ Works | ✅ Works | Same |
| cNFT ↔ SOL (low canopy) | ❌ Fails | ✅ Works | **Fixed** |
| cNFT ↔ cNFT (high canopy) | ⚠️ Borderline | ✅ Works | **Stable** |
| cNFT ↔ cNFT (low canopy) | ❌ Fails | ✅ Works | **Fixed** |

---

## Implementation Tasks

### Phase 1: Backend ALT Infrastructure (No Program Changes)

#### Task 1.1: Create ALT Management Service
**File:** `src/services/altService.ts`

```typescript
// Key functions:
- createLookupTable(payer: Keypair): Promise<PublicKey>
- extendLookupTable(tableAddress: PublicKey, addresses: PublicKey[]): Promise<string>
- getLookupTable(address: PublicKey): Promise<AddressLookupTableAccount>
- getOrCreatePlatformALT(): Promise<PublicKey>
```

**Static addresses to include in ALT:**
1. Token Program (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
2. System Program (`11111111111111111111111111111111`)
3. Bubblegum Program (`BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY`)
4. SPL Account Compression (`cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK`)
5. SPL Noop (`noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV`)
6. Platform Authority (production admin)
7. Treasury PDA
8. Escrow Program ID

**Estimated savings:** ~256 bytes (8 addresses × 32 bytes → 8 bytes)

#### Task 1.2: Update Transaction Builder for Versioned Transactions
**File:** `src/services/transactionBuilder.ts`

Changes needed:
1. Import `VersionedTransaction`, `TransactionMessage`, `AddressLookupTableAccount`
2. Add `useALT: boolean` option to `TransactionBuildInputs`
3. Create `buildVersionedTransaction()` method
4. Modify `buildSwapTransaction()` to use versioned transactions when ALT enabled
5. Update serialization to handle `VersionedTransaction`

```typescript
// New interface addition
interface TransactionBuildInputs {
  // ... existing fields ...
  useALT?: boolean;
  lookupTableAddress?: PublicKey;
}

// New method
async buildVersionedTransaction(inputs: TransactionBuildInputs): Promise<BuiltTransaction> {
  // 1. Get lookup table account
  // 2. Build instructions (same as before)
  // 3. Create TransactionMessage with lookup tables
  // 4. Create VersionedTransaction
  // 5. Sign and serialize
}
```

#### Task 1.3: Add Transaction Size Estimation
**File:** `src/services/transactionBuilder.ts`

Add method to estimate transaction size before building:

```typescript
async estimateTransactionSize(inputs: TransactionBuildInputs): Promise<{
  estimatedSize: number;
  maxSize: number;
  willFit: boolean;
  recommendation: 'legacy' | 'versioned' | 'cannot_fit';
  breakdown: {
    signatures: number;
    accountKeys: number;
    instructions: number;
    proofData: number;
  };
}>
```

#### Task 1.4: Create ALT Setup Script
**File:** `scripts/setup-production-alt.ts`

Script to create and populate the production ALT:

```typescript
// 1. Create lookup table
// 2. Add all static addresses
// 3. Wait for slot activation
// 4. Output table address for config
```

---

### Phase 2: Test Page UI Updates

#### Task 2.1: Display Transaction Size in Confirm Modal
**File:** `src/public/js/test-page.js`

Add to confirm modal:
- Estimated transaction size (bytes)
- Max transaction size (1232)
- Size bar/indicator (green/yellow/red)
- "Using Address Lookup Table: Yes/No"

```javascript
// In showConfirmModal() function
const sizeInfo = await fetchTransactionSizeEstimate(params);
document.getElementById('tx-size-estimate').innerHTML = `
  <div class="size-bar" style="width: ${(sizeInfo.estimatedSize / 1232) * 100}%"></div>
  <span>${sizeInfo.estimatedSize} / 1232 bytes</span>
  ${sizeInfo.useALT ? '<span class="alt-badge">🔗 ALT Enabled</span>' : ''}
`;
```

#### Task 2.2: Add Transaction Size API Endpoint
**File:** `src/routes/test.routes.ts`

```typescript
router.post('/api/test/estimate-size', async (req, res) => {
  // Calculate transaction size without building
  // Return size breakdown and recommendation
});
```

---

### Phase 3: Offer Flow Updates

#### Task 3.1: Update Offer Manager
**File:** `src/services/offerManager.ts`

Changes:
1. Check transaction size before building
2. Automatically use ALT when size would exceed limit
3. Store ALT usage flag in offer record
4. Update `acceptOffer()` to handle versioned transactions

#### Task 3.2: Update Offer Routes
**File:** `src/routes/offers.routes.ts`

Changes:
1. Add `useALT` flag to response
2. Include transaction size in accept response
3. Handle versioned transaction serialization

---

### Phase 4: Test Execution Updates

#### Task 4.1: Update Test Execute Route
**File:** `src/routes/test-execute.routes.ts`

Changes:
1. Detect if transaction is versioned
2. Use appropriate deserialization
3. Handle versioned transaction signing

```typescript
// Detect transaction version
const txBuffer = Buffer.from(serializedTransaction, 'base64');
const isVersioned = txBuffer[0] === 0x80; // V0 marker

if (isVersioned) {
  const tx = VersionedTransaction.deserialize(txBuffer);
  // Sign versioned transaction
} else {
  const tx = Transaction.from(txBuffer);
  // Sign legacy transaction
}
```

---

### Phase 5: Testing

#### Task 5.1: Unit Tests
**File:** `tests/unit/altService.test.ts`

- ALT creation
- ALT extension
- Address lookup
- Size estimation

#### Task 5.2: Integration Tests
**File:** `tests/integration/versioned-transactions.test.ts`

- Legacy vs versioned transaction building
- ALT-enabled swap flow
- Size threshold detection

#### Task 5.3: E2E Tests (Production)
**File:** `tests/production/e2e/02-alt-cnft-swap.test.ts`

- Create offer with ALT
- Accept and execute with versioned transaction
- Verify on-chain success

---

## Configuration

### Environment Variables

```env
# Production ALT address (created by setup script)
PRODUCTION_ALT_ADDRESS=<to-be-created>

# Enable ALT feature flag (for gradual rollout)
ENABLE_ALT=true
```

### ALT Address Storage
Store in `.taskmaster/config.json` or dedicated config:

```json
{
  "alt": {
    "production": {
      "address": "<address>",
      "createdAt": "2025-12-08",
      "addresses": [...]
    }
  }
}
```

---

## Deployment Plan

### Step 1: Create Production ALT (One-time)
```bash
# Run setup script
npx ts-node scripts/setup-production-alt.ts

# Output: ALT address to add to config
```

### Step 2: Deploy Backend Updates
```bash
# Commit all changes
git add .
git commit -m "feat: Add Address Lookup Table support for cNFT swaps"
git push origin fix/alt-implementation

# Create PR
gh pr create --base master --head fix/alt-implementation
```

### Step 3: Verify ALT on Mainnet
```bash
# Check ALT is active
solana address-lookup-table get <ALT_ADDRESS> --url mainnet-beta
```

### Step 4: Test on Production
Use /test page to:
1. Create cNFT ↔ SOL swap (should show ALT enabled)
2. Execute swap
3. Verify success

---

## No Program Changes Required

**Important:** This implementation does NOT require any Solana program changes because:

1. The on-chain program only validates accounts and signatures
2. ALTs are a client-side optimization for transaction packaging
3. The program receives the same accounts regardless of how they're transmitted
4. Versioned transactions are fully compatible with existing programs

---

## Rollback Plan

If issues arise:
1. Set `ENABLE_ALT=false` in environment
2. Backend falls back to legacy transactions
3. Large cNFT swaps will fail (same as before)
4. No data loss or corruption risk

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Backend ALT | 4-6 hours | None |
| Phase 2: UI Updates | 2-3 hours | Phase 1 |
| Phase 3: Offer Flow | 2-3 hours | Phase 1 |
| Phase 4: Test Execution | 1-2 hours | Phase 1 |
| Phase 5: Testing | 3-4 hours | All phases |
| Deployment | 1-2 hours | Testing |
| **Total** | **13-20 hours** | |

---

## Files to Create/Modify

### New Files
- `src/services/altService.ts` - ALT management
- `scripts/setup-production-alt.ts` - One-time setup
- `tests/unit/altService.test.ts` - Unit tests
- `tests/integration/versioned-transactions.test.ts` - Integration tests
- `tests/production/e2e/02-alt-cnft-swap.test.ts` - E2E tests

### Modified Files
- `src/services/transactionBuilder.ts` - Versioned transaction support
- `src/services/offerManager.ts` - ALT integration
- `src/routes/offers.routes.ts` - API updates
- `src/routes/test.routes.ts` - Size estimation endpoint
- `src/routes/test-execute.routes.ts` - Versioned tx handling
- `src/public/js/test-page.js` - UI size display

---

## Success Criteria

1. ✅ cNFT ↔ SOL swaps work for any canopy depth
2. ✅ cNFT ↔ cNFT swaps work for canopy ≥5
3. ✅ Transaction size displayed in confirm modal
4. ✅ All existing tests pass
5. ✅ New ALT tests pass
6. ✅ Production /test page successfully executes ALT-enabled swap

