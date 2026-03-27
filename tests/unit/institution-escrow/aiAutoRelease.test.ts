/**
 * Unit Tests for AI Auto-Release Flow
 *
 * Tests that when releaseMode is 'ai' and all conditions pass at fulfill time,
 * the escrow is automatically released. When conditions fail, the escrow stays
 * in PENDING_RELEASE for manual intervention.
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config \
 *     tests/unit/institution-escrow/aiAutoRelease.test.ts --timeout 10000
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { InstitutionEscrowService } from '../../../src/services/institution-escrow.service';

const CLIENT_ID = 'client-123';
const ESCROW_ID = 'escrow-ai-test';
const PAYER_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const RECIPIENT_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

const makeEscrow = (overrides: Record<string, unknown> = {}) => ({
  escrowId: ESCROW_ID,
  escrowCode: 'EE-AI-TST',
  clientId: CLIENT_ID,
  payerWallet: PAYER_WALLET,
  recipientWallet: RECIPIENT_WALLET,
  usdcMint: process.env.USDC_MINT_ADDRESS,
  amount: 500,
  platformFee: 1,
  corridor: 'CH-US',
  conditionType: 'COMPLIANCE_CHECK',
  status: 'FUNDED',
  releaseMode: 'ai',
  releaseConditions: ['legal_compliance'],
  settlementAuthority: PAYER_WALLET,
  riskScore: 10,
  escrowPda: null,
  vaultPda: null,
  nonceAccount: null,
  depositTxSignature: null,
  releaseTxSignature: null,
  expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
  resolvedAt: null,
  fundedAt: new Date(),
  privacyLevel: 'NONE',
  ...overrides,
});

describe('AI Auto-Release Flow', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionEscrowService;
  let prismaStub: any;
  let releaseFundsStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    prismaStub = {
      institutionEscrow: {
        findUnique: sandbox.stub(),
        findFirst: sandbox.stub(),
        update: sandbox.stub().callsFake(async (params: any) => ({
          ...makeEscrow(),
          ...params.data,
          updatedAt: new Date(),
        })),
      },
      institutionClient: {
        findUnique: sandbox.stub().resolves({
          id: CLIENT_ID,
          companyName: 'Test Corp',
          status: 'ACTIVE',
          kycStatus: 'VERIFIED',
          primaryWallet: PAYER_WALLET,
          settledWallets: [],
        }),
        findFirst: sandbox.stub().resolves(null),
      },
      institutionAccount: {
        findFirst: sandbox.stub().resolves(null),
        findMany: sandbox.stub().resolves([]),
      },
      institutionFile: {
        findFirst: sandbox.stub().resolves({
          id: 'file-1',
          fileName: 'invoice.pdf',
          documentType: 'SHIPPING_DOC',
          uploadedAt: new Date(),
        }),
        findMany: sandbox.stub().resolves([]),
      },
      institutionAuditLog: {
        create: sandbox.stub().resolves({}),
        findFirst: sandbox.stub().resolves(null),
        findMany: sandbox.stub().resolves([]),
      },
      institutionAiAnalysis: {
        findFirst: sandbox.stub().resolves(null),
        findMany: sandbox.stub().resolves([]),
      },
      institutionCorridor: {
        findUnique: sandbox.stub().resolves(null),
      },
    };

    service = new InstitutionEscrowService();
    (service as any).prisma = prismaStub;

    // Stub internal methods
    sandbox.stub(service as any, 'getProgramService').returns(null);
    sandbox.stub(service as any, 'getNoncePoolManager').returns(null);
    sandbox.stub(service as any, 'cacheEscrow').resolves();
    sandbox.stub(service as any, 'resolvePartyNames').resolves([{}]);
    sandbox.stub(service as any, 'createKytAuditLog').resolves();
    sandbox.stub(service as any, 'resolveClientIdByWallet').resolves(null);

    // Stub releaseFunds to track calls
    releaseFundsStub = sandbox.stub(service, 'releaseFunds');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should auto-release when releaseMode is ai and all conditions pass', async () => {
    const escrow = makeEscrow({ releaseMode: 'ai', status: 'FUNDED' });
    prismaStub.institutionEscrow.findUnique.resolves(escrow);

    // Mock AI analysis returning low risk (passes legal_compliance check)
    sandbox.stub(service as any, 'performAiReleaseCheck').resolves({
      passed: true,
      conditions: [
        { condition: 'legal_compliance', label: 'All legal compliance checks pass', passed: true, detail: 'Risk score 15/100' },
      ],
      aiAnalysis: { riskScore: 15, recommendation: 'APPROVE', summary: 'Low risk', factors: [] },
    });

    releaseFundsStub.resolves({ status: 'COMPLETE' });

    await service.fulfillEscrow(CLIENT_ID, ESCROW_ID, { fileId: 'file-1' });

    expect(releaseFundsStub.calledOnce).to.be.true;
    expect(releaseFundsStub.firstCall.args[3]).to.equal('AI Orchestrator');
  });

  it('should NOT auto-release when AI conditions fail', async () => {
    const escrow = makeEscrow({ releaseMode: 'ai', status: 'FUNDED' });
    prismaStub.institutionEscrow.findUnique.resolves(escrow);

    sandbox.stub(service as any, 'performAiReleaseCheck').resolves({
      passed: false,
      conditions: [
        { condition: 'legal_compliance', label: 'All legal compliance checks pass', passed: false, detail: 'Risk score 80/100' },
      ],
      aiAnalysis: { riskScore: 80, recommendation: 'REVIEW', summary: 'High risk', factors: [] },
    });

    await service.fulfillEscrow(CLIENT_ID, ESCROW_ID, { fileId: 'file-1' });

    expect(releaseFundsStub.called).to.be.false;
  });

  it('should NOT auto-release when releaseMode is manual', async () => {
    const escrow = makeEscrow({ releaseMode: 'manual', status: 'FUNDED' });
    prismaStub.institutionEscrow.findUnique.resolves(escrow);

    await service.fulfillEscrow(CLIENT_ID, ESCROW_ID, { fileId: 'file-1' });

    expect(releaseFundsStub.called).to.be.false;
  });

  it('should fall back to PENDING_RELEASE if auto-release throws', async () => {
    const escrow = makeEscrow({ releaseMode: 'ai', status: 'FUNDED' });
    prismaStub.institutionEscrow.findUnique.resolves(escrow);

    sandbox.stub(service as any, 'performAiReleaseCheck').resolves({
      passed: true,
      conditions: [
        { condition: 'legal_compliance', label: 'All legal compliance checks pass', passed: true, detail: 'Risk score 15/100' },
      ],
      aiAnalysis: { riskScore: 15, recommendation: 'APPROVE', summary: 'Low risk', factors: [] },
    });

    releaseFundsStub.rejects(new Error('On-chain release failed'));

    // Should not throw — falls back to PENDING_RELEASE
    const result = await service.fulfillEscrow(CLIENT_ID, ESCROW_ID, { fileId: 'file-1' });
    expect(result).to.exist;
    expect(releaseFundsStub.calledOnce).to.be.true;
  });
});

describe('AI Release Check — Document Verification', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionEscrowService;
  let prismaStub: any;
  let aiServiceStub: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    prismaStub = {
      institutionEscrow: {
        findUnique: sandbox.stub(),
        findFirst: sandbox.stub(),
      },
      institutionClient: {
        findUnique: sandbox.stub().resolves({
          id: CLIENT_ID,
          companyName: 'Optimus Exchange AG',
          legalName: 'Optimus Exchange AG',
          country: 'CH',
          primaryWallet: PAYER_WALLET,
          settledWallets: [],
        }),
        findFirst: sandbox.stub().resolves(null),
      },
      institutionAccount: {
        findFirst: sandbox.stub().resolves(null),
        findMany: sandbox.stub().resolves([]),
      },
      institutionFile: {
        findFirst: sandbox.stub().resolves({
          id: 'file-invoice',
          fileName: 'invoice001.pdf',
          documentType: 'INVOICE',
          clientId: CLIENT_ID,
          uploadedAt: new Date(),
        }),
      },
      institutionAuditLog: {
        create: sandbox.stub().resolves({}),
      },
    };

    service = new InstitutionEscrowService();
    (service as any).prisma = prismaStub;

    // Mock AI analysis service
    aiServiceStub = {
      analyzeEscrow: sandbox.stub().resolves({
        riskScore: 15,
        recommendation: 'APPROVE',
        summary: 'Low risk transaction',
        extractedFields: {},
        factors: [],
      }),
      analyzeDocument: sandbox.stub(),
    };

    // Replace the module-level getter
    const aiModule = require('../../../src/services/ai-analysis.service');
    sandbox.stub(aiModule, 'getAiAnalysisService').returns(aiServiceStub);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should pass invoice_amount_match when document amount matches escrow', async () => {
    const escrow = makeEscrow({
      amount: 500,
      releaseMode: 'ai',
      releaseConditions: ['invoice_amount_match'],
    });

    aiServiceStub.analyzeDocument.resolves({
      riskScore: 10,
      recommendation: 'APPROVE',
      extractedFields: { total_amount: 500, currency: 'USDC', counterparty_name: 'Satoshi Bridge Labs Inc' },
      factors: [],
    });

    const result = await (service as any).performAiReleaseCheck(escrow, CLIENT_ID);

    expect(result.passed).to.be.true;
    const amountCheck = result.conditions.find((c: any) => c.condition === 'invoice_amount_match');
    expect(amountCheck).to.exist;
    expect(amountCheck.passed).to.be.true;
    expect(amountCheck.detail).to.include('500');
  });

  it('should FAIL invoice_amount_match when document amount differs from escrow', async () => {
    const escrow = makeEscrow({
      amount: 500,
      releaseMode: 'ai',
      releaseConditions: ['invoice_amount_match'],
    });

    // Invoice says $750 but escrow is $500
    aiServiceStub.analyzeDocument.resolves({
      riskScore: 50,
      recommendation: 'REVIEW',
      extractedFields: { total_amount: 750, currency: 'USDC', counterparty_name: 'Wrong Corp' },
      factors: [],
    });

    const result = await (service as any).performAiReleaseCheck(escrow, CLIENT_ID);

    expect(result.passed).to.be.false;
    const amountCheck = result.conditions.find((c: any) => c.condition === 'invoice_amount_match');
    expect(amountCheck).to.exist;
    expect(amountCheck.passed).to.be.false;
    expect(amountCheck.detail).to.include('does not match');
  });

  it('should pass client_info_match when document company matches client', async () => {
    const escrow = makeEscrow({
      amount: 500,
      releaseMode: 'ai',
      releaseConditions: ['client_info_match'],
    });

    aiServiceStub.analyzeDocument.resolves({
      riskScore: 10,
      recommendation: 'APPROVE',
      extractedFields: { total_amount: 500, counterparty_name: 'Optimus Exchange AG' },
      factors: [],
    });

    const result = await (service as any).performAiReleaseCheck(escrow, CLIENT_ID);

    expect(result.passed).to.be.true;
    const clientCheck = result.conditions.find((c: any) => c.condition === 'client_info_match');
    expect(clientCheck).to.exist;
    expect(clientCheck.passed).to.be.true;
    expect(clientCheck.detail).to.include('Optimus Exchange AG');
  });

  it('should FAIL client_info_match when document company does not match', async () => {
    const escrow = makeEscrow({
      amount: 500,
      releaseMode: 'ai',
      releaseConditions: ['client_info_match'],
    });

    aiServiceStub.analyzeDocument.resolves({
      riskScore: 10,
      recommendation: 'APPROVE',
      extractedFields: { total_amount: 500, counterparty_name: 'Totally Different Corp' },
      factors: [],
    });

    const result = await (service as any).performAiReleaseCheck(escrow, CLIENT_ID);

    expect(result.passed).to.be.false;
    const clientCheck = result.conditions.find((c: any) => c.condition === 'client_info_match');
    expect(clientCheck).to.exist;
    expect(clientCheck.passed).to.be.false;
    expect(clientCheck.detail).to.include('does not match');
  });

  it('should FAIL when no document is uploaded but document conditions are selected', async () => {
    const escrow = makeEscrow({
      amount: 500,
      releaseMode: 'ai',
      releaseConditions: ['invoice_amount_match', 'client_info_match'],
    });

    // No file found
    prismaStub.institutionFile.findFirst.resolves(null);

    const result = await (service as any).performAiReleaseCheck(escrow, CLIENT_ID);

    expect(result.passed).to.be.false;
    const amountCheck = result.conditions.find((c: any) => c.condition === 'invoice_amount_match');
    expect(amountCheck.passed).to.be.false;
    expect(amountCheck.detail).to.include('not found');
  });
});
