/**
 * Integration Tests: Institution Client Isolation (Multi-Tenant)
 *
 * Tests that data is properly isolated between clients:
 * - Client A creates escrow
 * - Client B tries to GET Client A's escrow -> 403/404
 * - Client B tries to cancel Client A's escrow -> 403/404
 * - Client A lists escrows -> only sees their own
 * - Client B uploads file -> Client A can't access it
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon, { SinonSandbox } from 'sinon';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

import * as escrowServiceModule from '../../../src/services/institution-escrow.service';
import * as fileServiceModule from '../../../src/services/institution-file.service';

const JWT_SECRET = 'test-jwt-secret-for-client-isolation';
const SETTLEMENT_KEY = 'test-settlement-authority-key-isolation';

/**
 * Create a fresh test app by clearing route module caches.
 * This resets the in-memory rate limiter state between tests.
 */
function createTestApp() {
  const escrowRoutePath = require.resolve('../../../src/routes/institution-escrow.routes');
  delete require.cache[escrowRoutePath];
  const institutionEscrowRoutes = require('../../../src/routes/institution-escrow.routes').default;

  const fileRoutePath = require.resolve('../../../src/routes/institution-files.routes');
  delete require.cache[fileRoutePath];
  const institutionFileRoutes = require('../../../src/routes/institution-files.routes').default;

  const app = express();
  app.use(express.json());
  app.set('trust proxy', 1);
  app.use(institutionEscrowRoutes);
  app.use(institutionFileRoutes);
  return app;
}

function generateTestToken(
  payload: { clientId: string; email: string; tier: string },
  expiresIn = '15m',
): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

describe('Institution Client Isolation - Integration Tests', function () {
  this.timeout(10000);

  let sandbox: SinonSandbox;
  let app: express.Express;
  let request: supertest.Agent;
  let mockEscrowService: sinon.SinonStubbedInstance<escrowServiceModule.InstitutionEscrowService>;
  let mockFileService: any;

  // Two separate clients
  const clientA = {
    clientId: 'client-uuid-isolation-AAA',
    email: 'clientA@institution.com',
    tier: 'STANDARD',
  };
  const clientB = {
    clientId: 'client-uuid-isolation-BBB',
    email: 'clientB@institution.com',
    tier: 'STANDARD',
  };

  const escrowIdA = 'bb0e8400-e29b-41d4-a716-446655440aaa';
  const escrowIdB = 'bb0e8400-e29b-41d4-a716-446655440bbb';
  const fileIdA = 'file-uuid-aaa-111';
  const fileIdB = 'file-uuid-bbb-222';

  let tokenA: string;
  let tokenB: string;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.SETTLEMENT_AUTHORITY_API_KEY = SETTLEMENT_KEY;

    mockEscrowService = sandbox.createStubInstance(escrowServiceModule.InstitutionEscrowService);
    sandbox.stub(escrowServiceModule, 'getInstitutionEscrowService').returns(mockEscrowService as any);

    // Create a mock file service manually since it has complex constructor deps
    mockFileService = {
      uploadFile: sandbox.stub(),
      getFileUrl: sandbox.stub(),
      listFiles: sandbox.stub(),
      deleteFile: sandbox.stub(),
      getFileBuffer: sandbox.stub(),
    };
    sandbox.stub(fileServiceModule, 'getInstitutionFileService').returns(mockFileService as any);

    tokenA = generateTestToken(clientA);
    tokenB = generateTestToken(clientB);

    app = createTestApp();
    request = supertest(app);
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.JWT_SECRET;
    delete process.env.SETTLEMENT_AUTHORITY_API_KEY;
  });

  describe('Escrow Isolation: Client B Cannot Access Client A Escrows', () => {
    it('should allow Client A to create an escrow', async () => {
      mockEscrowService.createEscrow.resolves({
        escrow: {
          escrowId: escrowIdA,
          clientId: clientA.clientId,
          payerWallet: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV8',
          recipientWallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          amount: 50000,
          corridor: 'SG-CH',
          status: 'CREATED',
        },
        complianceResult: { passed: true, riskScore: 10, flags: [] },
      });

      const res = await request
        .post('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          payerWallet: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV8',
          recipientWallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          amount: 50000,
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
        })
        .expect(201);

      expect(res.body.success).to.be.true;
      expect(res.body.data.escrow.clientId).to.equal(clientA.clientId);

      // Verify the createEscrow was called with clientA's ID
      expect(mockEscrowService.createEscrow.firstCall.args[0].clientId).to.equal(clientA.clientId);
    });

    it('should return 403 when Client B tries to GET Client A escrow', async () => {
      mockEscrowService.getEscrow.rejects(
        new Error('Access denied: escrow belongs to another client'),
      );

      const res = await request
        .get(`/api/v1/institution-escrow/${escrowIdA}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(403);

      expect(res.body.message).to.include('Access denied');

      // Verify service was called with Client B's ID
      expect(mockEscrowService.getEscrow.calledOnceWith(clientB.clientId, escrowIdA)).to.be.true;
    });

    it('should return 404 when Client B tries to GET Client A escrow (not found variant)', async () => {
      mockEscrowService.getEscrow.rejects(
        new Error(`Escrow not found: ${escrowIdA}`),
      );

      const res = await request
        .get(`/api/v1/institution-escrow/${escrowIdA}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      expect(res.body.message).to.include('not found');
    });

    it('should reject when Client B tries to cancel Client A escrow', async () => {
      mockEscrowService.cancelEscrow.rejects(
        new Error('Access denied: escrow belongs to another client'),
      );

      const res = await request
        .post(`/api/v1/institution-escrow/${escrowIdA}/cancel`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ reason: 'Unauthorized cancel attempt' })
        .expect(400);

      expect(res.body.error).to.equal('Cancellation Failed');

      // Verify the service was called with Client B's ID
      expect(mockEscrowService.cancelEscrow.calledOnceWith(clientB.clientId, escrowIdA, 'Unauthorized cancel attempt')).to.be.true;
    });

    it('should reject when Client B tries to record deposit on Client A escrow', async () => {
      mockEscrowService.recordDeposit.rejects(
        new Error('Access denied: escrow belongs to another client'),
      );

      const res = await request
        .post(`/api/v1/institution-escrow/${escrowIdA}/deposit`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ txSignature: '5VERv8NMhVRxQktDHzaKyh3oGT3Y7tptMFjFqgTb' })
        .expect(400);

      expect(res.body.error).to.equal('Deposit Recording Failed');
      expect(mockEscrowService.recordDeposit.firstCall.args[0]).to.equal(clientB.clientId);
    });
  });

  describe('Escrow Listing Isolation', () => {
    it('Client A should only see their own escrows when listing', async () => {
      mockEscrowService.listEscrows.resolves({
        escrows: [
          {
            escrowId: escrowIdA,
            clientId: clientA.clientId,
            status: 'CREATED',
            amount: 50000,
            corridor: 'SG-CH',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const res = await request
        .get('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.escrows).to.have.length(1);
      expect(res.body.data.escrows[0].clientId).to.equal(clientA.clientId);

      // Verify the list was filtered by clientA's ID
      expect(mockEscrowService.listEscrows.firstCall.args[0].clientId).to.equal(clientA.clientId);
    });

    it('Client B should only see their own escrows when listing', async () => {
      mockEscrowService.listEscrows.resolves({
        escrows: [
          {
            escrowId: escrowIdB,
            clientId: clientB.clientId,
            status: 'FUNDED',
            amount: 30000,
            corridor: 'US-UK',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const res = await request
        .get('/api/v1/institution-escrow')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.escrows).to.have.length(1);
      expect(res.body.data.escrows[0].clientId).to.equal(clientB.clientId);

      // Verify the list was filtered by clientB's ID
      expect(mockEscrowService.listEscrows.firstCall.args[0].clientId).to.equal(clientB.clientId);
    });

    it('should never leak escrow data across clients in listing', async () => {
      // Simulate that Client A has 2 escrows and Client B has 1
      mockEscrowService.listEscrows.callsFake(async (params) => {
        if (params.clientId === clientA.clientId) {
          return {
            escrows: [
              { escrowId: 'esc-a-1', clientId: clientA.clientId, status: 'CREATED' },
              { escrowId: 'esc-a-2', clientId: clientA.clientId, status: 'FUNDED' },
            ],
            total: 2,
            limit: 20,
            offset: 0,
          };
        } else {
          return {
            escrows: [
              { escrowId: 'esc-b-1', clientId: clientB.clientId, status: 'RELEASED' },
            ],
            total: 1,
            limit: 20,
            offset: 0,
          };
        }
      });

      const [resA, resB] = await Promise.all([
        request
          .get('/api/v1/institution-escrow')
          .set('Authorization', `Bearer ${tokenA}`),
        request
          .get('/api/v1/institution-escrow')
          .set('Authorization', `Bearer ${tokenB}`),
      ]);

      // Client A sees 2 escrows
      expect(resA.body.data.escrows).to.have.length(2);
      resA.body.data.escrows.forEach((e: any) => {
        expect(e.clientId).to.equal(clientA.clientId);
      });

      // Client B sees 1 escrow
      expect(resB.body.data.escrows).to.have.length(1);
      resB.body.data.escrows.forEach((e: any) => {
        expect(e.clientId).to.equal(clientB.clientId);
      });
    });
  });

  describe('File Isolation: Cross-Client File Access', () => {
    it('should allow Client B to list only their own files', async () => {
      mockFileService.listFiles.resolves([
        {
          id: fileIdB,
          clientId: clientB.clientId,
          fileName: 'invoice-b.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          documentType: 'INVOICE',
          uploadedAt: new Date(),
        },
      ]);

      const res = await request
        .get('/api/v1/institution/files')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data).to.have.length(1);
      expect(res.body.data[0].clientId).to.equal(clientB.clientId);

      // Verify listFiles was called with Client B's ID
      expect(mockFileService.listFiles.calledOnceWith(clientB.clientId, undefined)).to.be.true;
    });

    it('should reject when Client A tries to access Client B file URL', async () => {
      mockFileService.getFileUrl.rejects(
        new Error('Unauthorized: file does not belong to this client'),
      );

      const res = await request
        .get(`/api/v1/institution/files/${fileIdB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);

      expect(res.body.error).to.equal('File Not Found');
      expect(res.body.message).to.include('does not belong');

      // Verify service received Client A's ID (not B's)
      expect(mockFileService.getFileUrl.calledOnceWith(fileIdB, clientA.clientId)).to.be.true;
    });

    it('should reject when Client A tries to delete Client B file', async () => {
      mockFileService.deleteFile.rejects(
        new Error('Unauthorized: file does not belong to this client'),
      );

      const res = await request
        .delete(`/api/v1/institution/files/${fileIdB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);

      expect(res.body.error).to.equal('Delete Failed');
      expect(res.body.message).to.include('does not belong');

      // Verify service received Client A's ID
      expect(mockFileService.deleteFile.calledOnceWith(fileIdB, clientA.clientId)).to.be.true;
    });

    it('should return 404 when Client A requests non-existent file', async () => {
      mockFileService.getFileUrl.rejects(
        new Error('File not found'),
      );

      const res = await request
        .get(`/api/v1/institution/files/nonexistent-file-id`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      expect(res.body.error).to.equal('File Not Found');
      expect(res.body.message).to.include('not found');
    });
  });

  describe('Release Isolation with Settlement Authority', () => {
    it('should reject when Client B tries to release Client A escrow even with valid settlement key', async () => {
      mockEscrowService.releaseFunds.rejects(
        new Error('Access denied: escrow belongs to another client'),
      );

      const res = await request
        .post(`/api/v1/institution-escrow/${escrowIdA}/release`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Settlement-Authority-Key', SETTLEMENT_KEY)
        .send({ notes: 'Unauthorized release by Client B' })
        .expect(400);

      expect(res.body.error).to.equal('Release Failed');

      // Verify the release service was called with Client B's ID (from JWT)
      expect(mockEscrowService.releaseFunds.firstCall.args[0]).to.equal(clientB.clientId);
    });
  });

  describe('Token Isolation', () => {
    it('should extract correct clientId from each token', async () => {
      // Both clients list escrows concurrently
      mockEscrowService.listEscrows.resolves({
        escrows: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      await Promise.all([
        request
          .get('/api/v1/institution-escrow')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200),
        request
          .get('/api/v1/institution-escrow')
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(200),
      ]);

      // Verify each call used the correct clientId
      const calls = mockEscrowService.listEscrows.getCalls();
      const clientIds = calls.map(c => c.args[0].clientId);
      expect(clientIds).to.include(clientA.clientId);
      expect(clientIds).to.include(clientB.clientId);
    });
  });
});
