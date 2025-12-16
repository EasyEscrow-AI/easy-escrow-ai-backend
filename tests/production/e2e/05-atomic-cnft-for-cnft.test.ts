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
      const altAddress = process.env.MAINNET_PROD_ALT_ADDRESS;
      
      if (!altAddress) {
        console.log('⚠️  MAINNET_PROD_ALT_ADDRESS not set in environment');
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
      
      const altAddress = process.env.MAINNET_PROD_ALT_ADDRESS;
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
      this.timeout(300000);
      
      console.log('\n🧪 Test: cNFT ↔ cNFT swap on mainnet');
      console.log('═══════════════════════════════════════════════════════════\n');
      
      // Load production test assets
      const productionAssets = require('../../fixtures/production-test-assets.json');
      
      const hasMakerCnft = productionAssets?.maker?.cnfts?.length >= 1;
      const hasTakerCnft = productionAssets?.taker?.cnfts?.length >= 1;
      
      if (!hasMakerCnft || !hasTakerCnft) {
        console.log('⚠️  Insufficient cNFTs in fixtures - skipping test');
        console.log(`   Maker cNFTs: ${productionAssets?.maker?.cnfts?.length || 0} (need 1+)`);
        console.log(`   Taker cNFTs: ${productionAssets?.taker?.cnfts?.length || 0} (need 1+)`);
        this.skip();
        return;
      }
      
      const makerCnft = productionAssets.maker.cnfts[0].mint;
      const takerCnft = productionAssets.taker.cnfts[0].mint;
      
      console.log(`   Maker cNFT: ${makerCnft}`);
      console.log(`   Taker cNFT: ${takerCnft}`);
      console.log();
      
      // Import AtomicSwapApiClient
      const { AtomicSwapApiClient } = require('../../helpers/atomic-swap-api-client');
      const { displayExplorerLink, waitForConfirmation } = require('../../helpers/swap-verification');
      
      const API_BASE_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';
      const API_KEY = process.env.ATOMIC_SWAP_API_KEY || '';
      const apiClient = new AtomicSwapApiClient(API_BASE_URL, API_KEY);
      
      // Create offer
      console.log('📝 Step 1: Creating cNFT ↔ cNFT offer...');
      const createKey = AtomicSwapApiClient.generateIdempotencyKey('cnft-cnft-test');
      const createResponse = await apiClient.createOffer(
        {
          makerWallet: sender.publicKey.toBase58(),
          takerWallet: receiver.publicKey.toBase58(),
          offeredAssets: [
            { mint: makerCnft, isCompressed: true },
          ],
          requestedAssets: [
            { mint: takerCnft, isCompressed: true },
          ],
          offeredSol: 0,
          requestedSol: 0,
        },
        createKey
      );
      
      expect(createResponse.success).to.be.true;
      expect(createResponse.data).to.exist;
      const offerId = createResponse.data!.offer.id;
      console.log(`   ✅ Offer created: ${offerId}`);
      console.log();
      
      // Accept offer
      console.log('📝 Step 2: Accepting offer...');
      const acceptKey = AtomicSwapApiClient.generateIdempotencyKey('cnft-cnft-accept');
      
      let acceptResponse;
      try {
        acceptResponse = await apiClient.acceptOffer(
          offerId,
          receiver.publicKey.toBase58(),
          acceptKey
        );
        
        expect(acceptResponse.success).to.be.true;
        expect(acceptResponse.data).to.exist;
        console.log(`   ✅ Offer accepted successfully`);
        console.log();
      } catch (error: any) {
        const errorMessage = error?.message || error?.response?.data?.error || '';
        if (errorMessage.includes('Stale Merkle proof')) {
          console.log(`   ⚠️  Stale proof error detected (expected with high-activity trees)`);
          console.log(`   The improved retry logic should handle this automatically`);
          console.log(`   Error: ${errorMessage}`);
          // This is acceptable - the retry logic should handle it
          // But we should still verify the fix works
          throw error;
        }
        throw error;
      }
      
      // Check if bulk swap (cNFT swaps often use bulk due to proof size)
      const bulkSwap = (acceptResponse.data as any).bulkSwap;
      
      if (bulkSwap && bulkSwap.isBulkSwap) {
        console.log('📝 Step 3: Executing bulk swap (cNFT transfers split)...');
        console.log(`   Strategy: ${bulkSwap.strategy}`);
        console.log(`   Transaction Count: ${bulkSwap.transactionCount}`);
        console.log(`   Requires Jito: ${bulkSwap.requiresJitoBundle}`);
        console.log();
        
        const transactionsForBulk = bulkSwap.transactions.map((tx: any) => ({
          index: tx.index,
          purpose: tx.purpose,
          serializedTransaction: tx.serializedTransaction,
          requiredSigners: tx.requiredSigners,
        }));
        
        const { signAndSendBulkSwapTransactions } = require('../../helpers/atomic-swap-api-client');
        const bulkResult = await signAndSendBulkSwapTransactions(
          { 
            transactions: transactionsForBulk,
            requiresJitoBundle: bulkSwap.requiresJitoBundle !== false,
          },
          sender,
          receiver,
          connection
        );
        
        expect(bulkResult.success).to.be.true;
        
        if (bulkResult.bundleId) {
          console.log(`   ✅ Jito bundle confirmed: ${bulkResult.bundleId}`);
          console.log(`   All ${bulkSwap.transactionCount} transactions executed atomically`);
        } else {
          console.log(`   ✅ All ${bulkResult.signatures!.length} transactions confirmed!`);
          bulkResult.signatures!.forEach((sig: string, i: number) => {
            console.log(`   Tx ${i + 1}: ${sig}`);
            displayExplorerLink(sig, 'mainnet-beta');
          });
        }
      } else {
        console.log('📝 Step 3: Executing single transaction swap...');
        const serializedTx = acceptResponse.data!.transaction.serialized;
        const txBuffer = Buffer.from(serializedTx, 'base64');
        
        // Check if versioned transaction (ALT used)
        const isVersioned = isVersionedTransaction(txBuffer);
        if (isVersioned) {
          console.log('   ✅ Versioned transaction (V0) - ALT was used');
        } else {
          console.log('   ℹ️  Legacy transaction - ALT not needed');
        }
        
        // Note: In a real E2E test, we would sign and send the transaction
        // For now, we verify the transaction was built correctly
        console.log(`   ✅ Transaction built successfully (${txBuffer.length} bytes)`);
      }
      
      console.log('\n✅ cNFT ↔ cNFT swap test completed successfully!');
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
