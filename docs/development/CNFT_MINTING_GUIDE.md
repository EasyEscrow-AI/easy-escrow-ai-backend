# cNFT Minting Guide for Test Wallets

Quick guide for minting compressed NFTs (cNFTs) on test wallets for atomic swap testing.

## Test Wallets

- **Maker:** `FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71`
- **Taker:** `Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk`

## Quick Options (Easiest First)

### Option 1: QuickNode DAS API (Recommended - Already Configured!)

**Best for:** We already use QuickNode! Zero additional setup needed.

**We have QuickNode configured for:**
- cNFT metadata fetching (already working)
- DAS API endpoint (ready to use)
- Same RPC we use for everything else

```bash
# We already have this in our code!
# Just use the QuickNode endpoint with DAS methods

# Example: Mint cNFT via QuickNode
curl https://your-quicknode-endpoint.solana-devnet.quiknode.pro/YOUR_TOKEN/ \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "mintCompressedNft",
    "params": {
      "name": "Test cNFT",
      "symbol": "TEST",
      "uri": "https://arweave.net/metadata.json",
      "receiver": "FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71"
    }
  }'
```

**Resources:**
- [QuickNode DAS API Docs](https://www.quicknode.com/docs/solana/qn_fetchNFTs)
- [QuickNode cNFT Guide](https://www.quicknode.com/guides/solana-development/compressed-nfts)
- [DAS API Reference](https://docs.quicknode.com/docs/solana-digital-asset-standard-das-api)

**Advantages:**
- ✅ Already configured in our project
- ✅ Same endpoint we use for everything
- ✅ No additional API keys needed
- ✅ Consistent with our infrastructure

---

### Option 2: Helius DAS API (Also Great)

**Best for:** Programmatic minting, alternative provider

```bash
# Using Helius RPC with cNFT support
# Requires Helius API key

# Install dependencies
npm install @solana/web3.js @metaplex-foundation/mpl-bubblegum

# Use Helius DAS API
curl https://devnet.helius-rpc.com/?api-key=YOUR_KEY \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"mintCompressedNft","params":{"name":"Test cNFT","symbol":"TEST"}}'
```

**Resources:**
- [Helius DAS API Docs](https://docs.helius.dev/compression-and-das-api/digital-asset-standard-das-api)
- [Helius cNFT Guide](https://docs.helius.dev/compression-and-das-api/compressed-nfts)

---

### Option 3: Underdog Protocol (Easiest for Quick Testing)

**Best for:** Quick testing, no blockchain knowledge needed

```bash
# Simple API-based minting
curl -X POST https://devnet.underdogprotocol.com/v2/projects/YOUR_PROJECT_ID/nfts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test cNFT",
    "receiver": "FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71",
    "attributes": {
      "type": "test"
    }
  }'
```

**Resources:**
- [Underdog Docs](https://docs.underdog.so/)
- [Get API Key](https://underdogprotocol.com/)

---

### Option 4: Crossmint (User-Friendly)

**Best for:** Non-developers, visual interface

1. Go to [Crossmint Console](https://www.crossmint.com/)
2. Create project
3. Use web interface to mint cNFTs
4. Send to test wallet addresses

**Resources:**
- [Crossmint Docs](https://docs.crossmint.com/)
- [cNFT Guide](https://docs.crossmint.com/docs/compressed-nfts)

---

### Option 5: Metaplex Sugar CLI (Advanced)

**Best for:** Bulk minting, production workflows

**Installation:**

**Windows:**
```powershell
# Download pre-built binary
Invoke-WebRequest -Uri "https://github.com/metaplex-foundation/sugar/releases/latest/download/sugar-windows-latest.exe" -OutFile "sugar.exe"

# Or install via Cargo (requires Rust)
cargo install sugar-cli
```

**macOS/Linux:**
```bash
# Download pre-built binary
curl -L https://github.com/metaplex-foundation/sugar/releases/latest/download/sugar-macos-latest -o sugar
chmod +x sugar
sudo mv sugar /usr/local/bin/

# Or install via Cargo (requires Rust)
cargo install sugar-cli
```

**Usage:**
```bash
# 1. Initialize
sugar init

# 2. Configure config.json
# Edit: number, price, symbol, sellers_fee_basis_points, creators

# 3. Upload assets
sugar upload

# 4. Mint cNFTs
sugar mint
```

**Resources:**
- [Sugar GitHub](https://github.com/metaplex-foundation/sugar)
- [Sugar Docs](https://docs.metaplex.com/tools/sugar)

---

## Testing Without cNFTs

If you don't need actual cNFTs right now:

1. **Use SPL NFTs Only**
   - Test page works with standard SPL NFTs
   - Filter shows "SPL Only" option

2. **Mock cNFTs**
   - Modify test data to include `isCompressed: true`
   - Test filter functionality without real cNFTs

3. **Wait for Staging**
   - Test on staging with pre-minted cNFTs
   - Request team members to mint some

---

## Quick Start Recommendation

**For immediate testing:** Use **Underdog Protocol** or **Helius**
- Fastest setup
- No complex tooling
- API-based (simple)

**For production workflows:** Use **Metaplex Sugar**
- More control
- Bulk operations
- Industry standard

---

## Troubleshooting

### "Not enough SOL"
```bash
# Airdrop devnet SOL
solana airdrop 1 FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71 --url devnet
solana airdrop 1 Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk --url devnet
```

### "Cannot find sugar command"
- Ensure binary is in PATH
- Try `./sugar` instead of `sugar`
- Or use absolute path

### "API key invalid"
- Get new key from provider (Helius, Underdog, etc.)
- Check key has devnet access
- Verify key in environment variables

---

## Verification

After minting, verify cNFTs exist:

```bash
# Using Helius
curl "https://devnet.helius-rpc.com/?api-key=YOUR_KEY" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getAssetsByOwner",
    "params": {
      "ownerAddress": "FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71"
    }
  }'
```

Then refresh the test page - cNFTs should appear with "cNFT" badge!

---

## Need Help?

1. Check provider docs (links above)
2. Test with SPL NFTs first
3. Ask team members for assistance
4. Check Metaplex Discord for Sugar help

