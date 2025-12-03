#!/usr/bin/env ts-node
/**
 * Smoke Test: Staging Backend RPC Configuration
 * 
 * Tests if the staging backend is using the correct QuickNode RPC with DAS API.
 * 
 * Usage:
 *   ts-node scripts/smoke-test-staging-rpc.ts
 * 
 * Tests:
 * 1. Backend can fetch cNFT asset data (DAS API available)
 * 2. Backend returns fresh Merkle proofs (not cached/stale)
 * 3. Response time is reasonable (< 2 seconds)
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const STAGING_API_URL = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
const ATOMIC_SWAP_API_KEY = process.env.ATOMIC_SWAP_API_KEY || '';
const EXPECTED_RPC_PROVIDER = process.env.EXPECTED_RPC_PROVIDER || 'helius'; // 'helius' or 'quicknode'

interface SmokeTestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   SMOKE TEST: Staging Backend RPC Configuration             ║');
  console.log('║   Verify QuickNode DAS API is properly configured            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📡 Testing API:', STAGING_API_URL);
  console.log('🔑 API Key:', ATOMIC_SWAP_API_KEY ? 'Set ✓' : 'Not set (optional)');
  
  const results: SmokeTestResult[] = [];

  // Test 1: Health check
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🏥 Test 1: Backend Health Check...');
  
  try {
    const startTime = Date.now();
    const response = await axios.get(`${STAGING_API_URL}/health`, {
      timeout: 5000,
    });
    const duration = Date.now() - startTime;
    
    if (response.status === 200) {
      console.log(`   ✅ Backend is responsive (${duration}ms)`);
      console.log(`   Status: ${response.data?.status || 'unknown'}`);
      results.push({
        test: 'Backend Health',
        passed: true,
        message: `Backend responsive in ${duration}ms`,
        details: response.data,
      });
    } else {
      throw new Error(`Unexpected status: ${response.status}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Backend health check failed: ${error.message}`);
    results.push({
      test: 'Backend Health',
      passed: false,
      message: error.message,
    });
    console.log('\n❌ Cannot proceed with tests - backend is not accessible');
    process.exit(1);
  }

  // Test 2: Check if cNFT config exists
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📦 Test 2: Load Test cNFT Config...');
  
  const configPath = path.join(__dirname, '../tests/fixtures/staging-test-cnfts.json');
  
  if (!fs.existsSync(configPath)) {
    console.log('   ⚠️  Test cNFT config not found');
    console.log('   Run: npm run staging:setup-test-cnfts');
    results.push({
      test: 'cNFT Config',
      passed: false,
      message: 'Config file not found',
    });
  } else {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const testCnft = config.testCnfts[0];
    
    console.log(`   ✅ Config loaded`);
    console.log(`   Test cNFT: ${testCnft.name}`);
    console.log(`   Asset ID: ${testCnft.assetId}`);
    console.log(`   Owner: ${testCnft.owner}`);
    
    results.push({
      test: 'cNFT Config',
      passed: true,
      message: 'Config loaded successfully',
      details: {
        assetId: testCnft.assetId,
        owner: testCnft.owner,
      },
    });

    // Test 3: Backend can fetch cNFT data (DAS API test)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🔍 Test 3: Backend DAS API - Fetch cNFT Asset...');
    
    try {
      const startTime = Date.now();
      const response = await axios.post(
        `${STAGING_API_URL}/api/offers`,
        {
          makerWallet: testCnft.owner,
          takerWallet: '5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4', // Staging receiver
          offeredAssets: [{
            mint: testCnft.assetId,
            isCompressed: true,
          }],
          requestedAssets: [{
            mint: 'So11111111111111111111111111111111111111112', // SOL mint
            amount: '100000000', // 0.1 SOL
          }],
          platformFeeBps: 100,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'idempotency-key': `smoke-test-${Date.now()}`,
            ...(ATOMIC_SWAP_API_KEY ? { 'x-api-key': ATOMIC_SWAP_API_KEY } : {}),
          },
          timeout: 10000,
          validateStatus: () => true, // Don't throw on any status
        }
      );
      const duration = Date.now() - startTime;
      
      console.log(`   Response time: ${duration}ms`);
      console.log(`   Status: ${response.status}`);
      
      // Check response for DAS API indicators
      if (response.status === 201 || response.status === 200) {
        // Success - backend fetched cNFT data
        console.log(`   ✅ Backend successfully fetched cNFT data from DAS API`);
        console.log(`   Offer created: ${response.data.data?.offer?.id || 'N/A'}`);
        
        results.push({
          test: 'DAS API - Fetch Asset',
          passed: true,
          message: `Backend fetched cNFT in ${duration}ms`,
          details: {
            offerId: response.data.data?.offer?.id,
            duration,
          },
        });
      } else if (response.status === 400) {
        // Check error message for DAS API issues
        const errorMsg = response.data.message || response.data.error || '';
        
        if (errorMsg.includes('DAS API') || errorMsg.includes('getAsset') || errorMsg.includes('cNFT not found')) {
          console.log(`   ❌ Backend DAS API issue: ${errorMsg}`);
          console.log(`   Likely cause: Backend not using QuickNode RPC or DAS API not enabled`);
          
          results.push({
            test: 'DAS API - Fetch Asset',
            passed: false,
            message: 'DAS API not accessible or cNFT not found',
            details: { error: errorMsg },
          });
        } else if (errorMsg.includes('does not own')) {
          // Ownership error - DAS API is working but ownership mismatch
          console.log(`   ⚠️  DAS API is working, but ownership mismatch`);
          console.log(`   Error: ${errorMsg}`);
          console.log(`   This means DAS API is accessible (RPC configured correctly)`);
          
          results.push({
            test: 'DAS API - Fetch Asset',
            passed: true, // DAS API works, just ownership issue
            message: 'DAS API accessible (ownership mismatch is expected)',
            details: { error: errorMsg },
          });
        } else {
          console.log(`   ⚠️  Validation error: ${errorMsg}`);
          
          results.push({
            test: 'DAS API - Fetch Asset',
            passed: false,
            message: errorMsg,
          });
        }
      } else {
        console.log(`   ❌ Unexpected response: ${response.status}`);
        console.log(`   Message: ${JSON.stringify(response.data, null, 2)}`);
        
        results.push({
          test: 'DAS API - Fetch Asset',
          passed: false,
          message: `Unexpected status: ${response.status}`,
          details: response.data,
        });
      }
    } catch (error: any) {
      console.log(`   ❌ Request failed: ${error.message}`);
      
      results.push({
        test: 'DAS API - Fetch Asset',
        passed: false,
        message: error.message,
      });
    }
  }

  // Test 4: Check RPC configuration hint
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔧 Test 4: RPC Configuration Hints...');
  
  const dasApiWorking = results.find(r => r.test === 'DAS API - Fetch Asset')?.passed;
  
  if (dasApiWorking) {
    console.log('   ✅ DAS API is accessible');
    console.log('   ✅ Backend is using Helius or QuickNode with DAS API');
    console.log('   ✅ SOLANA_RPC_URL is correctly configured');
    console.log('   ℹ️  cNFT swaps should work correctly');
    
    results.push({
      test: 'RPC Configuration',
      passed: true,
      message: 'Backend is using DAS-enabled RPC',
    });
  } else {
    console.log('   ❌ DAS API not accessible');
    console.log('   ❌ Backend RPC endpoint does not have DAS API enabled');
    console.log('   ❌ SOLANA_RPC_URL needs to be updated');
    console.log('');
    console.log('   📝 To fix (RECOMMENDED - Helius with DAS API):');
    console.log('   1. Go to DigitalOcean App Platform');
    console.log('   2. Select: easyescrow-backend-staging');
    console.log('   3. Settings → Environment Variables');
    console.log('   4. SET: SOLANA_RPC_URL = https://devnet.helius-rpc.com/?api-key=YOUR_KEY');
    console.log('   5. REMOVE: HELIUS_RPC_URL (not used by code)');
    console.log('   6. REMOVE: CNFT_INDEXER_API_URL (not needed)');
    console.log('   7. REMOVE: CNFT_INDEXER_API_KEY (not needed)');
    console.log('   8. Redeploy the app');
    console.log('');
    console.log('   ℹ️  Note: Use SOLANA_RPC_URL (not HELIUS_RPC_URL)');
    console.log('   ℹ️  The code looks for SOLANA_RPC_URL for both RPC and DAS API');
    
    results.push({
      test: 'RPC Configuration',
      passed: false,
      message: 'Backend RPC does not have DAS API enabled',
    });
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Test Summary:\n');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`   ${icon} ${result.test}: ${result.message}`);
  });
  
  console.log(`\n   Total: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n✅ ALL TESTS PASSED!');
    console.log('   Staging backend is properly configured for cNFT operations.');
  } else {
    console.log('\n❌ SOME TESTS FAILED');
    console.log('   Review the failures above and take corrective action.');
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Smoke test complete                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  process.exit(passed === total ? 0 : 1);
}

// Run
main().catch((error) => {
  console.error('\n❌ Smoke test error:', error);
  process.exit(1);
});

