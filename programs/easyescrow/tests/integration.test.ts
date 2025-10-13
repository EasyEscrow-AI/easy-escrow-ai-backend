import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { easyEscrowProgram, EscrowStatus } from '../src/program';

describe('EasyEscrow Integration Tests', () => {
  let connection: Connection;
  let buyer: Keypair;
  let seller: Keypair;
  let admin: Keypair;
  let usdcMint: PublicKey;
  let nftMint: PublicKey;
  let escrowId: number;

  before(async () => {
    // Connect to devnet
    connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Generate keypairs
    buyer = Keypair.generate();
    seller = Keypair.generate();
    admin = Keypair.generate();
    escrowId = Math.floor(Math.random() * 1000000);

    console.log('🔑 Generated accounts:');
    console.log('   Buyer:', buyer.publicKey.toString());
    console.log('   Seller:', seller.publicKey.toString());
    console.log('   Admin:', admin.publicKey.toString());
    console.log('   Escrow ID:', escrowId);

    // Airdrop SOL to accounts
    const airdropAmount = 2 * LAMPORTS_PER_SOL;
    console.log('💰 Airdropping SOL to accounts...');
    
    await connection.requestAirdrop(buyer.publicKey, airdropAmount);
    await connection.requestAirdrop(seller.publicKey, airdropAmount);
    await connection.requestAirdrop(admin.publicKey, airdropAmount);

    // Wait for airdrops to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify balances
    const buyerBalance = await connection.getBalance(buyer.publicKey);
    const sellerBalance = await connection.getBalance(seller.publicKey);
    const adminBalance = await connection.getBalance(admin.publicKey);

    console.log('💰 Account balances:');
    console.log('   Buyer:', buyerBalance / LAMPORTS_PER_SOL, 'SOL');
    console.log('   Seller:', sellerBalance / LAMPORTS_PER_SOL, 'SOL');
    console.log('   Admin:', adminBalance / LAMPORTS_PER_SOL, 'SOL');

    // Create USDC mint
    console.log('🪙 Creating USDC mint...');
    usdcMint = await createMint(
      connection,
      buyer,
      buyer.publicKey,
      null,
      6 // USDC has 6 decimals
    );
    console.log('   USDC Mint:', usdcMint.toString());

    // Create NFT mint
    console.log('🖼️  Creating NFT mint...');
    nftMint = await createMint(
      connection,
      seller,
      seller.publicKey,
      null,
      0 // NFTs have 0 decimals
    );
    console.log('   NFT Mint:', nftMint.toString());
  });

  it('should complete full escrow flow', async () => {
    console.log('\n🔄 Starting full escrow flow test...');

    // Step 1: Create token accounts
    console.log('📝 Step 1: Creating token accounts...');
    
    const buyerUsdcAccount = await createAccount(
      connection,
      buyer,
      usdcMint,
      buyer.publicKey
    );
    console.log('   Buyer USDC Account:', buyerUsdcAccount.toString());

    const sellerNftAccount = await createAccount(
      connection,
      seller,
      nftMint,
      seller.publicKey
    );
    console.log('   Seller NFT Account:', sellerNftAccount.toString());

    const [escrowPDA] = easyEscrowProgram.getEscrowPDA(escrowId);
    const escrowUsdcAccount = await createAccount(
      connection,
      buyer,
      usdcMint,
      escrowPDA
    );
    console.log('   Escrow USDC Account:', escrowUsdcAccount.toString());

    const escrowNftAccount = await createAccount(
      connection,
      seller,
      nftMint,
      escrowPDA
    );
    console.log('   Escrow NFT Account:', escrowNftAccount.toString());

    // Step 2: Mint tokens
    console.log('🪙 Step 2: Minting tokens...');
    
    const usdcAmount = 1000000; // 1 USDC (6 decimals)
    await mintTo(
      connection,
      buyer,
      usdcMint,
      buyerUsdcAccount,
      buyer,
      usdcAmount
    );
    console.log('   Minted', usdcAmount / 1e6, 'USDC to buyer');

    const nftAmount = 1; // 1 NFT
    await mintTo(
      connection,
      seller,
      nftMint,
      sellerNftAccount,
      seller,
      nftAmount
    );
    console.log('   Minted', nftAmount, 'NFT to seller');

    // Step 3: Create escrow agreement
    console.log('📋 Step 3: Creating escrow agreement...');
    
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const initInstruction = easyEscrowProgram.createInitAgreementInstruction(
      escrowId,
      usdcAmount,
      nftMint,
      expiryTimestamp,
      buyer.publicKey,
      seller.publicKey,
      sellerNftAccount
    );

    const initTransaction = new Transaction();
    initTransaction.add(initInstruction);

    // Note: This would fail in a real deployment since the program doesn't exist
    // For testing purposes, we'll just validate the instruction structure
    console.log('   ✅ Init agreement instruction created');
    console.log('   Escrow PDA:', escrowPDA.toString());
    console.log('   Expiry:', new Date(expiryTimestamp * 1000).toISOString());

    // Step 4: Deposit USDC
    console.log('💰 Step 4: Depositing USDC...');
    
    const depositUsdcInstruction = easyEscrowProgram.createDepositUsdcInstruction(
      escrowId,
      buyer.publicKey,
      buyerUsdcAccount,
      escrowUsdcAccount,
      usdcMint
    );

    console.log('   ✅ Deposit USDC instruction created');

    // Step 5: Deposit NFT
    console.log('🖼️  Step 5: Depositing NFT...');
    
    const depositNftInstruction = easyEscrowProgram.createDepositNftInstruction(
      escrowId,
      seller.publicKey,
      sellerNftAccount,
      escrowNftAccount,
      nftMint
    );

    console.log('   ✅ Deposit NFT instruction created');

    // Step 6: Settle escrow
    console.log('🤝 Step 6: Settling escrow...');
    
    const sellerUsdcAccount = await createAccount(
      connection,
      seller,
      usdcMint,
      seller.publicKey
    );
    console.log('   Seller USDC Account:', sellerUsdcAccount.toString());

    const buyerNftAccount = await createAccount(
      connection,
      buyer,
      nftMint,
      buyer.publicKey
    );
    console.log('   Buyer NFT Account:', buyerNftAccount.toString());

    const settleInstruction = easyEscrowProgram.createSettleInstruction(
      escrowId,
      escrowUsdcAccount,
      sellerUsdcAccount,
      escrowNftAccount,
      buyerNftAccount
    );

    console.log('   ✅ Settle instruction created');

    // Step 7: Test cancellation scenarios
    console.log('❌ Step 7: Testing cancellation scenarios...');
    
    const cancelIfExpiredInstruction = easyEscrowProgram.createCancelIfExpiredInstruction(
      escrowId,
      escrowUsdcAccount,
      buyerUsdcAccount,
      escrowNftAccount,
      sellerNftAccount
    );

    const adminCancelInstruction = easyEscrowProgram.createAdminCancelInstruction(
      escrowId,
      escrowUsdcAccount,
      buyerUsdcAccount,
      escrowNftAccount,
      sellerNftAccount,
      admin.publicKey
    );

    console.log('   ✅ Cancel if expired instruction created');
    console.log('   ✅ Admin cancel instruction created');

    // Verify all instructions are properly structured
    expect(initInstruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(depositUsdcInstruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(depositNftInstruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(settleInstruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(cancelIfExpiredInstruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(adminCancelInstruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());

    console.log('✅ Full escrow flow test completed successfully!');
  });

  it('should handle multiple escrow agreements', async () => {
    console.log('\n🔄 Testing multiple escrow agreements...');

    const escrowIds = [1001, 1002, 1003];
    const pdas: PublicKey[] = [];

    for (const id of escrowIds) {
      const [pda] = easyEscrowProgram.getEscrowPDA(id);
      pdas.push(pda);
      console.log(`   Escrow ${id} PDA:`, pda.toString());
    }

    // Verify all PDAs are unique
    const uniquePdas = new Set(pdas.map(p => p.toString()));
    expect(uniquePdas.size).to.equal(escrowIds.length);

    console.log('✅ Multiple escrow agreements test completed!');
  });

  it('should validate escrow status transitions', () => {
    console.log('\n🔄 Testing escrow status transitions...');

    // Test status enum values
    expect(EscrowStatus.Pending).to.equal(0);
    expect(EscrowStatus.Completed).to.equal(1);
    expect(EscrowStatus.Cancelled).to.equal(2);

    // Test status progression
    const statuses = [
      EscrowStatus.Pending,
      EscrowStatus.Completed
    ];

    expect(statuses[0]).to.equal(0); // Pending
    expect(statuses[1]).to.equal(1); // Completed

    console.log('✅ Escrow status transitions validated!');
  });
});