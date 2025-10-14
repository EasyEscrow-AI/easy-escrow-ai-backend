import { Job } from 'bull';
import QueueService, { BaseJobData } from './queue.service';
import { getSettlementService } from './settlement.service';
import { getRefundService } from './refund.service';

/**
 * Settlement Processing Queue Service
 * 
 * Job queue system for handling escrow settlement and payment processing tasks
 * Supports release funds, refund, dispute resolution, and time-based settlements
 */

export enum SettlementJobType {
  RELEASE_FUNDS = 'RELEASE_FUNDS',
  REFUND = 'REFUND',
  PARTIAL_SETTLEMENT = 'PARTIAL_SETTLEMENT',
  SCHEDULED_SETTLEMENT = 'SCHEDULED_SETTLEMENT',
  DISPUTE_RESOLUTION = 'DISPUTE_RESOLUTION',
  FEE_DISTRIBUTION = 'FEE_DISTRIBUTION',
  VALIDATE_SETTLEMENT = 'VALIDATE_SETTLEMENT',
}

export interface SettlementJobData extends BaseJobData {
  type: SettlementJobType;
  agreementId: string;
  escrowAddress: string;
  initiatedBy: string;
  amount?: string;
  reason?: string;
  scheduledTime?: number;
  retryCount?: number;
}

export interface ReleaseFundsJobData extends SettlementJobData {
  type: SettlementJobType.RELEASE_FUNDS;
  buyerWallet: string;
  sellerWallet: string;
  amount: string;
  platformFee: string;
}

export interface RefundJobData extends SettlementJobData {
  type: SettlementJobType.REFUND;
  buyerWallet: string;
  amount: string;
  reason: string;
}

export interface PartialSettlementJobData extends SettlementJobData {
  type: SettlementJobType.PARTIAL_SETTLEMENT;
  buyerWallet: string;
  sellerWallet: string;
  sellerAmount: string;
  buyerAmount: string;
  platformFee: string;
}

export interface ScheduledSettlementJobData extends SettlementJobData {
  type: SettlementJobType.SCHEDULED_SETTLEMENT;
  scheduledTime: number;
  settlementType: 'release' | 'refund' | 'partial';
}

export interface DisputeResolutionJobData extends SettlementJobData {
  type: SettlementJobType.DISPUTE_RESOLUTION;
  disputeId: string;
  resolution: 'release' | 'refund' | 'split';
  splitPercentage?: number;
}

export interface FeeDistributionJobData extends SettlementJobData {
  type: SettlementJobType.FEE_DISTRIBUTION;
  feeAmount: string;
  feeCollectorAddress: string;
  transactionSignature: string;
}

export interface ValidateSettlementJobData extends SettlementJobData {
  type: SettlementJobType.VALIDATE_SETTLEMENT;
  transactionSignature: string;
  expectedAmount: string;
}

export class SettlementProcessingQueueService extends QueueService<SettlementJobData> {
  private static instance: SettlementProcessingQueueService;

  private constructor() {
    super({
      name: 'settlement-processing',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000, // Start with 10 second delay
        },
        removeOnComplete: {
          age: 259200, // Keep completed jobs for 72 hours
          count: 10000,
        },
        timeout: 120000, // 2 minute timeout for settlement operations
      },
    });

    // Start processing jobs
    this.startProcessing();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SettlementProcessingQueueService {
    if (!SettlementProcessingQueueService.instance) {
      SettlementProcessingQueueService.instance = new SettlementProcessingQueueService();
    }
    return SettlementProcessingQueueService.instance;
  }

  /**
   * Start processing jobs from the queue
   */
  private startProcessing(): void {
    // Process with concurrency of 3 for settlement operations (to avoid overwhelming blockchain)
    this.process(3, async (job: Job<SettlementJobData>) => {
      const { data } = job;

      console.log(`Processing settlement job: ${data.type} (${job.id})`);

      try {
        switch (data.type) {
          case SettlementJobType.RELEASE_FUNDS:
            return await this.processReleaseFunds(data as ReleaseFundsJobData);

          case SettlementJobType.REFUND:
            return await this.processRefund(data as RefundJobData);

          case SettlementJobType.PARTIAL_SETTLEMENT:
            return await this.processPartialSettlement(data as PartialSettlementJobData);

          case SettlementJobType.SCHEDULED_SETTLEMENT:
            return await this.processScheduledSettlement(data as ScheduledSettlementJobData);

          case SettlementJobType.DISPUTE_RESOLUTION:
            return await this.processDisputeResolution(data as DisputeResolutionJobData);

          case SettlementJobType.FEE_DISTRIBUTION:
            return await this.processFeeDistribution(data as FeeDistributionJobData);

          case SettlementJobType.VALIDATE_SETTLEMENT:
            return await this.processValidateSettlement(data as ValidateSettlementJobData);

          default:
            throw new Error(`Unknown settlement job type: ${data.type}`);
        }
      } catch (error) {
        console.error(`Error processing settlement job ${job.id}:`, error);
        throw error;
      }
    });
  }

  /**
   * Process release funds job
   */
  private async processReleaseFunds(data: ReleaseFundsJobData): Promise<any> {
    console.log(`Releasing funds for agreement: ${data.agreementId}`);
    
    try {
      const settlementService = getSettlementService();
      const result = await settlementService.settleAgreement(data.agreementId);
      
      return {
        success: result.success,
        agreementId: data.agreementId,
        transactionId: result.transactionId,
        amount: data.amount,
        platformFee: result.platformFee,
      };
    } catch (error) {
      console.error(`Error releasing funds for agreement ${data.agreementId}:`, error);
      throw error;
    }
  }

  /**
   * Process refund job
   */
  private async processRefund(data: RefundJobData): Promise<any> {
    console.log(`Processing refund for agreement: ${data.agreementId}`);
    
    try {
      const refundService = getRefundService();
      const result = await refundService.processRefunds(data.agreementId);
      
      return {
        success: result.success,
        agreementId: data.agreementId,
        transactionIds: result.transactionIds,
        amount: data.amount,
        reason: data.reason,
        refundedDeposits: result.refundedDeposits,
      };
    } catch (error) {
      console.error(`Error processing refund for agreement ${data.agreementId}:`, error);
      throw error;
    }
  }

  /**
   * Process partial settlement job
   */
  private async processPartialSettlement(data: PartialSettlementJobData): Promise<any> {
    console.log(`Processing partial settlement for agreement: ${data.agreementId}`);
    
    // This would implement partial settlement logic
    // For now, return a placeholder
    return {
      success: true,
      agreementId: data.agreementId,
      sellerAmount: data.sellerAmount,
      buyerAmount: data.buyerAmount,
      platformFee: data.platformFee,
    };
  }

  /**
   * Process scheduled settlement job
   */
  private async processScheduledSettlement(data: ScheduledSettlementJobData): Promise<any> {
    console.log(`Processing scheduled settlement for agreement: ${data.agreementId}`);
    
    const now = Date.now();
    if (now < data.scheduledTime) {
      throw new Error('Settlement time not yet reached');
    }
    
    // Execute the scheduled settlement based on type
    const settlementService = getSettlementService();
    const refundService = getRefundService();
    
    switch (data.settlementType) {
      case 'release':
        return await settlementService.settleAgreement(data.agreementId);
      case 'refund':
        return await refundService.processRefunds(data.agreementId);
      default:
        throw new Error(`Unknown settlement type: ${data.settlementType}`);
    }
  }

  /**
   * Process dispute resolution job
   */
  private async processDisputeResolution(data: DisputeResolutionJobData): Promise<any> {
    console.log(`Processing dispute resolution for agreement: ${data.agreementId}`);
    
    // This would implement dispute resolution logic
    // For now, return a placeholder
    return {
      success: true,
      agreementId: data.agreementId,
      disputeId: data.disputeId,
      resolution: data.resolution,
    };
  }

  /**
   * Process fee distribution job
   */
  private async processFeeDistribution(data: FeeDistributionJobData): Promise<any> {
    console.log(`Processing fee distribution for agreement: ${data.agreementId}`);
    
    // This would implement fee distribution logic
    return {
      success: true,
      agreementId: data.agreementId,
      feeAmount: data.feeAmount,
      feeCollectorAddress: data.feeCollectorAddress,
    };
  }

  /**
   * Process validate settlement job
   */
  private async processValidateSettlement(data: ValidateSettlementJobData): Promise<any> {
    console.log(`Validating settlement for agreement: ${data.agreementId}`);
    
    // This would validate that the settlement transaction was successful
    return {
      success: true,
      agreementId: data.agreementId,
      transactionSignature: data.transactionSignature,
      validated: true,
    };
  }

  /**
   * Schedule release funds job
   */
  async scheduleReleaseFunds(
    agreementId: string,
    escrowAddress: string,
    buyerWallet: string,
    sellerWallet: string,
    amount: string,
    platformFee: string,
    initiatedBy: string
  ): Promise<Job<SettlementJobData>> {
    const jobData: ReleaseFundsJobData = {
      id: `release-funds-${agreementId}`,
      type: SettlementJobType.RELEASE_FUNDS,
      timestamp: Date.now(),
      agreementId,
      escrowAddress,
      buyerWallet,
      sellerWallet,
      amount,
      platformFee,
      initiatedBy,
    };

    return await this.addJob(jobData, {
      priority: 1, // High priority
    });
  }

  /**
   * Schedule refund job
   */
  async scheduleRefund(
    agreementId: string,
    escrowAddress: string,
    buyerWallet: string,
    amount: string,
    reason: string,
    initiatedBy: string
  ): Promise<Job<SettlementJobData>> {
    const jobData: RefundJobData = {
      id: `refund-${agreementId}`,
      type: SettlementJobType.REFUND,
      timestamp: Date.now(),
      agreementId,
      escrowAddress,
      buyerWallet,
      amount,
      reason,
      initiatedBy,
    };

    return await this.addJob(jobData, {
      priority: 1, // High priority
    });
  }

  /**
   * Schedule partial settlement job
   */
  async schedulePartialSettlement(
    agreementId: string,
    escrowAddress: string,
    buyerWallet: string,
    sellerWallet: string,
    sellerAmount: string,
    buyerAmount: string,
    platformFee: string,
    initiatedBy: string
  ): Promise<Job<SettlementJobData>> {
    const jobData: PartialSettlementJobData = {
      id: `partial-settlement-${agreementId}`,
      type: SettlementJobType.PARTIAL_SETTLEMENT,
      timestamp: Date.now(),
      agreementId,
      escrowAddress,
      buyerWallet,
      sellerWallet,
      sellerAmount,
      buyerAmount,
      platformFee,
      initiatedBy,
    };

    return await this.addJob(jobData, {
      priority: 2, // Medium-high priority
    });
  }

  /**
   * Schedule time-based settlement
   */
  async scheduleTimedSettlement(
    agreementId: string,
    escrowAddress: string,
    scheduledTime: number,
    settlementType: 'release' | 'refund' | 'partial',
    initiatedBy: string
  ): Promise<Job<SettlementJobData>> {
    const jobData: ScheduledSettlementJobData = {
      id: `scheduled-settlement-${agreementId}`,
      type: SettlementJobType.SCHEDULED_SETTLEMENT,
      timestamp: Date.now(),
      agreementId,
      escrowAddress,
      scheduledTime,
      settlementType,
      initiatedBy,
    };

    const delay = Math.max(0, scheduledTime - Date.now());

    return await this.addJob(jobData, {
      priority: 2, // Medium-high priority
      delay, // Schedule for the specified time
    });
  }

  /**
   * Schedule dispute resolution job
   */
  async scheduleDisputeResolution(
    agreementId: string,
    escrowAddress: string,
    disputeId: string,
    resolution: 'release' | 'refund' | 'split',
    splitPercentage: number | undefined,
    initiatedBy: string
  ): Promise<Job<SettlementJobData>> {
    const jobData: DisputeResolutionJobData = {
      id: `dispute-resolution-${disputeId}`,
      type: SettlementJobType.DISPUTE_RESOLUTION,
      timestamp: Date.now(),
      agreementId,
      escrowAddress,
      disputeId,
      resolution,
      splitPercentage,
      initiatedBy,
    };

    return await this.addJob(jobData, {
      priority: 1, // High priority
    });
  }

  /**
   * Schedule fee distribution job
   */
  async scheduleFeeDistribution(
    agreementId: string,
    escrowAddress: string,
    feeAmount: string,
    feeCollectorAddress: string,
    transactionSignature: string,
    initiatedBy: string
  ): Promise<Job<SettlementJobData>> {
    const jobData: FeeDistributionJobData = {
      id: `fee-distribution-${agreementId}-${Date.now()}`,
      type: SettlementJobType.FEE_DISTRIBUTION,
      timestamp: Date.now(),
      agreementId,
      escrowAddress,
      feeAmount,
      feeCollectorAddress,
      transactionSignature,
      initiatedBy,
    };

    return await this.addJob(jobData, {
      priority: 3, // Lower priority
    });
  }

  /**
   * Schedule settlement validation job
   */
  async scheduleSettlementValidation(
    agreementId: string,
    escrowAddress: string,
    transactionSignature: string,
    expectedAmount: string,
    initiatedBy: string
  ): Promise<Job<SettlementJobData>> {
    const jobData: ValidateSettlementJobData = {
      id: `validate-settlement-${transactionSignature}`,
      type: SettlementJobType.VALIDATE_SETTLEMENT,
      timestamp: Date.now(),
      agreementId,
      escrowAddress,
      transactionSignature,
      expectedAmount,
      initiatedBy,
    };

    return await this.addJob(jobData, {
      priority: 2, // Medium-high priority
      delay: 30000, // Validate after 30 seconds to allow blockchain confirmation
    });
  }

  /**
   * Cancel scheduled settlement
   */
  async cancelScheduledSettlement(agreementId: string): Promise<void> {
    const jobId = `scheduled-settlement-${agreementId}`;
    await this.removeJob(jobId);
    console.log(`Cancelled scheduled settlement for agreement ${agreementId}`);
  }
}

// Export singleton instance
export const settlementProcessingQueue = SettlementProcessingQueueService.getInstance();

export default settlementProcessingQueue;

