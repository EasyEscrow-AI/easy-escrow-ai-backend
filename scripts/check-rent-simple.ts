// scripts/check-rent-simple.ts
// Check if escrow PDA has enough transferable lamports for settlement
//
// Usage: 
//   npx ts-node scripts/check-rent-simple.ts \
//     BZANsRJa5mcBFEwHvgxigTi2LxMDcSvw33twbBzvi7gm \
//     100000000

import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = "https://api.devnet.solana.com";
const escrowPda = process.argv[2];
const needed = parseInt(process.argv[3] || "100000000");
const feeBps = 100; // 1%

if (!escrowPda) {
  console.error("Usage: npx ts-node scripts/check-rent-simple.ts <ESCROW_PDA> [NEEDED_LAMPORTS]");
  process.exit(1);
}

(async () => {
  const connection = new Connection(RPC_URL, "confirmed");
  const escrow = new PublicKey(escrowPda);
  
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
  
  // Calculate fee breakdown
  const platformFee = Math.floor((needed * feeBps) / 10000);
  const sellerReceives = needed - platformFee;

  console.log("\n📊 Account Info:");
  console.log("  Total lamports:", info.lamports.toLocaleString());
  console.log("  Data length:", info.data.length, "bytes");
  console.log("  Rent-exempt minimum:", min.toLocaleString(), "lamports");
  console.log("  Transferable lamports:", transferable.toLocaleString());
  
  console.log("\n💰 Settlement Amounts:");
  console.log("  Total to transfer:", needed.toLocaleString(), "lamports");
  console.log("  Platform fee:", platformFee.toLocaleString(), "lamports", `(${feeBps / 100}%)`);
  console.log("  Seller receives:", sellerReceives.toLocaleString(), "lamports");
  
  console.log("\n📈 Analysis:");
  
  if (transferable >= needed) {
    const surplus = transferable - needed;
    console.log("  ✅ SUFFICIENT - Enough transferable lamports for settlement");
    console.log("  ✅ Surplus after settlement:", surplus.toLocaleString(), "lamports");
    console.log("  ✅ Escrow will remain rent-exempt with", min.toLocaleString(), "lamports");
    
    console.log("\n💡 Recommendations:");
    console.log("  • Proceed with settlement - rent exemption checks should pass");
    console.log("  • Escrow has sufficient balance minus rent-exempt minimum");
  } else {
    const shortfall = needed - transferable;
    console.log("  ❌ INSUFFICIENT - Not enough transferable lamports");
    console.log("  ❌ Shortfall:", shortfall.toLocaleString(), "lamports");
    console.log("  ❌ Settlement will fail with InsufficientFunds error");
    
    console.log("\n💡 Recommendations:");
    console.log("  • DO NOT attempt settlement - will fail");
    console.log("  • Escrow needs", shortfall.toLocaleString(), "more lamports");
    console.log("  • Check if SOL deposit amount matches expected solAmount");
  }
  
  console.log("=".repeat(80));
})();

