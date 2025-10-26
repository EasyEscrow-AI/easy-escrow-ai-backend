/**
 * Resource Tracker Service
 * 
 * Comprehensive resource usage tracking and monitoring system for STAGING environment
 * to predict production costs, optimize efficiency, and identify resource leaks.
 * 
 * Tracks:
 * - SOL consumption (transaction fees, wallet balances)
 * - Database usage (connections, query performance, slow queries)
 * - Redis metrics (memory, keys, hit rate, queue length)
 * - RPC calls (request count, response time, rate limits)
 * - Compute resources (CPU, memory, network bandwidth, API requests)
 */

import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { prisma } from '../config/database';
import { redisClient } from '../config/redis';

/**
 * Resource metrics interface
 */
export interface ResourceMetrics {
  timestamp: Date;
  solUsage?: SolUsageMetrics;
  databaseMetrics?: DatabaseMetrics;
  redisMetrics?: RedisMetrics;
  rpcMetrics?: RpcMetrics;
  computeMetrics?: ComputeMetrics;
}

/**
 * SOL usage metrics
 */
export interface SolUsageMetrics {
  transactionFees: number;
  walletBalance: number;
  operationType: string;
  agreementId?: string;
  preBalance?: number;
  postBalance?: number;
}

/**
 * Database metrics
 */
export interface DatabaseMetrics {
  activeConnections: number;
  queryDuration: number;
  queryType: string;
  slowQueries: string[];
  tableName?: string;
  rowsAffected?: number;
}

/**
 * Redis metrics
 */
export interface RedisMetrics {
  memoryUsage: number;
  keyCount: number;
  hitRate: number;
  queueLength: number;
  commandType?: string;
  evictedKeys?: number;
}

/**
 * RPC metrics
 */
export interface RpcMetrics {
  requestCount: number;
  requestType: string;
  responseTime: number;
  rateLimitApproach: boolean;
  errorCount?: number;
  endpoint?: string;
}

/**
 * Compute metrics
 */
export interface ComputeMetrics {
  cpuUsage: number;
  memoryUsage: number;
  networkBandwidth: number;
  apiRequestVolume: number;
  timestamp: Date;
}

/**
 * Resource report interface
 */
export interface ResourceReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalSolConsumed: number;
    totalTransactions: number;
    averageSolPerTransaction: number;
    totalDatabaseQueries: number;
    slowQueryCount: number;
    averageQueryDuration: number;
    redisMemoryPeak: number;
    redisHitRate: number;
    totalRpcCalls: number;
    averageRpcResponseTime: number;
    rpcErrorRate: number;
  };
  recommendations: string[];
  alerts: ResourceAlert[];
}

/**
 * Resource alert interface
 */
export interface ResourceAlert {
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'sol' | 'database' | 'redis' | 'rpc' | 'compute';
  message: string;
  metrics: any;
  threshold?: number;
  actualValue?: number;
}

/**
 * Alert thresholds configuration
 */
export const ALERT_THRESHOLDS = {
  // SOL thresholds
  SOL_PER_TX: 0.01, // Alert if transaction costs more than 0.01 SOL
  WALLET_BALANCE_LOW: 1.0, // Alert if wallet balance below 1 SOL
  
  // Database thresholds
  SLOW_QUERY: 1000, // Alert if query takes more than 1 second
  ACTIVE_CONNECTIONS_HIGH: 50, // Alert if more than 50 active connections
  
  // Redis thresholds
  REDIS_MEMORY_HIGH: 500 * 1024 * 1024, // Alert if memory usage > 500MB
  HIT_RATE_LOW: 0.7, // Alert if hit rate below 70%
  
  // RPC thresholds
  RPC_RESPONSE_SLOW: 2000, // Alert if RPC response > 2 seconds
  RPC_ERROR_RATE_HIGH: 0.05, // Alert if error rate > 5%
  
  // Compute thresholds
  CPU_USAGE_HIGH: 80, // Alert if CPU usage > 80%
  COMPUTE_MEMORY_HIGH: 85, // Alert if memory usage > 85%
};

/**
 * Resource Tracker Service Class
 */
class ResourceTrackerService {
  private metrics: ResourceMetrics[] = [];
  private alerts: ResourceAlert[] = [];
  private readonly METRICS_RETENTION_HOURS = 168; // 7 days
  private readonly REDIS_METRICS_KEY = 'resource:metrics';
  private readonly REDIS_ALERTS_KEY = 'resource:alerts';

  /**
   * Track SOL usage for an operation
   */
  async trackSolUsage(
    operation: string,
    cost: number,
    agreementId?: string,
    preBalance?: number,
    postBalance?: number
  ): Promise<void> {
    try {
      const metrics: ResourceMetrics = {
        timestamp: new Date(),
        solUsage: {
          transactionFees: cost,
          walletBalance: postBalance || 0,
          operationType: operation,
          agreementId,
          preBalance,
          postBalance,
        },
      };

      await this.storeMetrics(metrics);

      // Check for alerts
      if (cost > ALERT_THRESHOLDS.SOL_PER_TX) {
        await this.createAlert({
          timestamp: new Date(),
          severity: 'high',
          category: 'sol',
          message: `High SOL usage detected for operation: ${operation}`,
          metrics: metrics.solUsage,
          threshold: ALERT_THRESHOLDS.SOL_PER_TX,
          actualValue: cost,
        });
      }

      if (postBalance && postBalance < ALERT_THRESHOLDS.WALLET_BALANCE_LOW) {
        await this.createAlert({
          timestamp: new Date(),
          severity: 'critical',
          category: 'sol',
          message: `Low wallet balance detected: ${postBalance} SOL`,
          metrics: metrics.solUsage,
          threshold: ALERT_THRESHOLDS.WALLET_BALANCE_LOW,
          actualValue: postBalance,
        });
      }
    } catch (error) {
      console.error('Error tracking SOL usage:', error);
    }
  }

  /**
   * Track database query performance
   */
  async trackDatabaseQuery(
    query: string,
    duration: number,
    queryType: string = 'unknown',
    tableName?: string,
    rowsAffected?: number
  ): Promise<void> {
    try {
      const slowQueries: string[] = [];
      if (duration > ALERT_THRESHOLDS.SLOW_QUERY) {
        slowQueries.push(query);
      }

      const metrics: ResourceMetrics = {
        timestamp: new Date(),
        databaseMetrics: {
          activeConnections: 0, // Will be updated by separate monitoring
          queryDuration: duration,
          queryType,
          slowQueries,
          tableName,
          rowsAffected,
        },
      };

      await this.storeMetrics(metrics);

      // Alert on slow queries
      if (duration > ALERT_THRESHOLDS.SLOW_QUERY) {
        await this.createAlert({
          timestamp: new Date(),
          severity: 'medium',
          category: 'database',
          message: `Slow query detected: ${queryType} on ${tableName || 'unknown table'}`,
          metrics: metrics.databaseMetrics,
          threshold: ALERT_THRESHOLDS.SLOW_QUERY,
          actualValue: duration,
        });
      }
    } catch (error) {
      console.error('Error tracking database query:', error);
    }
  }

  /**
   * Track Redis metrics
   */
  async trackRedisMetrics(
    commandType?: string
  ): Promise<void> {
    try {
      // Get Redis info
      const info = await redisClient.info('memory');
      const keyCount = await redisClient.dbsize();
      
      // Parse memory usage from info string
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;
      
      // Parse evicted keys
      const evictedMatch = info.match(/evicted_keys:(\d+)/);
      const evictedKeys = evictedMatch ? parseInt(evictedMatch[1], 10) : 0;

      // Calculate hit rate (simplified - would need to track hits/misses over time)
      const hitRate = 0.85; // Placeholder - implement proper tracking

      const metrics: ResourceMetrics = {
        timestamp: new Date(),
        redisMetrics: {
          memoryUsage,
          keyCount,
          hitRate,
          queueLength: 0, // Will be updated by queue monitoring
          commandType,
          evictedKeys,
        },
      };

      await this.storeMetrics(metrics);

      // Check for alerts
      if (memoryUsage > ALERT_THRESHOLDS.REDIS_MEMORY_HIGH) {
        await this.createAlert({
          timestamp: new Date(),
          severity: 'high',
          category: 'redis',
          message: `High Redis memory usage: ${(memoryUsage / 1024 / 1024).toFixed(2)} MB`,
          metrics: metrics.redisMetrics,
          threshold: ALERT_THRESHOLDS.REDIS_MEMORY_HIGH,
          actualValue: memoryUsage,
        });
      }

      if (hitRate < ALERT_THRESHOLDS.HIT_RATE_LOW) {
        await this.createAlert({
          timestamp: new Date(),
          severity: 'medium',
          category: 'redis',
          message: `Low Redis hit rate: ${(hitRate * 100).toFixed(2)}%`,
          metrics: metrics.redisMetrics,
          threshold: ALERT_THRESHOLDS.HIT_RATE_LOW,
          actualValue: hitRate,
        });
      }
    } catch (error) {
      console.error('Error tracking Redis metrics:', error);
    }
  }

  /**
   * Track RPC call metrics
   */
  async trackRpcCall(
    method: string,
    duration: number,
    endpoint?: string,
    error?: boolean
  ): Promise<void> {
    try {
      const metrics: ResourceMetrics = {
        timestamp: new Date(),
        rpcMetrics: {
          requestCount: 1,
          requestType: method,
          responseTime: duration,
          rateLimitApproach: duration > ALERT_THRESHOLDS.RPC_RESPONSE_SLOW,
          errorCount: error ? 1 : 0,
          endpoint,
        },
      };

      await this.storeMetrics(metrics);

      // Alert on slow RPC calls
      if (duration > ALERT_THRESHOLDS.RPC_RESPONSE_SLOW) {
        await this.createAlert({
          timestamp: new Date(),
          severity: 'medium',
          category: 'rpc',
          message: `Slow RPC call detected: ${method}`,
          metrics: metrics.rpcMetrics,
          threshold: ALERT_THRESHOLDS.RPC_RESPONSE_SLOW,
          actualValue: duration,
        });
      }
    } catch (error) {
      console.error('Error tracking RPC call:', error);
    }
  }

  /**
   * Track compute metrics
   */
  async trackComputeMetrics(
    cpuUsage: number,
    memoryUsage: number,
    networkBandwidth: number,
    apiRequestVolume: number
  ): Promise<void> {
    try {
      const now = new Date();
      const metrics: ResourceMetrics = {
        timestamp: now,
        computeMetrics: {
          cpuUsage,
          memoryUsage,
          networkBandwidth,
          apiRequestVolume,
          timestamp: now,
        },
      };

      await this.storeMetrics(metrics);

      // Check for alerts
      if (cpuUsage > ALERT_THRESHOLDS.CPU_USAGE_HIGH) {
        await this.createAlert({
          timestamp: new Date(),
          severity: 'high',
          category: 'compute',
          message: `High CPU usage: ${cpuUsage.toFixed(2)}%`,
          metrics: metrics.computeMetrics,
          threshold: ALERT_THRESHOLDS.CPU_USAGE_HIGH,
          actualValue: cpuUsage,
        });
      }

      if (memoryUsage > ALERT_THRESHOLDS.COMPUTE_MEMORY_HIGH) {
        await this.createAlert({
          timestamp: new Date(),
          severity: 'high',
          category: 'compute',
          message: `High memory usage: ${memoryUsage.toFixed(2)}%`,
          metrics: metrics.computeMetrics,
          threshold: ALERT_THRESHOLDS.COMPUTE_MEMORY_HIGH,
          actualValue: memoryUsage,
        });
      }
    } catch (error) {
      console.error('Error tracking compute metrics:', error);
    }
  }

  /**
   * Store metrics in Redis with TTL
   */
  private async storeMetrics(metrics: ResourceMetrics): Promise<void> {
    try {
      const key = `${this.REDIS_METRICS_KEY}:${metrics.timestamp.getTime()}`;
      await redisClient.setex(
        key,
        this.METRICS_RETENTION_HOURS * 3600,
        JSON.stringify(metrics)
      );
      
      // Also add to sorted set for time-based queries
      await redisClient.zadd(
        this.REDIS_METRICS_KEY,
        metrics.timestamp.getTime(),
        key
      );
    } catch (error) {
      console.error('Error storing metrics:', error);
    }
  }

  /**
   * Create and store alert
   */
  private async createAlert(alert: ResourceAlert): Promise<void> {
    try {
      this.alerts.push(alert);
      
      const key = `${this.REDIS_ALERTS_KEY}:${alert.timestamp.getTime()}`;
      await redisClient.setex(
        key,
        24 * 3600, // Keep alerts for 24 hours
        JSON.stringify(alert)
      );
      
      // Add to sorted set
      await redisClient.zadd(
        this.REDIS_ALERTS_KEY,
        alert.timestamp.getTime(),
        key
      );

      // Log alert
      console.warn(`[RESOURCE ALERT] ${alert.severity.toUpperCase()}: ${alert.message}`);
    } catch (error) {
      console.error('Error creating alert:', error);
    }
  }

  /**
   * Get metrics for a time period
   */
  async getMetrics(startTime: Date, endTime: Date): Promise<ResourceMetrics[]> {
    try {
      const keys = await redisClient.zrangebyscore(
        this.REDIS_METRICS_KEY,
        startTime.getTime(),
        endTime.getTime()
      );

      const metrics: ResourceMetrics[] = [];
      for (const key of keys) {
        const data = await redisClient.get(key);
        if (data) {
          metrics.push(JSON.parse(data));
        }
      }

      return metrics;
    } catch (error) {
      console.error('Error getting metrics:', error);
      return [];
    }
  }

  /**
   * Get alerts for a time period
   */
  async getAlerts(startTime: Date, endTime: Date): Promise<ResourceAlert[]> {
    try {
      const keys = await redisClient.zrangebyscore(
        this.REDIS_ALERTS_KEY,
        startTime.getTime(),
        endTime.getTime()
      );

      const alerts: ResourceAlert[] = [];
      for (const key of keys) {
        const data = await redisClient.get(key);
        if (data) {
          alerts.push(JSON.parse(data));
        }
      }

      return alerts;
    } catch (error) {
      console.error('Error getting alerts:', error);
      return [];
    }
  }

  /**
   * Generate daily report
   */
  async generateDailyReport(): Promise<ResourceReport> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

    return this.generateReport(startTime, endTime);
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport(): Promise<ResourceReport> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

    return this.generateReport(startTime, endTime);
  }

  /**
   * Generate resource report for a time period
   */
  async generateReport(startTime: Date, endTime: Date): Promise<ResourceReport> {
    try {
      const metrics = await this.getMetrics(startTime, endTime);
      const alerts = await this.getAlerts(startTime, endTime);

      // Calculate summary statistics
      const solMetrics = metrics.filter(m => m.solUsage).map(m => m.solUsage!);
      const dbMetrics = metrics.filter(m => m.databaseMetrics).map(m => m.databaseMetrics!);
      const redisMetrics = metrics.filter(m => m.redisMetrics).map(m => m.redisMetrics!);
      const rpcMetrics = metrics.filter(m => m.rpcMetrics).map(m => m.rpcMetrics!);

      const totalSolConsumed = solMetrics.reduce((sum, m) => sum + m.transactionFees, 0);
      const totalTransactions = solMetrics.length;
      const averageSolPerTransaction = totalTransactions > 0 ? totalSolConsumed / totalTransactions : 0;

      const totalDatabaseQueries = dbMetrics.length;
      const slowQueryCount = dbMetrics.filter(m => m.slowQueries.length > 0).length;
      const averageQueryDuration = totalDatabaseQueries > 0
        ? dbMetrics.reduce((sum, m) => sum + m.queryDuration, 0) / totalDatabaseQueries
        : 0;

      const redisMemoryPeak = redisMetrics.length > 0
        ? Math.max(...redisMetrics.map(m => m.memoryUsage))
        : 0;
      const redisHitRate = redisMetrics.length > 0
        ? redisMetrics.reduce((sum, m) => sum + m.hitRate, 0) / redisMetrics.length
        : 0;

      const totalRpcCalls = rpcMetrics.length;
      const averageRpcResponseTime = totalRpcCalls > 0
        ? rpcMetrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRpcCalls
        : 0;
      const rpcErrorCount = rpcMetrics.reduce((sum, m) => sum + (m.errorCount || 0), 0);
      const rpcErrorRate = totalRpcCalls > 0 ? rpcErrorCount / totalRpcCalls : 0;

      // Generate recommendations
      const recommendations: string[] = [];
      
      if (averageSolPerTransaction > 0.005) {
        recommendations.push('Consider optimizing transaction structure to reduce SOL consumption');
      }
      
      if (slowQueryCount > totalDatabaseQueries * 0.1) {
        recommendations.push('High number of slow queries detected - review database indexes and query optimization');
      }
      
      if (redisHitRate < 0.8) {
        recommendations.push('Redis hit rate is below optimal - consider adjusting cache TTLs or warming strategies');
      }
      
      if (rpcErrorRate > 0.02) {
        recommendations.push('RPC error rate is elevated - consider implementing better retry logic or checking RPC endpoint health');
      }

      return {
        period: { start: startTime, end: endTime },
        summary: {
          totalSolConsumed,
          totalTransactions,
          averageSolPerTransaction,
          totalDatabaseQueries,
          slowQueryCount,
          averageQueryDuration,
          redisMemoryPeak,
          redisHitRate,
          totalRpcCalls,
          averageRpcResponseTime,
          rpcErrorRate,
        },
        recommendations,
        alerts,
      };
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }

  /**
   * Clean up old metrics
   */
  async cleanupOldMetrics(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - this.METRICS_RETENTION_HOURS * 3600 * 1000);
      
      // Remove old metrics
      await redisClient.zremrangebyscore(
        this.REDIS_METRICS_KEY,
        '-inf',
        cutoffTime.getTime()
      );
      
      // Remove old alerts (24 hours)
      const alertCutoff = new Date(Date.now() - 24 * 3600 * 1000);
      await redisClient.zremrangebyscore(
        this.REDIS_ALERTS_KEY,
        '-inf',
        alertCutoff.getTime()
      );
      
      console.log('✅ Old metrics cleaned up successfully');
    } catch (error) {
      console.error('Error cleaning up old metrics:', error);
    }
  }
}

// Export singleton instance
export const resourceTracker = new ResourceTrackerService();
export default resourceTracker;

