/**
 * Production E2E Test: NFT for NFT Happy Path
 * 
 * Tests the complete flow of swapping NFT for NFT on mainnet
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

describe('🚀 Production E2E: NFT ↔ NFT (Mainnet)', () => {
  let connection: Connection;
  let sender: Keypair;
  let receiver: Keypair;
  let apiClient: AxiosInstance;
  let nft1: { mint: PublicKey };
  let nft2: { mint: PublicKey };
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION E2E: NFT ↔ NFT - MAINNET                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    connection = new Connection(RPC_URL, 'confirmed');
    
    const senderPath = path.join(__dirname, '../../../wallets/production/production-sender.json');
    const receiverPath = path.join(__dirname, '../../../wallets/production/production-receiver.json');
    
    sender = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(senderPath, 'utf8'))));
    receiver = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(receiverPath, 'utf8'))));
    
    apiClient = axios.create({
      baseURL: PRODUCTION_API_URL,
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
    
    // Create 2 NFTs for swap
    console.log('Creating 2 test NFTs...');
    const { createMultipleTestNFTs } = require('../helpers/nft-helpers');
    [nft1] = await createMultipleTestNFTs(connection, sender, sender, 1, 'Sender NFT');
    [nft2] = await createMultipleTestNFTs(connection, receiver, receiver, 1, 'Receiver NFT');
    
    console.log(`✅ NFT 1 (Sender): ${nft1.mint.toBase58()}`);
    console.log(`✅ NFT 2 (Receiver): ${nft2.mint.toBase58()}\n`);
  });
  
  it('should successfully swap NFT for NFT on mainnet', async function() {
    this.timeout(180000);
    
    console.log('🧪 Test: NFT ↔ NFT swap on mainnet\n');
    
    // Create offer
    console.log('📤 Creating offer...');
    const createResponse = await apiClient.post('/api/offers', {
      makerWallet: sender.publicKey.toBase58(),
      takerWallet: receiver.publicKey.toBase58(),
      offeredAssets: [{
        type: 'nft',
        mint: nft1.mint.toBase58(),
      }],
      requestedAssets: [{
        type: 'nft',
        mint: nft2.mint.toBase58(),
      }],
    }, {
      headers: { 'idempotency-key': `prod-nft-nft-${Date.now()}` },
    });
    
    expect(createResponse.status).to.equal(201);
    const offer = createResponse.data.data.offer;
    console.log(`  ✅ Offer created: ${offer.id}`);
    
    // Step 2: Accept offer
    console.log('\n✅ Step 2: Accepting offer...');
    const acceptResponse = await apiClient.post(`/api/offers/${offer.id}/accept`, {
      takerWallet: receiver.publicKey.toBase58(),
    }, {
      headers: { 'idempotency-key': `prod-accept-nft-nft-${Date.now()}` },
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
    
    // Verify ownership transfers
    const { verifyNFTOwnership } = require('../helpers/nft-helpers');
    
    const nft1ToReceiver = await verifyNFTOwnership(connection, nft1.mint, receiver.publicKey);
    const nft2ToSender = await verifyNFTOwnership(connection, nft2.mint, sender.publicKey);
    
    expect(nft1ToReceiver).to.be.true;
    expect(nft2ToSender).to.be.true;
    
    console.log('  ✅ NFT 1 → Receiver');
    console.log('  ✅ NFT 2 → Sender');
    console.log('\n✅ NFT↔NFT swap VERIFIED!');
  });
});
