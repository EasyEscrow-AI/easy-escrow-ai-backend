#!/usr/bin/env ts-node
/**
 * Setup Pre-Minted Test cNFTs for Staging
 * 
 * Creates reusable cNFTs for E2E testing to avoid:
 * - Paying tree rent (1.134 SOL) on every test run
 * - Waiting for DAS API indexing
 * - Creating orphaned trees/cNFTs on devnet
 * 
 * Usage:
 *   ts-node scripts/setup-test-cnfts-staging.ts
 * 
 * This will:
 * 1. Create a shared Merkle tree (one-time cost)
 * 2. Mint 5 test cNFTs
 * 3. Save cNFT details to tests/fixtures/staging-test-cnfts.json
 * 4. Tests will reuse these cNFTs and return them after testing
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';
import {
  createMerkleTree,
  mintTestCNFT,
  displayCNFTInfo,
  CnftDetails,
  DEFAULT_TREE_CONFIG,
} from '../tests/helpers/devnet-cnft-setup';

// Configuration
const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || '';
// Use staging sender wallet (from .env.staging)
const STAGING_SENDER_ADDRESS = process.env.DEVNET_STAGING_SENDER_ADDRESS || 'AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z';
const STAGING_SENDER_PRIVATE_KEY = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY || '';
const STAGING_SENDER_PATH = path.join(__dirname, '../wallets/staging/staging-sender.json');
const OUTPUT_PATH = path.join(__dirname, '../tests/fixtures/staging-test-cnfts.json');

// Number of test cNFTs to create
const NUM_TEST_CNFTS = 5;

interface TestCnftConfig {
  sharedTree: {
    address: string;
    authority: string;
    maxDepth: number;
    maxBufferSize: number;
    canopyDepth: number;
    createdAt: string;
  };
  testCnfts: Array<{
    assetId: string;
    leafIndex: number;
    owner: string;
    name: string;
    symbol: string;
    uri: string;
  }>;
  lastUpdated: string;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   SETUP TEST cNFTs FOR STAGING                              ║');
  console.log('║   Pre-mint reusable cNFTs to avoid tree creation costs      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Verify RPC URL
  if (!RPC_URL) {
    console.error('❌ Error: SOLANA_RPC_URL or STAGING_SOLANA_RPC_URL not set');
    console.error('Please set one of these environment variables to your QuickNode/Helius URL');
    process.exit(1);
  }

  console.log('📡 RPC URL:', RPC_URL);

  // Load staging sender wallet
  let sender: Keypair;
  
  if (STAGING_SENDER_PRIVATE_KEY) {
    // Load from environment variable (base58 format)
    console.log('👤 Loading sender from DEVNET_STAGING_SENDER_PRIVATE_KEY');
    sender = Keypair.fromSecretKey(bs58.decode(STAGING_SENDER_PRIVATE_KEY));
  } else if (fs.existsSync(STAGING_SENDER_PATH)) {
    // Load from wallet file
    console.log('👤 Loading sender from wallet file');
    const senderSecret = JSON.parse(fs.readFileSync(STAGING_SENDER_PATH, 'utf8'));
    sender = Keypair.fromSecretKey(new Uint8Array(senderSecret));
  } else {
    console.error(`❌ Error: Staging sender wallet not found`);
    console.error(`   Set DEVNET_STAGING_SENDER_PRIVATE_KEY in environment`);
    console.error(`   Or create wallet file at: ${STAGING_SENDER_PATH}`);
    process.exit(1);
  }
  
  console.log('👤 Owner (Staging Sender):', sender.publicKey.toBase58());
  console.log(`   Expected: ${STAGING_SENDER_ADDRESS}`);

  // Connect to Solana
  const connection = new Connection(RPC_URL, 'confirmed');

  // Check balance
  const balance = await connection.getBalance(sender.publicKey);
  const balanceSOL = balance / 1e9;
  console.log(`💰 Balance: ${balanceSOL.toFixed(4)} SOL`);

  if (balanceSOL < 2) {
    console.error(`❌ Error: Insufficient balance. Need at least 2 SOL (have ${balanceSOL.toFixed(4)} SOL)`);
    console.error('Please airdrop more SOL to the sender wallet');
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Create shared Merkle tree (or load existing)
  console.log('🌳 Step 1: Creating Shared Merkle Tree...');
  console.log('   This is a one-time cost (~1.134 SOL rent)');
  console.log(`   Tree capacity: ${2 ** DEFAULT_TREE_CONFIG.maxDepth} cNFTs`);

  const { tree, treeAuthority } = await createMerkleTree(connection, sender, DEFAULT_TREE_CONFIG);

  console.log('\n✅ Shared tree created successfully!');
  console.log(`   Tree Address: ${tree.publicKey.toBase58()}`);
  console.log(`   Tree Authority: ${treeAuthority.toBase58()}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 2: Mint test cNFTs
  console.log(`🎨 Step 2: Minting ${NUM_TEST_CNFTS} Test cNFTs...`);
  console.log('   These will be reused across all staging tests\n');

  const testCnfts: CnftDetails[] = [];

  for (let i = 0; i < NUM_TEST_CNFTS; i++) {
    console.log(`\n📦 Minting test cNFT ${i + 1}/${NUM_TEST_CNFTS}...`);

    const cnft = await mintTestCNFT(
      connection,
      tree.publicKey,
      treeAuthority,
      sender, // payer
      sender.publicKey, // owner
      {
        name: `Staging Test cNFT #${i + 1}`,
        symbol: 'STCNFT',
        uri: `https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/test-cnft-${i + 1}.json`,
      },
      i // leafIndex
    );

    testCnfts.push(cnft);

    console.log(`   ✅ cNFT ${i + 1} minted successfully`);
    console.log(`      Asset ID: ${cnft.assetId.toBase58()}`);
    console.log(`      Leaf Index: ${cnft.leafIndex}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 3: Wait for DAS API indexing
  console.log('⏱️  Step 3: Waiting for DAS API to fully index all cNFTs...');
  console.log('   This ensures tests get fresh proof data immediately');
  await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
  console.log('   ✅ Indexing complete');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 4: Save configuration
  console.log('💾 Step 4: Saving test cNFT configuration...');

  const config: TestCnftConfig = {
    sharedTree: {
      address: tree.publicKey.toBase58(),
      authority: treeAuthority.toBase58(),
      maxDepth: DEFAULT_TREE_CONFIG.maxDepth,
      maxBufferSize: DEFAULT_TREE_CONFIG.maxBufferSize,
      canopyDepth: DEFAULT_TREE_CONFIG.canopyDepth,
      createdAt: new Date().toISOString(),
    },
    testCnfts: testCnfts.map(cnft => ({
      assetId: cnft.assetId.toBase58(),
      leafIndex: cnft.leafIndex,
      owner: cnft.owner.toBase58(),
      name: cnft.metadata.name,
      symbol: cnft.metadata.symbol,
      uri: cnft.metadata.uri,
    })),
    lastUpdated: new Date().toISOString(),
  };

  // Ensure fixtures directory exists
  const fixturesDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // Write config file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(config, null, 2));

  console.log(`   ✅ Configuration saved to: ${OUTPUT_PATH}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 5: Summary
  console.log('✅ SETUP COMPLETE!\n');
  console.log('📊 Summary:');
  console.log(`   Shared Tree: ${tree.publicKey.toBase58()}`);
  console.log(`   Test cNFTs Created: ${testCnfts.length}`);
  console.log(`   Owner: ${sender.publicKey.toBase58()}`);
  console.log(`   Config File: ${OUTPUT_PATH}`);

  console.log('\n💡 Usage in Tests:');
  console.log('   Tests will now use these pre-minted cNFTs instead of creating new ones.');
  console.log('   After each test, cNFTs are automatically returned to the original owner.');
  console.log('   This saves ~1.134 SOL per test run and reduces test time.');

  console.log('\n🔄 To Reset/Recreate:');
  console.log('   Simply run this script again to mint fresh cNFTs.');
  console.log('   Old trees/cNFTs will remain on-chain but tests will use the new ones.\n');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   ✨ Test cNFTs are ready for staging E2E tests!            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Display all cNFT details
  console.log('📦 cNFT Details:\n');
  testCnfts.forEach((cnft, i) => {
    console.log(`   ${i + 1}. ${cnft.metadata.name}`);
    console.log(`      Asset ID: ${cnft.assetId.toBase58()}`);
    console.log(`      Leaf Index: ${cnft.leafIndex}`);
    console.log(`      Tree: ${cnft.treeAddress.toBase58()}`);
    console.log('');
  });

  process.exit(0);
}

// Run
main().catch((error) => {
  console.error('\n❌ Error during setup:', error);
  process.exit(1);
});

