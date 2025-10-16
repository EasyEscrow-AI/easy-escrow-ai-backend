/**
 * E2E Devnet Test: NFT-to-USDC Escrow Swap with Fee Collection
 * 
 * Tests complete escrow swap flow with pre-existing assets:
 * - Sender has NFT, wants USDC
 * - Receiver has USDC, wants NFT
 * - Fee collector receives 1% fee in USDC
 * 
 * Test Structure:
 * 1. PREREQUISITES: Asset Setup (USDC mint, token accounts, NFT creation)
 * 2. ESCROW SWAP: Actual escrow flow using pre-existing assets
 *    - Create escrow agreement (with existing nftMint/usdcMint)
 *    - Deposit assets
 *    - Execute swap
 *    - Verify results
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { expect } from 'chai';
import axios from 'axios';
import {transfer, getAccount, createTransferInstruction, getOrCreateAssociatedTokenAccount} from '@solana/spl-token';
import {
  loadDevnetWallets,
  verifyWalletBalances,
  displayWalletInfo,
  getExplorerUrl,
  DevnetWallets,
  WalletBalances,
} from '../helpers/devnet-wallet-manager';
import {
  setupDevnetTokens,
  checkTokenBalances,
  displayTokenBalances,
  TokenSetupConfig,
  TokenBalances,
  getTokenBalance,
} from '../helpers/devnet-token-setup';
import {
  createTestNFT,
  displayNFTInfo,
  verifyNFTOwnership,
  NFTDetails,
} from '../helpers/devnet-nft-setup';

// Devnet RPC endpoint
const DEVNET_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// API endpoint (use localhost if backend is running locally)
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Test constants
const SWAP_AMOUNT_USDC = 0.1; // 0.1 USDC for swap
const FEE_PERCENTAGE = 0.01; // 1% fee
const EXPECTED_SENDER_USDC = SWAP_AMOUNT_USDC * (1 - FEE_PERCENTAGE); // 0.099 USDC
const EXPECTED_FEE_USDC = SWAP_AMOUNT_USDC * FEE_PERCENTAGE; // 0.001 USDC

describe('E2E: NFT-USDC Escrow Swap on Devnet', function () {
  // Increase timeout for devnet operations
  this.timeout(300000); // 5 minutes

  let connection: Connection;
  let wallets: DevnetWallets;
  let tokenConfig: TokenSetupConfig;
  let nft: NFTDetails;

  let initialBalances: {
    sol: WalletBalances;
    usdc: TokenBalances;
  };

  // Escrow timing (for actual swap performance)
  let escrowStartTime: number;
  let escrowEndTime: number;

  // Agreement data
  let agreementId: string;
  let escrowPda: string;
  let depositAddresses: { usdc: string; nft: string };

  before(async function () {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 E2E Test: NFT-USDC Escrow Swap on Solana Devnet');
    console.log('='.repeat(60) + '\n');
  });

  describe('1. Prerequisites: Asset Setup (Test Fixtures)', function () {
    it('should connect to Solana devnet', async function () {
      console.log('📡 Connecting to Solana devnet...\n');

      connection = new Connection(DEVNET_RPC_URL, 'confirmed');

      // Verify connection
      const version = await connection.getVersion();
      console.log(`✅ Connected to Solana devnet`);
      console.log(`   RPC: ${DEVNET_RPC_URL}`);
      console.log(`   Version: ${JSON.stringify(version)}\n`);

      expect(connection).to.exist;
      expect(version).to.have.property('solana-core');
    });

    it('should load and verify 4 devnet wallets with sufficient SOL', async function () {
      console.log('🔑 Loading devnet wallets...\n');

      // Load wallets (generates new ones if not found)
      wallets = await loadDevnetWallets();
      displayWalletInfo(wallets);

      // Verify all wallets have minimum SOL balance
      const minSOL = 0.05;
      const balances = await verifyWalletBalances(connection, wallets, minSOL);

      expect(wallets.sender).to.exist;
      expect(wallets.receiver).to.exist;
      expect(wallets.admin).to.exist;
      expect(wallets.feeCollector).to.exist;
      expect(balances.sender).to.be.at.least(minSOL);
      expect(balances.receiver).to.be.at.least(minSOL);
      expect(balances.admin).to.be.at.least(minSOL);
      expect(balances.feeCollector).to.be.at.least(minSOL);

      console.log(`✅ All wallets verified with minimum ${minSOL} SOL\n`);
    });

    it('should create USDC mint and token accounts (test fixture)', async function () {
      console.log('🪙  Setting up USDC mint and token accounts (test fixture)...\n');

      // Setup tokens: creates mint, token accounts, and mints initial USDC
      tokenConfig = await setupDevnetTokens(
        connection,
        wallets,
        0.5 // Mint 0.5 USDC to receiver for testing
      );

      expect(tokenConfig).to.exist;
      expect(tokenConfig.usdcMint).to.be.instanceOf(PublicKey);
      expect(tokenConfig.tokenAccounts.sender).to.be.instanceOf(PublicKey);
      expect(tokenConfig.tokenAccounts.receiver).to.be.instanceOf(PublicKey);
      expect(tokenConfig.tokenAccounts.feeCollector).to.be.instanceOf(PublicKey);

      // Verify receiver has USDC
      const receiverBalance = await getTokenBalance(
        connection,
        tokenConfig.tokenAccounts.receiver
      );

      console.log(`✅ USDC mint and token accounts created`);
      console.log(`   Mint: ${tokenConfig.usdcMint.toString()}`);
      console.log(`   Receiver balance: ${receiverBalance.toFixed(6)} USDC\n`);

      expect(receiverBalance).to.be.at.least(SWAP_AMOUNT_USDC);
    });

    it('should create test NFT in sender wallet (test fixture)', async function () {
      console.log('🎨 Creating test NFT in sender wallet (test fixture)...\n');

      nft = await createTestNFT(connection, wallets.sender, {
        name: 'E2E Test NFT',
        symbol: 'E2ENFT',
        description: 'NFT for E2E devnet swap testing',
      });

      displayNFTInfo(nft);

      expect(nft).to.exist;
      expect(nft.mint).to.be.instanceOf(PublicKey);
      expect(nft.owner.toString()).to.equal(wallets.sender.publicKey.toString());

      // Verify ownership
      const isOwned = await verifyNFTOwnership(
        connection,
        nft.mint,
        wallets.sender.publicKey,
        wallets.sender
      );

      expect(isOwned).to.be.true;
      console.log('✅ NFT ownership verified\n');
    });

    it('should verify all assets exist and are ready', async function () {
      console.log('✅ Verifying all assets exist and are ready...\n');

      const solBalances = await verifyWalletBalances(connection, wallets, 0);
      const usdcBalances = await checkTokenBalances(connection, tokenConfig.tokenAccounts);

      initialBalances = {
        sol: solBalances,
        usdc: usdcBalances,
      };

      console.log('Initial SOL Balances:');
      console.log(`  Sender:       ${solBalances.sender.toFixed(4)} SOL`);
      console.log(`  Receiver:     ${solBalances.receiver.toFixed(4)} SOL`);
      console.log(`  Admin:        ${solBalances.admin.toFixed(4)} SOL`);
      console.log(`  FeeCollector: ${solBalances.feeCollector.toFixed(4)} SOL\n`);

      console.log('Initial USDC Balances:');
      console.log(`  Sender:       ${usdcBalances.sender.toFixed(6)} USDC`);
      console.log(`  Receiver:     ${usdcBalances.receiver.toFixed(6)} USDC`);
      console.log(`  Admin:        ${usdcBalances.admin.toFixed(6)} USDC`);
      console.log(`  FeeCollector: ${usdcBalances.feeCollector.toFixed(6)} USDC\n`);

      expect(initialBalances).to.exist;
    });
  });

  describe('2. Escrow Swap Flow (Using Pre-Existing Assets)', function () {
    
    before(async function () {
      console.log('\n' + '='.repeat(60));
      console.log('🔄 Starting Escrow Swap Flow');
      console.log('='.repeat(60) + '\n');
      
      // Start timing the escrow swap
      escrowStartTime = Date.now();
      console.log('⏱️  Escrow timer started\n');
      
      console.log('📊 Recording initial balances...\n');

      const solBalances = await verifyWalletBalances(connection, wallets, 0);
      const usdcBalances = await checkTokenBalances(connection, tokenConfig.tokenAccounts);

      initialBalances = {
        sol: solBalances,
        usdc: usdcBalances,
      };

      console.log('Initial SOL Balances:');
      console.log(`  Sender:       ${solBalances.sender.toFixed(4)} SOL`);
      console.log(`  Receiver:     ${solBalances.receiver.toFixed(4)} SOL`);
      console.log(`  Admin:        ${solBalances.admin.toFixed(4)} SOL`);
      console.log(`  FeeCollector: ${solBalances.feeCollector.toFixed(4)} SOL\n`);

      console.log('Initial USDC Balances:');
      console.log(`  Sender:       ${usdcBalances.sender.toFixed(6)} USDC`);
      console.log(`  Receiver:     ${usdcBalances.receiver.toFixed(6)} USDC`);
      console.log(`  Admin:        ${usdcBalances.admin.toFixed(6)} USDC`);
      console.log(`  FeeCollector: ${usdcBalances.feeCollector.toFixed(6)} USDC\n`);
    });

    describe('2.1. Escrow Creation (via API)', function () {
    it('should create escrow agreement via API', async function () {
      console.log('📝 Creating escrow agreement...\n');

      // Calculate expiry (1 hour from now)
      const expiry = new Date(Date.now() + 60 * 60 * 1000);

      const requestBody = {
        nftMint: nft.mint.toString(),
        price: SWAP_AMOUNT_USDC,
        seller: wallets.sender.publicKey.toString(),
        buyer: wallets.receiver.publicKey.toString(),
        expiry: expiry.toISOString(),
        feeBps: FEE_PERCENTAGE * 10000, // Convert to basis points (1% = 100 bps)
        honorRoyalties: false,
      };

      console.log('   Request:');
      console.log(`     POST ${API_BASE_URL}/v1/agreements`);
      console.log('     Body:');
      console.log(`       nft: ${requestBody.nftMint} ← PRE-EXISTING`);
      console.log(`       price: ${requestBody.price} USDC`);
      console.log(`       seller: ${requestBody.seller}`);
      console.log(`       buyer: ${requestBody.buyer}`);
      console.log(`       expiry: ${requestBody.expiry}`);
      console.log(`       feeBps: ${requestBody.feeBps} (${FEE_PERCENTAGE * 100}%)`);
      console.log(`       honorRoyalties: ${requestBody.honorRoyalties}\n`);

      try {
        const response = await axios.post(
          `${API_BASE_URL}/v1/agreements`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              'idempotency-key': `e2e-test-${Date.now()}`,
            },
          }
        );

        expect(response.status).to.equal(201);
        expect(response.data.success).to.be.true;
        expect(response.data.data).to.exist;

        agreementId = response.data.data.agreementId;
        escrowPda = response.data.data.escrowPda;
        depositAddresses = response.data.data.depositAddresses;

        console.log('   ✅ Agreement created successfully!');
        console.log(`   Agreement ID: ${agreementId}`);
        console.log(`   Escrow PDA: ${escrowPda}`);
        console.log(`   USDC Deposit Address: ${depositAddresses.usdc}`);
        console.log(`   NFT Deposit Address: ${depositAddresses.nft}\n`);

        expect(agreementId).to.be.a('string');
        expect(escrowPda).to.be.a('string');
        expect(depositAddresses.usdc).to.be.a('string');
        expect(depositAddresses.nft).to.be.a('string');
      } catch (error: any) {
        console.error('   ❌ Failed to create agreement:');
        console.error(`   Error: ${error.message}`);
        if (error.response) {
          console.error(`   Status: ${error.response.status}`);
          console.error(`   Response:`, error.response.data);
        }
        throw error;
      }
    });

    it('should create ATAs for escrow PDA (required for token deposits)', async function () {
      console.log('🏗️  Creating Associated Token Accounts for escrow...\n');

      try {
        // The deposit addresses are ATAs that need to exist before we can transfer to them
        // In production, the on-chain program would create these
        // For testing, we need to create them manually

        console.log('   📋 Debug Info:');
        console.log(`   Escrow PDA: ${escrowPda}`);
        console.log(`   USDC Mint: ${tokenConfig.usdcMint.toString()}`);
        console.log(`   NFT Mint: ${nft.mint.toString()}`);
        console.log(`   Expected USDC ATA: ${depositAddresses.usdc}`);
        console.log(`   Expected NFT ATA: ${depositAddresses.nft}`);
        console.log(`   Payer: ${wallets.sender.publicKey.toString()}\n`);

        const escrowPdaPubkey = new PublicKey(escrowPda);

        // Create USDC ATA for escrow PDA
        // Note: We use the sender's wallet to pay for the ATA creation
        console.log('   🔨 Creating USDC ATA for escrow PDA...');
        console.log(`   - Owner (PDA): ${escrowPdaPubkey.toString()}`);
        console.log(`   - Mint: ${tokenConfig.usdcMint.toString()}`);
        console.log(`   - Payer: ${wallets.sender.publicKey.toString()}\n`);

        const usdcAta = await getOrCreateAssociatedTokenAccount(
          connection,
          wallets.sender, // Payer (pays for account creation)
          tokenConfig.usdcMint, // Mint
          escrowPdaPubkey, // Owner (the escrow PDA)
          true // allowOwnerOffCurve - required for PDAs
        );

        console.log(`   ✅ USDC ATA Result:`);
        console.log(`      Address: ${usdcAta.address.toString()}`);
        console.log(`      Owner: ${usdcAta.owner.toString()}`);
        console.log(`      Mint: ${usdcAta.mint.toString()}`);
        console.log(`      Amount: ${usdcAta.amount.toString()}\n`);

        // Create NFT ATA for escrow PDA
        console.log('   🔨 Creating NFT ATA for escrow PDA...');
        console.log(`   - Owner (PDA): ${escrowPdaPubkey.toString()}`);
        console.log(`   - Mint: ${nft.mint.toString()}`);
        console.log(`   - Payer: ${wallets.sender.publicKey.toString()}\n`);

        const nftAta = await getOrCreateAssociatedTokenAccount(
          connection,
          wallets.sender, // Payer (pays for account creation)
          nft.mint, // NFT mint
          escrowPdaPubkey, // Owner (the escrow PDA)
          true // allowOwnerOffCurve - required for PDAs
        );

        console.log(`   ✅ NFT ATA Result:`);
        console.log(`      Address: ${nftAta.address.toString()}`);
        console.log(`      Owner: ${nftAta.owner.toString()}`);
        console.log(`      Mint: ${nftAta.mint.toString()}`);
        console.log(`      Amount: ${nftAta.amount.toString()}\n`);

        // Verify addresses match what the API provided
        console.log('   🔍 Verifying ATA addresses match API expectations...');
        console.log(`   Expected USDC ATA: ${depositAddresses.usdc}`);
        console.log(`   Actual USDC ATA:   ${usdcAta.address.toString()}`);
        console.log(`   Match: ${usdcAta.address.toString() === depositAddresses.usdc ? '✅' : '❌'}\n`);
        
        console.log(`   Expected NFT ATA:  ${depositAddresses.nft}`);
        console.log(`   Actual NFT ATA:    ${nftAta.address.toString()}`);
        console.log(`   Match: ${nftAta.address.toString() === depositAddresses.nft ? '✅' : '❌'}\n`);

        expect(usdcAta.address.toString()).to.equal(depositAddresses.usdc);
        expect(nftAta.address.toString()).to.equal(depositAddresses.nft);

        console.log('   ✅ All ATAs ready for deposits\n');

      } catch (error: any) {
        console.error('   ❌ Failed to create ATAs:');
        console.error(`   Error: ${error.message}`);
        if (error.stack) {
          console.error(`   Stack: ${error.stack}`);
        }
        console.error('\n');
        throw error;
      }
    });

    it('should deposit NFT into escrow', async function () {
      console.log('🔐 Depositing NFT into escrow...\n');

      try {
        console.log(`   Transferring NFT from sender to ${depositAddresses.nft}...`);
        console.log(`   NFT Mint: ${nft.mint.toString()}`);
        console.log(`   Amount: 1 NFT\n`);

        // Transfer NFT to escrow deposit address
        const depositPubkey = new PublicKey(depositAddresses.nft);
        
        const signature = await transfer(
          connection,
          wallets.sender,
          nft.address, // NFT token account address
          depositPubkey,
          wallets.sender.publicKey,
          1 // NFT amount (1)
        );

        console.log(`   ✅ NFT transferred successfully!`);
        console.log(`   Transaction: ${signature}`);
        console.log(`   Explorer: ${getExplorerUrl(signature)}\n`);

        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('   ✅ Transaction confirmed\n');

      } catch (error: any) {
        console.error('   ❌ Failed to deposit NFT:');
        console.error(`   Error: ${error.message}\n`);
        throw error;
      }
    });
  });

    describe('2.2. Deposit USDC & Wait for Settlement', function () {
    it('should deposit USDC into escrow', async function () {
      console.log('💰 Depositing USDC into escrow...\n');

      try {
        const usdcAmount = SWAP_AMOUNT_USDC * 1_000_000; // Convert to micro-USDC (6 decimals)

        console.log(`   Transferring ${SWAP_AMOUNT_USDC} USDC from receiver to ${depositAddresses.usdc}...`);
        console.log(`   USDC Mint: ${tokenConfig.usdcMint.toString()}`);
        console.log(`   Amount: ${usdcAmount} micro-USDC\n`);

        // Transfer USDC to escrow deposit address
        const depositPubkey = new PublicKey(depositAddresses.usdc);
        
        const signature = await transfer(
          connection,
          wallets.receiver,
          tokenConfig.tokenAccounts.receiver,
          depositPubkey,
          wallets.receiver.publicKey,
          usdcAmount
        );

        console.log(`   ✅ USDC transferred successfully!`);
        console.log(`   Transaction: ${signature}`);
        console.log(`   Explorer: ${getExplorerUrl(signature)}\n`);

        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('   ✅ Transaction confirmed\n');

      } catch (error: any) {
        console.error('   ❌ Failed to deposit USDC:');
        console.error(`   Error: ${error.message}\n`);
        throw error;
      }
    });

    it('should wait for automatic settlement', async function () {
      console.log('⏳ Waiting for backend to detect deposits and settle...\n');

      const maxAttempts = 30; // 30 seconds max
      let attempts = 0;
      let settled = false;

      while (attempts < maxAttempts && !settled) {
        attempts++;
        
        try {
          const response = await axios.get(`${API_BASE_URL}/v1/agreements/${agreementId}`);
          
          const status = response.data.data.status;
          console.log(`   Attempt ${attempts}/${maxAttempts}: Status = ${status}`);

          if (status === 'SETTLED') {
            settled = true;
            console.log('\n   ✅ Agreement settled successfully!\n');
            
            // Stop timing when settlement is detected
            escrowEndTime = Date.now();
            break;
          } else if (status === 'LOCKED') {
            console.log('   💫 Both deposits confirmed, settlement in progress...');
          } else if (status === 'PENDING') {
            console.log('   ⏳ Waiting for deposits to be confirmed...');
          }

        } catch (error: any) {
          console.error(`   ⚠️  Error checking status: ${error.message}`);
        }

        // Wait 1 second before next check
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!settled) {
        throw new Error(`Settlement timeout after ${maxAttempts} seconds. Status did not reach SETTLED.`);
      }

      expect(settled).to.be.true;
    });
  });

    describe('2.3. Verification (Post-Swap)', function () {
    it('should verify sender received USDC payment (minus fee)', async function () {
      console.log('💰 Verifying sender USDC balance...\n');

      try {
        const finalSenderBalance = await getTokenBalance(
          connection,
          tokenConfig.tokenAccounts.sender
        );

        const usdcReceived = finalSenderBalance - initialBalances.usdc.sender;

        console.log(`   Initial balance: ${initialBalances.usdc.sender.toFixed(6)} USDC`);
        console.log(`   Final balance:   ${finalSenderBalance.toFixed(6)} USDC`);
        console.log(`   USDC received:   ${usdcReceived.toFixed(6)} USDC`);
        console.log(`   Expected:        ${EXPECTED_SENDER_USDC.toFixed(6)} USDC (99%)\n`);

        // Allow small tolerance for rounding
        expect(usdcReceived).to.be.closeTo(EXPECTED_SENDER_USDC, 0.001);
        console.log('   ✅ Sender received correct USDC amount!\n');

      } catch (error: any) {
        console.error('   ❌ Failed to verify sender balance:');
        console.error(`   Error: ${error.message}\n`);
        throw error;
      }
    });

    it('should verify fee collector received platform fee', async function () {
      console.log('💸 Verifying fee collector balance...\n');

      try {
        const finalFeeBalance = await getTokenBalance(
          connection,
          tokenConfig.tokenAccounts.feeCollector
        );

        const feeReceived = finalFeeBalance - initialBalances.usdc.feeCollector;

        console.log(`   Initial balance: ${initialBalances.usdc.feeCollector.toFixed(6)} USDC`);
        console.log(`   Final balance:   ${finalFeeBalance.toFixed(6)} USDC`);
        console.log(`   Fee received:    ${feeReceived.toFixed(6)} USDC`);
        console.log(`   Expected:        ${EXPECTED_FEE_USDC.toFixed(6)} USDC (1%)\n`);

        // Allow small tolerance for rounding
        expect(feeReceived).to.be.closeTo(EXPECTED_FEE_USDC, 0.001);
        console.log('   ✅ Fee collector received correct amount!\n');

      } catch (error: any) {
        console.error('   ❌ Failed to verify fee collector balance:');
        console.error(`   Error: ${error.message}\n`);
        throw error;
      }
    });

    it('should verify NFT transferred to receiver', async function () {
      console.log('🎨 Verifying NFT ownership transfer...\n');

      try {
        // Check if receiver now owns the NFT
        const receiverNftOwnership = await verifyNFTOwnership(
          connection,
          nft.mint,
          wallets.receiver.publicKey,
          wallets.receiver
        );

        console.log(`   NFT Mint: ${nft.mint.toString()}`);
        console.log(`   New Owner: ${wallets.receiver.publicKey.toString()}`);
        console.log(`   Ownership verified: ${receiverNftOwnership ? '✅' : '❌'}\n`);

        expect(receiverNftOwnership).to.be.true;
        console.log('   ✅ NFT successfully transferred to receiver!\n');

      } catch (error: any) {
        console.error('   ❌ Failed to verify NFT ownership:');
        console.error(`   Error: ${error.message}\n`);
        throw error;
      }
    });

    it('should verify agreement status is SETTLED', async function () {
      console.log('✅ Verifying final agreement status...\n');

      try {
        const response = await axios.get(`${API_BASE_URL}/v1/agreements/${agreementId}`);
        
        const agreementData = response.data.data;

        console.log(`   Agreement ID: ${agreementData.agreementId}`);
        console.log(`   Status: ${agreementData.status}`);
        console.log(`   Settled At: ${agreementData.settledAt || 'N/A'}\n`);

        expect(agreementData.status).to.equal('SETTLED');
        expect(agreementData.settledAt).to.exist;
        console.log('   ✅ Agreement marked as SETTLED!\n');

      } catch (error: any) {
        console.error('   ❌ Failed to verify agreement status:');
        console.error(`   Error: ${error.message}\n`);
        throw error;
      }
    });

    it('should display transaction links and summary', async function () {
      console.log('📊 Transaction Summary\n');
      console.log('='.repeat(60) + '\n');

      console.log('Wallets:');
      console.log(`  Sender:       ${getExplorerUrl(wallets.sender.publicKey.toString())}`);
      console.log(`  Receiver:     ${getExplorerUrl(wallets.receiver.publicKey.toString())}`);
      console.log(`  Admin:        ${getExplorerUrl(wallets.admin.publicKey.toString())}`);
      console.log(`  FeeCollector: ${getExplorerUrl(wallets.feeCollector.publicKey.toString())} (receive-only)\n`);

      console.log('Assets:');
      console.log(`  USDC Mint: ${getExplorerUrl(tokenConfig.usdcMint.toString())}`);
      console.log(`  NFT Mint:  ${getExplorerUrl(nft.mint.toString())}\n`);

      console.log('Expected Results:');
      console.log(`  Swap Amount:     ${SWAP_AMOUNT_USDC.toFixed(6)} USDC`);
      console.log(`  Sender Receives: ${EXPECTED_SENDER_USDC.toFixed(6)} USDC (99%)`);
      console.log(`  Fee Collected:   ${EXPECTED_FEE_USDC.toFixed(6)} USDC (1%)`);
      console.log(`  NFT Transfer:    Sender → Receiver\n`);

      console.log('='.repeat(60) + '\n');
    });
  });
  });

  describe('3. Cost Analysis & Summary', function () {
    it('should calculate and verify total SOL costs', async function () {
      console.log('💸 Calculating total SOL costs...\n');

      const finalSolBalances = await verifyWalletBalances(connection, wallets, 0);

      const senderCost = initialBalances.sol.sender - finalSolBalances.sender;
      const receiverCost = initialBalances.sol.receiver - finalSolBalances.receiver;
      const adminCost = initialBalances.sol.admin - finalSolBalances.admin;
      const feeCollectorCost = initialBalances.sol.feeCollector - finalSolBalances.feeCollector;
      const totalCost = senderCost + receiverCost + adminCost + feeCollectorCost;

      console.log('SOL Transaction Costs:');
      console.log(`  Sender:       ${senderCost.toFixed(6)} SOL`);
      console.log(`  Receiver:     ${receiverCost.toFixed(6)} SOL`);
      console.log(`  Admin:        ${adminCost.toFixed(6)} SOL`);
      console.log(`  FeeCollector: ${feeCollectorCost.toFixed(6)} SOL`);
      console.log(`  Total:        ${totalCost.toFixed(6)} SOL\n`);

      // Calculate escrow completion time
      if (escrowStartTime && escrowEndTime) {
        const escrowDuration = (escrowEndTime - escrowStartTime) / 1000; // Convert to seconds
        console.log('⏱️  Escrow Performance:');
        console.log(`  Escrow swap completed in ${escrowDuration.toFixed(3)} seconds\n`);
      } else {
        console.log('⏱️  Escrow Performance:');
        console.log('  ⚠️  Timing not available (swap not completed yet)\n');
      }

      // Verify total cost is reasonable (should be < 0.05 SOL)
      expect(totalCost).to.be.lessThan(0.05);

      console.log('✅ Transaction costs within acceptable range\n');
    });
  });

  after(function () {
    console.log('\n' + '='.repeat(60));
    console.log('✅ E2E Test Complete!');
    console.log('='.repeat(60) + '\n');

    console.log('📝 Note: Some tests are skipped pending full API integration.');
    console.log('   The test infrastructure and helpers are complete and working.');
    console.log('   Run this test after backend API is deployed to devnet.\n');
  });
});

