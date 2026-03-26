/**
 * Privacy Router Service — Happy Path & Error Recovery Tests
 *
 * Tests the release destination routing logic when stealth addresses ARE available:
 * - Explicit metaAddressId provided → stealth payment created
 * - Auto-lookup finds meta-address → stealth payment created
 * - createStealthPayment failure → graceful fallback to NONE
 * - Unknown privacy level → throws
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/privacy/privacyRouterHappy.test.ts --timeout 30000 --reporter spec --colors
 */

import { expect } from 'chai';
import sinon from 'sinon';
import proxyquire from 'proxyquire';

describe('PrivacyRouterService — Happy Paths', () => {
  let sandbox: sinon.SinonSandbox;
  let resolveReleaseDestination: any;
  let mockStealthService: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.PRIVACY_ENABLED = 'true';
    process.env.STEALTH_KEY_ENCRYPTION_SECRET = 'a'.repeat(64);

    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();

    // Mock the stealth service methods
    mockStealthService = {
      findMetaAddressForWallet: sandbox.stub(),
      createStealthPayment: sandbox.stub(),
    };

    // Proxy the module to inject our mocked service
    const mod = proxyquire('../../../src/services/privacy/privacy-router.service', {
      './stealth-address.service': {
        getStealthAddressService: () => mockStealthService,
      },
    });

    resolveReleaseDestination = mod.resolveReleaseDestination;
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.PRIVACY_ENABLED;
    delete process.env.STEALTH_KEY_ENCRYPTION_SECRET;
    delete process.env.DEFAULT_PRIVACY_LEVEL;
    delete process.env.PRIVACY_JITO_DEFAULT;
    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();
  });

  describe('STEALTH with explicit metaAddressId', () => {
    it('should create stealth payment and return stealth address', async () => {
      mockStealthService.createStealthPayment.resolves({
        stealthPaymentId: 'sp-123',
        stealthAddress: 'stealthAddrBase58',
        ephemeralPublicKey: 'ephPubBase58',
      });

      const result = await resolveReleaseDestination(
        'recipientWallet',
        'client-123',
        'escrow-456',
        'usdcMint',
        BigInt(5000000),
        { level: 'STEALTH', metaAddressId: 'meta-explicit' }
      );

      expect(result.recipientAddress).to.equal('stealthAddrBase58');
      expect(result.privacyLevel).to.equal('STEALTH');
      expect(result.stealthPaymentId).to.equal('sp-123');
      expect(result.ephemeralPublicKey).to.equal('ephPubBase58');
    });

    it('should pass correct params to createStealthPayment', async () => {
      mockStealthService.createStealthPayment.resolves({
        stealthPaymentId: 'sp-123',
        stealthAddress: 'stealthAddr',
        ephemeralPublicKey: 'ephPub',
      });

      await resolveReleaseDestination(
        'recipientWallet',
        'client-123',
        'escrow-456',
        'usdcMint',
        BigInt(7777777),
        { level: 'STEALTH', metaAddressId: 'meta-explicit' }
      );

      const callArgs = mockStealthService.createStealthPayment.firstCall.args[0];
      expect(callArgs.metaAddressId).to.equal('meta-explicit');
      expect(callArgs.escrowId).to.equal('escrow-456');
      expect(callArgs.tokenMint).to.equal('usdcMint');
      expect(callArgs.amountRaw).to.equal(BigInt(7777777));
    });
  });

  describe('STEALTH with auto-lookup', () => {
    it('should auto-discover meta-address from wallet and create stealth payment', async () => {
      mockStealthService.findMetaAddressForWallet.resolves('meta-auto-found');
      mockStealthService.createStealthPayment.resolves({
        stealthPaymentId: 'sp-auto',
        stealthAddress: 'autoStealthAddr',
        ephemeralPublicKey: 'autoEphPub',
      });

      const result = await resolveReleaseDestination(
        'recipientWallet',
        'client-123',
        'escrow-456',
        'usdcMint',
        BigInt(1000000),
        { level: 'STEALTH' } // no metaAddressId — triggers auto-lookup
      );

      expect(result.recipientAddress).to.equal('autoStealthAddr');
      expect(result.privacyLevel).to.equal('STEALTH');
      expect(result.stealthPaymentId).to.equal('sp-auto');

      // Verify auto-lookup was called with the recipient wallet
      expect(mockStealthService.findMetaAddressForWallet.calledWith('recipientWallet')).to.be.true;
    });

    it('should default to STEALTH when no preferences provided', async () => {
      mockStealthService.findMetaAddressForWallet.resolves('meta-default');
      mockStealthService.createStealthPayment.resolves({
        stealthPaymentId: 'sp-default',
        stealthAddress: 'defaultStealthAddr',
        ephemeralPublicKey: 'defaultEph',
      });

      const result = await resolveReleaseDestination(
        'recipientWallet',
        'client-123',
        'escrow-456',
        'usdcMint',
        BigInt(1000000)
        // no preferences at all — uses config default STEALTH
      );

      expect(result.privacyLevel).to.equal('STEALTH');
      expect(result.recipientAddress).to.equal('defaultStealthAddr');
    });
  });

  describe('Error recovery — graceful fallback to NONE', () => {
    it('should fall back to NONE when auto-lookup throws', async () => {
      mockStealthService.findMetaAddressForWallet.rejects(new Error('DB connection failed'));

      const result = await resolveReleaseDestination(
        'recipientWallet',
        'client-123',
        'escrow-456',
        'usdcMint',
        BigInt(1000000),
        { level: 'STEALTH' }
      );

      expect(result.recipientAddress).to.equal('recipientWallet');
      expect(result.privacyLevel).to.equal('NONE');
      expect(result.stealthPaymentId).to.be.undefined;
    });

    it('should fall back to NONE when createStealthPayment throws', async () => {
      mockStealthService.createStealthPayment.rejects(
        new Error('Meta-address not found or inactive')
      );

      const result = await resolveReleaseDestination(
        'recipientWallet',
        'client-123',
        'escrow-456',
        'usdcMint',
        BigInt(1000000),
        { level: 'STEALTH', metaAddressId: 'meta-bad' }
      );

      expect(result.recipientAddress).to.equal('recipientWallet');
      expect(result.privacyLevel).to.equal('NONE');
    });

    it('should fall back to NONE when auto-lookup returns null', async () => {
      mockStealthService.findMetaAddressForWallet.resolves(null);

      const result = await resolveReleaseDestination(
        'recipientWallet',
        'client-123',
        'escrow-456',
        'usdcMint',
        BigInt(1000000),
        { level: 'STEALTH' }
      );

      expect(result.recipientAddress).to.equal('recipientWallet');
      expect(result.privacyLevel).to.equal('NONE');
    });
  });

  describe('useJito handling', () => {
    it('should pass useJito=true to result when preference specifies it', async () => {
      mockStealthService.createStealthPayment.resolves({
        stealthPaymentId: 'sp-1',
        stealthAddress: 'addr',
        ephemeralPublicKey: 'eph',
      });

      const result = await resolveReleaseDestination(
        'recipientWallet',
        'client-123',
        'escrow-456',
        'usdcMint',
        BigInt(1000000),
        { level: 'STEALTH', metaAddressId: 'meta-1', useJito: true }
      );

      expect(result.useJito).to.equal(true);
    });

    it('should use PRIVACY_JITO_DEFAULT when useJito not specified in preferences', async () => {
      process.env.PRIVACY_JITO_DEFAULT = 'true';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      mockStealthService.createStealthPayment.resolves({
        stealthPaymentId: 'sp-1',
        stealthAddress: 'addr',
        ephemeralPublicKey: 'eph',
      });

      const result = await resolveReleaseDestination(
        'recipientWallet',
        'client-123',
        'escrow-456',
        'usdcMint',
        BigInt(1000000),
        { level: 'STEALTH', metaAddressId: 'meta-1' }
      );

      expect(result.useJito).to.equal(true);
    });
  });
});
