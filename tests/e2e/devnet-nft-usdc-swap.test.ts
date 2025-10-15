/**
 * E2E Devnet Test: NFT-to-USDC Swap with Fee Collection
 * 
 * Happy path test for complete escrow flow:
 * - Sender has NFT, wants USDC
 * - Receiver has USDC, wants NFT
 * - Fee collector receives 1% fee in USDC
 * 
 * Test flow:
 * 1. Setup: Load wallets, create USDC mint/accounts, create test NFT
 * 2. Create escrow via API
 * 3. Execute swap
 * 4. Verify all balances and ownership transfers
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { expect } from 'chai';
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

// Test constants
const SWAP_AMOUNT_USDC = 0.1; // 0.1 USDC for swap
const FEE_PERCENTAGE = 0.01; // 1% fee
const EXPECTED_SENDER_USDC = SWAP_AMOUNT_USDC * (1 - FEE_PERCENTAGE); // 0.099 USDC
const EXPECTED_FEE_USDC = SWAP_AMOUNT_USDC * FEE_PERCENTAGE; // 0.001 USDC

describe('E2E: NFT-to-USDC Swap on Devnet (Happy Path)', function () {
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

  before(async function () {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 E2E Test: NFT-to-USDC Swap on Solana Devnet');
    console.log('='.repeat(60) + '\n');
  });

  describe('Setup Phase', function () {
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

    it('should load and verify 3 devnet wallets with sufficient SOL', async function () {
      console.log('🔑 Loading devnet wallets...\n');

      // Load wallets (generates new ones if not found)
      wallets = await loadDevnetWallets();
      displayWalletInfo(wallets);

      // Verify all wallets have minimum SOL balance
      const minSOL = 0.05;
      const balances = await verifyWalletBalances(connection, wallets, minSOL);

      expect(wallets.sender).to.exist;
      expect(wallets.receiver).to.exist;
      expect(wallets.feeCollector).to.exist;
      expect(balances.sender).to.be.at.least(minSOL);
      expect(balances.receiver).to.be.at.least(minSOL);
      expect(balances.feeCollector).to.be.at.least(minSOL);

      console.log(`✅ All wallets verified with minimum ${minSOL} SOL\n`);
    });

    it('should create USDC mint and token accounts', async function () {
      console.log('🪙  Setting up USDC mint and token accounts...\n');

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

    it('should create test NFT in sender wallet', async function () {
      console.log('🎨 Creating test NFT in sender wallet...\n');

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

    it('should record initial balances', async function () {
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
      console.log(`  FeeCollector: ${solBalances.feeCollector.toFixed(4)} SOL\n`);

      console.log('Initial USDC Balances:');
      console.log(`  Sender:       ${usdcBalances.sender.toFixed(6)} USDC`);
      console.log(`  Receiver:     ${usdcBalances.receiver.toFixed(6)} USDC`);
      console.log(`  FeeCollector: ${usdcBalances.feeCollector.toFixed(6)} USDC\n`);

      expect(initialBalances).to.exist;
    });
  });

  describe('Escrow Creation (via API)', function () {
    it('should create escrow transaction via API', async function () {
      console.log('📝 Creating escrow transaction...\n');

      // TODO: Call escrow API to create transaction
      // This will be implemented when the backend API is running
      // For now, we're testing the helper functions and setup

      console.log('⚠️  API integration pending - would call:');
      console.log('   POST /api/escrow/create');
      console.log('   Body: {');
      console.log(`     sellerAddress: "${wallets.sender.publicKey.toString()}",`);
      console.log(`     buyerAddress: "${wallets.receiver.publicKey.toString()}",`);
      console.log(`     nftMint: "${nft.mint.toString()}",`);
      console.log(`     usdcMint: "${tokenConfig.usdcMint.toString()}",`);
      console.log(`     amount: ${SWAP_AMOUNT_USDC},`);
      console.log(`     feePercentage: ${FEE_PERCENTAGE}`);
      console.log('   }\n');

      // For now, mark as pending implementation
      this.skip();
    });

    it('should deposit NFT into escrow', async function () {
      console.log('🔐 Depositing NFT into escrow...\n');

      // TODO: Verify NFT transferred to escrow PDA
      // This requires the escrow program interaction

      console.log('⚠️  Escrow deposit pending - would verify:');
      console.log('   - NFT transferred from sender to escrow PDA');
      console.log('   - Escrow account created on-chain');
      console.log('   - Escrow state matches expected values\n');

      this.skip();
    });
  });

  describe('Swap Execution (via API)', function () {
    it('should execute swap with USDC payment', async function () {
      console.log('💱 Executing swap...\n');

      // TODO: Receiver accepts escrow and pays USDC
      // This will interact with the backend API

      console.log('⚠️  Swap execution pending - would call:');
      console.log('   POST /api/escrow/accept');
      console.log('   Body: {');
      console.log('     escrowId: "<ESCROW_ID>",');
      console.log(`     buyerAddress: "${wallets.receiver.publicKey.toString()}"`);
      console.log('   }\n');

      this.skip();
    });

    it('should transfer NFT to receiver', async function () {
      console.log('🎨 Verifying NFT transfer...\n');

      // TODO: Verify NFT ownership changed to receiver
      
      console.log('⚠️  NFT transfer verification pending\n');

      this.skip();
    });
  });

  describe('Verification (Post-Swap)', function () {
    it('should verify sender received 99% of USDC payment', async function () {
      console.log('💰 Verifying sender USDC balance...\n');

      // TODO: Check sender token account balance
      const senderBalance = await getTokenBalance(
        connection,
        tokenConfig.tokenAccounts.sender
      );

      console.log(`   Expected: ${EXPECTED_SENDER_USDC.toFixed(6)} USDC`);
      console.log(`   Actual:   ${senderBalance.toFixed(6)} USDC\n`);

      // For now, just log the current balance
      console.log('⚠️  Full verification pending swap completion\n');

      this.skip();
    });

    it('should verify fee collector received 1% of USDC payment', async function () {
      console.log('💵 Verifying fee collector USDC balance...\n');

      // TODO: Check fee collector token account balance
      const feeBalance = await getTokenBalance(
        connection,
        tokenConfig.tokenAccounts.feeCollector
      );

      console.log(`   Expected: ${EXPECTED_FEE_USDC.toFixed(6)} USDC`);
      console.log(`   Actual:   ${feeBalance.toFixed(6)} USDC\n`);

      console.log('⚠️  Full verification pending swap completion\n');

      this.skip();
    });

    it('should verify NFT ownership transferred to receiver', async function () {
      console.log('🎨 Verifying NFT ownership...\n');

      // TODO: Verify NFT owned by receiver
      console.log('⚠️  NFT ownership verification pending\n');

      this.skip();
    });

    it('should verify escrow marked as completed', async function () {
      console.log('✅ Verifying escrow status...\n');

      // TODO: Check escrow status via API and on-chain
      console.log('⚠️  Escrow status verification pending\n');

      this.skip();
    });

    it('should display transaction links and summary', async function () {
      console.log('📊 Transaction Summary\n');
      console.log('='.repeat(60) + '\n');

      console.log('Wallets:');
      console.log(`  Sender:       ${getExplorerUrl(wallets.sender.publicKey.toString())}`);
      console.log(`  Receiver:     ${getExplorerUrl(wallets.receiver.publicKey.toString())}`);
      console.log(`  FeeCollector: ${getExplorerUrl(wallets.feeCollector.publicKey.toString())}\n`);

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

  describe('Cost Analysis', function () {
    it('should calculate and verify total SOL costs', async function () {
      console.log('💸 Calculating total SOL costs...\n');

      const finalSolBalances = await verifyWalletBalances(connection, wallets, 0);

      const senderCost = initialBalances.sol.sender - finalSolBalances.sender;
      const receiverCost = initialBalances.sol.receiver - finalSolBalances.receiver;
      const feeCollectorCost = initialBalances.sol.feeCollector - finalSolBalances.feeCollector;
      const totalCost = senderCost + receiverCost + feeCollectorCost;

      console.log('SOL Transaction Costs:');
      console.log(`  Sender:       ${senderCost.toFixed(6)} SOL`);
      console.log(`  Receiver:     ${receiverCost.toFixed(6)} SOL`);
      console.log(`  FeeCollector: ${feeCollectorCost.toFixed(6)} SOL`);
      console.log(`  Total:        ${totalCost.toFixed(6)} SOL\n`);

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

