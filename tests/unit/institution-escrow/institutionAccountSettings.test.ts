/**
 * Unit Tests for Institution Account Settings
 *
 * Tests the account-level settings endpoints:
 * - getClientProfile: comprehensive client profile view
 * - getAccountSettings: per-account settings view
 * - updateAccountSettings: toggle settings, set default currency
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { InstitutionAccountService } from '../../../src/services/institution-account.service';

describe('InstitutionAccountService - Account Settings', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionAccountService;
  let prismaStub: any;

  const CLIENT_ID = 'client-123';
  const ACCOUNT_ID = 'account-456';

  const mockAccount = {
    id: ACCOUNT_ID,
    clientId: CLIENT_ID,
    name: 'Main Treasury',
    label: 'Primary',
    accountType: 'TREASURY',
    walletAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    chain: 'solana',
    defaultCurrency: 'USDC',
    isDefault: true,
    isActive: true,
    notifyOnEscrowCreated: true,
    notifyOnEscrowFunded: true,
    notifyOnEscrowReleased: true,
    notifyOnComplianceAlert: true,
    notificationEmail: 'treasury@example.com',
    webhookUrl: null,
    approvalMode: 'AUTO',
    approvalThreshold: null,
    whitelistEnforced: false,
    verificationStatus: 'VERIFIED',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockClient = {
    id: CLIENT_ID,
    companyName: 'Helvetica Digital',
    legalName: 'Helvetica Digital AG',
    tradingName: null,
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    kybStatus: 'VERIFIED',
    jurisdiction: 'CH',
    entityType: 'CORPORATION',
    registrationNumber: 'CHE-123.456.789',
    registrationCountry: 'CH',
    industry: 'Financial Services',
    websiteUrl: 'https://helvetica.digital',
    businessDescription: 'Cross-border stablecoin payments',
    yearEstablished: 2020,
    contactFirstName: 'Max',
    contactLastName: 'Mueller',
    contactEmail: 'max@helvetica.digital',
    contactTitle: 'CTO',
    addressLine1: 'Bahnhofstrasse 42',
    addressLine2: null,
    city: 'Zurich',
    state: 'ZH',
    postalCode: '8001',
    country: 'CH',
    riskRating: 'LOW',
    isRegulatedEntity: true,
    regulatoryStatus: 'LICENSED',
    licenseType: 'FINMA DLT',
    regulatoryBody: 'FINMA',
    accountManagerName: 'Sarah Chen',
    accountManagerEmail: 'sarah.chen@easyescrow.ai',
    onboardingCompletedAt: new Date('2025-06-15'),
    nextReviewDate: new Date('2026-06-15'),
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: {
      defaultCurrency: 'USDC',
      defaultCorridor: 'CH-SG',
      timezone: 'Europe/Zurich',
      emailNotifications: true,
      language: 'en',
      theme: 'light',
      twoFactorEnabled: true,
      aiRecommendations: true,
      riskTolerance: 'low',
      defaultToken: 'usdc',
    },
    accounts: [
      {
        id: ACCOUNT_ID,
        name: 'Main Treasury',
        label: 'Primary',
        accountType: 'TREASURY',
        walletAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        verificationStatus: 'VERIFIED',
        defaultCurrency: 'USDC',
        isDefault: true,
        isActive: true,
      },
    ],
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    service = new InstitutionAccountService();

    // Stub the prisma property
    prismaStub = {
      institutionClient: {
        findUnique: sandbox.stub(),
      },
      institutionAccount: {
        findFirst: sandbox.stub(),
        update: sandbox.stub(),
      },
    };

    (service as any).prisma = prismaStub;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getClientProfile()', () => {
    it('should return full client profile with settings and accounts', async () => {
      prismaStub.institutionClient.findUnique.resolves(mockClient);

      const result = await service.getClientProfile(CLIENT_ID);

      expect(result.companyName).to.equal('Helvetica Digital');
      expect(result.tier).to.equal('ENTERPRISE');
      expect(result.kycStatus).to.equal('VERIFIED');
      expect(result.settings).to.exist;
      expect(result.settings?.defaultCurrency).to.equal('USDC');
      expect(result.accounts).to.be.an('array').with.length(1);
      expect(result.accounts[0].name).to.equal('Main Treasury');
      expect(result.accounts[0].defaultCurrency).to.equal('USDC');
    });

    it('should throw error for non-existent client', async () => {
      prismaStub.institutionClient.findUnique.resolves(null);

      try {
        await service.getClientProfile('non-existent');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Client not found');
      }
    });
  });

  describe('getAccountSettings()', () => {
    it('should return account settings with toggles and currency', async () => {
      prismaStub.institutionAccount.findFirst.resolves({
        id: ACCOUNT_ID,
        name: 'Main Treasury',
        label: 'Primary',
        accountType: 'TREASURY',
        defaultCurrency: 'USDC',
        isActive: true,
        isDefault: true,
        notifyOnEscrowCreated: true,
        notifyOnEscrowFunded: true,
        notifyOnEscrowReleased: true,
        notifyOnComplianceAlert: true,
        notificationEmail: 'treasury@example.com',
        webhookUrl: null,
        approvalMode: 'AUTO',
        approvalThreshold: null,
        whitelistEnforced: false,
      });

      const result = await service.getAccountSettings(CLIENT_ID, ACCOUNT_ID);

      expect(result.defaultCurrency).to.equal('USDC');
      expect(result.notifyOnEscrowCreated).to.be.true;
      expect(result.notifyOnEscrowFunded).to.be.true;
      expect(result.isActive).to.be.true;
      expect(result.approvalMode).to.equal('AUTO');
    });

    it('should throw error for non-existent account', async () => {
      prismaStub.institutionAccount.findFirst.resolves(null);

      try {
        await service.getAccountSettings(CLIENT_ID, 'non-existent');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Account not found');
      }
    });
  });

  describe('updateAccountSettings()', () => {
    it('should update defaultCurrency', async () => {
      prismaStub.institutionAccount.findFirst.resolves(mockAccount);
      prismaStub.institutionAccount.update.resolves({
        ...mockAccount,
        defaultCurrency: 'EURC',
      });

      const result = await service.updateAccountSettings(CLIENT_ID, ACCOUNT_ID, {
        defaultCurrency: 'EURC',
      });

      expect(result.defaultCurrency).to.equal('EURC');
      expect(prismaStub.institutionAccount.update.calledOnce).to.be.true;
    });

    it('should normalize currency to uppercase', async () => {
      prismaStub.institutionAccount.findFirst.resolves(mockAccount);
      prismaStub.institutionAccount.update.resolves({
        ...mockAccount,
        defaultCurrency: 'USDT',
      });

      await service.updateAccountSettings(CLIENT_ID, ACCOUNT_ID, {
        defaultCurrency: 'usdt',
      });

      const updateCall = prismaStub.institutionAccount.update.firstCall;
      expect(updateCall.args[0].data.defaultCurrency).to.equal('USDT');
    });

    it('should reject invalid currency', async () => {
      prismaStub.institutionAccount.findFirst.resolves(mockAccount);

      try {
        await service.updateAccountSettings(CLIENT_ID, ACCOUNT_ID, {
          defaultCurrency: 'BTC',
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.include('Invalid currency');
        expect(error.message).to.include('USDC, USDT, EURC');
      }
    });

    it('should toggle notification settings', async () => {
      prismaStub.institutionAccount.findFirst.resolves(mockAccount);
      prismaStub.institutionAccount.update.resolves({
        ...mockAccount,
        notifyOnEscrowCreated: false,
        notifyOnComplianceAlert: false,
      });

      const result = await service.updateAccountSettings(CLIENT_ID, ACCOUNT_ID, {
        notifyOnEscrowCreated: false,
        notifyOnComplianceAlert: false,
      });

      expect(result.notifyOnEscrowCreated).to.be.false;
      expect(result.notifyOnComplianceAlert).to.be.false;
    });

    it('should reject non-boolean values for toggle fields', async () => {
      prismaStub.institutionAccount.findFirst.resolves(mockAccount);

      try {
        await service.updateAccountSettings(CLIENT_ID, ACCOUNT_ID, {
          notifyOnEscrowCreated: 'yes',
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.include('must be a boolean');
      }
    });

    it('should prevent deactivating default account', async () => {
      prismaStub.institutionAccount.findFirst.resolves({ ...mockAccount, isDefault: true });

      try {
        await service.updateAccountSettings(CLIENT_ID, ACCOUNT_ID, {
          isActive: false,
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.include('Cannot deactivate the default account');
      }
    });

    it('should allow deactivating non-default account', async () => {
      const nonDefaultAccount = { ...mockAccount, isDefault: false };
      prismaStub.institutionAccount.findFirst.resolves(nonDefaultAccount);
      prismaStub.institutionAccount.update.resolves({
        ...nonDefaultAccount,
        isActive: false,
      });

      const result = await service.updateAccountSettings(CLIENT_ID, ACCOUNT_ID, {
        isActive: false,
      });

      expect(result.isActive).to.be.false;
    });

    it('should reject empty update', async () => {
      prismaStub.institutionAccount.findFirst.resolves(mockAccount);

      try {
        await service.updateAccountSettings(CLIENT_ID, ACCOUNT_ID, {
          someRandomField: 'value',
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.include('No valid settings fields');
      }
    });

    it('should ignore disallowed fields', async () => {
      prismaStub.institutionAccount.findFirst.resolves(mockAccount);
      prismaStub.institutionAccount.update.resolves({
        ...mockAccount,
        defaultCurrency: 'USDT',
      });

      await service.updateAccountSettings(CLIENT_ID, ACCOUNT_ID, {
        defaultCurrency: 'USDT',
        walletAddress: 'SHOULD_BE_IGNORED',
        name: 'SHOULD_BE_IGNORED',
      });

      const updateCall = prismaStub.institutionAccount.update.firstCall;
      expect(updateCall.args[0].data).to.not.have.property('walletAddress');
      expect(updateCall.args[0].data).to.not.have.property('name');
      expect(updateCall.args[0].data.defaultCurrency).to.equal('USDT');
    });

    it('should throw for non-existent account', async () => {
      prismaStub.institutionAccount.findFirst.resolves(null);

      try {
        await service.updateAccountSettings(CLIENT_ID, 'non-existent', {
          defaultCurrency: 'USDC',
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Account not found');
      }
    });
  });
});
