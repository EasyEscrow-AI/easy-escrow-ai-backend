import { expect } from 'chai';
import sinon from 'sinon';

describe('StealthAdapter', () => {
  let sandbox: sinon.SinonSandbox;
  let stealthAdapter: typeof import('../../../src/services/privacy/stealth-adapter');

  before(async () => {
    stealthAdapter = await import('../../../src/services/privacy/stealth-adapter');
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('generateMetaAddress', () => {
    it('should generate a meta-address with scan and spend keys', async () => {
      const meta = await stealthAdapter.generateMetaAddress();

      expect(meta).to.have.property('scan');
      expect(meta).to.have.property('spend');
      expect(meta.scan).to.have.property('publicKey');
      expect(meta.scan).to.have.property('secretKey');
      expect(meta.spend).to.have.property('publicKey');
      expect(meta.spend).to.have.property('secretKey');
    });

    it('should produce non-empty string keys', async () => {
      const meta = await stealthAdapter.generateMetaAddress();

      expect(meta.scan.publicKey).to.be.a('string').and.have.length.greaterThan(0);
      expect(meta.scan.secretKey).to.be.a('string').and.have.length.greaterThan(0);
      expect(meta.spend.publicKey).to.be.a('string').and.have.length.greaterThan(0);
      expect(meta.spend.secretKey).to.be.a('string').and.have.length.greaterThan(0);
    });

    it('should produce different keys on each call', async () => {
      const meta1 = await stealthAdapter.generateMetaAddress();
      const meta2 = await stealthAdapter.generateMetaAddress();

      expect(meta1.scan.publicKey).to.not.equal(meta2.scan.publicKey);
      expect(meta1.spend.publicKey).to.not.equal(meta2.spend.publicKey);
    });
  });

  describe('deriveStealthAddress', () => {
    it('should derive a stealth address from a meta-address', async () => {
      const meta = await stealthAdapter.generateMetaAddress();
      const result = await stealthAdapter.deriveStealthAddress({
        scanPublicKey: meta.scan.publicKey,
        spendPublicKey: meta.spend.publicKey,
      });

      expect(result).to.have.property('stealthAddress');
      expect(result).to.have.property('ephemeralPublicKey');
      expect(result.stealthAddress).to.be.a('string').and.have.length.greaterThan(0);
      expect(result.ephemeralPublicKey).to.be.a('string').and.have.length.greaterThan(0);
    });

    it('should produce different stealth addresses each time (unlinkability)', async () => {
      const meta = await stealthAdapter.generateMetaAddress();
      const metaAddr = {
        scanPublicKey: meta.scan.publicKey,
        spendPublicKey: meta.spend.publicKey,
      };

      const result1 = await stealthAdapter.deriveStealthAddress(metaAddr);
      const result2 = await stealthAdapter.deriveStealthAddress(metaAddr);

      // Different ephemeral keys should produce different stealth addresses
      expect(result1.ephemeralPublicKey).to.not.equal(result2.ephemeralPublicKey);
      expect(result1.stealthAddress).to.not.equal(result2.stealthAddress);
    });
  });

  describe('deriveReceiverDestination', () => {
    it('should derive the correct destination from scan private key', async () => {
      const meta = await stealthAdapter.generateMetaAddress();
      const stealthResult = await stealthAdapter.deriveStealthAddress({
        scanPublicKey: meta.scan.publicKey,
        spendPublicKey: meta.spend.publicKey,
      });

      // Receiver should be able to derive the same destination
      const dest = await stealthAdapter.deriveReceiverDestination(
        meta.scan.secretKey,
        meta.spend.publicKey,
        stealthResult.ephemeralPublicKey
      );

      expect(dest).to.be.a('string');
      // The derived destination should match the stealth address
      expect(dest).to.equal(stealthResult.stealthAddress);
    });
  });

  describe('deriveSpendingKey', () => {
    it('should derive a valid spending scalar key', async () => {
      const meta = await stealthAdapter.generateMetaAddress();
      const stealthResult = await stealthAdapter.deriveStealthAddress({
        scanPublicKey: meta.scan.publicKey,
        spendPublicKey: meta.spend.publicKey,
      });

      const scalarKey = await stealthAdapter.deriveSpendingKey(
        meta.scan.secretKey,
        meta.spend.secretKey,
        stealthResult.ephemeralPublicKey
      );

      expect(scalarKey).to.be.a('string');
      expect(scalarKey.length).to.be.greaterThan(0);
    });
  });
});
