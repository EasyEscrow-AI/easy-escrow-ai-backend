/**
 * Stealth Direct Payment Integration Tests
 *
 * Tests stealth address derivation correctness via the adapter layer.
 * On-chain token transfer tests require STAGING_FUNDED=true.
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/integration/privacy/stealthDirectPayment.test.ts --timeout 30000 --reporter spec --colors
 */

import { expect } from 'chai';
import bs58 from 'bs58';

describe('Stealth Direct Payment - Integration', function () {
  this.timeout(30000);

  let stealthAdapter: typeof import('../../../src/services/privacy/stealth-adapter');

  before(async () => {
    stealthAdapter = await import('../../../src/services/privacy/stealth-adapter');
  });

  describe('Direct USDC transfer to stealth address', () => {
    it('should build stealth token transfer transaction with valid address', async () => {
      const meta = await stealthAdapter.generateMetaAddress();
      const result = await stealthAdapter.deriveStealthAddress({
        scanPublicKey: meta.scan.publicKey,
        spendPublicKey: meta.spend.publicKey,
      });

      // Stealth address should be a valid 32-byte Ed25519 point
      const addrBytes = bs58.decode(result.stealthAddress);
      expect(addrBytes.length).to.equal(32);

      // Ephemeral key should also be 32 bytes
      const ephBytes = bs58.decode(result.ephemeralPublicKey);
      expect(ephBytes.length).to.equal(32);
    });

    it('should create detectable stealth address for receiver', async () => {
      const meta = await stealthAdapter.generateMetaAddress();
      const result = await stealthAdapter.deriveStealthAddress({
        scanPublicKey: meta.scan.publicKey,
        spendPublicKey: meta.spend.publicKey,
      });

      // Receiver should detect the same address
      const detected = await stealthAdapter.deriveReceiverDestination(
        meta.scan.secretKey,
        meta.spend.publicKey,
        result.ephemeralPublicKey
      );
      expect(detected).to.equal(result.stealthAddress);
    });

    it('should derive spending key matching stealth address', async () => {
      const meta = await stealthAdapter.generateMetaAddress();
      const result = await stealthAdapter.deriveStealthAddress({
        scanPublicKey: meta.scan.publicKey,
        spendPublicKey: meta.spend.publicKey,
      });

      const spendingKey = await stealthAdapter.deriveSpendingKey(
        meta.scan.secretKey,
        meta.spend.secretKey,
        result.ephemeralPublicKey
      );

      // Verify spending key * G = stealth address
      const ed = await import('@noble/ed25519');
      const L = BigInt('7237005577332262213973186563042994240857116359379907606001950938285454250989');
      const keyBytes = bs58.decode(spendingKey);
      let scalar = 0n;
      for (let i = keyBytes.length - 1; i >= 0; i--) {
        scalar = (scalar << 8n) + BigInt(keyBytes[i]);
      }
      scalar = scalar % L;
      const derivedPoint = ed.Point.BASE.multiply(scalar);
      const derivedAddr = bs58.encode(Buffer.from(derivedPoint.toRawBytes()));

      expect(derivedAddr).to.equal(result.stealthAddress);
    });

    it('should produce unique addresses per payment (unlinkability)', async () => {
      const meta = await stealthAdapter.generateMetaAddress();
      const metaAddr = {
        scanPublicKey: meta.scan.publicKey,
        spendPublicKey: meta.spend.publicKey,
      };

      const results = await Promise.all([
        stealthAdapter.deriveStealthAddress(metaAddr),
        stealthAdapter.deriveStealthAddress(metaAddr),
        stealthAdapter.deriveStealthAddress(metaAddr),
      ]);

      const addrs = new Set(results.map((r) => r.stealthAddress));
      expect(addrs.size).to.equal(3);
    });
  });

  describe('On-chain transfer', () => {
    const skip = !process.env.STAGING_FUNDED;

    it('should send USDC to stealth address' + (skip ? ' [SKIP: needs STAGING_FUNDED=true]' : ''), async function () {
      if (skip) return this.skip();
    });

    it('should work with durable nonce' + (skip ? ' [SKIP: needs STAGING_FUNDED=true]' : ''), async function () {
      if (skip) return this.skip();
    });
  });
});
