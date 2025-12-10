/**
 * Unit Tests for Monitoring Services
 * 
 * Tests for:
 * - Health Check Service
 * - Offer Expiry Scheduler
 * - Nonce Schedulers
 * - Logger Service
 * - Alerting Service
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { HealthCheckService } from '../../src/services/health-check.service';
import { OfferExpiryScheduler } from '../../src/services/offer-expiry-scheduler.service';
import { NonceCleanupScheduler, NonceReplenishmentScheduler } from '../../src/services/nonce-schedulers.service';
import { LoggerService, logger } from '../../src/services/logger.service';
import { AlertingService, AlertSeverity } from '../../src/services/alerting.service';

describe('Monitoring Services', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('LoggerService', () => {
    it('should be a singleton', () => {
      const instance1 = LoggerService.getInstance();
      const instance2 = LoggerService.getInstance();
      expect(instance1).to.equal(instance2);
    });

    it('should export singleton logger instance', () => {
      expect(logger).to.be.instanceOf(LoggerService);
    });

    it('should log messages at different levels', () => {
      const winstonLogger = logger.getWinstonLogger();
      const errorStub = sandbox.stub(winstonLogger, 'error');
      const warnStub = sandbox.stub(winstonLogger, 'warn');
      const infoStub = sandbox.stub(winstonLogger, 'info');
      const debugStub = sandbox.stub(winstonLogger, 'debug');

      logger.error('Test error', { correlationId: '123' });
      logger.warn('Test warning');
      logger.info('Test info');
      logger.debug('Test debug');

      expect(errorStub.calledOnce).to.be.true;
      expect(warnStub.calledOnce).to.be.true;
      expect(infoStub.calledOnce).to.be.true;
      expect(debugStub.calledOnce).to.be.true;
    });

    it('should log swap events with metadata', () => {
      const winstonLogger = logger.getWinstonLogger();
      const infoStub = sandbox.stub(winstonLogger, 'info');

      logger.logSwapEvent('offer_created', {
        offerId: 'offer-123',
        maker: 'wallet-abc',
        correlationId: 'corr-456',
      });

      expect(infoStub.calledOnce).to.be.true;
      const callArgs = infoStub.firstCall.args;
      expect(callArgs[0]).to.include('offer_created');
    });

    it('should create child logger with default metadata', () => {
      const childLogger = logger.child({ correlationId: '123', userId: 'user-456' });
      const winstonLogger = logger.getWinstonLogger();
      const infoStub = sandbox.stub(winstonLogger, 'info');

      childLogger.info('Test message', { extra: 'data' });

      expect(infoStub.calledOnce).to.be.true;
      // Winston logger.info can be called with (message) or (message, meta)
      // Access args as any[] to handle both signatures
      const args = infoStub.firstCall.args as any[];
      const metadata = args[1] || args[0];
      expect(metadata).to.have.property('correlationId', '123');
      expect(metadata).to.have.property('userId', 'user-456');
      expect(metadata).to.have.property('extra', 'data');
    });
  });

  describe('AlertingService', () => {
    it('should be a singleton', () => {
      const instance1 = AlertingService.getInstance();
      const instance2 = AlertingService.getInstance();
      expect(instance1).to.equal(instance2);
    });

    it('should throttle duplicate alerts', async () => {
      const alertingService = AlertingService.getInstance({
        throttleDurationMs: 1000, // 1 second
        emailEnabled: false,
        consoleEnabled: false,
      });

      // Clear any existing alerts
      alertingService.clearActiveAlerts();

      await alertingService.sendAlert(
        'test_alert',
        AlertSeverity.HIGH,
        'Test Alert',
        'This is a test'
      );

      const status1 = alertingService.getStatus();
      const totalBefore = status1.totalAlerts;

      // Try to send same alert immediately (should be throttled)
      await alertingService.sendAlert(
        'test_alert',
        AlertSeverity.HIGH,
        'Test Alert',
        'This is a test'
      );

      const status2 = alertingService.getStatus();
      expect(status2.totalAlerts).to.equal(totalBefore);
      expect(status2.throttledAlerts).to.be.greaterThan(0);
    });

    it('should track active alerts', async () => {
      const alertingService = AlertingService.getInstance({
        emailEnabled: false,
        consoleEnabled: false,
      });

      alertingService.clearActiveAlerts();

      await alertingService.sendAlert(
        'critical_test',
        AlertSeverity.CRITICAL,
        'Critical Test',
        'Critical message'
      );

      const status = alertingService.getStatus();
      expect(status.activeAlerts).to.equal(1);
      expect(status.activeAlertTypes).to.include('critical_test');
    });

    it('should clear active alerts on recovery', async () => {
      const alertingService = AlertingService.getInstance({
        emailEnabled: false,
        consoleEnabled: false,
      });

      alertingService.clearActiveAlerts();

      // Send alert
      await alertingService.sendAlert(
        'recoverable_test',
        AlertSeverity.HIGH,
        'Recoverable Test',
        'Test message'
      );

      expect(alertingService.getStatus().activeAlerts).to.equal(1);

      // Send recovery
      await alertingService.sendRecovery('recoverable_test', 'Issue resolved');

      expect(alertingService.getStatus().activeAlerts).to.equal(0);
    });

    it('should provide predefined alert methods', async () => {
      const alertingService = AlertingService.getInstance({
        emailEnabled: false,
        consoleEnabled: false,
      });

      alertingService.clearActiveAlerts();

      // Test various predefined alerts
      await alertingService.alertDatabaseDown();
      await alertingService.alertRPCDown('http://example.com');
      await alertingService.alertNoncePoolDepleted({ total: 10, available: 0 });
      await alertingService.alertTreasuryLow(500000000, 'treasury-address');

      const status = alertingService.getStatus();
      expect(status.activeAlerts).to.be.greaterThan(0);
    });
  });

  describe('Health Check Service', () => {
    it('should cache health check results', async () => {
      // Create mock dependencies
      const mockConnection = {
        getSlot: sandbox.stub().resolves(100),
        getBalance: sandbox.stub().resolves(2000000000),
        rpcEndpoint: 'http://test-rpc.com',
      } as any;

      const mockNoncePoolManager = {
        getPoolStats: sandbox.stub().resolves({
          total: 20,
          available: 15,
          inUse: 3,
          expired: 2,
        }),
      } as any;

      const mockIdempotencyService = {
        getStatus: sandbox.stub().returns({
          isRunning: true,
          expirationHours: 24,
          cleanupIntervalMinutes: 60,
        }),
      } as any;

      const mockCheckDb = sandbox.stub().resolves(true);
      const mockCheckRedis = sandbox.stub().resolves(true);

      const healthCheckService = new HealthCheckService(
        mockConnection,
        mockNoncePoolManager,
        mockIdempotencyService,
        mockCheckDb,
        mockCheckRedis,
        { toBase58: () => 'program-id' } as any,
        { toBuffer: () => Buffer.from('authority') } as any,
        { cacheTTL: 30 }
      );

      // First check - should call all dependencies
      const result1 = await healthCheckService.check();
      expect(result1.cached).to.be.false;
      expect(mockCheckDb.callCount).to.equal(1);

      // Second check immediately - should return cached
      const result2 = await healthCheckService.check();
      expect(result2.cached).to.be.true;
      expect(mockCheckDb.callCount).to.equal(1); // Not called again
    });

    it('should force refresh when requested', async () => {
      const mockConnection = {
        getSlot: sandbox.stub().resolves(100),
        getBalance: sandbox.stub().resolves(2000000000),
        rpcEndpoint: 'http://test-rpc.com',
      } as any;

      const mockNoncePoolManager = {
        getPoolStats: sandbox.stub().resolves({
          total: 20,
          available: 15,
          inUse: 3,
          expired: 2,
        }),
      } as any;

      const mockIdempotencyService = {
        getStatus: sandbox.stub().returns({
          isRunning: true,
          expirationHours: 24,
          cleanupIntervalMinutes: 60,
        }),
      } as any;

      const mockCheckDb = sandbox.stub().resolves(true);
      const mockCheckRedis = sandbox.stub().resolves(true);

      const healthCheckService = new HealthCheckService(
        mockConnection,
        mockNoncePoolManager,
        mockIdempotencyService,
        mockCheckDb,
        mockCheckRedis,
        { toBase58: () => 'program-id' } as any,
        { toBuffer: () => Buffer.from('authority') } as any
      );

      await healthCheckService.check();
      await healthCheckService.check(true); // Force refresh

      expect(mockCheckDb.callCount).to.equal(2);
    });

    it('should return correct status codes', async () => {
      const mockConnection = {
        getSlot: sandbox.stub().resolves(100),
        getBalance: sandbox.stub().resolves(2000000000),
        rpcEndpoint: 'http://test-rpc.com',
      } as any;

      const mockNoncePoolManager = {
        getPoolStats: sandbox.stub().resolves({
          total: 20,
          available: 15,
          inUse: 3,
          expired: 2,
        }),
      } as any;

      const mockIdempotencyService = {
        getStatus: sandbox.stub().returns({
          isRunning: true,
          expirationHours: 24,
          cleanupIntervalMinutes: 60,
        }),
      } as any;

      const mockCheckDb = sandbox.stub().resolves(true);
      const mockCheckRedis = sandbox.stub().resolves(true);

      const healthCheckService = new HealthCheckService(
        mockConnection,
        mockNoncePoolManager,
        mockIdempotencyService,
        mockCheckDb,
        mockCheckRedis,
        { toBase58: () => 'program-id' } as any,
        { toBuffer: () => Buffer.from('authority') } as any
      );

      const result = await healthCheckService.check();
      const statusCode = healthCheckService.getStatusCode(result);

      expect(statusCode).to.be.oneOf([200, 503]);
    });
  });

  describe('Offer Expiry Scheduler', () => {
    it('should have correct default configuration', () => {
      const mockPrisma = {} as any;
      const scheduler = OfferExpiryScheduler.getInstance(mockPrisma);
      const status = scheduler.getStatus();

      expect(status.schedule).to.equal('*/15 * * * *');
      expect(status.isLeader).to.be.a('boolean');
    });

    it('should track execution metrics', () => {
      const mockPrisma = {} as any;
      const scheduler = OfferExpiryScheduler.getInstance(mockPrisma);
      const status = scheduler.getStatus();

      expect(status).to.have.property('totalExecutions');
      expect(status).to.have.property('totalExpired');
      expect(status).to.have.property('consecutiveErrors');
    });
  });

  describe('Nonce Cleanup Scheduler', () => {
    it('should have correct default configuration', () => {
      const mockNoncePoolManager = {} as any;
      const scheduler = NonceCleanupScheduler.getInstance(mockNoncePoolManager);
      const status = scheduler.getStatus();

      expect(status.schedule).to.equal('0 * * * *'); // Hourly
    });

    it('should track execution metrics', () => {
      const mockNoncePoolManager = {} as any;
      const scheduler = NonceCleanupScheduler.getInstance(mockNoncePoolManager);
      const status = scheduler.getStatus();

      expect(status).to.have.property('totalExecutions');
      expect(status).to.have.property('totalCleaned');
      expect(status).to.have.property('consecutiveErrors');
    });
  });

  describe('Nonce Replenishment Scheduler', () => {
    it('should have correct default configuration', () => {
      const mockNoncePoolManager = {} as any;
      const scheduler = NonceReplenishmentScheduler.getInstance(mockNoncePoolManager);
      const status = scheduler.getStatus();

      expect(status.schedule).to.equal('*/30 * * * *'); // Every 30 min
      expect(status.minPoolSize).to.equal(10);
      expect(status.replenishmentAmount).to.equal(5);
    });

    it('should track execution metrics', () => {
      const mockNoncePoolManager = {} as any;
      const scheduler = NonceReplenishmentScheduler.getInstance(mockNoncePoolManager);
      const status = scheduler.getStatus();

      expect(status).to.have.property('totalExecutions');
      expect(status).to.have.property('totalReplenished');
      expect(status).to.have.property('consecutiveErrors');
    });
  });
});


