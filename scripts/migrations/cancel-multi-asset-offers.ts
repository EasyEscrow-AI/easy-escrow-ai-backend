/**
 * Migration: Cancel Multi-Asset Offers
 * 
 * Cancels all ACTIVE offers that have more than 1 asset per side.
 * These offers cannot be executed due to on-chain program limitations.
 * 
 * Run: npx ts-node scripts/migrations/cancel-multi-asset-offers.ts
 */

import { PrismaClient, OfferStatus } from '../../src/generated/prisma';

const prisma = new PrismaClient();

async function cancelMultiAssetOffers() {
  console.log('\n🔍 Finding invalid multi-asset offers...\n');
  
  try {
    // Find all ACTIVE offers
    const allActiveOffers = await prisma.swapOffer.findMany({
      where: {
        status: OfferStatus.ACTIVE,
      },
      select: {
        id: true,
        makerWallet: true,
        offeredAssets: true,
        requestedAssets: true,
        createdAt: true,
      },
    });
    
    console.log(`Found ${allActiveOffers.length} ACTIVE offers to check`);
    
    // Filter for offers with > 1 asset per side
    const invalidOffers = allActiveOffers.filter(offer => {
      const offeredAssets = offer.offeredAssets as Array<any>;
      const requestedAssets = offer.requestedAssets as Array<any>;
      
      return offeredAssets.length > 1 || requestedAssets.length > 1;
    });
    
    if (invalidOffers.length === 0) {
      console.log('✅ No invalid multi-asset offers found!');
      return;
    }
    
    console.log(`\n❌ Found ${invalidOffers.length} invalid multi-asset offers:\n`);
    
    // Show details of invalid offers
    invalidOffers.forEach(offer => {
      const offeredAssets = offer.offeredAssets as Array<any>;
      const requestedAssets = offer.requestedAssets as Array<any>;
      
      console.log(`  Offer ID: ${offer.id}`);
      console.log(`    Maker: ${offer.makerWallet}`);
      console.log(`    Offered: ${offeredAssets.length} assets`);
      console.log(`    Requested: ${requestedAssets.length} assets`);
      console.log(`    Created: ${offer.createdAt.toISOString()}`);
      console.log('');
    });
    
    // Ask for confirmation
    console.log('⚠️  These offers will be marked as CANCELLED');
    console.log('   Reason: Multi-asset swaps not yet supported on-chain\n');
    
    // Cancel them
    console.log('🔄 Cancelling invalid offers...\n');
    console.log('   Reason: Multi-asset swaps not yet supported on-chain\n');
    
    for (const offer of invalidOffers) {
      await prisma.swapOffer.update({
        where: { id: offer.id },
        data: {
          status: OfferStatus.CANCELLED,
        },
      });
      
      console.log(`✓ Cancelled offer ${offer.id}`);
    }
    
    console.log(`\n✅ Successfully cancelled ${invalidOffers.length} invalid offers`);
    
    // Show summary
    console.log('\n📊 Summary:');
    console.log(`   Total ACTIVE offers checked: ${allActiveOffers.length}`);
    console.log(`   Invalid multi-asset offers: ${invalidOffers.length}`);
    console.log(`   Remaining ACTIVE offers: ${allActiveOffers.length - invalidOffers.length}`);
    
    // Verify final state
    const remainingActive = await prisma.swapOffer.count({
      where: { status: OfferStatus.ACTIVE },
    });
    
    console.log(`\n✅ Verification: ${remainingActive} ACTIVE offers remaining\n`);
    
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
console.log('═'.repeat(80));
console.log('Migration: Cancel Multi-Asset Offers');
console.log('═'.repeat(80));

cancelMultiAssetOffers()
  .then(() => {
    console.log('Migration completed successfully ✓');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

