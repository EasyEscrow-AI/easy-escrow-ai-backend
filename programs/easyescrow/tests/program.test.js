"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mocha_1 = require("mocha");
const chai_1 = require("chai");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const program_1 = require("../src/program");
(0, mocha_1.describe)('EasyEscrow Program', () => {
    let connection;
    let buyer;
    let seller;
    let admin;
    let usdcMint;
    let nftMint;
    let escrowId;
    (0, mocha_1.before)(async () => {
        // Connect to devnet
        connection = new web3_js_1.Connection('https://api.devnet.solana.com', 'confirmed');
        // Generate keypairs
        buyer = web3_js_1.Keypair.generate();
        seller = web3_js_1.Keypair.generate();
        admin = web3_js_1.Keypair.generate();
        escrowId = Math.floor(Math.random() * 1000000);
        // Airdrop SOL to accounts
        const airdropAmount = 2 * web3_js_1.LAMPORTS_PER_SOL;
        await connection.requestAirdrop(buyer.publicKey, airdropAmount);
        await connection.requestAirdrop(seller.publicKey, airdropAmount);
        await connection.requestAirdrop(admin.publicKey, airdropAmount);
        // Wait for airdrops to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Create USDC mint (using native mint for testing)
        usdcMint = await (0, spl_token_1.createMint)(connection, buyer, buyer.publicKey, null, 6 // USDC has 6 decimals
        );
        // Create NFT mint
        nftMint = await (0, spl_token_1.createMint)(connection, seller, seller.publicKey, null, 0 // NFTs have 0 decimals
        );
    });
    (0, mocha_1.it)('should create init agreement instruction', () => {
        const instruction = program_1.easyEscrowProgram.createInitAgreementInstruction(escrowId, 1000000, // 1 USDC (6 decimals)
        nftMint, Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        buyer.publicKey, seller.publicKey, seller.publicKey // Placeholder for NFT token account
        );
        (0, chai_1.expect)(instruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(instruction.keys).to.have.length(5);
        (0, chai_1.expect)(instruction.data).to.have.length(8 + 8 + 8 + 32 + 32 + 32 + 32 + 32 + 1 + 8 + 1);
    });
    (0, mocha_1.it)('should create deposit USDC instruction', () => {
        const instruction = program_1.easyEscrowProgram.createDepositUsdcInstruction(escrowId, buyer.publicKey, buyer.publicKey, // Placeholder for buyer USDC account
        seller.publicKey, // Placeholder for escrow USDC account
        usdcMint);
        (0, chai_1.expect)(instruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(instruction.keys).to.have.length(6);
        (0, chai_1.expect)(instruction.data).to.have.length(8);
    });
    (0, mocha_1.it)('should create deposit NFT instruction', () => {
        const instruction = program_1.easyEscrowProgram.createDepositNftInstruction(escrowId, seller.publicKey, seller.publicKey, // Placeholder for seller NFT account
        buyer.publicKey, // Placeholder for escrow NFT account
        nftMint);
        (0, chai_1.expect)(instruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(instruction.keys).to.have.length(6);
        (0, chai_1.expect)(instruction.data).to.have.length(8);
    });
    (0, mocha_1.it)('should create settle instruction', () => {
        const instruction = program_1.easyEscrowProgram.createSettleInstruction(escrowId, buyer.publicKey, // Placeholder for escrow USDC account
        seller.publicKey, // Placeholder for seller USDC account
        buyer.publicKey, // Placeholder for escrow NFT account
        seller.publicKey // Placeholder for buyer NFT account
        );
        (0, chai_1.expect)(instruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(instruction.keys).to.have.length(6);
        (0, chai_1.expect)(instruction.data).to.have.length(8);
    });
    (0, mocha_1.it)('should create cancel if expired instruction', () => {
        const instruction = program_1.easyEscrowProgram.createCancelIfExpiredInstruction(escrowId, buyer.publicKey, // Placeholder for escrow USDC account
        seller.publicKey, // Placeholder for buyer USDC account
        buyer.publicKey, // Placeholder for escrow NFT account
        seller.publicKey // Placeholder for seller NFT account
        );
        (0, chai_1.expect)(instruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(instruction.keys).to.have.length(6);
        (0, chai_1.expect)(instruction.data).to.have.length(8);
    });
    (0, mocha_1.it)('should create admin cancel instruction', () => {
        const instruction = program_1.easyEscrowProgram.createAdminCancelInstruction(escrowId, buyer.publicKey, // Placeholder for escrow USDC account
        seller.publicKey, // Placeholder for buyer USDC account
        buyer.publicKey, // Placeholder for escrow NFT account
        seller.publicKey, // Placeholder for seller NFT account
        admin.publicKey);
        (0, chai_1.expect)(instruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(instruction.keys).to.have.length(7);
        (0, chai_1.expect)(instruction.data).to.have.length(8);
    });
    (0, mocha_1.it)('should generate correct PDA for escrow account', () => {
        const [pda, bump] = program_1.easyEscrowProgram.getEscrowPDA(escrowId);
        (0, chai_1.expect)(pda).to.be.instanceOf(web3_js_1.PublicKey);
        (0, chai_1.expect)(bump).to.be.a('number');
        (0, chai_1.expect)(bump).to.be.at.least(0);
        (0, chai_1.expect)(bump).to.be.at.most(255);
    });
    (0, mocha_1.it)('should have consistent PDA generation', () => {
        const [pda1, bump1] = program_1.easyEscrowProgram.getEscrowPDA(escrowId);
        const [pda2, bump2] = program_1.easyEscrowProgram.getEscrowPDA(escrowId);
        (0, chai_1.expect)(pda1.toString()).to.equal(pda2.toString());
        (0, chai_1.expect)(bump1).to.equal(bump2);
    });
    (0, mocha_1.it)('should generate different PDAs for different escrow IDs', () => {
        const [pda1] = program_1.easyEscrowProgram.getEscrowPDA(escrowId);
        const [pda2] = program_1.easyEscrowProgram.getEscrowPDA(escrowId + 1);
        (0, chai_1.expect)(pda1.toString()).to.not.equal(pda2.toString());
    });
    (0, mocha_1.it)('should validate escrow status enum values', () => {
        (0, chai_1.expect)(program_1.EscrowStatus.Pending).to.equal(0);
        (0, chai_1.expect)(program_1.EscrowStatus.Completed).to.equal(1);
        (0, chai_1.expect)(program_1.EscrowStatus.Cancelled).to.equal(2);
    });
    (0, mocha_1.it)('should create valid transaction with multiple instructions', async () => {
        // Create token accounts
        const buyerUsdcAccount = await (0, spl_token_1.createAccount)(connection, buyer, usdcMint, buyer.publicKey);
        const sellerNftAccount = await (0, spl_token_1.createAccount)(connection, seller, nftMint, seller.publicKey);
        // Create instructions
        const initInstruction = program_1.easyEscrowProgram.createInitAgreementInstruction(escrowId, 1000000, nftMint, Math.floor(Date.now() / 1000) + 3600, buyer.publicKey, seller.publicKey, sellerNftAccount);
        const depositUsdcInstruction = program_1.easyEscrowProgram.createDepositUsdcInstruction(escrowId, buyer.publicKey, buyerUsdcAccount, buyerUsdcAccount, // Using same account for simplicity
        usdcMint);
        // Create transaction
        const transaction = new web3_js_1.Transaction();
        transaction.add(initInstruction);
        transaction.add(depositUsdcInstruction);
        // Verify transaction structure
        (0, chai_1.expect)(transaction.instructions).to.have.length(2);
        (0, chai_1.expect)(transaction.instructions[0].programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(transaction.instructions[1].programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
    });
});
//# sourceMappingURL=program.test.js.map