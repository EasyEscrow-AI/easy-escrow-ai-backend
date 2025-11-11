/**
 * PRODUCTION E2E Test - Scenario 3: NFT for NFT + SOL Payment
 * 
 * Complete NFT-for-NFT swap where buyer also pays SOL to the seller.
 * Tests the v2 escrow with NFT exchange and SOL payment to seller + platform fee.
 * 
 * **WITH TIMING**: Measures total escrow swap duration from creation to settlement.
 * 
 * Flow:
 * 1. Create v2 escrow agreement (NFT_FOR_NFT_PLUS_SOL)
 * 2. Deposit NFT A from seller
 * 3. Deposit NFT B from buyer
 * 4. Deposit SOL (to seller + fee) from buyer
 * 5. Automatic settlement
 * 6. Verify both NFTs swapped, SOL paid to seller, and fee collected
 * 
 * Run: npm run test:production:e2e:nft-nft-sol
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
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, getAccount } from '@solana/spl-token';
import axios from 'axios';
import { PRODUCTION_CONFIG } from './test-config';
import {
  loadPRODUCTIONWallets,
  generateIdempotencyKey,
  getExplorerUrl,
  waitForAgreementStatus,
  getRandomNFTFromWallet,
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

describe('PRODUCTION E2E - NFT-for-NFT + SOL Payment (Happy Path) [WITH TIMING]', function () {
  this.timeout(300000); // 5 minutes

  let connection: Connection;
  let wallets: PRODUCTIONWallets;
  let nftA: TestNFT; // Seller's NFT
  let nftB: TestNFT; // Buyer's NFT
  let agreement: TestAgreement;
  let initialBalances: {
    seller: { sol: number };
    buyer: { sol: number };
    feeCollector: { sol: number };
  };

  const SOL_PAYMENT = 0.01; // 0.01 SOL payment to seller (~$2 at $200/SOL)
  const PLATFORM_FEE_BPS = 100; // 1%
  const EXPECTED_FEE = SOL_PAYMENT * (PLATFORM_FEE_BPS / 10000); // 0.0001 SOL
  const EXPECTED_SELLER_RECEIVES = SOL_PAYMENT - EXPECTED_FEE; // 0.0099 SOL

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
    console.log('🚀 PRODUCTION E2E Test - NFT-for-NFT + SOL Payment [WITH TIMING]');
    console.log('='.repeat(80));
    console.log(`   Environment: PRODUCTION`);
    console.log(`   Network: ${PRODUCTION_CONFIG.network}`);
    console.log(`   API: ${PRODUCTION_CONFIG.apiBaseUrl}`);
    console.log(`   Swap Type: NFT_FOR_NFT_PLUS_SOL`);
    console.log(`   SOL Payment: ${SOL_PAYMENT} SOL (${EXPECTED_FEE.toFixed(4)} SOL fee)`);
    console.log(`   Seller Receives: ${EXPECTED_SELLER_RECEIVES.toFixed(4)} SOL (after fee)`);
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

    expect(buyerBalance).to.be.greaterThan(SOL_PAYMENT * LAMPORTS_PER_SOL, 'Buyer needs sufficient SOL for payment');
  });

  it('should select NFT A from seller wallet', async function () {
    console.log('🎨 Selecting NFT A from seller wallet...\n');

    nftA = await getRandomNFTFromWallet(connection, wallets.sender);

    console.log(`   ✅ NFT A Selected: ${nftA.mint.toBase58()}`);
    console.log(`   Token Account: ${nftA.tokenAccount.toBase58()}`);
    console.log(`   Name: ${nftA.metadata.name}`);
    console.log(`   Explorer: ${getExplorerUrl(nftA.mint.toBase58(), 'address')}\n`);

    const tokenAccountInfo = await getAccount(connection, nftA.tokenAccount);
    expect(tokenAccountInfo.amount.toString()).to.equal('1', 'Seller should own 1 NFT A');
  });

  it('should select NFT B from buyer wallet', async function () {
    console.log('🎨 Selecting NFT B from buyer wallet...\n');

    nftB = await getRandomNFTFromWallet(connection, wallets.receiver);

    console.log(`   ✅ NFT B Selected: ${nftB.mint.toBase58()}`);
    console.log(`   Token Account: ${nftB.tokenAccount.toBase58()}`);
    console.log(`   Name: ${nftB.metadata.name}`);
    console.log(`   Explorer: ${getExplorerUrl(nftB.mint.toBase58(), 'address')}\n`);

    const tokenAccountInfo = await getAccount(connection, nftB.tokenAccount);
    expect(tokenAccountInfo.amount.toString()).to.equal('1', 'Buyer should own 1 NFT B');
  });

  it('should create a v2 NFT-for-NFT+SOL escrow agreement', async function () {
    console.log('📝 Creating V2 escrow agreement (NFT_FOR_NFT_PLUS_SOL)...\n');

    const idempotencyKey = generateIdempotencyKey('prod-nft-nft-sol-test');
    // Expiry omitted - uses default of 5 minutes

    const agreementData = {
      nftMint: nftA.mint.toBase58(), // Seller's NFT
      seller: wallets.sender.publicKey.toBase58(),
      buyer: wallets.receiver.publicKey.toBase58(),
      swapType: 'NFT_FOR_NFT_PLUS_SOL',
      nftBMint: nftB.mint.toBase58(), // Buyer's NFT
      solAmount: SOL_PAYMENT * LAMPORTS_PER_SOL, // SOL payment in lamports (number type accepted)
      feeBps: PLATFORM_FEE_BPS,
      feePayer: 'BUYER',
      honorRoyalties: false,
      // expiry omitted - uses default of 5 minutes
    };

    console.log('   Request payload:');
    console.log(`     NFT A (Seller): ${agreementData.nftMint}`);
    console.log(`     NFT B (Buyer): ${agreementData.nftBMint}`);
    console.log(`     Swap Type: ${agreementData.swapType}`);
    console.log(`     SOL Payment: ${SOL_PAYMENT} SOL (${agreementData.solAmount} lamports)`);
    console.log(`     Platform Fee: ${EXPECTED_FEE.toFixed(4)} SOL (${PLATFORM_FEE_BPS / 100}%)`);
    console.log(`     Fee Payer: ${agreementData.feePayer}\n`);

    // ⏱️ START TIMER
    agreementCreationTime = Date.now();
    console.log(`   ⏱️  Timer started: ${new Date(agreementCreationTime).toISOString()}\n`);

    const response = await axios.post(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements`,
      agreementData,
      {
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      }
    );

    expect(response.status).to.equal(201);
    expect(response.data.success).to.be.true;
    expect(response.data.data).to.have.property('agreementId');
    expect(response.data.data.swapType).to.equal('NFT_FOR_NFT_PLUS_SOL');
    expect(response.data.data.depositAddresses, 'Should have buyer NFT deposit address').to.have.property('nftB');

    agreement = response.data.data;
    agreementIds.push(agreement.agreementId);
    
    transactions.push({
      description: 'Create Agreement (init_agreement_v2)',
      txId: agreement.transactionId,
      timestamp: Date.now(),
    });

    console.log(`   ✅ Agreement Created: ${agreement.agreementId}`);
    console.log(`   Escrow PDA: ${agreement.escrowPda}`);
    console.log(`   NFT A Deposit Address: ${agreement.depositAddresses.nft}`);
    console.log(`   NFT B Deposit Address: ${agreement.depositAddresses.nftB}`);
    console.log(`   Transaction: ${getExplorerUrl(agreement.transactionId, 'tx')}\n`);
  });

  it('should deposit NFT A (seller)', async function () {
    console.log('🎨 Depositing NFT A to escrow...\n');

    const prepareResponse = await axios.post(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-nft/prepare`
    );

    expect(prepareResponse.status).to.equal(200);
    expect(prepareResponse.data.success).to.be.true;

    const transactionBuffer = Buffer.from(prepareResponse.data.data.transaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallets.sender.publicKey;
    transaction.sign(wallets.sender);

    const txId = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction(txId, 'confirmed');

    transactions.push({
      description: 'Deposit NFT A (deposit_seller_nft)',
      txId,
      timestamp: Date.now(),
    });

    console.log(`   ✅ NFT A Deposited`);
    console.log(`   Transaction: ${getExplorerUrl(txId, 'tx')}\n`);

    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  it('should deposit NFT B (buyer)', async function () {
    console.log('🎨 Depositing NFT B to escrow...\n');

    const prepareResponse = await axios.post(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-nft-buyer/prepare`
    );

    expect(prepareResponse.status).to.equal(200);
    expect(prepareResponse.data.success).to.be.true;

    const transactionBuffer = Buffer.from(prepareResponse.data.data.transaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallets.receiver.publicKey;
    transaction.sign(wallets.receiver);

    const txId = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction(txId, 'confirmed');

    transactions.push({
      description: 'Deposit NFT B (deposit_buyer_nft)',
      txId,
      timestamp: Date.now(),
    });

    console.log(`   ✅ NFT B Deposited`);
    console.log(`   Transaction: ${getExplorerUrl(txId, 'tx')}\n`);

    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  it('should deposit SOL payment (buyer)', async function () {
    console.log('💎 Depositing SOL payment to escrow...\n');

    const prepareResponse = await axios.post(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-sol/prepare`
    );

    expect(prepareResponse.status).to.equal(200);
    expect(prepareResponse.data.success).to.be.true;

    console.log(`   Total SOL Payment: ${SOL_PAYMENT} SOL`);
    console.log(`   Seller Receives: ${EXPECTED_SELLER_RECEIVES.toFixed(4)} SOL (after ${EXPECTED_FEE.toFixed(4)} SOL fee)`);

    const transactionBuffer = Buffer.from(prepareResponse.data.data.transaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallets.receiver.publicKey;
    transaction.sign(wallets.receiver);

    const txId = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction(txId, 'confirmed');

    transactions.push({
      description: 'Deposit SOL Payment (deposit_sol)',
      txId,
      timestamp: Date.now(),
    });

    console.log(`   ✅ SOL Payment Deposited`);
    console.log(`   Transaction: ${getExplorerUrl(txId, 'tx')}\n`);

    // Manually trigger deposit validation
    console.log('   🔍 Validating deposits...');
    const validateResponse = await axios.post(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/validate-deposits`
    );

    console.log(`   Validation result:`, JSON.stringify(validateResponse.data, null, 2));
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  });

  it('should check agreement status', async function () {
    console.log('📊 Checking agreement status...\n');

    const statusResponse = await axios.get(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
    );

    console.log(`   Current Status: ${statusResponse.data.data.status}`);
    console.log(`   Swap Type: ${statusResponse.data.data.swapType}`);
    console.log(`   NFT A Locked: ${statusResponse.data.data.nftLocked || false}`);
    console.log(`   NFT B Locked: ${statusResponse.data.data.nftBLocked || false}`);
    console.log(`   SOL Locked: ${statusResponse.data.data.solLocked || false}\n`);

    // After all deposits, status should be BOTH_LOCKED or SETTLED
    expect(['BOTH_LOCKED', 'SETTLED']).to.include(statusResponse.data.data.status, 'Status should be BOTH_LOCKED or SETTLED after all deposits');
  });

  it('should wait for automatic settlement', async function () {
    console.log('⏳ Waiting for automatic settlement...\n');
    console.log('   Monitoring service should detect all deposits and trigger settlement');
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
      description: 'Settlement (settle_v2)',
      txId: settledAgreement.settleTxId!,
      timestamp: settlementCompletionTime,
    });

    console.log(`   ✅ Settlement Complete!`);
    console.log(`   Transaction: ${getExplorerUrl(settledAgreement.settleTxId!, 'tx')}\n`);
  });

  it('should verify NFT A was transferred to buyer', async function () {
    console.log('🔍 Verifying NFT A transfer to buyer...\n');

    // Check buyer's NFT A account
    const buyerNftAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallets.receiver,
      nftA.mint,
      wallets.receiver.publicKey
    );

    const tokenAccountInfo = await getAccount(connection, buyerNftAAccount.address);
    expect(tokenAccountInfo.amount.toString()).to.equal('1', 'Buyer should now own NFT A');

    console.log(`   ✅ NFT A transferred to buyer`);
    console.log(`   Buyer's NFT A Account: ${buyerNftAAccount.address.toBase58()}`);
    console.log(`   Amount: ${tokenAccountInfo.amount.toString()}\n`);
  });

  it('should verify NFT B was transferred to seller', async function () {
    console.log('🔍 Verifying NFT B transfer to seller...\n');

    // Check seller's NFT B account
    const sellerNftBAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallets.sender,
      nftB.mint,
      wallets.sender.publicKey
    );

    const tokenAccountInfo = await getAccount(connection, sellerNftBAccount.address);
    expect(tokenAccountInfo.amount.toString()).to.equal('1', 'Seller should now own NFT B');

    console.log(`   ✅ NFT B transferred to seller`);
    console.log(`   Seller's NFT B Account: ${sellerNftBAccount.address.toBase58()}`);
    console.log(`   Amount: ${tokenAccountInfo.amount.toString()}\n`);
  });

  it('should verify SOL payment and fee distribution', async function () {
    console.log('💰 Verifying SOL payment and fee distribution...\n');

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

    console.log('   Balance Changes:');
    console.log(`     Seller: ${sellerDelta >= 0 ? '+' : ''}${sellerDelta.toFixed(4)} SOL (expected: ~${EXPECTED_SELLER_RECEIVES.toFixed(4)} SOL)`);
    console.log(`     Buyer: ${buyerDelta >= 0 ? '+' : ''}${buyerDelta.toFixed(4)} SOL (expected: ~${-SOL_PAYMENT.toFixed(4)} SOL)`);
    console.log(`     Fee Collector: ${feeCollectorDelta >= 0 ? '+' : ''}${feeCollectorDelta.toFixed(4)} SOL (expected: ~${EXPECTED_FEE.toFixed(4)} SOL)\n`);

    // Seller should have received SOL minus platform fee (with some tolerance for tx fees)
    // NOTE: Seller pays tx fees for NFT deposit, reducing net balance change
    const SELLER_TX_FEE_TOLERANCE = 0.003; // Accounts for seller's NFT deposit tx fee
    expect(sellerDelta).to.be.greaterThan(
      EXPECTED_SELLER_RECEIVES - SELLER_TX_FEE_TOLERANCE,
      `Seller should have received ~${EXPECTED_SELLER_RECEIVES.toFixed(4)} SOL (after fee, minus tx costs)`
    );

    // Buyer should have paid the SOL + transaction costs
    const BUYER_TX_FEE_TOLERANCE = 0.003; // Accounts for buyer's deposit tx fees
    expect(buyerDelta).to.be.lessThan(
      -SOL_PAYMENT + BUYER_TX_FEE_TOLERANCE,
      `Buyer should have paid ~${SOL_PAYMENT} SOL (plus tx fees)`
    );

    // Fee collector should have received the platform fee
    // NOTE: Fee collector only RECEIVES fees, doesn't pay tx fees, so minimal tolerance
    const FEE_COLLECTOR_TOLERANCE = 0.00001; // Small tolerance for RPC timing/precision
    expect(feeCollectorDelta).to.be.greaterThan(
      EXPECTED_FEE - FEE_COLLECTOR_TOLERANCE,
      `Fee collector should have received ~${EXPECTED_FEE.toFixed(4)} SOL platform fee`
    );

    console.log('   ✅ SOL payment and fee distribution verified\n');
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
    console.log('✅ NFT-for-NFT+SOL E2E TEST COMPLETE');
    console.log('   - Both NFTs successfully swapped');
    console.log(`   - Seller received: ${EXPECTED_SELLER_RECEIVES.toFixed(4)} SOL + NFT B`);
    console.log(`   - Buyer received: NFT A (paid ${SOL_PAYMENT} SOL)`);
    console.log(`   - Fee Collector received: ${EXPECTED_FEE.toFixed(4)} SOL`);
    console.log('='.repeat(80) + '\n');
  });
});

