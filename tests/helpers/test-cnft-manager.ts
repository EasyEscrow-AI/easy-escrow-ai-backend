/**
 * Test cNFT Manager
 * 
 * Manages pre-minted test cNFTs for staging E2E tests.
 * Provides functions to load, use, and rebalance test cNFTs.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface TestCnft {
  assetId: string;
  leafIndex: number;
  owner: string;
  name: string;
  symbol: string;
  uri: string;
}

export interface TestCnftConfig {
  sharedTree: {
    address: string;
    authority: string;
    maxDepth: number;
    maxBufferSize: number;
    canopyDepth: number;
    createdAt: string;
  };
  testCnfts: TestCnft[];
  lastUpdated: string;
}

/**
 * Load pre-minted test cNFTs from config file
 */
export function loadTestCnfts(): TestCnftConfig {
  const configPath = path.join(__dirname, '../fixtures/staging-test-cnfts.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Test cNFTs config not found at ${configPath}\n` +
      'Please run: ts-node scripts/setup-test-cnfts-staging.ts'
    );
  }

  const config: TestCnftConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  
  if (!config.testCnfts || config.testCnfts.length === 0) {
    throw new Error('No test cNFTs found in config file');
  }

  return config;
}

/**
 * Get a test cNFT by index (0-based)
 */
export function getTestCnft(index: number = 0): TestCnft {
  const config = loadTestCnfts();
  
  if (index < 0 || index >= config.testCnfts.length) {
    throw new Error(
      `Invalid cNFT index ${index}. Available: 0-${config.testCnfts.length - 1}`
    );
  }

  return config.testCnfts[index];
}

/**
 * Get multiple test cNFTs
 */
export function getTestCnfts(count: number = 1, startIndex: number = 0): TestCnft[] {
  const config = loadTestCnfts();
  
  if (startIndex + count > config.testCnfts.length) {
    throw new Error(
      `Not enough test cNFTs. Requested ${count} starting at ${startIndex}, ` +
      `but only ${config.testCnfts.length} available`
    );
  }

  return config.testCnfts.slice(startIndex, startIndex + count);
}

/**
 * Get the shared Merkle tree info
 */
export function getSharedTree(): TestCnftConfig['sharedTree'] {
  const config = loadTestCnfts();
  return config.sharedTree;
}

/**
 * Verify cNFT ownership via DAS API
 */
export async function verifyCnftOwnership(
  connection: Connection,
  assetId: string,
  expectedOwner: string
): Promise<boolean> {
  try {
    const response = await (connection as any)._rpcRequest('getAsset', {
      id: assetId,
    });

    const asset = response.result || response;
    const currentOwner = asset?.ownership?.owner;

    return currentOwner === expectedOwner;
  } catch (error: any) {
    console.error(`[TestCnftManager] Failed to verify ownership:`, error.message);
    return false;
  }
}

/**
 * Display test cNFT info
 */
export function displayTestCnftInfo(cnft: TestCnft): void {
  console.log('📦 Test cNFT:');
  console.log(`   Name: ${cnft.name}`);
  console.log(`   Asset ID: ${cnft.assetId}`);
  console.log(`   Leaf Index: ${cnft.leafIndex}`);
  console.log(`   Original Owner: ${cnft.owner}`);
}

/**
 * Display all available test cNFTs
 */
export function displayAllTestCnfts(): void {
  const config = loadTestCnfts();
  
  console.log('\n📦 Available Test cNFTs:');
  console.log('═'.repeat(70));
  console.log(`Shared Tree: ${config.sharedTree.address}`);
  console.log(`Tree Authority: ${config.sharedTree.authority}`);
  console.log(`Total cNFTs: ${config.testCnfts.length}`);
  console.log('');

  config.testCnfts.forEach((cnft, i) => {
    console.log(`${i + 1}. ${cnft.name}`);
    console.log(`   Asset ID: ${cnft.assetId}`);
    console.log(`   Leaf Index: ${cnft.leafIndex}`);
    console.log('');
  });

  console.log('═'.repeat(70));
}

/**
 * Check if test cNFTs are configured
 */
export function hasTestCnfts(): boolean {
  const configPath = path.join(__dirname, '../fixtures/staging-test-cnfts.json');
  return fs.existsSync(configPath);
}

