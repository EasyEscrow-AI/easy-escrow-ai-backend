/**
 * Debug DAS API Caching
 * Make multiple rapid getAssetProof calls to see if DAS API returns identical data
 */

import axios from 'axios';
import bs58 from 'bs58';

const RPC_URL = 'https://red-quaint-wind.solana-devnet.quiknode.pro/7306a6f82b57d473dd2bb175986828be9c121355';
const CNFT_ASSET_ID = '2q3TWSmbKSqYD3DqrScPRHsNpwjGK83ouKSyqKEKwgjG'; // Fresh cNFT

async function getProof(assetId: string) {
  const response = await axios.post(RPC_URL, {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'getAssetProof',
    params: { id: assetId },
  });
  
  return response.data.result;
}

async function debugDasCaching() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   DAS API CACHING DEBUG                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`🔍 Testing with fresh cNFT: ${CNFT_ASSET_ID}`);
  console.log(`📡 RPC: ${RPC_URL}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Making 5 rapid getAssetProof calls (< 1 second apart)\n');

  const proofs = [];

  for (let i = 1; i <= 5; i++) {
    const start = Date.now();
    const proof = await getProof(CNFT_ASSET_ID);
    const duration = Date.now() - start;
    
    const rootBytes = Array.from(bs58.decode(proof.root)).slice(0, 8);
    proofs.push({
      attempt: i,
      root: proof.root,
      rootBytes,
      nodeIndex: proof.node_index,
      proofLength: proof.proof.length,
      duration,
    });

    console.log(`   ${i}. Root: [${rootBytes.join(', ')}]`);
    console.log(`      Full: ${proof.root}`);
    console.log(`      Duration: ${duration}ms\n`);
    
    // Wait 200ms between calls
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Analysis:\n');

  // Check if all roots are identical
  const uniqueRoots = new Set(proofs.map(p => p.root));
  
  if (uniqueRoots.size === 1) {
    console.log('❌ ALL ROOTS ARE IDENTICAL');
    console.log('   → DAS API is likely caching responses');
    console.log('   → This explains why rebuildTransaction doesn\'t help\n');
  } else {
    console.log(`✅ Found ${uniqueRoots.size} different roots`);
    console.log('   → DAS API is returning fresh data\n');
    console.log('   Unique roots:');
    uniqueRoots.forEach((root, i) => {
      const bytes = Array.from(bs58.decode(root)).slice(0, 8);
      console.log(`   ${i + 1}. [${bytes.join(', ')}]`);
    });
  }

  // Check response times
  const avgDuration = proofs.reduce((sum, p) => sum + p.duration, 0) / proofs.length;
  console.log(`\n⏱️  Average response time: ${avgDuration.toFixed(0)}ms`);
  
  if (avgDuration < 50) {
    console.log('   → Very fast responses suggest caching');
  } else if (avgDuration < 200) {
    console.log('   → Moderate response times');
  } else {
    console.log('   → Slow responses suggest fresh computation');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔬 Detailed Proof Data:\n');

  const firstProof = await getProof(CNFT_ASSET_ID);
  const asset = await axios.post(RPC_URL, {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'getAsset',
    params: { id: CNFT_ASSET_ID },
  });

  const assetData = asset.data.result;
  
  console.log('📦 Asset Compression Data:');
  console.log(`   data_hash: ${assetData.compression.data_hash}`);
  console.log(`   creator_hash: ${assetData.compression.creator_hash}`);
  console.log(`   leaf_id: ${assetData.compression.leaf_id}`);
  console.log(`   tree: ${assetData.compression.tree}\n`);

  console.log('🔐 Proof Data:');
  console.log(`   root: ${firstProof.root}`);
  console.log(`   node_index: ${firstProof.node_index}`);
  console.log(`   leaf: ${firstProof.leaf}`);
  console.log(`   tree_id: ${firstProof.tree_id}\n`);

  // Decode hashes
  const dataHashBytes = Array.from(bs58.decode(assetData.compression.data_hash));
  const creatorHashBytes = Array.from(bs58.decode(assetData.compression.creator_hash));
  const rootBytes = Array.from(bs58.decode(firstProof.root));

  console.log('📊 Decoded Bytes (first 8):');
  console.log(`   data_hash: [${dataHashBytes.slice(0, 8).join(', ')}]`);
  console.log(`   creator_hash: [${creatorHashBytes.slice(0, 8).join(', ')}]`);
  console.log(`   root: [${rootBytes.slice(0, 8).join(', ')}]`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Debug Complete                                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

debugDasCaching().catch(console.error);

