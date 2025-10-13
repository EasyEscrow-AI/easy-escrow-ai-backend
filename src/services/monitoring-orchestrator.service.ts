/**
 * Monitoring Orchestrator Service
 * 
 * High-level orchestration service for monitoring operations.
 * Handles service lifecycle, error recovery, health monitoring, and metrics.
 */

import { getMonitoringService, MonitoringService } from './monitoring.service';
import { getSolanaService, SolanaService } from './solana.service';
import { getSettlementService, SettlementService } from './settlement.service';

/**
 * Service health status
 */
interface ServiceHealth {
  healthy: boolean;
  uptime: number;
  lastError?: string;
  lastErrorTime?: Date;
  monitoredAccounts: number;
  solanaHealthy: boolean;
  restartCount: number;
}

/**
 * Monitoring metrics
 */
interface MonitoringMetrics {
  totalDepositsDetected: number;
  usdcDepositsDetected: number;
  nftDepositsDetected: number;
  failedDeposits: number;
  accountChangesProcessed: number;
  lastActivityTime?: Date;
}

/**
 * Orchestrator configuration
 */
interface OrchestratorConfig {
  autoRestart?: boolean;
  maxRestarts?: number;
  restartDelayMs?: number;
  healthCheckIntervalMs?: number;
  metricsIntervalMs?: number;
}

/**
 * Monitoring Orchestrator Service Class
 * 
 * Manages the lifecycle of monitoring services with error recovery and health checks.
 */
export class MonitoringOrchestratorService {
  private monitoringService: MonitoringService;
  private solanaService: SolanaService;
  private settlementService: SettlementService;
  
  private isRunning: boolean = false;
  private startTime?: Date;
  private restartCount: number = 0;
  private lastError?: string;
  private lastErrorTime?: Date;
  
  private config: Required<OrchestratorConfig>;
  private healthCheckTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  
  // Metrics
  private metrics: MonitoringMetrics = {
    totalDepositsDetected: 0,
    usdcDepositsDetected: 0,
    nftDepositsDetected: 0,
    failedDeposits: 0,
    accountChangesProcessed: 0,
  };

  constructor(config?: OrchestratorConfig) {
    this.monitoringService = getMonitoringService();
    this.solanaService = getSolanaService();
    this.settlementService = getSettlementService();
    
    this.config = {
      autoRestart: config?.autoRestart ?? true,
      maxRestarts: config?.maxRestarts ?? 5,
      restartDelayMs: config?.restartDelayMs ?? 5000,
      healthCheckIntervalMs: config?.healthCheckIntervalMs ?? 30000, // 30 seconds
      metricsIntervalMs: config?.metricsIntervalMs ?? 60000, // 1 minute
    };
    
    console.log('[MonitoringOrchestrator] Initialized with deposit monitoring and settlement services');
  }

  /**
   * Start the orchestrator and monitoring services
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[MonitoringOrchestrator] Already running');
      return;
    }

    console.log('[MonitoringOrchestrator] Starting orchestrator...');
    
    try {
      // Start monitoring service
      await this.startMonitoringWithRetry();
      
      // Start settlement service
      await this.settlementService.start();
      console.log('[MonitoringOrchestrator] Settlement service started');
      
      // Start health checks
      this.startHealthChecks();
      
      // Start metrics collection
      this.startMetricsCollection();
      
      this.isRunning = true;
      this.startTime = new Date();
      
      console.log('[MonitoringOrchestrator] Orchestrator started successfully');
    } catch (error) {
      console.error('[MonitoringOrchestrator] Failed to start orchestrator:', error);
      this.recordError(error);
      throw error;
    }
  }

  /**
   * Stop the orchestrator and monitoring services
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[MonitoringOrchestrator] Not running');
      return;
    }

    console.log('[MonitoringOrchestrator] Stopping orchestrator...');
    
    try {
      // Stop health checks
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = undefined;
      }
      
      // Stop metrics collection
      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
        this.metricsTimer = undefined;
      }
      
      // Stop settlement service
      await this.settlementService.stop();
      console.log('[MonitoringOrchestrator] Settlement service stopped');
      
      // Stop monitoring service
      await this.monitoringService.stop();
      
      this.isRunning = false;
      console.log('[MonitoringOrchestrator] Orchestrator stopped');
    } catch (error) {
      console.error('[MonitoringOrchestrator] Error stopping orchestrator:', error);
      this.recordError(error);
      throw error;
    }
  }

  /**
   * Start monitoring service with retry logic
   */
  private async startMonitoringWithRetry(attempt: number = 1): Promise<void> {
    try {
      console.log(`[MonitoringOrchestrator] Starting monitoring service (attempt ${attempt}/${this.config.maxRestarts + 1})...`);
      await this.monitoringService.start();
      console.log('[MonitoringOrchestrator] Monitoring service started successfully');
    } catch (error) {
      console.error(`[MonitoringOrchestrator] Failed to start monitoring service (attempt ${attempt}):`, error);
      this.recordError(error);
      
      if (attempt < this.config.maxRestarts + 1) {
        console.log(`[MonitoringOrchestrator] Retrying in ${this.config.restartDelayMs}ms...`);
        await this.delay(this.config.restartDelayMs);
        return this.startMonitoringWithRetry(attempt + 1);
      } else {
        throw new Error(`Failed to start monitoring service after ${attempt} attempts`);
      }
    }
  }

  /**
   * Restart monitoring service
   */
  private async restartMonitoringService(): Promise<void> {
    if (this.restartCount >= this.config.maxRestarts) {
      console.error('[MonitoringOrchestrator] Max restart count reached, not restarting');
      this.isRunning = false;
      return;
    }

    try {
      console.log('[MonitoringOrchestrator] Restarting monitoring service...');
      this.restartCount++;
      
      // Stop current service
      await this.monitoringService.stop().catch((err: any) => {
        console.error('[MonitoringOrchestrator] Error stopping service during restart:', err);
      });
      
      // Wait before restarting
      await this.delay(this.config.restartDelayMs);
      
      // Start service
      await this.monitoringService.start();
      
      console.log('[MonitoringOrchestrator] Monitoring service restarted successfully');
    } catch (error) {
      console.error('[MonitoringOrchestrator] Failed to restart monitoring service:', error);
      this.recordError(error);
      
      // Try again if auto-restart is enabled
      if (this.config.autoRestart && this.restartCount < this.config.maxRestarts) {
        await this.delay(this.config.restartDelayMs);
        await this.restartMonitoringService();
      } else {
        this.isRunning = false;
      }
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    console.log(`[MonitoringOrchestrator] Starting health checks (interval: ${this.config.healthCheckIntervalMs}ms)`);
    
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Perform health check on services
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // Check Solana service health
      const solanaHealthy = await this.solanaService.checkHealth();
      
      // Check monitoring service status
      const monitoringStatus = this.monitoringService.getStatus();
      
      if (!solanaHealthy) {
        console.warn('[MonitoringOrchestrator] Solana service is unhealthy');
      }
      
      if (!monitoringStatus.isRunning) {
        console.warn('[MonitoringOrchestrator] Monitoring service is not running');
        
        // Attempt restart if auto-restart is enabled
        if (this.config.autoRestart && this.isRunning) {
          console.log('[MonitoringOrchestrator] Attempting to restart monitoring service...');
          await this.restartMonitoringService();
        }
      }
      
      // Log health status
      console.log('[MonitoringOrchestrator] Health check:', {
        solanaHealthy,
        monitoringRunning: monitoringStatus.isRunning,
        monitoredAccounts: monitoringStatus.monitoredAccountsCount,
        restartCount: this.restartCount,
      });
    } catch (error) {
      console.error('[MonitoringOrchestrator] Error during health check:', error);
      this.recordError(error);
    }
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    console.log(`[MonitoringOrchestrator] Starting metrics collection (interval: ${this.config.metricsIntervalMs}ms)`);
    
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsIntervalMs);
  }

  /**
   * Collect and log metrics
   */
  private collectMetrics(): void {
    try {
      const status = this.monitoringService.getStatus();
      const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
      
      console.log('[MonitoringOrchestrator] Metrics:', {
        uptime: `${Math.floor(uptime / 1000 / 60)} minutes`,
        monitoredAccounts: status.monitoredAccountsCount,
        totalDepositsDetected: this.metrics.totalDepositsDetected,
        usdcDeposits: this.metrics.usdcDepositsDetected,
        nftDeposits: this.metrics.nftDepositsDetected,
        failedDeposits: this.metrics.failedDeposits,
        accountChanges: this.metrics.accountChangesProcessed,
        restartCount: this.restartCount,
      });
    } catch (error) {
      console.error('[MonitoringOrchestrator] Error collecting metrics:', error);
    }
  }

  /**
   * Get service health status
   */
  public getHealth(): ServiceHealth {
    const status = this.monitoringService.getStatus();
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    
    return {
      healthy: this.isRunning && status.isRunning && status.solanaHealthy,
      uptime,
      lastError: this.lastError,
      lastErrorTime: this.lastErrorTime,
      monitoredAccounts: status.monitoredAccountsCount,
      solanaHealthy: status.solanaHealthy,
      restartCount: this.restartCount,
    };
  }

  /**
   * Get current metrics
   */
  public getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  /**
   * Increment metrics
   */
  public incrementMetric(metric: keyof MonitoringMetrics, value: number = 1): void {
    if (typeof this.metrics[metric] === 'number') {
      (this.metrics[metric] as number) += value;
      this.metrics.lastActivityTime = new Date();
    }
  }

  /**
   * Record an error
   */
  private recordError(error: any): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    this.lastErrorTime = new Date();
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reload agreements (useful when new agreements are created)
   */
  public async reloadAgreements(): Promise<void> {
    try {
      console.log('[MonitoringOrchestrator] Reloading agreements...');
      await this.monitoringService.reloadAgreements();
      console.log('[MonitoringOrchestrator] Agreements reloaded successfully');
    } catch (error) {
      console.error('[MonitoringOrchestrator] Error reloading agreements:', error);
      this.recordError(error);
      throw error;
    }
  }

  /**
   * Reset restart count (useful after successful operation period)
   */
  public resetRestartCount(): void {
    console.log('[MonitoringOrchestrator] Resetting restart count');
    this.restartCount = 0;
  }

  /**
   * Check if service is running
   */
  public isServiceRunning(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
let orchestratorInstance: MonitoringOrchestratorService | null = null;

/**
 * Get or create monitoring orchestrator singleton instance
 */
export function getMonitoringOrchestrator(config?: OrchestratorConfig): MonitoringOrchestratorService {
  if (!orchestratorInstance) {
    orchestratorInstance = new MonitoringOrchestratorService(config);
  }
  return orchestratorInstance;
}

/**
 * Reset orchestrator instance (useful for testing)
 */
export function resetMonitoringOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.stop().catch(console.error);
    orchestratorInstance = null;
  }
}

export default MonitoringOrchestratorService;

