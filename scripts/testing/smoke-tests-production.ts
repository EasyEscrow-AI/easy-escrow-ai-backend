#!/usr/bin/env ts-node

/**
 * Smoke Tests for PRODUCTION Environment
 * 
 * This script runs critical health and functionality checks after deployment
 * to verify the PRODUCTION environment is working correctly.
 * 
 * ⚠️ WARNING: This runs against PRODUCTION (mainnet-beta)
 * 
 * Usage: npm run test:production:smoke
 */

import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';

// Configuration
const PRODUCTION_API_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';
const PRODUCTION_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PRODUCTION_PROGRAM_ID = process.env.ESCROW_PROGRAM_ID || '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx'; // Production mainnet program
const PRODUCTION_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Official Circle USDC

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

/**
 * Run a test and record the result
 */
async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  
  try {
    console.log(`${colors.blue}\n▶ ${name}...${colors.reset}`);
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, passed: true, duration });
    console.log(`${colors.green}✓ ${name} (${duration}ms)${colors.reset}`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMessage });
    console.error(`${colors.red}✗ ${name} (${duration}ms)${colors.reset}`);
    console.error(`${colors.red}  Error: ${errorMessage}${colors.reset}`);
  }
}

/**
 * Test 1: API Health Check
 */
async function testApiHealth(): Promise<void> {
  const response = await axios.get(`${PRODUCTION_API_URL}/health`, {
    timeout: 10000, // Longer timeout for production
    validateStatus: (status) => status === 200
  });
  
  if (!response.data) {
    throw new Error('Health endpoint returned no data');
  }
  
  if (response.data.status !== 'healthy') {
    throw new Error(`Health check returned status: ${response.data.status}`);
  }
  
  console.log(`  Status: ${response.data.status}`);
  console.log(`  Database: ${response.data.database ? '✓ Connected' : '✗ Disconnected'}`);
  console.log(`  Redis: ${response.data.redis ? '✓ Connected' : '✗ Disconnected'}`);
  console.log(`  Timestamp: ${response.data.timestamp}`);
  
  // Verify critical services are connected
  if (!response.data.database) {
    throw new Error('Database not connected');
  }
  if (!response.data.redis) {
    throw new Error('Redis not connected');
  }
}

/**
 * Test 2: API Version Check
 */
async function testApiVersion(): Promise<void> {
  const response = await axios.get(`${PRODUCTION_API_URL}/`, {
    timeout: 10000
  });
  
  if (!response.data || !response.data.version) {
    throw new Error('Root endpoint returned invalid data');
  }
  
  console.log(`  API Version: ${response.data.version}`);
  console.log(`  Service: ${response.data.message}`);
  console.log(`  Environment: ${response.data.environment || 'production'}`);
}

/**
 * Test 3: API Rate Limiting
 */
async function testApiRateLimiting(): Promise<void> {
  // Use the actual API endpoint for offers (v1/agreements doesn't exist)
  const response = await axios.get(`${PRODUCTION_API_URL}/api/offers?limit=1`, {
    timeout: 10000
  });
  
  // Check for rate limit headers (may not be present, that's OK)
  const rateLimitHeaders = response.headers['ratelimit-limit'];
  
  if (rateLimitHeaders) {
    console.log(`  Rate limiting configured: ${rateLimitHeaders} requests`);
    console.log(`  Remaining: ${response.headers['ratelimit-remaining'] || 'N/A'}`);
    console.log(`  Reset: ${response.headers['ratelimit-reset'] || 'N/A'}`);
  } else {
    console.log(`  Rate limiting: Not configured (or headers not present)`);
  }
  
  console.log(`  Endpoint accessible: /api/offers`);
  console.log(`  Status: ${response.status}`);
}

/**
 * Test 4: Solana RPC Connection (Mainnet)
 */
async function testSolanaConnection(): Promise<void> {
  const connection = new Connection(PRODUCTION_RPC_URL, 'confirmed');
  
  // Test basic RPC call
  const version = await connection.getVersion();
  console.log(`  Solana Version: ${version['solana-core']}`);
  
  // Test getting slot
  const slot = await connection.getSlot();
  console.log(`  Current Slot: ${slot}`);
  
  // Test epoch info
  const epochInfo = await connection.getEpochInfo();
  console.log(`  Epoch: ${epochInfo.epoch}`);
  
  // Verify connection is healthy
  if (slot === 0) {
    throw new Error('Solana connection returned invalid slot');
  }
  
  // Verify we're on mainnet-beta (slot should be very high)
  if (slot < 200000000) {
    throw new Error(`Slot too low for mainnet-beta: ${slot}`);
  }
}

/**
 * Test 5: Program Account Verification (Production Program)
 */
async function testProgramAccount(): Promise<void> {
  const connection = new Connection(PRODUCTION_RPC_URL, 'confirmed');
  const programId = new PublicKey(PRODUCTION_PROGRAM_ID);
  
  // Verify program account exists
  const accountInfo = await connection.getAccountInfo(programId);
  
  if (!accountInfo) {
    throw new Error(`Program account not found: ${PRODUCTION_PROGRAM_ID}`);
  }
  
  if (!accountInfo.executable) {
    throw new Error('Program account is not executable');
  }
  
  // Verify owner is BPF Loader Upgradeable
  const expectedOwner = 'BPFLoaderUpgradeab1e11111111111111111111111';
  if (accountInfo.owner.toString() !== expectedOwner) {
    throw new Error(`Program owner mismatch. Expected: ${expectedOwner}, Got: ${accountInfo.owner.toString()}`);
  }
  
  console.log(`  Program ID: ${PRODUCTION_PROGRAM_ID}`);
  console.log(`  Executable: ${accountInfo.executable}`);
  console.log(`  Owner: ${accountInfo.owner.toString()}`);
  console.log(`  Data Length: ${accountInfo.data.length} bytes`);
}

/**
 * Test 6: USDC Mint Verification (Mainnet)
 */
async function testUsdcMint(): Promise<void> {
  const connection = new Connection(PRODUCTION_RPC_URL, 'confirmed');
  const usdcMint = new PublicKey(PRODUCTION_USDC_MINT);
  
  // Verify USDC mint exists
  const mintInfo = await connection.getParsedAccountInfo(usdcMint);
  
  if (!mintInfo || !mintInfo.value) {
    throw new Error(`USDC mint not found: ${PRODUCTION_USDC_MINT}`);
  }
  
  const parsedData = (mintInfo.value.data as any).parsed;
  if (!parsedData || parsedData.type !== 'mint') {
    throw new Error('USDC account is not a valid mint');
  }
  
  console.log(`  USDC Mint: ${PRODUCTION_USDC_MINT}`);
  console.log(`  Decimals: ${parsedData.info.decimals}`);
  console.log(`  Supply: ${(parseInt(parsedData.info.supply) / 1e6).toLocaleString()} USDC`);
  console.log(`  Freeze Authority: ${parsedData.info.freezeAuthority || 'None'}`);
  
  // Verify it's the official Circle USDC (6 decimals)
  if (parsedData.info.decimals !== 6) {
    throw new Error(`Invalid USDC decimals. Expected: 6, Got: ${parsedData.info.decimals}`);
  }
}

/**
 * Test 7: Database Connectivity (via API)
 */
async function testDatabaseConnectivity(): Promise<void> {
  const response = await axios.get(`${PRODUCTION_API_URL}/health`, {
    timeout: 10000
  });
  
  if (!response.data.database) {
    throw new Error('Database connection check failed');
  }
  
  console.log('  Database connectivity verified through API');
  console.log('  Database status: Connected');
}

/**
 * Test 8: Redis Connectivity (via API)
 */
async function testRedisConnectivity(): Promise<void> {
  const response = await axios.get(`${PRODUCTION_API_URL}/health`, {
    timeout: 10000
  });
  
  if (!response.data.redis) {
    throw new Error('Redis connection check failed');
  }
  
  console.log('  Redis connectivity verified through API');
  console.log('  Redis status: Connected');
}

/**
 * Test 9: CORS Configuration (Production)
 */
async function testCorsConfiguration(): Promise<void> {
  // Test with production frontend origin
  const response = await axios.get(`${PRODUCTION_API_URL}/health`, {
    headers: {
      'Origin': 'https://easyescrow.ai'
    },
    timeout: 10000
  });
  
  const allowOrigin = response.headers['access-control-allow-origin'];
  if (!allowOrigin) {
    throw new Error('CORS headers not configured');
  }
  
  console.log(`  CORS Origin Allowed: ${allowOrigin}`);
  console.log(`  CORS Credentials: ${response.headers['access-control-allow-credentials'] || 'false'}`);
  console.log(`  CORS Methods: ${response.headers['access-control-allow-methods'] || 'N/A'}`);
  
  // Production should NOT allow localhost
  const localhostTest = await axios.get(`${PRODUCTION_API_URL}/health`, {
    headers: {
      'Origin': 'http://localhost:3000'
    },
    timeout: 10000,
    validateStatus: () => true // Accept any status
  });
  
  const localhostAllowed = localhostTest.headers['access-control-allow-origin'];
  if (localhostAllowed && localhostAllowed.includes('localhost')) {
    console.log(`  ${colors.yellow}⚠️  Warning: Localhost is allowed in CORS (should be disabled in production)${colors.reset}`);
  } else {
    console.log('  ✓ Localhost correctly rejected in CORS');
  }
}

/**
 * Test 10: Security Headers
 */
async function testSecurityHeaders(): Promise<void> {
  const response = await axios.get(`${PRODUCTION_API_URL}/`, {
    timeout: 10000
  });
  
  // Check for security headers
  const securityHeaders = {
    'x-dns-prefetch-control': response.headers['x-dns-prefetch-control'],
    'x-frame-options': response.headers['x-frame-options'],
    'x-content-type-options': response.headers['x-content-type-options'],
    'x-xss-protection': response.headers['x-xss-protection'],
  };
  
  let missingHeaders = 0;
  Object.entries(securityHeaders).forEach(([name, value]) => {
    if (value) {
      console.log(`  ${name}: ${value}`);
    } else {
      console.log(`  ${colors.yellow}⚠️  ${name}: Not set${colors.reset}`);
      missingHeaders++;
    }
  });
  
  if (missingHeaders > 0) {
    console.log(`  ${colors.yellow}⚠️  ${missingHeaders} security header(s) missing${colors.reset}`);
  }
}

/**
 * Test 11: API Swagger Documentation
 */
async function testSwaggerDocs(): Promise<void> {
  const response = await axios.get(`${PRODUCTION_API_URL}/docs`, {
    timeout: 10000,
    validateStatus: (status) => status === 200 || status === 301 || status === 302
  });
  
  if (response.status !== 200) {
    throw new Error(`Swagger docs not accessible. Status: ${response.status}`);
  }
  
  console.log('  Swagger documentation: Accessible');
  console.log(`  URL: ${PRODUCTION_API_URL}/docs`);
}

/**
 * Test 12: Environment Variables
 */
async function testEnvironmentConfig(): Promise<void> {
  // Verify critical environment variables are set
  const requiredEnvVars = {
    'PRODUCTION_API_URL': PRODUCTION_API_URL,
    'PRODUCTION_RPC_URL': PRODUCTION_RPC_URL,
    'PRODUCTION_PROGRAM_ID': PRODUCTION_PROGRAM_ID,
    'PRODUCTION_USDC_MINT': PRODUCTION_USDC_MINT,
  };
  
  Object.entries(requiredEnvVars).forEach(([name, value]) => {
    if (!value || value === 'undefined' || value === 'null') {
      throw new Error(`Required environment variable not set: ${name}`);
    }
    console.log(`  ${name}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
  });
}

/**
 * Print test summary
 */
function printSummary(): void {
  console.log(`${colors.cyan}\n${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}SMOKE TEST SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}\n${colors.reset}`);
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`Total Tests: ${total}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(failed > 0 ? `${colors.red}Failed: ${failed}${colors.reset}` : `Failed: ${failed}`);
  
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\nTotal Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
  
  if (failed > 0) {
    console.log(`${colors.red}\n❌ PRODUCTION SMOKE TESTS FAILED\n${colors.reset}`);
    console.log(`${colors.yellow}Failed Tests:${colors.reset}`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`${colors.red}  ✗ ${r.name}${colors.reset}`);
      console.log(`${colors.red}    ${r.error}${colors.reset}`);
    });
    console.log(`\n${colors.red}⚠️  DO NOT PROCEED WITH DEPLOYMENT${colors.reset}`);
  } else {
    console.log(`${colors.green}\n✅ ALL PRODUCTION SMOKE TESTS PASSED\n${colors.reset}`);
    console.log(`${colors.green}✓ Production environment is healthy${colors.reset}`);
    console.log(`${colors.green}✓ Ready for E2E testing${colors.reset}`);
  }
  
  console.log(`${colors.cyan}\n${'='.repeat(60)}\n${colors.reset}`);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}PRODUCTION ENVIRONMENT SMOKE TESTS${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`\n${colors.yellow}⚠️  WARNING: Testing PRODUCTION environment (mainnet-beta)${colors.reset}`);
  console.log(`\nAPI URL: ${PRODUCTION_API_URL}`);
  console.log(`RPC URL: ${PRODUCTION_RPC_URL}`);
  console.log(`Program ID: ${PRODUCTION_PROGRAM_ID}`);
  console.log(`Network: mainnet-beta`);
  
  // Run all tests
  await runTest('API Health Check', testApiHealth);
  await runTest('API Version Check', testApiVersion);
  await runTest('API Rate Limiting', testApiRateLimiting);
  await runTest('Solana RPC Connection (Mainnet)', testSolanaConnection);
  await runTest('Program Account Verification', testProgramAccount);
  await runTest('USDC Mint Verification', testUsdcMint);
  await runTest('Database Connectivity', testDatabaseConnectivity);
  await runTest('Redis Connectivity', testRedisConnectivity);
  await runTest('CORS Configuration', testCorsConfiguration);
  await runTest('Security Headers', testSecurityHeaders);
  await runTest('API Swagger Documentation', testSwaggerDocs);
  await runTest('Environment Configuration', testEnvironmentConfig);
  
  // Print summary
  printSummary();
  
  // Exit with appropriate code
  const hasFailures = results.some(r => !r.passed);
  process.exit(hasFailures ? 1 : 0);
}

// Run tests
main().catch((error) => {
  console.error(`${colors.red}\n❌ Fatal error running smoke tests:${colors.reset}`);
  console.error(`${colors.red}${error.message}${colors.reset}`);
  if (error.stack) {
    console.error(`${colors.red}${error.stack}${colors.reset}`);
  }
  process.exit(1);
});

