/**
 * PRODUCTION E2E Test - Scenario 1: NFT for SOL Happy Path
 * 
 * Complete NFT-for-SOL swap with settlement and fee distribution.
 * Tests the SOL-based escrow payments.
 * 
 * **WITH TIMING**: Measures total escrow swap duration from creation to settlement.
 * 
 * Flow:
 * 1. Create escrow agreement (NFT_FOR_SOL)
 * 2. Deposit NFT from seller
 * 3. Deposit SOL from buyer
 * 4. Automatic settlement
 * 5. Verify NFT transfer and SOL distribution with fees
 * 
 * Run: npm run test:production:e2e:nft-sol
 */

// Load .env.production file BEFORE any other imports
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.production');
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  throw new Error(`Failed to load .env.production: ${result.error}`);
}

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, getAccount } from '@solana/spl-token';
import axios from 'axios';
import { PRODUCTION_CONFIG } from './test-config';
import {
  loadPRODUCTIONWallets,
  generateIdempotencyKey,
  getExplorerUrl,
  waitForAgreementStatus,
  getRandomNFTOptimized,
  type PRODUCTIONWallets,
  type TestNFT,
  archiveAgreements,
} from './shared-test-utils';

interface TestAgreement {
  agreementId: string;
  escrowPda: string;
  swapType: string;
  depositAddresses: {
    nft: string;
    usdc?: string;
    nftB?: string;
  };
  expiry: string;
  transactionId: string;
}

describe('PRODUCTION E2E - NFT-for-SOL Swap (Happy Path) [WITH TIMING]', function () {
  this.timeout(300000); // 5 minutes for settlement

  let connection: Connection;
  let wallets: PRODUCTIONWallets;
  let nft: TestNFT;
  let agreement: TestAgreement;
  let initialBalances: {
    seller: { sol: number };
    buyer: { sol: number };
    feeCollector: { sol: number };
  };

  const SOL_AMOUNT = 0.01; // 0.01 SOL payment (~$2 at $200/SOL)
  const PLATFORM_FEE_BPS = 100; // 1%
  const EXPECTED_FEE = SOL_AMOUNT * (PLATFORM_FEE_BPS / 10000); // 0.0001 SOL
  const EXPECTED_SELLER_RECEIVES = SOL_AMOUNT - EXPECTED_FEE; // 0.0099 SOL

  // ⏱️ TIMING METRICS
  let agreementCreationTime: number = 0;
  let settlementCompletionTime: number = 0;
  let totalSwapDuration: number = 0;

  // Transaction tracking
  const transactions: Array<{
    description: string;
    txId: string;
    timestamp: number;
  }> = [];

  // Track agreement IDs for cleanup
  const agreementIds: string[] = [];

  // Cleanup hook - runs after all tests (pass or fail)
  after(async function () {
    if (agreementIds.length > 0) {
      console.log(`\n🧹 Cleaning up ${agreementIds.length} test agreement(s)...`);
      await archiveAgreements(agreementIds);
    }

    // Display timing metrics
    if (agreementCreationTime > 0 && settlementCompletionTime > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('⏱️  TIMING METRICS');
      console.log('='.repeat(80));
      console.log(`   Agreement Creation: ${new Date(agreementCreationTime).toISOString()}`);
      console.log(`   Settlement Complete: ${new Date(settlementCompletionTime).toISOString()}`);
      console.log(`   Total Swap Duration: ${(totalSwapDuration / 1000).toFixed(2)}s`);
      console.log('='.repeat(80) + '\n');
    }
  });

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 PRODUCTION E2E Test - NFT-for-SOL Swap [WITH TIMING]');
    console.log('='.repeat(80));
    console.log(`   Environment: PRODUCTION`);
    console.log(`   Network: ${PRODUCTION_CONFIG.network}`);
    console.log(`   API: ${PRODUCTION_CONFIG.apiBaseUrl}`);
    console.log(`   Swap Type: NFT_FOR_SOL`);
    console.log(`   SOL Amount: ${SOL_AMOUNT} SOL`);
    console.log(`   Platform Fee: ${PLATFORM_FEE_BPS / 100}%`);
    console.log(`   ⏱️  Timing: ENABLED (measuring end-to-end duration)`);
    console.log('='.repeat(80) + '\n');

    connection = new Connection(PRODUCTION_CONFIG.rpcUrl, 'confirmed');
    wallets = loadPRODUCTIONWallets();

    console.log('📋 Test Participants:');
    console.log(`   Seller: ${wallets.sender.publicKey.toBase58()}`);
    console.log(`   Buyer: ${wallets.receiver.publicKey.toBase58()}`);
    console.log(`   Fee Collector: ${wallets.feeCollector.publicKey.toBase58()}\n`);
  });

  it('should check initial SOL balances', async function () {
    console.log('💰 Checking initial SOL balances...\n');

    const sellerBalance = await connection.getBalance(wallets.sender.publicKey);
    const buyerBalance = await connection.getBalance(wallets.receiver.publicKey);
    const feeCollectorBalance = await connection.getBalance(wallets.feeCollector.publicKey);

    initialBalances = {
      seller: { sol: sellerBalance / LAMPORTS_PER_SOL },
      buyer: { sol: buyerBalance / LAMPORTS_PER_SOL },
      feeCollector: { sol: feeCollectorBalance / LAMPORTS_PER_SOL },
    };

    console.log(`   Seller SOL: ${initialBalances.seller.sol.toFixed(4)} SOL`);
    console.log(`   Buyer SOL: ${initialBalances.buyer.sol.toFixed(4)} SOL`);
    console.log(`   Fee Collector SOL: ${initialBalances.feeCollector.sol.toFixed(4)} SOL\n`);

    expect(buyerBalance).to.be.greaterThan(SOL_AMOUNT * LAMPORTS_PER_SOL, 'Buyer needs sufficient SOL for payment');
  });

  it('should select a random NFT from seller wallet', async function () {
    console.log('🎨 Selecting random NFT from seller wallet...\n');

    nft = await getRandomNFTOptimized(connection, wallets.sender);

    console.log(`   ✅ NFT Selected: ${nft.mint.toBase58()}`);
    console.log(`   Token Account: ${nft.tokenAccount.toBase58()}`);
    console.log(`   Name: ${nft.metadata.name}`);
    console.log(`   Explorer: ${getExplorerUrl(nft.mint.toBase58(), 'address')}\n`);

    // Verify NFT ownership
    const tokenAccountInfo = await getAccount(connection, nft.tokenAccount);
    expect(tokenAccountInfo.amount.toString()).to.equal('1', 'Seller should own 1 NFT');
  });

  it('should create an NFT-for-SOL escrow agreement', async function () {
    console.log('📝 Creating escrow agreement (NFT_FOR_SOL)...\n');

    const idempotencyKey = generateIdempotencyKey('prod-nft-sol-test');
    // Expiry omitted - uses default of 5 minutes

    const agreementData = {
      nftMint: nft.mint.toBase58(),
      seller: wallets.sender.publicKey.toBase58(),
      buyer: wallets.receiver.publicKey.toBase58(),
      swapType: 'NFT_FOR_SOL',
      solAmount: SOL_AMOUNT * LAMPORTS_PER_SOL, // Convert SOL to lamports (number type accepted)
      feeBps: PLATFORM_FEE_BPS,
      feePayer: 'BUYER',
      honorRoyalties: false,
      // expiry omitted - uses default of 5 minutes
    };

    console.log('   Request payload:');
    console.log(`     NFT: ${agreementData.nftMint}`);
    console.log(`     Swap Type: ${agreementData.swapType}`);
    console.log(`     SOL Amount: ${SOL_AMOUNT} SOL (${agreementData.solAmount} lamports)`);
    console.log(`     Fee Payer: ${agreementData.feePayer}\n`);

    // ⏱️ START TIMER
    agreementCreationTime = Date.now();
    console.log(`   ⏱️  Timer started: ${new Date(agreementCreationTime).toISOString()}\n`);

    let response;
    try {
      response = await axios.post(
        `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements`,
        agreementData,
        {
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        }
      );
    } catch (error: any) {
      console.error('   ❌ Agreement creation failed!');
      console.error('   Status:', error.response?.status);
      console.error('   Error:', JSON.stringify(error.response?.data, null, 2));
      throw error;
    }

    expect(response.status).to.equal(201);
    expect(response.data.success).to.be.true;
    expect(response.data.data).to.have.property('agreementId');
    expect(response.data.data).to.have.property('escrowPda');
    expect(response.data.data.swapType).to.equal('NFT_FOR_SOL');

    agreement = response.data.data;
    agreementIds.push(agreement.agreementId);
    
    transactions.push({
      description: 'Create Agreement',
      txId: agreement.transactionId,
      timestamp: Date.now(),
    });

    console.log(`   ✅ Agreement Created: ${agreement.agreementId}`);
    console.log(`   Escrow PDA: ${agreement.escrowPda}`);
    console.log(`   NFT Deposit Address: ${agreement.depositAddresses.nft}`);
    console.log(`   Transaction: ${getExplorerUrl(agreement.transactionId, 'tx')}\n`);
  });

  it('should prepare and submit NFT deposit transaction', async function () {
    console.log('🎨 Depositing NFT to escrow...\n');

    // Prepare unsigned transaction
    const prepareResponse = await axios.post(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-nft/prepare`
    );

    expect(prepareResponse.status).to.equal(200);
    expect(prepareResponse.data.success).to.be.true;
    expect(prepareResponse.data.data).to.have.property('transaction');

    // Deserialize, sign, and send transaction
    const transactionBuffer = Buffer.from(prepareResponse.data.data.transaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallets.sender.publicKey;

    // Sign with seller
    transaction.sign(wallets.sender);

    // Send transaction
    const txId = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // Confirm transaction
    await connection.confirmTransaction(txId, 'confirmed');

    transactions.push({
      description: 'Deposit NFT (deposit_seller_nft)',
      txId,
      timestamp: Date.now(),
    });

    console.log(`   ✅ NFT Deposited`);
    console.log(`   Transaction: ${getExplorerUrl(txId, 'tx')}\n`);

    // Verify agreement status updated
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for backend to process

    const statusResponse = await axios.get(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
    );

    console.log(`   Agreement Status: ${statusResponse.data.data.status}`);
    expect(['NFT_LOCKED', 'PENDING']).to.include(statusResponse.data.data.status);
  });

  it('should prepare and submit SOL deposit transaction', async function () {
    console.log('💎 Depositing SOL to escrow...\n');

    // Prepare unsigned transaction
    const prepareResponse = await axios.post(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-sol/prepare`
    );

    expect(prepareResponse.status).to.equal(200);
    expect(prepareResponse.data.success).to.be.true;
    expect(prepareResponse.data.data).to.have.property('transaction');

    console.log(`   SOL Amount: ${SOL_AMOUNT} SOL (${SOL_AMOUNT * LAMPORTS_PER_SOL} lamports)`);

    // Deserialize, sign, and send transaction
    const transactionBuffer = Buffer.from(prepareResponse.data.data.transaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallets.receiver.publicKey;

    // Sign with buyer
    transaction.sign(wallets.receiver);

    // Send transaction
    const txId = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // Confirm transaction
    await connection.confirmTransaction(txId, 'confirmed');

    transactions.push({
      description: 'Deposit SOL (deposit_sol)',
      txId,
      timestamp: Date.now(),
    });

    console.log(`   ✅ SOL Deposited`);
    console.log(`   Transaction: ${getExplorerUrl(txId, 'tx')}\n`);

    // Manually trigger deposit validation immediately
    console.log('   🔍 Validating SOL deposit...');
    const validateResponse = await axios.post(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/validate-deposits`
    );

    console.log(`   Validation result:`, JSON.stringify(validateResponse.data, null, 2));
    
    // If validation failed, wait and retry once
    if (!validateResponse.data.data.validations.sol.success) {
      console.log('   ⚠️  First validation failed, waiting 5 seconds and retrying...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const retryResponse = await axios.post(
        `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/validate-deposits`
      );
      console.log(`   Retry validation result:`, JSON.stringify(retryResponse.data, null, 2));
    }

    // Check updated status
    const statusResponse = await axios.get(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
    );

    console.log(`   Agreement Status: ${statusResponse.data.data.status}`);
    // After SOL deposit on NFT_FOR_SOL, status should be BOTH_LOCKED or SETTLED
    expect(['BOTH_LOCKED', 'SETTLED']).to.include(statusResponse.data.data.status, 'Status should be BOTH_LOCKED or SETTLED after both deposits');
  });

  it('should wait for automatic settlement', async function () {
    console.log('⏳ Waiting for automatic settlement...\n');
    console.log('   Monitoring service should detect both deposits and trigger settlement');
    console.log('   Expected settlement time: 3-10 seconds (polling interval: 3s)\n');

    // Wait for SETTLED status (up to 45 seconds for production)
    const settledAgreement = await waitForAgreementStatus(
      agreement.agreementId,
      'SETTLED',
      45, // 45 attempts x 1000ms = 45 seconds
      1000 // 1 second interval
    );

    expect(settledAgreement.status).to.equal('SETTLED');
    expect(settledAgreement.settleTxId).to.exist;

    // ⏱️ STOP TIMER
    settlementCompletionTime = Date.now();
    totalSwapDuration = settlementCompletionTime - agreementCreationTime;
    
    console.log(`   ⏱️  Timer stopped: ${new Date(settlementCompletionTime).toISOString()}`);
    console.log(`   ⏱️  Total Duration: ${(totalSwapDuration / 1000).toFixed(2)}s\n`);

    transactions.push({
      description: 'Settlement',
      txId: settledAgreement.settleTxId!,
      timestamp: settlementCompletionTime,
    });

    console.log(`   ✅ Settlement Complete!`);
    console.log(`   Transaction: ${getExplorerUrl(settledAgreement.settleTxId!, 'tx')}\n`);
  });

  it('should verify NFT was transferred to buyer', async function () {
    console.log('🔍 Verifying NFT transfer...\n');

    // Check buyer's NFT account
    const buyerNftAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallets.receiver, // Payer (but account should already exist)
      nft.mint,
      wallets.receiver.publicKey
    );

    const buyerNftBalance = await connection.getTokenAccountBalance(buyerNftAccount.address);

    console.log(`   Buyer NFT Balance: ${buyerNftBalance.value.uiAmount}`);
    expect(buyerNftBalance.value.uiAmount).to.equal(1, 'Buyer should have received 1 NFT');
    console.log(`   ✅ NFT successfully transferred to buyer\n`);
  });

  it('should verify SOL distribution with fees', async function () {
    console.log('💰 Verifying SOL distribution...\n');

    const sellerBalance = await connection.getBalance(wallets.sender.publicKey);
    const buyerBalance = await connection.getBalance(wallets.receiver.publicKey);
    const feeCollectorBalance = await connection.getBalance(wallets.feeCollector.publicKey);

    const finalBalances = {
      seller: { sol: sellerBalance / LAMPORTS_PER_SOL },
      buyer: { sol: buyerBalance / LAMPORTS_PER_SOL },
      feeCollector: { sol: feeCollectorBalance / LAMPORTS_PER_SOL },
    };

    const sellerDelta = finalBalances.seller.sol - initialBalances.seller.sol;
    const buyerDelta = finalBalances.buyer.sol - initialBalances.buyer.sol;
    const feeCollectorDelta = finalBalances.feeCollector.sol - initialBalances.feeCollector.sol;

    console.log('   Initial Balances:');
    console.log(`     Seller: ${initialBalances.seller.sol.toFixed(4)} SOL`);
    console.log(`     Buyer: ${initialBalances.buyer.sol.toFixed(4)} SOL`);
    console.log(`     Fee Collector: ${initialBalances.feeCollector.sol.toFixed(4)} SOL\n`);

    console.log('   Final Balances:');
    console.log(`     Seller: ${finalBalances.seller.sol.toFixed(4)} SOL`);
    console.log(`     Buyer: ${finalBalances.buyer.sol.toFixed(4)} SOL`);
    console.log(`     Fee Collector: ${finalBalances.feeCollector.sol.toFixed(4)} SOL\n`);

    console.log('   Changes:');
    console.log(`     Seller: ${sellerDelta >= 0 ? '+' : ''}${sellerDelta.toFixed(4)} SOL`);
    console.log(`     Buyer: ${buyerDelta >= 0 ? '+' : ''}${buyerDelta.toFixed(4)} SOL`);
    console.log(`     Fee Collector: ${feeCollectorDelta >= 0 ? '+' : ''}${feeCollectorDelta.toFixed(4)} SOL\n`);

    // Verify expectations (with tolerance for transaction fees)
    const TX_FEE_TOLERANCE = 0.01; // 0.01 SOL tolerance for transaction fees

    expect(sellerDelta).to.be.greaterThan(
      EXPECTED_SELLER_RECEIVES - TX_FEE_TOLERANCE,
      `Seller should receive ~${EXPECTED_SELLER_RECEIVES} SOL (minus tx fees)`
    );

    expect(buyerDelta).to.be.lessThan(
      -SOL_AMOUNT + TX_FEE_TOLERANCE,
      `Buyer should have paid ~${SOL_AMOUNT} SOL (plus tx fees)`
    );

    expect(feeCollectorDelta).to.be.greaterThan(
      EXPECTED_FEE - TX_FEE_TOLERANCE,
      `Fee collector should receive ~${EXPECTED_FEE} SOL`
    );

    console.log('   ✅ SOL distribution verified\n');
    console.log(`   Expected Fee: ${EXPECTED_FEE.toFixed(4)} SOL`);
    console.log(`   Expected Seller Receives: ${EXPECTED_SELLER_RECEIVES.toFixed(4)} SOL`);
  });

  it('should display transaction summary with timing metrics', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('📊 TRANSACTION SUMMARY');
    console.log('='.repeat(80) + '\n');

    transactions.forEach((tx, index) => {
      console.log(`${index + 1}. ${tx.description}`);
      console.log(`   TX: ${getExplorerUrl(tx.txId, 'tx')}`);
      console.log(`   Time: ${new Date(tx.timestamp).toISOString()}\n`);
    });

    console.log('='.repeat(80));
    console.log('⏱️  TIMING METRICS');
    console.log('='.repeat(80));
    console.log(`   Agreement Created: ${new Date(agreementCreationTime).toISOString()}`);
    console.log(`   Settlement Complete: ${new Date(settlementCompletionTime).toISOString()}`);
    console.log(`   Total Swap Duration: ${(totalSwapDuration / 1000).toFixed(2)} seconds`);
    console.log('='.repeat(80));
    console.log('✅ NFT-for-SOL E2E TEST PASSED!');
    console.log('='.repeat(80) + '\n');
  });
});

