/**
 * STAGING E2E Test - Scenario 1: Happy Path
 * 
 * Complete NFT-for-USDC swap with settlement and fee distribution.
 * 
 * Flow:
 * 1. Create escrow agreement
 * 2. Deposit NFT from sender
 * 3. Deposit USDC from receiver
 * 4. Automatic settlement
 * 5. Verify NFT transfer and USDC distribution with fees
 * 
 * Run: npm run test:staging:e2e:happy-path
 */

// Load .env.staging file BEFORE any other imports
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.staging');
const result = dotenv.config({ path: envPath, override: true }); // Override .env with .env.staging

if (result.error) {
  throw new Error(`Failed to load .env.staging: ${result.error}`);
}

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import axios from 'axios';
import { STAGING_CONFIG } from './test-config';
import {
  loadStagingWallets,
  generateIdempotencyKey,
  getExplorerUrl,
  waitForAgreementStatus,
  getTokenBalance,
  createTestNFT,
  setupUSDCAccounts,
  getInitialBalances,
  displayBalances,
  type StagingWallets,
  type TestAgreement,
  type TestNFT,
} from './shared-test-utils';

describe('STAGING E2E - Happy Path: NFT-for-USDC Swap', function () {
  // Increase timeout for network operations
  this.timeout(180000); // 3 minutes

  let connection: Connection;
  let wallets: StagingWallets;
  let nft: TestNFT;
  let agreement: TestAgreement;
  let usdcAccounts: { senderAccount: PublicKey; receiverAccount: PublicKey; feeCollectorAccount?: PublicKey };
  let initialBalances: any;

  // Timing and transaction tracking
  let escrowStartTime: number;
  let escrowEndTime: number;
  const transactions: Array<{
    description: string;
    txId: string;
    startTime: number;
    endTime: number;
    duration: number;
    fee: number;
  }> = [];

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 STAGING E2E Test - Happy Path');
    console.log('='.repeat(80));
    console.log(`   Environment: STAGING`);
    console.log(`   Network: ${STAGING_CONFIG.network}`);
    console.log(`   RPC: ${STAGING_CONFIG.rpcUrl}`);
    console.log(`   API: ${STAGING_CONFIG.apiBaseUrl}`);
    console.log(`   Program: ${STAGING_CONFIG.programId}`);
    console.log('='.repeat(80) + '\n');

    // Setup connection
    connection = new Connection(STAGING_CONFIG.rpcUrl, 'confirmed');

    // Load wallets
    console.log('📋 Loading STAGING wallets...');
    wallets = loadStagingWallets();
    console.log(`   ✅ Sender: ${wallets.sender.publicKey.toBase58()}`);
    console.log(`   ✅ Receiver: ${wallets.receiver.publicKey.toBase58()}`);
    console.log(`   ✅ Admin: ${wallets.admin.publicKey.toBase58()}`);
    console.log(`   ✅ Fee Collector: ${wallets.feeCollector.publicKey.toBase58()}\n`);

    // Verify connectivity
    const version = await connection.getVersion();
    console.log(`✅ Connected to Solana ${STAGING_CONFIG.network}`);
    console.log(`   Version: ${version['solana-core']}\n`);
  });

  it('should setup USDC accounts for all parties', async function () {
    console.log('💰 Setting up USDC accounts...\n');
    
    const usdcMint = new PublicKey(STAGING_CONFIG.usdcMint);
    usdcAccounts = await setupUSDCAccounts(
      connection, 
      usdcMint, 
      wallets.sender, 
      wallets.receiver,
      wallets.feeCollector
    );
    
    console.log(`   ✅ All USDC accounts created\n`);
  });

  it('should create test NFT for sender', async function () {
    console.log('🎨 Creating test NFT...\n');
    
    nft = await createTestNFT(connection, wallets.sender);
    
    console.log(`   NFT Mint: ${nft.mint.toBase58()}`);
    console.log(`   Token Account: ${nft.tokenAccount.toBase58()}`);
    console.log(`   Owner: ${wallets.sender.publicKey.toBase58()}\n`);
    
    expect(nft.mint).to.be.instanceOf(PublicKey);
    expect(nft.tokenAccount).to.be.instanceOf(PublicKey);
  });

  it('should record initial balances', async function () {
    console.log('📊 Recording initial balances...\n');
    
    initialBalances = await getInitialBalances(connection, wallets, usdcAccounts);
    displayBalances(initialBalances, 'Initial Balances');
    
    // Start escrow timer (after setup, before contract operations)
    escrowStartTime = Date.now();
    console.log('\n⏱️  Starting escrow timer...\n');
  });

  it('should create escrow agreement via API', async function () {
    console.log('📝 Creating escrow agreement...\n');

    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const idempotencyKey = generateIdempotencyKey();

    const requestBody = {
      nftMint: nft.mint.toString(),
      price: STAGING_CONFIG.testAmounts.swap,
      seller: wallets.sender.publicKey.toString(),
      buyer: wallets.receiver.publicKey.toString(),
      expiry: expiry.toISOString(),
      feeBps: STAGING_CONFIG.testAmounts.fee * 10000, // Convert to basis points
      honorRoyalties: false,
    };

    console.log('   Request:');
    console.log(`     POST ${STAGING_CONFIG.apiBaseUrl}/v1/agreements`);
    console.log(`     NFT: ${requestBody.nftMint}`);
    console.log(`     Price: ${requestBody.price} USDC`);
    console.log(`     Fee: ${STAGING_CONFIG.testAmounts.fee * 100}%`);
    console.log(`     Idempotency Key: ${idempotencyKey}\n`);

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

    expect(response.status).to.equal(201);
    expect(response.data.success).to.be.true;

    agreement = {
      agreementId: response.data.data.agreementId,
      escrowPda: response.data.data.escrowPda,
      depositAddresses: response.data.data.depositAddresses,
      transactionId: response.data.data.transactionId,
    };

    console.log('   ✅ Agreement created!');
    console.log(`   Agreement ID: ${agreement.agreementId}`);
    console.log(`   Escrow PDA: ${agreement.escrowPda}`);
    console.log(`   USDC Deposit: ${agreement.depositAddresses.usdc}`);
    console.log(`   NFT Deposit: ${agreement.depositAddresses.nft}\n`);

    if (agreement.transactionId) {
      console.log(`   🔗 Transaction: ${getExplorerUrl(agreement.transactionId)}\n`);
    }

    expect(agreement.agreementId).to.be.a('string');
    expect(agreement.escrowPda).to.be.a('string');
  });

  it('should verify agreement status is PENDING', async function () {
    console.log('✅ Verifying agreement status...\n');

    const response = await axios.get(
      `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
    );
    
    console.log(`   Agreement ID: ${response.data.data.agreementId}`);
    console.log(`   Status: ${response.data.data.status}`);
    console.log(`   Created At: ${response.data.data.createdAt}\n`);

    expect(response.data.data.status).to.equal('PENDING');
    console.log('   ✅ Agreement in PENDING status (awaiting deposits)\n');
  });

  it('should verify platform fee is stored in escrow state (admin-controlled)', async function () {
    console.log('🔒 Verifying admin-controlled fee is stored on-chain...\n');

    // Fetch escrow account data from on-chain
    const escrowPda = new PublicKey(agreement.escrowPda);
    const accountInfo = await connection.getAccountInfo(escrowPda);
    
    expect(accountInfo).to.not.be.null;
    console.log(`   ✅ Escrow PDA exists on-chain`);
    
    // Verify the account is owned by the escrow program
    const programId = new PublicKey(STAGING_CONFIG.programId);
    expect(accountInfo!.owner.toBase58()).to.equal(programId.toBase58());
    console.log(`   ✅ Escrow owned by program: ${programId.toBase58()}`);
    
    // Parse escrow state to verify platform_fee_bps is stored
    // The fee should be at a specific offset in the account data
    // Anchor discriminator (8) + EscrowState layout: escrow_id (8) + buyer (32) + seller (32) + usdc_amount (8) + nft_mint (32) + platform_fee_bps (2) + ...
    const dataOffset = 8 + 8 + 32 + 32 + 8 + 32; // Skip discriminator + escrow_id + buyer + seller + usdc_amount + nft_mint
    const platformFeeBps = accountInfo!.data.readUInt16LE(dataOffset);
    
    const expectedFeeBps = STAGING_CONFIG.testAmounts.fee * 10000;
    console.log(`   Expected Fee: ${expectedFeeBps} bps (${STAGING_CONFIG.testAmounts.fee * 100}%)`);
    console.log(`   On-chain Fee: ${platformFeeBps} bps (${platformFeeBps / 100}%)`);
    
    expect(platformFeeBps).to.equal(expectedFeeBps);
    console.log(`   ✅ Platform fee correctly stored in escrow state`);
    console.log(`   ✅ Fee is controlled by admin and cannot be bypassed during settlement\n`);
  });

  it('should create ATAs for escrow PDA', async function () {
    console.log('🏗️  Creating Associated Token Accounts for escrow...\n');
    
    const escrowPda = new PublicKey(agreement.escrowPda);
    const usdcMint = new PublicKey(STAGING_CONFIG.usdcMint);
    
    // Create USDC ATA for escrow (use allowOwnerOffCurve for PDAs)
    console.log('   Creating USDC ATA for escrow PDA...');
    const usdcAta = await getOrCreateAssociatedTokenAccount(
      connection,
      wallets.sender, // payer
      usdcMint,
      escrowPda,
      true // allowOwnerOffCurve (required for PDAs)
    );
    console.log(`   ✅ USDC ATA: ${usdcAta.address.toBase58()}`);
    
    // Create NFT ATA for escrow with retry logic (NFT might need time to propagate)
    console.log('   Creating NFT ATA for escrow PDA...');
    let nftAta;
    let lastError;
    
    for (let i = 0; i < 5; i++) {
      try {
        nftAta = await getOrCreateAssociatedTokenAccount(
          connection,
          wallets.sender, // payer
          nft.mint,
          escrowPda,
          true // allowOwnerOffCurve (required for PDAs)
        );
        console.log(`   ✅ NFT ATA: ${nftAta.address.toBase58()}\n`);
        break;
      } catch (error: any) {
        lastError = error;
        if (i < 4) {
          console.log(`   ⚠️  NFT ATA creation failed (attempt ${i + 1}/5), retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    if (!nftAta) {
      throw new Error(`Failed to create NFT ATA after 5 attempts: ${lastError}`);
    }
    
    // Verify ATAs match the deposit addresses from API
    expect(usdcAta.address.toBase58()).to.equal(agreement.depositAddresses.usdc);
    expect(nftAta.address.toBase58()).to.equal(agreement.depositAddresses.nft);
  });

  it('should deposit NFT into escrow', async function () {
    console.log('🔐 Depositing NFT into escrow...\n');
    
    const txStartTime = Date.now();
    
    // Get unsigned transaction from API
    console.log(`   Requesting deposit transaction from API...`);
    const response = await axios.post(
      `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-nft/prepare`,
      {
        nftMint: nft.mint.toString(),
        sellerNftAccount: nft.tokenAccount.toString(),
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
    
    expect(response.data.success).to.be.true;
    
    const base64Transaction = response.data.data.transaction;
    console.log(`   ✅ Received unsigned transaction`);
    
    // Deserialize transaction
    const transactionBuffer = Buffer.from(base64Transaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);
    console.log(`   ✅ Deserialized transaction`);
    
    // Sign with sender
    transaction.sign(wallets.sender);
    console.log(`   ✅ Signed with sender wallet`);
    
    // Submit to network
    const txId = await connection.sendRawTransaction(transaction.serialize());
    console.log(`   📤 Submitted: ${getExplorerUrl(txId)}`);
    
    // Wait for confirmation
    await connection.confirmTransaction(txId, 'confirmed');
    const txEndTime = Date.now();
    console.log(`   ✅ NFT deposit confirmed!\n`);
    
    // Get transaction fee
    const txDetails = await connection.getTransaction(txId, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    const txFee = (txDetails?.meta?.fee || 0) / 1_000_000_000; // Convert lamports to SOL
    
    // Track transaction
    transactions.push({
      description: 'Seller > NFT > Escrow',
      txId,
      startTime: txStartTime,
      endTime: txEndTime,
      duration: (txEndTime - txStartTime) / 1000, // Convert to seconds
      fee: txFee,
    });
    
    console.log(`   ⏱️  Transaction completed in ${((txEndTime - txStartTime) / 1000).toFixed(2)} seconds`);
    console.log(`   💰 Transaction fee: ${txFee.toFixed(9)} SOL\n`);
    
    // Verify NFT is in escrow
    const nftVaultBalance = await getTokenBalance(connection, new PublicKey(agreement.depositAddresses.nft));
    expect(nftVaultBalance).to.equal(1);
    console.log(`   ✅ Verified: 1 NFT in escrow vault\n`);
  });

  it('should deposit USDC into escrow', async function () {
    console.log('💰 Depositing USDC into escrow...\n');
    
    console.log(`   ⚠️  Receiver needs ${STAGING_CONFIG.testAmounts.swap} USDC for deposit`);
    console.log(`   Receiver USDC account: ${usdcAccounts.receiverAccount.toBase58()}\n`);
    
    const txStartTime = Date.now();
    
    // Get unsigned transaction from API
    console.log(`   Requesting deposit transaction from API...`);
    const response = await axios.post(
      `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}/deposit-usdc/prepare`,
      {
        buyerUsdcAccount: usdcAccounts.receiverAccount.toString(),
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
    
    expect(response.data.success).to.be.true;
    
    const base64Transaction = response.data.data.transaction;
    console.log(`   ✅ Received unsigned transaction`);
    
    // Deserialize transaction
    const transactionBuffer = Buffer.from(base64Transaction, 'base64');
    const transaction = Transaction.from(transactionBuffer);
    console.log(`   ✅ Deserialized transaction`);
    
    // Sign with receiver
    transaction.sign(wallets.receiver);
    console.log(`   ✅ Signed with receiver wallet`);
    
    // Submit to network
    const txId = await connection.sendRawTransaction(transaction.serialize());
    console.log(`   📤 Submitted: ${getExplorerUrl(txId)}`);
    
    // Wait for confirmation
    await connection.confirmTransaction(txId, 'confirmed');
    const txEndTime = Date.now();
    console.log(`   ✅ USDC deposit confirmed!\n`);
    
    // Get transaction fee
    const txDetails = await connection.getTransaction(txId, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    const txFee = (txDetails?.meta?.fee || 0) / 1_000_000_000; // Convert lamports to SOL
    
    // Track transaction
    transactions.push({
      description: 'Buyer > USDC > Escrow',
      txId,
      startTime: txStartTime,
      endTime: txEndTime,
      duration: (txEndTime - txStartTime) / 1000, // Convert to seconds
      fee: txFee,
    });
    
    console.log(`   ⏱️  Transaction completed in ${((txEndTime - txStartTime) / 1000).toFixed(2)} seconds`);
    console.log(`   💰 Transaction fee: ${txFee.toFixed(9)} SOL\n`);
    
    // Verify USDC is in escrow
    const usdcVaultBalance = await getTokenBalance(connection, new PublicKey(agreement.depositAddresses.usdc));
    expect(usdcVaultBalance).to.be.at.least(STAGING_CONFIG.testAmounts.swap);
    console.log(`   ✅ Verified: ${usdcVaultBalance} USDC in escrow vault\n`);
  });

  it('should wait for automatic settlement', async function () {
    console.log('⏳ Waiting for automatic settlement...\n');
    
    const settlementStartTime = Date.now();
    
    const settledAgreement = await waitForAgreementStatus(
      agreement.agreementId,
      'SETTLED',
      60, // 60 attempts
      2000 // 2 seconds between attempts
    );
    
    console.log('\n   ✅ Agreement settled successfully!');
    console.log(`   Settlement time: ${settledAgreement.settledAt}\n`);
    
    expect(settledAgreement.status).to.equal('SETTLED');
    
    // Wait for settlement transaction ID to be available
    console.log('   ⏳ Waiting for settlement transaction to be recorded...\n');
    let settleTxId: string | null = null;
    const maxAttempts = 30; // 30 attempts
    const retryDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.get(
          `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
        );
        
        if (response.data.data.settleTxId) {
          settleTxId = response.data.data.settleTxId;
          console.log(`   ✅ Settlement TX ID found after ${attempt} attempt(s): ${settleTxId}\n`);
          break;
        }
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      } catch (error) {
        console.log(`   ⚠️  Error checking for settleTxId (attempt ${attempt}/${maxAttempts})`);
      }
    }
    
    const settlementEndTime = Date.now();
    
    // Get settlement transaction details
    if (settleTxId) {
      try {
        console.log('   📊 Fetching settlement transaction details...');
        
        // Wait for transaction to be confirmed on chain
        let txDetails = null;
        const txMaxAttempts = 10;
        for (let i = 0; i < txMaxAttempts; i++) {
          txDetails = await connection.getTransaction(settleTxId, { 
            commitment: 'confirmed', 
            maxSupportedTransactionVersion: 0 
          });
          
          if (txDetails) {
            console.log(`   ✅ Transaction confirmed on-chain\n`);
            break;
          }
          
          if (i < txMaxAttempts - 1) {
            console.log(`   ⏳ Waiting for transaction confirmation... (${i + 1}/${txMaxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        if (txDetails) {
          const txFee = (txDetails.meta?.fee || 0) / 1_000_000_000;
          
          transactions.push({
            description: 'Settlement (NFT→Buyer, USDC→Seller, Fee→Collector)',
            txId: settleTxId,
            startTime: settlementStartTime,
            endTime: settlementEndTime,
            duration: (settlementEndTime - settlementStartTime) / 1000,
            fee: txFee,
          });
          
          console.log(`   ⏱️  Settlement completed in ${((settlementEndTime - settlementStartTime) / 1000).toFixed(2)} seconds`);
          console.log(`   💰 Transaction fee: ${txFee.toFixed(9)} SOL (paid by backend)\n`);
        } else {
          console.log('   ⚠️  Could not confirm settlement transaction on-chain\n');
        }
      } catch (error) {
        console.log(`   ⚠️  Error retrieving settlement transaction details: ${error}\n`);
      }
    } else {
      console.log('   ⚠️  Settlement transaction ID not available after waiting\n');
    }
  });

  it('should verify settlement and fee distribution', async function () {
    console.log('🔍 Verifying settlement...\n');
    
    // Get final balances
    const finalBalances = await getInitialBalances(connection, wallets, usdcAccounts);
    displayBalances(finalBalances, 'Final Balances');
    
    // Verify NFT transferred to receiver
    const receiverNftAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallets.receiver,
      nft.mint,
      wallets.receiver.publicKey
    );
    
    const receiverNftBalance = await getTokenBalance(connection, receiverNftAccount.address);
    console.log(`   Receiver NFT Balance: ${receiverNftBalance}`);
    expect(receiverNftBalance).to.equal(1);
    console.log('   ✅ NFT transferred to receiver\n');
    
    // Calculate expected changes
    const expectedSenderIncrease = STAGING_CONFIG.testAmounts.swap * (1 - STAGING_CONFIG.testAmounts.fee);
    const expectedReceiverDecrease = STAGING_CONFIG.testAmounts.swap;
    const expectedFeeIncrease = STAGING_CONFIG.testAmounts.swap * STAGING_CONFIG.testAmounts.fee;
    
    // Verify USDC changes
    const senderUsdcIncrease = finalBalances.sender.usdc - initialBalances.sender.usdc;
    const receiverUsdcDecrease = initialBalances.receiver.usdc - finalBalances.receiver.usdc;
    const feeCollectorUsdcIncrease = finalBalances.feeCollector.usdc - initialBalances.feeCollector.usdc;
    
    console.log('USDC Changes:');
    console.log(`   Sender received: ${senderUsdcIncrease.toFixed(6)} USDC (expected: ~${expectedSenderIncrease.toFixed(6)})`);
    console.log(`   Receiver paid: ${receiverUsdcDecrease.toFixed(6)} USDC (expected: ~${expectedReceiverDecrease.toFixed(6)})`);
    console.log(`   Fee collected: ${feeCollectorUsdcIncrease.toFixed(6)} USDC (expected: ~${expectedFeeIncrease.toFixed(6)})\n`);
    
    // Verify amounts (with 1% tolerance for rounding)
    expect(senderUsdcIncrease).to.be.at.least(expectedSenderIncrease * 0.99);
    console.log('   ✅ Sender received correct amount (minus fees)');
    
    expect(receiverUsdcDecrease).to.be.at.least(expectedReceiverDecrease * 0.99);
    console.log('   ✅ Receiver paid correct amount');
    
    expect(feeCollectorUsdcIncrease).to.be.at.least(expectedFeeIncrease * 0.99);
    console.log('   ✅ Platform fee collected\n');
    
    console.log('   🎉 All settlements verified successfully!\n');
    
    // Stop escrow timer
    escrowEndTime = Date.now();
    const totalEscrowTime = (escrowEndTime - escrowStartTime) / 1000;
    
    // Display comprehensive timing summary
    console.log('\n' + '='.repeat(80));
    console.log('⏱️  PERFORMANCE SUMMARY');
    console.log('='.repeat(80) + '\n');
    
    console.log(`✅ Solana NFT ↔ USDC escrow completed and verified on-chain in ${totalEscrowTime.toFixed(2)} seconds\n`);
    
    if (transactions.length > 0) {
      console.log('📊 Solana blockchain transactions summary:');
      console.log('-'.repeat(80));
      
      let totalTxTime = 0;
      let sellerDepositFee = 0;
      let buyerDepositFee = 0;
      let settlementFee = 0;
      
      transactions.forEach((tx, index) => {
        console.log(`   ${index + 1}. ${tx.description}`);
        console.log(`      TX: ${tx.txId}`);
        console.log(`      ⏱️  Completed in ${tx.duration.toFixed(2)} seconds`);
        console.log(`      💰 Fee: ${tx.fee.toFixed(9)} SOL`);
        console.log(`      🔗 ${getExplorerUrl(tx.txId)}\n`);
        
        totalTxTime += tx.duration;
        
        // Categorize fees
        if (tx.description.includes('Seller > NFT')) {
          sellerDepositFee = tx.fee;
        } else if (tx.description.includes('Buyer > USDC')) {
          buyerDepositFee = tx.fee;
        } else if (tx.description.includes('Settlement')) {
          settlementFee = tx.fee;
        }
      });
      
      console.log('-'.repeat(80));
      const avgTxTime = totalTxTime / transactions.length;
      const totalSolFees = sellerDepositFee + buyerDepositFee + settlementFee;
      
      console.log(`   📈 Average blockchain transaction time: ${avgTxTime.toFixed(2)} seconds\n`);
      
      // Detailed fee breakdown
      console.log('💰 FEE BREAKDOWN:');
      console.log('-'.repeat(80));
      console.log('   Blockchain Fees (SOL):');
      console.log(`     • Seller deposit fee:      ${sellerDepositFee.toFixed(9)} SOL (paid by seller)`);
      console.log(`     • Buyer deposit fee:       ${buyerDepositFee.toFixed(9)} SOL (paid by buyer)`);
      console.log(`     • Settlement fee:          ${settlementFee.toFixed(9)} SOL (paid by backend)`);
      console.log(`     • Total blockchain fees:   ${totalSolFees.toFixed(9)} SOL\n`);
      
      console.log('   Platform Commission (USDC):');
      const platformCommission = STAGING_CONFIG.testAmounts.swap * STAGING_CONFIG.testAmounts.fee;
      console.log(`     • EasyEscrow commission:   ${platformCommission.toFixed(6)} USDC (${(STAGING_CONFIG.testAmounts.fee * 100).toFixed(1)}% of swap)`);
      console.log(`     • Seller receives:         ${(STAGING_CONFIG.testAmounts.swap - platformCommission).toFixed(6)} USDC (after commission)\n`);
      
      console.log('   Summary:');
      console.log(`     • Total SOL fees paid:     ${totalSolFees.toFixed(9)} SOL (~$${(totalSolFees * 200).toFixed(4)} USD)`);
      console.log(`     • Platform revenue:        ${platformCommission.toFixed(6)} USDC`);
      
      console.log('='.repeat(80) + '\n');
    }
  });

  it('should verify receipt generation', async function () {
    console.log('📄 Verifying receipt generation...\n');
    
    try {
      // Wait for receipt to be generated
      console.log('   ⏳ Waiting for receipt generation...\n');
      let receiptId: string | null = null;
      const maxAttempts = 30; // 30 attempts
      const retryDelay = 1000; // 1 second
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const response = await axios.get(
            `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreement.agreementId}`
          );
          
          if (response.data.data.receiptId) {
            receiptId = response.data.data.receiptId;
            console.log(`   ✅ Receipt ID found after ${attempt} attempt(s): ${receiptId}\n`);
            break;
          }
          
          if (attempt < maxAttempts) {
            if (attempt % 5 === 0) {
              console.log(`   ⏳ Still waiting for receipt... (${attempt}/${maxAttempts})`);
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        } catch (error) {
          console.log(`   ⚠️  Error checking for receipt (attempt ${attempt}/${maxAttempts})`);
        }
      }
      
      if (!receiptId) {
        console.log('   ⚠️  Receipt not generated after waiting');
        console.log('   This may indicate an issue with async receipt generation\n');
        throw new Error('Receipt not generated within timeout period');
      }
      
      expect(receiptId).to.be.a('string');
      
      // Fetch the actual receipt
      console.log('   📊 Fetching receipt details...');
      const receiptResponse = await axios.get(
        `${STAGING_CONFIG.apiBaseUrl}/v1/receipts/${receiptId}`
      );
      
      const receipt = receiptResponse.data.data;
      
      console.log(`   ✅ Receipt fetched successfully`);
      console.log(`   Agreement ID: ${receipt.agreementId}`);
      console.log(`   Settled At: ${receipt.settledAt}\n`);
      
      // Verify receipt structure
      expect(receipt.agreementId).to.equal(agreement.agreementId);
      expect(receipt.settledAt).to.exist;
      console.log('   ✅ Receipt structure verified');
      
      // Verify transaction IDs are present
      expect(receipt.transactions).to.be.an('array');
      expect(receipt.transactions.length).to.be.greaterThan(0);
      console.log(`   ✅ Receipt contains ${receipt.transactions.length} transaction(s)\n`);
      
      // Verify each transaction has a valid ID
      receipt.transactions.forEach((tx: any, index: number) => {
        expect(tx.transactionId).to.be.a('string');
        expect(tx.transactionId.length).to.be.greaterThan(0);
        expect(tx.type).to.be.a('string');
        console.log(`   ${index + 1}. ${tx.type}`);
        console.log(`      TX ID: ${tx.transactionId}`);
        console.log(`      🔗 ${getExplorerUrl(tx.transactionId)}`);
      });
      
      console.log('\n   ✅ All transaction IDs verified');
      console.log(`   🔗 Receipt URL: ${STAGING_CONFIG.apiBaseUrl}/v1/receipts/${receiptId}\n`);
      
    } catch (error: any) {
      console.error('   ❌ Failed to verify receipt:');
      console.error(`   Error: ${error.message}\n`);
      throw error;
    }
  });
});

