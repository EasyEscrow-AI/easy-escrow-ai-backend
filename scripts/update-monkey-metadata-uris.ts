/**
 * Update Monkey cNFT Metadata URIs
 * 
 * Updates the existing monkey cNFTs to point to our hosted metadata JSONs
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { 
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createUpdateMetadataInstruction,
  MetadataArgs,
  TokenProgramVersion,
  TokenStandard,
} from '@metaplex-foundation/mpl-bubblegum';
import { SPL_NOOP_PROGRAM_ID, SPL_ACCOUNT_COMPRESSION_PROGRAM_ID } from '@solana/spl-account-compression';
import bs58 from 'bs58';

const STAGING_API_URL = 'https://staging-api.easyescrow.ai';
const DEDICATED_TREE = new PublicKey('HGXLWQQjFtu9BmrmfB96UwfKDBP4tvmKGsxDd1kpZu6x');

// Map asset IDs to their new metadata URLs
const MONKEY_UPDATES = [
  { 
    assetId: 'AAWRiG74BBD4YDk1NKtZcQUjTGXSKVdj2RKZaENBtr7U',
    name: 'Capuchin Monkey',
    newUri: `${STAGING_API_URL}/metadata/monkeys/capuchin.json`,
    leaf: 0
  },
  { 
    assetId: '9aNWKhb4mnme3YWz8TVzfxdiA8shfSNbHV99ag3vtugX',
    name: 'Howler Monkey',
    newUri: `${STAGING_API_URL}/metadata/monkeys/howler.json`,
    leaf: 1
  },
  { 
    assetId: 'CjQ5u5ogwp9GjyCsSmNbAVoJEfaQnazgtQsG9QJyCzgh',
    name: 'Spider Monkey',
    newUri: `${STAGING_API_URL}/metadata/monkeys/spider.json`,
    leaf: 2
  },
  { 
    assetId: '61pup3JKassjxGJPTyMFhfj4AxfQbjAM8oaoAnUbG5fk',
    name: 'Macaque Monkey',
    newUri: `${STAGING_API_URL}/metadata/monkeys/macaque.json`,
    leaf: 3
  },
  { 
    assetId: '8jCDDrun73DzcKe5FwhiMBZ1wPdCniwJ75xh5zwzxKge',
    name: 'Baboon Monkey',
    newUri: `${STAGING_API_URL}/metadata/monkeys/baboon.json`,
    leaf: 4
  },
  { 
    assetId: 'FLBfaSW5F93KgEiY6GTTiA5nAw5mH37HndmKBBBJWBox',
    name: 'Mandrill Monkey',
    newUri: `${STAGING_API_URL}/metadata/monkeys/mandrill.json`,
    leaf: 5
  },
  { 
    assetId: 'F8czLmtfFpDycWqv5La6u1zjE4zkTAyfmcxwvNvxMVPm',
    name: 'Tamarin Monkey',
    newUri: `${STAGING_API_URL}/metadata/monkeys/tamarin.json`,
    leaf: 6
  },
  { 
    assetId: 'Gn87QEarQQARHrTRWi7mQU99cme9ogSnRcdr4g9Y9Td8',
    name: 'Marmoset Monkey',
    newUri: `${STAGING_API_URL}/metadata/monkeys/marmoset.json`,
    leaf: 7
  },
];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Update Monkey Metadata URIs');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('⚠️  IMPORTANT: cNFT metadata updates require:');
  console.log('   1. Original tree authority (admin wallet)');
  console.log('   2. Mutable metadata (isMutable: true)');
  console.log('   3. Current owner signature\n');

  console.log('❌ LIMITATION: Bubblegum updateMetadata is complex and requires:');
  console.log('   - Full metadata args (not just URI)');
  console.log('   - Current root and proof');
  console.log('   - Multiple CPI calls\n');

  console.log('💡 SIMPLER SOLUTION: Burn and re-mint with correct URIs\n');

  console.log('🔄 Alternative approach: Use off-chain metadata override');
  console.log('   Some wallets/marketplaces support off-chain metadata');
  console.log('   But this is not standard and unreliable\n');

  console.log('✅ RECOMMENDED: Test with current metadata');
  console.log('   - Images might not display (metadata fetch fails)');
  console.log('   - But swaps will still work!');
  console.log('   - Focus on fixing "Invalid root recomputed from proof" first');
  console.log('   - Fix images after swaps are working\n');

  console.log('📋 When ready to fix images properly:');
  console.log('   1. Run: npx ts-node scripts/burn-all-monkeys.ts');
  console.log('   2. Run: npx ts-node scripts/remint-monkeys-proper-metadata.ts');
  console.log('   3. Test swaps with proper images!\n');
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

