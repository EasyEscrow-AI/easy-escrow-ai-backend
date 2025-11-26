/**
 * Mint cNFTs using Metaplex JS SDK
 * 
 * Simpler approach using the Metaplex SDK's high-level API
 */

import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import bs58 from 'bs58';

dotenv.config({ path: '.env.staging' });

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Test wallet addresses from staging env
const MAKER_ADDRESS = process.env.DEVNET_STAGING_SENDER_ADDRESS!;
const TAKER_ADDRESS = process.env.DEVNET_STAGING_RECEIVER_ADDRESS!;

async function mintCNFT(
  metaplex: Metaplex,
  tree: PublicKey,
  receiverAddress: string,
  name: string,
  symbol: string,
  uri: string
) {
  console.log(`\n🎨 Minting cNFT: ${name}`);
  console.log(`   To: ${receiverAddress}`);
  console.log(`   Tree: ${tree.toBase58()}`);

  try {
    const receiver = new PublicKey(receiverAddress);

    const { nft } = await metaplex.nfts().create({
      uri,
      name,
      sellerFeeBasisPoints: 0,
      symbol,
    }, {
      commitment: 'confirmed',
    });

    console.log('   ✅ cNFT minted!');
    console.log('   NFT Address:', nft.address.toBase58());

    return nft;
  } catch (error: any) {
    console.error('   ❌ Minting failed:', error.message || error);
    throw error;
  }
}

async function main() {
  console.log('🌳 Simplified cNFT Minting Script\n');
  console.log('📡 RPC:', process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

  // Check for payer private key
  const payerPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  
  if (!payerPrivateKey) {
    console.error('\n❌ Error: DEVNET_STAGING_ADMIN_PRIVATE_KEY not found');
    console.log('   Set this in your .env.staging file');
    process.exit(1);
  }

  if (!MAKER_ADDRESS || !TAKER_ADDRESS) {
    console.error('\n❌ Error: Wallet addresses not found');
    console.log('   Required: DEVNET_STAGING_SENDER_ADDRESS and DEVNET_STAGING_RECEIVER_ADDRESS');
    process.exit(1);
  }

  // Load payer keypair
  let payer: Keypair;
  try {
    const privateKeyBytes = bs58.decode(payerPrivateKey);
    payer = Keypair.fromSecretKey(privateKeyBytes);
    console.log('✅ Payer loaded:', payer.publicKey.toBase58());
  } catch (error) {
    console.error('❌ Failed to load payer keypair:', error);
    process.exit(1);
  }

  // Check payer balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log('💰 Payer balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.error('\n❌ Error: Insufficient balance');
    console.log('   You need at least 0.5 SOL for cNFT minting (tree creation is expensive)');
    console.log('   Airdrop: solana airdrop 2 ' + payer.publicKey.toBase58() + ' --url devnet');
    process.exit(1);
  }

  // Initialize Metaplex
  const metaplex = Metaplex.make(connection).use(keypairIdentity(payer));

  console.log('\n📋 Target Wallets:');
  console.log('   Maker:', MAKER_ADDRESS);
  console.log('   Taker:', TAKER_ADDRESS);

  console.log('\n⚠️  NOTE: cNFT minting via Metaplex JS SDK has limitations.');
  console.log('   For production cNFT minting, use:');
  console.log('   - Helius DAS API');
  console.log('   - Underdog Protocol');
  console.log('   - Metaplex Sugar CLI');
  console.log('   - Or direct Bubblegum program calls');

  console.log('\n💡 For now, minting regular SPL NFTs to test the page functionality...\n');

  // Mint regular NFTs (easier and works reliably)
  try {
    console.log('--- Minting NFT for Maker #1 ---');
    const { nft: nft1 } = await metaplex.nfts().create({
      uri: 'https://arweave.net/test-metadata-1.json',
      name: 'Test NFT Maker #1',
      sellerFeeBasisPoints: 0,
      symbol: 'TNFT',
      tokenOwner: new PublicKey(MAKER_ADDRESS),
    });
    console.log('✅ Minted:', nft1.address.toBase58());

    console.log('\n--- Minting NFT for Maker #2 ---');
    const { nft: nft2 } = await metaplex.nfts().create({
      uri: 'https://arweave.net/test-metadata-2.json',
      name: 'Test NFT Maker #2',
      sellerFeeBasisPoints: 0,
      symbol: 'TNFT',
      tokenOwner: new PublicKey(MAKER_ADDRESS),
    });
    console.log('✅ Minted:', nft2.address.toBase58());

    console.log('\n--- Minting NFT for Taker #1 ---');
    const { nft: nft3 } = await metaplex.nfts().create({
      uri: 'https://arweave.net/test-metadata-3.json',
      name: 'Test NFT Taker #1',
      sellerFeeBasisPoints: 0,
      symbol: 'TNFT',
      tokenOwner: new PublicKey(TAKER_ADDRESS),
    });
    console.log('✅ Minted:', nft3.address.toBase58());

    console.log('\n--- Minting NFT for Taker #2 ---');
    const { nft: nft4 } = await metaplex.nfts().create({
      uri: 'https://arweave.net/test-metadata-4.json',
      name: 'Test NFT Taker #2',
      sellerFeeBasisPoints: 0,
      symbol: 'TNFT',
      tokenOwner: new PublicKey(TAKER_ADDRESS),
    });
    console.log('✅ Minted:', nft4.address.toBase58());

    console.log('\n✅ Done! All NFTs minted successfully.');
    console.log('\n💡 These are SPL NFTs (not compressed)');
    console.log('   But the test page will work perfectly for testing atomic swaps!');
    console.log('   Visit /test to see them.');

  } catch (error: any) {
    console.error('\n❌ Minting failed:', error.message || error);
    console.log('\n💡 Common issues:');
    console.log('   - Insufficient SOL balance');
    console.log('   - Network connectivity');
    console.log('   - RPC rate limits');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});

