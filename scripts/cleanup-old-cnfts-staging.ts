#!/usr/bin/env ts-node
/**
 * Cleanup Old/Stale cNFTs from Staging Wallets
 * 
 * Removes cNFTs from previous test runs that are NOT part of the new shared tree.
 * These are orphaned cNFTs from when we created fresh trees for each test.
 * 
 * Usage:
 *   ts-node scripts/cleanup-old-cnfts-staging.ts [--dry-run] [--burn]
 * 
 * Options:
 *   --dry-run    Show what would be cleaned up without actually doing it
 *   --burn       Burn the old cNFTs (default: just report them)
 * 
 * This will:
 * 1. Fetch all cNFTs owned by staging sender and receiver wallets
 * 2. Identify cNFTs that are NOT part of the new shared test tree
 * 3. Optionally burn those old cNFTs to clean up the wallets
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { loadTestCnfts } from '../tests/helpers/test-cnft-manager';

// Configuration
const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || '';
// Staging wallets (from .env.staging)
const STAGING_SENDER_ADDRESS = 'AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z';
const STAGING_RECEIVER_ADDRESS = '5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4';
const STAGING_SENDER_PATH = path.join(__dirname, '../wallets/staging/staging-sender.json');
const STAGING_RECEIVER_PATH = path.join(__dirname, '../wallets/staging/staging-receiver.json');

interface CnftAsset {
  id: string;
  content: {
    metadata: {
      name: string;
      symbol: string;
    };
  };
  compression: {
    tree: string;
    leaf_id: number;
  };
  ownership: {
    owner: string;
  };
}

async function fetchWalletCnfts(connection: Connection, owner: PublicKey): Promise<CnftAsset[]> {
  try {
    const response = await (connection as any)._rpcRequest('getAssetsByOwner', {
      ownerAddress: owner.toBase58(),
      page: 1,
      limit: 1000,
    });

    const assets = response.result?.items || [];
    
    // Filter to only compressed NFTs
    return assets.filter((asset: any) => 
      asset.compression && 
      asset.compression.compressed === true
    );
  } catch (error: any) {
    console.error('Failed to fetch cNFTs:', error.message);
    return [];
  }
}

async function burnCnft(
  connection: Connection,
  owner: Keypair,
  assetId: string,
  tree: string
): Promise<boolean> {
  console.warn('   ⚠️  Burn functionality not yet implemented');
  console.warn('      This would require Bubblegum burn instruction');
  console.warn('      For now, cNFTs will remain on-chain');
  return false;
  
  // Future implementation:
  // 1. Fetch cNFT proof
  // 2. Create burn instruction
  // 3. Send transaction
  // 4. Wait for confirmation
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const shouldBurn = args.includes('--burn');

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   CLEANUP OLD/STALE cNFTs FROM STAGING WALLETS              ║');
  console.log('║   Remove cNFTs from previous test runs                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE: Will not make any changes\n');
  }

  if (shouldBurn && !dryRun) {
    console.log('🔥 BURN MODE: Old cNFTs will be permanently destroyed\n');
  }

  // Verify RPC URL
  if (!RPC_URL) {
    console.error('❌ Error: SOLANA_RPC_URL or STAGING_SOLANA_RPC_URL not set');
    process.exit(1);
  }

  console.log('📡 RPC URL:', RPC_URL);

  // Load wallets
  if (!fs.existsSync(STAGING_SENDER_PATH)) {
    console.error(`❌ Error: Sender wallet not found at ${STAGING_SENDER_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(STAGING_RECEIVER_PATH)) {
    console.error(`❌ Error: Receiver wallet not found at ${STAGING_RECEIVER_PATH}`);
    process.exit(1);
  }

  const senderSecret = JSON.parse(fs.readFileSync(STAGING_SENDER_PATH, 'utf8'));
  const sender = Keypair.fromSecretKey(new Uint8Array(senderSecret));

  const receiverSecret = JSON.parse(fs.readFileSync(STAGING_RECEIVER_PATH, 'utf8'));
  const receiver = Keypair.fromSecretKey(new Uint8Array(receiverSecret));

  console.log('👤 Sender (Maker):', sender.publicKey.toBase58());
  console.log('👤 Receiver (Taker):', receiver.publicKey.toBase58());

  // Load test cNFT config to identify the shared tree
  let sharedTreeAddress: string;
  let testCnftAssetIds: Set<string>;
  
  try {
    const config = loadTestCnfts();
    sharedTreeAddress = config.sharedTree.address;
    testCnftAssetIds = new Set(config.testCnfts.map(c => c.assetId));
    
    console.log('\n📋 Shared Test Tree:', sharedTreeAddress);
    console.log(`   Protected cNFTs: ${testCnftAssetIds.size}`);
  } catch (error) {
    console.error('\n❌ Error: Could not load test cNFT config');
    console.error('   Run: npm run staging:setup-test-cnfts first');
    process.exit(1);
  }

  // Connect to Solana
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Fetch cNFTs from sender wallet
  console.log('🔍 Step 1: Scanning Sender Wallet for cNFTs...');
  const senderCnfts = await fetchWalletCnfts(connection, sender.publicKey);
  console.log(`   Found ${senderCnfts.length} cNFTs in sender wallet`);

  // Identify old cNFTs in sender wallet
  const senderOldCnfts = senderCnfts.filter(cnft => 
    cnft.compression.tree !== sharedTreeAddress &&
    !testCnftAssetIds.has(cnft.id)
  );

  console.log(`   Old/stale cNFTs: ${senderOldCnfts.length}`);
  console.log(`   Test cNFTs (protected): ${senderCnfts.length - senderOldCnfts.length}`);

  if (senderOldCnfts.length > 0) {
    console.log('\n   📦 Old cNFTs in Sender Wallet:');
    senderOldCnfts.forEach((cnft, i) => {
      console.log(`      ${i + 1}. ${cnft.content.metadata.name || 'Unnamed'}`);
      console.log(`         Asset ID: ${cnft.id}`);
      console.log(`         Old Tree: ${cnft.compression.tree}`);
      console.log('');
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Fetch cNFTs from receiver wallet
  console.log('🔍 Step 2: Scanning Receiver Wallet for cNFTs...');
  const receiverCnfts = await fetchWalletCnfts(connection, receiver.publicKey);
  console.log(`   Found ${receiverCnfts.length} cNFTs in receiver wallet`);

  // Identify old cNFTs in receiver wallet
  const receiverOldCnfts = receiverCnfts.filter(cnft => 
    cnft.compression.tree !== sharedTreeAddress &&
    !testCnftAssetIds.has(cnft.id)
  );

  console.log(`   Old/stale cNFTs: ${receiverOldCnfts.length}`);
  console.log(`   Test cNFTs (protected): ${receiverCnfts.length - receiverOldCnfts.length}`);

  if (receiverOldCnfts.length > 0) {
    console.log('\n   📦 Old cNFTs in Receiver Wallet:');
    receiverOldCnfts.forEach((cnft, i) => {
      console.log(`      ${i + 1}. ${cnft.content.metadata.name || 'Unnamed'}`);
      console.log(`         Asset ID: ${cnft.id}`);
      console.log(`         Old Tree: ${cnft.compression.tree}`);
      console.log('');
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Summary
  const totalOldCnfts = senderOldCnfts.length + receiverOldCnfts.length;
  const totalCnfts = senderCnfts.length + receiverCnfts.length;

  console.log('📊 Cleanup Summary:\n');
  console.log(`   Total cNFTs found: ${totalCnfts}`);
  console.log(`   Test cNFTs (protected): ${totalCnfts - totalOldCnfts}`);
  console.log(`   Old/stale cNFTs (cleanup candidates): ${totalOldCnfts}`);
  console.log('');
  console.log(`   Sender wallet: ${senderOldCnfts.length} old cNFTs`);
  console.log(`   Receiver wallet: ${receiverOldCnfts.length} old cNFTs`);

  if (totalOldCnfts === 0) {
    console.log('\n✅ Wallets are clean! No old cNFTs to remove.');
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   Cleanup complete - nothing to do                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    process.exit(0);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Collect unique old trees
  const oldTrees = new Set<string>();
  [...senderOldCnfts, ...receiverOldCnfts].forEach(cnft => {
    oldTrees.add(cnft.compression.tree);
  });

  console.log('🌳 Old Merkle Trees (orphaned):');
  oldTrees.forEach((tree, i) => {
    const treeCount = [...senderOldCnfts, ...receiverOldCnfts].filter(c => c.compression.tree === tree).length;
    console.log(`   ${i + 1}. ${tree}`);
    console.log(`      cNFTs: ${treeCount}`);
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (dryRun) {
    console.log('✅ DRY RUN COMPLETE');
    console.log('\n📋 What would happen:');
    console.log(`   - ${totalOldCnfts} old cNFTs identified for cleanup`);
    console.log(`   - ${oldTrees.size} orphaned Merkle trees detected`);
    console.log(`   - ${totalCnfts - totalOldCnfts} test cNFTs would be protected`);
    console.log('\n💡 To actually clean up, run without --dry-run flag');
    console.log('   Note: Burn functionality requires Bubblegum integration');
  } else if (shouldBurn) {
    console.log('🔥 Step 3: Burning Old cNFTs...');
    console.log('   ⚠️  Burn functionality not yet implemented');
    console.log('   This requires Bubblegum burn instruction integration');
    console.log('\n💡 For now, old cNFTs will remain on-chain but are harmless');
    console.log('   They won\'t interfere with new tests since we use specific asset IDs');
  } else {
    console.log('ℹ️  Cleanup Report Generated');
    console.log('\n💡 Next Steps:');
    console.log('   1. Review the old cNFTs listed above');
    console.log('   2. These won\'t interfere with tests (we use specific asset IDs)');
    console.log('   3. To burn them (future): run with --burn flag');
    console.log('   4. Or ignore them - they\'re harmless and cost nothing');
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Cleanup scan complete                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Exit codes
  if (dryRun) {
    process.exit(0);
  } else if (totalOldCnfts > 0 && !shouldBurn) {
    console.log('⚠️  Old cNFTs found but not cleaned up (burn not implemented yet)');
    process.exit(0);
  } else {
    process.exit(0);
  }
}

// Run
main().catch((error) => {
  console.error('\n❌ Error during cleanup:', error);
  process.exit(1);
});

