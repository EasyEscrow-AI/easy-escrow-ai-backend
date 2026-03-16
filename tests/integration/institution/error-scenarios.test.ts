/**
 * Integration Tests: Institution Error Scenarios
 *
 * Tests error handling across institution escrow endpoints:
 * - Create escrow with unverified client -> rejected
 * - Create escrow with expired token -> 401
 * - Create escrow with invalid corridor -> validation error
 * - Record deposit on non-existent escrow -> 404
 * - Release without settlement authority header -> 403
 * - Cancel already-released escrow -> error
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon, { SinonSandbox } from 'sinon';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

import * as authServiceModule from '../../../src/services/institution-auth.service';
import * as escrowServiceModule from '../../../src/services/institution-escrow.service';

const JWT_SECRET = 'test-jwt-secret-for-error-scenarios';
const SETTLEMENT_KEY = 'test-settlement-authority-key-errors';

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

describe('Institution Error Scenarios - Integration Tests', function () {
  this.timeout(10000);

  let sandbox: SinonSandbox;
  let app: express.Express;
  let request: supertest.Agent;
  let mockAuthService: sinon.SinonStubbedInstance<authServiceModule.InstitutionAuthService>;
  let mockEscrowService: sinon.SinonStubbedInstance<escrowServiceModule.InstitutionEscrowService>;

  const testClientId = 'client-uuid-errors-001';
  const testEmail = 'errors@institution.com';
  const testTier = 'STANDARD';
  const testEscrowId = '660e8400-e29b-41d4-a716-446655440000';
  const testPayerWallet = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV8';
  const testRecipientWallet = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

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

  describe('Create Escrow with Unverified Client', () => {
    it('should reject escrow creation when client KYC is not verified', async () => {
      mockEscrowService.createEscrow.rejects(
        new Error('KYC status is PENDING. Must be VERIFIED.'),
      );

      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: 10000,
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(400);

      expect(res.body.error).to.equal('Escrow Creation Failed');
      expect(res.body.message).to.include('KYC');
      expect(res.body.message).to.include('VERIFIED');
    });

    it('should reject escrow creation when client account is SUSPENDED', async () => {
      mockEscrowService.createEscrow.rejects(
        new Error('Client account is SUSPENDED. Must be ACTIVE.'),
      );

      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: 10000,
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(400);

      expect(res.body.error).to.equal('Escrow Creation Failed');
      expect(res.body.message).to.include('SUSPENDED');
    });
  });

  describe('Create Escrow with Expired Token', () => {
    it('should return 401 when access token is expired', async () => {
      const expiredToken = jwt.sign(
        { clientId: testClientId, email: testEmail, tier: testTier },
        JWT_SECRET,
        { expiresIn: '0s' } as jwt.SignOptions,
      );

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 50));

      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: 10000,
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(401);

      expect(res.body.error).to.equal('Unauthorized');
      expect(res.body.code).to.equal('TOKEN_EXPIRED');
    });
  });

  describe('Create Escrow with Invalid Corridor', () => {
    it('should reject escrow with invalid corridor format', async () => {
      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: 10000,
          corridor: 'INVALID',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      expect(res.body.details).to.be.an('array');
      const corridorError = res.body.details.find((d: any) => d.path === 'corridor');
      expect(corridorError).to.exist;
    });

    it('should reject escrow with lowercase corridor', async () => {
      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: 10000,
          corridor: 'sg-ch',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
    });

    it('should reject escrow with invalid conditionType', async () => {
      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: 10000,
          corridor: 'SG-CH',
          conditionType: 'INVALID_TYPE',
        })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      const conditionError = res.body.details.find((d: any) => d.path === 'conditionType');
      expect(conditionError).to.exist;
    });
  });

  describe('Record Deposit on Non-Existent Escrow', () => {
    it('should return error when recording deposit on non-existent escrow', async () => {
      const nonExistentId = '770e8400-e29b-41d4-a716-446655440099';

      mockEscrowService.recordDeposit.rejects(
        new Error(`Escrow not found: ${nonExistentId}`),
      );

      const res = await request
        .post(`/api/v1/institution-escrow/${nonExistentId}/deposit`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ txSignature: '5VERv8NMhVRxQktDHzaKyh3oGT3Y7tptMFjFqgTb' })
        .expect(400);

      expect(res.body.error).to.equal('Deposit Recording Failed');
      expect(res.body.message).to.include('not found');
    });

    it('should return validation error for non-UUID escrow ID', async () => {
      const res = await request
        .post('/api/v1/institution-escrow/not-a-uuid/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ txSignature: '5VERv8NMhVRxQktDHzaKyh3oGT3Y7tptMFjFqgTb' })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
    });
  });

  describe('Release Without Settlement Authority Header', () => {
    it('should return 403 when X-Settlement-Authority-Key header is missing', async () => {
      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/release`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ notes: 'Attempting release' })
        .expect(403);

      expect(res.body.error).to.equal('Forbidden');
      expect(res.body.code).to.equal('SETTLEMENT_UNAUTHORIZED');
    });

    it('should return 403 when settlement authority key is wrong', async () => {
      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/release`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Settlement-Authority-Key', 'wrong-key-value')
        .send({ notes: 'Attempting release' })
        .expect(403);

      expect(res.body.error).to.equal('Forbidden');
      expect(res.body.code).to.equal('SETTLEMENT_UNAUTHORIZED');
    });

    it('should return 500 when SETTLEMENT_AUTHORITY_API_KEY env not configured', async () => {
      delete process.env.SETTLEMENT_AUTHORITY_API_KEY;

      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/release`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Settlement-Authority-Key', SETTLEMENT_KEY)
        .send({ notes: 'Attempting release' })
        .expect(500);

      expect(res.body.error).to.equal('Internal Server Error');
      expect(res.body.message).to.include('not configured');
    });
  });

  describe('Cancel Already-Released Escrow', () => {
    it('should reject cancellation of an already-released escrow', async () => {
      mockEscrowService.cancelEscrow.rejects(
        new Error('Cannot cancel: escrow status is RELEASED'),
      );

      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'Trying to cancel released escrow' })
        .expect(400);

      expect(res.body.error).to.equal('Cancellation Failed');
      expect(res.body.message).to.include('RELEASED');
    });

    it('should reject cancellation of an already-cancelled escrow', async () => {
      mockEscrowService.cancelEscrow.rejects(
        new Error('Cannot cancel: escrow status is CANCELLED'),
      );

      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'Double cancellation' })
        .expect(400);

      expect(res.body.error).to.equal('Cancellation Failed');
      expect(res.body.message).to.include('CANCELLED');
    });
  });

  describe('Compliance Rejection', () => {
    it('should return 422 when compliance check fails', async () => {
      mockEscrowService.createEscrow.rejects(
        new Error('Compliance check failed: High-risk jurisdiction; OFAC sanctions match'),
      );

      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: 10000,
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(422);

      expect(res.body.error).to.equal('Escrow Creation Failed');
      expect(res.body.message).to.include('Compliance');
    });
  });

  describe('Validation Errors', () => {
    it('should reject escrow with missing required fields', async () => {
      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      expect(res.body.details).to.be.an('array');
      expect(res.body.details.length).to.be.greaterThan(0);
    });

    it('should reject escrow with invalid wallet address format', async () => {
      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: 'not-a-valid-wallet!!',
          recipientWallet: testRecipientWallet,
          amount: 10000,
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      const walletError = res.body.details.find((d: any) => d.path === 'payerWallet');
      expect(walletError).to.exist;
    });

    it('should reject escrow with amount below minimum', async () => {
      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: 0.5,
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      const amountError = res.body.details.find((d: any) => d.path === 'amount');
      expect(amountError).to.exist;
    });

    it('should reject escrow with amount above maximum', async () => {
      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testRecipientWallet,
          amount: 999999999,
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
    });

    it('should reject escrow where payer and recipient are the same', async () => {
      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          payerWallet: testPayerWallet,
          recipientWallet: testPayerWallet,
          amount: 10000,
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
    });

    it('should reject deposit with invalid txSignature format', async () => {
      const res = await request
        .post(`/api/v1/institution-escrow/${testEscrowId}/deposit`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ txSignature: '!!invalid!!' })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
    });

    it('should reject list with invalid status filter', async () => {
      const res = await request
        .get('/api/v1/institution-escrow?status=INVALID_STATUS')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
    });
  });

  describe('Get Escrow Error Handling', () => {
    it('should return 404 for non-existent escrow', async () => {
      const missingId = '880e8400-e29b-41d4-a716-446655440099';

      mockEscrowService.getEscrow.rejects(
        new Error(`Escrow not found: ${missingId}`),
      );

      const res = await request
        .get(`/api/v1/institution-escrow/${missingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).to.equal('Not Found');
      expect(res.body.message).to.include('not found');
    });

    it('should return 403 when accessing another client escrow', async () => {
      mockEscrowService.getEscrow.rejects(
        new Error('Access denied: escrow belongs to another client'),
      );

      const res = await request
        .get(`/api/v1/institution-escrow/${testEscrowId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(res.body.error).to.equal('Not Found');
      expect(res.body.message).to.include('Access denied');
    });
  });
});
