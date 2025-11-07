// scripts/check-rent.ts
// Check if escrow PDA has enough transferable lamports for settlement
//
// Usage: 
//   npx ts-node scripts/check-rent.ts \
//     --rpc https://api.devnet.solana.com \
//     --escrow BZANsRJa5mcBFEwHvgxigTi2LxMDcSvw33twbBzvi7gm \
//     --need 100000000

import { Connection, PublicKey } from "@solana/web3.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const { argv } = yargs(hideBin(process.argv)) as any
  .option("rpc", { type: "string", demandOption: true })
  .option("escrow", { type: "string", demandOption: true })
  .option("need", { 
    type: "number", 
    demandOption: true, 
    desc: "platform_fee + seller_receives in lamports (e.g., 100000000 for 0.1 SOL)" 
  })
  .option("feeBps", {
    type: "number",
    default: 100,
    desc: "Platform fee in basis points (default: 100 = 1%)"
  });

(async () => {
  const connection = new Connection(String(argv.rpc), "confirmed");
  const escrow = new PublicKey(String(argv.escrow));
  
  console.log("🔍 Rent Exemption Check");
  console.log("=".repeat(80));
  console.log("Escrow PDA:", escrow.toBase58());
  console.log("=".repeat(80));

  const info = await connection.getAccountInfo(escrow, "confirmed");
  if (!info) {
    console.error("❌ Escrow PDA not found on-chain!");
    process.exit(1);
  }

  const min = await connection.getMinimumBalanceForRentExemption(info.data.length);
  const transferable = info.lamports - min;
  const needed = Number(argv.need);
  
  // Calculate fee breakdown
  const platformFee = Math.floor((needed * Number(argv.feeBps)) / 10000);
  const sellerReceives = needed - platformFee;

  console.log("\n📊 Account Info:");
  console.log("  Total lamports:", info.lamports.toLocaleString());
  console.log("  Data length:", info.data.length, "bytes");
  console.log("  Rent-exempt minimum:", min.toLocaleString(), "lamports");
  console.log("  Transferable lamports:", transferable.toLocaleString());
  
  console.log("\n💰 Settlement Amounts:");
  console.log("  Total to transfer:", needed.toLocaleString(), "lamports");
  console.log("  Platform fee:", platformFee.toLocaleString(), "lamports", `(${Number(argv.feeBps) / 100}%)`);
  console.log("  Seller receives:", sellerReceives.toLocaleString(), "lamports");
  
  console.log("\n📈 Analysis:");
  
  let surplus = 0;
  let shortfall = 0;
  
  if (transferable >= needed) {
    surplus = transferable - needed;
    console.log("  ✅ SUFFICIENT - Enough transferable lamports for settlement");
    console.log("  ✅ Surplus after settlement:", surplus.toLocaleString(), "lamports");
    console.log("  ✅ Escrow will remain rent-exempt with", min.toLocaleString(), "lamports");
  } else {
    shortfall = needed - transferable;
    console.log("  ❌ INSUFFICIENT - Not enough transferable lamports");
    console.log("  ❌ Shortfall:", shortfall.toLocaleString(), "lamports");
    console.log("  ❌ Settlement will fail with InsufficientFunds error");
  }
  
  console.log("\n💡 Recommendations:");
  if (transferable >= needed) {
    console.log("  • Proceed with settlement - rent exemption checks should pass");
    console.log("  • Escrow has sufficient balance minus rent-exempt minimum");
  } else {
    console.log("  • DO NOT attempt settlement - will fail");
    console.log("  • Escrow needs", shortfall.toLocaleString(), "more lamports");
    console.log("  • Check if SOL deposit amount matches expected solAmount");
  }
  
  console.log("=".repeat(80));
})();

