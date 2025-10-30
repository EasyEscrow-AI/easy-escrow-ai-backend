/**
 * Priority Fee Service
 *
 * Fetches dynamic priority fees from QuickNode's Priority Fee API
 * with caching to reduce API calls and improve performance.
 *
 * QuickNode Priority Fee API:
 * - Method: qn_estimatePriorityFees
 * - Returns recommended priority fees based on recent network activity
 * - Helps optimize transaction costs while maintaining confirmation speed
 *
 * Features:
 * - 5-second cache TTL to reduce API calls
 * - Fallback to safe default values on API failure
 * - Environment-aware (devnet vs mainnet)
 * - Comprehensive error handling and logging
 */

import { Connection } from '@solana/web3.js';

/**
 * Priority fee levels returned by QuickNode API v2
 * Reference: https://www.quicknode.com/docs/solana/qn_estimatePriorityFees
 */
interface QuickNodePriorityFeeResponse {
  context: {
    slot: number;
  };
  per_compute_unit: {
    extreme: number;
    high: number;
    medium: number;
    low: number;
    percentiles: Record<string, number>;
  };
  per_transaction: {
    extreme: number;
    high: number;
    medium: number;
    low: number;
    percentiles: Record<string, number>;
  };
  recommended: number; // Recommended priority fee (most reliable)
}

/**
 * Cached priority fee data
 */
interface CachedPriorityFee {
  fee: number;
  timestamp: number;
}

/**
 * Priority Fee Service
 *
 * Fetches and caches dynamic priority fees from QuickNode
 */
export class PriorityFeeService {
  private static cache: Map<string, CachedPriorityFee> = new Map();
  private static readonly CACHE_TTL_MS = 5000; // 5 seconds

  // Fallback values if API fails
  private static readonly FALLBACK_DEVNET_FEE = 5_000; // 5k microlamports
  private static readonly FALLBACK_MAINNET_FEE = 50_000; // 50k microlamports

  /**
   * Get recommended priority fee (with caching)
   *
   * @param connection - Solana connection to fetch fees from
   * @param isMainnet - Whether this is mainnet (affects fallback values)
   * @param programId - Optional program ID for localized estimates (uses environment config if not provided)
   * @returns Priority fee in microlamports
   */
  static async getRecommendedPriorityFee(
    connection: Connection,
    isMainnet: boolean,
    programId?: string
  ): Promise<number> {
    const cacheKey = `${connection.rpcEndpoint}-${isMainnet}-${programId || 'default'}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      console.log(
        `[PriorityFeeService] Using cached fee: ${cached.fee} microlamports (age: ${
          Date.now() - cached.timestamp
        }ms)`
      );
      return cached.fee;
    }

    // Fetch fresh fee from API
    try {
      const fee = await this.fetchPriorityFee(connection, isMainnet, programId);

      // Cache the result
      this.cache.set(cacheKey, {
        fee,
        timestamp: Date.now(),
      });

      console.log(
        `[PriorityFeeService] Fetched fresh fee: ${fee} microlamports (cached for ${this.CACHE_TTL_MS}ms)`
      );
      return fee;
    } catch (error) {
      console.error('[PriorityFeeService] Failed to fetch priority fee, using fallback:', error);

      // Use fallback values on error
      const fallbackFee = isMainnet ? this.FALLBACK_MAINNET_FEE : this.FALLBACK_DEVNET_FEE;

      console.log(
        `[PriorityFeeService] Using fallback fee: ${fallbackFee} microlamports (${
          isMainnet ? 'mainnet' : 'devnet'
        })`
      );
      return fallbackFee;
    }
  }

  /**
   * Fetch priority fee from QuickNode API
   *
   * @param connection - Solana connection
   * @param isMainnet - Whether this is mainnet
   * @param programId - Optional program ID for localized estimates (uses environment config if not provided)
   * @returns Recommended priority fee in microlamports
   */
  private static async fetchPriorityFee(
    connection: Connection,
    isMainnet: boolean,
    programId?: string
  ): Promise<number> {
    try {
      // Use provided program ID or get from environment config
      // This ensures priority fee estimates are based on our specific program's activity
      // Fallback to mainnet program ID only if not configured (should never happen in production)
      const targetProgramId = programId || process.env.ESCROW_PROGRAM_ID || '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';
      
      // Call QuickNode's priority fee estimation API
      // API expects 3 separate parameters: last_n_blocks (usize), account (string), api_version (int)
      // Reference: https://www.quicknode.com/docs/solana/qn_estimatePriorityFees
      const response = await (connection as any)._rpcRequest('qn_estimatePriorityFees', [
        100, // last_n_blocks (usize)
        targetProgramId, // account (string) - our escrow program for localized estimates
        2, // api_version (int)
      ]);

      if (!response || !response.result) {
        throw new Error('Invalid response from qn_estimatePriorityFees');
      }

      const result = response.result as QuickNodePriorityFeeResponse;

      console.log('[PriorityFeeService] Priority fee estimates from QuickNode:', {
        recommended: result.recommended,
        perComputeUnit: {
          extreme: result.per_compute_unit.extreme,
          high: result.per_compute_unit.high,
          medium: result.per_compute_unit.medium,
          low: result.per_compute_unit.low,
        },
        slot: result.context.slot,
      });

      // Use recommended fee if available, otherwise fallback to per_compute_unit
      // For mainnet: use 'high' priority for fast confirmation
      // For devnet: use 'medium' priority for cost-effectiveness
      const recommendedFee =
        result.recommended ||
        (isMainnet ? result.per_compute_unit.high : result.per_compute_unit.medium);

      // Sanity check: ensure fee is reasonable
      const MIN_SAFE_FEE = 1_000; // 1k microlamports
      const MAX_SAFE_FEE = 1_000_000; // 1M microlamports (very high but not insane)

      if (recommendedFee < MIN_SAFE_FEE || recommendedFee > MAX_SAFE_FEE) {
        console.warn(
          `[PriorityFeeService] Recommended fee ${recommendedFee} outside safe range [${MIN_SAFE_FEE}, ${MAX_SAFE_FEE}], using fallback`
        );
        return isMainnet ? this.FALLBACK_MAINNET_FEE : this.FALLBACK_DEVNET_FEE;
      }

      return recommendedFee;
    } catch (error) {
      console.error('[PriorityFeeService] Error calling qn_estimatePriorityFees:', error);
      throw error;
    }
  }

  /**
   * Clear the cache (useful for testing)
   */
  static clearCache(): void {
    this.cache.clear();
    console.log('[PriorityFeeService] Cache cleared');
  }

  /**
   * Get cache statistics (useful for monitoring)
   */
  static getCacheStats(): { size: number; entries: Array<{ key: string; age: number }> } {
    const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
      key,
      age: Date.now() - value.timestamp,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}
