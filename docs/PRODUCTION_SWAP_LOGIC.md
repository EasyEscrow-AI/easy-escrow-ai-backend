# Production Swap Logic

This document describes the swap execution logic for EasyEscrow.ai, including method selection, thresholds, and fallback behavior.

## Overview

The platform supports multiple swap execution strategies based on asset types, counts, and infrastructure availability:

| Strategy | Description | When Used |
|----------|-------------|-----------|
| **ATOMIC** | Single transaction, both parties sign | Simple NFT swaps (no cNFTs, ≤2 assets) |
| **JITO_BUNDLE** | Atomic multi-transaction bundle via Jito | cNFT swaps when Jito enabled |
| **SEQUENTIAL_RPC** | Transactions executed one-by-one via RPC | Small cNFT swaps when Jito disabled |
| **TWO_PHASE** | Lock/Confirm/Settle pattern | Large swaps when Jito disabled |

---

## Swap Method Selection

### Phase 1: Initial Flow Determination (`swapFlowRouter.ts`)

The swap flow router determines the initial flow type based on asset counts:

```
┌─────────────────────────────────────────────────────────────┐
│                    SWAP FLOW ROUTER                          │
├─────────────────────────────────────────────────────────────┤
│  Has cNFTs?                                                  │
│    ├─ NO  → Is bulk (5+ assets)? → YES → TWO_PHASE         │
│    │                              → NO  → ATOMIC            │
│    │                                                         │
│    └─ YES → Triggers two-phase threshold?                   │
│              ├─ YES → TWO_PHASE                             │
│              └─ NO  → CNFT_DELEGATION                       │
└─────────────────────────────────────────────────────────────┘
```

### Two-Phase Triggers

| Trigger | Condition | Constant |
|---------|-----------|----------|
| **Bulk cNFT** | 3+ cNFTs on either side | `CNFT_TWO_PHASE_THRESHOLD = 3` |
| **Bulk Assets** | 5+ total assets | `TOTAL_ASSET_TWO_PHASE_THRESHOLD = 5` |
| **Mixed Bulk** | 4+ assets WITH any cNFT | `needsTwoPhaseForMixedBulk` |

### Phase 2: Execution Strategy (`transactionGroupBuilder.ts`)

For swaps that need multiple transactions (cNFT swaps), the final execution method depends on Jito availability:

```
┌─────────────────────────────────────────────────────────────┐
│              EXECUTION STRATEGY SELECTION                    │
├─────────────────────────────────────────────────────────────┤
│  Is JITO enabled?                                            │
│    ├─ YES → JITO_BUNDLE (atomic execution)                  │
│    │                                                         │
│    └─ NO  → Can use Sequential RPC?                         │
│              ├─ YES → SEQUENTIAL_RPC                        │
│              └─ NO  → TWO_PHASE (lock/settle pattern)       │
└─────────────────────────────────────────────────────────────┘
```

### Sequential RPC Thresholds

Sequential RPC is only safe for small swaps where front-running risk is acceptable:

| Condition | Threshold | Constant |
|-----------|-----------|----------|
| Total cNFTs | ≤ 2 | `MAX_CNFTS_SEQUENTIAL_RPC = 2` |
| Total Assets | ≤ 3 | `MAX_ASSETS_SEQUENTIAL_RPC = 3` |

**Both conditions must be met** to use Sequential RPC.

---

## Method Selection Examples

### With JITO Enabled

| Swap Type | cNFTs | Assets | Method |
|-----------|-------|--------|--------|
| 1:1 cNFT | 2 | 2 | JITO_BUNDLE |
| 1:3 cNFT | 4 | 4 | JITO_BUNDLE |
| 3:3 cNFT | 6 | 6 | JITO_BUNDLE |
| 1:1 NFT | 0 | 2 | ATOMIC |
| 5 NFT bulk | 0 | 5 | JITO_BUNDLE |

### With JITO Disabled

| Swap Type | cNFTs | Assets | Sequential OK? | Method |
|-----------|-------|--------|----------------|--------|
| 1:1 cNFT | 2 | 2 | ✅ (2≤2, 2≤3) | SEQUENTIAL_RPC |
| 1 cNFT for SOL | 1 | 1 | ✅ (1≤2, 1≤3) | SEQUENTIAL_RPC |
| 2:1 cNFT | 3 | 3 | ❌ (3>2 cNFTs) | TWO_PHASE |
| 1:3 cNFT | 4 | 4 | ❌ (4>2 cNFTs) | TWO_PHASE |
| 2:2 cNFT | 4 | 4 | ❌ (4>2, 4>3) | TWO_PHASE |
| 1:1 NFT | 0 | 2 | N/A | ATOMIC |
| 5 NFT bulk | 0 | 5 | N/A | TWO_PHASE |

---

## Two-Phase Swap Flow

When a swap requires TWO_PHASE execution, it follows a lock/confirm/settle pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                   TWO-PHASE SWAP FLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. CREATE OFFER                                             │
│     └─ Party A creates offer with their assets              │
│                                                              │
│  2. ACCEPT & LOCK (Party A)                                  │
│     └─ Party A signs lock transaction(s)                    │
│     └─ cNFTs delegated to escrow PDA                        │
│     └─ SOL transferred to vault PDA                         │
│                                                              │
│  3. CONFIRM LOCK (Party B)                                   │
│     └─ Party B signs lock transaction(s)                    │
│     └─ Status → FULLY_LOCKED when both locked               │
│                                                              │
│  4. SETTLEMENT (Backend)                                     │
│     └─ Backend executes asset transfers                     │
│     └─ Uses JITO bundle if enabled, else sequential RPC     │
│     └─ Status → COMPLETED                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Lock Transaction Splitting

Each cNFT requires its own lock transaction due to Merkle proof size (~350+ bytes per cNFT):

| cNFT Count | Lock Transactions |
|------------|-------------------|
| 1 | 1 |
| 3 | 3 |
| 5 | 5 |

This ensures each transaction stays under Solana's 1232-byte limit.

---

## Settlement Phase

### Strategy Selection

Settlement uses JITO bundles when available for atomicity:

```typescript
const useJitoBundle = isJitoBundlesEnabled() && totalChunks > 1;
```

| JITO Enabled | Chunks | Settlement Strategy |
|--------------|--------|---------------------|
| ✅ Yes | 1 | Sequential RPC (single tx) |
| ✅ Yes | 2+ | JITO Bundle |
| ❌ No | Any | Sequential RPC |

### JITO Fallback Behavior

**IMPORTANT: No JITO retries on failure.**

When JITO is enabled and fails (network congestion, bundle dropped, etc.), the system:

1. **Logs the failure** with reason
2. **Immediately falls back** to sequential RPC
3. **Does NOT retry JITO** - during congestion, retries won't help

```
[TwoPhaseSwapSettleService] Attempting JITO bundle for settlement (single attempt, no retry)...
[TwoPhaseSwapSettleService] JITO bundle FAILED: Bundle dropped - network congestion
[TwoPhaseSwapSettleService] Immediately falling back to sequential RPC (no JITO retry - congestion recovery)
```

### Fallback Scenarios

| Scenario | Action |
|----------|--------|
| JITO succeeds | Return success |
| JITO fails completely | Log → Immediate fallback to sequential RPC |
| JITO partial success | Log → Return partial results (can't cleanly retry executed chunks) |

---

## Transaction Size Constraints

### Solana Limits

- **Max transaction size**: 1232 bytes
- **cNFT Merkle proof**: ~350+ bytes (varies by tree depth)
- **cNFT delegation instruction**: ~488 bytes total

### Chunking Strategy

| Asset Type | Max per Transaction | Reason |
|------------|---------------------|--------|
| cNFT (deep tree) | 1 | Proof > 20 nodes |
| cNFT (shallow tree) | 2 | Proof ≤ 10 nodes |
| Regular NFT | Multiple | ~100 bytes each |
| SOL transfer | Multiple | ~64 bytes each |

---

## Configuration

### Environment Variables

```bash
# Enable/disable JITO bundles
JITO_BUNDLES_ENABLED=true

# Jito tip configuration
JITO_TIP_LAMPORTS=10000
```

### Feature Flag

```typescript
import { isJitoBundlesEnabled } from './utils/featureFlags';

if (isJitoBundlesEnabled()) {
  // Use JITO bundle execution
} else {
  // Fall back to sequential RPC or two-phase
}
```

---

## Decision Tree Summary

```
START
  │
  ├─ No cNFTs?
  │    ├─ ≤2 assets → ATOMIC
  │    └─ 5+ assets → JITO (if enabled) or TWO_PHASE
  │
  └─ Has cNFTs?
       │
       ├─ JITO Enabled?
       │    └─ YES → JITO_BUNDLE (all cNFT swaps)
       │
       └─ JITO Disabled?
            │
            ├─ ≤2 cNFTs AND ≤3 assets?
            │    └─ YES → SEQUENTIAL_RPC
            │
            └─ >2 cNFTs OR >3 assets?
                 └─ TWO_PHASE (lock/settle pattern)
```

---

## Related Files

| File | Purpose |
|------|---------|
| `src/utils/swapFlowRouter.ts` | Initial flow type determination |
| `src/services/transactionGroupBuilder.ts` | Transaction building & strategy selection |
| `src/services/twoPhaseSwapLockService.ts` | Lock phase transaction building |
| `src/services/twoPhaseSwapSettleService.ts` | Settlement execution with JITO/RPC |
| `src/services/bulkSwapExecutor.ts` | JITO bundle submission |
| `src/utils/featureFlags.ts` | JITO enabled check |
| `tests/unit/swapMethodSelection.test.ts` | Unit tests for selection logic |

---

## Testing

Run the swap method selection tests:

```bash
cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/swapMethodSelection.test.ts --timeout 10000
```

Expected: **49 passing tests** covering:
- swapFlowRouter initial flow determination (7 tests)
- canUseSequentialRpc logic (6 tests)
- Complete method selection - Jito disabled (9 tests)
- Complete method selection - Jito enabled (6 tests)
- Edge cases (4 tests)
- Threshold boundary tests (3 tests)
- Threshold constants verification (3 tests)
- Settlement phase JITO strategy (11 tests)
