/**
 * Setup script for Staging E2E Tests
 * Mints 10 test NFTs to the sender wallet before running the test suite
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, createMint, mintTo } from '@solana/spl-token';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.staging
const envPath = path.resolve(process.cwd(), '.env.staging');
dotenv.config({ path: envPath, override: true });

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

async function setupTestNFTs(count: number = 10) {
  console.log('\n' + '='.repeat(80));
  console.log('🎨 Setting up test NFTs for STAGING E2E tests');
  console.log('='.repeat(80));
  console.log(`Target: ${count} NFTs`);
  console.log(`Network: devnet`);
  console.log(`RPC: ${RPC_URL}\n`);

  const connection = new Connection(RPC_URL, 'confirmed');

  // Load sender wallet
  const senderKeypairPath = path.resolve(process.cwd(), 'wallets/staging/staging-sender.json');
  
  if (!fs.existsSync(senderKeypairPath)) {
    console.error(`❌ Sender wallet not found: ${senderKeypairPath}`);
    process.exit(1);
  }
  
  const senderKeypairData = JSON.parse(fs.readFileSync(senderKeypairPath, 'utf-8'));
  const sender = Keypair.fromSecretKey(Uint8Array.from(senderKeypairData));

  console.log(`Sender: ${sender.publicKey.toBase58()}`);
  
  // Check current NFT count
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    sender.publicKey,
    { programId: TOKEN_PROGRAM_ID }
  );
  
  const existingNFTs = tokenAccounts.value.filter(
    account => account.account.data.parsed.info.tokenAmount.decimals === 0 
             && account.account.data.parsed.info.tokenAmount.uiAmount === 1
  ).length;
  
  console.log(`Current NFTs in wallet: ${existingNFTs}`);
  
  if (existingNFTs >= count) {
    console.log(`✅ Wallet already has ${existingNFTs} NFTs (target: ${count})`);
    console.log('✅ No minting needed - proceeding to tests\n');
    return;
  }
  
  const toMint = count - existingNFTs;
  console.log(`📝 Will mint ${toMint} additional NFT(s)\n`);

  const mintedNFTs: Array<{ mint: string; tokenAccount: string }> = [];

  for (let i = 0; i < toMint; i++) {
    try {
      console.log(`[${i + 1}/${toMint}] Minting NFT...`);
      
      // Create NFT mint (decimals = 0 for NFT)
      const nftMint = await createMint(
        connection,
        sender,
        sender.publicKey, // mint authority
        sender.publicKey, // freeze authority
        0 // decimals
      );
      
      console.log(`   ✅ Created mint: ${nftMint.toBase58()}`);
      
      // Create associated token account for sender
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        sender,
        nftMint,
        sender.publicKey
      );
      
      console.log(`   ✅ Created token account: ${tokenAccount.address.toBase58()}`);
      
      // Mint 1 NFT to sender
      await mintTo(
        connection,
        sender,
        nftMint,
        tokenAccount.address,
        sender.publicKey,
        1 // mint 1 NFT
      );
      
      console.log(`   ✅ Minted 1 NFT to sender`);

      mintedNFTs.push({
        mint: nftMint.toBase58(),
        tokenAccount: tokenAccount.address.toBase58(),
      });

      // Small delay between mints
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      console.error(`   ❌ Failed to mint NFT ${i + 1}: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`✅ Setup complete: Minted ${mintedNFTs.length}/${toMint} NFT(s)`);
  console.log(`📊 Total NFTs now in wallet: ${existingNFTs + mintedNFTs.length}`);
  console.log('='.repeat(80) + '\n');
}

// Run setup
const count = parseInt(process.argv[2] || '10');
setupTestNFTs(count).catch((error) => {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
});

