/**
 * Script to find and revoke delegated cNFTs on mainnet
 * Usage: npx ts-node scripts/revoke-delegated-cnfts.ts
 */

// Use native fetch (Node 18+)

const HELIUS_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PRODUCTION_API = 'https://api.easyescrow.ai';

const MAINNET_WALLETS = [
  'B7jiNm8TKvaoad3N36pyDeXMSVPmvHLaXZMDC7udhTfr', // Sender
  '3qYD5LwHSuxwLi2mECzoVEmH2M7aehNjodUZCdmnCwtY', // Receiver
];

interface DelegatedAsset {
  assetId: string;
  name: string;
  owner: string;
  delegate: string;
}

async function findDelegatedCNFTs(): Promise<DelegatedAsset[]> {
  const delegatedAssets: DelegatedAsset[] = [];

  for (const wallet of MAINNET_WALLETS) {
    console.log(`\n🔍 Checking wallet: ${wallet}`);

    const response = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-assets',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet,
          page: 1,
          limit: 100,
        },
      }),
    });

    const data = (await response.json()) as any;

    if (data.error) {
      console.error(`  ❌ Error fetching assets: ${data.error.message}`);
      continue;
    }

    const assets = data.result?.items || [];
    console.log(`  📦 Found ${assets.length} total assets`);

    // Filter for delegated cNFTs
    for (const asset of assets) {
      if (asset.compression?.compressed && asset.ownership?.delegated) {
        delegatedAssets.push({
          assetId: asset.id,
          name: asset.content?.metadata?.name || 'Unknown',
          owner: asset.ownership.owner,
          delegate: asset.ownership.delegate,
        });
        console.log(`  ⚠️ DELEGATED: ${asset.id}`);
        console.log(`     Name: ${asset.content?.metadata?.name || 'Unknown'}`);
        console.log(`     Delegate: ${asset.ownership.delegate}`);
      }
    }
  }

  return delegatedAssets;
}

async function revokeDelegation(assetId: string, ownerWallet: string): Promise<boolean> {
  console.log(`\n🔓 Revoking delegation for ${assetId}...`);

  try {
    const response = await fetch(`${PRODUCTION_API}/api/test/revoke-cnft-delegation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Execution': 'true',
      },
      body: JSON.stringify({
        assetId,
        ownerWallet,
      }),
    });

    const result = (await response.json()) as any;

    if (result.success) {
      console.log(`  ✅ Successfully revoked! TX: ${result.signature}`);
      return true;
    } else {
      console.error(`  ❌ Failed: ${result.error}`);
      return false;
    }
  } catch (error: any) {
    console.error(`  ❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🔍 Finding delegated cNFTs on mainnet...\n');

  const delegatedAssets = await findDelegatedCNFTs();

  if (delegatedAssets.length === 0) {
    console.log('\n✅ No delegated cNFTs found!');
    return;
  }

  console.log(`\n📋 Found ${delegatedAssets.length} delegated cNFT(s)`);
  console.log('─'.repeat(60));

  // Ask before revoking
  console.log('\nProceeding to revoke delegations...\n');

  let successCount = 0;
  let failCount = 0;

  for (const asset of delegatedAssets) {
    const success = await revokeDelegation(asset.assetId, asset.owner);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    // Small delay between revocations
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`✅ Successfully revoked: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
}

main().catch(console.error);
