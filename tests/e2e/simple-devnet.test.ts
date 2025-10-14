/**
 * Simple E2E Devnet Test - Validation
 * Tests basic program interaction with correct interface
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Escrow } from "../../target/types/escrow";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const DEVNET_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DEPLOYED_PROGRAM_ID = new PublicKey("7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV");

// Helper function to create deterministic keypairs
function createDeterministicKeypair(seed: string): Keypair {
  const hash = crypto.createHash('sha256').update(seed).digest();
  return Keypair.fromSeed(hash);
}

describe("Simple Devnet E2E Test - Interface Validation", () => {
  let connection: Connection;
  let provider: AnchorProvider;
  let program: Program<Escrow>;

  let buyer: Keypair;
  let seller: Keypair;
  let admin: Keypair;
  let testUsdcMint: PublicKey;
  let testNftMint: PublicKey;

  before(async function () {
    this.timeout(120000);

    console.log("\n🔬 Simple Devnet Test - Validating Program Interface");
    console.log("=".repeat(60));

    connection = new Connection(DEVNET_RPC_URL, "confirmed");
    console.log(`✅ Connected to: ${DEVNET_RPC_URL}`);

    // Create DETERMINISTIC test wallets (same addresses every run!)
    buyer = createDeterministicKeypair("easy-escrow-e2e-buyer-v1");
    seller = createDeterministicKeypair("easy-escrow-e2e-seller-v1");
    admin = createDeterministicKeypair("easy-escrow-e2e-admin-v1");

    console.log("\n💼 Test Wallets (DETERMINISTIC - fund these once):");
    console.log(`   Buyer:  ${buyer.publicKey.toString()}`);
    console.log(`   Seller: ${seller.publicKey.toString()}`);
    console.log(`   Admin:  ${admin.publicKey.toString()}`);

    // Check balances
    const buyerBalance = await connection.getBalance(buyer.publicKey);
    const sellerBalance = await connection.getBalance(seller.publicKey);
    const adminBalance = await connection.getBalance(admin.publicKey);

    console.log("\n💰 Current Balances:");
    console.log(`   Buyer:  ${(buyerBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`   Seller: ${(sellerBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`   Admin:  ${(adminBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    // Verify we have enough SOL
    if (buyerBalance < 1.5 * LAMPORTS_PER_SOL) {
      console.log(`\n   ❌ Buyer needs more SOL!`);
      console.log(`      Run: solana transfer ${buyer.publicKey.toString()} 2 --url devnet`);
      throw new Error("Insufficient balance for buyer");
    }
    if (sellerBalance < 1.5 * LAMPORTS_PER_SOL) {
      console.log(`\n   ❌ Seller needs more SOL!`);
      console.log(`      Run: solana transfer ${seller.publicKey.toString()} 2 --url devnet`);
      throw new Error("Insufficient balance for seller");
    }
    if (adminBalance < 0.5 * LAMPORTS_PER_SOL) {
      console.log(`\n   ❌ Admin needs more SOL!`);
      console.log(`      Run: solana transfer ${admin.publicKey.toString()} 1 --url devnet`);
      throw new Error("Insufficient balance for admin");
    }

    console.log(`\n✅ All wallets have sufficient balance!`)

    // Setup provider
    const wallet = new anchor.Wallet(buyer);
    provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    anchor.setProvider(provider);

    // Load program
    const idl = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../target/idl/escrow.json"), "utf8")
    );
    idl.address = DEPLOYED_PROGRAM_ID.toString();
    program = new Program(idl, provider) as Program<Escrow>;

    console.log(`✅ Program loaded: ${program.programId.toString()}`);

    // Create test USDC mint
    testUsdcMint = await createMint(
      connection,
      buyer,
      buyer.publicKey,
      null,
      6 // USDC decimals
    );
    console.log(`\n🪙 Test USDC Mint: ${testUsdcMint.toString()}`);

    // Create buyer USDC account and mint tokens
    const buyerUsdcAccount = await createAssociatedTokenAccount(
      connection,
      buyer,
      testUsdcMint,
      buyer.publicKey
    );
    await mintTo(
      connection,
      buyer,
      testUsdcMint,
      buyerUsdcAccount,
      buyer,
      1000_000_000 // 1000 USDC
    );
    console.log(`   ✅ Buyer USDC: 1000.00`);

    // Create seller USDC account
    await createAssociatedTokenAccount(
      connection,
      seller,
      testUsdcMint,
      seller.publicKey
    );
    console.log(`   ✅ Seller USDC account created`);

    // Create test NFT
    testNftMint = await createMint(
      connection,
      seller,
      seller.publicKey,
      null,
      0 // NFT: 0 decimals
    );
    console.log(`\n🎨 Test NFT Mint: ${testNftMint.toString()}`);

    // Mint NFT to seller
    const sellerNftAccount = await createAssociatedTokenAccount(
      connection,
      seller,
      testNftMint,
      seller.publicKey
    );
    await mintTo(
      connection,
      seller,
      testNftMint,
      sellerNftAccount,
      seller,
      1 // 1 NFT
    );
    console.log(`   ✅ Seller has NFT`);

    console.log("\n✅ Setup Complete!");
    console.log("=".repeat(60));
  });

  it("Should initialize escrow agreement with correct interface", async function () {
    this.timeout(60000);

    const escrowId = new BN(Date.now());
    const usdcAmount = new BN(100_000_000); // 100 USDC
    const expiry = new BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour

    console.log(`\n📝 Testing initAgreement...`);
    console.log(`   Escrow ID: ${escrowId.toString()}`);
    console.log(`   USDC Amount: ${usdcAmount.toString()} (100 USDC)`);
    console.log(`   Expiry: ${new Date(expiry.toNumber() * 1000).toISOString()}`);

    try {
      const tx = await program.methods
        .initAgreement(
          escrowId,
          usdcAmount,
          expiry
        )
        .accounts({
          buyer: buyer.publicKey,
          seller: seller.publicKey,
          nftMint: testNftMint,
          admin: admin.publicKey,
        })
        .signers([buyer])
        .rpc();

      console.log(`   ✅ Transaction: ${tx}`);
      console.log(`   🔗 https://explorer.solana.com/tx/${tx}?cluster=devnet`);

      // Derive and fetch escrow state
      const [escrowState] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), escrowId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowAccount = await program.account.escrowState.fetch(escrowState);
      
      console.log(`\n   📊 Escrow State:`);
      console.log(`      Buyer: ${escrowAccount.buyer.toString()}`);
      console.log(`      Seller: ${escrowAccount.seller.toString()}`);
      console.log(`      USDC Amount: ${escrowAccount.usdcAmount.toString()}`);
      console.log(`      NFT Mint: ${escrowAccount.nftMint.toString()}`);
      console.log(`      Status: ${JSON.stringify(escrowAccount.status)}`);

      assert.equal(escrowAccount.buyer.toString(), buyer.publicKey.toString());
      assert.equal(escrowAccount.seller.toString(), seller.publicKey.toString());
      assert.equal(escrowAccount.usdcAmount.toString(), usdcAmount.toString());
      assert.equal(escrowAccount.nftMint.toString(), testNftMint.toString());

      console.log(`\n   ✅ ALL ASSERTIONS PASSED!`);
      console.log(`   ✅ Program interface is CORRECT!`);
    } catch (error: any) {
      console.error(`\n   ❌ FAILED:`, error.message);
      if (error.logs) {
        console.error(`   Logs:`, error.logs);
      }
      throw error;
    }
  });

  it("Should deposit USDC with correct interface", async function () {
    this.timeout(60000);

    const escrowId = new BN(Date.now() + 1000);
    const usdcAmount = new BN(50_000_000); // 50 USDC
    const expiry = new BN(Math.floor(Date.now() / 1000) + 3600);

    console.log(`\n📝 Testing depositUsdc...`);

    // First create agreement
    await program.methods
      .initAgreement(escrowId, usdcAmount, expiry)
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        nftMint: testNftMint,
        admin: admin.publicKey,
      })
      .signers([buyer])
      .rpc();

    console.log(`   ✅ Agreement created`);

    // Now deposit USDC
    const buyerUsdcAccount = await getAssociatedTokenAddress(
      testUsdcMint,
      buyer.publicKey
    );

    try {
      const tx = await program.methods
        .depositUsdc()
        .accounts({
          buyer: buyer.publicKey,
          buyerUsdcAccount: buyerUsdcAccount,
          usdcMint: testUsdcMint,
        })
        .signers([buyer])
        .rpc();

      console.log(`   ✅ Transaction: ${tx}`);
      console.log(`   🔗 https://explorer.solana.com/tx/${tx}?cluster=devnet`);

      // Verify state
      const [escrowState] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), escrowId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowAccount = await program.account.escrowState.fetch(escrowState);
      assert(escrowAccount.buyerUsdcDeposited, "USDC deposit not recorded");

      console.log(`   ✅ USDC deposited successfully!`);
      console.log(`   ✅ Deposit interface is CORRECT!`);
    } catch (error: any) {
      console.error(`\n   ❌ FAILED:`, error.message);
      if (error.logs) {
        console.error(`   Logs:`, error.logs);
      }
      throw error;
    }
  });

  it("Should deposit NFT with correct interface", async function () {
    this.timeout(60000);

    const escrowId = new BN(Date.now() + 2000);
    const usdcAmount = new BN(75_000_000); // 75 USDC
    const expiry = new BN(Math.floor(Date.now() / 1000) + 3600);

    console.log(`\n📝 Testing depositNft...`);

    // Create agreement
    await program.methods
      .initAgreement(escrowId, usdcAmount, expiry)
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        nftMint: testNftMint,
        admin: admin.publicKey,
      })
      .signers([buyer])
      .rpc();

    console.log(`   ✅ Agreement created`);

    // Deposit NFT
    const sellerNftAccount = await getAssociatedTokenAddress(
      testNftMint,
      seller.publicKey
    );

    try {
      const tx = await program.methods
        .depositNft()
        .accounts({
          seller: seller.publicKey,
          sellerNftAccount: sellerNftAccount,
          nftMint: testNftMint,
        })
        .signers([seller])
        .rpc();

      console.log(`   ✅ Transaction: ${tx}`);
      console.log(`   🔗 https://explorer.solana.com/tx/${tx}?cluster=devnet`);

      // Verify state
      const [escrowState] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), escrowId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowAccount = await program.account.escrowState.fetch(escrowState);
      assert(escrowAccount.sellerNftDeposited, "NFT deposit not recorded");

      console.log(`   ✅ NFT deposited successfully!`);
      console.log(`   ✅ Deposit interface is CORRECT!`);
    } catch (error: any) {
      console.error(`\n   ❌ FAILED:`, error.message);
      if (error.logs) {
        console.error(`   Logs:`, error.logs);
      }
      throw error;
    }
  });

  after(() => {
    console.log("\n" + "=".repeat(60));
    console.log("🎉 SIMPLE DEVNET TEST COMPLETE!");
    console.log("✅ Program interface validated successfully");
    console.log("✅ Ready to expand to full E2E tests");
    console.log("=".repeat(60));
  });
});

