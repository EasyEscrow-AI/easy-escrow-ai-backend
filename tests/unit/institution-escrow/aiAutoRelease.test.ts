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
