/**
 * Production E2E Test: SOL for NFT Happy Path
 * 
 * Tests the complete flow of swapping SOL for an NFT on mainnet
 * ⚠️ IMPORTANT: Uses REAL MAINNET wallets and incurs REAL transaction fees
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, VersionedTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import { wait } from '../../helpers/test-utils';

// Helper to detect versioned transactions
function isVersionedTransaction(buffer: Buffer): boolean {
  return buffer.length > 0 && (buffer[0] & 0x80) !== 0;
}

const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PRODUCTION_API_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';

describe('🚀 Production E2E: SOL → NFT (Mainnet)', () => {
  let connection: Connection;
  let sender: Keypair;
  let receiver: Keypair;
  let apiClient: AxiosInstance;
  let testNFT: { mint: PublicKey; tokenAccount: PublicKey; owner: PublicKey };
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION E2E: SOL → NFT - MAINNET                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    connection = new Connection(RPC_URL, 'confirmed');
    
    const senderPath = path.join(__dirname, '../../../wallets/production/production-sender.json');
    const receiverPath = path.join(__dirname, '../../../wallets/production/production-receiver.json');
    
    sender = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(senderPath, 'utf8'))));
    receiver = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(receiverPath, 'utf8'))));
    
    console.log('👤 Sender (SOL provider):', sender.publicKey.toBase58());
    console.log('👤 Receiver (NFT provider):', receiver.publicKey.toBase58());
    
    apiClient = axios.create({
      baseURL: PRODUCTION_API_URL,
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
    
    // Create NFT owned by receiver
    const { createTestNFT } = require('../helpers/nft-helpers');
    testNFT = await createTestNFT(connection, receiver, receiver, {
      name: 'Production Test NFT (SOL→NFT)',
      symbol: 'PTEST2',
    });
    console.log(`✅ NFT created for swap: ${testNFT.mint.toBase58()}\n`);
  });
  
  it('should successfully swap SOL for NFT on mainnet', async function() {
    this.timeout(180000);
    
    console.log('🧪 Test: SOL → NFT swap on mainnet\n');
    
    const solAmount = 0.01 * LAMPORTS_PER_SOL;
    
    const senderBalanceBefore = await connection.getBalance(sender.publicKey);
    const receiverBalanceBefore = await connection.getBalance(receiver.publicKey);
    
    console.log('💰 Balances Before:');
    console.log(`  Sender:   ${(senderBalanceBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`  Receiver: ${(receiverBalanceBefore / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    
    // Create offer: Maker (sender) offers SOL, wants NFT
    console.log('\n📤 Creating offer...');
    const createResponse = await apiClient.post('/api/offers', {
      makerWallet: sender.publicKey.toBase58(),
      takerWallet: receiver.publicKey.toBase58(),
      offeredAssets: [],
      offeredSol: solAmount,
      requestedAssets: [{
        type: 'nft',
        mint: testNFT.mint.toBase58(),
      }],
    }, {
      headers: { 'idempotency-key': `prod-sol-nft-${Date.now()}` },
    });
    
    expect(createResponse.status).to.equal(201);
    const offer = createResponse.data.data.offer;
    console.log(`  ✅ Offer created: ${offer.id}`);
    
    // Step 2: Accept offer
    console.log('\n✅ Step 2: Accepting offer...');
    const acceptResponse = await apiClient.post(`/api/offers/${offer.id}/accept`, {
      takerWallet: receiver.publicKey.toBase58(),
    }, {
      headers: { 'idempotency-key': `prod-accept-sol-nft-${Date.now()}` },
    });
    
    expect(acceptResponse.status).to.equal(200);
    expect(acceptResponse.data.success).to.be.true;
    console.log(`  ✅ Offer accepted, transaction received`);
    
    // Step 3: Deserialize, sign, and submit transaction
    console.log('\n✅ Step 3: Signing and submitting transaction...');
    const serializedTx = acceptResponse.data.data.transaction.serialized;
    const txBuffer = Buffer.from(serializedTx, 'base64');
    
    let signature: string;
    
    if (isVersionedTransaction(txBuffer)) {
      // Handle versioned transaction (V0 with ALT)
      console.log(`  ℹ️  Versioned transaction detected (V0 with ALT)`);
      const versionedTx = VersionedTransaction.deserialize(txBuffer);
      
      // Store existing signatures before signing
      const existingSignatures = [...versionedTx.signatures];
      
      // Sign with both maker and taker
      versionedTx.sign([sender, receiver]);
      
      // Restore non-null existing signatures
      const staticKeys = versionedTx.message.staticAccountKeys;
      for (let i = 0; i < existingSignatures.length && i < staticKeys.length; i++) {
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
    } else {
      // Handle legacy transaction
      const transaction = Transaction.from(txBuffer);
      transaction.partialSign(sender);
      transaction.partialSign(receiver);
      
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    }
    
    console.log(`  ✅ Transaction signed by maker and taker`);
    console.log(`  ✅ Transaction submitted: ${signature}`);
    
    // Wait for confirmation
    console.log('\n⏳ Waiting for transaction confirmation...');
    await connection.confirmTransaction(signature, 'confirmed');
    console.log(`  ✅ Transaction confirmed!`);
    await wait(2000); // Extra buffer for balance updates
    
    const senderBalanceAfter = await connection.getBalance(sender.publicKey);
    const receiverBalanceAfter = await connection.getBalance(receiver.publicKey);
    
    console.log('\n💰 Balances After:');
    console.log(`  Sender:   ${(senderBalanceAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`  Receiver: ${(receiverBalanceAfter / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    
    // Sender should have paid SOL
    expect(senderBalanceBefore - senderBalanceAfter).to.be.greaterThan(solAmount * 0.95);
    
    // Receiver should have received SOL (minus tx fee)
    expect(receiverBalanceAfter).to.be.greaterThan(receiverBalanceBefore);
    
    // Verify NFT ownership transfer
    const { verifyNFTOwnership } = require('../helpers/nft-helpers');
    const ownershipVerified = await verifyNFTOwnership(connection, testNFT.mint, sender.publicKey);
    expect(ownershipVerified).to.be.true;
    
    console.log('\n✅ SOL→NFT swap VERIFIED!');
  });
});
