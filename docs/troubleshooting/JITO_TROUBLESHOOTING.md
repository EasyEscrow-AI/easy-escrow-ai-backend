# Jito Transaction Troubleshooting Guide

## Current Error
```
SendTransactionError: Transaction resulted in an error.
Transaction must write lock at least one tip account.
```

## Research Findings (from Perplexity Search - Oct 28, 2024)

### ✅ Confirmed Correct Implementation

1. **Tip Instruction Placement**: MUST be LAST instruction in transaction
   - Source: Jito docs, QuickNode guides, multiple GitHub examples
   - Our implementation: ✅ Correct

2. **skipPreflight Setting**: MUST be `true` for mainnet Jito transactions
   - Reason: Jito bundle transactions bypass mempool and simulation
   - Our implementation: ✅ Correct (`skipPreflight: isMainnet`)

3. **Minimum Tip Amount**: 1,000 lamports (0.000001 SOL) minimum
   - Our implementation: ✅ 1,000,000 lamports (0.001 SOL) - 1000x minimum

4. **Official Jito Tip Accounts**: Using 8 official addresses
   - Our implementation: ✅ Correct addresses from Jito documentation

5. **Priority Fees**: Compute budget with dynamic fee fetching
   - Our implementation: ✅ 50,000 microlamports (fallback) via QuickNode API

6. **No Address Lookup Tables**: Should not use ALTs for tip accounts
   - Our implementation: ✅ Not using ALTs

### 🚨 CRITICAL: QuickNode Add-on Requirement

**From QuickNode Documentation:**
> "Please note that this RPC method requires the **Lil' JIT - JITO Bundles and transactions** add-on enabled on your QuickNode endpoint."

**Required Add-on:**
- **Lil' JIT - JITO Bundles and transactions**
  - URL: https://marketplace.quicknode.com/add-on/lil-jit-jito-bundles-and-transactions
  - Purpose: Enables Jito bundle and transaction forwarding
  - Without this: Transactions may be rejected with tip account errors

**Currently Enabled Add-ons (Oct 28, 2024):**
1. ✅ Solana Priority Fee API by QuickNode
2. ✅ Solana MEV Resilience & Recovery by Blink Labs
3. ✅ Metaplex Digital Asset API (DAS) for Solana by QuickNode
4. ✅ Solana Transaction Fastlane by QuickNode
5. ✅ Smart Contract Metadata Verification API by DappRadar

**Status:** ❓ **Need to verify if Lil' JIT add-on is enabled**

### 📝 Additional Considerations

#### 1. sendTransaction vs sendRawTransaction

**Current Implementation:**
```typescript
await this.provider.connection.sendRawTransaction(transaction.serialize(), {
  skipPreflight: isMainnet,
  preflightCommitment: 'confirmed',
  maxRetries: 3,
});
```

**QuickNode Examples Use:**
```typescript
await connection.sendTransaction(transaction, signers, {
  skipPreflight: true,
  preflightCommitment: 'confirmed',
});
```

**Analysis:**
- Both methods should work
- `sendTransaction` signs the transaction internally
- `sendRawTransaction` takes pre-signed serialized transaction
- QuickNode may have better Jito integration with `sendTransaction`
- **Recommendation:** Current approach is correct for our use case (admin-signed transactions)

#### 2. 70/30 Priority Fee / Jito Tip Split

**From Jito Documentation:**
> "When using sendTransaction, it is recommended to use a 70/30 split between priority fee and jito tip"

**Example:**
```
Priority Fee (70%): 0.7 SOL
Jito Tip (30%): 0.3 SOL
===========================
Total Fee: 1.0 SOL
```

**Our Current Implementation:**
- Priority Fee: 50,000 microlamports (0.00005 SOL per compute unit)
- Jito Tip: 1,000,000 lamports (0.001 SOL)
- **Total**: ~0.00105 SOL (assuming 300k CU)

**Analysis:**
- Our split is approximately 4.8% priority fee, 95.2% Jito tip
- This is inverse of recommended 70/30 split
- **Recommendation:** Consider increasing priority fee for high-demand periods

#### 3. Tip Amount Dynamics

**Get Current Tip Floor:**
```bash
curl https://bundles.jito.wtf/api/v1/bundles/tip_floor
```

**Response Example:**
```json
{
  "time": "2024-09-01T12:58:00Z",
  "landed_tips_25th_percentile": 0.000006 SOL,
  "landed_tips_50th_percentile": 0.00001 SOL,
  "landed_tips_75th_percentile": 0.000036 SOL,
  "landed_tips_95th_percentile": 0.0014 SOL,
  "landed_tips_99th_percentile": 0.01 SOL,
  "ema_landed_tips_50th_percentile": 0.0000098 SOL
}
```

**Our Tip:** 0.001 SOL (1,000,000 lamports)
- Above 50th percentile ✅
- Below 95th percentile
- **Should be sufficient for most transactions**

### 🔧 Troubleshooting Steps

#### Step 1: Verify Lil' JIT Add-on is Enabled

1. Log into QuickNode dashboard
2. Navigate to your mainnet endpoint
3. Check "Marketplace Add-ons" section
4. Verify "Lil' JIT - JITO Bundles and transactions" is listed and active
5. **If not enabled**: Add it from marketplace

#### Step 2: Check Transaction Structure in Logs

**Expected Account Structure:**
```
Account 0: Escrow PDA (writable)
Account 1: Buyer (read-only)
Account 2: Seller (read-only)
Account 3: NFT Mint (read-only)
Account 4: Admin/Fee Payer (signer, writable) <-- SOL source
Account 5: System Program
Account 6: Jito Tip Account (writable) <-- From SystemProgram.transfer
```

**Verify in logs:**
- Jito tip account should appear in transaction accounts
- Should be marked as `isWritable: true`
- Should be receiving lamports from admin account

#### Step 3: Alternative: Use Jito Block Engine Directly

If QuickNode add-on issues persist, consider using Jito Block Engine directly:

```typescript
// Instead of QuickNode RPC
const JITO_BLOCK_ENGINE = 'https://mainnet.block-engine.jito.wtf';

// Use Jito's sendTransaction endpoint
const response = await fetch(`${JITO_BLOCK_ENGINE}/api/v1/transactions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'sendTransaction',
    params: [
      transaction.serialize().toString('base64'),
      { encoding: 'base64' }
    ],
  }),
});
```

**Note:** This bypasses QuickNode entirely and sends directly to Jito

#### Step 4: Verify Transaction Serialization

Ensure transaction is properly serialized with all accounts:

```typescript
console.log('Transaction size:', transaction.serialize().length, 'bytes');
console.log('Transaction accounts:', transaction.instructions.flatMap(ix => ix.keys).length);
```

**Expected:**
- Size: < 1232 bytes
- Accounts: 6-7 (including Jito tip account)

### 📚 Key Resources

1. **Jito Documentation:**
   - https://docs.jito.wtf/lowlatencytxnsend/
   - https://jito-foundation.gitbook.io/mev/

2. **QuickNode Guides:**
   - https://www.quicknode.com/guides/solana-development/transactions/jito-bundles
   - https://www.quicknode.com/docs/solana/sendTransaction-jito

3. **Jito Tip Dashboard:**
   - https://explorer.jito.wtf/

4. **Tip Floor API:**
   - REST: `https://bundles.jito.wtf/api/v1/bundles/tip_floor`
   - WebSocket: `wss://bundles.jito.wtf/api/v1/bundles/tip_stream`

### 🎯 Most Likely Root Cause

Based on research and error pattern:

**Primary Suspect:** **Missing Lil' JIT QuickNode Add-on**
- Error occurs even with correct implementation
- QuickNode requires specific add-on for Jito forwarding
- Without add-on, RPC may not recognize Jito tip instructions
- **Action:** Verify add-on is enabled on mainnet endpoint

**Secondary Possibilities:**
1. QuickNode RPC not forwarding to Jito block engine correctly
2. Tip account not being added to transaction account list properly
3. Transaction structure issue (though unlikely given our implementation)

### ✅ Next Actions

1. **IMMEDIATE:** Verify Lil' JIT add-on is enabled on QuickNode mainnet endpoint
2. **IF NOT ENABLED:** Add Lil' JIT add-on from QuickNode marketplace
3. **AFTER ENABLING:** Wait 5-10 minutes for propagation
4. **THEN:** Re-run production E2E test
5. **IF STILL FAILS:** Try Jito Block Engine direct connection (Step 3 above)

---

**Last Updated:** October 28, 2024  
**Status:** Waiting for deployment verification and Lil' JIT add-on confirmation














