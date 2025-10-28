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
 * Priority fee levels returned by QuickNode API
 */
interface PriorityFeeEstimate {
  min: number; // Minimum fee (slowest)
  low: number; // Low priority
  medium: number; // Medium priority (recommended)
  high: number; // High priority
  veryHigh: number; // Very high priority
  unsafeMax: number; // Maximum observed (not recommended)
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
   * @returns Priority fee in microlamports
   */
  static async getRecommendedPriorityFee(
    connection: Connection,
    isMainnet: boolean
  ): Promise<number> {
    const cacheKey = `${connection.rpcEndpoint}-${isMainnet}`;

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
      const fee = await this.fetchPriorityFee(connection, isMainnet);

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
   * @returns Recommended priority fee in microlamports
   */
  private static async fetchPriorityFee(
    connection: Connection,
    isMainnet: boolean
  ): Promise<number> {
    try {
      // Call QuickNode's priority fee estimation API
      // This uses the standard Solana RPC but with QuickNode's extension
      const response = await (connection as any)._rpcRequest('qn_estimatePriorityFees', [
        {
          // No parameters needed - API analyzes recent transactions
        },
      ]);

      if (!response || !response.result) {
        throw new Error('Invalid response from qn_estimatePriorityFees');
      }

      const estimates = response.result as PriorityFeeEstimate;

      console.log('[PriorityFeeService] Priority fee estimates from QuickNode:', {
        min: estimates.min,
        low: estimates.low,
        medium: estimates.medium,
        high: estimates.high,
        veryHigh: estimates.veryHigh,
        unsafeMax: estimates.unsafeMax,
      });

      // Use 'high' priority for mainnet (fast confirmation)
      // Use 'medium' priority for devnet (cost-effective)
      const recommendedFee = isMainnet ? estimates.high : estimates.medium;

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
