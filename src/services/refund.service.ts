/**
 * Refund Service
 * 
 * Handles refund calculations and processing for agreements with partial deposits.
 * Processes SOL and NFT refunds when agreements are cancelled or expired.
 * 
 * NOTE: USDC refund logic is deprecated but kept for backwards compatibility (V1 only).
 * 
 * Uses a separate connection pool (batchPrisma) to isolate batch operations
 * from user-facing API traffic for better performance and scalability.
 */

import { AgreementStatus, DepositType, DepositStatus } from '../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { batchPrisma as prisma } from '../config/database';
import { getSolanaService } from './solana.service';
import { WebhookEventsService } from './webhook-events.service';
import { getTransactionLogService, TransactionOperationType, TransactionStatusType } from './transaction-log.service';

/**
 * Refund calculation result
 */
export interface RefundCalculation {
  agreementId: string;
  refunds: Array<{
    depositor: string;
    type: DepositType;
    amount?: string; // For SOL/USDC (legacy)
    tokenAccount?: string; // For NFT
  }>;
  totalUsdcRefund: string; // DEPRECATED: Use totalSolRefund for V2
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

          // Log the refund transaction
          try {
            const transactionLogService = getTransactionLogService();
            await transactionLogService.captureTransaction({
              txId,
              operationType: TransactionOperationType.REFUND,
              agreementId: agreement.agreementId,
              status: TransactionStatusType.CONFIRMED,
            });
          } catch (logError) {
            console.error('[RefundService] Failed to log refund transaction:', logError);
            // Don't fail the refund if logging fails
          }
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
        const updatedAgreement = await prisma.agreement.update({
          where: { agreementId },
          data: {
            status: AgreementStatus.REFUNDED,
            cancelledAt: new Date(),
          },
        });
        result.success = true;

        // Publish webhook event for refund
        try {
          await WebhookEventsService.publishEscrowRefunded({
            agreementId: updatedAgreement.agreementId,
            cancelTxId: updatedAgreement.cancelTxId || result.transactionIds[0] || 'unknown',
            refundedTo: result.refundedDeposits.map(d => d.depositor).join(', '),
          });
        } catch (webhookError) {
          // Log webhook error but don't fail the refund
          console.error('[RefundService] Failed to publish webhook event:', webhookError);
        }
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
   * Process refund for a single deposit with on-chain execution
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
      // Get agreement details
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId },
      });

      if (!agreement) {
        throw new Error(`Agreement ${agreementId} not found`);
      }

      // Execute on-chain refund with retries
      const txId = await this.executeOnChainRefundWithRetry(
        agreement,
        type,
        depositId,
        3 // max retries
      );

      console.log(`[RefundService] On-chain refund transaction confirmed:`, {
        depositId,
        type,
        depositor,
        amount: amount || 'N/A',
        txId,
      });

      return txId;
    } catch (error) {
      console.error(`[RefundService] Error processing deposit refund:`, error);
      throw error;
    }
  }

  /**
   * Execute on-chain refund with retry logic
   */
  private async executeOnChainRefundWithRetry(
    agreement: any,
    type: DepositType,
    depositId: string,
    maxRetries: number
  ): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[RefundService] Refund attempt ${attempt}/${maxRetries} for deposit ${depositId}`);
        
        // Execute the on-chain refund
        const txId = await this.executeOnChainRefund(agreement);
        
        // Wait for transaction confirmation
        await this.waitForTransactionConfirmation(txId);
        
        console.log(`[RefundService] Refund confirmed on attempt ${attempt}/${maxRetries}`);
        return txId;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[RefundService] Refund attempt ${attempt}/${maxRetries} failed:`, lastError.message);
        
        // If this isn't the last attempt, wait with exponential backoff
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, etc.
          console.log(`[RefundService] Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    // All retries failed
    throw new Error(
      `Failed to process refund after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Execute actual on-chain refund transaction
   */
  private async executeOnChainRefund(agreement: any): Promise<string> {
    console.log(`[RefundService] Executing on-chain refund for agreement: ${agreement.agreementId}`);
    
    try {
      // Import EscrowProgramService
      const { EscrowProgramService } = await import('./escrow-program.service');
      const escrowService = new EscrowProgramService();
      
      // Prepare parameters
      const escrowPda = new PublicKey(agreement.escrowPda);
      const seller = new PublicKey(agreement.seller);
      const nftMint = new PublicKey(agreement.nftMint);
      
      // Get buyer (use seller if buyer not set)
      const buyer = agreement.buyer 
        ? new PublicKey(agreement.buyer)
        : seller;
      
      // Get USDC mint from config
      const { config } = await import('../config');
      // Choose appropriate cancellation method based on agreement status
      let txId: string;
      
      if (agreement.status === AgreementStatus.EXPIRED) {
        // Use cancelIfExpired for expired agreements
        console.log(`[RefundService] Using cancelIfExpired for expired agreement`);
        txId = await escrowService.cancelIfExpired({
          escrowPda,
          buyer,
          seller,
          nftMint,
          swapType: (agreement.swapType as 'NFT_FOR_SOL' | 'NFT_FOR_NFT_WITH_FEE' | 'NFT_FOR_NFT_PLUS_SOL') || 'NFT_FOR_SOL',
        });
      } else {
        // Use adminCancel for other cancellation scenarios
        console.log(`[RefundService] Using adminCancel for ${agreement.status} agreement`);
        txId = await escrowService.adminCancel({
          escrowPda,
          buyer,
          seller,
          nftMint,
          swapType: (agreement.swapType as 'NFT_FOR_SOL' | 'NFT_FOR_NFT_WITH_FEE' | 'NFT_FOR_NFT_PLUS_SOL') || 'NFT_FOR_SOL',
        });
      }
      
      console.log(`[RefundService] On-chain refund transaction submitted:`, txId);
      return txId;
      
    } catch (error) {
      console.error(`[RefundService] On-chain refund execution failed:`, error);
      throw new Error(
        `On-chain refund failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Wait for transaction confirmation with timeout
   */
  private async waitForTransactionConfirmation(
    txId: string,
    timeoutMs: number = 60000
  ): Promise<void> {
    console.log(`[RefundService] Waiting for transaction confirmation: ${txId}`);
    
    const startTime = Date.now();
    const connection = this.solanaService.getConnection();
    
    try {
      // Wait for confirmation with timeout
      const result = await Promise.race([
        connection.confirmTransaction(txId, 'confirmed'),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), timeoutMs)
        )
      ]);
      
      const elapsed = Date.now() - startTime;
      console.log(`[RefundService] Transaction confirmed in ${elapsed}ms`);
      
    } catch (error) {
      console.error(`[RefundService] Transaction confirmation failed:`, error);
      
      // Try to get transaction status for debugging
      try {
        const status = await connection.getSignatureStatus(txId);
        console.log(`[RefundService] Transaction status:`, status);
      } catch (statusError) {
        console.error(`[RefundService] Could not get transaction status:`, statusError);
      }
      
      throw new Error(
        `Transaction confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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

