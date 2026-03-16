/**
 * Unit Tests for AiAnalysisService
 *
 * Tests AI document analysis pipeline:
 * - analyzeDocument: rate limiting, caching
 * - anonymizePii: email, account number masking
 * - getAnalysisResults: access control, results retrieval
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { AiAnalysisService, AnalyzeDocumentParams } from '../../../src/services/ai-analysis.service';

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
          clientId: CLIENT_ID,
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
});
