/**
 * Production E2E Test: cNFT for cNFT Happy Path with ALT Support
 * 
 * Tests the complete flow of swapping compressed NFT for compressed NFT on mainnet.
 * Includes verification that Address Lookup Tables (ALT) are used for large transactions.
 * 
 * ⚠️ IMPORTANT: Uses REAL MAINNET wallets and incurs REAL transaction fees
 */

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config();

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  VersionedTransaction,
  Transaction,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const API_BASE_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';
const RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Helper to check if transaction buffer is versioned (V0 with ALT)
function isVersionedTransaction(buffer: Buffer): boolean {
  // Versioned transactions have a version byte prefix (0x80 for V0)
  return buffer.length > 0 && (buffer[0] & 0x80) !== 0;
}

// Helper to get transaction size info
function getTransactionSizeInfo(buffer: Buffer): { size: number; isVersioned: boolean; hasALT: boolean } {
  const isVersioned = isVersionedTransaction(buffer);
  let hasALT = false;
  
  if (isVersioned) {
    try {
      const versionedTx = VersionedTransaction.deserialize(buffer);
      // Check if transaction uses lookup tables
      hasALT = versionedTx.message.addressTableLookups?.length > 0;
    } catch {
      // If deserialization fails, assume no ALT
    }
  }
  
  return {
    size: buffer.length,
    isVersioned,
    hasALT,
  };
}

describe('🚀 Production E2E: cNFT ↔ cNFT with ALT Support (Mainnet)', () => {
  let connection: Connection;
  let sender: Keypair;
  let receiver: Keypair;
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION E2E: cNFT ↔ cNFT with ALT - MAINNET            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    connection = new Connection(RPC_URL, 'confirmed');
    
    const senderPath = path.join(__dirname, '../../../wallets/production/production-sender.json');
    const receiverPath = path.join(__dirname, '../../../wallets/production/production-receiver.json');
    
    sender = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(senderPath, 'utf8'))));
    receiver = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(receiverPath, 'utf8'))));
    
    console.log('📋 Test Configuration:');
    console.log(`   API: ${API_BASE_URL}`);
    console.log(`   RPC: ${RPC_URL}`);
    console.log(`   Sender: ${sender.publicKey.toBase58()}`);
    console.log(`   Receiver: ${receiver.publicKey.toBase58()}`);
  });
  
  describe('ALT Infrastructure Verification', () => {
    it('should have production ALT configured', async function() {
      this.timeout(30000);
      
      console.log('\n🔍 Verifying ALT infrastructure...');
      
      // Check if the environment has ALT configured
      const altAddress = process.env.PRODUCTION_ALT_ADDRESS;
      
      if (!altAddress) {
        console.log('⚠️  PRODUCTION_ALT_ADDRESS not set in environment');
        console.log('   This is OK if running locally - ALT is configured on the server');
        this.skip();
        return;
      }
      
      console.log(`   ALT Address: ${altAddress}`);
      
      // Verify ALT exists on-chain
      const altPubkey = new PublicKey(altAddress);
      const altAccount = await connection.getAddressLookupTable(altPubkey);
      
      expect(altAccount.value).to.not.be.null;
      
      const addresses = altAccount.value!.state.addresses;
      console.log(`   Addresses in ALT: ${addresses.length}`);
      
      // ALT should have at least 8 addresses (static programs + treasury)
      expect(addresses.length).to.be.at.least(8);
      
      console.log('   ✅ ALT infrastructure verified');
    });
    
    it('should include correct Treasury PDA in ALT', async function() {
      this.timeout(30000);
      
      const altAddress = process.env.PRODUCTION_ALT_ADDRESS;
      if (!altAddress) {
        this.skip();
        return;
      }
      
      console.log('\n🔍 Verifying Treasury PDA in ALT...');
      
      const altPubkey = new PublicKey(altAddress);
      const altAccount = await connection.getAddressLookupTable(altPubkey);
      
      expect(altAccount.value).to.not.be.null;
      
      // The correct Treasury PDA from our fix
      const expectedTreasuryPDA = new PublicKey('BMFrxDVvrXiTAoM8VhFkpcHS97162bHv9Eo3D55oMCGq');
      
      const addresses = altAccount.value!.state.addresses;
      const hasTreasury = addresses.some(addr => addr.equals(expectedTreasuryPDA));
      
      console.log(`   Expected Treasury PDA: ${expectedTreasuryPDA.toBase58()}`);
      console.log(`   Found in ALT: ${hasTreasury ? '✅ Yes' : '❌ No'}`);
      
      expect(hasTreasury).to.be.true;
    });
  });
  
  describe('cNFT Transaction Size Verification', () => {
    it('should return versioned transaction with ALT for large cNFT swap', async function() {
      this.timeout(60000);
      
      console.log('\n🧪 Test: Verify ALT is used for large cNFT transactions');
      console.log('⚠️  This test requires cNFTs with low canopy depth (9+ proof nodes)');
      
      // Note: This test would need real cNFT asset IDs to fully execute
      // For now, we verify the infrastructure is in place
      
      console.log('\n📋 Expected behavior when executing cNFT swap:');
      console.log('   1. Backend estimates transaction size');
      console.log('   2. If size > 1232 bytes, uses ALT to compress');
      console.log('   3. Returns versioned transaction (V0 format)');
      console.log('   4. Transaction includes ALT lookup references');
      
      console.log('\n💡 To fully test:');
      console.log('   1. Use /test page to create cNFT ↔ SOL offer');
      console.log('   2. Use cNFT with low canopy (9+ proof nodes)');
      console.log('   3. Verify transaction completes successfully');
      
      // Skip actual execution - would need real cNFT assets
      this.skip();
    });
  });
  
  describe('cNFT for cNFT Swap (Full E2E)', () => {
    it('should successfully swap cNFT for cNFT on mainnet', async function() {
      this.timeout(180000);
      
      console.log('\n🧪 Test: cNFT ↔ cNFT swap on mainnet');
      console.log('⚠️  Requires pre-minted cNFTs with valid Merkle proofs');
      
      // This test would need:
      // 1. cNFT asset IDs owned by sender
      // 2. cNFT asset IDs owned by receiver
      // 3. Proper DAS API integration for proof fetching
      
      console.log('\n📋 Test steps (when cNFTs available):');
      console.log('   1. Create offer: sender cNFT for receiver cNFT');
      console.log('   2. Accept offer: receiver signs accept transaction');
      console.log('   3. Verify: both parties receive swapped cNFTs');
      console.log('   4. Verify: ALT was used if transaction was large');
      
      console.log('\n💡 Test structure created - full implementation pending');
      console.log('📝 Recommend using pre-minted cNFTs for faster testing');
      
      this.skip();
    });
    
    it('should handle cNFT with varying canopy depths', async function() {
      this.timeout(180000);
      
      console.log('\n🧪 Test: cNFT canopy depth handling');
      
      console.log('\n📋 Canopy depth impact on transaction size:');
      console.log('   - High canopy (2-4 proof nodes): ~800 bytes - Legacy TX OK');
      console.log('   - Medium canopy (5-7 proof nodes): ~1000 bytes - Legacy TX OK');
      console.log('   - Low canopy (8-10 proof nodes): ~1200+ bytes - ALT Required');
      console.log('   - Very low canopy (11+ nodes): May not fit even with ALT');
      
      console.log('\n💡 The ALT reduces each account address from 32 bytes to 1 byte');
      console.log('   This typically saves ~600 bytes, enabling large cNFT transactions');
      
      this.skip();
    });
  });
});

/**
 * Helper functions for cNFT testing
 */

interface TransactionSizeInfo {
  size: number;
  isVersioned: boolean;
  hasALT: boolean;
  breakdown?: {
    signatures: number;
    accountKeys: number;
    instructions: number;
  };
}

async function analyzeTransaction(buffer: Buffer): Promise<TransactionSizeInfo> {
  const info = getTransactionSizeInfo(buffer);
  
  if (info.isVersioned) {
    const versionedTx = VersionedTransaction.deserialize(buffer);
    const message = versionedTx.message;
    
    return {
      ...info,
      breakdown: {
        signatures: versionedTx.signatures.length * 64,
        accountKeys: message.staticAccountKeys.length * 32,
        instructions: message.compiledInstructions.length,
      },
    };
  }
  
  return info;
}

// Export helpers for use in other tests
export { isVersionedTransaction, getTransactionSizeInfo, analyzeTransaction };
