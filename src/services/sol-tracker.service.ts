/**
 * SOL Tracker Service
 * 
 * Tracks SOL consumption patterns across agreement lifecycle stages
 * and monitors wallet balance thresholds
 */

import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getSolanaService } from './solana.service';
import { resourceTracker } from './resource-tracker.service';
import { config } from '../config';

/**
 * Agreement lifecycle stages for tracking
 */
export enum AgreementStage {
  INITIALIZATION = 'initialization',
  USDC_DEPOSIT = 'usdc_deposit',
  NFT_DEPOSIT = 'nft_deposit',
  SETTLEMENT = 'settlement',
  CANCELLATION = 'cancellation',
  REFUND = 'refund',
}

/**
 * Wallet refill tracking
 */
interface WalletRefillRecord {
  timestamp: Date;
  walletAddress: string;
  preBalance: number;
  postBalance: number;
  amountAdded: number;
  reason: string;
}

/**
 * SOL Tracker Service Class
 */
class SolTrackerService {
  private refillHistory: WalletRefillRecord[] = [];
  private readonly LOW_BALANCE_THRESHOLD = 1.0; // SOL
  private readonly REFILL_THRESHOLD = 0.5; // SOL
  private readonly TARGET_BALANCE = 5.0; // SOL

  /**
   * Track SOL consumption for an agreement lifecycle stage
   */
  async trackAgreementLifecycle(
    agreementId: string,
    stage: AgreementStage,
    walletPublicKey: PublicKey,
    operation: () => Promise<string>
  ): Promise<string> {
    try {
      const solanaService = getSolanaService();
      const connection = solanaService.getConnection();
      
      // Get pre-operation balance
      const preBalance = await connection.getBalance(walletPublicKey);
      const preBalanceSol = preBalance / LAMPORTS_PER_SOL;

      console.log(`[SOL Tracker] Pre-operation balance for ${stage}: ${preBalanceSol} SOL`);

      // Execute the operation
      const txSignature = await operation();

      // Wait for confirmation
      await connection.confirmTransaction(txSignature, 'confirmed');

      // Get post-operation balance
      const postBalance = await connection.getBalance(walletPublicKey);
      const postBalanceSol = postBalance / LAMPORTS_PER_SOL;

      // Calculate consumed SOL
      const consumed = preBalanceSol - postBalanceSol;

      console.log(`[SOL Tracker] Post-operation balance for ${stage}: ${postBalanceSol} SOL`);
      console.log(`[SOL Tracker] SOL consumed for ${stage}: ${consumed} SOL`);

      // Track the usage
      await resourceTracker.trackSolUsage(
        `agreement_${stage}`,
        consumed,
        agreementId,
        preBalanceSol,
        postBalanceSol
      );

      // Check if refill is needed
      await this.checkAndAlertLowBalance(walletPublicKey, postBalanceSol);

      return txSignature;
    } catch (error) {
      console.error(`[SOL Tracker] Error tracking ${stage}:`, error);
      throw error;
    }
  }

  /**
   * Track wallet balance and alert if low
   */
  async checkAndAlertLowBalance(
    walletPublicKey: PublicKey,
    currentBalance?: number
  ): Promise<void> {
    try {
      let balance = currentBalance;
      
      if (balance === undefined) {
        const solanaService = getSolanaService();
        const connection = solanaService.getConnection();
        const balanceLamports = await connection.getBalance(walletPublicKey);
        balance = balanceLamports / LAMPORTS_PER_SOL;
      }

      if (balance < this.LOW_BALANCE_THRESHOLD) {
        console.warn(
          `[SOL Tracker] ⚠️  LOW BALANCE ALERT: Wallet ${walletPublicKey.toBase58()} has ${balance} SOL (threshold: ${this.LOW_BALANCE_THRESHOLD} SOL)`
        );
        
        await resourceTracker.trackSolUsage(
          'wallet_balance_check',
          0,
          undefined,
          balance,
          balance
        );
      }

      if (balance < this.REFILL_THRESHOLD) {
        console.error(
          `[SOL Tracker] 🚨 CRITICAL: Wallet ${walletPublicKey.toBase58()} needs immediate refill! Current: ${balance} SOL, Target: ${this.TARGET_BALANCE} SOL`
        );
      }
    } catch (error) {
      console.error('[SOL Tracker] Error checking wallet balance:', error);
    }
  }

  /**
   * Track wallet refill
   */
  async trackWalletRefill(
    walletAddress: string,
    preBalance: number,
    postBalance: number,
    reason: string = 'manual_refill'
  ): Promise<void> {
    try {
      const amountAdded = postBalance - preBalance;
      
      const record: WalletRefillRecord = {
        timestamp: new Date(),
        walletAddress,
        preBalance,
        postBalance,
        amountAdded,
        reason,
      };

      this.refillHistory.push(record);

      console.log(
        `[SOL Tracker] Wallet refilled: ${walletAddress} +${amountAdded} SOL (${preBalance} → ${postBalance})`
      );

      await resourceTracker.trackSolUsage(
        'wallet_refill',
        -amountAdded, // Negative to indicate incoming SOL
        undefined,
        preBalance,
        postBalance
      );
    } catch (error) {
      console.error('[SOL Tracker] Error tracking wallet refill:', error);
    }
  }

  /**
   * Get wallet refill history
   */
  getRefillHistory(): WalletRefillRecord[] {
    return [...this.refillHistory];
  }

  /**
   * Get refill frequency for a wallet
   */
  getRefillFrequency(walletAddress: string, days: number = 7): number {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentRefills = this.refillHistory.filter(
      record => 
        record.walletAddress === walletAddress &&
        record.timestamp >= cutoffDate
    );
    return recentRefills.length;
  }

  /**
   * Calculate average SOL consumption per operation type
   */
  async getAverageSolConsumption(
    stage: AgreementStage,
    days: number = 7
  ): Promise<number> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
      
      const metrics = await resourceTracker.getMetrics(startTime, endTime);
      const stageMetrics = metrics.filter(
        m => m.solUsage && m.solUsage.operationType === `agreement_${stage}`
      );

      if (stageMetrics.length === 0) {
        return 0;
      }

      const totalConsumed = stageMetrics.reduce(
        (sum, m) => sum + (m.solUsage?.transactionFees || 0),
        0
      );

      return totalConsumed / stageMetrics.length;
    } catch (error) {
      console.error('[SOL Tracker] Error calculating average consumption:', error);
      return 0;
    }
  }

  /**
   * Estimate SOL needed for an agreement lifecycle
   */
  async estimateAgreementCost(): Promise<{
    initialization: number;
    usdcDeposit: number;
    nftDeposit: number;
    settlement: number;
    cancellation: number;
    total: number;
  }> {
    try {
      const [
        initialization,
        usdcDeposit,
        nftDeposit,
        settlement,
        cancellation,
      ] = await Promise.all([
        this.getAverageSolConsumption(AgreementStage.INITIALIZATION),
        this.getAverageSolConsumption(AgreementStage.USDC_DEPOSIT),
        this.getAverageSolConsumption(AgreementStage.NFT_DEPOSIT),
        this.getAverageSolConsumption(AgreementStage.SETTLEMENT),
        this.getAverageSolConsumption(AgreementStage.CANCELLATION),
      ]);

      const total = initialization + usdcDeposit + nftDeposit + settlement;

      return {
        initialization,
        usdcDeposit,
        nftDeposit,
        settlement,
        cancellation,
        total,
      };
    } catch (error) {
      console.error('[SOL Tracker] Error estimating agreement cost:', error);
      return {
        initialization: 0,
        usdcDeposit: 0,
        nftDeposit: 0,
        settlement: 0,
        cancellation: 0,
        total: 0,
      };
    }
  }

  /**
   * Get SOL consumption report
   */
  async getSolConsumptionReport(days: number = 7): Promise<{
    totalConsumed: number;
    averagePerTransaction: number;
    byStage: Record<string, { count: number; total: number; average: number }>;
    refillCount: number;
    totalRefilled: number;
  }> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
      
      const metrics = await resourceTracker.getMetrics(startTime, endTime);
      const solMetrics = metrics.filter(m => m.solUsage);

      const totalConsumed = solMetrics.reduce(
        (sum, m) => sum + (m.solUsage?.transactionFees || 0),
        0
      );

      const averagePerTransaction = solMetrics.length > 0
        ? totalConsumed / solMetrics.length
        : 0;

      // Group by stage
      const byStage: Record<string, { count: number; total: number; average: number }> = {};
      
      for (const metric of solMetrics) {
        const stage = metric.solUsage?.operationType || 'unknown';
        if (!byStage[stage]) {
          byStage[stage] = { count: 0, total: 0, average: 0 };
        }
        byStage[stage].count++;
        byStage[stage].total += metric.solUsage?.transactionFees || 0;
      }

      // Calculate averages
      for (const stage in byStage) {
        byStage[stage].average = byStage[stage].total / byStage[stage].count;
      }

      // Get refill stats
      const recentRefills = this.refillHistory.filter(
        record => record.timestamp >= startTime
      );
      const refillCount = recentRefills.length;
      const totalRefilled = recentRefills.reduce(
        (sum, record) => sum + record.amountAdded,
        0
      );

      return {
        totalConsumed,
        averagePerTransaction,
        byStage,
        refillCount,
        totalRefilled,
      };
    } catch (error) {
      console.error('[SOL Tracker] Error generating consumption report:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const solTracker = new SolTrackerService();
export default solTracker;

