/**
 * PRODUCTION E2E Test: Concurrent Operations
 * 
 * Tests race condition prevention and concurrent request handling.
 * 
 * Test Flow:
 * 1. Create 5 NFTs
 * 2. Create 5 agreements concurrently
 * 3. Verify all have unique IDs
 * 4. Verify no race conditions
 * 
 * Run: npm run test:PRODUCTION:e2e:07-concurrent-operations:verbose
 */

// Load .env.PRODUCTION file BEFORE any other imports
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.PRODUCTION');
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  throw new Error(`Failed to load .env.PRODUCTION: ${result.error}`);
}

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair } from '@solana/web3.js';
import axios from 'axios';
import {
  PRODUCTION_CONFIG,
  loadPRODUCTIONWallets,
  generateIdempotencyKey,
  getRandomNFTOptimized,
  cleanupAgreements,
} from './shared-test-utils';

// ============================================================================
// TEST DATA
// ============================================================================

describe('PRODUCTION E2E: Concurrent Operations', function () {
  this.timeout(180000); // 3 minutes

  let connection: Connection;
  let wallets: {
    sender: Keypair;
    receiver: Keypair;
    admin: Keypair;
    feeCollector: Keypair;
  };
  const createdAgreementIds: string[] = [];

  // ==========================================================================
  // SETUP
  // ==========================================================================

  before(async function () {
    console.log('\n🔧 Setting up Concurrent Operations test...\n');
    
    // Initialize connection
    connection = new Connection(PRODUCTION_CONFIG.rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });

    // Load wallets
    wallets = await loadPRODUCTIONWallets();

    console.log('✅ Setup complete\n');
    console.log('='.repeat(70));
    console.log('');
  });

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  after(async function () {
    await cleanupAgreements(createdAgreementIds);
  });

  // ==========================================================================
  // TEST: CONCURRENT AGREEMENT CREATION
  // ==========================================================================

  it('should handle concurrent agreement creation', async function () {
    console.log('⚡ Testing concurrent operations...\n');
    
    // Create multiple NFTs for concurrent agreements
    const nftPromises = Array(5).fill(null).map(() => 
      getRandomNFTOptimized(connection, wallets.sender)
    );
    const nfts = await Promise.all(nftPromises);
    console.log(`   ✅ Created ${nfts.length} test NFTs`);

    try {
      // Create multiple agreements concurrently
      console.log('   Creating 5 agreements concurrently...');
      const expiry = new Date(Date.now() + 60 * 60 * 1000);
      
      const agreementPromises = nfts.map((nft, index) => 
        axios.post(
          `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements`,
          {
            nftMint: nft.mint.toString(),
            swapType: 'NFT_FOR_SOL',
            solAmount: PRODUCTION_CONFIG.swapAmount * 1_000_000_000, // Convert SOL to lamports (number type accepted)
            seller: wallets.sender.publicKey.toString(),
            buyer: wallets.receiver.publicKey.toString(),
            expiry: expiry.toISOString(),
            feeBps: 100,
            honorRoyalties: false,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'idempotency-key': generateIdempotencyKey(),
            },
          }
        )
      );

      const responses = await Promise.all(agreementPromises);
      
      // Verify all succeeded
      expect(responses.length).to.equal(5);
      responses.forEach((response, index) => {
        expect(response.status).to.equal(201);
        expect(response.data.success).to.be.true;
        createdAgreementIds.push(response.data.data.agreementId); // Track for cleanup
        console.log(`   ✅ Agreement ${index + 1}: ${response.data.data.agreementId}`);
      });

      // Verify all agreements have unique IDs
      const agreementIds = responses.map(r => r.data.data.agreementId);
      const uniqueIds = new Set(agreementIds);
      expect(uniqueIds.size).to.equal(5);
      console.log('   ✅ All agreements have unique IDs');
      console.log('   ✅ No race conditions detected\n');

    } catch (error: any) {
      console.error('   ❌ Concurrency test failed:', error.message);
      if (error.response) {
        console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  });
});



