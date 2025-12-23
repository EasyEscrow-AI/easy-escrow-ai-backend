# Dedicated Test Merkle Trees for Staging

## Problem

Shared public devnet Merkle trees cause **stale proof errors** because:
- Multiple developers test cNFTs in the same trees
- Every mint/transfer/burn changes the tree root
- Proofs become invalid between transaction building and execution
- Tests fail constantly with "Invalid root recomputed from proof"

## Solution

Create **dedicated private Merkle trees** that only our staging environment uses:
- No external developers modifying our trees
- Predictable, controlled testing environment
- Proofs remain valid for normal execution timeframes
- Retry logic becomes a safety net, not a requirement

---

## Setup Instructions

### 1. Prerequisites

Ensure you have these environment variables configured:

```bash
# Required for tree creation
DEVNET_STAGING_ADMIN_PRIVATE_KEY=<admin-keypair-base58>
DEVNET_STAGING_SENDER_PRIVATE_KEY=<maker-keypair-base58>
DEVNET_STAGING_RECEIVER_PRIVATE_KEY=<taker-keypair-base58>
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=<your-key>
```

### 2. Fund Admin Wallet

The admin wallet needs SOL to create trees (~0.5 SOL):

```bash
# Get admin address
echo $DEVNET_STAGING_ADMIN_PRIVATE_KEY | \
  solana-keygen pubkey

# Request airdrop
solana airdrop 2 <admin-address> --url devnet
```

### 3. Run Setup Script

```bash
# Create dedicated trees and mint test cNFTs
npx ts-node scripts/setup-dedicated-test-trees.ts
```

This script will:
1. Create 2 dedicated Merkle trees (Maker + Taker)
2. Mint 4 test cNFTs into each tree
3. Generate environment variables
4. Save tree keypairs for backup

### 4. Configure Environment

Add the generated environment variables to:

**Local (.env.staging):**
```bash
# Copy from temp/staging-test-trees.env
STAGING_MAKER_TEST_TREE=<tree-address>
STAGING_TAKER_TEST_TREE=<tree-address>
STAGING_MAKER_CNFT_1=<asset-id>
STAGING_MAKER_CNFT_2=<asset-id>
# ... etc
```

**DigitalOcean App Platform:**
1. Go to staging app → Settings → Environment Variables
2. Add each variable from `temp/staging-test-trees.env`
3. Redeploy the app

### 5. Update Test Page (Optional)

The `/test` page can be configured to use dedicated test trees by default:

```typescript
// In src/public/js/test-page.js
const DEFAULT_MAKER_CNFTS = [
  process.env.STAGING_MAKER_CNFT_1,
  process.env.STAGING_MAKER_CNFT_2,
  // ...
];
```

---

## Benefits

### Before (Shared Trees)
```
Our test: Build transaction with proof (root: ABC...)
Random dev: Mints cNFT → root changes to XYZ...
Our test: Execute transaction → ❌ FAIL (proof stale)
Our test: Retry #1 → ❌ FAIL (another change)
Our test: Retry #2 → ❌ FAIL (another change)
Our test: Retry #3 → ❌ FAIL (another change)
Result: Tests fail constantly, retries exhausted
```

### After (Dedicated Trees)
```
Our test: Build transaction with proof (root: ABC...)
(No external modifications - tree is private)
Our test: Execute transaction → ✅ SUCCESS (proof valid)
Result: Reliable testing, retry rarely needed
```

---

## Maintenance

### Re-mint Test cNFTs

If test cNFTs get transferred/burned, re-run the setup script:

```bash
npx ts-node scripts/setup-dedicated-test-trees.ts
```

This will create **new trees** with fresh cNFTs.

### Monitor Tree State

Check tree root and cNFT count:

```bash
# Using DAS API
curl -X POST https://devnet.helius-rpc.com/?api-key=<key> \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getAssetsByGroup",
    "params": {
      "groupKey": "collection",
      "groupValue": "<tree-address>"
    }
  }'
```

### Tree Capacity

- **Depth 14** = 16,384 cNFTs max
- **Buffer 64** = 64 concurrent updates
- **Canopy 11** = minimal proof size (3 nodes)

If you need more capacity, modify `DEFAULT_TREE_CONFIG` in `setup-dedicated-test-trees.ts`.

---

## Cost Analysis

### One-Time Setup
- **Tree Creation**: ~0.2 SOL per tree (rent)
- **Mint 8 cNFTs**: ~0.05 SOL
- **Total**: ~0.45 SOL (~$60 at $130/SOL)

### Ongoing
- **Free**: No fees after setup
- **Devnet**: All testing is free

### Production
For mainnet, consider:
- Collection-specific trees (1 tree per NFT project)
- Shared marketplace tree (if needed)
- Budget ~0.5 SOL per tree for rent exemption

---

## Comparison: Dedicated vs Shared Trees

| Aspect | Shared Public Trees | Dedicated Private Trees |
|--------|---------------------|-------------------------|
| **Proof Stability** | ❌ High collision rate | ✅ Controlled environment |
| **Test Reliability** | ❌ Fails frequently | ✅ Predictable behavior |
| **Retry Frequency** | ❌ 3-5 retries common | ✅ Rare (safety net only) |
| **Setup Cost** | ✅ Free (use existing) | ⚠️ ~0.5 SOL one-time |
| **Maintenance** | ✅ None needed | ⚠️ Re-create if wiped |
| **Production Ready** | ❌ Not representative | ✅ Mirrors production |

---

## Troubleshooting

### "Insufficient balance to create trees"
```bash
# Airdrop more SOL
solana airdrop 2 <admin-address> --url devnet
```

### "Tree already exists"
The script generates new trees each time. Old trees remain on-chain but become unused.

### "Failed to mint cNFT"
- Check admin wallet has tree authority
- Verify Bubblegum program is available on devnet
- Check RPC URL is correct

### Still getting stale proof errors
- Verify environment variables are set correctly
- Confirm asset IDs are from the new dedicated trees
- Check DigitalOcean deployment picked up new env vars

---

## Next Steps

Once dedicated trees are set up:

1. **Test cNFT <> cNFT swaps** - Should work reliably now
2. **Monitor retry frequency** - Should drop to near-zero
3. **Update documentation** - Note dedicated tree usage
4. **Production planning** - Apply same pattern to mainnet

The retry logic remains as a **safety net** for network delays and rare race conditions, but should rarely fire with dedicated trees.

