/**
 * Expiry and Cancellation Orchestrator Service
 * 
 * Integrates all expiry and cancellation components into a cohesive system.
 * Provides comprehensive error handling, monitoring, and resource cleanup.
 */

import { ExpiryService, getExpiryService, ExpiryCheckResult } from './expiry.service';
import { RefundService, getRefundService, RefundResult } from './refund.service';
import { CancellationService, getCancellationService, CancellationResult } from './cancellation.service';
import { StatusUpdateService, getStatusUpdateService, StatusTransitionEvent } from './status-update.service';
import { PrismaClient, AgreementStatus } from '../generated/prisma';

const prisma = new PrismaClient();

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  expiryCheckIntervalMs?: number;
  autoProcessRefunds?: boolean;
  refundProcessingBatchSize?: number;
  enableMonitoring?: boolean;
  multisigConfig?: {
    requiredSignatures?: number;
    authorizedSigners?: string[];
    proposalExpiryHours?: number;
  };
}

/**
 * Orchestrator status
 */
export interface OrchestratorStatus {
  running: boolean;
  expiryService: {
    running: boolean;
    lastCheck: Date | null;
  };
  statistics: {
    totalExpiredAgreements: number;
    totalRefundedAgreements: number;
    totalCancelledAgreements: number;
    pendingRefunds: number;
  };
  errors: Array<{
    timestamp: Date;
    service: string;
    error: string;
  }>;
}

/**
 * Orchestrator event types
 */
export enum OrchestratorEventType {
  AGREEMENT_EXPIRED = 'AGREEMENT_EXPIRED',
  REFUND_PROCESSED = 'REFUND_PROCESSED',
  CANCELLATION_EXECUTED = 'CANCELLATION_EXECUTED',
  STATUS_UPDATED = 'STATUS_UPDATED',
  ERROR = 'ERROR',
}

/**
 * Orchestrator event
 */
export interface OrchestratorEvent {
  type: OrchestratorEventType;
  agreementId: string;
  timestamp: Date;
  data: any;
}

/**
 * Orchestrator event listener
 */
export type OrchestratorEventListener = (event: OrchestratorEvent) => void | Promise<void>;

/**
 * Expiry and Cancellation Orchestrator Class
 * 
 * Coordinates all expiry, refund, cancellation, and status update operations
 */
export class ExpiryCancellationOrchestrator {
  private expiryService: ExpiryService;
  private refundService: RefundService;
  private cancellationService: CancellationService;
  private statusUpdateService: StatusUpdateService;
  
  private config: Required<OrchestratorConfig>;
  private isRunning: boolean = false;
  private eventListeners: OrchestratorEventListener[] = [];
  
  private statistics = {
    totalExpiredAgreements: 0,
    totalRefundedAgreements: 0,
    totalCancelledAgreements: 0,
  };
  
  private errors: Array<{ timestamp: Date; service: string; error: string }> = [];
  private refundProcessingTimer?: NodeJS.Timeout;

  constructor(config?: OrchestratorConfig) {
    this.config = {
      expiryCheckIntervalMs: config?.expiryCheckIntervalMs || 60000, // 1 minute
      autoProcessRefunds: config?.autoProcessRefunds ?? true,
      refundProcessingBatchSize: config?.refundProcessingBatchSize || 10,
      enableMonitoring: config?.enableMonitoring ?? true,
      multisigConfig: config?.multisigConfig || {},
    };

    // Initialize services
    this.expiryService = getExpiryService({
      checkIntervalMs: this.config.expiryCheckIntervalMs,
      batchSize: 50,
    });

    this.refundService = getRefundService();
    this.cancellationService = getCancellationService(this.config.multisigConfig);
    this.statusUpdateService = getStatusUpdateService();

    // Register status update listener
    this.statusUpdateService.onStatusUpdate(this.handleStatusUpdate.bind(this));

    console.log('[ExpiryCancellationOrchestrator] Initialized with config:', this.config);
  }

  /**
   * Start the orchestrator service
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[ExpiryCancellationOrchestrator] Service is already running');
      return;
    }

    console.log('[ExpiryCancellationOrchestrator] Starting orchestrator...');

    try {
      // Start expiry checking service
      this.expiryService.start();

      // Start automatic refund processing if enabled
      if (this.config.autoProcessRefunds) {
        this.startRefundProcessing();
      }

      // Start proposal cleanup timer
      this.startProposalCleanup();

      this.isRunning = true;
      console.log('[ExpiryCancellationOrchestrator] Orchestrator started successfully');
    } catch (error) {
      console.error('[ExpiryCancellationOrchestrator] Error starting orchestrator:', error);
      this.recordError('orchestrator', error);
      throw error;
    }
  }

  /**
   * Stop the orchestrator service
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[ExpiryCancellationOrchestrator] Service is not running');
      return;
    }

    console.log('[ExpiryCancellationOrchestrator] Stopping orchestrator...');

    try {
      // Stop expiry service
      this.expiryService.stop();

      // Stop refund processing
      if (this.refundProcessingTimer) {
        clearInterval(this.refundProcessingTimer);
        this.refundProcessingTimer = undefined;
      }

      this.isRunning = false;
      console.log('[ExpiryCancellationOrchestrator] Orchestrator stopped successfully');
    } catch (error) {
      console.error('[ExpiryCancellationOrchestrator] Error stopping orchestrator:', error);
      this.recordError('orchestrator', error);
    }
  }

  /**
   * Start automatic refund processing
   */
  private startRefundProcessing(): void {
    console.log('[ExpiryCancellationOrchestrator] Starting automatic refund processing');

    // Process refunds every 5 minutes
    this.refundProcessingTimer = setInterval(async () => {
      try {
        await this.processExpiredAgreementRefunds();
      } catch (error) {
        console.error('[ExpiryCancellationOrchestrator] Error in refund processing:', error);
        this.recordError('refund', error);
      }
    }, 300000); // 5 minutes
  }

  /**
   * Start proposal cleanup timer
   */
  private startProposalCleanup(): void {
    // Clean up expired proposals every hour
    setInterval(() => {
      try {
        this.cancellationService.cleanupExpiredProposals();
      } catch (error) {
        console.error('[ExpiryCancellationOrchestrator] Error cleaning up proposals:', error);
        this.recordError('cancellation', error);
      }
    }, 3600000); // 1 hour
  }

  /**
   * Process refunds for expired agreements
   */
  public async processExpiredAgreementRefunds(): Promise<Map<string, RefundResult>> {
    console.log('[ExpiryCancellationOrchestrator] Processing refunds for expired agreements...');

    try {
      // Find expired agreements that need refunds
      const expiredAgreements = await prisma.agreement.findMany({
        where: {
          status: AgreementStatus.EXPIRED,
        },
        include: {
          deposits: {
            where: { status: 'CONFIRMED' },
          },
        },
        take: this.config.refundProcessingBatchSize,
      });

      // Filter agreements that have deposits
      const agreementsWithDeposits = expiredAgreements.filter(a => a.deposits.length > 0);

      if (agreementsWithDeposits.length === 0) {
        console.log('[ExpiryCancellationOrchestrator] No expired agreements requiring refunds');
        return new Map();
      }

      console.log(
        `[ExpiryCancellationOrchestrator] Processing refunds for ${agreementsWithDeposits.length} agreements`
      );

      // Process refunds
      const agreementIds = agreementsWithDeposits.map(a => a.agreementId);
      const results = await this.refundService.batchProcessRefunds(agreementIds);

      // Update statistics
      for (const [agreementId, result] of results.entries()) {
        if (result.success) {
          this.statistics.totalRefundedAgreements++;
          
          // Emit refund event
          await this.emitEvent({
            type: OrchestratorEventType.REFUND_PROCESSED,
            agreementId,
            timestamp: new Date(),
            data: result,
          });
        }
      }

      console.log(
        `[ExpiryCancellationOrchestrator] Refund processing completed - ` +
        `Successful: ${Array.from(results.values()).filter(r => r.success).length}, ` +
        `Failed: ${Array.from(results.values()).filter(r => !r.success).length}`
      );

      return results;
    } catch (error) {
      console.error('[ExpiryCancellationOrchestrator] Error processing refunds:', error);
      this.recordError('refund', error);
      throw error;
    }
  }

  /**
   * Handle status update events
   */
  private async handleStatusUpdate(event: StatusTransitionEvent): Promise<void> {
    console.log('[ExpiryCancellationOrchestrator] Status update event:', {
      agreementId: event.agreementId,
      transition: `${event.fromStatus} -> ${event.toStatus}`,
    });

    try {
      // Track expired agreements
      if (event.toStatus === AgreementStatus.EXPIRED) {
        this.statistics.totalExpiredAgreements++;
        
        await this.emitEvent({
          type: OrchestratorEventType.AGREEMENT_EXPIRED,
          agreementId: event.agreementId,
          timestamp: event.timestamp,
          data: event,
        });
      }

      // Track cancelled agreements
      if (event.toStatus === AgreementStatus.CANCELLED) {
        this.statistics.totalCancelledAgreements++;
        
        await this.emitEvent({
          type: OrchestratorEventType.CANCELLATION_EXECUTED,
          agreementId: event.agreementId,
          timestamp: event.timestamp,
          data: event,
        });
      }

      // Emit generic status update event
      await this.emitEvent({
        type: OrchestratorEventType.STATUS_UPDATED,
        agreementId: event.agreementId,
        timestamp: event.timestamp,
        data: event,
      });
    } catch (error) {
      console.error('[ExpiryCancellationOrchestrator] Error handling status update:', error);
      this.recordError('status-update', error);
    }
  }

  /**
   * Process agreement expiry with refund
   */
  public async processAgreementExpiry(agreementId: string): Promise<{
    expired: boolean;
    refunded: boolean;
    errors: string[];
  }> {
    console.log(`[ExpiryCancellationOrchestrator] Processing expiry for agreement: ${agreementId}`);

    const errors: string[] = [];

    try {
      // Check and update status
      const statusResult = await this.statusUpdateService.updateAgreementStatus(agreementId);
      
      if (!statusResult.success) {
        errors.push(statusResult.error || 'Failed to update status');
      }

      const expired = statusResult.toStatus === AgreementStatus.EXPIRED;

      // Process refund if expired and has deposits
      let refunded = false;
      if (expired) {
        try {
          const eligibility = await this.refundService.checkRefundEligibility(agreementId);
          
          if (eligibility.eligible) {
            const refundResult = await this.refundService.processRefunds(agreementId);
            refunded = refundResult.success;
            
            if (!refunded && refundResult.errors.length > 0) {
              errors.push(...refundResult.errors.map(e => e.error));
            }
          }
        } catch (error) {
          errors.push(`Refund error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return { expired, refunded, errors };
    } catch (error) {
      console.error(`[ExpiryCancellationOrchestrator] Error processing expiry for ${agreementId}:`, error);
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return { expired: false, refunded: false, errors };
    }
  }

  /**
   * Get orchestrator status
   */
  public async getStatus(): Promise<OrchestratorStatus> {
    const expiryStatus = this.expiryService.getStatus();
    
    // Count pending refunds
    const pendingRefunds = await prisma.agreement.count({
      where: {
        status: AgreementStatus.EXPIRED,
      },
      // Filter for agreements with deposits would require a join
    });

    return {
      running: this.isRunning,
      expiryService: {
        running: expiryStatus.running,
        lastCheck: expiryStatus.lastCheck,
      },
      statistics: {
        ...this.statistics,
        pendingRefunds,
      },
      errors: this.errors.slice(-10), // Last 10 errors
    };
  }

  /**
   * Get service instances for direct access
   */
  public getServices() {
    return {
      expiry: this.expiryService,
      refund: this.refundService,
      cancellation: this.cancellationService,
      statusUpdate: this.statusUpdateService,
    };
  }

  /**
   * Register event listener
   */
  public addEventListener(listener: OrchestratorEventListener): void {
    this.eventListeners.push(listener);
    console.log(`[ExpiryCancellationOrchestrator] Registered event listener (total: ${this.eventListeners.length})`);
  }

  /**
   * Remove event listener
   */
  public removeEventListener(listener: OrchestratorEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
      console.log(`[ExpiryCancellationOrchestrator] Removed event listener (remaining: ${this.eventListeners.length})`);
    }
  }

  /**
   * Emit event to all listeners
   */
  private async emitEvent(event: OrchestratorEvent): Promise<void> {
    for (const listener of this.eventListeners) {
      try {
        await listener(event);
      } catch (error) {
        console.error('[ExpiryCancellationOrchestrator] Error in event listener:', error);
        this.recordError('event-listener', error);
      }
    }
  }

  /**
   * Record error
   */
  private recordError(service: string, error: any): void {
    this.errors.push({
      timestamp: new Date(),
      service,
      error: error instanceof Error ? error.message : String(error),
    });

    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
  }

  /**
   * Get error history
   */
  public getErrors(limit: number = 10): Array<{ timestamp: Date; service: string; error: string }> {
    return this.errors.slice(-limit);
  }

  /**
   * Clear error history
   */
  public clearErrors(): void {
    this.errors = [];
    console.log('[ExpiryCancellationOrchestrator] Error history cleared');
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    services: {
      expiry: boolean;
      refund: boolean;
      cancellation: boolean;
      statusUpdate: boolean;
    };
    recentErrors: number;
  }> {
    const recentErrors = this.errors.filter(
      e => Date.now() - e.timestamp.getTime() < 300000 // Last 5 minutes
    ).length;

    const healthy = this.isRunning && recentErrors < 10;

    return {
      healthy,
      services: {
        expiry: this.expiryService.isServiceRunning(),
        refund: true, // RefundService doesn't have a running state
        cancellation: true, // CancellationService doesn't have a running state
        statusUpdate: true, // StatusUpdateService doesn't have a running state
      },
      recentErrors,
    };
  }
}

// Singleton instance
let orchestratorInstance: ExpiryCancellationOrchestrator | null = null;

/**
 * Get or create orchestrator singleton instance
 */
export function getExpiryCancellationOrchestrator(
  config?: OrchestratorConfig
): ExpiryCancellationOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ExpiryCancellationOrchestrator(config);
  }
  return orchestratorInstance;
}

/**
 * Reset orchestrator instance (useful for testing)
 */
export function resetExpiryCancellationOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.stop().catch(console.error);
    orchestratorInstance = null;
  }
}

export default ExpiryCancellationOrchestrator;

