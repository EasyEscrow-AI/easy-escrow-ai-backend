/**
 * NFT Cache for Production E2E Tests
 * 
 * Prevents RPC rate limiting by caching NFT list and reusing across tests.
 * Fetches NFTs ONCE at the start of test suite, then serves from cache.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

interface CachedNFT {
  mint: PublicKey;
  tokenAccount: PublicKey;
  metadata?: {
    name: string;
    symbol: string;
    uri: string;
  };
}

class NFTCache {
  private cache: Map<string, CachedNFT[]> = new Map();
  private isInitialized: boolean = false;

  /**
   * Initialize cache by fetching NFTs from wallet
   */
  async initialize(
    connection: Connection,
    walletAddress: PublicKey
  ): Promise<void> {
    const cacheKey = walletAddress.toString();

    // If already cached, skip
    if (this.cache.has(cacheKey)) {
      console.log('   ✅ Using cached NFT list');
      return;
    }

    console.log(`   🔄 Fetching NFTs for wallet (first time)...`);
    console.log(`   Wallet: ${walletAddress.toString()}`);

    try {
      // Fetch all token accounts owned by wallet (SINGLE RPC CALL)
      const tokenAccounts = await connection.getTokenAccountsByOwner(
        walletAddress,
        { programId: TOKEN_PROGRAM_ID }
      );

      console.log(`   ✅ Found ${tokenAccounts.value.length} token accounts`);

      // Filter for NFTs (decimals=0, amount=1)
      const nfts: CachedNFT[] = [];

      for (const { pubkey, account } of tokenAccounts.value) {
        const accountData = account.data;
        
        // Parse token account data (SPL Token layout)
        const decimals = accountData[44]; // Offset 44: decimals
        const amount = Number(
          accountData.readBigUInt64LE(64) // Offset 64: amount (8 bytes)
        );

        // NFT criteria: decimals=0, amount=1
        if (decimals === 0 && amount === 1) {
          // Extract mint address (offset 0: 32 bytes)
          const mintAddress = new PublicKey(accountData.slice(0, 32));

          nfts.push({
            mint: mintAddress,
            tokenAccount: pubkey,
            // Metadata fetched on-demand to avoid rate limits
          });
        }
      }

      console.log(`   ✅ Found ${nfts.length} NFTs (decimals=0, amount=1)`);

      // Cache the results
      this.cache.set(cacheKey, nfts);
      this.isInitialized = true;

      console.log(`   ✅ NFT list cached for wallet`);
    } catch (error: any) {
      console.error(`   ❌ Error fetching NFTs:`, error.message);
      throw error;
    }
  }

  /**
   * Get a random NFT from cache
   */
  getRandomNFT(walletAddress: PublicKey): CachedNFT {
    const cacheKey = walletAddress.toString();
    const nfts = this.cache.get(cacheKey);

    if (!nfts || nfts.length === 0) {
      throw new Error('NFT cache not initialized or wallet has no NFTs');
    }

    // Return random NFT
    const randomIndex = Math.floor(Math.random() * nfts.length);
    const selectedNFT = nfts[randomIndex];

    console.log(`   🎲 Selected NFT #${randomIndex + 1}/${nfts.length} from cache`);
    console.log(`   NFT Mint: ${selectedNFT.mint.toString()}`);
    console.log(`   Token Account: ${selectedNFT.tokenAccount.toString()}`);

    return selectedNFT;
  }

  /**
   * Get a specific NFT from cache (by index or mint)
   */
  getNFT(walletAddress: PublicKey, index: number): CachedNFT | undefined {
    const cacheKey = walletAddress.toString();
    const nfts = this.cache.get(cacheKey);

    if (!nfts || index >= nfts.length) {
      return undefined;
    }

    return nfts[index];
  }

  /**
   * Get all cached NFTs for a wallet
   */
  getAllNFTs(walletAddress: PublicKey): CachedNFT[] {
    const cacheKey = walletAddress.toString();
    return this.cache.get(cacheKey) || [];
  }

  /**
   * Get count of cached NFTs
   */
  getCount(walletAddress: PublicKey): number {
    return this.getAllNFTs(walletAddress).length;
  }

  /**
   * Clear cache (useful for cleanup)
   */
  clear(): void {
    this.cache.clear();
    this.isInitialized = false;
  }

  /**
   * Check if cache is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Singleton instance
export const nftCache = new NFTCache();

/**
 * Helper function to get random NFT from cache (with fallback)
 */
export async function getRandomNFTFromCache(
  connection: Connection,
  walletAddress: PublicKey
): Promise<CachedNFT> {
  // Initialize cache if not ready
  if (!nftCache.isReady()) {
    await nftCache.initialize(connection, walletAddress);
  }

  // Get random NFT from cache
  return nftCache.getRandomNFT(walletAddress);
}

