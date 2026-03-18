#!/usr/bin/env ts-node
/**
 * Scan Production Wallets for NFTs
 *
 * Scans the production maker/taker wallets and updates the test assets fixture.
 *
 * Usage:
 *   npx ts-node scripts/testing/scan-production-assets.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const MPL_CORE_PROGRAM = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

interface NftAsset {
  mint: string;
  tokenAccount?: string;
  type: 'SPL' | 'cNFT' | 'Core';
}

async function scanWalletNfts(connection: Connection, wallet: PublicKey): Promise<NftAsset[]> {
  const nfts: NftAsset[] = [];

  // Get SPL token accounts
  const tokenAccounts = await connection.getTokenAccountsByOwner(wallet, {
    programId: TOKEN_PROGRAM_ID,
  });

  for (const { account, pubkey } of tokenAccounts.value) {
    const data = account.data;
    // Token account layout: mint (32 bytes), owner (32 bytes), amount (8 bytes)
    const mint = new PublicKey(data.slice(0, 32));
    const amount = Number(data.slice(64, 72).readBigUInt64LE());

    if (amount === 1) {
      nfts.push({
        mint: mint.toBase58(),
        tokenAccount: pubkey.toBase58(),
        type: 'SPL',
      });
    }
  }

  return nfts;
}

async function scanCnfts(wallet: PublicKey): Promise<NftAsset[]> {
  const cnfts: NftAsset[] = [];
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

  if (!HELIUS_API_KEY) {
    console.log('⚠️  HELIUS_API_KEY not set, skipping cNFT scan');
    return cnfts;
  }

  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'scan-cnfts',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet.toBase58(),
          displayOptions: { showUnverifiedCollections: true, showNativeBalance: false },
        },
      }),
    });

    const result = await response.json() as any;

    if (result.result?.items) {
      for (const item of result.result.items) {
        if (item.compression?.compressed) {
          cnfts.push({
            mint: item.id,
            type: 'cNFT',
          });
        }
      }
    }
  } catch (error) {
    console.error('Error scanning cNFTs:', error);
  }

  return cnfts;
}

async function scanCoreNfts(connection: Connection, wallet: PublicKey): Promise<NftAsset[]> {
  const coreNfts: NftAsset[] = [];
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

  if (!HELIUS_API_KEY) {
    console.log('⚠️  HELIUS_API_KEY not set, skipping Core NFT scan');
    return coreNfts;
  }

  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'scan-core',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet.toBase58(),
          displayOptions: { showUnverifiedCollections: true, showNativeBalance: false },
        },
      }),
    });

    const result = await response.json() as any;

    if (result.result?.items) {
      for (const item of result.result.items) {
        // Core NFTs have interface "V1_NFT" and are under MPL Core program
        if (item.interface === 'MplCoreAsset') {
          coreNfts.push({
            mint: item.id,
            type: 'Core',
          });
        }
      }
    }
  } catch (error) {
    console.error('Error scanning Core NFTs:', error);
  }

  return coreNfts;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Production Asset Scanner                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  console.log('📡 RPC:', RPC_URL);

  // Load wallets
  const makerPath = path.join(__dirname, '../../wallets/production/production-sender.json');
  const takerPath = path.join(__dirname, '../../wallets/production/production-receiver.json');

  const maker = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(makerPath, 'utf8'))));
  const taker = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(takerPath, 'utf8'))));

  console.log('🔑 Maker:', maker.publicKey.toBase58());
  console.log('🔑 Taker:', taker.publicKey.toBase58());

  // Scan maker wallet
  console.log('\n📊 Scanning Maker wallet...');
  const makerSplNfts = await scanWalletNfts(connection, maker.publicKey);
  const makerCnfts = await scanCnfts(maker.publicKey);
  const makerCoreNfts = await scanCoreNfts(connection, maker.publicKey);

  console.log(`   SPL NFTs: ${makerSplNfts.length}`);
  console.log(`   cNFTs: ${makerCnfts.length}`);
  console.log(`   Core NFTs: ${makerCoreNfts.length}`);

  // Scan taker wallet
  console.log('\n📊 Scanning Taker wallet...');
  const takerSplNfts = await scanWalletNfts(connection, taker.publicKey);
  const takerCnfts = await scanCnfts(taker.publicKey);
  const takerCoreNfts = await scanCoreNfts(connection, taker.publicKey);

  console.log(`   SPL NFTs: ${takerSplNfts.length}`);
  console.log(`   cNFTs: ${takerCnfts.length}`);
  console.log(`   Core NFTs: ${takerCoreNfts.length}`);

  // Build output
  const output = {
    maker: {
      splNfts: makerSplNfts,
      cnfts: makerCnfts,
      coreNfts: makerCoreNfts,
    },
    taker: {
      splNfts: takerSplNfts,
      cnfts: takerCnfts,
      coreNfts: takerCoreNfts,
    },
    timestamp: new Date().toISOString(),
  };

  // Write to fixtures
  const outputPath = path.join(__dirname, '../../tests/fixtures/production-test-assets.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log('\n✅ Updated:', outputPath);
  console.log('\n📝 Summary:');
  console.log(`   Maker: ${makerSplNfts.length} SPL, ${makerCnfts.length} cNFT, ${makerCoreNfts.length} Core`);
  console.log(`   Taker: ${takerSplNfts.length} SPL, ${takerCnfts.length} cNFT, ${takerCoreNfts.length} Core`);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
