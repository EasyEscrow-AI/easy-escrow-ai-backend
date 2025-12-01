#!/usr/bin/env ts-node
/**
 * Verify cNFT is Fully Indexed by DAS API
 * 
 * Checks if QuickNode has fully indexed a cNFT and can provide fresh proofs.
 */

import { Connection } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || '';
const CONFIG_PATH = path.join(__dirname, '../tests/fixtures/staging-test-cnfts.json');

async function main() {
  if (!RPC_URL) {
    console.error('❌ RPC URL not set');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const testCnft = config.testCnfts[0];

  console.log('\n🔍 Verifying cNFT Indexing...');
  console.log(`📦 Asset ID: ${testCnft.assetId}`);
  console.log(`🌳 Tree: ${config.sharedTree.address}`);
  console.log(`📡 RPC: ${RPC_URL}\n`);

  const connection = new Connection(RPC_URL, 'confirmed');

  try {
    // Fetch asset
    console.log('1️⃣ Fetching asset data...');
    const startAsset = Date.now();
    const assetResponse = await (connection as any)._rpcRequest('getAsset', {
      id: testCnft.assetId,
    });
    const assetDuration = Date.now() - startAsset;
    const asset = assetResponse.result || assetResponse;
    
    console.log(`   ✅ Asset fetched in ${assetDuration}ms`);
    console.log(`   Owner: ${asset.ownership.owner}`);
    console.log(`   Tree: ${asset.compression.tree}`);

    // Fetch proof
    console.log('\n2️⃣ Fetching Merkle proof...');
    const startProof = Date.now();
    const proofResponse = await (connection as any)._rpcRequest('getAssetProof', {
      id: testCnft.assetId,
    });
    const proofDuration = Date.now() - startProof;
    const proof = proofResponse.result || proofResponse;
    
    console.log(`   ✅ Proof fetched in ${proofDuration}ms`);
    const rootArray = Array.isArray(proof.root) ? proof.root : Array.from(Buffer.from(proof.root, 'base64'));
    console.log(`   Root (first 8 bytes): [${rootArray.slice(0, 8).join(', ')}]`);
    console.log(`   Proof length: ${proof.proof.length} nodes`);
    console.log(`   Leaf index: ${proof.leaf_id || proof.node_index}`);

    // Fetch proof again to see if it changes
    console.log('\n3️⃣ Fetching proof again (check for staleness)...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    const startProof2 = Date.now();
    const proofResponse2 = await (connection as any)._rpcRequest('getAssetProof', {
      id: testCnft.assetId,
    });
    const proofDuration2 = Date.now() - startProof2;
    const proof2 = proofResponse2.result || proofResponse2;
    
    console.log(`   ✅ Proof fetched in ${proofDuration2}ms`);
    const rootArray2 = Array.isArray(proof2.root) ? proof2.root : Array.from(Buffer.from(proof2.root, 'base64'));
    console.log(`   Root (first 8 bytes): [${rootArray2.slice(0, 8).join(', ')}]`);
    
    const rootsMatch = JSON.stringify(rootArray) === JSON.stringify(rootArray2);
    
    if (rootsMatch) {
      console.log(`   ✅ Proofs are consistent (good!)`);
    } else {
      console.log(`   ⚠️  Proof roots differ (tree state is changing)`);
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 Summary:');
    console.log(`   Asset fetch time: ${assetDuration}ms`);
    console.log(`   Proof fetch time: ${proofDuration}ms (attempt 1)`);
    console.log(`   Proof fetch time: ${proofDuration2}ms (attempt 2)`);
    console.log(`   Proofs consistent: ${rootsMatch ? 'Yes ✅' : 'No ⚠️'}`);
    
    if (assetDuration < 1000 && proofDuration < 1000 && rootsMatch) {
      console.log('\n✅ cNFT is FULLY INDEXED and ready for swaps!');
      console.log('   DAS API is providing fresh, consistent proofs.');
      process.exit(0);
    } else if (assetDuration > 2000 || proofDuration > 2000) {
      console.log('\n⚠️  DAS API is slow (>2 seconds)');
      console.log('   May indicate caching or indexing issues.');
      console.log('   Wait a few more minutes and try again.');
      process.exit(1);
    } else if (!rootsMatch) {
      console.log('\n⚠️  Proofs are changing (tree state is active)');
      console.log('   Wait for tree to stabilize before running swaps.');
      process.exit(1);
    } else {
      console.log('\n✅ DAS API appears healthy');
      console.log('   cNFT should be ready for swaps.');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

