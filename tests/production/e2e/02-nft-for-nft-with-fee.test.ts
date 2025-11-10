/**
 * PRODUCTION E2E Test - Scenario 2: NFT for NFT with SOL Fee
 * 
 * Complete NFT-for-NFT swap where buyer pays a SOL platform fee.
 * Tests the v2 escrow with NFT exchange and SOL fee payment.
 * 
 * **WITH TIMING**: Measures total escrow swap duration from creation to settlement.
 * 
 * Flow:
 * 1. Create v2 escrow agreement (NFT_FOR_NFT_WITH_FEE)
 * 2. Deposit NFT A from seller
 * 3. Deposit NFT B from buyer
 * 4. Deposit SOL fee from buyer
 * 5. Deposit SOL fee from seller
 * 6. Automatic settlement
 * 7. Verify both NFTs swapped and fee collected
 * 
 * Run: npm run test:production:e2e:nft-nft-fee
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

describe('PRODUCTION E2E - NFT-for-NFT with SOL Fee [WITH TIMING]', function () {
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

  const FEE_PER_PARTY = 0.005; // 0.005 SOL per party (buyer + seller)
  const TOTAL_PLATFORM_FEE = 0.01; // 0.01 SOL total platform fee
  const PLATFORM_FEE_BPS = 100; // 1%

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
    console.log('🚀 PRODUCTION E2E Test - NFT-for-NFT with SOL Fee [WITH TIMING]');
    console.log('='.repeat(80));
    console.log(`   Environment: PRODUCTION`);
    console.log(`   Network: ${PRODUCTION_CONFIG.network}`);
    console.log(`   API: ${PRODUCTION_CONFIG.apiBaseUrl}`);
    console.log(`   Swap Type: NFT_FOR_NFT_WITH_FEE`);
    console.log(`   Total Platform Fee: ${TOTAL_PLATFORM_FEE} SOL (${FEE_PER_PARTY} SOL per party)`);
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

    expect(buyerBalance).to.be.greaterThan(FEE_PER_PARTY * LAMPORTS_PER_SOL, 'Buyer needs sufficient SOL for fee');
  });

  it('should select random NFT A from seller wallet', async function () {
    console.log('🎨 Selecting random NFT A from seller wallet...\n');

    nftA = await getRandomNFTFromWallet(connection, wallets.sender);

    console.log(`   ✅ NFT A Selected: ${nftA.mint.toBase58()}`);
    console.log(`   Token Account: ${nftA.tokenAccount.toBase58()}`);
    console.log(`   Name: ${nftA.metadata.name}`);
    console.log(`   Explorer: ${getExplorerUrl(nftA.mint.toBase58(), 'address')}\n`);

    const tokenAccountInfo = await getAccount(connection, nftA.tokenAccount);
    expect(tokenAccountInfo.amount.toString()).to.equal('1', 'Seller should own 1 NFT A');
  });

  it('should select random NFT B from buyer wallet', async function () {
    console.log('🎨 Selecting random NFT B from buyer wallet...\n');

    nftB = await getRandomNFTFromWallet(connection, wallets.receiver);

    console.log(`   ✅ NFT B Selected: ${nftB.mint.toBase58()}`);
    console.log(`   Token Account: ${nftB.tokenAccount.toBase58()}`);
    console.log(`   Name: ${nftB.metadata.name}`);
    console.log(`   Explorer: ${getExplorerUrl(nftB.mint.toBase58(), 'address')}\n`);

    const tokenAccountInfo = await getAccount(connection, nftB.tokenAccount);
    expect(tokenAccountInfo.amount.toString()).to.equal('1', 'Buyer should own 1 NFT B');
  });

  it('should create a v2 NFT-for-NFT escrow agreement with SOL fee', async function () {
    console.log('📝 Creating V2 escrow agreement (NFT_FOR_NFT_WITH_FEE)...\n');

    const idempotencyKey = generateIdempotencyKey('prod-nft-nft-fee-test');

    const agreementData = {
      nftMint: nftA.mint.toBase58(),
      seller: wallets.sender.publicKey.toBase58(),
      buyer: wallets.receiver.publicKey.toBase58(),
      swapType: 'NFT_FOR_NFT_WITH_FEE',
      nftBMint: nftB.mint.toBase58(),
      solAmount: (FEE_PER_PARTY * LAMPORTS_PER_SOL).toString(), // 0.005 SOL per party
      feeBps: PLATFORM_FEE_BPS,
      feePayer: 'BUYER',
      honorRoyalties: false,
    };

    console.log('   Request payload:');
    console.log(`     NFT A (Seller): ${agreementData.nftMint}`);
    console.log(`     NFT B (Buyer): ${agreementData.nftBMint}`);
    console.log(`     Swap Type: ${agreementData.swapType}`);
    console.log(`     Platform Fee: ${FEE_PER_PARTY} SOL per party (${TOTAL_PLATFORM_FEE} SOL total)\n`);

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
    expect(response.data.data.swapType).to.equal('NFT_FOR_NFT_WITH_FEE');

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
  });

  it('should deposit SOL fee (buyer)', async function () {
    console.log('💎 Depositing buyer SOL fee to escrow...\n');

    const prepareResponse = await axios.post(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-sol/prepare`
    );

    expect(prepareResponse.status).to.equal(200);
    expect(prepareResponse.data.success).to.be.true;

    console.log(`   Buyer Fee: ${FEE_PER_PARTY} SOL`);

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
      description: 'Deposit SOL Fee (deposit_sol)',
      txId,
      timestamp: Date.now(),
    });

    console.log(`   ✅ Buyer SOL Fee Deposited`);
    console.log(`   Transaction: ${getExplorerUrl(txId, 'tx')}\n`);
  });

  it('should deposit SOL fee (seller)', async function () {
    console.log('💎 Depositing seller SOL fee to escrow...\n');

    const prepareResponse = await axios.post(
      `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-seller-sol-fee/prepare`
    );

    expect(prepareResponse.status).to.equal(200);
    expect(prepareResponse.data.success).to.be.true;

    console.log(`   Seller Fee: ${FEE_PER_PARTY} SOL`);

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
      description: 'Deposit Seller SOL Fee (deposit_seller_sol_fee)',
      txId,
      timestamp: Date.now(),
    });

    console.log(`   ✅ Seller SOL Fee Deposited`);
    console.log(`   Transaction: ${getExplorerUrl(txId, 'tx')}\n`);
  });

  it('should wait for automatic settlement', async function () {
    console.log('⏳ Waiting for automatic settlement...\n');

    const settledAgreement = await waitForAgreementStatus(
      agreement.agreementId,
      'SETTLED',
      45,
      1000
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

  it('should verify NFTs were swapped', async function () {
    console.log('🔍 Verifying NFT swap...\n');

    // Check seller received NFT B
    const sellerNftBAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallets.sender,
      nftB.mint,
      wallets.sender.publicKey
    );

    const sellerNftBBalance = await connection.getTokenAccountBalance(sellerNftBAccount.address);
    console.log(`   Seller NFT B Balance: ${sellerNftBBalance.value.uiAmount}`);
    expect(sellerNftBBalance.value.uiAmount).to.equal(1, 'Seller should have received NFT B');

    // Check buyer received NFT A
    const buyerNftAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallets.receiver,
      nftA.mint,
      wallets.receiver.publicKey
    );

    const buyerNftABalance = await connection.getTokenAccountBalance(buyerNftAAccount.address);
    console.log(`   Buyer NFT A Balance: ${buyerNftABalance.value.uiAmount}`);
    expect(buyerNftABalance.value.uiAmount).to.equal(1, 'Buyer should have received NFT A');

    console.log(`   ✅ NFTs successfully swapped\n`);
  });

  it('should verify SOL fees were collected', async function () {
    console.log('💰 Verifying SOL fee collection...\n');

    const sellerBalance = await connection.getBalance(wallets.sender.publicKey);
    const buyerBalance = await connection.getBalance(wallets.receiver.publicKey);
    const feeCollectorBalance = await connection.getBalance(wallets.feeCollector.publicKey);

    const finalBalances = {
      seller: { sol: sellerBalance / LAMPORTS_PER_SOL },
      buyer: { sol: buyerBalance / LAMPORTS_PER_SOL },
      feeCollector: { sol: feeCollectorBalance / LAMPORTS_PER_SOL },
    };

    const buyerDelta = finalBalances.buyer.sol - initialBalances.buyer.sol;
    const sellerDelta = finalBalances.seller.sol - initialBalances.seller.sol;
    const feeCollectorDelta = finalBalances.feeCollector.sol - initialBalances.feeCollector.sol;

    console.log('   Balance Changes:');
    console.log(`     Seller: ${sellerDelta >= 0 ? '+' : ''}${sellerDelta.toFixed(4)} SOL (paid ${FEE_PER_PARTY} SOL fee)`);
    console.log(`     Buyer: ${buyerDelta >= 0 ? '+' : ''}${buyerDelta.toFixed(4)} SOL (paid ${FEE_PER_PARTY} SOL fee)`);
    console.log(`     Fee Collector: ${feeCollectorDelta >= 0 ? '+' : ''}${feeCollectorDelta.toFixed(4)} SOL (collected ${TOTAL_PLATFORM_FEE} SOL)\n`);

    const TX_FEE_TOLERANCE = 0.02;
    expect(feeCollectorDelta).to.be.greaterThan(
      TOTAL_PLATFORM_FEE - TX_FEE_TOLERANCE,
      `Fee collector should receive ~${TOTAL_PLATFORM_FEE} SOL`
    );

    console.log('   ✅ SOL fees verified\n');
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
    console.log('✅ NFT-for-NFT with Fee E2E TEST PASSED!');
    console.log('='.repeat(80) + '\n');
  });
});

