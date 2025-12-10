/**
 * Script to check cNFT Merkle tree canopy depth and atomic swap compatibility
 * 
 * Usage:
 *   npx ts-node scripts/check-cnft-compatibility.ts <merkle-tree-address>
 *   npx ts-node scripts/check-cnft-compatibility.ts <cnft-asset-id>
 * 
 * Example:
 *   npx ts-node scripts/check-cnft-compatibility.ts HvMssGnfiRk2187Kw56qXUfWpgiPJ18Y4AyHMJwLZDec
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

// RPC URL - use mainnet by default
const RPC_URL = process.env.MAINNET_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Bubblegum Tree Config PDA seed
const TREE_CONFIG_SEED = 'tree_config';
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');

// Transaction size limits
const MAX_TRANSACTION_SIZE = 1232; // Solana's limit
const BASE_SWAP_SIZE = 900; // Approximate base size for atomic swap without proof
const PROOF_NODE_SIZE = 32; // Each proof node is 32 bytes

interface TreeInfo {
  maxDepth: number;
  maxBufferSize: number;
  canopyDepth: number;
  proofNodesRequired: number;
  estimatedProofBytes: number;
  estimatedTotalSize: number;
  isCompatible: boolean;
  compatibilityNote: string;
}

async function getTreeConfigPDA(merkleTree: PublicKey): Promise<PublicKey> {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(TREE_CONFIG_SEED), merkleTree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  return pda;
}

async function fetchTreeInfo(connection: Connection, merkleTree: PublicKey): Promise<TreeInfo | null> {
  try {
    console.log(`\n📊 Fetching tree config for: ${merkleTree.toBase58()}`);
    
    const treeConfigPDA = await getTreeConfigPDA(merkleTree);
    console.log(`   Tree Config PDA: ${treeConfigPDA.toBase58()}`);
    
    const accountInfo = await connection.getAccountInfo(treeConfigPDA);
    
    if (!accountInfo) {
      console.error('❌ Tree config account not found');
      return null;
    }
    
    // Parse tree config data
    // TreeConfig layout:
    // - discriminator: 8 bytes
    // - tree_creator: 32 bytes
    // - tree_delegate: 32 bytes
    // - total_mint_capacity: 8 bytes
    // - num_minted: 8 bytes
    // - is_public: 1 byte
    // - is_decompressible: 1 byte (enum, 1 byte for variant)
    
    // Get the concurrent merkle tree account to read actual tree params
    const treeAccountInfo = await connection.getAccountInfo(merkleTree);
    
    if (!treeAccountInfo) {
      console.error('❌ Merkle tree account not found');
      return null;
    }
    
    // ConcurrentMerkleTree header layout:
    // - discriminator: 8 bytes
    // - max_buffer_size: 4 bytes (u32)
    // - max_depth: 4 bytes (u32)
    // - authority: 32 bytes
    // - creation_slot: 8 bytes
    // - is_batch_initialized: 1 byte
    // - padding: depends on version
    // - active_index: 8 bytes
    // - buffer_size: 8 bytes
    // - ... then change logs and canopy
    
    const data = treeAccountInfo.data;
    
    // Read header (after 8 byte discriminator)
    const maxBufferSize = data.readUInt32LE(8);
    const maxDepth = data.readUInt32LE(12);
    
    // Calculate canopy depth from account size
    // Account size = header + change_logs + rightmost_proof + canopy
    // header_size ≈ 72 bytes (varies slightly)
    // change_log_size = maxBufferSize * (32 + 4 + 32 + 32 * maxDepth)
    // rightmost_proof_size = 32 * maxDepth
    // canopy_size = (2^(canopyDepth + 1) - 2) * 32
    
    const accountSize = data.length;
    
    // Estimate based on common configurations
    // Most trees use canopy_depth = maxDepth - 5 to maxDepth - 8
    // We'll calculate it from the account size
    
    const headerSize = 72;
    const changeLogEntrySize = 32 + 4 + 32 + 32 * maxDepth; // path, index, root, rightmost_proof
    const changeLogSize = maxBufferSize * changeLogEntrySize;
    const rightmostProofSize = 32 * maxDepth;
    
    const estimatedCanopyStart = headerSize + changeLogSize + rightmostProofSize;
    const canopyBytes = accountSize - estimatedCanopyStart;
    
    // Canopy nodes = (2^(canopyDepth + 1) - 2)
    // Each node is 32 bytes
    // So canopyBytes = (2^(canopyDepth + 1) - 2) * 32
    // 2^(canopyDepth + 1) = (canopyBytes / 32) + 2
    // canopyDepth + 1 = log2((canopyBytes / 32) + 2)
    // canopyDepth = log2((canopyBytes / 32) + 2) - 1
    
    let canopyDepth = 0;
    if (canopyBytes > 0) {
      const canopyNodes = canopyBytes / 32;
      if (canopyNodes >= 2) {
        canopyDepth = Math.floor(Math.log2(canopyNodes + 2)) - 1;
      }
    }
    
    // Proof nodes required = maxDepth - canopyDepth
    const proofNodesRequired = Math.max(0, maxDepth - canopyDepth);
    
    // Estimate transaction size
    const estimatedProofBytes = proofNodesRequired * PROOF_NODE_SIZE + 32 + 32 + 32 + 8 + 4; // proof + root + dataHash + creatorHash + nonce + index
    const estimatedTotalSize = BASE_SWAP_SIZE + estimatedProofBytes;
    
    const isCompatible = estimatedTotalSize <= MAX_TRANSACTION_SIZE;
    
    let compatibilityNote = '';
    if (isCompatible) {
      compatibilityNote = '✅ Compatible with atomic swap (legacy transaction)';
    } else if (estimatedTotalSize <= MAX_TRANSACTION_SIZE + 500) {
      compatibilityNote = '⚠️ May work with Address Lookup Tables (ALT) - borderline';
    } else {
      compatibilityNote = '❌ Too large for atomic swap - proof exceeds transaction limit';
    }
    
    return {
      maxDepth,
      maxBufferSize,
      canopyDepth,
      proofNodesRequired,
      estimatedProofBytes,
      estimatedTotalSize,
      isCompatible,
      compatibilityNote,
    };
    
  } catch (error) {
    console.error('Error fetching tree info:', error);
    return null;
  }
}

async function fetchAssetTreeInfo(connection: Connection, assetId: string): Promise<{ treeAddress: string; treeInfo: TreeInfo | null }> {
  try {
    console.log(`\n🔍 Fetching asset info for: ${assetId}`);
    
    // Use DAS API to get asset data
    const response = await (connection as any)._rpcRequest('getAsset', {
      id: assetId,
    });
    
    const assetData = response?.result || response;
    
    if (!assetData) {
      throw new Error('No asset data returned');
    }
    
    // Check if it's a cNFT
    if (!assetData.compression?.compressed) {
      console.log('ℹ️  This is NOT a compressed NFT (cNFT)');
      
      // Check if it's a Core NFT
      const interfaceName = assetData.interface?.toLowerCase() || '';
      if (interfaceName.includes('core') || interfaceName === 'mplcoreasset') {
        console.log('ℹ️  This is a Metaplex Core NFT - no Merkle tree/canopy concerns!');
        console.log('✅ Core NFTs are compatible with atomic swap (simpler transfer mechanism)');
        return { treeAddress: '', treeInfo: null };
      }
      
      console.log('ℹ️  This appears to be a standard SPL NFT');
      console.log('✅ SPL NFTs are compatible with atomic swap');
      return { treeAddress: '', treeInfo: null };
    }
    
    const treeAddress = assetData.compression.tree;
    console.log(`   Merkle Tree: ${treeAddress}`);
    console.log(`   Leaf Index: ${assetData.compression.leaf_id}`);
    
    // Get tree info
    const treeInfo = await fetchTreeInfo(connection, new PublicKey(treeAddress));
    
    return { treeAddress, treeInfo };
    
  } catch (error) {
    console.error('Error fetching asset tree info:', error);
    return { treeAddress: '', treeInfo: null };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║     cNFT Merkle Tree Canopy Checker & Atomic Swap Compatibility   ║
╚═══════════════════════════════════════════════════════════════════╝

Usage:
  npx ts-node scripts/check-cnft-compatibility.ts <address>

The address can be:
  - A Merkle tree address
  - A cNFT asset ID
  - A collection address (will analyze a sample asset)

Examples:
  npx ts-node scripts/check-cnft-compatibility.ts HvMssGnfiRk2187Kw56qXUfWpgiPJ18Y4AyHMJwLZDec
  npx ts-node scripts/check-cnft-compatibility.ts 4fQGBGUbei59Wrf35L1xjmPZdDXZ6rgu4TVUKERnNkxV
    `);
    return;
  }
  
  const address = args[0];
  console.log(`\n🔗 RPC: ${RPC_URL}`);
  
  const connection = new Connection(RPC_URL, 'confirmed');
  
  // First, try to fetch as an asset (cNFT or other)
  let result = await fetchAssetTreeInfo(connection, address);
  
  if (result.treeAddress && result.treeInfo) {
    // Successfully got tree info from asset
    printTreeInfo(result.treeInfo, result.treeAddress);
  } else if (!result.treeAddress) {
    // Might be a tree address directly
    try {
      const pubkey = new PublicKey(address);
      const treeInfo = await fetchTreeInfo(connection, pubkey);
      
      if (treeInfo) {
        printTreeInfo(treeInfo, address);
      } else {
        // Try searching for assets in this collection
        console.log('\n🔍 Searching for cNFTs in this collection...');
        await searchCollectionAssets(connection, address);
      }
    } catch (e) {
      console.error('Invalid address format');
    }
  }
}

async function searchCollectionAssets(connection: Connection, collectionAddress: string) {
  try {
    const response = await (connection as any)._rpcRequest('searchAssets', {
      grouping: ['collection', collectionAddress],
      page: 1,
      limit: 5,
    });
    
    const assets = response?.result?.items || [];
    
    if (assets.length === 0) {
      console.log('No assets found in this collection');
      return;
    }
    
    console.log(`Found ${assets.length} assets in collection`);
    
    // Check first asset that's a cNFT
    for (const asset of assets) {
      if (asset.compression?.compressed) {
        console.log(`\nAnalyzing sample cNFT: ${asset.id}`);
        const result = await fetchAssetTreeInfo(connection, asset.id);
        if (result.treeInfo) {
          printTreeInfo(result.treeInfo, result.treeAddress);
        }
        return;
      }
    }
    
    console.log('No compressed NFTs found in this collection - may be Core NFTs or SPL NFTs');
    
  } catch (error) {
    console.error('Error searching collection:', error);
  }
}

function printTreeInfo(info: TreeInfo, treeAddress: string) {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                    MERKLE TREE ANALYSIS                           ║
╚═══════════════════════════════════════════════════════════════════╝

📍 Tree Address: ${treeAddress}

┌─────────────────────────────────────────────────────────────────┐
│ Tree Parameters                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Max Depth:          ${String(info.maxDepth).padEnd(10)} (2^${info.maxDepth} = ${Math.pow(2, info.maxDepth).toLocaleString()} max leaves)
│ Max Buffer Size:    ${String(info.maxBufferSize).padEnd(10)} (concurrent updates)
│ Canopy Depth:       ${String(info.canopyDepth).padEnd(10)} (on-chain proof nodes)
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Proof Requirements                                              │
├─────────────────────────────────────────────────────────────────┤
│ Proof Nodes Required: ${String(info.proofNodesRequired).padEnd(8)} (maxDepth - canopyDepth)
│ Estimated Proof Size: ${String(info.estimatedProofBytes + ' bytes').padEnd(14)}
│ Base Swap Size:       ${String(BASE_SWAP_SIZE + ' bytes').padEnd(14)}
│ Estimated Total:      ${String(info.estimatedTotalSize + ' bytes').padEnd(14)}
│ Max Allowed:          ${String(MAX_TRANSACTION_SIZE + ' bytes').padEnd(14)}
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Atomic Swap Compatibility                                       │
├─────────────────────────────────────────────────────────────────┤
│ ${info.compatibilityNote.padEnd(63)} │
└─────────────────────────────────────────────────────────────────┘

${info.isCompatible ? '✅ This cNFT collection CAN be used in atomic swaps!' : '❌ This cNFT collection is NOT compatible with atomic swaps.'}

${!info.isCompatible ? `
💡 Recommendation:
   - Use a collection with higher canopy depth (${Math.max(0, info.maxDepth - 8)}+ recommended)
   - Or swap individual NFTs from collections with canopy >= ${info.maxDepth - 10}
   - The transaction exceeds Solana's ${MAX_TRANSACTION_SIZE} byte limit
` : ''}
`);
}

main().catch(console.error);

