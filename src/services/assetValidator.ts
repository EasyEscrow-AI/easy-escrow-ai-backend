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
  CORE_NFT = 'core_nft', // Metaplex Core NFTs (mpl-core program)
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
      } else if (assetType === AssetType.CNFT) {
        result = await this.validateCNFT(walletAddress, assetIdentifier);
      } else if (assetType === AssetType.CORE_NFT) {
        result = await this.validateCoreNFT(walletAddress, assetIdentifier);
      } else {
        result = { isValid: false, error: `Unknown asset type: ${assetType}` };
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
    try {
      console.log(`[AssetValidator] Fetching cNFT data via DAS API for ${assetId}`);
      
      // Fetch asset data via DAS API (works with QuickNode, Helius, etc.)
      const assetData = await this.fetchCNFTViaDAS(assetId);
      
      // Check if ownership data exists
      if (!assetData.ownership) {
        console.error(`[AssetValidator] ❌ Missing ownership data for cNFT ${assetId}`);
        console.error(`  Asset data keys:`, Object.keys(assetData));
        console.error(`  Interface:`, assetData.interface);
        console.error(`  Compression:`, assetData.compression);
        console.error(`  Asset data (truncated):`, JSON.stringify(assetData, null, 2).substring(0, 2000));
        
        // Provide more helpful error message
        const hint = assetData.interface 
          ? ` (Interface: ${assetData.interface})` 
          : '';
        
        return {
          isValid: false,
          asset: {
            type: AssetType.CNFT,
            identifier: assetId,
            owner: '',
            status: AssetStatus.NOT_OWNED,
            validatedAt: new Date(),
          },
          error: `cNFT ownership data not found in DAS API response${hint}. This may indicate the asset doesn't exist, was burned, or RPC provider doesn't support DAS API.`,
        };
      }
      
      // Verify ownership with detailed logging
      const actualOwner = assetData.ownership.owner;
      const expectedOwner = walletAddress;
      
      console.log(`[AssetValidator] Ownership check for cNFT ${assetId}:`);
      console.log(`  Expected owner: ${expectedOwner}`);
      console.log(`  Actual owner:   ${actualOwner}`);
      console.log(`  Match: ${actualOwner === expectedOwner}`);
      
      if (!actualOwner) {
        console.error(`[AssetValidator] ❌ Owner field is undefined for cNFT ${assetId}`);
        console.error(`  Ownership object:`, assetData.ownership);
        
        return {
          isValid: false,
          asset: {
            type: AssetType.CNFT,
            identifier: assetId,
            owner: '',
            status: AssetStatus.NOT_OWNED,
            validatedAt: new Date(),
          },
          error: 'cNFT owner field is undefined in DAS API response',
        };
      }
      
      if (actualOwner !== expectedOwner) {
        console.error(`[AssetValidator] ❌ Ownership mismatch for cNFT ${assetId}`);
        console.error(`  Wallet expected: ${expectedOwner}`);
        console.error(`  Wallet found:    ${actualOwner}`);
        
        return {
          isValid: false,
          asset: {
            type: AssetType.CNFT,
            identifier: assetId,
            owner: actualOwner,
            status: AssetStatus.NOT_OWNED,
            validatedAt: new Date(),
          },
          error: `Wallet does not own this cNFT (owner: ${actualOwner})`,
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
   * Validate Metaplex Core NFT ownership via DAS API
   * Core NFTs use the mpl-core program (different from SPL Token and Bubblegum)
   */
  private async validateCoreNFT(walletAddress: string, assetId: string): Promise<ValidationResult> {
    try {
      console.log(`[AssetValidator] Validating Metaplex Core NFT ${assetId} for ${walletAddress}`);
      
      // Fetch asset data via DAS API (same as cNFT)
      const assetData = await this.fetchCNFTViaDAS(assetId);
      
      // Check if this is actually a Core NFT
      const isCoreNft = assetData.interface === 'MplCoreAsset' || 
                        assetData.interface === 'MplCoreCollection' ||
                        (assetData.interface && assetData.interface.includes('Core'));
      
      if (!isCoreNft) {
        console.warn(`[AssetValidator] Asset ${assetId} is not a Metaplex Core NFT (interface: ${assetData.interface})`);
      }
      
      // Check ownership
      const expectedOwner = walletAddress;
      const actualOwner = assetData.ownership?.owner;
      
      console.log(`[AssetValidator] Core NFT ownership check for ${assetId}:`);
      console.log(`  Interface: ${assetData.interface}`);
      console.log(`  Expected owner: ${expectedOwner}`);
      console.log(`  Actual owner:   ${actualOwner}`);
      
      if (!actualOwner) {
        return {
          isValid: false,
          asset: {
            type: AssetType.CORE_NFT,
            identifier: assetId,
            owner: '',
            status: AssetStatus.NOT_OWNED,
            validatedAt: new Date(),
          },
          error: 'Core NFT owner field not found in DAS API response',
        };
      }
      
      if (actualOwner !== expectedOwner) {
        return {
          isValid: false,
          asset: {
            type: AssetType.CORE_NFT,
            identifier: assetId,
            owner: actualOwner,
            status: AssetStatus.NOT_OWNED,
            validatedAt: new Date(),
          },
          error: `Wallet does not own this Core NFT (owner: ${actualOwner})`,
        };
      }
      
      // Check if burned
      if (assetData.burnt) {
        return {
          isValid: false,
          asset: {
            type: AssetType.CORE_NFT,
            identifier: assetId,
            owner: walletAddress,
            status: AssetStatus.BURNED,
            validatedAt: new Date(),
          },
          error: 'Core NFT has been burned',
        };
      }
      
      // Check if frozen
      if (assetData.frozen) {
        return {
          isValid: false,
          asset: {
            type: AssetType.CORE_NFT,
            identifier: assetId,
            owner: walletAddress,
            status: AssetStatus.FROZEN,
            validatedAt: new Date(),
          },
          error: 'Core NFT is frozen',
        };
      }
      
      console.log(`[AssetValidator] Core NFT ${assetId} successfully validated for ${walletAddress}`);
      
      return {
        isValid: true,
        asset: {
          type: AssetType.CORE_NFT,
          identifier: assetId,
          owner: walletAddress,
          metadata: assetData.content?.metadata,
          status: AssetStatus.VALID,
          validatedAt: new Date(),
        },
      };
    } catch (error) {
      console.error(`[AssetValidator] Core NFT validation failed:`, error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Core NFT validation error',
      };
    }
  }
  
  /**
   * Fetch cNFT data via DAS API (Digital Asset Standard)
   * Works with QuickNode, Helius, and other RPC providers that support DAS
   */
  private async fetchCNFTViaDAS(assetId: string, retryCount = 0): Promise<any> {
    try {
      console.log(`[AssetValidator] Calling getAsset RPC method for ${assetId}`);
      
      // Use RPC method instead of REST endpoint
      // This works with QuickNode, Helius, and other DAS-compatible providers
      const response = await (this.connection as any)._rpcRequest('getAsset', {
        id: assetId,
      });
      
      if (!response) {
        throw new Error('No response from getAsset RPC call');
      }
      
      // Log the full response structure for debugging
      console.log(`[AssetValidator] DAS API raw response:`, JSON.stringify(response, null, 2).substring(0, 1000));
      console.log(`[AssetValidator] DAS API response structure:`, {
        hasResult: !!response.result,
        hasError: !!response.error,
        hasOwnership: !!response.ownership,
        hasResultOwnership: !!(response.result?.ownership),
        topLevelKeys: Object.keys(response),
        resultKeys: response.result ? Object.keys(response.result) : [],
      });
      
      // Check for JSON-RPC error response
      if (response.error) {
        console.error(`[AssetValidator] DAS API returned error:`, response.error);
        throw new Error(`DAS API error: ${response.error.message || JSON.stringify(response.error)}`);
      }
      
      // CRITICAL: DAS API follows JSON-RPC 2.0 spec
      // Response structure: { jsonrpc: "2.0", id: "...", result: {...} }
      // Asset data is in response.result, ownership at response.result.ownership.owner
      // Reference: https://www.helius.dev/docs/das-api
      const assetData = response.result || response;
      
      // Validate we got actual asset data
      if (!assetData || typeof assetData !== 'object') {
        console.error(`[AssetValidator] Invalid asset data received:`, assetData);
        throw new Error('DAS API returned invalid asset data');
      }
      
      // Log ownership field specifically
      console.log(`[AssetValidator] Ownership data:`, {
        ownership: assetData.ownership,
        ownershipOwner: assetData.ownership?.owner,
        interface: assetData.interface,
        compression: assetData.compression,
      });
      
      return assetData;
    } catch (error) {
      console.error(`[AssetValidator] DAS API request failed (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < this.config.maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`[AssetValidator] Retrying in ${delay}ms...`);
        await this.sleep(delay);
        return this.fetchCNFTViaDAS(assetId, retryCount + 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Fetch Merkle proof for cNFT via DAS API
   * Works with QuickNode, Helius, and other RPC providers that support DAS
   */
  private async fetchCNFTProof(assetId: string, retryCount = 0): Promise<{
    tree: string;
    leafIndex: number;
    proof: string[];
    root: string;
  }> {
    try {
      console.log(`[AssetValidator] Calling getAssetProof RPC method for ${assetId}`);
      
      // DAS API follows JSON-RPC 2.0 spec - proof data is in response.result
      const response = await (this.connection as any)._rpcRequest('getAssetProof', {
        id: assetId,
      });
      
      if (!response) {
        throw new Error('No response from getAssetProof RPC call');
      }
      
      // Handle JSON-RPC wrapper: response.result contains the actual proof data
      const proofData = response.result || response;
      
      // Map response to expected format
      return {
        tree: proofData.tree_id,
        leafIndex: proofData.leaf_index,
        proof: proofData.proof,
        root: proofData.root,
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

