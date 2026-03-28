/**
 * Check Changelog Buffer
 * Verify if the tree has had >64 updates since cNFT was minted
 */

import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import bs58 from 'bs58';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const TREE_ADDRESS = 'HTVCa1CKzeaLwZsrPFP6BgPp7wfSoeJMQfNses5PBhhA';
const CNFT_ASSET_ID = '2q3TWSmbKSqYD3DqrScPRHsNpwjGK83ouKSyqKEKwgjG';

async function getDasProof(assetId: string) {
  const response = await axios.post(RPC_URL, {
    jsonrpc: '2.0',
    id: 'get-proof',
    method: 'getAssetProof',
    params: { id: assetId },
  });
  return response.data.result;
}

async function checkChangelogBuffer() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   CHANGELOG BUFFER ANALYSIS                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const treePublicKey = new PublicKey(TREE_ADDRESS);

  // Get DAS API proof
  console.log('🔍 Fetching proof from DAS API...\n');
  const dasProof = await getDasProof(CNFT_ASSET_ID);
  const dasRootBytes = Array.from(bs58.decode(dasProof.root));
  console.log('📊 DAS API Proof Root:');
  console.log(`   [${dasRootBytes.slice(0, 8).join(', ')}]`);
  console.log(`   Full: ${dasProof.root}\n`);

  // Get tree account
  console.log('🔗 Fetching on-chain tree account...\n');
  const accountInfo = await connection.getAccountInfo(treePublicKey);
  
  if (!accountInfo) {
    throw new Error('Tree account not found');
  }

  console.log('📦 Tree Account Info:');
  console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
  console.log(`   Data Length: ${accountInfo.data.length} bytes\n`);

  // Parse tree header to get buffer size
  // Concurrent merkle tree header structure (simplified):
  // - Bytes 0-7: Discriminator
  // - Bytes 8-11: Max buffer size
  // - Bytes 12-15: Max depth
  // - Bytes 16+: Changelog and tree data
  
  const maxBufferSize = accountInfo.data.readUInt32LE(8);
  const maxDepth = accountInfo.data.readUInt32LE(12);
  
  console.log('🌳 Tree Configuration:');
  console.log(`   Max Depth: ${maxDepth}`);
  console.log(`   Max Buffer Size: ${maxBufferSize}`);
  console.log(`   Capacity: ${Math.pow(2, maxDepth)} leaves\n`);

  // Check recent activity
  console.log('📊 Recent Tree Activity:\n');
  const signatures = await connection.getSignaturesForAddress(treePublicKey, { limit: 100 });
  
  console.log(`   Total recent transactions: ${signatures.length}`);
  
  if (signatures.length > 0) {
    const firstTx = signatures[signatures.length - 1];
    const lastTx = signatures[0];
    
    const firstTime = new Date(firstTx.blockTime! * 1000);
    const lastTime = new Date(lastTx.blockTime! * 1000);
    const duration = (lastTime.getTime() - firstTime.getTime()) / 1000;
    
    console.log(`   Time range: ${duration.toFixed(0)}s`);
    console.log(`   First: ${firstTime.toISOString()}`);
    console.log(`   Last: ${lastTime.toISOString()}`);
    console.log(`   Transactions per second: ${(signatures.length / duration).toFixed(2)}\n`);
  }

  // Analysis
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🎯 ANALYSIS:\n');

  if (signatures.length >= maxBufferSize) {
    console.log(`❌ BUFFER EXHAUSTION LIKELY!`);
    console.log(`   Recent transactions (${signatures.length}) >= Buffer size (${maxBufferSize})`);
    console.log(`   The DAS API root is NO LONGER in the on-chain changelog!`);
    console.log(`   Proof cannot be fast-forwarded - it's too old!\n`);
    
    console.log('💡 WHY THIS HAPPENS:');
    console.log('   1. cNFT minted → Root A stored in tree');
    console.log('   2. 64+ other transactions occur → Roots B, C, D... X added');
    console.log('   3. Root A is EVICTED from the changelog (buffer full)');
    console.log('   4. DAS API still thinks Root A is valid (indexer lag)');
    console.log('   5. Transaction with Root A proof fails - root not found!\n');
  } else {
    console.log(`✅ Buffer still has capacity`);
    console.log(`   Recent transactions (${signatures.length}) < Buffer size (${maxBufferSize})`);
    console.log(`   Proof should be within valid range...\n`);
  }

  console.log('🔍 RECOMMENDATIONS:\n');
  
  if (signatures.length >= maxBufferSize) {
    console.log('   1. 🔴 IMMEDIATE: Wait for DAS API to index recent tree state');
    console.log('      → Indexers need time to catch up to current changelog');
    console.log('      → May take 1-5 minutes depending on provider\n');
    
    console.log('   2. 🟡 SHORT-TERM: Increase tree buffer size for new trees');
    console.log('      → Use buffer 256 or 1024 for higher activity trees');
    console.log('      → Costs more rent but prevents this issue\n');
    
    console.log('   3. 🟢 LONG-TERM: Implement changelog validation');
    console.log('      → Query on-chain changelog before using proof');
    console.log('      → Reject stale proofs immediately, don\'t retry\n');
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Analysis Complete                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

checkChangelogBuffer().catch(console.error);

