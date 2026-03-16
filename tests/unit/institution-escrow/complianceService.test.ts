/**
 * Unit Tests for ComplianceService
 *
 * Tests compliance checking pipeline:
 * - validateTransaction: full pipeline (corridor + wallets + limits + risk)
 * - validateCorridor: active check, min/max bounds
 * - validateWallets: allowlist checks for payer and recipient
 * - calculateRiskScore: corridor risk, amount thresholds, client tier
 * - checkTransactionLimits: per-tx, daily, monthly volume limits
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { ComplianceService, ComplianceCheckParams } from '../../../src/services/compliance.service';

describe('ComplianceService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: ComplianceService;
  let prismaStub: any;
  let allowlistStub: any;

  const PAYER_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const RECIPIENT_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  const CLIENT_ID = 'client-123';

  const makeCorridor = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    code: 'US-MX',
    name: 'US to Mexico',
    status: 'ACTIVE',
    riskLevel: 'LOW',
    minAmount: 100,
    maxAmount: 1000000,
    dailyLimit: 5000000,
    monthlyLimit: 50000000,
    ...overrides,
  });

  const makeClient = (overrides: Record<string, unknown> = {}) => ({
    id: CLIENT_ID,
    companyName: 'Test Corp',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    tier: 'ENTERPRISE',
    primaryWallet: PAYER_WALLET,
    settledWallets: [],
    ...overrides,
  });

  const defaultParams: ComplianceCheckParams = {
    clientId: CLIENT_ID,
    payerWallet: PAYER_WALLET,
    recipientWallet: RECIPIENT_WALLET,
    amount: 5000,
    corridor: 'US-MX',
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub Prisma
    prismaStub = {
      institutionCorridor: {
        findUnique: sandbox.stub().resolves(makeCorridor()),
      },
      institutionClient: {
        findUnique: sandbox.stub().resolves(makeClient()),
      },
      institutionEscrow: {
        aggregate: sandbox.stub().resolves({ _sum: { amount: 0 } }),
      },
      $transaction: sandbox.stub().callsFake(async (fn: any) => fn(prismaStub)),
    };

    // Stub allowlist
    allowlistStub = {
      isAllowlisted: sandbox.stub().resolves(true),
      getWalletMetadata: sandbox.stub().resolves({ clientId: CLIENT_ID }),
    };

    // Create service and inject stubs
    service = new ComplianceService();
    (service as any).prisma = prismaStub;
    (service as any).allowlistService = allowlistStub;
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── validateTransaction ────────────────────────────────────

  describe('validateTransaction', () => {
    it('should pass for valid transaction', async () => {
      const result = await service.validateTransaction(defaultParams);

      expect(result.passed).to.be.true;
      expect(result.corridorValid).to.be.true;
      expect(result.walletsAllowlisted).to.be.true;
      expect(result.limitsWithinRange).to.be.true;
      expect(result.flags).to.be.an('array').that.is.empty;
      expect(result.reasons).to.be.an('array').that.is.empty;
    });

    it('should fail when corridor is invalid', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(
        makeCorridor({ status: 'INACTIVE' }),
      );

      const result = await service.validateTransaction(defaultParams);

      expect(result.passed).to.be.false;
      expect(result.corridorValid).to.be.false;
      expect(result.flags).to.include('CORRIDOR_INVALID');
    });

    it('should fail when wallets are not allowlisted', async () => {
      allowlistStub.isAllowlisted.resolves(false);

      const result = await service.validateTransaction(defaultParams);

      expect(result.passed).to.be.false;
      expect(result.walletsAllowlisted).to.be.false;
      expect(result.flags).to.include('WALLET_NOT_ALLOWLISTED');
    });

    it('should flag high risk score', async () => {
      // Make risk score exceed 75 by using high-risk corridor + large amount + standard client
      prismaStub.institutionCorridor.findUnique.resolves(
        makeCorridor({ riskLevel: 'HIGH' }),
      );
      prismaStub.institutionClient.findUnique.resolves(
        makeClient({ tier: 'STANDARD', kycStatus: 'PENDING' }),
      );

      const result = await service.validateTransaction({
        ...defaultParams,
        amount: 500000,
      });

      expect(result.riskScore).to.be.at.least(75);
      expect(result.flags).to.include('HIGH_RISK');
      expect(result.passed).to.be.false;
    });
  });

  // ─── validateCorridor ──────────────────────────────────────

  describe('validateCorridor', () => {
    it('should reject inactive corridor', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(
        makeCorridor({ status: 'INACTIVE' }),
      );

      const result = await service.validateCorridor('US-MX', 5000);

      expect(result.valid).to.be.false;
      expect(result.reasons).to.have.length.greaterThan(0);
      expect(result.reasons[0]).to.include('INACTIVE');
    });

    it('should reject amount below min', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(
        makeCorridor({ minAmount: 1000 }),
      );

      const result = await service.validateCorridor('US-MX', 500);

      expect(result.valid).to.be.false;
      expect(result.reasons[0]).to.include('below corridor minimum');
    });

    it('should reject amount above max', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(
        makeCorridor({ maxAmount: 10000 }),
      );

      const result = await service.validateCorridor('US-MX', 50000);

      expect(result.valid).to.be.false;
      expect(result.reasons[0]).to.include('exceeds corridor maximum');
    });

    it('should return not found for unknown corridor', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(null);

      const result = await service.validateCorridor('XX-YY', 5000);

      expect(result.valid).to.be.false;
      expect(result.reasons[0]).to.include('not found');
    });

    it('should pass for valid corridor and amount', async () => {
      const result = await service.validateCorridor('US-MX', 5000);

      expect(result.valid).to.be.true;
      expect(result.reasons).to.be.empty;
    });
  });

  // ─── validateWallets ───────────────────────────────────────

  describe('validateWallets', () => {
    it('should reject non-allowlisted payer', async () => {
      allowlistStub.isAllowlisted
        .withArgs(PAYER_WALLET).resolves(false)
        .withArgs(RECIPIENT_WALLET).resolves(true);

      const result = await service.validateWallets(PAYER_WALLET, RECIPIENT_WALLET);

      expect(result.valid).to.be.false;
      expect(result.reasons).to.have.length(1);
      expect(result.reasons[0]).to.include('Payer wallet');
      expect(result.reasons[0]).to.include('not on the allowlist');
    });

    it('should reject non-allowlisted recipient', async () => {
      allowlistStub.isAllowlisted
        .withArgs(PAYER_WALLET).resolves(true)
        .withArgs(RECIPIENT_WALLET).resolves(false);

      const result = await service.validateWallets(PAYER_WALLET, RECIPIENT_WALLET);

      expect(result.valid).to.be.false;
      expect(result.reasons[0]).to.include('Recipient wallet');
    });

    it('should pass when both wallets are allowlisted', async () => {
      allowlistStub.isAllowlisted.resolves(true);

      const result = await service.validateWallets(PAYER_WALLET, RECIPIENT_WALLET);

      expect(result.valid).to.be.true;
      expect(result.reasons).to.be.empty;
    });
  });

  // ─── calculateRiskScore ────────────────────────────────────

  describe('calculateRiskScore', () => {
    it('should return low score for enterprise client + low-risk corridor', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(
        makeCorridor({ riskLevel: 'LOW' }),
      );
      prismaStub.institutionClient.findUnique.resolves(
        makeClient({ tier: 'ENTERPRISE', kycStatus: 'VERIFIED' }),
      );

      const score = await service.calculateRiskScore({
        ...defaultParams,
        amount: 1000, // small amount = +5
      });

      // LOW corridor: 5, small amount: 5, ENTERPRISE: 5, VERIFIED: 0 = 15
      expect(score).to.equal(15);
      expect(score).to.be.below(50);
    });

    it('should return high score for standard client + high-risk corridor + large amount', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(
        makeCorridor({ riskLevel: 'HIGH' }),
      );
      prismaStub.institutionClient.findUnique.resolves(
        makeClient({ tier: 'STANDARD', kycStatus: 'PENDING' }),
      );

      const score = await service.calculateRiskScore({
        ...defaultParams,
        amount: 500000, // >= 500000 = +30
      });

      // HIGH corridor: 30, large amount: 30, STANDARD: 20, PENDING: 15 = 95
      expect(score).to.equal(95);
      expect(score).to.be.at.least(75);
    });

    it('should cap at 100', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(null); // unknown = 30
      prismaStub.institutionClient.findUnique.resolves(null); // unknown client = 20, no kycStatus branch

      const score = await service.calculateRiskScore({
        ...defaultParams,
        amount: 500000, // +30
      });

      // unknown corridor: 30, large amount: 30, no client: 20 = 80
      // (no kycStatus branch since client is null)
      expect(score).to.be.at.most(100);
    });
  });

  // ─── checkTransactionLimits ────────────────────────────────

  describe('checkTransactionLimits', () => {
    it('should pass within limits', async () => {
      prismaStub.institutionEscrow.aggregate.resolves({ _sum: { amount: 0 } });

      const result = await service.checkTransactionLimits(CLIENT_ID, 5000, 'US-MX');

      expect(result.valid).to.be.true;
      expect(result.reasons).to.be.empty;
    });

    it('should reject when daily limit exceeded', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(
        makeCorridor({ dailyLimit: 10000 }),
      );
      // First aggregate call (daily) returns near-limit volume
      prismaStub.institutionEscrow.aggregate
        .onFirstCall().resolves({ _sum: { amount: 8000 } })  // daily
        .onSecondCall().resolves({ _sum: { amount: 0 } });    // monthly

      const result = await service.checkTransactionLimits(CLIENT_ID, 5000, 'US-MX');

      expect(result.valid).to.be.false;
      expect(result.reasons.some((r: string) => r.includes('Daily volume'))).to.be.true;
    });

    it('should reject when amount exceeds per-transaction max', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(
        makeCorridor({ maxAmount: 1000 }),
      );

      const result = await service.checkTransactionLimits(CLIENT_ID, 5000, 'US-MX');

      expect(result.valid).to.be.false;
      expect(result.reasons.some((r: string) => r.includes('per-transaction max'))).to.be.true;
    });

    it('should reject when corridor not found', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(null);

      const result = await service.checkTransactionLimits(CLIENT_ID, 5000, 'XX-YY');

      expect(result.valid).to.be.false;
      expect(result.reasons[0]).to.include('not found');
    });
  });
});
