# Frontend Integration Guide: Bulk cNFT Swaps

**Last Updated:** December 10, 2025  
**Status:** ✅ Production Ready  
**Version:** 1.0.0

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [TypeScript Interfaces](#typescript-interfaces)
3. [Complete Bulk Swap Flow](#complete-bulk-swap-flow)
4. [Transaction Group Handling](#transaction-group-handling)
5. [Bundle Status Polling](#bundle-status-polling)
6. [Error Handling](#error-handling)
7. [Code Examples](#code-examples)
8. [Error Codes Reference](#error-codes-reference)

---

## Overview

This guide provides comprehensive documentation for integrating bulk cNFT swap functionality into frontend applications. Bulk swaps support up to 4 NFTs total per swap (Jito bundle transaction limit) and automatically use Jito bundles for atomic execution when multiple transactions are required.

### Key Features

- ✅ **Multi-Asset Support**: Up to 4 NFTs total per swap (cNFTs, NFTs, Core NFTs, SOL)
- ✅ **Automatic Bundle Management**: Jito bundles for multi-transaction swaps
- ✅ **Transaction Groups**: Multiple transactions for large swaps
- ✅ **Status Polling**: Real-time bundle status updates
- ✅ **Error Recovery**: Retry mechanisms for failed bundles

---

## TypeScript Interfaces

### Core Interfaces

```typescript
// Asset type definitions
enum AssetType {
  NFT = 'NFT',
  CNFT = 'CNFT',
  CORE_NFT = 'CORE_NFT',
}

interface SwapAsset {
  identifier: string;  // Mint address or cNFT asset ID
  type: AssetType;
}

// Transaction group response
interface TransactionGroup {
  strategy: 'SINGLE_TRANSACTION' | 'DIRECT_BUBBLEGUM_BUNDLE' | 'DIRECT_NFT_BUNDLE' | 'MIXED_NFT_BUNDLE';
  transactionCount: number;
  requiresJitoBundle: boolean;
  totalSizeBytes: number;
  transactions: TransactionGroupItem[];
}

interface TransactionGroupItem {
  index: number;
  purpose: string;
  serializedTransaction: string;  // Base64-encoded
  assets: {
    makerAssets: SwapAsset[];
    takerAssets: SwapAsset[];
  };
  makerSolLamports?: string;
  takerSolLamports?: string;
}

// Bulk swap response
interface BulkSwapResponse {
  success: boolean;
  data: {
    offer: {
      id: string;
      status: 'ACTIVE' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED';
      isBulkSwap: boolean;
      transactionGroup?: TransactionGroup;
      bundleStatus?: BundleStatus;
      bundleSubmittedAt?: string;
      bundleLandedAt?: string;
    };
    transaction?: {
      serialized: string;
      nonceAccount: string;
    };
  };
  timestamp: string;
}

// Bundle status enum
enum BundleStatus {
  PENDING = 'Pending',
  SUBMITTED = 'Submitted',
  LANDED = 'Landed',
  FAILED = 'Failed',
  TIMEOUT = 'Timeout',
}

// Bundle status response
interface BundleStatusResponse {
  success: boolean;
  data: {
    bundleStatus: BundleStatus;
    transactionSignatures: string[];
    landedAt?: string;
    error?: string;
  };
  timestamp: string;
}

// Error response
interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  timestamp: string;
  details?: {
    code: string;
    retryable: boolean;
    recoveryAction?: string;
  };
}
```

---

## Complete Bulk Swap Flow

### 1. Create Bulk Swap Offer

```typescript
async function createBulkSwapOffer(
  makerWallet: string,
  offeredAssets: SwapAsset[],
  requestedAssets: SwapAsset[],
  offeredSol: string,
  requestedSol: string,
  takerWallet?: string  // Optional: for private sales
): Promise<BulkSwapResponse> {
  const response = await fetch(`${API_BASE_URL}/api/offers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': generateUUID(),
    },
    body: JSON.stringify({
      makerWallet,
      takerWallet,
      offeredAssets: offeredAssets.map(asset => ({
        mint: asset.identifier,
        isCompressed: asset.type === AssetType.CNFT,
        isCoreNft: asset.type === AssetType.CORE_NFT,
      })),
      requestedAssets: requestedAssets.map(asset => ({
        mint: asset.identifier,
        isCompressed: asset.type === AssetType.CNFT,
        isCoreNft: asset.type === AssetType.CORE_NFT,
      })),
      offeredSol,
      requestedSol,
    }),
  });

  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}
```

### 2. Accept Bulk Swap Offer

```typescript
async function acceptBulkSwapOffer(
  offerId: string,
  takerWallet: string
): Promise<BulkSwapResponse> {
  const response = await fetch(`${API_BASE_URL}/api/offers/${offerId}/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': generateUUID(),
    },
    body: JSON.stringify({
      takerWallet,
    }),
  });

  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}
```

### 3. Sign and Submit Transactions

```typescript
async function signAndSubmitTransactions(
  transactionGroup: TransactionGroup,
  wallet: WalletAdapter
): Promise<string[]> {
  const signatures: string[] = [];

  // Sign all transactions in order
  for (const txItem of transactionGroup.transactions) {
    const transaction = Transaction.from(
      Buffer.from(txItem.serializedTransaction, 'base64')
    );

    // Sign transaction
    transaction.sign(wallet.publicKey);
    const signed = await wallet.signTransaction(transaction);

    // Submit transaction
    if (transactionGroup.requiresJitoBundle) {
      // For Jito bundles, collect signatures and submit together
      const signature = await connection.sendRawTransaction(
        signed.serialize(),
        { skipPreflight: false }
      );
      signatures.push(signature);
    } else {
      // For single transactions, submit immediately
      const signature = await connection.sendRawTransaction(
        signed.serialize(),
        { skipPreflight: false }
      );
      signatures.push(signature);
    }
  }

  return signatures;
}
```

### 4. Confirm Swap

```typescript
async function confirmSwap(
  offerId: string,
  primarySignature: string,
  takerWallet: string,
  allSignatures?: string[]  // For bundle confirmation
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/offers/${offerId}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': generateUUID(),
    },
    body: JSON.stringify({
      signature: primarySignature,
      takerWallet,
      bundleSignatures: allSignatures,  // For bundle confirmation
    }),
  });

  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
}
```

---

## Transaction Group Handling

### Detecting Bulk Swaps

```typescript
function isBulkSwap(response: BulkSwapResponse): boolean {
  return response.data.offer.isBulkSwap === true;
}

function hasTransactionGroup(response: BulkSwapResponse): boolean {
  return !!response.data.offer.transactionGroup;
}
```

### Processing Transaction Groups

```typescript
function processTransactionGroup(
  transactionGroup: TransactionGroup
): {
  requiresBundle: boolean;
  transactionCount: number;
  transactions: TransactionGroupItem[];
} {
  return {
    requiresBundle: transactionGroup.requiresJitoBundle,
    transactionCount: transactionGroup.transactionCount,
    transactions: transactionGroup.transactions,
  };
}
```

---

## Bundle Status Polling

### Polling Implementation

```typescript
async function pollBundleStatus(
  offerId: string,
  timeout: number = 30000  // 30 seconds
): Promise<BundleStatusResponse> {
  const startTime = Date.now();
  const pollInterval = 5000;  // 5 seconds

  while (Date.now() - startTime < timeout) {
    const response = await fetch(
      `${API_BASE_URL}/api/offers/${offerId}/bundle-status`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch bundle status');
    }

    const status: BundleStatusResponse = await response.json();

    // Check if bundle is complete
    if (
      status.data.bundleStatus === BundleStatus.LANDED ||
      status.data.bundleStatus === BundleStatus.FAILED ||
      status.data.bundleStatus === BundleStatus.TIMEOUT
    ) {
      return status;
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Timeout reached
  throw new Error('Bundle status polling timeout');
}
```

### React Hook Example

```typescript
import { useState, useEffect } from 'react';

function useBundleStatus(offerId: string | null) {
  const [status, setStatus] = useState<BundleStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!offerId) return;

    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;

    const poll = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_BASE_URL}/api/offers/${offerId}/bundle-status`
        );
        const data: BundleStatusResponse = await response.json();
        setStatus(data.data.bundleStatus);

        // Stop polling if bundle is complete
        if (
          data.data.bundleStatus === BundleStatus.LANDED ||
          data.data.bundleStatus === BundleStatus.FAILED ||
          data.data.bundleStatus === BundleStatus.TIMEOUT
        ) {
          clearInterval(interval);
          clearTimeout(timeout);
          setLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
        clearInterval(interval);
        clearTimeout(timeout);
      }
    };

    // Poll immediately
    poll();

    // Poll every 5 seconds
    interval = setInterval(poll, 5000);

    // Timeout after 30 seconds
    timeout = setTimeout(() => {
      clearInterval(interval);
      setLoading(false);
      setError('Bundle status polling timeout');
    }, 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [offerId]);

  return { status, loading, error };
}
```

---

## Error Handling

### Error Recovery Patterns

Bundle failures and stale proofs are **handled automatically by the backend**. The backend will:
1. Retry failed bundles up to 3 times with fresh Merkle proofs
2. Fall back to TwoPhase delegation if Jito fails
3. Return a final error only if all retry mechanisms are exhausted

```typescript
async function handleSwapError(
  error: ErrorResponse,
  offerId: string
): Promise<void> {
  // All retryable errors are handled automatically by the backend
  // If we receive an error here, it means automatic recovery failed
  showErrorToUser(error.message);

  // For persistent issues, contact support with the offer ID
  console.error(`Swap failed for offer ${offerId}:`, error);
}
```

### Progress Indicator

```typescript
function calculateProgress(
  transactionGroup: TransactionGroup,
  completedTransactions: number
): number {
  return Math.round(
    (completedTransactions / transactionGroup.transactionCount) * 100
  );
}

// React component example
function SwapProgress({ transactionGroup, completed }: Props) {
  const progress = calculateProgress(transactionGroup, completed);

  return (
    <div>
      <progress value={progress} max={100} />
      <span>{progress}% Complete</span>
      <span>
        Transaction {completed + 1} of {transactionGroup.transactionCount}
      </span>
    </div>
  );
}
```

---

## Code Examples

### Complete React Component

```typescript
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

function BulkSwapComponent() {
  const { publicKey, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleBulkSwap = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);

      // 1. Create offer
      const createResponse = await createBulkSwapOffer(
        publicKey.toBase58(),
        offeredAssets,
        requestedAssets,
        '0',
        requestedSol
      );

      if (!createResponse.data.offer.isBulkSwap) {
        throw new Error('Expected bulk swap but got single transaction');
      }

      // 2. Accept offer (if taker)
      const acceptResponse = await acceptBulkSwapOffer(
        createResponse.data.offer.id,
        publicKey.toBase58()
      );

      // 3. Sign and submit transactions
      const transactionGroup = acceptResponse.data.offer.transactionGroup!;
      const signatures = await signAndSubmitTransactions(
        transactionGroup,
        { publicKey, signTransaction }
      );

      // 4. Confirm swap
      await confirmSwap(
        acceptResponse.data.offer.id,
        signatures[0],
        publicKey.toBase58(),
        signatures
      );

      // 5. Poll for bundle status
      const status = await pollBundleStatus(acceptResponse.data.offer.id);
      console.log('Bundle status:', status.data.bundleStatus);

      setLoading(false);
    } catch (error) {
      console.error('Swap failed:', error);
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleBulkSwap} disabled={loading}>
        {loading ? 'Processing...' : 'Create Bulk Swap'}
      </button>
      {loading && <SwapProgress progress={progress} />}
    </div>
  );
}
```

---

## Error Codes Reference

| Code | Description | Retryable | Recovery Action |
|------|-------------|-----------|-----------------|
| `BUNDLE_FAILED` | Bundle failed to land | ✅ Auto | Handled by backend |
| `BUNDLE_TIMEOUT` | Bundle confirmation timeout | ✅ Auto | Handled by backend |
| `STALE_PROOF` | Merkle proof is stale | ✅ Auto | Handled by backend |
| `TRANSACTION_TOO_LARGE` | Transaction exceeds size limit | ❌ No | Split into smaller transactions |
| `INSUFFICIENT_FUNDS` | Wallet lacks sufficient SOL | ❌ No | User must add funds |
| `ASSET_NOT_OWNED` | Asset not owned by wallet | ❌ No | Verify asset ownership |
| `OFFER_EXPIRED` | Offer has expired | ❌ No | Create new offer |
| `OFFER_CANCELLED` | Offer was cancelled | ❌ No | Create new offer |

---

## Related Documentation

- [Bulk Swap Architecture](../BULK_CNFT_SWAP_ARCHITECTURE.md) - Architecture details
- [API Integration Guide](../api/ATOMIC_SWAP_API_GUIDE.md) - Complete API reference
- [Testing Guide](../CNFT_TESTING_GUIDE.md) - Testing procedures

---

**Status:** ✅ Production Ready  
**Last Updated:** December 10, 2025

