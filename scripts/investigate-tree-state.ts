/**
 * Investigate Merkle Tree State
 * Compares on-chain tree root with DAS API responses
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import axios from 'axios';
import bs58 from 'bs58';

dotenv.config({ path: '.env.staging' });

const TREE_ADDRESS = 'H47jXeKnijdgzKPnrdWyZ2dPpQQbDGAtcgoQvwWohNgz';
const CNFT_ASSET_ID = '7BC3X263a9N3BepgLa69LpTY2ZjwQr5ZeCCqEC7Xs1YM';
// Hardcoded for investigation (env loading has issues)
const HELIUS_RPC = 'https://devnet.helius-rpc.com/?api-key=5a8c5d8d-15c2-4dc3-8ceb-109cd9baa8b8';
const QUICKNODE_RPC = 'https://red-quaint-wind.solana-devnet.quiknode.pro/7306a6f82b57d473dd2bb175986828be9c121355';

async function getDasProof(rpcUrl: string, assetId: string): Promise<any> {
  const response = await axios.post(rpcUrl, {
    jsonrpc: '2.0',
    id: 'proof-check',
    method: 'getAssetProof',
    params: { id: assetId },
  });
  return response.data.result;
}

async function getOnChainTreeAccount(connection: Connection, treeAddress: PublicKey) {
  const accountInfo = await connection.getAccountInfo(treeAddress);
  
  if (!accountInfo) {
    throw new Error('Tree account not found');
  }

  // Concurrent Merkle Tree account structure (simplified):
  // - Header (discriminator + metadata)
  // - Tree data (including root)
  // The exact offset depends on the account compression version
  
  // Common offsets where the root might be:
  const possibleRootOffsets = [
    8,   // After discriminator
    16,  // Common header size
    24,  // Alternative header
    32,  // Another common position
    40,
    48,
    56,
    64,
    72,
    80,
  ];

  const roots: { offset: number; bytes: number[] }[] = [];
  
  for (const offset of possibleRootOffsets) {
    if (offset + 32 <= accountInfo.data.length) {
      const bytes = Array.from(accountInfo.data.slice(offset, offset + 32));
      roots.push({ offset, bytes });
    }
  }

  return {
    owner: accountInfo.owner.toBase58(),
    dataLength: accountInfo.data.length,
    lamports: accountInfo.lamports,
    possibleRoots: roots,
    rawData: accountInfo.data,
  };
}

async function investigateTreeState() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Merkle Tree State Investigation                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`🌳 Tree Address: ${TREE_ADDRESS}`);
  console.log(`📦 cNFT Asset ID: ${CNFT_ASSET_ID}\n`);

  // Test with both RPCs
  const rpcs = [
    { name: 'Helius (Staging Backend)', url: HELIUS_RPC },
    { name: 'QuickNode (Local Tests)', url: QUICKNODE_RPC },
  ];

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📡 Step 1: Fetching DAS API Proofs from Different RPCs\n');

  const proofResults: { name: string; root: number[]; nodeIndex: number }[] = [];

  for (const rpc of rpcs) {
    try {
      console.log(`🔍 ${rpc.name}...`);
      const proof = await getDasProof(rpc.url, CNFT_ASSET_ID);
      const rootBytes = Array.from(bs58.decode(proof.root)).slice(0, 8);
      proofResults.push({
        name: rpc.name,
        root: rootBytes,
        nodeIndex: proof.node_index,
      });
      console.log(`   Root (first 8): [${rootBytes.join(', ')}]`);
      console.log(`   Node Index: ${proof.node_index}`);
      console.log(`   Proof Length: ${proof.proof.length}`);
      console.log('');
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔗 Step 2: Fetching On-Chain Tree Account Data\n');

  const connection = new Connection(HELIUS_RPC, 'confirmed');
  const treePublicKey = new PublicKey(TREE_ADDRESS);

  const treeAccount = await getOnChainTreeAccount(connection, treePublicKey);

  console.log('📦 Tree Account Info:');
  console.log(`   Owner: ${treeAccount.owner}`);
  console.log(`   Data Length: ${treeAccount.dataLength} bytes`);
  console.log(`   Lamports: ${treeAccount.lamports / 1e9} SOL\n`);

  console.log('🔍 Possible Root Locations in Account Data:');
  for (const root of treeAccount.possibleRoots) {
    const first8 = root.bytes.slice(0, 8);
    console.log(`   Offset ${root.offset}: [${first8.join(', ')}]`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Step 3: Comparison Analysis\n');

  console.log('🎯 Test Proof Root (from failed transaction):');
  console.log('   [163, 10, 130, 225, 21, 84, 71, 205]\n');

  console.log('🔍 DAS API Roots:');
  for (const result of proofResults) {
    const matches = result.root.join(',') === '163,10,130,225,21,84,71,205';
    console.log(`   ${result.name}: [${result.root.join(', ')}] ${matches ? '✅ MATCH' : '❌ DIFFERENT'}`);
  }

  console.log('\n🔍 On-Chain Roots (possible locations):');
  let foundMatch = false;
  for (const root of treeAccount.possibleRoots) {
    const first8 = root.bytes.slice(0, 8);
    const matches = first8.join(',') === '163,10,130,225,21,84,71,205';
    if (matches) {
      console.log(`   Offset ${root.offset}: [${first8.join(', ')}] ✅ MATCH FOUND!`);
      foundMatch = true;
    } else {
      console.log(`   Offset ${root.offset}: [${first8.join(', ')}]`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔬 Step 4: Tree Activity Check\n');

  try {
    console.log('🔍 Fetching recent signatures for tree account...');
    const signatures = await connection.getSignaturesForAddress(treePublicKey, { limit: 20 });
    
    console.log(`   Found ${signatures.length} recent transactions\n`);
    
    if (signatures.length > 0) {
      console.log('   Most recent transactions:');
      signatures.slice(0, 5).forEach((sig, i) => {
        const date = new Date(sig.blockTime! * 1000);
        console.log(`   ${i + 1}. ${sig.signature.slice(0, 20)}...`);
        console.log(`      Time: ${date.toISOString()}`);
        console.log(`      Status: ${sig.err ? 'Failed' : 'Success'}`);
      });
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not fetch signatures: ${error.message}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('💡 Analysis Summary:\n');

  if (proofResults.length > 1) {
    const heliusRoot = proofResults[0]?.root.join(',');
    const quicknodeRoot = proofResults[1]?.root.join(',');
    
    if (heliusRoot === quicknodeRoot) {
      console.log('✅ Both Helius and QuickNode return the SAME root');
      console.log('   → DAS APIs are consistent\n');
    } else {
      console.log('❌ Helius and QuickNode return DIFFERENT roots!');
      console.log('   → DAS API inconsistency detected\n');
    }
  }

  if (foundMatch) {
    console.log('✅ Test proof root MATCHES on-chain tree data');
    console.log('   → Proof is correct, but program still rejects it');
    console.log('   → Possible causes:');
    console.log('     1. Proof path is incorrect (wrong nodes)');
    console.log('     2. Data hash or creator hash mismatch');
    console.log('     3. Leaf verification failing for other reasons\n');
  } else {
    console.log('❌ Test proof root does NOT match any on-chain location');
    console.log('   → Tree root has changed since proof was generated');
    console.log('   → Possible causes:');
    console.log('     1. Tree was modified between proof fetch and transaction');
    console.log('     2. DAS API cache is stale');
    console.log('     3. Wrong tree is being queried\n');
  }

  console.log('🔍 Next Steps:');
  if (!foundMatch) {
    console.log('   1. Try minting a fresh cNFT to current tree state');
    console.log('   2. Check if tree has >1 leaf (multiple mints)');
    console.log('   3. Verify DAS API is indexing recent tree changes');
  } else {
    console.log('   1. Check data_hash and creator_hash in proof');
    console.log('   2. Verify leaf_id matches tree structure');
    console.log('   3. Test with different canopy depth');
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Investigation Complete                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

investigateTreeState().catch(console.error);

