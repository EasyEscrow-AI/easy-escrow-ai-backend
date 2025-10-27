#!/usr/bin/env ts-node

/**
 * Smoke Tests for STAGING Environment
 * 
 * This script runs critical health and functionality checks after deployment
 * to verify the STAGING environment is working correctly.
 * 
 * Usage: npm run test:staging:smoke
 */

import axios from 'axios';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import chalk from 'chalk';

// Configuration
const STAGING_API_URL = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
const STAGING_RPC_URL = process.env.STAGING_RPC_URL || clusterApiUrl('devnet');
const STAGING_PROGRAM_ID = process.env.STAGING_PROGRAM_ID;

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

/**
 * Run a test and record the result
 */
async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  
  try {
    console.log(chalk.blue(`\n▶ ${name}...`));
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, passed: true, duration });
    console.log(chalk.green(`✓ ${name} (${duration}ms)`));
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMessage });
    console.error(chalk.red(`✗ ${name} (${duration}ms)`));
    console.error(chalk.red(`  Error: ${errorMessage}`));
  }
}

/**
 * Test 1: API Health Check
 */
async function testApiHealth(): Promise<void> {
  const response = await axios.get(`${STAGING_API_URL}/health`, {
    timeout: 5000,
    validateStatus: (status) => status === 200
  });
  
  if (!response.data) {
    throw new Error('Health endpoint returned no data');
  }
  
  console.log(`  Status: ${response.data.status}`);
  console.log(`  Database: ${response.data.database ? 'Connected' : 'Disconnected'}`);
  console.log(`  Redis: ${response.data.redis ? 'Connected' : 'Disconnected'}`);
}

/**
 * Test 2: API Version Check
 */
async function testApiVersion(): Promise<void> {
  const response = await axios.get(`${STAGING_API_URL}/v1/version`, {
    timeout: 5000
  });
  
  if (!response.data || !response.data.version) {
    throw new Error('Version endpoint returned invalid data');
  }
  
  console.log(`  API Version: ${response.data.version}`);
}

/**
 * Test 3: API Authentication (should fail without credentials)
 */
async function testApiAuthentication(): Promise<void> {
  try {
    await axios.get(`${STAGING_API_URL}/v1/agreements`, {
      timeout: 5000
    });
    throw new Error('Expected authentication error but request succeeded');
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      console.log('  Authentication correctly enforced (401)');
      return;
    }
    throw error;
  }
}

/**
 * Test 4: Solana RPC Connection
 */
async function testSolanaConnection(): Promise<void> {
  const connection = new Connection(STAGING_RPC_URL, 'confirmed');
  
  // Test basic RPC call
  const version = await connection.getVersion();
  console.log(`  Solana Version: ${version['solana-core']}`);
  
  // Test getting slot
  const slot = await connection.getSlot();
  console.log(`  Current Slot: ${slot}`);
  
  // Verify connection is healthy
  if (slot === 0) {
    throw new Error('Solana connection returned invalid slot');
  }
}

/**
 * Test 5: Program Account Verification
 */
async function testProgramAccount(): Promise<void> {
  if (!STAGING_PROGRAM_ID) {
    throw new Error('STAGING_PROGRAM_ID environment variable not set');
  }
  
  const connection = new Connection(STAGING_RPC_URL, 'confirmed');
  const programId = new PublicKey(STAGING_PROGRAM_ID);
  
  // Verify program account exists
  const accountInfo = await connection.getAccountInfo(programId);
  
  if (!accountInfo) {
    throw new Error(`Program account not found: ${STAGING_PROGRAM_ID}`);
  }
  
  if (!accountInfo.executable) {
    throw new Error('Program account is not executable');
  }
  
  console.log(`  Program ID: ${STAGING_PROGRAM_ID}`);
  console.log(`  Executable: ${accountInfo.executable}`);
  console.log(`  Owner: ${accountInfo.owner.toString()}`);
}

/**
 * Test 6: Database Connectivity (via API)
 */
async function testDatabaseConnectivity(): Promise<void> {
  // Test database connectivity through a simple API endpoint
  const response = await axios.get(`${STAGING_API_URL}/health`, {
    timeout: 5000
  });
  
  if (!response.data.database) {
    throw new Error('Database connection check failed');
  }
  
  console.log('  Database connectivity verified through API');
}

/**
 * Test 7: Redis Connectivity (via API)
 */
async function testRedisConnectivity(): Promise<void> {
  // Test Redis connectivity through health endpoint
  const response = await axios.get(`${STAGING_API_URL}/health`, {
    timeout: 5000
  });
  
  if (!response.data.redis) {
    throw new Error('Redis connection check failed');
  }
  
  console.log('  Redis connectivity verified through API');
}

/**
 * Test 8: CORS Configuration
 */
async function testCorsConfiguration(): Promise<void> {
  const response = await axios.options(`${STAGING_API_URL}/v1/agreements`, {
    headers: {
      'Origin': 'https://staging.easyescrow.ai',
      'Access-Control-Request-Method': 'POST'
    },
    timeout: 5000
  });
  
  const allowOrigin = response.headers['access-control-allow-origin'];
  if (!allowOrigin) {
    throw new Error('CORS headers not configured');
  }
  
  console.log(`  CORS Configured: ${allowOrigin}`);
}

/**
 * Print test summary
 */
function printSummary(): void {
  console.log(chalk.blue('\n' + '='.repeat(60)));
  console.log(chalk.blue('SMOKE TEST SUMMARY'));
  console.log(chalk.blue('='.repeat(60) + '\n'));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`Total Tests: ${total}`);
  console.log(chalk.green(`Passed: ${passed}`));
  console.log(failed > 0 ? chalk.red(`Failed: ${failed}`) : `Failed: ${failed}`);
  
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\nTotal Duration: ${totalDuration}ms`);
  
  if (failed > 0) {
    console.log(chalk.red('\n❌ SMOKE TESTS FAILED\n'));
    console.log(chalk.yellow('Failed Tests:'));
    results.filter(r => !r.passed).forEach(r => {
      console.log(chalk.red(`  ✗ ${r.name}`));
      console.log(chalk.red(`    ${r.error}`));
    });
  } else {
    console.log(chalk.green('\n✅ ALL SMOKE TESTS PASSED\n'));
  }
  
  console.log(chalk.blue('='.repeat(60) + '\n'));
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log(chalk.blue('='.repeat(60)));
  console.log(chalk.blue('STAGING ENVIRONMENT SMOKE TESTS'));
  console.log(chalk.blue('='.repeat(60)));
  console.log(`\nAPI URL: ${STAGING_API_URL}`);
  console.log(`RPC URL: ${STAGING_RPC_URL}`);
  console.log(`Program ID: ${STAGING_PROGRAM_ID || 'Not set'}`);
  
  // Run all tests
  await runTest('API Health Check', testApiHealth);
  await runTest('API Version Check', testApiVersion);
  await runTest('API Authentication', testApiAuthentication);
  await runTest('Solana RPC Connection', testSolanaConnection);
  await runTest('Program Account Verification', testProgramAccount);
  await runTest('Database Connectivity', testDatabaseConnectivity);
  await runTest('Redis Connectivity', testRedisConnectivity);
  await runTest('CORS Configuration', testCorsConfiguration);
  
  // Print summary
  printSummary();
  
  // Exit with appropriate code
  const hasFailures = results.some(r => !r.passed);
  process.exit(hasFailures ? 1 : 0);
}

// Run tests
main().catch((error) => {
  console.error(chalk.red('\n❌ Fatal error running smoke tests:'));
  console.error(chalk.red(error.message));
  process.exit(1);
});
