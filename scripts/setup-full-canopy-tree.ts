/**
 * Setup Full Canopy Tree for Staging Tests
 * 
 * Creates a Merkle tree with canopyDepth = maxDepth, meaning:
 * - All proof nodes are stored on-chain
 * - NO external proof nodes needed in transactions
 * - Eliminates stale proof issues entirely
 * 
 * Trade-off: Higher rent cost (~2 SOL) but bulletproof testing
 * 
 * Usage:
 *   npx ts-node scripts/setup-full-canopy-tree.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  createCreateTreeInstruction,
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
  ValidDepthSizePair,
} from '@solana/spl-account-compression';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment
dotenv.config({ path: '.env.staging' });

// Full canopy tree configuration
// maxDepth: 5 = 32 NFTs capacity (plenty for testing)
// canopyDepth: 5 = FULL CANOPY (no external proof nodes needed!)
const FULL_CANOPY_CONFIG = {
  maxDepth: 5 as ValidDepthSizePair['maxDepth'],
  maxBufferSize: 8 as ValidDepthSizePair['maxBufferSize'],
  canopyDepth: 5, // SAME AS maxDepth = full canopy!
};

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🌳 FULL CANOPY TREE SETUP FOR STAGING');
  console.log('='.repeat(70));
  console.log('\nThis creates a tree where ALL proof nodes are on-chain.');
  console.log('Result: No stale proof issues, single-transaction cNFT transfers!\n');

  // Connect to devnet
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  console.log(`📡 RPC: ${rpcUrl}`);

  // Load admin keypair (base58 format)
  const adminPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    throw new Error('DEVNET_STAGING_ADMIN_PRIVATE_KEY not set in .env.staging');
  }
  
  const admin = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
  console.log(`🔑 Admin: ${admin.publicKey.toBase58()}`);

  // Check admin balance
  const balance = await connection.getBalance(admin.publicKey);
  console.log(`💰 Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // Calculate tree account size and rent
  const treeAccountSize = getConcurrentMerkleTreeAccountSize(
    FULL_CANOPY_CONFIG.maxDepth,
    FULL_CANOPY_CONFIG.maxBufferSize,
    FULL_CANOPY_CONFIG.canopyDepth
  );
  const rentExemption = await connection.getMinimumBalanceForRentExemption(treeAccountSize);
  
  console.log('\n📊 Full Canopy Tree Configuration:');
  console.log(`   Max Depth: ${FULL_CANOPY_CONFIG.maxDepth} (capacity: ${2 ** FULL_CANOPY_CONFIG.maxDepth} NFTs)`);
  console.log(`   Buffer Size: ${FULL_CANOPY_CONFIG.maxBufferSize}`);
  console.log(`   Canopy Depth: ${FULL_CANOPY_CONFIG.canopyDepth} (FULL - matches maxDepth)`);
  console.log(`   Account Size: ${treeAccountSize} bytes`);
  console.log(`   Rent: ${rentExemption / LAMPORTS_PER_SOL} SOL`);
  console.log(`   ✅ Proof nodes needed: 0 (all on-chain!)`);

  if (balance < rentExemption + 0.01 * LAMPORTS_PER_SOL) {
    console.error(`\n❌ Insufficient balance. Need at least ${(rentExemption + 0.01 * LAMPORTS_PER_SOL) / LAMPORTS_PER_SOL} SOL`);
    console.log('   Run: solana airdrop 2 ' + admin.publicKey.toBase58() + ' --url devnet');
    process.exit(1);
  }

  // Generate new tree keypair
  const treeKeypair = Keypair.generate();
  console.log(`\n🌲 New Tree Address: ${treeKeypair.publicKey.toBase58()}`);

  // Derive tree authority PDA
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [treeKeypair.publicKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  console.log(`🔐 Tree Authority: ${treeAuthority.toBase58()}`);

  // Create the tree
  console.log('\n⏳ Creating full canopy tree...');

  // Allocate tree account
  const allocTreeIx = SystemProgram.createAccount({
    fromPubkey: admin.publicKey,
    newAccountPubkey: treeKeypair.publicKey,
    lamports: rentExemption,
    space: treeAccountSize,
    programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  });

  // Initialize tree with Bubblegum
  const createTreeIx = createCreateTreeInstruction(
    {
      treeAuthority,
      merkleTree: treeKeypair.publicKey,
      payer: admin.publicKey,
      treeCreator: admin.publicKey,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      maxDepth: FULL_CANOPY_CONFIG.maxDepth,
      maxBufferSize: FULL_CANOPY_CONFIG.maxBufferSize,
      public: false, // Only creator can mint
    }
  );

  const tx = new Transaction().add(allocTreeIx, createTreeIx);
  tx.feePayer = admin.publicKey;
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [admin, treeKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log(`✅ Tree created! Signature: ${signature}`);
    console.log(`   Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  } catch (error: any) {
    console.error('❌ Failed to create tree:', error.message);
    throw error;
  }

  // Save tree info
  const treeInfo = {
    address: treeKeypair.publicKey.toBase58(),
    authority: treeAuthority.toBase58(),
    maxDepth: FULL_CANOPY_CONFIG.maxDepth,
    maxBufferSize: FULL_CANOPY_CONFIG.maxBufferSize,
    canopyDepth: FULL_CANOPY_CONFIG.canopyDepth,
    isFullCanopy: true,
    proofNodesRequired: 0,
    createdAt: new Date().toISOString(),
    privateKey: Array.from(treeKeypair.secretKey),
  };

  const outputPath = path.join(__dirname, '../.taskmaster/staging-full-canopy-tree.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(treeInfo, null, 2));
  console.log(`\n📁 Tree info saved to: ${outputPath}`);

  // Print environment variable to add
  console.log('\n' + '='.repeat(70));
  console.log('📋 ADD TO .env.staging:');
  console.log('='.repeat(70));
  console.log(`\nSTAGING_FULL_CANOPY_TREE_ADDRESS=${treeKeypair.publicKey.toBase58()}`);
  console.log(`STAGING_FULL_CANOPY_TREE_AUTHORITY=${treeAuthority.toBase58()}`);
  
  console.log('\n' + '='.repeat(70));
  console.log('🎉 FULL CANOPY TREE READY!');
  console.log('='.repeat(70));
  console.log('\nNext steps:');
  console.log('1. Add the env variables above to .env.staging');
  console.log('2. Run: npx ts-node scripts/mint-to-full-canopy-tree.ts');
  console.log('3. Update test to use the new tree');
  console.log('\nBenefits:');
  console.log('✅ Zero proof nodes needed');
  console.log('✅ No stale proof issues');
  console.log('✅ Single transaction cNFT transfers');
  console.log('✅ Works with sequential sends (no Jito needed)');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

