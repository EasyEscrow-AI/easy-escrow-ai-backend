/**
 * Resource Tracking Integration Tests
 * 
 * Tests that require real Redis connections and external services
 * These tests verify actual storage and retrieval of metrics/alerts
 */

import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { resourceTracker } from '../../src/services/resource-tracker.service';
import { redisClient, checkRedisHealth } from '../../src/config/redis';
import { mockPrismaForTest, teardownPrismaMock } from '../helpers/prisma-mock';

describe('Resource Tracking - Integration Tests (Redis)', () => {
  let prismaStub: any;

  before(async () => {
    // Ensure Redis is connected before running tests
    const isHealthy = await checkRedisHealth();
    if (!isHealthy) {
      console.error('⚠️  Redis is not healthy. These tests require Redis to be running.');
      console.error('   Start Redis with: docker compose up -d redis');
      process.exit(1);
    }

    // Clean up any existing test data
    const pattern = 'metrics:*';
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  });

  beforeEach(async () => {
    // Clean up test data BEFORE each test to ensure isolation
    const patterns = ['metrics:*', 'alerts:*'];
    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    }

    // Setup Prisma mock
    prismaStub = {
      transactionLog: {
        count: sinon.stub().resolves(0),
        findMany: sinon.stub().resolves([]),
        groupBy: sinon.stub().resolves([]),
      },
      $queryRaw: sinon.stub().resolves([{ 
        count: BigInt(5),
        pg_database_size: BigInt(100 * 1024 * 1024)
      }]),
      $executeRaw: sinon.stub().resolves(0),
    };
    mockPrismaForTest(prismaStub);
  });

  afterEach(async () => {
    teardownPrismaMock();
    sinon.restore();

    // Clean up test data after each test
    const patterns = ['metrics:*', 'alerts:*'];
    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    }
  });

  after(async () => {
    // Final cleanup
    await resourceTracker.cleanupOldMetrics();
    
    // Don't disconnect Redis in integration tests - it's shared across tests
    // The test runner will handle cleanup when all tests complete
  });

  describe('SOL Usage Tracking', () => {
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

      // Wait for metrics to be stored
      await new Promise(resolve => setTimeout(resolve, 100));

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

      // Wait for alert to be created
      await new Promise(resolve => setTimeout(resolve, 100));

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

      // Wait for alert to be created
      await new Promise(resolve => setTimeout(resolve, 100));

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
  });

  describe('Database Query Tracking', () => {
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

      // Wait for metrics to be stored
      await new Promise(resolve => setTimeout(resolve, 100));

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

      // Wait for alert to be created
      await new Promise(resolve => setTimeout(resolve, 100));

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
  });

  describe('Redis & RPC Tracking', () => {
    it('should track Redis metrics', async () => {
      await resourceTracker.trackRedisMetrics('GET');

      // Wait for metrics to be stored
      await new Promise(resolve => setTimeout(resolve, 100));

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

      // Wait for metrics to be stored
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify metrics were stored
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60000);
      const metrics = await resourceTracker.getMetrics(startTime, endTime);

      const rpcMetric = metrics.find(m => m.rpcMetrics?.requestType === method);
      expect(rpcMetric).to.not.be.undefined;
      expect(rpcMetric?.rpcMetrics?.responseTime).to.equal(duration);
      expect(rpcMetric?.rpcMetrics?.endpoint).to.equal(endpoint);
    });
  });

  describe('Agreement Lifecycle', () => {
    it('should track complete agreement lifecycle', async () => {
      // Use unique agreement ID to prevent test pollution
      const agreementId = `integration-test-agreement-${Date.now()}`;
      
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

      // Wait for all metrics to be stored
      await new Promise(resolve => setTimeout(resolve, 200));

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
  });
});

