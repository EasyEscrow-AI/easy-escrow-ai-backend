/**
 * Check Test Wallets for cNFTs
 * 
 * Uses QuickNode DAS API to check if test wallets have any cNFTs
 */

import * as dotenv from 'dotenv';

dotenv.config();

const MAKER_ADDRESS = 'FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71';
const TAKER_ADDRESS = 'Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk';

async function checkForCNFTs(walletAddress: string, walletName: string) {
  const rpcUrl = process.env.SOLANA_RPC_URL;

  if (!rpcUrl) {
    throw new Error('SOLANA_RPC_URL not found');
  }

  console.log(`\n🔍 Checking ${walletName}: ${walletAddress}`);

  try {
    // Use DAS API to get assets
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 100,
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('   ❌ Error:', data.error.message);
      return;
    }

    const assets = data.result?.items || [];
    const compressedAssets = assets.filter(
      (asset: any) => asset.compression?.compressed === true
    );

    console.log(`   📊 Total assets: ${assets.length}`);
    console.log(`   🗜️  Compressed NFTs: ${compressedAssets.length}`);
    console.log(`   🎨 Standard NFTs: ${assets.length - compressedAssets.length}`);

    if (compressedAssets.length > 0) {
      console.log('\n   cNFTs found:');
      compressedAssets.forEach((asset: any, index: number) => {
        console.log(`   ${index + 1}. ${asset.content?.metadata?.name || 'Unknown'}`);
        console.log(`      ID: ${asset.id}`);
      });
    } else {
      console.log('   ℹ️  No cNFTs found - only standard NFTs');
    }
  } catch (error) {
    console.error('   ❌ Failed to check wallet:', error);
  }
}

async function main() {
  console.log('🔍 Checking Test Wallets for cNFTs\n');
  console.log('📡 RPC:', process.env.SOLANA_RPC_URL || 'Not configured');

  if (!process.env.SOLANA_RPC_URL) {
    console.error('\n❌ SOLANA_RPC_URL not configured');
    process.exit(1);
  }

  await checkForCNFTs(MAKER_ADDRESS, 'Maker (Sender)');
  await checkForCNFTs(TAKER_ADDRESS, 'Taker (Receiver)');

  console.log('\n✅ Check complete!');
  console.log('\n💡 To mint cNFTs:');
  console.log('   - See docs/development/CNFT_MINTING_GUIDE.md');
  console.log('   - Use QuickNode, Helius, or Underdog Protocol');
  console.log('   - Test page works with SPL NFTs in the meantime');
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});

