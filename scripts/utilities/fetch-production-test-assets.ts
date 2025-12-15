#!/usr/bin/env ts-node
/**
 * Fetch Production Test Assets
 * 
 * Queries production wallets for available NFTs, cNFTs, and Core NFTs
 * to use in E2E tests.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Load production environment
dotenv.config({ path: path.join(__dirname, '../../.env.production'), override: true });

const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';

interface AssetInfo {
  mint: string;
  tokenAccount?: string;
  type: 'SPL' | 'cNFT' | 'Core';
}

async function getSPLNFTs(connection: Connection, owner: PublicKey): Promise<AssetInfo[]> {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID }
    );
    
    const nfts: AssetInfo[] = tokenAccounts.value
      .filter(account => {
        const data = account.account.data.parsed?.info;
        if (!data) return false;
        
        const decimals = data.tokenAmount?.decimals;
        const amount = Number(data.tokenAmount?.amount || '0');
        
        // NFT criteria: decimals=0, amount=1
        return decimals === 0 && amount === 1;
      })
      .map(account => ({
        mint: account.account.data.parsed.info.mint,
        tokenAccount: account.pubkey.toBase58(),
        type: 'SPL' as const,
      }));
    
    return nfts;
  } catch (error) {
    console.error(`Error fetching SPL NFTs:`, error);
    return [];
  }
}

async function getCNFTs(connection: Connection, owner: PublicKey): Promise<AssetInfo[]> {
  try {
    const rpcUrl = process.env.MAINNET_RPC_URL || RPC_URL;
    
    // Check if RPC supports DAS API (QuickNode, Helius, etc.)
    const isDasSupported = rpcUrl.includes('quicknode') || 
                           rpcUrl.includes('helius') || 
                           rpcUrl.includes('underdog') ||
                           rpcUrl.includes('mainnet-beta');
    
    if (!isDasSupported) {
      console.log(`⚠️  RPC URL doesn't appear to support DAS API: ${rpcUrl}`);
      return [];
    }
    
    // Use DAS API to get assets
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: owner.toBase58(),
          page: 1,
          limit: 1000,
        },
      }),
    });
    
    const data = await response.json() as {
      error?: { message?: string };
      result?: { items?: any[] };
    };
    
    if (data.error) {
      console.error(`Error fetching cNFTs: ${data.error.message}`);
      return [];
    }
    
    const assets = data.result?.items || [];
    
    // Filter for compressed NFTs (cNFTs)
    const cnfts: AssetInfo[] = assets
      .filter((asset: any) => {
        const isCompressed = asset.compression?.compressed === true;
        const isOwned = asset.ownership?.owner === owner.toBase58();
        const notBurnt = !asset.burnt;
        const notFrozen = !asset.frozen;
        
        return isCompressed && isOwned && notBurnt && notFrozen;
      })
      .map((asset: any) => ({
        mint: asset.id, // cNFT asset ID
        type: 'cNFT' as const,
      }));
    
    return cnfts;
  } catch (error) {
    console.error(`Error fetching cNFTs:`, error);
    return [];
  }
}

async function getCoreNFTs(connection: Connection, owner: PublicKey): Promise<AssetInfo[]> {
  try {
    const rpcUrl = process.env.MAINNET_RPC_URL || RPC_URL;
    
    // Check if RPC supports DAS API
    const isDasSupported = rpcUrl.includes('quiknode') || 
                           rpcUrl.includes('helius') || 
                           rpcUrl.includes('underdog') ||
                           rpcUrl.includes('mainnet-beta');
    
    if (!isDasSupported) {
      console.log(`⚠️  RPC URL doesn't appear to support DAS API: ${rpcUrl}`);
      return [];
    }
    
    // Use DAS API to get assets
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: owner.toBase58(),
          page: 1,
          limit: 1000,
        },
      }),
    });
    
    const data = await response.json() as {
      error?: { message?: string };
      result?: { items?: any[] };
    };
    
    if (data.error) {
      console.error(`Error fetching Core NFTs: ${data.error.message}`);
      return [];
    }
    
    const assets = data.result?.items || [];
    
    // Filter for Metaplex Core NFTs
    // IMPORTANT: Exclude cNFTs (they have compression.compressed = true)
    const coreNfts: AssetInfo[] = assets
      .filter((asset: any) => {
        // FIRST: Exclude compressed NFTs (cNFTs) - they are NOT Core NFTs
        const isCompressed = asset.compression?.compressed === true;
        if (isCompressed) {
          return false;
        }
        
        // Metaplex Core NFTs have specific interface names
        const interfaceName = asset.interface?.toLowerCase() || '';
        const isCoreNft = interfaceName === 'mplcoreasset' ||
                         interfaceName === 'mplcorecollection' ||
                         asset.interface === 'MplCoreAsset' ||
                         asset.interface === 'MplCoreCollection';
        
        const isOwned = asset.ownership?.owner === owner.toBase58();
        const notBurnt = !asset.burnt;
        const notFrozen = !asset.frozen;
        
        return isCoreNft && isOwned && notBurnt && notFrozen;
      })
      .map((asset: any) => ({
        mint: asset.id, // Core NFT asset ID
        type: 'Core' as const,
      }));
    
    return coreNfts;
  } catch (error) {
    console.error(`Error fetching Core NFTs:`, error);
    return [];
  }
}

async function main() {
  console.log('\n🔍 Fetching Production Test Assets\n');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Load production wallets
  const makerPath = path.join(__dirname, '../../wallets/production/production-sender.json');
  const takerPath = path.join(__dirname, '../../wallets/production/production-receiver.json');
  
  if (!fs.existsSync(makerPath) || !fs.existsSync(takerPath)) {
    console.error('❌ Production wallet files not found!');
    console.error(`   Maker: ${makerPath}`);
    console.error(`   Taker: ${takerPath}`);
    process.exit(1);
  }
  
  const maker = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(makerPath, 'utf8'))));
  const taker = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(takerPath, 'utf8'))));
  
  console.log('📦 Maker Wallet:', maker.publicKey.toBase58());
  console.log('📦 Taker Wallet:', taker.publicKey.toBase58());
  console.log();
  
  // Fetch assets
  console.log('🔍 Fetching SPL NFTs...\n');
  
  const makerSPLNFTs = await getSPLNFTs(connection, maker.publicKey);
  const takerSPLNFTs = await getSPLNFTs(connection, taker.publicKey);
  
  console.log(`✅ Maker SPL NFTs: ${makerSPLNFTs.length}`);
  makerSPLNFTs.forEach((nft, i) => {
    console.log(`   ${i + 1}. ${nft.mint}`);
    console.log(`      Token Account: ${nft.tokenAccount}`);
  });
  
  console.log(`\n✅ Taker SPL NFTs: ${takerSPLNFTs.length}`);
  takerSPLNFTs.forEach((nft, i) => {
    console.log(`   ${i + 1}. ${nft.mint}`);
    console.log(`      Token Account: ${nft.tokenAccount}`);
  });
  
  // Fetch cNFTs and Core NFTs
  console.log('\n🔍 Fetching cNFTs...\n');
  const makerCNFTs = await getCNFTs(connection, maker.publicKey);
  const takerCNFTs = await getCNFTs(connection, taker.publicKey);
  
  console.log(`✅ Maker cNFTs: ${makerCNFTs.length}`);
  makerCNFTs.forEach((cnft, i) => {
    console.log(`   ${i + 1}. ${cnft.mint}`);
  });
  
  console.log(`\n✅ Taker cNFTs: ${takerCNFTs.length}`);
  takerCNFTs.forEach((cnft, i) => {
    console.log(`   ${i + 1}. ${cnft.mint}`);
  });
  
  console.log('\n🔍 Fetching Core NFTs...\n');
  const makerCoreNFTs = await getCoreNFTs(connection, maker.publicKey);
  const takerCoreNFTs = await getCoreNFTs(connection, taker.publicKey);
  
  console.log(`✅ Maker Core NFTs: ${makerCoreNFTs.length}`);
  makerCoreNFTs.forEach((core, i) => {
    console.log(`   ${i + 1}. ${core.mint}`);
  });
  
  console.log(`\n✅ Taker Core NFTs: ${takerCoreNFTs.length}`);
  takerCoreNFTs.forEach((core, i) => {
    console.log(`   ${i + 1}. ${core.mint}`);
  });
  
  // Save to JSON file for test files to use
  const assetsData = {
    maker: {
      splNfts: makerSPLNFTs,
      cnfts: makerCNFTs,
      coreNfts: makerCoreNFTs,
    },
    taker: {
      splNfts: takerSPLNFTs,
      cnfts: takerCNFTs,
      coreNfts: takerCoreNFTs,
    },
    timestamp: new Date().toISOString(),
  };
  
  const outputPath = path.join(__dirname, '../../tests/fixtures/production-test-assets.json');
  fs.writeFileSync(outputPath, JSON.stringify(assetsData, null, 2));
  
  console.log(`\n✅ Assets saved to: ${outputPath}`);
  console.log('\n📋 Summary:');
  console.log(`   Maker SPL NFTs: ${makerSPLNFTs.length}`);
  console.log(`   Taker SPL NFTs: ${takerSPLNFTs.length}`);
  console.log(`   Maker cNFTs: ${assetsData.maker.cnfts.length}`);
  console.log(`   Taker cNFTs: ${assetsData.taker.cnfts.length}`);
  console.log(`   Maker Core NFTs: ${assetsData.maker.coreNfts.length}`);
  console.log(`   Taker Core NFTs: ${assetsData.taker.coreNfts.length}`);
  
  if (makerSPLNFTs.length < 4 || takerSPLNFTs.length < 2) {
    console.log('\n⚠️  WARNING: Insufficient NFTs for all test scenarios!');
    console.log('   Bulk swap tests require:');
    console.log('   - Maker: 4+ NFTs');
    console.log('   - Taker: 2+ NFTs');
  }
}

main().catch(console.error);

