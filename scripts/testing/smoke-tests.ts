/**
 * Smoke Tests for STAGING Environment
 * 
 * Quick validation tests to ensure critical functionality is working after deployment.
 * These tests are designed to be fast and focused on essential features.
 */

import axios, { AxiosError } from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// Environment configuration
const STAGING_API_URL = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
const STAGING_RPC_URL = process.env.STAGING_RPC_URL || 'https://api.devnet.solana.com';
const STAGING_PROGRAM_ID = process.env.STAGING_PROGRAM_ID;

interface SmokeTestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

class SmokeTestRunner {
  private results: SmokeTestResult[] = [];
  private connection: Connection;

  constructor() {
    this.connection = new Connection(STAGING_RPC_URL, 'confirmed');
  }

  async runAllTests(): Promise<void> {
    console.log('🚬 Running STAGING Smoke Tests...\n');
    console.log(`API URL: ${STAGING_API_URL}`);
    console.log(`RPC URL: ${STAGING_RPC_URL}`);
    console.log(`Program ID: ${STAGING_PROGRAM_ID}\n`);

    // Run tests in sequence
    await this.runTest('API Health Check', () => this.testApiHealth());
    await this.runTest('Database Connectivity', () => this.testDatabaseConnectivity());
    await this.runTest('Solana RPC Connection', () => this.testSolanaConnection());
    await this.runTest('Program Deployment Verification', () => this.testProgramDeployment());
    await this.runTest('API Authentication', () => this.testApiAuthentication());
    await this.runTest('Core API Endpoints', () => this.testCoreApiEndpoints());

    // Print results
    this.printResults();

    // Exit with appropriate code
    const allPassed = this.results.every(r => r.passed);
    if (allPassed) {
      console.log('\n✅ All smoke tests passed!');
      process.exit(0);
    } else {
      console.log('\n❌ Some smoke tests failed!');
      process.exit(1);
    }
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, passed: true, duration });
      console.log(`✅ ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.results.push({ name, passed: false, duration, error: errorMessage });
      console.log(`❌ ${name} (${duration}ms): ${errorMessage}`);
    }
  }

  private async testApiHealth(): Promise<void> {
    const response = await axios.get(`${STAGING_API_URL}/health`, {
      timeout: 5000,
    });

    if (response.status !== 200) {
      throw new Error(`Health check failed with status ${response.status}`);
    }

    if (!response.data || response.data.status !== 'healthy') {
      throw new Error('API health status is not healthy');
    }
  }

  private async testDatabaseConnectivity(): Promise<void> {
    const response = await axios.get(`${STAGING_API_URL}/health/db`, {
      timeout: 5000,
    });

    if (response.status !== 200) {
      throw new Error(`Database health check failed with status ${response.status}`);
    }

    if (!response.data || response.data.database !== 'connected') {
      throw new Error('Database is not connected');
    }
  }

  private async testSolanaConnection(): Promise<void> {
    const version = await this.connection.getVersion();
    if (!version || !version['solana-core']) {
      throw new Error('Failed to get Solana version');
    }

    // Test a simple RPC call
    const slot = await this.connection.getSlot();
    if (typeof slot !== 'number') {
      throw new Error('Failed to get current slot');
    }
  }

  private async testProgramDeployment(): Promise<void> {
    if (!STAGING_PROGRAM_ID) {
      throw new Error('STAGING_PROGRAM_ID not set');
    }

    const programId = new PublicKey(STAGING_PROGRAM_ID);
    const accountInfo = await this.connection.getAccountInfo(programId);

    if (!accountInfo) {
      throw new Error('Program account not found');
    }

    if (!accountInfo.executable) {
      throw new Error('Program account is not executable');
    }

    // Verify program is owned by BPF Loader
    const expectedOwner = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
    if (!accountInfo.owner.equals(expectedOwner)) {
      throw new Error(`Program has unexpected owner: ${accountInfo.owner.toBase58()}`);
    }
  }

  private async testApiAuthentication(): Promise<void> {
    // Test that authentication endpoints are accessible
    try {
      const response = await axios.post(
        `${STAGING_API_URL}/v1/auth/nonce`,
        { publicKey: 'DummyKeyForTestingOnly' },
        { timeout: 5000, validateStatus: () => true }
      );

      // We expect either 200 (success) or 400 (invalid key format)
      // but not 500 (server error) or 404 (endpoint not found)
      if (response.status >= 500 || response.status === 404) {
        throw new Error(`Auth endpoint returned unexpected status ${response.status}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to API');
      }
      throw error;
    }
  }

  private async testCoreApiEndpoints(): Promise<void> {
    // Test that core endpoints exist and respond appropriately
    const endpoints = [
      { path: '/v1/agreements', method: 'GET' },
      { path: '/v1/transactions', method: 'GET' },
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios({
          method: endpoint.method,
          url: `${STAGING_API_URL}${endpoint.path}`,
          timeout: 5000,
          validateStatus: () => true,
        });

        // We expect 401 (unauthorized) or 200 (success with pagination)
        // but not 500 (server error) or 404 (endpoint not found)
        if (response.status >= 500 || response.status === 404) {
          throw new Error(`${endpoint.path} returned unexpected status ${response.status}`);
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          throw new Error(`Cannot connect to ${endpoint.path}`);
        }
        throw error;
      }
    }
  }

  private printResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('SMOKE TEST RESULTS');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\nTotal: ${this.results.length} tests`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Duration: ${totalDuration}ms`);

    if (failed > 0) {
      console.log('\nFailed Tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  ❌ ${r.name}`);
          console.log(`     Error: ${r.error}`);
        });
    }

    console.log('\n' + '='.repeat(60));
  }
}

// Run tests if executed directly
if (require.main === module) {
  const runner = new SmokeTestRunner();
  runner.runAllTests().catch(error => {
    console.error('Fatal error running smoke tests:', error);
    process.exit(1);
  });
}

export default SmokeTestRunner;

