/**
 * Weekly Treasury Withdrawal Script
 * 
 * Withdraws accumulated fees from Treasury PDA to backend treasury wallet.
 * Intended to run every Sunday at 23:59 UTC via cron job.
 * 
 * Usage:
 *   npm run treasury:withdraw              # Execute withdrawal
 *   npm run treasury:withdraw -- --dry-run # Preview without executing
 *   npm run treasury:status                # Check treasury status
 */

import { TreasuryWithdrawalService } from '../../src/services/treasury-withdrawal.service';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const checkStatus = args.includes('--status');

  const service = new TreasuryWithdrawalService();

  if (checkStatus) {
    console.log('\n📊 TREASURY STATUS CHECK\n');
    
    const treasuryData = await service.getTreasuryData();
    const treasuryPda = await service.getTreasuryPda();
    
    console.log(`Treasury PDA: ${treasuryPda.toBase58()}`);
    console.log(`\nCurrent Balance: ${Number(treasuryData.balance) / LAMPORTS_PER_SOL} SOL`);
    console.log(`Total Fees Collected: ${Number(treasuryData.totalFeesCollected) / LAMPORTS_PER_SOL} SOL`);
    console.log(`Total Fees Withdrawn: ${Number(treasuryData.totalFeesWithdrawn) / LAMPORTS_PER_SOL} SOL`);
    console.log(`Pending Withdrawal: ${(Number(treasuryData.totalFeesCollected) - Number(treasuryData.totalFeesWithdrawn)) / LAMPORTS_PER_SOL} SOL`);
    console.log(`Total Swaps: ${treasuryData.totalSwapsExecuted}`);
    console.log(`Status: ${treasuryData.isPaused ? '🚨 PAUSED' : '✅ ACTIVE'}`);
    console.log(`Last Withdrawal: ${treasuryData.lastWithdrawalAt?.toISOString() || 'Never'}`);
    
    return;
  }

  // Check if it's the right time for withdrawal
  const isTime = service.isWithdrawalTime();
  const now = new Date();
  
  console.log(`\n🕐 Current Time: ${now.toISOString()}`);
  console.log(`📅 Day of Week: ${now.toUTCString().split(',')[0]}`);
  console.log(`⏰ Is Withdrawal Time (Sunday 23:59 UTC): ${isTime ? '✅ YES' : '❌ NO'}`);

  if (!isTime && !args.includes('--force')) {
    console.log('\n⚠️  Not withdrawal time. Use --force to override.');
    console.log('   Scheduled: Every Sunday at 23:59 UTC');
    process.exit(0);
  }

  // Execute withdrawal
  console.log('\n🚀 Executing weekly treasury withdrawal...\n');
  
  const result = await service.executeWeeklyWithdrawal({
    dryRun,
    minBalance: BigInt(10 * LAMPORTS_PER_SOL), // Keep 10 SOL buffer
  });

  if (result.success) {
    console.log('\n✅ Weekly withdrawal completed successfully!');
    if (result.txId) {
      console.log(`\n🔗 Transaction: ${result.txId}`);
      console.log(`💰 Amount: ${Number(result.amountWithdrawn || 0) / LAMPORTS_PER_SOL} SOL`);
      console.log(`\n🌐 Explorer: https://explorer.solana.com/tx/${result.txId}?cluster=${process.env.NODE_ENV === 'production' ? 'mainnet-beta' : 'devnet'}`);
    }
    
    // Log to database or external monitoring system
    console.log('\n📝 Next steps:');
    console.log('   1. Verify funds received in treasury wallet');
    console.log('   2. Distribute prizes from treasury wallet');
    console.log('   3. Transfer remaining to cold storage fee collector');
    
    process.exit(0);
  } else {
    console.error('\n❌ Weekly withdrawal failed');
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

