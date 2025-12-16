/**
 * DAS API Performance Benchmarking Suite
 * 
 * Benchmarks DAS API performance across multiple providers to determine
 * if multi-provider pooling would provide >20% performance improvement.
 * 
 * Usage:
 *   const tester = new DASPerformanceTester(config);
 *   const results = await tester.runBenchmarks();
 */

import { Connection } from '@solana/web3.js';

export interface DasProviderConfig {
  name: string;
  endpoint: string;
  apiKey?: string;
  priority?: number; // Lower = higher priority
  weight?: number; // For weighted round-robin
}

export interface DasBenchmarkConfig {
  providers: DasProviderConfig[];
  testAssetIds: string[];
  iterations: number;
  metrics: 'latency' | 'throughput' | 'successRate' | 'all';
}

export interface BenchmarkResult {
  provider: string;
  method: string;
  assetCount: number;
  iterations: number;
  metrics: {
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    avgLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    throughputReqPerSec: number;
    successRate: number;
    errorRate: number;
    rateLimitHits: number;
  };
  rawLatencies: number[];
  errors: Array<{ error: string; count: number }>;
}

export interface BenchmarkSummary {
  provider: string;
  overallAvgLatencyMs: number;
  overallP95LatencyMs: number;
  overallSuccessRate: number;
  overallThroughput: number;
  methodResults: BenchmarkResult[];
  recommendation: 'keep' | 'switch' | 'pool';
  improvementPercent?: number;
}

export class DASPerformanceTester {
  private config: DasBenchmarkConfig;
  private results: BenchmarkResult[] = [];

  constructor(config: DasBenchmarkConfig) {
    this.config = config;
  }

  /**
   * Run complete benchmark suite across all providers
   */
  async runBenchmarks(): Promise<BenchmarkSummary[]> {
    console.log('🚀 Starting DAS API Performance Benchmarks');
    console.log(`Providers: ${this.config.providers.length}`);
    console.log(`Test Assets: ${this.config.testAssetIds.length}`);
    console.log(`Iterations: ${this.config.iterations}\n`);

    const summaries: BenchmarkSummary[] = [];

    for (const provider of this.config.providers) {
      console.log(`\n📊 Benchmarking ${provider.name}...`);
      const providerResults: BenchmarkResult[] = [];

      // Test 1: Single getAsset
      const getAssetResult = await this.benchmarkGetAsset(provider);
      providerResults.push(getAssetResult);

      // Test 2: Single getAssetProof
      const getAssetProofResult = await this.benchmarkGetAssetProof(provider);
      providerResults.push(getAssetProofResult);

      // Test 3: getAssetProofBatch (10 assets)
      const batch10Result = await this.benchmarkGetAssetProofBatch(provider, 10);
      providerResults.push(batch10Result);

      // Test 4: getAssetProofBatch (50 assets)
      const batch50Result = await this.benchmarkGetAssetProofBatch(provider, 50);
      providerResults.push(batch50Result);

      // Test 5: getAssetProofBatch (100 assets)
      const batch100Result = await this.benchmarkGetAssetProofBatch(provider, 100);
      providerResults.push(batch100Result);

      // Calculate summary
      const summary = this.calculateSummary(provider.name, providerResults);
      summaries.push(summary);

      this.results.push(...providerResults);
    }

    // Compare against baseline (first provider)
    if (summaries.length > 1) {
      const baseline = summaries[0];
      for (let i = 1; i < summaries.length; i++) {
        const comparison = summaries[i];
        const improvement = ((baseline.overallAvgLatencyMs - comparison.overallAvgLatencyMs) / baseline.overallAvgLatencyMs) * 100;
        comparison.improvementPercent = improvement;
        
        if (improvement > 20) {
          comparison.recommendation = 'switch';
        } else if (improvement > 10) {
          comparison.recommendation = 'pool';
        } else {
          comparison.recommendation = 'keep';
        }
      }
    }

    return summaries;
  }

  /**
   * Benchmark single getAsset call
   */
  private async benchmarkGetAsset(provider: DasProviderConfig): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    const errors: Map<string, number> = new Map();
    const assetId = this.config.testAssetIds[0];

    for (let i = 0; i < this.config.iterations; i++) {
      const startTime = Date.now();
      try {
        const response = await fetch(provider.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `benchmark-${i}`,
            method: 'getAsset',
            params: { id: assetId },
          }),
        });

        const data = await response.json();
        const latency = Date.now() - startTime;

        if (data.error) {
          const errorMsg = data.error.message || 'Unknown error';
          errors.set(errorMsg, (errors.get(errorMsg) || 0) + 1);
        } else {
          latencies.push(latency);
        }
      } catch (error: any) {
        const errorMsg = error.message || 'Network error';
        errors.set(errorMsg, (errors.get(errorMsg) || 0) + 1);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return this.calculateMetrics(provider.name, 'getAsset', 1, latencies, errors);
  }

  /**
   * Benchmark single getAssetProof call
   */
  private async benchmarkGetAssetProof(provider: DasProviderConfig): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    const errors: Map<string, number> = new Map();
    const assetId = this.config.testAssetIds[0];

    for (let i = 0; i < this.config.iterations; i++) {
      const startTime = Date.now();
      try {
        const response = await fetch(provider.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `benchmark-${i}`,
            method: 'getAssetProof',
            params: { id: assetId },
          }),
        });

        const data = await response.json();
        const latency = Date.now() - startTime;

        if (data.error) {
          const errorMsg = data.error.message || 'Unknown error';
          errors.set(errorMsg, (errors.get(errorMsg) || 0) + 1);
        } else {
          latencies.push(latency);
        }
      } catch (error: any) {
        const errorMsg = error.message || 'Network error';
        errors.set(errorMsg, (errors.get(errorMsg) || 0) + 1);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return this.calculateMetrics(provider.name, 'getAssetProof', 1, latencies, errors);
  }

  /**
   * Benchmark getAssetProofBatch with specified asset count
   */
  private async benchmarkGetAssetProofBatch(
    provider: DasProviderConfig,
    assetCount: number
  ): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    const errors: Map<string, number> = new Map();
    const assetIds = this.config.testAssetIds.slice(0, assetCount);

    for (let i = 0; i < this.config.iterations; i++) {
      const startTime = Date.now();
      try {
        const response = await fetch(provider.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `benchmark-${i}`,
            method: 'getAssetProofBatch',
            params: { ids: assetIds },
          }),
        });

        const data = await response.json();
        const latency = Date.now() - startTime;

        if (data.error) {
          const errorMsg = data.error.message || 'Unknown error';
          errors.set(errorMsg, (errors.get(errorMsg) || 0) + 1);
        } else {
          latencies.push(latency);
        }
      } catch (error: any) {
        const errorMsg = error.message || 'Network error';
        errors.set(errorMsg, (errors.get(errorMsg) || 0) + 1);
      }

      // Longer delay for batch operations
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return this.calculateMetrics(provider.name, 'getAssetProofBatch', assetCount, latencies, errors);
  }

  /**
   * Calculate performance metrics from raw latencies
   */
  private calculateMetrics(
    provider: string,
    method: string,
    assetCount: number,
    latencies: number[],
    errors: Map<string, number>
  ): BenchmarkResult {
    if (latencies.length === 0) {
      return {
        provider,
        method,
        assetCount,
        iterations: this.config.iterations,
        metrics: {
          p50LatencyMs: 0,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
          avgLatencyMs: 0,
          minLatencyMs: 0,
          maxLatencyMs: 0,
          throughputReqPerSec: 0,
          successRate: 0,
          errorRate: 1,
          rateLimitHits: 0,
        },
        rawLatencies: [],
        errors: Array.from(errors.entries()).map(([error, count]) => ({ error, count })),
      };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const total = latencies.reduce((a, b) => a + b, 0);
    const successCount = latencies.length;
    const totalCount = this.config.iterations;
    const errorCount = totalCount - successCount;

    return {
      provider,
      method,
      assetCount,
      iterations: this.config.iterations,
      metrics: {
        p50LatencyMs: sorted[Math.floor(sorted.length * 0.5)],
        p95LatencyMs: sorted[Math.floor(sorted.length * 0.95)],
        p99LatencyMs: sorted[Math.floor(sorted.length * 0.99)],
        avgLatencyMs: total / latencies.length,
        minLatencyMs: Math.min(...latencies),
        maxLatencyMs: Math.max(...latencies),
        throughputReqPerSec: (1000 / (total / latencies.length)),
        successRate: successCount / totalCount,
        errorRate: errorCount / totalCount,
        rateLimitHits: Array.from(errors.entries())
          .filter(([error]) => error.includes('rate limit') || error.includes('429'))
          .reduce((sum, [, count]) => sum + count, 0),
      },
      rawLatencies: latencies,
      errors: Array.from(errors.entries()).map(([error, count]) => ({ error, count })),
    };
  }

  /**
   * Calculate summary statistics for a provider
   */
  private calculateSummary(provider: string, results: BenchmarkResult[]): BenchmarkSummary {
    const allLatencies = results.flatMap(r => r.rawLatencies);
    const sorted = allLatencies.sort((a, b) => a - b);
    const total = allLatencies.reduce((a, b) => a + b, 0);

    const totalSuccess = results.reduce((sum, r) => sum + (r.metrics.successRate * r.iterations), 0);
    const totalIterations = results.reduce((sum, r) => sum + r.iterations, 0);

    return {
      provider,
      overallAvgLatencyMs: total / allLatencies.length,
      overallP95LatencyMs: sorted[Math.floor(sorted.length * 0.95)],
      overallSuccessRate: totalSuccess / totalIterations,
      overallThroughput: (1000 / (total / allLatencies.length)),
      methodResults: results,
      recommendation: 'keep', // Will be updated in comparison
    };
  }

  /**
   * Export results to JSON file
   */
  async exportResults(filePath: string): Promise<void> {
    const fs = await import('fs/promises');
    const summaries = await this.runBenchmarks();
    
    const exportData = {
      timestamp: new Date().toISOString(),
      config: this.config,
      summaries,
      rawResults: this.results,
    };

    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
    console.log(`\n✅ Results exported to ${filePath}`);
  }

  /**
   * Print formatted benchmark results
   */
  printResults(summaries: BenchmarkSummary[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('DAS API PERFORMANCE BENCHMARK RESULTS');
    console.log('='.repeat(80) + '\n');

    for (const summary of summaries) {
      console.log(`\n📊 ${summary.provider.toUpperCase()}`);
      console.log('-'.repeat(80));
      console.log(`Overall Avg Latency: ${summary.overallAvgLatencyMs.toFixed(2)}ms`);
      console.log(`Overall P95 Latency: ${summary.overallP95LatencyMs.toFixed(2)}ms`);
      console.log(`Overall Success Rate: ${(summary.overallSuccessRate * 100).toFixed(2)}%`);
      console.log(`Overall Throughput: ${summary.overallThroughput.toFixed(2)} req/s`);

      if (summary.improvementPercent !== undefined) {
        const sign = summary.improvementPercent > 0 ? '+' : '';
        console.log(`Improvement vs Baseline: ${sign}${summary.improvementPercent.toFixed(2)}%`);
        console.log(`Recommendation: ${summary.recommendation.toUpperCase()}`);
      }

      console.log('\nMethod Breakdown:');
      for (const result of summary.methodResults) {
        console.log(`  ${result.method} (${result.assetCount} asset${result.assetCount > 1 ? 's' : ''}):`);
        console.log(`    P50: ${result.metrics.p50LatencyMs.toFixed(2)}ms`);
        console.log(`    P95: ${result.metrics.p95LatencyMs.toFixed(2)}ms`);
        console.log(`    Success: ${(result.metrics.successRate * 100).toFixed(2)}%`);
      }
    }

    console.log('\n' + '='.repeat(80));
  }
}

