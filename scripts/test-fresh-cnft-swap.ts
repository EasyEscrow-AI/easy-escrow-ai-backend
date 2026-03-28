/**
 * Test Fresh cNFT Swap
 * Mints a brand new cNFT and immediately tests atomic swap
 */

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '@solana/spl-account-compression';
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createMintToCollectionV1Instruction,
  MetadataArgs,
} from '@metaplex-foundation/mpl-bubblegum';
// Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import bs58 from 'bs58';

dotenv.config({ path: '.env.staging' });

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const STAGING_API_URL = 'https://staging-api.easyescrow.ai';

// Hardcoded tree address
const TREE_ADDRESS = 'H47jXeKnijdgzKPnrdWyZ2dPpQQbDGAtcgoQvwWohNgz';

// Load wallets
const STAGING_SENDER_KEY = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
const STAGING_RECEIVER_KEY = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;

if (!STAGING_SENDER_KEY || !STAGING_RECEIVER_KEY) {
  throw new Error('Missing wallet keys in environment');
}

const sender = Keypair.fromSecretKey(bs58.decode(STAGING_SENDER_KEY));
const receiver = Keypair.fromSecretKey(bs58.decode(STAGING_RECEIVER_KEY));

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAssetsByOwner(rpcUrl: string, owner: string): Promise<any[]> {
  const response = await axios.post(rpcUrl, {
    jsonrpc: '2.0',
    id: 'get-assets',
    method: 'getAssetsByOwner',
    params: {
      ownerAddress: owner,
      page: 1,
      limit: 1000,
    },
  });

  return response.data.result?.items || [];
}

async function getDasProof(rpcUrl: string, assetId: string): Promise<any> {
  const response = await axios.post(rpcUrl, {
    jsonrpc: '2.0',
    id: 'get-proof',
    method: 'getAssetProof',
    params: { id: assetId },
  });
  return response.data.result;
}

async function testFreshCnftSwap() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   FRESH cNFT SWAP TEST                                       ║');
  console.log('║   Mint → Index → Swap (all in one session)                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const merkleTree = new PublicKey(TREE_ADDRESS);

  console.log(`📡 RPC: ${RPC_URL}`);
  console.log(`🌳 Tree: ${TREE_ADDRESS}`);
  console.log(`👤 Sender: ${sender.publicKey.toBase58()}`);
  console.log(`👤 Receiver: ${receiver.publicKey.toBase58()}\n`);

  // Step 1: Check sender's current cNFTs
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📋 Step 1: Check Current cNFTs\n');

  const assetsBefore = await getAssetsByOwner(RPC_URL, sender.publicKey.toBase58());
  const cnftsBefore = assetsBefore.filter(a => a.compression?.compressed);
  console.log(`   Sender has ${cnftsBefore.length} cNFTs before mint\n`);

  // Step 2: Mint fresh cNFT
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🎨 Step 2: Minting Fresh cNFT\n');

  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );

  const timestamp = Date.now();
  const metadata: MetadataArgs = {
    name: `Fresh Test cNFT ${timestamp}`,
    symbol: 'FRESH',
    uri: `https://arweave.net/fresh-${timestamp}`,
    sellerFeeBasisPoints: 0,
    primarySaleHappened: false,
    isMutable: false,
    editionNonce: null,
    tokenStandard: null,
    collection: null,
    uses: null,
    tokenProgramVersion: 0 as any, // Original = 0
    creators: [
      {
        address: sender.publicKey,
        verified: false,
        share: 100,
      },
    ],
  };

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
      collectionMint: sender.publicKey,
      collectionMetadata: TOKEN_METADATA_PROGRAM_ID,
      editionAccount: TOKEN_METADATA_PROGRAM_ID,
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
  const tx = new Transaction({
    feePayer: sender.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(mintIx);

  tx.sign(sender);

  const mintSignature = await connection.sendRawTransaction(tx.serialize());
  console.log(`   📝 Mint Signature: ${mintSignature}`);
  console.log(`   🔗 Explorer: https://explorer.solana.com/tx/${mintSignature}?cluster=devnet\n`);

  await connection.confirmTransaction({
    signature: mintSignature,
    blockhash,
    lastValidBlockHeight,
  });

  console.log('   ✅ cNFT minted!\n');

  // Step 3: Wait for DAS API indexing
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('⏳ Step 3: Waiting for DAS API to Index\n');

  let freshAssetId: string | null = null;
  let attempts = 0;
  const maxAttempts = 12; // 60 seconds

  while (attempts < maxAttempts && !freshAssetId) {
    attempts++;
    console.log(`   Attempt ${attempts}/${maxAttempts}...`);
    
    await wait(5000);
    
    const assetsAfter = await getAssetsByOwner(RPC_URL, sender.publicKey.toBase58());
    const cnftsAfter = assetsAfter.filter(a => a.compression?.compressed);
    
    if (cnftsAfter.length > cnftsBefore.length) {
      // Found new cNFT!
      const newCnfts = cnftsAfter.filter(
        after => !cnftsBefore.find(before => before.id === after.id)
      );
      
      if (newCnfts.length > 0) {
        freshAssetId = newCnfts[0].id;
        console.log(`   ✅ Fresh cNFT indexed!`);
        console.log(`   Asset ID: ${freshAssetId}\n`);
        break;
      }
    }
  }

  if (!freshAssetId) {
    throw new Error('Fresh cNFT not indexed after 60 seconds');
  }

  // Step 4: Get fresh proof
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔍 Step 4: Fetching Fresh Proof\n');

  const freshProof = await getDasProof(RPC_URL, freshAssetId);
  const rootBytes = Array.from(bs58.decode(freshProof.root)).slice(0, 8);
  
  console.log(`   Root (first 8): [${rootBytes.join(', ')}]`);
  console.log(`   Node Index: ${freshProof.node_index}`);
  console.log(`   Proof Length: ${freshProof.proof.length}\n`);

  // Step 5: Attempt atomic swap
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🤝 Step 5: Testing Atomic Swap with Fresh cNFT\n');

  const idempotencyKey = `FRESH-TEST-${timestamp}`;
  
  try {
    // Create offer
    console.log('   Creating offer...');
    const createResponse = await axios.post(
      `${STAGING_API_URL}/api/offers`,
      {
        makerWallet: sender.publicKey.toBase58(),
        takerWallet: receiver.publicKey.toBase58(),
        offeredAssets: [{
          mint: freshAssetId,
          isCompressed: true,
        }],
        requestedAssets: [],
        offeredSol: 0,
        requestedSol: 0.1,
        agreementId: `fresh-test-${timestamp}`,
        offerExpiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
      }
    );

    const offerId = createResponse.data.data.offer.id;
    console.log(`   ✅ Offer created: ${offerId}\n`);

    // Accept offer
    console.log('   Accepting offer...');
    const acceptResponse = await axios.post(
      `${STAGING_API_URL}/api/offers/${offerId}/accept`,
      {
        takerWallet: receiver.publicKey.toBase58(),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `${idempotencyKey}-accept`,
        },
      }
    );

    console.log(`   ✅ Offer accepted, transaction ready\n`);

    // Simulate transaction
    console.log('   Simulating transaction...');
    const serializedTx = acceptResponse.data.data.transaction.serialized;
    const txBuffer = Buffer.from(serializedTx, 'base64');
    
    try {
      const simulation = await connection.simulateTransaction(
        Transaction.from(txBuffer),
        [sender, receiver]
      );

      if (simulation.value.err) {
        console.log('   ❌ Simulation FAILED');
        console.log(`   Error: ${JSON.stringify(simulation.value.err)}`);
        if (simulation.value.logs) {
          console.log('   Logs:');
          simulation.value.logs.forEach(log => console.log(`     ${log}`));
        }
      } else {
        console.log('   ✅ Simulation PASSED!');
        console.log('   🎉 Fresh cNFT swap works!\n');
      }
    } catch (simError: any) {
      console.log('   ❌ Simulation error:', simError.message);
    }

  } catch (error: any) {
    console.log('   ❌ Test failed:', error.response?.data || error.message);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Test Complete                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

testFreshCnftSwap().catch(console.error);

