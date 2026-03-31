/**
 * Unit Tests for InstitutionBootstrapService
 *
 * Tests the bootstrap endpoint that returns all app data after login.
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.INSTITUTION_ESCROW_ENABLED = 'true';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Unit tests must run with NODE_ENV=test');
}

import { setMockPrismaClient, clearMockPrismaClient } from '../../../src/config/database';

const CLIENT_ID = 'client-bootstrap-123';

const makeClient = () => ({
  id: CLIENT_ID,
  email: 'test@corp.com',
  passwordHash: '$2b$12$hashedsecret',
  companyName: 'Test Corp',
  tier: 'STANDARD',
  status: 'ACTIVE',
  kycStatus: 'VERIFIED',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeSettings = () => ({
  id: 'settings-1',
  clientId: CLIENT_ID,
  defaultCorridor: 'SG-CH',
  defaultCurrency: 'USDC',
  timezone: 'UTC',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeWallet = () => ({
  id: 'wallet-1',
  clientId: CLIENT_ID,
  name: 'Primary',
  address: 'SoLwAlLeT123',
  chain: 'solana',
  isPrimary: true,
  isSettlement: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeAccount = () => ({
  id: 'account-1',
  clientId: CLIENT_ID,
  name: 'Treasury',
  accountType: 'TREASURY',
  isDefault: true,
  isActive: true,
  walletAddress: 'SoLwAlLeT123',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeCorridor = () => ({
  id: 'corridor-1',
  code: 'SG-CH',
  sourceCountry: 'SG',
  destCountry: 'CH',
  minAmount: { toNumber: () => 100 },
  maxAmount: { toNumber: () => 1000000 },
  dailyLimit: { toNumber: () => 5000000 },
  monthlyLimit: { toNumber: () => 50000000 },
  requiredDocuments: ['INVOICE'],
  riskLevel: 'LOW',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('InstitutionBootstrapService', function () {
  this.timeout(10000);

  let sandbox: sinon.SinonSandbox;
  let prismaStub: any;
  let bootstrapService: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    const corridor = makeCorridor();

    prismaStub = {
      institutionClient: {
        findUnique: sandbox.stub().resolves(makeClient()),
      },
      institutionClientSettings: {
        findUnique: sandbox.stub().resolves(makeSettings()),
      },
      institutionWallet: {
        findMany: sandbox.stub().resolves([makeWallet()]),
      },
      institutionAccount: {
        findMany: sandbox.stub().resolves([makeAccount()]),
      },
      institutionApprovedToken: {
        findMany: sandbox.stub().resolves([
          {
            symbol: 'USDC',
            name: 'USD Coin',
            mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            decimals: 6,
            issuer: 'Circle',
            jurisdiction: 'US',
            chain: 'solana',
            isDefault: true,
            isActive: true,
            aminaApproved: true,
          },
        ]),
      },
      institutionCorridor: {
        findMany: sandbox.stub().resolves([corridor]),
      },
      institutionNotification: {
        count: sandbox.stub().resolves(3),
      },
      systemSetting: {
        findUnique: sandbox.stub().resolves(null),
      },
    };

    setMockPrismaClient(prismaStub as any);

    // Clear module caches for fresh instances
    delete require.cache[require.resolve('../../../src/services/institution-bootstrap.service')];
    delete require.cache[require.resolve('../../../src/services/compliance.service')];

    // Mock compliance service to avoid its own PrismaClient
    const complianceModule = require('../../../src/services/compliance.service');
    const mockComplianceService = {
      getComplianceThresholds: sandbox.stub().resolves({ rejectScore: 90, holdScore: 70 }),
    };
    sandbox.stub(complianceModule, 'getComplianceService').returns(mockComplianceService);

    const bootstrapModule = require('../../../src/services/institution-bootstrap.service');
    bootstrapService = bootstrapModule.getInstitutionBootstrapService();
  });

  afterEach(() => {
    sandbox.restore();
    clearMockPrismaClient();
  });

  it('should return complete bootstrap data', async () => {
    const result = await bootstrapService.getBootstrapData(CLIENT_ID);

    // Client returned and sanitized (no passwordHash)
    expect(result.client).to.exist;
    expect(result.client.email).to.equal('test@corp.com');
    expect(result.client.companyName).to.equal('Test Corp');
    expect(result.client).to.not.have.property('passwordHash');

    // Settings
    expect(result.settings).to.exist;
    expect(result.settings.defaultCorridor).to.equal('SG-CH');

    // Wallets
    expect(result.wallets).to.be.an('array').with.lengthOf(1);
    expect(result.wallets[0].name).to.equal('Primary');

    // Accounts
    expect(result.accounts).to.be.an('array').with.lengthOf(1);
    expect(result.accounts[0].accountType).to.equal('TREASURY');

    // Approved tokens
    expect(result.approvedTokens).to.be.an('array').with.lengthOf(1);
    expect(result.approvedTokens[0].symbol).to.equal('USDC');

    // Corridors
    expect(result.corridors).to.be.an('array').with.lengthOf(1);
    expect(result.corridors[0].code).to.equal('SG-CH');

    // Notifications
    expect(result.notifications.unreadCount).to.equal(3);

    // System
    expect(result.system).to.exist;
    expect(result.system.paused).to.be.false;
    expect(result.system.escrowLimits).to.exist;

    // Enums
    expect(result.enums).to.exist;
    expect(result.enums.escrowStatus).to.include('DRAFT');
    expect(result.enums.escrowStatus).to.include('FUNDED');
    expect(result.enums.conditionType).to.include('ADMIN_RELEASE');
    expect(result.enums.clientTier).to.include('ENTERPRISE');
    expect(result.enums.accountType).to.include('TREASURY');
    expect(result.enums.documentType).to.include('INVOICE');
  });

  it('should throw when client not found', async () => {
    prismaStub.institutionClient.findUnique.resolves(null);

    try {
      await bootstrapService.getBootstrapData(CLIENT_ID);
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.message).to.equal('Client not found');
    }
  });

  it('should handle system pause state', async () => {
    prismaStub.systemSetting.findUnique.resolves({
      key: 'institution.escrow.paused',
      value: { paused: true },
    });

    const result = await bootstrapService.getBootstrapData(CLIENT_ID);
    expect(result.system.paused).to.be.true;
  });

  it('should return empty settings when none configured', async () => {
    prismaStub.institutionClientSettings.findUnique.resolves(null);

    const result = await bootstrapService.getBootstrapData(CLIENT_ID);
    expect(result.settings).to.deep.equal({});
  });

  it('should return all enum categories', async () => {
    const result = await bootstrapService.getBootstrapData(CLIENT_ID);

    const expectedEnumKeys = [
      'escrowStatus', 'conditionType', 'clientTier', 'clientStatus',
      'documentType', 'entityType', 'kybStatus', 'riskRating',
      'regulatoryStatus', 'sanctionsStatus', 'walletCustodyType',
      'accountType', 'accountVerificationStatus', 'approvalMode',
      'corridorRiskLevel', 'notificationType', 'notificationPriority',
      'employeeCountRange', 'annualRevenueRange',
    ];

    for (const key of expectedEnumKeys) {
      expect(result.enums).to.have.property(key);
      expect(result.enums[key]).to.be.an('array').that.is.not.empty;
    }
  });
});
