# Test Page: Real On-Chain Swap Execution

## ⚠️ SECURITY WARNING ⚠️

This document describes **TEST-ONLY** functionality that uses private keys to automatically execute swaps on devnet. **NEVER** use this in production or with mainnet private keys.

---

## Overview

The `/test` page now executes **REAL atomic swaps** on Solana devnet using private keys from environment variables.

### Before (Mocked)
```
1. Create Offer ✅
2. Accept Offer ✅
3. ❌ Display "Ready for wallet signatures"
   - No actual transaction
   - Just showed what WOULD happen
```

### After (Real Execution)
```
1. Create Offer ✅
2. Accept Offer ✅
3. Execute Swap ✅ (NEW!)
   - Backend signs with private keys
   - Submits to Solana blockchain
   - Returns actual transaction signature
   - Assets actually transfer on-chain
```

---

## Security Architecture

### Multi-Layer Protection

#### 1. Environment Check
```typescript
// Only allows devnet
const isDevnet = rpcUrl.includes('devnet');
if (!isDevnet) {
  return 403; // Forbidden
}
```

**Result:** Cannot accidentally run on mainnet

---

#### 2. Required Header
```typescript
// Must include special header
const testHeader = req.headers['x-test-execution'];
if (testHeader !== 'true') {
  return 403; // Forbidden
}
```

**Result:** Prevents accidental API calls

---

#### 3. Private Keys Never Exposed

**Frontend:**
```javascript
// Frontend sends serialized transaction (no keys!)
fetch('/api/test/execute-swap', {
  body: JSON.stringify({
    serializedTransaction: tx, // ✅ No private keys
    requireSignatures: [makerAddress, takerAddress]
  })
});
```

**Backend:**
```typescript
// Backend loads keys from ENV (server-side only)
const makerKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
const takerKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;

// Keys never sent to frontend
// Only signature returned
```

**Result:** Private keys stay server-side

---

#### 4. Extensive Logging
```typescript
console.log('🧪 TEST SWAP EXECUTION REQUEST');
console.log('⏰ Timestamp:', timestamp);
console.log('📍 Network:', rpcUrl);
console.log('📋 Required signatures:', addresses);
console.log('✅ TRANSACTION CONFIRMED:', signature);
```

**Result:** Full audit trail of all execution attempts

---

## API Endpoint

### `POST /api/test/execute-swap`

**Purpose:** Sign and execute swap transaction using test wallet private keys

**Security:** TEST-ONLY - Devnet with required header

---

### Request

**Headers:**
```http
Content-Type: application/json
X-Test-Execution: true  ⚠️ REQUIRED
```

**Body:**
```json
{
  "serializedTransaction": "base64-encoded-tx-here",
  "requireSignatures": [
    "AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z",
    "5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4"
  ]
}
```

---

### Response (Success)

```json
{
  "success": true,
  "data": {
    "signature": "3xVNFsCR82HUtR7zGemD4YFEBbyA1...",
    "explorerUrl": "https://solscan.io/tx/3xVNFs...?cluster=devnet"
  },
  "message": "Swap executed successfully on-chain",
  "timestamp": "2025-11-26T18:00:00.000Z"
}
```

---

### Response (Security Blocked)

```json
{
  "success": false,
  "error": "Test execution only available on devnet",
  "timestamp": "2025-11-26T18:00:00.000Z"
}
```

---

### Response (Missing Header)

```json
{
  "success": false,
  "error": "Missing required test header",
  "timestamp": "2025-11-26T18:00:00.000Z"
}
```

---

## Environment Variables

### Required for Execution

```bash
# Test wallet private keys (Base58 encoded)
DEVNET_STAGING_SENDER_PRIVATE_KEY=xxx...
DEVNET_STAGING_RECEIVER_PRIVATE_KEY=yyy...

# Must be devnet RPC
SOLANA_RPC_URL=https://...devnet.quiknode.pro/...
```

### Security Notes

- ✅ **Devnet Only:** Never use mainnet private keys
- ✅ **Test Wallets:** Only use dedicated test wallets
- ✅ **No Value:** These wallets should have minimal SOL
- ⚠️ **Never Commit:** Private keys in `.env` files, not in git

---

## Frontend Flow

### executeAtomicSwap() Function

```javascript
// Step 1: Create offer
const createResponse = await fetch('/api/offers', {...});

// Step 2: Accept offer (returns serialized transaction)
const acceptResponse = await fetch(`/api/offers/${offerId}/accept`, {...});

// Step 3: Execute swap (NEW!)
const executeResponse = await fetch('/api/test/execute-swap', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Test-Execution': 'true', // Required header
  },
  body: JSON.stringify({
    serializedTransaction: acceptData.transaction.serialized,
    requireSignatures: [MAKER_ADDRESS, TAKER_ADDRESS],
  }),
});

// Result: Actual on-chain transaction signature
const { signature, explorerUrl } = executeData.data;
```

---

## Transaction Summary Display

### Before Execution
```
⚠️ Note: Transaction signing requires wallet integration
Transaction would be signed by both parties and submitted on-chain

Next Steps:
  Transaction: Ready for wallet signatures
  Implementation: Requires Phantom/Solflare wallet integration
```

### After Execution
```
✅ Transaction Confirmed On-Chain
  Signature: 3xVNFsCR82HUtR7zGemD... [View on Solscan →]
  Offer ID: 24
  Status: EXECUTED ✅
  Nonce Account: AidAWPjmrMaxmm1b...

🔗 View Transaction:
  [View on Solscan (Devnet) →]
```

---

## Verification

### How to Verify Swaps Actually Happened

1. **Check Transaction Summary**
   - After swap, click Solscan link
   - View on-chain transaction

2. **Check Wallet Balances**
   - Before swap: Maker has NFT A, Taker has NFT B
   - After swap: Maker has NFT B, Taker has NFT A

3. **View on Solscan**
   ```
   https://solscan.io/tx/SIGNATURE?cluster=devnet
   ```

4. **Check NFT Ownership**
   - Maker wallet before/after
   - Taker wallet before/after
   - NFTs should have swapped owners

---

## What Gets Logged

### Backend Console Output

```
🧪 TEST SWAP EXECUTION REQUEST
⏰ Timestamp: 2025-11-26T18:00:00.000Z
📍 Network: https://red-quaint-wind.solana-devnet.quiknode.pro/...
✅ Test environment check passed - executing on devnet

📋 Required signatures: ['AoCpvu92duS...', '5VsKp5GWPqe...']
✅ Keypairs loaded successfully
   Maker: AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z
   Taker: 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4
✅ Transaction deserialized
🔐 Adding Maker signature
🔐 Adding Taker signature

📤 Submitting transaction to blockchain...
   Signers: 2

✅ TRANSACTION CONFIRMED!
   Signature: 3xVNFsCR82HUtR7zGemD4YFEBbyA1Xp3vJ1cm4mmVjggqQ1NP...
   Solscan: https://solscan.io/tx/3xVNFsCR...?cluster=devnet
```

---

## Testing the Feature

### Step-by-Step Test

1. **Go to `/test` page**
   ```
   https://staging-api.easyescrow.ai/test
   ```

2. **Select NFTs**
   - Pick an NFT from Maker side
   - Pick an NFT from Taker side

3. **Execute Swap**
   - Click "⚡ Execute Atomic Swap"
   - Review confirmation modal
   - Click "Confirm Swap"

4. **Watch Activity Log**
   ```
   🚀 Starting atomic swap...
   Step 1: Creating swap offer...
   ✓ Offer created (ID: 24)
   Step 2: Accepting offer...
   ✓ Offer accepted, transaction built
   Step 3: Executing swap on-chain...
   🔐 Signing with test wallet private keys...
   ✅ Transaction confirmed on blockchain!
   🔗 Signature: 3xVNFsCR82...
   ✅ Atomic swap completed successfully on devnet!
   ```

5. **Verify on Solscan**
   - Click Solscan link in transaction summary
   - Verify swap actually happened on-chain

---

## Security Best Practices

### ✅ DO

- ✅ Use this for devnet testing
- ✅ Use dedicated test wallets
- ✅ Keep test wallet SOL minimal
- ✅ Log all execution attempts
- ✅ Review audit logs regularly
- ✅ Ensure `.env` is gitignored

### ❌ DON'T

- ❌ Use mainnet private keys
- ❌ Use production wallets
- ❌ Deploy to production
- ❌ Remove security checks
- ❌ Commit private keys
- ❌ Share test wallet keys publicly

---

## Troubleshooting

### Error: "Test execution only available on devnet"

**Cause:** SOLANA_RPC_URL is not devnet

**Fix:**
```bash
# .env.staging
SOLANA_RPC_URL=https://...devnet.quiknode.pro/...
```

---

### Error: "Missing required test header"

**Cause:** Frontend not sending `X-Test-Execution: true` header

**Fix:** Check frontend code includes header:
```javascript
headers: {
  'X-Test-Execution': 'true',
}
```

---

### Error: "Test wallet private keys not configured"

**Cause:** Private keys missing from ENV

**Fix:**
```bash
# .env.staging
DEVNET_STAGING_SENDER_PRIVATE_KEY=xxx
DEVNET_STAGING_RECEIVER_PRIVATE_KEY=yyy
```

---

### Error: "Transaction failed"

**Causes:**
- Insufficient SOL for transaction fees
- NFT no longer owned by wallet
- Network issues

**Debug:**
1. Check backend logs for error details
2. Verify wallet balances
3. Confirm NFT ownership on Solscan

---

## File References

### Backend
- **Route:** `src/routes/test-execute.routes.ts`
- **Main App:** `src/index.ts` (imports testExecuteRoutes)
- **Route Index:** `src/routes/index.ts` (exports testExecuteRoutes)

### Frontend
- **JavaScript:** `src/public/js/test-page.js`
  - `executeAtomicSwap()` function
  - `showTransactionSummary()` function

### Configuration
- **Environment:** `.env.staging`
  - `DEVNET_STAGING_SENDER_PRIVATE_KEY`
  - `DEVNET_STAGING_RECEIVER_PRIVATE_KEY`
  - `SOLANA_RPC_URL`

---

## Summary

✅ **What Changed:**
- Added `/api/test/execute-swap` endpoint
- Backend signs transactions with private keys
- Real swaps execute on Solana devnet
- Actual transaction signatures returned

✅ **Security:**
- Devnet-only enforcement
- Required security header
- Private keys never exposed
- Extensive audit logging

✅ **Result:**
- Test page now shows REAL swaps
- Users can verify on Solscan
- Assets actually transfer on-chain
- Complete end-to-end testing

---

## Related Documentation

- [Atomic Swap Test Page](./ATOMIC_SWAP_TEST_PAGE.md)
- [Deployment Secrets Security](../../.cursor/rules/deployment-secrets.mdc)
- [Security Middleware](../../src/middleware/security.middleware.ts)

---

**Last Updated:** 2025-11-26  
**PR:** #288

