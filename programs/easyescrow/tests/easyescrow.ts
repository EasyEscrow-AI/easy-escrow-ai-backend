import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Easyescrow } from "../target/types/easyescrow";
import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAccount } from "@solana/spl-token";

describe("easyescrow", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Easyescrow as Program<Easyescrow>;
  const provider = anchor.getProvider();

  // Test accounts
  let buyer: Keypair;
  let seller: Keypair;
  let admin: Keypair;
  let usdcMint: PublicKey;
  let nftMint: PublicKey;
  let escrowId: number;

  before(async () => {
    // Generate keypairs
    buyer = Keypair.generate();
    seller = Keypair.generate();
    admin = Keypair.generate();
    escrowId = Math.floor(Math.random() * 1000000);

    // Airdrop SOL to accounts
    await provider.connection.requestAirdrop(buyer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(seller.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(admin.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);

    // Wait for airdrops to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create USDC mint (using native mint for testing)
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
  });

  it("Initializes escrow agreement", async () => {
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(escrowId.toString().padStart(8, "0"))],
      program.programId
    );

    const tx = await program.methods
      .initAgreement(
        new anchor.BN(escrowId),
        new anchor.BN(1000000), // 1 USDC (6 decimals)
        nftMint,
        new anchor.BN(Math.floor(Date.now() / 1000) + 3600) // 1 hour from now
      )
      .accounts({
        escrow: escrowPDA,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        nftTokenAccount: seller.publicKey, // Placeholder
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    console.log("Init agreement transaction signature:", tx);

    // Verify escrow account was created
    const escrowAccount = await program.account.escrowState.fetch(escrowPDA);
    expect(escrowAccount.escrowId.toNumber()).to.equal(escrowId);
    expect(escrowAccount.buyer.toString()).to.equal(buyer.publicKey.toString());
    expect(escrowAccount.seller.toString()).to.equal(seller.publicKey.toString());
    expect(escrowAccount.usdcAmount.toNumber()).to.equal(1000000);
    expect(escrowAccount.nftMint.toString()).to.equal(nftMint.toString());
  });

  it("Deposits USDC into escrow", async () => {
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(escrowId.toString().padStart(8, "0"))],
      program.programId
    );

    // Create buyer USDC account
    const buyerUsdcAccount = await createAccount(
      provider.connection,
      buyer,
      usdcMint,
      buyer.publicKey
    );

    // Create escrow USDC account
    const escrowUsdcAccount = await createAccount(
      provider.connection,
      buyer,
      usdcMint,
      escrowPDA
    );

    // Mint USDC to buyer
    await mintTo(
      provider.connection,
      buyer,
      usdcMint,
      buyerUsdcAccount,
      buyer,
      1000000 // 1 USDC
    );

    const tx = await program.methods
      .depositUsdc()
      .accounts({
        escrow: escrowPDA,
        buyer: buyer.publicKey,
        buyerUsdcAccount: buyerUsdcAccount,
        escrowUsdcAccount: escrowUsdcAccount,
        usdcMint: usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    console.log("Deposit USDC transaction signature:", tx);

    // Verify USDC was transferred
    const escrowUsdcBalance = await getAccount(provider.connection, escrowUsdcAccount);
    expect(Number(escrowUsdcBalance.amount)).to.equal(1000000);
  });

  it("Deposits NFT into escrow", async () => {
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(escrowId.toString().padStart(8, "0"))],
      program.programId
    );

    // Create seller NFT account
    const sellerNftAccount = await createAccount(
      provider.connection,
      seller,
      nftMint,
      seller.publicKey
    );

    // Create escrow NFT account
    const escrowNftAccount = await createAccount(
      provider.connection,
      seller,
      nftMint,
      escrowPDA
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

    const tx = await program.methods
      .depositNft()
      .accounts({
        escrow: escrowPDA,
        seller: seller.publicKey,
        sellerNftAccount: sellerNftAccount,
        escrowNftAccount: escrowNftAccount,
        nftMint: nftMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    console.log("Deposit NFT transaction signature:", tx);

    // Verify NFT was transferred
    const escrowNftBalance = await getAccount(provider.connection, escrowNftAccount);
    expect(Number(escrowNftBalance.amount)).to.equal(1);
  });

  it("Settles escrow", async () => {
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(escrowId.toString().padStart(8, "0"))],
      program.programId
    );

    // Create accounts for settlement
    const sellerUsdcAccount = await createAccount(
      provider.connection,
      seller,
      usdcMint,
      seller.publicKey
    );

    const buyerNftAccount = await createAccount(
      provider.connection,
      buyer,
      nftMint,
      buyer.publicKey
    );

    const escrowUsdcAccount = await createAccount(
      provider.connection,
      buyer,
      usdcMint,
      escrowPDA
    );

    const escrowNftAccount = await createAccount(
      provider.connection,
      seller,
      nftMint,
      escrowPDA
    );

    const tx = await program.methods
      .settle()
      .accounts({
        escrow: escrowPDA,
        escrowUsdcAccount: escrowUsdcAccount,
        sellerUsdcAccount: sellerUsdcAccount,
        escrowNftAccount: escrowNftAccount,
        buyerNftAccount: buyerNftAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Settle transaction signature:", tx);

    // Verify escrow status was updated
    const escrowAccount = await program.account.escrowState.fetch(escrowPDA);
    expect(escrowAccount.status).to.deep.equal({ completed: {} });
  });
});