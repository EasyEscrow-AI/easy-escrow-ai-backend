import { expect } from 'chai';
import sinon from 'sinon';

describe('PrivacyRouterService', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.PRIVACY_ENABLED = 'true';
    process.env.STEALTH_KEY_ENCRYPTION_SECRET = 'a'.repeat(32);
    process.env.DEFAULT_PRIVACY_LEVEL = 'NONE';
    process.env.PRIVACY_JITO_DEFAULT = 'false';
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

  it('should return standard recipient when privacy level is NONE', async () => {
    const {
      resolveReleaseDestination,
    } = require('../../../src/services/privacy/privacy-router.service');

    const result = await resolveReleaseDestination(
      'recipientWalletBase58',
      'client-123',
      'escrow-456',
      'usdcMint',
      BigInt(1000000),
      { level: 'NONE' }
    );

    expect(result.recipientAddress).to.equal('recipientWalletBase58');
    expect(result.privacyLevel).to.equal('NONE');
    expect(result.stealthPaymentId).to.be.undefined;
    expect(result.useJito).to.equal(false);
  });

  it('should return standard recipient when privacy is disabled', async () => {
    process.env.PRIVACY_ENABLED = 'false';
    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();

    const {
      resolveReleaseDestination,
    } = require('../../../src/services/privacy/privacy-router.service');

    const result = await resolveReleaseDestination(
      'recipientWalletBase58',
      'client-123',
      'escrow-456',
      'usdcMint',
      BigInt(1000000),
      { level: 'STEALTH', metaAddressId: 'meta-123' }
    );

    expect(result.recipientAddress).to.equal('recipientWalletBase58');
    expect(result.privacyLevel).to.equal('NONE');
  });

  it('should throw when STEALTH requested without metaAddressId', async () => {
    const {
      resolveReleaseDestination,
    } = require('../../../src/services/privacy/privacy-router.service');

    try {
      await resolveReleaseDestination(
        'recipientWalletBase58',
        'client-123',
        'escrow-456',
        'usdcMint',
        BigInt(1000000),
        { level: 'STEALTH' }
      );
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).to.include('metaAddressId is required');
    }
  });

  it('should respect useJito preference', async () => {
    const {
      resolveReleaseDestination,
    } = require('../../../src/services/privacy/privacy-router.service');

    const result = await resolveReleaseDestination(
      'recipientWalletBase58',
      'client-123',
      'escrow-456',
      'usdcMint',
      BigInt(1000000),
      { level: 'NONE', useJito: true }
    );

    expect(result.useJito).to.equal(true);
  });

  it('should use PRIVACY_JITO_DEFAULT env var when useJito not specified', async () => {
    process.env.PRIVACY_JITO_DEFAULT = 'true';
    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();

    const {
      resolveReleaseDestination,
    } = require('../../../src/services/privacy/privacy-router.service');

    const result = await resolveReleaseDestination(
      'recipientWalletBase58',
      'client-123',
      'escrow-456',
      'usdcMint',
      BigInt(1000000),
      { level: 'NONE' }
    );

    expect(result.useJito).to.equal(true);
  });
});
