// scripts/check-db-agreement.ts
// Check if agreement exists in database and its current status
//
// Usage: npx ts-node scripts/check-db-agreement.ts AGR-MHMQN7YW-X45S7QBL

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();
const agreementId = process.argv[2];

if (!agreementId) {
  console.error("Usage: npx ts-node scripts/check-db-agreement.ts <AGREEMENT_ID>");
  process.exit(1);
}

(async () => {
  console.log("🔍 Database Agreement Check");
  console.log("=".repeat(80));
  console.log("Agreement ID:", agreementId);
  console.log("=".repeat(80));

  try {
    const agreement: any = await prisma.agreement.findUnique({
      where: { agreementId },
      include: { deposits: true },
    });

    if (!agreement) {
      console.error("\n❌ Agreement not found in database!");
      console.error("Possible reasons:");
      console.error("  • Wrong agreement ID");
      console.error("  • Different DATABASE_URL in environment");
      console.error("  • Agreement was deleted");
      process.exit(1);
    }

    console.log("\n✅ Agreement found in database!");
    console.log("\n📋 Agreement Details:");
    console.log("  ID (internal):", agreement.id);
    console.log("  Agreement ID:", agreement.agreementId);
    console.log("  Status:", agreement.status);
    console.log("  Swap Type:", agreement.swapType);
    console.log("  Expiry:", agreement.expiry.toISOString());
    console.log("  Is Expired:", new Date() > agreement.expiry);
    console.log("  Escrow PDA:", agreement.escrowPda);
    console.log("  Seller:", agreement.seller);
    console.log("  Buyer:", agreement.buyer);

    console.log("\n💰 Financial Details:");
    console.log("  SOL Amount:", agreement.solAmount, "lamports");
    console.log("  Platform Fee BPS:", agreement.platformFeeBps);
    console.log("  Fee Payer:", agreement.feePayer);

    console.log("\n🎨 NFT Details:");
    console.log("  NFT Mint:", agreement.nftMint);
    
    console.log("\n📦 Deposits:");
    console.log("  Total Deposits:", agreement.deposits.length);
    agreement.deposits.forEach((deposit: any, i: number) => {
      console.log(`  Deposit ${i + 1}:`, deposit.assetType, "-", deposit.status);
    });

    console.log("\n🔍 Ready for Settlement?");
    const notExpired = new Date() < agreement.expiry;
    const isBothLocked = agreement.status === "BOTH_LOCKED";
    
    console.log("  Status is BOTH_LOCKED:", isBothLocked ? "✅" : "❌");
    console.log("  Not expired:", notExpired ? "✅" : "❌");
    
    if (isBothLocked && notExpired) {
      console.log("\n✅ Agreement is ready for settlement!");
      console.log("   If MonitoringService is running, it should pick this up.");
    } else if (!isBothLocked) {
      console.log("\n⚠️  Agreement status is not BOTH_LOCKED");
      console.log("   Current status:", agreement.status);
    } else if (!notExpired) {
      console.log("\n⚠️  Agreement has expired");
      console.log("   Should be marked as EXPIRED instead of settled");
    }

  } catch (error: any) {
    console.error("\n❌ Database error:", error.message);
    console.error("\nPossible causes:");
    console.error("  • Database connection failed");
    console.error("  • Wrong DATABASE_URL in .env");
    console.error("  • Schema not migrated");
  } finally {
    await prisma.$disconnect();
  }

  console.log("=".repeat(80));
})();

