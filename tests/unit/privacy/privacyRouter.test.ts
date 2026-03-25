import { expect } from 'chai';
import sinon from 'sinon';

describe('PrivacyRouterService', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.PRIVACY_ENABLED = 'true';
    process.env.STEALTH_KEY_ENCRYPTION_SECRET = 'a'.repeat(32);
    process.env.PRIVACY_JITO_DEFAULT = 'false';
    // Don't set DEFAULT_PRIVACY_LEVEL — let it use the default (STEALTH)
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

  it('should return standard recipient when privacy level is explicitly NONE', async () => {
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

  it('should fall back to NONE when STEALTH requested but no meta-address found', async () => {
    const {
      resolveReleaseDestination,
    } = require('../../../src/services/privacy/privacy-router.service');

    // No metaAddressId provided, and auto-lookup will find nothing (no DB)
    // The service's findMetaAddressForWallet will throw/return null, causing fallback
    const result = await resolveReleaseDestination(
      'recipientWalletBase58',
      'client-123',
      'escrow-456',
      'usdcMint',
      BigInt(1000000),
      { level: 'STEALTH' }
    );

    // Should gracefully fall back to NONE
    expect(result.recipientAddress).to.equal('recipientWalletBase58');
    expect(result.privacyLevel).to.equal('NONE');
  });

  it('should default to STEALTH level when no preference specified', async () => {
    const { getPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    const config = getPrivacyConfig();
    expect(config.defaultPrivacyLevel).to.equal('STEALTH');
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
