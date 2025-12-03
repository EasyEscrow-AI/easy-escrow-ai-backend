/**
 * Check On-Chain Merkle Tree Root
 * Fetches the actual tree root from the blockchain to compare with proofs
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: '.env.staging' });

const TREE_ADDRESS = 'H47jXeKnijdgzKPnrdWyZ2dPpQQbDGAtcgoQvwWohNgz';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

async function checkTreeRoot() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Check On-Chain Merkle Tree Root                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`📡 RPC: ${RPC_URL}`);
  console.log(`🌳 Tree: ${TREE_ADDRESS}\n`);

  const connection = new Connection(RPC_URL, 'confirmed');
  const treePublicKey = new PublicKey(TREE_ADDRESS);

  try {
    // Fetch account data
    console.log('🔍 Fetching tree account data...');
    const accountInfo = await connection.getAccountInfo(treePublicKey);

    if (!accountInfo) {
      console.log('❌ Tree account not found!');
      return;
    }

    console.log(`✅ Tree account found`);
    console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
    console.log(`   Data length: ${accountInfo.data.length} bytes`);
    console.log(`   Lamports: ${accountInfo.lamports / 1e9} SOL\n`);

    // The tree root is stored in the account data
    // For concurrent merkle trees, the structure is complex
    // Let's just show the first 100 bytes to inspect
    console.log('📦 First 100 bytes of tree data:');
    const first100 = accountInfo.data.slice(0, 100);
    console.log(first100);
    console.log('');

    // The root might be at a specific offset
    // For Bubblegum trees, we need to find the right offset
    console.log('🔍 Searching for root in account data...');
    
    // Try different offsets where the root might be
    const possibleOffsets = [8, 16, 24, 32, 40, 48, 56, 64];
    
    for (const offset of possibleOffsets) {
      const bytes = Array.from(accountInfo.data.slice(offset, offset + 32));
      const first8 = bytes.slice(0, 8);
      console.log(`   Offset ${offset}: [${first8.join(', ')}]`);
    }

    console.log('\n📋 Compare with proof root from test:');
    console.log('   Test showed: [163, 10, 130, 225, 21, 84, 71, 205]');
    console.log('');
    console.log('💡 If these match, the proof is CORRECT and tree hasn\'t changed!');
    console.log('   If they don\'t match, Helius is returning stale data.');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkTreeRoot().catch(console.error);

