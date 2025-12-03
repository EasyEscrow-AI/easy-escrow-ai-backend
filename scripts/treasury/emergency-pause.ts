/**
 * Emergency Pause Script
 * 
 * Immediately halts all swap operations in case of:
 * - Security vulnerability detected
 * - Critical bug found
 * - Regulatory requirement
 * - Malicious activity
 * 
 * Usage:
 *   npm run treasury:pause     # Activate emergency pause
 *   npm run treasury:unpause   # Resume operations
 */

import { TreasuryWithdrawalService } from '../../src/services/treasury-withdrawal.service';

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];

  const service = new TreasuryWithdrawalService();

  if (action === 'unpause') {
    console.log('\n✅ RESUMING OPERATIONS\n');
    
    const result = await service.unpause();
    
    if (result.success) {
      console.log('✅ Operations resumed successfully');
      console.log(`Transaction: ${result.txId}`);
      process.exit(0);
    } else {
      console.error('❌ Failed to unpause:', result.error);
      process.exit(1);
    }
  } else {
    // Default: pause
    console.log('\n🚨 ACTIVATING EMERGENCY PAUSE\n');
    console.log('⚠️  This will immediately stop all swaps');
    console.log('⚠️  Existing swaps cannot be completed');
    console.log('⚠️  Withdrawals will be blocked\n');
    
    const result = await service.emergencyPause();
    
    if (result.success) {
      console.log('✅ Emergency pause activated');
      console.log(`Transaction: ${result.txId}`);
      console.log('\n📝 All swap operations are now blocked');
      console.log('   To resume: npm run treasury:unpause');
      process.exit(0);
    } else {
      console.error('❌ Failed to activate pause:', result.error);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

