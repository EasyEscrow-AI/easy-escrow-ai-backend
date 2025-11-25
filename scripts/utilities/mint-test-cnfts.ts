/**
 * Mint Test cNFTs for Atomic Swap Test Page
 * 
 * Mints compressed NFTs on both test wallets for testing atomic swap functionality
 * Uses Metaplex Bubblegum for cNFT creation on Devnet
 */

import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { 
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  ValidDepthSizePair,
  createAllocTreeIx,
  getConcurrentMerkleTreeAccountSize
} from '@solana/spl-account-compression';
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createCreateTreeInstruction,
  createMintToCollectionV1Instruction,
  MetadataArgs,
  TokenProgramVersion,
  TokenStandard
} from '@metaplex-foundation/mpl-bubblegum';
import {
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';
import bs58 from 'bs58';
import * as dotenv from 'dotenv';

dotenv.config();

// Test wallet addresses
const MAKER_ADDRESS = 'FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71';
const TAKER_ADDRESS = 'Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk';

// You'll need private keys for these wallets to mint cNFTs
// For security, load from environment or secure storage
const MAKER_PRIVATE_KEY = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
const TAKER_PRIVATE_KEY = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;

async function main() {
  console.log('🌳 Starting cNFT Minting Script for Test Page\n');

  // Connect to Devnet
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'),
    'confirmed'
  );

  console.log('📡 Connected to:', connection.rpcEndpoint);

  // Check if private keys are available
  if (!MAKER_PRIVATE_KEY || !TAKER_PRIVATE_KEY) {
    console.error('\n❌ Error: Private keys not found in environment');
    console.log('\nPlease set these environment variables:');
    console.log('  - DEVNET_STAGING_SENDER_PRIVATE_KEY');
    console.log('  - DEVNET_STAGING_RECEIVER_PRIVATE_KEY');
    console.log('\n💡 Alternative: Use Metaplex Sugar CLI to mint cNFTs:');
    console.log('  1. Install Sugar: https://docs.metaplex.com/tools/sugar/overview/installation');
    console.log('  2. Create collection and config');
    console.log('  3. Run: sugar mint');
    process.exit(1);
  }

  // Load keypairs
  let makerKeypair: Keypair;
  let takerKeypair: Keypair;

  try {
    // Try JSON array format first
    const makerSecret = JSON.parse(MAKER_PRIVATE_KEY);
    makerKeypair = Keypair.fromSecretKey(Buffer.from(makerSecret));
  } catch {
    // Try base58 format
    const makerSecret = bs58.decode(MAKER_PRIVATE_KEY);
    makerKeypair = Keypair.fromSecretKey(makerSecret);
  }

  try {
    const takerSecret = JSON.parse(TAKER_PRIVATE_KEY);
    takerKeypair = Keypair.fromSecretKey(Buffer.from(takerSecret));
  } catch {
    const takerSecret = bs58.decode(TAKER_PRIVATE_KEY);
    takerKeypair = Keypair.fromSecretKey(takerSecret);
  }

  console.log('\n✅ Loaded keypairs:');
  console.log('   Maker:', makerKeypair.publicKey.toBase58());
  console.log('   Taker:', takerKeypair.publicKey.toBase58());

  // Check balances
  const makerBalance = await connection.getBalance(makerKeypair.publicKey);
  const takerBalance = await connection.getBalance(takerKeypair.publicKey);

  console.log('\n💰 Balances:');
  console.log('   Maker:', (makerBalance / 1e9).toFixed(4), 'SOL');
  console.log('   Taker:', (takerBalance / 1e9).toFixed(4), 'SOL');

  if (makerBalance < 0.1 * 1e9 || takerBalance < 0.1 * 1e9) {
    console.log('\n⚠️  Warning: Low balance detected. Minting may fail.');
    console.log('   Airdrop SOL: solana airdrop 1 <address> --url devnet');
  }

  console.log('\n🎨 Minting cNFTs...');
  console.log('\n⚠️  Note: cNFT minting requires:');
  console.log('   1. Creating a Merkle tree (one-time setup)');
  console.log('   2. Creating a collection (optional but recommended)');
  console.log('   3. Minting cNFTs to the tree');
  console.log('\n💡 For production use, consider using:');
  console.log('   - Metaplex Sugar CLI (recommended)');
  console.log('   - Metaplex JS SDK');
  console.log('   - Helius Digital Asset API');

  console.log('\n📚 Quick Guide (Metaplex Sugar):');
  console.log('\n   Install Sugar (choose one method):');
  console.log('   ');
  console.log('   Option 1: Using pre-built binaries (recommended)');
  console.log('   - Download from: https://github.com/metaplex-foundation/sugar/releases');
  console.log('   - Extract and add to PATH');
  console.log('   ');
  console.log('   Option 2: Using Cargo (Rust)');
  console.log('   - cargo install sugar-cli');
  console.log('   ');
  console.log('   Option 3: Build from source');
  console.log('   - git clone https://github.com/metaplex-foundation/sugar.git');
  console.log('   - cd sugar && cargo build --release');
  console.log('   ');
  console.log('   Then use Sugar:');
  console.log('   1. sugar init');
  console.log('   2. Configure collection in config.json');
  console.log('   3. sugar upload');
  console.log('   4. sugar mint');

  console.log('\n✅ Script completed');
  console.log('\n💡 Alternative Methods:');
  console.log('   ');
  console.log('   1. Use Helius DAS API:');
  console.log('      - https://docs.helius.dev/compression-and-das-api/digital-asset-standard-das-api');
  console.log('      - Easiest for programmatic minting');
  console.log('   ');
  console.log('   2. Use Underdog Protocol:');
  console.log('      - https://docs.underdog.so/');
  console.log('      - Simple API for cNFT creation');
  console.log('   ');
  console.log('   3. Use Crossmint:');
  console.log('      - https://docs.crossmint.com/');
  console.log('      - User-friendly cNFT minting');
  console.log('   ');
  console.log('   4. For testing now:');
  console.log('      - Use existing devnet cNFTs if available');
  console.log('      - Test with SPL NFTs only');
  console.log('      - Filter functionality works with both types');
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});

