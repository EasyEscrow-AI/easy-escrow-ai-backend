/**
 * Test RPC Connection Script
 * 
 * Verifies connectivity to Solana RPC endpoints and measures performance.
 * Tests both primary and fallback RPC URLs.
 * 
 * Usage:
 *   npx ts-node scripts/utilities/test-rpc-connection.ts
 *   npx ts-node scripts/utilities/test-rpc-connection.ts --url https://devnet.helius-rpc.com/?api-key=YOUR_KEY
 */

import { Connection } from '@solana/web3.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.staging' });

interface RpcTestResult {
  url: string;
  success: boolean;
  responseTime?: number;
  version?: string;
  error?: string;
  slotHeight?: number;
}

/**
 * Test RPC endpoint connectivity and performance
 */
async function testRpcEndpoint(url: string, timeout: number = 10000): Promise<RpcTestResult> {
  console.log(`\nTesting RPC endpoint: ${url}`);
  console.log('═'.repeat(80));

  try {
    const startTime = Date.now();
    const connection = new Connection(url, 'confirmed');

    // Test 1: Get version
    console.log('Test 1: Getting cluster version...');
    const versionPromise = connection.getVersion();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    );

    const version = await Promise.race([versionPromise, timeoutPromise]) as any;
    const responseTime = Date.now() - startTime;

    // Test 2: Get slot height
    console.log('Test 2: Getting current slot height...');
    const slot = await connection.getSlot();

    // Test 3: Get recent blockhash
    console.log('Test 3: Getting recent blockhash...');
    const { blockhash } = await connection.getLatestBlockhash();

    const totalTime = Date.now() - startTime;

    console.log('\n✅ Connection successful!');
    console.log(`   Solana version: ${version['solana-core']}`);
    console.log(`   Feature set: ${version['feature-set']}`);
    console.log(`   Current slot: ${slot}`);
    console.log(`   Recent blockhash: ${blockhash.substring(0, 20)}...`);
    console.log(`   Response time: ${responseTime}ms (version query)`);
    console.log(`   Total test time: ${totalTime}ms`);

    return {
      url,
      success: true,
      responseTime,
      version: version['solana-core'],
      slotHeight: slot,
    };
  } catch (error) {
    console.error('\n❌ Connection failed!');
    console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    return {
      url,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run load test on RPC endpoint
 */
async function runLoadTest(url: string, concurrentRequests: number = 10, totalRequests: number = 50): Promise<void> {
  console.log(`\n\nLoad Test: ${totalRequests} requests (${concurrentRequests} concurrent)`);
  console.log('═'.repeat(80));

  const connection = new Connection(url, 'confirmed');
  const results: { success: boolean; time: number }[] = [];
  
  const startTime = Date.now();
  let completed = 0;

  // Run requests in batches
  const batches = Math.ceil(totalRequests / concurrentRequests);
  
  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(concurrentRequests, totalRequests - completed);
    const promises: Promise<void>[] = [];

    for (let i = 0; i < batchSize; i++) {
      const promise = (async () => {
        const reqStart = Date.now();
        try {
          await connection.getSlot();
          results.push({ success: true, time: Date.now() - reqStart });
        } catch (error) {
          results.push({ success: false, time: Date.now() - reqStart });
        }
        completed++;
        process.stdout.write(`\rProgress: ${completed}/${totalRequests} requests completed`);
      })();
      promises.push(promise);
    }

    await Promise.all(promises);
  }

  const totalTime = Date.now() - startTime;
  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = results.filter(r => !r.success).length;
  const avgResponseTime = results.reduce((sum, r) => sum + r.time, 0) / results.length;
  const successRate = (successfulRequests / totalRequests) * 100;

  console.log('\n\nLoad Test Results:');
  console.log(`   Total requests: ${totalRequests}`);
  console.log(`   Successful: ${successfulRequests} (${successRate.toFixed(2)}%)`);
  console.log(`   Failed: ${failedRequests}`);
  console.log(`   Average response time: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Throughput: ${(totalRequests / (totalTime / 1000)).toFixed(2)} req/sec`);
}

/**
 * Main test function
 */
async function main() {
  console.log('\n🔍 Solana RPC Connection Test');
  console.log('═'.repeat(80));

  const args = process.argv.slice(2);
  const customUrl = args.find(arg => arg.startsWith('--url='))?.split('=')[1];
  const loadTest = args.includes('--load-test');

  // Test custom URL if provided
  if (customUrl) {
    const result = await testRpcEndpoint(customUrl);
    
    if (result.success && loadTest) {
      await runLoadTest(customUrl);
    }
    
    return;
  }

  // Test configured endpoints from environment
  const primaryUrl = process.env.SOLANA_RPC_URL;
  const fallbackUrl = process.env.SOLANA_RPC_URL_FALLBACK;

  if (!primaryUrl) {
    console.error('❌ Error: SOLANA_RPC_URL not configured');
    console.error('   Please set SOLANA_RPC_URL in .env.staging or provide --url parameter');
    process.exit(1);
  }

  // Test primary endpoint
  console.log('\n📡 Testing Primary RPC Endpoint');
  const primaryResult = await testRpcEndpoint(primaryUrl);

  // Test fallback endpoint if configured
  if (fallbackUrl) {
    console.log('\n📡 Testing Fallback RPC Endpoint');
    await testRpcEndpoint(fallbackUrl);
  }

  // Run load test on primary if successful and requested
  if (primaryResult.success && loadTest) {
    await runLoadTest(primaryUrl);
  }

  // Summary
  console.log('\n\n' + '═'.repeat(80));
  console.log('Test Summary:');
  console.log('═'.repeat(80));
  
  if (primaryResult.success) {
    console.log('✅ Primary RPC endpoint is healthy and responsive');
    if (primaryResult.responseTime && primaryResult.responseTime < 2000) {
      console.log('✅ Response time is within acceptable range (< 2s)');
    } else if (primaryResult.responseTime) {
      console.warn(`⚠️  Response time is high: ${primaryResult.responseTime}ms`);
    }
  } else {
    console.error('❌ Primary RPC endpoint is not responding');
    console.error('   Please check your SOLANA_RPC_URL configuration');
  }

  console.log('\n💡 Next Steps:');
  console.log('   1. Verify API key is valid (if using dedicated provider)');
  console.log('   2. Check network connectivity');
  console.log('   3. Review provider status page');
  console.log('   4. Run load test: npx ts-node scripts/utilities/test-rpc-connection.ts --load-test');
  console.log('   5. See docs/infrastructure/STAGING_RPC_SETUP.md for detailed setup');
  console.log('\n');
}

// Run the test
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

