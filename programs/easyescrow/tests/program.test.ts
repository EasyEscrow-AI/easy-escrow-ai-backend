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

describe('EasyEscrow Program', () => {
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

    // Airdrop SOL to accounts
    const airdropAmount = 2 * LAMPORTS_PER_SOL;
    await connection.requestAirdrop(buyer.publicKey, airdropAmount);
    await connection.requestAirdrop(seller.publicKey, airdropAmount);
    await connection.requestAirdrop(admin.publicKey, airdropAmount);

    // Wait for airdrops to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create USDC mint (using native mint for testing)
    usdcMint = await createMint(
      connection,
      buyer,
      buyer.publicKey,
      null,
      6 // USDC has 6 decimals
    );

    // Create NFT mint
    nftMint = await createMint(
      connection,
      seller,
      seller.publicKey,
      null,
      0 // NFTs have 0 decimals
    );
  });

  it('should create init agreement instruction', () => {
    const instruction = easyEscrowProgram.createInitAgreementInstruction(
      escrowId,
      1000000, // 1 USDC (6 decimals)
      nftMint,
      Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      buyer.publicKey,
      seller.publicKey,
      seller.publicKey // Placeholder for NFT token account
    );

    expect(instruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(instruction.keys).to.have.length(5);
    expect(instruction.data).to.have.length(8 + 8 + 8 + 32 + 32 + 32 + 32 + 32 + 1 + 8 + 1);
  });

  it('should create deposit USDC instruction', () => {
    const instruction = easyEscrowProgram.createDepositUsdcInstruction(
      escrowId,
      buyer.publicKey,
      buyer.publicKey, // Placeholder for buyer USDC account
      seller.publicKey, // Placeholder for escrow USDC account
      usdcMint
    );

    expect(instruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(instruction.keys).to.have.length(6);
    expect(instruction.data).to.have.length(8);
  });

  it('should create deposit NFT instruction', () => {
    const instruction = easyEscrowProgram.createDepositNftInstruction(
      escrowId,
      seller.publicKey,
      seller.publicKey, // Placeholder for seller NFT account
      buyer.publicKey, // Placeholder for escrow NFT account
      nftMint
    );

    expect(instruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(instruction.keys).to.have.length(6);
    expect(instruction.data).to.have.length(8);
  });

  it('should create settle instruction', () => {
    const instruction = easyEscrowProgram.createSettleInstruction(
      escrowId,
      buyer.publicKey, // Placeholder for escrow USDC account
      seller.publicKey, // Placeholder for seller USDC account
      buyer.publicKey, // Placeholder for escrow NFT account
      seller.publicKey // Placeholder for buyer NFT account
    );

    expect(instruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(instruction.keys).to.have.length(6);
    expect(instruction.data).to.have.length(8);
  });

  it('should create cancel if expired instruction', () => {
    const instruction = easyEscrowProgram.createCancelIfExpiredInstruction(
      escrowId,
      buyer.publicKey, // Placeholder for escrow USDC account
      seller.publicKey, // Placeholder for buyer USDC account
      buyer.publicKey, // Placeholder for escrow NFT account
      seller.publicKey // Placeholder for seller NFT account
    );

    expect(instruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(instruction.keys).to.have.length(6);
    expect(instruction.data).to.have.length(8);
  });

  it('should create admin cancel instruction', () => {
    const instruction = easyEscrowProgram.createAdminCancelInstruction(
      escrowId,
      buyer.publicKey, // Placeholder for escrow USDC account
      seller.publicKey, // Placeholder for buyer USDC account
      buyer.publicKey, // Placeholder for escrow NFT account
      seller.publicKey, // Placeholder for seller NFT account
      admin.publicKey
    );

    expect(instruction.programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(instruction.keys).to.have.length(7);
    expect(instruction.data).to.have.length(8);
  });

  it('should generate correct PDA for escrow account', () => {
    const [pda, bump] = easyEscrowProgram.getEscrowPDA(escrowId);
    
    expect(pda).to.be.instanceOf(PublicKey);
    expect(bump).to.be.a('number');
    expect(bump).to.be.at.least(0);
    expect(bump).to.be.at.most(255);
  });

  it('should have consistent PDA generation', () => {
    const [pda1, bump1] = easyEscrowProgram.getEscrowPDA(escrowId);
    const [pda2, bump2] = easyEscrowProgram.getEscrowPDA(escrowId);
    
    expect(pda1.toString()).to.equal(pda2.toString());
    expect(bump1).to.equal(bump2);
  });

  it('should generate different PDAs for different escrow IDs', () => {
    const [pda1] = easyEscrowProgram.getEscrowPDA(escrowId);
    const [pda2] = easyEscrowProgram.getEscrowPDA(escrowId + 1);
    
    expect(pda1.toString()).to.not.equal(pda2.toString());
  });

  it('should validate escrow status enum values', () => {
    expect(EscrowStatus.Pending).to.equal(0);
    expect(EscrowStatus.Completed).to.equal(1);
    expect(EscrowStatus.Cancelled).to.equal(2);
  });

  it('should create valid transaction with multiple instructions', async () => {
    // Create token accounts
    const buyerUsdcAccount = await createAccount(
      connection,
      buyer,
      usdcMint,
      buyer.publicKey
    );

    const sellerNftAccount = await createAccount(
      connection,
      seller,
      nftMint,
      seller.publicKey
    );

    // Create instructions
    const initInstruction = easyEscrowProgram.createInitAgreementInstruction(
      escrowId,
      1000000,
      nftMint,
      Math.floor(Date.now() / 1000) + 3600,
      buyer.publicKey,
      seller.publicKey,
      sellerNftAccount
    );

    const depositUsdcInstruction = easyEscrowProgram.createDepositUsdcInstruction(
      escrowId,
      buyer.publicKey,
      buyerUsdcAccount,
      buyerUsdcAccount, // Using same account for simplicity
      usdcMint
    );

    // Create transaction
    const transaction = new Transaction();
    transaction.add(initInstruction);
    transaction.add(depositUsdcInstruction);

    // Verify transaction structure
    expect(transaction.instructions).to.have.length(2);
    expect(transaction.instructions[0].programId.toString()).to.equal(easyEscrowProgram.programId.toString());
    expect(transaction.instructions[1].programId.toString()).to.equal(easyEscrowProgram.programId.toString());
  });
});