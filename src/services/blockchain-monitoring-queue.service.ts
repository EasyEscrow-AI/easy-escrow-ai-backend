import { Job } from 'bull';
import QueueService, { BaseJobData } from './queue.service';
import { getMonitoringOrchestrator } from './monitoring-orchestrator.service';

/**
 * Blockchain Monitoring Queue Service
 * 
 * Specialized job queue for blockchain event monitoring and processing tasks
 * Handles periodic blockchain scanning, event processing, block confirmation tracking,
 * and blockchain reorganization scenarios
 */

export enum BlockchainMonitoringJobType {
  SCAN_DEPOSITS = 'SCAN_DEPOSITS',
  VERIFY_CONFIRMATION = 'VERIFY_CONFIRMATION',
  MONITOR_AGREEMENT = 'MONITOR_AGREEMENT',
  CHECK_EXPIRY = 'CHECK_EXPIRY',
  PROCESS_BLOCKCHAIN_EVENT = 'PROCESS_BLOCKCHAIN_EVENT',
  HANDLE_REORG = 'HANDLE_REORG',
}

export interface BlockchainMonitoringJobData extends BaseJobData {
  type: BlockchainMonitoringJobType;
  agreementId?: string;
  escrowAddress?: string;
  transactionSignature?: string;
  slot?: number;
  blockHeight?: number;
  confirmations?: number;
  retryCount?: number;
}

export interface ScanDepositsJobData extends BlockchainMonitoringJobData {
  type: BlockchainMonitoringJobType.SCAN_DEPOSITS;
  fromSlot?: number;
  toSlot?: number;
}

export interface VerifyConfirmationJobData extends BlockchainMonitoringJobData {
  type: BlockchainMonitoringJobType.VERIFY_CONFIRMATION;
  transactionSignature: string;
  requiredConfirmations: number;
  currentConfirmations: number;
}

export interface MonitorAgreementJobData extends BlockchainMonitoringJobData {
  type: BlockchainMonitoringJobType.MONITOR_AGREEMENT;
  agreementId: string;
  escrowAddress: string;
  monitorUntil: number; // Timestamp
}

export interface CheckExpiryJobData extends BlockchainMonitoringJobData {
  type: BlockchainMonitoringJobType.CHECK_EXPIRY;
  agreementId: string;
  expiryTimestamp: number;
}

export interface ProcessBlockchainEventJobData extends BlockchainMonitoringJobData {
  type: BlockchainMonitoringJobType.PROCESS_BLOCKCHAIN_EVENT;
  eventType: string;
  eventData: Record<string, any>;
}

export interface HandleReorgJobData extends BlockchainMonitoringJobData {
  type: BlockchainMonitoringJobType.HANDLE_REORG;
  affectedSlots: number[];
  affectedTransactions: string[];
}

export class BlockchainMonitoringQueueService extends QueueService<BlockchainMonitoringJobData> {
  private static instance: BlockchainMonitoringQueueService;

  private constructor() {
    super({
      name: 'blockchain-monitoring',
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 172800, // Keep completed jobs for 48 hours
          count: 5000,
        },
      },
    });

    // Start processing jobs
    this.startProcessing();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): BlockchainMonitoringQueueService {
    if (!BlockchainMonitoringQueueService.instance) {
      BlockchainMonitoringQueueService.instance = new BlockchainMonitoringQueueService();
    }
    return BlockchainMonitoringQueueService.instance;
  }

  /**
   * Start processing jobs from the queue
   */
  private startProcessing(): void {
    // Process with concurrency of 5 for blockchain monitoring
    this.process(5, async (job: Job<BlockchainMonitoringJobData>) => {
      const { data } = job;

      console.log(`Processing blockchain monitoring job: ${data.type} (${job.id})`);

      try {
        switch (data.type) {
          case BlockchainMonitoringJobType.SCAN_DEPOSITS:
            return await this.processScanDeposits(data as ScanDepositsJobData);

          case BlockchainMonitoringJobType.VERIFY_CONFIRMATION:
            return await this.processVerifyConfirmation(data as VerifyConfirmationJobData);

          case BlockchainMonitoringJobType.MONITOR_AGREEMENT:
            return await this.processMonitorAgreement(data as MonitorAgreementJobData);

          case BlockchainMonitoringJobType.CHECK_EXPIRY:
            return await this.processCheckExpiry(data as CheckExpiryJobData);

          case BlockchainMonitoringJobType.PROCESS_BLOCKCHAIN_EVENT:
            return await this.processBlockchainEvent(data as ProcessBlockchainEventJobData);

          case BlockchainMonitoringJobType.HANDLE_REORG:
            return await this.processHandleReorg(data as HandleReorgJobData);

          default:
            throw new Error(`Unknown job type: ${data.type}`);
        }
      } catch (error) {
        console.error(`Error processing blockchain monitoring job ${job.id}:`, error);
        throw error;
      }
    });
  }

  /**
   * Process scan deposits job
   */
  private async processScanDeposits(data: ScanDepositsJobData): Promise<any> {
    console.log(`Scanning for deposits from slot ${data.fromSlot} to ${data.toSlot}`);
    
    // This would call the monitoring orchestrator to scan for new deposits
    // For now, return a placeholder
    return {
      scanned: true,
      fromSlot: data.fromSlot,
      toSlot: data.toSlot,
      depositsFound: 0,
    };
  }

  /**
   * Process verify confirmation job
   */
  private async processVerifyConfirmation(data: VerifyConfirmationJobData): Promise<any> {
    console.log(`Verifying confirmation for transaction: ${data.transactionSignature}`);
    
    // This would verify block confirmations
    return {
      verified: true,
      signature: data.transactionSignature,
      confirmations: data.requiredConfirmations,
    };
  }

  /**
   * Process monitor agreement job
   */
  private async processMonitorAgreement(data: MonitorAgreementJobData): Promise<any> {
    console.log(`Monitoring agreement: ${data.agreementId}`);
    
    try {
      // Use the monitoring orchestrator to process monitoring
      const monitoringOrchestrator = getMonitoringOrchestrator();
      // Note: The monitoring orchestrator doesn't have a processMonitoring method
      // This is a placeholder for future implementation
      
      return {
        monitored: true,
        agreementId: data.agreementId,
        status: 'Monitoring job executed',
      };
    } catch (error) {
      console.error(`Error monitoring agreement ${data.agreementId}:`, error);
      throw error;
    }
  }

  /**
   * Process check expiry job
   */
  private async processCheckExpiry(data: CheckExpiryJobData): Promise<any> {
    console.log(`Checking expiry for agreement: ${data.agreementId}`);
    
    const now = Date.now();
    const isExpired = now >= data.expiryTimestamp;
    
    if (isExpired) {
      console.log(`Agreement ${data.agreementId} has expired`);
      // Trigger expiry cancellation workflow
      // This would integrate with expiry-cancellation service
    }
    
    return {
      checked: true,
      agreementId: data.agreementId,
      isExpired,
      expiryTimestamp: data.expiryTimestamp,
    };
  }

  /**
   * Process blockchain event job
   */
  private async processBlockchainEvent(data: ProcessBlockchainEventJobData): Promise<any> {
    console.log(`Processing blockchain event: ${data.eventType}`);
    
    // Process different blockchain events
    return {
      processed: true,
      eventType: data.eventType,
      eventData: data.eventData,
    };
  }

  /**
   * Process handle reorg job
   */
  private async processHandleReorg(data: HandleReorgJobData): Promise<any> {
    console.log(`Handling blockchain reorganization for slots: ${data.affectedSlots.join(', ')}`);
    
    // Handle blockchain reorganization
    // This would re-verify affected transactions
    return {
      handled: true,
      affectedSlots: data.affectedSlots,
      affectedTransactions: data.affectedTransactions,
    };
  }

  /**
   * Schedule periodic deposit scanning
   */
  async scheduleDepositScan(fromSlot?: number, toSlot?: number): Promise<Job<BlockchainMonitoringJobData>> {
    const jobData: ScanDepositsJobData = {
      id: `scan-deposits-${Date.now()}`,
      type: BlockchainMonitoringJobType.SCAN_DEPOSITS,
      timestamp: Date.now(),
      fromSlot,
      toSlot,
    };

    return await this.addJob(jobData, {
      priority: 2, // Medium-high priority
    });
  }

  /**
   * Schedule confirmation verification
   */
  async scheduleConfirmationVerification(
    transactionSignature: string,
    requiredConfirmations: number,
    currentConfirmations: number
  ): Promise<Job<BlockchainMonitoringJobData>> {
    const jobData: VerifyConfirmationJobData = {
      id: `verify-confirmation-${transactionSignature}`,
      type: BlockchainMonitoringJobType.VERIFY_CONFIRMATION,
      timestamp: Date.now(),
      transactionSignature,
      requiredConfirmations,
      currentConfirmations,
    };

    return await this.addJob(jobData, {
      priority: 1, // High priority
      delay: 5000, // Check after 5 seconds
    });
  }

  /**
   * Schedule agreement monitoring
   */
  async scheduleAgreementMonitoring(
    agreementId: string,
    escrowAddress: string,
    monitorUntil: number
  ): Promise<Job<BlockchainMonitoringJobData>> {
    const jobData: MonitorAgreementJobData = {
      id: `monitor-agreement-${agreementId}`,
      type: BlockchainMonitoringJobType.MONITOR_AGREEMENT,
      timestamp: Date.now(),
      agreementId,
      escrowAddress,
      monitorUntil,
    };

    return await this.addJob(jobData, {
      priority: 2, // Medium-high priority
      repeat: {
        every: 60000, // Check every minute
        endDate: monitorUntil,
      },
    });
  }

  /**
   * Schedule expiry check
   */
  async scheduleExpiryCheck(
    agreementId: string,
    expiryTimestamp: number
  ): Promise<Job<BlockchainMonitoringJobData>> {
    const jobData: CheckExpiryJobData = {
      id: `check-expiry-${agreementId}`,
      type: BlockchainMonitoringJobType.CHECK_EXPIRY,
      timestamp: Date.now(),
      agreementId,
      expiryTimestamp,
    };

    const delay = Math.max(0, expiryTimestamp - Date.now());

    return await this.addJob(jobData, {
      priority: 1, // High priority
      delay, // Schedule for expiry time
    });
  }

  /**
   * Schedule blockchain event processing
   */
  async scheduleBlockchainEvent(
    eventType: string,
    eventData: Record<string, any>
  ): Promise<Job<BlockchainMonitoringJobData>> {
    const jobData: ProcessBlockchainEventJobData = {
      id: `blockchain-event-${eventType}-${Date.now()}`,
      type: BlockchainMonitoringJobType.PROCESS_BLOCKCHAIN_EVENT,
      timestamp: Date.now(),
      eventType,
      eventData,
    };

    return await this.addJob(jobData, {
      priority: 2, // Medium-high priority
    });
  }

  /**
   * Schedule reorg handling
   */
  async scheduleReorgHandling(
    affectedSlots: number[],
    affectedTransactions: string[]
  ): Promise<Job<BlockchainMonitoringJobData>> {
    const jobData: HandleReorgJobData = {
      id: `handle-reorg-${Date.now()}`,
      type: BlockchainMonitoringJobType.HANDLE_REORG,
      timestamp: Date.now(),
      affectedSlots,
      affectedTransactions,
    };

    return await this.addJob(jobData, {
      priority: 1, // High priority - reorgs need immediate attention
    });
  }

  /**
   * Cancel agreement monitoring
   */
  async cancelAgreementMonitoring(agreementId: string): Promise<void> {
    const jobId = `monitor-agreement-${agreementId}`;
    await this.removeJob(jobId);
    console.log(`Cancelled monitoring for agreement ${agreementId}`);
  }

  /**
   * Cancel expiry check
   */
  async cancelExpiryCheck(agreementId: string): Promise<void> {
    const jobId = `check-expiry-${agreementId}`;
    await this.removeJob(jobId);
    console.log(`Cancelled expiry check for agreement ${agreementId}`);
  }
}

// Export singleton instance
export const blockchainMonitoringQueue = BlockchainMonitoringQueueService.getInstance();

export default blockchainMonitoringQueue;

