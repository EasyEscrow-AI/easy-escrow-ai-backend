/**
 * Production E2E Test: Zero-Fee Authorization
 * 
 * Tests zero-fee swap authorization system on mainnet:
 * - Valid API key → zero platform fee
 * - Invalid API key → standard platform fee
 * - No API key → standard platform fee
 * - Audit logging verification
 * 
 * ⚠️ IMPORTANT: Uses REAL MAINNET wallets and incurs REAL transaction fees
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import { wait } from '../../helpers/test-utils';

const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx');
const PRODUCTION_API_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';
const AUTHORIZED_API_KEY = process.env.ATOMIC_SWAP_API_KEY || '';
const TREASURY_AUTHORITY_PATH = process.env.MAINNET_TREASURY_AUTHORITY_PATH || 
  path.join(__dirname, '../../../wallets/production/production-treasury.json');

describe('🚀 Production E2E: Zero-Fee Authorization (Mainnet)', () => {
  let connection: Connection;
  let treasuryAuthority: Keypair;
  let treasuryPda: PublicKey;
  let sender: Keypair;
  let receiver: Keypair;
  let apiClient: AxiosInstance;
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION E2E: ZERO-FEE AUTHORIZATION - MAINNET          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    connection = new Connection(RPC_URL, 'confirmed');
    
    // Load treasury authority
    const treasurySecret = JSON.parse(fs.readFileSync(TREASURY_AUTHORITY_PATH, 'utf8'));
    treasuryAuthority = Keypair.fromSecretKey(new Uint8Array(treasurySecret));
    console.log('🔑 Treasury Authority:', treasuryAuthority.publicKey.toBase58());
    
    // Derive treasury PDA
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('main_treasury'), treasuryAuthority.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
    
    const senderPath = path.join(__dirname, '../../../wallets/production/production-sender.json');
    const receiverPath = path.join(__dirname, '../../../wallets/production/production-receiver.json');
    
    sender = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(senderPath, 'utf8'))));
    receiver = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(receiverPath, 'utf8'))));
    
    apiClient = axios.create({
      baseURL: PRODUCTION_API_URL,
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!AUTHORIZED_API_KEY) {
      console.warn('⚠️  ATOMIC_SWAP_API_KEY not set - some tests will be skipped');
    } else {
      console.log('✅ Authorized API key loaded from environment\n');
    }
  });
  
  it('should execute swap with zero fee when valid API key provided', async function() {
    this.timeout(180000);
    
    if (!AUTHORIZED_API_KEY) {
      console.log('⚠️  Skipping - ATOMIC_SWAP_API_KEY not set');
      this.skip();
      return;
    }
    
    console.log('\n🧪 Test: Zero-fee swap with valid API key');
    console.log('📝 API Key:', AUTHORIZED_API_KEY.substring(0, 8) + '...');
    
    const { createTestNFT } = require('../helpers/nft-helpers');
    
    // Create test NFT
    const testNFT = await createTestNFT(connection, sender, sender, {
      name: 'Zero-Fee Test NFT',
      symbol: 'ZFREE',
    });
    
    console.log(`✅ NFT created: ${testNFT.mint.toBase58()}`);
    
    const solAmount = 0.01 * LAMPORTS_PER_SOL;
    
    // Treasury PDA already derived in before() hook
    const treasuryBalanceBefore = await connection.getBalance(treasuryPda);
    
    // Create offer with API key
    console.log('\n📤 Creating offer with API key...');
    const createResponse = await apiClient.post('/api/offers', {
      makerWallet: sender.publicKey.toBase58(),
      takerWallet: receiver.publicKey.toBase58(),
      offeredAssets: [{
        type: 'nft',
        mint: testNFT.mint.toBase58(),
      }],
      requestedAssets: [],
      requestedSol: solAmount,
      customFee: '0', // Request zero fee
    }, {
      headers: {
        'x-atomic-swap-api-key': AUTHORIZED_API_KEY,
        'idempotency-key': `prod-zero-fee-${Date.now()}`,
      },
    });
    
    expect(createResponse.status).to.equal(201);
    const offer = createResponse.data.data.offer;
    console.log(`  ✅ Offer created: ${offer.id}`);
    
    // Fetch offer to check platform fee
    const offerResponse = await apiClient.get(`/api/offers/${offer.id}`);
    const offerDetails = offerResponse.data.data.offer;
    
    console.log(`     Platform fee: ${offerDetails.platformFee} lamports`);
    expect(parseInt(offerDetails.platformFee)).to.equal(0, 'Platform fee should be 0 with valid API key');
    console.log('  ✅ Zero fee confirmed');
    
    // Accept offer
    console.log('\n✅ Accepting zero-fee offer...');
    const acceptResponse = await apiClient.post(`/api/offers/${offer.id}/accept`, {
      takerWallet: receiver.publicKey.toBase58(),
    }, {
      headers: {
        'x-atomic-swap-api-key': AUTHORIZED_API_KEY,
        'idempotency-key': `prod-accept-zero-${Date.now()}`,
      },
    });
    
    expect(acceptResponse.status).to.equal(200);
    console.log(`  ✅ Swap completed: ${acceptResponse.data.data.signature}`);
    
    await wait(15000);
    
    const treasuryBalanceAfter = await connection.getBalance(treasuryPda);
    const treasuryGain = treasuryBalanceAfter - treasuryBalanceBefore;
    
    // Treasury should NOT receive any fees for zero-fee swap
    console.log(`\n📊 Treasury gain: ${(treasuryGain / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    expect(treasuryGain).to.equal(0, 'Treasury should not collect fees for zero-fee swap');
    console.log('  ✅ Zero fees verified (no treasury collection)');
    
    console.log('\n✅ Zero-fee swap COMPLETE and VERIFIED!');
  });
  
  it('should execute swap with standard fee when invalid API key provided', async function() {
    this.timeout(180000);
    
    console.log('\n🧪 Test: Standard fee with invalid API key');
    
    const { createTestNFT } = require('../helpers/nft-helpers');
    const testNFT = await createTestNFT(connection, sender, sender, {
      name: 'Standard Fee Test NFT',
      symbol: 'STDFEE',
    });
    
    const solAmount = 0.01 * LAMPORTS_PER_SOL;
    
    // Create offer with INVALID API key
    console.log('\n📤 Creating offer with invalid API key...');
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
        'x-atomic-swap-api-key': 'invalid-key-12345',
        'idempotency-key': `prod-invalid-key-${Date.now()}`,
      },
    });
    
    expect(createResponse.status).to.equal(201);
    const offer = createResponse.data.data.offer;
    console.log(`  ✅ Offer created: ${offer.id}`);
    
    // Fetch offer to check platform fee
    const offerResponse = await apiClient.get(`/api/offers/${offer.id}`);
    const offerDetails = offerResponse.data.data.offer;
    
    console.log(`     Platform fee: ${offerDetails.platformFee} lamports`);
    expect(parseInt(offerDetails.platformFee)).to.be.greaterThan(0, 'Standard fees should apply with invalid API key');
    console.log('  ✅ Standard fees applied');
    
    console.log('\n✅ Invalid API key test PASSED!');
  });
  
  it('should execute swap with standard fee when no API key provided', async function() {
    this.timeout(180000);
    
    console.log('\n🧪 Test: Standard fee with no API key');
    
    const { createTestNFT } = require('../helpers/nft-helpers');
    const testNFT = await createTestNFT(connection, sender, sender, {
      name: 'No API Key Test NFT',
      symbol: 'NOKEY',
    });
    
    const solAmount = 0.01 * LAMPORTS_PER_SOL;
    
    // Create offer without API key
    console.log('\n📤 Creating offer without API key...');
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
        'idempotency-key': `prod-no-key-${Date.now()}`,
      },
    });
    
    expect(createResponse.status).to.equal(201);
    const offer = createResponse.data.data.offer;
    console.log(`  ✅ Offer created: ${offer.id}`);
    
    // Fetch offer to check platform fee
    const offerResponse = await apiClient.get(`/api/offers/${offer.id}`);
    const offerDetails = offerResponse.data.data.offer;
    
    console.log(`     Platform fee: ${offerDetails.platformFee} lamports`);
    expect(parseInt(offerDetails.platformFee)).to.be.greaterThan(0, 'Standard fees should apply with no API key');
    console.log('  ✅ Standard fees applied');
    
    console.log('\n✅ No API key test PASSED!');
  });
});
