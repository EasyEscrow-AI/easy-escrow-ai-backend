/**
 * Integration Tests: Institution Concurrent Operations
 *
 * Tests race conditions and concurrent access:
 * - Two simultaneous deposits on same escrow -> only one succeeds
 * - Cancel vs release at same time -> one succeeds
 * - Multiple refresh token requests -> proper rotation
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon, { SinonSandbox } from 'sinon';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

import * as authServiceModule from '../../../src/services/institution-auth.service';
import * as escrowServiceModule from '../../../src/services/institution-escrow.service';

const JWT_SECRET = 'test-jwt-secret-for-concurrent-ops';
const SETTLEMENT_KEY = 'test-settlement-authority-key-concurrent';

/**
 * Create a fresh test app by clearing route module caches.
 * This resets the in-memory rate limiter state between tests.
 */
function createTestApp() {
  const authRoutePath = require.resolve('../../../src/routes/institution-auth.routes');
  delete require.cache[authRoutePath];
  const institutionAuthRoutes = require('../../../src/routes/institution-auth.routes').default;

  const escrowRoutePath = require.resolve('../../../src/routes/institution-escrow.routes');
  delete require.cache[escrowRoutePath];
  const institutionEscrowRoutes = require('../../../src/routes/institution-escrow.routes').default;

  const app = express();
  app.use(express.json());
  app.set('trust proxy', 1);
  app.use(institutionAuthRoutes);
  app.use(institutionEscrowRoutes);
  return app;
}

function generateTestToken(
  payload: { clientId: string; email: string; tier: string },
  expiresIn = '15m',
): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

describe('Institution Concurrent Operations - Integration Tests', function () {
  this.timeout(15000);

  let sandbox: SinonSandbox;
  let app: express.Express;
  let request: supertest.Agent;
  let mockAuthService: sinon.SinonStubbedInstance<authServiceModule.InstitutionAuthService>;
  let mockEscrowService: sinon.SinonStubbedInstance<escrowServiceModule.InstitutionEscrowService>;

  const testClientId = 'client-uuid-concurrent-001';
  const testEmail = 'concurrent@institution.com';
  const testTier = 'STANDARD';
  const testEscrowId = 'aa0e8400-e29b-41d4-a716-446655440000';

  let accessToken: string;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.SETTLEMENT_AUTHORITY_API_KEY = SETTLEMENT_KEY;

    mockAuthService = sandbox.createStubInstance(authServiceModule.InstitutionAuthService);
    sandbox.stub(authServiceModule, 'getInstitutionAuthService').returns(mockAuthService as any);

    mockEscrowService = sandbox.createStubInstance(escrowServiceModule.InstitutionEscrowService);
    sandbox.stub(escrowServiceModule, 'getInstitutionEscrowService').returns(mockEscrowService as any);

    accessToken = generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier });

    app = createTestApp();
    request = supertest(app);
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.JWT_SECRET;
    delete process.env.SETTLEMENT_AUTHORITY_API_KEY;
  });

  describe('Two Simultaneous Deposits on Same Escrow', () => {
    it('should allow only one deposit when two are submitted concurrently', async () => {
      const txSig1 = '5VERv8NMhVRxQktDHzaKyh3oGT3Y7tptMFjFqgTb';
      const txSig2 = '6WERv8NMhVRxQktDHzaKyh3oGT3Y7tptMFjFqgTb';

      // First deposit succeeds, second fails because status is no longer CREATED
      let depositCallCount = 0;
      mockEscrowService.recordDeposit.callsFake(async (_clientId, _escrowId, txSignature) => {
        // Capture call number synchronously before any await
        const myCallNumber = ++depositCallCount;
        // Simulate a small delay to make the concurrency realistic
        await new Promise(resolve => setTimeout(resolve, 10));

        if (myCallNumber === 1) {
          return {
            escrowId: testEscrowId,
            status: 'FUNDED',
            depositTxSignature: txSignature,
          };
        } else {
          throw new Error('Cannot record deposit: escrow status is FUNDED, expected CREATED');
        }
      });

      // Fire both requests concurrently
      const [res1, res2] = await Promise.all([
        request
          .post(`/api/v1/institution-escrow/${testEscrowId}/deposit`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ txSignature: txSig1 }),
        request
          .post(`/api/v1/institution-escrow/${testEscrowId}/deposit`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ txSignature: txSig2 }),
      ]);

      // One should succeed and one should fail
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).to.deep.equal([200, 400]);

      // The successful one should show FUNDED
      const successRes = res1.status === 200 ? res1 : res2;
      expect(successRes.body.success).to.be.true;
      expect(successRes.body.data.status).to.equal('FUNDED');

      // The failed one should indicate the conflict
      const failRes = res1.status === 400 ? res1 : res2;
      expect(failRes.body.error).to.equal('Deposit Recording Failed');
      expect(failRes.body.message).to.include('FUNDED');
    });
  });

  describe('Cancel vs Release at Same Time', () => {
    it('should allow only one operation when cancel and release race', async () => {
      // Simulate a race: first operation succeeds, second fails because status changed
      let operationCount = 0;

      mockEscrowService.releaseFunds.callsFake(async () => {
        // Capture call number synchronously before any await
        const myCallNumber = ++operationCount;
        await new Promise(resolve => setTimeout(resolve, 10));

        if (myCallNumber === 1) {
          return {
            escrowId: testEscrowId,
            status: 'RELEASED',
            resolvedAt: new Date(),
          };
        } else {
          throw new Error('Cannot release: escrow status is CANCELLED, expected FUNDED');
        }
      });

      mockEscrowService.cancelEscrow.callsFake(async () => {
        // Capture call number synchronously before any await
        const myCallNumber = ++operationCount;
        await new Promise(resolve => setTimeout(resolve, 10));

        if (myCallNumber === 1) {
          return {
            escrowId: testEscrowId,
            status: 'CANCELLED',
            resolvedAt: new Date(),
          };
        } else {
          throw new Error('Cannot cancel: escrow status is RELEASED');
        }
      });

      const [releaseRes, cancelRes] = await Promise.all([
        request
          .post(`/api/v1/institution-escrow/${testEscrowId}/release`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Settlement-Authority-Key', SETTLEMENT_KEY)
          .send({ notes: 'Race release' }),
        request
          .post(`/api/v1/institution-escrow/${testEscrowId}/cancel`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ reason: 'Race cancel' }),
      ]);

      // One should succeed (200) and one should fail (400)
      const statuses = [releaseRes.status, cancelRes.status].sort();
      expect(statuses).to.deep.equal([200, 400]);

      // Verify only one operation ultimately succeeds
      const successCount = [releaseRes, cancelRes].filter(r => r.status === 200).length;
      expect(successCount).to.equal(1);
    });
  });

  describe('Multiple Refresh Token Requests', () => {
    it('should handle sequential refresh token rotation correctly', async () => {
      const refreshToken1 = 'refresh-token-seq-1';
      const refreshToken2 = 'refresh-token-seq-2';
      const refreshToken3 = 'refresh-token-seq-3';

      // First refresh succeeds and returns new token
      mockAuthService.refreshToken.onFirstCall().resolves({
        accessToken: generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier }),
        refreshToken: refreshToken2,
        expiresIn: 900,
      });

      // Second refresh with old token fails (revoked)
      mockAuthService.refreshToken.onSecondCall().rejects(
        new Error('Refresh token has been revoked'),
      );

      // Third refresh with new token succeeds
      mockAuthService.refreshToken.onThirdCall().resolves({
        accessToken: generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier }),
        refreshToken: refreshToken3,
        expiresIn: 900,
      });

      // First refresh
      const res1 = await request
        .post('/api/v1/institution/auth/refresh')
        .send({ refreshToken: refreshToken1 })
        .expect(200);

      expect(res1.body.success).to.be.true;
      expect(res1.body.data.refreshToken).to.equal(refreshToken2);

      // Attempt to reuse the old refresh token (should be revoked)
      const res2 = await request
        .post('/api/v1/institution/auth/refresh')
        .send({ refreshToken: refreshToken1 })
        .expect(401);

      expect(res2.body.error).to.equal('Token Refresh Failed');
      expect(res2.body.message).to.include('revoked');

      // Use the new refresh token
      const res3 = await request
        .post('/api/v1/institution/auth/refresh')
        .send({ refreshToken: refreshToken2 })
        .expect(200);

      expect(res3.body.success).to.be.true;
      expect(res3.body.data.refreshToken).to.equal(refreshToken3);
    });

    it('should reject concurrent refresh with same token (token reuse detection)', async () => {
      const refreshToken = 'refresh-token-concurrent-reuse';

      let refreshCallCount = 0;
      mockAuthService.refreshToken.callsFake(async () => {
        // Capture call number synchronously before any await
        const myCallNumber = ++refreshCallCount;
        await new Promise(resolve => setTimeout(resolve, 10));

        if (myCallNumber === 1) {
          return {
            accessToken: generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier }),
            refreshToken: 'new-refresh-token',
            expiresIn: 900,
          };
        } else {
          throw new Error('Refresh token has been revoked');
        }
      });

      const [res1, res2] = await Promise.all([
        request
          .post('/api/v1/institution/auth/refresh')
          .send({ refreshToken }),
        request
          .post('/api/v1/institution/auth/refresh')
          .send({ refreshToken }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).to.deep.equal([200, 401]);

      // One succeeds with new tokens
      const successRes = res1.status === 200 ? res1 : res2;
      expect(successRes.body.data.refreshToken).to.equal('new-refresh-token');

      // One fails due to revocation
      const failRes = res1.status === 401 ? res1 : res2;
      expect(failRes.body.error).to.equal('Token Refresh Failed');
    });
  });

  describe('Concurrent Escrow Creation', () => {
    it('should handle multiple simultaneous escrow creations by same client', async () => {
      const baseWallet = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV8';
      const recipientWallet = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

      mockEscrowService.createEscrow.callsFake(async (params) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return {
          escrow: {
            escrowId: `escrow-${Math.random().toString(36).slice(2, 10)}`,
            clientId: params.clientId,
            payerWallet: params.payerWallet,
            recipientWallet: params.recipientWallet,
            amount: params.amount,
            corridor: params.corridor,
            status: 'CREATED',
          },
          complianceResult: { passed: true, riskScore: 10, flags: [] },
        };
      });

      const requests = Array.from({ length: 3 }, (_, i) =>
        request
          .post('/api/v1/institution-escrow')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            payerWallet: baseWallet,
            recipientWallet: recipientWallet,
            amount: 1000 * (i + 1),
            corridor: 'SG-CH',
            conditionType: 'ADMIN_RELEASE',
          }),
      );

      const results = await Promise.all(requests);

      // All should succeed
      results.forEach((res) => {
        expect(res.status).to.equal(201);
        expect(res.body.success).to.be.true;
        expect(res.body.data.escrow.status).to.equal('CREATED');
      });

      // Each should have a unique escrowId
      const escrowIds = results.map((r) => r.body.data.escrow.escrowId);
      const uniqueIds = new Set(escrowIds);
      expect(uniqueIds.size).to.equal(3);
    });
  });
});
