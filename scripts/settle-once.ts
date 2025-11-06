// scripts/settle-once.ts
// Manual settlement script to bypass monitoring and test settle instruction directly
//
// Usage:
//   npx ts-node scripts/settle-once.ts \
//     --rpc https://api.devnet.solana.com \
//     --idl ./target/idl/escrow.json \
//     --program AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
//     --payer ./wallets/staging/staging-admin.json \
//     --escrow BZANsRJa5mcBFEwHvgxigTi2LxMDcSvw33twbBzvi7gm \
//     --seller AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z \
//     --buyer 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 \
//     --feeCollector 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ \
//     --nftMint FKsTLGQkjbEZUC9D2uJ4EpyjVdadidbeVmXSzAzAs2Tg

import fs from "fs";
import * as anchor from "@coral-xyz/anchor";
import { web3, BN, Program } from "@coral-xyz/anchor";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const { argv } = yargs(hideBin(process.argv)) as any
  .option("rpc", { type: "string", demandOption: true })
  .option("idl", { type: "string", demandOption: true })
  .option("program", { type: "string", demandOption: true })
  .option("payer", { type: "string", demandOption: true })
  .option("escrow", { type: "string", demandOption: true })
  .option("seller", { type: "string", demandOption: true })
  .option("buyer", { type: "string", demandOption: true })
  .option("feeCollector", { type: "string", demandOption: true })
  .option("nftMint", { type: "string", demandOption: true })
  .option("dryRun", { type: "boolean", default: false });

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
  const payer = loadKeypair(String(argv.payer));
  const connection = new web3.Connection(String(argv.rpc), {
    commitment: "confirmed",
  });
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(String(argv.idl), "utf8"));
  const programId = new web3.PublicKey(String(argv.program));
  const program = new anchor.Program(idl, programId, provider) as Program;

  console.log("🔧 Manual Settlement Script");
  console.log("=".repeat(80));
  console.log("Program:", programId.toBase58());
  console.log("Escrow PDA:", String(argv.escrow));
  console.log("Seller:", String(argv.seller));
  console.log("Buyer:", String(argv.buyer));
  console.log("Fee Collector:", String(argv.feeCollector));
  console.log("NFT Mint:", String(argv.nftMint));
  console.log("Dry Run:", argv.dryRun);
  console.log("=".repeat(80));

  const escrowPda = new web3.PublicKey(String(argv.escrow));
  const seller = new web3.PublicKey(String(argv.seller));
  const buyer = new web3.PublicKey(String(argv.buyer));
  const feeCollector = new web3.PublicKey(String(argv.feeCollector));
  const nftMint = new web3.PublicKey(String(argv.nftMint));

  // Derive token accounts
  const escrowNftAccount = await getAssociatedTokenAddress(nftMint, escrowPda);
  const buyerNftAccount = await getAssociatedTokenAddress(nftMint, buyer);

  console.log("\n📦 Derived Accounts:");
  console.log("Escrow NFT Account:", escrowNftAccount.toBase58());
  console.log("Buyer NFT Account:", buyerNftAccount.toBase58());

  const tokenProgramId = new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const associatedTokenProgramId = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  const systemProgram = web3.SystemProgram.programId;

  const accounts = {
    caller: payer.publicKey,
    escrowState: escrowPda,
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
    const escrowAccount = await connection.getAccountInfo(escrowPda);
    if (escrowAccount) {
      console.log("Escrow balance:", escrowAccount.lamports, "lamports");
      console.log("Escrow data length:", escrowAccount.data.length, "bytes");
    } else {
      console.error("❌ Escrow account not found!");
      process.exit(1);
    }

    // 1) Simulate (to get full logs)
    if (argv.dryRun) {
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

