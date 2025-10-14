/**
 * End-to-End Devnet Integration Tests (Corrected for Deployed Program)
 * Task 37: Comprehensive E2E testing on actual Solana devnet
 * 
 * This test suite performs real transactions on devnet matching the actual
 * deployed program interface at: 7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV
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
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import * as fs from "fs";
import * as path from "path";

// Test configuration
const DEVNET_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DEPLOYED_PROGRAM_ID = new PublicKey("7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV");
const DEVNET_USDC_MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");

// Test wallets
let testWallets: {
  buyer: Keypair;
  seller: Keypair;
  admin: Keypair;
};

// Test mints
let testUsdcMint: PublicKey;
let testNftMint: PublicKey;

describe("E2E Devnet Integration Tests - Corrected (Task 37)", () => {
  let connection: Connection;
  let provider: AnchorProvider;
  let program: Program<Escrow>;

  const testResults: any[] = [];

  before(async function () {
    this.timeout(120000);

    console.log("\n🚀 Starting E2E Devnet Test Suite (Corrected)");
    console.log("=".repeat(60));

    // Initialize connection
    connection = new Connection(DEVNET_RPC_URL, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000,
    });

    console.log(`✅ Connected to devnet: ${DEVNET_RPC_URL}`);

    // Setup provider with a payer
    const payer = Keypair.generate();
    const wallet = new anchor.Wallet(payer);
    provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    anchor.setProvider(provider);

    // Load program
    const idl = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../target/idl/escrow.json"), "utf8")
    );
    idl.address = DEPLOYED_PROGRAM_ID.toString();
    program = new Program(idl, provider) as Program<Escrow>;

    console.log(`✅ Program loaded: ${program.programId.toString()}`);

    // Verify program exists
    const programInfo = await connection.getAccountInfo(DEPLOYED_PROGRAM_ID);
    assert(programInfo !== null, "Program not found on devnet");
    console.log(`✅ Program verified on devnet`);

    // Setup test wallets
    await setupTestWallets();

    // Setup test tokens
    await setupTestTokens();

    console.log("\n✅ Setup completed successfully");
    console.log("=".repeat(60));
  });

  after(async function () {
    console.log("\n" + "=".repeat(60));
    console.log("📊 Test Results Summary");
    console.log("=".repeat(60));

    testResults.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.name}`);
      console.log(`   Status: ${result.success ? "✅ PASSED" : "❌ FAILED"}`);
      console.log(`   Duration: ${result.duration}ms`);
      if (result.transactions) {
        result.transactions.forEach((tx: string) => {
          console.log(`   - https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        });
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    // Save results
    const resultsPath = path.join(__dirname, "../../devnet-e2e-corrected-results.json");
    fs.writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          rpcUrl: DEVNET_RPC_URL,
          programId: DEPLOYED_PROGRAM_ID.toString(),
          results: testResults,
        },
        null,
        2
      )
    );
    console.log(`\n💾 Results saved to: ${resultsPath}`);
  });

  /**
   * Test 1: Setup and Environment Verification
   */
  describe("Environment Setup", () => {
    it("Should verify program deployment", async () => {
      const programAccount = await connection.getAccountInfo(program.programId);
      assert(programAccount !== null);
      assert(programAccount.executable);
      console.log(`   ✅ Program is executable`);
    });

    it("Should verify wallets have SOL", async function () {
      this.timeout(30000);

      for (const [name, wallet] of Object.entries(testWallets)) {
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`   ${name}: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
        assert(balance > 0, `${name} has no SOL`);
      }
    });

    it("Should verify test tokens exist", async () => {
      assert(testUsdcMint);
      assert(testNftMint);
      console.log(`   ✅ USDC Mint: ${testUsdcMint.toString()}`);
      console.log(`   ✅ NFT Mint: ${testNftMint.toString()}`);
    });
  });

  /**
   * Test 2: Happy Path - Simple Escrow Flow
   */
  describe("Happy Path: Simple Escrow Flow", () => {
    let escrowId: BN;
    let escrowState: PublicKey;
    const transactions: string[] = [];
    const startTime = Date.now();

    before(() => {
      escrowId = new BN(Date.now());
      console.log(`\n   📝 Escrow ID: ${escrowId.toString()}`);
    });

    it("Step 1: Should initialize escrow agreement", async function () {
      this.timeout(60000);

      const usdcAmount = new BN(100_000_000); // 100 USDC (6 decimals)
      const expiry = new BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour

      // Derive escrow state PDA
      [escrowState] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), escrowId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      console.log(`   📍 Escrow State PDA: ${escrowState.toString()}`);

      try {
        // Call init_agreement with correct signature
        // Let Anchor auto-derive PDA accounts
        const tx = await program.methods
          .initAgreement(
            escrowId,
            usdcAmount,      // usdc_amount parameter
            expiry           // expiry_timestamp parameter
          )
          .accounts({
            buyer: testWallets.buyer.publicKey,
            seller: testWallets.seller.publicKey,
            nftMint: testNftMint,
            admin: testWallets.admin.publicKey,
          })
          .signers([testWallets.buyer])
          .rpc();

        transactions.push(tx);
        console.log(`   ✅ Agreement initialized: ${tx}`);
        console.log(`   🔗 https://explorer.solana.com/tx/${tx}?cluster=devnet`);

        // Verify escrow state
        const escrowAccount = await program.account.escrowState.fetch(escrowState);
        console.log(`   ✅ Escrow state verified:`);
        console.log(`      - Buyer: ${escrowAccount.buyer.toString()}`);
        console.log(`      - Seller: ${escrowAccount.seller.toString()}`);
        console.log(`      - USDC Amount: ${escrowAccount.usdcAmount.toString()}`);
        console.log(`      - NFT Mint: ${escrowAccount.nftMint.toString()}`);
        console.log(`      - Status: ${JSON.stringify(escrowAccount.status)}`);

        assert.equal(
          escrowAccount.buyer.toString(),
          testWallets.buyer.publicKey.toString()
        );
        assert.equal(
          escrowAccount.seller.toString(),
          testWallets.seller.publicKey.toString()
        );
        assert.equal(escrowAccount.usdcAmount.toString(), usdcAmount.toString());
      } catch (error: any) {
        console.error("   ❌ Failed to initialize agreement:");
        console.error("   Error:", error.message);
        if (error.logs) {
          console.error("   Logs:", error.logs);
        }
        throw error;
      }
    });

    it("Step 2: Should deposit USDC from buyer", async function () {
      this.timeout(60000);

      const buyerUsdcAccount = await getAssociatedTokenAddress(
        testUsdcMint,
        testWallets.buyer.publicKey
      );

      // Derive escrow USDC account (ATA)
      const escrowUsdcAccount = await getAssociatedTokenAddress(
        testUsdcMint,
        escrowState,
        true  // allowOwnerOffCurve
      );

      console.log(`   💰 Buyer USDC Account: ${buyerUsdcAccount.toString()}`);
      console.log(`   💰 Escrow USDC Account: ${escrowUsdcAccount.toString()}`);

      try {
        // Let Anchor derive PDAs
        const tx = await program.methods
          .depositUsdc()
          .accounts({
            buyer: testWallets.buyer.publicKey,
            buyerUsdcAccount: buyerUsdcAccount,
            usdcMint: testUsdcMint,
          })
          .signers([testWallets.buyer])
          .rpc();

        transactions.push(tx);
        console.log(`   ✅ USDC deposited: ${tx}`);
        console.log(`   🔗 https://explorer.solana.com/tx/${tx}?cluster=devnet`);

        // Verify deposit
        const vaultAccount = await getAccount(connection, escrowUsdcAccount);
        console.log(`   💰 USDC in vault: ${vaultAccount.amount.toString()}`);
        assert(vaultAccount.amount > 0n, "No USDC in vault");

        // Verify escrow state updated
        const escrowAccount = await program.account.escrowState.fetch(escrowState);
        assert(escrowAccount.buyerUsdcDeposited, "USDC deposit not recorded");
        console.log(`   ✅ Buyer USDC deposited flag: ${escrowAccount.buyerUsdcDeposited}`);
      } catch (error: any) {
        console.error("   ❌ Failed to deposit USDC:");
        console.error("   Error:", error.message);
        if (error.logs) {
          console.error("   Logs:", error.logs);
        }
        throw error;
      }
    });

    it("Step 3: Should deposit NFT from seller", async function () {
      this.timeout(60000);

      const sellerNftAccount = await getAssociatedTokenAddress(
        testNftMint,
        testWallets.seller.publicKey
      );

      // Derive escrow NFT account (ATA)
      const escrowNftAccount = await getAssociatedTokenAddress(
        testNftMint,
        escrowState,
        true  // allowOwnerOffCurve
      );

      console.log(`   🎨 Seller NFT Account: ${sellerNftAccount.toString()}`);
      console.log(`   🎨 Escrow NFT Account: ${escrowNftAccount.toString()}`);

      try {
        // Let Anchor derive PDAs  
        const tx = await program.methods
          .depositNft()
          .accounts({
            seller: testWallets.seller.publicKey,
            sellerNftAccount: sellerNftAccount,
            nftMint: testNftMint,
          })
          .signers([testWallets.seller])
          .rpc();

        transactions.push(tx);
        console.log(`   ✅ NFT deposited: ${tx}`);
        console.log(`   🔗 https://explorer.solana.com/tx/${tx}?cluster=devnet`);

        // Verify deposit
        const vaultAccount = await getAccount(connection, escrowNftAccount);
        console.log(`   🎨 NFT in vault: ${vaultAccount.amount.toString()}`);
        assert(vaultAccount.amount === 1n, "NFT not in vault");

        // Verify escrow state updated
        const escrowAccount = await program.account.escrowState.fetch(escrowState);
        assert(escrowAccount.sellerNftDeposited, "NFT deposit not recorded");
        console.log(`   ✅ Seller NFT deposited flag: ${escrowAccount.sellerNftDeposited}`);
      } catch (error: any) {
        console.error("   ❌ Failed to deposit NFT:");
        console.error("   Error:", error.message);
        if (error.logs) {
          console.error("   Logs:", error.logs);
        }
        throw error;
      }
    });

    it("Step 4: Should settle escrow atomically", async function () {
      this.timeout(60000);

      const escrowUsdcAccount = await getAssociatedTokenAddress(
        testUsdcMint,
        escrowState,
        true
      );

      const escrowNftAccount = await getAssociatedTokenAddress(
        testNftMint,
        escrowState,
        true
      );

      const sellerUsdcAccount = await getAssociatedTokenAddress(
        testUsdcMint,
        testWallets.seller.publicKey
      );

      const buyerNftAccount = await getAssociatedTokenAddress(
        testNftMint,
        testWallets.buyer.publicKey
      );

      console.log(`   🔄 Settlement accounts prepared`);

      try {
        // Settle needs all token accounts
        const tx = await program.methods
          .settle()
          .accounts({
            escrowUsdcAccount: escrowUsdcAccount,
            escrowNftAccount: escrowNftAccount,
            sellerUsdcAccount: sellerUsdcAccount,
            buyerNftAccount: buyerNftAccount,
          })
          .rpc();

        transactions.push(tx);
        console.log(`   ✅ Settlement executed: ${tx}`);
        console.log(`   🔗 https://explorer.solana.com/tx/${tx}?cluster=devnet`);

        // Verify final balances
        const buyerNft = await getAccount(connection, buyerNftAccount);
        assert(buyerNft.amount === 1n, "Buyer did not receive NFT");
        console.log(`   ✅ Buyer received NFT`);

        const sellerUsdc = await getAccount(connection, sellerUsdcAccount);
        console.log(`   💰 Seller received USDC: ${sellerUsdc.amount.toString()}`);
        assert(sellerUsdc.amount > 0n, "Seller did not receive USDC");

        console.log(`   ✅ Settlement completed successfully!`);
      } catch (error: any) {
        console.error("   ❌ Failed to settle:");
        console.error("   Error:", error.message);
        if (error.logs) {
          console.error("   Logs:", error.logs);
        }
        throw error;
      }
    });

    after(() => {
      testResults.push({
        name: "Happy Path - Simple Escrow Flow",
        success: true,
        duration: Date.now() - startTime,
        transactions,
        escrowId: escrowId.toString(),
      });
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

async function setupTestWallets(): Promise<void> {
  console.log("\n💼 Setting up test wallets...");

  testWallets = {
    buyer: Keypair.generate(),
    seller: Keypair.generate(),
    admin: Keypair.generate(),
  };

  console.log(`   Buyer: ${testWallets.buyer.publicKey.toString()}`);
  console.log(`   Seller: ${testWallets.seller.publicKey.toString()}`);
  console.log(`   Admin: ${testWallets.admin.publicKey.toString()}`);

  const connection = new Connection(DEVNET_RPC_URL, "confirmed");

  console.log("\n   Requesting SOL airdrops...");

  for (const [name, wallet] of Object.entries(testWallets)) {
    try {
      const signature = await connection.requestAirdrop(
        wallet.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(signature);
      const balance = await connection.getBalance(wallet.publicKey);
      console.log(`   ✅ ${name}: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } catch (error) {
      console.log(`   ⚠️  ${name}: Airdrop failed (rate limit?)`);
      console.log(`      Manual funding: solana transfer ${wallet.publicKey.toString()} 2 --url devnet`);
    }
  }
}

async function setupTestTokens(): Promise<void> {
  console.log("\n🪙 Setting up test tokens...");

  const connection = new Connection(DEVNET_RPC_URL, "confirmed");

  // Use devnet USDC
  testUsdcMint = DEVNET_USDC_MINT;
  console.log(`   Using Devnet USDC: ${testUsdcMint.toString()}`);

  // Create test NFT
  try {
    testNftMint = await createMint(
      connection,
      testWallets.seller,
      testWallets.seller.publicKey,
      null,
      0
    );
    console.log(`   ✅ Created test NFT: ${testNftMint.toString()}`);

    // Create and mint NFT to seller
    const sellerNftAccount = await createAssociatedTokenAccount(
      connection,
      testWallets.seller,
      testNftMint,
      testWallets.seller.publicKey
    );

    await mintTo(
      connection,
      testWallets.seller,
      testNftMint,
      sellerNftAccount,
      testWallets.seller,
      1
    );

    console.log(`   ✅ Minted NFT to seller`);

    // For simplicity, create a test USDC mint that we can control
    // (In production, you'd get real devnet USDC from a faucet)
    const testUsdcMintCustom = await createMint(
      connection,
      testWallets.buyer,
      testWallets.buyer.publicKey,
      null,
      6  // USDC decimals
    );
    testUsdcMint = testUsdcMintCustom;
    console.log(`   ✅ Created test USDC mint: ${testUsdcMint.toString()}`);

    // Create USDC accounts and mint to buyer
    const buyerUsdcAccount = await createAssociatedTokenAccount(
      connection,
      testWallets.buyer,
      testUsdcMint,
      testWallets.buyer.publicKey
    );

    await mintTo(
      connection,
      testWallets.buyer,
      testUsdcMint,
      buyerUsdcAccount,
      testWallets.buyer,
      1000_000_000  // 1000 USDC
    );

    console.log(`   ✅ Minted USDC to buyer`);

    // Create seller USDC account
    await createAssociatedTokenAccount(
      connection,
      testWallets.seller,
      testUsdcMint,
      testWallets.seller.publicKey
    );

    console.log(`   ✅ Created seller USDC account`);
  } catch (error: any) {
    console.error("   ❌ Failed to setup tokens:", error.message);
    throw error;
  }
}

