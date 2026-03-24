import { expect } from 'chai';
import sinon from 'sinon';
import crypto from 'crypto';

// Set env for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';

import {
  createMockPrismaClient,
  createTestClient,
} from '../../helpers/institution-test-utils';
import { testWallets } from '../../fixtures/institution-escrow-test-data';

// We need to set up the mock Prisma client BEFORE importing the service,
// because the service's constructor reads from the prisma singleton proxy.
// We use the mockPrismaForTest helper to set the global mock.
import { mockPrismaForTest, teardownPrismaMock } from '../../helpers/prisma-mock';

describe('InstitutionClientSettingsService', () => {
  let sandbox: sinon.SinonSandbox;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  let settingsService: any;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    mockPrisma = createMockPrismaClient();

    // Set the global mock so the prisma proxy resolves to our mock
    mockPrismaForTest(mockPrisma as any);

    // Dynamically import and create a fresh service instance
    const settingsModule = await import(
      '../../../src/services/institution-client-settings.service'
    );
    settingsService = new (settingsModule.InstitutionClientSettingsService as any)();

    // Also replace the internal prisma reference directly for safety
    (settingsService as any).prisma = mockPrisma;
  });

  afterEach(() => {
    teardownPrismaMock();
    sandbox.restore();
  });

  // ---------------------------------------------------------------------------
  // getSettings
  // ---------------------------------------------------------------------------
  describe('getSettings', () => {
    it('should return grouped settings with all sections', async () => {
      const existingSettings = {
        id: 'settings-1',
        clientId: 'test-client-id',
        defaultCurrency: 'USDC',
        defaultCorridor: 'US-MX',
        timezone: 'Europe/Zurich',
        notificationEmail: null,
        webhookUrl: 'https://example.com/hook',
        webhookSecret: null,
        autoApproveThreshold: null,
        settlementAuthorityWallet: null,
        language: 'de',
        theme: 'dark',
        twoFactorEnabled: true,
        autoTravelRule: true,
        activeSanctionsLists: ['OFAC SDN', 'EU Consolidated'],
        manualReviewThreshold: '100000',
        aiRecommendations: true,
        aiAutoRelease: false,
        riskTolerance: 'low',
        defaultToken: 'usdc',
        emailNotifications: true,
        feeBps: 20,
        minFeeUsdc: 0.2,
        maxFeeUsdc: 20.0,
        notificationPreferences: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const clientData = { tier: 'ENTERPRISE', jurisdiction: 'CH', kycStatus: 'VERIFIED' };

      mockPrisma.institutionClientSettings.upsert.resolves(existingSettings);
      mockPrisma.institutionClient.findUnique.resolves(clientData);

      const result = await settingsService.getSettings('test-client-id');

      // Verify grouped structure
      expect(result).to.have.all.keys(
        'institution', 'preferences', 'security', 'compliance', 'ai', 'wallet', 'notifications', 'integration'
      );

      // Institution (read-only from profile)
      expect(result.institution).to.deep.equal({
        tier: 'ENTERPRISE',
        jurisdiction: 'CH',
        kycStatus: 'VERIFIED',
      });

      // Preferences
      expect(result.preferences).to.deep.equal({
        language: 'de',
        timezone: 'Europe/Zurich',
        theme: 'dark',
        defaultCurrency: 'USDC',
      });

      // Security
      expect(result.security).to.deep.equal({ twoFactorEnabled: true });

      // Compliance
      expect(result.compliance).to.deep.equal({
        autoTravelRule: true,
        sanctionsLists: ['OFAC SDN', 'EU Consolidated'],
        manualReviewThreshold: '100000',
      });

      // AI
      expect(result.ai).to.deep.equal({
        recommendations: true,
        autoRelease: false,
        riskTolerance: 'low',
      });

      // Wallet
      expect(result.wallet).to.deep.equal({
        defaultToken: 'usdc',
        feeBps: 20,
        minFeeUsdc: 0.2,
        maxFeeUsdc: 20.0,
      });

      // Notifications (defaults when none stored)
      expect(result.notifications.emailEnabled).to.equal(true);
      expect(result.notifications.preferences).to.be.an('array').with.length(8);
      expect(result.notifications.preferences[0]).to.have.all.keys('event', 'inApp', 'email', 'sms');

      // Integration
      expect(result.integration).to.deep.equal({
        webhookUrl: 'https://example.com/hook',
      });
    });

    it('should return stored notification preferences when present', async () => {
      const customPrefs = [
        { event: 'payment_created', inApp: true, email: false, sms: true },
        { event: 'payment_settled', inApp: false, email: true, sms: false },
      ];
      const existingSettings = {
        id: 'settings-1',
        clientId: 'test-client-id',
        defaultCurrency: 'USDC',
        timezone: 'UTC',
        language: null,
        theme: null,
        twoFactorEnabled: false,
        autoTravelRule: true,
        activeSanctionsLists: ['OFAC SDN'],
        manualReviewThreshold: null,
        aiRecommendations: true,
        aiAutoRelease: false,
        riskTolerance: 'low',
        defaultToken: 'usdc',
        emailNotifications: true,
        webhookUrl: null,
        feeBps: 20,
        minFeeUsdc: 0.2,
        maxFeeUsdc: 20.0,
        notificationPreferences: customPrefs,
      };

      mockPrisma.institutionClientSettings.upsert.resolves(existingSettings);
      mockPrisma.institutionClient.findUnique.resolves(null);

      const result = await settingsService.getSettings('test-client-id');

      expect(result.notifications.preferences).to.deep.equal(customPrefs);
    });

    it('should create default settings when none exist', async () => {
      const newSettings = {
        id: 'settings-new',
        clientId: 'new-client-id',
        defaultCurrency: 'USDC',
        timezone: 'UTC',
        defaultCorridor: null,
        notificationEmail: null,
        webhookUrl: null,
        webhookSecret: null,
        autoApproveThreshold: null,
        settlementAuthorityWallet: null,
        language: null,
        theme: null,
        twoFactorEnabled: false,
        autoTravelRule: true,
        activeSanctionsLists: ['OFAC SDN', 'EU Consolidated', 'UN Sanctions'],
        manualReviewThreshold: null,
        aiRecommendations: true,
        aiAutoRelease: false,
        riskTolerance: 'low',
        defaultToken: 'usdc',
        emailNotifications: true,
        feeBps: 20,
        minFeeUsdc: 0.2,
        maxFeeUsdc: 20.0,
        notificationPreferences: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.institutionClientSettings.upsert.resolves(newSettings);
      mockPrisma.institutionClient.findUnique.resolves(null);

      const result = await settingsService.getSettings('new-client-id');

      // Verify defaults are applied
      expect(result.preferences.language).to.equal('en');
      expect(result.preferences.theme).to.equal('light');
      expect(result.institution.tier).to.be.null;

      const upsertArg =
        mockPrisma.institutionClientSettings.upsert.firstCall.args[0];
      expect(upsertArg.create.clientId).to.equal('new-client-id');
      expect(upsertArg.create.defaultCurrency).to.equal('USDC');
      expect(upsertArg.create.timezone).to.equal('UTC');
    });
  });

  // ---------------------------------------------------------------------------
  // updateSettings
  // ---------------------------------------------------------------------------
  describe('updateSettings', () => {
    it('should update with allowed fields only', async () => {
      const updatedSettings = {
        id: 'settings-1',
        clientId: 'test-client-id',
        defaultCurrency: 'USDC',
        defaultCorridor: 'SG-CH',
        timezone: 'America/New_York',
        notificationEmail: null,
        webhookUrl: 'https://example.com/webhook',
        webhookSecret: null,
        autoApproveThreshold: null,
        settlementAuthorityWallet: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.institutionClientSettings.upsert.resolves(updatedSettings);

      const result = await settingsService.updateSettings('test-client-id', {
        defaultCorridor: 'SG-CH',
        timezone: 'America/New_York',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(result).to.deep.equal(updatedSettings);
      expect(
        mockPrisma.institutionClientSettings.upsert.calledOnce
      ).to.be.true;

      const upsertArg =
        mockPrisma.institutionClientSettings.upsert.firstCall.args[0];
      expect(upsertArg.update).to.have.property('defaultCorridor', 'SG-CH');
      expect(upsertArg.update).to.have.property(
        'timezone',
        'America/New_York'
      );
      expect(upsertArg.update).to.have.property(
        'webhookUrl',
        'https://example.com/webhook'
      );
    });

    it('should filter out disallowed fields', async () => {
      mockPrisma.institutionClientSettings.upsert.resolves({
        id: 'settings-1',
        clientId: 'test-client-id',
      });

      await settingsService.updateSettings('test-client-id', {
        timezone: 'UTC',
        // These should be filtered out
        id: 'hacked-id',
        clientId: 'hacked-client',
        settlementAuthorityWallet: 'hacked-wallet',
      });

      const upsertArg =
        mockPrisma.institutionClientSettings.upsert.firstCall.args[0];
      expect(upsertArg.update).to.have.property('timezone', 'UTC');
      expect(upsertArg.update).to.not.have.property('id');
      expect(upsertArg.update).to.not.have.property('clientId');
      expect(upsertArg.update).to.not.have.property(
        'settlementAuthorityWallet'
      );
    });

    it('should handle partial update with single field', async () => {
      mockPrisma.institutionClientSettings.upsert.resolves({
        id: 'settings-1',
        clientId: 'test-client-id',
        notificationEmail: 'notify@example.com',
      });

      await settingsService.updateSettings('test-client-id', {
        notificationEmail: 'notify@example.com',
      });

      const upsertArg =
        mockPrisma.institutionClientSettings.upsert.firstCall.args[0];
      expect(upsertArg.update).to.deep.equal({
        notificationEmail: 'notify@example.com',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // updateWallets
  // ---------------------------------------------------------------------------
  describe('updateWallets', () => {
    it('should accept a valid Solana address for primaryWallet', async () => {
      const testClient = createTestClient({ settledWallets: [] });

      mockPrisma.institutionClient.findUnique
        .onFirstCall()
        .resolves({ settledWallets: [] }); // for the select query
      mockPrisma.institutionClient.update.resolves(testClient);
      mockPrisma.institutionClient.findUnique
        .onSecondCall()
        .resolves({ ...testClient, settings: {} }); // final return

      await settingsService.updateWallets('test-client-id', {
        primaryWallet: testWallets.payer,
      });

      expect(mockPrisma.institutionClient.update.calledOnce).to.be.true;
      const updateArg =
        mockPrisma.institutionClient.update.firstCall.args[0];
      expect(updateArg.data.primaryWallet).to.equal(testWallets.payer);
    });

    it('should reject an invalid Solana address', async () => {
      try {
        await settingsService.updateWallets('test-client-id', {
          primaryWallet: testWallets.invalid,
        });
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.include('Invalid Solana address');
        expect(err.message).to.include(testWallets.invalid);
      }

      // Should NOT have called any DB update
      expect(mockPrisma.institutionClient.update.called).to.be.false;
    });

    it('should reject invalid settlementWallet address', async () => {
      try {
        await settingsService.updateWallets('test-client-id', {
          settlementWallet: 'INVALID-NOT-BASE58!!!',
        });
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.include('Invalid Solana address');
      }
    });

    it('should add primaryWallet to settledWallets if not already present', async () => {
      const existingWallets = ['SomeOtherWalletAddress1234567890123456'];

      mockPrisma.institutionClient.findUnique
        .onFirstCall()
        .resolves({ settledWallets: existingWallets });
      mockPrisma.institutionClient.update.resolves({});
      mockPrisma.institutionClient.findUnique
        .onSecondCall()
        .resolves({ settings: {} });

      await settingsService.updateWallets('test-client-id', {
        primaryWallet: testWallets.payer,
      });

      const updateArg =
        mockPrisma.institutionClient.update.firstCall.args[0];
      expect(updateArg.data.settledWallets).to.include(testWallets.payer);
      expect(updateArg.data.settledWallets).to.include(
        existingWallets[0]
      );
    });

    it('should not duplicate wallet in settledWallets', async () => {
      mockPrisma.institutionClient.findUnique
        .onFirstCall()
        .resolves({ settledWallets: [testWallets.payer] });
      mockPrisma.institutionClient.update.resolves({});
      mockPrisma.institutionClient.findUnique
        .onSecondCall()
        .resolves({ settings: {} });

      await settingsService.updateWallets('test-client-id', {
        primaryWallet: testWallets.payer,
      });

      const updateArg =
        mockPrisma.institutionClient.update.firstCall.args[0];
      const walletCount = updateArg.data.settledWallets.filter(
        (w: string) => w === testWallets.payer
      ).length;
      expect(walletCount).to.equal(1);
    });
  });

  // ---------------------------------------------------------------------------
  // generateApiKey
  // ---------------------------------------------------------------------------
  describe('generateApiKey', () => {
    it('should return the raw key only at creation time', async () => {
      mockPrisma.institutionApiKey.create.resolves({
        id: 'key-1',
        clientId: 'test-client-id',
        keyHash: 'sha256hash',
        name: 'My API Key',
        permissions: ['escrow:create', 'escrow:read'],
        active: true,
        lastUsedAt: null,
        createdAt: new Date(),
      });

      const result = await settingsService.generateApiKey(
        'test-client-id',
        'My API Key',
        ['escrow:create', 'escrow:read']
      );

      expect(result).to.have.property('id', 'key-1');
      expect(result).to.have.property('name', 'My API Key');
      expect(result).to.have.property('key');
      expect(result.key).to.be.a('string');
      expect(result.key).to.match(/^inst_/); // Prefix check
      expect(result.key.length).to.be.greaterThan(10);
      expect(result).to.have.property('permissions').that.deep.equals([
        'escrow:create',
        'escrow:read',
      ]);
      expect(result).to.have.property('active', true);
    });

    it('should hash the key before storing', async () => {
      mockPrisma.institutionApiKey.create.resolves({
        id: 'key-1',
        clientId: 'test-client-id',
        keyHash: 'will-be-checked',
        name: 'Test Key',
        permissions: [],
        active: true,
        lastUsedAt: null,
        createdAt: new Date(),
      });

      await settingsService.generateApiKey('test-client-id', 'Test Key', []);

      const createArg =
        mockPrisma.institutionApiKey.create.firstCall.args[0];
      expect(createArg.data).to.have.property('keyHash');
      // The keyHash should be a 64-char hex string (sha256)
      expect(createArg.data.keyHash).to.match(/^[a-f0-9]{64}$/);
      // keyHash should NOT equal the raw key
      expect(createArg.data.keyHash).to.not.match(/^inst_/);
    });
  });

  // ---------------------------------------------------------------------------
  // revokeApiKey
  // ---------------------------------------------------------------------------
  describe('revokeApiKey', () => {
    it('should deactivate the key', async () => {
      mockPrisma.institutionApiKey.findUnique.resolves({
        id: 'key-1',
        clientId: 'test-client-id',
        active: true,
      });
      mockPrisma.institutionApiKey.update.resolves({ active: false });

      const result = await settingsService.revokeApiKey(
        'test-client-id',
        'key-1'
      );

      expect(result).to.deep.equal({ success: true });
      expect(mockPrisma.institutionApiKey.update.calledOnce).to.be.true;

      const updateArg =
        mockPrisma.institutionApiKey.update.firstCall.args[0];
      expect(updateArg.data.active).to.equal(false);
    });

    it('should throw if key not found', async () => {
      mockPrisma.institutionApiKey.findUnique.resolves(null);

      try {
        await settingsService.revokeApiKey('test-client-id', 'nonexistent');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.include('API key not found');
      }
    });

    it('should throw if key belongs to a different client', async () => {
      mockPrisma.institutionApiKey.findUnique.resolves({
        id: 'key-1',
        clientId: 'other-client-id', // different owner
        active: true,
      });

      try {
        await settingsService.revokeApiKey('test-client-id', 'key-1');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.include(
          'API key does not belong to this client'
        );
      }

      expect(mockPrisma.institutionApiKey.update.called).to.be.false;
    });
  });

  // ---------------------------------------------------------------------------
  // listApiKeys
  // ---------------------------------------------------------------------------
  describe('listApiKeys', () => {
    it('should return keys without keyHash', async () => {
      const keys = [
        {
          id: 'key-1',
          name: 'Production Key',
          permissions: ['escrow:create'],
          active: true,
          lastUsedAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: 'key-2',
          name: 'Read-Only Key',
          permissions: ['escrow:read'],
          active: false,
          lastUsedAt: null,
          createdAt: new Date(),
        },
      ];

      mockPrisma.institutionApiKey.findMany.resolves(keys);

      const result = await settingsService.listApiKeys('test-client-id');

      expect(result).to.have.length(2);
      expect(result[0]).to.have.property('id', 'key-1');
      expect(result[0]).to.have.property('name', 'Production Key');
      expect(result[0]).to.not.have.property('keyHash');
      expect(result[1]).to.have.property('active', false);

      // Verify the select clause was used (no keyHash)
      const findArg =
        mockPrisma.institutionApiKey.findMany.firstCall.args[0];
      expect(findArg.select).to.not.have.property('keyHash');
    });

    it('should return empty array when no keys exist', async () => {
      mockPrisma.institutionApiKey.findMany.resolves([]);

      const result = await settingsService.listApiKeys('test-client-id');

      expect(result).to.be.an('array').that.is.empty;
    });

    it('should filter by clientId', async () => {
      mockPrisma.institutionApiKey.findMany.resolves([]);

      await settingsService.listApiKeys('specific-client-id');

      const findArg =
        mockPrisma.institutionApiKey.findMany.firstCall.args[0];
      expect(findArg.where.clientId).to.equal('specific-client-id');
    });
  });
});
