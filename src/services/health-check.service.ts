/**
 * Health Check Service
 * 
 * Comprehensive health monitoring for atomic swap platform:
 * - Database connectivity
 * - Redis connectivity
 * - Nonce pool health
 * - Treasury PDA balance
 * - RPC connectivity
 * - Response caching (30-60s TTL)
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { NoncePoolManager } from './noncePoolManager';
import { IdempotencyService } from './idempotency.service';
import { alertingService } from './alerting.service';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  service: string;
  mode: string;
  database: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
  idempotency: {
    status: 'running' | 'stopped';
    expirationHours: number;
    cleanupIntervalMinutes: number;
  };
  noncePool: {
    status: 'running' | 'error';
    total?: number;
    available?: number;
    inUse?: number;
    expired?: number;
    health?: 'healthy' | 'low' | 'depleted';
    error?: string;
  };
  treasury: {
    status: 'healthy' | 'low' | 'critical' | 'error';
    address?: string;
    balance?: number;
    balanceSOL?: string;
    threshold?: number;
    error?: string;
  };
  rpc: {
    status: 'connected' | 'slow' | 'disconnected';
    endpoint: string;
    responseTime?: number;
    error?: string;
  };
  cached: boolean;
}

export interface HealthCheckConfig {
  /** Cache TTL in seconds (default: 30) */
  cacheTTL: number;
  
  /** Minimum treasury balance in lamports (default: 1 SOL) */
  treasuryMinBalance: number;
  
  /** RPC timeout in ms (default: 5000) */
  rpcTimeout: number;
  
  /** Threshold for slow RPC response in ms (default: 2000) */
  rpcSlowThreshold: number;
}

export class HealthCheckService {
  private connection: Connection;
  private noncePoolManager: NoncePoolManager;
  private idempotencyService: IdempotencyService;
  private checkDatabaseHealth: () => Promise<boolean>;
  private checkRedisHealth: () => Promise<boolean>;
  private programId: PublicKey;
  private platformAuthority: PublicKey;
  private config: HealthCheckConfig;
  
  // Caching
  private cachedResult: HealthCheckResult | null = null;
  private cacheExpiry: number = 0;
  
  // Track previous health states for recovery detection
  private previousStates: {
    database: boolean;
    redis: boolean;
    rpc: boolean;
    treasury: string;
    noncePool: string;
  } = {
    database: true,
    redis: true,
    rpc: true,
    treasury: 'healthy',
    noncePool: 'healthy',
  };
  
  constructor(
    connection: Connection,
    noncePoolManager: NoncePoolManager,
    idempotencyService: IdempotencyService,
    checkDatabaseHealth: () => Promise<boolean>,
    checkRedisHealth: () => Promise<boolean>,
    programId: PublicKey,
    platformAuthority: PublicKey,
    config?: Partial<HealthCheckConfig>
  ) {
    this.connection = connection;
    this.noncePoolManager = noncePoolManager;
    this.idempotencyService = idempotencyService;
    this.checkDatabaseHealth = checkDatabaseHealth;
    this.checkRedisHealth = checkRedisHealth;
    this.programId = programId;
    this.platformAuthority = platformAuthority;
    this.config = {
      cacheTTL: 30, // 30 seconds default
      treasuryMinBalance: 1_000_000_000, // 1 SOL in lamports
      rpcTimeout: 5000, // 5 seconds
      rpcSlowThreshold: 2000, // 2 seconds
      ...config,
    };
    
    console.log('[HealthCheckService] Initialized with config:', this.config);
  }
  
  /**
   * Perform comprehensive health check
   * Returns cached result if available and not expired
   */
  async check(forceRefresh = false): Promise<HealthCheckResult> {
    const now = Date.now();
    
    // Return cached result if still valid
    if (!forceRefresh && this.cachedResult && now < this.cacheExpiry) {
      console.log('[HealthCheckService] Returning cached result');
      return { ...this.cachedResult, cached: true };
    }
    
    console.log('[HealthCheckService] Performing fresh health check');
    
    // Perform all checks in parallel for speed
    const [
      dbHealthy,
      redisHealthy,
      noncePoolResult,
      treasuryResult,
      rpcResult,
    ] = await Promise.all([
      this.checkDatabaseHealth().catch(() => false),
      this.checkRedisHealth().catch(() => false),
      this.checkNoncePool().catch((error) => ({
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
      })),
      this.checkTreasury().catch((error) => ({
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
      })),
      this.checkRPC().catch((error) => ({
        status: 'disconnected' as const,
        endpoint: this.connection.rpcEndpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      })),
    ]);
    
    const idempotencyStatus = this.idempotencyService.getStatus();
    
    // Trigger alerts for critical failures and recovery notifications
    await this.handleAlerts(dbHealthy, redisHealthy, noncePoolResult, treasuryResult, rpcResult);
    
    // Determine overall health status
    const criticalHealthy = dbHealthy && redisHealthy && idempotencyStatus.isRunning;
    const rpcHealthy = rpcResult.status === 'connected' || rpcResult.status === 'slow';
    const treasuryHealthy = treasuryResult.status === 'healthy' || treasuryResult.status === 'low';
    
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    if (criticalHealthy && rpcHealthy && treasuryHealthy) {
      overallStatus = 'healthy';
    } else if (criticalHealthy && rpcHealthy) {
      // Treasury issues are warnings, not critical failures
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }
    
    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: 'easy-escrow-ai-backend',
      mode: 'atomic-swap',
      database: dbHealthy ? 'connected' : 'disconnected',
      redis: redisHealthy ? 'connected' : 'disconnected',
      idempotency: {
        status: idempotencyStatus.isRunning ? 'running' : 'stopped',
        expirationHours: idempotencyStatus.expirationHours,
        cleanupIntervalMinutes: idempotencyStatus.cleanupIntervalMinutes,
      },
      noncePool: noncePoolResult,
      treasury: treasuryResult,
      rpc: rpcResult,
      cached: false,
    };
    
    // Cache the result
    this.cachedResult = result;
    this.cacheExpiry = now + (this.config.cacheTTL * 1000);
    
    console.log('[HealthCheckService] Health check complete:', {
      status: overallStatus,
      database: dbHealthy,
      redis: redisHealthy,
      rpc: rpcResult.status,
      treasury: treasuryResult.status,
      noncePool: typeof noncePoolResult === 'object' && 'health' in noncePoolResult ? noncePoolResult.health : 'error',
    });
    
    return result;
  }
  
  /**
   * Clear cached result (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cachedResult = null;
    this.cacheExpiry = 0;
    console.log('[HealthCheckService] Cache cleared');
  }
  
  /**
   * Handle alerting for health check results
   * Triggers alerts for failures and recovery notifications for resolutions
   */
  private async handleAlerts(
    dbHealthy: boolean,
    redisHealthy: boolean,
    noncePoolResult: any,
    treasuryResult: any,
    rpcResult: any
  ): Promise<void> {
    // Database alerts
    if (!dbHealthy && this.previousStates.database) {
      await alertingService.alertDatabaseDown();
    } else if (dbHealthy && !this.previousStates.database) {
      await alertingService.alertDatabaseRecovered();
    }
    this.previousStates.database = dbHealthy;
    
    // Redis is tracked but not critical for alerting (logged only)
    this.previousStates.redis = redisHealthy;
    
    // RPC alerts
    const rpcHealthy = rpcResult.status === 'connected' || rpcResult.status === 'slow';
    if (!rpcHealthy && this.previousStates.rpc) {
      await alertingService.alertRPCDown(rpcResult.endpoint);
    } else if (rpcHealthy && !this.previousStates.rpc) {
      await alertingService.alertRPCRecovered(rpcResult.endpoint);
    }
    this.previousStates.rpc = rpcHealthy;
    
    // Nonce pool alerts
    if (typeof noncePoolResult === 'object' && 'health' in noncePoolResult) {
      const currentHealth = noncePoolResult.health;
      const prevHealth = this.previousStates.noncePool;
      
      if (currentHealth === 'depleted' && prevHealth !== 'depleted') {
        await alertingService.alertNoncePoolDepleted({
          total: noncePoolResult.total,
          available: noncePoolResult.available,
        });
      } else if (currentHealth === 'low' && prevHealth === 'healthy') {
        await alertingService.alertNoncePoolLow({
          total: noncePoolResult.total,
          available: noncePoolResult.available,
        });
      } else if (currentHealth === 'healthy' && (prevHealth === 'depleted' || prevHealth === 'low')) {
        await alertingService.alertNoncePoolRecovered({
          total: noncePoolResult.total,
          available: noncePoolResult.available,
        });
      }
      
      this.previousStates.noncePool = currentHealth;
    }
    
    // Treasury alerts
    if (typeof treasuryResult === 'object' && 'status' in treasuryResult) {
      const currentStatus = treasuryResult.status;
      const prevStatus = this.previousStates.treasury;
      
      if (currentStatus === 'critical' && prevStatus !== 'critical') {
        await alertingService.alertTreasuryCritical(
          treasuryResult.balance,
          treasuryResult.address
        );
      } else if (currentStatus === 'low' && prevStatus === 'healthy') {
        await alertingService.alertTreasuryLow(
          treasuryResult.balance,
          treasuryResult.address
        );
      } else if (currentStatus === 'healthy' && (prevStatus === 'critical' || prevStatus === 'low')) {
        await alertingService.alertTreasuryRecovered(
          treasuryResult.balance,
          treasuryResult.address
        );
      }
      
      this.previousStates.treasury = currentStatus;
    }
  }
  
  /**
   * Check nonce pool health
   */
  private async checkNoncePool() {
    try {
      const stats = await this.noncePoolManager.getPoolStats();
      
      let health: 'healthy' | 'low' | 'depleted';
      if (stats.available === 0) {
        health = 'depleted';
      } else if (stats.available < 5) {
        health = 'low';
      } else {
        health = 'healthy';
      }
      
      return {
        status: 'running' as const,
        total: stats.total,
        available: stats.available,
        inUse: stats.inUse,
        expired: stats.expired,
        health,
      };
    } catch (error) {
      console.error('[HealthCheckService] Nonce pool check failed:', error);
      throw error;
    }
  }
  
  /**
   * Check treasury PDA balance
   */
  private async checkTreasury() {
    try {
      // Derive treasury PDA same way as in offers.routes.ts
      const [treasuryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('main_treasury'), this.platformAuthority.toBuffer()],
        this.programId
      );
      
      const balance = await this.connection.getBalance(treasuryPDA);
      const balanceSOL = (balance / 1_000_000_000).toFixed(4);
      
      let status: 'healthy' | 'low' | 'critical';
      if (balance < this.config.treasuryMinBalance * 0.1) {
        // Less than 10% of minimum (e.g., < 0.1 SOL if min is 1 SOL)
        status = 'critical';
      } else if (balance < this.config.treasuryMinBalance) {
        status = 'low';
      } else {
        status = 'healthy';
      }
      
      return {
        status,
        address: treasuryPDA.toBase58(),
        balance,
        balanceSOL: `${balanceSOL} SOL`,
        threshold: this.config.treasuryMinBalance,
      };
    } catch (error) {
      console.error('[HealthCheckService] Treasury check failed:', error);
      throw error;
    }
  }
  
  /**
   * Check RPC connectivity and response time
   */
  private async checkRPC() {
    const startTime = Date.now();
    
    try {
      // Simple RPC call to test connectivity
      await Promise.race([
        this.connection.getSlot(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('RPC timeout')), this.config.rpcTimeout)
        ),
      ]);
      
      const responseTime = Date.now() - startTime;
      
      let status: 'connected' | 'slow';
      if (responseTime > this.config.rpcSlowThreshold) {
        status = 'slow';
      } else {
        status = 'connected';
      }
      
      return {
        status,
        endpoint: this.connection.rpcEndpoint,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[HealthCheckService] RPC check failed:', error);
      
      return {
        status: 'disconnected' as const,
        endpoint: this.connection.rpcEndpoint,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Get status code based on health result
   */
  getStatusCode(result: HealthCheckResult): number {
    switch (result.status) {
      case 'healthy':
        return 200;
      case 'degraded':
        return 200; // Still operational, but with warnings
      case 'unhealthy':
        return 503;
      default:
        return 503;
    }
  }
}

