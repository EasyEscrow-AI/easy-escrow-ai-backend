# QuickNode cNFT Integration

**Date**: November 17, 2025  
**Status**: ✅ Configured

---

## Summary

The atomic swap system uses **QuickNode** as the unified RPC provider for both regular Solana operations and compressed NFT (cNFT) operations via the DAS (Digital Asset Standard) API.

---

## Why QuickNode?

**Single Provider Benefits:**
- ✅ Unified endpoint for all Solana operations
- ✅ No need for separate Helius subscription
- ✅ Authentication handled via URL (no separate API key)
- ✅ Consistent performance and reliability
- ✅ Simplified configuration

**QuickNode DAS API Support:**
- QuickNode supports the full DAS API specification
- Same endpoint works for both regular RPC and cNFT queries
- Compatible with Metaplex Bubblegum program operations

---

## Configuration

### Staging (Devnet)
```bash
# Single RPC URL for both regular and cNFT operations
SOLANA_RPC_URL=<your-quicknode-devnet-endpoint-url>

# Use same URL for cNFT indexer
CNFT_INDEXER_API_URL=<your-quicknode-devnet-endpoint-url>

# No separate API key needed
CNFT_INDEXER_API_KEY=
```

### Production (Mainnet)
```bash
# Single RPC URL for both regular and cNFT operations
SOLANA_RPC_URL=<your-quicknode-mainnet-endpoint-url>

# Use same URL for cNFT indexer
CNFT_INDEXER_API_URL=<your-quicknode-mainnet-endpoint-url>

# No separate API key needed
CNFT_INDEXER_API_KEY=
```

---

## DAS API Methods Used

The atomic swap system uses the following DAS API methods for cNFT operations:

### 1. Asset Ownership Verification
```typescript
// Method: getAsset
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "getAsset",
  "params": {
    "id": "<asset_id>"
  }
}
```

**Used for**: Verifying cNFT ownership during offer creation and acceptance.

### 2. Merkle Proof Retrieval
```typescript
// Method: getAssetProof
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "getAssetProof",
  "params": {
    "id": "<asset_id>"
  }
}
```

**Used for**: Building Bubblegum transfer instructions for cNFT swaps.

---

## AssetValidator Integration

The `AssetValidator` service automatically uses the configured cNFT indexer URL:

```typescript
// src/services/assetValidator.ts

// For cNFTs, uses CNFT_INDEXER_API_URL (QuickNode)
async _validateCnftOwnership(walletAddress: string, asset: CnftAsset) {
  const response = await fetch(this.cnftIndexerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'getAsset',
      params: { id: asset.assetId }
    })
  });
  // ... validation logic
}

async _fetchCnftMerkleProof(assetId: string) {
  const response = await fetch(this.cnftIndexerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'getAssetProof',
      params: { id: assetId }
    })
  });
  // ... returns proof for Bubblegum transfer
}
```

---

## Alternative: Helius Integration

If you prefer to use Helius for cNFT operations, you can configure it separately:

```bash
# Use QuickNode for regular RPC
SOLANA_RPC_URL=https://prettiest-broken-flower.solana-mainnet.quiknode.pro/...

# Use Helius for cNFT operations
CNFT_INDEXER_API_URL=https://mainnet.helius-rpc.com
CNFT_INDEXER_API_KEY=your-helius-api-key-here
```

**Note**: This is optional. QuickNode's DAS API is sufficient for all cNFT operations.

---

## Performance Considerations

**QuickNode DAS API Performance:**
- Response times: typically < 200ms for `getAsset`
- Response times: typically < 300ms for `getAssetProof`
- Rate limits: depends on QuickNode plan
- Caching: enabled by default (5-minute TTL)

**Configuration Options:**
```bash
# Adjust timeout for slower networks
CNFT_INDEXER_TIMEOUT_MS=30000

# Retry failed requests
CNFT_INDEXER_MAX_RETRIES=3
CNFT_INDEXER_RETRY_DELAY_MS=1000

# Caching
CNFT_INDEXER_ENABLE_CACHING=true
CNFT_INDEXER_CACHE_TTL_MS=300000
```

---

## Testing

### Verify DAS API Access
```bash
curl -X POST <your-quicknode-endpoint-url> \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "getAsset",
    "params": {
      "id": "YOUR_ASSET_ID"
    }
  }'
```

**Expected Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "interface": "V1_NFT",
    "id": "...",
    "ownership": {
      "owner": "...",
      "delegated": false
    },
    "compression": {
      "eligible": false,
      "compressed": true,
      "tree": "...",
      "leafIndex": 123
    }
    // ... more fields
  }
}
```

---

## Troubleshooting

### "Failed to fetch cNFT data"
- ✅ Verify `CNFT_INDEXER_API_URL` is set correctly
- ✅ Test DAS API access with curl command above
- ✅ Check QuickNode endpoint is accessible
- ✅ Verify network (devnet vs mainnet) matches

### "Invalid Merkle proof"
- ✅ Ensure cNFT exists and is not burned
- ✅ Verify tree account is still active
- ✅ Check leaf index matches current state
- ✅ Confirm asset ID is correct

### "Timeout errors"
- ✅ Increase `CNFT_INDEXER_TIMEOUT_MS` (default: 30000)
- ✅ Check QuickNode service status
- ✅ Verify network connectivity

---

## Migration Notes

### From Helius to QuickNode
If migrating from Helius to QuickNode for cNFT operations:

1. **Update environment variables:**
   ```bash
   # Old (Helius)
   CNFT_INDEXER_API_URL=https://mainnet.helius-rpc.com
   CNFT_INDEXER_API_KEY=your-helius-key
   
   # New (QuickNode)
   CNFT_INDEXER_API_URL=<your-quicknode-mainnet-endpoint-url>
   CNFT_INDEXER_API_KEY=
   ```

2. **Test cNFT operations:**
   - Verify asset ownership checks work
   - Confirm Merkle proof retrieval works
   - Test full cNFT swap flow

3. **No code changes needed:**
   - AssetValidator automatically uses new endpoint
   - DAS API methods are standardized
   - Same JSON-RPC interface

---

## References

- **QuickNode DAS API**: https://www.quicknode.com/docs/solana/das-api
- **DAS API Specification**: https://docs.metaplex.com/programs/compression
- **Metaplex Bubblegum**: https://github.com/metaplex-foundation/mpl-bubblegum

---

**Last Updated:** November 17, 2025

