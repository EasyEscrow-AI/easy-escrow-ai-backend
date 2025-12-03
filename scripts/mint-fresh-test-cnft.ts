/**
 * Mint a Fresh Test cNFT
 * Creates ONE new cNFT on the existing test tree for immediate testing
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '@solana/spl-account-compression';
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createMintToCollectionV1Instruction,
  MetadataArgs,
} from '@metaplex-foundation/mpl-bubblegum';
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import bs58 from 'bs58';

dotenv.config({ path: '.env.staging' });

const RPC_URL = process.env.SOLANA_RPC_URL || process.env.STAGING_SOLANA_RPC_URL;

// Load test cNFT config to get tree address
const configPath = path.join(__dirname, '../.taskmaster/test-cnfts-staging.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const TREE_ADDRESS = config.sharedTree.address;

// Load sender wallet
const STAGING_SENDER_KEY = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
let sender: Keypair;

if (STAGING_SENDER_KEY) {
  sender = Keypair.fromSecretKey(bs58.decode(STAGING_SENDER_KEY));
} else {
  const senderPath = path.join(__dirname, '../wallets/staging/staging-sender.json');
  const senderSecret = JSON.parse(fs.readFileSync(senderPath, 'utf8'));
  sender = Keypair.fromSecretKey(new Uint8Array(senderSecret));
}

async function mintFreshCnft() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Mint Fresh Test cNFT                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`📡 RPC: ${RPC_URL}`);
  console.log(`🌳 Tree: ${TREE_ADDRESS}`);
  console.log(`👤 Owner: ${sender.publicKey.toBase58()}\n`);

  const connection = new Connection(RPC_URL!, 'confirmed');
  const merkleTree = new PublicKey(TREE_ADDRESS);

  // Derive tree authority and canopy
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );

  // Metadata for the fresh cNFT
  const metadata: MetadataArgs = {
    name: `Fresh Test cNFT ${Date.now()}`,
    symbol: 'FRESH',
    uri: 'https://arweave.net/fresh-test',
    sellerFeeBasisPoints: 0,
    primarySaleHappened: false,
    isMutable: false,
    editionNonce: null,
    tokenStandard: null,
    collection: null,
    uses: null,
    tokenProgramVersion: { __kind: 'Original' } as any,
    creators: [
      {
        address: sender.publicKey,
        verified: false,
        share: 100,
      },
    ],
  };

  console.log('🎨 Minting fresh cNFT...');
  console.log(`   Name: ${metadata.name}`);

  const mintIx = createMintToCollectionV1Instruction(
    {
      treeAuthority,
      leafOwner: sender.publicKey,
      leafDelegate: sender.publicKey,
      merkleTree,
      payer: sender.publicKey,
      treeDelegate: sender.publicKey,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      collectionAuthority: sender.publicKey,
      collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
      collectionMint: sender.publicKey, // Dummy
      collectionMetadata: TOKEN_METADATA_PROGRAM_ID, // Dummy
      editionAccount: TOKEN_METADATA_PROGRAM_ID, // Dummy
      bubblegumSigner: PublicKey.findProgramAddressSync(
        [Buffer.from('collection_cpi')],
        BUBBLEGUM_PROGRAM_ID
      )[0],
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    },
    {
      metadataArgs: metadata as any,
    }
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const tx = {
    feePayer: sender.publicKey,
    blockhash,
    lastValidBlockHeight,
    instructions: [mintIx],
  };

  const signedTx = await connection.sendTransaction(tx as any, [sender]);
  console.log(`📝 Signature: ${signedTx}`);

  await connection.confirmTransaction({
    signature: signedTx,
    blockhash,
    lastValidBlockHeight,
  });

  console.log('✅ cNFT minted successfully!');
  console.log('\n⚠️  Wait 10 seconds for DAS API to index...');

  // Return signature so we can find the asset ID
  return signedTx;
}

mintFreshCnft().catch(console.error);

