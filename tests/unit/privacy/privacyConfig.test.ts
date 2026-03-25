import { expect } from 'chai';
import sinon from 'sinon';

describe('PrivacyConfig', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Clean env for each test
    delete process.env.PRIVACY_ENABLED;
    delete process.env.STEALTH_KEY_ENCRYPTION_SECRET;
    delete process.env.DEFAULT_PRIVACY_LEVEL;
    delete process.env.PRIVACY_JITO_DEFAULT;
    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();
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

  describe('loadPrivacyConfig', () => {
    it('should default enabled to true (when PRIVACY_ENABLED not set)', () => {
      const { loadPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const config = loadPrivacyConfig();
      expect(config.enabled).to.equal(true);
    });

    it('should be enabled when PRIVACY_ENABLED=true', () => {
      process.env.PRIVACY_ENABLED = 'true';
      const { loadPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const config = loadPrivacyConfig();
      expect(config.enabled).to.equal(true);
    });

    it('should be disabled when PRIVACY_ENABLED=false', () => {
      process.env.PRIVACY_ENABLED = 'false';
      const { loadPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const config = loadPrivacyConfig();
      expect(config.enabled).to.equal(false);
    });

    it('should default privacy level to STEALTH', () => {
      const { loadPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const config = loadPrivacyConfig();
      expect(config.defaultPrivacyLevel).to.equal('STEALTH');
    });

    it('should read DEFAULT_PRIVACY_LEVEL from env', () => {
      process.env.DEFAULT_PRIVACY_LEVEL = 'NONE';
      const { loadPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const config = loadPrivacyConfig();
      expect(config.defaultPrivacyLevel).to.equal('NONE');
    });

    it('should default jitoDefault to false', () => {
      const { loadPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const config = loadPrivacyConfig();
      expect(config.jitoDefault).to.equal(false);
    });

    it('should read PRIVACY_JITO_DEFAULT from env', () => {
      process.env.PRIVACY_JITO_DEFAULT = 'true';
      const { loadPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const config = loadPrivacyConfig();
      expect(config.jitoDefault).to.equal(true);
    });
  });

  describe('validatePrivacyConfig', () => {
    it('should return no errors when disabled', () => {
      const { validatePrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const errors = validatePrivacyConfig({
        enabled: false,
        stealthKeyEncryptionSecret: '',
        defaultPrivacyLevel: 'NONE',
        jitoDefault: false,
      });
      expect(errors).to.have.length(0);
    });

    it('should require STEALTH_KEY_ENCRYPTION_SECRET when enabled', () => {
      const { validatePrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const errors = validatePrivacyConfig({
        enabled: true,
        stealthKeyEncryptionSecret: '',
        defaultPrivacyLevel: 'NONE',
        jitoDefault: false,
      });
      expect(errors).to.have.length(1);
      expect(errors[0]).to.include('STEALTH_KEY_ENCRYPTION_SECRET');
    });

    it('should reject short encryption secret', () => {
      const { validatePrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const errors = validatePrivacyConfig({
        enabled: true,
        stealthKeyEncryptionSecret: 'short',
        defaultPrivacyLevel: 'NONE',
        jitoDefault: false,
      });
      expect(errors).to.have.length(1);
      expect(errors[0]).to.include('at least 32 characters');
    });

    it('should accept valid config', () => {
      const { validatePrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      const errors = validatePrivacyConfig({
        enabled: true,
        stealthKeyEncryptionSecret: 'a'.repeat(32),
        defaultPrivacyLevel: 'NONE',
        jitoDefault: false,
      });
      expect(errors).to.have.length(0);
    });
  });

  describe('getPrivacyConfig (caching)', () => {
    it('should cache config after first call', () => {
      process.env.PRIVACY_ENABLED = 'true';
      process.env.STEALTH_KEY_ENCRYPTION_SECRET = 'a'.repeat(32);

      const {
        getPrivacyConfig,
        resetPrivacyConfig,
      } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      const config1 = getPrivacyConfig();
      process.env.PRIVACY_ENABLED = 'false';
      const config2 = getPrivacyConfig();

      // Should return cached value
      expect(config1.enabled).to.equal(true);
      expect(config2.enabled).to.equal(true); // Still true (cached)
    });

    it('should return fresh config after reset', () => {
      process.env.PRIVACY_ENABLED = 'true';
      const {
        getPrivacyConfig,
        resetPrivacyConfig,
      } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      const config1 = getPrivacyConfig();
      expect(config1.enabled).to.equal(true);

      process.env.PRIVACY_ENABLED = 'false';
      resetPrivacyConfig();
      const config2 = getPrivacyConfig();
      expect(config2.enabled).to.equal(false);
    });
  });
});
