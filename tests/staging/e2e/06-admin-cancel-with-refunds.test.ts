/**
 * STAGING E2E Test: Admin Cancellation with On-Chain Refund Verification
 * 
 * CRITICAL TEST: Verifies that all assets (NFT/SOL) are actually returned on-chain
 * when an agreement is cancelled by admin after deposits are made.
 * 
 * Test Flow:
 * 1. Create NFT_FOR_SOL agreement
 * 2. Seller deposits NFT (verify on-chain balance)
 * 3. Buyer deposits SOL (verify on-chain balance)
 * 4. Admin cancels agreement
 * 5. ** CRITICAL ** Verify NFT returned to seller (check actual balance)
 * 6. ** CRITICAL ** Verify SOL returned to buyer (check actual balance)
 * 7. Verify agreement status = CANCELLED
 * 
 * This test catches the bug where agreements are marked as cancelled in the database
 * but assets remain stuck in escrow PDAs without on-chain refunds being issued.
 * 
 * Run: npm run test:staging:e2e:admin-cancel-refunds
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
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import axios from 'axios';
import {
  STAGING_CONFIG,
  loadStagingWallets,
  generateIdempotencyKey,
  getExplorerUrl,
  getTokenBalance,
  createTestNFT,
  waitForAgreementStatus,
} from './shared-test-utils';

// ============================================================================
// TEST DATA
// ============================================================================

interface TestAgreement {
  agreementId: string;
  escrowPda: string;
  depositAddresses: {
    nft: string;
    sol?: string;
  };
}

interface TestNFT {
  mint: PublicKey;
  tokenAccount: PublicKey;
  metadata: any;
}

describe('STAGING E2E: Admin Cancel with On-Chain Refund Verification', function () {
  this.timeout(300000); // 5 minutes

  let connection: Connection;
  let wallets: {
    sender: Keypair;
    receiver: Keypair;
    admin: Keypair;
    feeCollector: Keypair;
  };
  let testAgreement: TestAgreement;
  let testNft: TestNFT;
  const createdAgreementIds: string[] = [];

  // Track initial balances
  let initialSellerNftBalance: number;
  let initialBuyerSolBalance: number;
  const testSolAmount = 0.01; // 0.01 SOL for test

  // ==========================================================================
  // SETUP
  // ==========================================================================

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 STAGING E2E: Admin Cancel with On-Chain Refund Verification');
    console.log('='.repeat(80));
    console.log('');
    console.log('🔧 Setting up test environment...\n');
    
    // Initialize connection
    connection = new Connection(STAGING_CONFIG.rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });

    // Load wallets
    wallets = await loadStagingWallets();

    console.log('📋 Test Wallets:');
    console.log(`   Seller (NFT): ${wallets.sender.publicKey.toString()}`);
    console.log(`   Buyer (SOL): ${wallets.receiver.publicKey.toString()}`);
    console.log(`   Admin: ${wallets.admin.publicKey.toString()}`);
    console.log('');
    console.log('✅ Setup complete\n');
  });

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  after(async function () {
    if (createdAgreementIds.length > 0) {
      console.log('\n🧹 Test Agreements Created:');
      createdAgreementIds.forEach((id) => console.log(`   - ${id}`));
      console.log('');
    }
  });

  // ==========================================================================
  // TEST: CREATE AGREEMENT
  // ==========================================================================

  it('should create NFT-for-SOL agreement', async function () {
    console.log('📝 Step 1: Creating NFT-for-SOL agreement...\n');
    
    // Create test NFT
    testNft = await createTestNFT(connection, wallets.sender);
    console.log(`   NFT Mint: ${testNft.mint.toString()}`);
    console.log(`   Token Account: ${testNft.tokenAccount.toString()}`);
    
    // Record initial NFT balance
    initialSellerNftBalance = await getTokenBalance(connection, testNft.tokenAccount);
    console.log(`   Initial Seller NFT Balance: ${initialSellerNftBalance}`);
    expect(initialSellerNftBalance).to.equal(1, 'Seller should own the NFT');

    // Record initial SOL balance
    initialBuyerSolBalance = await connection.getBalance(wallets.receiver.publicKey) / LAMPORTS_PER_SOL;
    console.log(`   Initial Buyer SOL Balance: ${initialBuyerSolBalance.toFixed(4)} SOL\n`);
    
    // Create agreement with 1-hour expiry
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    const idempotencyKey = generateIdempotencyKey();

    const requestBody = {
      nftMint: testNft.mint.toString(),
      swapType: 'NFT_FOR_SOL',
      solAmount: (testSolAmount * LAMPORTS_PER_SOL).toString(), // 0.01 SOL in lamports
      seller: wallets.sender.publicKey.toString(),
      buyer: wallets.receiver.publicKey.toString(),
      expiry: expiry.toISOString(),
      feeBps: 100, // 1%
      feePayer: 'BUYER',
      honorRoyalties: false,
    };

    try {
      const response = await axios.post(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
        }
      );

      testAgreement = {
        agreementId: response.data.data.agreementId,
        escrowPda: response.data.data.escrowPda,
        depositAddresses: response.data.data.depositAddresses,
      };
      
      createdAgreementIds.push(testAgreement.agreementId);

      console.log(`   ✅ Agreement Created: ${testAgreement.agreementId}`);
      console.log(`   Escrow PDA: ${testAgreement.escrowPda}`);
      console.log(`   NFT Deposit Address: ${testAgreement.depositAddresses.nft}`);
      console.log(`   Explorer: ${getExplorerUrl(response.data.data.transaction.txId)}\n`);
      
      expect(response.data.success).to.be.true;
      expect(testAgreement.agreementId).to.be.a('string');
      
    } catch (error: any) {
      console.error('   ❌ Failed to create agreement:', error.response?.data || error.message);
      throw error;
    }
  });

  // ==========================================================================
  // TEST: DEPOSIT NFT
  // ==========================================================================

  it('should deposit NFT to escrow and verify on-chain', async function () {
    console.log('🎨 Step 2: Depositing NFT to escrow...\n');

    try {
      // Prepare NFT deposit transaction
      const prepareResponse = await axios.post(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${testAgreement.agreementId}/deposit-nft/prepare`,
        {
          nftMint: testNft.mint.toString(),
          sellerNftAccount: testNft.tokenAccount.toString(),
        },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const { Transaction } = await import('@solana/web3.js');
      const transaction = Transaction.from(Buffer.from(prepareResponse.data.data.transaction, 'base64'));
      transaction.sign(wallets.sender);
      
      // Send transaction
      const txId = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction(txId, 'confirmed');
      
      console.log(`   ✅ NFT Deposited: ${getExplorerUrl(txId)}\n`);
      
      // ** CRITICAL CHECK ** Verify NFT is actually in escrow on-chain
      console.log('   🔍 Verifying NFT balance on-chain...');
      const escrowNftBalance = await getTokenBalance(
        connection, 
        new PublicKey(testAgreement.depositAddresses.nft)
      );
      console.log(`   Escrow NFT Balance: ${escrowNftBalance}`);
      expect(escrowNftBalance).to.equal(1, 'Escrow should have received 1 NFT');
      
      // Verify seller no longer has the NFT
      const sellerNftBalance = await getTokenBalance(connection, testNft.tokenAccount);
      console.log(`   Seller NFT Balance: ${sellerNftBalance}`);
      expect(sellerNftBalance).to.equal(0, 'Seller should no longer have the NFT');
      
      console.log('   ✅ NFT successfully transferred to escrow\n');
      
      // Wait for status update
      await waitForAgreementStatus(
        testAgreement.agreementId,
        'NFT_LOCKED',
        10,
        3000
      );
      console.log('   ✅ Agreement status: NFT_LOCKED\n');
      
    } catch (error: any) {
      console.error('   ❌ NFT deposit failed:', error.response?.data || error.message);
      throw error;
    }
  });

  // ==========================================================================
  // TEST: DEPOSIT SOL
  // ==========================================================================

  it('should deposit SOL to escrow and verify on-chain', async function () {
    console.log('💎 Step 3: Depositing SOL to escrow...\n');

    try {
      // Prepare SOL deposit transaction
      const prepareResponse = await axios.post(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${testAgreement.agreementId}/deposit-sol/prepare`,
        {
          amount: (testSolAmount * LAMPORTS_PER_SOL).toString(),
        },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const { Transaction } = await import('@solana/web3.js');
      const transaction = Transaction.from(Buffer.from(prepareResponse.data.data.transaction, 'base64'));
      transaction.sign(wallets.receiver);
      
      // Send transaction
      const txId = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction(txId, 'confirmed');
      
      console.log(`   ✅ SOL Deposited: ${getExplorerUrl(txId)}\n`);
      
      // Wait for backend to detect and validate deposit
      console.log('   ⏳ Waiting for deposit validation...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verify deposit via API
      const validationResponse = await axios.post(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${testAgreement.agreementId}/deposits/validate`,
        {},
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      console.log('   🔍 Deposit validation result:');
      console.log(`   SOL Deposit Status: ${validationResponse.data.data.validations.sol?.status}`);
      expect(validationResponse.data.data.validations.sol?.success).to.be.true;
      console.log('   ✅ SOL deposit confirmed by backend\n');
      
      // Wait for status update
      await waitForAgreementStatus(
        testAgreement.agreementId,
        'BOTH_LOCKED',
        10,
        3000
      );
      console.log('   ✅ Agreement status: BOTH_LOCKED\n');
      
    } catch (error: any) {
      console.error('   ❌ SOL deposit failed:', error.response?.data || error.message);
      throw error;
    }
  });

  // ==========================================================================
  // TEST: ADMIN CANCEL
  // ==========================================================================

  it('should admin cancel and verify on-chain refunds', async function () {
    console.log('🛑 Step 4: Admin cancelling agreement...\n');

    try {
      // Admin cancels the agreement
      console.log('   Requesting admin cancellation...');
      const cancelResponse = await axios.post(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${testAgreement.agreementId}/cancel`,
        {
          reason: 'E2E test - verifying refund functionality',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': process.env.ADMIN_API_KEY || 'test-admin-key',
          },
        }
      );

      expect(cancelResponse.status).to.equal(200);
      console.log('   ✅ Cancellation requested\n');
      
      // Wait for cancellation to process (backend should issue on-chain refunds)
      console.log('   ⏳ Waiting for on-chain refunds to process...');
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s for refund processing
      
      // Verify status changed to CANCELLED
      const agreementData = await axios.get(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${testAgreement.agreementId}`
      );
      
      const finalStatus = agreementData.data.data.status;
      console.log(`   Agreement Status: ${finalStatus}`);
      expect(['CANCELLED', 'REFUNDED']).to.include(finalStatus, 'Agreement should be CANCELLED or REFUNDED');
      console.log('   ✅ Status verified\n');
      
      // =======================================================================
      // ** CRITICAL CHECKS ** Verify actual on-chain refunds
      // =======================================================================
      
      console.log('🔍 Step 5: Verifying on-chain refunds...\n');
      
      // Check 1: Verify NFT returned to seller
      console.log('   Checking NFT refund...');
      const finalSellerNftBalance = await getTokenBalance(connection, testNft.tokenAccount);
      console.log(`   Seller NFT Balance: ${finalSellerNftBalance}`);
      console.log(`   Expected: ${initialSellerNftBalance}`);
      
      expect(finalSellerNftBalance).to.equal(
        initialSellerNftBalance,
        `🚨 CRITICAL: NFT was NOT returned to seller! Expected ${initialSellerNftBalance}, got ${finalSellerNftBalance}`
      );
      console.log('   ✅ NFT successfully returned to seller\n');
      
      // Check 2: Verify NFT no longer in escrow
      const escrowNftBalance = await getTokenBalance(
        connection,
        new PublicKey(testAgreement.depositAddresses.nft)
      );
      console.log(`   Escrow NFT Balance: ${escrowNftBalance}`);
      expect(escrowNftBalance).to.equal(0, 'Escrow should no longer hold the NFT');
      console.log('   ✅ NFT removed from escrow\n');
      
      // Check 3: Verify SOL returned to buyer
      console.log('   Checking SOL refund...');
      const finalBuyerSolBalance = await connection.getBalance(wallets.receiver.publicKey) / LAMPORTS_PER_SOL;
      console.log(`   Buyer SOL Balance: ${finalBuyerSolBalance.toFixed(4)} SOL`);
      console.log(`   Initial Balance: ${initialBuyerSolBalance.toFixed(4)} SOL`);
      console.log(`   Deposited: ${testSolAmount} SOL`);
      
      // Account for transaction fees (~0.001 SOL)
      const expectedMinBalance = initialBuyerSolBalance - 0.002; // Allow 0.002 SOL for fees
      const refundReceived = finalBuyerSolBalance >= expectedMinBalance;
      
      expect(refundReceived).to.be.true;
      console.log('   ✅ SOL successfully returned to buyer (minus tx fees)\n');
      
      console.log('='.repeat(80));
      console.log('✅ ALL REFUNDS VERIFIED ON-CHAIN');
      console.log('='.repeat(80));
      console.log('');
      console.log('Summary:');
      console.log(`   ✅ NFT returned: ${finalSellerNftBalance}/${initialSellerNftBalance}`);
      console.log(`   ✅ SOL returned: ~${testSolAmount} SOL (minus fees)`);
      console.log(`   ✅ Escrow cleaned: 0 NFT remaining`);
      console.log(`   ✅ Status: ${finalStatus}`);
      console.log('');
      
    } catch (error: any) {
      console.error('   ❌ Admin cancel or refund verification failed:', error.message);
      if (error.response) {
        console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  });
});

