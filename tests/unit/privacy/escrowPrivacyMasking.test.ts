/**
 * Unit Tests for Privacy-Aware Wallet Masking
 *
 * Tests that recipientWallet is masked in API responses when:
 * - privacyLevel === 'STEALTH' and caller is NOT the owner or recipient
 *
 * Tests that recipientWallet is visible when:
 * - Caller is the escrow owner (clientId matches)
 * - Caller is the recipient (counterpartyId matches)
 * - privacyLevel === 'NONE' (no masking regardless of caller)
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { InstitutionEscrowService } from '../../../src/services/institution-escrow.service';

describe('Privacy-Aware Wallet Masking', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionEscrowService;

  const OWNER_CLIENT_ID = 'client-owner-123';
  const RECIPIENT_CLIENT_ID = 'client-recipient-456';
  const THIRD_PARTY_CLIENT_ID = 'client-thirdparty-789';
  const PAYER_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const RECIPIENT_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

  const makeEscrow = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    escrowId: 'escrow-456',
    escrowCode: 'EE-AB3D-7KMN',
    clientId: OWNER_CLIENT_ID,
    payerWallet: PAYER_WALLET,
    recipientWallet: RECIPIENT_WALLET,
    usdcMint: process.env.USDC_MINT_ADDRESS,
    amount: 1000,
    platformFee: 0.5,
    corridor: 'US-MX',
    conditionType: 'ADMIN_RELEASE',
    status: 'FUNDED',
    settlementAuthority: PAYER_WALLET,
    riskScore: 10,
    settlementMode: 'escrow',
    releaseMode: 'manual',
    approvalParties: [],
    releaseConditions: [],
    approvalInstructions: null,
    escrowPda: null,
    vaultPda: null,
    nonceAccount: null,
    initTxSignature: null,
    depositTxSignature: null,
    releaseTxSignature: null,
    cancelTxSignature: null,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    fundedAt: null,
    privacyLevel: 'NONE',
    stealthPaymentId: null,
    ...overrides,
  });

  const makePartyNames = (overrides: Record<string, unknown> = {}) => ({
    payerName: 'Test Corp',
    payerAccountLabel: 'Primary',
    recipientName: 'Recipient Corp',
    recipientAccountLabel: 'Settlement',
    counterpartyId: RECIPIENT_CLIENT_ID,
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    service = new InstitutionEscrowService();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('formatEscrow() masking', () => {
    // Access private method for direct testing
    const callFormatEscrow = (
      svc: any,
      escrow: Record<string, unknown>,
      partyNames?: any,
      callerClientId?: string
    ) => svc.formatEscrow(escrow, partyNames, callerClientId);

    it('should show recipientWallet to escrow owner (STEALTH)', () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });
      const partyNames = makePartyNames();

      const result = callFormatEscrow(service, escrow, partyNames, OWNER_CLIENT_ID);

      expect((result.to as any).wallet).to.equal(RECIPIENT_WALLET);
      expect((result.to as any).name).to.equal('Recipient Corp');
      expect((result.to as any).clientId).to.equal(RECIPIENT_CLIENT_ID);
    });

    it('should show recipientWallet to recipient (STEALTH)', () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });
      const partyNames = makePartyNames();

      const result = callFormatEscrow(service, escrow, partyNames, RECIPIENT_CLIENT_ID);

      expect((result.to as any).wallet).to.equal(RECIPIENT_WALLET);
      expect((result.to as any).name).to.equal('Recipient Corp');
      expect((result.to as any).clientId).to.equal(RECIPIENT_CLIENT_ID);
    });

    it('should mask recipientWallet for third-party (STEALTH)', () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });
      const partyNames = makePartyNames();

      const result = callFormatEscrow(service, escrow, partyNames, THIRD_PARTY_CLIENT_ID);

      expect((result.to as any).wallet).to.be.null;
      expect((result.to as any).name).to.equal('Stealth Recipient');
      expect((result.to as any).clientId).to.be.null;
      expect((result.to as any).accountLabel).to.be.null;
    });

    it('should show recipientWallet to everyone when NONE', () => {
      const escrow = makeEscrow({ privacyLevel: 'NONE' });
      const partyNames = makePartyNames();

      const result = callFormatEscrow(service, escrow, partyNames, THIRD_PARTY_CLIENT_ID);

      expect((result.to as any).wallet).to.equal(RECIPIENT_WALLET);
      expect((result.to as any).name).to.equal('Recipient Corp');
      expect((result.to as any).clientId).to.equal(RECIPIENT_CLIENT_ID);
    });

    it('should show recipientWallet when no callerClientId provided (default)', () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });
      const partyNames = makePartyNames();

      const result = callFormatEscrow(service, escrow, partyNames);

      expect((result.to as any).wallet).to.equal(RECIPIENT_WALLET);
      expect((result.to as any).name).to.equal('Recipient Corp');
    });

    it('should default to NONE when privacyLevel is not set', () => {
      const escrow = makeEscrow({ privacyLevel: undefined });
      const partyNames = makePartyNames();

      const result = callFormatEscrow(service, escrow, partyNames, THIRD_PARTY_CLIENT_ID);

      expect((result.to as any).wallet).to.equal(RECIPIENT_WALLET);
    });

    it('should not mask from/payer fields regardless of privacy level', () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });
      const partyNames = makePartyNames();

      const result = callFormatEscrow(service, escrow, partyNames, THIRD_PARTY_CLIENT_ID);

      expect((result.from as any).wallet).to.equal(PAYER_WALLET);
      expect((result.from as any).name).to.equal('Test Corp');
      expect((result.from as any).clientId).to.equal(OWNER_CLIENT_ID);
    });

    it('should preserve all non-wallet fields when masking', () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });
      const partyNames = makePartyNames();

      const result = callFormatEscrow(service, escrow, partyNames, THIRD_PARTY_CLIENT_ID);

      expect(result.escrowId).to.equal('EE-AB3D-7KMN');
      expect(result.status).to.equal('FUNDED');
      expect(result.amount).to.equal(1000);
      expect((result.settlement as any).mode).to.equal('escrow');
      expect((result.timestamps as any).createdAt).to.be.an.instanceOf(Date);
    });
  });

  describe('formatEscrowEnriched() masking', () => {
    let prismaStub: any;

    beforeEach(() => {
      prismaStub = {
        institutionEscrow: {
          findMany: sandbox.stub().resolves([]),
          count: sandbox.stub().resolves(0),
        },
        institutionClient: {
          findUnique: sandbox.stub().resolves({
            companyName: 'Test Corp',
            country: 'US',
          }),
          findMany: sandbox.stub().resolves([]),
          findFirst: sandbox.stub().resolves(null),
        },
        institutionAccount: {
          findMany: sandbox.stub().resolves([]),
        },
        institutionCorridor: {
          findUnique: sandbox.stub().resolves(null),
        },
        institutionAiAnalysis: {
          findMany: sandbox.stub().resolves([]),
        },
        institutionAuditLog: {
          findMany: sandbox.stub().resolves([]),
        },
      };
      (service as any).prisma = prismaStub;
    });

    const callFormatEscrowEnriched = async (
      svc: any,
      escrow: Record<string, unknown>,
      callerClientId?: string
    ) => svc.formatEscrowEnriched(escrow, callerClientId);

    it('should mask recipient in enriched view for third-party (STEALTH)', async () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });

      // Stub resolvePartyNames to return counterparty info
      prismaStub.institutionClient.findUnique.resolves({
        companyName: 'Owner Corp',
        country: 'US',
      });
      prismaStub.institutionAccount.findMany.resolves([
        {
          walletAddress: RECIPIENT_WALLET,
          label: 'Settlement',
          name: 'Settlement Account',
          client: { id: RECIPIENT_CLIENT_ID, companyName: 'Recipient Corp' },
        },
      ]);

      const result = await callFormatEscrowEnriched(service, escrow, THIRD_PARTY_CLIENT_ID);

      expect((result.to as any).wallet).to.be.null;
      expect((result.to as any).name).to.equal('Stealth Recipient');
      expect((result.to as any).country).to.be.null;
    });

    it('should show recipient in enriched view for owner (STEALTH)', async () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });

      // 3 findUnique calls: resolvePartyNames payer, formatEscrowEnriched payer client, recipient country
      prismaStub.institutionClient.findUnique
        .onFirstCall()
        .resolves({ companyName: 'Owner Corp', country: 'US' })
        .onSecondCall()
        .resolves({ companyName: 'Owner Corp', country: 'US' })
        .onThirdCall()
        .resolves({ country: 'MX' });
      prismaStub.institutionAccount.findMany.resolves([
        {
          walletAddress: RECIPIENT_WALLET,
          label: 'Settlement',
          name: 'Settlement Account',
          client: { id: RECIPIENT_CLIENT_ID, companyName: 'Recipient Corp' },
        },
      ]);

      const result = await callFormatEscrowEnriched(service, escrow, OWNER_CLIENT_ID);

      expect((result.to as any).wallet).to.equal(RECIPIENT_WALLET);
      expect((result.to as any).name).to.equal('Recipient Corp');
      expect((result.to as any).country).to.equal('MX');
    });

    it('should show recipient in enriched view when NONE', async () => {
      const escrow = makeEscrow({ privacyLevel: 'NONE' });

      // 3 findUnique calls: resolvePartyNames payer, formatEscrowEnriched payer client, recipient country
      prismaStub.institutionClient.findUnique
        .onFirstCall()
        .resolves({ companyName: 'Owner Corp', country: 'US' })
        .onSecondCall()
        .resolves({ companyName: 'Owner Corp', country: 'US' })
        .onThirdCall()
        .resolves({ country: 'MX' });
      prismaStub.institutionAccount.findMany.resolves([
        {
          walletAddress: RECIPIENT_WALLET,
          label: 'Settlement',
          name: 'Settlement Account',
          client: { id: RECIPIENT_CLIENT_ID, companyName: 'Recipient Corp' },
        },
      ]);

      const result = await callFormatEscrowEnriched(service, escrow, THIRD_PARTY_CLIENT_ID);

      expect((result.to as any).wallet).to.equal(RECIPIENT_WALLET);
      expect((result.to as any).name).to.equal('Recipient Corp');
    });
  });

  describe('buildKytContext() audit log masking', () => {
    let prismaStub: any;

    beforeEach(() => {
      prismaStub = {
        institutionClient: {
          findUnique: sandbox.stub().resolves({
            companyName: 'Test Corp',
            legalName: 'Test Corp LLC',
            country: 'US',
            registrationCountry: 'US',
            lei: 'LEI123',
          }),
          findFirst: sandbox.stub().resolves({
            companyName: 'Recipient Corp',
            legalName: 'Recipient Corp LLC',
            country: 'MX',
            registrationCountry: 'MX',
            lei: 'LEI456',
          }),
        },
      };
      (service as any).prisma = prismaStub;
    });

    const callBuildKytContext = (svc: any, escrow: Record<string, unknown>) =>
      svc.buildKytContext(escrow);

    it('should mask beneficiary wallet in KYT context when STEALTH', async () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });

      const result = await callBuildKytContext(service, escrow);
      const kyt = result.kyt as any;

      expect(kyt.beneficiary.wallet).to.be.null;
      expect(kyt.beneficiary.name).to.equal('Stealth Recipient');
      expect(kyt.beneficiary.country).to.be.null;
      expect(kyt.privacyLevel).to.equal('STEALTH');
    });

    it('should show beneficiary wallet in KYT context when NONE', async () => {
      const escrow = makeEscrow({ privacyLevel: 'NONE' });

      const result = await callBuildKytContext(service, escrow);
      const kyt = result.kyt as any;

      expect(kyt.beneficiary.wallet).to.equal(RECIPIENT_WALLET);
      expect(kyt.beneficiary.name).to.equal('Recipient Corp');
      expect(kyt.beneficiary.country).to.equal('MX');
      expect(kyt.privacyLevel).to.equal('NONE');
    });

    it('should not mask originator regardless of privacy level', async () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });

      const result = await callBuildKytContext(service, escrow);
      const kyt = result.kyt as any;

      expect(kyt.originator.wallet).to.equal(PAYER_WALLET);
      expect(kyt.originator.name).to.equal('Test Corp');
    });

    it('should skip beneficiary lookup when STEALTH', async () => {
      const escrow = makeEscrow({ privacyLevel: 'STEALTH' });

      await callBuildKytContext(service, escrow);

      expect(prismaStub.institutionClient.findFirst.called).to.be.false;
    });
  });
});
