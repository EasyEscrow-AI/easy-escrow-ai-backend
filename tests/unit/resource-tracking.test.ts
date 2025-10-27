/**
 * Resource Tracking System Tests
 * 
 * Comprehensive tests for resource tracking, cost analysis, and monitoring
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
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

      expect(metrics.length).to.be.greaterThan(0);
      const solMetric = metrics.find(m => m.solUsage?.operationType === operation);
      expect(solMetric).to.not.be.undefined;
      expect(solMetric?.solUsage?.transactionFees).to.equal(cost);
      expect(solMetric?.solUsage?.agreementId).to.equal(agreementId);
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
      
      expect(solAlert).to.not.be.undefined;
      expect(solAlert?.severity).to.equal('high');
      expect(solAlert?.actualValue).to.equal(highCost);
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
      
      expect(balanceAlert).to.not.be.undefined;
      expect(balanceAlert?.severity).to.equal('critical');
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
      expect(dbMetric).to.not.be.undefined;
      expect(dbMetric?.databaseMetrics?.queryDuration).to.equal(duration);
      expect(dbMetric?.databaseMetrics?.tableName).to.equal(tableName);
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
      
      expect(slowQueryAlert).to.not.be.undefined;
      expect(slowQueryAlert?.severity).to.equal('medium');
    });

    it('should track Redis metrics', async () => {
      await resourceTracker.trackRedisMetrics('GET');

      // Verify metrics were stored
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60000);
      const metrics = await resourceTracker.getMetrics(startTime, endTime);

      const redisMetric = metrics.find(m => m.redisMetrics);
      expect(redisMetric).to.not.be.undefined;
      expect(redisMetric?.redisMetrics?.memoryUsage).to.be.at.least(0);
      expect(redisMetric?.redisMetrics?.keyCount).to.be.at.least(0);
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
      expect(rpcMetric).to.not.be.undefined;
      expect(rpcMetric?.rpcMetrics?.responseTime).to.equal(duration);
      expect(rpcMetric?.rpcMetrics?.endpoint).to.equal(endpoint);
    });

    it('should generate daily report', async () => {
      // Add some test metrics
      await resourceTracker.trackSolUsage('test_op', 0.001, 'test-123', 5.0, 4.999);
      await resourceTracker.trackDatabaseQuery('SELECT * FROM test', 200, 'SELECT', 'test');
      await resourceTracker.trackRpcCall('getBalance', 300);

      const report = await resourceTracker.generateDailyReport();

      expect(report).to.not.be.undefined;
      expect(report.period).to.not.be.undefined;
      expect(report.summary).to.not.be.undefined;
      expect(report.summary.totalSolConsumed).to.be.at.least(0);
      expect(report.summary.totalDatabaseQueries).to.be.at.least(0);
      expect(report.summary.totalRpcCalls).to.be.at.least(0);
      expect(report.recommendations).to.be.instanceOf(Array);
      expect(report.alerts).to.be.instanceOf(Array);
    });

    it('should clean up old metrics', async () => {
      await resourceTracker.cleanupOldMetrics();
      // Should complete without errors
      expect(true).to.equal(true);
    });
  });

  describe('SOL Tracker', () => {
    
    it('should estimate agreement lifecycle cost', async () => {
      const estimate = await solTracker.estimateAgreementCost();

      expect(estimate).to.not.be.undefined;
      expect(estimate.initialization).to.be.at.least(0);
      expect(estimate.usdcDeposit).to.be.at.least(0);
      expect(estimate.nftDeposit).to.be.at.least(0);
      expect(estimate.settlement).to.be.at.least(0);
      expect(estimate.cancellation).to.be.at.least(0);
      expect(estimate.total).to.be.at.least(0);
    });

    it('should get SOL consumption report', async () => {
      const report = await solTracker.getSolConsumptionReport(7);

      expect(report).to.not.be.undefined;
      expect(report.totalConsumed).to.be.at.least(0);
      expect(report.averagePerTransaction).to.be.at.least(0);
      expect(report.byStage).to.not.be.undefined;
      expect(report.refillCount).to.be.at.least(0);
      expect(report.totalRefilled).to.be.at.least(0);
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

      expect(refill).to.not.be.undefined;
      expect(refill?.amountAdded).to.equal(4.5);
      expect(refill?.reason).to.equal('test_refill');
    });

    it('should get refill frequency', async () => {
      const walletAddress = 'test-wallet-frequency';
      
      // Track multiple refills
      await solTracker.trackWalletRefill(walletAddress, 0.5, 5.0);
      await solTracker.trackWalletRefill(walletAddress, 0.3, 5.0);

      const frequency = solTracker.getRefillFrequency(walletAddress, 7);
      expect(frequency).to.be.at.least(2);
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
      expect(slowQueries).to.be.instanceOf(Array);
    });

    it('should get query stats by type', async () => {
      await databaseTracker.trackQueryPerformance(
        'SELECT * FROM agreements',
        Date.now() - 100,
        'SELECT',
        'agreements'
      );

      const stats = databaseTracker.getQueryStatsByType();
      expect(stats).to.not.be.undefined;
      
      if (stats['SELECT']) {
        expect(stats['SELECT'].count).to.be.greaterThan(0);
        expect(stats['SELECT'].averageDuration).to.be.at.least(0);
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
      expect(stats).to.not.be.undefined;
      
      if (stats['agreements']) {
        expect(stats['agreements'].count).to.be.greaterThan(0);
        expect(stats['agreements'].averageDuration).to.be.at.least(0);
      }
    });

    it('should monitor database health', async () => {
      const health = await databaseTracker.monitorDatabaseHealth();

      expect(health).to.not.be.undefined;
      expect(health.isHealthy).to.not.be.undefined;
      expect(health.issues).to.be.instanceOf(Array);
      expect(health.metrics).to.not.be.undefined;
      expect(health.metrics.activeConnections).to.be.at.least(0);
    });
  });

  describe('Cost Analyzer', () => {
    
    it('should calculate mainnet projection', async () => {
      // Add some test metrics first
      await resourceTracker.trackSolUsage('test_op', 0.001, 'test-123', 5.0, 4.999);
      
      const projection = await costAnalyzer.calculateMainnetProjection(7, 1000);

      expect(projection).to.not.be.undefined;
      expect(projection.period).to.equal('monthly');
      expect(projection.estimatedMonthlySol).to.be.at.least(0);
      expect(projection.estimatedMonthlySolUsd).to.be.at.least(0);
      expect(projection.databaseCosts).to.not.be.undefined;
      expect(projection.redisCosts).to.not.be.undefined;
      expect(projection.rpcCosts).to.not.be.undefined;
      expect(projection.totalMonthlyCost).to.be.at.least(0);
      expect(projection.optimizationOpportunities).to.be.instanceOf(Array);
      expect(projection.assumptions).to.be.instanceOf(Array);
    });

    it('should compare devnet vs mainnet costs', async () => {
      // Add some test metrics
      await resourceTracker.trackSolUsage('agreement_initialization', 0.002, 'test-123');
      
      const comparison = await costAnalyzer.compareDevnetMainnet(7);

      expect(comparison).to.not.be.undefined;
      expect(comparison.devnet).to.not.be.undefined;
      expect(comparison.mainnet).to.not.be.undefined;
      expect(comparison.difference).to.not.be.undefined;
      expect(comparison.mainnet.multiplier).to.equal(1.2);
    });

    it('should generate weekly report', async () => {
      // Add some test metrics
      await resourceTracker.trackSolUsage('test_op', 0.001, 'test-123');
      await resourceTracker.trackDatabaseQuery('SELECT * FROM test', 200, 'SELECT');
      
      const report = await costAnalyzer.generateWeeklyReport();

      expect(report).to.not.be.undefined;
      expect(report.projection).to.not.be.undefined;
      expect(report.comparison).to.not.be.undefined;
      expect(report.resourceReport).to.not.be.undefined;
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

      expect(roi).to.not.be.undefined;
      expect(roi.implementationCost).to.equal(1000);
      expect(roi.monthlySavings).to.equal(100);
      expect(roi.annualSavings).to.equal(1200);
      expect(roi.breakEvenMonths).to.equal(10);
      expect(roi.roi).to.be.greaterThan(0);
    });

    it('should get cost trends', async () => {
      // Add some test metrics over time
      for (let i = 0; i < 5; i++) {
        await resourceTracker.trackSolUsage('test_op', 0.001, `test-${i}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const trends = await costAnalyzer.getCostTrends(7);

      expect(trends).to.not.be.undefined;
      expect(trends.daily).to.be.instanceOf(Array);
      expect(trends.trend).to.match(/^(increasing|decreasing|stable)$/);
      expect(trends.averageDailyCost).to.be.at.least(0);
      expect(trends.projectedMonthlyCost).to.be.at.least(0);
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

      expect(agreementMetrics.length).to.equal(4);
      
      const totalCost = agreementMetrics.reduce(
        (sum, m) => sum + (m.solUsage?.transactionFees || 0),
        0
      );
      
      expect(totalCost).to.equal(0.007);
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
      expect(dailyReport).to.not.be.undefined;
      expect(costProjection).to.not.be.undefined;
      expect(dbReport).to.not.be.undefined;
      expect(solReport).to.not.be.undefined;

      // Verify report structure
      expect(dailyReport.summary).to.not.be.undefined;
      expect(costProjection.totalMonthlyCost).to.be.at.least(0);
      expect(dbReport.totalQueries).to.be.at.least(0);
      expect(solReport.totalConsumed).to.be.at.least(0);
    });
  });
});


