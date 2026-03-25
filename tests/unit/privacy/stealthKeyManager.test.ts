import { expect } from 'chai';
import sinon from 'sinon';

describe('StealthKeyManager', () => {
  let sandbox: sinon.SinonSandbox;
  let keyManager: typeof import('../../../src/services/privacy/stealth-key-manager');

  const TEST_SECRET = 'a'.repeat(32); // Exactly 32 chars
  const TEST_PLAINTEXT = 'mySecretKeyBase58EncodedString12345';

  before(async () => {
    keyManager = await import('../../../src/services/privacy/stealth-key-manager');
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.PRIVACY_ENABLED = 'true';
    process.env.STEALTH_KEY_ENCRYPTION_SECRET = TEST_SECRET;
    // Reset the privacy config cache
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

  describe('encryptKey / decryptKey', () => {
    it('should roundtrip encrypt then decrypt correctly', () => {
      const encrypted = keyManager.encryptKey(TEST_PLAINTEXT);
      const decrypted = keyManager.decryptKey(encrypted);

      expect(decrypted).to.equal(TEST_PLAINTEXT);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const encrypted1 = keyManager.encryptKey(TEST_PLAINTEXT);
      const encrypted2 = keyManager.encryptKey(TEST_PLAINTEXT);

      expect(encrypted1).to.not.equal(encrypted2);
    });

    it('should produce format iv:tag:ciphertext', () => {
      const encrypted = keyManager.encryptKey(TEST_PLAINTEXT);
      const parts = encrypted.split(':');

      expect(parts).to.have.length(3);
      // IV is 16 bytes = 32 hex chars
      expect(parts[0]).to.have.length(32);
      // Tag is 16 bytes = 32 hex chars
      expect(parts[1]).to.have.length(32);
      // Ciphertext length varies
      expect(parts[2].length).to.be.greaterThan(0);
    });

    it('should throw if encryption secret is too short', () => {
      process.env.STEALTH_KEY_ENCRYPTION_SECRET = 'short';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      expect(() => keyManager.encryptKey(TEST_PLAINTEXT)).to.throw(
        'STEALTH_KEY_ENCRYPTION_SECRET must be at least 32 characters'
      );
    });

    it('should throw if encryption secret is empty', () => {
      process.env.STEALTH_KEY_ENCRYPTION_SECRET = '';
      const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
      resetPrivacyConfig();

      expect(() => keyManager.encryptKey(TEST_PLAINTEXT)).to.throw(
        'STEALTH_KEY_ENCRYPTION_SECRET must be at least 32 characters'
      );
    });

    it('should throw on invalid encrypted format', () => {
      expect(() => keyManager.decryptKey('invalid-format')).to.throw(
        'Invalid encrypted key format'
      );
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = keyManager.encryptKey(TEST_PLAINTEXT);
      const parts = encrypted.split(':');
      // Tamper with ciphertext
      parts[2] = 'ff'.repeat(parts[2].length / 2);
      const tampered = parts.join(':');

      expect(() => keyManager.decryptKey(tampered)).to.throw();
    });
  });

  describe('encryptKeyWithSecret / decryptKeyWithSecret', () => {
    it('should roundtrip with explicit secret', () => {
      const secret = 'b'.repeat(32);
      const encrypted = keyManager.encryptKeyWithSecret(TEST_PLAINTEXT, secret);
      const decrypted = keyManager.decryptKeyWithSecret(encrypted, secret);

      expect(decrypted).to.equal(TEST_PLAINTEXT);
    });

    it('should fail to decrypt with wrong secret', () => {
      const secret1 = 'c'.repeat(32);
      const secret2 = 'd'.repeat(32);
      const encrypted = keyManager.encryptKeyWithSecret(TEST_PLAINTEXT, secret1);

      expect(() => keyManager.decryptKeyWithSecret(encrypted, secret2)).to.throw();
    });

    it('should reject secrets shorter than 32 chars', () => {
      expect(() => keyManager.encryptKeyWithSecret(TEST_PLAINTEXT, 'short')).to.throw(
        'Encryption secret must be at least 32 characters'
      );
    });
  });
});
