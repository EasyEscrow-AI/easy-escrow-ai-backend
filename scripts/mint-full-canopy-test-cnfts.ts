/**
 * Mint 5 Test cNFTs to Full Canopy Tree
 * 
 * Updates tests/fixtures/staging-test-cnfts.json with the new cNFTs
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createMintV1Instruction,
  MetadataArgs,
  TokenProgramVersion,
  TokenStandard,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '@solana/spl-account-compression';
import bs58 from 'bs58';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.staging' });

const TREE_ADDRESS = '9UDL6tCt8MHDMxYGWCiUHvdjPtyjYBXFkaEb6S4dz39W';
const TREE_AUTHORITY = 'EoKvzhiYgpRopADBjAPkuXsbCed9y8DWEg9F2Xhns24Z';
const NUM_CNFTS = 5;

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🌳 MINTING 5 TEST cNFTs TO FULL CANOPY TREE');
  console.log('='.repeat(70));

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  console.log(`📡 RPC: ${rpcUrl}`);

  const admin = Keypair.fromSecretKey(bs58.decode(process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY!));
  const maker = Keypair.fromSecretKey(bs58.decode(process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY!));
  
  console.log(`🔑 Admin: ${admin.publicKey.toBase58()}`);
  console.log(`👤 Owner (Maker): ${maker.publicKey.toBase58()}`);
  console.log(`🌲 Tree: ${TREE_ADDRESS}`);

  const treeAddress = new PublicKey(TREE_ADDRESS);
  const treeAuthority = new PublicKey(TREE_AUTHORITY);

  const mintedCnfts: any[] = [];

  for (let i = 1; i <= NUM_CNFTS; i++) {
    console.log(`\n📦 Minting cNFT #${i}...`);
    
    const metadata: MetadataArgs = {
      name: `Full Canopy Test cNFT #${i}`,
      symbol: 'FCTEST',
      uri: `https://arweave.net/full-canopy-test-${i}`,
      sellerFeeBasisPoints: 0,
      creators: [{ address: admin.publicKey, verified: false, share: 100 }],
      collection: null,
      uses: null,
      primarySaleHappened: false,
      isMutable: true,
      editionNonce: null,
      tokenStandard: TokenStandard.NonFungible,
      tokenProgramVersion: TokenProgramVersion.Original,
    };

    const mintIx = createMintV1Instruction(
      {
        treeAuthority,
        leafOwner: maker.publicKey,
        leafDelegate: maker.publicKey,
        merkleTree: treeAddress,
        payer: admin.publicKey,
        treeDelegate: admin.publicKey,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      },
      { message: metadata }
    );

    const tx = new Transaction().add(mintIx);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = admin.publicKey;

    const sig = await sendAndConfirmTransaction(connection, tx, [admin]);
    console.log(`   ✅ Minted: ${sig.slice(0, 20)}...`);
    
    mintedCnfts.push({
      leafIndex: i - 1, // 0-indexed
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
      mintSignature: sig,
    });

    // Small delay between mints
    if (i < NUM_CNFTS) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n⏳ Waiting 15 seconds for DAS indexing...');
  await new Promise(r => setTimeout(r, 15000));

  // Fetch asset IDs from DAS
  console.log('\n🔍 Fetching asset IDs from DAS...');
  
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-assets',
      method: 'getAssetsByOwner',
      params: { ownerAddress: maker.publicKey.toBase58(), page: 1, limit: 50 },
    }),
  });

  const result: any = await response.json();
  const dasAssets = (result.result?.items || []).filter((item: any) =>
    item.compression?.compressed && item.compression?.tree === TREE_ADDRESS
  );

  console.log(`   Found ${dasAssets.length} cNFTs in full canopy tree`);

  // Match by leaf index
  const testCnfts = mintedCnfts.map((minted, idx) => {
    const dasAsset = dasAssets.find((a: any) => a.compression?.leaf_id === idx);
    return {
      assetId: dasAsset?.id || `PENDING_INDEX_${idx}`,
      leafIndex: idx,
      owner: maker.publicKey.toBase58(),
      name: minted.name,
      symbol: minted.symbol,
      uri: minted.uri,
    };
  });

  // Update fixture file
  const fixturePath = path.join(__dirname, '../tests/fixtures/staging-test-cnfts.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  
  fixture.testCnfts = testCnfts;
  fixture.lastUpdated = new Date().toISOString();
  
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  console.log(`\n📁 Updated: ${fixturePath}`);

  console.log('\n' + '='.repeat(70));
  console.log('✅ TEST cNFTs MINTED TO FULL CANOPY TREE');
  console.log('='.repeat(70));
  
  testCnfts.forEach((c, i) => {
    console.log(`\n${i + 1}. ${c.name}`);
    console.log(`   Asset ID: ${c.assetId}`);
    console.log(`   Leaf Index: ${c.leafIndex}`);
  });

  if (testCnfts.some(c => c.assetId.startsWith('PENDING'))) {
    console.log('\n⚠️  Some cNFTs not indexed yet. Run this script again in 1-2 minutes.');
  } else {
    console.log('\n🎉 All cNFTs ready! Run the test now.');
  }
}

main().catch(console.error);

