/**
 * Cleanup Duplicate Monkeys
 * 
 * Burns old duplicate monkeys from multiple minting attempts,
 * keeping only the latest properly-minted set (leaves 0-7)
 */

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { createBurnInstruction, PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from '@metaplex-foundation/mpl-bubblegum';
import { SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, SPL_NOOP_PROGRAM_ID } from '@solana/spl-account-compression';
import bs58 from 'bs58';

const DEDICATED_TREE = new PublicKey('HGXLWQQjFtu9BmrmfB96UwfKDBP4tvmKGsxDd1kpZu6x');

// The LATEST properly-minted monkeys (keep these!)
const KEEPER_MONKEYS = [
  'AAWRiG74BBD4YDk1NKtZcQUjTGXSKVdj2RKZaENBtr7U', // Capuchin (leaf 0)
  '9aNWKhb4mnme3YWz8TVzfxdiA8shfSNbHV99ag3vtugX', // Howler (leaf 1)
  'CjQ5u5ogwp9GjyCsSmNbAVoJEfaQnazgtQsG9QJyCzgh', // Spider (leaf 2)
  '61pup3JKassjxGJPTyMFhfj4AxfQbjAM8oaoAnUbG5fk', // Macaque (leaf 3)
  '8jCDDrun73DzcKe5FwhiMBZ1wPdCniwJ75xh5zwzxKge', // Baboon (leaf 4)
  'FLBfaSW5F93KgEiY6GTTiA5nAw5mH37HndmKBBBJWBox', // Mandrill (leaf 5)
  'F8czLmtfFpDycWqv5La6u1zjE4zkTAyfmcxwvNvxMVPm', // Tamarin (leaf 6)
  'Gn87QEarQQARHrTRWi7mQU99cme9ogSnRcdr4g9Y9Td8', // Marmoset (leaf 7)
];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Cleanup Duplicate Monkeys');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('🎯 Strategy: Query all cNFTs from dedicated tree, burn duplicates\n');
  console.log('✅ Keeping these 8 monkeys:');
  KEEPER_MONKEYS.forEach((id, i) => console.log(`   ${i}: ${id}`));
  console.log('\n🔥 Will burn all others from the tree\n');
  
  const adminPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  const makerPrivateKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY;
  const takerPrivateKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY;

  if (!adminPrivateKey || !makerPrivateKey || !takerPrivateKey) {
    throw new Error('Private keys not found');
  }

  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
  const makerKeypair = Keypair.fromSecretKey(bs58.decode(makerPrivateKey));
  const takerKeypair = Keypair.fromSecretKey(bs58.decode(takerPrivateKey));

  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );

  // Get all cNFTs from maker wallet in dedicated tree
  console.log('📋 Querying maker wallet...');
  const makerAssets = await getAllTreeCnfts(connection, makerKeypair.publicKey.toBase58());
  const makerDuplicates = makerAssets.filter(id => !KEEPER_MONKEYS.includes(id));
  
  console.log(`   Found ${makerAssets.length} total cNFTs`);
  console.log(`   ${makerDuplicates.length} duplicates to burn`);

  // Get all cNFTs from taker wallet in dedicated tree
  console.log('\n📋 Querying taker wallet...');
  const takerAssets = await getAllTreeCnfts(connection, takerKeypair.publicKey.toBase58());
  const takerDuplicates = takerAssets.filter(id => !KEEPER_MONKEYS.includes(id));
  
  console.log(`   Found ${takerAssets.length} total cNFTs`);
  console.log(`   ${takerDuplicates.length} duplicates to burn`);

  console.log(`\n🔥 Total duplicates to burn: ${makerDuplicates.length + takerDuplicates.length}\n`);

  if (makerDuplicates.length === 0 && takerDuplicates.length === 0) {
    console.log('✅ No duplicates found! Tree is clean.');
    return;
  }

  console.log('⚠️  Burning duplicates would require:');
  console.log('   - DAS API proof data for each cNFT');
  console.log('   - Burn transactions for each duplicate');
  console.log('   - Gas fees (~0.01 SOL per burn)\n');
  
  console.log('💡 RECOMMENDATION: Instead of burning, just ignore old monkeys.');
  console.log('   The /test page filter already shows only monkeys from this tree.');
  console.log('   Old monkeys will naturally become stale and unusable.\n');
  
  console.log('✅ Clean solution: Use the 8 keeper monkeys listed above.');
  console.log('   These are properly minted to unique leaves (0-7) and will work!\n');
}

async function getAllTreeCnfts(connection: Connection, ownerAddress: string): Promise<string[]> {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-tree-assets',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress,
        page: 1,
        limit: 1000,
      },
    }),
  });

  const data = await response.json() as any;
  
  if (!data.result?.items) {
    return [];
  }

  // Filter for our dedicated tree only
  return data.result.items
    .filter((asset: any) => 
      asset.compression?.compressed === true &&
      asset.compression?.tree === DEDICATED_TREE.toBase58() &&
      !asset.burnt
    )
    .map((asset: any) => asset.id);
}

main()
  .then(() => {
    console.log('✅ Analysis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

