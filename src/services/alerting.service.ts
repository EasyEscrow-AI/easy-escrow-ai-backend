/**
 * Error Alerting Service
 * 
 * Monitors critical system failures and sends alerts:
 * - Database connection loss
 * - RPC endpoint failures
 * - Nonce pool depletion
 * - Treasury balance low
 * - High error rates
 * 
 * Features:
 * - Alert severity levels (CRITICAL, HIGH, MEDIUM)
 * - Alert throttling (prevents spam)
 * - Recovery notifications
 * - Email notifications (configurable)
 * - Console alerts (always)
 */

import { logger } from './logger.service';

export enum AlertSeverity {
  CRITICAL = 'CRITICAL', // Immediate action required
  HIGH = 'HIGH',         // Action needed within hours
  MEDIUM = 'MEDIUM',     // Monitor closely
}

export interface Alert {
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AlertConfig {
  /** Enable email notifications (requires SMTP configuration) */
  emailEnabled: boolean;
  
  /** Email addresses to notify (comma-separated) */
  emailRecipients?: string;
  
  /** Throttle duration in milliseconds (default: 15 minutes) */
  throttleDurationMs: number;
  
  /** Enable console alerts (always true in development) */
  consoleEnabled: boolean;
}

export class AlertingService {
  private static instance: AlertingService;
  private config: AlertConfig;
  
  // Track last alert time for throttling
  private lastAlertTime: Map<string, number> = new Map();
  
  // Track active alerts for recovery detection
  private activeAlerts: Map<string, Alert> = new Map();
  
  // Metrics
  private totalAlerts = 0;
  private throttledAlerts = 0;
  
  private constructor(config?: Partial<AlertConfig>) {
    this.config = {
      emailEnabled: process.env.ALERT_EMAIL_ENABLED === 'true',
      emailRecipients: process.env.ALERT_EMAIL_RECIPIENTS,
      throttleDurationMs: 15 * 60 * 1000, // 15 minutes
      consoleEnabled: true,
      ...config,
    };
    
    logger.info('[AlertingService] Initialized', {
      emailEnabled: this.config.emailEnabled,
      throttleDuration: `${this.config.throttleDurationMs / 60000} minutes`,
    });
  }
  
  static getInstance(config?: Partial<AlertConfig>): AlertingService {
    if (!AlertingService.instance) {
      AlertingService.instance = new AlertingService(config);
    }
    return AlertingService.instance;
  }
  
  /**
   * Send an alert
   * Handles throttling and notification delivery
   */
  async sendAlert(
    alertType: string,
    severity: AlertSeverity,
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const now = Date.now();
    const lastAlertTime = this.lastAlertTime.get(alertType) || 0;
    
    // Check throttling
    if (now - lastAlertTime < this.config.throttleDurationMs) {
      this.throttledAlerts++;
      logger.debug('[AlertingService] Alert throttled', {
        alertType,
        severity,
        timeSinceLastAlert: `${(now - lastAlertTime) / 1000}s`,
      });
      return;
    }
    
    // Create alert
    const alert: Alert = {
      severity,
      title,
      message,
      timestamp: new Date(),
      metadata,
    };
    
    // Update tracking
    this.lastAlertTime.set(alertType, now);
    this.activeAlerts.set(alertType, alert);
    this.totalAlerts++;
    
    // Log alert
    logger.error(`[ALERT ${severity}] ${title}`, {
      alertType,
      message,
      ...metadata,
    });
    
    // Console notification (formatted)
    if (this.config.consoleEnabled) {
      this.sendConsoleAlert(alert, alertType);
    }
    
    // Email notification (if enabled)
    if (this.config.emailEnabled && this.config.emailRecipients) {
      await this.sendEmailAlert(alert, alertType).catch((error) => {
        logger.error('[AlertingService] Failed to send email alert', {
          error: error.message,
          alertType,
        });
      });
    }
  }
  
  /**
   * Send recovery notification when issue is resolved
   */
  async sendRecovery(alertType: string, message: string, metadata?: Record<string, any>): Promise<void> {
    const activeAlert = this.activeAlerts.get(alertType);
    
    if (!activeAlert) {
      // No active alert, nothing to recover from
      return;
    }
    
    // Clear active alert
    this.activeAlerts.delete(alertType);
    
    // Log recovery
    logger.info(`[RECOVERY] ${alertType} - ${message}`, metadata);
    
    // Console notification
    if (this.config.consoleEnabled) {
      console.log('\n╔═══════════════════════════════════════════════════════════╗');
      console.log('║         ✅ ALERT RECOVERY                                 ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log(`Alert Type: ${alertType}`);
      console.log(`Message: ${message}`);
      console.log(`Original Alert: ${activeAlert.title}`);
      console.log(`Recovery Time: ${new Date().toISOString()}`);
      if (metadata) {
        console.log('Metadata:', JSON.stringify(metadata, null, 2));
      }
      console.log('═══════════════════════════════════════════════════════════\n');
    }
    
    // Email notification (if enabled)
    if (this.config.emailEnabled && this.config.emailRecipients) {
      await this.sendEmailRecovery(alertType, message, metadata).catch((error) => {
        logger.error('[AlertingService] Failed to send recovery email', {
          error: error.message,
          alertType,
        });
      });
    }
  }
  
  /**
   * Send formatted console alert
   */
  private sendConsoleAlert(alert: Alert, alertType: string): void {
    const severityEmoji = {
      [AlertSeverity.CRITICAL]: '🚨',
      [AlertSeverity.HIGH]: '⚠️',
      [AlertSeverity.MEDIUM]: '⚡',
    };
    
    console.error('\n╔═══════════════════════════════════════════════════════════╗');
    console.error(`║         ${severityEmoji[alert.severity]} ALERT: ${alert.severity}                               ║`);
    console.error('╚═══════════════════════════════════════════════════════════╝');
    console.error(`Alert Type: ${alertType}`);
    console.error(`Title: ${alert.title}`);
    console.error(`Message: ${alert.message}`);
    console.error(`Time: ${alert.timestamp.toISOString()}`);
    if (alert.metadata) {
      console.error('Metadata:', JSON.stringify(alert.metadata, null, 2));
    }
    console.error('═══════════════════════════════════════════════════════════\n');
  }
  
  /**
   * Send email alert (placeholder - requires SMTP configuration)
   */
  private async sendEmailAlert(alert: Alert, alertType: string): Promise<void> {
    // TODO: Implement email sending when SMTP is configured
    // This would use nodemailer or similar library
    logger.debug('[AlertingService] Email alert would be sent here', {
      alertType,
      recipients: this.config.emailRecipients,
      subject: `[${alert.severity}] ${alert.title}`,
    });
  }
  
  /**
   * Send email recovery notification (placeholder)
   */
  private async sendEmailRecovery(alertType: string, message: string, metadata?: Record<string, any>): Promise<void> {
    // TODO: Implement email sending when SMTP is configured
    logger.debug('[AlertingService] Recovery email would be sent here', {
      alertType,
      recipients: this.config.emailRecipients,
      subject: `[RECOVERY] ${alertType}`,
    });
  }
  
  /**
   * Predefined alert methods for common scenarios
   */
  
  async alertDatabaseDown(): Promise<void> {
    await this.sendAlert(
      'database_down',
      AlertSeverity.CRITICAL,
      'Database Connection Lost',
      'The database connection is down. All API operations are affected.',
      { component: 'database' }
    );
  }
  
  async alertDatabaseRecovered(): Promise<void> {
    await this.sendRecovery(
      'database_down',
      'Database connection restored successfully',
      { component: 'database' }
    );
  }
  
  async alertRPCDown(endpoint: string): Promise<void> {
    await this.sendAlert(
      'rpc_down',
      AlertSeverity.CRITICAL,
      'RPC Endpoint Failure',
      `RPC endpoint ${endpoint} is not responding. Solana operations may fail.`,
      { component: 'rpc', endpoint }
    );
  }
  
  async alertRPCRecovered(endpoint: string): Promise<void> {
    await this.sendRecovery(
      'rpc_down',
      `RPC endpoint ${endpoint} connection restored`,
      { component: 'rpc', endpoint }
    );
  }
  
  async alertNoncePoolDepleted(stats: { total: number; available: number }): Promise<void> {
    await this.sendAlert(
      'nonce_pool_depleted',
      AlertSeverity.CRITICAL,
      'Nonce Pool Completely Depleted',
      `All nonce accounts are in use (${stats.available}/${stats.total} available). New swaps will fail.`,
      { component: 'nonce-pool', stats }
    );
  }
  
  async alertNoncePoolLow(stats: { total: number; available: number }): Promise<void> {
    await this.sendAlert(
      'nonce_pool_low',
      AlertSeverity.HIGH,
      'Nonce Pool Running Low',
      `Nonce pool has only ${stats.available}/${stats.total} accounts available. Replenishment needed.`,
      { component: 'nonce-pool', stats }
    );
  }
  
  async alertNoncePoolRecovered(stats: { total: number; available: number }): Promise<void> {
    await this.sendRecovery(
      'nonce_pool_depleted',
      `Nonce pool replenished successfully (${stats.available}/${stats.total} available)`,
      { component: 'nonce-pool', stats }
    );
  }
  
  async alertTreasuryCritical(balance: number, address: string): Promise<void> {
    await this.sendAlert(
      'treasury_critical',
      AlertSeverity.CRITICAL,
      'Treasury Balance Critical',
      `Treasury PDA balance is critically low: ${(balance / 1e9).toFixed(4)} SOL`,
      { component: 'treasury', balance, address }
    );
  }
  
  async alertTreasuryLow(balance: number, address: string): Promise<void> {
    await this.sendAlert(
      'treasury_low',
      AlertSeverity.HIGH,
      'Treasury Balance Low',
      `Treasury PDA balance is running low: ${(balance / 1e9).toFixed(4)} SOL`,
      { component: 'treasury', balance, address }
    );
  }
  
  async alertTreasuryRecovered(balance: number, address: string): Promise<void> {
    await this.sendRecovery(
      'treasury_critical',
      `Treasury balance replenished: ${(balance / 1e9).toFixed(4)} SOL`,
      { component: 'treasury', balance, address }
    );
  }
  
  async alertHighErrorRate(errorRate: number, timeWindow: string): Promise<void> {
    await this.sendAlert(
      'high_error_rate',
      AlertSeverity.HIGH,
      'High Transaction Error Rate',
      `Error rate is ${(errorRate * 100).toFixed(1)}% over the last ${timeWindow}`,
      { component: 'transactions', errorRate, timeWindow }
    );
  }
  
  /**
   * Get alerting service status and metrics
   */
  getStatus(): {
    emailEnabled: boolean;
    consoleEnabled: boolean;
    totalAlerts: number;
    throttledAlerts: number;
    activeAlerts: number;
    activeAlertTypes: string[];
  } {
    return {
      emailEnabled: this.config.emailEnabled,
      consoleEnabled: this.config.consoleEnabled,
      totalAlerts: this.totalAlerts,
      throttledAlerts: this.throttledAlerts,
      activeAlerts: this.activeAlerts.size,
      activeAlertTypes: Array.from(this.activeAlerts.keys()),
    };
  }
  
  /**
   * Clear all active alerts (for testing/maintenance)
   */
  clearActiveAlerts(): void {
    this.activeAlerts.clear();
    logger.info('[AlertingService] All active alerts cleared');
  }
}

/**
 * Export singleton instance
 */
export const alertingService = AlertingService.getInstance();


