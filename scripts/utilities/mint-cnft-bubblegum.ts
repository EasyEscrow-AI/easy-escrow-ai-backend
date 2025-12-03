/**
 * Mint cNFTs using Bubblegum (Compressed NFTs)
 * 
 * Creates Merkle trees and mints compressed NFTs on Solana devnet
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from '@solana/web3.js';
import {
  createCreateTreeInstruction,
  createMintToCollectionV1Instruction,
  createMintV1Instruction,
  MetadataArgs,
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  TokenProgramVersion,
  TokenStandard,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  ConcurrentMerkleTreeAccount,
  createAllocTreeIx,
} from '@solana/spl-account-compression';
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import * as dotenv from 'dotenv';
import bs58 from 'bs58';

dotenv.config({ path: '.env.staging' });

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Test wallet addresses from staging env
const MAKER_ADDRESS = process.env.DEVNET_STAGING_SENDER_ADDRESS!;
const TAKER_ADDRESS = process.env.DEVNET_STAGING_RECEIVER_ADDRESS!;

async function createMerkleTree(payer: Keypair) {
  console.log('\n🌳 Creating Merkle Tree for cNFTs...');

  // Tree parameters
  const maxDepth = 14; // Max 16,384 NFTs
  const maxBufferSize = 64;
  const canopyDepth = 11; // Reduces proof size for transfers

  const treeKeypair = Keypair.generate();
  console.log('   Tree address:', treeKeypair.publicKey.toBase58());

  // Calculate space required (using the createAllocTreeIx will handle this)
  console.log('   Tree config: depth=', maxDepth, 'bufferSize=', maxBufferSize, 'canopy=', canopyDepth);

  const allocTreeIx = await createAllocTreeIx(
    connection,
    treeKeypair.publicKey,
    payer.publicKey,
    {
      maxDepth,
      maxBufferSize,
    },
    canopyDepth
  );

  // Get tree authority PDA
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [treeKeypair.publicKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );

  const createTreeIx = createCreateTreeInstruction(
    {
      treeAuthority,
      merkleTree: treeKeypair.publicKey,
      payer: payer.publicKey,
      treeCreator: payer.publicKey,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      maxBufferSize,
      maxDepth,
      public: false,
    }
  );

  const tx = new Transaction().add(allocTreeIx).add(createTreeIx);
  
  console.log('   Sending transaction...');
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, treeKeypair], {
    commitment: 'confirmed',
  });

  console.log('   ✅ Tree created!');
  console.log('   Signature:', sig);

  return { treeKeypair, treeAuthority };
}

async function mintCNFT(
  payer: Keypair,
  tree: PublicKey,
  treeAuthority: PublicKey,
  receiverAddress: string,
  name: string,
  symbol: string,
  uri: string
) {
  console.log(`\n🎨 Minting cNFT: ${name}`);
  console.log(`   To: ${receiverAddress}`);

  const receiver = new PublicKey(receiverAddress);

  // Get bubblegum signer PDA
  const [bubblegumSigner] = PublicKey.findProgramAddressSync(
    [Buffer.from('collection_cpi', 'utf8')],
    BUBBLEGUM_PROGRAM_ID
  );

  // Metadata for the cNFT
  const metadata: MetadataArgs = {
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: 0,
    primarySaleHappened: false,
    isMutable: true,
    editionNonce: null,
    tokenStandard: TokenStandard.NonFungible,
    collection: null,
    uses: null,
    tokenProgramVersion: TokenProgramVersion.Original,
    creators: [],
  };

  const mintIx = createMintV1Instruction(
    {
      treeAuthority,
      leafOwner: receiver,
      leafDelegate: receiver,
      merkleTree: tree,
      payer: payer.publicKey,
      treeDelegate: payer.publicKey,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      message: metadata,
    }
  );

  const tx = new Transaction().add(mintIx);

  console.log('   Minting...');
  const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
  });

  console.log('   ✅ cNFT minted!');
  console.log('   Signature:', sig);
  console.log('   View on Solscan:', `https://solscan.io/tx/${sig}?cluster=devnet`);

  return sig;
}

async function main() {
  console.log('🌳 Bubblegum cNFT Minting Script\n');
  console.log('📡 RPC:', process.env.SOLANA_RPC_URL);

  // Check for payer private key
  const payerPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  
  if (!payerPrivateKey) {
    console.error('\n❌ Error: DEVNET_STAGING_ADMIN_PRIVATE_KEY not found');
    process.exit(1);
  }

  if (!MAKER_ADDRESS || !TAKER_ADDRESS) {
    console.error('\n❌ Error: Wallet addresses not found');
    process.exit(1);
  }

  // Load payer keypair
  let payer: Keypair;
  try {
    const privateKeyBytes = bs58.decode(payerPrivateKey);
    payer = Keypair.fromSecretKey(privateKeyBytes);
    console.log('✅ Payer:', payer.publicKey.toBase58());
  } catch (error) {
    console.error('❌ Failed to load payer keypair:', error);
    process.exit(1);
  }

  // Check payer balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log('💰 Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log('\n⚠️  Low balance. Requesting airdrop...');
    try {
      const airdropSig = await connection.requestAirdrop(
        payer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdropSig);
      console.log('✅ Airdrop successful');
    } catch (error) {
      console.error('❌ Airdrop failed:', error);
      console.log('💡 Try manually: solana airdrop 2 ' + payer.publicKey.toBase58() + ' --url devnet');
    }
  }

  console.log('\n📋 Target Wallets:');
  console.log('   Maker:', MAKER_ADDRESS);
  console.log('   Taker:', TAKER_ADDRESS);

  try {
    // Create Merkle Tree
    const { treeKeypair, treeAuthority } = await createMerkleTree(payer);

    // Mint 2 cNFTs for Maker
    console.log('\n--- Minting cNFTs for Maker ---');
    await mintCNFT(
      payer,
      treeKeypair.publicKey,
      treeAuthority,
      MAKER_ADDRESS,
      'Test cNFT Maker #1',
      'TCNFT',
      'https://arweave.net/test-cnft-1.json'
    );

    await mintCNFT(
      payer,
      treeKeypair.publicKey,
      treeAuthority,
      MAKER_ADDRESS,
      'Test cNFT Maker #2',
      'TCNFT',
      'https://arweave.net/test-cnft-2.json'
    );

    // Mint 2 cNFTs for Taker
    console.log('\n--- Minting cNFTs for Taker ---');
    await mintCNFT(
      payer,
      treeKeypair.publicKey,
      treeAuthority,
      TAKER_ADDRESS,
      'Test cNFT Taker #1',
      'TCNFT',
      'https://arweave.net/test-cnft-3.json'
    );

    await mintCNFT(
      payer,
      treeKeypair.publicKey,
      treeAuthority,
      TAKER_ADDRESS,
      'Test cNFT Taker #2',
      'TCNFT',
      'https://arweave.net/test-cnft-4.json'
    );

    console.log('\n✅ All cNFTs minted successfully!');
    console.log('\n🌳 Merkle Tree:', treeKeypair.publicKey.toBase58());
    console.log('📦 These are COMPRESSED NFTs (cNFTs)');
    console.log('💡 They will show up with "cNFT" badge on the test page!');
    console.log('\n🔍 Check wallets on:');
    console.log(`   https://solscan.io/account/${MAKER_ADDRESS}?cluster=devnet`);
    console.log(`   https://solscan.io/account/${TAKER_ADDRESS}?cluster=devnet`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message || error);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

