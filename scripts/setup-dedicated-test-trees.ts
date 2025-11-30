/**
 * Setup Dedicated Test Merkle Trees for Staging
 * 
 * Creates private Merkle trees for staging environment to avoid
 * stale proof issues caused by shared public devnet trees.
 * 
 * Usage:
 *   npx ts-node scripts/setup-dedicated-test-trees.ts
 * 
 * Output:
 *   - Tree addresses (store in .env.staging)
 *   - Test cNFT asset IDs
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMerkleTree, mintCnft, DEFAULT_TREE_CONFIG } from '../tests/helpers/devnet-cnft-setup';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Setup Dedicated Test Merkle Trees for Staging');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Load staging admin keypair
  const adminPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    throw new Error('DEVNET_STAGING_ADMIN_PRIVATE_KEY not found in environment');
  }

  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
  console.log('👤 Admin Wallet:', adminKeypair.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );

  // Check balance
  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log('💰 Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log('\n⚠️  Low balance! Request airdrop:');
    console.log(`   solana airdrop 2 ${adminKeypair.publicKey.toBase58()} --url devnet`);
    throw new Error('Insufficient balance to create trees');
  }

  console.log('\n─────────────────────────────────────────────────────────────────\n');

  // Create two dedicated trees (one for maker test cNFTs, one for taker)
  console.log('🌳 Creating Dedicated Maker Tree...');
  const makerTree = await createMerkleTree(connection, adminKeypair, DEFAULT_TREE_CONFIG);
  console.log('✅ Maker Tree Created:', makerTree.tree.publicKey.toBase58());

  console.log('\n🌳 Creating Dedicated Taker Tree...');
  const takerTree = await createMerkleTree(connection, adminKeypair, DEFAULT_TREE_CONFIG);
  console.log('✅ Taker Tree Created:', takerTree.tree.publicKey.toBase58());

  console.log('\n─────────────────────────────────────────────────────────────────\n');

  // Load test wallet keypairs
  const makerPrivateKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
  const takerPrivateKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;

  if (!makerPrivateKey || !takerPrivateKey) {
    throw new Error('Test wallet private keys not found in environment');
  }

  const makerKeypair = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
  const takerKeypair = Keypair.fromSecretKey(bs58.decode(takerPrivateKey));

  console.log('👤 Maker Wallet:', makerKeypair.publicKey.toBase58());
  console.log('👤 Taker Wallet:', takerKeypair.publicKey.toBase58());

  // Mint test cNFTs into each tree
  console.log('\n📦 Minting Test cNFTs...\n');

  const makerCnfts = [];
  const takerCnfts = [];

  // Mint 4 cNFTs for maker
  for (let i = 1; i <= 4; i++) {
    console.log(`   Minting Maker Test cNFT #${i}...`);
    const cnft = await mintCnft(
      connection,
      adminKeypair, // Tree authority (admin)
      makerTree.tree.publicKey,
      makerTree.treeAuthority,
      makerKeypair.publicKey, // Owner (maker)
      {
        name: `Maker Test NFT #${i}`,
        symbol: 'MKRTEST',
        uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/test.json',
      }
    );
    makerCnfts.push(cnft);
    console.log(`   ✅ Asset ID: ${cnft.assetId.toBase58()}`);
  }

  // Mint 4 cNFTs for taker
  for (let i = 1; i <= 4; i++) {
    console.log(`   Minting Taker Test cNFT #${i}...`);
    const cnft = await mintCnft(
      connection,
      adminKeypair, // Tree authority (admin)
      takerTree.tree.publicKey,
      takerTree.treeAuthority,
      takerKeypair.publicKey, // Owner (taker)
      {
        name: `Taker Test NFT #${i}`,
        symbol: 'TKRTEST',
        uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/test.json',
      }
    );
    takerCnfts.push(cnft);
    console.log(`   ✅ Asset ID: ${cnft.assetId.toBase58()}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅ SETUP COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Generate environment variables
  const envVars = `
# Dedicated Test Merkle Trees (Staging Only)
# Created: ${new Date().toISOString()}
STAGING_MAKER_TEST_TREE=${makerTree.tree.publicKey.toBase58()}
STAGING_TAKER_TEST_TREE=${takerTree.tree.publicKey.toBase58()}

# Maker Test cNFTs
STAGING_MAKER_CNFT_1=${makerCnfts[0].assetId.toBase58()}
STAGING_MAKER_CNFT_2=${makerCnfts[1].assetId.toBase58()}
STAGING_MAKER_CNFT_3=${makerCnfts[2].assetId.toBase58()}
STAGING_MAKER_CNFT_4=${makerCnfts[3].assetId.toBase58()}

# Taker Test cNFTs
STAGING_TAKER_CNFT_1=${takerCnfts[0].assetId.toBase58()}
STAGING_TAKER_CNFT_2=${takerCnfts[1].assetId.toBase58()}
STAGING_TAKER_CNFT_3=${takerCnfts[2].assetId.toBase58()}
STAGING_TAKER_CNFT_4=${takerCnfts[3].assetId.toBase58()}
`.trim();

  // Save to file
  const outputPath = path.join(__dirname, '../temp/staging-test-trees.env');
  fs.writeFileSync(outputPath, envVars);

  console.log('📄 Environment Variables:');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(envVars);
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`\n✅ Saved to: ${outputPath}`);
  console.log('\n📋 Next Steps:');
  console.log('   1. Add these variables to .env.staging');
  console.log('   2. Add to DigitalOcean App Platform environment variables');
  console.log('   3. Redeploy staging environment');
  console.log('   4. Test cNFT swaps should now work reliably!\n');

  // Generate tree keypair backup
  const treeKeypairs = {
    makerTree: {
      publicKey: makerTree.tree.publicKey.toBase58(),
      secretKey: Array.from(makerTree.tree.secretKey),
    },
    takerTree: {
      publicKey: takerTree.tree.publicKey.toBase58(),
      secretKey: Array.from(takerTree.tree.secretKey),
    },
  };

  const keypaipPath = path.join(__dirname, '../temp/staging-test-tree-keypairs.json');
  fs.writeFileSync(keypaipPath, JSON.stringify(treeKeypairs, null, 2));
  console.log(`🔐 Tree keypairs backed up to: ${keypaipPath}`);
  console.log('   (Keep these safe - needed to manage trees)\n');
}

main()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

