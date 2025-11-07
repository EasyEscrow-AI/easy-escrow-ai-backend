// scripts/settle-once.ts
// Manual settlement script to bypass monitoring and test settle instruction directly
//
// Usage: npx ts-node scripts/settle-once.ts <ESCROW_PDA> <SELLER> <BUYER> <FEE_COLLECTOR> <NFT_MINT> [--dryRun]
// Example:
//   npx ts-node scripts/settle-once.ts \
//     8Yrn6G4fEfveWLUMqCxUPf3Er8TxoPMYZXj5gyqAcyoW \
//     AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z \
//     5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 \
//     8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ \
//     Dxy1WYL7opVun3A46T5d39NvmMqGndSrfpXPmgV2h8ac \
//     --dryRun

import fs from "fs";
import * as anchor from "@coral-xyz/anchor";
import { web3, Program } from "@coral-xyz/anchor";

// Parse command line arguments
if (process.argv.length < 7) {
  console.error("Usage: npx ts-node scripts/settle-once.ts <ESCROW_PDA> <SELLER> <BUYER> <FEE_COLLECTOR> <NFT_MINT> [--dryRun]");
  process.exit(1);
}

const escrowPda = process.argv[2];
const sellerPubkey = process.argv[3];
const buyerPubkey = process.argv[4];
const feeCollectorPubkey = process.argv[5];
const nftMintPubkey = process.argv[6];
const dryRun = process.argv.includes("--dryRun");

// Staging defaults
const rpcUrl = "https://api.devnet.solana.com";
const idlPath = "./src/generated/anchor/escrow-idl-staging.json";
const programId = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei";
const payerPath = "./wallets/staging/staging-admin.json";

function loadKeypair(path: string): web3.Keypair {
  const secret = JSON.parse(fs.readFileSync(path, "utf8"));
  return web3.Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function getAssociatedTokenAddress(
  mint: web3.PublicKey,
  owner: web3.PublicKey,
  programId: web3.PublicKey = new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
): Promise<web3.PublicKey> {
  const [address] = await web3.PublicKey.findProgramAddress(
    [
      owner.toBuffer(),
      programId.toBuffer(),
      mint.toBuffer(),
    ],
    new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  );
  return address;
}

(async () => {
  const payer = loadKeypair(payerPath);
  const connection = new web3.Connection(rpcUrl, {
    commitment: "confirmed",
  });
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programIdPk = new web3.PublicKey(programId);
  const program = new anchor.Program(idl as any, provider);

  console.log("🔧 Manual Settlement Script");
  console.log("=".repeat(80));
  console.log("Program:", programIdPk.toBase58());
  console.log("Escrow PDA:", escrowPda);
  console.log("Seller:", sellerPubkey);
  console.log("Buyer:", buyerPubkey);
  console.log("Fee Collector:", feeCollectorPubkey);
  console.log("NFT Mint:", nftMintPubkey);
  console.log("Dry Run:", dryRun);
  console.log("=".repeat(80));

  const escrowPdaPk = new web3.PublicKey(escrowPda);
  const seller = new web3.PublicKey(sellerPubkey);
  const buyer = new web3.PublicKey(buyerPubkey);
  const feeCollector = new web3.PublicKey(feeCollectorPubkey);
  const nftMint = new web3.PublicKey(nftMintPubkey);

  // Derive token accounts
  const escrowNftAccount = await getAssociatedTokenAddress(nftMint, escrowPdaPk);
  const buyerNftAccount = await getAssociatedTokenAddress(nftMint, buyer);

  console.log("\n📦 Derived Accounts:");
  console.log("Escrow NFT Account:", escrowNftAccount.toBase58());
  console.log("Buyer NFT Account:", buyerNftAccount.toBase58());

  const tokenProgramId = new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const associatedTokenProgramId = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  const systemProgram = web3.SystemProgram.programId;

  const accounts = {
    caller: payer.publicKey,
    escrowState: escrowPdaPk,
    seller: seller,
    platformFeeCollector: feeCollector,
    escrowNftAccount: escrowNftAccount,
    buyerNftAccount: buyerNftAccount,
    buyer: buyer,
    nftMint: nftMint,
    tokenProgram: tokenProgramId,
    associatedTokenProgram: associatedTokenProgramId,
    systemProgram: systemProgram,
  };

  console.log("\n📋 Account Structure:");
  Object.entries(accounts).forEach(([key, value]) => {
    console.log(`  ${key}: ${value.toBase58()}`);
  });

  // Helpful compute budget (prevents CU errors from masquerading as logic errors)
  const cuIx1 = web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 });
  const cuIx2 = web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 });

  try {
    console.log("\n🔍 Fetching escrow state...");
    const escrowAccount = await connection.getAccountInfo(escrowPdaPk);
    if (escrowAccount) {
      console.log("Escrow balance:", escrowAccount.lamports, "lamports");
      console.log("Escrow data length:", escrowAccount.data.length, "bytes");
    } else {
      console.error("❌ Escrow account not found!");
      process.exit(1);
    }

    // 1) Simulate (to get full logs)
    if (dryRun) {
      console.log("\n🧪 Running simulation...");
      try {
        const sim = await (program.methods as any)
          .settle()
          .accountsStrict(accounts)
          .preInstructions([cuIx1, cuIx2])
          .simulate();
        console.log("\n✅ Simulation succeeded!");
        console.log("Logs:", sim.raw?.logs ?? sim.logs);
      } catch (simErr: any) {
        console.error("\n❌ Simulation failed!");
        if (simErr?.logs) {
          console.error("\nProgram logs:");
          simErr.logs.forEach((log: string) => console.error("  ", log));
        }
        if (simErr?.error?.errorCode) {
          console.error("\nAnchor error code:", simErr.error.errorCode);
          console.error("Error message:", simErr.error.errorMessage);
        }
        throw simErr;
      }
      return;
    }

    // 2) Send real tx
    console.log("\n🚀 Sending settlement transaction...");
    const txSig = await (program.methods as any)
      .settle()
      .accountsStrict(accounts)
      .preInstructions([cuIx1, cuIx2])
      .rpc();

    console.log("\n✅ Settlement successful!");
    console.log("Transaction:", txSig);
    console.log("Explorer:", `https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
  } catch (e: any) {
    console.error("\n❌ Settlement failed!");
    console.error("=".repeat(80));
    
    if (e?.logs) {
      console.error("\n📜 Program logs:");
      e.logs.forEach((log: string) => console.error("  ", log));
    }
    
    if (e?.error?.errorCode) {
      console.error("\n🚨 Anchor error:");
      console.error("  Code:", e.error.errorCode);
      console.error("  Message:", e.error.errorMessage);
      console.error("  Name:", e.error.errorName);
    }
    
    if (e?.message) {
      console.error("\n💬 Error message:", e.message);
    }
    
    console.error("\n📚 Full error object:");
    console.error(JSON.stringify(e, null, 2));
    
    process.exit(1);
  }
})();

