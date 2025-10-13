/**
 * Status Update Service
 * 
 * Automatically updates agreement status based on expiry checks, deposits, and cancellation events.
 * Manages status transitions and emits events for status changes.
 */

import { PrismaClient, AgreementStatus, DepositType, DepositStatus } from '../generated/prisma';

const prisma = new PrismaClient();

/**
 * Status transition event
 */
export interface StatusTransitionEvent {
  agreementId: string;
  fromStatus: AgreementStatus;
  toStatus: AgreementStatus;
  reason: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Status update result
 */
export interface StatusUpdateResult {
  agreementId: string;
  success: boolean;
  fromStatus: AgreementStatus;
  toStatus: AgreementStatus;
  error?: string;
}

/**
 * Status transition rule
 */
interface StatusTransitionRule {
  from: AgreementStatus[];
  to: AgreementStatus;
  condition: (context: StatusUpdateContext) => boolean;
  reason: string;
}

/**
 * Status update context
 */
interface StatusUpdateContext {
  agreement: any;
  deposits: any[];
  hasUsdcDeposit: boolean;
  hasNftDeposit: boolean;
  isExpired: boolean;
  isCancelled: boolean;
}

/**
 * Status update event listener
 */
export type StatusUpdateListener = (event: StatusTransitionEvent) => void | Promise<void>;

/**
 * Status Update Service Class
 * 
 * Manages automatic status transitions for agreements
 */
export class StatusUpdateService {
  private listeners: StatusUpdateListener[] = [];
  private transitionRules: StatusTransitionRule[] = [];

  constructor() {
    this.initializeTransitionRules();
  }

  /**
   * Initialize status transition rules
   */
  private initializeTransitionRules(): void {
    this.transitionRules = [
      // Pending -> Funded (when first deposit received)
      {
        from: [AgreementStatus.PENDING],
        to: AgreementStatus.FUNDED,
        condition: (ctx) => ctx.deposits.length > 0,
        reason: 'First deposit received',
      },
      // Funded/Pending -> USDC_LOCKED (when USDC deposit confirmed)
      {
        from: [AgreementStatus.PENDING, AgreementStatus.FUNDED],
        to: AgreementStatus.USDC_LOCKED,
        condition: (ctx) => ctx.hasUsdcDeposit && !ctx.hasNftDeposit,
        reason: 'USDC deposit confirmed',
      },
      // Funded/Pending -> NFT_LOCKED (when NFT deposit confirmed)
      {
        from: [AgreementStatus.PENDING, AgreementStatus.FUNDED],
        to: AgreementStatus.NFT_LOCKED,
        condition: (ctx) => ctx.hasNftDeposit && !ctx.hasUsdcDeposit,
        reason: 'NFT deposit confirmed',
      },
      // Any single-asset locked -> BOTH_LOCKED (when both assets deposited)
      {
        from: [AgreementStatus.USDC_LOCKED, AgreementStatus.NFT_LOCKED, AgreementStatus.FUNDED],
        to: AgreementStatus.BOTH_LOCKED,
        condition: (ctx) => ctx.hasUsdcDeposit && ctx.hasNftDeposit,
        reason: 'Both USDC and NFT deposited',
      },
      // Active states -> EXPIRED (when expiry time passed)
      {
        from: [
          AgreementStatus.PENDING,
          AgreementStatus.FUNDED,
          AgreementStatus.USDC_LOCKED,
          AgreementStatus.NFT_LOCKED,
          AgreementStatus.BOTH_LOCKED,
        ],
        to: AgreementStatus.EXPIRED,
        condition: (ctx) => ctx.isExpired,
        reason: 'Agreement expired',
      },
    ];
  }

  /**
   * Update agreement status based on current state
   */
  public async updateAgreementStatus(agreementId: string): Promise<StatusUpdateResult> {
    console.log(`[StatusUpdateService] Updating status for agreement: ${agreementId}`);

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

      const currentStatus = agreement.status;

      // Build context for rule evaluation
      const context = this.buildUpdateContext(agreement);

      // Find applicable transition rule
      const applicableRule = this.findApplicableRule(currentStatus, context);

      if (!applicableRule) {
        // No status change needed
        console.log(`[StatusUpdateService] No status change needed for ${agreementId} (current: ${currentStatus})`);
        return {
          agreementId,
          success: true,
          fromStatus: currentStatus,
          toStatus: currentStatus,
        };
      }

      // Apply status transition
      const newStatus = applicableRule.to;
      await this.transitionStatus(agreementId, currentStatus, newStatus, applicableRule.reason);

      console.log(`[StatusUpdateService] Status updated: ${agreementId} from ${currentStatus} to ${newStatus}`);

      return {
        agreementId,
        success: true,
        fromStatus: currentStatus,
        toStatus: newStatus,
      };
    } catch (error) {
      console.error(`[StatusUpdateService] Error updating status for ${agreementId}:`, error);
      const agreement = await prisma.agreement.findUnique({ where: { agreementId } });
      return {
        agreementId,
        success: false,
        fromStatus: agreement?.status || AgreementStatus.PENDING,
        toStatus: agreement?.status || AgreementStatus.PENDING,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build status update context from agreement data
   */
  private buildUpdateContext(agreement: any): StatusUpdateContext {
    const deposits = agreement.deposits || [];
    const hasUsdcDeposit = deposits.some((d: any) => d.type === DepositType.USDC);
    const hasNftDeposit = deposits.some((d: any) => d.type === DepositType.NFT);
    const isExpired = new Date() > new Date(agreement.expiry);
    const isCancelled = agreement.status === AgreementStatus.CANCELLED;

    return {
      agreement,
      deposits,
      hasUsdcDeposit,
      hasNftDeposit,
      isExpired,
      isCancelled,
    };
  }

  /**
   * Find applicable transition rule
   */
  private findApplicableRule(
    currentStatus: AgreementStatus,
    context: StatusUpdateContext
  ): StatusTransitionRule | null {
    // Check rules in order of priority
    for (const rule of this.transitionRules) {
      if (rule.from.includes(currentStatus) && rule.condition(context)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Transition agreement status
   */
  private async transitionStatus(
    agreementId: string,
    fromStatus: AgreementStatus,
    toStatus: AgreementStatus,
    reason: string
  ): Promise<void> {
    console.log(`[StatusUpdateService] Transitioning ${agreementId}: ${fromStatus} -> ${toStatus} (${reason})`);

    try {
      // Update agreement status in database
      const updateData: any = { status: toStatus };

      // Add timestamp fields for specific status transitions
      if (toStatus === AgreementStatus.SETTLED) {
        updateData.settledAt = new Date();
      } else if (toStatus === AgreementStatus.CANCELLED || toStatus === AgreementStatus.EXPIRED) {
        updateData.cancelledAt = new Date();
      }

      await prisma.agreement.update({
        where: { agreementId },
        data: updateData,
      });

      // Emit status transition event
      const event: StatusTransitionEvent = {
        agreementId,
        fromStatus,
        toStatus,
        reason,
        timestamp: new Date(),
        metadata: {},
      };

      await this.emitStatusTransition(event);
    } catch (error) {
      console.error(`[StatusUpdateService] Error transitioning status:`, error);
      throw error;
    }
  }

  /**
   * Batch update status for multiple agreements
   */
  public async batchUpdateStatus(agreementIds: string[]): Promise<Map<string, StatusUpdateResult>> {
    console.log(`[StatusUpdateService] Batch updating status for ${agreementIds.length} agreements`);

    const results = new Map<string, StatusUpdateResult>();

    for (const agreementId of agreementIds) {
      try {
        const result = await this.updateAgreementStatus(agreementId);
        results.set(agreementId, result);
      } catch (error) {
        console.error(`[StatusUpdateService] Error updating ${agreementId}:`, error);
        results.set(agreementId, {
          agreementId,
          success: false,
          fromStatus: AgreementStatus.PENDING,
          toStatus: AgreementStatus.PENDING,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get status transition history for an agreement
   */
  public async getStatusHistory(agreementId: string): Promise<StatusTransitionEvent[]> {
    // In a production system, this would query a status_history table
    // For now, return empty array as placeholder
    console.log(`[StatusUpdateService] Getting status history for ${agreementId}`);
    return [];
  }

  /**
   * Register status update listener
   */
  public onStatusUpdate(listener: StatusUpdateListener): void {
    this.listeners.push(listener);
    console.log(`[StatusUpdateService] Registered status update listener (total: ${this.listeners.length})`);
  }

  /**
   * Remove status update listener
   */
  public removeListener(listener: StatusUpdateListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
      console.log(`[StatusUpdateService] Removed status update listener (remaining: ${this.listeners.length})`);
    }
  }

  /**
   * Emit status transition event to all listeners
   */
  private async emitStatusTransition(event: StatusTransitionEvent): Promise<void> {
    console.log(`[StatusUpdateService] Emitting status transition event:`, {
      agreementId: event.agreementId,
      transition: `${event.fromStatus} -> ${event.toStatus}`,
      reason: event.reason,
    });

    // Notify all listeners
    for (const listener of this.listeners) {
      try {
        await listener(event);
      } catch (error) {
        console.error('[StatusUpdateService] Error in status update listener:', error);
      }
    }
  }

  /**
   * Validate status transition
   */
  public isValidTransition(from: AgreementStatus, to: AgreementStatus): boolean {
    // Define valid status transitions
    const validTransitions: Record<AgreementStatus, AgreementStatus[]> = {
      [AgreementStatus.PENDING]: [
        AgreementStatus.FUNDED,
        AgreementStatus.USDC_LOCKED,
        AgreementStatus.NFT_LOCKED,
        AgreementStatus.EXPIRED,
        AgreementStatus.CANCELLED,
      ],
      [AgreementStatus.FUNDED]: [
        AgreementStatus.USDC_LOCKED,
        AgreementStatus.NFT_LOCKED,
        AgreementStatus.BOTH_LOCKED,
        AgreementStatus.EXPIRED,
        AgreementStatus.CANCELLED,
      ],
      [AgreementStatus.USDC_LOCKED]: [
        AgreementStatus.BOTH_LOCKED,
        AgreementStatus.EXPIRED,
        AgreementStatus.CANCELLED,
      ],
      [AgreementStatus.NFT_LOCKED]: [
        AgreementStatus.BOTH_LOCKED,
        AgreementStatus.EXPIRED,
        AgreementStatus.CANCELLED,
      ],
      [AgreementStatus.BOTH_LOCKED]: [
        AgreementStatus.SETTLED,
        AgreementStatus.EXPIRED,
        AgreementStatus.CANCELLED,
      ],
      [AgreementStatus.SETTLED]: [], // Terminal state
      [AgreementStatus.EXPIRED]: [AgreementStatus.REFUNDED],
      [AgreementStatus.CANCELLED]: [AgreementStatus.REFUNDED],
      [AgreementStatus.REFUNDED]: [], // Terminal state
    };

    const allowedTransitions = validTransitions[from] || [];
    return allowedTransitions.includes(to);
  }

  /**
   * Force status update (with validation)
   */
  public async forceStatusUpdate(
    agreementId: string,
    newStatus: AgreementStatus,
    reason: string
  ): Promise<StatusUpdateResult> {
    console.log(`[StatusUpdateService] Force updating status for ${agreementId} to ${newStatus}`);

    try {
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId },
      });

      if (!agreement) {
        throw new Error(`Agreement ${agreementId} not found`);
      }

      const currentStatus = agreement.status;

      // Validate transition
      if (!this.isValidTransition(currentStatus, newStatus)) {
        throw new Error(`Invalid status transition: ${currentStatus} -> ${newStatus}`);
      }

      // Apply transition
      await this.transitionStatus(agreementId, currentStatus, newStatus, reason);

      return {
        agreementId,
        success: true,
        fromStatus: currentStatus,
        toStatus: newStatus,
      };
    } catch (error) {
      console.error(`[StatusUpdateService] Error force updating status:`, error);
      const agreement = await prisma.agreement.findUnique({ where: { agreementId } });
      return {
        agreementId,
        success: false,
        fromStatus: agreement?.status || AgreementStatus.PENDING,
        toStatus: agreement?.status || AgreementStatus.PENDING,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Singleton instance
let statusUpdateServiceInstance: StatusUpdateService | null = null;

/**
 * Get or create status update service singleton instance
 */
export function getStatusUpdateService(): StatusUpdateService {
  if (!statusUpdateServiceInstance) {
    statusUpdateServiceInstance = new StatusUpdateService();
  }
  return statusUpdateServiceInstance;
}

/**
 * Reset status update service instance (useful for testing)
 */
export function resetStatusUpdateService(): void {
  statusUpdateServiceInstance = null;
}

export default StatusUpdateService;

