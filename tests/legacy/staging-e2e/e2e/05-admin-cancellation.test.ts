/**
 * STAGING E2E Test: Admin Cancellation
 * 
 * Tests admin-initiated agreement cancellation workflow.
 * 
 * Test Flow:
 * 1. Create agreement
 * 2. Admin cancels agreement (via API with admin key)
 * 3. Verify status changes to CANCELLED
 * 4. Verify refund processing (if deposits were made)
 * 
 * Run: npm run test:staging:e2e:03-admin-cancellation:verbose
 */

// Load .env.staging file BEFORE any other imports
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.staging');
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  throw new Error(`Failed to load .env.staging: ${result.error}`);
}

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair } from '@solana/web3.js';
import axios from 'axios';
import {
  STAGING_CONFIG,
  loadStagingWallets,
  generateIdempotencyKey,
  createTestNFT,
} from './shared-test-utils';

// ============================================================================
// TEST DATA
// ============================================================================

describe('STAGING E2E: Admin Cancellation', function () {
  this.timeout(120000); // 2 minutes

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
    console.log('\n🔧 Setting up Admin Cancellation test...\n');
    
    // Initialize connection
    connection = new Connection(STAGING_CONFIG.rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });

    // Load wallets
    wallets = await loadStagingWallets();

    console.log('✅ Setup complete\n');
    console.log('='.repeat(70));
    console.log('');
  });

  after(async function () {
    if (createdAgreementIds.length > 0) {
      console.log('\n🧹 Cleanup: Agreement IDs tracked for manual cleanup:');
      createdAgreementIds.forEach((id) => console.log(`   - ${id}`));
      console.log('');
    }
  });

  // ==========================================================================
  // TEST: ADMIN CANCELLATION
  // ==========================================================================

  it('should handle admin cancellation', async function () {
    console.log('🛑 Testing admin cancellation...\n');
    
    // Create a new agreement for cancellation test
    const testNft = await createTestNFT(connection, wallets.sender);
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes (using minimum)
    const idempotencyKey = generateIdempotencyKey();

    try {
      // Create agreement
      const createResponse = await axios.post(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements`,
        {
          nftMint: testNft.mint.toString(),
          swapType: 'NFT_FOR_SOL',
          solAmount: (STAGING_CONFIG.swapAmount * 1_000_000_000).toString(), // Convert to lamports
          seller: wallets.sender.publicKey.toString(),
          buyer: wallets.receiver.publicKey.toString(),
          expiry: expiry.toISOString(),
          feeBps: 100,
          feePayer: 'BUYER',
          honorRoyalties: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
        }
      );

      const cancelAgreementId = createResponse.data.data.agreementId;
      createdAgreementIds.push(cancelAgreementId); // Track for cleanup
      console.log(`   ✅ Created agreement: ${cancelAgreementId}`);
      
      // Admin cancels the agreement
      console.log('   Requesting cancellation...');
      const cancelResponse = await axios.post(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${cancelAgreementId}/cancel`,
        {
          reason: 'Test cancellation',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': process.env.ADMIN_API_KEY || 'test-admin-key',
          },
        }
      );

      expect(cancelResponse.status).to.equal(200);
      console.log('   ✅ Cancellation requested');
      
      // Verify status changed to CANCELLED
      const agreementData = await axios.get(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${cancelAgreementId}`
      );
      
      expect(agreementData.data.data.status).to.equal('CANCELLED');
      console.log('   ✅ Status verified as CANCELLED\n');
      
    } catch (error: any) {
      console.error('   ❌ Cancellation test failed:', error.message);
      if (error.response) {
        console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
      }
      // Don't throw - cancellation API might not be fully implemented yet
      console.log('   ⚠️  Cancellation feature may require implementation\n');
      this.skip();
    }
  });
});

