/**
 * Mint Monkey cNFTs to Existing Tree
 * 
 * Uses the already-created tree from earlier attempt
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { mintTestCNFT } from '../tests/helpers/devnet-cnft-setup';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';

// The tree we created earlier
const EXISTING_TREE = new PublicKey('HGXLWQQjFtu9BmrmfB96UwfKDBP4tvmKGsxDd1kpZu6x');

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Mint Monkeys to Existing Tree');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Load keypairs
  const adminPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  const makerPrivateKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
  const takerPrivateKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;

  if (!adminPrivateKey || !makerPrivateKey || !takerPrivateKey) {
    throw new Error('Private keys not found in environment');
  }

  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
  const makerKeypair = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
  const takerKeypair = Keypair.fromSecretKey(bs58.decode(takerPrivateKey));

  console.log('👤 Admin:', adminKeypair.publicKey.toBase58());
  console.log('👤 Maker:', makerKeypair.publicKey.toBase58());
  console.log('👤 Taker:', takerKeypair.publicKey.toBase58());
  console.log('🌳 Tree:', EXISTING_TREE.toBase58());

  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );

  // Derive tree authority
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [EXISTING_TREE.toBuffer()],
    new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY') // Bubblegum program
  );

  console.log('🔑 Tree Authority:', treeAuthority.toBase58());

  const makerMonkeys = [
    { name: 'Capuchin Monkey', uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/capuchin.json', emoji: '🐒' },
    { name: 'Howler Monkey', uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/howler.json', emoji: '🦧' },
    { name: 'Spider Monkey', uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/spider.json', emoji: '🐵' },
    { name: 'Macaque Monkey', uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/macaque.json', emoji: '🙊' },
  ];

  const takerMonkeys = [
    { name: 'Baboon Monkey', uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/baboon.json', emoji: '🦍' },
    { name: 'Mandrill Monkey', uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/mandrill.json', emoji: '🐺' },
    { name: 'Tamarin Monkey', uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/tamarin.json', emoji: '🐒' },
    { name: 'Marmoset Monkey', uri: 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/marmoset.json', emoji: '🦧' },
  ];

  console.log('\n🐵 Minting Monkeys...\n');

  const makerCnfts = [];
  const takerCnfts = [];

  // Mint maker monkeys
  for (let i = 0; i < makerMonkeys.length; i++) {
    const monkey = makerMonkeys[i];
    console.log(`   ${monkey.emoji} Minting ${monkey.name} for Maker...`);
    try {
      const cnft = await mintTestCNFT(
        connection,
        EXISTING_TREE,
        treeAuthority,
        adminKeypair,
        makerKeypair.publicKey,
        {
          name: monkey.name,
          symbol: 'MONKEY',
          uri: monkey.uri,
        }
      );
      makerCnfts.push(cnft);
      console.log(`   ✅ Asset ID: ${cnft.assetId.toBase58()}`);
    } catch (error: any) {
      console.error(`   ❌ Failed:`, error.message);
    }
  }

  // Mint taker monkeys
  for (let i = 0; i < takerMonkeys.length; i++) {
    const monkey = takerMonkeys[i];
    console.log(`   ${monkey.emoji} Minting ${monkey.name} for Taker...`);
    try {
      const cnft = await mintTestCNFT(
        connection,
        EXISTING_TREE,
        treeAuthority,
        adminKeypair,
        takerKeypair.publicKey,
        {
          name: monkey.name,
          symbol: 'MONKEY',
          uri: monkey.uri,
        }
      );
      takerCnfts.push(cnft);
      console.log(`   ✅ Asset ID: ${cnft.assetId.toBase58()}`);
    } catch (error: any) {
      console.error(`   ❌ Failed:`, error.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅ MINTING COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Generate env vars
  const envVars = `
# Dedicated Test Merkle Tree (Staging Only)
STAGING_TEST_TREE=${EXISTING_TREE.toBase58()}

# Maker Test cNFTs
${makerCnfts.map((c, i) => `STAGING_MAKER_CNFT_${i + 1}=${c.assetId.toBase58()}`).join('\n')}

# Taker Test cNFTs
${takerCnfts.map((c, i) => `STAGING_TAKER_CNFT_${i + 1}=${c.assetId.toBase58()}`).join('\n')}
`.trim();

  const outputPath = path.join(__dirname, '../temp/staging-test-monkeys.env');
  fs.writeFileSync(outputPath, envVars);

  console.log('📄 Environment Variables:');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(envVars);
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`\n✅ Saved to: ${outputPath}`);
  console.log('\n📋 Add these to .env.staging and DigitalOcean!\n');
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

