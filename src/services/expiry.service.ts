/**
 * Expiry Service
 * 
 * Monitors and checks expiry timestamps for active escrow agreements.
 * Runs as a background service to identify and trigger actions on expired agreements.
 */

import { PrismaClient, AgreementStatus, DepositType } from '../generated/prisma';

const prisma = new PrismaClient();

/**
 * Configuration for expiry checking
 */
interface ExpiryCheckConfig {
  checkIntervalMs: number; // Interval between checks in milliseconds
  batchSize: number; // Number of agreements to process per batch
}

/**
 * Result of expiry check operation
 */
export interface ExpiryCheckResult {
  checkedCount: number;
  expiredCount: number;
  expiredAgreementIds: string[];
  errors: Array<{ agreementId: string; error: string }>;
}

/**
 * Expiry Service Class
 * 
 * Provides background monitoring of agreement expiry timestamps
 * and triggers appropriate actions when agreements expire.
 */
export class ExpiryService {
  private checkTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private config: ExpiryCheckConfig;
  private lastCheckTime: Date | null = null;

  constructor(config?: Partial<ExpiryCheckConfig>) {
    // Batch size can be configured via environment or constructor
    // Default: 200 (up from 50) for better throughput
    // Recommended range: 200-500 depending on system resources
    const defaultBatchSize = parseInt(process.env.EXPIRY_BATCH_SIZE || '200', 10);
    
    this.config = {
      checkIntervalMs: config?.checkIntervalMs || 60000, // Default: 1 minute
      batchSize: config?.batchSize || defaultBatchSize,
    };
    
    console.log(`[ExpiryService] Initialized with batch size: ${this.config.batchSize}`);
  }

  /**
   * Start the expiry checking service
   */
  public start(): void {
    if (this.isRunning) {
      console.log('[ExpiryService] Service is already running');
      return;
    }

    console.log(`[ExpiryService] Starting service with ${this.config.checkIntervalMs}ms interval`);
    this.isRunning = true;

    // Perform initial check immediately
    this.checkExpiredAgreements().catch(error => {
      console.error('[ExpiryService] Error in initial check:', error);
    });

    // Schedule periodic checks
    this.checkTimer = setInterval(async () => {
      try {
        await this.checkExpiredAgreements();
      } catch (error) {
        console.error('[ExpiryService] Error in periodic check:', error);
      }
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the expiry checking service
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log('[ExpiryService] Service is not running');
      return;
    }

    console.log('[ExpiryService] Stopping service');
    
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }

    this.isRunning = false;
  }

  /**
   * Check for expired agreements and process them
   */
  public async checkExpiredAgreements(): Promise<ExpiryCheckResult> {
    console.log('[ExpiryService] Checking for expired agreements...');
    
    const startTime = Date.now();
    const result: ExpiryCheckResult = {
      checkedCount: 0,
      expiredCount: 0,
      expiredAgreementIds: [],
      errors: [],
    };

    try {
      // Find active agreements that have expired
      const expiredAgreements = await prisma.agreement.findMany({
        where: {
          expiry: { lt: new Date() },
          status: {
            in: [
              AgreementStatus.PENDING,
              AgreementStatus.FUNDED,
              AgreementStatus.USDC_LOCKED,
              AgreementStatus.NFT_LOCKED,
              AgreementStatus.BOTH_LOCKED,
            ],
          },
        },
        take: this.config.batchSize,
        orderBy: { expiry: 'asc' },
      });

      result.checkedCount = expiredAgreements.length;

      // Process each expired agreement
      for (const agreement of expiredAgreements) {
        try {
          await this.handleExpiredAgreement(agreement.agreementId);
          result.expiredCount++;
          result.expiredAgreementIds.push(agreement.agreementId);
        } catch (error) {
          console.error(`[ExpiryService] Error processing agreement ${agreement.agreementId}:`, error);
          result.errors.push({
            agreementId: agreement.agreementId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const duration = Date.now() - startTime;
      this.lastCheckTime = new Date();

      console.log(
        `[ExpiryService] Check completed in ${duration}ms - ` +
        `Checked: ${result.checkedCount}, Expired: ${result.expiredCount}, Errors: ${result.errors.length}`
      );

      return result;
    } catch (error) {
      console.error('[ExpiryService] Error in checkExpiredAgreements:', error);
      throw error;
    }
  }

  /**
   * Handle a single expired agreement
   * Updates status and triggers appropriate refund actions
   */
  private async handleExpiredAgreement(agreementId: string): Promise<void> {
    console.log(`[ExpiryService] Processing expired agreement: ${agreementId}`);

    try {
      // Get the agreement with deposit information
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId },
        include: {
          deposits: {
            where: { status: 'CONFIRMED' },
          },
        },
      });

      if (!agreement) {
        throw new Error(`Agreement ${agreementId} not found`);
      }

      // Check if agreement has any confirmed deposits
      const hasDeposits = agreement.deposits.length > 0;
      const hasUsdcDeposit = agreement.deposits.some(d => d.type === DepositType.USDC);
      const hasNftDeposit = agreement.deposits.some(d => d.type === DepositType.NFT);

      // Determine appropriate status based on deposit state
      let newStatus: AgreementStatus;
      
      if (hasDeposits) {
        // If there are deposits, mark as expired (will need refund processing)
        newStatus = AgreementStatus.EXPIRED;
        console.log(`[ExpiryService] Agreement ${agreementId} expired with deposits - requires refund`);
      } else {
        // If no deposits, just mark as expired
        newStatus = AgreementStatus.EXPIRED;
        console.log(`[ExpiryService] Agreement ${agreementId} expired without deposits`);
      }

      // Update agreement status
      await prisma.agreement.update({
        where: { agreementId },
        data: {
          status: newStatus,
          cancelledAt: new Date(),
        },
      });

      console.log(`[ExpiryService] Successfully processed expired agreement: ${agreementId}`);
    } catch (error) {
      console.error(`[ExpiryService] Error handling expired agreement ${agreementId}:`, error);
      throw error;
    }
  }

  /**
   * Get agreements that are about to expire
   */
  public async getExpiringAgreements(withinMinutes: number = 60): Promise<any[]> {
    const expiryThreshold = new Date();
    expiryThreshold.setMinutes(expiryThreshold.getMinutes() + withinMinutes);

    return await prisma.agreement.findMany({
      where: {
        expiry: {
          gt: new Date(),
          lt: expiryThreshold,
        },
        status: {
          in: [
            AgreementStatus.PENDING,
            AgreementStatus.FUNDED,
            AgreementStatus.USDC_LOCKED,
            AgreementStatus.NFT_LOCKED,
            AgreementStatus.BOTH_LOCKED,
          ],
        },
      },
      orderBy: { expiry: 'asc' },
    });
  }

  /**
   * Check if service is running
   */
  public isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get last check time
   */
  public getLastCheckTime(): Date | null {
    return this.lastCheckTime;
  }

  /**
   * Get service status
   */
  public getStatus(): {
    running: boolean;
    lastCheck: Date | null;
    checkIntervalMs: number;
  } {
    return {
      running: this.isRunning,
      lastCheck: this.lastCheckTime,
      checkIntervalMs: this.config.checkIntervalMs,
    };
  }

  /**
   * Perform manual check (useful for testing or admin triggers)
   */
  public async performManualCheck(): Promise<ExpiryCheckResult> {
    console.log('[ExpiryService] Performing manual expiry check');
    return await this.checkExpiredAgreements();
  }
}

// Singleton instance
let expiryServiceInstance: ExpiryService | null = null;

/**
 * Get or create expiry service singleton instance
 */
export function getExpiryService(config?: Partial<ExpiryCheckConfig>): ExpiryService {
  if (!expiryServiceInstance) {
    expiryServiceInstance = new ExpiryService(config);
  }
  return expiryServiceInstance;
}

/**
 * Reset expiry service instance (useful for testing)
 */
export function resetExpiryService(): void {
  if (expiryServiceInstance) {
    expiryServiceInstance.stop();
    expiryServiceInstance = null;
  }
}

export default ExpiryService;

