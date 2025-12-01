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
    
    // CRITICAL: Trim proof based on canopy depth
    // Our merkle trees have canopy depth 11, so we only need the last (maxDepth - canopyDepth) proof nodes
    // The first 11 levels are stored on-chain in the canopy
    // Standard Metaplex tree: maxDepth=14, canopyDepth=11 → need last 3 nodes
    //
    // IMPORTANT: Use slice(CANOPY_DEPTH) not slice(-Math.max(...))
    // slice(-0) equals slice(0) and returns full array (JavaScript quirk)
    // slice(CANOPY_DEPTH) correctly returns empty array when proof.length <= CANOPY_DEPTH
    const CANOPY_DEPTH = 11;
    const proofNodesToSend = dasProof.proof.slice(CANOPY_DEPTH);
    const proof = proofNodesToSend.map(node => Array.from(bs58.decode(node)));
    
    console.log(`[CnftService] Proof trimmed from ${dasProof.proof.length} to ${proof.length} nodes (canopy: ${CANOPY_DEPTH})`);
    
    // CRITICAL: Use actual hashes from DAS API compression field
    // These are required for proper merkle verification by Bubblegum
    const dataHash = Array.from(bs58.decode(assetData.compression.data_hash));
    const creatorHash = Array.from(bs58.decode(assetData.compression.creator_hash));
    
    const cnftProof = {
      root,
      dataHash,
      creatorHash,
      nonce: assetData.compression.leaf_id, // Nonce is typically the leaf ID
      index: assetData.compression.leaf_id, // Use actual leaf ID, not node_index
      proof,
    };
    
    // DEBUG: Log full proof details for investigation
    console.log('[CnftService] Full proof details:', {
      root: root.slice(0, 8),
      dataHashFirst8: dataHash.slice(0, 8),
      creatorHashFirst8: creatorHash.slice(0, 8),
      nonce: cnftProof.nonce,
      index: cnftProof.index,
      proofLength: proof.length,
      fullRoot: root,
    });
    
    return cnftProof;
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
      // CRITICAL: Add cache-busting headers to prevent stale proofs
      // DAS APIs often cache proof responses, but we need fresh data for every call
      const response = await fetch(this.config.rpcEndpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache', // HTTP/1.0 compatibility
          'Expires': '0', // Proxies
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now() + Math.random(), // Unique ID to prevent caching
          method,
          params,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[CnftService] DAS API HTTP error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
      
      // Get response text first for better error handling
      const responseText = await response.text();
      
      if (!responseText || responseText.trim() === '') {
        console.error('[CnftService] DAS API returned empty response');
        throw new Error('DAS API returned empty response');
      }
      
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseError: any) {
        console.error('[CnftService] Failed to parse DAS API response:', {
          error: parseError.message,
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200),
        });
        throw new Error(`Failed to parse DAS API response: ${parseError.message}`);
      }
      
      if (data?.error) {
        console.error('[CnftService] DAS API returned error:', data.error);
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

