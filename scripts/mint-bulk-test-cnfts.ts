/**
 * Mint Bulk Test cNFTs for 10:1 Swap Testing
 * 
 * Mints 5 cNFTs to Maker and 5 cNFTs to Taker for bulk swap testing
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
const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');

interface MintedCnft {
  assetId: string;
  leafIndex: number;
  owner: string;
  name: string;
  symbol: string;
  uri: string;
}

async function fetchAssetId(
  connection: Connection,
  treeAddress: PublicKey,
  leafIndex: number
): Promise<string> {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-asset-by-leaf',
      method: 'getAssetsByGroup',
      params: {
        groupKey: 'collection',
        groupValue: treeAddress.toBase58(),
        page: 1,
        limit: 100,
      },
    }),
  });

  // Try alternative: get all assets from tree
  const treeResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-assets',
      method: 'getAssetsByGroup',
      params: {
        groupKey: 'collection',
        groupValue: treeAddress.toBase58(),
        page: 1,
        limit: 100,
      },
    }),
  });

  const result = await treeResponse.json();
  console.log(`  Fetched ${(result as any).result?.items?.length || 0} assets from tree`);
  
  // For now, we'll compute asset ID from leaf index
  // The actual asset ID can be fetched after minting completes
  return `pending-leaf-${leafIndex}`;
}

async function mintCnft(
  connection: Connection,
  admin: Keypair,
  owner: PublicKey,
  treeAddress: PublicKey,
  treeAuthority: PublicKey,
  index: number,
  ownerName: string
): Promise<MintedCnft> {
  const name = `Bulk Test cNFT ${ownerName} #${index}`;
  
  const metadata: MetadataArgs = {
    name,
    symbol: 'BULK',
    uri: `https://arweave.net/bulk-test-${ownerName.toLowerCase()}-${index}`,
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
      leafOwner: owner,
      leafDelegate: owner,
      merkleTree: treeAddress,
      payer: admin.publicKey,
      treeDelegate: admin.publicKey,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    { message: metadata },
    BUBBLEGUM_PROGRAM_ID
  );

  const tx = new Transaction().add(mintIx);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;

  const signature = await sendAndConfirmTransaction(connection, tx, [admin], {
    commitment: 'confirmed',
  });

  console.log(`  ✅ Minted "${name}" - tx: ${signature.substring(0, 20)}...`);

  return {
    assetId: `pending-${signature.substring(0, 8)}`,
    leafIndex: -1, // Will be updated after fetching
    owner: owner.toBase58(),
    name,
    symbol: 'BULK',
    uri: metadata.uri,
  };
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🌳 MINTING BULK TEST cNFTs FOR 10:1 SWAP TESTING');
  console.log('='.repeat(70));

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  console.log(`📡 RPC: ${rpcUrl}`);

  // Load wallets
  const adminKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  const makerKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
  const takerKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;

  if (!adminKey || !makerKey || !takerKey) {
    console.error('❌ Missing required environment variables:');
    console.error('  - DEVNET_STAGING_ADMIN_PRIVATE_KEY');
    console.error('  - DEVNET_STAGING_SENDER_PRIVATE_KEY');
    console.error('  - DEVNET_STAGING_RECEIVER_PRIVATE_KEY');
    process.exit(1);
  }

  const admin = Keypair.fromSecretKey(bs58.decode(adminKey));
  const maker = Keypair.fromSecretKey(bs58.decode(makerKey));
  const taker = Keypair.fromSecretKey(bs58.decode(takerKey));

  console.log(`\n🔑 Wallets:`);
  console.log(`  Admin:  ${admin.publicKey.toBase58()}`);
  console.log(`  Maker:  ${maker.publicKey.toBase58()}`);
  console.log(`  Taker:  ${taker.publicKey.toBase58()}`);
  console.log(`\n🌲 Tree: ${TREE_ADDRESS}`);

  const treeAddress = new PublicKey(TREE_ADDRESS);
  const treeAuthority = new PublicKey(TREE_AUTHORITY);

  // Load existing cNFTs
  const fixturesPath = path.join(process.cwd(), 'tests/fixtures/staging-test-cnfts.json');
  const existingData = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
  
  console.log(`\n📊 Existing cNFTs: ${existingData.testCnfts.length}`);

  const newMakerCnfts: MintedCnft[] = [];
  const newTakerCnfts: MintedCnft[] = [];

  // Mint 5 cNFTs for Maker
  console.log('\n' + '-'.repeat(50));
  console.log('📦 MINTING 5 cNFTs FOR MAKER');
  console.log('-'.repeat(50));
  
  for (let i = 6; i <= 10; i++) {
    const cnft = await mintCnft(
      connection,
      admin,
      maker.publicKey,
      treeAddress,
      treeAuthority,
      i,
      'Maker'
    );
    newMakerCnfts.push(cnft);
    // Small delay between mints
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Mint 5 cNFTs for Taker
  console.log('\n' + '-'.repeat(50));
  console.log('📦 MINTING 5 cNFTs FOR TAKER');
  console.log('-'.repeat(50));
  
  for (let i = 1; i <= 5; i++) {
    const cnft = await mintCnft(
      connection,
      admin,
      taker.publicKey,
      treeAddress,
      treeAuthority,
      i,
      'Taker'
    );
    newTakerCnfts.push(cnft);
    // Small delay between mints
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Wait for indexing
  console.log('\n⏳ Waiting 10s for DAS indexing...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Fetch actual asset IDs from DAS
  console.log('\n🔍 Fetching asset IDs from DAS API...');
  
  const dasResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-assets',
      method: 'searchAssets',
      params: {
        ownerAddress: maker.publicKey.toBase58(),
        compressed: true,
        page: 1,
        limit: 100,
      },
    }),
  });
  
  const makerAssets = await dasResponse.json() as any;
  console.log(`  Found ${makerAssets.result?.items?.length || 0} cNFTs for Maker`);

  const takerDasResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-assets',
      method: 'searchAssets',
      params: {
        ownerAddress: taker.publicKey.toBase58(),
        compressed: true,
        page: 1,
        limit: 100,
      },
    }),
  });
  
  const takerAssets = await takerDasResponse.json() as any;
  console.log(`  Found ${takerAssets.result?.items?.length || 0} cNFTs for Taker`);

  // Update fixtures with actual asset IDs
  const allMakerCnfts = makerAssets.result?.items?.filter((item: any) => 
    item.compression?.tree === TREE_ADDRESS
  ) || [];
  
  const allTakerCnfts = takerAssets.result?.items?.filter((item: any) => 
    item.compression?.tree === TREE_ADDRESS
  ) || [];

  // Build updated fixture
  const updatedCnfts = [
    ...allMakerCnfts.map((item: any) => ({
      assetId: item.id,
      leafIndex: item.compression?.leaf_id || 0,
      owner: item.ownership?.owner || maker.publicKey.toBase58(),
      name: item.content?.metadata?.name || 'Unknown',
      symbol: item.content?.metadata?.symbol || 'BULK',
      uri: item.content?.json_uri || '',
    })),
    ...allTakerCnfts.map((item: any) => ({
      assetId: item.id,
      leafIndex: item.compression?.leaf_id || 0,
      owner: item.ownership?.owner || taker.publicKey.toBase58(),
      name: item.content?.metadata?.name || 'Unknown',
      symbol: item.content?.metadata?.symbol || 'BULK',
      uri: item.content?.json_uri || '',
    })),
  ];

  // Update and save fixture
  existingData.testCnfts = updatedCnfts;
  existingData.lastUpdated = new Date().toISOString();
  existingData.bulkTestInfo = {
    makerCnftCount: allMakerCnfts.length,
    takerCnftCount: allTakerCnfts.length,
    note: 'For testing 10:1 bulk swaps'
  };

  fs.writeFileSync(fixturesPath, JSON.stringify(existingData, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('✅ MINTING COMPLETE!');
  console.log('='.repeat(70));
  console.log(`  Maker cNFTs: ${allMakerCnfts.length}`);
  console.log(`  Taker cNFTs: ${allTakerCnfts.length}`);
  console.log(`  Total: ${updatedCnfts.length}`);
  console.log(`\n📄 Updated: tests/fixtures/staging-test-cnfts.json`);
  console.log('\n🧪 Ready for 10:1 swap testing!');
}

main().catch(console.error);

