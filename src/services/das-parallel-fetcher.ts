/**
 * Parallel DAS Fetcher
 *
 * Races multiple DAS providers (Helius, QuickNode) in parallel for:
 * - Faster response times (use whichever responds first)
 * - Improved reliability (fallback if one fails)
 * - Performance comparison logging
 */

import { DasHttpRateLimiter } from './das-http-rate-limiter';

export interface DasProvider {
  name: string;
  endpoint: string;
  enabled: boolean;
  /** Rate limit interval in ms (provider-specific) */
  rateLimitIntervalMs?: number;
}

export interface DasRaceResult<T> {
  data: T;
  provider: string;
  timeMs: number;
  /** Results from all providers for comparison logging */
  allResults?: Array<{
    provider: string;
    timeMs: number;
    success: boolean;
    error?: string;
  }>;
}

interface DasProviderMetrics {
  totalCalls: number;
  successCount: number;
  failCount: number;
  wins: number; // Times this provider was fastest
  avgTimeMs: number;
  lastTimes: number[];
}

/**
 * Parallel DAS Fetcher that races multiple providers
 */
export class DasParallelFetcher {
  private providers: DasProvider[] = [];
  private metrics: Map<string, DasProviderMetrics> = new Map();
  private requestTimeout: number;

  constructor(config?: { requestTimeout?: number }) {
    this.requestTimeout = config?.requestTimeout ?? 30000;

    // Initialize providers from environment
    // Use specific provider URLs if available, otherwise fall back to SOLANA_RPC_URL
    const heliusUrl = process.env.HELIUS_RPC_URL;
    const quicknodeUrl = process.env.QUICKNODE_RPC_URL;
    const defaultUrl = process.env.SOLANA_RPC_URL;

    // Provider-specific rate limits (Helius is generally faster/higher limits)
    // QUICKNODE_DAS_RATE_LIMIT_INTERVAL_MS defaults to 120ms (~8.3 TPS) for QuickNode DAS add-on
    const quicknodeRateLimit = parseInt(process.env.QUICKNODE_DAS_RATE_LIMIT_INTERVAL_MS || '120', 10);
    const heliusRateLimit = parseInt(process.env.HELIUS_DAS_RATE_LIMIT_INTERVAL_MS || '20', 10); // Helius has higher limits

    if (heliusUrl) {
      this.providers.push({
        name: 'Helius',
        endpoint: heliusUrl,
        enabled: true,
        rateLimitIntervalMs: heliusRateLimit,
      });
      this.initMetrics('Helius');
    }

    if (quicknodeUrl) {
      this.providers.push({
        name: 'QuickNode',
        endpoint: quicknodeUrl,
        enabled: true,
        rateLimitIntervalMs: quicknodeRateLimit,
      });
      this.initMetrics('QuickNode');
    }

    // Fallback to default RPC if no specific providers configured
    // Note: SOLANA_RPC_URL might be the same as one of the above, so check for duplicates
    if (this.providers.length === 0 && defaultUrl) {
      this.providers.push({ name: 'Default', endpoint: defaultUrl, enabled: true });
      this.initMetrics('Default');
    } else if (defaultUrl && !this.providers.some(p => p.endpoint === defaultUrl)) {
      // Add default as additional provider if it's different
      this.providers.push({ name: 'Default', endpoint: defaultUrl, enabled: true });
      this.initMetrics('Default');
    }

    console.log('[DasParallelFetcher] Initialized with providers:',
      this.providers.map(p => `${p.name} (${p.endpoint.substring(0, 50)}...)`));
  }

  private initMetrics(provider: string): void {
    this.metrics.set(provider, {
      totalCalls: 0,
      successCount: 0,
      failCount: 0,
      wins: 0,
      avgTimeMs: 0,
      lastTimes: [],
    });
  }

  private updateMetrics(provider: string, timeMs: number, success: boolean, isWinner: boolean): void {
    const m = this.metrics.get(provider);
    if (!m) return;

    m.totalCalls++;
    if (success) {
      m.successCount++;
      m.lastTimes.push(timeMs);
      if (m.lastTimes.length > 100) m.lastTimes.shift();
      m.avgTimeMs = m.lastTimes.reduce((a, b) => a + b, 0) / m.lastTimes.length;
    } else {
      m.failCount++;
    }
    if (isWinner) m.wins++;
  }

  /**
   * Get current metrics for all providers
   */
  getMetrics(): Record<string, DasProviderMetrics> {
    const result: Record<string, DasProviderMetrics> = {};
    for (const [name, metrics] of this.metrics) {
      result[name] = { ...metrics };
    }
    return result;
  }

  /**
   * Log a comparison summary
   */
  logComparison(): void {
    console.log('[DasParallelFetcher] Provider Comparison:');
    for (const [name, m] of this.metrics) {
      const winRate = m.totalCalls > 0 ? ((m.wins / m.totalCalls) * 100).toFixed(1) : '0';
      const successRate = m.totalCalls > 0 ? ((m.successCount / m.totalCalls) * 100).toFixed(1) : '0';
      console.log(`  ${name}: avg=${m.avgTimeMs.toFixed(0)}ms, wins=${m.wins} (${winRate}%), success=${successRate}%, calls=${m.totalCalls}`);
    }
  }

  /**
   * Make a DAS request to a single provider
   */
  private async makeRequest(
    provider: DasProvider,
    method: string,
    params: Record<string, any>
  ): Promise<{ data: any; timeMs: number }> {
    const startTime = Date.now();

    // Rate limit per provider endpoint (use provider-specific interval if set)
    await DasHttpRateLimiter.waitForSlot(provider.endpoint, provider.rateLimitIntervalMs);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
          method,
          params,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data: any = await response.json();

      if (data?.error) {
        throw new Error(`DAS error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      return { data, timeMs: Date.now() - startTime };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Race multiple providers, return first successful result
   */
  async race<T>(
    method: string,
    params: Record<string, any>,
    options?: { logComparison?: boolean }
  ): Promise<DasRaceResult<T>> {
    const enabledProviders = this.providers.filter(p => p.enabled);

    if (enabledProviders.length === 0) {
      throw new Error('No DAS providers configured');
    }

    // If only one provider, just use it directly
    if (enabledProviders.length === 1) {
      const provider = enabledProviders[0];
      const startTime = Date.now();
      try {
        const result = await this.makeRequest(provider, method, params);
        this.updateMetrics(provider.name, result.timeMs, true, true);
        return {
          data: result.data.result || result.data,
          provider: provider.name,
          timeMs: result.timeMs,
        };
      } catch (error) {
        this.updateMetrics(provider.name, Date.now() - startTime, false, false);
        throw error;
      }
    }

    // Race all providers
    const startTime = Date.now();
    const allResults: Array<{
      provider: string;
      timeMs: number;
      success: boolean;
      error?: string;
      data?: any;
    }> = [];

    // Create promises for all providers
    const promises = enabledProviders.map(async (provider) => {
      const providerStart = Date.now();
      try {
        const result = await this.makeRequest(provider, method, params);
        return {
          provider: provider.name,
          timeMs: result.timeMs,
          success: true,
          data: result.data.result || result.data,
        };
      } catch (error: any) {
        return {
          provider: provider.name,
          timeMs: Date.now() - providerStart,
          success: false,
          error: error.message,
        };
      }
    });

    // Wait for all to complete (we want comparison data)
    const results = await Promise.all(promises);
    allResults.push(...results);

    // Find the first successful result (by completion time)
    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
      // All failed
      for (const r of results) {
        this.updateMetrics(r.provider, r.timeMs, false, false);
      }
      throw new Error(`All DAS providers failed: ${results.map(r => `${r.provider}: ${r.error}`).join(', ')}`);
    }

    // Sort by time to find winner
    successfulResults.sort((a, b) => a.timeMs - b.timeMs);
    const winner = successfulResults[0];

    // Update metrics for all providers
    for (const r of results) {
      this.updateMetrics(r.provider, r.timeMs, r.success, r.provider === winner.provider);
    }

    // Log comparison if requested
    if (options?.logComparison) {
      const comparison = results.map(r =>
        `${r.provider}: ${r.timeMs}ms ${r.success ? '✓' : '✗'}`
      ).join(', ');
      console.log(`[DasParallelFetcher] ${method}: ${comparison} → Winner: ${winner.provider}`);
    }

    return {
      data: winner.data,
      provider: winner.provider,
      timeMs: winner.timeMs,
      allResults: allResults.map(r => ({
        provider: r.provider,
        timeMs: r.timeMs,
        success: r.success,
        error: r.error,
      })),
    };
  }

  /**
   * Convenience method for getAsset
   */
  async getAsset(assetId: string, logComparison = false): Promise<DasRaceResult<any>> {
    return this.race('getAsset', { id: assetId }, { logComparison });
  }

  /**
   * Convenience method for getAssetProof
   */
  async getAssetProof(assetId: string, logComparison = false): Promise<DasRaceResult<any>> {
    return this.race('getAssetProof', { id: assetId }, { logComparison });
  }

  /**
   * Check if parallel fetching is available (multiple providers configured)
   */
  isParallelAvailable(): boolean {
    return this.providers.filter(p => p.enabled).length > 1;
  }

  /**
   * Get list of configured providers
   */
  getProviders(): DasProvider[] {
    return [...this.providers];
  }
}

// Singleton instance
let parallelFetcherInstance: DasParallelFetcher | null = null;

/**
 * Get or create the singleton DasParallelFetcher instance
 */
export function getDasParallelFetcher(): DasParallelFetcher {
  if (!parallelFetcherInstance) {
    parallelFetcherInstance = new DasParallelFetcher();
  }
  return parallelFetcherInstance;
}
