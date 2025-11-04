/**
 * STAGING E2E Test - V2 Scenario 1: NFT for SOL Happy Path
 * 
 * Complete NFT-for-SOL swap with settlement and fee distribution.
 * Tests the v2 escrow with SOL-based payments.
 * 
 * Flow:
 * 1. Create v2 escrow agreement (NFT_FOR_SOL)
 * 2. Deposit NFT from seller
 * 3. Deposit SOL from buyer
 * 4. Automatic settlement
 * 5. Verify NFT transfer and SOL distribution with fees
 * 
 * Run: npm run test:staging:e2e:v2-nft-sol
 */

// Load .env.staging file BEFORE any other imports
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.staging');
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  throw new Error(`Failed to load .env.staging: ${result.error}`);
}

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, getAccount } from '@solana/spl-token';
import axios from 'axios';
import { STAGING_CONFIG } from './test-config';
import {
  loadStagingWallets,
  generateIdempotencyKey,
  getExplorerUrl,
  waitForAgreementStatus,
  createTestNFT,
  type StagingWallets,
  type TestNFT,
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

describe('STAGING E2E - V2: NFT-for-SOL Swap (Happy Path)', function () {
  this.timeout(300000); // 5 minutes for settlement

  let connection: Connection;
  let wallets: StagingWallets;
  let nft: TestNFT;
  let agreement: TestAgreement;
  let initialBalances: {
    seller: { sol: number };
    buyer: { sol: number };
    feeCollector: { sol: number };
  };

  const SOL_AMOUNT = 0.1; // 0.1 SOL payment
  const PLATFORM_FEE_BPS = 100; // 1%
  const EXPECTED_FEE = SOL_AMOUNT * (PLATFORM_FEE_BPS / 10000); // 0.001 SOL
  const EXPECTED_SELLER_RECEIVES = SOL_AMOUNT - EXPECTED_FEE; // 0.099 SOL

  // Transaction tracking
  const transactions: Array<{
    description: string;
    txId: string;
    timestamp: number;
  }> = [];

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 STAGING E2E Test - V2 NFT-for-SOL Swap');
    console.log('='.repeat(80));
    console.log(`   Environment: STAGING`);
    console.log(`   Network: ${STAGING_CONFIG.network}`);
    console.log(`   API: ${STAGING_CONFIG.apiBaseUrl}`);
    console.log(`   Swap Type: NFT_FOR_SOL`);
    console.log(`   SOL Amount: ${SOL_AMOUNT} SOL (reduced for devnet conservation)`);
    console.log(`   Platform Fee: ${PLATFORM_FEE_BPS / 100}%`);
    console.log('='.repeat(80) + '\n');

    connection = new Connection(STAGING_CONFIG.rpcUrl, 'confirmed');
    wallets = loadStagingWallets();

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

  it('should create a test NFT for the seller', async function () {
    console.log('🎨 Creating test NFT for seller...\n');

    nft = await createTestNFT(connection, wallets.sender);

    console.log(`   ✅ NFT Created: ${nft.mint.toBase58()}`);
    console.log(`   Token Account: ${nft.tokenAccount.toBase58()}`);
    console.log(`   Explorer: ${getExplorerUrl(nft.mint.toBase58(), 'address')}\n`);

    // Verify NFT ownership
    const tokenAccountInfo = await getAccount(connection, nft.tokenAccount);
    expect(tokenAccountInfo.amount.toString()).to.equal('1', 'Seller should own 1 NFT');
  });

  it('should create a v2 NFT-for-SOL escrow agreement', async function () {
    console.log('📝 Creating V2 escrow agreement (NFT_FOR_SOL)...\n');

    const idempotencyKey = generateIdempotencyKey('v2-nft-sol-test');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    const agreementData = {
      nftMint: nft.mint.toBase58(),
      seller: wallets.sender.publicKey.toBase58(),
      buyer: wallets.receiver.publicKey.toBase58(),
      swapType: 'NFT_FOR_SOL',
      solAmount: (SOL_AMOUNT * LAMPORTS_PER_SOL).toString(), // Convert SOL to lamports
      feeBps: PLATFORM_FEE_BPS,
      feePayer: 'BUYER',
      honorRoyalties: false,
      expiry,
    };

    console.log('   Request payload:');
    console.log(`     NFT: ${agreementData.nftMint}`);
    console.log(`     Swap Type: ${agreementData.swapType}`);
    console.log(`     SOL Amount: ${SOL_AMOUNT} SOL (${agreementData.solAmount} lamports)`);
    console.log(`     Fee Payer: ${agreementData.feePayer}\n`);

    let response;
    try {
      response = await axios.post(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements`,
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
    transactions.push({
      description: 'Create Agreement (init_agreement_v2)',
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

    // Wait to avoid rate limiting
    console.log('   ⏳ Waiting 3 seconds to avoid rate limiting...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Prepare unsigned transaction
    const prepareResponse = await axios.post(
      `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-nft/prepare`
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
      `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
    );

    console.log(`   Agreement Status: ${statusResponse.data.data.status}`);
    expect(['NFT_LOCKED', 'PENDING']).to.include(statusResponse.data.data.status);
  });

  it('should prepare and submit SOL deposit transaction', async function () {
    console.log('💎 Depositing SOL to escrow...\n');

    // Wait to avoid rate limiting
    console.log('   ⏳ Waiting 3 seconds to avoid rate limiting...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Prepare unsigned transaction
    const prepareResponse = await axios.post(
      `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-sol/prepare`
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

    // Wait for monitoring to detect deposit
    await new Promise(resolve => setTimeout(resolve, 5000));

    const statusResponse = await axios.get(
      `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
    );

    console.log(`   Agreement Status: ${statusResponse.data.data.status}`);
    expect(['BOTH_LOCKED', 'USDC_LOCKED']).to.include(statusResponse.data.data.status);
  });

  it('should wait for automatic settlement', async function () {
    console.log('⏳ Waiting for automatic settlement...\n');
    console.log('   Monitoring service should detect both deposits and trigger settlement');
    console.log('   This may take up to 2 minutes...\n');

    // Wait for SETTLED status (up to 2 minutes)
    const settledAgreement = await waitForAgreementStatus(
      agreement.agreementId,
      'SETTLED',
      120, // 120 attempts x 1000ms = 2 minutes
      1000 // 1 second interval
    );

    expect(settledAgreement.status).to.equal('SETTLED');
    expect(settledAgreement.settleTxId).to.exist;

    transactions.push({
      description: 'Settlement (settle_v2)',
      txId: settledAgreement.settleTxId!,
      timestamp: Date.now(),
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

  it('should display transaction summary', async function () {
    console.log('\n' + '='.repeat(80));
    console.log('📊 TRANSACTION SUMMARY');
    console.log('='.repeat(80) + '\n');

    transactions.forEach((tx, index) => {
      console.log(`${index + 1}. ${tx.description}`);
      console.log(`   TX: ${getExplorerUrl(tx.txId, 'tx')}`);
      console.log(`   Time: ${new Date(tx.timestamp).toISOString()}\n`);
    });

    console.log('='.repeat(80));
    console.log('✅ V2 NFT-for-SOL E2E TEST PASSED!');
    console.log('='.repeat(80) + '\n');
  });
});

