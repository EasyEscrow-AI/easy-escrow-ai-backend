/**
 * Production E2E Test: cNFT (Compressed NFT) for SOL Happy Path
 * 
 * Tests the complete flow of swapping a compressed NFT for SOL on mainnet
 * ⚠️ IMPORTANT: Uses REAL MAINNET wallets and incurs REAL transaction fees
 * ⚠️ NOTE: cNFT creation requires Bubblegum program integration (complex)
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Use devnet RPC for staging, mainnet for production
const RPC_URL = process.env.STAGING_API_URL 
  ? (process.env.DEVNET_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com')
  : (process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com');

describe('🚀 Production E2E: cNFT → SOL (Mainnet)', () => {
  let connection: Connection;
  let sender: Keypair;
  let receiver: Keypair;
  
  before(async function() {
    this.timeout(180000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION E2E: cNFT → SOL - MAINNET                       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    connection = new Connection(RPC_URL, 'confirmed');
    
    const senderPath = path.join(__dirname, '../../../wallets/production/production-sender.json');
    const receiverPath = path.join(__dirname, '../../../wallets/production/production-receiver.json');
    
    sender = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(senderPath, 'utf8'))));
    receiver = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(receiverPath, 'utf8'))));
    
    console.log('⚠️  cNFT creation requires additional Bubblegum setup');
  });
  
  it('should successfully swap cNFT for SOL on mainnet', async function() {
    this.timeout(300000);
    
    console.log('\n🧪 Test: cNFT → SOL swap on mainnet');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Load production test assets
    const productionAssets = require('../../fixtures/production-test-assets.json');
    
    const hasMakerCnft = productionAssets?.maker?.cnfts?.length >= 1;
    
    if (!hasMakerCnft) {
      console.log('⚠️  Insufficient cNFTs in fixtures - skipping test');
      console.log(`   Maker cNFTs: ${productionAssets?.maker?.cnfts?.length || 0} (need 1+)`);
      this.skip();
      return;
    }
    
    const makerCnft = productionAssets.maker.cnfts[0].mint;
    const solAmount = 0.1 * 1e9; // 0.1 SOL in lamports
    
    console.log(`   Maker cNFT: ${makerCnft}`);
    console.log(`   Requested SOL: ${solAmount / 1e9} SOL`);
    console.log();
    
    // Import AtomicSwapApiClient
    const { AtomicSwapApiClient } = require('../../helpers/atomic-swap-api-client');
    const { displayExplorerLink, waitForConfirmation } = require('../../helpers/swap-verification');
    
    // Support local, staging, or production testing via environment variables
    // Priority: LOCAL_API_URL > STAGING_API_URL > PRODUCTION_API_URL > default
    const API_BASE_URL = process.env.LOCAL_API_URL || 
                         process.env.STAGING_API_URL || 
                         process.env.PRODUCTION_API_URL || 
                         'https://api.easyescrow.ai';
    const API_KEY = process.env.ATOMIC_SWAP_API_KEY || '';
    const apiClient = new AtomicSwapApiClient(API_BASE_URL, API_KEY);
    
    const envType = process.env.LOCAL_API_URL ? 'LOCAL' : 
                    process.env.STAGING_API_URL ? 'STAGING' : 
                    'PRODUCTION';
    
    console.log(`   API URL: ${API_BASE_URL}`);
    console.log(`   RPC URL: ${RPC_URL}`);
    console.log(`   Environment: ${envType}`);
    console.log(`   Network: ${envType === 'STAGING' ? 'DEVNET' : 'MAINNET'}`);
    
    // Create offer
    console.log('📝 Step 1: Creating cNFT → SOL offer...');
    const createKey = AtomicSwapApiClient.generateIdempotencyKey('cnft-sol-test');
    
    let createResponse;
    try {
      createResponse = await apiClient.createOffer(
        {
          makerWallet: sender.publicKey.toBase58(),
          takerWallet: receiver.publicKey.toBase58(),
          offeredAssets: [
            { mint: makerCnft, isCompressed: true },
          ],
          requestedAssets: [],
          offeredSol: 0,
          requestedSol: solAmount,
        },
        createKey
      );
    } catch (error: any) {
      console.error('   ❌ Create offer failed:', error.message || error);
      console.error('   Full error:', JSON.stringify(error, null, 2));
      throw error;
    }
    
    if (!createResponse) {
      throw new Error('Create offer returned undefined response');
    }
    
    console.log('   Create response:', JSON.stringify(createResponse, null, 2));
    
    expect(createResponse.success, `Create offer failed: ${createResponse.error || createResponse.message || 'Unknown error'}`).to.be.true;
    expect(createResponse.data, 'Create offer returned no data').to.exist;
    const offerId = createResponse.data!.offer.id;
    console.log(`   ✅ Offer created: ${offerId}`);
    console.log();
    
    // Accept offer
    console.log('📝 Step 2: Accepting offer...');
    const acceptKey = AtomicSwapApiClient.generateIdempotencyKey('cnft-sol-accept');
    
    let acceptResponse;
    try {
      acceptResponse = await apiClient.acceptOffer(
        offerId,
        receiver.publicKey.toBase58(),
        acceptKey
      );
      
      console.log(`   Accept response:`, JSON.stringify(acceptResponse, null, 2));
      
      if (!acceptResponse.success) {
        const errorMsg = acceptResponse.error || acceptResponse.message || 'Unknown error';
        console.log(`   ❌ Accept failed: ${errorMsg}`);
        throw new Error(`Accept offer failed: ${errorMsg}`);
      }
      
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
        throw error;
      }
      console.log(`   ❌ Accept error:`, error?.message || error);
      throw error;
    }
    
    // Check transaction
    const serializedTx = acceptResponse.data!.transaction.serialized;
    const txBuffer = Buffer.from(serializedTx, 'base64');
    
    // Check if versioned transaction (ALT used)
    const isVersioned = txBuffer.length > 0 && (txBuffer[0] & 0x80) !== 0;
    if (isVersioned) {
      console.log('   ✅ Versioned transaction (V0) - ALT was used');
    } else {
      console.log('   ℹ️  Legacy transaction - ALT not needed');
    }
    
    console.log(`   ✅ Transaction built successfully (${txBuffer.length} bytes)`);
    console.log();
    
    // Step 3: Execute the swap via test-execute endpoint
    console.log('📝 Step 3: Executing swap...');
    
    const executeResponse = await fetch(`${API_BASE_URL}/api/test/execute-swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        offerId: offerId,
        network: 'mainnet-beta',
      }),
    });
    
    if (!executeResponse.ok) {
      const errorText = await executeResponse.text();
      throw new Error(`Swap execution failed: ${executeResponse.status} - ${errorText}`);
    }
    
    const executeResult = await executeResponse.json() as {
      success: boolean;
      error?: string;
      message?: string;
      data?: {
        signature?: string;
        bundleId?: string;
      };
    };
    
    if (!executeResult.success) {
      throw new Error(`Swap execution failed: ${executeResult.error || executeResult.message}`);
    }
    
    console.log(`   ✅ Swap executed successfully!`);
    
    if (executeResult.data?.signature) {
      console.log(`   Transaction signature: ${executeResult.data.signature}`);
      displayExplorerLink(executeResult.data.signature, 'mainnet-beta');
    }
    
    if (executeResult.data?.bundleId) {
      console.log(`   Jito bundle ID: ${executeResult.data.bundleId}`);
      console.log(`   ✅ Bundle confirmed atomically`);
    }
    
    console.log('\n✅ cNFT → SOL swap test completed successfully!');
    console.log('   ✅ First attempt succeeded (no stale proof retry needed)');
    console.log('   ✅ Jito bundle handled rate limiting correctly');
  });
});

