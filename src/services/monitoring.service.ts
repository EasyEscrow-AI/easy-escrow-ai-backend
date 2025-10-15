/**
 * Monitoring Service
 *
 * Orchestrates monitoring of Solana escrow accounts for deposits.
 * Coordinates USDC and NFT deposit detection, validation, and database updates.
 */

import { AccountInfo, Context } from '@solana/web3.js';
import { getSolanaService } from './solana.service';
import { getUsdcDepositService } from './usdc-deposit.service';
import { getNftDepositService } from './nft-deposit.service';
import { prisma } from '../config/database';

/**
 * Monitoring configuration
 */
interface MonitoringConfig {
  pollingInterval?: number; // Milliseconds between fallback polls
  maxRetries?: number; // Max retries for failed operations
  retryDelayMs?: number; // Delay between retries
}

/**
 * Monitored account info
 */
interface MonitoredAccount {
  publicKey: string;
  agreementId: string;
  accountType: 'usdc' | 'nft';
  subscriptionId?: number;
}

/**
 * Monitoring Service Class
 *
 * Main service for monitoring escrow vault accounts.
 * Handles service lifecycle, error handling, and coordination.
 */
export class MonitoringService {
  private solanaService: ReturnType<typeof getSolanaService>;
  private usdcDepositService: ReturnType<typeof getUsdcDepositService>;
  private nftDepositService: ReturnType<typeof getNftDepositService>;
  private monitoredAccounts: Map<string, MonitoredAccount> = new Map();
  private isRunning: boolean = false;
  private config: Required<MonitoringConfig>;
  private pollingTimer?: NodeJS.Timeout;

  constructor(monitoringConfig?: MonitoringConfig) {
    this.solanaService = getSolanaService();
    this.usdcDepositService = getUsdcDepositService();
    this.nftDepositService = getNftDepositService();

    this.config = {
      pollingInterval: monitoringConfig?.pollingInterval || parseInt(process.env.MONITORING_POLL_INTERVAL_MS || '30000', 10), // Increased from 10s to 30s
      maxRetries: monitoringConfig?.maxRetries || 3,
      retryDelayMs: monitoringConfig?.retryDelayMs || 1000,
    };

    console.log('[MonitoringService] Initialized');
  }

  /**
   * Start the monitoring service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[MonitoringService] Service already running');
      return;
    }

    console.log('[MonitoringService] Starting monitoring service...');

    try {
      // Start Solana service
      await this.solanaService.start();

      // Load pending agreements and start monitoring
      await this.loadPendingAgreements();

      // Start fallback polling for reliability
      this.startPolling();

      this.isRunning = true;
      console.log('[MonitoringService] Monitoring service started successfully');
    } catch (error) {
      console.error('[MonitoringService] Failed to start monitoring service:', error);
      throw error;
    }
  }

  /**
   * Stop the monitoring service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[MonitoringService] Service not running');
      return;
    }

    console.log('[MonitoringService] Stopping monitoring service...');

    try {
      // Stop polling
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = undefined;
      }

      // Unsubscribe from all accounts
      await this.unsubscribeAll();

      // Stop Solana service
      await this.solanaService.stop();

      this.isRunning = false;
      console.log('[MonitoringService] Monitoring service stopped');
    } catch (error) {
      console.error('[MonitoringService] Error stopping monitoring service:', error);
      throw error;
    }
  }

  /**
   * Load pending agreements from database and start monitoring
   */
  private async loadPendingAgreements(): Promise<void> {
    try {
      console.log('[MonitoringService] Loading pending agreements...');

      // Get agreements that need monitoring (PENDING, FUNDED, or partially locked)
      const agreements = await prisma.agreement.findMany({
        where: {
          status: {
            in: ['PENDING', 'FUNDED', 'USDC_LOCKED', 'NFT_LOCKED'],
          },
          expiry: {
            gt: new Date(), // Not expired
          },
        },
        select: {
          id: true,
          agreementId: true,
          usdcDepositAddr: true,
          nftDepositAddr: true,
          status: true,
        },
      });

      console.log(`[MonitoringService] Found ${agreements.length} agreements to monitor`);

      // Start monitoring each agreement
      for (const agreement of agreements) {
        // Monitor USDC deposit address if not yet locked
        if (
          agreement.usdcDepositAddr &&
          !['USDC_LOCKED', 'BOTH_LOCKED'].includes(agreement.status)
        ) {
          await this.monitorAccount(agreement.usdcDepositAddr, agreement.id, 'usdc');
        }

        // Monitor NFT deposit address if not yet locked
        if (
          agreement.nftDepositAddr &&
          !['NFT_LOCKED', 'BOTH_LOCKED'].includes(agreement.status)
        ) {
          await this.monitorAccount(agreement.nftDepositAddr, agreement.id, 'nft');
        }
      }

      console.log(
        `[MonitoringService] Now monitoring ${this.monitoredAccounts.size} accounts`
      );
    } catch (error) {
      console.error('[MonitoringService] Error loading pending agreements:', error);
      throw error;
    }
  }

  /**
   * Start monitoring a specific account
   */
  async monitorAccount(
    publicKey: string,
    agreementId: string,
    accountType: 'usdc' | 'nft'
  ): Promise<void> {
    // Check if already monitoring
    if (this.monitoredAccounts.has(publicKey)) {
      console.log(`[MonitoringService] Already monitoring account: ${publicKey}`);
      return;
    }

    try {
      console.log(
        `[MonitoringService] Starting to monitor ${accountType} account: ${publicKey}`
      );

      // Subscribe to account changes
      const subscriptionId = await this.solanaService.subscribeToAccount(
        publicKey,
        async (accountInfo, context) => {
          await this.handleAccountChange(
            publicKey,
            accountInfo,
            context,
            accountType,
            agreementId
          );
        }
      );

      // Store monitored account info
      this.monitoredAccounts.set(publicKey, {
        publicKey,
        agreementId,
        accountType,
        subscriptionId,
      });

      console.log(
        `[MonitoringService] Successfully monitoring ${accountType} account: ${publicKey}`
      );
    } catch (error) {
      console.error(`[MonitoringService] Failed to monitor account ${publicKey}:`, error);
      throw error;
    }
  }

  /**
   * Stop monitoring a specific account
   */
  async stopMonitoringAccount(publicKey: string): Promise<void> {
    const monitoredAccount = this.monitoredAccounts.get(publicKey);
    if (!monitoredAccount) {
      console.log(`[MonitoringService] Account not being monitored: ${publicKey}`);
      return;
    }

    try {
      console.log(`[MonitoringService] Stopping monitoring of account: ${publicKey}`);

      // Unsubscribe from account changes
      await this.solanaService.unsubscribeFromAccount(publicKey);

      // Remove from monitored accounts
      this.monitoredAccounts.delete(publicKey);

      console.log(`[MonitoringService] Stopped monitoring account: ${publicKey}`);
    } catch (error) {
      console.error(
        `[MonitoringService] Error stopping monitoring of account ${publicKey}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Unsubscribe from all monitored accounts
   */
  private async unsubscribeAll(): Promise<void> {
    console.log(
      `[MonitoringService] Unsubscribing from ${this.monitoredAccounts.size} accounts...`
    );

    const promises = Array.from(this.monitoredAccounts.keys()).map((pubKey) =>
      this.stopMonitoringAccount(pubKey).catch((error) =>
        console.error(`[MonitoringService] Failed to stop monitoring ${pubKey}:`, error)
      )
    );

    await Promise.all(promises);
    console.log('[MonitoringService] All accounts unsubscribed');
  }

  /**
   * Handle account change event
   */
  private async handleAccountChange(
    publicKey: string,
    accountInfo: AccountInfo<Buffer> | null,
    context: Context,
    accountType: 'usdc' | 'nft',
    agreementId: string
  ): Promise<void> {
    try {
      console.log(
        `[MonitoringService] Account change detected for ${accountType} account: ${publicKey}`
      );
      console.log(`[MonitoringService] Slot: ${context.slot}`);

      if (!accountInfo) {
        console.log(`[MonitoringService] Account ${publicKey} has no data (possibly closed)`);
        return;
      }

      // Process the account change based on type
      if (accountType === 'usdc') {
        await this.handleUsdcAccountChange(publicKey, accountInfo, context, agreementId);
      } else if (accountType === 'nft') {
        await this.handleNftAccountChange(publicKey, accountInfo, context, agreementId);
      }
    } catch (error) {
      console.error(
        `[MonitoringService] Error handling account change for ${publicKey}:`,
        error
      );
      // Don't throw - we want to continue monitoring other accounts
    }
  }

  /**
   * Handle USDC account change
   */
  private async handleUsdcAccountChange(
    publicKey: string,
    accountInfo: AccountInfo<Buffer>,
    context: Context,
    agreementId: string
  ): Promise<void> {
    console.log(`[MonitoringService] Processing USDC account change`);
    console.log(`[MonitoringService] Account: ${publicKey}, Agreement: ${agreementId}`);

    try {
      const result = await this.usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      if (result.success) {
        console.log(
          `[MonitoringService] Successfully processed USDC deposit: ${result.amount} USDC`
        );

        // BUG FIX: Only stop monitoring when deposit is CONFIRMED, not just when depositId exists
        // This ensures we continue tracking pending deposits until they are fully confirmed
        if (result.depositId && result.status === 'CONFIRMED') {
          console.log(
            `[MonitoringService] Deposit confirmed, stopping monitoring of account: ${publicKey}`
          );
          await this.stopMonitoringAccount(publicKey);
        } else if (result.depositId && result.status === 'PENDING') {
          console.log(
            `[MonitoringService] Deposit pending, continuing to monitor account: ${publicKey}`
          );
        }
      } else {
        console.error(`[MonitoringService] Failed to process USDC deposit: ${result.error}`);
      }
    } catch (error) {
      console.error(`[MonitoringService] Error in USDC account change handler:`, error);
    }
  }

  /**
   * Handle NFT account change
   */
  private async handleNftAccountChange(
    publicKey: string,
    accountInfo: AccountInfo<Buffer>,
    context: Context,
    agreementId: string
  ): Promise<void> {
    console.log(`[MonitoringService] Processing NFT account change`);
    console.log(`[MonitoringService] Account: ${publicKey}, Agreement: ${agreementId}`);

    try {
      const result = await this.nftDepositService.handleNftAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      if (result.success) {
        console.log(`[MonitoringService] Successfully processed NFT deposit: ${result.mint}`);

        // BUG FIX: Only stop monitoring when deposit is CONFIRMED, not just when depositId exists
        // This ensures we continue tracking pending deposits until they are fully confirmed
        if (result.depositId && result.status === 'CONFIRMED') {
          console.log(
            `[MonitoringService] Deposit confirmed, stopping monitoring of account: ${publicKey}`
          );
          await this.stopMonitoringAccount(publicKey);
        } else if (result.depositId && result.status === 'PENDING') {
          console.log(
            `[MonitoringService] Deposit pending, continuing to monitor account: ${publicKey}`
          );
        }
      } else {
        console.error(`[MonitoringService] Failed to process NFT deposit: ${result.error}`);
      }
    } catch (error) {
      console.error(`[MonitoringService] Error in NFT account change handler:`, error);
    }
  }

  /**
   * Start fallback polling for reliability
   */
  private startPolling(): void {
    console.log(
      `[MonitoringService] Starting fallback polling (interval: ${this.config.pollingInterval}ms)`
    );

    this.pollingTimer = setInterval(async () => {
      await this.pollAccounts();
    }, this.config.pollingInterval);
  }

  /**
   * Poll all monitored accounts (fallback mechanism)
   */
  private async pollAccounts(): Promise<void> {
    if (this.monitoredAccounts.size === 0) {
      return;
    }

    try {
      const accounts = Array.from(this.monitoredAccounts.values());
      console.log(`[MonitoringService] Polling ${accounts.length} accounts...`);

      // Get account info for all monitored accounts
      const publicKeys = accounts.map((acc) => acc.publicKey);
      const accountInfos = await this.solanaService.getMultipleAccountsInfo(publicKeys);

      // Process each account
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        const accountInfo = accountInfos[i];

        if (accountInfo) {
          // Check if account has been updated since last poll
          // This is a simple fallback - WebSocket subscriptions are more reliable
          console.log(`[MonitoringService] Poll: Account ${account.publicKey} has data`);
        }
      }
    } catch (error) {
      console.error('[MonitoringService] Error during polling:', error);
    }
  }

  /**
   * Get service status
   */
  getStatus(): { isRunning: boolean; monitoredAccountsCount: number; solanaHealthy: boolean } {
    return {
      isRunning: this.isRunning,
      monitoredAccountsCount: this.monitoredAccounts.size,
      solanaHealthy: this.solanaService.getHealthStatus().healthy,
    };
  }

  /**
   * Get monitored accounts
   */
  getMonitoredAccounts(): MonitoredAccount[] {
    return Array.from(this.monitoredAccounts.values());
  }

  /**
   * Reload agreements (useful after new agreements are created)
   */
  async reloadAgreements(): Promise<void> {
    console.log('[MonitoringService] Reloading agreements...');
    await this.loadPendingAgreements();
  }
}

// Singleton instance
let monitoringServiceInstance: MonitoringService | null = null;

/**
 * Get or create monitoring service singleton instance
 */
export function getMonitoringService(config?: MonitoringConfig): MonitoringService {
  if (!monitoringServiceInstance) {
    monitoringServiceInstance = new MonitoringService(config);
  }
  return monitoringServiceInstance;
}

/**
 * Reset monitoring service instance (useful for testing)
 */
export function resetMonitoringService(): void {
  if (monitoringServiceInstance) {
    monitoringServiceInstance.stop().catch(console.error);
    monitoringServiceInstance = null;
  }
}

export default MonitoringService;
