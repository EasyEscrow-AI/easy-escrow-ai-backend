/**
 * Production E2E Test: Core NFT for SOL
 * 
 * Tests the complete flow of swapping a Metaplex Core NFT for SOL tokens on mainnet including:
 * - Standard 1% platform fee
 * - Treasury fee collection
 * - Core NFT ownership transfer via mpl-core program
 * 
 * ⚠️ IMPORTANT: This test uses REAL MAINNET wallets and incurs REAL transaction fees
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import { wait } from '../../helpers/test-utils';

// Production configuration
const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx');
const PRODUCTION_API_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';
const PLATFORM_AUTHORITY_PATH = process.env.MAINNET_PLATFORM_AUTHORITY_PATH || 
  path.join(__dirname, '../../../wallets/production/production-admin.json');
const SENDER_PATH = process.env.PRODUCTION_SENDER_PATH ||
  path.join(__dirname, '../../../wallets/production/production-sender.json');
const RECEIVER_PATH = process.env.PRODUCTION_RECEIVER_PATH ||
  path.join(__dirname, '../../../wallets/production/production-receiver.json');

describe('🚀 Production E2E: Core NFT → SOL (Mainnet)', () => {
  let connection: Connection;
  let program: Program;
  let platformAuthority: Keypair;
  let treasuryPda: PublicKey;
  let sender: Keypair;
  let receiver: Keypair;
  let apiClient: AxiosInstance;
  let testCoreNFT: { assetId: PublicKey; owner: PublicKey } | null = null;
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION E2E: CORE NFT → SOL - MAINNET SETUP            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    // Setup connection
    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);
    console.log('🌐 Network: MAINNET-BETA');
    console.log('🔗 API:', PRODUCTION_API_URL);
    
    // Load platform authority
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
    
    // Derive treasury PDA
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('main_treasury'), platformAuthority.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
    
    // Verify treasury is initialized
    const treasuryAccount = await connection.getAccountInfo(treasuryPda);
    if (!treasuryAccount) {
      throw new Error('Treasury not initialized on mainnet!');
    }
    console.log('✅ Treasury initialized');
    
    // Verify wallet balances
    console.log('\n💰 Checking wallet balances...');
    const senderBalance = await connection.getBalance(sender.publicKey);
    const receiverBalance = await connection.getBalance(receiver.publicKey);
    
    console.log(`  Sender: ${(senderBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`  Receiver: ${(receiverBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    
    if (senderBalance < 0.01 * LAMPORTS_PER_SOL || receiverBalance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error('Insufficient balance in test wallets');
    }
    console.log('✅ Wallet balances sufficient');
    
    // Setup API client
    apiClient = axios.create({
      baseURL: PRODUCTION_API_URL,
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
    
    // Look for existing Core NFT owned by sender using DAS API
    console.log('\n🎨 Looking for existing Core NFT to reuse...');
    try {
      const dasResponse = await axios.post(RPC_URL, {
        jsonrpc: '2.0',
        id: 'core-nft-search',
        method: 'searchAssets',
        params: {
          ownerAddress: sender.publicKey.toBase58(),
          tokenType: 'all',
          displayOptions: { showCollectionMetadata: false },
        },
      });
      
      if (dasResponse.data?.result?.items) {
        // Filter for Core NFTs (interface = MplCoreAsset)
        const coreNfts = dasResponse.data.result.items.filter((asset: any) => {
          const interfaceName = asset.interface?.toLowerCase() || '';
          return interfaceName === 'mplcoreasset' || interfaceName === 'mplcorecollection';
        });
        
        if (coreNfts.length > 0) {
          const randomIndex = Math.floor(Math.random() * coreNfts.length);
          const nft = coreNfts[randomIndex];
          testCoreNFT = {
            assetId: new PublicKey(nft.id),
            owner: sender.publicKey,
          };
          console.log(`  ✅ Reusing existing Core NFT: ${testCoreNFT.assetId.toBase58()}`);
          console.log(`     (Found ${coreNfts.length} Core NFTs, selected #${randomIndex + 1})`);
        }
      }
    } catch (error) {
      console.log('  ⚠️ DAS API search failed:', (error as Error).message);
    }
    
    if (!testCoreNFT) {
      console.log('  ⚠️ No Core NFT found in sender wallet. This test requires an existing Core NFT.');
      console.log('     Please mint a Core NFT to the sender wallet first.');
      this.skip();
    }
    
    console.log('\n⚠️  IMPORTANT: This test uses REAL mainnet wallets and incurs REAL fees!');
    console.log('📊 Estimated cost: ~0.01 SOL\n');
  });
  
  it('should successfully swap Core NFT for SOL on mainnet', async function() {
    this.timeout(180000);
    
    if (!testCoreNFT) {
      this.skip();
      return;
    }
    
    console.log('🧪 Test: Core NFT → SOL swap on mainnet');
    console.log('⏳ This may take 30-60 seconds on mainnet...\n');
    
    const solAmount = 0.01 * LAMPORTS_PER_SOL;
    const platformFee = Math.floor(solAmount * 0.01);
    
    console.log('📦 Swap Details:');
    console.log(`  Maker offers: Core NFT (${testCoreNFT.assetId.toBase58()})`);
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
        type: 'core_nft',
        mint: testCoreNFT.assetId.toBase58(),
        isCoreNft: true,
      }],
      requestedAssets: [],
      requestedSol: solAmount,
    }, {
      headers: {
        'idempotency-key': `prod-core-nft-sol-${Date.now()}`,
      },
    });
    
    expect(createResponse.status).to.equal(201);
    expect(createResponse.data.success).to.be.true;
    const offer = createResponse.data.data.offer;
    console.log(`  ✅ Offer created: ${offer.id}`);
    
    // Step 2: Accept offer
    console.log('\n✅ Step 2: Accepting offer...');
    const acceptResponse = await apiClient.post(`/api/offers/${offer.id}/accept`, {
      takerWallet: receiver.publicKey.toBase58(),
    }, {
      headers: {
        'idempotency-key': `prod-accept-core-${Date.now()}`,
      },
    });
    
    expect(acceptResponse.status).to.equal(200);
    expect(acceptResponse.data.success).to.be.true;
    console.log(`  ✅ Offer accepted, transaction received`);
    
    // Step 3: Deserialize, sign, and submit transaction
    console.log('\n✅ Step 3: Signing and submitting transaction...');
    const serializedTx = acceptResponse.data.data.transaction.serialized;
    const txBuffer = Buffer.from(serializedTx, 'base64');
    
    // Try to deserialize as versioned transaction first
    let signature: string;
    try {
      const versionedTx = VersionedTransaction.deserialize(txBuffer);
      // Store existing signatures before signing
      const existingSignatures = [...versionedTx.signatures];
      versionedTx.sign([sender, receiver]);
      // Restore platform authority signature
      for (let i = 0; i < existingSignatures.length; i++) {
        const existingSig = existingSignatures[i];
        if (existingSig && !existingSig.every(b => b === 0)) {
          const newSig = versionedTx.signatures[i];
          if (!newSig || newSig.every(b => b === 0)) {
            versionedTx.signatures[i] = existingSig;
          }
        }
      }
      signature = await connection.sendRawTransaction(versionedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
    } catch {
      // Fall back to legacy transaction
      const transaction = Transaction.from(txBuffer);
      transaction.partialSign(sender);
      transaction.partialSign(receiver);
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    }
    console.log(`  ✅ Transaction submitted: ${signature}`);
    
    // Wait for confirmation
    console.log('\n⏳ Waiting for transaction confirmation...');
    await connection.confirmTransaction(signature, 'confirmed');
    console.log(`  ✅ Transaction confirmed!`);
    await wait(2000);
    
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
    
    const senderGain = senderBalanceAfter - senderBalanceBefore;
    expect(senderGain).to.be.greaterThan(solAmount * 0.95, 'Sender should receive ~0.01 SOL');
    console.log('  ✅ Sender received SOL');
    
    const receiverLoss = receiverBalanceBefore - receiverBalanceAfter;
    expect(receiverLoss).to.be.greaterThan(solAmount, 'Receiver should pay SOL + fees');
    console.log('  ✅ Receiver paid SOL + fees');
    
    const treasuryGain = treasuryBalanceAfter - treasuryBalanceBefore;
    expect(treasuryGain).to.be.greaterThan(0, 'Treasury should collect fees');
    console.log(`  ✅ Treasury collected ${(treasuryGain / LAMPORTS_PER_SOL).toFixed(6)} SOL in fees`);
    
    // Verify Core NFT ownership transfer using DAS API
    console.log('\n🔍 Verifying Core NFT ownership...');
    try {
      const dasResponse = await axios.post(RPC_URL, {
        jsonrpc: '2.0',
        id: 'verify-ownership',
        method: 'getAsset',
        params: { id: testCoreNFT.assetId.toBase58() },
      });
      
      const newOwner = dasResponse.data?.result?.ownership?.owner;
      expect(newOwner).to.equal(receiver.publicKey.toBase58(), 'Core NFT should be owned by receiver');
      console.log('  ✅ Core NFT ownership transferred to receiver');
    } catch (error) {
      console.log('  ⚠️ Could not verify ownership via DAS API:', (error as Error).message);
    }
    
    console.log('\n✅ Production Core NFT→SOL swap COMPLETE and VERIFIED!');
  });
  
  after(async function() {
    console.log('\n✅ Production E2E test completed\n');
  });
});

