/**
 * Treasury Withdrawal Service - STUB VERSION
 * 
 * TODO: Full implementation pending TypeScript type generation for new instructions.
 * The on-chain program is deployed and functional with all treasury features.
 * 
 * See: treasury-withdrawal.service.ts.pending for full implementation
 * 
 * For now, use the CLI scripts directly:
 * - npm run treasury:status
 * - npm run treasury:withdraw
 * - npm run treasury:pause
 * - npm run treasury:unpause
 */

export interface TreasuryWithdrawalConfig {
  minBalance?: bigint;
  dryRun?: boolean;
}

export class TreasuryWithdrawalService {
  constructor() {
    console.log('[TreasuryWithdrawalService] Stub version - use CLI scripts');
  }

  /**
   * Check if it's time for weekly withdrawal (Sunday 23:59 UTC)
   */
  isWithdrawalTime(): boolean {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    
    return dayOfWeek === 0 && hour === 23 && minute === 59;
  }

  // Other methods to be implemented once types are generated
  // See treasury-withdrawal.service.ts.pending for full implementation
}

