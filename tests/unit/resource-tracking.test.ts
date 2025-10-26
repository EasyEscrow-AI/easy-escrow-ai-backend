/**
 * Resource Tracking System Tests
 * 
 * Comprehensive tests for resource tracking, cost analysis, and monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { resourceTracker, ALERT_THRESHOLDS } from '../../src/services/resource-tracker.service';
import { solTracker, AgreementStage } from '../../src/services/sol-tracker.service';
import { databaseTracker } from '../../src/services/database-tracker.service';
import { costAnalyzer } from '../../src/services/cost-analyzer.service';

describe('Resource Tracking System', () => {
  
  describe('ResourceTracker', () => {
    
    it('should track SOL usage correctly', async () => {
      const operation = 'test_operation';
      const cost = 0.001;
      const agreementId = 'test-agreement-123';
      const preBalance = 5.0;
      const postBalance = 4.999;

      await resourceTracker.trackSolUsage(
        operation,
        cost,
        agreementId,
        preBalance,
        postBalance
      );

      // Verify metrics were stored
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60000); // Last minute
      const metrics = await resourceTracker.getMetrics(startTime, endTime);

      expect(metrics.length).toBeGreaterThan(0);
      const solMetric = metrics.find(m => m.solUsage?.operationType === operation);
      expect(solMetric).toBeDefined();
      expect(solMetric?.solUsage?.transactionFees).toBe(cost);
      expect(solMetric?.solUsage?.agreementId).toBe(agreementId);
    });

    it('should create alert for high SOL usage', async () => {
      const operation = 'expensive_operation';
      const highCost = 0.02; // Above threshold of 0.01
      const agreementId = 'test-agreement-456';

      await resourceTracker.trackSolUsage(
        operation,
        highCost,
        agreementId,
        5.0,
        4.98
      );

      // Verify alert was created
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60000);
      const alerts = await resourceTracker.getAlerts(startTime, endTime);

      const solAlert = alerts.find(a => 
        a.category === 'sol' && 
        a.message.includes('High SOL usage')
      );
      
      expect(solAlert).toBeDefined();
      expect(solAlert?.severity).toBe('high');
      expect(solAlert?.actualValue).toBe(highCost);
    });

    it('should create alert for low wallet balance', async () => {
      const operation = 'test_operation';
      const cost = 0.001;
      const lowBalance = 0.8; // Below threshold of 1.0

      await resourceTracker.trackSolUsage(
        operation,
        cost,
        undefined,
        1.0,
        lowBalance
      );

      // Verify alert was created
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60000);
      const alerts = await resourceTracker.getAlerts(startTime, endTime);

      const balanceAlert = alerts.find(a => 
        a.category === 'sol' && 
        a.message.includes('Low wallet balance')
      );
      
      expect(balanceAlert).toBeDefined();
      expect(balanceAlert?.severity).toBe('critical');
    });

    it('should track database query performance', async () => {
      const query = 'SELECT * FROM agreements WHERE status = $1';
      const duration = 500; // ms
      const queryType = 'SELECT';
      const tableName = 'agreements';

      await resourceTracker.trackDatabaseQuery(
        query,
        duration,
        queryType,
        tableName,
        10
      );

      // Verify metrics were stored
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60000);
      const metrics = await resourceTracker.getMetrics(startTime, endTime);

      const dbMetric = metrics.find(m => m.databaseMetrics?.queryType === queryType);
      expect(dbMetric).toBeDefined();
      expect(dbMetric?.databaseMetrics?.queryDuration).toBe(duration);
      expect(dbMetric?.databaseMetrics?.tableName).toBe(tableName);
    });

    it('should create alert for slow query', async () => {
      const query = 'SELECT * FROM agreements JOIN deposits ON ...';
      const slowDuration = 1500; // Above threshold of 1000ms
      const queryType = 'SELECT';

      await resourceTracker.trackDatabaseQuery(
        query,
        slowDuration,
        queryType,
        'agreements'
      );

      // Verify alert was created
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60000);
      const alerts = await resourceTracker.getAlerts(startTime, endTime);

      const slowQueryAlert = alerts.find(a => 
        a.category === 'database' && 
        a.message.includes('Slow query')
      );
      
      expect(slowQueryAlert).toBeDefined();
      expect(slowQueryAlert?.severity).toBe('medium');
    });

    it('should track Redis metrics', async () => {
      await resourceTracker.trackRedisMetrics('GET');

      // Verify metrics were stored
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60000);
      const metrics = await resourceTracker.getMetrics(startTime, endTime);

      const redisMetric = metrics.find(m => m.redisMetrics);
      expect(redisMetric).toBeDefined();
      expect(redisMetric?.redisMetrics?.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(redisMetric?.redisMetrics?.keyCount).toBeGreaterThanOrEqual(0);
    });

    it('should track RPC call metrics', async () => {
      const method = 'getBalance';
      const duration = 500;
      const endpoint = 'https://api.devnet.solana.com';

      await resourceTracker.trackRpcCall(method, duration, endpoint);

      // Verify metrics were stored
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60000);
      const metrics = await resourceTracker.getMetrics(startTime, endTime);

      const rpcMetric = metrics.find(m => m.rpcMetrics?.requestType === method);
      expect(rpcMetric).toBeDefined();
      expect(rpcMetric?.rpcMetrics?.responseTime).toBe(duration);
      expect(rpcMetric?.rpcMetrics?.endpoint).toBe(endpoint);
    });

    it('should generate daily report', async () => {
      // Add some test metrics
      await resourceTracker.trackSolUsage('test_op', 0.001, 'test-123', 5.0, 4.999);
      await resourceTracker.trackDatabaseQuery('SELECT * FROM test', 200, 'SELECT', 'test');
      await resourceTracker.trackRpcCall('getBalance', 300);

      const report = await resourceTracker.generateDailyReport();

      expect(report).toBeDefined();
      expect(report.period).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.summary.totalSolConsumed).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalDatabaseQueries).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalRpcCalls).toBeGreaterThanOrEqual(0);
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.alerts).toBeInstanceOf(Array);
    });

    it('should clean up old metrics', async () => {
      await resourceTracker.cleanupOldMetrics();
      // Should complete without errors
      expect(true).toBe(true);
    });
  });

  describe('SOL Tracker', () => {
    
    it('should estimate agreement lifecycle cost', async () => {
      const estimate = await solTracker.estimateAgreementCost();

      expect(estimate).toBeDefined();
      expect(estimate.initialization).toBeGreaterThanOrEqual(0);
      expect(estimate.usdcDeposit).toBeGreaterThanOrEqual(0);
      expect(estimate.nftDeposit).toBeGreaterThanOrEqual(0);
      expect(estimate.settlement).toBeGreaterThanOrEqual(0);
      expect(estimate.cancellation).toBeGreaterThanOrEqual(0);
      expect(estimate.total).toBeGreaterThanOrEqual(0);
    });

    it('should get SOL consumption report', async () => {
      const report = await solTracker.getSolConsumptionReport(7);

      expect(report).toBeDefined();
      expect(report.totalConsumed).toBeGreaterThanOrEqual(0);
      expect(report.averagePerTransaction).toBeGreaterThanOrEqual(0);
      expect(report.byStage).toBeDefined();
      expect(report.refillCount).toBeGreaterThanOrEqual(0);
      expect(report.totalRefilled).toBeGreaterThanOrEqual(0);
    });

    it('should track wallet refill', async () => {
      const walletAddress = 'test-wallet-address';
      const preBalance = 0.5;
      const postBalance = 5.0;

      await solTracker.trackWalletRefill(
        walletAddress,
        preBalance,
        postBalance,
        'test_refill'
      );

      const history = solTracker.getRefillHistory();
      const refill = history.find(r => r.walletAddress === walletAddress);

      expect(refill).toBeDefined();
      expect(refill?.amountAdded).toBe(4.5);
      expect(refill?.reason).toBe('test_refill');
    });

    it('should get refill frequency', async () => {
      const walletAddress = 'test-wallet-frequency';
      
      // Track multiple refills
      await solTracker.trackWalletRefill(walletAddress, 0.5, 5.0);
      await solTracker.trackWalletRefill(walletAddress, 0.3, 5.0);

      const frequency = solTracker.getRefillFrequency(walletAddress, 7);
      expect(frequency).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Database Tracker', () => {
    
    it('should track query performance', async () => {
      const query = 'SELECT * FROM agreements';
      const startTime = Date.now();
      
      // Simulate query execution
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await databaseTracker.trackQueryPerformance(
        query,
        startTime,
        'SELECT',
        'agreements',
        10
      );

      const slowQueries = databaseTracker.getSlowQueries(10);
      // May or may not have slow queries depending on timing
      expect(slowQueries).toBeInstanceOf(Array);
    });

    it('should get query stats by type', async () => {
      await databaseTracker.trackQueryPerformance(
        'SELECT * FROM agreements',
        Date.now() - 100,
        'SELECT',
        'agreements'
      );

      const stats = databaseTracker.getQueryStatsByType();
      expect(stats).toBeDefined();
      
      if (stats['SELECT']) {
        expect(stats['SELECT'].count).toBeGreaterThan(0);
        expect(stats['SELECT'].averageDuration).toBeGreaterThanOrEqual(0);
      }
    });

    it('should get query stats by table', async () => {
      await databaseTracker.trackQueryPerformance(
        'SELECT * FROM agreements',
        Date.now() - 100,
        'SELECT',
        'agreements'
      );

      const stats = databaseTracker.getQueryStatsByTable();
      expect(stats).toBeDefined();
      
      if (stats['agreements']) {
        expect(stats['agreements'].count).toBeGreaterThan(0);
        expect(stats['agreements'].averageDuration).toBeGreaterThanOrEqual(0);
      }
    });

    it('should monitor database health', async () => {
      const health = await databaseTracker.monitorDatabaseHealth();

      expect(health).toBeDefined();
      expect(health.isHealthy).toBeDefined();
      expect(health.issues).toBeInstanceOf(Array);
      expect(health.metrics).toBeDefined();
      expect(health.metrics.activeConnections).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cost Analyzer', () => {
    
    it('should calculate mainnet projection', async () => {
      // Add some test metrics first
      await resourceTracker.trackSolUsage('test_op', 0.001, 'test-123', 5.0, 4.999);
      
      const projection = await costAnalyzer.calculateMainnetProjection(7, 1000);

      expect(projection).toBeDefined();
      expect(projection.period).toBe('monthly');
      expect(projection.estimatedMonthlySol).toBeGreaterThanOrEqual(0);
      expect(projection.estimatedMonthlySolUsd).toBeGreaterThanOrEqual(0);
      expect(projection.databaseCosts).toBeDefined();
      expect(projection.redisCosts).toBeDefined();
      expect(projection.rpcCosts).toBeDefined();
      expect(projection.totalMonthlyCost).toBeGreaterThanOrEqual(0);
      expect(projection.optimizationOpportunities).toBeInstanceOf(Array);
      expect(projection.assumptions).toBeInstanceOf(Array);
    });

    it('should compare devnet vs mainnet costs', async () => {
      // Add some test metrics
      await resourceTracker.trackSolUsage('agreement_initialization', 0.002, 'test-123');
      
      const comparison = await costAnalyzer.compareDevnetMainnet(7);

      expect(comparison).toBeDefined();
      expect(comparison.devnet).toBeDefined();
      expect(comparison.mainnet).toBeDefined();
      expect(comparison.difference).toBeDefined();
      expect(comparison.mainnet.multiplier).toBe(1.2);
    });

    it('should generate weekly report', async () => {
      // Add some test metrics
      await resourceTracker.trackSolUsage('test_op', 0.001, 'test-123');
      await resourceTracker.trackDatabaseQuery('SELECT * FROM test', 200, 'SELECT');
      
      const report = await costAnalyzer.generateWeeklyReport();

      expect(report).toBeDefined();
      expect(report.projection).toBeDefined();
      expect(report.comparison).toBeDefined();
      expect(report.resourceReport).toBeDefined();
    });

    it('should calculate optimization ROI', () => {
      const opportunity = {
        category: 'sol' as const,
        severity: 'high' as const,
        title: 'Test Optimization',
        description: 'Test description',
        estimatedSavings: 100,
        estimatedSavingsPercent: 20,
        implementation: 'Test implementation',
      };

      const roi = costAnalyzer.calculateOptimizationROI(opportunity, 10, 100);

      expect(roi).toBeDefined();
      expect(roi.implementationCost).toBe(1000);
      expect(roi.monthlySavings).toBe(100);
      expect(roi.annualSavings).toBe(1200);
      expect(roi.breakEvenMonths).toBe(10);
      expect(roi.roi).toBeGreaterThan(0);
    });

    it('should get cost trends', async () => {
      // Add some test metrics over time
      for (let i = 0; i < 5; i++) {
        await resourceTracker.trackSolUsage('test_op', 0.001, `test-${i}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const trends = await costAnalyzer.getCostTrends(7);

      expect(trends).toBeDefined();
      expect(trends.daily).toBeInstanceOf(Array);
      expect(trends.trend).toMatch(/^(increasing|decreasing|stable)$/);
      expect(trends.averageDailyCost).toBeGreaterThanOrEqual(0);
      expect(trends.projectedMonthlyCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration Tests', () => {
    
    it('should track complete agreement lifecycle', async () => {
      const agreementId = 'integration-test-agreement';
      
      // Track initialization
      await resourceTracker.trackSolUsage(
        'agreement_initialization',
        0.002,
        agreementId,
        5.0,
        4.998
      );

      // Track USDC deposit
      await resourceTracker.trackSolUsage(
        'agreement_usdc_deposit',
        0.001,
        agreementId,
        4.998,
        4.997
      );

      // Track NFT deposit
      await resourceTracker.trackSolUsage(
        'agreement_nft_deposit',
        0.001,
        agreementId,
        4.997,
        4.996
      );

      // Track settlement
      await resourceTracker.trackSolUsage(
        'agreement_settlement',
        0.003,
        agreementId,
        4.996,
        4.993
      );

      // Get metrics for the agreement
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60000);
      const metrics = await resourceTracker.getMetrics(startTime, endTime);

      const agreementMetrics = metrics.filter(
        m => m.solUsage?.agreementId === agreementId
      );

      expect(agreementMetrics.length).toBe(4);
      
      const totalCost = agreementMetrics.reduce(
        (sum, m) => sum + (m.solUsage?.transactionFees || 0),
        0
      );
      
      expect(totalCost).toBe(0.007);
    });

    it('should generate comprehensive report with all metrics', async () => {
      // Add various metrics
      await resourceTracker.trackSolUsage('test_op', 0.001, 'test-123');
      await resourceTracker.trackDatabaseQuery('SELECT * FROM test', 200, 'SELECT', 'test');
      await resourceTracker.trackRedisMetrics('GET');
      await resourceTracker.trackRpcCall('getBalance', 300);

      // Generate reports
      const dailyReport = await resourceTracker.generateDailyReport();
      const costProjection = await costAnalyzer.calculateMainnetProjection(7);
      const dbReport = await databaseTracker.getDatabasePerformanceReport();
      const solReport = await solTracker.getSolConsumptionReport(7);

      // Verify all reports are generated
      expect(dailyReport).toBeDefined();
      expect(costProjection).toBeDefined();
      expect(dbReport).toBeDefined();
      expect(solReport).toBeDefined();

      // Verify report structure
      expect(dailyReport.summary).toBeDefined();
      expect(costProjection.totalMonthlyCost).toBeGreaterThanOrEqual(0);
      expect(dbReport.totalQueries).toBeGreaterThanOrEqual(0);
      expect(solReport.totalConsumed).toBeGreaterThanOrEqual(0);
    });
  });
});

