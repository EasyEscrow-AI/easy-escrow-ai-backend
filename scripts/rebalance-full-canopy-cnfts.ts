/**
 * Rebalance Full Canopy Test cNFTs back to maker
 */
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createTransferInstruction, PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from '@metaplex-foundation/mpl-bubblegum';
import { SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, SPL_NOOP_PROGRAM_ID } from '@solana/spl-account-compression';
import bs58 from 'bs58';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.staging' });

const TREE_ADDRESS = '9UDL6tCt8MHDMxYGWCiUHvdjPtyjYBXFkaEb6S4dz39W';
const TREE_AUTHORITY = 'EoKvzhiYgpRopADBjAPkuXsbCed9y8DWEg9F2Xhns24Z';
const MAKER = 'AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z';
const TAKER = '5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4';

async function main() {
  console.log('\n🔄 REBALANCING FULL CANOPY cNFTs...\n');

  const rpcUrl = process.env.SOLANA_RPC_URL!;
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load wallets from staging wallet files
  const takerWalletPath = path.join(__dirname, '../wallets/staging/staging-receiver.json');
  const takerSecret = JSON.parse(fs.readFileSync(takerWalletPath, 'utf8'));
  const taker = Keypair.fromSecretKey(new Uint8Array(takerSecret));
  
  console.log(`🔑 Taker (returns cNFTs): ${taker.publicKey.toBase58()}`);
  console.log(`👤 Maker (receives cNFTs): ${MAKER}\n`);

  // Load fixture to get cNFT info
  const fixture = JSON.parse(
    fs.readFileSync('tests/fixtures/staging-test-cnfts.json', 'utf8')
  );

  // Check ownership and transfer any that belong to taker
  for (const cnft of fixture.testCnfts) {
    const assetResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-asset',
        method: 'getAsset',
        params: { id: cnft.assetId },
      }),
    });
    const assetResult: any = await assetResp.json();
    const currentOwner = assetResult.result?.ownership?.owner;
    
    console.log(`📦 ${cnft.name}`);
    console.log(`   Asset: ${cnft.assetId}`);
    console.log(`   Owner: ${currentOwner}`);

    if (currentOwner === TAKER) {
      console.log(`   ⏳ Transferring back to maker...`);
      
      // Get proof
      const proofResp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-proof',
          method: 'getAssetProof',
          params: { id: cnft.assetId },
        }),
      });
      const proofResult: any = await proofResp.json();
      const proof = proofResult.result;

      // Decode proof bytes (base58 format from DAS)
      const rootBytes = bs58.decode(proof.root);
      const dataHashBytes = bs58.decode(proof.data_hash);
      const creatorHashBytes = bs58.decode(proof.creator_hash);

      // Build transfer instruction
      const { PublicKey, SystemProgram } = await import('@solana/web3.js');
      const ix = createTransferInstruction(
        {
          treeAuthority: new PublicKey(TREE_AUTHORITY),
          leafOwner: taker.publicKey,
          leafDelegate: taker.publicKey,
          newLeafOwner: new PublicKey(MAKER),
          merkleTree: new PublicKey(TREE_ADDRESS),
          logWrapper: SPL_NOOP_PROGRAM_ID,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        },
        {
          root: Array.from(rootBytes),
          dataHash: Array.from(dataHashBytes),
          creatorHash: Array.from(creatorHashBytes),
          nonce: proof.leaf_id,
          index: proof.leaf_id,
        }
      );

      // Set signer flag
      const leafOwnerKey = ix.keys.find(k => k.pubkey.equals(taker.publicKey));
      if (leafOwnerKey) leafOwnerKey.isSigner = true;

      const tx = new Transaction().add(ix);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = taker.publicKey;

      const sig = await sendAndConfirmTransaction(connection, tx, [taker]);
      console.log(`   ✅ Transferred: ${sig.slice(0, 20)}...`);
    } else if (currentOwner === MAKER) {
      console.log(`   ✅ Already with maker`);
    } else {
      console.log(`   ⚠️  Unknown owner!`);
    }
    console.log('');
  }

  console.log('🎉 Rebalance complete!\n');
}

main().catch(console.error);

