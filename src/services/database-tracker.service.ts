/**
 * Database Tracker Service
 * 
 * Monitors database performance, query execution times, and storage growth
 * Tracks slow queries and connection pool usage
 */

import { prisma } from '../config/database';
import { resourceTracker, ALERT_THRESHOLDS } from './resource-tracker.service';

/**
 * Query performance record
 */
interface QueryPerformanceRecord {
  timestamp: Date;
  query: string;
  duration: number;
  queryType: string;
  tableName?: string;
  rowsAffected?: number;
  isSlow: boolean;
}

/**
 * Database storage metrics
 */
interface DatabaseStorageMetrics {
  timestamp: Date;
  totalSize: number;
  tablesSizes: Record<string, number>;
  indexSizes: Record<string, number>;
}

/**
 * Database Tracker Service Class
 */
class DatabaseTrackerService {
  private queryHistory: QueryPerformanceRecord[] = [];
  private readonly QUERY_HISTORY_LIMIT = 1000;

  /**
   * Track query performance
   */
  async trackQueryPerformance(
    query: string,
    startTime: number,
    queryType: string = 'unknown',
    tableName?: string,
    rowsAffected?: number
  ): Promise<void> {
    try {
      const duration = Date.now() - startTime;
      const isSlow = duration > ALERT_THRESHOLDS.SLOW_QUERY;

      const record: QueryPerformanceRecord = {
        timestamp: new Date(),
        query: this.sanitizeQuery(query),
        duration,
        queryType,
        tableName,
        rowsAffected,
        isSlow,
      };

      // Add to history with limit
      this.queryHistory.push(record);
      if (this.queryHistory.length > this.QUERY_HISTORY_LIMIT) {
        this.queryHistory.shift();
      }

      // Track in resource tracker
      await resourceTracker.trackDatabaseQuery(
        record.query,
        duration,
        queryType,
        tableName,
        rowsAffected
      );

      // Log slow queries
      if (isSlow) {
        console.warn(
          `[DB Tracker] 🐌 Slow query detected (${duration}ms): ${queryType} on ${tableName || 'unknown'}`
        );
      }
    } catch (error) {
      console.error('[DB Tracker] Error tracking query performance:', error);
    }
  }

  /**
   * Sanitize query for logging (remove sensitive data)
   */
  private sanitizeQuery(query: string): string {
    // Truncate long queries
    if (query.length > 200) {
      return query.substring(0, 200) + '...';
    }
    return query;
  }

  /**
   * Track database storage growth
   */
  async trackStorageGrowth(): Promise<DatabaseStorageMetrics> {
    try {
      // Get total database size
      const sizeResult = await prisma.$queryRaw<Array<{ pg_database_size: bigint }>>`
        SELECT pg_database_size(current_database()) as pg_database_size
      `;
      
      const totalSize = Number(sizeResult[0].pg_database_size);

      // Get table sizes
      const tableSizesResult = await prisma.$queryRaw<Array<{
        tablename: string;
        size: bigint;
      }>>`
        SELECT 
          tablename,
          pg_total_relation_size(schemaname||'.'||tablename) as size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY size DESC
      `;

      const tablesSizes: Record<string, number> = {};
      for (const row of tableSizesResult) {
        tablesSizes[row.tablename] = Number(row.size);
      }

      // Get index sizes
      const indexSizesResult = await prisma.$queryRaw<Array<{
        indexname: string;
        size: bigint;
      }>>`
        SELECT 
          indexname,
          pg_relation_size(schemaname||'.'||indexname) as size
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY size DESC
      `;

      const indexSizes: Record<string, number> = {};
      for (const row of indexSizesResult) {
        indexSizes[row.indexname] = Number(row.size);
      }

      const metrics: DatabaseStorageMetrics = {
        timestamp: new Date(),
        totalSize,
        tablesSizes,
        indexSizes,
      };

      console.log(
        `[DB Tracker] Database size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`
      );

      return metrics;
    } catch (error) {
      console.error('[DB Tracker] Error tracking storage growth:', error);
      throw error;
    }
  }

  /**
   * Get active connections count
   */
  async getActiveConnections(): Promise<number> {
    try {
      const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM pg_stat_activity
        WHERE state = 'active'
        AND pid != pg_backend_pid()
      `;

      const count = Number(result[0].count);

      // Check threshold
      if (count > ALERT_THRESHOLDS.ACTIVE_CONNECTIONS_HIGH) {
        console.warn(
          `[DB Tracker] ⚠️  High number of active connections: ${count}`
        );
      }

      return count;
    } catch (error) {
      console.error('[DB Tracker] Error getting active connections:', error);
      return 0;
    }
  }

  /**
   * Get slow queries from history
   */
  getSlowQueries(limit: number = 10): QueryPerformanceRecord[] {
    return this.queryHistory
      .filter(record => record.isSlow)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get query statistics by type
   */
  getQueryStatsByType(): Record<string, {
    count: number;
    totalDuration: number;
    averageDuration: number;
    slowCount: number;
  }> {
    const stats: Record<string, {
      count: number;
      totalDuration: number;
      averageDuration: number;
      slowCount: number;
    }> = {};

    for (const record of this.queryHistory) {
      if (!stats[record.queryType]) {
        stats[record.queryType] = {
          count: 0,
          totalDuration: 0,
          averageDuration: 0,
          slowCount: 0,
        };
      }

      stats[record.queryType].count++;
      stats[record.queryType].totalDuration += record.duration;
      if (record.isSlow) {
        stats[record.queryType].slowCount++;
      }
    }

    // Calculate averages
    for (const type in stats) {
      stats[type].averageDuration = stats[type].totalDuration / stats[type].count;
    }

    return stats;
  }

  /**
   * Get query statistics by table
   */
  getQueryStatsByTable(): Record<string, {
    count: number;
    totalDuration: number;
    averageDuration: number;
    slowCount: number;
  }> {
    const stats: Record<string, {
      count: number;
      totalDuration: number;
      averageDuration: number;
      slowCount: number;
    }> = {};

    for (const record of this.queryHistory) {
      const table = record.tableName || 'unknown';
      
      if (!stats[table]) {
        stats[table] = {
          count: 0,
          totalDuration: 0,
          averageDuration: 0,
          slowCount: 0,
        };
      }

      stats[table].count++;
      stats[table].totalDuration += record.duration;
      if (record.isSlow) {
        stats[table].slowCount++;
      }
    }

    // Calculate averages
    for (const table in stats) {
      stats[table].averageDuration = stats[table].totalDuration / stats[table].count;
    }

    return stats;
  }

  /**
   * Get database performance report
   */
  async getDatabasePerformanceReport(): Promise<{
    activeConnections: number;
    totalQueries: number;
    slowQueries: number;
    averageQueryDuration: number;
    queryStatsByType: Record<string, any>;
    queryStatsByTable: Record<string, any>;
    storageMetrics: DatabaseStorageMetrics;
    topSlowQueries: QueryPerformanceRecord[];
  }> {
    try {
      const activeConnections = await this.getActiveConnections();
      const storageMetrics = await this.trackStorageGrowth();
      
      const totalQueries = this.queryHistory.length;
      const slowQueries = this.queryHistory.filter(r => r.isSlow).length;
      const averageQueryDuration = totalQueries > 0
        ? this.queryHistory.reduce((sum, r) => sum + r.duration, 0) / totalQueries
        : 0;

      return {
        activeConnections,
        totalQueries,
        slowQueries,
        averageQueryDuration,
        queryStatsByType: this.getQueryStatsByType(),
        queryStatsByTable: this.getQueryStatsByTable(),
        storageMetrics,
        topSlowQueries: this.getSlowQueries(10),
      };
    } catch (error) {
      console.error('[DB Tracker] Error generating performance report:', error);
      throw error;
    }
  }

  /**
   * Monitor database health
   */
  async monitorDatabaseHealth(): Promise<{
    isHealthy: boolean;
    issues: string[];
    metrics: {
      activeConnections: number;
      slowQueryRate: number;
      averageQueryDuration: number;
    };
  }> {
    try {
      const activeConnections = await this.getActiveConnections();
      const totalQueries = this.queryHistory.length;
      const slowQueries = this.queryHistory.filter(r => r.isSlow).length;
      const slowQueryRate = totalQueries > 0 ? slowQueries / totalQueries : 0;
      const averageQueryDuration = totalQueries > 0
        ? this.queryHistory.reduce((sum, r) => sum + r.duration, 0) / totalQueries
        : 0;

      const issues: string[] = [];
      let isHealthy = true;

      if (activeConnections > ALERT_THRESHOLDS.ACTIVE_CONNECTIONS_HIGH) {
        issues.push(`High number of active connections: ${activeConnections}`);
        isHealthy = false;
      }

      if (slowQueryRate > 0.1) {
        issues.push(`High slow query rate: ${(slowQueryRate * 100).toFixed(2)}%`);
        isHealthy = false;
      }

      if (averageQueryDuration > ALERT_THRESHOLDS.SLOW_QUERY / 2) {
        issues.push(`High average query duration: ${averageQueryDuration.toFixed(2)}ms`);
        isHealthy = false;
      }

      return {
        isHealthy,
        issues,
        metrics: {
          activeConnections,
          slowQueryRate,
          averageQueryDuration,
        },
      };
    } catch (error) {
      console.error('[DB Tracker] Error monitoring database health:', error);
      return {
        isHealthy: false,
        issues: ['Failed to monitor database health'],
        metrics: {
          activeConnections: 0,
          slowQueryRate: 0,
          averageQueryDuration: 0,
        },
      };
    }
  }

  /**
   * Clear query history
   */
  clearHistory(): void {
    this.queryHistory = [];
    console.log('[DB Tracker] Query history cleared');
  }
}

// Export singleton instance
export const databaseTracker = new DatabaseTrackerService();
export default databaseTracker;

