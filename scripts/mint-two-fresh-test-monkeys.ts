/**
 * Mint 2 fresh cNFTs for immediate testing
 * One for maker, one for taker
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from '@metaplex-foundation/mpl-bubblegum';
import * as fs from 'fs';
import * as path from 'path';
import { mintTestCNFT } from '../tests/helpers/devnet-cnft-setup';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// Use tree from environment or fallback to the known test tree
const TREE_ADDRESS = new PublicKey(
  process.env.STAGING_TEST_TREE || 'DAiT7CHVD5yuQfDAnRwfvwEFNkUKedrs4Evec2U7Gm7Q'
);
// Tree creator (admin) - needed to mint
const TREE_CREATOR = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(path.join(__dirname, '../wallets/staging/staging-admin.json'), 'utf-8')))
);

// Actual test page wallets (sender = maker, receiver = taker)
const MAKER_WALLET = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(path.join(__dirname, '../wallets/staging/staging-sender.json'), 'utf-8')))
);
const TAKER_WALLET = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(path.join(__dirname, '../wallets/staging/staging-receiver.json'), 'utf-8')))
);

async function main() {
  console.log('\n🚀 Minting 2 fresh test monkeys...\n');
  console.log(`📍 Tree: ${TREE_ADDRESS.toBase58()}`);
  console.log(`👤 Maker: ${MAKER_WALLET.publicKey.toBase58()}`);
  console.log(`👤 Taker: ${TAKER_WALLET.publicKey.toBase58()}\n`);

  // Derive tree authority
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [TREE_ADDRESS.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );

  // Mint Maker Monkey (leaf 4 - next available for maker)
  console.log('🙈 Minting Maker Monkey (Gibbon)...');
  const makerCnft = await mintTestCNFT(
    connection,
    TREE_ADDRESS,
    treeAuthority,
    TREE_CREATOR, // Tree creator must be the payer
    MAKER_WALLET.publicKey, // But maker is the owner
    {
      name: 'Gibbon Monkey',
      symbol: 'GIBBON',
      uri: 'http://localhost:8080/metadata/monkeys/gibbon.json',
    },
    4 // Next leaf for maker
  );

  console.log(`✅ Maker Monkey minted!`);
  console.log(`   Asset ID: ${makerCnft.assetId.toBase58()}\n`);

  // Wait a bit to ensure tree update is propagated
  console.log('⏳ Waiting 2 seconds for tree update...\n');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Mint Taker Monkey (leaf 8 - next available for taker)
  console.log('🐵 Minting Taker Monkey (Tamarin)...');
  const takerCnft = await mintTestCNFT(
    connection,
    TREE_ADDRESS,
    treeAuthority,
    TREE_CREATOR, // Tree creator must be the payer
    TAKER_WALLET.publicKey, // But taker is the owner
    {
      name: 'Tamarin Monkey',
      symbol: 'TAMARIN',
      uri: 'http://localhost:8080/metadata/monkeys/tamarin.json',
    },
    8 // Next leaf for taker
  );

  console.log(`✅ Taker Monkey minted!`);
  console.log(`   Asset ID: ${takerCnft.assetId.toBase58()}\n`);

  // Output the test instructions
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 TEST THESE EXACT MONKEYS NOW:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n🙈 Maker:  Gibbon Monkey`);
  console.log(`   ${makerCnft.assetId.toBase58()}`);
  console.log(`\n🐵 Taker:  Tamarin Monkey`);
  console.log(`   ${takerCnft.assetId.toBase58()}`);
  console.log('\n⚡ SWAP IMMEDIATELY - proofs are fresh!\n');
}

main().catch(console.error);

