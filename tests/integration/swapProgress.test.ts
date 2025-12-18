/**
 * Integration Tests for Swap Progress Endpoint
 *
 * Tests the GET /api/swaps/:id/progress and /api/offers/bulk/:id/progress endpoints
 * including response format, rate limiting, and caching behavior.
 *
 * @see .taskmaster/tasks/task_013_cnft-delegation-swap.txt
 */

import { expect } from 'chai';
import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { PrismaClient, TwoPhaseSwapStatus } from '../../src/generated/prisma';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import {
  createSwapProgressService,
  SwapProgressService,
} from '../../src/services/swapProgress.service';
import { createSwapStateMachine, SwapStateMachine } from '../../src/services/swapStateMachine';
import { CacheService } from '../../src/services/cache.service';
import rateLimit from 'express-rate-limit';

// =============================================================================
// Test Setup
// =============================================================================

describe('Swap Progress API - Integration Tests', () => {
  let app: express.Application;
  let prisma: PrismaClient;
  let swapStateMachine: SwapStateMachine;
  let swapProgressService: SwapProgressService;
  let mockCacheService: MockCacheService;
  let createdSwapId: string;

  // Mock cache service for testing
  class MockCacheService {
    private cache: Map<string, { value: any; expiresAt: number }> = new Map();

    async get<T>(key: string): Promise<T | null> {
      const entry = this.cache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return null;
      }
      return entry.value as T;
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
      const expiresAt = Date.now() + (ttl || 3600) * 1000;
      this.cache.set(key, { value, expiresAt });
      return true;
    }

    async delete(key: string): Promise<boolean> {
      return this.cache.delete(key);
    }

    reset(): void {
      this.cache.clear();
    }
  }

  before(async function () {
    this.timeout(10000);

    // Connect to test database
    const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!testDatabaseUrl) {
      console.log('Skipping integration tests - no database URL configured');
      this.skip();
      return;
    }

    try {
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: testDatabaseUrl,
          },
        },
      });

      // Test database connection
      await prisma.$connect();

      // Initialize services
      swapStateMachine = createSwapStateMachine(prisma);
      mockCacheService = new MockCacheService();
      swapProgressService = createSwapProgressService(
        swapStateMachine,
        mockCacheService as unknown as CacheService
      );

      // Create test Express app
      app = express();
      app.use(express.json());

      // Rate limiter for progress endpoint
      const progressRateLimiter = rateLimit({
        windowMs: 1000,
        max: 100, // High limit for testing
        keyGenerator: (req: Request) => `progress:${req.params.id}:${req.ip}`,
        standardHeaders: true,
        legacyHeaders: false,
      });

      // Progress endpoints
      app.get(
        '/api/swaps/:id/progress',
        progressRateLimiter,
        async (req: Request, res: Response): Promise<void> => {
          try {
            const { id } = req.params;
            const progress = await swapProgressService.getProgress(id);

            if (!progress) {
              res.status(404).json({
                success: false,
                error: 'Not Found',
                message: `Swap ${id} not found`,
                timestamp: new Date().toISOString(),
              });
              return;
            }

            res.status(200).json({
              success: true,
              data: progress,
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get progress';
            res.status(500).json({
              success: false,
              error: 'Internal Server Error',
              message,
              timestamp: new Date().toISOString(),
            });
          }
        }
      );

      app.get(
        '/api/offers/bulk/:id/progress',
        progressRateLimiter,
        async (req: Request, res: Response): Promise<void> => {
          try {
            const { id } = req.params;
            const progress = await swapProgressService.getProgress(id);

            if (!progress) {
              res.status(404).json({
                success: false,
                error: 'Not Found',
                message: `Bulk offer ${id} not found`,
                timestamp: new Date().toISOString(),
              });
              return;
            }

            res.status(200).json({
              success: true,
              data: progress,
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get progress';
            res.status(500).json({
              success: false,
              error: 'Internal Server Error',
              message,
              timestamp: new Date().toISOString(),
            });
          }
        }
      );
    } catch (error) {
      console.log('Skipping integration tests - database connection failed:', error);
      this.skip();
    }
  });

  after(async function () {
    this.timeout(10000);

    if (prisma) {
      // Clean up test data
      try {
        if (createdSwapId) {
          await prisma.twoPhaseSwap.delete({
            where: { id: createdSwapId },
          }).catch(() => {
            // Ignore if already deleted
          });
        }
        await prisma.$disconnect();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(() => {
    if (mockCacheService) {
      mockCacheService.reset();
    }
  });

  // ===========================================================================
  // Test Data Setup Helper
  // ===========================================================================

  async function createTestSwap(
    status: TwoPhaseSwapStatus = TwoPhaseSwapStatus.CREATED,
    overrides: any = {}
  ): Promise<string> {
    const now = new Date();
    const swap = await prisma.twoPhaseSwap.create({
      data: {
        status,
        partyA: 'TestPartyAWallet111111111111111111111111111',
        partyB: 'TestPartyBWallet222222222222222222222222222',
        assetsA: [{ type: 'CNFT', identifier: 'test-asset-a-1' }],
        assetsB: [{ type: 'CNFT', identifier: 'test-asset-b-1' }],
        platformFeeLamports: BigInt(10_000_000),
        expiresAt: new Date(now.getTime() + 86400000), // 24 hours
        delegationStatus: {},
        stateHistory: [
          {
            fromState: TwoPhaseSwapStatus.CREATED,
            toState: status,
            timestamp: now.toISOString(),
            reason: 'Test swap created',
            triggeredBy: 'TestPartyAWallet111111111111111111111111111',
          },
        ],
        settleTxs: [],
        ...overrides,
      },
    });
    createdSwapId = swap.id;
    return swap.id;
  }

  // ===========================================================================
  // Response Format Tests
  // ===========================================================================

  describe('GET /api/swaps/:id/progress', () => {
    it('should return 404 for non-existent swap', async function () {
      if (!app) this.skip();

      const response = await request(app).get('/api/swaps/non-existent-id/progress');

      expect(response.status).to.equal(404);
      expect(response.body.success).to.be.false;
      expect(response.body.error).to.equal('Not Found');
    });

    it('should return progress for existing CREATED swap', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.CREATED);

      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.data).to.exist;
      expect(response.body.data.swapId).to.equal(swapId);
      expect(response.body.data.status).to.equal('CREATED');
      expect(response.body.data.phase).to.equal('pending');
    });

    it('should return correct progress structure', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.SETTLING, {
        totalSettleTxs: 5,
        currentSettleIndex: 2,
        settleTxs: ['tx1', 'tx2'],
        lockTxA: 'lockTxA123',
        lockTxB: 'lockTxB456',
        lockConfirmedA: new Date(),
        lockConfirmedB: new Date(),
      });

      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.status).to.equal(200);

      const { data } = response.body;
      expect(data.phase).to.equal('settle');
      expect(data.progress).to.exist;
      expect(data.progress.totalTransfers).to.equal(5);
      expect(data.progress.completedTransfers).to.equal(2);
      expect(data.progress.percentComplete).to.equal(40);
      expect(data.timestamps).to.exist;
      expect(data.timestamps.created).to.exist;
      expect(data.transactions).to.be.an('array');
    });

    it('should include lock transactions', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.FULLY_LOCKED, {
        lockTxA: 'lockTxA_test_123',
        lockTxB: 'lockTxB_test_456',
        lockConfirmedA: new Date(),
        lockConfirmedB: new Date(),
      });

      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.status).to.equal(200);

      const { data } = response.body;
      expect(data.transactions).to.have.lengthOf(2);

      const lockATx = data.transactions.find((t: any) => t.type === 'lock_a');
      const lockBTx = data.transactions.find((t: any) => t.type === 'lock_b');

      expect(lockATx).to.exist;
      expect(lockATx.sig).to.equal('lockTxA_test_123');
      expect(lockBTx).to.exist;
      expect(lockBTx.sig).to.equal('lockTxB_test_456');
    });

    it('should include settlement transactions', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.PARTIAL_SETTLE, {
        lockTxA: 'lockTxA',
        lockTxB: 'lockTxB',
        lockConfirmedA: new Date(),
        lockConfirmedB: new Date(),
        settleTxs: ['settleTx1', 'settleTx2', 'settleTx3'],
        currentSettleIndex: 3,
        totalSettleTxs: 5,
      });

      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.status).to.equal(200);

      const { data } = response.body;
      const settleTxs = data.transactions.filter((t: any) => t.type.startsWith('settle_'));
      expect(settleTxs).to.have.lengthOf(3);
      expect(settleTxs[0].type).to.equal('settle_1');
      expect(settleTxs[1].type).to.equal('settle_2');
      expect(settleTxs[2].type).to.equal('settle_3');
    });
  });

  // ===========================================================================
  // Phase Tests
  // ===========================================================================

  describe('Phase Detection', () => {
    it('should return "pending" phase for CREATED status', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.CREATED);
      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.body.data.phase).to.equal('pending');
    });

    it('should return "lock" phase for LOCKING_PARTY_A status', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.LOCKING_PARTY_A);
      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.body.data.phase).to.equal('lock');
    });

    it('should return "settle" phase for SETTLING status', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.SETTLING);
      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.body.data.phase).to.equal('settle');
    });

    it('should return "complete" phase for COMPLETED status', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.COMPLETED, {
        settledAt: new Date(),
        finalSettleTx: 'finalTx123',
      });
      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.body.data.phase).to.equal('complete');
      expect(response.body.data.progress.percentComplete).to.equal(100);
    });

    it('should return "failed" phase with error info for FAILED status', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.FAILED, {
        errorMessage: 'Transaction failed',
        errorCode: 'TX_FAILED',
        failedAt: new Date(),
      });
      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.body.data.phase).to.equal('failed');
      expect(response.body.data.error).to.exist;
      expect(response.body.data.error.message).to.equal('Transaction failed');
      expect(response.body.data.error.code).to.equal('TX_FAILED');
    });

    it('should return "cancelled" phase with cancellation info for CANCELLED status', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.CANCELLED, {
        cancelledBy: 'TestPartyAWallet111111111111111111111111111',
        cancelReason: 'User cancelled',
        cancelledAt: new Date(),
      });
      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.body.data.phase).to.equal('cancelled');
      expect(response.body.data.cancellation).to.exist;
      expect(response.body.data.cancellation.by).to.equal(
        'TestPartyAWallet111111111111111111111111111'
      );
      expect(response.body.data.cancellation.reason).to.equal('User cancelled');
    });
  });

  // ===========================================================================
  // Bulk API Alias Tests
  // ===========================================================================

  describe('GET /api/offers/bulk/:id/progress', () => {
    it('should return same data as /api/swaps/:id/progress', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.SETTLING, {
        totalSettleTxs: 3,
        currentSettleIndex: 1,
        settleTxs: ['tx1'],
      });

      const [response1, response2] = await Promise.all([
        request(app).get(`/api/swaps/${swapId}/progress`),
        request(app).get(`/api/offers/bulk/${swapId}/progress`),
      ]);

      expect(response1.status).to.equal(200);
      expect(response2.status).to.equal(200);

      // Data should be identical
      expect(response1.body.data.swapId).to.equal(response2.body.data.swapId);
      expect(response1.body.data.status).to.equal(response2.body.data.status);
      expect(response1.body.data.phase).to.equal(response2.body.data.phase);
      expect(response1.body.data.progress.percentComplete).to.equal(
        response2.body.data.progress.percentComplete
      );
    });

    it('should return 404 for non-existent bulk offer', async function () {
      if (!app) this.skip();

      const response = await request(app).get('/api/offers/bulk/non-existent/progress');

      expect(response.status).to.equal(404);
      expect(response.body.error).to.equal('Not Found');
    });
  });

  // ===========================================================================
  // Caching Tests
  // ===========================================================================

  describe('Caching Behavior', () => {
    it('should cache progress responses', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.SETTLING, {
        totalSettleTxs: 5,
        currentSettleIndex: 2,
        settleTxs: ['tx1', 'tx2'],
      });

      // First request
      const response1 = await request(app).get(`/api/swaps/${swapId}/progress`);
      expect(response1.status).to.equal(200);
      expect(response1.body.data.progress.completedTransfers).to.equal(2);

      // Update the swap directly in the database
      await prisma.twoPhaseSwap.update({
        where: { id: swapId },
        data: {
          currentSettleIndex: 4,
          settleTxs: ['tx1', 'tx2', 'tx3', 'tx4'],
        },
      });

      // Second request should return cached value (same as first)
      const response2 = await request(app).get(`/api/swaps/${swapId}/progress`);
      expect(response2.status).to.equal(200);
      // Should still show 2 because it's cached
      expect(response2.body.data.progress.completedTransfers).to.equal(2);
    });
  });

  // ===========================================================================
  // Rate Limiting Tests
  // ===========================================================================

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async function () {
      if (!app) this.skip();

      const swapId = await createTestSwap(TwoPhaseSwapStatus.CREATED);

      const response = await request(app).get(`/api/swaps/${swapId}/progress`);

      expect(response.status).to.equal(200);
      // Check for rate limit headers
      expect(response.headers).to.have.property('ratelimit-limit');
      expect(response.headers).to.have.property('ratelimit-remaining');
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async function () {
      if (!app) this.skip();

      // Use a valid UUID format but one that doesn't exist
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app).get(`/api/swaps/${fakeId}/progress`);

      expect(response.status).to.equal(404);
      expect(response.body.success).to.be.false;
    });
  });
});
