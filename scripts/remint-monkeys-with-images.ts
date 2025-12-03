/**
 * Re-mint Monkeys with Proper Metadata URLs
 * 
 * Mints fresh monkeys with URIs pointing to our hosted metadata
 * (which contains the Unsplash monkey images)
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { mintTestCNFT } from '../tests/helpers/devnet-cnft-setup';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';

const DEDICATED_TREE = new PublicKey('HGXLWQQjFtu9BmrmfB96UwfKDBP4tvmKGsxDd1kpZu6x');
const STAGING_API_URL = 'https://staging-api.easyescrow.ai';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Re-mint Monkeys with Proper Image Metadata');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const adminPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  const makerPrivateKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
  const takerPrivateKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;

  if (!adminPrivateKey || !makerPrivateKey || !takerPrivateKey) {
    throw new Error('Private keys not found');
  }

  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
  const makerKeypair = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
  const takerKeypair = Keypair.fromSecretKey(bs58.decode(takerPrivateKey));

  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );

  // Derive tree authority
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [DEDICATED_TREE.toBuffer()],
    new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY')
  );

  console.log('🌳 Tree:', DEDICATED_TREE.toBase58());
  console.log('🔑 Tree Authority:', treeAuthority.toBase58());
  console.log('📡 Metadata URLs will point to:', STAGING_API_URL, '\n');

  // Monkey collection with proper metadata URLs
  const makerMonkeys = [
    { name: 'Capuchin Monkey', uri: `${STAGING_API_URL}/metadata/monkeys/capuchin.json`, emoji: '🐒' },
    { name: 'Howler Monkey', uri: `${STAGING_API_URL}/metadata/monkeys/howler.json`, emoji: '🦧' },
    { name: 'Spider Monkey', uri: `${STAGING_API_URL}/metadata/monkeys/spider.json`, emoji: '🐵' },
    { name: 'Macaque Monkey', uri: `${STAGING_API_URL}/metadata/monkeys/macaque.json`, emoji: '🙊' },
  ];

  const takerMonkeys = [
    { name: 'Baboon Monkey', uri: `${STAGING_API_URL}/metadata/monkeys/baboon.json`, emoji: '🦍' },
    { name: 'Mandrill Monkey', uri: `${STAGING_API_URL}/metadata/monkeys/mandrill.json`, emoji: '🐺' },
    { name: 'Tamarin Monkey', uri: `${STAGING_API_URL}/metadata/monkeys/tamarin.json`, emoji: '🐒' },
    { name: 'Marmoset Monkey', uri: `${STAGING_API_URL}/metadata/monkeys/marmoset.json`, emoji: '🦧' },
  ];

  console.log('🐵 Minting Fresh Monkeys with Proper Metadata...\n');

  const makerCnfts = [];
  const takerCnfts = [];
  let nextLeafIndex = 0;

  // Mint maker monkeys
  for (let i = 0; i < makerMonkeys.length; i++) {
    const monkey = makerMonkeys[i];
    console.log(`   ${monkey.emoji} Minting ${monkey.name} (leaf ${nextLeafIndex})...`);
    try {
      const cnft = await mintTestCNFT(
        connection,
        DEDICATED_TREE,
        treeAuthority,
        adminKeypair,
        makerKeypair.publicKey,
        {
          name: monkey.name,
          symbol: 'MONKEY',
          uri: monkey.uri,
        },
        nextLeafIndex
      );
      makerCnfts.push(cnft);
      console.log(`   ✅ ${cnft.assetId.toBase58()}`);
      console.log(`      Metadata: ${monkey.uri}`);
      nextLeafIndex++;
    } catch (error: any) {
      console.error(`   ❌ Failed:`, error.message);
    }
  }

  // Mint taker monkeys
  for (let i = 0; i < takerMonkeys.length; i++) {
    const monkey = takerMonkeys[i];
    console.log(`   ${monkey.emoji} Minting ${monkey.name} (leaf ${nextLeafIndex})...`);
    try {
      const cnft = await mintTestCNFT(
        connection,
        DEDICATED_TREE,
        treeAuthority,
        adminKeypair,
        takerKeypair.publicKey,
        {
          name: monkey.name,
          symbol: 'MONKEY',
          uri: monkey.uri,
        },
        nextLeafIndex
      );
      takerCnfts.push(cnft);
      console.log(`   ✅ ${cnft.assetId.toBase58()}`);
      console.log(`      Metadata: ${monkey.uri}`);
      nextLeafIndex++;
    } catch (error: any) {
      console.error(`   ❌ Failed:`, error.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅ RE-MINTING COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Generate updated env vars
  const envVars = `
# Dedicated Test Merkle Tree (Staging Only)
# Updated: ${new Date().toISOString()}
STAGING_TEST_TREE=${DEDICATED_TREE.toBase58()}

# Maker Test cNFTs (WITH IMAGES!)
${makerCnfts.map((c, i) => `STAGING_MAKER_CNFT_${i + 1}=${c.assetId.toBase58()}`).join('\n')}

# Taker Test cNFTs (WITH IMAGES!)
${takerCnfts.map((c, i) => `STAGING_TAKER_CNFT_${i + 1}=${c.assetId.toBase58()}`).join('\n')}
`.trim();

  const outputPath = path.join(__dirname, '../temp/staging-monkeys-with-images.env');
  fs.writeFileSync(outputPath, envVars);

  console.log('📄 Updated Environment Variables:');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(envVars);
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`\n✅ Saved to: ${outputPath}`);
  console.log('\n🎨 Images will now load from Unsplash!');
  console.log('   Metadata hosted at: ${STAGING_API_URL}/metadata/monkeys/\n');
  console.log('📋 The monkeys now have:');
  console.log('   ✅ Proper names (Capuchin, Howler, etc.)');
  console.log('   ✅ High-quality images (Unsplash)');
  console.log('   ✅ Rich attributes (Species, Habitat, Rarity)');
  console.log('   ✅ Copyright-free images\n');
}

main()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

