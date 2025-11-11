/**
 * PRODUCTION E2E Test: Zero-Fee Transactions
 * 
 * Tests edge case of agreements with zero platform fees.
 * 
 * Test Cases:
 * 1. Zero-fee agreement creation
 * 
 * Note: Standard fee collection (1%) is tested in happy path test (01)
 * 
 * Run: npm run test:PRODUCTION:e2e:04-zero-fee:verbose
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
  getRandomNFTFromWallet,
  cleanupAgreements,
} from './shared-test-utils';

// ============================================================================
// TEST DATA
// ============================================================================

describe('PRODUCTION E2E: Zero-Fee Transactions', function () {
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
    console.log('\n🔧 Setting up Zero-Fee Transactions test...\n');
    
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
  // TEST: ZERO-FEE TRANSACTIONS
  // ==========================================================================

  it('should create and accept zero-fee agreements', async function () {
    console.log('💸 Testing zero-fee transactions...\n');
    
    // Create agreement with 0 fee
    const testNft = await getRandomNFTFromWallet(connection, wallets.sender);
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    const idempotencyKey = generateIdempotencyKey();

    try {
      const response = await axios.post(
        `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements`,
        {
          nftMint: testNft.mint.toString(),
          swapType: 'NFT_FOR_SOL',
          solAmount: (PRODUCTION_CONFIG.swapAmount * 1_000_000_000).toString(), // Convert SOL to lamports string
          seller: wallets.sender.publicKey.toString(),
          buyer: wallets.receiver.publicKey.toString(),
          expiry: expiry.toISOString(),
          feeBps: 0, // Zero fee
          honorRoyalties: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
        }
      );

      expect(response.status).to.equal(201);
      createdAgreementIds.push(response.data.data.agreementId); // Track for cleanup
      console.log(`   ✅ Created zero-fee agreement: ${response.data.data.agreementId}`);
      console.log('   ✅ Zero-fee transaction accepted by API\n');
      
      // Note: Full settlement testing would require deposits
      // This test verifies zero-fee agreements can be created
      
    } catch (error: any) {
      console.error('   ❌ Zero-fee test failed:', error.message);
      if (error.response) {
        console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  });
});



