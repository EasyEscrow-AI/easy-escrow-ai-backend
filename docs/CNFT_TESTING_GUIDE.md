# cNFT Testing Guide

**Last Updated:** December 10, 2025  
**Status:** ✅ Production Ready

---

## 📋 Table of Contents

1. [Test Setup Requirements](#test-setup-requirements)
2. [RPC Configuration](#rpc-configuration)
3. [Merkle Tree Creation](#merkle-tree-creation)
4. [Test Asset Preparation](#test-asset-preparation)
5. [Common Issues and Solutions](#common-issues-and-solutions)
6. [Mock Data Setup](#mock-data-setup)
7. [Integration Test Execution](#integration-test-execution)

---

## Test Setup Requirements

### Prerequisites

1. **Node.js**: v18+ with npm
2. **Solana CLI**: Latest version
3. **Anchor Framework**: v0.29.0+
4. **PostgreSQL**: For integration tests
5. **RPC Provider**: Helius, QuickNode, or local test validator with DAS API support

### Environment Variables

```bash
# Required for cNFT testing
SOLANA_RPC_URL=https://api.devnet.solana.com  # Or Helius/QuickNode with DAS
HELIUS_API_KEY=your-helius-api-key            # For DAS API access
TEST_DATABASE_URL=postgresql://...             # For integration tests
```

### Dependencies

```bash
npm install
npm run build
```

---

## RPC Configuration

### DAS API Support

cNFT operations require RPC providers with Digital Asset Standard (DAS) API support:

**Supported Providers:**
- ✅ **Helius**: Full DAS API support
- ✅ **QuickNode**: DAS API support (requires add-on)
- ✅ **Local Test Validator**: Limited DAS support (use for unit tests only)

### RPC Endpoint Configuration

```typescript
// For testing, use devnet with DAS API
const connection = new Connection(
  'https://api.devnet.solana.com', // Or Helius/QuickNode endpoint
  'confirmed'
);

// Verify DAS API support
const hasDasSupport = await testDasApi(connection);
if (!hasDasSupport) {
  throw new Error('RPC provider does not support DAS API');
}
```

### Rate Limiting

DAS API has rate limits:
- **Helius Free Tier**: 100 requests/minute
- **Helius Paid Tier**: 1,000+ requests/minute
- **QuickNode**: Varies by plan

**Testing Strategy:**
- Use proof caching (30-second TTL) to minimize API calls
- Batch proof fetching for bulk swaps
- Mock DAS API responses in unit tests

---

## Merkle Tree Creation

### Creating Test Merkle Trees

For integration and E2E tests, you need Merkle trees to mint test cNFTs:

```typescript
import { createMerkleTree } from './helpers/devnet-cnft-setup';

// Create a test tree
const tree = await createMerkleTree({
  maxDepth: 14,        // Standard Metaplex tree depth
  maxBufferSize: 64,  // Standard buffer size
  canopyDepth: 11,    // High canopy for smaller proofs
});

console.log('Tree Address:', tree.treeAddress.toBase58());
```

### Tree Configuration

**Recommended Settings for Testing:**

| Setting | Value | Reason |
|---------|-------|--------|
| `maxDepth` | 14 | Standard Metaplex configuration |
| `maxBufferSize` | 64 | Allows 64 concurrent modifications |
| `canopyDepth` | 11 | High canopy reduces proof size |

### Tree Funding

Merkle trees require SOL for rent:
- **Tree Creation**: ~0.01 SOL (one-time)
- **cNFT Minting**: ~0.000005 SOL per cNFT

```bash
# Fund tree authority wallet
solana airdrop 1 <TREE_AUTHORITY_ADDRESS> --url devnet
```

---

## Test Asset Preparation

### Minting Test cNFTs

```typescript
import { mintTestCNFT } from './helpers/devnet-cnft-setup';

// Mint a test cNFT
const cnft = await mintTestCNFT({
  treeAddress: tree.treeAddress,
  owner: testWallet.publicKey,
  name: 'Test cNFT #1',
  symbol: 'TEST',
  uri: 'https://example.com/metadata.json',
});

console.log('cNFT Asset ID:', cnft.assetId);
```

### Pre-Minted Test Assets

The project includes pre-minted test cNFTs for staging tests:

**Location:** `tests/fixtures/staging-test-cnfts.json`

```json
{
  "cnfts": [
    {
      "assetId": "DRiP2Pn2K6fuMLKQmt5rZWqHheXMyUtCeXhe8kDQdxRu",
      "treeAddress": "...",
      "owner": "..."
    }
  ]
}
```

### Loading Test Assets

```typescript
import { loadTestCNFTs } from './helpers/test-cnft-manager';

const testCnfts = await loadTestCNFTs();
const cnft1 = testCnfts[0];
const cnft2 = testCnfts[1];
```

---

## Common Issues and Solutions

### Issue: "No proof data returned from DAS API"

**Cause:** RPC provider doesn't support DAS API or asset doesn't exist

**Solutions:**
1. Verify RPC endpoint supports DAS API
2. Check asset ID is valid cNFT
3. Ensure asset exists on-chain
4. Try different RPC provider (Helius recommended)

### Issue: "Stale Merkle proof detected"

**Cause:** Tree was modified between proof fetch and transaction execution

**Solutions:**
1. Fetch fresh proof immediately before transaction building
2. Use proof caching with short TTL (30 seconds)
3. Implement proof refresh on stale errors
4. Use `/api/offers/:id/rebuild-transaction` endpoint

### Issue: "Transaction too large"

**Cause:** Merkle proof has too many nodes (low canopy depth)

**Solutions:**
1. Use cNFTs from trees with high canopy depth (11+)
2. Enable Address Lookup Tables (ALT)
3. Split into multiple transactions
4. Use different cNFT with smaller proof

### Issue: "Rate limit exceeded"

**Cause:** Too many DAS API requests in short time

**Solutions:**
1. Enable proof caching
2. Use batch proof fetching
3. Implement rate limiting (max 5 concurrent requests)
4. Upgrade RPC provider plan

### Issue: "Tree account not found"

**Cause:** Tree address is invalid or tree was closed

**Solutions:**
1. Verify tree address is correct
2. Check tree account exists on-chain
3. Ensure tree hasn't been closed
4. Create new tree if needed

---

## Mock Data Setup

### Unit Test Mocks

For unit tests, mock DAS API responses:

```typescript
const mockProofResponse = {
  root: 'root-hash-123',
  proof: ['proof-node-1', 'proof-node-2', 'proof-node-3'],
  node_index: 0,
  leaf: 'leaf-hash-123',
  tree_id: 'tree-address-123',
};

mockConnection._rpcRequest = async (method: string) => {
  if (method === 'getAssetProof') {
    return { result: mockProofResponse };
  }
  if (method === 'getAsset') {
    return { result: mockAssetData };
  }
};
```

### Integration Test Fixtures

Use real test assets for integration tests:

```typescript
// Load from fixtures
const fixtures = require('./fixtures/staging-test-cnfts.json');
const testCnft = fixtures.cnfts[0];

// Or mint fresh
const freshCnft = await mintTestCNFT({...});
```

---

## Integration Test Execution

### Running cNFT Tests

```bash
# Unit tests (mocked DAS API)
npm test tests/unit/cnftService.test.ts
npm test tests/unit/transactionBuilder.cnft.test.ts

# Integration tests (real DAS API)
npm test tests/integration/cnft-transfer.test.ts
npm test tests/integration/bulk-swap.test.ts

# E2E tests (staging environment)
npm test tests/staging/e2e/02-cnft-for-sol-happy-path.test.ts
```

### Test Environment Setup

1. **Start Test Database:**
   ```bash
   docker-compose up -d postgres
   npm run db:migrate
   ```

2. **Configure RPC:**
   ```bash
   export SOLANA_RPC_URL=https://api.devnet.solana.com
   export HELIUS_API_KEY=your-key
   ```

3. **Run Tests:**
   ```bash
   npm test
   ```

### Test Coverage Requirements

- **Unit Tests**: 80%+ coverage for cNFT services
- **Integration Tests**: All API endpoints covered
- **E2E Tests**: Happy path and error scenarios

---

## Troubleshooting

### Debug Logging

Enable verbose logging for cNFT operations:

```typescript
process.env.DEBUG = 'cnft:*';
process.env.LOG_LEVEL = 'debug';
```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Asset is not a compressed NFT` | Invalid asset ID or not a cNFT | Verify asset ID and type |
| `Ownership mismatch` | Asset not owned by expected wallet | Check wallet address |
| `Proof fetch failed` | DAS API error | Check RPC provider and retry |
| `Tree root mismatch` | Stale proof | Fetch fresh proof |

---

## Related Documentation

- [Bulk Swap Architecture](BULK_CNFT_SWAP_ARCHITECTURE.md) - Architecture details
- [API Integration Guide](api/ATOMIC_SWAP_API_GUIDE.md) - API usage
- [Frontend Integration Guide](frontend/BULK_SWAP_INTEGRATION.md) - Frontend integration

---

**Status:** ✅ Production Ready  
**Last Updated:** December 10, 2025

