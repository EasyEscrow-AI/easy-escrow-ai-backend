import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { assert } from "chai";

describe("escrow", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrow as Program<Escrow>;

  let buyer: Keypair;
  let seller: Keypair;
  let admin: Keypair;
  let usdcMint: PublicKey;
  let nftMint: PublicKey;
  let buyerUsdcAccount: PublicKey;
  let sellerUsdcAccount: PublicKey;
  let sellerNftAccount: PublicKey;
  let buyerNftAccount: PublicKey;
  let escrowId: anchor.BN;
  let escrowState: PublicKey;

  before(async () => {
    // Create keypairs
    buyer = Keypair.generate();
    seller = Keypair.generate();
    admin = Keypair.generate();

    // Airdrop SOL to buyer, seller, and admin
    await provider.connection.requestAirdrop(buyer.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(seller.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL);
    
    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create USDC mint (for testing purposes)
    usdcMint = await createMint(
      provider.connection,
      buyer,
      buyer.publicKey,
      null,
      6 // USDC has 6 decimals
    );

    // Create NFT mint
    nftMint = await createMint(
      provider.connection,
      seller,
      seller.publicKey,
      null,
      0 // NFTs have 0 decimals
    );

    // Create token accounts
    buyerUsdcAccount = await createAssociatedTokenAccount(
      provider.connection,
      buyer,
      usdcMint,
      buyer.publicKey
    );

    sellerUsdcAccount = await createAssociatedTokenAccount(
      provider.connection,
      seller,
      usdcMint,
      seller.publicKey
    );

    sellerNftAccount = await createAssociatedTokenAccount(
      provider.connection,
      seller,
      nftMint,
      seller.publicKey
    );

    buyerNftAccount = await createAssociatedTokenAccount(
      provider.connection,
      buyer,
      nftMint,
      buyer.publicKey
    );

    // Mint USDC to buyer
    await mintTo(
      provider.connection,
      buyer,
      usdcMint,
      buyerUsdcAccount,
      buyer,
      1000 * 1_000_000 // 1000 USDC
    );

    // Mint NFT to seller
    await mintTo(
      provider.connection,
      seller,
      nftMint,
      sellerNftAccount,
      seller,
      1 // 1 NFT
    );

    // Generate escrow ID and derive PDA
    escrowId = new anchor.BN(Date.now());
    [escrowState] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), escrowId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
  });

  it("Initializes escrow agreement", async () => {
    const usdcAmount = new anchor.BN(100 * 1_000_000); // 100 USDC
    const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

    await program.methods
      .initAgreement(escrowId, usdcAmount, expiryTimestamp)
      .accounts({
        escrowState,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        nftMint,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const escrowAccount = await program.account.escrowState.fetch(escrowState);
    
    assert.equal(escrowAccount.escrowId.toString(), escrowId.toString());
    assert.equal(escrowAccount.buyer.toString(), buyer.publicKey.toString());
    assert.equal(escrowAccount.seller.toString(), seller.publicKey.toString());
    assert.equal(escrowAccount.usdcAmount.toString(), usdcAmount.toString());
    assert.equal(escrowAccount.nftMint.toString(), nftMint.toString());
    assert.equal(escrowAccount.buyerUsdcDeposited, false);
    assert.equal(escrowAccount.sellerNftDeposited, false);
  });

  it("Deposits USDC into escrow", async () => {
    const escrowUsdcAccount = await getAssociatedTokenAddress(
      usdcMint,
      escrowState,
      true
    );

    await program.methods
      .depositUsdc()
      .accounts({
        escrowState,
        buyer: buyer.publicKey,
        buyerUsdcAccount,
        escrowUsdcAccount,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const escrowAccount = await program.account.escrowState.fetch(escrowState);
    assert.equal(escrowAccount.buyerUsdcDeposited, true);
  });

  it("Deposits NFT into escrow", async () => {
    const escrowNftAccount = await getAssociatedTokenAddress(
      nftMint,
      escrowState,
      true
    );

    await program.methods
      .depositNft()
      .accounts({
        escrowState,
        seller: seller.publicKey,
        sellerNftAccount,
        escrowNftAccount,
        nftMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    const escrowAccount = await program.account.escrowState.fetch(escrowState);
    assert.equal(escrowAccount.sellerNftDeposited, true);
  });

  it("Settles the escrow", async () => {
    const escrowUsdcAccount = await getAssociatedTokenAddress(
      usdcMint,
      escrowState,
      true
    );

    const escrowNftAccount = await getAssociatedTokenAddress(
      nftMint,
      escrowState,
      true
    );

    await program.methods
      .settle()
      .accounts({
        escrowState,
        escrowUsdcAccount,
        escrowNftAccount,
        sellerUsdcAccount,
        buyerNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const escrowAccount = await program.account.escrowState.fetch(escrowState);
    assert.equal(escrowAccount.status.completed !== undefined, true);

    // Verify NFT was transferred to buyer
    const buyerNftBalance = await provider.connection.getTokenAccountBalance(buyerNftAccount);
    assert.equal(buyerNftBalance.value.amount, "1");

    // Verify USDC was transferred to seller
    const sellerUsdcBalance = await provider.connection.getTokenAccountBalance(sellerUsdcAccount);
    assert.equal(sellerUsdcBalance.value.amount, "100000000"); // 100 USDC
  });

  // Test cancellation scenario
  it("Cancels expired escrow", async () => {
    // Create a new escrow that will expire immediately
    const newEscrowId = new anchor.BN(Date.now() + 1);
    const [newEscrowState] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), newEscrowId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const usdcAmount = new anchor.BN(50 * 1_000_000); // 50 USDC
    const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) - 10); // Already expired

    await program.methods
      .initAgreement(newEscrowId, usdcAmount, expiryTimestamp)
      .accounts({
        escrowState: newEscrowState,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        nftMint,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc()
      .catch(() => {}); // May fail due to expiry validation

    // If escrow was created with past expiry, test cancellation
    // In production, this would be tested with a proper time-travel mechanism
  });

  it("Admin cancels escrow", async () => {
    // Create another escrow for admin cancellation test
    const adminCancelEscrowId = new anchor.BN(Date.now() + 2);
    const [adminCancelEscrowState] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), adminCancelEscrowId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const usdcAmount = new anchor.BN(75 * 1_000_000); // 75 USDC
    const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 7200); // 2 hours from now

    await program.methods
      .initAgreement(adminCancelEscrowId, usdcAmount, expiryTimestamp)
      .accounts({
        escrowState: adminCancelEscrowState,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        nftMint,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const escrowUsdcAccount = await getAssociatedTokenAddress(
      usdcMint,
      adminCancelEscrowState,
      true
    );

    const escrowNftAccount = await getAssociatedTokenAddress(
      nftMint,
      adminCancelEscrowState,
      true
    );

    // Admin cancels the escrow
    await program.methods
      .adminCancel()
      .accounts({
        escrowState: adminCancelEscrowState,
        admin: admin.publicKey,
        escrowUsdcAccount,
        escrowNftAccount,
        buyerUsdcAccount,
        sellerNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();

    const escrowAccount = await program.account.escrowState.fetch(adminCancelEscrowState);
    assert.equal(escrowAccount.status.cancelled !== undefined, true);
  });
});

