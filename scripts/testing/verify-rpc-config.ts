/**
 * RPC Configuration Verification Script
 * 
 * Verifies that the staging RPC configuration is properly set up
 * and that the dedicated RPC provider is accessible.
 */

import dotenv from 'dotenv';
import { Connection, clusterApiUrl } from '@solana/web3.js';

// Load staging environment
dotenv.config({ path: '.env.staging' });

interface RpcTestResult {
  endpoint: string;
  accessible: boolean;
  responseTime: number | null;
  version: string | null;
  error: string | null;
}

/**
 * Test an RPC endpoint
 */
async function testRpcEndpoint(url: string): Promise<RpcTestResult> {
  const startTime = Date.now();
  
  try {
    const connection = new Connection(url, 'confirmed');
    
    // Test with getVersion
    const version = await connection.getVersion();
    const responseTime = Date.now() - startTime;
    
    return {
      endpoint: maskApiKey(url),
      accessible: true,
      responseTime,
      version: version['solana-core'],
      error: null,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      endpoint: maskApiKey(url),
      accessible: false,
      responseTime,
      version: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Mask API keys in URLs for security
 */
function maskApiKey(url: string): string {
  try {
    const urlObj = new URL(url);
    const apiKey = urlObj.searchParams.get('api-key');
    
    if (apiKey && apiKey.length > 8) {
      const masked = `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
      urlObj.searchParams.set('api-key', masked);
      return urlObj.toString();
    }
    
    return url;
  } catch {
    return url;
  }
}

/**
 * Main verification function
 */
async function verifyRpcConfiguration() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  RPC Configuration Verification for STAGING');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Check environment variables
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const rpcUrlFallback = process.env.SOLANA_RPC_URL_FALLBACK;
  const network = process.env.SOLANA_NETWORK;
  const rpcTimeout = process.env.SOLANA_RPC_TIMEOUT;
  const rpcRetries = process.env.SOLANA_RPC_RETRIES;
  const healthCheckInterval = process.env.SOLANA_RPC_HEALTH_CHECK_INTERVAL;
  
  console.log('📋 Environment Configuration:');
  console.log('────────────────────────────────────────────────────────');
  console.log(`Network:                     ${network || 'NOT SET ❌'}`);
  console.log(`Primary RPC URL:             ${rpcUrl ? maskApiKey(rpcUrl) : 'NOT SET ❌'}`);
  console.log(`Fallback RPC URL:            ${rpcUrlFallback ? maskApiKey(rpcUrlFallback) : 'NOT SET ❌'}`);
  console.log(`RPC Timeout:                 ${rpcTimeout || '30000'} ms`);
  console.log(`RPC Retries:                 ${rpcRetries || '3'}`);
  console.log(`Health Check Interval:       ${healthCheckInterval || '30000'} ms\n`);
  
  // Validation checks
  const issues: string[] = [];
  
  if (!rpcUrl) {
    issues.push('❌ SOLANA_RPC_URL is not set');
  } else if (rpcUrl.includes('api.devnet.solana.com') || rpcUrl.includes('localhost')) {
    issues.push('⚠️  SOLANA_RPC_URL is using public/local endpoint (not dedicated RPC provider)');
  }
  
  if (!rpcUrlFallback) {
    issues.push('⚠️  SOLANA_RPC_URL_FALLBACK is not set (recommended for failover)');
  }
  
  if (network !== 'devnet') {
    issues.push(`⚠️  SOLANA_NETWORK is "${network}" (expected "devnet" for staging)`);
  }
  
  if (issues.length > 0) {
    console.log('⚠️  Configuration Issues:');
    console.log('────────────────────────────────────────────────────────');
    issues.forEach(issue => console.log(`   ${issue}`));
    console.log('');
  }
  
  // Test RPC endpoints
  console.log('🔍 Testing RPC Endpoints:');
  console.log('────────────────────────────────────────────────────────\n');
  
  // Test primary
  if (rpcUrl) {
    console.log('Testing Primary RPC...');
    const primaryResult = await testRpcEndpoint(rpcUrl);
    
    if (primaryResult.accessible) {
      console.log(`✅ Primary RPC: ${primaryResult.endpoint}`);
      console.log(`   Response Time: ${primaryResult.responseTime}ms`);
      console.log(`   Solana Version: ${primaryResult.version}\n`);
    } else {
      console.log(`❌ Primary RPC: ${primaryResult.endpoint}`);
      console.log(`   Error: ${primaryResult.error}\n`);
    }
  }
  
  // Test fallback
  if (rpcUrlFallback) {
    console.log('Testing Fallback RPC...');
    const fallbackResult = await testRpcEndpoint(rpcUrlFallback);
    
    if (fallbackResult.accessible) {
      console.log(`✅ Fallback RPC: ${fallbackResult.endpoint}`);
      console.log(`   Response Time: ${fallbackResult.responseTime}ms`);
      console.log(`   Solana Version: ${fallbackResult.version}\n`);
    } else {
      console.log(`❌ Fallback RPC: ${fallbackResult.endpoint}`);
      console.log(`   Error: ${fallbackResult.error}\n`);
    }
  }
  
  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Verification Summary');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const hasIssues = issues.length > 0;
  const primaryWorks = rpcUrl ? (await testRpcEndpoint(rpcUrl)).accessible : false;
  const fallbackWorks = rpcUrlFallback ? (await testRpcEndpoint(rpcUrlFallback)).accessible : false;
  
  if (!hasIssues && primaryWorks) {
    console.log('✅ RPC configuration is properly set up!');
    console.log('✅ Dedicated RPC provider is accessible');
    if (fallbackWorks) {
      console.log('✅ Fallback RPC is configured and working');
    }
    console.log('\n🎉 All checks passed! Staging environment is ready.');
  } else {
    console.log('⚠️  Issues detected:');
    if (hasIssues) {
      console.log('   - Configuration issues found (see above)');
    }
    if (!primaryWorks) {
      console.log('   - Primary RPC is not accessible');
    }
    if (rpcUrlFallback && !fallbackWorks) {
      console.log('   - Fallback RPC is not accessible');
    }
    console.log('\n📝 Next Steps:');
    console.log('   1. Review the issues listed above');
    console.log('   2. Update .env.staging with correct values');
    console.log('   3. Sign up for dedicated RPC provider if not done');
    console.log('      Recommended: Helius (https://dashboard.helius.dev/)');
    console.log('   4. Run this verification script again');
  }
  
  console.log('\n═══════════════════════════════════════════════════════\n');
}

// Run verification
verifyRpcConfiguration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Verification failed with error:', error);
    process.exit(1);
  });

