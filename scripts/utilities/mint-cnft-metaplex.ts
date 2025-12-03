/**
 * Mint cNFTs using Metaplex Bubblegum
 * 
 * This script mints compressed NFTs on Solana devnet using Metaplex Bubblegum.
 * It handles tree creation and cNFT minting.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from '@solana/spl-account-compression';
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createCreateTreeInstruction,
  createMintV1Instruction,
  createAllocTreeAccount,
} from '@metaplex-foundation/mpl-bubblegum';
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

async function mintCNFT(
  payer: Keypair,
  receiverAddress: string,
  name: string,
  symbol: string,
  uri: string
) {
  console.log(`\n🎨 Minting cNFT: ${name} for ${receiverAddress}`);

  try {
    // For simplicity, we'll use a simple approach
    // In production, you'd want to reuse existing trees

    const receiver = new PublicKey(receiverAddress);

    // Tree parameters (small tree for testing)
    const maxDepth = 14; // Max 16,384 cNFTs
    const maxBufferSize = 64;
    const canopyDepth = 10;

    // Create tree keypair
    const treeKeypair = Keypair.generate();
    console.log('   Tree address:', treeKeypair.publicKey.toBase58());

    // Calculate tree account size and rent
    const space = getConcurrentMerkleTreeAccountSize(maxDepth, maxBufferSize, canopyDepth);
    const rentLamports = await connection.getMinimumBalanceForRentExemption(space);

    console.log('   Tree size:', space, 'bytes');
    console.log('   Rent:', rentLamports / LAMPORTS_PER_SOL, 'SOL');

    // Get tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [treeKeypair.publicKey.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );

    // Create tree account allocation
    const allocTreeIx = await createAllocTreeAccount(
      connection,
      treeKeypair.publicKey,
      payer.publicKey,
      space,
      maxDepth,
      maxBufferSize,
      canopyDepth
    );

    // Create tree instruction
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
      },
      BUBBLEGUM_PROGRAM_ID
    );

    // Send tree creation transaction
    const treeTransaction = new Transaction()
      .add(allocTreeIx)
      .add(createTreeIx);

    console.log('   Creating Merkle tree...');
    const treeSig = await sendAndConfirmTransaction(
      connection,
      treeTransaction,
      [payer, treeKeypair],
      {
        commitment: 'confirmed',
        skipPreflight: true,
      }
    );
    console.log('   ✅ Tree created:', treeSig);

    // Now mint the cNFT
    console.log('   Minting cNFT to tree...');

    // Get collection mint (optional - using system program as placeholder)
    const collectionMint = PublicKey.default;
    const collectionMetadata = PublicKey.default;
    const collectionMasterEdition = PublicKey.default;

    // Get bubblegum signer PDA
    const [bubblegumSigner] = PublicKey.findProgramAddressSync(
      [Buffer.from('collection_cpi')],
      BUBBLEGUM_PROGRAM_ID
    );

    // Mint instruction
    const mintIx = createMintV1Instruction(
      {
        treeAuthority,
        leafOwner: receiver,
        leafDelegate: receiver,
        merkleTree: treeKeypair.publicKey,
        payer: payer.publicKey,
        treeDelegate: payer.publicKey,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        collectionMint: collectionMint,
        collectionMetadata: collectionMetadata,
        collectionAuthority: payer.publicKey,
        collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
        bubblegumSigner: bubblegumSigner,
      },
      {
        message: {
          name,
          symbol,
          uri,
          sellerFeeBasisPoints: 0,
          primarySaleHappened: false,
          isMutable: true,
          editionNonce: null,
          tokenStandard: null,
          collection: null,
          uses: null,
          tokenProgramVersion: 0,
          creators: [],
        },
      },
      BUBBLEGUM_PROGRAM_ID
    );

    const mintTransaction = new Transaction().add(mintIx);

    const mintSig = await sendAndConfirmTransaction(
      connection,
      mintTransaction,
      [payer],
      {
        commitment: 'confirmed',
        skipPreflight: true,
      }
    );

    console.log('   ✅ cNFT minted successfully!');
    console.log('   Transaction:', mintSig);
    console.log('   Tree:', treeKeypair.publicKey.toBase58());

    return {
      tree: treeKeypair.publicKey.toBase58(),
      signature: mintSig,
    };
  } catch (error) {
    console.error('   ❌ Failed to mint cNFT:', error);
    throw error;
  }
}

async function main() {
  console.log('🌳 Metaplex Bubblegum cNFT Minting Script\n');
  console.log('📡 RPC:', process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

  // Check for payer private key
  const payerPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  
  if (!payerPrivateKey) {
    console.error('\n❌ Error: DEVNET_STAGING_ADMIN_PRIVATE_KEY not found in environment');
    console.log('\n💡 This script requires a funded wallet to pay for tree creation and minting.');
    console.log('   Set DEVNET_STAGING_ADMIN_PRIVATE_KEY in your .env.staging file.');
    process.exit(1);
  }

  if (!MAKER_ADDRESS || !TAKER_ADDRESS) {
    console.error('\n❌ Error: Wallet addresses not found in environment');
    console.log('   Required: DEVNET_STAGING_SENDER_ADDRESS and DEVNET_STAGING_RECEIVER_ADDRESS');
    process.exit(1);
  }

  // Load payer keypair
  let payer: Keypair;
  try {
    const privateKeyBytes = bs58.decode(payerPrivateKey);
    payer = Keypair.fromSecretKey(privateKeyBytes);
    console.log('✅ Payer loaded:', payer.publicKey.toBase58());
  } catch (error) {
    console.error('❌ Failed to load payer keypair:', error);
    process.exit(1);
  }

  // Check payer balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log('💰 Payer balance:', balance / LAMPORTS_PER_SOL, 'SOL');

  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.warn('\n⚠️  Warning: Payer balance is low. You need at least 0.1 SOL for testing.');
    console.log('   Airdrop some SOL: solana airdrop 1 ' + payer.publicKey.toBase58() + ' --url devnet');
  }

  console.log('\n📋 Target Wallets:');
  console.log('   Maker:', MAKER_ADDRESS);
  console.log('   Taker:', TAKER_ADDRESS);

  // Mint 2 cNFTs for Maker
  console.log('\n--- Minting cNFTs for Maker ---');
  await mintCNFT(
    payer,
    MAKER_ADDRESS,
    'Test cNFT Maker #1',
    'TCNFT',
    'https://arweave.net/test-metadata-1.json'
  );

  await mintCNFT(
    payer,
    MAKER_ADDRESS,
    'Test cNFT Maker #2',
    'TCNFT',
    'https://arweave.net/test-metadata-2.json'
  );

  // Mint 2 cNFTs for Taker
  console.log('\n--- Minting cNFTs for Taker ---');
  await mintCNFT(
    payer,
    TAKER_ADDRESS,
    'Test cNFT Taker #1',
    'TCNFT',
    'https://arweave.net/test-metadata-3.json'
  );

  await mintCNFT(
    payer,
    TAKER_ADDRESS,
    'Test cNFT Taker #2',
    'TCNFT',
    'https://arweave.net/test-metadata-4.json'
  );

  console.log('\n✅ Done! All cNFTs minted successfully.');
  console.log('\n💡 Note: These cNFTs may take a few moments to appear in wallets.');
  console.log('   Use the test page /test to view them with filters!');
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});

