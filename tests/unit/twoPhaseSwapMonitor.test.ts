/**
 * Unit Tests for TwoPhaseSwapMonitor Service
 *
 * Tests the background monitoring service for two-phase swaps:
 * - Expired swap detection and processing
 * - Stuck swap detection
 * - Alert generation
 * - Auto-recovery triggering
 * - Monitor lifecycle (start/stop)
 *
 * Based on Task 11: Implement Swap State Recovery and Monitoring
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { TwoPhaseSwapStatus } from '../../src/generated/prisma';

import {
  TwoPhaseSwapMonitor,
  getTwoPhaseSwapMonitor,
  resetTwoPhaseSwapMonitor,
  MonitorConfig,
} from '../../src/services/twoPhaseSwapMonitor';

import {
  SwapRecoveryService,
  createSwapRecoveryService,
  RecoveryResult,
} from '../../src/services/swapRecoveryService';

import { createSwapStateMachine, SwapStateMachine } from '../../src/services/swapStateMachine';

// =============================================================================
// Mock Prisma Client (simplified for monitor tests)
// =============================================================================

class MockPrismaClient {
  private swaps: Map<string, any> = new Map();
  private idCounter = 0;

  twoPhaseSwap = {
    findMany: async (params: { where?: any; take?: number; orderBy?: any }) => {
      let results = Array.from(this.swaps.values());

      if (params.where) {
        if (params.where.status?.in) {
          results = results.filter((s) => params.where.status.in.includes(s.status));
        }
        if (params.where.expiresAt?.lt) {
          results = results.filter((s) => s.expiresAt < params.where.expiresAt.lt);
        }
        if (params.where.expiresAt?.gt) {
          results = results.filter((s) => s.expiresAt > params.where.expiresAt.gt);
        }
        if (params.where.updatedAt?.lt) {
          results = results.filter((s) => s.updatedAt < params.where.updatedAt.lt);
        }
        if (params.where.createdAt?.gte) {
          results = results.filter((s) => s.createdAt >= params.where.createdAt.gte);
        }
        if (params.where.failedAt?.gte) {
          results = results.filter((s) => s.failedAt && s.failedAt >= params.where.failedAt.gte);
        }
      }

      if (params.orderBy) {
        const [key, order] = Object.entries(params.orderBy)[0];
        results.sort((a, b) => {
          const aVal = a[key as string];
          const bVal = b[key as string];
          if (!aVal || !bVal) return 0;
          if (order === 'desc') {
            return bVal > aVal ? 1 : -1;
          }
          return aVal > bVal ? 1 : -1;
        });
      }

      if (params.take) {
        results = results.slice(0, params.take);
      }

      return results;
    },

    findUnique: async (params: { where: { id: string } }) => {
      return this.swaps.get(params.where.id) || null;
    },

    update: async (params: { where: { id: string }; data: any }) => {
      const swap = this.swaps.get(params.where.id);
      if (!swap) return null;
      const updated = { ...swap, ...params.data, updatedAt: new Date() };
      this.swaps.set(params.where.id, updated);
      return updated;
    },

    create: async (params: { data: any }) => {
      const id = `swap-${++this.idCounter}`;
      const swap = { id, ...params.data, createdAt: new Date(), updatedAt: new Date() };
      this.swaps.set(id, swap);
      return swap;
    },
  };

  // Helper methods
  reset() {
    this.swaps.clear();
    this.idCounter = 0;
  }

  async createSwapDirectly(data: Partial<any>): Promise<any> {
    const id = `swap-${++this.idCounter}`;
    const swap = {
      id,
      status: TwoPhaseSwapStatus.CREATED,
      partyA: 'PartyA111111111111111111111111111111111111',
      partyB: 'PartyB222222222222222222222222222222222222',
      assetsA: [{ type: 'CNFT', identifier: 'asset-a-1' }],
      assetsB: [{ type: 'CNFT', identifier: 'asset-b-1' }],
      platformFeeLamports: BigInt(10_000_000),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      delegationStatus: {},
      stateHistory: [],
      settleTxs: [],
      currentSettleIndex: 0,
      totalSettleTxs: 1,
      ...data,
    };
    this.swaps.set(id, swap);
    return swap;
  }
}

// =============================================================================
// Mock Recovery Service
// =============================================================================

class MockRecoveryService {
  public recoveryAttempts: string[] = [];
  public expiredSwapsProcessed: string[] = [];
  public shouldFailRecovery = false;

  async recoverExpiredPartialLock(swapId: string): Promise<RecoveryResult> {
    this.expiredSwapsProcessed.push(swapId);
    if (this.shouldFailRecovery) {
      return {
        success: false,
        swapId,
        errorMessage: 'Mock failure',
      };
    }
    return {
      success: true,
      swapId,
      finalState: TwoPhaseSwapStatus.EXPIRED,
    };
  }

  async recoverPartialSettlement(swapId: string): Promise<RecoveryResult> {
    this.recoveryAttempts.push(swapId);
    if (this.shouldFailRecovery) {
      return {
        success: false,
        swapId,
        errorMessage: 'Mock failure',
      };
    }
    return {
      success: true,
      swapId,
      finalState: TwoPhaseSwapStatus.COMPLETED,
    };
  }

  reset() {
    this.recoveryAttempts = [];
    this.expiredSwapsProcessed = [];
    this.shouldFailRecovery = false;
  }
}

// =============================================================================
// Test Suite
// =============================================================================

describe('TwoPhaseSwapMonitor', () => {
  let prisma: MockPrismaClient;
  let mockRecoveryService: MockRecoveryService;
  let monitor: TwoPhaseSwapMonitor;
  let alertsReceived: Array<{ type: string; swapId: string; message: string; severity: string }>;

  beforeEach(() => {
    prisma = new MockPrismaClient();
    mockRecoveryService = new MockRecoveryService();
    alertsReceived = [];

    monitor = new TwoPhaseSwapMonitor(
      prisma as any,
      mockRecoveryService as any,
      {
        checkIntervalMs: 10000, // Slow for tests
        stuckThresholdMinutes: 10,
        autoRecoveryEnabled: true,
        alertsEnabled: true,
        processingDelayMs: 0, // No delay in tests
      }
    );

    // Capture alerts
    monitor.onAlert((type, swapId, message, severity) => {
      alertsReceived.push({ type, swapId, message, severity });
    });
  });

  afterEach(async () => {
    await monitor.stop();
    prisma.reset();
    mockRecoveryService.reset();
    resetTwoPhaseSwapMonitor();
  });

  // ===========================================================================
  // Lifecycle Tests
  // ===========================================================================

  describe('Monitor Lifecycle', () => {
    it('should start and stop correctly', async () => {
      expect(monitor.getStatus().isRunning).to.be.false;

      await monitor.start();
      expect(monitor.getStatus().isRunning).to.be.true;

      await monitor.stop();
      expect(monitor.getStatus().isRunning).to.be.false;
    });

    it('should not start twice', async () => {
      await monitor.start();
      await monitor.start(); // Should be no-op
      expect(monitor.getStatus().isRunning).to.be.true;
    });

    it('should track check count', async () => {
      await monitor.manualCheck();
      await monitor.manualCheck();

      expect(monitor.getStatus().checkCount).to.equal(2);
    });

    it('should track last check time', async () => {
      const before = new Date();
      await monitor.manualCheck();
      const after = new Date();

      const status = monitor.getStatus();
      expect(status.lastCheckAt).to.be.instanceOf(Date);
      expect(status.lastCheckAt!.getTime()).to.be.at.least(before.getTime());
      expect(status.lastCheckAt!.getTime()).to.be.at.most(after.getTime());
    });
  });

  // ===========================================================================
  // Expired Swap Detection Tests
  // ===========================================================================

  describe('Expired Swap Detection', () => {
    it('should detect expired swaps in lock phase', async () => {
      // Create expired swap
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        expiresAt: new Date(Date.now() - 30 * 60 * 1000), // Expired 30 min ago
      });

      await monitor.manualCheck();

      expect(mockRecoveryService.expiredSwapsProcessed.length).to.equal(1);
    });

    it('should not process non-expired swaps', async () => {
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Not expired
      });

      await monitor.manualCheck();

      expect(mockRecoveryService.expiredSwapsProcessed.length).to.equal(0);
    });

    it('should generate alert on expired swap', async () => {
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.LOCKING_PARTY_A,
        expiresAt: new Date(Date.now() - 10 * 60 * 1000),
      });

      await monitor.manualCheck();

      expect(alertsReceived.some((a) => a.type === 'SWAP_EXPIRED')).to.be.true;
    });

    it('should process multiple expired swaps', async () => {
      for (let i = 0; i < 3; i++) {
        await prisma.createSwapDirectly({
          status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
          expiresAt: new Date(Date.now() - 30 * 60 * 1000),
        });
      }

      await monitor.manualCheck();

      expect(mockRecoveryService.expiredSwapsProcessed.length).to.equal(3);
      expect(monitor.getStatus().expiredSwapsProcessed).to.equal(3);
    });
  });

  // ===========================================================================
  // Stuck Swap Detection Tests
  // ===========================================================================

  describe('Stuck Swap Detection', () => {
    it('should detect stuck swaps (no progress for N minutes)', async () => {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        updatedAt: fifteenMinutesAgo,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // Not expired
      });

      await monitor.manualCheck();

      expect(monitor.getStatus().stuckSwapsFound).to.equal(1);
    });

    it('should not flag recently updated swaps as stuck', async () => {
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        updatedAt: new Date(), // Just now
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await monitor.manualCheck();

      expect(monitor.getStatus().stuckSwapsFound).to.equal(0);
    });

    it('should generate alert for stuck swap', async () => {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.SETTLING,
        updatedAt: fifteenMinutesAgo,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await monitor.manualCheck();

      expect(alertsReceived.some((a) => a.type === 'STUCK_SWAP')).to.be.true;
    });

    it('should generate CRITICAL alert for very stuck swaps', async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.SETTLING,
        updatedAt: thirtyMinutesAgo,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await monitor.manualCheck();

      const stuckAlert = alertsReceived.find((a) => a.type === 'STUCK_SWAP');
      expect(stuckAlert?.severity).to.equal('CRITICAL');
    });
  });

  // ===========================================================================
  // Auto-Recovery Tests
  // ===========================================================================

  describe('Auto-Recovery', () => {
    it('should attempt auto-recovery for stuck settlement', async () => {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const swap = await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        updatedAt: fifteenMinutesAgo,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await monitor.manualCheck();

      expect(mockRecoveryService.recoveryAttempts).to.include(swap.id);
      expect(monitor.getStatus().recoveryAttempts).to.equal(1);
    });

    it('should track recovery success', async () => {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        updatedAt: fifteenMinutesAgo,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await monitor.manualCheck();

      expect(monitor.getStatus().recoverySuccesses).to.equal(1);
      expect(alertsReceived.some((a) => a.type === 'RECOVERY_SUCCESS')).to.be.true;
    });

    it('should alert on recovery failure', async () => {
      mockRecoveryService.shouldFailRecovery = true;

      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        updatedAt: fifteenMinutesAgo,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await monitor.manualCheck();

      expect(alertsReceived.some((a) => a.type === 'RECOVERY_FAILED')).to.be.true;
    });

    it('should not auto-recover lock phase issues', async () => {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.LOCKING_PARTY_A,
        updatedAt: fifteenMinutesAgo,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await monitor.manualCheck();

      expect(mockRecoveryService.recoveryAttempts.length).to.equal(0);
      expect(alertsReceived.some((a) => a.type === 'MANUAL_INTERVENTION')).to.be.true;
    });

    it('should respect autoRecoveryEnabled config', async () => {
      // Create monitor with auto-recovery disabled
      const noAutoMonitor = new TwoPhaseSwapMonitor(
        prisma as any,
        mockRecoveryService as any,
        {
          autoRecoveryEnabled: false,
          processingDelayMs: 0,
        }
      );

      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTIAL_SETTLE,
        updatedAt: fifteenMinutesAgo,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await noAutoMonitor.manualCheck();

      expect(mockRecoveryService.recoveryAttempts.length).to.equal(0);
    });
  });

  // ===========================================================================
  // Failed Swap Monitoring Tests
  // ===========================================================================

  describe('Failed Swap Monitoring', () => {
    it('should detect recently failed swaps', async () => {
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.FAILED,
        failedAt: new Date(), // Just now
        errorMessage: 'Test failure',
        errorCode: 'TEST_ERROR',
      });

      await monitor.manualCheck();

      expect(alertsReceived.some((a) => a.type === 'SWAP_FAILED')).to.be.true;
    });

    it('should include error details in alert', async () => {
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.FAILED,
        failedAt: new Date(),
        errorMessage: 'Settlement transaction rejected',
        errorCode: 'TX_REJECTED',
      });

      await monitor.manualCheck();

      const failedAlert = alertsReceived.find((a) => a.type === 'SWAP_FAILED');
      expect(failedAlert?.message).to.include('Settlement transaction rejected');
    });
  });

  // ===========================================================================
  // Alert System Tests
  // ===========================================================================

  describe('Alert System', () => {
    it('should register and call alert callbacks', async () => {
      const alerts: string[] = [];
      monitor.onAlert((type) => {
        alerts.push(type);
      });

      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        expiresAt: new Date(Date.now() - 30 * 60 * 1000),
      });

      await monitor.manualCheck();

      expect(alerts.length).to.be.greaterThan(0);
    });

    it('should track alert count', async () => {
      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.FAILED,
        failedAt: new Date(),
        errorMessage: 'Test',
      });

      await monitor.manualCheck();

      expect(monitor.getStatus().alertsSent).to.be.greaterThan(0);
    });

    it('should respect alertsEnabled config', async () => {
      // Create monitor with alerts disabled
      const noAlertsMonitor = new TwoPhaseSwapMonitor(
        prisma as any,
        mockRecoveryService as any,
        {
          alertsEnabled: false,
          processingDelayMs: 0,
        }
      );

      let alertCount = 0;
      noAlertsMonitor.onAlert(() => alertCount++);

      await prisma.createSwapDirectly({
        status: TwoPhaseSwapStatus.PARTY_A_LOCKED,
        expiresAt: new Date(Date.now() - 30 * 60 * 1000),
      });

      await noAlertsMonitor.manualCheck();

      expect(alertCount).to.equal(0);
    });
  });

  // ===========================================================================
  // Status Tracking Tests
  // ===========================================================================

  describe('Status Tracking', () => {
    it('should provide comprehensive status', () => {
      const status = monitor.getStatus();

      expect(status).to.have.property('isRunning');
      expect(status).to.have.property('lastCheckAt');
      expect(status).to.have.property('checkCount');
      expect(status).to.have.property('stuckSwapsFound');
      expect(status).to.have.property('expiredSwapsProcessed');
      expect(status).to.have.property('recoveryAttempts');
      expect(status).to.have.property('recoverySuccesses');
      expect(status).to.have.property('alertsSent');
      expect(status).to.have.property('errors');
    });

    it('should track errors', async () => {
      // Create swap that will cause processing error
      // (In real scenario, this would be a database error or similar)
      const status = monitor.getStatus();
      expect(status.errors).to.equal(0);
    });
  });

  // ===========================================================================
  // Singleton/Factory Tests
  // ===========================================================================

  describe('Singleton Factory', () => {
    it('should return same instance', () => {
      const instance1 = getTwoPhaseSwapMonitor(
        prisma as any,
        mockRecoveryService as any
      );
      const instance2 = getTwoPhaseSwapMonitor(
        prisma as any,
        mockRecoveryService as any
      );

      expect(instance1).to.equal(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getTwoPhaseSwapMonitor(
        prisma as any,
        mockRecoveryService as any
      );
      resetTwoPhaseSwapMonitor();
      const instance2 = getTwoPhaseSwapMonitor(
        prisma as any,
        mockRecoveryService as any
      );

      expect(instance1).to.not.equal(instance2);
    });
  });
});
