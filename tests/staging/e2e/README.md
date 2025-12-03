# Staging Atomic Swap E2E Tests

End-to-end tests for atomic swap functionality on staging (devnet).

## Tests

- `01-atomic-nft-for-sol-happy-path.test.ts` - NFT → SOL swaps (✅ Scenario 1 complete)
- `02-atomic-cnft-for-sol-happy-path.test.ts` - cNFT → SOL swaps (uses pre-minted cNFTs)
- `03-atomic-nft-for-nft-happy-path.test.ts` - NFT → NFT swaps
- `04-atomic-nft-for-cnft-happy-path.test.ts` - NFT → cNFT swaps (uses pre-minted cNFTs)

## Running Tests

### First Time Setup (cNFT Tests Only)

cNFT tests use **pre-minted, reusable cNFTs** to avoid tree creation costs (~1.134 SOL per run).

**One-time setup:**
```bash
# Create 5 reusable test cNFTs (one-time cost: ~1.134 SOL)
npm run staging:setup-test-cnfts
```

This creates `tests/fixtures/staging-test-cnfts.json` with pre-configured cNFTs.

### Running Individual Tests

```bash
# NFT tests (no setup needed)
npm run test:staging:e2e:atomic:nft-sol
npm run test:staging:e2e:atomic:nft-for-nft

# cNFT tests (requires setup above)
npm run test:staging:e2e:atomic:cnft-for-sol
npm run test:staging:e2e:atomic:nft-for-cnft

# All atomic swap tests
npm run test:staging:e2e:atomic:all
```

### After cNFT Tests

cNFTs are transferred during tests. Rebalance them for next run:

```bash
# Return cNFTs to original owner
npm run staging:rebalance-cnfts
```

## Environment Variables Required

```bash
STAGING_API_URL=https://easyescrow-backend-staging.ondigitalocean.app
ATOMIC_SWAP_API_KEY=<your-api-key>
STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# ⚠️ CRITICAL FOR cNFT SWAPS: Requires QuickNode or Helius with DAS API
STAGING_SOLANA_RPC_URL=https://xxx.devnet.quiknode.pro/YOUR_KEY/
# Or Helius: https://devnet.helius-rpc.com/?api-key=YOUR_KEY
```

### Why Premium RPC is Required

**cNFT tests require real-time Merkle proof generation** from the DAS (Digital Asset Standard) API:
- ❌ Public RPC (`https://api.devnet.solana.com`) has slow/cached proofs → stale proof errors
- ✅ Helius devnet RPC (FREE): Fresh proofs, real-time indexing
- ✅ QuickNode devnet (FREE tier): Fresh proofs, low latency

**Without a proper RPC, cNFT tests WILL FAIL with:**
```
Error: Invalid root recomputed from proof
```

See `docs/ATOMIC_SWAP_ENVIRONMENT_VARIABLES.md` for complete setup.

---

## Pre-Minted cNFT Testing (Cost Optimization)

cNFT tests use **pre-minted, reusable cNFTs** instead of creating fresh ones for each test run.

### Benefits

- ✅ **Zero cost** per test run (vs ~1.134 SOL for tree creation)
- ✅ **80% faster** test startup (no tree creation + minting wait)
- ✅ **No DAS indexing wait** (cNFTs already indexed)
- ✅ **Cleaner devnet** (single shared tree, reused cNFTs)
- ✅ **Team friendly** (shared config file, no per-developer setup)

### Workflow

**1. One-Time Setup (First Time):**
```bash
npm run staging:setup-test-cnfts
```

**2. Run Tests (Anytime):**
```bash
npm run test:staging:e2e:atomic:cnft-for-sol
```

**3. Rebalance (After Tests):**
```bash
npm run staging:rebalance-cnfts
```

### Configuration

Test cNFTs are stored in: `tests/fixtures/staging-test-cnfts.json`

This file **should be committed** to version control (no secrets, safe to share).

### Cost Comparison

| Approach | Setup Cost | Per-Test Cost | 10 Runs Total |
|----------|-----------|---------------|---------------|
| **Old (create each time)** | $0 | ~1.135 SOL | ~11.35 SOL |
| **New (pre-minted)** | ~1.134 SOL | $0 | ~1.134 SOL |

**Savings:** ~90% cost reduction for multiple test runs!

See `temp/PRE_MINTED_CNFT_SETUP.md` for detailed guide.

## Related

- API Client: `tests/helpers/atomic-swap-api-client.ts`
- Verification: `tests/helpers/swap-verification.ts`
- Docs: `docs/tasks/ATOMIC_SWAP_E2E_*.md`

