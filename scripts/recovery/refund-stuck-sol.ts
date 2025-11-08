/**
 * Emergency Script: Refund Stuck SOL from Failed Test Agreements
 * 
 * This script recovers SOL stuck in sol_vault PDAs from agreements that:
 * 1. Reached BOTH_LOCKED status
 * 2. Failed to settle (Custom error 2000)
 * 3. Were marked ARCHIVED in database but never refunded on-chain
 * 
 * CRITICAL: This script requires MAINNET_ADMIN_PRIVATE_KEY to be set
 * 
 * Usage: 
 *   NODE_ENV=production npx ts-node scripts/recovery/refund-stuck-sol.ts
 * 
 * Or on production server:
 *   cd /app && NODE_ENV=production npx ts-node scripts/recovery/refund-stuck-sol.ts
 */

import { PublicKey } from '@solana/web3.js';
import { prisma } from '../../src/config/database';
import { EscrowProgramService } from '../../src/services/escrow-program.service';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Verify we're in production environment
if (process.env.NODE_ENV !== 'production') {
  console.error('❌ ERROR: This script must be run with NODE_ENV=production');
  console.error('   This is to prevent accidental refunds on staging/development');
  console.error('');
  console.error('Usage: NODE_ENV=production npx ts-node scripts/recovery/refund-stuck-sol.ts');
  process.exit(1);
}

// Verify admin key is present
if (!process.env.MAINNET_ADMIN_PRIVATE_KEY) {
  console.error('❌ ERROR: MAINNET_ADMIN_PRIVATE_KEY not found in environment');
  console.error('   This script requires production admin access to issue refunds');
  process.exit(1);
}

const STUCK_AGREEMENTS = [
  'AGR-MHPSOTOW-8G04QMWN',
  'AGR-MHPSGPU7-NT4ZWHHH',
  'AGR-MHPROHD0-Q5N5RP3T',
];

async function main() {
  console.log('================================================================================');
  console.log('🔧 EMERGENCY RECOVERY: Refunding Stuck SOL from Failed Test Agreements');
  console.log('================================================================================');
  console.log('');
  console.log('Environment: PRODUCTION');
  console.log(`Admin Key: ${process.env.MAINNET_ADMIN_PRIVATE_KEY ? '✅ Loaded' : '❌ Missing'}`);
  console.log(`Agreements to Process: ${STUCK_AGREEMENTS.length}`);
  console.log('');
  console.log('⚠️  WARNING: This will issue on-chain transactions to refund SOL');
  console.log('');
  
  // Safety confirmation
  console.log('Press Ctrl+C to cancel or wait 5 seconds to proceed...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log('');
  console.log('🚀 Starting recovery process...\n');

  const escrowService = new EscrowProgramService();
  let successCount = 0;
  let failCount = 0;

  for (const agreementId of STUCK_AGREEMENTS) {
    console.log('─'.repeat(80));
    console.log(`\n📋 Processing ${agreementId}...`);

    try {
      // Fetch agreement from database
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId },
        include: { deposits: true },
      });

      if (!agreement) {
        console.log(`  ❌ Agreement not found in database`);
        continue;
      }

      console.log(`  Status: ${agreement.status}`);
      console.log(`  Escrow PDA: ${agreement.escrowPda}`);
      console.log(`  Buyer: ${agreement.buyer}`);

      // Check if SOL was deposited
      const solDeposit = agreement.deposits.find(d => d.type === 'SOL');
      if (!solDeposit) {
        console.log(`  ℹ️  No SOL deposit found`);
        continue;
      }

      console.log(`  SOL Amount: ${solDeposit.amount} SOL`);

      // Issue admin cancel to refund SOL
      console.log(`  🔄 Issuing admin refund...`);

      const txId = await escrowService.adminCancel({
        escrowPda: new PublicKey(agreement.escrowPda),
        buyer: new PublicKey(agreement.buyer!),
        seller: new PublicKey(agreement.seller),
        nftMint: new PublicKey(agreement.nftMint),
        swapType: agreement.swapType as 'NFT_FOR_SOL' | 'NFT_FOR_NFT_WITH_FEE' | 'NFT_FOR_NFT_PLUS_SOL',
        nftBMint: agreement.nftBMint ? new PublicKey(agreement.nftBMint) : undefined,
        // escrowId will be fetched from on-chain state automatically
      });

      console.log(`  ✅ Refund transaction: https://explorer.solana.com/tx/${txId}?cluster=mainnet-beta`);

      // Update agreement status in database
      await prisma.agreement.update({
        where: { agreementId },
        data: { status: 'CANCELLED' },
      });

      console.log(`  ✅ Agreement status updated to CANCELLED`);
      
      successCount++;

    } catch (error) {
      console.error(`  ❌ Error refunding ${agreementId}:`, error);
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 RECOVERY SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log(`✅ Successful Refunds: ${successCount}/${STUCK_AGREEMENTS.length}`);
  console.log(`❌ Failed Refunds: ${failCount}/${STUCK_AGREEMENTS.length}`);
  console.log('');
  
  if (successCount === STUCK_AGREEMENTS.length) {
    console.log('🎉 All stuck SOL has been successfully refunded!');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Verify buyer wallet balance increased');
    console.log('  2. Check Solana Explorer for refund transactions');
    console.log('  3. Confirm escrow PDAs are empty');
    console.log('');
  } else {
    console.log('⚠️  Some refunds failed. Manual intervention may be required.');
    console.log('');
    console.log('Troubleshooting:');
    console.log('  1. Check if agreements were already refunded');
    console.log('  2. Verify admin keypair has authority');
    console.log('  3. Check Solana network status');
    console.log('  4. Review error messages above');
    console.log('');
  }
  
  console.log('✅ Recovery process complete\n');
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\n' + '='.repeat(80));
  console.error('❌ FATAL ERROR');
  console.error('='.repeat(80));
  console.error('');
  console.error(error);
  console.error('');
  process.exit(1);
});

