# Settlement Transaction Tracking Fix

**Date:** 2025-01-23  
**Issue:** Settlement transaction not showing in E2E test performance summary  
**Test File:** `tests/staging/e2e/01-solana-nft-usdc-happy-path.test.ts`

## Problem

The E2E test was only showing 2 transactions in the performance summary (NFT deposit and USDC deposit), but missing the settlement transaction. This was happening because:

1. **Receipt not available immediately:** The receipt generation is asynchronous and not available when the test checks for it
2. **Missing DTO fields:** The settlement transaction ID (`settleTxId`) was stored in the database but not exposed in the API response

## Solution

### 1. Added Transaction IDs to Agreement DTO

Updated `AgreementResponseDTO` to include transaction-related fields:

```typescript
export interface AgreementResponseDTO {
  // ... existing fields ...
  initTxId?: string;        // Escrow initialization transaction
  settleTxId?: string;      // Settlement transaction (when status = SETTLED)
  cancelTxId?: string;      // Cancellation transaction (when status = CANCELLED)
  settledAt?: string;       // Timestamp when settled
  cancelledAt?: string;     // Timestamp when cancelled
}
```

**File:** `src/models/dto/agreement.dto.ts`

### 2. Updated Agreement Mapping Function

Modified `mapAgreementToDTO()` to include the new fields:

```typescript
const mapAgreementToDTO = (agreement: Agreement): AgreementResponseDTO => {
  return {
    // ... existing mappings ...
    initTxId: agreement.initTxId || undefined,
    settleTxId: agreement.settleTxId || undefined,
    cancelTxId: agreement.cancelTxId || undefined,
    settledAt: agreement.settledAt?.toISOString(),
    cancelledAt: agreement.cancelledAt?.toISOString(),
  };
};
```

**File:** `src/services/agreement.service.ts`

### 3. Enhanced Test to Wait for Settlement Transaction

Changed the test to actively wait for `settleTxId` to be available instead of just checking once:

**Features:**
- **Polls API for settleTxId** (up to 30 attempts, 1 second apart)
- **Waits for on-chain confirmation** (up to 10 attempts)
- **Tracks complete settlement timing** including backend processing

```typescript
// Wait for settlement transaction ID to be available
console.log('   ⏳ Waiting for settlement transaction to be recorded...\n');
let settleTxId: string | null = null;
const maxAttempts = 30; // 30 attempts
const retryDelay = 1000; // 1 second

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const response = await axios.get(
    `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
  );
  
  if (response.data.data.settleTxId) {
    settleTxId = response.data.data.settleTxId;
    console.log(`   ✅ Settlement TX ID found after ${attempt} attempt(s)`);
    break;
  }
  
  if (attempt < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
}

// Wait for transaction to be confirmed on chain
if (settleTxId) {
  let txDetails = null;
  for (let i = 0; i < 10; i++) {
    txDetails = await connection.getTransaction(settleTxId, { 
      commitment: 'confirmed', 
      maxSupportedTransactionVersion: 0 
    });
    if (txDetails) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  // Track transaction with fee...
}
```

### 4. Enhanced Receipt Verification to Wait for Generation

Updated receipt verification to wait for async generation instead of skipping:

**Features:**
- **Polls for receipt ID** (up to 30 attempts, 1 second apart)
- **Progress indicators** every 5 attempts
- **Fails if not available** after timeout (better than silent skip)
- **Verifies all transaction IDs** in the receipt

```typescript
// Wait for receipt to be generated
console.log('   ⏳ Waiting for receipt generation...\n');
let receiptId: string | null = null;
const maxAttempts = 30;
const retryDelay = 1000;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const response = await axios.get(
    `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
  );
  
  if (response.data.data.receiptId) {
    receiptId = response.data.data.receiptId;
    console.log(`   ✅ Receipt ID found after ${attempt} attempt(s)`);
    break;
  }
  
  if (attempt % 5 === 0) {
    console.log(`   ⏳ Still waiting for receipt... (${attempt}/${maxAttempts})`);
  }
  await new Promise(resolve => setTimeout(resolve, retryDelay));
}

if (!receiptId) {
  throw new Error('Receipt not generated within timeout period');
}
```

**File:** `tests/staging/e2e/01-solana-nft-usdc-happy-path.test.ts`

## How Settlement Works

**Important Clarification:** Settlement is **NOT** multiple "return leg" transactions.

### Single Atomic Transaction

The settlement is a **single blockchain transaction** that performs three transfers simultaneously:

1. **NFT Transfer:** Escrow PDA → Buyer
2. **USDC Transfer (Main):** Escrow PDA → Seller (minus platform fee)
3. **Fee Transfer:** Escrow PDA → Fee Collector

This atomic execution ensures all parties receive their assets or none do (no partial failures).

### Transaction Fees

| Transaction | Who Pays | Why |
|-------------|----------|-----|
| **NFT Deposit** | Seller | Seller initiates the deposit |
| **USDC Deposit** | Buyer | Buyer initiates the deposit |
| **Settlement** | Backend | Backend detects both deposits complete and executes settlement |

The backend pays for settlement because:
- It's an automated process triggered by the monitoring service
- The backend signs and submits the settlement transaction
- Users have already paid their deposit fees

## Expected Test Output

After these changes, the test should show **3 transactions** with detailed fee breakdown:

```
📊 Solana blockchain transactions summary:
--------------------------------------------------------------------------------
   1. Seller > NFT > Escrow
      TX: [transaction ID]
      ⏱️  Completed in X.XX seconds
      💰 Fee: 0.000005000 SOL
      🔗 [explorer link]

   2. Buyer > USDC > Escrow
      TX: [transaction ID]
      ⏱️  Completed in X.XX seconds
      💰 Fee: 0.000005000 SOL
      🔗 [explorer link]

   3. Settlement (NFT→Buyer, USDC→Seller, Fee→Collector)
      TX: [transaction ID]
      ⏱️  Completed in X.XX seconds
      💰 Fee: 0.000005000 SOL
      🔗 [explorer link]

--------------------------------------------------------------------------------
   📈 Average blockchain transaction time: X.XX seconds

💰 FEE BREAKDOWN:
--------------------------------------------------------------------------------
   Blockchain Fees (SOL):
     • Seller deposit fee:      0.000005000 SOL (paid by seller)
     • Buyer deposit fee:       0.000005000 SOL (paid by buyer)
     • Settlement fee:          0.000005000 SOL (paid by backend)
     • Total blockchain fees:   0.000015000 SOL

   Platform Commission (USDC):
     • EasyEscrow commission:   0.001000 USDC (1.0% of swap)
     • Seller receives:         0.099000 USDC (after commission)

   Summary:
     • Total SOL fees paid:     0.000015000 SOL (~$0.0030 USD)
     • Platform revenue:        0.001000 USDC
```

## Files Modified

1. `src/models/dto/agreement.dto.ts` - Added transaction ID fields to DTO
2. `src/services/agreement.service.ts` - Updated mapping to include new fields
3. `tests/staging/e2e/01-solana-nft-usdc-happy-path.test.ts` - Updated settlement tracking logic
4. `docs/tasks/SETTLEMENT_TRANSACTION_TRACKING_FIX.md` - This documentation

## Benefits

1. **Complete Transaction Tracking:** All blockchain transactions are now visible in test output
2. **Accurate Fee Reporting:** Total fees include settlement transaction paid by backend
3. **Better Debugging:** Settlement transaction ID immediately available for investigation
4. **API Enhancement:** Transaction IDs now available for all clients, not just receipts

## Related Documentation

- [E2E_TIMING_AND_TRANSACTION_TRACKING.md](E2E_TIMING_AND_TRANSACTION_TRACKING.md) - Original implementation
- [RECEIPT_COMPLETE_AUDIT_TRAIL.md](RECEIPT_COMPLETE_AUDIT_TRAIL.md) - Receipt transaction logging

---

**Last Updated:** 2025-01-23

