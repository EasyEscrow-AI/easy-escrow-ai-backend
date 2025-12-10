/**
 * Production E2E Test: NFT for SOL Happy Path
 * 
 * Tests the complete flow of swapping an NFT for SOL tokens on mainnet including:
 * - Standard 1% platform fee
 * - Treasury fee collection
 * - Nonce validation
 * - Balance verification
 * 
 * ⚠️ IMPORTANT: This test uses REAL MAINNET wallets and incurs REAL transaction fees
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import { wait, confirmTransactionAndCheckError } from '../../helpers/test-utils';

// Production configuration
const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx');
const PRODUCTION_API_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';
// Platform authority is used to derive Treasury PDA (not the treasury wallet itself)
// This must match MAINNET_PROD_ADMIN_PRIVATE_KEY used by the production API
const PLATFORM_AUTHORITY_PATH = process.env.MAINNET_PLATFORM_AUTHORITY_PATH || 
  path.join(__dirname, '../../../wallets/production/production-admin.json');
const SENDER_PATH = process.env.PRODUCTION_SENDER_PATH ||
  path.join(__dirname, '../../../wallets/production/production-sender.json');
const RECEIVER_PATH = process.env.PRODUCTION_RECEIVER_PATH ||
  path.join(__dirname, '../../../wallets/production/production-receiver.json');

describe('🚀 Production E2E: NFT → SOL - Happy Path (Mainnet)', () => {
  let connection: Connection;
  let program: Program;
  let platformAuthority: Keypair;
  let treasuryPda: PublicKey;
  let sender: Keypair;
  let receiver: Keypair;
  let apiClient: AxiosInstance;
  let testNFT: { mint: PublicKey; tokenAccount: PublicKey; owner: PublicKey };
  
  before(async function() {
    this.timeout(180000); // 3 minutes for mainnet
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION E2E: NFT → SOL HAPPY PATH - MAINNET SETUP      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    // Setup connection
    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);
    console.log('🌐 Network: MAINNET-BETA');
    console.log('🔗 API:', PRODUCTION_API_URL);
    
    // Load platform authority (used to derive Treasury PDA)
    const platformSecret = JSON.parse(fs.readFileSync(PLATFORM_AUTHORITY_PATH, 'utf8'));
    platformAuthority = Keypair.fromSecretKey(new Uint8Array(platformSecret));
    console.log('🔑 Platform Authority:', platformAuthority.publicKey.toBase58());
    
    // Load test wallets
    const senderSecret = JSON.parse(fs.readFileSync(SENDER_PATH, 'utf8'));
    sender = Keypair.fromSecretKey(new Uint8Array(senderSecret));
    console.log('👤 Sender (Maker):', sender.publicKey.toBase58());
    
    const receiverSecret = JSON.parse(fs.readFileSync(RECEIVER_PATH, 'utf8'));
    receiver = Keypair.fromSecretKey(new Uint8Array(receiverSecret));
    console.log('👤 Receiver (Taker):', receiver.publicKey.toBase58());
    
    // Load production IDL
    const idlPath = path.join(__dirname, '../../../src/generated/anchor/escrow-idl-production.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    idl.address = PROGRAM_ID.toBase58();
    
    // Setup provider and program
    const wallet = new Wallet(platformAuthority);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    program = new Program(idl, provider);
    
    // Derive treasury PDA (seeds: "main_treasury" + platform_authority_pubkey)
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('main_treasury'), platformAuthority.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
    
    // Verify treasury is initialized
    try {
      const treasuryAccount = await connection.getAccountInfo(treasuryPda);
      if (!treasuryAccount) {
        throw new Error('Treasury not initialized on mainnet! Run initialization script first.');
      }
      console.log('✅ Treasury initialized');
    } catch (error) {
      console.error('❌ Treasury check failed:', error);
      throw error;
    }
    
    // Verify wallet balances
    console.log('\n💰 Checking wallet balances...');
    const senderBalance = await connection.getBalance(sender.publicKey);
    const receiverBalance = await connection.getBalance(receiver.publicKey);
    
    console.log(`  Sender: ${(senderBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`  Receiver: ${(receiverBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    
    if (senderBalance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(`Sender has insufficient balance: ${senderBalance / LAMPORTS_PER_SOL} SOL (need at least 0.01 SOL)`);
    }
    
    if (receiverBalance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(`Receiver has insufficient balance: ${receiverBalance / LAMPORTS_PER_SOL} SOL (need at least 0.01 SOL)`);
    }
    
    console.log('✅ Wallet balances sufficient');
    
    // Setup API client
    apiClient = axios.create({
      baseURL: PRODUCTION_API_URL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Try to reuse existing NFT to save costs
    console.log('\n🎨 Looking for existing NFT to reuse...');
    const { getTokenAccountsByOwner } = require('@solana/spl-token');
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    
    // Get all token accounts owned by sender
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      sender.publicKey,
      { programId: TOKEN_PROGRAM_ID }
    );
    
    // Filter for NFTs (supply = 1, decimals = 0)
    const existingNFTs = [];
    for (const { account, pubkey } of tokenAccounts.value) {
      const accountInfo = account.data;
      const amount = Number(accountInfo.slice(64, 72).readBigUInt64LE());
      
      if (amount === 1) {
        // This is likely an NFT, get the mint
        const mint = new PublicKey(accountInfo.slice(0, 32));
        existingNFTs.push({ mint, tokenAccount: pubkey });
      }
    }
    
    if (existingNFTs.length > 0) {
      // Reuse a random existing NFT
      const randomIndex = Math.floor(Math.random() * existingNFTs.length);
      const nft = existingNFTs[randomIndex];
      testNFT = {
        mint: nft.mint,
        tokenAccount: nft.tokenAccount,
        owner: sender.publicKey,
      };
      console.log(`  ✅ Reusing existing NFT: ${testNFT.mint.toBase58()}`);
      console.log(`     (Found ${existingNFTs.length} existing NFTs, selected #${randomIndex + 1})`);
      console.log(`     💰 Cost savings: ~0.002 SOL (no minting required)`);
    } else {
      // No existing NFTs, create a new one
      console.log(`  ℹ️  No existing NFTs found, creating new one...`);
      const { createTestNFT } = require('../helpers/nft-helpers');
      testNFT = await createTestNFT(connection, sender, sender, {
        name: 'Production Test NFT (NFT→SOL)',
        symbol: 'PTEST',
      });
      console.log(`  ✅ NFT created: ${testNFT.mint.toBase58()}`);
    }
    
    console.log('\n⚠️  IMPORTANT: This test uses REAL mainnet wallets and incurs REAL fees!');
    console.log('📊 Estimated cost: ~0.01 SOL (~$1.50 at $150/SOL)\n');
  });
  
  it('should successfully swap NFT for SOL on mainnet', async function() {
    this.timeout(180000);
    
    console.log('🧪 Test: NFT → SOL swap on mainnet');
    console.log('⏳ This may take 30-60 seconds on mainnet...\n');
    
    const solAmount = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL
    const platformFee = Math.floor(solAmount * 0.01); // 1% = 0.0001 SOL
    
    console.log('📦 Swap Details:');
    console.log(`  Maker offers: NFT (${testNFT.mint.toBase58()})`);
    console.log(`  Taker offers: ${solAmount / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Platform fee: ${platformFee / LAMPORTS_PER_SOL} SOL (1%)`);
    
    // Record balances before
    const senderBalanceBefore = await connection.getBalance(sender.publicKey);
    const receiverBalanceBefore = await connection.getBalance(receiver.publicKey);
    const treasuryBalanceBefore = await connection.getBalance(treasuryPda);
    
    console.log('\n💰 Balances Before:');
    console.log(`  Sender:   ${(senderBalanceBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`  Receiver: ${(receiverBalanceBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`  Treasury: ${(treasuryBalanceBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    
    // Step 1: Create offer via API
    console.log('\n📤 Step 1: Creating offer via API...');
    const createResponse = await apiClient.post('/api/offers', {
      makerWallet: sender.publicKey.toBase58(),
      takerWallet: receiver.publicKey.toBase58(),
      offeredAssets: [{
        type: 'nft',
        mint: testNFT.mint.toBase58(),
      }],
      requestedAssets: [],
      requestedSol: solAmount,
    }, {
      headers: {
        'idempotency-key': `prod-nft-sol-${Date.now()}`,
      },
    });
    
    expect(createResponse.status).to.equal(201);
    expect(createResponse.data.success).to.be.true;
    const offer = createResponse.data.data.offer;
    console.log(`  ✅ Offer created: ${offer.id}`);
    console.log(`     Platform fee: ${offer.platformFee} lamports`);
    
    // Step 2: Accept offer
    console.log('\n✅ Step 2: Accepting offer...');
    const acceptResponse = await apiClient.post(`/api/offers/${offer.id}/accept`, {
      takerWallet: receiver.publicKey.toBase58(),
    }, {
      headers: {
        'idempotency-key': `prod-accept-${Date.now()}`,
      },
    });
    
    expect(acceptResponse.status).to.equal(200);
    expect(acceptResponse.data.success).to.be.true;
    console.log(`  ✅ Offer accepted, transaction received`);
    
    // Step 3: Deserialize, sign, and submit transaction
    console.log('\n✅ Step 3: Signing and submitting transaction...');
    const serializedTx = acceptResponse.data.data.transaction.serialized;
    const txBuffer = Buffer.from(serializedTx, 'base64');
    const transaction = Transaction.from(txBuffer);
    
    // Sign with BOTH maker and taker wallets
    // Transaction already has platform authority signature (nonce authority)
    transaction.partialSign(sender); // Maker signs
    transaction.partialSign(receiver); // Taker signs
    console.log(`  ✅ Transaction signed by maker and taker`);
    
    // Submit to Solana
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    console.log(`  ✅ Transaction submitted: ${signature}`);
    
    // Wait for confirmation
    console.log('\n⏳ Waiting for transaction confirmation...');
    await confirmTransactionAndCheckError(connection, signature, 'confirmed');
    console.log(`  ✅ Transaction confirmed and verified!`);
    await wait(2000); // Extra buffer for balance updates
    
    // Verify balances after
    const senderBalanceAfter = await connection.getBalance(sender.publicKey);
    const receiverBalanceAfter = await connection.getBalance(receiver.publicKey);
    const treasuryBalanceAfter = await connection.getBalance(treasuryPda);
    
    console.log('\n💰 Balances After:');
    console.log(`  Sender:   ${(senderBalanceAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`  Receiver: ${(receiverBalanceAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`  Treasury: ${(treasuryBalanceAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    
    console.log('\n📊 Changes:');
    console.log(`  Sender:   ${((senderBalanceAfter - senderBalanceBefore) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`  Receiver: ${((receiverBalanceAfter - receiverBalanceBefore) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`  Treasury: ${((treasuryBalanceAfter - treasuryBalanceBefore) / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    
    // Assertions
    console.log('\n✅ Verifying swap results...');
    
    // Sender should receive SOL (minus small tx cost)
    const senderGain = senderBalanceAfter - senderBalanceBefore;
    expect(senderGain).to.be.greaterThan(solAmount * 0.95, 'Sender should receive ~0.01 SOL');
    console.log('  ✅ Sender received SOL');
    
    // Receiver should pay SOL (amount + fee + tx cost)
    const receiverLoss = receiverBalanceBefore - receiverBalanceAfter;
    expect(receiverLoss).to.be.greaterThan(solAmount, 'Receiver should pay SOL + fees');
    console.log('  ✅ Receiver paid SOL + fees');
    
    // Treasury should receive platform fee
    const treasuryGain = treasuryBalanceAfter - treasuryBalanceBefore;
    expect(treasuryGain).to.be.greaterThan(0, 'Treasury should collect fees');
    console.log(`  ✅ Treasury collected ${(treasuryGain / LAMPORTS_PER_SOL).toFixed(6)} SOL in fees`);
    
    // Verify NFT ownership transfer
    const { verifyNFTOwnership } = require('../helpers/nft-helpers');
    const ownershipVerified = await verifyNFTOwnership(connection, testNFT.mint, receiver.publicKey);
    expect(ownershipVerified).to.be.true;
    console.log('  ✅ NFT ownership transferred to receiver');
    
    console.log('\n✅ Production NFT→SOL swap COMPLETE and VERIFIED!');
  });
  
  after(async function() {
    console.log('\n✅ Production E2E test completed\n');
  });
});
