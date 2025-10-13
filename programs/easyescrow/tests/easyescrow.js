"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor = __importStar(require("@coral-xyz/anchor"));
const chai_1 = require("chai");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
describe("easyescrow", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.Easyescrow;
    const provider = anchor.getProvider();
    // Test accounts
    let buyer;
    let seller;
    let admin;
    let usdcMint;
    let nftMint;
    let escrowId;
    before(async () => {
        // Generate keypairs
        buyer = web3_js_1.Keypair.generate();
        seller = web3_js_1.Keypair.generate();
        admin = web3_js_1.Keypair.generate();
        escrowId = Math.floor(Math.random() * 1000000);
        // Airdrop SOL to accounts
        await provider.connection.requestAirdrop(buyer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(seller.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(admin.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
        // Wait for airdrops to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Create USDC mint (using native mint for testing)
        usdcMint = await (0, spl_token_1.createMint)(provider.connection, buyer, buyer.publicKey, null, 6 // USDC has 6 decimals
        );
        // Create NFT mint
        nftMint = await (0, spl_token_1.createMint)(provider.connection, seller, seller.publicKey, null, 0 // NFTs have 0 decimals
        );
    });
    it("Initializes escrow agreement", async () => {
        const [escrowPDA] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(escrowId.toString().padStart(8, "0"))], program.programId);
        const tx = await program.methods
            .initAgreement(new anchor.BN(escrowId), new anchor.BN(1000000), // 1 USDC (6 decimals)
        nftMint, new anchor.BN(Math.floor(Date.now() / 1000) + 3600) // 1 hour from now
        )
            .accounts({
            escrow: escrowPDA,
            buyer: buyer.publicKey,
            seller: seller.publicKey,
            nftTokenAccount: seller.publicKey,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .signers([buyer])
            .rpc();
        console.log("Init agreement transaction signature:", tx);
        // Verify escrow account was created
        const escrowAccount = await program.account.escrowState.fetch(escrowPDA);
        (0, chai_1.expect)(escrowAccount.escrowId.toNumber()).to.equal(escrowId);
        (0, chai_1.expect)(escrowAccount.buyer.toString()).to.equal(buyer.publicKey.toString());
        (0, chai_1.expect)(escrowAccount.seller.toString()).to.equal(seller.publicKey.toString());
        (0, chai_1.expect)(escrowAccount.usdcAmount.toNumber()).to.equal(1000000);
        (0, chai_1.expect)(escrowAccount.nftMint.toString()).to.equal(nftMint.toString());
    });
    it("Deposits USDC into escrow", async () => {
        const [escrowPDA] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(escrowId.toString().padStart(8, "0"))], program.programId);
        // Create buyer USDC account
        const buyerUsdcAccount = await (0, spl_token_1.createAccount)(provider.connection, buyer, usdcMint, buyer.publicKey);
        // Create escrow USDC account
        const escrowUsdcAccount = await (0, spl_token_1.createAccount)(provider.connection, buyer, usdcMint, escrowPDA);
        // Mint USDC to buyer
        await (0, spl_token_1.mintTo)(provider.connection, buyer, usdcMint, buyerUsdcAccount, buyer, 1000000 // 1 USDC
        );
        const tx = await program.methods
            .depositUsdc()
            .accounts({
            escrow: escrowPDA,
            buyer: buyer.publicKey,
            buyerUsdcAccount: buyerUsdcAccount,
            escrowUsdcAccount: escrowUsdcAccount,
            usdcMint: usdcMint,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .signers([buyer])
            .rpc();
        console.log("Deposit USDC transaction signature:", tx);
        // Verify USDC was transferred
        const escrowUsdcBalance = await (0, spl_token_1.getAccount)(provider.connection, escrowUsdcAccount);
        (0, chai_1.expect)(Number(escrowUsdcBalance.amount)).to.equal(1000000);
    });
    it("Deposits NFT into escrow", async () => {
        const [escrowPDA] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(escrowId.toString().padStart(8, "0"))], program.programId);
        // Create seller NFT account
        const sellerNftAccount = await (0, spl_token_1.createAccount)(provider.connection, seller, nftMint, seller.publicKey);
        // Create escrow NFT account
        const escrowNftAccount = await (0, spl_token_1.createAccount)(provider.connection, seller, nftMint, escrowPDA);
        // Mint NFT to seller
        await (0, spl_token_1.mintTo)(provider.connection, seller, nftMint, sellerNftAccount, seller, 1 // 1 NFT
        );
        const tx = await program.methods
            .depositNft()
            .accounts({
            escrow: escrowPDA,
            seller: seller.publicKey,
            sellerNftAccount: sellerNftAccount,
            escrowNftAccount: escrowNftAccount,
            nftMint: nftMint,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .signers([seller])
            .rpc();
        console.log("Deposit NFT transaction signature:", tx);
        // Verify NFT was transferred
        const escrowNftBalance = await (0, spl_token_1.getAccount)(provider.connection, escrowNftAccount);
        (0, chai_1.expect)(Number(escrowNftBalance.amount)).to.equal(1);
    });
    it("Settles escrow", async () => {
        const [escrowPDA] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(escrowId.toString().padStart(8, "0"))], program.programId);
        // Create accounts for settlement
        const sellerUsdcAccount = await (0, spl_token_1.createAccount)(provider.connection, seller, usdcMint, seller.publicKey);
        const buyerNftAccount = await (0, spl_token_1.createAccount)(provider.connection, buyer, nftMint, buyer.publicKey);
        const escrowUsdcAccount = await (0, spl_token_1.createAccount)(provider.connection, buyer, usdcMint, escrowPDA);
        const escrowNftAccount = await (0, spl_token_1.createAccount)(provider.connection, seller, nftMint, escrowPDA);
        const tx = await program.methods
            .settle()
            .accounts({
            escrow: escrowPDA,
            escrowUsdcAccount: escrowUsdcAccount,
            sellerUsdcAccount: sellerUsdcAccount,
            escrowNftAccount: escrowNftAccount,
            buyerNftAccount: buyerNftAccount,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .rpc();
        console.log("Settle transaction signature:", tx);
        // Verify escrow status was updated
        const escrowAccount = await program.account.escrowState.fetch(escrowPDA);
        (0, chai_1.expect)(escrowAccount.status).to.deep.equal({ completed: {} });
    });
});
//# sourceMappingURL=easyescrow.js.map