/**
 * Asset Validator Service
 * 
 * Validates ownership of both standard NFTs and compressed NFTs (cNFTs).
 * Handles Merkle proof validation and returns normalized asset representations.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

export enum AssetType {
  NFT = 'nft',
  CNFT = 'cnft',
}

export enum AssetStatus {
  VALID = 'valid',
  NOT_OWNED = 'not_owned',
  BURNED = 'burned',
  FROZEN = 'frozen',
  TRANSFERRED = 'transferred',
  INVALID_MINT = 'invalid_mint',
}

export interface AssetInfo {
  /** Type of asset */
  type: AssetType;
  
  /** Mint address for NFTs or asset ID for cNFTs */
  identifier: string;
  
  /** Current owner public key */
  owner: string;
  
  /** Asset metadata */
  metadata?: {
    name?: string;
    symbol?: string;
    uri?: string;
    [key: string]: any;
  };
  
  /** Merkle proof data (for cNFTs only) */
  proofData?: {
    tree: string;
    leafIndex: number;
    proof: string[];
    root: string;
  };
  
  /** Validation status */
  status: AssetStatus;
  
  /** Validation timestamp */
  validatedAt: Date;
}

export interface ValidationResult {
  isValid: boolean;
  asset?: AssetInfo;
  error?: string;
}

export interface AssetValidatorConfig {
  /** Helius API key for cNFT indexing */
  heliusApiKey?: string;
  
  /** Helius API endpoint */
  heliusEndpoint?: string;
  
  /** Cache TTL in milliseconds */
  cacheTTL: number;
  
  /** Request timeout in milliseconds */
  requestTimeout: number;
  
  /** Maximum retry attempts */
  maxRetries: number;
  
  /** Enable asset caching */
  enableCaching: boolean;
}

interface CachedAsset {
  asset: AssetInfo;
  timestamp: number;
}

export class AssetValidator {
  private connection: Connection;
  private config: AssetValidatorConfig;
  private assetCache: Map<string, CachedAsset> = new Map();
  
  // Default configuration
  private static readonly DEFAULT_CONFIG: AssetValidatorConfig = {
    cacheTTL: 300000, // 5 minutes
    requestTimeout: 10000, // 10 seconds
    maxRetries: 3,
    enableCaching: true,
  };
  
  constructor(connection: Connection, config?: Partial<AssetValidatorConfig>) {
    this.connection = connection;
    this.config = { ...AssetValidator.DEFAULT_CONFIG, ...config };
    
    // Load Helius config from environment if not provided
    if (!this.config.heliusApiKey && process.env.HELIUS_API_KEY) {
      this.config.heliusApiKey = process.env.HELIUS_API_KEY;
    }
    if (!this.config.heliusEndpoint && process.env.HELIUS_ENDPOINT) {
      this.config.heliusEndpoint = process.env.HELIUS_ENDPOINT;
    }
    
    // Default Helius endpoint
    if (!this.config.heliusEndpoint) {
      this.config.heliusEndpoint = 'https://api.helius.xyz/v0';
    }
    
    console.log('[AssetValidator] Initialized with config:', {
      heliusConfigured: !!this.config.heliusApiKey,
      cacheTTL: this.config.cacheTTL,
      cacheEnabled: this.config.enableCaching,
    });
  }
  
  /**
   * Validate asset ownership for a wallet
   */
  async validateAsset(
    walletAddress: string,
    assetIdentifier: string,
    assetType: AssetType
  ): Promise<ValidationResult> {
    try {
      console.log(`[AssetValidator] Validating ${assetType} asset ${assetIdentifier} for wallet ${walletAddress}`);
      
      // Check cache first
      if (this.config.enableCaching) {
        const cached = this.getFromCache(assetIdentifier);
        if (cached && cached.owner === walletAddress) {
          console.log(`[AssetValidator] Using cached validation for ${assetIdentifier}`);
          return { isValid: true, asset: cached };
        }
      }
      
      let result: ValidationResult;
      
      if (assetType === AssetType.NFT) {
        result = await this.validateNFT(walletAddress, assetIdentifier);
      } else {
        result = await this.validateCNFT(walletAddress, assetIdentifier);
      }
      
      // Cache valid results
      if (result.isValid && result.asset && this.config.enableCaching) {
        this.addToCache(assetIdentifier, result.asset);
      }
      
      return result;
    } catch (error) {
      console.error(`[AssetValidator] Validation failed for ${assetIdentifier}:`, error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }
  
  /**
   * Validate standard NFT ownership
   */
  private async validateNFT(walletAddress: string, mintAddress: string): Promise<ValidationResult> {
    try {
      const wallet = new PublicKey(walletAddress);
      const mint = new PublicKey(mintAddress);
      
      // Get associated token address
      const ata = await getAssociatedTokenAddress(mint, wallet);
      
      // Get token account
      const tokenAccount = await getAccount(this.connection, ata);
      
      // Verify ownership
      if (tokenAccount.owner.toBase58() !== walletAddress) {
        return {
          isValid: false,
          error: 'Token account owner does not match wallet address',
        };
      }
      
      // Verify amount (NFTs should have amount = 1)
      if (tokenAccount.amount !== BigInt(1)) {
        return {
          isValid: false,
          error: `Invalid token amount: expected 1, got ${tokenAccount.amount}`,
        };
      }
      
      // Check if frozen
      if (tokenAccount.isFrozen) {
        return {
          isValid: false,
          asset: {
            type: AssetType.NFT,
            identifier: mintAddress,
            owner: walletAddress,
            status: AssetStatus.FROZEN,
            validatedAt: new Date(),
          },
          error: 'Token account is frozen',
        };
      }
      
      console.log(`[AssetValidator] NFT ${mintAddress} successfully validated for ${walletAddress}`);
      
      return {
        isValid: true,
        asset: {
          type: AssetType.NFT,
          identifier: mintAddress,
          owner: walletAddress,
          status: AssetStatus.VALID,
          validatedAt: new Date(),
        },
      };
    } catch (error) {
      console.error(`[AssetValidator] NFT validation failed:`, error);
      
      // Check if account doesn't exist (not owned)
      if (error instanceof Error && error.message.includes('could not find')) {
        return {
          isValid: false,
          asset: {
            type: AssetType.NFT,
            identifier: mintAddress,
            owner: '',
            status: AssetStatus.NOT_OWNED,
            validatedAt: new Date(),
          },
          error: 'Wallet does not own this NFT',
        };
      }
      
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'NFT validation error',
      };
    }
  }
  
  /**
   * Validate compressed NFT ownership
   */
  private async validateCNFT(walletAddress: string, assetId: string): Promise<ValidationResult> {
    if (!this.config.heliusApiKey) {
      return {
        isValid: false,
        error: 'Helius API key not configured for cNFT validation',
      };
    }
    
    try {
      console.log(`[AssetValidator] Fetching cNFT data from Helius for ${assetId}`);
      
      // Fetch asset data from Helius
      const assetData = await this.fetchCNFTFromHelius(assetId);
      
      // Verify ownership
      if (assetData.ownership?.owner !== walletAddress) {
        return {
          isValid: false,
          asset: {
            type: AssetType.CNFT,
            identifier: assetId,
            owner: assetData.ownership?.owner || '',
            status: AssetStatus.NOT_OWNED,
            validatedAt: new Date(),
          },
          error: 'Wallet does not own this cNFT',
        };
      }
      
      // Check if burned
      if (assetData.burnt) {
        return {
          isValid: false,
          asset: {
            type: AssetType.CNFT,
            identifier: assetId,
            owner: walletAddress,
            status: AssetStatus.BURNED,
            validatedAt: new Date(),
          },
          error: 'cNFT has been burned',
        };
      }
      
      // Check if frozen
      if (assetData.frozen) {
        return {
          isValid: false,
          asset: {
            type: AssetType.CNFT,
            identifier: assetId,
            owner: walletAddress,
            status: AssetStatus.FROZEN,
            validatedAt: new Date(),
          },
          error: 'cNFT is frozen',
        };
      }
      
      // Fetch Merkle proof
      const proofData = await this.fetchCNFTProof(assetId);
      
      console.log(`[AssetValidator] cNFT ${assetId} successfully validated for ${walletAddress}`);
      
      return {
        isValid: true,
        asset: {
          type: AssetType.CNFT,
          identifier: assetId,
          owner: walletAddress,
          metadata: assetData.content?.metadata,
          proofData,
          status: AssetStatus.VALID,
          validatedAt: new Date(),
        },
      };
    } catch (error) {
      console.error(`[AssetValidator] cNFT validation failed:`, error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'cNFT validation error',
      };
    }
  }
  
  /**
   * Fetch cNFT data from Helius API
   */
  private async fetchCNFTFromHelius(assetId: string, retryCount = 0): Promise<any> {
    try {
      const url = `${this.config.heliusEndpoint}/assets/${assetId}?api-key=${this.config.heliusApiKey}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeout);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`[AssetValidator] Helius API request failed (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < this.config.maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`[AssetValidator] Retrying in ${delay}ms...`);
        await this.sleep(delay);
        return this.fetchCNFTFromHelius(assetId, retryCount + 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Fetch Merkle proof for cNFT
   */
  private async fetchCNFTProof(assetId: string, retryCount = 0): Promise<{
    tree: string;
    leafIndex: number;
    proof: string[];
    root: string;
  }> {
    try {
      const url = `${this.config.heliusEndpoint}/assets/${assetId}/proof?api-key=${this.config.heliusApiKey}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeout);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Helius API proof error: ${response.status} ${response.statusText}`);
      }
      
      const data = (await response.json()) as {
        tree_id: string;
        leaf_index: number;
        proof: string[];
        root: string;
      };
      
      return {
        tree: data.tree_id,
        leafIndex: data.leaf_index,
        proof: data.proof,
        root: data.root,
      };
    } catch (error) {
      console.error(`[AssetValidator] Proof fetch failed (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < this.config.maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`[AssetValidator] Retrying proof fetch in ${delay}ms...`);
        await this.sleep(delay);
        return this.fetchCNFTProof(assetId, retryCount + 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Validate multiple assets in batch
   */
  async validateAssets(
    walletAddress: string,
    assets: Array<{ identifier: string; type: AssetType }>
  ): Promise<ValidationResult[]> {
    console.log(`[AssetValidator] Batch validating ${assets.length} assets for ${walletAddress}`);
    
    const results = await Promise.all(
      assets.map((asset) => this.validateAsset(walletAddress, asset.identifier, asset.type))
    );
    
    const validCount = results.filter((r) => r.isValid).length;
    console.log(`[AssetValidator] Batch validation complete: ${validCount}/${assets.length} valid`);
    
    return results;
  }
  
  /**
   * Re-validate asset ownership (for accept-time verification)
   */
  async revalidateAsset(assetInfo: AssetInfo): Promise<ValidationResult> {
    console.log(`[AssetValidator] Re-validating asset ${assetInfo.identifier}`);
    
    // Clear cache for this asset to force fresh validation
    this.removeFromCache(assetInfo.identifier);
    
    return this.validateAsset(assetInfo.owner, assetInfo.identifier, assetInfo.type);
  }
  
  /**
   * Get asset from cache
   */
  private getFromCache(identifier: string): AssetInfo | null {
    const cached = this.assetCache.get(identifier);
    if (!cached) return null;
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.config.cacheTTL) {
      this.assetCache.delete(identifier);
      return null;
    }
    
    return cached.asset;
  }
  
  /**
   * Add asset to cache
   */
  private addToCache(identifier: string, asset: AssetInfo): void {
    this.assetCache.set(identifier, {
      asset,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Remove asset from cache
   */
  private removeFromCache(identifier: string): void {
    this.assetCache.delete(identifier);
  }
  
  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.assetCache.clear();
    console.log('[AssetValidator] Cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.assetCache.size,
      hitRate: 0, // TODO: Implement hit rate tracking
    };
  }
  
  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create asset validator instance
 */
export function createAssetValidator(
  connection: Connection,
  config?: Partial<AssetValidatorConfig>
): AssetValidator {
  return new AssetValidator(connection, config);
}

