/**
 * Setup script for Production E2E Tests
 * Mints 10 test NFTs to the sender wallet before running the test suite
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.PRODUCTION
const envPath = path.resolve(process.cwd(), '.env.PRODUCTION');
dotenv.config({ path: envPath, override: true });

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

interface JitoJsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: string;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

async function sendViaJito(transaction: Transaction): Promise<string> {
  const serializedTx = transaction.serialize().toString('base64');
  
  const response = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [serializedTx, { encoding: 'base64' }],
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jito Block Engine error: ${response.status} ${errorText}`);
  }
  
  const result = await response.json() as JitoJsonRpcResponse;
  if (result.error) {
    throw new Error(`Jito Block Engine error: ${JSON.stringify(result.error)}`);
  }
  
  return result.result!;
}

async function setupTestNFTs(count: number = 10) {
  console.log('\n' + '='.repeat(80));
  console.log('🎨 Setting up test NFTs for PRODUCTION E2E tests');
  console.log('='.repeat(80));
  console.log(`Target: ${count} NFTs`);
  console.log(`Network: mainnet-beta`);
  console.log(`RPC: ${RPC_URL}\n`);

  const connection = new Connection(RPC_URL, 'confirmed');

  // Load sender wallet
  const senderKeypairPath = path.resolve(process.cwd(), 'wallets/production/production-sender.json');
  
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

  const mintedNFTs: Array<{ mint: string; tokenAccount: string; tx: string }> = [];

  for (let i = 0; i < toMint; i++) {
    try {
      console.log(`[${i + 1}/${toMint}] Minting NFT...`);
      
      const mintKeypair = Keypair.generate();
      const mintRent = await getMinimumBalanceForRentExemptMint(connection);
      
      // Get ATA
      const tokenAccount = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        sender.publicKey
      );

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      // Build transaction
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = sender.publicKey;

      // Add compute budget
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })
      );

      // Create mint account
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: sender.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // Initialize mint
      transaction.add(
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          0, // decimals
          sender.publicKey, // mint authority
          sender.publicKey, // freeze authority
          TOKEN_PROGRAM_ID
        )
      );

      // Create ATA
      transaction.add(
        createAssociatedTokenAccountInstruction(
          sender.publicKey, // payer
          tokenAccount,
          sender.publicKey, // owner
          mintKeypair.publicKey
        )
      );

      // Mint 1 token
      transaction.add(
        createMintToInstruction(
          mintKeypair.publicKey,
          tokenAccount,
          sender.publicKey,
          1,
          []
        )
      );

      // Sign
      transaction.sign(sender, mintKeypair);

      // Send via Jito
      const txId = await sendViaJito(transaction);
      console.log(`   ✅ Minted: ${mintKeypair.publicKey.toBase58()}`);

      // Wait for confirmation
      await connection.confirmTransaction(txId, 'confirmed');

      mintedNFTs.push({
        mint: mintKeypair.publicKey.toBase58(),
        tokenAccount: tokenAccount.toBase58(),
        tx: txId,
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

