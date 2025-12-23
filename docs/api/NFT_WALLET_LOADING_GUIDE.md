# NFT Wallet Loading Guide

This guide explains how to load NFTs from a user's Solana wallet, supporting SPL NFTs, compressed NFTs (cNFTs), and Metaplex Core NFTs.

## Quick Start: Use Our API

The simplest approach is to use our wallet info endpoint which handles all NFT types automatically.

**Endpoint:** `GET /api/test/wallet-info?address={walletAddress}`

```typescript
// Request
GET /api/test/wallet-info?address=YourWalletAddressHere

// Response
{
  "success": true,
  "data": {
    "address": "YourWalletAddress",
    "solBalance": 5.5,
    "solBalanceLamports": 5500000000,
    "nfts": [
      {
        "mint": "NFTMintAddress123",
        "tokenAccount": "TokenAccountAddress",
        "name": "Cool NFT #1234",
        "image": "https://arweave.net/...",
        "symbol": "COOL",
        "isCompressed": false,
        "isCoreNft": false
      },
      {
        "mint": "cNFTAssetId456",
        "tokenAccount": null,
        "name": "Compressed NFT #5678",
        "image": "https://nftstorage.link/...",
        "symbol": "CNFT",
        "isCompressed": true,
        "isCoreNft": false
      },
      {
        "mint": "CoreNFTAssetId789",
        "tokenAccount": null,
        "name": "Core NFT #9012",
        "image": "https://arweave.net/...",
        "symbol": "CORE",
        "isCompressed": false,
        "isCoreNft": true
      }
    ],
    "nftCount": 3,
    "splNftCount": 1,
    "cNftCount": 1,
    "coreNftCount": 1
  }
}
```

---

## Implement Your Own Loading

If you need to implement NFT loading directly in your application, here's how each NFT type works.

### 1. Load SPL NFTs (Standard NFTs)

SPL NFTs are traditional Solana NFTs stored in token accounts.

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

async function loadSplNfts(connection: Connection, walletAddress: string) {
  const wallet = new PublicKey(walletAddress);

  // Get all token accounts owned by wallet
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    wallet,
    { programId: TOKEN_PROGRAM_ID }
  );

  // Filter for NFTs (amount = 1, decimals = 0)
  const nftAccounts = tokenAccounts.value.filter(account => {
    const info = account.account.data.parsed.info;
    return (
      info.tokenAmount.uiAmount === 1 &&
      info.tokenAmount.decimals === 0
    );
  });

  // Extract mint addresses
  const nfts = nftAccounts.map(account => ({
    mint: account.account.data.parsed.info.mint,
    tokenAccount: account.pubkey.toBase58(),
    isCompressed: false,
    isCoreNft: false
  }));

  return nfts;
}
```

### 2. Load Compressed NFTs (cNFTs)

cNFTs require the DAS (Digital Asset Standard) API, available through providers like Helius or QuickNode.

```typescript
interface DasAsset {
  id: string;
  content: {
    metadata: {
      name: string;
      symbol: string;
    };
    links?: {
      image?: string;
    };
    files?: Array<{ uri: string; mime: string }>;
  };
  compression: {
    compressed: boolean;
    tree: string;
    leaf_index: number;
  };
  ownership: {
    owner: string;
    frozen: boolean;
  };
  burnt: boolean;
}

async function loadCnfts(rpcUrl: string, walletAddress: string) {
  // DAS API request
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-assets',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: walletAddress,
        page: 1,
        limit: 1000,
        displayOptions: {
          showCollectionMetadata: true,
          showUnverifiedCollections: true
        }
      }
    })
  });

  const data = await response.json();
  const assets: DasAsset[] = data.result?.items || [];

  // Filter for compressed NFTs only
  const cnfts = assets
    .filter(asset =>
      asset.compression?.compressed === true &&
      asset.ownership?.owner === walletAddress &&
      !asset.burnt &&
      !asset.ownership?.frozen
    )
    .map(asset => ({
      mint: asset.id,  // Asset ID for cNFTs
      tokenAccount: null,
      name: asset.content?.metadata?.name || 'Unknown',
      image: extractImage(asset),
      symbol: asset.content?.metadata?.symbol || '',
      isCompressed: true,
      isCoreNft: false
    }));

  return cnfts;
}

function extractImage(asset: DasAsset): string | null {
  // Try links.image first
  if (asset.content?.links?.image) {
    return asset.content.links.image;
  }

  // Then try files array
  const imageFile = asset.content?.files?.find(f =>
    f.mime?.startsWith('image/') ||
    f.uri?.match(/\.(png|jpg|jpeg|gif|webp)$/i)
  );

  return imageFile?.uri || null;
}
```

### 3. Load Metaplex Core NFTs

Core NFTs also use the DAS API but have a different interface type.

```typescript
async function loadCoreNfts(rpcUrl: string, walletAddress: string) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-assets',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: walletAddress,
        page: 1,
        limit: 1000
      }
    })
  });

  const data = await response.json();
  const assets = data.result?.items || [];

  // Filter for Core NFTs
  const coreNfts = assets
    .filter(asset =>
      // Core NFTs have specific interface types
      (asset.interface === 'MplCoreAsset' ||
       asset.interface === 'MplCoreCollection') &&
      // Not compressed
      !asset.compression?.compressed &&
      // Owned by wallet
      asset.ownership?.owner === walletAddress
    )
    .map(asset => ({
      mint: asset.id,
      tokenAccount: null,
      name: asset.content?.metadata?.name || 'Unknown',
      image: asset.content?.links?.image || null,
      symbol: asset.content?.metadata?.symbol || '',
      isCompressed: false,
      isCoreNft: true
    }));

  return coreNfts;
}
```

### 4. Combined Loading Function

Load all NFT types in parallel for best performance:

```typescript
interface WalletNft {
  mint: string;
  tokenAccount: string | null;
  name: string;
  image: string | null;
  symbol: string;
  isCompressed: boolean;
  isCoreNft: boolean;
}

async function loadAllNfts(
  connection: Connection,
  dasRpcUrl: string,
  walletAddress: string
): Promise<WalletNft[]> {
  // Load all types in parallel
  const [splNfts, dasAssets] = await Promise.all([
    loadSplNfts(connection, walletAddress),
    loadDasAssets(dasRpcUrl, walletAddress)
  ]);

  // Separate DAS results into cNFTs and Core NFTs
  const cnfts = dasAssets.filter(a => a.isCompressed);
  const coreNfts = dasAssets.filter(a => a.isCoreNft);

  // Enrich SPL NFTs with metadata
  const enrichedSplNfts = await enrichWithMetadata(dasRpcUrl, splNfts);

  // Combine all
  return [...enrichedSplNfts, ...cnfts, ...coreNfts];
}

async function loadDasAssets(rpcUrl: string, walletAddress: string) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-assets',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: walletAddress,
        page: 1,
        limit: 1000,
        displayOptions: {
          showCollectionMetadata: true
        }
      }
    })
  });

  const data = await response.json();
  const assets = data.result?.items || [];

  return assets
    .filter(asset =>
      asset.ownership?.owner === walletAddress &&
      !asset.burnt
    )
    .map(asset => {
      const isCompressed = asset.compression?.compressed === true;
      const isCoreNft = ['MplCoreAsset', 'MplCoreCollection'].includes(asset.interface);

      return {
        mint: asset.id,
        tokenAccount: null,
        name: asset.content?.metadata?.name || 'Unknown',
        image: asset.content?.links?.image || null,
        symbol: asset.content?.metadata?.symbol || '',
        isCompressed,
        isCoreNft: isCoreNft && !isCompressed
      };
    });
}
```

### 5. Enrich SPL NFTs with Metadata

Use `getAssetBatch` to fetch metadata for multiple SPL NFTs efficiently:

```typescript
async function enrichWithMetadata(
  rpcUrl: string,
  nfts: Array<{ mint: string; tokenAccount: string }>
): Promise<WalletNft[]> {
  if (nfts.length === 0) return [];

  // Batch fetch metadata (max 1000 per request)
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-batch',
      method: 'getAssetBatch',
      params: {
        ids: nfts.map(n => n.mint)
      }
    })
  });

  const data = await response.json();
  const metadata = new Map(
    (data.result || []).map((asset: any) => [asset.id, asset])
  );

  return nfts.map(nft => {
    const meta = metadata.get(nft.mint);
    return {
      mint: nft.mint,
      tokenAccount: nft.tokenAccount,
      name: meta?.content?.metadata?.name || 'Unknown NFT',
      image: meta?.content?.links?.image || null,
      symbol: meta?.content?.metadata?.symbol || '',
      isCompressed: false,
      isCoreNft: false
    };
  });
}
```

---

## RPC Providers with DAS Support

The DAS API is required for cNFTs and Core NFTs. These providers support it:

| Provider | DAS Support | Free Tier |
|----------|-------------|-----------|
| [Helius](https://helius.dev) | Yes | 100k credits/month |
| [QuickNode](https://quicknode.com) | Yes (add-on) | Limited |
| [Triton](https://triton.one) | Yes | Paid only |
| [Shyft](https://shyft.to) | Yes | Free tier available |

---

## Frontend Implementation Example

Here's a React hook example for loading wallet NFTs:

```typescript
import { useState, useEffect, useCallback } from 'react';

interface UseWalletNftsOptions {
  apiBaseUrl: string;
}

export function useWalletNfts(
  walletAddress: string | null,
  options: UseWalletNftsOptions
) {
  const [nfts, setNfts] = useState<WalletNft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNfts = useCallback(async () => {
    if (!walletAddress) {
      setNfts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${options.apiBaseUrl}/api/test/wallet-info?address=${walletAddress}`
      );

      if (!response.ok) {
        throw new Error('Failed to load NFTs');
      }

      const data = await response.json();

      if (data.success) {
        setNfts(data.data.nfts);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load NFTs');
      setNfts([]);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, options.apiBaseUrl]);

  useEffect(() => {
    loadNfts();
  }, [loadNfts]);

  return {
    nfts,
    loading,
    error,
    refresh: loadNfts,
    // Convenience filters
    splNfts: nfts.filter(n => !n.isCompressed && !n.isCoreNft),
    cNfts: nfts.filter(n => n.isCompressed),
    coreNfts: nfts.filter(n => n.isCoreNft)
  };
}
```

### Usage in Component

```tsx
function NftSelector({ walletAddress }: { walletAddress: string }) {
  const { nfts, loading, error, splNfts, cNfts, coreNfts } = useWalletNfts(
    walletAddress,
    { apiBaseUrl: 'https://api.easyescrow.ai' }
  );

  if (loading) return <div>Loading NFTs...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h3>Your NFTs ({nfts.length} total)</h3>

      {splNfts.length > 0 && (
        <section>
          <h4>Standard NFTs ({splNfts.length})</h4>
          <div className="nft-grid">
            {splNfts.map(nft => (
              <NftCard key={nft.mint} nft={nft} />
            ))}
          </div>
        </section>
      )}

      {cNfts.length > 0 && (
        <section>
          <h4>Compressed NFTs ({cNfts.length})</h4>
          <div className="nft-grid">
            {cNfts.map(nft => (
              <NftCard key={nft.mint} nft={nft} />
            ))}
          </div>
        </section>
      )}

      {coreNfts.length > 0 && (
        <section>
          <h4>Core NFTs ({coreNfts.length})</h4>
          <div className="nft-grid">
            {coreNfts.map(nft => (
              <NftCard key={nft.mint} nft={nft} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NftCard({ nft }: { nft: WalletNft }) {
  return (
    <div className="nft-card">
      {nft.image && (
        <img
          src={nft.image}
          alt={nft.name}
          onError={(e) => {
            // Hide broken images
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="nft-info">
        <span className="nft-name">{nft.name}</span>
        <span className="nft-type">
          {nft.isCompressed ? 'cNFT' : nft.isCoreNft ? 'Core' : 'SPL'}
        </span>
      </div>
    </div>
  );
}
```

---

## TypeScript Types

```typescript
interface WalletNft {
  mint: string;              // Mint address (SPL) or Asset ID (cNFT/Core)
  tokenAccount: string | null;  // Only for SPL NFTs
  name: string;
  image: string | null;
  symbol: string;
  isCompressed: boolean;     // true = cNFT
  isCoreNft: boolean;        // true = Metaplex Core NFT
}

interface WalletInfo {
  address: string;
  solBalance: number;        // SOL as decimal
  solBalanceLamports: number;
  nfts: WalletNft[];
  nftCount: number;
  splNftCount: number;
  cNftCount: number;
  coreNftCount: number;
}

// Asset identifier for API requests
interface AssetIdentifier {
  mint: string;              // Use this for all types
  isCompressed: boolean;
  isCoreNft: boolean;
}
```

---

## Important Notes

1. **Mint vs Asset ID**: SPL NFTs use mint addresses, while cNFTs and Core NFTs use Asset IDs. Our API accepts both in the `mint` field.

2. **Token Account**: Only SPL NFTs have token accounts. cNFTs and Core NFTs return `null` for this field.

3. **Image URLs**: Images may be hosted on various services (Arweave, IPFS, NFT.Storage). Handle loading errors gracefully.

4. **Pagination**: The DAS API supports pagination. For wallets with 1000+ NFTs, implement pagination:
   ```typescript
   params: {
     ownerAddress: walletAddress,
     page: 1,  // Increment for more
     limit: 1000
   }
   ```

5. **Caching**: Consider caching NFT data to reduce API calls. Invalidate on wallet change or after transactions.

---

## Test Page Reference

Visit `/test` on the API to see the NFT loading implementation in action:
- Automatic detection of all NFT types
- Filtering by SPL/cNFT/Core
- Search functionality
- Grid display with images

The test page source can serve as a reference implementation for your frontend.
