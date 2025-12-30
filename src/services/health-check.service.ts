/**
 * Health Check Service
 * 
 * Comprehensive health monitoring for atomic swap platform:
 * - Database connectivity
 * - Redis connectivity
 * - Nonce pool health
 * - Fee payer wallet balance (admin wallet that pays for transactions)
 * - RPC connectivity
 * - Response caching (30-60s TTL)
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { NoncePoolManager } from './noncePoolManager';
import { IdempotencyService } from './idempotency.service';
import { alertingService } from './alerting.service';

/**
 * Mask a sensitive string (API key) based on its length
 * - Very short keys (< 8 chars): fully masked
 * - Short keys (8-15 chars): show first 2 and last 2 only
 * - Long keys (16+ chars): show first 4 and last 4
 */
function maskApiKey(key: string): string {
  if (key.length < 8) {
    return '****';
  } else if (key.length < 16) {
    return `${key.substring(0, 2)}...${key.substring(key.length - 2)}`;
  } else {
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  }
}

/**
 * Mask RPC endpoint URL to hide API keys
 * Handles various RPC URL formats:
 * - QuickNode: https://xxx.solana-mainnet.quiknode.pro/API_KEY/
 * - Helius: https://mainnet.helius-rpc.com/?api-key=API_KEY
 * - Alchemy: https://solana-mainnet.g.alchemy.com/v2/API_KEY
 *
 * Masks both query param and path-based API keys if both exist.
 *
 * @param url - The RPC endpoint URL
 * @returns Masked URL with API key(s) hidden
 */
function maskRpcEndpoint(url: string): string {
  try {
    const urlObj = new URL(url);
    let foundApiKey = false;

    // Check for API key in query params (e.g., Helius)
    for (const paramName of ['api-key', 'api_key']) {
      const apiKeyParam = urlObj.searchParams.get(paramName);
      if (apiKeyParam && apiKeyParam.length >= 8) {
        urlObj.searchParams.set(paramName, maskApiKey(apiKeyParam));
        foundApiKey = true;
      }
    }

    // Check for API key in path (e.g., QuickNode, Alchemy)
    // Pattern: /API_KEY/ or /v2/API_KEY
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      // API keys are typically 32+ characters of hex/alphanumeric
      if (lastPart.length >= 32 && /^[a-zA-Z0-9_-]+$/.test(lastPart)) {
        pathParts[pathParts.length - 1] = maskApiKey(lastPart);
        urlObj.pathname = '/' + pathParts.join('/') + '/';
        foundApiKey = true;
      }
    }

    if (foundApiKey) {
      return urlObj.toString();
    }

    // No API key found in expected locations, return host only for safety
    return `${urlObj.protocol}//${urlObj.host}/***`;
  } catch {
    // If URL parsing fails, mask everything after protocol
    return url.replace(/(https?:\/\/[^/]+).*/, '$1/***');
  }
}

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
  feePayerWallet: {
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
  
  /** Minimum fee payer wallet balance in lamports (default: 1 SOL) */
  feePayerMinBalance: number;
  
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
    feePayerWallet: string;
    noncePool: string;
  } = {
    database: true,
    redis: true,
    rpc: true,
    feePayerWallet: 'healthy',
    noncePool: 'healthy',
  };
  
  // Track previous overall status to only log on status changes
  private previousOverallStatus: 'healthy' | 'unhealthy' | 'degraded' | null = null;
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
      feePayerMinBalance: 1_000_000_000, // 1 SOL in lamports
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
      // No logging for cached results - reduces log noise
      return { ...this.cachedResult, cached: true };
    }
    
    // Removed to reduce log noise
    
    // Perform all checks in parallel for speed
    const [
      dbHealthy,
      redisHealthy,
      noncePoolResult,
      feePayerResult,
      rpcResult,
    ] = await Promise.all([
      this.checkDatabaseHealth().catch(() => false),
      this.checkRedisHealth().catch(() => false),
      this.checkNoncePool().catch((error) => ({
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
      })),
      this.checkFeePayerWallet().catch((error) => ({
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
      })),
      this.checkRPC().catch((error) => ({
        status: 'disconnected' as const,
        endpoint: maskRpcEndpoint(this.connection.rpcEndpoint),
        error: error instanceof Error ? error.message : 'Unknown error',
      })),
    ]);
    
    const idempotencyStatus = this.idempotencyService.getStatus();
    
    // Trigger alerts for critical failures and recovery notifications
    await this.handleAlerts(dbHealthy, redisHealthy, noncePoolResult, feePayerResult, rpcResult);
    
    // Determine overall health status
    const criticalHealthy = dbHealthy && redisHealthy && idempotencyStatus.isRunning;
    const rpcHealthy = rpcResult.status === 'connected' || rpcResult.status === 'slow';
    const feePayerHealthy = feePayerResult.status === 'healthy' || feePayerResult.status === 'low';
    
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    if (criticalHealthy && rpcHealthy && feePayerHealthy) {
      overallStatus = 'healthy';
    } else if (criticalHealthy && rpcHealthy) {
      // Fee payer wallet issues are warnings, not critical failures
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
      feePayerWallet: feePayerResult,
      rpc: rpcResult,
      cached: false,
    };
    
    // Cache the result
    this.cachedResult = result;
    this.cacheExpiry = now + (this.config.cacheTTL * 1000);
    
    // Only log when status changes (reduces log noise significantly)
    if (overallStatus !== this.previousOverallStatus) {
      console.log('[HealthCheckService] Health status changed:', {
        previousStatus: this.previousOverallStatus || 'initial',
        newStatus: overallStatus,
        database: dbHealthy,
        redis: redisHealthy,
        rpc: rpcResult.status,
        feePayerWallet: feePayerResult.status,
        noncePool: typeof noncePoolResult === 'object' && 'health' in noncePoolResult ? noncePoolResult.health : 'error',
      });
      this.previousOverallStatus = overallStatus;
    }
    
    return result;
  }
  
  /**
   * Clear cached result (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cachedResult = null;
    this.cacheExpiry = 0;
    // No logging for cache clear operations
  }
  
  /**
   * Handle alerting for health check results
   * Triggers alerts for failures and recovery notifications for resolutions
   */
  private async handleAlerts(
    dbHealthy: boolean,
    redisHealthy: boolean,
    noncePoolResult: any,
    feePayerResult: any,
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
    
    // Fee payer wallet alerts
    if (typeof feePayerResult === 'object' && 'status' in feePayerResult) {
      const currentStatus = feePayerResult.status;
      const prevStatus = this.previousStates.feePayerWallet;
      
      if (currentStatus === 'critical' && prevStatus !== 'critical') {
        await alertingService.alertFeePayerCritical(
          feePayerResult.balance,
          feePayerResult.address
        );
      } else if (currentStatus === 'low' && prevStatus === 'healthy') {
        await alertingService.alertFeePayerLow(
          feePayerResult.balance,
          feePayerResult.address
        );
      } else if (currentStatus === 'healthy' && (prevStatus === 'critical' || prevStatus === 'low')) {
        await alertingService.alertFeePayerRecovered(
          feePayerResult.balance,
          feePayerResult.address
        );
      }
      
      this.previousStates.feePayerWallet = currentStatus;
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
   * Check fee payer wallet balance (admin wallet that pays for all transactions)
   */
  private async checkFeePayerWallet() {
    try {
      // Check the platform authority wallet balance (this is the actual fee payer)
      const balance = await this.connection.getBalance(this.platformAuthority);
      const balanceSOL = (balance / 1_000_000_000).toFixed(4);
      
      let status: 'healthy' | 'low' | 'critical';
      if (balance < this.config.feePayerMinBalance * 0.1) {
        // Less than 10% of minimum (e.g., < 0.1 SOL if min is 1 SOL)
        status = 'critical';
      } else if (balance < this.config.feePayerMinBalance) {
        status = 'low';
      } else {
        status = 'healthy';
      }
      
      return {
        status,
        address: this.platformAuthority.toBase58(),
        balance,
        balanceSOL: `${balanceSOL} SOL`,
        threshold: this.config.feePayerMinBalance,
      };
    } catch (error) {
      console.error('[HealthCheckService] Fee payer wallet check failed:', error);
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
        endpoint: maskRpcEndpoint(this.connection.rpcEndpoint),
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[HealthCheckService] RPC check failed:', error);

      return {
        status: 'disconnected' as const,
        endpoint: maskRpcEndpoint(this.connection.rpcEndpoint),
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

