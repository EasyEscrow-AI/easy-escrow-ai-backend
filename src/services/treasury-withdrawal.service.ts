/**
 * Treasury Withdrawal Service
 *
 * Manages withdrawal timing logic — withdrawals are only allowed
 * during a specific weekly window (Sunday 23:59 UTC).
 */
export class TreasuryWithdrawalService {
  /**
   * Check if the current time is within the weekly withdrawal window.
   * Withdrawals are permitted only on Sunday at 23:59 UTC.
   */
  isWithdrawalTime(): boolean {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    return dayOfWeek === 0 && hour === 23 && minute === 59;
  }
}
