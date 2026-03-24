/**
 * Unit Tests for AiAnalysisService
 *
 * Tests AI analysis pipeline:
 * - analyzeDocument: rate limiting, caching, file validation
 * - analyzeEscrow: escrow-level AI analysis, caching, dedup
 * - analyzeClient: client profile AI analysis, caching
 * - anonymizePii: email, account number masking
 * - getAnalysisResults / getEscrowAnalysis / getClientAnalysis: access control, retrieval
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { AiAnalysisService, AnalyzeDocumentParams, EscrowAnalysisResult } from '../../../src/services/ai-analysis.service';
import { evaluateEscrow, EscrowData } from '../../../src/services/escrow-rules-engine';

describe('AiAnalysisService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: AiAnalysisService;
  let prismaStub: any;
  let redisStub: any;

  const CLIENT_ID = 'client-123';
  const ESCROW_ID = 'escrow-456';
  const FILE_ID = 'file-789';

  const makeAnalysis = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    escrowId: ESCROW_ID,
    fileId: FILE_ID,
    documentHash: 'abc123hash',
    riskScore: 25,
    extractedFields: { document_type: 'invoice', total_amount: 5000 },
    factors: [{ name: 'document_validity', weight: 0.5, value: 20 }],
    recommendation: 'APPROVE',
    model: 'claude-sonnet-4-20250514',
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub Redis
    redisStub = {
      get: sandbox.stub().resolves(null),
      set: sandbox.stub().resolves('OK'),
      incr: sandbox.stub().resolves(1),
      expire: sandbox.stub().resolves(1),
    };

    // Stub Prisma
    prismaStub = {
      institutionFile: {
        findFirst: sandbox.stub().resolves({
          id: FILE_ID,
          clientId: CLIENT_ID,
          fileKey: 'uploads/test.pdf',
          mimeType: 'application/pdf',
        }),
      },
      institutionAiAnalysis: {
        findFirst: sandbox.stub().resolves(null),
        findMany: sandbox.stub().resolves([makeAnalysis()]),
        create: sandbox.stub().resolves(makeAnalysis()),
      },
      institutionEscrow: {
        findFirst: sandbox.stub().resolves({
          escrowId: ESCROW_ID,
          escrowCode: 'EE-TST-001',
          clientId: CLIENT_ID,
          amount: 1000,
          platformFee: 5,
          usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
          settlementAuthority: 'settlement-auth',
          status: 'CREATED',
          riskScore: 25,
          payerWallet: 'payer-wallet-123',
          recipientWallet: 'recipient-wallet-456',
          depositTxSignature: null,
          escrowPda: null,
          nonceAccount: null,
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          fundedAt: null,
          resolvedAt: null,
          deposits: [],
          files: [],
          client: {
            companyName: 'Test Corp',
            legalName: 'Test Corporation Ltd',
            country: 'SG',
            industry: 'Technology',
            tier: 'STANDARD',
            kycStatus: 'VERIFIED',
            kybStatus: 'VERIFIED',
            riskRating: 'LOW',
            entityType: 'CORPORATION',
          },
        }),
      },
      institutionCorridor: {
        findMany: sandbox.stub().resolves([]),
      },
      institutionClient: {
        findUnique: sandbox.stub().resolves({
          id: CLIENT_ID,
          companyName: 'Test Corp',
          legalName: 'Test Corporation Ltd',
          tradingName: null,
          entityType: 'CORPORATION',
          country: 'SG',
          industry: 'Technology',
          tier: 'STANDARD',
          status: 'ACTIVE',
          kycStatus: 'VERIFIED',
          kybStatus: 'VERIFIED',
          riskRating: 'LOW',
          sanctionsStatus: 'CLEAR',
          isRegulatedEntity: false,
          regulatoryStatus: null,
          licenseType: null,
          yearEstablished: 2020,
          employeeCountRange: '11_50',
          annualRevenueRange: '1M_10M',
          walletCustodyType: 'SELF_CUSTODY',
          preferredSettlementChain: 'SOLANA',
          onboardingCompletedAt: new Date(),
          createdAt: new Date(Date.now() - 90 * 86400000),
          wallets: [
            { id: 'w1', chain: 'SOLANA', isPrimary: true, isSettlement: false },
            { id: 'w2', chain: 'SOLANA', isPrimary: false, isSettlement: true },
          ],
          escrows: [
            { escrowId: 'e1', status: 'RELEASED', amount: 500, corridor: 'SG-CH', createdAt: new Date() },
            { escrowId: 'e2', status: 'CREATED', amount: 1000, corridor: 'US-MX', createdAt: new Date() },
          ],
        }),
      },
    };

    // Create service and inject stubs
    service = new AiAnalysisService();
    (service as any).prisma = prismaStub;

    // Stub the redis module
    const redisModule = require('../../../src/config/redis');
    sandbox.stub(redisModule, 'redisClient').value(redisStub);
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── analyzeDocument ────────────────────────────────────────

  describe('analyzeDocument', () => {
    it('should enforce rate limit check', async () => {
      // Set rate limit to exceeded (> 5)
      redisStub.incr.resolves(6);

      const params: AnalyzeDocumentParams = {
        escrowId: ESCROW_ID,
        fileId: FILE_ID,
        clientId: CLIENT_ID,
      };

      try {
        await service.analyzeDocument(params);
        expect.fail('Should have thrown rate limit error');
      } catch (err: any) {
        expect(err.message).to.include('rate limit exceeded');
        expect(err.message).to.include('Maximum 5 requests per minute');
      }
    });

    it('should return cached result when available', async () => {
      const cachedResult = {
        riskScore: 25,
        extractedFields: { document_type: 'invoice' },
        factors: [{ name: 'test', weight: 0.5, value: 20 }],
        recommendation: 'APPROVE',
        details: 'Cached analysis',
      };

      redisStub.get.resolves(JSON.stringify(cachedResult));

      const params: AnalyzeDocumentParams = {
        escrowId: ESCROW_ID,
        fileId: FILE_ID,
        clientId: CLIENT_ID,
      };

      const result = await service.analyzeDocument(params);

      expect(result).to.deep.equal(cachedResult);
      // Should NOT have called Prisma for file or analysis
      expect(prismaStub.institutionFile.findFirst.called).to.be.false;
    });
  });

  // ─── anonymizePii ──────────────────────────────────────────

  describe('anonymizePii', () => {
    it('should mask email addresses', () => {
      const text = 'Contact us at john.doe@example.com for details.';

      // Access private method
      const result = (service as any).anonymizePii(text);

      expect(result.anonymizedText).to.not.include('john.doe@example.com');
      expect(result.anonymizedText).to.include('[EMAIL_');
      expect(result.piiMap.size).to.be.greaterThan(0);

      // Verify the original email is in the piiMap
      const emails = Array.from(result.piiMap.values()) as string[];
      expect(emails).to.include('john.doe@example.com');
    });

    it('should mask account numbers (8-20 digit sequences)', () => {
      // Use a digit sequence that won't be consumed by the phone regex first.
      // The service applies phone regex before account regex, so long digit
      // strings may end up tagged as PHONE or ACCOUNT depending on length.
      // Either way, the raw digits must not appear in the output.
      const text = 'Bank account: 12345678901234 for wire transfer.';

      const result = (service as any).anonymizePii(text);

      // The raw digit sequence should be masked regardless of which tag wins
      expect(result.anonymizedText).to.not.include('12345678901234');
      // It should contain some PII placeholder
      expect(result.piiMap.size).to.be.greaterThan(0);
    });

    it('should mask multiple emails', () => {
      const text = 'From alice@corp.com to bob@bank.org about the shipment.';

      const result = (service as any).anonymizePii(text);

      expect(result.anonymizedText).to.not.include('alice@corp.com');
      expect(result.anonymizedText).to.not.include('bob@bank.org');

      const emails = Array.from(result.piiMap.values()) as string[];
      expect(emails).to.include('alice@corp.com');
      expect(emails).to.include('bob@bank.org');
    });

    it('should preserve non-PII text', () => {
      const text = 'Invoice #12345 for Widget Supply Co.';

      const result = (service as any).anonymizePii(text);

      expect(result.anonymizedText).to.include('Invoice');
      expect(result.anonymizedText).to.include('Widget Supply Co.');
    });

    it('should mask US postal addresses with ZIP codes', () => {
      const text = 'Ship to: 123 Main Street Suite 200 New York 10001';

      const result = (service as any).anonymizePii(text);

      expect(result.anonymizedText).to.not.include('123 Main Street');
      expect(result.anonymizedText).to.include('[ADDRESS_');
    });

    it('should return empty piiMap when no PII present', () => {
      const text = 'This is a simple document with no personal info.';

      const result = (service as any).anonymizePii(text);

      expect(result.anonymizedText).to.equal(text);
      expect(result.piiMap.size).to.equal(0);
    });

    it('should handle empty text', () => {
      const result = (service as any).anonymizePii('');

      expect(result.anonymizedText).to.equal('');
      expect(result.piiMap.size).to.equal(0);
    });

    it('should mask phone numbers with 7+ digits', () => {
      const text = 'Call us at +1-555-867-5309 for inquiries.';

      const result = (service as any).anonymizePii(text);

      // The raw phone digits should be replaced
      expect(result.anonymizedText).to.not.include('555-867-5309');
    });
  });

  // ─── analyzeDocument - additional scenarios ──────────────────

  describe('analyzeDocument - escrow validation', () => {
    it('should reject when escrow not found', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(null);

      try {
        await service.analyzeDocument({
          escrowId: ESCROW_ID,
          fileId: FILE_ID,
          clientId: 'wrong-client',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Escrow not found or access denied');
      }
    });

    it('should reject unsupported file types for AI analysis', async () => {
      prismaStub.institutionEscrow.findFirst.resolves({
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        amount: 5000,
        corridor: 'US-MX',
        status: 'FUNDED',
        client: { companyName: 'Test Corp' },
      });
      prismaStub.institutionFile.findFirst.resolves({
        id: FILE_ID,
        clientId: CLIENT_ID,
        fileKey: 'uploads/spreadsheet.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      prismaStub.institutionAiAnalysis.findFirst.resolves(null);

      // Stub fetchFileBuffer
      sandbox.stub(service as any, 'fetchFileBuffer').resolves(Buffer.from('xlsx content'));

      try {
        await service.analyzeDocument({
          escrowId: ESCROW_ID,
          fileId: FILE_ID,
          clientId: CLIENT_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('AI analysis does not support');
        expect(err.message).to.include('convert to PDF');
      }
    });

    it('should reject CSV files for AI analysis', async () => {
      prismaStub.institutionEscrow.findFirst.resolves({
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        amount: 5000,
        corridor: 'US-MX',
        status: 'FUNDED',
        client: { companyName: 'Test Corp' },
      });
      prismaStub.institutionFile.findFirst.resolves({
        id: FILE_ID,
        clientId: CLIENT_ID,
        fileKey: 'uploads/data.csv',
        mimeType: 'text/csv',
      });
      prismaStub.institutionAiAnalysis.findFirst.resolves(null);

      sandbox.stub(service as any, 'fetchFileBuffer').resolves(Buffer.from('csv content'));

      try {
        await service.analyzeDocument({
          escrowId: ESCROW_ID,
          fileId: FILE_ID,
          clientId: CLIENT_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('AI analysis does not support');
      }
    });

    it('should return existing analysis for duplicate document hash', async () => {
      prismaStub.institutionEscrow.findFirst.resolves({
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        amount: 5000,
        corridor: 'US-MX',
        status: 'FUNDED',
        client: { companyName: 'Test Corp' },
      });
      prismaStub.institutionFile.findFirst.resolves({
        id: FILE_ID,
        clientId: CLIENT_ID,
        fileKey: 'uploads/test.pdf',
        mimeType: 'application/pdf',
      });

      // Return existing analysis for this document hash
      prismaStub.institutionAiAnalysis.findFirst.resolves({
        riskScore: 20,
        extractedFields: { document_type: 'invoice' },
        factors: [{ name: 'doc_validity', weight: 0.5, value: 20 }],
        recommendation: 'APPROVE',
      });

      sandbox.stub(service as any, 'fetchFileBuffer').resolves(Buffer.from('pdf content'));
      sandbox.stub(service as any, 'extractPdfText').resolves('Invoice text');

      const result = await service.analyzeDocument({
        escrowId: ESCROW_ID,
        fileId: FILE_ID,
        clientId: CLIENT_ID,
      });

      expect(result.riskScore).to.equal(20);
      expect(result.details).to.include('Previously analyzed');
    });

    it('should reject when file not found', async () => {
      prismaStub.institutionEscrow.findFirst.resolves({
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        amount: 5000,
        corridor: 'US-MX',
        status: 'FUNDED',
        client: { companyName: 'Test Corp' },
      });
      prismaStub.institutionFile.findFirst.resolves(null);
      prismaStub.institutionAiAnalysis.findFirst.resolves(null);

      try {
        await service.analyzeDocument({
          escrowId: ESCROW_ID,
          fileId: FILE_ID,
          clientId: CLIENT_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('File not found');
      }
    });
  });

  describe('analyzeDocument - rate limiting', () => {
    it('should allow requests within rate limit', async () => {
      // incr returns 3 (under limit of 5)
      redisStub.incr.resolves(3);

      prismaStub.institutionEscrow.findFirst.resolves({
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        amount: 5000,
        corridor: 'US-MX',
        status: 'FUNDED',
        client: { companyName: 'Test Corp' },
      });

      // Return cached to short-circuit the rest of the pipeline
      redisStub.get.resolves(JSON.stringify({
        riskScore: 25,
        extractedFields: {},
        factors: [],
        recommendation: 'APPROVE',
        details: 'test',
      }));

      const result = await service.analyzeDocument({
        escrowId: ESCROW_ID,
        fileId: FILE_ID,
        clientId: CLIENT_ID,
      });

      expect(result.riskScore).to.equal(25);
    });

    it('should set TTL on first rate limit increment', async () => {
      redisStub.incr.resolves(1);

      // Return cached to short-circuit
      redisStub.get.resolves(JSON.stringify({
        riskScore: 25,
        extractedFields: {},
        factors: [],
        recommendation: 'APPROVE',
        details: 'test',
      }));

      prismaStub.institutionEscrow.findFirst.resolves({
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        client: {},
      });

      await service.analyzeDocument({
        escrowId: ESCROW_ID,
        fileId: FILE_ID,
        clientId: CLIENT_ID,
      });

      expect(redisStub.expire.calledOnce).to.be.true;
      expect(redisStub.expire.firstCall.args[1]).to.equal(60);
    });

    it('should allow request when Redis errors on rate limit check', async () => {
      redisStub.incr.rejects(new Error('Redis connection lost'));

      // Return cached to short-circuit
      redisStub.get.resolves(JSON.stringify({
        riskScore: 25,
        extractedFields: {},
        factors: [],
        recommendation: 'APPROVE',
        details: 'test',
      }));

      prismaStub.institutionEscrow.findFirst.resolves({
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        client: {},
      });

      // Should not throw - Redis failures are non-fatal for rate limiting
      const result = await service.analyzeDocument({
        escrowId: ESCROW_ID,
        fileId: FILE_ID,
        clientId: CLIENT_ID,
      });

      expect(result).to.have.property('riskScore');
    });
  });

  // ─── getAnalysisResults ────────────────────────────────────

  describe('getAnalysisResults', () => {
    it('should return results for valid escrow', async () => {
      const results = await service.getAnalysisResults(ESCROW_ID, CLIENT_ID);

      expect(results).to.be.an('array');
      expect(results).to.have.length(1);
      expect(results[0]).to.have.property('riskScore', 25);
      expect(results[0]).to.have.property('recommendation', 'APPROVE');
      expect(results[0]).to.have.property('extractedFields');
      expect(results[0]).to.have.property('factors');
    });

    it('should reject access to other client escrow', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(null);

      try {
        await service.getAnalysisResults(ESCROW_ID, 'wrong-client');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Escrow not found or access denied');
      }
    });

    it('should return empty array when no analyses exist', async () => {
      prismaStub.institutionAiAnalysis.findMany.resolves([]);

      const results = await service.getAnalysisResults(ESCROW_ID, CLIENT_ID);

      expect(results).to.be.an('array').that.is.empty;
    });

    it('should return multiple analyses ordered by date', async () => {
      prismaStub.institutionAiAnalysis.findMany.resolves([
        makeAnalysis({ riskScore: 30, recommendation: 'REVIEW' }),
        makeAnalysis({ riskScore: 15, recommendation: 'APPROVE' }),
      ]);

      const results = await service.getAnalysisResults(ESCROW_ID, CLIENT_ID);

      expect(results).to.have.length(2);
      expect(results[0].riskScore).to.equal(30);
      expect(results[1].riskScore).to.equal(15);
    });
  });

  // ─── analyzeEscrow ──────────────────────────────────────────

  describe('analyzeEscrow', () => {
    it('should reject when escrow not found', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(null);

      try {
        await service.analyzeEscrow(ESCROW_ID, CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Escrow not found');
      }
    });

    it('should enforce rate limit', async () => {
      redisStub.incr.resolves(6);

      try {
        await service.analyzeEscrow(ESCROW_ID, CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('rate limit exceeded');
      }
    });

    it('should return cached result when available', async () => {
      const cachedResult = {
        riskScore: 20,
        extractedFields: { escrow_status: 'CREATED' },
        factors: [{ name: 'corridor_risk', weight: 0.5, value: 15 }],
        recommendation: 'APPROVE',
        details: 'Cached',
        summary: 'Low risk escrow',
      };

      redisStub.get.resolves(JSON.stringify(cachedResult));

      const result = await service.analyzeEscrow(ESCROW_ID, CLIENT_ID);

      expect(result).to.deep.equal(cachedResult);
      // Should not have queried for existing analysis
      expect(prismaStub.institutionAiAnalysis.findFirst.called).to.be.false;
    });

    it('should return existing analysis if escrow status unchanged', async () => {
      const existingAnalysis = makeAnalysis({
        analysisType: 'ESCROW',
        extractedFields: { escrow_status: 'CREATED' },
        summary: 'Previous analysis',
      });

      prismaStub.institutionAiAnalysis.findFirst.resolves(existingAnalysis);

      const result = await service.analyzeEscrow(ESCROW_ID, CLIENT_ID);

      expect(result.riskScore).to.equal(25);
      expect(result.details).to.include('Previously analyzed');
    });

    it('should call Claude API when no existing analysis', async () => {
      // No existing analysis
      prismaStub.institutionAiAnalysis.findFirst.resolves(null);

      // Stub the Anthropic client
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            risk_score: 15,
            recommendation: 'APPROVE',
            summary: 'Low risk standard escrow transaction.',
            extracted_fields: { escrow_status: 'CREATED', amount_usd: 1000 },
            factors: [{ name: 'corridor_risk', weight: 0.3, value: 10 }],
            details: 'SG-CH corridor is low risk',
          }),
        }],
      };

      const anthropicStub = {
        messages: { create: sandbox.stub().resolves(mockResponse) },
      };
      (service as any).anthropic = anthropicStub;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const result = await service.analyzeEscrow(ESCROW_ID, CLIENT_ID);

      expect(result.riskScore).to.equal(15);
      expect(result.recommendation).to.equal('APPROVE');
      expect(result.summary).to.include('Low risk');
      expect(prismaStub.institutionAiAnalysis.create.calledOnce).to.be.true;

      // Verify it was stored with ESCROW type
      const createArgs = prismaStub.institutionAiAnalysis.create.firstCall.args[0];
      expect(createArgs.data.analysisType).to.equal('ESCROW');
      expect(createArgs.data.escrowId).to.equal(ESCROW_ID);
      expect(createArgs.data.clientId).to.equal(CLIENT_ID);

      delete process.env.ANTHROPIC_API_KEY;
    });
  });

  // ─── getEscrowAnalysis ──────────────────────────────────────

  describe('getEscrowAnalysis', () => {
    it('should reject when escrow not found', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(null);

      try {
        await service.getEscrowAnalysis(ESCROW_ID, 'wrong-client');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Escrow not found');
      }
    });

    it('should return escrow analyses filtered by ESCROW type', async () => {
      prismaStub.institutionAiAnalysis.findMany.resolves([
        makeAnalysis({ riskScore: 20, recommendation: 'APPROVE', summary: 'Good' }),
      ]);

      const results = await service.getEscrowAnalysis(ESCROW_ID, CLIENT_ID);

      expect(results).to.have.length(1);
      expect(results[0].riskScore).to.equal(20);
      expect(results[0]).to.have.property('summary');

      // Verify the query filtered by analysisType
      const queryArgs = prismaStub.institutionAiAnalysis.findMany.firstCall.args[0];
      expect(queryArgs.where.analysisType).to.equal('ESCROW');
    });

    it('should return empty array when no escrow analyses exist', async () => {
      prismaStub.institutionAiAnalysis.findMany.resolves([]);

      const results = await service.getEscrowAnalysis(ESCROW_ID, CLIENT_ID);

      expect(results).to.be.an('array').that.is.empty;
    });
  });

  // ─── analyzeClient ─────────────────────────────────────────

  describe('analyzeClient', () => {
    it('should reject when client not found', async () => {
      prismaStub.institutionClient.findUnique.resolves(null);

      try {
        await service.analyzeClient(CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Client not found');
      }
    });

    it('should enforce rate limit', async () => {
      redisStub.incr.resolves(6);

      try {
        await service.analyzeClient(CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('rate limit exceeded');
      }
    });

    it('should return cached result when available', async () => {
      const cachedResult = {
        riskScore: 10,
        extractedFields: { company_name: 'Test Corp' },
        factors: [{ name: 'kyc_status', weight: 0.4, value: 5 }],
        recommendation: 'APPROVE',
        details: 'Cached client analysis',
        summary: 'Verified client with good standing',
      };

      redisStub.get.resolves(JSON.stringify(cachedResult));

      const result = await service.analyzeClient(CLIENT_ID);

      expect(result).to.deep.equal(cachedResult);
    });

    it('should call Claude API and store with CLIENT type', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            risk_score: 12,
            recommendation: 'APPROVE',
            summary: 'Well-established institution with verified KYC.',
            extracted_fields: {
              company_name: 'Test Corp',
              entity_type: 'CORPORATION',
              country: 'SG',
              kyc_verified: true,
              kyb_verified: true,
              sanctions_clear: true,
              account_age_days: 90,
            },
            factors: [
              { name: 'kyc_verified', weight: 0.3, value: 5 },
              { name: 'jurisdiction_risk', weight: 0.2, value: 15 },
            ],
            details: 'Singapore-based corporation with clean compliance record',
          }),
        }],
      };

      const anthropicStub = {
        messages: { create: sandbox.stub().resolves(mockResponse) },
      };
      (service as any).anthropic = anthropicStub;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const result = await service.analyzeClient(CLIENT_ID);

      expect(result.riskScore).to.equal(12);
      expect(result.recommendation).to.equal('APPROVE');
      expect(result.summary).to.include('Well-established');
      expect(prismaStub.institutionAiAnalysis.create.calledOnce).to.be.true;

      // Verify stored with CLIENT type and no escrowId
      const createArgs = prismaStub.institutionAiAnalysis.create.firstCall.args[0];
      expect(createArgs.data.analysisType).to.equal('CLIENT');
      expect(createArgs.data.clientId).to.equal(CLIENT_ID);
      expect(createArgs.data.escrowId).to.be.undefined;

      delete process.env.ANTHROPIC_API_KEY;
    });

    it('should handle Claude API parse failure gracefully', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'This is not valid JSON' }],
      };

      const anthropicStub = {
        messages: { create: sandbox.stub().resolves(mockResponse) },
      };
      (service as any).anthropic = anthropicStub;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const result = await service.analyzeClient(CLIENT_ID);

      expect(result.riskScore).to.equal(50);
      expect(result.recommendation).to.equal('REVIEW');
      expect(result.details).to.include('could not be parsed');

      delete process.env.ANTHROPIC_API_KEY;
    });
  });

  // ─── getClientAnalysis ──────────────────────────────────────

  describe('getClientAnalysis', () => {
    it('should return client analyses filtered by CLIENT type', async () => {
      prismaStub.institutionAiAnalysis.findMany.resolves([
        makeAnalysis({ riskScore: 12, recommendation: 'APPROVE', summary: 'Good client' }),
      ]);

      const results = await service.getClientAnalysis(CLIENT_ID);

      expect(results).to.have.length(1);
      expect(results[0].riskScore).to.equal(12);

      const queryArgs = prismaStub.institutionAiAnalysis.findMany.firstCall.args[0];
      expect(queryArgs.where.analysisType).to.equal('CLIENT');
      expect(queryArgs.where.clientId).to.equal(CLIENT_ID);
    });

    it('should return empty array when no client analyses exist', async () => {
      prismaStub.institutionAiAnalysis.findMany.resolves([]);

      const results = await service.getClientAnalysis(CLIENT_ID);

      expect(results).to.be.an('array').that.is.empty;
    });
  });

  // ─── Content-Hash Caching ──────────────────────────────────

  describe('analyzeEscrow - content-hash caching', () => {
    it('should return content-hash cached result when escrow data unchanged', async () => {
      // First call: no hash cache, no id cache, no existing analysis → hits AI
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            risk_score: 15,
            recommendation: 'APPROVE',
            summary: 'Low risk escrow.',
            extracted_fields: { escrow_status: 'CREATED' },
            factors: [{ name: 'corridor_risk', weight: 0.3, value: 10 }],
            details: 'All good',
          }),
        }],
      };

      const anthropicStub = {
        messages: { create: sandbox.stub().resolves(mockResponse) },
      };
      (service as any).anthropic = anthropicStub;
      process.env.ANTHROPIC_API_KEY = 'test-key';
      prismaStub.institutionAiAnalysis.findFirst.resolves(null);

      // Let the first call through with cache misses
      let setCalls = 0;
      redisStub.set.callsFake((...args: any[]) => {
        setCalls++;
        return Promise.resolve('OK');
      });

      await service.analyzeEscrow(ESCROW_ID, CLIENT_ID);

      // Redis.set should have been called for both hash and id keys
      expect(setCalls).to.be.greaterThanOrEqual(2);

      // Now simulate hash cache hit on second call
      const cachedResult = {
        riskScore: 15,
        recommendation: 'APPROVE',
        summary: 'Low risk escrow.',
        extractedFields: { escrow_status: 'CREATED' },
        factors: [{ name: 'corridor_risk', weight: 0.3, value: 10 }],
        details: 'All good',
        model: 'claude-sonnet-4-20250514',
      };

      // Reset redis.get to return hash cache on next call
      redisStub.get.resolves(JSON.stringify(cachedResult));

      const result = await service.analyzeEscrow(ESCROW_ID, CLIENT_ID);

      expect(result.riskScore).to.equal(15);
      // AI should only have been called once (first call)
      expect(anthropicStub.messages.create.calledOnce).to.be.true;

      delete process.env.ANTHROPIC_API_KEY;
    });
  });

  // ─── Model Selection ──────────────────────────────────────

  describe('analyzeEscrow - model selection', () => {
    it('should use Haiku for DRAFT escrows', async () => {
      prismaStub.institutionEscrow.findFirst.resolves({
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        amount: 1000,
        platformFee: 5,
        corridor: null,
        conditionType: null,
        status: 'DRAFT',
        riskScore: null,
        expiresAt: null,
        createdAt: new Date(),
        fundedAt: null,
        resolvedAt: null,
        deposits: [],
        files: [],
        usdcMint: null,
        settlementAuthority: null,
        payerWallet: null,
        recipientWallet: null,
        depositTxSignature: null,
        escrowPda: null,
        nonceAccount: null,
        escrowCode: 'EE-TST-001',
        client: {
          companyName: 'Test Corp',
          legalName: 'Test Corporation Ltd',
          country: 'SG',
          industry: 'Technology',
          tier: 'STANDARD',
          kycStatus: 'VERIFIED',
          kybStatus: 'VERIFIED',
          riskRating: 'LOW',
          entityType: 'CORPORATION',
        },
      });
      prismaStub.institutionAiAnalysis.findFirst.resolves(null);

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            risk_score: 25,
            recommendation: 'REVIEW',
            summary: 'DRAFT escrow with partial data.',
            extracted_fields: { escrow_status: 'DRAFT' },
            factors: [{ name: 'incomplete_data', weight: 0.5, value: 25 }],
            details: 'Partial data',
          }),
        }],
      };

      const anthropicStub = {
        messages: { create: sandbox.stub().resolves(mockResponse) },
      };
      (service as any).anthropic = anthropicStub;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      await service.analyzeEscrow(ESCROW_ID, CLIENT_ID);

      const createArgs = anthropicStub.messages.create.firstCall.args[0];
      expect(createArgs.model).to.equal('claude-haiku-4-5-20251001');
      expect(createArgs.max_tokens).to.equal(2048);

      // Verify stored model
      const dbArgs = prismaStub.institutionAiAnalysis.create.firstCall.args[0];
      expect(dbArgs.data.model).to.equal('claude-haiku-4-5-20251001');

      delete process.env.ANTHROPIC_API_KEY;
    });

    it('should use Sonnet for non-DRAFT escrows', async () => {
      prismaStub.institutionAiAnalysis.findFirst.resolves(null);

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            risk_score: 15,
            recommendation: 'APPROVE',
            summary: 'Low risk.',
            extracted_fields: { escrow_status: 'CREATED' },
            factors: [{ name: 'test', weight: 0.3, value: 10 }],
            details: 'All good',
          }),
        }],
      };

      const anthropicStub = {
        messages: { create: sandbox.stub().resolves(mockResponse) },
      };
      (service as any).anthropic = anthropicStub;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      await service.analyzeEscrow(ESCROW_ID, CLIENT_ID);

      const createArgs = anthropicStub.messages.create.firstCall.args[0];
      expect(createArgs.model).to.equal('claude-sonnet-4-20250514');
      expect(createArgs.max_tokens).to.equal(4096);

      delete process.env.ANTHROPIC_API_KEY;
    });
  });

  // ─── Prompt Caching ──────────────────────────────────────

  describe('analyzeEscrow - prompt caching', () => {
    it('should send system prompt with cache_control', async () => {
      prismaStub.institutionAiAnalysis.findFirst.resolves(null);

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            risk_score: 15,
            recommendation: 'APPROVE',
            summary: 'OK',
            extracted_fields: { escrow_status: 'CREATED' },
            factors: [],
            details: 'OK',
          }),
        }],
      };

      const anthropicStub = {
        messages: { create: sandbox.stub().resolves(mockResponse) },
      };
      (service as any).anthropic = anthropicStub;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      await service.analyzeEscrow(ESCROW_ID, CLIENT_ID);

      const createArgs = anthropicStub.messages.create.firstCall.args[0];
      // system should be an array with cache_control
      expect(createArgs.system).to.be.an('array');
      expect(createArgs.system[0]).to.have.property('type', 'text');
      expect(createArgs.system[0]).to.have.property('cache_control');
      expect(createArgs.system[0].cache_control).to.deep.equal({ type: 'ephemeral' });

      delete process.env.ANTHROPIC_API_KEY;
    });
  });

  // ─── analyzeEscrowFast ──────────────────────────────────

  describe('analyzeEscrowFast', () => {
    it('should return preliminary result without calling AI', async () => {
      const result = await service.analyzeEscrowFast(ESCROW_ID, CLIENT_ID);

      expect(result).to.have.property('tier', 'preliminary');
      expect(result).to.have.property('aiAnalysisAvailable', false);
      expect(result).to.have.property('riskScore');
      expect(result).to.have.property('recommendation');
      expect(result).to.have.property('sections');
      expect(result).to.have.property('summary');
    });

    it('should return full tier when hash cache hit exists', async () => {
      const cachedAiResult = {
        riskScore: 12,
        recommendation: 'APPROVE',
        summary: 'AI analysis completed.',
        extractedFields: { escrow_status: 'CREATED' },
        factors: [{ name: 'corridor_risk', weight: 0.3, value: 10 }],
        details: 'AI-powered result',
      };

      // Make redis.get return the cached result for the hash key
      redisStub.get.resolves(JSON.stringify(cachedAiResult));

      const result = await service.analyzeEscrowFast(ESCROW_ID, CLIENT_ID);

      expect(result).to.have.property('tier', 'full');
      expect(result).to.have.property('aiAnalysisAvailable', true);
      expect(result.riskScore).to.equal(12);
    });

    it('should reject when escrow not found', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(null);

      try {
        await service.analyzeEscrowFast(ESCROW_ID, CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Escrow not found');
      }
    });

    it('should enforce rate limit', async () => {
      redisStub.incr.resolves(6);

      try {
        await service.analyzeEscrowFast(ESCROW_ID, CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('rate limit exceeded');
      }
    });
  });

  // ─── Rules Engine ──────────────────────────────────────

  describe('escrow-rules-engine', () => {
    const makeEscrowData = (overrides: Partial<EscrowData> = {}): EscrowData => ({
      status: 'CREATED',
      amount: 5000,
      platformFee: 25,
      tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      corridor: 'SG-CH',
      conditionType: 'ADMIN_RELEASE',
      settlementAuthority: 'settlement-auth-key',
      riskScore: 10,
      payerWallet: 'payer-wallet-123',
      recipientWallet: 'recipient-wallet-456',
      hasDeposit: true,
      depositCount: 1,
      fileCount: 1,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      depositTxSignature: 'tx-sig-abc',
      escrowPda: 'pda-123',
      nonceAccount: 'nonce-123',
      client: {
        kycStatus: 'VERIFIED',
        kybStatus: 'VERIFIED',
        riskRating: 'LOW',
        country: 'SG',
        entityType: 'CORPORATION',
        tier: 'STANDARD',
      },
      availableCorridors: [
        { code: 'SG-CH', riskLevel: 'LOW', minAmount: 100, maxAmount: 1000000 },
        { code: 'SG-US', riskLevel: 'MEDIUM', minAmount: 100, maxAmount: 500000 },
      ],
      ...overrides,
    });

    it('should pass all sections for a complete, valid escrow', () => {
      const result = evaluateEscrow(makeEscrowData());

      expect(result.riskScore).to.be.lessThan(25);
      expect(result.recommendation).to.equal('APPROVE');
      expect(result.sections.from_account.status).to.equal('pass');
      expect(result.sections.to_account.status).to.equal('pass');
      expect(result.sections.corridor.status).to.equal('pass');
      expect(result.sections.amount.status).to.equal('pass');
      expect(result.sections.settlement.status).to.equal('pass');
      expect(result.sections.release.status).to.equal('pass');
      expect(result.sections.advanced.status).to.equal('pass');
      expect(result.sections.overview.status).to.equal('pass');
    });

    it('should return pending for missing payer wallet', () => {
      const result = evaluateEscrow(makeEscrowData({ payerWallet: null }));
      expect(result.sections.from_account.status).to.equal('pending');
    });

    it('should fail for unverified KYC', () => {
      const result = evaluateEscrow(makeEscrowData({
        client: { ...makeEscrowData().client, kycStatus: 'PENDING' },
      }));
      expect(result.sections.from_account.status).to.equal('fail');
    });

    it('should fail for HIGH risk rating', () => {
      const result = evaluateEscrow(makeEscrowData({
        client: { ...makeEscrowData().client, riskRating: 'HIGH' },
      }));
      expect(result.sections.from_account.status).to.equal('fail');
    });

    it('should return pending for missing recipient wallet', () => {
      const result = evaluateEscrow(makeEscrowData({ recipientWallet: null }));
      expect(result.sections.to_account.status).to.equal('pending');
    });

    it('should fail when recipient equals payer', () => {
      const result = evaluateEscrow(makeEscrowData({
        payerWallet: 'same-wallet',
        recipientWallet: 'same-wallet',
      }));
      expect(result.sections.to_account.status).to.equal('fail');
    });

    it('should return pending for missing corridor with recommendation', () => {
      const result = evaluateEscrow(makeEscrowData({ corridor: null }));
      expect(result.sections.corridor.status).to.equal('pending');
      expect(result.sections.corridor.recommended_corridor).to.equal('SG-CH');
    });

    it('should warn for amount > $100K', () => {
      const result = evaluateEscrow(makeEscrowData({ amount: 150000 }));
      expect(result.sections.amount.status).to.equal('warning');
    });

    it('should return pending for missing amount', () => {
      const result = evaluateEscrow(makeEscrowData({ amount: 0 }));
      expect(result.sections.amount.status).to.equal('pending');
    });

    it('should return pending for missing tokenMint', () => {
      const result = evaluateEscrow(makeEscrowData({ tokenMint: null }));
      expect(result.sections.settlement.status).to.equal('pending');
    });

    it('should return pending for missing conditionType', () => {
      const result = evaluateEscrow(makeEscrowData({ conditionType: null }));
      expect(result.sections.release.status).to.equal('pending');
    });

    it('should warn for no docs on large amounts', () => {
      const result = evaluateEscrow(makeEscrowData({ amount: 60000, fileCount: 0 }));
      expect(result.sections.advanced.status).to.equal('warning');
    });

    it('should compute extracted fields correctly', () => {
      const result = evaluateEscrow(makeEscrowData());
      expect(result.extractedFields.escrow_status).to.equal('CREATED');
      expect(result.extractedFields.amount_usd).to.equal(5000);
      expect(result.extractedFields.corridor).to.equal('SG-CH');
      expect(result.extractedFields.kyc_status).to.equal('VERIFIED');
      expect(result.extractedFields.deposit_confirmed).to.be.true;
    });

    it('should set overview to fail when any section fails', () => {
      const result = evaluateEscrow(makeEscrowData({
        client: { ...makeEscrowData().client, kycStatus: 'REJECTED' },
      }));
      expect(result.sections.overview.status).to.equal('fail');
    });
  });
});
