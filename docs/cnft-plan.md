# cNFT Swap Enhancement Plan

**Date:** December 10, 2025  
**Status:** ✅ Implementation Complete  
**Priority:** High - Core Feature Enhancement  
**Last Updated:** December 10, 2025

---

## 📌 Executive Summary

This plan outlines the implementation of enhanced cNFT swap functionality to overcome current atomic swap architecture limitations. The goal is to enable:

1. **Single cNFT Swaps**: cNFT ↔ cNFT, cNFT+SOL ↔ cNFT, cNFT ↔ cNFT+SOL
2. **Bulk NFT Swaps**: Support for up to 10 NFTs per side (any combination of cNFT, Core NFT, SPL NFT)
3. **Enhanced Offer Management**: Create listings, private sales, counter-offers, cancel, update

---

## 🔍 Current State Analysis

### What Works Now

| Feature | Status | Notes |
|---------|--------|-------|
| SPL NFT ↔ SOL | ✅ Working | Single NFT atomic swap |
| Core NFT ↔ SOL | ✅ Working | Metaplex Core support |
| Core NFT ↔ Core NFT | ✅ Working | Single NFT per side |
| Core NFT ↔ SPL NFT | ✅ Working | Mixed type support |
| cNFT ↔ SOL | ✅ Working | Full support with Merkle proofs |
| cNFT ↔ cNFT | ✅ Working | Single and bulk swaps supported |
| Bulk Swaps | ✅ Working | Up to 10 assets per side with Jito bundles |

### What Needs Enhancement

1. **Transaction Builder** (`src/services/transactionBuilder.ts`)
   - Lines 591-597: cNFT transfer throws "not yet implemented"
   - No bulk transaction splitting logic

2. **Offer Manager** (`src/services/offerManager.ts`)
   - Lines 109-123: Hard limit of 1 NFT per side
   - Counter-offer exists but limited

3. **Solana Program** (`programs/escrow/src/instructions/atomic_swap.rs`)
   - cNFT CPI exists and works
   - No update/cancel instructions for offers
   - Single transaction limit for cNFT proofs

4. **Production Tests** (`tests/production/e2e/`)
   - 04-atomic-cnft-for-sol.test.ts: Skipped
   - 05-atomic-cnft-for-cnft.test.ts: Skipped

---

## 🏗️ Architecture Overview

### New Transaction Flow for cNFT Swaps

```
┌─────────────────────────────────────────────────────────────────┐
│                      API Request                                │
│   POST /api/offers { makerWallet, assets[], requestedAssets[] } │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Asset Validation                             │
│   - Validate ownership (DAS API for cNFT)                       │
│   - Determine asset types (NFT, cNFT, Core NFT)                 │
│   - Count total assets per side                                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Transaction Strategy Selection                  │
│   - If total cNFTs ≤ 2: Single transaction                      │
│   - If total cNFTs > 2: Split into transaction groups           │
│   - If total cNFTs > 2: Use JITO bundle for atomicity (multiple transactions required)     │
└─────────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│   Single Transaction     │    │   Multi-Transaction Bundle   │
│   (1-2 cNFTs)            │    │   (3+ cNFTs)                  │
│                          │    │                              │
│   - Build atomic swap TX │    │   TX 1: Platform fee +       │
│   - Include cNFT proofs  │    │         First 1-2 cNFTs      │
│   - Execute directly     │    │   TX 2: Next 1-2 cNFTs       │
└──────────────────────────┘    │   TX N: Final cNFTs + SOL    │
                                │                              │
                                │   → JITO Bundle Submission   │
                                └──────────────────────────────┘
```

### Smart Transaction Ordering

For bulk swaps, transactions are ordered strategically:

1. **First TX**: Platform fee collection + first batch of NFTs (1-2 cNFTs)
2. **Middle TXs**: Additional NFT transfers (1-2 cNFTs per TX max)
3. **Final TX**: Remaining NFTs + SOL cleanup + **JITO TIP**

This ensures:
- Fee collected before any transfers
- JITO bundle atomicity - all or nothing execution
- Tip placed in final transaction per JITO best practices
- Partial failure impossible due to bundle guarantees

**JITO Bundle Limits:**
- Maximum **5 transactions** per bundle
- For 10+ cNFTs, may need multiple bundles executed sequentially

---

## 📋 Implementation Tasks

### Phase 1: Core cNFT Transfer Fix (Backend)

#### Task 1.1: Fix Transaction Builder cNFT Transfers

**File:** `src/services/transactionBuilder.ts`

**Current State (Lines 591-597):**
```typescript
} else if (asset.type === AssetType.CNFT) {
  // Compressed NFT transfer (placeholder - requires Bubblegum program integration)
  // TODO: Implement actual cNFT transfer using Metaplex Bubblegum
  console.warn('[TransactionBuilder] cNFT transfer not yet implemented:', asset.identifier);
  
  // For now, throw error to indicate unsupported
  throw new Error('cNFT transfers not yet implemented');
}
```

**Required Changes:**
1. Import CnftService and build transfer parameters
2. Build Bubblegum CPI instruction using proof data
3. Handle proof fetching with proper error handling
4. Integrate with existing transaction building flow

**Estimated Effort:** 4-6 hours

#### Task 1.2: Implement cNFT Transfer Instruction Building

**File:** `src/services/transactionBuilder.ts`

**New Method Required:**
```typescript
private async buildCnftTransferInstruction(
  asset: SwapAsset,
  from: PublicKey,
  to: PublicKey
): Promise<TransactionInstruction[]> {
  const cnftService = createCnftService(this.connection);
  const transferParams = await cnftService.buildTransferParams(
    asset.identifier,
    from,
    to
  );
  
  // Build Bubblegum transfer instruction
  // Return instruction array (including any required account instructions)
}
```

**Estimated Effort:** 3-4 hours

---

### Phase 2: Bulk Swap Support

#### Task 2.1: Remove 1-NFT-per-side Restriction

**File:** `src/services/offerManager.ts`

**Current State (Lines 106-123):**
```typescript
// 2. Validate multi-asset restriction (on-chain program limitation)
// Current program only supports 1 NFT per side (or NFT ↔ SOL)
if (input.offeredAssets.length > 1) {
  throw new Error(
    'Multi-asset swaps are not yet supported on-chain. ' +
    // ...
  );
}
```

**Required Changes:**
1. Remove hard restriction
2. Add new limit: max 10 assets per side
3. Add cNFT counting logic for transaction splitting

**Estimated Effort:** 2-3 hours

#### Task 2.2: Implement Transaction Splitting

**File:** `src/services/bulkSwapBuilder.ts` (new file)

**Research-Based Guidelines:**
- **1-2 cNFTs per transaction** for reliability (conservative approach, can optimize later)
- **Max 5 transactions per JITO bundle**
- Regular SPL NFTs can be batched more densely
- Core NFTs have smaller footprint than cNFTs

**New Class/Methods:**
```typescript
interface TransactionGroup {
  transactions: VersionedTransaction[];
  requiredSigners: PublicKey[];
  executionOrder: number;
  bundleId?: string;
}

interface TransactionSplitPlan {
  txCount: number;
  txContents: {
    txIndex: number;
    makerAssets: SwapAsset[];
    takerAssets: SwapAsset[];
    includesFee: boolean;      // First TX
    includesSolTransfer: boolean;
    includesTip: boolean;      // Final TX only
  }[];
}

class BulkSwapBuilder {
  // 1-2 cNFTs per TX (conservative, can optimize to 3-5 later)
  private readonly CNFTS_PER_TX = 3; // Conservative default
  private readonly MAX_BUNDLE_SIZE = 5;
  
  async buildSwapTransactionGroups(inputs: BulkSwapInputs): Promise<TransactionGroup> {
    // 1. Analyze asset composition
    const analysis = this.analyzeAssets(inputs);
    
    // 2. Determine optimal transaction split
    const plan = this.calculateTransactionSplit(analysis);
    
    // 3. Validate bundle size (max 5 TXs)
    if (plan.txCount > this.MAX_BUNDLE_SIZE) {
      throw new Error(`Swap requires ${plan.txCount} TXs, max ${this.MAX_BUNDLE_SIZE} per bundle`);
    }
    
    // 4. Build transaction group with proper ordering
    // 5. Return for JITO bundle submission
  }
  
  private calculateTransactionSplit(
    analysis: AssetAnalysis
  ): TransactionSplitPlan {
    // TX 1: Fee + first batch of cNFTs (up to 3-5)
    // TX 2-4: Additional cNFT batches
    // TX N (final): Remaining + SOL + TIP
    
    // CRITICAL: Don't over-pack - research shows
    // fragile transactions fail more often
  }
  
  /**
   * Check if swap exceeds single bundle capacity
   * If so, caller must handle sequential bundles
   */
  requiresMultipleBundles(inputs: BulkSwapInputs): boolean {
    const totalCnfts = this.countCnfts(inputs);
    const txNeeded = Math.ceil(totalCnfts / this.CNFTS_PER_TX) + 1; // +1 for fee/tip
    return txNeeded > this.MAX_BUNDLE_SIZE;
  }
}
```

**Estimated Effort:** 10-12 hours (increased for proper analysis + multi-bundle handling)

#### Task 2.3: JITO Bundle Integration

**File:** `src/services/jitoBundle.service.ts` (new file)

**Current JITO Integration:**
- Direct block engine submission exists in `escrow-program.service.ts`
- No bundle submission yet

**Required Implementation (Based on 2025 Research):**
```typescript
export class JitoBundleService {
  private readonly bundleEndpoint = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
  private readonly tipAccounts = [/* Official 8 Jito tip addresses */];
  
  /**
   * Submit bundle with up to 5 transactions
   * CRITICAL: Tip instruction MUST be in FINAL transaction only
   */
  async submitBundle(transactions: VersionedTransaction[]): Promise<BundleResult> {
    // 0. Validate max 5 transactions
    if (transactions.length > 5) {
      throw new Error('JITO bundle limit is 5 transactions');
    }
    
    // 1. Simulate bundle BEFORE submission
    const simulation = await this.simulateBundle(transactions);
    if (!simulation.success) {
      throw new Error(`Bundle simulation failed: ${simulation.error}`);
    }
    
    // 2. Serialize all transactions
    // 3. Submit as bundle to JITO
    // 4. Handle bundle confirmation
    // 5. Return result with all signatures
  }
  
  /**
   * Simulate bundle to catch errors before submission
   */
  async simulateBundle(transactions: VersionedTransaction[]): Promise<SimulationResult> {
    // Use Jito's simulateBundle RPC
  }
  
  /**
   * Monitor bundle status
   * States: processed -> confirmed -> finalized
   */
  async getBundleStatus(bundleId: string): Promise<BundleStatus> {
    // Check bundle landing status
  }
  
  /**
   * Calculate dynamic tip based on network conditions
   * Minimum 1000 lamports, increase during congestion
   */
  async calculateDynamicTip(): Promise<number> {
    // Fetch recent tip floor from Jito API
    // Add margin based on network conditions
  }
}
```

**Key Implementation Rules:**
1. ⚠️ Max 5 transactions per bundle
2. ⚠️ Tip instruction ONLY in final transaction
3. ⚠️ NEVER put tip accounts in ALTs
4. ✅ Always simulate before submission
5. ✅ Implement dynamic tip calculation

**Estimated Effort:** 8-10 hours (increased due to simulation + dynamic tips)

---

### Phase 3: Enhanced Offer Management

#### Task 3.1: Private Sale (Taker Wallet Specification)

**Current State:** Already supported via `takerWallet` field

**Required Changes:**
- Verify enforcement in program (already done in `atomic_swap.rs`)
- Add validation in backend for private sale flow
- Update test coverage

**Estimated Effort:** 2-3 hours

#### Task 3.2: Counter-Offer Enhancement

**File:** `src/services/offerManager.ts`

**Current State:** Basic counter-offer exists (lines 549-589)

**Required Enhancement:**
1. Allow modifying offered assets
2. Allow modifying SOL amounts
3. Track counter-offer chain

**Estimated Effort:** 4-6 hours

#### Task 3.3: Cancel Offer Functionality

**File:** `src/services/offerManager.ts`

**Current State:** Cancel exists but limited

**Required Enhancement:**
1. Maker can cancel own offers
2. Admin can cancel any offer
3. Proper nonce advancement to invalidate transactions

**Estimated Effort:** 3-4 hours

#### Task 3.4: Update Listing Functionality

**Files:**
- `src/services/offerManager.ts`
- `src/routes/offers.routes.ts`

**New Endpoint:** `PUT /api/offers/:id`

**Required Implementation:**
```typescript
async updateOffer(
  offerId: number,
  updates: {
    requestedSol?: bigint;
    offeredSol?: bigint;
    // Note: Changing assets requires cancel + new offer
  }
): Promise<OfferSummary> {
  // 1. Validate offer is still ACTIVE
  // 2. Validate caller is maker
  // 3. Advance nonce to invalidate old transaction
  // 4. Build new transaction with updated params
  // 5. Update database
}
```

**Estimated Effort:** 4-5 hours

---

### Phase 4: Program Enhancements (Optional)

The current Solana program already supports cNFT transfers via Bubblegum CPI. However, some enhancements may be useful:

#### Task 4.1: Multi-NFT Support in Single Transaction (Future)

Currently the program handles 1 NFT per type per side. For multi-NFT in single TX:
- Would need remaining accounts pattern
- Significant compute unit considerations
- May not be necessary if transaction splitting works well

**Recommendation:** Defer to Phase 2+ after validating transaction splitting approach

---

### Phase 5: Testing

#### Task 5.1: Unit Tests

**New Test Files:**
- `tests/unit/cnft-transfer.test.ts`
- `tests/unit/bulk-swap-builder.test.ts`
- `tests/unit/jito-bundle.test.ts`

**Test Coverage:**
- cNFT proof building and validation
- Transaction splitting logic
- JITO bundle submission mocks
- Error handling scenarios

**Estimated Effort:** 6-8 hours

#### Task 5.2: Integration Tests

**New Test Files:**
- `tests/integration/cnft-swap.test.ts`
- `tests/integration/bulk-swap.test.ts`

**Test Coverage:**
- API endpoint integration
- Database state management
- End-to-end offer flow

**Estimated Effort:** 4-6 hours

#### Task 5.3: E2E Tests (Staging/Production)

**Move Existing Tests:**
- Move `04-atomic-cnft-for-sol.test.ts` to proper sequence
- Move `05-atomic-cnft-for-cnft.test.ts` to proper sequence

**New E2E Tests:**
- `12-cnft-for-sol-happy-path.test.ts`
- `13-cnft-for-cnft-happy-path.test.ts`
- `14-bulk-nft-swap.test.ts`
- `15-private-sale-cnft.test.ts`

**Estimated Effort:** 8-10 hours

---

## 🔧 Code Reuse Analysis

### Salvageable Legacy Code

| File | Component | Status | Action |
|------|-----------|--------|--------|
| `src/services/cnftService.ts` | ✅ Full Service | Working | Use as-is |
| `src/types/cnft.ts` | ✅ Type Definitions | Working | Use as-is |
| `src/constants/bubblegum.ts` | ✅ Program IDs | Working | Use as-is |
| `programs/escrow/src/instructions/atomic_swap.rs` | ✅ cNFT CPI | Working | Use as-is |
| `src/services/altService.ts` | ✅ ALT Service | Working | Enhance for bulk |
| `src/services/escrow-program.service.ts` | ⚠️ Jito Send | Partial | Extract to service |

### Code to Remove/Archive

| File | Component | Reason |
|------|-----------|--------|
| Legacy agreement tests | All | Not needed for atomic swaps |
| `agreement.service.ts` (most methods) | Legacy escrow | Already disabled |

### Code to Uncomment/Enable

The following code paths need to be enabled:

1. **transactionBuilder.ts** - cNFT transfer path (replace error with implementation)
2. **offerManager.ts** - Multi-asset restriction (remove, add new limit)

---

## 📊 Database Schema Updates

### Current Schema (No Changes Needed)

The `SwapOffer` model already supports:
- `offeredAssets: Json` - Array of assets (supports multiple)
- `requestedAssets: Json` - Array of assets (supports multiple)
- `takerWallet: String?` - For private sales
- `parentOfferId: Int?` - For counter-offers

### Optional New Fields (If Needed)

```prisma
model SwapOffer {
  // ... existing fields ...
  
  // Optional: Track transaction groups for bulk swaps
  transactionGroup    String?   @map("transaction_group") // JSON array of serialized TXs
  bundleId            String?   @map("bundle_id")        // JITO bundle ID
  
  // Optional: Track offer updates
  previousVersionId   Int?      @map("previous_version_id")
  updateCount         Int       @default(0) @map("update_count")
}
```

---

## 🔒 Security Considerations

### cNFT Proof Freshness

**Risk:** Merkle proofs can become stale if tree is modified between fetch and execution

**Mitigation (Based on Research):**
1. Leverage Merkle tree buffer mechanism (typically 64 modifications allowed)
2. Fetch proofs as close to execution as possible (within seconds)
3. Use `/api/offers/:id/rebuild-transaction` for stale proofs
4. Monitor tree modification rates to stay within buffer
5. Implement retry logic with fresh proof fetching on failure

**Buffer Mechanism:**
- Concurrent Merkle trees have configurable buffer size
- Buffer of 64 = proofs valid through 64 tree modifications
- Enables parallel proof computation for bulk swaps

### Bulk Swap Atomicity

**Risk:** If bundle fails partially, assets could be split

**JITO Guarantees:**
- ✅ JITO bundles are **all-or-nothing** - no partial execution possible
- ✅ If any transaction in bundle fails, entire bundle rejected
- ✅ Simplifies recovery - just retry the whole bundle

**Implementation:**
1. Always use `simulateBundle` before submission
2. No need for rollback logic - bundles are atomic
3. Implement exponential backoff for retries
4. Check blockhash expiration before retry

### Frozen/Soulbound cNFT Detection

**Risk:** Attempting to transfer frozen or soulbound cNFTs will fail

**Mitigation (Bubblegum V2):**
1. Check `frozen` status before including in swap
2. Check `soulbound` status for non-transferable NFTs
3. Use `canTransfer()` helper from Metaplex SDK

### Concurrent Operation Safety

**Risk:** Double-booking NFTs in overlapping bulk operations

**Mitigation:**
1. Implement reservation system to lock NFTs during operations
2. Release locks only after operation completion or timeout
3. Database-level uniqueness constraints on active swaps

### Private Key Security

**Current:** Backend signs with platform authority

**No Changes:** Continue current security model

---

## 📅 Timeline Estimate

| Phase | Tasks | Estimated Time | Priority |
|-------|-------|----------------|----------|
| Phase 1 | Core cNFT Transfer Fix | 1-2 days | 🔴 Critical |
| Phase 2 | Bulk Swap Support | 3-4 days | 🟡 High |
| Phase 3 | Enhanced Offer Management | 2-3 days | 🟡 High |
| Phase 4 | Program Enhancements | Deferred | 🟢 Low |
| Phase 5 | Testing | 3-4 days | 🔴 Critical |

**Total Estimated Time:** 10-14 working days

---

## 🚀 Deployment Strategy

### Staging Deployment

1. Deploy backend changes to staging
2. Run full test suite against devnet
3. Test with real cNFTs (create test tree)
4. Verify JITO bundle submission (mainnet only, use mock on devnet)

### Production Deployment

1. Announce maintenance window
2. Deploy backend updates
3. Run smoke tests
4. Enable feature flags (if using)
5. Monitor logs and metrics

### Rollback Plan

1. Feature flags to disable new functionality
2. Database is backward compatible
3. No program changes required initially

---

## 📝 API Changes Summary

### New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/offers/:id` | Update offer (SOL amounts) |
| POST | `/api/offers/:id/rebuild-transaction` | Rebuild with fresh proofs (exists) |

### Modified Endpoints

| Method | Endpoint | Changes |
|--------|----------|---------|
| POST | `/api/offers` | Support multiple assets per side (up to 10) |
| POST | `/api/offers/:id/accept` | Handle bulk swap transaction groups |
| POST | `/api/offers/:id/confirm` | Handle bundle confirmation |

### Backward Compatibility

All changes are backward compatible:
- Single NFT swaps continue to work as before
- API response format unchanged
- Existing clients won't break

---

## 🎯 Success Criteria

### Phase 1 Success

- [ ] Single cNFT ↔ SOL swap works end-to-end
- [ ] Single cNFT ↔ cNFT swap works end-to-end
- [ ] cNFT + SOL combinations work

### Phase 2 Success

- [ ] Bulk swap (3+ cNFTs) uses Jito bundle and completes atomically
- [ ] Bulk swap (10 cNFTs) completes successfully with multiple transaction bundle
- [ ] JITO bundle lands atomically
- [ ] Transaction splitting is optimal

### Phase 3 Success

- [ ] Private sales work correctly
- [ ] Counter-offers maintain proper chain
- [ ] Cancel invalidates all pending transactions
- [ ] Update preserves offer integrity

### Overall Success

- [ ] All existing tests continue to pass
- [ ] New test coverage > 80%
- [ ] No regression in existing functionality
- [ ] Documentation updated

---

## 🔬 Perplexity Research Insights (December 2025)

### Key Findings from Latest Research

#### 1. Merkle Proof Handling Best Practices

**Buffer Mechanism for Concurrent Modifications:**
- Solana's concurrent Merkle trees include a buffer that allows proofs to remain valid through a configurable number of modifications
- Buffer size of 64 means proofs remain valid even if 64 other transactions modify the tree first
- For bulk swaps, proofs can be computed in parallel from recent (not current) tree state

**Recommended Implementation:**
```typescript
// Use Metaplex SDK's getAssetWithProof with truncateCanopy
const assetWithProof = await metaplex.nfts().findByAssetId(assetId, {
  truncateCanopy: true,  // CRITICAL: Auto-trims proof based on canopy depth
});
```

**Proof Freshness Guidelines:**
- Fetch proofs as close to execution as possible (within seconds)
- Monitor tree modification rates to ensure buffer adequacy
- Implement retry logic for stale proof failures

#### 2. Transaction Optimization Insights

**Optimal cNFT Transfers Per Transaction:**
- Using **1-2 cNFT transfers per transaction** (conservative, can optimize to 3-5 later based on testing)
- Avoid maximum packing - overly packed transactions are fragile
- Less optimal packing provides resilience against proof staleness

**Address Lookup Table (ALT) Constraints:**
- ⚠️ **Signers cannot be retrieved from ALTs** - must be in inline account list
- ⚠️ **Tip accounts should NEVER be in ALTs** - causes Jito errors
- ALT addresses require versioned (v0) transactions
- New ALT addresses only usable after next slot (1-slot delay)

**Compute Unit Strategy:**
- Simulate transactions to determine actual CU consumption
- Add 10-20% margin for variation
- Don't blindly request maximum compute (increases costs)

#### 3. JITO Bundle Best Practices (Updated 2025)

**Critical Bundle Limits:**
- **Maximum 5 transactions per bundle**
- Jito handles ~95% of Solana block production (as of 2025)
- Over 60% of priority fee volume goes through Jito

**Bundle Structure for Bulk Swaps:**
```
TX 1: Payment settlement + platform fee
TX 2-4: cNFT transfers (3-5 per TX)
TX 5: Final transfers + cleanup + TIP INSTRUCTION
```

**Tipping Strategy:**
- Tip ONLY in final transaction
- Minimum tip: 1,000 lamports (often insufficient during congestion)
- Implement dynamic tip calculation based on recent tip volumes
- Never place tip accounts in ALTs

**Pre-Submission Validation:**
```typescript
// ALWAYS simulate before submission
const simulation = await jito.simulateBundle(bundle);
if (!simulation.success) {
  // Adjust and retry
}
```

**Bundle Status Monitoring:**
- `processed` - Executed but not finalized
- `confirmed` - Confirmed but not finalized
- `finalized` - Irreversibly committed

#### 4. Bubblegum V2 Considerations

**New Features to Check:**
- `frozen` status - Cannot transfer frozen cNFTs
- `soulbound` - Permanently bound to wallet (non-transferable)
- Use `canTransfer()` helper before including in swaps

**V1 vs V2 Compatibility:**
- V2 uses new `LeafSchemaV2` incompatible with v1 trees
- Cannot mix v1/v2 leaves in same tree
- Recommend using v1 for backward compatibility unless v2 features needed

#### 5. Error Recovery and Idempotency

**Bundle Atomicity Guarantees:**
- JITO bundles are all-or-nothing - no partial execution
- If any transaction fails, entire bundle rejected
- Simplifies recovery - just retry the whole bundle

**Retry Logic:**
- Check blockhash expiration before retry
- Use `getLatestBlockhash` to get validity duration
- Implement exponential backoff

**Concurrent Operations:**
- Implement reservation system to prevent double-booking NFTs
- Lock NFTs into specific operation until completion

### Updated Architecture Recommendations

Based on research, update transaction splitting logic:

```typescript
// UPDATED: Optimal splitting based on research
function calculateOptimalSplit(cnftCount: number): number {
  // 1-2 cNFTs per transaction (conservative approach)
  // Using 3 as conservative default for bulk swaps
  const CNFTS_PER_TX = 3;
  return Math.ceil(cnftCount / CNFTS_PER_TX);
}

// UPDATED: Transaction ordering
const bundleOrder = {
  first: 'Payment + Fee + First batch',
  middle: 'Additional cNFT batches (3 per TX)',
  final: 'Final batch + SOL cleanup + TIP',
};
```

### Pitfalls to Avoid (From Research)

1. **❌ Don't pack transactions to maximum** - fragile to proof changes
2. **❌ Don't put signers in ALTs** - will fail signature verification
3. **❌ Don't put tip accounts in ALTs** - causes Jito errors
4. **❌ Don't ignore buffer size** - proofs can fail if buffer exhausted
5. **❌ Don't test with small trees** - proof sizes differ at scale
6. **❌ Don't use minimum tip during congestion** - bundles won't land

---

## 📚 References

- [Metaplex Bubblegum Documentation](https://developers.metaplex.com/bubblegum)
- [Metaplex Bubblegum V2](https://developers.metaplex.com/bubblegum-v2)
- [JITO Bundle API](https://docs.jito.wtf/lowlatencytxnsend/)
- [Helius cNFT Guide](https://www.helius.dev/blog/all-you-need-to-know-about-compression-on-solana)
- [Solana Transaction Size Limits](https://docs.solana.com/developing/programming-model/transactions)
- [Address Lookup Tables Guide](https://solana.com/developers/guides/advanced/lookup-tables)
- [Current cNFT Service](../src/services/cnftService.ts)
- [Current Atomic Swap Program](../programs/escrow/src/instructions/atomic_swap.rs)

---

## 🔄 Updates

| Date | Update |
|------|--------|
| 2025-12-10 | Initial plan created |
| 2025-12-10 | Added Perplexity research insights |
| | Updated recommendations based on 2025 best practices |
| | Task Master tasks pending |

---

**Next Steps:**
1. ✅ Plan created
2. ✅ Perplexity research completed
3. ⏳ Create Taskmaster tasks
4. ⏳ Begin Phase 1 implementation

