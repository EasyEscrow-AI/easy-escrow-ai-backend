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
import { DasHttpRateLimiter } from './das-http-rate-limiter';

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
  
  /** Optional separate RPC endpoint for batch operations (defaults to rpcEndpoint) */
  batchRpcEndpoint?: string;
  
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
  
  /** Enable parallel fetching for individual proofs (reduces stale proof risk) */
  enableParallelProofFetching?: boolean;
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
  batchProofFetches: number; // Number of batch proof fetch calls
  batchProofSuccesses: number; // Successful batch fetches
  batchProofFallbacks: number; // Batch fetches that fell back to individual
  individualProofFetches: number; // Individual proof fetches (non-batch)
}

export class CnftService {
  private connection: Connection;
  private batchConnection?: Connection; // Optional separate connection for batch operations
  private config: CnftServiceConfig;

  // Some RPC providers do not support DAS getAssetProofBatch. Cache this to avoid repeated retries.
  private batchProofSupported: boolean | null = null;
  // Some RPC providers implement a different batch proof method (e.g. getAssetProofs).
  private assetProofsSupported: boolean | null = null;

  // Proof cache with TTL - STATIC so it's shared across all CnftService instances
  // This ensures clearAllCachedProofs() clears the cache for all instances
  private static proofCache: Map<string, ProofCacheEntry> = new Map();
  
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
    batchProofFetches: 0,
    batchProofSuccesses: 0,
    batchProofFallbacks: 0,
    individualProofFetches: 0,
  };
  
  private static readonly DEFAULT_CONFIG: Partial<CnftServiceConfig> = {
    requestTimeout: 30000, // 30 seconds (proofs can be slow)
    maxRetries: 3,
    maxConcurrentRequests: 5, // Limit concurrent DAS API requests
    batchDelayMs: 200, // Delay between batches
    proofCacheTtlSeconds: 5, // Cache proofs for 5 seconds (reduced from 30s for high-activity trees)
    enableParallelProofFetching: true, // Enable parallel fetching by default
  };
  
  constructor(connection: Connection, config?: Partial<CnftServiceConfig>) {
    this.connection = connection;
    this.config = {
      rpcEndpoint: connection.rpcEndpoint,
      batchRpcEndpoint: config?.batchRpcEndpoint,
      ...CnftService.DEFAULT_CONFIG,
      ...config,
    } as CnftServiceConfig;
    
    // Create separate connection for batch operations if specified
    if (this.config.batchRpcEndpoint && this.config.batchRpcEndpoint !== connection.rpcEndpoint) {
      const { Connection } = require('@solana/web3.js');
      this.batchConnection = new Connection(this.config.batchRpcEndpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
      });
      console.log('[CnftService] Batch operations will use separate RPC:', this.config.batchRpcEndpoint);
    }
    
    console.log('[CnftService] Initialized with RPC:', this.config.rpcEndpoint);
    console.log('[CnftService] Rate limiting:', {
      maxConcurrent: this.config.maxConcurrentRequests,
      batchDelayMs: this.config.batchDelayMs,
      cacheTtlSeconds: this.config.proofCacheTtlSeconds,
      parallelFetching: this.config.enableParallelProofFetching,
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
    
    for (const [key, entry] of CnftService.proofCache.entries()) {
      if (now >= entry.expiresAt) {
        CnftService.proofCache.delete(key);
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
    const entry = CnftService.proofCache.get(assetId);
    if (!entry) return null;
    
    if (Date.now() >= entry.expiresAt) {
      CnftService.proofCache.delete(assetId);
      return null;
    }
    
    return entry.proof;
  }
  
  /**
   * Cache a proof with TTL
   */
  /**
   * Cache proof with TTL
   * IMPROVEMENT: Use shorter TTL for high-activity trees to ensure freshness
   * Research shows proofs can become stale in seconds on active trees
   * 
   * @param assetId - The cNFT asset ID
   * @param proof - The proof data to cache
   * @param ttlSeconds - Optional override TTL (defaults to config.proofCacheTtlSeconds)
   *                    For high-activity trees, can override with shorter TTL (e.g., 5s)
   */
  private cacheProof(assetId: string, proof: DasProofResponse, ttlSeconds?: number): void {
    const now = Date.now();
    // Use provided TTL override, or fall back to config value
    // Config defaults to 30s, but can be overridden per-call for critical freshness
    const ttl = ttlSeconds ?? this.config.proofCacheTtlSeconds;
    CnftService.proofCache.set(assetId, {
      proof,
      fetchedAt: now,
      expiresAt: now + (ttl * 1000),
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
   * Fetch multiple proofs in parallel (for individual cNFTs)
   * This reduces stale proof risk by fetching all proofs simultaneously
   * 
   * @param assetIds - Array of cNFT asset IDs
   * @param skipCache - Whether to bypass the cache
   * @returns Map of assetId -> DasProofResponse
   */
  async getCnftProofsParallel(
    assetIds: string[],
    skipCache = false
  ): Promise<Map<string, DasProofResponse>> {
    if (!this.config.enableParallelProofFetching || assetIds.length <= 1) {
      // Fallback to sequential if parallel is disabled or only one asset
      const results = new Map<string, DasProofResponse>();
      for (const assetId of assetIds) {
        const proof = await this.getCnftProof(assetId, skipCache);
        results.set(assetId, proof);
      }
      return results;
    }
    
    console.log(`[CnftService] Parallel fetching ${assetIds.length} proofs (reduces stale proof risk)`);
    const startTime = Date.now();
    
    // Fetch all proofs in parallel
    const proofPromises = assetIds.map(async (assetId) => {
      try {
        const proof = await this.getCnftProof(assetId, skipCache);
        return { assetId, proof, error: null };
      } catch (error: any) {
        return { assetId, proof: null, error: error.message };
      }
    });
    
    const results = await Promise.all(proofPromises);
    const fetchTime = Date.now() - startTime;
    
    const proofMap = new Map<string, DasProofResponse>();
    const errors: Array<{ assetId: string; error: string }> = [];
    
    for (const result of results) {
      if (result.error) {
        errors.push({ assetId: result.assetId, error: result.error });
        console.error(`[CnftService] Failed to fetch proof for ${result.assetId}: ${result.error}`);
      } else if (result.proof) {
        proofMap.set(result.assetId, result.proof);
      }
    }
    
    console.log(`[CnftService] Parallel fetch complete: ${proofMap.size}/${assetIds.length} proofs in ${fetchTime}ms`);
    
    if (errors.length > 0) {
      console.warn(`[CnftService] ${errors.length} proofs failed during parallel fetch`);
    }
    
    return proofMap;
  }
  
  /**
   * Fetch proofs for multiple cNFTs in batches
   * Handles rate limiting and caching automatically
   * @deprecated Use getAssetProofBatch for batch operations or getCnftProofsParallel for parallel individual fetches
   */
  /**
   * Fetch multiple Merkle proofs in a single DAS API call using getAssetProofBatch
   * 
   * This is the optimized method for JITO bundles with multiple cNFTs.
   * Reduces API calls from N to 1 and minimizes stale proof risk by fetching all proofs simultaneously.
   * 
   * @param assetIds - Array of cNFT asset IDs (max 50 per DAS API best practices)
   * @param skipCache - Whether to bypass the cache
   * @returns Map of assetId -> DasProofResponse
   */
  async getAssetProofBatch(
    assetIds: string[],
    skipCache = false
  ): Promise<Map<string, DasProofResponse>> {
    console.log(`[CnftService] Batch fetching ${assetIds.length} proofs using getAssetProofBatch`);
    
    if (assetIds.length === 0) {
      return new Map();
    }

    // If this RPC doesn't support getAssetProofBatch, try getAssetProofs (plural) if available,
    // otherwise fall back to individual proof fetching.
    if (this.batchProofSupported === false) {
      // Try getAssetProofs (plural) to reduce N individual calls -> 1 call (helps under strict RPS limits).
      if (this.assetProofsSupported !== false) {
        try {
          console.log('[CnftService] getAssetProofBatch disabled; attempting getAssetProofs batch call instead...');
          const response = await this.withRateLimit(async () => {
            const r = await this.makeDasRequest('getAssetProofs', { ids: assetIds }, 0, false);
            return r.result || r;
          });

          const results = new Map<string, DasProofResponse>();
          // Heuristics: support array, map keyed by asset id, or object containing items/proofs arrays.
          const data: any = response;
          let list: any[] | null = null;

          if (Array.isArray(data)) {
            list = data;
          } else if (data && typeof data === 'object') {
            if (Array.isArray(data.items)) list = data.items;
            else if (Array.isArray(data.proofs)) list = data.proofs;
          }

          if (list) {
            for (let i = 0; i < assetIds.length; i++) {
              const assetId = assetIds[i];
              const proof = list[i];
              if (proof && proof.proof) results.set(assetId, proof);
            }
          } else if (data && typeof data === 'object') {
            for (const assetId of assetIds) {
              const proof = data[assetId];
              if (proof && proof.proof) results.set(assetId, proof);
            }
          }

          if (results.size > 0) {
            for (const [assetId, proof] of results) this.cacheProof(assetId, proof);
            return results;
          }

          throw new Error('getAssetProofs returned no usable proofs');
        } catch (err: any) {
          const rpcCode = (err as any)?.rpcCode;
          if (rpcCode === -32601 || String(err?.message || '').toLowerCase().includes('method not found')) {
            this.assetProofsSupported = false;
            console.warn('[CnftService] Disabling getAssetProofs for this RPC due to -32601 Method not found.');
          }
          console.warn('[CnftService] getAssetProofs batch attempt failed; falling back to individual proof fetching:', err?.message || err);
        }
      }

      console.warn('[CnftService] Batch proof methods unavailable; falling back to individual proof fetching.');
      this.metrics.batchProofFallbacks++;
      const results = new Map<string, DasProofResponse>();
      const errors: Array<{ assetId: string; error: string }> = [];
      for (const assetId of assetIds) {
        try {
          const proof = await this.getCnftProof(assetId, skipCache, 0);
          this.metrics.individualProofFetches++;
          results.set(assetId, proof);
        } catch (err: any) {
          console.error(`[CnftService] Failed to fetch individual proof for ${assetId}:`, err?.message || err);
          errors.push({ assetId, error: err?.message || 'Unknown error' });
        }
      }

      if (errors.length > 0) {
        console.warn(`[CnftService] ${errors.length} proof fetch failures while batch mode disabled:`, errors);
      }
      return results;
    }
    
    // Validate batch size (max 50 per Helius/QuickNode best practices)
    const MAX_BATCH_SIZE = 50;
    if (assetIds.length > MAX_BATCH_SIZE) {
      console.warn(`[CnftService] Batch size ${assetIds.length} exceeds max ${MAX_BATCH_SIZE}, splitting into multiple calls`);
      // Split into multiple batches and combine results
      const results = new Map<string, DasProofResponse>();
      for (let i = 0; i < assetIds.length; i += MAX_BATCH_SIZE) {
        const batch = assetIds.slice(i, i + MAX_BATCH_SIZE);
        const batchResults = await this.getAssetProofBatch(batch, skipCache);
        for (const [assetId, proof] of batchResults) {
          results.set(assetId, proof);
        }
      }
      return results;
    }
    
    const results = new Map<string, DasProofResponse>();
    const errors: Array<{ assetId: string; error: string }> = [];
    
    // Check cache first (unless skip requested)
    const uncachedIds: string[] = [];
    const cachedProofs = new Map<string, DasProofResponse>();
    
    if (!skipCache) {
      for (const assetId of assetIds) {
        const cached = this.getCachedProof(assetId);
        if (cached) {
          cachedProofs.set(assetId, cached);
          results.set(assetId, cached);
          this.metrics.proofCacheHits++;
          console.log(`[CnftService] Cache hit for ${assetId.substring(0, 12)}...`);
        } else {
          uncachedIds.push(assetId);
          this.metrics.proofCacheMisses++;
        }
      }
    } else {
      uncachedIds.push(...assetIds);
      this.metrics.proofCacheMisses += assetIds.length;
    }
    
    if (uncachedIds.length === 0) {
      console.log(`[CnftService] All ${assetIds.length} proofs served from cache`);
      return results;
    }
    
    console.log(`[CnftService] Fetching ${uncachedIds.length} uncached proofs via getAssetProofBatch`);
    
    const startTime = Date.now();
    this.metrics.totalProofFetches++;
    this.metrics.batchProofFetches++;
    
    try {
      // Use rate limiting for the batch request
      // Use batch connection (Helius) for better batch performance
      const batchResponse = await this.withRateLimit(async () => {
        // If we don't have a dedicated batch RPC, and we haven't confirmed getAssetProofBatch support,
        // prefer getAssetProofs (plural) to avoid burning a request on a method that may be unsupported.
        if (!this.batchConnection && this.assetProofsSupported !== false) {
          try {
            const r = await this.makeDasRequest('getAssetProofs', { ids: uncachedIds }, 0, false);
            const d = r.result || r;
            if (d) return d;
          } catch (e: any) {
            const rpcCode = (e as any)?.rpcCode;
            if (rpcCode === -32601 || String(e?.message || '').toLowerCase().includes('method not found')) {
              this.assetProofsSupported = false;
            }
            // Continue to getAssetProofBatch attempt below.
          }
        }

        const response = await this.makeDasRequest('getAssetProofBatch', {
          ids: uncachedIds,
        }, 0, true); // Use batch connection for batch operations
        
        // Handle both wrapped and direct responses
        const data = response.result || response;
        
        if (!data) {
          throw new Error('Empty batch proof response from DAS API');
        }
        
        return data;
      });
      
      // Track fetch time
      const fetchTime = Date.now() - startTime;
      this.metrics.lastFetchTimes.push(fetchTime);
      if (this.metrics.lastFetchTimes.length > 100) {
        this.metrics.lastFetchTimes.shift();
      }
      this.metrics.avgFetchTimeMs = 
        this.metrics.lastFetchTimes.reduce((a, b) => a + b, 0) / this.metrics.lastFetchTimes.length;
      
      // Some providers wrap batch proof responses (e.g. { items: [...] } or { proofs: [...] }).
      // Normalize these wrappers so downstream parsing works for both getAssetProofBatch and getAssetProofs.
      const normalizedBatchResponse: any = (() => {
        if (Array.isArray(batchResponse)) return batchResponse;
        if (batchResponse && typeof batchResponse === 'object') {
          if (Array.isArray((batchResponse as any).items)) return (batchResponse as any).items;
          if (Array.isArray((batchResponse as any).proofs)) return (batchResponse as any).proofs;
        }
        return batchResponse;
      })();
      
      // Handle both response formats:
      // 1. Array format: [proof1, proof2, ...] (same order as input IDs)
      // 2. Object/map format: {assetId1: proof1, assetId2: proof2, ...} (keyed by asset ID)
      if (Array.isArray(normalizedBatchResponse)) {
        // Array format: DAS API returns proofs in same order as input IDs
        for (let i = 0; i < uncachedIds.length; i++) {
          const assetId = uncachedIds[i];
          const proof = normalizedBatchResponse[i];
          
          if (!proof || !proof.proof) {
            errors.push({ 
              assetId, 
              error: `No proof data returned for asset ${assetId.substring(0, 12)}...` 
            });
            continue;
          }
          
          // Cache the result
          this.cacheProof(assetId, proof);
          results.set(assetId, proof);
        }
      } else if (typeof normalizedBatchResponse === 'object' && normalizedBatchResponse !== null) {
        // Object/map format: DAS API returns proofs keyed by asset ID
        for (const assetId of uncachedIds) {
          const proof = (normalizedBatchResponse as Record<string, any>)[assetId];
          
          if (!proof || !proof.proof) {
            errors.push({ 
              assetId, 
              error: `No proof data returned for asset ${assetId.substring(0, 12)}...` 
            });
            continue;
          }
          
          // Cache the result
          this.cacheProof(assetId, proof);
          results.set(assetId, proof);
        }
      } else {
        throw new Error(`Invalid batch proof response format from DAS API: expected array or object, got ${typeof normalizedBatchResponse}`);
      }
      
      console.log(`[CnftService] Batch proof fetch complete: ${results.size}/${uncachedIds.length} proofs fetched in ${fetchTime}ms`);
      
      if (errors.length > 0) {
        console.warn(`[CnftService] ${errors.length} proof fetch failures in batch:`, errors);
        this.metrics.batchProofFallbacks++;
        
        // Fallback to individual calls for failed proofs
        console.log(`[CnftService] Falling back to individual proof fetching for ${errors.length} failed assets`);
        for (const { assetId, error } of errors) {
          try {
            const individualProof = await this.getCnftProof(assetId, true, 0);
            this.metrics.individualProofFetches++;
            results.set(assetId, individualProof);
            console.log(`[CnftService] Successfully fetched individual proof for ${assetId.substring(0, 12)}...`);
          } catch (individualError: any) {
            console.error(`[CnftService] Failed to fetch individual proof for ${assetId}:`, individualError.message);
            // Keep the error - will be handled by caller
          }
        }
      } else {
        this.metrics.batchProofSuccesses++;
      }
      
      return results;
      
    } catch (error: any) {
      console.error(`[CnftService] Batch proof fetch failed: ${error.message}`);
      this.metrics.batchProofFallbacks++;

      // If provider returns -32601 for getAssetProofBatch, disable batch mode for this instance to avoid repeated retries.
      const rpcCode = (error as any)?.rpcCode;
      if (rpcCode === -32601 || String(error.message || '').toLowerCase().includes('method not found')) {
        this.batchProofSupported = false;
        console.warn('[CnftService] Disabling getAssetProofBatch for this RPC due to -32601 Method not found. Future calls will skip batch mode.');
      }

      console.log(`[CnftService] Falling back to individual proof fetching for all ${uncachedIds.length} assets`);
      
      // Fallback to individual calls if batch fails
      const fallbackResults = new Map<string, DasProofResponse>();
      for (const assetId of uncachedIds) {
        try {
          const proof = await this.getCnftProof(assetId, true, 0);
          this.metrics.individualProofFetches++;
          fallbackResults.set(assetId, proof);
        } catch (individualError: any) {
          console.error(`[CnftService] Failed to fetch individual proof for ${assetId}:`, individualError.message);
          errors.push({ assetId, error: individualError.message });
        }
      }
      
      // Merge cached, batch, and fallback results
      for (const [assetId, proof] of cachedProofs) {
        results.set(assetId, proof);
      }
      for (const [assetId, proof] of fallbackResults) {
        results.set(assetId, proof);
      }
      
      if (errors.length > 0) {
        console.warn(`[CnftService] ${errors.length} proof fetch failures after fallback:`, errors);
      }
      
      return results;
    }
  }

  /**
   * @deprecated Use getAssetProofBatch instead for better performance
   * Legacy method that fetches proofs individually in parallel
   */
  async batchGetCnftProofs(assetIds: string[], batchSize = 3): Promise<Map<string, DasProofResponse>> {
    console.log(`[CnftService] Batch fetching ${assetIds.length} proofs (batch size: ${batchSize}) - DEPRECATED: Use getAssetProofBatch`);
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
          const proof = await this.getCnftProof(assetId, true, 0); // Skip cache - already checked
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
   * 
   * IMPROVEMENTS BASED ON RESEARCH:
   * - Very short cache TTL (5 seconds) for high-activity trees to ensure freshness
   * - Just-in-time fetching (skip cache on first attempt for critical operations)
   * - Unique request IDs to prevent DAS API caching
   * - Better logging for debugging stale proof issues
   * 
   * @param assetId - The cNFT asset ID
   * @param skipCache - Whether to bypass the cache (CRITICAL: always true for first attempt in transaction building)
   * @param retryCount - Number of retries (used for cache-busting on stale proof retries)
   */
  async getCnftProof(assetId: string, skipCache = false, retryCount = 0): Promise<DasProofResponse> {
    console.log('[CnftService] Fetching Merkle proof for:', assetId, {
      skipCache,
      retryCount,
      cacheSize: CnftService.proofCache.size,
    });
    
    // Check cache first (unless skip requested)
    // CRITICAL: For high-activity trees, cache TTL is very short (5 seconds)
    // Research shows proofs can become stale in seconds on high-activity trees
    if (!skipCache) {
      const cached = this.getCachedProof(assetId);
      if (cached) {
        const cacheEntry = CnftService.proofCache.get(assetId);
        const age = cacheEntry ? Date.now() - cacheEntry.fetchedAt : 0;
        console.log('[CnftService] Using cached proof for:', assetId.substring(0, 12) + '...', {
          ageMs: age,
          cacheAge: `${(age / 1000).toFixed(1)}s`,
        });
        this.metrics.proofCacheHits++;
        return cached;
      }
      this.metrics.proofCacheMisses++;
    }
    
      const startTime = Date.now();
      this.metrics.totalProofFetches++;
      this.metrics.individualProofFetches++;
      
      try {
      // Use rate limiting for the actual fetch
      // Pass retryCount to makeDasRequest for cache-busting on stale proof retries
      // Capture retryCount in closure for use inside withRateLimit callback
      const capturedRetryCount = retryCount;
      const proofData = await this.withRateLimit(async () => {
        const response = await this.makeDasRequest('getAssetProof', {
          id: assetId,
        }, capturedRetryCount);
        
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
        root: proofData.root ? proofData.root.substring(0, 16) + '...' : 'N/A',
      });
      
      // Cache the result with configurable TTL (default 5s for high-activity trees)
      // Research shows: proofs can become stale in seconds on high-activity trees
      // Config defaults to 5s, but can be overridden via CnftServiceConfig
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
    return this.getCnftProof(assetId, true, 0);
  }
  
  /**
   * Clear cached proof for a specific asset
   * Use this when you detect a stale proof and need to force a fresh fetch
   */
  clearCachedProof(assetId: string): void {
    CnftService.proofCache.delete(assetId);
    console.log(`[CnftService] Cleared cached proof for: ${assetId.substring(0, 12)}...`);
  }

  /**
   * Clear all cached proofs
   * Use this when rebuilding transactions after a stale proof error
   * to ensure all proofs are fetched fresh
   */
  clearAllCachedProofs(): void {
    const count = CnftService.proofCache.size;
    CnftService.proofCache.clear();
    console.log(`[CnftService] Cleared all ${count} cached proofs`);
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
   * @param retryCount - Number of retries (used for cache-busting on stale proof retries)
   */
  async buildTransferParams(
    assetId: string,
    fromAddress: PublicKey,
    toAddress: PublicKey,
    skipCache = false,
    retryCount = 0
  ): Promise<CnftTransferParams> {
    console.log('[CnftService] Building cNFT transfer params:', {
      assetId,
      from: fromAddress.toBase58(),
      to: toAddress.toBase58(),
      skipCache,
    });

    // Fetch asset data and proof in parallel
    // Pass retryCount to getCnftProof for cache-busting on stale proof retries
    const [assetData, proofData] = await Promise.all([
      this.getCnftAsset(assetId),
      this.getCnftProof(assetId, skipCache, retryCount),
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
   * Made public to support pre-fetched batch proofs for JITO bundles
   */
  async convertDasProofToCnftProofAsync(
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
    // The canopy stores the uppermost levels (closest to root) on-chain
    // We need to remove the LAST `canopyDepth` nodes (closest to root)
    // and keep the FIRST (maxDepth - canopyDepth) nodes (closest to leaf)
    // 
    // IMPORTANT: Handle edge case where canopyDepth >= proof.length (full canopy)
    // In this case, all proof nodes are stored on-chain, so we send an empty array
    // This prevents negative slice indices which would incorrectly return nodes
    let proof: number[][];
    
    if (canopyDepth >= dasProof.proof.length) {
      // Full canopy tree - all proof nodes are on-chain
      console.log(`[CnftService] Full canopy detected (canopyDepth ${canopyDepth} >= proof length ${dasProof.proof.length}) - sending empty proof array`);
      proof = [];
    } else {
      // Partial canopy - send only the nodes not in the canopy
      // Correct operation: .slice(0, proof.length - canopyDepth)
      const proofNodesToSend = dasProof.proof.slice(0, dasProof.proof.length - canopyDepth);
      proof = proofNodesToSend.map(node => Array.from(bs58.decode(node)));
    }
    
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
   * Make DAS API request with retry logic
   * @param useBatchConnection - If true, use batch connection (Helius) for better batch performance
   */
  private async makeDasRequest(
    method: string,
    params: Record<string, any>,
    retryCount = 0,
    useBatchConnection = false
  ): Promise<any> {
    // Use batch connection for batch operations if available
    const endpoint = useBatchConnection && this.batchConnection 
      ? this.batchConnection.rpcEndpoint 
      : this.config.rpcEndpoint;
    
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      // Distributed DAS rate limiter to protect against strict provider RPS caps (e.g. QuickNode -32007).
      await DasHttpRateLimiter.waitForSlot(endpoint);

      // Start request timeout AFTER the rate limiter wait so queuing doesn't eat into the HTTP timeout.
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeout);

      // CRITICAL: Use unique request IDs to prevent DAS API caching
      // Full cache-control headers break QuickNode's getAssetProof endpoint
      // but unique IDs should prevent caching without causing errors
      // Cache-busting is handled via unique JSON-RPC request IDs, not params
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          // Unique ID: timestamp + random + retry count to ensure uniqueness and prevent caching
          id: `${Date.now()}-${Math.random().toString(36).substring(7)}-${retryCount}`,
          method,
          params: params, // Don't add _timestamp - DAS API doesn't accept it
        }),
        signal: controller.signal,
      });
      
      if (timeoutId) clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[CnftService] DAS API HTTP error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });

        // Respect Retry-After if present (some providers set this on 429)
        const retryAfterHeader = response.headers.get('retry-after');
        if (retryAfterHeader) {
          const seconds = parseFloat(retryAfterHeader);
          if (Number.isFinite(seconds) && seconds > 0) {
            await new Promise(resolve => setTimeout(resolve, Math.min(30000, Math.round(seconds * 1000))));
          }
        }
        // If primary DAS RPC is rate-limited and we have a separate batch RPC (e.g., Helius),
        // retry the same request once against the batch RPC to improve first-try success.
        const isRateLimited =
          response.status === 429 ||
          errorText.includes('"code":-32007') ||
          errorText.toLowerCase().includes('request limit reached');
        const hasAlt = !!this.batchConnection && this.batchConnection.rpcEndpoint !== this.config.rpcEndpoint;
        if (!useBatchConnection && hasAlt && isRateLimited && method !== 'getAssetProofBatch') {
          console.warn('[CnftService] Primary DAS RPC rate-limited; retrying request against batch RPC:', {
            method,
            primary: this.config.rpcEndpoint,
            batch: this.batchConnection!.rpcEndpoint,
          });
          return this.makeDasRequest(method, params, retryCount, true);
        }

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
        const err = new Error(`DAS API error: ${data.error.message || JSON.stringify(data.error)}`);
        // Preserve RPC code for smarter retry handling
        (err as any).rpcCode = data.error.code;
        (err as any).rpcError = data.error;
        throw err;
      }
      
      return data;
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);

      // Do not retry unsupported methods (e.g. getAssetProofBatch on providers without DAS batch).
      // This prevents burning ~7s on repeated -32601 retries.
      if (method === 'getAssetProofBatch' || method === 'getAssetProofs') {
        const rpcCode = (error as any)?.rpcCode;
        if (rpcCode === -32601 || String(error.message || '').toLowerCase().includes('method not found')) {
          if (method === 'getAssetProofBatch') this.batchProofSupported = false;
          if (method === 'getAssetProofs') this.assetProofsSupported = false;
          throw error;
        }
      }
      
      // Retry on network errors or timeouts
      if (retryCount < this.config.maxRetries) {
        console.warn(
          `[CnftService] DAS request failed (attempt ${retryCount + 1}/${this.config.maxRetries}):`,
          error.message
        );

        // Check if this is a rate limit error (429 or QuickNode -32007)
        const isRateLimitError = error.message?.includes('429') ||
          error.message?.includes('-32007') ||
          error.message?.toLowerCase().includes('request limit');

        // Use longer backoff for rate limit errors
        // QuickNode free tier has 2 req/sec limit, so we need substantial delays
        let delay: number;
        if (isRateLimitError) {
          // Rate limit: use much longer delays (3s, 6s, 12s, 24s...)
          delay = Math.min(3000 * Math.pow(2, retryCount), 30000);
          console.warn(`[CnftService] Rate limit detected, using extended delay: ${delay}ms`);
        } else {
          // Standard exponential backoff (1s, 2s, 4s, 8s...)
          delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        }
        await new Promise(resolve => setTimeout(resolve, delay));

        return this.makeDasRequest(method, params, retryCount + 1, useBatchConnection);
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
 * Automatically configures batch RPC from config if available
 */
export function createCnftService(
  connection: Connection,
  config?: Partial<CnftServiceConfig>
): CnftService {
  // Import config to get batch RPC URL if not provided
  if (!config?.batchRpcEndpoint) {
    const { config: appConfig } = require('../config');
    if (appConfig?.solana?.rpcUrlBatch && appConfig.solana.rpcUrlBatch !== connection.rpcEndpoint) {
      config = {
        ...config,
        batchRpcEndpoint: appConfig.solana.rpcUrlBatch,
      };
      console.log('[CnftService] Using batch RPC from config:', appConfig.solana.rpcUrlBatch.substring(0, 30) + '...');
    }
  }
  
  return new CnftService(connection, config);
}

