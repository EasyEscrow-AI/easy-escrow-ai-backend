# cNFT Swap Debugging Guide

## Current Status

**Setup:**
- ✅ Dedicated private tree: `HGXLWQQjFtu9BmrmfB96UwfKDBP4tvmKGsxDd1kpZu6x`
- ✅ 8 properly-minted monkeys (leaves 0-7)
- ✅ Tree filter active (only shows dedicated tree cNFTs)
- ✅ Backend retry logic (2 attempts max)
- ⚠️ Still getting "Invalid root recomputed from proof"

**8 Keeper Monkeys (Latest, Proper):**
1. Capuchin: `AAWRiG74BBD4YDk1NKtZcQUjTGXSKVdj2RKZaENBtr7U` (leaf 0, maker)
2. Howler: `9aNWKhb4mnme3YWz8TVzfxdiA8shfSNbHV99ag3vtugX` (leaf 1, maker)
3. Spider: `CjQ5u5ogwp9GjyCsSmNbAVoJEfaQnazgtQsG9QJyCzgh` (leaf 2, maker)
4. Macaque: `61pup3JKassjxGJPTyMFhfj4AxfQbjAM8oaoAnUbG5fk` (leaf 3, maker)
5. Baboon: `8jCDDrun73DzcKe5FwhiMBZ1wPdCniwJ75xh5zwzxKge` (leaf 4, taker)
6. Mandrill: `FLBfaSW5F93KgEiY6GTTiA5nAw5mH37HndmKBBBJWBox` (leaf 5, taker)
7. Tamarin: `F8czLmtfFpDycWqv5La6u1zjE4zkTAyfmcxwvNvxMVPm` (leaf 6, taker)
8. Marmoset: `Gn87QEarQQARHrTRWi7mQU99cme9ogSnRcdr4g9Y9Td8` (leaf 7, taker)

## Problem

Despite dedicated tree and proper minting:
- **Error:** "Invalid root recomputed from proof"
- **Status:** 500 Internal Server Error (not 409)
- **Retry:** Not triggering (should retry with fresh proof)

## Hypothesis

The retry logic is only in `test-execute.routes.ts` for **execution** failures, but the error is happening during **transaction building** in `offerManager.acceptOffer`.

**Flow:**
1. Create offer → builds transaction (proof fetched here)
2. Accept offer → rebuilds transaction (proof fetched again) ← **Might fail here!**
3. Execute → signs and sends (retry logic is here)

If step 2 fails, step 3 never runs, so retry never triggers!

## Why Proofs Go Stale

Even in a dedicated tree with no external mints:
1. **Time delay** between proof fetch and execution (~1-2 seconds)
2. **Tree modifications** from previous test swaps
3. **DAS API lag** (proof data might be slightly behind chain state)
4. **Canopy mismatch** (if canopy depth calculation is wrong)

## Solutions to Try

### 1. Reduce Time Between Build and Execute
Currently: Create → Accept (rebuild) → Execute
Better: Create → Execute immediately (skip accept rebuild)

### 2. Add Retry to offerManager.acceptOffer
Already done in PR #320, but might not be working correctly.

### 3. Fresh Tree for Each Test
Problem: Every swap changes the tree, affecting next swap.
Solution: Create new tree for each test (expensive).

### 4. Use Lighter Retry Strategy
Current: 2 attempts with rebuild
Better: 3-5 attempts with minimal delay

### 5. Investigate Canopy Depth
Current: Assuming canopy depth 11
Reality: Might be different, causing proof size mismatch

## Testing Strategy

### Test 1: Verify Keeper Monkeys
Try swapping these specific monkeys (known good):
- Spider (CjQ5u5ogwp9GjyCsSmNbAVoJEfaQnazgtQsG9QJyCzgh)
- Baboon (8jCDDrun73DzcKe5FwhiMBZ1wPdCniwJ75xh5zwzxKge)

### Test 2: Check Backend Logs
Look for:
- Retry attempts in logs
- Where the error originates (acceptOffer vs execute)
- Actual vs expected tree root

### Test 3: Verify Tree State
```bash
# Check current tree root
curl -X POST $SOLANA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getAccountInfo",
    "params": [
      "HGXLWQQjFtu9BmrmfB96UwfKDBP4tvmKGsxDd1kpZu6x",
      {"encoding": "base64"}
    ]
  }'
```

### Test 4: Manual Proof Verification
Fetch proof manually and compare:
```bash
curl -X POST $SOLANA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getAssetProof",
    "params": {
      "id": "CjQ5u5ogwp9GjyCsSmNbAVoJEfaQnazgtQsG9QJyCzgh"
    }
  }'
```

## Next Steps

1. **Check if retry is even attempting** (add more logging)
2. **Verify the error happens during accept, not execute**
3. **Consider skipping the accept rebuild** (use transaction from create)
4. **Increase retry attempts** from 2 to 5
5. **Add delay between retries** (100-500ms)

## Alternative Approach

**Use SPL NFTs instead of cNFTs for testing!**

Pros:
- No Merkle proofs needed
- No stale proof issues
- Simpler, more reliable
- Same atomic swap logic

Cons:
- Different from production cNFTs
- More expensive to mint
- Larger transaction size

For quick testing, SPL NFTs might be the pragmatic choice while we debug cNFT proofs.

