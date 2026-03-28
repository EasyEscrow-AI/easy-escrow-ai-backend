/**
 * Verify cNFT Hashes
 * Check if data_hash and creator_hash from DAS API are correct
 */

import axios from 'axios';
import bs58 from 'bs58';

const HELIUS_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const CNFT_ASSET_ID = '9krakwJJwGHSPwgrC9mJbnazM7hhZomoeGQrn2xcVAT7';

async function getDasAsset(assetId: string) {
  const response = await axios.post(HELIUS_RPC, {
    jsonrpc: '2.0',
    id: `asset-${Date.now()}`,
    method: 'getAsset',
    params: { id: assetId },
  });
  return response.data.result;
}

async function getDasProof(assetId: string) {
  const response = await axios.post(HELIUS_RPC, {
    jsonrpc: '2.0',
    id: `proof-${Date.now()}`,
    method: 'getAssetProof',
    params: { id: assetId },
  });
  return response.data.result;
}

async function verifyHashes() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   cNFT HASH VERIFICATION                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Get asset data
  console.log('🔍 Fetching asset data from DAS API...\n');
  const asset = await getDasAsset(CNFT_ASSET_ID);
  
  console.log('📊 Asset Metadata:');
  console.log(`   Name: ${asset.content?.metadata?.name}`);
  console.log(`   Symbol: ${asset.content?.metadata?.symbol}`);
  console.log(`   URI: ${asset.content?.json_uri}`);
  console.log(`   Mutable: ${asset.content?.metadata?.mutable}`);
  console.log(`   Primary Sale Happened: ${asset.content?.metadata?.primary_sale_happened}\n`);

  console.log('📊 Creators:');
  if (asset.creators && asset.creators.length > 0) {
    asset.creators.forEach((creator: any, i: number) => {
      console.log(`   ${i + 1}. ${creator.address}`);
      console.log(`      Share: ${creator.share}%`);
      console.log(`      Verified: ${creator.verified}\n`);
    });
  } else {
    console.log('   No creators\n');
  }

  console.log('📊 Compression Data:');
  console.log(`   Tree: ${asset.compression?.tree}`);
  console.log(`   Leaf ID: ${asset.compression?.leaf_id}`);
  console.log(`   Data Hash: ${asset.compression?.data_hash}`);
  console.log(`   Creator Hash: ${asset.compression?.creator_hash}\n`);

  // Get proof
  console.log('🔍 Fetching proof from DAS API...\n');
  const proof = await getDasProof(CNFT_ASSET_ID);
  
  console.log('📊 Proof Data:');
  console.log(`   Root: ${proof.root}`);
  console.log(`   Node Index: ${proof.node_index}`);
  console.log(`   Leaf: ${proof.leaf}`);
  console.log(`   Tree ID: ${proof.tree_id}`);
  console.log(`   Proof Length: ${proof.proof.length}\n`);

  // Decode hashes
  const dataHashBytes = Array.from(bs58.decode(asset.compression.data_hash));
  const creatorHashBytes = Array.from(bs58.decode(asset.compression.creator_hash));
  const rootBytes = Array.from(bs58.decode(proof.root));

  console.log('🔢 Decoded Hashes (first 8 bytes):');
  console.log(`   Data Hash: [${dataHashBytes.slice(0, 8).join(', ')}]`);
  console.log(`   Creator Hash: [${creatorHashBytes.slice(0, 8).join(', ')}]`);
  console.log(`   Root: [${rootBytes.slice(0, 8).join(', ')}]\n`);

  // Show proof nodes
  console.log('📊 Proof Nodes (after canopy trim):');
  const CANOPY_DEPTH = 11;
  const trimmedProof = proof.proof.slice(CANOPY_DEPTH);
  console.log(`   Full proof length: ${proof.proof.length}`);
  console.log(`   After trim (canopy ${CANOPY_DEPTH}): ${trimmedProof.length}\n`);
  
  trimmedProof.forEach((node: string, i: number) => {
    const nodeBytes = Array.from(bs58.decode(node));
    console.log(`   Node ${i + 1}: [${nodeBytes.slice(0, 8).join(', ')}...]`);
  });

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Complete                                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

verifyHashes().catch(console.error);

