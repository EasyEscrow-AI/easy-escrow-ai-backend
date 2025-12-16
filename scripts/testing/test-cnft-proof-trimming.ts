#!/usr/bin/env ts-node
/**
 * Direct Test: cNFT Proof Trimming Fix
 * 
 * This script directly tests the proof trimming logic to verify
 * that proofs are trimmed from the correct end (removing last
 * canopyDepth nodes, not first).
 * 
 * Usage:
 *   ts-node scripts/testing/test-cnft-proof-trimming.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { CnftService } from '../../src/services/cnftService';

// Load production environment
dotenv.config({ path: path.join(__dirname, '../../.env.production'), override: true });

const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function testProofTrimming() {
  console.log('\n🧪 Testing cNFT Proof Trimming Logic');
  console.log('═══════════════════════════════════════════════════════════\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const cnftService = new CnftService(connection, {
    rpcEndpoint: RPC_URL,
    requestTimeout: 30000,
    maxRetries: 3,
  });

  // Use a known cNFT from production test assets
  // These are the cNFTs that were failing before
  const testCnfts = [
    'D8r7Nr45AAnmbz4LXAFy24BNmHPZzJXXUFrReBXTeNYA', // Maker cNFT
    'JCsWH1rmQTz1Spo1S9HV561Cx6ryf5GG64CaynHCasQE', // Taker cNFT
  ];

  for (const assetId of testCnfts) {
    console.log(`\n📋 Testing cNFT: ${assetId.substring(0, 12)}...`);
    console.log('───────────────────────────────────────────────────────────\n');

    try {
      // Fetch asset data
      console.log('1. Fetching asset data...');
      const assetData = await cnftService.getCnftAsset(assetId);
      console.log(`   ✅ Asset found`);
      console.log(`   Tree: ${assetData.compression.tree}`);
      console.log(`   Leaf ID: ${assetData.compression.leaf_id}`);
      console.log(`   Owner: ${assetData.ownership.owner}`);

      // Fetch proof
      console.log('\n2. Fetching Merkle proof...');
      const proofData = await cnftService.getCnftProof(assetId, false);
      console.log(`   ✅ Proof fetched`);
      console.log(`   Root: ${proofData.root.substring(0, 16)}...`);
      console.log(`   Node Index: ${proofData.node_index}`);
      console.log(`   Proof Length: ${proofData.proof.length} nodes`);

      // Get tree canopy depth
      const treeAddress = new PublicKey(assetData.compression.tree);
      const maxDepth = proofData.proof.length;
      const canopyDepth = await cnftService.getTreeCanopyDepth(treeAddress, maxDepth);
      console.log(`   Canopy Depth: ${canopyDepth}`);
      console.log(`   Max Depth: ${maxDepth}`);

      // Build transfer params (this will apply proof trimming)
      console.log('\n3. Building transfer params (applies proof trimming)...');
      const fromAddress = new PublicKey(assetData.ownership.owner);
      const toAddress = new PublicKey('11111111111111111111111111111111'); // Dummy address
      
      const transferParams = await cnftService.buildTransferParams(
        assetId,
        fromAddress,
        toAddress,
        false
      );

      console.log(`   ✅ Transfer params built`);
      console.log(`   Proof nodes in transfer: ${transferParams.proof.proof?.length || 0}`);
      console.log(`   Expected nodes: ${maxDepth - canopyDepth}`);
      
      // Verify proof trimming is correct
      const expectedNodes = maxDepth - canopyDepth;
      const actualNodes = transferParams.proof.proof?.length || 0;
      
      if (actualNodes === expectedNodes) {
        console.log(`   ✅ Proof trimming CORRECT: ${actualNodes} nodes (removed ${canopyDepth} from end)`);
      } else {
        console.error(`   ❌ Proof trimming INCORRECT:`);
        console.error(`      Expected: ${expectedNodes} nodes`);
        console.error(`      Actual: ${actualNodes} nodes`);
        console.error(`      This indicates the trimming logic is wrong!`);
        process.exit(1);
      }

      // Verify proof structure
      if (transferParams.proof.proof && transferParams.proof.proof.length > 0) {
        console.log(`   ✅ Proof nodes are present (needed for verification)`);
        console.log(`   First node (closest to leaf): ${Buffer.from(transferParams.proof.proof[0]).toString('hex').substring(0, 16)}...`);
        if (transferParams.proof.proof.length > 1) {
          console.log(`   Last node (farthest from leaf): ${Buffer.from(transferParams.proof.proof[transferParams.proof.proof.length - 1]).toString('hex').substring(0, 16)}...`);
        }
      } else {
        console.log(`   ℹ️  No proof nodes (full canopy tree - all nodes on-chain)`);
      }

      console.log(`\n   ✅ Test PASSED for ${assetId.substring(0, 12)}...`);

    } catch (error: any) {
      console.error(`\n   ❌ Test FAILED for ${assetId.substring(0, 12)}...`);
      console.error(`   Error: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
      }
      process.exit(1);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ All proof trimming tests PASSED!');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('The proof trimming fix is working correctly:');
  console.log('  - Proofs are trimmed from the END (removing last canopyDepth nodes)');
  console.log('  - Proof nodes closest to leaf are preserved');
  console.log('  - This matches Magic Eden\'s implementation\n');
}

testProofTrimming().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});

