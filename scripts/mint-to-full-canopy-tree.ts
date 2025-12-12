/**
 * Mint Test cNFT to Full Canopy Tree
 * 
 * Mints a test cNFT to the full canopy tree created by setup-full-canopy-tree.ts
 * 
 * Usage:
 *   npx ts-node scripts/mint-to-full-canopy-tree.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  createMintV1Instruction,
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  MetadataArgs,
  TokenProgramVersion,
  TokenStandard,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '@solana/spl-account-compression';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment
dotenv.config({ path: '.env.staging' });

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🌳 MINT cNFT TO FULL CANOPY TREE');
  console.log('='.repeat(70));

  // Connect to devnet
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  console.log(`📡 RPC: ${rpcUrl}`);

  // Load admin keypair (base58 format)
  const adminPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    throw new Error('DEVNET_STAGING_ADMIN_PRIVATE_KEY not set in .env.staging');
  }
  
  const admin = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
  console.log(`🔑 Admin: ${admin.publicKey.toBase58()}`);

  // Load tree info
  const treeInfoPath = path.join(__dirname, '../.taskmaster/staging-full-canopy-tree.json');
  if (!fs.existsSync(treeInfoPath)) {
    console.error('❌ Tree info not found. Run setup-full-canopy-tree.ts first.');
    process.exit(1);
  }
  
  const treeInfo = JSON.parse(fs.readFileSync(treeInfoPath, 'utf-8'));
  const treeAddress = new PublicKey(treeInfo.address);
  const treeAuthority = new PublicKey(treeInfo.authority);
  
  console.log(`🌲 Tree: ${treeAddress.toBase58()}`);
  console.log(`🔐 Authority: ${treeAuthority.toBase58()}`);
  console.log(`✅ Full Canopy: ${treeInfo.isFullCanopy}`);

  // Load maker wallet (who will own the cNFT)
  const makerPrivateKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
  if (!makerPrivateKey) {
    throw new Error('DEVNET_STAGING_SENDER_PRIVATE_KEY not set in .env.staging');
  }
  
  const maker = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
  console.log(`👤 Mint to (Maker): ${maker.publicKey.toBase58()}`);

  // Metadata for the test cNFT
  const metadata: MetadataArgs = {
    name: 'Full Canopy Test cNFT #1',
    symbol: 'FCTEST',
    uri: 'https://arweave.net/test-metadata', // Placeholder URI
    sellerFeeBasisPoints: 0,
    creators: [
      {
        address: admin.publicKey,
        verified: false,
        share: 100,
      },
    ],
    collection: null,
    uses: null,
    primarySaleHappened: false,
    isMutable: true,
    editionNonce: null,
    tokenStandard: TokenStandard.NonFungible,
    tokenProgramVersion: TokenProgramVersion.Original,
  };

  console.log('\n📦 Minting cNFT...');
  console.log(`   Name: ${metadata.name}`);
  console.log(`   Symbol: ${metadata.symbol}`);

  // Create mint instruction
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
    {
      message: metadata,
    }
  );

  const tx = new Transaction().add(mintIx);
  tx.feePayer = admin.publicKey;
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [admin],
      { commitment: 'confirmed' }
    );
    
    console.log(`\n✅ cNFT minted! Signature: ${signature}`);
    console.log(`   Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // Wait for indexing
    console.log('\n⏳ Waiting for DAS indexing (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Try to get the asset ID from DAS
    console.log('\n🔍 Looking up minted cNFT via DAS...');
    
    try {
      // Search for assets by owner
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-assets',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: maker.publicKey.toBase58(),
            page: 1,
            limit: 10,
          },
        }),
      });

      const result: any = await response.json();
      if (result.result?.items) {
        const cnfts = result.result.items.filter((item: any) => 
          item.compression?.compressed === true &&
          item.compression?.tree === treeAddress.toBase58()
        );
        
        if (cnfts.length > 0) {
          const latestCnft = cnfts[cnfts.length - 1]; // Get the most recent one
          console.log(`\n🎉 Found minted cNFT:`);
          console.log(`   Asset ID: ${latestCnft.id}`);
          console.log(`   Name: ${latestCnft.content?.metadata?.name || 'N/A'}`);
          console.log(`   Owner: ${latestCnft.ownership?.owner}`);
          console.log(`   Tree: ${latestCnft.compression?.tree}`);
          console.log(`   Leaf Index: ${latestCnft.compression?.leaf_id}`);

          // Save cNFT info
          const cnftInfo = {
            assetId: latestCnft.id,
            name: latestCnft.content?.metadata?.name,
            owner: latestCnft.ownership?.owner,
            tree: latestCnft.compression?.tree,
            leafIndex: latestCnft.compression?.leaf_id,
            mintSignature: signature,
            createdAt: new Date().toISOString(),
          };

          const cnftPath = path.join(__dirname, '../.taskmaster/staging-full-canopy-cnft.json');
          fs.writeFileSync(cnftPath, JSON.stringify(cnftInfo, null, 2));
          console.log(`\n📁 cNFT info saved to: ${cnftPath}`);

          console.log('\n' + '='.repeat(70));
          console.log('📋 ADD TO .env.staging:');
          console.log('='.repeat(70));
          console.log(`\nSTAGING_FULL_CANOPY_CNFT_ASSET_ID=${latestCnft.id}`);
        } else {
          console.log('⚠️ cNFT not found in DAS yet. May need more time for indexing.');
          console.log('   Try running this script again in a minute.');
        }
      }
    } catch (dasError: any) {
      console.log(`⚠️ DAS lookup failed: ${dasError.message}`);
      console.log('   The cNFT was minted but DAS may need time to index it.');
    }

  } catch (error: any) {
    console.error('❌ Failed to mint cNFT:', error.message);
    throw error;
  }

  console.log('\n' + '='.repeat(70));
  console.log('🎉 DONE!');
  console.log('='.repeat(70));
  console.log('\nNext: Update the test to use STAGING_FULL_CANOPY_CNFT_ASSET_ID');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

