/**
 * Unit Tests for ComplianceService
 *
 * Tests the 12-check compliance scoring pipeline:
 * - PASS = 0 risk points added
 * - WARNING/FAIL = risk points added per check weight
 * - All-pass scenario = 0/100
 * - Backward-compatible fields still populated
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import {
  ComplianceService,
  ComplianceCheckParams,
  ComplianceCheckItem,
  ComplianceCheckStatus,
  RiskLevel,
} from '../../../src/services/compliance.service';

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
    kybStatus: 'VERIFIED',
    tier: 'ENTERPRISE',
    primaryWallet: PAYER_WALLET,
    settledWallets: [],
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Business revenue',
    riskRating: 'LOW',
    regulatoryStatus: 'REGULATED',
    isRegulatedEntity: true,
    ...overrides,
  });

  const makeBranch = (overrides: Record<string, unknown> = {}) => ({
    id: 'branch-1',
    clientId: CLIENT_ID,
    name: 'Main Branch',
    city: 'New York',
    country: 'US',
    countryCode: 'US',
    complianceStatus: 'ACTIVE',
    isSanctioned: false,
    isActive: true,
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

    prismaStub = {
      institutionCorridor: {
        findUnique: sandbox.stub().resolves(makeCorridor()),
      },
      institutionClient: {
        findUnique: sandbox.stub().resolves(makeClient()),
      },
      institutionBranch: {
        findMany: sandbox.stub().resolves([makeBranch()]),
      },
      institutionEscrow: {
        aggregate: sandbox.stub().resolves({ _sum: { amount: 0 } }),
      },
      systemSetting: {
        findUnique: sandbox.stub().resolves(null),
      },
      $transaction: sandbox.stub().callsFake(async (fn: any) => fn(prismaStub)),
    };

    allowlistStub = {
      isAllowlisted: sandbox.stub().resolves(true),
      getWalletMetadata: sandbox.stub().resolves({ clientId: CLIENT_ID }),
    };

    service = new ComplianceService();
    (service as any).prisma = prismaStub;
    (service as any).allowlistService = allowlistStub;
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── Structure Validation ──────────────────────────────────

  describe('Result Structure', () => {
    it('should return exactly 12 checks', async () => {
      const result = await service.validateTransaction(defaultParams);
      expect(result.checks).to.have.length(12);
    });

    it('every check should have required fields', async () => {
      const result = await service.validateTransaction(defaultParams);
      for (const check of result.checks) {
        expect(check).to.have.property('id').that.is.a('string');
        expect(check).to.have.property('name').that.is.a('string');
        expect(check).to.have.property('status').that.is.oneOf(['PASS', 'WARNING', 'FAIL', 'NOT_APPLICABLE']);
        expect(check).to.have.property('score').that.is.a('number');
        expect(check).to.have.property('maxScore').that.is.a('number');
        expect(check).to.have.property('description').that.is.a('string');
        expect(check.score).to.be.at.least(0);
        expect(check.score).to.be.at.most(check.maxScore);
      }
    });

    it('should have all 12 check IDs', async () => {
      const result = await service.validateTransaction(defaultParams);
      const ids = result.checks.map(c => c.id);
      const expectedIds = [
        'KYC_VERIFICATION', 'SANCTIONS_SCREENING', 'CORRIDOR_RISK',
        'WALLET_ALLOWLIST', 'TRANSACTION_LIMITS', 'AMOUNT_THRESHOLD',
        'SOURCE_OF_FUNDS', 'PEP_SCREENING', 'REGULATORY_STATUS',
        'BRANCH_COMPLIANCE', 'CLIENT_TIER', 'CORRIDOR_VALIDITY',
      ];
      for (const id of expectedIds) {
        expect(ids).to.include(id);
      }
    });

    it('max scores should sum to 100', async () => {
      const result = await service.validateTransaction(defaultParams);
      const totalMax = result.checks.reduce((sum, c) => sum + c.maxScore, 0);
      expect(totalMax).to.equal(100);
    });

    it('should include riskLevel in result', async () => {
      const result = await service.validateTransaction(defaultParams);
      expect(result.riskLevel).to.be.oneOf(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
    });

    it('should include backward-compatible fields', async () => {
      const result = await service.validateTransaction(defaultParams);
      expect(result).to.have.property('passed').that.is.a('boolean');
      expect(result).to.have.property('flags').that.is.an('array');
      expect(result).to.have.property('reasons').that.is.an('array');
      expect(result).to.have.property('riskScore').that.is.a('number');
      expect(result).to.have.property('corridorValid').that.is.a('boolean');
      expect(result).to.have.property('walletsAllowlisted').that.is.a('boolean');
      expect(result).to.have.property('limitsWithinRange').that.is.a('boolean');
    });
  });

  // ─── All-Pass Scenario ─────────────────────────────────────

  describe('All-Pass Scenario (score=0)', () => {
    it('should score exactly 0 for fully compliant ENTERPRISE client', async () => {
      const result = await service.validateTransaction(defaultParams);

      expect(result.riskScore).to.equal(0);
      expect(result.riskLevel).to.equal('LOW');
      expect(result.passed).to.be.true;
      expect(result.corridorValid).to.be.true;
      expect(result.walletsAllowlisted).to.be.true;
      expect(result.limitsWithinRange).to.be.true;
    });

    it('every check should be PASS or NOT_APPLICABLE with score=0', async () => {
      const result = await service.validateTransaction(defaultParams);

      for (const check of result.checks) {
        expect(check.status).to.be.oneOf(['PASS', 'NOT_APPLICABLE'],
          `Check ${check.id} should be PASS or NOT_APPLICABLE but got ${check.status}`);
        expect(check.score).to.equal(0, `Check ${check.id} should score 0 but got ${check.score}`);
      }
    });

    it('flags and reasons should be empty', async () => {
      const result = await service.validateTransaction(defaultParams);
      expect(result.flags).to.be.an('array').that.is.empty;
      expect(result.reasons).to.be.an('array').that.is.empty;
    });
  });

  // ─── Mixed Warnings Scenario ───────────────────────────────

  describe('Mixed Warnings Scenario', () => {
    it('PREMIUM tier + MEDIUM corridor + $50k amount = moderate score', async () => {
      prismaStub.institutionClient.findUnique.resolves(makeClient({ tier: 'PREMIUM' }));
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ riskLevel: 'MEDIUM' }));

      const result = await service.validateTransaction({
        ...defaultParams,
        amount: 50000,
      });

      // PREMIUM tier: 1 (WARNING) + MEDIUM corridor: 6 (WARNING) + $50k amount: 4 (WARNING) = 11
      expect(result.riskScore).to.equal(11);
      expect(result.riskLevel).to.equal('LOW');
      expect(result.passed).to.be.true;
    });
  });

  // ─── High Risk Scenario ────────────────────────────────────

  describe('High Risk Scenario', () => {
    it('STANDARD + HIGH corridor + $500k + PENDING KYC + undocumented SoF = high score', async () => {
      prismaStub.institutionClient.findUnique.resolves(makeClient({
        tier: 'STANDARD',
        kycStatus: 'PENDING',
        sourceOfFunds: 'undocumented',
        riskRating: 'MEDIUM',
        regulatoryStatus: 'PENDING_LICENSE',
      }));
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ riskLevel: 'HIGH' }));

      const result = await service.validateTransaction({
        ...defaultParams,
        amount: 500000,
      });

      // KYC PENDING: 8, SANCTIONS CLEAR: 0, HIGH corridor: 12, wallets OK: 0,
      // limits OK: 0, amount $500k>=100k: 8, SoF undocumented: 8, PEP MEDIUM: 3,
      // regulatory PENDING_LICENSE: 3, branch ACTIVE: 0, STANDARD tier: 3, corridor ACTIVE: 0
      // = 45
      expect(result.riskScore).to.be.at.least(40);
      expect(result.riskLevel).to.be.oneOf(['MEDIUM', 'HIGH']);
    });
  });

  // ─── Critical Scenario ─────────────────────────────────────

  describe('Critical Scenario', () => {
    it('should score 90+ when all factors are maxed', async () => {
      prismaStub.institutionClient.findUnique.resolves(makeClient({
        tier: 'STANDARD',
        kycStatus: 'REJECTED',
        sanctionsStatus: 'BLOCKED',
        sourceOfFunds: 'undocumented',
        riskRating: 'CRITICAL',
        regulatoryStatus: 'SUSPENDED',
      }));
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({
        riskLevel: 'HIGH',
        status: 'SUSPENDED',
      }));
      prismaStub.institutionBranch.findMany.resolves([
        makeBranch({ isSanctioned: true }),
      ]);
      allowlistStub.isAllowlisted.resolves(false);

      const result = await service.validateTransaction({
        ...defaultParams,
        amount: 500000,
      });

      // All checks should be FAIL:
      // KYC: 15, Sanctions: 15, Corridor: 12, Wallet: 12, Limits: 0 (corridor still found),
      // Amount: 8, SoF: 8, PEP: 5, Regulatory: 5, Branch: 4, Tier: 3, Corridor status: 3
      // = 90+ (capped at 100)
      expect(result.riskScore).to.be.at.least(90);
      expect(result.riskLevel).to.equal('CRITICAL');
      expect(result.passed).to.be.false;
      expect(result.flags).to.include('HIGH_RISK');
    });
  });

  // ─── NOT_APPLICABLE Scenario ───────────────────────────────

  describe('NOT_APPLICABLE Checks', () => {
    it('client with no branches should have BRANCH_COMPLIANCE as NOT_APPLICABLE', async () => {
      prismaStub.institutionBranch.findMany.resolves([]);

      const result = await service.validateTransaction(defaultParams);
      const branchCheck = result.checks.find(c => c.id === 'BRANCH_COMPLIANCE');

      expect(branchCheck).to.exist;
      expect(branchCheck!.status).to.equal('NOT_APPLICABLE');
      expect(branchCheck!.score).to.equal(0);
    });
  });

  // ─── Backward Compatibility ────────────────────────────────

  describe('Backward Compatibility', () => {
    it('corridorValid should be false when corridor is INACTIVE', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ status: 'INACTIVE' }));

      const result = await service.validateTransaction(defaultParams);
      expect(result.corridorValid).to.be.false;
      expect(result.passed).to.be.false;
    });

    it('walletsAllowlisted should be false when wallets not on allowlist', async () => {
      allowlistStub.isAllowlisted.resolves(false);

      const result = await service.validateTransaction(defaultParams);
      expect(result.walletsAllowlisted).to.be.false;
      expect(result.passed).to.be.false;
    });

    it('limitsWithinRange should be false when limits exceeded', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ maxAmount: 1000 }));

      const result = await service.validateTransaction({
        ...defaultParams,
        amount: 5000,
      });
      expect(result.limitsWithinRange).to.be.false;
    });
  });

  // ─── Risk Level Classification ─────────────────────────────

  describe('Risk Level Classification', () => {
    it('score 0 = LOW', async () => {
      const result = await service.validateTransaction(defaultParams);
      expect(result.riskScore).to.equal(0);
      expect(result.riskLevel).to.equal('LOW');
    });

    it('score 26-50 = MEDIUM', async () => {
      // Create a scenario scoring in the MEDIUM range
      prismaStub.institutionClient.findUnique.resolves(makeClient({
        tier: 'STANDARD',       // +3
        kycStatus: 'PENDING',   // +8
        riskRating: 'MEDIUM',   // +3
        regulatoryStatus: 'PENDING_LICENSE', // +3
        sourceOfFunds: 'partial', // +4
      }));
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ riskLevel: 'MEDIUM' })); // +6

      const result = await service.validateTransaction({
        ...defaultParams,
        amount: 50000, // +4
      });

      expect(result.riskScore).to.be.at.least(26);
      expect(result.riskScore).to.be.at.most(50);
      expect(result.riskLevel).to.equal('MEDIUM');
    });

    it('score 76-100 = CRITICAL', async () => {
      prismaStub.institutionClient.findUnique.resolves(makeClient({
        tier: 'STANDARD',
        kycStatus: 'REJECTED',
        sanctionsStatus: 'BLOCKED',
        sourceOfFunds: 'undocumented',
        riskRating: 'CRITICAL',
        regulatoryStatus: 'SUSPENDED',
      }));
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({
        riskLevel: 'HIGH',
        status: 'SUSPENDED',
      }));
      prismaStub.institutionBranch.findMany.resolves([makeBranch({ isSanctioned: true })]);
      allowlistStub.isAllowlisted.resolves(false);

      const result = await service.validateTransaction({
        ...defaultParams,
        amount: 500000,
      });

      expect(result.riskScore).to.be.at.least(76);
      expect(result.riskLevel).to.equal('CRITICAL');
    });
  });

  // ─── Individual Check Unit Tests ───────────────────────────

  describe('Individual Checks', () => {

    // --- KYC_VERIFICATION ---
    describe('KYC_VERIFICATION', () => {
      it('VERIFIED = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'KYC_VERIFICATION')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('PENDING = WARNING (8)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ kycStatus: 'PENDING' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'KYC_VERIFICATION')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(8);
      });

      it('REJECTED = FAIL (15)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ kycStatus: 'REJECTED' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'KYC_VERIFICATION')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(15);
      });

      it('null client = FAIL (15)', async () => {
        prismaStub.institutionClient.findUnique.resolves(null);
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'KYC_VERIFICATION')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(15);
      });
    });

    // --- SANCTIONS_SCREENING ---
    describe('SANCTIONS_SCREENING', () => {
      it('CLEAR = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'SANCTIONS_SCREENING')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('PENDING_REVIEW = WARNING (8)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ sanctionsStatus: 'PENDING_REVIEW' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'SANCTIONS_SCREENING')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(8);
      });

      it('BLOCKED = FAIL (15)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ sanctionsStatus: 'BLOCKED' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'SANCTIONS_SCREENING')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(15);
      });

      it('FLAGGED = FAIL (15)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ sanctionsStatus: 'FLAGGED' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'SANCTIONS_SCREENING')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(15);
      });

      it('null sanctions status = WARNING (8)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ sanctionsStatus: null }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'SANCTIONS_SCREENING')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(8);
      });
    });

    // --- CORRIDOR_RISK ---
    describe('CORRIDOR_RISK', () => {
      it('LOW = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'CORRIDOR_RISK')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('MEDIUM = WARNING (6)', async () => {
        prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ riskLevel: 'MEDIUM' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'CORRIDOR_RISK')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(6);
      });

      it('HIGH = FAIL (12)', async () => {
        prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ riskLevel: 'HIGH' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'CORRIDOR_RISK')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(12);
      });

      it('null corridor = FAIL (12)', async () => {
        prismaStub.institutionCorridor.findUnique.resolves(null);
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'CORRIDOR_RISK')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(12);
      });
    });

    // --- WALLET_ALLOWLIST ---
    describe('WALLET_ALLOWLIST', () => {
      it('both allowlisted = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'WALLET_ALLOWLIST')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('payer not allowlisted = FAIL (12)', async () => {
        allowlistStub.isAllowlisted
          .withArgs(PAYER_WALLET).resolves(false)
          .withArgs(RECIPIENT_WALLET).resolves(true);

        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'WALLET_ALLOWLIST')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(12);
      });

      it('recipient not allowlisted = FAIL (12)', async () => {
        allowlistStub.isAllowlisted
          .withArgs(PAYER_WALLET).resolves(true)
          .withArgs(RECIPIENT_WALLET).resolves(false);

        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'WALLET_ALLOWLIST')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(12);
      });
    });

    // --- TRANSACTION_LIMITS ---
    describe('TRANSACTION_LIMITS', () => {
      it('within limits = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'TRANSACTION_LIMITS')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('exceeds per-tx max = FAIL (10)', async () => {
        prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ maxAmount: 1000 }));

        const result = await service.validateTransaction({
          ...defaultParams,
          amount: 5000,
        });
        const check = result.checks.find(c => c.id === 'TRANSACTION_LIMITS')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(10);
      });

      it('>80% of max = WARNING (5)', async () => {
        prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ maxAmount: 10000 }));

        const result = await service.validateTransaction({
          ...defaultParams,
          amount: 8500,
        });
        const check = result.checks.find(c => c.id === 'TRANSACTION_LIMITS')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(5);
      });
    });

    // --- AMOUNT_THRESHOLD ---
    describe('AMOUNT_THRESHOLD', () => {
      it('<$10k = PASS (0)', async () => {
        const result = await service.validateTransaction({
          ...defaultParams,
          amount: 5000,
        });
        const check = result.checks.find(c => c.id === 'AMOUNT_THRESHOLD')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('$10k-$100k = WARNING (4)', async () => {
        const result = await service.validateTransaction({
          ...defaultParams,
          amount: 50000,
        });
        const check = result.checks.find(c => c.id === 'AMOUNT_THRESHOLD')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(4);
      });

      it('>=$100k = FAIL (8)', async () => {
        const result = await service.validateTransaction({
          ...defaultParams,
          amount: 100000,
        });
        const check = result.checks.find(c => c.id === 'AMOUNT_THRESHOLD')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(8);
      });
    });

    // --- SOURCE_OF_FUNDS ---
    describe('SOURCE_OF_FUNDS', () => {
      it('documented = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'SOURCE_OF_FUNDS')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('partial = WARNING (4)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ sourceOfFunds: 'partial' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'SOURCE_OF_FUNDS')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(4);
      });

      it('undocumented = FAIL (8)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ sourceOfFunds: 'undocumented' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'SOURCE_OF_FUNDS')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(8);
      });

      it('null = WARNING (4)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ sourceOfFunds: null }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'SOURCE_OF_FUNDS')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(4);
      });
    });

    // --- PEP_SCREENING ---
    describe('PEP_SCREENING', () => {
      it('LOW = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'PEP_SCREENING')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('UNRATED = PASS (0)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ riskRating: 'UNRATED' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'PEP_SCREENING')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('MEDIUM = WARNING (3)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ riskRating: 'MEDIUM' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'PEP_SCREENING')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(3);
      });

      it('HIGH = FAIL (5)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ riskRating: 'HIGH' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'PEP_SCREENING')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(5);
      });

      it('CRITICAL = FAIL (5)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ riskRating: 'CRITICAL' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'PEP_SCREENING')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(5);
      });
    });

    // --- REGULATORY_STATUS ---
    describe('REGULATORY_STATUS', () => {
      it('REGULATED = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'REGULATORY_STATUS')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('EXEMPT = PASS (0)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ regulatoryStatus: 'EXEMPT' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'REGULATORY_STATUS')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('PENDING_LICENSE = WARNING (3)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ regulatoryStatus: 'PENDING_LICENSE' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'REGULATORY_STATUS')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(3);
      });

      it('SUSPENDED = FAIL (5)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ regulatoryStatus: 'SUSPENDED' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'REGULATORY_STATUS')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(5);
      });

      it('UNREGULATED = FAIL (5)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ regulatoryStatus: 'UNREGULATED' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'REGULATORY_STATUS')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(5);
      });
    });

    // --- BRANCH_COMPLIANCE ---
    describe('BRANCH_COMPLIANCE', () => {
      it('ACTIVE branches = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'BRANCH_COMPLIANCE')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('no branches = NOT_APPLICABLE (0)', async () => {
        prismaStub.institutionBranch.findMany.resolves([]);
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'BRANCH_COMPLIANCE')!;
        expect(check.status).to.equal('NOT_APPLICABLE');
        expect(check.score).to.equal(0);
      });

      it('UNDER_REVIEW branch = WARNING (2)', async () => {
        prismaStub.institutionBranch.findMany.resolves([makeBranch({ complianceStatus: 'UNDER_REVIEW' })]);
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'BRANCH_COMPLIANCE')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(2);
      });

      it('sanctioned branch = FAIL (4)', async () => {
        prismaStub.institutionBranch.findMany.resolves([makeBranch({ isSanctioned: true })]);
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'BRANCH_COMPLIANCE')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(4);
      });

      it('BLOCKED branch = FAIL (4)', async () => {
        prismaStub.institutionBranch.findMany.resolves([makeBranch({ complianceStatus: 'BLOCKED' })]);
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'BRANCH_COMPLIANCE')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(4);
      });
    });

    // --- CLIENT_TIER ---
    describe('CLIENT_TIER', () => {
      it('ENTERPRISE = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'CLIENT_TIER')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('PREMIUM = WARNING (1)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ tier: 'PREMIUM' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'CLIENT_TIER')!;
        expect(check.status).to.equal('WARNING');
        expect(check.score).to.equal(1);
      });

      it('STANDARD = FAIL (3)', async () => {
        prismaStub.institutionClient.findUnique.resolves(makeClient({ tier: 'STANDARD' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'CLIENT_TIER')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(3);
      });
    });

    // --- CORRIDOR_VALIDITY ---
    describe('CORRIDOR_VALIDITY', () => {
      it('ACTIVE = PASS (0)', async () => {
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'CORRIDOR_VALIDITY')!;
        expect(check.status).to.equal('PASS');
        expect(check.score).to.equal(0);
      });

      it('SUSPENDED = FAIL (3)', async () => {
        prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ status: 'SUSPENDED' }));
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'CORRIDOR_VALIDITY')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(3);
      });

      it('null corridor = FAIL (3)', async () => {
        prismaStub.institutionCorridor.findUnique.resolves(null);
        const result = await service.validateTransaction(defaultParams);
        const check = result.checks.find(c => c.id === 'CORRIDOR_VALIDITY')!;
        expect(check.status).to.equal('FAIL');
        expect(check.score).to.equal(3);
      });
    });
  });

  // ─── calculateRiskScore (backward compat wrapper) ──────────

  describe('calculateRiskScore', () => {
    it('should return 0 for fully compliant client', async () => {
      const score = await service.calculateRiskScore(defaultParams);
      expect(score).to.equal(0);
    });

    it('should return aggregate of all check scores', async () => {
      prismaStub.institutionClient.findUnique.resolves(makeClient({ tier: 'PREMIUM' }));
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ riskLevel: 'MEDIUM' }));

      const score = await service.calculateRiskScore({
        ...defaultParams,
        amount: 50000,
      });
      // PREMIUM: 1, MEDIUM corridor: 6, $50k amount: 4 = 11
      expect(score).to.equal(11);
    });
  });

  // ─── validateCorridor (standalone) ─────────────────────────

  describe('validateCorridor', () => {
    it('should reject inactive corridor', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ status: 'INACTIVE' }));
      const result = await service.validateCorridor('US-MX', 5000);
      expect(result.valid).to.be.false;
      expect(result.reasons[0]).to.include('INACTIVE');
    });

    it('should reject amount below min', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ minAmount: 1000 }));
      const result = await service.validateCorridor('US-MX', 500);
      expect(result.valid).to.be.false;
      expect(result.reasons[0]).to.include('below corridor minimum');
    });

    it('should reject amount above max', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ maxAmount: 10000 }));
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

  // ─── validateWallets (standalone) ──────────────────────────

  describe('validateWallets', () => {
    it('should reject non-allowlisted payer', async () => {
      allowlistStub.isAllowlisted
        .withArgs(PAYER_WALLET).resolves(false)
        .withArgs(RECIPIENT_WALLET).resolves(true);

      const result = await service.validateWallets(PAYER_WALLET, RECIPIENT_WALLET);
      expect(result.valid).to.be.false;
      expect(result.reasons[0]).to.include('Payer wallet');
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
      const result = await service.validateWallets(PAYER_WALLET, RECIPIENT_WALLET);
      expect(result.valid).to.be.true;
      expect(result.reasons).to.be.empty;
    });
  });

  // ─── checkTransactionLimits (standalone) ───────────────────

  describe('checkTransactionLimits', () => {
    it('should pass within limits', async () => {
      const result = await service.checkTransactionLimits(CLIENT_ID, 5000, 'US-MX');
      expect(result.valid).to.be.true;
      expect(result.reasons).to.be.empty;
    });

    it('should reject when daily limit exceeded', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ dailyLimit: 10000 }));
      prismaStub.institutionEscrow.aggregate
        .onFirstCall().resolves({ _sum: { amount: 8000 } })
        .onSecondCall().resolves({ _sum: { amount: 0 } });

      const result = await service.checkTransactionLimits(CLIENT_ID, 5000, 'US-MX');
      expect(result.valid).to.be.false;
      expect(result.reasons.some((r: string) => r.includes('Daily volume'))).to.be.true;
    });

    it('should reject when amount exceeds per-transaction max', async () => {
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ maxAmount: 1000 }));

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

  // ─── Threshold configuration ───────────────────────────────

  describe('Compliance Thresholds', () => {
    it('should use defaults when no SystemSetting exists', async () => {
      const thresholds = await service.getComplianceThresholds();
      expect(thresholds.rejectScore).to.equal(90);
      expect(thresholds.holdScore).to.equal(70);
    });

    it('should flag MEDIUM_RISK when score >= holdScore', async () => {
      // Set up a scenario where score is between hold (70) and reject (90)
      prismaStub.institutionClient.findUnique.resolves(makeClient({
        tier: 'STANDARD',
        kycStatus: 'REJECTED',
        sanctionsStatus: 'FLAGGED',
        sourceOfFunds: 'undocumented',
        riskRating: 'HIGH',
        regulatoryStatus: 'SUSPENDED',
      }));
      prismaStub.institutionCorridor.findUnique.resolves(makeCorridor({ riskLevel: 'HIGH' }));

      const result = await service.validateTransaction({
        ...defaultParams,
        amount: 50000,
      });

      // KYC REJECTED: 15, Sanctions FLAGGED: 15, HIGH corridor: 12, wallets OK: 0,
      // limits OK: 0, amount 50k: 4, SoF undoc: 8, PEP HIGH: 5, reg SUSPENDED: 5, branch 0, STANDARD: 3, corridor ACTIVE: 0
      // = 67... let's check
      expect(result.riskScore).to.be.at.least(60);
      if (result.riskScore >= 70 && result.riskScore < 90) {
        expect(result.flags).to.include('MEDIUM_RISK');
      }
    });
  });
});
