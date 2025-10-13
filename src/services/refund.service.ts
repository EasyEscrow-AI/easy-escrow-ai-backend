/**
 * Refund Service
 * 
 * Handles refund calculations and processing for agreements with partial deposits.
 * Processes USDC and NFT refunds when agreements are cancelled or expired.
 */

import { PrismaClient, AgreementStatus, DepositType, DepositStatus } from '../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { getSolanaService } from './solana.service';

const prisma = new PrismaClient();

/**
 * Refund calculation result
 */
export interface RefundCalculation {
  agreementId: string;
  refunds: Array<{
    depositor: string;
    type: DepositType;
    amount?: string; // For USDC
    tokenAccount?: string; // For NFT
  }>;
  totalUsdcRefund: string;
  nftRefundCount: number;
  eligible: boolean;
  reason?: string;
}

/**
 * Refund processing result
 */
export interface RefundResult {
  agreementId: string;
  success: boolean;
  transactionIds: string[];
  refundedDeposits: Array<{
    depositId: string;
    depositor: string;
    type: DepositType;
    txId: string;
  }>;
  errors: Array<{ depositId: string; error: string }>;
}

/**
 * Refund eligibility check result
 */
export interface RefundEligibility {
  eligible: boolean;
  reason?: string;
  hasDeposits: boolean;
  agreementStatus: AgreementStatus;
}

/**
 * Refund Service Class
 * 
 * Manages refund operations for cancelled or expired agreements
 */
export class RefundService {
  private solanaService: ReturnType<typeof getSolanaService>;

  constructor() {
    this.solanaService = getSolanaService();
  }

  /**
   * Calculate refunds for an agreement
   */
  public async calculateRefunds(agreementId: string): Promise<RefundCalculation> {
    console.log(`[RefundService] Calculating refunds for agreement: ${agreementId}`);

    try {
      // Get agreement with deposits
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId },
        include: {
          deposits: {
            where: { status: DepositStatus.CONFIRMED },
          },
        },
      });

      if (!agreement) {
        throw new Error(`Agreement ${agreementId} not found`);
      }

      // Check refund eligibility
      const eligibility = await this.checkRefundEligibility(agreementId);
      
      if (!eligibility.eligible) {
        return {
          agreementId,
          refunds: [],
          totalUsdcRefund: '0',
          nftRefundCount: 0,
          eligible: false,
          reason: eligibility.reason,
        };
      }

      // Calculate refunds for each deposit
      const refunds = agreement.deposits.map(deposit => ({
        depositor: deposit.depositor,
        type: deposit.type,
        amount: deposit.type === DepositType.USDC ? deposit.amount?.toString() : undefined,
        tokenAccount: deposit.type === DepositType.NFT ? deposit.tokenAccount! : undefined,
      }));

      // Calculate totals
      const totalUsdcRefund = agreement.deposits
        .filter(d => d.type === DepositType.USDC && d.amount)
        .reduce((sum, d) => sum.add(d.amount!), new Decimal(0));

      const nftRefundCount = agreement.deposits.filter(d => d.type === DepositType.NFT).length;

      console.log(`[RefundService] Refund calculation completed for ${agreementId}:`, {
        totalUsdcRefund: totalUsdcRefund.toString(),
        nftRefundCount,
        refundCount: refunds.length,
      });

      return {
        agreementId,
        refunds,
        totalUsdcRefund: totalUsdcRefund.toString(),
        nftRefundCount,
        eligible: true,
      };
    } catch (error) {
      console.error(`[RefundService] Error calculating refunds for ${agreementId}:`, error);
      throw error;
    }
  }

  /**
   * Check if an agreement is eligible for refunds
   */
  public async checkRefundEligibility(agreementId: string): Promise<RefundEligibility> {
    try {
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId },
        include: {
          deposits: {
            where: { status: DepositStatus.CONFIRMED },
          },
        },
      });

      if (!agreement) {
        return {
          eligible: false,
          reason: 'Agreement not found',
          hasDeposits: false,
          agreementStatus: AgreementStatus.PENDING,
        };
      }

      const hasDeposits = agreement.deposits.length > 0;

      // Check if agreement status allows refunds
      const refundableStatuses: AgreementStatus[] = [
        AgreementStatus.EXPIRED,
        AgreementStatus.CANCELLED,
        AgreementStatus.PENDING,
        AgreementStatus.FUNDED,
        AgreementStatus.USDC_LOCKED,
        AgreementStatus.NFT_LOCKED,
        AgreementStatus.BOTH_LOCKED,
      ];

      if (!refundableStatuses.includes(agreement.status)) {
        return {
          eligible: false,
          reason: `Agreement status ${agreement.status} does not allow refunds`,
          hasDeposits,
          agreementStatus: agreement.status,
        };
      }

      // Agreement is already settled or refunded
      if (agreement.status === AgreementStatus.SETTLED || agreement.status === AgreementStatus.REFUNDED) {
        return {
          eligible: false,
          reason: `Agreement is already ${agreement.status.toLowerCase()}`,
          hasDeposits,
          agreementStatus: agreement.status,
        };
      }

      // If no deposits, no refunds needed
      if (!hasDeposits) {
        return {
          eligible: false,
          reason: 'No confirmed deposits to refund',
          hasDeposits: false,
          agreementStatus: agreement.status,
        };
      }

      return {
        eligible: true,
        hasDeposits: true,
        agreementStatus: agreement.status,
      };
    } catch (error) {
      console.error(`[RefundService] Error checking refund eligibility for ${agreementId}:`, error);
      throw error;
    }
  }

  /**
   * Process refunds for an agreement
   * This will transfer USDC and NFTs back to depositors
   */
  public async processRefunds(agreementId: string): Promise<RefundResult> {
    console.log(`[RefundService] Processing refunds for agreement: ${agreementId}`);

    const result: RefundResult = {
      agreementId,
      success: false,
      transactionIds: [],
      refundedDeposits: [],
      errors: [],
    };

    try {
      // Calculate refunds
      const calculation = await this.calculateRefunds(agreementId);

      if (!calculation.eligible) {
        result.errors.push({
          depositId: 'N/A',
          error: calculation.reason || 'Agreement not eligible for refunds',
        });
        return result;
      }

      // Get deposits to refund
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId },
        include: {
          deposits: {
            where: { status: DepositStatus.CONFIRMED },
          },
        },
      });

      if (!agreement) {
        throw new Error(`Agreement ${agreementId} not found`);
      }

      // Process each deposit refund
      for (const deposit of agreement.deposits) {
        try {
          const txId = await this.processDepositRefund(
            agreementId,
            deposit.id,
            deposit.type,
            deposit.depositor,
            deposit.amount?.toString(),
            deposit.tokenAccount
          );

          result.transactionIds.push(txId);
          result.refundedDeposits.push({
            depositId: deposit.id,
            depositor: deposit.depositor,
            type: deposit.type,
            txId,
          });
        } catch (error) {
          console.error(`[RefundService] Error refunding deposit ${deposit.id}:`, error);
          result.errors.push({
            depositId: deposit.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Update agreement status if all refunds successful
      if (result.errors.length === 0) {
        await prisma.agreement.update({
          where: { agreementId },
          data: {
            status: AgreementStatus.REFUNDED,
            cancelledAt: new Date(),
          },
        });
        result.success = true;
      }

      console.log(`[RefundService] Refund processing completed for ${agreementId}:`, {
        success: result.success,
        refundedCount: result.refundedDeposits.length,
        errorCount: result.errors.length,
      });

      return result;
    } catch (error) {
      console.error(`[RefundService] Error processing refunds for ${agreementId}:`, error);
      result.errors.push({
        depositId: 'N/A',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return result;
    }
  }

  /**
   * Process refund for a single deposit
   */
  private async processDepositRefund(
    agreementId: string,
    depositId: string,
    type: DepositType,
    depositor: string,
    amount?: string,
    tokenAccount?: string | null
  ): Promise<string> {
    console.log(`[RefundService] Processing ${type} refund for deposit ${depositId}`);

    try {
      // TODO: Implement actual on-chain refund transactions
      // For now, return mock transaction ID
      const mockTxId = `refund_${type}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      console.log(`[RefundService] Refund transaction created:`, {
        depositId,
        type,
        depositor,
        amount: amount || 'N/A',
        txId: mockTxId,
      });

      // Log the refund in transaction logs
      await prisma.transactionLog.create({
        data: {
          agreementId,
          txId: mockTxId,
          operationType: 'refund',
          status: 'success',
          timestamp: new Date(),
        },
      });

      return mockTxId;
    } catch (error) {
      console.error(`[RefundService] Error processing deposit refund:`, error);
      throw error;
    }
  }

  /**
   * Batch process refunds for multiple agreements
   */
  public async batchProcessRefunds(agreementIds: string[]): Promise<Map<string, RefundResult>> {
    console.log(`[RefundService] Batch processing refunds for ${agreementIds.length} agreements`);

    const results = new Map<string, RefundResult>();

    for (const agreementId of agreementIds) {
      try {
        const result = await this.processRefunds(agreementId);
        results.set(agreementId, result);
      } catch (error) {
        console.error(`[RefundService] Error processing refunds for ${agreementId}:`, error);
        results.set(agreementId, {
          agreementId,
          success: false,
          transactionIds: [],
          refundedDeposits: [],
          errors: [{
            depositId: 'N/A',
            error: error instanceof Error ? error.message : 'Unknown error',
          }],
        });
      }
    }

    return results;
  }

  /**
   * Get refund history for an agreement
   */
  public async getRefundHistory(agreementId: string): Promise<any[]> {
    try {
      return await prisma.transactionLog.findMany({
        where: {
          agreementId,
          operationType: 'refund',
        },
        orderBy: { timestamp: 'desc' },
      });
    } catch (error) {
      console.error(`[RefundService] Error getting refund history for ${agreementId}:`, error);
      throw error;
    }
  }
}

// Singleton instance
let refundServiceInstance: RefundService | null = null;

/**
 * Get or create refund service singleton instance
 */
export function getRefundService(): RefundService {
  if (!refundServiceInstance) {
    refundServiceInstance = new RefundService();
  }
  return refundServiceInstance;
}

/**
 * Reset refund service instance (useful for testing)
 */
export function resetRefundService(): void {
  refundServiceInstance = null;
}

export default RefundService;

