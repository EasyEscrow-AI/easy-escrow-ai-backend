# cNFT Canopy Lessons: What We Missed & What Else Could Fail

## Executive Summary

We spent hours debugging cNFT swaps, encountering 7 different errors before discovering we needed to **trim proof arrays based on canopy depth**. This document explains:
1. **WHY we missed this**
2. **What we learned from research**
3. **OTHER potential issues** to watch for

---

## Part 1: Why We Missed the Canopy Requirement

### The Fundamental Misunderstanding

**What We Thought:**
> "DAS API returns the proof. I send it to the program. Done."

**Reality:**
> "DAS API returns the FULL proof. YOU must trim it based on YOUR tree's canopy configuration."

### Why This Wasn't Obvious

#### 1. Documentation Doesn't Explain Trimming

**Metaplex Bubblegum Docs:**
- ✅ Explains what canopy is
- ✅ Shows canopy reduces proof size
- ❌ **Doesn't say you must manually trim the array**

**DAS API Docs:**
- ✅ Shows `getAssetProof` endpoint
- ❌ **Doesn't mention canopy considerations**
- ❌ **Returns all 14 nodes without indication they should be trimmed**

#### 2. Example Code Uses Small Trees

Most Metaplex examples use `depth=3` trees:
```typescript
// Common example (no canopy needed)
maxDepth: 3,  // Only 8 leaves
bufferSize: 8,
canopyDepth: 0  // No canopy
```

With depth=3 and canopy=0, you send **all 3 proof nodes**. The trimming issue doesn't arise!

#### 3. Our E2E Tests Were Incomplete

```typescript
// What we tested (BEFORE fix)
const createResponse = await apiClient.createOffer({...});
// ✅ Offer created
// ❌ Never executed the swap!
```

**The Problem:**
- Offer creation doesn't serialize proof data
- Only swap execution serializes the full transaction
- Buffer overflow only happens during serialization

**What We Fixed:**
```typescript
// Now tests full execution
const acceptResponse = await apiClient.acceptOffer(...);
const signature = await signAndSendTransaction(...);
await waitForConfirmation(...);
// ✅ Actually executes on-chain
```

### The Math We Should Have Done Upfront

**Our Tree Configuration:**
- maxDepth: **14** (can hold 16,384 cNFTs)
- canopyDepth: **11**

**Required Proof Nodes Formula:**
```
requiredNodes = maxDepth - canopyDepth
              = 14 - 11
              = 3 nodes
```

**What We Were Sending:**
- DAS returns: 14 nodes × 32 bytes = **448 bytes**
- Should send: 3 nodes × 32 bytes = **96 bytes**
- **Waste: 352 bytes per cNFT**
- **For dual cNFT swap: 704 bytes wasted!**

---

## Part 2: Research Findings

### Key Insight #1: Canopy Best Practices

**Metaplex Recommendation:**
```
canopyDepth = maxDepth - 3
```

**Why 3?**
- Most Solana NFT programs pass ~3 accounts per operation
- Keeps transactions under size limits
- Balances on-chain storage cost vs transaction efficiency

**Our Config (14, 11):**
- ✅ Follows best practice (14 - 3 = 11)
- ✅ Allows 3 proof nodes per cNFT
- ✅ Dual cNFT swaps still fit in transactions

### Key Insight #2: Transaction Size Budget

**Solana Transaction Limits:**
```
Max transaction size: 1232 bytes
```

**Breakdown:**
- Signatures: ~64 bytes each × 2 signers = **128 bytes**
- Accounts: ~32 bytes each × ~17 accounts = **544 bytes**
- Instruction data: **~400 bytes** (our swap params)
- Compute budget: **~40 bytes**
- **Remaining buffer: ~120 bytes**

**With 14-node proofs:**
- Dual cNFT proofs: 896 bytes
- **Total: ~1600 bytes** ❌ EXCEEDS LIMIT

**With 3-node proofs:**
- Dual cNFT proofs: 192 bytes
- **Total: ~1300 bytes** ⚠️ Close but OK

### Key Insight #3: How Bubblegum Uses Canopy

**Without Canopy:**
```
1. Read proof nodes from transaction accounts
2. Compute merkle root from leaf to root
3. Compare with tree's root hash
```

**With Canopy:**
```
1. Read canopy data from tree account (first 11 levels)
2. Read remaining 3 proof nodes from transaction
3. Combine: canopy[0..10] + transaction[11..13]
4. Compute merkle root
5. Compare with tree's root hash
```

**Why This Works:**
- Canopy is stored IN the tree account
- Bubblegum reads it automatically
- No CPI needed, just account data read
- Reduces transaction size significantly

---

## Part 3: Other Potential Issues

### 🔴 HIGH RISK: Compute Units

**Current Status:** ⚠️ **UNKNOWN**

**The Problem:**
- Solana has a 200k compute unit limit per transaction
- cNFT verification is compute-intensive
- Dual cNFT swaps do 2× cNFT CPIs

**What Uses Compute:**
1. Nonce advancement: ~3k units
2. Platform fee calculation: ~2k units
3. cNFT transfer (maker): **~50k units** 🔥
4. cNFT transfer (taker): **~50k units** 🔥
5. SPL token transfers: ~10k units each
6. SOL transfers: ~5k units

**Estimated for Dual cNFT Swap:**
```
3k + 2k + 50k + 50k = 105k units
```

**Risk Level:** 🟡 Medium (should be under 200k, but close)

**Action Items:**
- [ ] Measure actual compute usage on devnet
- [ ] Test worst-case: cNFT + cNFT + SOL + SPL
- [ ] Add compute budget instruction if > 150k
- [ ] Monitor for "exceeded max units" errors

### 🟡 MEDIUM RISK: Concurrent Tree Updates

**Current Status:** ⚠️ **UNKNOWN**

**The Problem:**
- Tree buffer size: **64** (can handle 64 concurrent updates)
- High-volume periods could exhaust buffer
- Failed transactions leave buffer slots occupied

**How Buffer Works:**
```typescript
// Buffer tracks recent changes
buffer: [
  { seq: 100, root: "abc..." },
  { seq: 101, root: "def..." },
  // ... up to 64 entries
]
```

**When Buffer Fills:**
- New transactions must wait for buffer slots
- Older slots get cleared as tree finalizes
- Congestion can cause temporary failures

**Action Items:**
- [ ] Monitor buffer usage on production trees
- [ ] Test 10+ concurrent swaps
- [ ] Consider buffer size 128 for mainnet
- [ ] Implement retry logic for buffer-full errors

### 🟡 MEDIUM RISK: Stale Proofs

**Current Status:** ⚠️ **PARTIALLY HANDLED**

**The Problem:**
- Proofs become invalid after ANY tree update
- User A gets proof at time T1
- User B mints at time T2 (tree updated)
- User A's proof is now stale (root changed)

**Current Mitigation:**
- Get fresh proof immediately before swap ✅
- Bubblegum rejects stale proofs ✅

**Edge Cases:**
- **Offer flow:** Proof in offer might be stale by acceptance time
- **Long approvals:** User delays signing for > 1 minute

**Action Items:**
- [ ] Add proof freshness check to offer acceptance
- [ ] Regenerate proof if offer is old (> 5 min)
- [ ] Retry with fresh proof on "Invalid root" error
- [ ] Document expected proof lifetime

### 🟢 LOW RISK: ATA Creation Costs

**Current Status:** ✅ **HANDLED** (but verify)

**The Costs:**
- Creating ATA: ~0.00203 SOL rent
- Dual SPL NFT swap: Potentially 4 ATAs
- Total: ~0.008 SOL overhead

**Current Implementation:**
```typescript
// Backend creates ATAs if needed
if (!makerNftDestination) {
  transaction.add(createAssociatedTokenAccountInstruction(...));
}
```

**Action Items:**
- [ ] Verify ATA rent in fee estimates
- [ ] Test swap when NO ATAs exist (worst case)
- [ ] Document rent requirements in UI
- [ ] Consider ATA reimbursement from fees

### 🟢 LOW RISK: Transaction Expiration

**Current Status:** ✅ **USING DURABLE NONCES**

**How It Works:**
- We use durable nonces (not recent blockhash)
- Nonces don't expire
- Transactions can be held indefinitely ✅

**Verification:**
```typescript
// TransactionBuilder uses nonces
const nonceInstruction = SystemProgram.nonceAdvance({
  noncePubkey: inputs.nonceAccountPubkey,
  authorizedPubkey: this.platformAuthority.publicKey,
});
```

**No action needed** - we're good here! ✅

### 🟢 LOW RISK: Account Size Limits

**Current Status:** ✅ **WELL WITHIN LIMITS**

**Tree Account Sizes:**
```
Depth 14, Buffer 64, Canopy 11:
  Base: ~5KB
  Canopy: ~64KB
  Buffer: ~13KB
  Total: ~82KB
```

Solana limit: **10MB**
Our usage: **82KB** (0.8%)

**No action needed** - plenty of headroom! ✅

---

## Part 4: Lessons Learned

### 1. Test the FULL Flow

**BAD:**
```typescript
// Only test creation
const offer = await createOffer(...);
expect(offer).toBeDefined();
```

**GOOD:**
```typescript
// Test full execution
const offer = await createOffer(...);
const tx = await acceptOffer(...);
const sig = await sendTransaction(tx);
await confirmTransaction(sig);
// Verify on-chain state changed
```

### 2. Research Before Implementing

**What We Should Have Done:**
1. Read Metaplex docs thoroughly
2. Search for "bubblegum canopy proof nodes"
3. Find example code for depth=14 trees
4. Test with realistic data BEFORE production

**What We Actually Did:**
1. Read struct definitions
2. Implement based on types
3. Debug errors as they came up
4. Learn the hard way 😅

### 3. Add Observability Early

**What Would Have Helped:**
```typescript
// Log transaction sizes during development
console.log('Transaction size:', serialized.length, 'bytes');
console.log('Proof nodes sent:', proof.length);
console.log('Compute units used:', actualComputeUnits);
```

We added size checking (line 203 in `transactionBuilder.ts`), but **too late**. Add it from day 1!

### 4. Document Magic Numbers

**BAD:**
```typescript
const proof = dasProof.proof.slice(-3);
```

**GOOD:**
```typescript
// CRITICAL: Trim proof based on canopy depth
// Our trees: depth=14, canopy=11 → need last 3 nodes
// Canopy stores first 11 levels on-chain
const CANOPY_DEPTH = 11;
const requiredNodes = maxDepth - CANOPY_DEPTH;  // = 3
const proof = dasProof.proof.slice(-requiredNodes);
```

### 5. E2E Tests Must Execute Transactions

**Not Enough:**
- ❌ API returns 200
- ❌ Transaction builds without error
- ❌ Simulation passes

**Required:**
- ✅ Transaction sent to devnet
- ✅ Confirmed on-chain
- ✅ On-chain state verified (ownership changed)

---

## Part 5: Action Items

### Immediate (Before Next Deploy)

- [ ] Measure compute units for all swap types
- [ ] Add transaction size logging to development
- [ ] Verify ATA creation costs in fee estimates
- [ ] Test concurrent swaps (10+ simultaneous)

### Short Term (Next Sprint)

- [ ] Add proof freshness check to offer flow
- [ ] Implement retry logic for stale proofs
- [ ] Document all cNFT constraints in README
- [ ] Create runbook for common cNFT errors

### Long Term (Future Improvements)

- [ ] Build compute budget optimizer (auto-adjust)
- [ ] Create transaction size estimator (warn before serialize)
- [ ] Add proof validator (check freshness before swap)
- [ ] Build canopy calculator helper function

---

## Part 6: Resources & References

### Official Documentation

- [Solana State Compression Guide](https://solana.com/developers/courses/state-compression)
- [Metaplex Bubblegum Docs](https://developers.metaplex.com/bubblegum)
- [Concurrent Merkle Trees Explained](https://www.zkcompression.com/learn/core-concepts/merkle-trees-validity-proofs)
- [Solana Transaction Limits](https://solana.com/docs/core/transactions)

### Key Formulas

```typescript
// Required proof nodes
const requiredNodes = Math.max(0, maxDepth - canopyDepth);

// Proof trimming (send last N nodes)
const trimmedProof = fullProof.slice(-requiredNodes);

// Transaction size budget
const maxSize = 1232;  // Solana limit
const safeSize = 1200; // Leave 32-byte buffer

// Canopy recommendation
const recommendedCanopy = maxDepth - 3;
```

---

## Conclusion

The canopy trimming requirement was:
1. **Not documented** clearly by Metaplex
2. **Not obvious** from DAS API responses
3. **Not caught** by incomplete E2E tests
4. **Not needed** in shallow tree examples

We learned the hard way. This document ensures **no one makes the same mistake again**.

**Total PRs to fix cNFT swaps: 7**
**Time spent: ~4 hours**
**Lessons learned: Priceless** ✅

