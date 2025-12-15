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

async function getCNFTs(owner: PublicKey): Promise<AssetInfo[]> {
  // For cNFTs, we'd need to use DAS API
  // This is a placeholder - would need DAS API integration
  console.log(`⚠️  cNFT fetching not implemented - requires DAS API`);
  return [];
}

async function getCoreNFTs(owner: PublicKey): Promise<AssetInfo[]> {
  // For Core NFTs, we'd need to query the Core program
  // This is a placeholder - would need Core program integration
  console.log(`⚠️  Core NFT fetching not implemented - requires Core program query`);
  return [];
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
  
  // Save to JSON file for test files to use
  const assetsData = {
    maker: {
      splNfts: makerSPLNFTs,
      cnfts: await getCNFTs(maker.publicKey),
      coreNfts: await getCoreNFTs(maker.publicKey),
    },
    taker: {
      splNfts: takerSPLNFTs,
      cnfts: await getCNFTs(taker.publicKey),
      coreNfts: await getCoreNFTs(taker.publicKey),
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

