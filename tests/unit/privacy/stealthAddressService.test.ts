import { expect } from 'chai';
import sinon from 'sinon';

describe('StealthAddressService', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.PRIVACY_ENABLED = 'true';
    process.env.STEALTH_KEY_ENCRYPTION_SECRET = 'a'.repeat(32);
    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.PRIVACY_ENABLED;
    delete process.env.STEALTH_KEY_ENCRYPTION_SECRET;
    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();
  });

  describe('registerMetaAddress', () => {
    it('should throw when privacy is disabled', async () => {
      process.env.PRIVACY_ENABLED = 'false';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      const {
        StealthAddressService,
      } = require('../../../src/services/privacy/stealth-address.service');
      const service = new StealthAddressService();

      try {
        await service.registerMetaAddress('client-123');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Privacy features are not enabled');
      }
    });
  });

  describe('getMetaAddresses', () => {
    it('should throw when privacy is disabled', async () => {
      process.env.PRIVACY_ENABLED = 'false';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      const {
        StealthAddressService,
      } = require('../../../src/services/privacy/stealth-address.service');
      const service = new StealthAddressService();

      try {
        await service.getMetaAddresses('client-123');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Privacy features are not enabled');
      }
    });
  });

  describe('createStealthPayment', () => {
    it('should throw when privacy is disabled', async () => {
      process.env.PRIVACY_ENABLED = 'false';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      const {
        StealthAddressService,
      } = require('../../../src/services/privacy/stealth-address.service');
      const service = new StealthAddressService();

      try {
        await service.createStealthPayment({
          metaAddressId: 'meta-123',
          tokenMint: 'mint',
          amountRaw: BigInt(1000000),
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Privacy features are not enabled');
      }
    });
  });

  describe('scanPayments', () => {
    it('should throw when privacy is disabled', async () => {
      process.env.PRIVACY_ENABLED = 'false';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      const {
        StealthAddressService,
      } = require('../../../src/services/privacy/stealth-address.service');
      const service = new StealthAddressService();

      try {
        await service.scanPayments('client-123');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Privacy features are not enabled');
      }
    });
  });

  describe('sweepPayment', () => {
    it('should throw when privacy is disabled', async () => {
      process.env.PRIVACY_ENABLED = 'false';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      const {
        StealthAddressService,
      } = require('../../../src/services/privacy/stealth-address.service');
      const service = new StealthAddressService();

      try {
        await service.sweepPayment('client-123', 'payment-456', 'walletBase58');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Privacy features are not enabled');
      }
    });
  });

  describe('listPayments', () => {
    it('should throw when privacy is disabled', async () => {
      process.env.PRIVACY_ENABLED = 'false';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      const {
        StealthAddressService,
      } = require('../../../src/services/privacy/stealth-address.service');
      const service = new StealthAddressService();

      try {
        await service.listPayments('client-123');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Privacy features are not enabled');
      }
    });
  });

  describe('deactivateMetaAddress', () => {
    it('should throw when privacy is disabled', async () => {
      process.env.PRIVACY_ENABLED = 'false';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      const {
        StealthAddressService,
      } = require('../../../src/services/privacy/stealth-address.service');
      const service = new StealthAddressService();

      try {
        await service.deactivateMetaAddress('client-123', 'meta-456');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Privacy features are not enabled');
      }
    });
  });

  describe('getPayment', () => {
    it('should throw when privacy is disabled', async () => {
      process.env.PRIVACY_ENABLED = 'false';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      const {
        StealthAddressService,
      } = require('../../../src/services/privacy/stealth-address.service');
      const service = new StealthAddressService();

      try {
        await service.getPayment('client-123', 'payment-456');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Privacy features are not enabled');
      }
    });
  });
});
