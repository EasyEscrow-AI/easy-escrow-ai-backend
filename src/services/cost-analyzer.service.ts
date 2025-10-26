/**
 * Cost Analyzer Service
 * 
 * Analyzes resource usage patterns and projects mainnet costs
 * Provides optimization recommendations and cost forecasting
 */

import { resourceTracker, ResourceMetrics, ResourceReport } from './resource-tracker.service';
import { solTracker } from './sol-tracker.service';
import { databaseTracker } from './database-tracker.service';

/**
 * Cost projection interface
 */
export interface CostProjection {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  estimatedMonthlySol: number;
  estimatedMonthlySolUsd: number;
  databaseCosts: {
    monthly: number;
    storage: number;
    compute: number;
  };
  redisCosts: {
    monthly: number;
    memory: number;
    operations: number;
  };
  rpcCosts: {
    monthly: number;
    requestCount: number;
    estimatedCostPerRequest: number;
  };
  totalMonthlyCost: number;
  optimizationOpportunities: OptimizationOpportunity[];
  assumptions: string[];
}

/**
 * Optimization opportunity interface
 */
export interface OptimizationOpportunity {
  category: 'sol' | 'database' | 'redis' | 'rpc' | 'compute';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  estimatedSavings: number;
  estimatedSavingsPercent: number;
  implementation: string;
}

/**
 * Cost comparison interface
 */
export interface CostComparison {
  devnet: {
    solPerTransaction: number;
    monthlyTransactions: number;
    monthlySol: number;
  };
  mainnet: {
    solPerTransaction: number;
    monthlyTransactions: number;
    monthlySol: number;
    multiplier: number;
  };
  difference: {
    solPerTransaction: number;
    monthlySol: number;
    percentIncrease: number;
  };
}

/**
 * Cost Analyzer Service Class
 */
class CostAnalyzerService {
  // Pricing assumptions (update these based on current market rates)
  private readonly SOL_PRICE_USD = 150; // Current SOL price in USD
  private readonly MAINNET_MULTIPLIER = 1.2; // Mainnet typically costs 20% more than devnet
  private readonly DATABASE_COST_PER_GB = 0.25; // DigitalOcean managed DB cost per GB
  private readonly REDIS_COST_PER_GB = 0.30; // Redis Cloud cost per GB
  private readonly RPC_COST_PER_1M_REQUESTS = 50; // Helius/RPC provider cost estimate

  /**
   * Calculate mainnet projection based on devnet usage
   */
  async calculateMainnetProjection(
    devnetUsageDays: number = 7,
    expectedMonthlyTransactions?: number
  ): Promise<CostProjection> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - devnetUsageDays * 24 * 60 * 60 * 1000);
      
      const metrics = await resourceTracker.getMetrics(startTime, endTime);
      
      // Calculate SOL costs
      const solMetrics = metrics.filter(m => m.solUsage).map(m => m.solUsage!);
      const avgSolPerTransaction = solMetrics.length > 0
        ? solMetrics.reduce((sum, m) => sum + m.transactionFees, 0) / solMetrics.length
        : 0;

      // Estimate monthly transactions
      const transactionsPerDay = solMetrics.length / devnetUsageDays;
      const monthlyTransactions = expectedMonthlyTransactions || transactionsPerDay * 30;

      // Project mainnet SOL costs
      const mainnetSolPerTransaction = avgSolPerTransaction * this.MAINNET_MULTIPLIER;
      const estimatedMonthlySol = mainnetSolPerTransaction * monthlyTransactions;
      const estimatedMonthlySolUsd = estimatedMonthlySol * this.SOL_PRICE_USD;

      // Calculate database costs
      const dbReport = await databaseTracker.getDatabasePerformanceReport();
      const dbSizeGB = dbReport.storageMetrics.totalSize / 1024 / 1024 / 1024;
      const databaseCosts = {
        monthly: dbSizeGB * this.DATABASE_COST_PER_GB * 30,
        storage: dbSizeGB * this.DATABASE_COST_PER_GB * 30 * 0.6,
        compute: dbSizeGB * this.DATABASE_COST_PER_GB * 30 * 0.4,
      };

      // Calculate Redis costs
      const redisMetrics = metrics.filter(m => m.redisMetrics).map(m => m.redisMetrics!);
      const avgRedisMemory = redisMetrics.length > 0
        ? redisMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) / redisMetrics.length
        : 0;
      const redisMemoryGB = avgRedisMemory / 1024 / 1024 / 1024;
      const redisCosts = {
        monthly: redisMemoryGB * this.REDIS_COST_PER_GB * 30,
        memory: redisMemoryGB * this.REDIS_COST_PER_GB * 30 * 0.7,
        operations: redisMemoryGB * this.REDIS_COST_PER_GB * 30 * 0.3,
      };

      // Calculate RPC costs
      const rpcMetrics = metrics.filter(m => m.rpcMetrics).map(m => m.rpcMetrics!);
      const rpcRequestsPerDay = rpcMetrics.length / devnetUsageDays;
      const monthlyRpcRequests = rpcRequestsPerDay * 30;
      const rpcCosts = {
        monthly: (monthlyRpcRequests / 1000000) * this.RPC_COST_PER_1M_REQUESTS,
        requestCount: monthlyRpcRequests,
        estimatedCostPerRequest: this.RPC_COST_PER_1M_REQUESTS / 1000000,
      };

      // Total monthly cost
      const totalMonthlyCost = 
        estimatedMonthlySolUsd +
        databaseCosts.monthly +
        redisCosts.monthly +
        rpcCosts.monthly;

      // Generate optimization opportunities
      const optimizationOpportunities = await this.identifyOptimizations(metrics);

      // Assumptions
      const assumptions = [
        `SOL price: $${this.SOL_PRICE_USD}`,
        `Mainnet multiplier: ${this.MAINNET_MULTIPLIER}x`,
        `Monthly transactions: ${monthlyTransactions.toFixed(0)}`,
        `Database size: ${dbSizeGB.toFixed(2)} GB`,
        `Redis memory: ${redisMemoryGB.toFixed(2)} GB`,
        `Monthly RPC requests: ${monthlyRpcRequests.toFixed(0)}`,
        `Based on ${devnetUsageDays} days of devnet usage`,
      ];

      return {
        period: 'monthly',
        estimatedMonthlySol,
        estimatedMonthlySolUsd,
        databaseCosts,
        redisCosts,
        rpcCosts,
        totalMonthlyCost,
        optimizationOpportunities,
        assumptions,
      };
    } catch (error) {
      console.error('[Cost Analyzer] Error calculating mainnet projection:', error);
      throw error;
    }
  }

  /**
   * Identify optimization opportunities
   */
  async identifyOptimizations(metrics: ResourceMetrics[]): Promise<OptimizationOpportunity[]> {
    const opportunities: OptimizationOpportunity[] = [];

    // Analyze SOL usage
    const solMetrics = metrics.filter(m => m.solUsage).map(m => m.solUsage!);
    if (solMetrics.length > 0) {
      const avgSolPerTx = solMetrics.reduce((sum, m) => sum + m.transactionFees, 0) / solMetrics.length;
      
      if (avgSolPerTx > 0.005) {
        opportunities.push({
          category: 'sol',
          severity: 'high',
          title: 'Optimize Transaction Structure',
          description: 'Average SOL per transaction is higher than expected. Consider batching operations or optimizing instruction data.',
          estimatedSavings: avgSolPerTx * 0.3 * solMetrics.length * this.SOL_PRICE_USD,
          estimatedSavingsPercent: 30,
          implementation: 'Review transaction instructions, implement batching where possible, optimize account data structures',
        });
      }
    }

    // Analyze database queries
    const dbMetrics = metrics.filter(m => m.databaseMetrics).map(m => m.databaseMetrics!);
    const slowQueries = dbMetrics.filter(m => m.slowQueries.length > 0);
    
    if (slowQueries.length > dbMetrics.length * 0.1) {
      opportunities.push({
        category: 'database',
        severity: 'high',
        title: 'Optimize Slow Queries',
        description: `${slowQueries.length} slow queries detected (${((slowQueries.length / dbMetrics.length) * 100).toFixed(1)}% of total). Add indexes or optimize query structure.`,
        estimatedSavings: 50, // Estimated monthly savings
        estimatedSavingsPercent: 15,
        implementation: 'Add database indexes, optimize JOIN operations, implement query result caching',
      });
    }

    // Analyze Redis usage
    const redisMetrics = metrics.filter(m => m.redisMetrics).map(m => m.redisMetrics!);
    if (redisMetrics.length > 0) {
      const avgHitRate = redisMetrics.reduce((sum, m) => sum + m.hitRate, 0) / redisMetrics.length;
      
      if (avgHitRate < 0.8) {
        opportunities.push({
          category: 'redis',
          severity: 'medium',
          title: 'Improve Cache Hit Rate',
          description: `Redis hit rate is ${(avgHitRate * 100).toFixed(1)}%. Optimize cache keys and TTLs to reduce database load.`,
          estimatedSavings: 30,
          estimatedSavingsPercent: 10,
          implementation: 'Review cache key strategies, adjust TTLs, implement cache warming for frequently accessed data',
        });
      }
    }

    // Analyze RPC usage
    const rpcMetrics = metrics.filter(m => m.rpcMetrics).map(m => m.rpcMetrics!);
    if (rpcMetrics.length > 0) {
      const avgResponseTime = rpcMetrics.reduce((sum, m) => sum + m.responseTime, 0) / rpcMetrics.length;
      
      if (avgResponseTime > 1000) {
        opportunities.push({
          category: 'rpc',
          severity: 'medium',
          title: 'Optimize RPC Call Patterns',
          description: 'Average RPC response time is high. Consider implementing request batching or using WebSocket subscriptions.',
          estimatedSavings: 25,
          estimatedSavingsPercent: 8,
          implementation: 'Batch RPC requests, implement WebSocket subscriptions for real-time data, use commitment levels appropriately',
        });
      }
    }

    return opportunities;
  }

  /**
   * Compare devnet vs mainnet costs
   */
  async compareDevnetMainnet(days: number = 7): Promise<CostComparison> {
    try {
      const solReport = await solTracker.getSolConsumptionReport(days);
      
      const devnetSolPerTx = solReport.averagePerTransaction;
      const monthlyTransactions = (solReport.byStage['agreement_initialization']?.count || 0) * 30 / days;
      const devnetMonthlySol = devnetSolPerTx * monthlyTransactions;

      const mainnetSolPerTx = devnetSolPerTx * this.MAINNET_MULTIPLIER;
      const mainnetMonthlySol = mainnetSolPerTx * monthlyTransactions;

      // Guard against division by zero when calculating percent increase
      let percentIncrease = 0;
      if (devnetMonthlySol === 0) {
        // If no devnet data, percent increase is 0 (or could be undefined)
        percentIncrease = mainnetMonthlySol > 0 ? 100 : 0;
      } else {
        percentIncrease = ((mainnetMonthlySol - devnetMonthlySol) / devnetMonthlySol) * 100;
      }

      return {
        devnet: {
          solPerTransaction: devnetSolPerTx,
          monthlyTransactions,
          monthlySol: devnetMonthlySol,
        },
        mainnet: {
          solPerTransaction: mainnetSolPerTx,
          monthlyTransactions,
          monthlySol: mainnetMonthlySol,
          multiplier: this.MAINNET_MULTIPLIER,
        },
        difference: {
          solPerTransaction: mainnetSolPerTx - devnetSolPerTx,
          monthlySol: mainnetMonthlySol - devnetMonthlySol,
          percentIncrease,
        },
      };
    } catch (error) {
      console.error('[Cost Analyzer] Error comparing devnet/mainnet costs:', error);
      throw error;
    }
  }

  /**
   * Generate weekly cost report
   */
  async generateWeeklyReport(): Promise<{
    projection: CostProjection;
    comparison: CostComparison;
    resourceReport: ResourceReport;
  }> {
    try {
      const projection = await this.calculateMainnetProjection(7);
      const comparison = await this.compareDevnetMainnet(7);
      const resourceReport = await resourceTracker.generateWeeklyReport();

      return {
        projection,
        comparison,
        resourceReport,
      };
    } catch (error) {
      console.error('[Cost Analyzer] Error generating weekly report:', error);
      throw error;
    }
  }

  /**
   * Calculate ROI for optimization opportunities
   */
  calculateOptimizationROI(
    opportunity: OptimizationOpportunity,
    implementationCostHours: number,
    hourlyRate: number = 100
  ): {
    implementationCost: number;
    monthlySavings: number;
    annualSavings: number;
    breakEvenMonths: number;
    roi: number;
  } {
    const implementationCost = implementationCostHours * hourlyRate;
    const monthlySavings = opportunity.estimatedSavings;
    const annualSavings = monthlySavings * 12;
    const breakEvenMonths = implementationCost / monthlySavings;
    const roi = ((annualSavings - implementationCost) / implementationCost) * 100;

    return {
      implementationCost,
      monthlySavings,
      annualSavings,
      breakEvenMonths,
      roi,
    };
  }

  /**
   * Get cost trends over time
   */
  async getCostTrends(days: number = 30): Promise<{
    daily: Array<{ date: string; solCost: number; totalCost: number }>;
    trend: 'increasing' | 'decreasing' | 'stable';
    averageDailyCost: number;
    projectedMonthlyCost: number;
  }> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
      
      const metrics = await resourceTracker.getMetrics(startTime, endTime);
      
      // Group metrics by day
      const dailyCosts: Record<string, { solCost: number; totalCost: number }> = {};
      
      for (const metric of metrics) {
        const date = metric.timestamp.toISOString().split('T')[0];
        
        if (!dailyCosts[date]) {
          dailyCosts[date] = { solCost: 0, totalCost: 0 };
        }
        
        if (metric.solUsage) {
          const solCostUsd = metric.solUsage.transactionFees * this.SOL_PRICE_USD;
          dailyCosts[date].solCost += solCostUsd;
          dailyCosts[date].totalCost += solCostUsd;
        }
      }

      // Convert to array and sort by date
      const daily = Object.entries(dailyCosts)
        .map(([date, costs]) => ({ date, ...costs }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate trend
      const firstWeekAvg = daily.slice(0, 7).reduce((sum, d) => sum + d.totalCost, 0) / 7;
      const lastWeekAvg = daily.slice(-7).reduce((sum, d) => sum + d.totalCost, 0) / 7;
      
      let trend: 'increasing' | 'decreasing' | 'stable';
      
      // Guard against division by zero
      let changePercent = 0;
      if (firstWeekAvg === 0) {
        // If first week is 0 but last week has data, consider it increasing
        trend = lastWeekAvg > 0 ? 'increasing' : 'stable';
      } else {
        changePercent = ((lastWeekAvg - firstWeekAvg) / firstWeekAvg) * 100;
        
        if (changePercent > 10) {
          trend = 'increasing';
        } else if (changePercent < -10) {
          trend = 'decreasing';
        } else {
          trend = 'stable';
        }
      }

      const averageDailyCost = daily.reduce((sum, d) => sum + d.totalCost, 0) / daily.length;
      const projectedMonthlyCost = averageDailyCost * 30;

      return {
        daily,
        trend,
        averageDailyCost,
        projectedMonthlyCost,
      };
    } catch (error) {
      console.error('[Cost Analyzer] Error getting cost trends:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const costAnalyzer = new CostAnalyzerService();
export default costAnalyzer;

