import { expect } from 'chai';
import request from 'supertest';
import sinon from 'sinon';
import { Application } from 'express';
import { createTestApp } from '../helpers/test-app';
import * as agreementService from '../../src/services/agreement.service';
import { testAgreements, testCreateAgreementDTO } from '../fixtures/test-data';
import { AgreementStatus } from '../../src/generated/prisma';
import { generateTestSolanaAddress } from '../helpers/test-utils';

describe('Agreement API - Integration Tests', () => {
  let app: Application;
  let createAgreementStub: sinon.SinonStub;
  let getAgreementDetailByIdStub: sinon.SinonStub;
  let listAgreementsStub: sinon.SinonStub;
  let cancelAgreementStub: sinon.SinonStub;

  beforeEach(() => {
    app = createTestApp();
    
    // Stub agreement service methods
    createAgreementStub = sinon.stub(agreementService, 'createAgreement');
    getAgreementDetailByIdStub = sinon.stub(agreementService, 'getAgreementDetailById');
    listAgreementsStub = sinon.stub(agreementService, 'listAgreements');
    cancelAgreementStub = sinon.stub(agreementService, 'cancelAgreement');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('GET /', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).to.have.property('message');
      expect(response.body).to.have.property('version');
      expect(response.body).to.have.property('endpoints');
      expect(response.body.endpoints).to.have.property('agreements');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).to.have.property('status', 'healthy');
      expect(response.body).to.have.property('timestamp');
    });
  });

  describe('POST /v1/agreements', () => {
    it('should create a new agreement with valid data', async () => {
      const mockResponse = {
        agreementId: 'TEST-AGR-NEW',
        escrowPda: generateTestSolanaAddress(),
        depositAddresses: {
          usdc: generateTestSolanaAddress(),
          nft: generateTestSolanaAddress(),
        },
        expiry: testCreateAgreementDTO.valid.expiry,
        transactionId: 'TEST_TX_NEW',
      };

      createAgreementStub.resolves(mockResponse);

      const response = await request(app)
        .post('/v1/agreements')
        .set('Idempotency-Key', `test-${Date.now()}`)
        .send(testCreateAgreementDTO.valid)
        .expect(201);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('data');
      expect(response.body.data).to.have.property('agreementId');
      expect(response.body.data).to.have.property('escrowPda');
      expect(response.body.data).to.have.property('depositAddresses');
      expect(createAgreementStub.calledOnce).to.be.true;
    });

    it('should reject agreement with negative price', async () => {
      const response = await request(app)
        .post('/v1/agreements')
        .send(testCreateAgreementDTO.invalidPrice);

      // Validation middleware should catch this
      expect(response.status).to.be.oneOf([400, 500]);
    });

    it('should reject agreement with expired date', async () => {
      const response = await request(app)
        .post('/v1/agreements')
        .send(testCreateAgreementDTO.expiredDate);

      expect(response.status).to.be.oneOf([400, 500]);
    });

    it('should handle server errors gracefully', async () => {
      createAgreementStub.rejects(new Error('Database connection failed'));

      const response = await request(app)
        .post('/v1/agreements')
        .set('Idempotency-Key', `test-error-${Date.now()}`)
        .send(testCreateAgreementDTO.valid)
        .expect(500);

      expect(response.body).to.have.property('success', false);
      expect(response.body).to.have.property('error');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/v1/agreements')
        .send({
          // Missing required fields
          price: '100.00',
        });

      expect(response.status).to.be.oneOf([400, 500]);
    });
  });

  describe('GET /v1/agreements/:agreementId', () => {
    it('should return agreement details by ID', async () => {
      const mockAgreement = {
        ...testAgreements.pending,
        deposits: [],
        balances: {
          usdcLocked: false,
          nftLocked: false,
        },
        isExpired: false,
        canBeCancelled: false,
      };

      getAgreementDetailByIdStub.resolves(mockAgreement);

      const response = await request(app)
        .get(`/v1/agreements/${testAgreements.pending.agreementId}`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('data');
      expect(response.body.data).to.have.property('agreementId', testAgreements.pending.agreementId);
      expect(response.body.data).to.have.property('deposits');
      expect(response.body.data).to.have.property('balances');
    });

    it('should return 404 for non-existent agreement', async () => {
      getAgreementDetailByIdStub.resolves(null);

      const response = await request(app)
        .get('/v1/agreements/NON_EXISTENT_ID')
        .expect(404);

      expect(response.body).to.have.property('success', false);
      expect(response.body).to.have.property('error', 'Not Found');
    });

    it('should handle server errors', async () => {
      getAgreementDetailByIdStub.rejects(new Error('Database error'));

      const response = await request(app)
        .get(`/v1/agreements/${testAgreements.pending.agreementId}`)
        .expect(500);

      expect(response.body).to.have.property('success', false);
    });
  });

  describe('GET /v1/agreements', () => {
    it('should list all agreements', async () => {
      const mockResponse = {
        agreements: [testAgreements.pending, testAgreements.usdcLocked],
        total: 2,
        page: 1,
        limit: 20,
      };

      listAgreementsStub.resolves(mockResponse);

      const response = await request(app)
        .get('/v1/agreements')
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('data');
      expect(response.body).to.have.property('pagination');
      expect(response.body.data).to.be.an('array');
      expect(response.body.pagination).to.have.property('total', 2);
    });

    it('should filter agreements by status', async () => {
      const mockResponse = {
        agreements: [testAgreements.settled],
        total: 1,
        page: 1,
        limit: 20,
      };

      listAgreementsStub.resolves(mockResponse);

      const response = await request(app)
        .get('/v1/agreements?status=SETTLED')
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.be.an('array');
      expect(listAgreementsStub.calledOnce).to.be.true;
    });

    it('should support pagination', async () => {
      const mockResponse = {
        agreements: [],
        total: 100,
        page: 2,
        limit: 10,
      };

      listAgreementsStub.resolves(mockResponse);

      const response = await request(app)
        .get('/v1/agreements?page=2&limit=10')
        .expect(200);

      expect(response.body.pagination).to.have.property('page', 2);
      expect(response.body.pagination).to.have.property('limit', 10);
      expect(response.body.pagination).to.have.property('pages', 10);
    });
  });

  describe('POST /v1/agreements/:agreementId/cancel', () => {
    it('should cancel an expired agreement', async () => {
      const mockResponse = {
        agreementId: testAgreements.expired.agreementId,
        status: AgreementStatus.CANCELLED,
        cancelledAt: new Date().toISOString(),
        message: 'Agreement cancelled successfully',
      };

      cancelAgreementStub.resolves(mockResponse);

      const response = await request(app)
        .post(`/v1/agreements/${testAgreements.expired.agreementId}/cancel`)
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('status', AgreementStatus.CANCELLED);
    });

    it('should reject cancelling non-expired agreement', async () => {
      cancelAgreementStub.rejects(new Error('Agreement has not expired yet'));

      const response = await request(app)
        .post(`/v1/agreements/${testAgreements.pending.agreementId}/cancel`)
        .expect(400);

      expect(response.body).to.have.property('success', false);
      expect(response.body).to.have.property('error', 'Bad Request');
    });

    it('should reject cancelling already settled agreement', async () => {
      cancelAgreementStub.rejects(new Error('Cannot cancel a settled agreement'));

      const response = await request(app)
        .post(`/v1/agreements/${testAgreements.settled.agreementId}/cancel`)
        .expect(400);

      expect(response.body).to.have.property('success', false);
    });

    it('should return 404 for non-existent agreement', async () => {
      cancelAgreementStub.rejects(new Error('Agreement not found'));

      const response = await request(app)
        .post('/v1/agreements/NON_EXISTENT_ID/cancel')
        .expect(404);

      expect(response.body).to.have.property('success', false);
      expect(response.body).to.have.property('error', 'Not Found');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown/route')
        .expect(404);

      expect(response.body).to.have.property('error', 'Not Found');
      expect(response.body).to.have.property('message');
    });

    it('should return 404 for unsupported HTTP methods', async () => {
      const response = await request(app)
        .patch('/v1/agreements')
        .expect(404);

      expect(response.body).to.have.property('error', 'Not Found');
    });
  });
});

