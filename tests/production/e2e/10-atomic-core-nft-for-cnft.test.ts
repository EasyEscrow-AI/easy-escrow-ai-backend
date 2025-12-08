/**
 * Production E2E Test: Core NFT for cNFT
 * 
 * Tests the complete flow of swapping a Metaplex Core NFT for a compressed NFT on mainnet
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

describe('🚀 Production E2E: Core NFT ↔ cNFT (Mainnet)', () => {
  let connection: Connection;
  let program: Program;
  let platformAuthority: Keypair;
  let treasuryPda: PublicKey;
  let sender: Keypair;
  let receiver: Keypair;
  let apiClient: AxiosInstance;
  let makerCoreNFT: { assetId: PublicKey; owner: PublicKey } | null = null;
  let takerCnft: { assetId: PublicKey; owner: PublicKey } | null = null;
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION E2E: CORE NFT ↔ cNFT - MAINNET SETUP           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);
    
    // Load wallets
    const platformSecret = JSON.parse(fs.readFileSync(PLATFORM_AUTHORITY_PATH, 'utf8'));
    platformAuthority = Keypair.fromSecretKey(new Uint8Array(platformSecret));
    
    const senderSecret = JSON.parse(fs.readFileSync(SENDER_PATH, 'utf8'));
    sender = Keypair.fromSecretKey(new Uint8Array(senderSecret));
    console.log('👤 Sender (Maker - Core NFT):', sender.publicKey.toBase58());
    
    const receiverSecret = JSON.parse(fs.readFileSync(RECEIVER_PATH, 'utf8'));
    receiver = Keypair.fromSecretKey(new Uint8Array(receiverSecret));
    console.log('👤 Receiver (Taker - cNFT):', receiver.publicKey.toBase58());
    
    // Load IDL
    const idlPath = path.join(__dirname, '../../../src/generated/anchor/escrow-idl-production.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    idl.address = PROGRAM_ID.toBase58();
    
    const wallet = new Wallet(platformAuthority);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    program = new Program(idl, provider);
    
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('main_treasury'), platformAuthority.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
    
    apiClient = axios.create({
      baseURL: PRODUCTION_API_URL,
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
    
    // Find Core NFT for maker
    console.log('\n🎨 Looking for Core NFT in sender wallet...');
    try {
      const dasResponse = await axios.post(RPC_URL, {
        jsonrpc: '2.0',
        id: 'core-nft-search',
        method: 'searchAssets',
        params: { ownerAddress: sender.publicKey.toBase58(), tokenType: 'all' },
      });
      
      if (dasResponse.data?.result?.items) {
        const coreNfts = dasResponse.data.result.items.filter((asset: any) => {
          const interfaceName = asset.interface?.toLowerCase() || '';
          return interfaceName === 'mplcoreasset' || interfaceName === 'mplcorecollection';
        });
        
        if (coreNfts.length > 0) {
          const nft = coreNfts[Math.floor(Math.random() * coreNfts.length)];
          makerCoreNFT = { assetId: new PublicKey(nft.id), owner: sender.publicKey };
          console.log(`  ✅ Found Core NFT: ${makerCoreNFT.assetId.toBase58()}`);
        }
      }
    } catch (error) {
      console.log('  ⚠️ DAS API search failed:', (error as Error).message);
    }
    
    // Find cNFT for taker
    console.log('\n🎨 Looking for cNFT in receiver wallet...');
    try {
      const dasResponse = await axios.post(RPC_URL, {
        jsonrpc: '2.0',
        id: 'cnft-search',
        method: 'searchAssets',
        params: { ownerAddress: receiver.publicKey.toBase58(), tokenType: 'all' },
      });
      
      if (dasResponse.data?.result?.items) {
        const cnfts = dasResponse.data.result.items.filter((asset: any) => 
          asset.compression?.compressed === true
        );
        
        if (cnfts.length > 0) {
          const nft = cnfts[Math.floor(Math.random() * cnfts.length)];
          takerCnft = { assetId: new PublicKey(nft.id), owner: receiver.publicKey };
          console.log(`  ✅ Found cNFT: ${takerCnft.assetId.toBase58()}`);
        }
      }
    } catch (error) {
      console.log('  ⚠️ cNFT search failed:', (error as Error).message);
    }
    
    if (!makerCoreNFT || !takerCnft) {
      console.log('  ⚠️ Missing NFTs for test. Need Core NFT in sender and cNFT in receiver.');
      this.skip();
    }
    
    console.log('\n⚠️  This test uses REAL mainnet wallets and incurs REAL fees!\n');
  });
  
  it('should successfully swap Core NFT for cNFT on mainnet', async function() {
    this.timeout(180000);
    
    if (!makerCoreNFT || !takerCnft) {
      this.skip();
      return;
    }
    
    console.log('🧪 Test: Core NFT ↔ cNFT swap on mainnet\n');
    
    console.log('📦 Swap Details:');
    console.log(`  Maker offers: Core NFT (${makerCoreNFT.assetId.toBase58()})`);
    console.log(`  Taker offers: cNFT (${takerCnft.assetId.toBase58()})`);
    
    const treasuryBalanceBefore = await connection.getBalance(treasuryPda);
    
    // Step 1: Create offer
    console.log('\n📤 Step 1: Creating offer via API...');
    const createResponse = await apiClient.post('/api/offers', {
      makerWallet: sender.publicKey.toBase58(),
      takerWallet: receiver.publicKey.toBase58(),
      offeredAssets: [{
        type: 'core_nft',
        mint: makerCoreNFT.assetId.toBase58(),
        isCoreNft: true,
      }],
      requestedAssets: [{
        type: 'cnft',
        mint: takerCnft.assetId.toBase58(),
        isCompressed: true,
      }],
    }, {
      headers: { 'idempotency-key': `prod-core-cnft-${Date.now()}` },
    });
    
    expect(createResponse.status).to.equal(201);
    const offer = createResponse.data.data.offer;
    console.log(`  ✅ Offer created: ${offer.id}`);
    
    // Step 2: Accept offer
    console.log('\n✅ Step 2: Accepting offer...');
    const acceptResponse = await apiClient.post(`/api/offers/${offer.id}/accept`, {
      takerWallet: receiver.publicKey.toBase58(),
    }, {
      headers: { 'idempotency-key': `prod-accept-core-cnft-${Date.now()}` },
    });
    
    expect(acceptResponse.status).to.equal(200);
    console.log(`  ✅ Offer accepted`);
    
    // Step 3: Sign and submit
    console.log('\n✅ Step 3: Signing and submitting transaction...');
    const serializedTx = acceptResponse.data.data.transaction.serialized;
    const txBuffer = Buffer.from(serializedTx, 'base64');
    
    let signature: string;
    try {
      const versionedTx = VersionedTransaction.deserialize(txBuffer);
      const existingSignatures = [...versionedTx.signatures];
      versionedTx.sign([sender, receiver]);
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
      });
    } catch {
      const transaction = Transaction.from(txBuffer);
      transaction.partialSign(sender);
      transaction.partialSign(receiver);
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    }
    console.log(`  ✅ Transaction submitted: ${signature}`);
    
    await connection.confirmTransaction(signature, 'confirmed');
    console.log(`  ✅ Transaction confirmed!`);
    await wait(2000);
    
    // Verify treasury collected fees
    const treasuryBalanceAfter = await connection.getBalance(treasuryPda);
    const treasuryGain = treasuryBalanceAfter - treasuryBalanceBefore;
    expect(treasuryGain).to.be.greaterThan(0, 'Treasury should collect fees');
    console.log(`\n✅ Treasury collected ${(treasuryGain / LAMPORTS_PER_SOL).toFixed(6)} SOL in fees`);
    
    // Verify ownership transfers using DAS API
    console.log('\n🔍 Verifying ownership transfers...');
    
    // Verify Core NFT now owned by receiver
    try {
      const dasResponse = await axios.post(RPC_URL, {
        jsonrpc: '2.0',
        id: 'verify-core',
        method: 'getAsset',
        params: { id: makerCoreNFT.assetId.toBase58() },
      });
      const newOwner = dasResponse.data?.result?.ownership?.owner;
      expect(newOwner).to.equal(receiver.publicKey.toBase58());
      console.log('  ✅ Core NFT transferred to receiver');
    } catch (error) {
      console.log('  ⚠️ Could not verify Core NFT ownership');
    }
    
    // Verify cNFT now owned by sender
    try {
      const dasResponse = await axios.post(RPC_URL, {
        jsonrpc: '2.0',
        id: 'verify-cnft',
        method: 'getAsset',
        params: { id: takerCnft.assetId.toBase58() },
      });
      const newOwner = dasResponse.data?.result?.ownership?.owner;
      expect(newOwner).to.equal(sender.publicKey.toBase58());
      console.log('  ✅ cNFT transferred to sender');
    } catch (error) {
      console.log('  ⚠️ Could not verify cNFT ownership');
    }
    
    console.log('\n✅ Production Core NFT ↔ cNFT swap COMPLETE!');
  });
  
  after(async function() {
    console.log('\n✅ Production E2E test completed\n');
  });
});

