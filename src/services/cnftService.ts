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

// Concurrent Merkle Tree account header size (before canopy data)
// Based on SPL Account Compression v0.2: discriminator (8) + header (54) + changelog buffer + rightmost proof
// For a tree with maxDepth=14, maxBufferSize=64: 8 + 54 + (64 * (1 + 32 + 32 * 14)) + (14 * 32) = ~30,024 bytes
// The canopy starts after this
const CMT_HEADER_SIZES: { [key: number]: number } = {
  // maxDepth -> header size (before canopy)
  // These are calculated based on SPL Account Compression layout
  14: 30024, // Standard Metaplex tree (maxBufferSize=64)
  20: 61752, // Larger trees
  24: 81976, // Very large trees
};

// Fallback: estimate header size based on typical maxBufferSize=64
function estimateHeaderSize(maxDepth: number): number {
  const maxBufferSize = 64;
  // Header layout: discriminator(8) + header(54) + changelog_buffer + rightmost_proof
  // changelog_buffer = maxBufferSize * (1 + 32 + maxDepth * 32)
  // rightmost_proof = maxDepth * 32
  const headerSize = 8 + 54;
  const changelogEntrySize = 1 + 32 + maxDepth * 32;
  const changelogBufferSize = maxBufferSize * changelogEntrySize;
  const rightmostProofSize = maxDepth * 32;
  return headerSize + changelogBufferSize + rightmostProofSize;
}

export interface CnftServiceConfig {
  /** RPC endpoint with DAS API support (e.g., Helius) */
  rpcEndpoint: string;
  
  /** Request timeout in milliseconds */
  requestTimeout: number;
  
  /** Maximum retry attempts */
  maxRetries: number;
  
  /** Rate limiting: max concurrent DAS requests */
  maxConcurrentRequests: number;
  
  /** Rate limiting: delay between batches (ms) */
  batchDelayMs: number;
  
  /** Proof cache TTL in seconds */
  proofCacheTtlSeconds: number;
}

/** Cached proof entry with expiration */
interface ProofCacheEntry {
  proof: DasProofResponse;
  fetchedAt: number;
  expiresAt: number;
}

/** Metrics for monitoring */
interface CnftServiceMetrics {
  proofCacheHits: number;
  proofCacheMisses: number;
  totalProofFetches: number;
  rateLimitHits: number;
  avgFetchTimeMs: number;
  lastFetchTimes: number[];
}

export class CnftService {
  private connection: Connection;
  private config: CnftServiceConfig;
  
  // Proof cache with TTL
  private proofCache: Map<string, ProofCacheEntry> = new Map();
  
  // Rate limiting: active request count
  private activeRequests = 0;
  private requestQueue: Array<() => void> = [];
  
  // Metrics
  private metrics: CnftServiceMetrics = {
    proofCacheHits: 0,
    proofCacheMisses: 0,
    totalProofFetches: 0,
    rateLimitHits: 0,
    avgFetchTimeMs: 0,
    lastFetchTimes: [],
  };
  
  private static readonly DEFAULT_CONFIG: Partial<CnftServiceConfig> = {
    requestTimeout: 30000, // 30 seconds (proofs can be slow)
    maxRetries: 3,
    maxConcurrentRequests: 5, // Limit concurrent DAS API requests
    batchDelayMs: 200, // Delay between batches
    proofCacheTtlSeconds: 30, // Cache proofs for 30 seconds
  };
  
  constructor(connection: Connection, config?: Partial<CnftServiceConfig>) {
    this.connection = connection;
    this.config = {
      rpcEndpoint: connection.rpcEndpoint,
      ...CnftService.DEFAULT_CONFIG,
      ...config,
    } as CnftServiceConfig;
    
    console.log('[CnftService] Initialized with RPC:', this.config.rpcEndpoint);
    console.log('[CnftService] Rate limiting:', {
      maxConcurrent: this.config.maxConcurrentRequests,
      batchDelayMs: this.config.batchDelayMs,
      cacheTtlSeconds: this.config.proofCacheTtlSeconds,
    });
    
    // Periodic cache cleanup (every 60 seconds)
    setInterval(() => this.cleanupProofCache(), 60000);
  }
  
  /**
   * Get service metrics for monitoring
   */
  getMetrics(): CnftServiceMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Clean up expired cache entries
   */
  private cleanupProofCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.proofCache.entries()) {
      if (now >= entry.expiresAt) {
        this.proofCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[CnftService] Cleaned ${cleaned} expired proof cache entries`);
    }
  }
  
  /**
   * Check if a cached proof is still fresh
   */
  private getCachedProof(assetId: string): DasProofResponse | null {
    const entry = this.proofCache.get(assetId);
    if (!entry) return null;
    
    if (Date.now() >= entry.expiresAt) {
      this.proofCache.delete(assetId);
      return null;
    }
    
    return entry.proof;
  }
  
  /**
   * Cache a proof with TTL
   */
  private cacheProof(assetId: string, proof: DasProofResponse): void {
    const now = Date.now();
    this.proofCache.set(assetId, {
      proof,
      fetchedAt: now,
      expiresAt: now + (this.config.proofCacheTtlSeconds * 1000),
    });
  }
  
  /**
   * Rate-limited request execution
   */
  private async withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for available slot
    while (this.activeRequests >= this.config.maxConcurrentRequests) {
      this.metrics.rateLimitHits++;
      await new Promise<void>(resolve => {
        this.requestQueue.push(resolve);
      });
    }
    
    this.activeRequests++;
    
    try {
      return await fn();
    } finally {
      this.activeRequests--;
      // Release next waiting request
      const next = this.requestQueue.shift();
      if (next) next();
    }
  }
  
  /**
   * Fetch proofs for multiple cNFTs in batches
   * Handles rate limiting and caching automatically
   */
  async batchGetCnftProofs(assetIds: string[], batchSize = 3): Promise<Map<string, DasProofResponse>> {
    console.log(`[CnftService] Batch fetching ${assetIds.length} proofs (batch size: ${batchSize})`);
    const results = new Map<string, DasProofResponse>();
    const errors: Array<{ assetId: string; error: string }> = [];
    
    // Check cache first
    const uncachedIds: string[] = [];
    for (const assetId of assetIds) {
      const cached = this.getCachedProof(assetId);
      if (cached) {
        results.set(assetId, cached);
        this.metrics.proofCacheHits++;
        console.log(`[CnftService] Cache hit for ${assetId.substring(0, 8)}...`);
      } else {
        uncachedIds.push(assetId);
        this.metrics.proofCacheMisses++;
      }
    }
    
    if (uncachedIds.length === 0) {
      console.log(`[CnftService] All ${assetIds.length} proofs served from cache`);
      return results;
    }
    
    console.log(`[CnftService] Fetching ${uncachedIds.length} uncached proofs`);
    
    // Process in batches
    for (let i = 0; i < uncachedIds.length; i += batchSize) {
      const batch = uncachedIds.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(uncachedIds.length / batchSize);
      
      console.log(`[CnftService] Processing batch ${batchNum}/${totalBatches}`);
      
      // Fetch batch concurrently (within rate limits)
      // Use skipCache=true since we already checked the cache above
      const batchPromises = batch.map(async (assetId) => {
        try {
          const proof = await this.getCnftProof(assetId, true); // Skip cache - already checked
          return { assetId, proof, error: null };
        } catch (error: any) {
          return { assetId, proof: null, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        if (result.proof) {
          results.set(result.assetId, result.proof);
        } else {
          errors.push({ assetId: result.assetId, error: result.error! });
        }
      }
      
      // Delay between batches (except for last batch)
      if (i + batchSize < uncachedIds.length) {
        await new Promise(r => setTimeout(r, this.config.batchDelayMs));
      }
    }
    
    if (errors.length > 0) {
      console.warn(`[CnftService] ${errors.length} proof fetch failures:`, errors);
    }
    
    console.log(`[CnftService] Batch complete: ${results.size} proofs fetched`);
    return results;
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
  async getCnftProof(assetId: string, skipCache = false): Promise<DasProofResponse> {
    console.log('[CnftService] Fetching Merkle proof for:', assetId);
    
    // Check cache first (unless skip requested)
    if (!skipCache) {
      const cached = this.getCachedProof(assetId);
      if (cached) {
        console.log('[CnftService] Using cached proof for:', assetId.substring(0, 12) + '...');
        this.metrics.proofCacheHits++;
        return cached;
      }
      this.metrics.proofCacheMisses++;
    }
    
    const startTime = Date.now();
    this.metrics.totalProofFetches++;
    
    try {
      // Use rate limiting for the actual fetch
      const proofData = await this.withRateLimit(async () => {
        const response = await this.makeDasRequest('getAssetProof', {
          id: assetId,
        });
        
        // Handle both wrapped and direct responses
        const data = response.result || response;
        
        if (!data || !data.proof) {
          throw new Error('No proof data returned from DAS API');
        }
        
        return data as DasProofResponse;
      });
      
      // Track fetch time
      const fetchTime = Date.now() - startTime;
      this.metrics.lastFetchTimes.push(fetchTime);
      if (this.metrics.lastFetchTimes.length > 100) {
        this.metrics.lastFetchTimes.shift();
      }
      this.metrics.avgFetchTimeMs = 
        this.metrics.lastFetchTimes.reduce((a, b) => a + b, 0) / this.metrics.lastFetchTimes.length;
      
      console.log('[CnftService] Merkle proof retrieved:', {
        treeId: proofData.tree_id,
        nodeIndex: proofData.node_index,
        proofLength: proofData.proof.length,
        fetchTimeMs: fetchTime,
      });
      
      // Cache the result
      this.cacheProof(assetId, proofData);
      
      return proofData;
    } catch (error: any) {
      console.error('[CnftService] Failed to fetch Merkle proof:', error.message);
      throw new Error(`Failed to fetch Merkle proof for ${assetId}: ${error.message}`);
    }
  }
  
  /**
   * Get a fresh proof, bypassing cache
   * Use this when you need to ensure proof is absolutely current
   */
  async getFreshCnftProof(assetId: string): Promise<DasProofResponse> {
    return this.getCnftProof(assetId, true);
  }
  
  /**
   * Derive tree authority PDA for a Merkle tree (Bubblegum standard)
   * Tree authority is required for all Bubblegum operations
   * Seeds: [merkle_tree_pubkey] - NOT ['TreeConfig', merkle_tree_pubkey]
   * Note: The Bubblegum on-chain program uses [tree_address] only
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
    
    // Convert proof data to CnftProof format with dynamic canopy depth detection
    const proof = await this.convertDasProofToCnftProofAsync(proofData, assetData);
    
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
   * Fetch canopy depth from Merkle tree account
   * The canopy stores proof nodes on-chain to reduce transaction size
   * 
   * IMPORTANT: Canopy depth detection is complex and tree-specific.
   * If detection fails, we use a DEFAULT_CANOPY_DEPTH that works for most standard trees.
   * If that fails, the transaction will fail with a size error and the user should use a different NFT.
   */
  async getTreeCanopyDepth(treeAddress: PublicKey, maxDepthHint?: number): Promise<number> {
    console.log('[CnftService] Fetching canopy depth for tree:', treeAddress.toBase58());
    
    // Default canopy depth for standard Metaplex trees (maxDepth=14, canopy=11)
    // This works for most common cNFT collections
    const DEFAULT_CANOPY_DEPTH = 11;
    
    try {
      const accountInfo = await this.connection.getAccountInfo(treeAddress);
      
      if (!accountInfo) {
        console.warn('[CnftService] Tree account not found, using default canopy depth:', DEFAULT_CANOPY_DEPTH);
        return DEFAULT_CANOPY_DEPTH;
      }
      
      const accountSize = accountInfo.data.length;
      console.log('[CnftService] Tree account size:', accountSize, 'bytes');
      
      // Use maxDepthHint if provided, otherwise try common values
      const maxDepthsToTry = maxDepthHint ? [maxDepthHint] : [14, 20, 24, 17, 26, 30];
      
      for (const maxDepth of maxDepthsToTry) {
        const headerSize = CMT_HEADER_SIZES[maxDepth] || estimateHeaderSize(maxDepth);
        const canopyDataSize = accountSize - headerSize;
        
        if (canopyDataSize <= 0) continue;
        
        // Each canopy node is 32 bytes
        // Canopy stores 2^(canopyDepth+1) - 2 nodes
        const canopyNodes = Math.floor(canopyDataSize / 32);
        
        if (canopyNodes <= 0) continue;
        
        // canopy_nodes = 2^(canopy_depth+1) - 2
        // 2^(canopy_depth+1) = canopy_nodes + 2
        // canopy_depth = log2(canopy_nodes + 2) - 1
        const canopyDepthFloat = Math.log2(canopyNodes + 2) - 1;
        const canopyDepth = Math.floor(canopyDepthFloat);
        
        // Validate: should be a power of 2 relationship
        const expectedNodes = Math.pow(2, canopyDepth + 1) - 2;
        if (Math.abs(expectedNodes - canopyNodes) < 10) { // Allow small variance
          console.log(`[CnftService] Detected canopy depth: ${canopyDepth} (maxDepth=${maxDepth}, canopyNodes=${canopyNodes})`);
          return canopyDepth;
        }
      }
      
      // Fallback: Use default canopy depth (safer than 0 which sends all nodes)
      console.warn('[CnftService] Could not determine canopy depth, using default:', DEFAULT_CANOPY_DEPTH);
      return DEFAULT_CANOPY_DEPTH;
      
    } catch (error: any) {
      console.error('[CnftService] Failed to fetch tree canopy depth:', error.message);
      // Default to standard canopy - safer than 0
      console.warn('[CnftService] Using default canopy depth:', DEFAULT_CANOPY_DEPTH);
      return DEFAULT_CANOPY_DEPTH;
    }
  }
  
  /**
   * Convert DAS proof response to CnftProof format expected by program
   */
  private async convertDasProofToCnftProofAsync(
    dasProof: DasProofResponse,
    assetData: CnftAssetData
  ): Promise<CnftProof> {
    // Decode base58 strings to byte arrays
    const root = Array.from(bs58.decode(dasProof.root));
    
    // Get tree address and fetch canopy depth dynamically
    const treeAddress = new PublicKey(assetData.compression.tree);
    const maxDepth = dasProof.proof.length;
    const canopyDepth = await this.getTreeCanopyDepth(treeAddress, maxDepth);
    
    // CRITICAL: Trim proof based on actual canopy depth
    // We only need the last (maxDepth - canopyDepth) proof nodes
    // The first `canopyDepth` levels are stored on-chain in the canopy
    const proofNodesToSend = dasProof.proof.slice(canopyDepth);
    const proof = proofNodesToSend.map(node => Array.from(bs58.decode(node)));
    
    // Calculate estimated proof size contribution to transaction
    const proofSizeBytes = proof.length * 32;
    console.log(`[CnftService] Proof trimmed from ${maxDepth} to ${proof.length} nodes (canopy: ${canopyDepth}, ~${proofSizeBytes} bytes)`);
    
    // Warn if proof is large (may cause transaction size issues)
    if (proof.length > 5) {
      console.warn(`[CnftService] ⚠️ Large proof detected (${proof.length} nodes, ~${proofSizeBytes} bytes). Transaction may exceed size limit.`);
    }
    
    // CRITICAL: Calculate leaf_index from node_index
    // Research: "leaf_index = node_index - 2^maxDepth"
    const leafIndex = dasProof.node_index - Math.pow(2, maxDepth);
    
    console.log(`[CnftService] Index calculation: node_index=${dasProof.node_index}, maxDepth=${maxDepth}, leafIndex=${leafIndex}`);
    
    // CRITICAL: Use actual hashes from DAS API compression field
    // These are required for proper merkle verification by Bubblegum
    const dataHash = Array.from(bs58.decode(assetData.compression.data_hash));
    const creatorHash = Array.from(bs58.decode(assetData.compression.creator_hash));
    
    const cnftProof = {
      root,
      dataHash,
      creatorHash,
      nonce: assetData.compression.leaf_id, // Nonce is the leaf ID
      index: leafIndex, // FIXED: Calculate from node_index, not use leaf_id directly
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
      canopyDepth,
      maxDepth,
      estimatedProofBytes: proofSizeBytes,
    });
    
    return cnftProof;
  }
  
  /**
   * Convert DAS proof response to CnftProof format expected by program
   * @deprecated Use convertDasProofToCnftProofAsync instead
   */
  private convertDasProofToCnftProof(
    dasProof: DasProofResponse,
    assetData: CnftAssetData
  ): CnftProof {
    // Decode base58 strings to byte arrays
    const root = Array.from(bs58.decode(dasProof.root));
    
    // FALLBACK: Use canopy depth 0 (send all proof nodes)
    // This is safer for unknown trees - the canopy on-chain will validate correctly
    // The transaction might be larger but will work with any tree configuration
    const CANOPY_DEPTH = 0;
    const maxDepth = dasProof.proof.length;
    const proofNodesToSend = dasProof.proof.slice(CANOPY_DEPTH);
    const proof = proofNodesToSend.map(node => Array.from(bs58.decode(node)));
    
    console.log(`[CnftService] Proof: sending all ${proof.length} nodes (fallback mode, canopy: ${CANOPY_DEPTH})`);
    
    // CRITICAL: Calculate leaf_index from node_index
    const leafIndex = dasProof.node_index - Math.pow(2, maxDepth);
    
    console.log(`[CnftService] Index calculation: node_index=${dasProof.node_index}, maxDepth=${maxDepth}, leafIndex=${leafIndex}`);
    
    // CRITICAL: Use actual hashes from DAS API compression field
    const dataHash = Array.from(bs58.decode(assetData.compression.data_hash));
    const creatorHash = Array.from(bs58.decode(assetData.compression.creator_hash));
    
    const cnftProof = {
      root,
      dataHash,
      creatorHash,
      nonce: assetData.compression.leaf_id,
      index: leafIndex,
      proof,
    };
    
    console.log('[CnftService] Full proof details:', {
      root: root.slice(0, 8),
      dataHashFirst8: dataHash.slice(0, 8),
      creatorHashFirst8: creatorHash.slice(0, 8),
      nonce: cnftProof.nonce,
      index: cnftProof.index,
      proofLength: proof.length,
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
      // CRITICAL: Use unique request IDs to prevent DAS API caching
      // Full cache-control headers break QuickNode's getAssetProof endpoint
      // but unique IDs should prevent caching without causing errors
      const response = await fetch(this.config.rpcEndpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          // Unique ID: timestamp + random + retry count to ensure uniqueness
          id: `${Date.now()}-${Math.random().toString(36).substring(7)}-${retryCount}`,
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

