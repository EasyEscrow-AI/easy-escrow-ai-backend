#!/usr/bin/env ts-node
/**
 * Mint Core NFTs for Staging Testing
 * 
 * Mints Metaplex Core NFTs to staging maker and taker wallets for testing.
 * Core NFTs use the mpl-core program (CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d).
 * 
 * Usage:
 *   ts-node scripts/mint-core-nfts-staging.ts
 * 
 * This will:
 * 1. Create a Core collection (if needed)
 * 2. Mint 3-5 Core NFTs to maker wallet
 * 3. Mint 3-5 Core NFTs to taker wallet
 * 4. Save Core NFT addresses to tests/fixtures/staging-test-core-nfts.json
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';
import dotenv from 'dotenv';

// Load staging environment
const envPath = path.join(__dirname, '../.env.staging');
dotenv.config({ path: envPath, override: true });

// Metaplex Core program ID
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

// Configuration
const RPC_URL = process.env.STAGING_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const MAKER_PRIVATE_KEY = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY || '';
const TAKER_PRIVATE_KEY = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY || '';
const ADMIN_PRIVATE_KEY = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY || '';

const OUTPUT_PATH = path.join(__dirname, '../tests/fixtures/staging-test-core-nfts.json');

// Number of Core NFTs to mint per wallet
const NUM_MAKER_NFTS = 3;
const NUM_TAKER_NFTS = 3;

interface CoreNftDetails {
  assetAddress: string;
  collection?: string;
  name: string;
  symbol: string;
  uri: string;
  owner: string;
  mintSignature?: string;
}

interface CoreNftConfig {
  collection?: {
    address: string;
    name: string;
    createdAt: string;
  };
  makerNfts: CoreNftDetails[];
  takerNfts: CoreNftDetails[];
  lastUpdated: string;
}

/**
 * Create a Core collection
 * Note: This is a simplified version. Full Core collection creation requires mpl-core SDK.
 * For testing, we can mint standalone Core assets without a collection.
 */
async function createCoreCollection(
  connection: Connection,
  payer: Keypair
): Promise<PublicKey | null> {
  console.log('\n📦 Creating Core collection...');
  console.log('   Note: Using standalone Core assets (no collection) for simplicity');
  // For now, we'll mint standalone Core assets
  // Full collection creation would require mpl-core SDK installation
  return null;
}

/**
 * Mint a Core NFT asset
 * 
 * Core NFTs use a different model than SPL tokens:
 * - No token accounts needed
 * - Asset account IS the NFT
 * - Ownership tracked directly on asset account
 * 
 * Note: This is a simplified version. Full Core NFT minting requires mpl-core SDK.
 * For testing purposes, we'll use a helper that creates Core assets.
 */
async function mintCoreNft(
  connection: Connection,
  payer: Keypair,
  owner: PublicKey,
  name: string,
  symbol: string,
  uri: string,
  collection?: PublicKey
): Promise<CoreNftDetails> {
  console.log(`\n🎨 Minting Core NFT: ${name}`);
  console.log(`   To: ${owner.toBase58()}`);
  console.log(`   URI: ${uri}`);

  // NOTE: Full Core NFT minting requires @metaplex-foundation/mpl-core SDK
  // This is a placeholder that shows the structure needed
  // For actual minting, you would:
  // 1. Install: npm install @metaplex-foundation/mpl-core
  // 2. Use createAsset instruction from mpl-core
  // 3. Set owner to the recipient wallet
  
  console.log('   ⚠️  Full Core NFT minting requires @metaplex-foundation/mpl-core SDK');
  console.log('   ⚠️  This script is a template - install mpl-core to enable actual minting');
  
  // For now, return a placeholder structure
  // In production, this would create the actual Core asset
  const assetAddress = Keypair.generate().publicKey.toBase58();
  
  return {
    assetAddress,
    collection: collection?.toBase58(),
    name,
    symbol,
    uri,
    owner: owner.toBase58(),
  };
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🎨 MINTING CORE NFTs FOR STAGING TESTING');
  console.log('='.repeat(70));
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Network: devnet`);

  if (!MAKER_PRIVATE_KEY || !TAKER_PRIVATE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   - DEVNET_STAGING_SENDER_PRIVATE_KEY (maker)');
    console.error('   - DEVNET_STAGING_RECEIVER_PRIVATE_KEY (taker)');
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Load wallets
  const maker = Keypair.fromSecretKey(bs58.decode(MAKER_PRIVATE_KEY));
  const taker = Keypair.fromSecretKey(bs58.decode(TAKER_PRIVATE_KEY));
  const admin = ADMIN_PRIVATE_KEY ? Keypair.fromSecretKey(bs58.decode(ADMIN_PRIVATE_KEY)) : maker;

  console.log(`\n🔑 Wallets:`);
  console.log(`  Maker: ${maker.publicKey.toBase58()}`);
  console.log(`  Taker: ${taker.publicKey.toBase58()}`);
  console.log(`  Admin: ${admin.publicKey.toBase58()}`);

  // Check balances
  const makerBalance = await connection.getBalance(maker.publicKey);
  const takerBalance = await connection.getBalance(taker.publicKey);
  const adminBalance = await connection.getBalance(admin.publicKey);

  console.log(`\n💰 Balances:`);
  console.log(`  Maker: ${makerBalance / 1e9} SOL`);
  console.log(`  Taker: ${takerBalance / 1e9} SOL`);
  console.log(`  Admin: ${adminBalance / 1e9} SOL`);

  if (makerBalance < 0.1e9 || takerBalance < 0.1e9) {
    console.warn('⚠️  Low balance - may need to airdrop SOL for minting');
  }

  // Create collection (optional)
  const collection = await createCoreCollection(connection, admin);

  // Mint Core NFTs for maker
  console.log('\n' + '-'.repeat(50));
  console.log('📦 MINTING CORE NFTs FOR MAKER');
  console.log('-'.repeat(50));
  
  const makerNfts: CoreNftDetails[] = [];
  for (let i = 1; i <= NUM_MAKER_NFTS; i++) {
    const nft = await mintCoreNft(
      connection,
      admin,
      maker.publicKey,
      `Staging Core NFT Maker #${i}`,
      'STGCR',
      `https://example.com/metadata/maker-${i}.json`,
      collection || undefined
    );
    makerNfts.push(nft);
  }

  // Mint Core NFTs for taker
  console.log('\n' + '-'.repeat(50));
  console.log('📦 MINTING CORE NFTs FOR TAKER');
  console.log('-'.repeat(50));
  
  const takerNfts: CoreNftDetails[] = [];
  for (let i = 1; i <= NUM_TAKER_NFTS; i++) {
    const nft = await mintCoreNft(
      connection,
      admin,
      taker.publicKey,
      `Staging Core NFT Taker #${i}`,
      'STGCR',
      `https://example.com/metadata/taker-${i}.json`,
      collection || undefined
    );
    takerNfts.push(nft);
  }

  // Save to file
  const config: CoreNftConfig = {
    collection: collection ? {
      address: collection.toBase58(),
      name: 'Staging Test Core Collection',
      createdAt: new Date().toISOString(),
    } : undefined,
    makerNfts,
    takerNfts,
    lastUpdated: new Date().toISOString(),
  };

  // Ensure directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(config, null, 2));
  console.log(`\n✅ Saved Core NFT config to: ${OUTPUT_PATH}`);
  console.log(`\n📊 Summary:`);
  console.log(`  Maker NFTs: ${makerNfts.length}`);
  console.log(`  Taker NFTs: ${takerNfts.length}`);
  console.log(`  Collection: ${collection ? collection.toBase58() : 'None (standalone assets)'}`);
  
  console.log('\n⚠️  NOTE: This script requires @metaplex-foundation/mpl-core SDK for actual minting.');
  console.log('   Install with: npm install @metaplex-foundation/mpl-core');
  console.log('   Then implement the actual createAsset instruction from mpl-core.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

