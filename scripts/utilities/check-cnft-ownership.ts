/**
 * Check cNFT Ownership
 * 
 * Diagnostic script to verify which wallet actually owns the cNFTs
 * showing on the test page.
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env.staging') });

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const MAKER_ADDRESS = process.env.DEVNET_STAGING_SENDER_ADDRESS!;
const TAKER_ADDRESS = process.env.DEVNET_STAGING_RECEIVER_ADDRESS!;
const ADMIN_ADDRESS = process.env.DEVNET_STAGING_ADMIN_ADDRESS!;

// The cNFT mint that's failing
const PROBLEMATIC_CNFT = '7NPB8YFQEAsARzpXG89W5YNrpV1xn2jCvZeGBD6NqHfJ';

async function checkCNFTOwnership() {
  console.log('🔍 Checking cNFT Ownership\n');
  console.log('Wallets:');
  console.log(`  Maker:  ${MAKER_ADDRESS}`);
  console.log(`  Taker:  ${TAKER_ADDRESS}`);
  console.log(`  Admin:  ${ADMIN_ADDRESS}`);
  console.log(`\nChecking cNFT: ${PROBLEMATIC_CNFT}\n`);

  try {
    // Query DAS API for asset info
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-asset',
        method: 'getAsset',
        params: {
          id: PROBLEMATIC_CNFT,
        },
      }),
    });

    const data = await response.json() as any;

    if (data.result) {
      const asset = data.result;
      console.log('✅ Asset Found!\n');
      console.log('Asset Details:');
      console.log(`  Name: ${asset.content?.metadata?.name || 'Unknown'}`);
      console.log(`  Compressed: ${asset.compression?.compressed}`);
      console.log(`  Burnt: ${asset.burnt}`);
      console.log(`  Frozen: ${asset.frozen}`);
      console.log(`\nOwnership:`);
      console.log(`  Current Owner: ${asset.ownership?.owner}`);
      console.log(`\nComparison:`);
      console.log(`  Maker Match:  ${asset.ownership?.owner === MAKER_ADDRESS ? '✅ YES' : '❌ NO'}`);
      console.log(`  Taker Match:  ${asset.ownership?.owner === TAKER_ADDRESS ? '✅ YES' : '❌ NO'}`);
      console.log(`  Admin Match:  ${asset.ownership?.owner === ADMIN_ADDRESS ? '✅ YES' : '❌ NO'}`);
      
      console.log('\n📋 Diagnosis:');
      if (asset.ownership?.owner === MAKER_ADDRESS) {
        console.log('✅ cNFT correctly owned by Maker - ownership validation may be caching issue');
      } else if (asset.ownership?.owner === ADMIN_ADDRESS) {
        console.log('❌ cNFT owned by ADMIN wallet, not Maker!');
        console.log('   Solution: Mint new cNFTs directly to Maker/Taker wallets');
      } else if (asset.ownership?.owner === TAKER_ADDRESS) {
        console.log('❌ cNFT owned by Taker, but being offered by Maker!');
        console.log('   Solution: Use correct wallet or mint new cNFTs');
      } else {
        console.log(`❌ cNFT owned by unknown wallet: ${asset.ownership?.owner}`);
        console.log('   Solution: Mint new cNFTs to correct wallets');
      }
    } else {
      console.log('❌ Asset not found or DAS API error');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
checkCNFTOwnership().catch(console.error);

