# Swap Routing Architecture

This document describes the swap execution routing logic for EasyEscrow.ai. The system routes swaps to the most appropriate execution method based on asset types and counts.

## Routing Overview

All swaps follow a **Jito-first** strategy for multi-transaction swaps:

1. Simple 1-for-1 NFT swaps (no cNFTs) → Escrow-based atomic transaction (no Jito)
2. Multi-transaction swaps (2+ NFTs on one side, or any cNFT) → Try Jito bundle first
3. Fall back to TwoPhase delegation on Jito failure
4. Swaps with >4 NFTs are rejected

## Limits

| Constraint | Value | Reason |
|------------|-------|--------|
| **Max NFTs per swap** | 4 | Jito bundles max 5 transactions (1 for SOL/fee + 4 for NFT transfers) |
| **Max assets per side** | 10 | Business rule for offer creation |

## Routing Decision Tree

```text
┌─────────────────────────────────────────────────────┐
│                    Swap Request                      │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Total NFTs > 4?     │
              └─────────┬───────────┘
                   Yes  │  No
                   ▼    │
          ┌────────────┐│
          │  INVALID   ││
          │  (reject)  ││
          └────────────┘│
                        ▼
              ┌─────────────────────┐
              │  Has any cNFTs?     │
              └─────────┬───────────┘
                   Yes  │  No
                   │    │
                   │    ▼
                   │  ┌─────────────────────┐
                   │  │ 2+ NFTs on one side?│  ← Note: NOT total 2+
                   │  └─────────┬───────────┘
                   │       Yes  │  No
                   │       ▼    │
                   │  ┌────────┐│
                   │  │JITO    ││──► SINGLE_TRANSACTION
                   │  │BUNDLE  ││    (escrow-based atomic)
                   │  └────────┘│
                   │            │
                   ▼            │
         ┌──────────────────┐   │
         │ cNFTs on both    │   │
         │ sides?           │   │
         └─────────┬────────┘   │
              Yes  │  No        │
              ▼    │            │
        ┌─────────┐│            │
        │TWO_PHASE││            │
        │DELEGATION│◄───────────┘
        └─────────┘│
                   ▼
         ┌──────────────────┐
         │ Single-side cNFT │
         │ (cNFT-for-SOL,   │
         │  cNFT-for-NFT)   │
         └─────────┬────────┘
                   ▼
              ┌─────────┐
              │JITO     │
              │BUNDLE   │
              │(Jito-   │
              │first)   │
              └─────────┘
```

## Flow Types

### SINGLE_TRANSACTION (Escrow-based Atomic)

- **When**: Simple 1 NFT ↔ 1 NFT swap (no cNFTs, 1 per side)
- **Method**: Single transaction via escrow program, both parties sign
- **No Jito**: Uses standard RPC, escrow holds assets during swap

### JITO_BUNDLE

- **When**: 2+ NFTs on one side (SPL, Core, or cNFT on single side)
- **Method**: Jito bundle with atomic execution
- **Tip**: 0.0001 SOL to Jito tip account

### TWO_PHASE_DELEGATION

- **When**:
  - cNFT-to-cNFT swaps (any cNFT on both sides)
  - Jito bundle failure (rate limit, simulation error)
- **Method**: Lock phase → Settlement phase
- **Why cNFT-to-cNFT**: Requires delegation on both sides, sequential proof fetching

## Jito Bundle Details

### Rate Limits

- **Without UUID**: 1 request per second
- **With JITO_AUTH_UUID**: 5 requests per second

### Tip Configuration

- **Default tip**: 0.0001 SOL (100,000 lamports)
- **Tip account**: Randomly selected from official Jito tip accounts

### Error Handling

| Error | Behavior |
|-------|----------|
| Rate limited (429) | Fallback to TwoPhase |
| Simulation failed | Fallback to TwoPhase |
| Bundle dropped | Fallback to TwoPhase |
| Timeout | Fallback to TwoPhase |
| Stale proof | Rebuild and retry |

## Implementation Files

| File | Purpose |
|------|---------|
| `src/utils/swapFlowRouter.ts` | Initial routing decision |
| `src/services/transactionGroupBuilder.ts` | Transaction grouping strategy |
| `src/services/bulkSwapExecutor.ts` | Jito bundle execution + fallback |
| `src/services/offerManager.ts` | 4 NFT limit validation |

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `JITO_BUNDLES_ENABLED` | Enable Jito bundles | `true` on mainnet |
| `JITO_AUTH_UUID` | Auth for 5 rps rate limit | Optional |
| `JITO_TIP_LAMPORTS` | Tip amount | `100000` |

## Testing

### Unit Tests

```bash
# Routing tests
npx cross-env NODE_ENV=test npx mocha --require ts-node/register --no-config tests/unit/swapFlowRouterIntegration.test.ts --timeout 10000

# Method selection tests
npx cross-env NODE_ENV=test npx mocha --require ts-node/register --no-config tests/unit/swapMethodSelection.test.ts --timeout 10000
```

### Production Tests

```bash
# Bulk swap E2E
npm run test:production:e2e:12-bulk-swap
```

## Changelog

- **2026-01-06**: Implemented Jito-first routing, 4 NFT limit, clarified 1-for-1 exception
- **2025-12-30**: Added TwoPhase fallback on Jito failure
- **2025-12-15**: Initial cNFT delegation support
