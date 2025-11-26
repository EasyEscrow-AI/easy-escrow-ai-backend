/**
 * List Wallet cNFTs
 * 
 * Query DAS API to see what cNFTs a wallet actually owns
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env.staging') });

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const MAKER_ADDRESS = process.env.DEVNET_STAGING_SENDER_ADDRESS!;
const TAKER_ADDRESS = process.env.DEVNET_STAGING_RECEIVER_ADDRESS!;

async function listWalletCNFTs(address: string, label: string) {
  console.log(`\n🔍 Checking ${label} (${address})\n`);

  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-assets',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: address,
          page: 1,
          limit: 1000,
        },
      }),
    });

    const data = await response.json() as any;

    if (data.result && data.result.items) {
      const cNfts = data.result.items.filter((asset: any) => asset.compression?.compressed === true);
      
      console.log(`Total Assets: ${data.result.total}`);
      console.log(`Compressed NFTs: ${cNfts.length}\n`);

      if (cNfts.length > 0) {
        console.log('cNFTs owned:');
        cNfts.forEach((asset: any, index: number) => {
          console.log(`  ${index + 1}. ${asset.content?.metadata?.name || 'Unknown'}`);
          console.log(`     ID: ${asset.id}`);
          console.log(`     Short: ${asset.id.substring(0, 8)}...${asset.id.substring(asset.id.length - 6)}`);
          console.log(`     Burnt: ${asset.burnt}`);
          console.log(`     Frozen: ${asset.frozen}`);
          console.log('');
        });
      } else {
        console.log('❌ No cNFTs found for this wallet\n');
      }
    } else {
      console.log('❌ Error or no assets found');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function main() {
  console.log('====================================');
  console.log('   cNFT Ownership Diagnostic');
  console.log('====================================');
  
  await listWalletCNFTs(MAKER_ADDRESS, 'MAKER');
  await listWalletCNFTs(TAKER_ADDRESS, 'TAKER');
  
  console.log('\n====================================');
  console.log('   Summary');
  console.log('====================================');
  console.log('\n💡 If no cNFTs are found, you need to mint new ones');
  console.log('💡 Use: npm run mint-cnfts');
  console.log('💡 Or manually mint using scripts/utilities/mint-cnft-with-images.ts\n');
}

main().catch(console.error);

