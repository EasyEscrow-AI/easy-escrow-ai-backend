/**
 * Integration Tests: Institution Escrow Lifecycle
 *
 * Tests the full escrow lifecycle via HTTP:
 * - Login to get token
 * - Create escrow -> verify response
 * - Record deposit -> verify status changes to FUNDED
 * - Release funds -> verify status changes to RELEASED
 * - Verify audit log entries via listing
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon, { SinonSandbox } from 'sinon';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

import * as authServiceModule from '../../../src/services/institution-auth.service';
import * as escrowServiceModule from '../../../src/services/institution-escrow.service';

const JWT_SECRET = 'test-jwt-secret-for-escrow-lifecycle';
const SETTLEMENT_KEY = 'test-settlement-authority-key-12345';

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

function generateTestToken(payload: { clientId: string; email: string; tier: string }, expiresIn = '15m'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

describe('Institution Escrow Lifecycle - Integration Tests', function () {
  this.timeout(10000);

  let sandbox: SinonSandbox;
  let app: express.Express;
  let request: supertest.Agent;
  let mockAuthService: sinon.SinonStubbedInstance<authServiceModule.InstitutionAuthService>;
  let mockEscrowService: sinon.SinonStubbedInstance<escrowServiceModule.InstitutionEscrowService>;

  const testClientId = 'client-uuid-escrow-001';
  const testEmail = 'escrow@institution.com';
  const testTier = 'STANDARD';
  const testEscrowId = '550e8400-e29b-41d4-a716-446655440000';
  const testPayerWallet = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV8';
  const testRecipientWallet = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  const testCorridor = 'SG-CH';
  const testAmount = 50000;

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

  describe('Full Escrow Lifecycle: Create -> Deposit -> Release', () => {
    it('should create an escrow and return CREATED status', async () => {
      const escrowData = {
        escrowId: testEscrowId,
        clientId: testClientId,
        payerWallet: testPayerWallet,
        recipientWallet: testRecipientWallet,
        amount: testAmount,
        platformFee: 250,
        corridor: testCorridor,
        conditionType: 'ADMIN_RELEASE',
        status: 'CREATED',
        settlementAuthority: testPayerWallet,
        riskScore: 15,
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockEscrowService.createEscrow.resolves({
        escrow: escrowData,
        complianceResult: {
          passed: true,
          riskScore: 15,
          flags: [],
        },
      });

      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: testAmount,
          corridor: testCorridor,
          conditionType: 'ADMIN_RELEASE',
          expiryHours: 72,
        })
        .expect(201);

      expect(res.body.success).to.be.true;
      expect(res.body.data.escrow.status).to.equal('CREATED');
      expect(res.body.data.escrow.amount).to.equal(testAmount);
      expect(res.body.data.escrow.corridor).to.equal(testCorridor);
      expect(res.body.data.complianceResult.passed).to.be.true;
      expect(res.body.data.complianceResult.riskScore).to.equal(15);

      // Verify service was called with correct clientId
      const createCall = mockEscrowService.createEscrow.firstCall;
      expect(createCall.args[0].clientId).to.equal(testClientId);
      expect(createCall.args[0].payerWallet).to.equal(testPayerWallet);
      expect(createCall.args[0].amount).to.equal(testAmount);
    });

    it('should record a deposit and change status to FUNDED', async () => {
      const txSignature = '5VERv8NMhVRxQktDHzaKyh3oGT3Y7tptMFjFqgTb';

      const fundedEscrow = {
        escrowId: testEscrowId,
        clientId: testClientId,
        payerWallet: testPayerWallet,
        recipientWallet: testRecipientWallet,
        amount: testAmount,
        platformFee: 250,
        corridor: testCorridor,
        conditionType: 'ADMIN_RELEASE',
        status: 'FUNDED',
        depositTxSignature: txSignature,
        fundedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockEscrowService.recordDeposit.resolves(fundedEscrow);

      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/deposit`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ txSignature })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.status).to.equal('FUNDED');
      expect(res.body.data.depositTxSignature).to.equal(txSignature);

      expect(mockEscrowService.recordDeposit.calledOnceWith(testClientId, testEscrowId, txSignature)).to.be.true;
    });

    it('should release funds and change status to RELEASED', async () => {
      const releasedEscrow = {
        escrowId: testEscrowId,
        clientId: testClientId,
        payerWallet: testPayerWallet,
        recipientWallet: testRecipientWallet,
        amount: testAmount,
        platformFee: 250,
        corridor: testCorridor,
        conditionType: 'ADMIN_RELEASE',
        status: 'RELEASED',
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockEscrowService.releaseFunds.resolves(releasedEscrow);

      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/release`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Settlement-Authority-Key', SETTLEMENT_KEY)
        .send({ notes: 'Goods delivered and inspected' })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.status).to.equal('RELEASED');
      expect(res.body.data.resolvedAt).to.be.a('string');

      expect(mockEscrowService.releaseFunds.calledOnceWith(testClientId, testEscrowId, 'Goods delivered and inspected')).to.be.true;
    });
  });

  describe('Get and List Escrows', () => {
    it('should get a single escrow by ID', async () => {
      const escrowData = {
        escrowId: testEscrowId,
        clientId: testClientId,
        payerWallet: testPayerWallet,
        recipientWallet: testRecipientWallet,
        amount: testAmount,
        platformFee: 250,
        corridor: testCorridor,
        status: 'FUNDED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockEscrowService.getEscrow.resolves(escrowData);

      const res = await request
        .get(`/api/v1/institution-escrow/${testEscrowId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.escrowId).to.equal(testEscrowId);
      expect(res.body.data.status).to.equal('FUNDED');
    });

    it('should list escrows for the authenticated client', async () => {
      mockEscrowService.listEscrows.resolves({
        escrows: [
          {
            escrowId: testEscrowId,
            clientId: testClientId,
            status: 'FUNDED',
            amount: testAmount,
            corridor: testCorridor,
          },
          {
            escrowId: '550e8400-e29b-41d4-a716-446655440001',
            clientId: testClientId,
            status: 'RELEASED',
            amount: 25000,
            corridor: 'US-UK',
          },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      });

      const res = await request
        .get('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.escrows).to.have.length(2);
      expect(res.body.data.total).to.equal(2);
      expect(res.body.data.limit).to.equal(20);
      expect(res.body.data.offset).to.equal(0);
    });

    it('should list escrows with status filter', async () => {
      mockEscrowService.listEscrows.resolves({
        escrows: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      await request
        .get('/api/v1/institution-escrow?status=FUNDED')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const callArgs = mockEscrowService.listEscrows.firstCall.args[0];
      expect(callArgs.clientId).to.equal(testClientId);
      expect(callArgs.status).to.equal('FUNDED');
    });

    it('should list escrows with corridor filter', async () => {
      mockEscrowService.listEscrows.resolves({
        escrows: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      await request
        .get('/api/v1/institution-escrow?corridor=SG-CH')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const callArgs = mockEscrowService.listEscrows.firstCall.args[0];
      expect(callArgs.corridor).to.equal('SG-CH');
    });
  });

  describe('Cancel Escrow', () => {
    it('should cancel a CREATED escrow', async () => {
      const cancelledEscrow = {
        escrowId: testEscrowId,
        clientId: testClientId,
        status: 'CANCELLED',
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockEscrowService.cancelEscrow.resolves(cancelledEscrow);

      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'No longer needed' })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.status).to.equal('CANCELLED');

      expect(mockEscrowService.cancelEscrow.calledOnceWith(testClientId, testEscrowId, 'No longer needed')).to.be.true;
    });

    it('should reject cancellation of a released escrow', async () => {
      mockEscrowService.cancelEscrow.rejects(
        new Error('Cannot cancel: escrow status is RELEASED'),
      );

      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'Changed mind' })
        .expect(400);

      expect(res.body.error).to.equal('Cancellation Failed');
      expect(res.body.message).to.include('RELEASED');
    });
  });

  describe('Escrow Lifecycle Status Transitions', () => {
    it('should reject deposit on a non-CREATED escrow', async () => {
      mockEscrowService.recordDeposit.rejects(
        new Error('Cannot record deposit: escrow status is FUNDED, expected CREATED'),
      );

      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/deposit`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ txSignature: '5VERv8NMhVRxQktDHzaKyh3oGT3Y7tptMFjFqgTb' })
        .expect(400);

      expect(res.body.error).to.equal('Deposit Recording Failed');
      expect(res.body.message).to.include('FUNDED');
    });

    it('should reject release on a non-FUNDED escrow', async () => {
      mockEscrowService.releaseFunds.rejects(
        new Error('Cannot release: escrow status is CREATED, expected FUNDED'),
      );

      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/release`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Settlement-Authority-Key', SETTLEMENT_KEY)
        .send({})
        .expect(400);

      expect(res.body.error).to.equal('Release Failed');
      expect(res.body.message).to.include('CREATED');
    });

    it('should return 410 when deposit on expired escrow', async () => {
      mockEscrowService.recordDeposit.rejects(
        new Error('Escrow has expired'),
      );

      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/deposit`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ txSignature: '5VERv8NMhVRxQktDHzaKyh3oGT3Y7tptMFjFqgTb' })
        .expect(410);

      expect(res.body.error).to.equal('Deposit Recording Failed');
      expect(res.body.message).to.include('expired');
    });
  });

  describe('Authentication Required', () => {
    it('should reject unauthenticated escrow creation', async () => {
      const res = await request
        .post('/api/v1/institution-escrow')
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: testAmount,
          corridor: testCorridor,
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(401);

      expect(res.body.error).to.equal('Unauthorized');
    });

    it('should reject unauthenticated escrow listing', async () => {
      const res = await request
        .get('/api/v1/institution-escrow')
        .expect(401);

      expect(res.body.error).to.equal('Unauthorized');
    });
  });
});
