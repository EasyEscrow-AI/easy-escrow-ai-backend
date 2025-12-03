/**
 * Compare DAS API Root vs On-Chain Root
 * Verify if the root from getAssetProof matches the actual on-chain tree state
 */

import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import bs58 from 'bs58';

const HELIUS_RPC = 'https://devnet.helius-rpc.com/?api-key=5a8c5d8d-15c2-4dc3-8ceb-109cd9baa8b8';
const TREE_ADDRESS = 'Ev6gUCjpQCT3VCpfMHyEXkdyqXJPGPVxempiWKUsza7d';
const CNFT_ASSET_ID = '9krakwJJwGHSPwgrC9mJbnazM7hhZomoeGQrn2xcVAT7';

async function getDasProof(assetId: string) {
  const response = await axios.post(HELIUS_RPC, {
    jsonrpc: '2.0',
    id: `unique-${Date.now()}-${Math.random()}`,
    method: 'getAssetProof',
    params: { id: assetId },
  });
  return response.data.result;
}

async function compareRoots() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   DAS API vs ON-CHAIN ROOT COMPARISON                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const connection = new Connection(HELIUS_RPC, 'confirmed');
  const treePublicKey = new PublicKey(TREE_ADDRESS);

  // Get DAS API proof
  console.log('🔍 Fetching proof from DAS API (Helius)...\n');
  const dasProof = await getDasProof(CNFT_ASSET_ID);
  const dasRootBytes = Array.from(bs58.decode(dasProof.root));
  
  console.log('📊 DAS API Root:');
  console.log(`   First 8 bytes: [${dasRootBytes.slice(0, 8).join(', ')}]`);
  console.log(`   Base58: ${dasProof.root}`);
  console.log(`   Full: [${dasRootBytes.join(', ')}]\n`);

  // Get on-chain tree account
  console.log('🔗 Fetching on-chain tree account data...\n');
  const accountInfo = await connection.getAccountInfo(treePublicKey);
  
  if (!accountInfo) {
    throw new Error('Tree account not found');
  }

  console.log('📦 Tree Account Info:');
  console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
  console.log(`   Data Length: ${accountInfo.data.length} bytes\n`);

  // Try to find the DAS root in the account data
  console.log('🔎 Searching for DAS root in on-chain data...\n');
  
  let found = false;
  const searchBytes = dasRootBytes.slice(0, 8); // Search for first 8 bytes
  
  for (let i = 0; i < accountInfo.data.length - 8; i++) {
    const slice = Array.from(accountInfo.data.slice(i, i + 8));
    if (slice.every((byte, idx) => byte === searchBytes[idx])) {
      found = true;
      console.log(`   ✅ FOUND at offset ${i}!`);
      console.log(`   Context: [${Array.from(accountInfo.data.slice(i, i + 32)).join(', ')}]\n`);
      break;
    }
  }

  if (!found) {
    console.log('   ❌ NOT FOUND in tree account data!\n');
    
    console.log('📊 Showing first few potential roots from tree data:\n');
    // Show first 5 32-byte chunks from different offsets
    const offsets = [0, 100, 200, 300, 400];
    offsets.forEach(offset => {
      const chunk = Array.from(accountInfo.data.slice(offset, offset + 32));
      console.log(`   Offset ${offset}: [${chunk.slice(0, 8).join(', ')}...]`);
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🎯 CONCLUSION:\n');

  if (found) {
    console.log('   ✅ DAS API root matches on-chain data');
    console.log('   → The root is valid, but there may be other issues');
    console.log('   → Check data_hash, creator_hash, or proof path\n');
  } else {
    console.log('   ❌ DAS API root DOES NOT match on-chain data!');
    console.log('   → Helius indexer is returning STALE/INCORRECT data');
    console.log('   → This explains why all transactions fail');
    console.log('   → The root may be from before the cNFT was minted\n');
    
    console.log('💡 RECOMMENDATIONS:\n');
    console.log('   1. Wait 5-10 minutes for Helius to fully index the tree');
    console.log('   2. Or create tree using an older/more established RPC');
    console.log('   3. Or contact Helius support about indexing delays\n');
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Analysis Complete                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

compareRoots().catch(console.error);

