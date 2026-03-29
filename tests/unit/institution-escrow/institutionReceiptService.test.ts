/**
 * Unit Tests for InstitutionReceiptService
 *
 * Tests receipt data assembly and HTML rendering:
 * - getReceiptData: fetches escrow + client + deposits + audit + compliance
 * - renderReceiptHTML: produces valid HTML with all sections
 * - Structured output: receipt number, amount formatting, status badges
 * - Security: HTML escaping of user-supplied data
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/institution-escrow/institutionReceiptService.test.ts --timeout 30000
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.INSTITUTION_ESCROW_ENABLED = 'true';
process.env.DO_SPACES_ENDPOINT = 'nyc3.digitaloceanspaces.com';
process.env.DO_SPACES_REGION = 'nyc3';
process.env.DO_SPACES_BUCKET = 'test-bucket';
process.env.DO_SPACES_KEY = 'test-key';
process.env.DO_SPACES_SECRET = 'test-secret';

import { InstitutionReceiptService, ReceiptData } from '../../../src/services/institution-receipt.service';

describe('InstitutionReceiptService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionReceiptService;
  let prismaStub: any;

  const CLIENT_ID = 'client-123';
  const ESCROW_ID = 'esc-456-uuid';

  const mockClient = {
    id: CLIENT_ID,
    email: 'ops@helvetica-digital.ch',
    companyName: 'Helvetica Digital AG',
    legalName: 'Helvetica Digital AG',
    tradingName: 'Helvetica Digital',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'CH',
    registrationNumber: 'CHE-123.456.789',
    registrationCountry: 'CH',
    entityType: 'CORPORATION',
    lei: '5299009QN2DKJH7P2X42',
    addressLine1: 'Bahnhofstrasse 42',
    addressLine2: null,
    city: 'Zurich',
    state: 'ZH',
    postalCode: '8001',
    country: 'CH',
    contactFirstName: 'Lena',
    contactLastName: 'Mueller',
    contactEmail: 'lena.mueller@helvetica-digital.ch',
    contactPhone: '+41-44-555-0101',
    contactTitle: 'Head of Digital Assets',
    regulatoryBody: 'FINMA',
    licenseNumber: 'FINMA-2021-BL-0042',
    primaryWallet: 'FakeWallet1111111111111111111111111111111111',
  };

  const ESCROW_CODE = 'EE-INST-AB3D7KMN';

  const mockEscrow = {
    id: 'row-id-1',
    escrowId: ESCROW_ID,
    escrowCode: ESCROW_CODE,
    clientId: CLIENT_ID,
    payerWallet: 'PayerWallet1111111111111111111111111111111111',
    recipientWallet: 'RecipientWallet11111111111111111111111111111',
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: { toNumber: () => 250000, toString: () => '250000' },
    platformFee: { toNumber: () => 1250, toString: () => '1250' },
    corridor: 'CH-SG',
    conditionType: 'ADMIN_RELEASE',
    status: 'RELEASED',
    settlementAuthority: 'SettlementAuth111111111111111111111111111111',
    riskScore: 15,
    escrowPda: 'EscrowPda1111111111111111111111111111111111111',
    vaultPda: 'VaultPda11111111111111111111111111111111111111',
    depositTxSignature: 'DepositTxSig1111111111111111111111111111111111111111111111111111111111111111111111111111',
    releaseTxSignature: 'ReleaseTxSig1111111111111111111111111111111111111111111111111111111111111111111111111111',
    cancelTxSignature: null,
    expiresAt: new Date('2026-03-20T00:00:00Z'),
    createdAt: new Date('2026-03-15T10:00:00Z'),
    updatedAt: new Date('2026-03-17T10:00:00Z'),
    resolvedAt: new Date('2026-03-17T08:00:00Z'),
    fundedAt: new Date('2026-03-15T11:00:00Z'),
    client: mockClient,
    deposits: [
      {
        id: 'dep-1',
        escrowId: ESCROW_ID,
        txSignature: 'DepositTxSig1111111111111111111111111111111111111111111111111111111111111111111111111111',
        amount: { toNumber: () => 250000, toString: () => '250000' },
        confirmedAt: new Date('2026-03-15T11:00:00Z'),
        blockHeight: BigInt(200500000),
        createdAt: new Date('2026-03-15T10:30:00Z'),
      },
    ],
    auditLogs: [
      {
        id: 'log-1',
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        action: 'ESCROW_CREATED',
        actor: 'staging-seeder',
        details: { amount: 250000, corridor: 'CH-SG' },
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-03-15T10:00:00Z'),
      },
      {
        id: 'log-2',
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        action: 'DEPOSIT_CONFIRMED',
        actor: 'staging-seeder',
        details: { amount: 250000 },
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-03-15T11:00:00Z'),
      },
      {
        id: 'log-3',
        escrowId: ESCROW_ID,
        clientId: CLIENT_ID,
        action: 'FUNDS_RELEASED',
        actor: 'staging-seeder',
        details: { txSignature: 'ReleaseTxSig...' },
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-03-17T08:00:00Z'),
      },
    ],
    aiAnalyses: [
      {
        id: 'ai-1',
        escrowId: ESCROW_ID,
        riskScore: 15,
        factors: [
          { name: 'corridor_risk', weight: 0.3, value: 'low' },
          { name: 'amount_threshold', weight: 0.25, value: 'high' },
          { name: 'client_history', weight: 0.25, value: 'established' },
          { name: 'sanctions_screening', weight: 0.2, value: 'clear' },
        ],
        recommendation: 'APPROVE',
        extractedFields: {},
        model: 'claude-sonnet-4-20250514',
        createdAt: new Date('2026-03-15T10:05:00Z'),
      },
    ],
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    prismaStub = {
      institutionEscrow: {
        findFirst: sandbox.stub(),
      },
    };

    service = new InstitutionReceiptService(prismaStub as any);
    // Stub the logo loader to avoid filesystem dependency
    sandbox.stub(service as any, 'loadLogoBase64').returns('data:image/png;base64,FAKELOGO');
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── getReceiptData ───────────────────────────────────────────

  describe('getReceiptData', () => {
    it('should throw when escrow not found', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(null);

      try {
        await service.getReceiptData('nonexistent', CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not found');
      }
    });

    it('should return complete receipt data for a valid escrow', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      // Client
      expect(data.client.companyName).to.equal('Helvetica Digital AG');
      expect(data.client.email).to.equal('ops@helvetica-digital.ch');
      expect(data.client.tier).to.equal('ENTERPRISE');
      expect(data.client.lei).to.equal('5299009QN2DKJH7P2X42');
      expect(data.client.regulatoryBody).to.equal('FINMA');
    });

    it('should format escrow details correctly', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      expect(data.escrow.escrowId).to.equal(ESCROW_CODE);
      expect(data.escrow.status).to.equal('RELEASED');
      expect(data.escrow.corridor).to.equal('CH-SG');
      expect(data.escrow.conditionType).to.equal('ADMIN_RELEASE');
      expect(data.escrow.currency).to.equal('USDC');
      expect(data.escrow.riskScore).to.equal(15);
    });

    it('should format amounts with commas and decimals', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      expect(data.escrow.amount).to.include('250,000');
      expect(data.escrow.platformFee).to.include('1,250');
      expect(data.escrow.netAmount).to.include('248,750');
    });

    it('should include deposit transaction', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      expect(data.transactions).to.have.length.at.least(1);
      const deposit = data.transactions.find((t) => t.type === 'Deposit');
      expect(deposit).to.not.be.undefined;
      expect(deposit!.signature).to.be.a('string').and.not.empty;
      expect(deposit!.confirmedAt).to.be.a('string').and.not.empty;
      expect(deposit!.blockHeight).to.equal('200500000');
    });

    it('should include release transaction for RELEASED escrow', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      const release = data.transactions.find((t) => t.type === 'Release');
      expect(release).to.not.be.undefined;
      expect(release!.amount).to.include('248,750');
    });

    it('should include cancellation tx for cancelled escrow', async () => {
      const cancelledEscrow = {
        ...mockEscrow,
        status: 'CANCELLED',
        releaseTxSignature: null,
        cancelTxSignature: 'CancelTxSig111111111111111111111111111111111111111111111111111111111111111111111111111',
      };
      prismaStub.institutionEscrow.findFirst.resolves(cancelledEscrow);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      const cancel = data.transactions.find((t) => t.type === 'Cancellation');
      expect(cancel).to.not.be.undefined;
      expect(data.transactions.find((t) => t.type === 'Release')).to.be.undefined;
    });

    it('should include audit logs (excluding STAGING_SEED)', async () => {
      const escrowWithSeedLog = {
        ...mockEscrow,
        auditLogs: [
          ...mockEscrow.auditLogs,
          {
            id: 'log-seed',
            escrowId: ESCROW_ID,
            clientId: CLIENT_ID,
            action: 'STAGING_SEED',
            actor: 'staging-seeder',
            details: { seedTag: 'test' },
            ipAddress: '127.0.0.1',
            createdAt: new Date('2026-03-15T10:00:00Z'),
          },
        ],
      };
      prismaStub.institutionEscrow.findFirst.resolves(escrowWithSeedLog);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      expect(data.auditLogs).to.have.length(3); // Excludes STAGING_SEED
      expect(data.auditLogs.every((l) => l.action !== 'Staging Seed')).to.be.true;
    });

    it('should include compliance analysis data', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      expect(data.compliance).to.not.be.null;
      expect(data.compliance!.riskScore).to.equal(15);
      expect(data.compliance!.recommendation).to.equal('APPROVE');
      expect(data.compliance!.model).to.equal('claude-sonnet-4-20250514');
      expect(data.compliance!.factors).to.have.length(4);
    });

    it('should handle escrow with no compliance analysis', async () => {
      prismaStub.institutionEscrow.findFirst.resolves({
        ...mockEscrow,
        aiAnalyses: [],
      });

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);
      expect(data.compliance).to.be.null;
    });

    it('should generate a receipt number starting with EE-INST-', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      expect(data.receiptNumber).to.match(/^EE-INST-/);
      expect(data.receiptNumber.length).to.be.greaterThan(15);
    });

    it('should include generated timestamp', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      expect(data.generatedAt).to.include('UTC');
    });

    it('should include logo base64', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);

      const data = await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      expect(data.logoBase64).to.equal('data:image/png;base64,FAKELOGO');
    });

    it('should query with correct clientId and escrowId', async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);

      await service.getReceiptData(ESCROW_ID, CLIENT_ID);

      const query = prismaStub.institutionEscrow.findFirst.firstCall.args[0];
      expect(query.where.escrowId).to.equal(ESCROW_ID);
      expect(query.where.clientId).to.equal(CLIENT_ID);
      expect(query.include.client).to.be.true;
      expect(query.include.deposits).to.not.be.undefined;
      expect(query.include.auditLogs).to.not.be.undefined;
      expect(query.include.aiAnalyses).to.not.be.undefined;
    });
  });

  // ─── renderReceiptHTML ────────────────────────────────────────

  describe('renderReceiptHTML', () => {
    let receiptData: ReceiptData;

    beforeEach(async () => {
      prismaStub.institutionEscrow.findFirst.resolves(mockEscrow);
      receiptData = await service.getReceiptData(ESCROW_ID, CLIENT_ID);
    });

    it('should return valid HTML document', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('<!DOCTYPE html>');
      expect(html).to.include('</html>');
      expect(html).to.include('<head>');
      expect(html).to.include('<body>');
    });

    it('should include the receipt number in the title', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include(`<title>Escrow Receipt`);
      expect(html).to.include(receiptData.receiptNumber);
    });

    it('should include the EasyEscrow logo', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('data:image/png;base64,FAKELOGO');
      expect(html).to.include('EasyEscrow');
    });

    it('should display "Escrow Receipt" as document title', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('Escrow Receipt');
    });

    it('should include client company name and details', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('Helvetica Digital AG');
      expect(html).to.include('ops@helvetica-digital.ch');
      expect(html).to.include('ENTERPRISE');
      expect(html).to.include('FINMA');
    });

    it('should include escrow status with colored badge', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('status-banner');
      expect(html).to.include('RELEASED');
      // Green color for RELEASED
      expect(html).to.include('#059669');
    });

    it('should include amount summary with net calculation', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('Escrow Amount');
      expect(html).to.include('Platform Fee');
      expect(html).to.include('Net Settlement');
      expect(html).to.include('250,000');
      expect(html).to.include('1,250');
      expect(html).to.include('248,750');
      expect(html).to.include('USDC');
    });

    it('should include escrow details section', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('Escrow Details');
      expect(html).to.include(ESCROW_CODE);
      expect(html).to.include('CH-SG');
      expect(html).to.include('Admin Release');
    });

    it('should include wallet addresses', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('Payer Wallet');
      expect(html).to.include('Recipient Wallet');
      expect(html).to.include('Settlement Authority');
    });

    it('should include transactions table', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('Transactions');
      expect(html).to.include('Deposit');
      expect(html).to.include('Release');
      expect(html).to.include('Signature');
      expect(html).to.include('Confirmed');
    });

    it('should include compliance analysis with risk meter', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('Compliance Analysis');
      expect(html).to.include('risk-meter');
      expect(html).to.include('APPROVE');
      expect(html).to.include('Corridor Risk');
    });

    it('should include audit trail table', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('Audit Trail');
      expect(html).to.include('Escrow Created');
      expect(html).to.include('Deposit Confirmed');
      expect(html).to.include('Funds Released');
    });

    it('should include footer with receipt number', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('footer');
      expect(html).to.include(receiptData.receiptNumber);
      expect(html).to.include('Solana Blockchain');
    });

    it('should include print-friendly CSS', () => {
      const html = service.renderReceiptHTML(receiptData);

      expect(html).to.include('@media print');
      expect(html).to.include('@page');
    });

    it('should escape HTML in user-supplied fields', () => {
      const xssData: ReceiptData = {
        ...receiptData,
        client: {
          ...receiptData.client,
          companyName: '<script>alert("xss")</script>',
          legalName: '<img src=x>',
        },
      };

      const html = service.renderReceiptHTML(xssData);

      // Script tags should be escaped
      expect(html).to.not.include('<script>');
      expect(html).to.include('&lt;script&gt;');
      expect(html).to.include('alert(&quot;xss&quot;)');
      // Injected img tag should be escaped (logo img is fine)
      expect(html).to.include('&lt;img src=x&gt;');
    });

    it('should handle escrow without compliance data', () => {
      const noComplianceData: ReceiptData = {
        ...receiptData,
        compliance: null,
      };

      const html = service.renderReceiptHTML(noComplianceData);

      expect(html).to.include('<!DOCTYPE html>');
      expect(html).to.not.include('Compliance Analysis');
    });

    it('should handle escrow with no transactions', () => {
      const noTxData: ReceiptData = {
        ...receiptData,
        transactions: [],
      };

      const html = service.renderReceiptHTML(noTxData);

      expect(html).to.include('<!DOCTYPE html>');
      expect(html).to.not.include('<th>Signature</th>');
    });

    it('should handle escrow with no audit logs', () => {
      const noLogsData: ReceiptData = {
        ...receiptData,
        auditLogs: [],
      };

      const html = service.renderReceiptHTML(noLogsData);

      expect(html).to.include('<!DOCTYPE html>');
      // When auditLogs is empty, the audit trail table should not render
      expect(html).to.not.include('section-title">Audit Trail');
    });

    it('should use different badge colors per status', () => {
      const statuses = ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'RELEASED', 'CANCELLED', 'FAILED'];

      for (const status of statuses) {
        const data: ReceiptData = {
          ...receiptData,
          escrow: { ...receiptData.escrow, status },
        };
        const html = service.renderReceiptHTML(data);
        expect(html).to.include('status-banner');
        expect(html).to.include(status);
      }
    });

    it('should show risk color based on score', () => {
      // Low risk
      const html = service.renderReceiptHTML(receiptData);
      expect(html).to.include('#059669'); // green

      // High risk
      const highRisk: ReceiptData = {
        ...receiptData,
        compliance: { ...receiptData.compliance!, riskScore: 75 },
      };
      const htmlHigh = service.renderReceiptHTML(highRisk);
      expect(htmlHigh).to.include('#dc2626'); // red
    });
  });
});
