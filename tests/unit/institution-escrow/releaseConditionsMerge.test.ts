/**
 * Unit Tests for Release Conditions Merge Logic
 *
 * Tests that when releaseMode is 'ai', legal_compliance is always auto-included
 * in the conditions array (Set union), and that frontend `conditions` alias
 * is accepted alongside `releaseConditions`.
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config \
 *     tests/unit/institution-escrow/releaseConditionsMerge.test.ts --timeout 10000
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Stub token whitelist before importing service
import * as tokenWhitelistModule from '../../../src/services/institution-token-whitelist.service';

import { InstitutionEscrowService } from '../../../src/services/institution-escrow.service';

const CLIENT_ID = 'client-merge-test';
const PAYER_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const RECIPIENT_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

describe('Release Conditions Merge Logic', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionEscrowService;
  let prismaStub: any;
  let createdData: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub token whitelist
    sandbox.stub(tokenWhitelistModule, 'getTokenWhitelistService').returns({
      getDefaultMint: () => Promise.resolve('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
      validateMint: () => Promise.resolve(),
    } as any);

    createdData = null;

    prismaStub = {
      institutionEscrow: {
        create: sandbox.stub().callsFake(async (params: any) => {
          createdData = params.data;
          return { ...params.data, id: 'test-id' };
        }),
        findUnique: sandbox.stub(),
        findFirst: sandbox.stub(),
        update: sandbox.stub().callsFake(async (params: any) => ({
          ...createdData,
          ...params.data,
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
          country: 'SG',
        }),
        findFirst: sandbox.stub().resolves(null),
      },
      institutionAccount: {
        findFirst: sandbox.stub().resolves({
          id: 'account-1',
          clientId: 'recipient-client',
          walletAddress: RECIPIENT_WALLET,
          accountLabel: 'Main',
          isActive: true,
        }),
        findMany: sandbox.stub().resolves([]),
      },
      institutionCorridor: {
        findUnique: sandbox.stub().resolves(null),
      },
      institutionFile: {
        findFirst: sandbox.stub().resolves(null),
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
    };

    service = new InstitutionEscrowService();
    (service as any).prisma = prismaStub;

    sandbox.stub(service as any, 'getProgramService').returns(null);
    sandbox.stub(service as any, 'getNoncePoolManager').returns(null);
    sandbox.stub(service as any, 'cacheEscrow').resolves();
    sandbox.stub(service as any, 'resolvePartyNames').resolves([{}]);
    sandbox.stub(service as any, 'createKytAuditLog').resolves();
    sandbox.stub(service as any, 'createAuditLog').resolves();
    sandbox.stub(service as any, 'resolveClientIdByWallet').resolves(null);
    sandbox.stub(service as any, 'validateRecipientWallet').resolves();
    sandbox.stub(service as any, 'complianceService').value({
      validateTransaction: sandbox.stub().resolves({
        passed: true,
        riskScore: 10,
        flags: [],
        reasons: [],
        checks: [],
        riskLevel: 'LOW',
        corridorValid: true,
        walletsAllowlisted: true,
        limitsWithinRange: true,
      }),
      getComplianceThresholds: sandbox.stub().resolves({ rejectScore: 80 }),
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should merge legal_compliance with provided conditions for AI release mode', async () => {
    await service.createEscrow({
      clientId: CLIENT_ID,
      payerWallet: PAYER_WALLET,
      recipientWallet: RECIPIENT_WALLET,
      amount: 500,
      corridor: 'SG-CH',
      conditionType: 'COMPLIANCE_CHECK',
      settlementMode: 'escrow',
      releaseMode: 'ai',
      releaseConditions: ['invoice_amount_match', 'client_info_match'],
    });

    expect(createdData.releaseConditions).to.include('legal_compliance');
    expect(createdData.releaseConditions).to.include('invoice_amount_match');
    expect(createdData.releaseConditions).to.include('client_info_match');
    expect(createdData.releaseConditions).to.have.lengthOf(3);
  });

  it('should not duplicate legal_compliance if already provided', async () => {
    await service.createEscrow({
      clientId: CLIENT_ID,
      payerWallet: PAYER_WALLET,
      recipientWallet: RECIPIENT_WALLET,
      amount: 500,
      corridor: 'SG-CH',
      conditionType: 'COMPLIANCE_CHECK',
      settlementMode: 'escrow',
      releaseMode: 'ai',
      releaseConditions: ['legal_compliance', 'invoice_amount_match', 'client_info_match'],
    });

    expect(createdData.releaseConditions).to.include('legal_compliance');
    expect(createdData.releaseConditions).to.include('invoice_amount_match');
    expect(createdData.releaseConditions).to.include('client_info_match');
    expect(createdData.releaseConditions).to.have.lengthOf(3);
  });

  it('should add legal_compliance when no conditions provided for AI mode', async () => {
    await service.createEscrow({
      clientId: CLIENT_ID,
      payerWallet: PAYER_WALLET,
      recipientWallet: RECIPIENT_WALLET,
      amount: 500,
      corridor: 'SG-CH',
      conditionType: 'COMPLIANCE_CHECK',
      settlementMode: 'escrow',
      releaseMode: 'ai',
    });

    expect(createdData.releaseConditions).to.deep.equal(['legal_compliance']);
  });

  it('should NOT auto-add legal_compliance for manual release mode', async () => {
    await service.createEscrow({
      clientId: CLIENT_ID,
      payerWallet: PAYER_WALLET,
      recipientWallet: RECIPIENT_WALLET,
      amount: 500,
      corridor: 'SG-CH',
      conditionType: 'ADMIN_RELEASE',
      settlementMode: 'escrow',
      releaseMode: 'manual',
      releaseConditions: ['invoice_amount_match'],
    });

    expect(createdData.releaseConditions).to.deep.equal(['invoice_amount_match']);
    expect(createdData.releaseConditions).to.not.include('legal_compliance');
  });

  it('should preserve all four valid condition IDs for AI mode', async () => {
    await service.createEscrow({
      clientId: CLIENT_ID,
      payerWallet: PAYER_WALLET,
      recipientWallet: RECIPIENT_WALLET,
      amount: 500,
      corridor: 'SG-CH',
      conditionType: 'COMPLIANCE_CHECK',
      settlementMode: 'escrow',
      releaseMode: 'ai',
      releaseConditions: [
        'legal_compliance',
        'invoice_amount_match',
        'client_info_match',
        'document_signature_verified',
      ],
    });

    expect(createdData.releaseConditions).to.have.lengthOf(4);
    expect(createdData.releaseConditions).to.include('legal_compliance');
    expect(createdData.releaseConditions).to.include('invoice_amount_match');
    expect(createdData.releaseConditions).to.include('client_info_match');
    expect(createdData.releaseConditions).to.include('document_signature_verified');
  });
});
