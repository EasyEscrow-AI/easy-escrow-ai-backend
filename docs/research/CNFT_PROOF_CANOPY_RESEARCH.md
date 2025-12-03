# cNFT Proof Canopy Research - Why We Missed This

## Summary

We encountered a buffer overflow error (`offset 1000 > 999`) because we were sending **all 14 proof nodes** instead of trimming based on **canopy depth**.

**Root Cause:** Lack of understanding about how canopy storage works in Metaplex Bubblegum.

## What We Missed

### 1. Canopy Fundamentals

**What is Canopy?**
- Canopy is an on-chain cache of the first N levels of a merkle tree
- Stored directly in the tree account data
- Allows Bubblegum to reconstruct proofs without requiring ALL proof nodes in the transaction

**Our Configuration:**
- Tree Depth: 14 (can hold 2^14 = 16,384 cNFTs)
- Canopy Depth: 11 (first 11 levels cached on-chain)
- **Proof Nodes Required:** 14 - 11 = **3 nodes only!**

**What We Were Doing Wrong:**
- DAS API returns **all 14 proof nodes** (full path from leaf to root)
- We were passing all 14 nodes → 14 × 32 bytes = **448 bytes per cNFT**
- For dual cNFT swap: 2 × 448 = **896 bytes** just for proof data
- This pushed total transaction size over Solana's limits

### 2. Why We Didn't Know

**Official Documentation Gaps:**
1. **Metaplex Docs:** Don't explicitly explain you need to trim proof arrays
2. **DAS API:** Returns full proof array without mentioning canopy
3. **Bubblegum SDK:** No helper function to calculate required proof nodes
4. **Example Code:** Most examples use depth=3 trees (no canopy needed)

**Common Misconception:**
- Developers assume: "DAS API returns exactly what I need to send"
- Reality: "DAS API returns the FULL proof; YOU must trim based on YOUR canopy"

### 3. How to Calculate Required Proof Nodes

```typescript
// CORRECT FORMULA
const requiredProofNodes = Math.max(0, treeDepth - canopyDepth);

// For our trees:
const requiredProofNodes = Math.max(0, 14 - 11); // = 3

// Trim the proof array:
const proofToSend = fullProof.slice(-requiredProofNodes);
```

**Why `.slice(-N)` (last N nodes)?**
- Canopy stores the TOP of the tree (near root)
- We need to send the BOTTOM nodes (near leaf)
- Example for depth=14, canopy=11:
  - Canopy covers: levels 0-10 (11 levels from root down)
  - We send: levels 11-13 (last 3 levels near leaf)

## Research Findings from Web Search

### Key Insights

1. **Canopy Height Best Practice:**
   - Metaplex recommends: `canopyDepth = depth - 3`
   - This allows passing 3 accounts (standard for Solana NFT programs)
   - Our config (depth=14, canopy=11) follows this pattern ✅

2. **Transaction Size Limits:**
   - Solana transaction max size: **1232 bytes**
   - Serialized transaction components:
     - Signatures: ~64 bytes each
     - Account keys: ~32 bytes each
     - Instruction data: Variable
     - Compute budget: ~40 bytes
   - **Proof data was eating into instruction data budget**

3. **Common Pitfalls:**
   - Passing full proof when canopy exists
   - Not accounting for dual-asset transactions (2× proof data)
   - Forgetting about signature and account overhead
   - Testing with shallow trees (depth < 5) where this doesn't matter

### Why E2E Tests Didn't Catch This

**Our E2E Test (02-atomic-cnft-for-sol-happy-path.test.ts):**
- ❌ Only tested offer **creation**
- ❌ Never tested offer **acceptance** (actual swap execution)
- ❌ Never serialized full transaction with proof data

**What We Fixed:**
- ✅ Now tests full swap execution
- ✅ Verifies on-chain cNFT ownership transfer
- ✅ Would have caught buffer overflow

## Other Potential Issues to Watch

### 1. Compute Units

**Current Status:** Unknown - need to measure

**Risk Areas:**
- cNFT verification uses significant compute units
- Dual cNFT swaps need 2× cNFT CPIs
- Platform fee calculation adds overhead
- Might hit 200k compute unit limit

**Action Items:**
- [ ] Measure actual compute usage for different swap types
- [ ] Add compute budget instructions if needed
- [ ] Test with mainnet-style accounts (realistic rent)

### 2. Account Size Limits

**Current Status:** Should be fine

**Tree Account Sizes:**
- Depth 14, Buffer 64, Canopy 11: ~82KB
- Well under Solana's 10MB account limit ✅

### 3. Concurrent Tree Updates

**Current Status:** Unknown - need to test

**Risk Areas:**
- Buffer size: 64 (can handle 64 concurrent updates per slot)
- High-volume swaps might exhaust buffer
- Failed transactions leave buffer slots occupied

**Action Items:**
- [ ] Test concurrent swap behavior
- [ ] Monitor buffer usage on production trees
- [ ] Consider larger buffer for high-volume trees

### 4. Stale Proofs

**Current Status:** Handled by Bubblegum

**How It Works:**
- Proofs become invalid after tree updates
- Bubblegum checks root hash matches
- Transactions fail with "Invalid root" if stale

**Mitigation:**
- Get fresh proof immediately before swap
- Consider proof expiration time for offers
- Retry logic for stale proof errors

### 5. ATA (Associated Token Account) Creation

**Current Status:** Handled in backend

**Costs:**
- Creating ATA: ~0.00203 SOL (~2 million lamports)
- For dual SPL NFT swaps: Potentially 4 ATAs
- Could be 0.008 SOL overhead per swap

**Action Items:**
- [ ] Verify ATA creation is included in fee estimates
- [ ] Test swap when ATAs don't exist
- [ ] Document rent requirements clearly

### 6. Transaction Expiration

**Current Status:** Unknown - check implementation

**Risk Areas:**
- Recent blockhash expires after ~1 minute
- Long-running offer acceptance flows
- User approval delays

**Action Items:**
- [ ] Check if we're using durable nonces
- [ ] Test transaction expiration scenarios
- [ ] Implement retry with fresh blockhash

## Lessons Learned

### 1. Don't Trust API Responses Blindly

**Problem:** DAS API returns data that's NOT transaction-ready
**Solution:** Always validate and transform API data based on YOUR requirements

### 2. Test Full Transaction Flow

**Problem:** Unit tests and partial E2E tests miss serialization issues
**Solution:** E2E tests MUST execute actual transactions on devnet/staging

### 3. Research Before Implementation

**Problem:** We implemented based on struct definitions, not actual requirements
**Solution:** Research Metaplex/Bubblegum best practices FIRST

### 4. Monitor Transaction Sizes

**Problem:** No visibility into transaction data size until it fails
**Solution:** Add logging for transaction sizes in development

### 5. Document Constraints

**Problem:** Future developers won't know about canopy trimming
**Solution:** Document all magic numbers and calculations

## Recommendations

### Immediate Actions

1. ✅ **Trim proof arrays** (PR #315)
2. ⏳ **Measure compute units** for all swap types
3. ⏳ **Add transaction size logging** in development
4. ⏳ **Test concurrent swaps** on staging
5. ⏳ **Verify ATA handling** and fee calculations

### Documentation Needed

1. **README section** on cNFT constraints
2. **Code comments** explaining canopy calculations
3. **Architecture doc** on transaction size budgets
4. **Runbook** for common cNFT errors and fixes

### Future Improvements

1. **Compute budget optimizer** - auto-adjust based on swap type
2. **Transaction size estimator** - warn before serialization
3. **Proof validator** - check proof freshness before swap
4. **Canopy calculator** - helper function for tree configs

## Reference Links

- [Solana State Compression Guide](https://solana.com/developers/courses/state-compression)
- [Metaplex Bubblegum Docs](https://developers.metaplex.com/bubblegum)
- [Concurrent Merkle Trees](https://www.zkcompression.com/learn/core-concepts/merkle-trees-validity-proofs)
- [Transaction Size Limits](https://solana.com/docs/core/transactions)

## Version History

- **2025-11-29:** Initial research after buffer overflow discovery
- **Related PRs:** #313 (struct), #314 (IDL), #315 (canopy trimming)

