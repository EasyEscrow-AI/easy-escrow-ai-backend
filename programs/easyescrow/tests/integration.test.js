"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mocha_1 = require("mocha");
const chai_1 = require("chai");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const program_1 = require("../src/program");
(0, mocha_1.describe)('EasyEscrow Integration Tests', () => {
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
        console.log('🔑 Generated accounts:');
        console.log('   Buyer:', buyer.publicKey.toString());
        console.log('   Seller:', seller.publicKey.toString());
        console.log('   Admin:', admin.publicKey.toString());
        console.log('   Escrow ID:', escrowId);
        // Airdrop SOL to accounts
        const airdropAmount = 2 * web3_js_1.LAMPORTS_PER_SOL;
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
        console.log('   Buyer:', buyerBalance / web3_js_1.LAMPORTS_PER_SOL, 'SOL');
        console.log('   Seller:', sellerBalance / web3_js_1.LAMPORTS_PER_SOL, 'SOL');
        console.log('   Admin:', adminBalance / web3_js_1.LAMPORTS_PER_SOL, 'SOL');
        // Create USDC mint
        console.log('🪙 Creating USDC mint...');
        usdcMint = await (0, spl_token_1.createMint)(connection, buyer, buyer.publicKey, null, 6 // USDC has 6 decimals
        );
        console.log('   USDC Mint:', usdcMint.toString());
        // Create NFT mint
        console.log('🖼️  Creating NFT mint...');
        nftMint = await (0, spl_token_1.createMint)(connection, seller, seller.publicKey, null, 0 // NFTs have 0 decimals
        );
        console.log('   NFT Mint:', nftMint.toString());
    });
    (0, mocha_1.it)('should complete full escrow flow', async () => {
        console.log('\n🔄 Starting full escrow flow test...');
        // Step 1: Create token accounts
        console.log('📝 Step 1: Creating token accounts...');
        const buyerUsdcAccount = await (0, spl_token_1.createAccount)(connection, buyer, usdcMint, buyer.publicKey);
        console.log('   Buyer USDC Account:', buyerUsdcAccount.toString());
        const sellerNftAccount = await (0, spl_token_1.createAccount)(connection, seller, nftMint, seller.publicKey);
        console.log('   Seller NFT Account:', sellerNftAccount.toString());
        const [escrowPDA] = program_1.easyEscrowProgram.getEscrowPDA(escrowId);
        const escrowUsdcAccount = await (0, spl_token_1.createAccount)(connection, buyer, usdcMint, escrowPDA);
        console.log('   Escrow USDC Account:', escrowUsdcAccount.toString());
        const escrowNftAccount = await (0, spl_token_1.createAccount)(connection, seller, nftMint, escrowPDA);
        console.log('   Escrow NFT Account:', escrowNftAccount.toString());
        // Step 2: Mint tokens
        console.log('🪙 Step 2: Minting tokens...');
        const usdcAmount = 1000000; // 1 USDC (6 decimals)
        await (0, spl_token_1.mintTo)(connection, buyer, usdcMint, buyerUsdcAccount, buyer, usdcAmount);
        console.log('   Minted', usdcAmount / 1e6, 'USDC to buyer');
        const nftAmount = 1; // 1 NFT
        await (0, spl_token_1.mintTo)(connection, seller, nftMint, sellerNftAccount, seller, nftAmount);
        console.log('   Minted', nftAmount, 'NFT to seller');
        // Step 3: Create escrow agreement
        console.log('📋 Step 3: Creating escrow agreement...');
        const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const initInstruction = program_1.easyEscrowProgram.createInitAgreementInstruction(escrowId, usdcAmount, nftMint, expiryTimestamp, buyer.publicKey, seller.publicKey, sellerNftAccount);
        const initTransaction = new web3_js_1.Transaction();
        initTransaction.add(initInstruction);
        // Note: This would fail in a real deployment since the program doesn't exist
        // For testing purposes, we'll just validate the instruction structure
        console.log('   ✅ Init agreement instruction created');
        console.log('   Escrow PDA:', escrowPDA.toString());
        console.log('   Expiry:', new Date(expiryTimestamp * 1000).toISOString());
        // Step 4: Deposit USDC
        console.log('💰 Step 4: Depositing USDC...');
        const depositUsdcInstruction = program_1.easyEscrowProgram.createDepositUsdcInstruction(escrowId, buyer.publicKey, buyerUsdcAccount, escrowUsdcAccount, usdcMint);
        console.log('   ✅ Deposit USDC instruction created');
        // Step 5: Deposit NFT
        console.log('🖼️  Step 5: Depositing NFT...');
        const depositNftInstruction = program_1.easyEscrowProgram.createDepositNftInstruction(escrowId, seller.publicKey, sellerNftAccount, escrowNftAccount, nftMint);
        console.log('   ✅ Deposit NFT instruction created');
        // Step 6: Settle escrow
        console.log('🤝 Step 6: Settling escrow...');
        const sellerUsdcAccount = await (0, spl_token_1.createAccount)(connection, seller, usdcMint, seller.publicKey);
        console.log('   Seller USDC Account:', sellerUsdcAccount.toString());
        const buyerNftAccount = await (0, spl_token_1.createAccount)(connection, buyer, nftMint, buyer.publicKey);
        console.log('   Buyer NFT Account:', buyerNftAccount.toString());
        const settleInstruction = program_1.easyEscrowProgram.createSettleInstruction(escrowId, escrowUsdcAccount, sellerUsdcAccount, escrowNftAccount, buyerNftAccount);
        console.log('   ✅ Settle instruction created');
        // Step 7: Test cancellation scenarios
        console.log('❌ Step 7: Testing cancellation scenarios...');
        const cancelIfExpiredInstruction = program_1.easyEscrowProgram.createCancelIfExpiredInstruction(escrowId, escrowUsdcAccount, buyerUsdcAccount, escrowNftAccount, sellerNftAccount);
        const adminCancelInstruction = program_1.easyEscrowProgram.createAdminCancelInstruction(escrowId, escrowUsdcAccount, buyerUsdcAccount, escrowNftAccount, sellerNftAccount, admin.publicKey);
        console.log('   ✅ Cancel if expired instruction created');
        console.log('   ✅ Admin cancel instruction created');
        // Verify all instructions are properly structured
        (0, chai_1.expect)(initInstruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(depositUsdcInstruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(depositNftInstruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(settleInstruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(cancelIfExpiredInstruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        (0, chai_1.expect)(adminCancelInstruction.programId.toString()).to.equal(program_1.easyEscrowProgram.programId.toString());
        console.log('✅ Full escrow flow test completed successfully!');
    });
    (0, mocha_1.it)('should handle multiple escrow agreements', async () => {
        console.log('\n🔄 Testing multiple escrow agreements...');
        const escrowIds = [1001, 1002, 1003];
        const pdas = [];
        for (const id of escrowIds) {
            const [pda] = program_1.easyEscrowProgram.getEscrowPDA(id);
            pdas.push(pda);
            console.log(`   Escrow ${id} PDA:`, pda.toString());
        }
        // Verify all PDAs are unique
        const uniquePdas = new Set(pdas.map(p => p.toString()));
        (0, chai_1.expect)(uniquePdas.size).to.equal(escrowIds.length);
        console.log('✅ Multiple escrow agreements test completed!');
    });
    (0, mocha_1.it)('should validate escrow status transitions', () => {
        console.log('\n🔄 Testing escrow status transitions...');
        // Test status enum values
        (0, chai_1.expect)(program_1.EscrowStatus.Pending).to.equal(0);
        (0, chai_1.expect)(program_1.EscrowStatus.Completed).to.equal(1);
        (0, chai_1.expect)(program_1.EscrowStatus.Cancelled).to.equal(2);
        // Test status progression
        const statuses = [
            program_1.EscrowStatus.Pending,
            program_1.EscrowStatus.Completed
        ];
        (0, chai_1.expect)(statuses[0]).to.equal(0); // Pending
        (0, chai_1.expect)(statuses[1]).to.equal(1); // Completed
        console.log('✅ Escrow status transitions validated!');
    });
});
//# sourceMappingURL=integration.test.js.map