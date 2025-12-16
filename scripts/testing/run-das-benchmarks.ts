/**
 * DAS API Performance Benchmark Runner
 * 
 * Runs performance benchmarks across multiple DAS API providers.
 * 
 * Usage:
 *   ts-node scripts/testing/run-das-benchmarks.ts
 * 
 * Environment Variables:
 *   - CURRENT_RPC_ENDPOINT: Current RPC endpoint (baseline)
 *   - HELIUS_API_KEY: Helius API key (optional)
 *   - QUICKNODE_ENDPOINT: QuickNode endpoint (optional)
 *   - TRITON_ENDPOINT: Triton One endpoint (optional)
 * 
 * Output:
 *   - Console: Formatted results
 *   - File: temp/das-benchmark-results.json
 */

import * as dotenv from 'dotenv';
import { DASPerformanceTester, DasBenchmarkConfig, DasProviderConfig } from '../../test/utils/dasPerformanceTester';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config();

// Load test asset IDs from fixtures or use defaults
function getTestAssetIds(): string[] {
  try {
    const fixturesPath = path.join(__dirname, '../../tests/fixtures/production-test-assets.json');
    if (fs.existsSync(fixturesPath)) {
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      const cnftAssets = fixtures.cnfts || [];
      if (cnftAssets.length >= 100) {
        return cnftAssets.slice(0, 100).map((asset: any) => asset.identifier || asset.id);
      }
    }
  } catch (error) {
    console.warn('Could not load test assets from fixtures, using defaults');
  }

  // Default test asset IDs (replace with real cNFT IDs for actual benchmarking)
  return [
    '9og28y6XXTzgMD2C1PuGkvZQxFTsn5WUnqdAhaoqTeuy', // Example cNFT ID
    // Add more test asset IDs here
  ];
}

async function main() {
  console.log('🚀 DAS API Performance Benchmark Runner\n');

  // Get current RPC endpoint from environment or config
  const currentRpcEndpoint = process.env.CURRENT_RPC_ENDPOINT || 
                            process.env.SOLANA_RPC_URL || 
                            process.env.MAINNET_RPC_URL;

  if (!currentRpcEndpoint) {
    console.error('❌ Error: CURRENT_RPC_ENDPOINT or SOLANA_RPC_URL must be set');
    process.exit(1);
  }

  // Build provider list
  const providers: DasProviderConfig[] = [
    {
      name: 'Current RPC',
      endpoint: currentRpcEndpoint,
      priority: 1,
      weight: 1,
    },
  ];

  // Add Helius if API key is available
  if (process.env.HELIUS_API_KEY) {
    providers.push({
      name: 'Helius',
      endpoint: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
      apiKey: process.env.HELIUS_API_KEY,
      priority: 2,
      weight: 1,
    });
  }

  // Add QuickNode if endpoint is available
  if (process.env.QUICKNODE_ENDPOINT) {
    providers.push({
      name: 'QuickNode',
      endpoint: process.env.QUICKNODE_ENDPOINT,
      priority: 3,
      weight: 1,
    });
  }

  // Add Triton One if endpoint is available
  if (process.env.TRITON_ENDPOINT) {
    providers.push({
      name: 'Triton One',
      endpoint: process.env.TRITON_ENDPOINT,
      priority: 4,
      weight: 1,
    });
  }

  if (providers.length === 1) {
    console.warn('⚠️  Warning: Only current RPC provider configured.');
    console.warn('   Set HELIUS_API_KEY, QUICKNODE_ENDPOINT, or TRITON_ENDPOINT to benchmark additional providers.\n');
  }

  // Get test asset IDs
  const testAssetIds = getTestAssetIds();
  if (testAssetIds.length < 100) {
    console.warn(`⚠️  Warning: Only ${testAssetIds.length} test asset IDs available.`);
    console.warn('   Batch tests (50, 100 assets) may not run correctly.\n');
  }

  // Configure benchmark
  const config: DasBenchmarkConfig = {
    providers,
    testAssetIds,
    iterations: 10, // Reduced for faster testing (increase to 30+ for production)
    metrics: 'all',
  };

  // Run benchmarks
  const tester = new DASPerformanceTester(config);
  const summaries = await tester.runBenchmarks();

  // Print results
  tester.printResults(summaries);

  // Export results (pass summaries to avoid re-running benchmarks)
  const outputDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, 'das-benchmark-results.json');
  await tester.exportResults(summaries, outputPath);

  // Print recommendations
  console.log('\n📋 RECOMMENDATIONS');
  console.log('='.repeat(80));
  
  if (summaries.length > 1) {
    const baseline = summaries[0];
    for (let i = 1; i < summaries.length; i++) {
      const comparison = summaries[i];
      if (comparison.improvementPercent && comparison.improvementPercent > 20) {
        console.log(`\n✅ ${comparison.provider}: ${comparison.improvementPercent.toFixed(2)}% improvement`);
        console.log(`   Recommendation: SWITCH to ${comparison.provider}`);
      } else if (comparison.improvementPercent && comparison.improvementPercent > 10) {
        console.log(`\n⚠️  ${comparison.provider}: ${comparison.improvementPercent.toFixed(2)}% improvement`);
        console.log(`   Recommendation: Consider MULTI-PROVIDER POOLING`);
      } else {
        console.log(`\n❌ ${comparison.provider}: ${comparison.improvementPercent?.toFixed(2) || '0'}% improvement`);
        console.log(`   Recommendation: KEEP current RPC provider`);
      }
    }
  } else {
    console.log('\n⚠️  Only one provider tested. Add additional providers to compare performance.');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Benchmark complete! Results saved to:', outputPath);
}

main().catch((error) => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});

