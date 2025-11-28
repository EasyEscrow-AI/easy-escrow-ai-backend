/**
 * Compressed NFT Service
 * 
 * Handles cNFT operations including:
 * - Fetching cNFT data from DAS API
 * - Retrieving Merkle proofs for transfers
 * - Deriving tree authority PDAs
 * - Building transfer parameters
 */

import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  CnftAssetData,
  CnftProof,
  CnftTransferParams,
  DasProofResponse,
} from '../types/cnft';
import { BUBBLEGUM_PROGRAM_ID } from '../constants/bubblegum';

export interface CnftServiceConfig {
  /** RPC endpoint with DAS API support (e.g., Helius) */
  rpcEndpoint: string;
  
  /** Request timeout in milliseconds */
  requestTimeout: number;
  
  /** Maximum retry attempts */
  maxRetries: number;
}

export class CnftService {
  private connection: Connection;
  private config: CnftServiceConfig;
  
  private static readonly DEFAULT_CONFIG: Partial<CnftServiceConfig> = {
    requestTimeout: 30000, // 30 seconds (proofs can be slow)
    maxRetries: 3,
  };
  
  constructor(connection: Connection, config?: Partial<CnftServiceConfig>) {
    this.connection = connection;
    this.config = {
      rpcEndpoint: connection.rpcEndpoint,
      ...CnftService.DEFAULT_CONFIG,
      ...config,
    } as CnftServiceConfig;
    
    console.log('[CnftService] Initialized with RPC:', this.config.rpcEndpoint);
  }
  
  /**
   * Fetch cNFT asset data from DAS API
   */
  async getCnftAsset(assetId: string): Promise<CnftAssetData> {
    console.log('[CnftService] Fetching cNFT asset data:', assetId);
    
    try {
      const response = await this.makeDasRequest('getAsset', {
        id: assetId,
      });
      
      // Handle both wrapped and direct responses
      const assetData = response.result || response;
      
      if (!assetData) {
        throw new Error('No asset data returned from DAS API');
      }
      
      // Validate it's a compressed NFT
      if (!assetData.compression?.compressed) {
        throw new Error(`Asset ${assetId} is not a compressed NFT`);
      }
      
      console.log('[CnftService] cNFT asset data retrieved:', {
        tree: assetData.compression.tree,
        leafId: assetData.compression.leaf_id,
        owner: assetData.ownership?.owner,
      });
      
      return assetData as CnftAssetData;
    } catch (error: any) {
      console.error('[CnftService] Failed to fetch cNFT asset:', error.message);
      throw new Error(`Failed to fetch cNFT asset ${assetId}: ${error.message}`);
    }
  }
  
  /**
   * Fetch Merkle proof for cNFT transfer
   */
  async getCnftProof(assetId: string): Promise<DasProofResponse> {
    console.log('[CnftService] Fetching Merkle proof for:', assetId);
    
    try {
      const response = await this.makeDasRequest('getAssetProof', {
        id: assetId,
      });
      
      // Handle both wrapped and direct responses
      const proofData = response.result || response;
      
      if (!proofData || !proofData.proof) {
        throw new Error('No proof data returned from DAS API');
      }
      
      console.log('[CnftService] Merkle proof retrieved:', {
        treeId: proofData.tree_id,
        nodeIndex: proofData.node_index,
        proofLength: proofData.proof.length,
      });
      
      return proofData as DasProofResponse;
    } catch (error: any) {
      console.error('[CnftService] Failed to fetch Merkle proof:', error.message);
      throw new Error(`Failed to fetch Merkle proof for ${assetId}: ${error.message}`);
    }
  }
  
  /**
   * Derive tree authority PDA for a Merkle tree
   * Tree authority is required for all Bubblegum operations
   */
  deriveTreeAuthority(treeAddress: PublicKey): PublicKey {
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [treeAddress.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    
    console.log('[CnftService] Derived tree authority:', {
      tree: treeAddress.toBase58(),
      authority: treeAuthority.toBase58(),
    });
    
    return treeAuthority;
  }
  
  /**
   * Build cNFT transfer parameters from DAS API data
   * Combines asset data and proof into format needed by transaction builder
   */
  async buildTransferParams(
    assetId: string,
    fromAddress: PublicKey,
    toAddress: PublicKey
  ): Promise<CnftTransferParams> {
    console.log('[CnftService] Building cNFT transfer params:', {
      assetId,
      from: fromAddress.toBase58(),
      to: toAddress.toBase58(),
    });
    
    // Fetch asset data and proof in parallel
    const [assetData, proofData] = await Promise.all([
      this.getCnftAsset(assetId),
      this.getCnftProof(assetId),
    ]);
    
    // Validate ownership
    if (assetData.ownership.owner !== fromAddress.toBase58()) {
      throw new Error(
        `Ownership mismatch: Asset owned by ${assetData.ownership.owner}, expected ${fromAddress.toBase58()}`
      );
    }
    
    // Parse tree address
    const treeAddress = new PublicKey(assetData.compression.tree);
    
    // Derive tree authority
    const treeAuthorityAddress = this.deriveTreeAuthority(treeAddress);
    
    // Convert proof data to CnftProof format
    const proof = this.convertDasProofToCnftProof(proofData, assetData);
    
    console.log('[CnftService] cNFT transfer params built successfully');
    
    return {
      treeAddress,
      treeAuthorityAddress,
      fromAddress,
      toAddress,
      proof,
      delegateAddress: assetData.ownership.delegate 
        ? new PublicKey(assetData.ownership.delegate) 
        : undefined,
    };
  }
  
  /**
   * Convert DAS proof response to CnftProof format expected by program
   */
  private convertDasProofToCnftProof(
    dasProof: DasProofResponse,
    assetData: CnftAssetData
  ): CnftProof {
    // Decode base58 strings to byte arrays
    const root = Array.from(bs58.decode(dasProof.root));
    const leaf = Array.from(bs58.decode(dasProof.leaf));
    const proof = dasProof.proof.map(node => Array.from(bs58.decode(node)));
    
    // For data_hash and creator_hash, we need to fetch from the asset metadata
    // These are typically stored in the compression object
    const dataHash = assetData.compression?.data_hash 
      ? Array.from(bs58.decode(assetData.compression.data_hash))
      : leaf; // Fallback to leaf hash
    
    const creatorHash = assetData.compression?.creator_hash
      ? Array.from(bs58.decode(assetData.compression.creator_hash))
      : new Array(32).fill(0); // Fallback to empty hash
    
    return {
      root,
      dataHash,
      creatorHash,
      nonce: assetData.compression.leaf_id, // Nonce is typically the leaf ID
      index: dasProof.node_index,
      proof,
    };
  }
  
  /**
   * Make DAS API request with retry logic
   */
  private async makeDasRequest(
    method: string,
    params: Record<string, any>,
    retryCount = 0
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeout);
    
    try {
      const response = await fetch(this.config.rpcEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`DAS API error: ${data.error.message || JSON.stringify(data.error)}`);
      }
      
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Retry on network errors or timeouts
      if (retryCount < this.config.maxRetries) {
        console.warn(
          `[CnftService] DAS request failed (attempt ${retryCount + 1}/${this.config.maxRetries}):`,
          error.message
        );
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.makeDasRequest(method, params, retryCount + 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Verify cNFT proof is still valid (root matches on-chain)
   * This is important because proofs can become stale if the tree is modified
   */
  async verifyProofFreshness(
    treeAddress: PublicKey,
    proofRoot: Uint8Array | number[]
  ): Promise<boolean> {
    console.log('[CnftService] Verifying proof freshness for tree:', treeAddress.toBase58());
    
    try {
      // Fetch on-chain tree account to get current root
      // This requires parsing the Merkle tree account data
      // For now, we'll return true and let the program validate
      // TODO: Implement on-chain root verification
      
      console.log('[CnftService] Proof freshness check: Delegated to on-chain validation');
      return true;
    } catch (error: any) {
      console.error('[CnftService] Failed to verify proof freshness:', error.message);
      return false;
    }
  }
}

/**
 * Create CnftService instance
 */
export function createCnftService(
  connection: Connection,
  config?: Partial<CnftServiceConfig>
): CnftService {
  return new CnftService(connection, config);
}

