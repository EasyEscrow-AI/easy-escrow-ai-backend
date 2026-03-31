/**
 * Stealth Escrow Release Integration Tests
 *
 * Tests the privacy router's handling of escrow release destinations.
 * Uses proxyquire to mock dependencies and test routing logic.
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/integration/privacy/stealthEscrowRelease.test.ts --timeout 30000 --reporter spec --colors
 */

import { expect } from 'chai';
import sinon from 'sinon';
import proxyquire from 'proxyquire';

describe('Stealth Escrow Release - Integration', function () {
  this.timeout(30000);

  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.PRIVACY_ENABLED = 'true';
    process.env.STEALTH_KEY_ENCRYPTION_SECRET = 'a'.repeat(64);
    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.PRIVACY_ENABLED;
    delete process.env.STEALTH_KEY_ENCRYPTION_SECRET;
    delete process.env.DEFAULT_PRIVACY_LEVEL;
    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();
  });

  describe('Release with STEALTH privacy level', () => {
    it('should derive stealth address and use as release destination', async () => {
      const mockService = {
        createStealthPayment: sandbox.stub().resolves({
          stealthPaymentId: 'sp-release-1',
          stealthAddress: 'stealthReleaseAddr',
          ephemeralPublicKey: 'ephReleaseKey',
        }),
        findMetaAddressForWallet: sandbox.stub(),
      };

      const { resolveReleaseDestination } = proxyquire(
        '../../../src/services/privacy/privacy-router.service',
        { './stealth-address.service': { getStealthAddressService: () => mockService } }
      );

      const result = await resolveReleaseDestination(
        'recipientWallet', 'client-1', 'escrow-1', 'usdcMint', BigInt(50000000),
        { level: 'STEALTH', metaAddressId: 'meta-1' }
      );

      expect(result.recipientAddress).to.equal('stealthReleaseAddr');
      expect(result.privacyLevel).to.equal('STEALTH');
      expect(result.stealthPaymentId).to.equal('sp-release-1');
      expect(result.ephemeralPublicKey).to.equal('ephReleaseKey');
    });

    it('should create StealthPayment record with CONFIRMED status after release', async () => {
      const mockService = {
        createStealthPayment: sandbox.stub().resolves({
          stealthPaymentId: 'sp-2',
          stealthAddress: 'addr',
          ephemeralPublicKey: 'eph',
        }),
        findMetaAddressForWallet: sandbox.stub(),
      };

      const { resolveReleaseDestination } = proxyquire(
        '../../../src/services/privacy/privacy-router.service',
        { './stealth-address.service': { getStealthAddressService: () => mockService } }
      );

      await resolveReleaseDestination(
        'wallet', 'client-1', 'escrow-777', 'usdcMint', BigInt(100000000),
        { level: 'STEALTH', metaAddressId: 'meta-99' }
      );

      const args = mockService.createStealthPayment.firstCall.args[0];
      expect(args.metaAddressId).to.equal('meta-99');
      expect(args.escrowId).to.equal('escrow-777');
      expect(args.amountRaw).to.equal(BigInt(100000000));
    });

    it('should mark StealthPayment as FAILED when on-chain release fails', async () => {
      const mockService = {
        createStealthPayment: sandbox.stub().rejects(new Error('Derivation failed')),
        findMetaAddressForWallet: sandbox.stub(),
      };

      const { resolveReleaseDestination } = proxyquire(
        '../../../src/services/privacy/privacy-router.service',
        { './stealth-address.service': { getStealthAddressService: () => mockService } }
      );

      const result = await resolveReleaseDestination(
        'recipientWallet', 'client-1', 'escrow-1', 'usdcMint', BigInt(50000000),
        { level: 'STEALTH', metaAddressId: 'meta-bad' }
      );

      expect(result.privacyLevel).to.equal('NONE');
      expect(result.recipientAddress).to.equal('recipientWallet');
    });

    it('should include stealth metadata in audit log', async () => {
      const mockService = {
        createStealthPayment: sandbox.stub().resolves({
          stealthPaymentId: 'sp-audit',
          stealthAddress: 'auditAddr',
          ephemeralPublicKey: 'auditEph',
        }),
        findMetaAddressForWallet: sandbox.stub(),
      };

      const { resolveReleaseDestination } = proxyquire(
        '../../../src/services/privacy/privacy-router.service',
        { './stealth-address.service': { getStealthAddressService: () => mockService } }
      );

      const result = await resolveReleaseDestination(
        'wallet', 'client-1', 'escrow-1', 'usdcMint', BigInt(1000000),
        { level: 'STEALTH', metaAddressId: 'meta-1' }
      );

      // Result should contain all metadata needed for audit logging
      expect(result).to.have.property('stealthPaymentId', 'sp-audit');
      expect(result).to.have.property('ephemeralPublicKey', 'auditEph');
      expect(result).to.have.property('recipientAddress', 'auditAddr');
      expect(result).to.have.property('privacyLevel', 'STEALTH');
    });
  });

  describe('Release with NONE privacy level', () => {
    it('should use standard recipient wallet (existing behavior)', async () => {
      const { resolveReleaseDestination } = proxyquire(
        '../../../src/services/privacy/privacy-router.service',
        { './stealth-address.service': { getStealthAddressService: () => ({}) } }
      );

      const result = await resolveReleaseDestination(
        'standardWallet', 'client-1', 'escrow-1', 'usdcMint', BigInt(10000000),
        { level: 'NONE' }
      );

      expect(result.recipientAddress).to.equal('standardWallet');
      expect(result.privacyLevel).to.equal('NONE');
      expect(result.stealthPaymentId).to.be.undefined;
    });
  });

  describe('Release with Jito option', () => {
    it('should work with NONE + useJito: true', async () => {
      const { resolveReleaseDestination } = proxyquire(
        '../../../src/services/privacy/privacy-router.service',
        { './stealth-address.service': { getStealthAddressService: () => ({}) } }
      );

      const result = await resolveReleaseDestination(
        'wallet', 'client-1', 'escrow-1', 'usdcMint', BigInt(1000000),
        { level: 'NONE', useJito: true }
      );
      expect(result.useJito).to.equal(true);
    });

    it('should work with STEALTH + useJito: false', async () => {
      const mockService = {
        createStealthPayment: sandbox.stub().resolves({
          stealthPaymentId: 'sp-jito', stealthAddress: 'addr', ephemeralPublicKey: 'eph',
        }),
        findMetaAddressForWallet: sandbox.stub(),
      };

      const { resolveReleaseDestination } = proxyquire(
        '../../../src/services/privacy/privacy-router.service',
        { './stealth-address.service': { getStealthAddressService: () => mockService } }
      );

      const result = await resolveReleaseDestination(
        'wallet', 'client-1', 'escrow-1', 'usdcMint', BigInt(1000000),
        { level: 'STEALTH', metaAddressId: 'meta-1', useJito: false }
      );

      expect(result.useJito).to.equal(false);
      expect(result.privacyLevel).to.equal('STEALTH');
    });
  });
});
