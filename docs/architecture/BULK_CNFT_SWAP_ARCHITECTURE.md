# Bulk cNFT Swap Architecture

**Last Updated:** December 15, 2025  
**Status:** ✅ Production Ready & Deployed  
**Version:** 1.0.0

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Transaction Splitting Strategy](#transaction-splitting-strategy)
3. [Jito Bundle Integration](#jito-bundle-integration)
4. [Smart Ordering Logic](#smart-ordering-logic)
5. [Error Handling and Retry Mechanisms](#error-handling-and-retry-mechanisms)
6. [Address Lookup Tables (ALT)](#address-lookup-tables-alt)
7. [Bundle Confirmation and Finality](#bundle-confirmation-and-finality)
8. [Performance Considerations](#performance-considerations)

---

## Overview

The bulk cNFT swap system enables atomic swaps of multiple compressed NFTs (cNFTs) in a single operation. Due to Solana's transaction size limit (1,232 bytes) and the large Merkle proof data required for cNFT transfers, bulk swaps are intelligently split into multiple transactions and executed atomically using Jito bundles.

### Key Features

- ✅ **Multi-Asset Support**: Up to 10 assets per side (cNFTs, standard NFTs, Core NFTs, SOL)
- ✅ **Automatic Transaction Splitting**: Intelligent splitting based on asset types and proof sizes
- ✅ **Jito Bundle Atomicity**: All-or-nothing execution for multi-transaction swaps
- ✅ **Address Lookup Tables**: Size optimization for common program accounts
- ✅ **Smart Ordering**: Optimal transaction sequencing for reliability

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Bulk Swap Request                        │
│  { offeredAssets: [cNFT1, cNFT2, cNFT3], ... }             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              TransactionGroupBuilder                         │
│  • Analyzes asset composition                                │
│  • Determines optimal splitting strategy                     │
│  • Estimates transaction sizes                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌──────────────────────┐              ┌──────────────────────┐
│  Single Transaction  │              │  Multi-Transaction  │
│  (1-2 total cNFTs)    │              │  Bundle (3+ cNFTs)   │
│                      │              │                      │
│  • Direct execution  │              │  TX 1: Fee + 1-2 cNFTs│
│  • No bundle needed  │              │  TX 2: Next 1-2 cNFTs │
│                      │              │  TX N: Final cNFTs  │
│                      │              │                      │
│                      │              │  → Jito Bundle      │
└──────────────────────┘              └──────────────────────┘
```

---

## Transaction Splitting Strategy

### Conservative Approach

The system uses a **conservative splitting strategy** to ensure transactions stay well under the 1,232-byte limit:

| Asset Type | Max Per Transaction | Reason |
|------------|---------------------|--------|
| **cNFT (with proofs)** | 1 | Merkle proofs add ~200-400 bytes per cNFT |
| **cNFT (full canopy)** | 3 | No proof nodes needed when canopy covers entire path |
| **SPL NFT** | 5 | Small transfer instructions (~80 bytes each) |
| **Core NFT** | 4 | Medium-sized transfers (~100 bytes each) |

### Splitting Logic

```typescript
// Pseudo-code for transaction splitting
function splitAssetsIntoTransactions(assets: Asset[]): TransactionGroup[] {
  const groups: TransactionGroup[] = [];
  let currentGroup: Asset[] = [];
  let currentSize = BASE_TRANSACTION_SIZE;
  
  for (const asset of assets) {
    const assetSize = estimateAssetSize(asset);
    
    if (currentSize + assetSize > MAX_TRANSACTION_SIZE) {
      // Start new transaction
      groups.push({ assets: currentGroup });
      currentGroup = [asset];
      currentSize = BASE_TRANSACTION_SIZE + assetSize;
    } else {
      // Add to current transaction
      currentGroup.push(asset);
      currentSize += assetSize;
    }
  }
  
  if (currentGroup.length > 0) {
    groups.push({ assets: currentGroup });
  }
  
  return groups;
}
```

### Strategy Selection

The system automatically selects the optimal strategy:

1. **1-2 total cNFTs**: Single transaction (no bundle)
2. **3+ total cNFTs**: Multi-transaction bundle with Jito
3. **Mixed assets**: Combined strategy based on composition

---

## Jito Bundle Integration

### When to Use Jito Bundles

Jito bundles are used for swaps with **3+ total NFTs** to ensure atomic execution:

- ✅ **Atomicity**: All transactions execute together or not at all
- ✅ **Ordering**: Transactions execute in specified sequence
- ✅ **Reliability**: Higher confirmation rates than individual transactions

### Bundle Creation Process

```typescript
// Bundle creation flow
1. Analyze swap assets
2. Split into transaction groups (1-2 cNFTs per transaction)
3. Build each transaction with proper ordering
4. Create Jito bundle with all transactions
5. Simulate bundle before submission
6. Submit bundle to Jito block engine
7. Poll for bundle confirmation
```

### Bundle Limits

- **Maximum Transactions**: 5 transactions per bundle
- **Maximum Bundle Size**: ~6,000 bytes total
- **Timeout**: 30 seconds for bundle confirmation

### Bundle Status Tracking

The system tracks bundle status throughout the lifecycle:

- `PENDING`: Bundle created, not yet submitted
- `SUBMITTED`: Bundle sent to Jito block engine
- `LANDED`: All transactions in bundle confirmed
- `FAILED`: Bundle failed to land (timeout or rejection)
- `PARTIAL`: Some transactions succeeded (should not occur with Jito)

---

## Smart Ordering Logic

### Transaction Ordering Rules

Transactions are ordered strategically to maximize success rate:

1. **First Transaction**: Platform fee collection + first batch of NFTs
2. **Middle Transactions**: Additional NFT batches (1-2 cNFTs each)
3. **Last Transaction**: Final NFT batch + SOL transfers (if any)

### Why This Ordering?

- **Fee First**: Ensures platform fee is collected before asset transfers
- **NFTs Before SOL**: Asset transfers are more critical than SOL cleanup
- **Dependency Management**: Each transaction can depend on previous ones

### Example Ordering

For a swap with 5 cNFTs and 1 SOL transfer:

```
TX 0: Platform fee + cNFT #1, #2
TX 1: cNFT #3, #4
TX 2: cNFT #5 + SOL transfer (maker → taker)
```

---

## Error Handling and Retry Mechanisms

### Bundle Failure Scenarios

1. **Simulation Failure**: Bundle fails pre-flight simulation
   - **Action**: Rebuild transactions with fresh proofs
   - **Retry**: Up to 3 attempts with exponential backoff

2. **Submission Failure**: Bundle rejected by Jito
   - **Action**: Check bundle size and transaction validity
   - **Retry**: Rebuild and resubmit

3. **Timeout**: Bundle not confirmed within 30 seconds
   - **Action**: Check bundle status via Jito API
   - **Retry**: Resubmit if bundle not landed

4. **Partial Failure**: Some transactions succeed (rare with Jito)
   - **Action**: Analyze which transactions succeeded
   - **Recovery**: Create compensation transactions for partial swaps

### Retry Strategy

```typescript
const retryConfig = {
  maxAttempts: 3,
  backoffDelays: [1000, 5000, 15000], // 1s, 5s, 15s
  refreshProofs: true, // Fetch fresh Merkle proofs on retry
};
```

### Error Recovery

Bundle failures are handled automatically by the backend with up to 3 retry attempts.
The backend fetches fresh Merkle proofs on each retry and falls back to TwoPhase delegation if Jito fails.

- `GET /api/offers/:id/bundle-status`: Check current bundle status

---

## Address Lookup Tables (ALT)

### Purpose

Address Lookup Tables reduce transaction size by storing common program accounts in a lookup table, allowing transactions to reference accounts by index instead of full 32-byte addresses.

### ALT Usage

The system automatically uses ALTs when available:

- **Savings**: ~500-600 bytes per transaction
- **Common Accounts**: Bubblegum program, compression program, system program, log wrapper
- **Creation**: ALTs are created and cached for reuse

### ALT Integration

```typescript
// ALT is automatically used when:
1. ALT service is configured
2. Transaction size estimate exceeds threshold
3. Platform ALT address is available

// Transaction building automatically switches to versioned transactions
// when ALT is available and beneficial
```

---

## Bundle Confirmation and Finality

### Confirmation Process

1. **Bundle Submission**: Bundle sent to Jito block engine
2. **Status Polling**: Poll Jito API every 5 seconds
3. **Confirmation**: All transactions confirmed on-chain
4. **Finality**: Transactions reach finality (confirmed commitment level)

### Polling Strategy

```typescript
const pollingConfig = {
  interval: 5000, // 5 seconds
  timeout: 30000, // 30 seconds total
  exponentialBackoff: false, // Fixed interval for simplicity
};
```

### Status Endpoints

- **Frontend Polling**: `GET /api/offers/:id/bundle-status`
- **WebSocket**: Real-time status updates (future enhancement)

---

## Performance Considerations

### Transaction Size Optimization

1. **Proof Trimming**: Remove proof nodes covered by canopy
2. **ALT Usage**: Compress account addresses
3. **Conservative Splitting**: Stay well under size limits

### Latency Optimization

1. **Parallel Proof Fetching**: Fetch multiple proofs concurrently
2. **Proof Caching**: Cache proofs for 30 seconds
3. **Batch Operations**: Process multiple assets in batches

### Cost Optimization

1. **Jito Tips**: Dynamic tip calculation based on network congestion
2. **Bundle Efficiency**: Minimize number of transactions per bundle
3. **ALT Reuse**: Reuse lookup tables across swaps

---

## Related Documentation

- [cNFT Implementation Plan](cnft-plan.md) - Original implementation plan
- [API Integration Guide](api/ATOMIC_SWAP_API_GUIDE.md) - API usage examples
- [Testing Guide](CNFT_TESTING_GUIDE.md) - Testing procedures
- [Frontend Integration Guide](frontend/BULK_SWAP_INTEGRATION.md) - Frontend integration

---

**Status:** ✅ Production Ready  
**Last Updated:** December 10, 2025

