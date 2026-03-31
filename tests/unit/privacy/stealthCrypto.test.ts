/**
 * Stealth Crypto Unit Tests
 *
 * Tests the native DKSAP (Dual-Key Stealth Address Protocol) implementation.
 * Validates cryptographic correctness: key generation, address derivation,
 * sender↔receiver roundtrip, and spending key derivation.
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/privacy/stealthCrypto.test.ts --timeout 30000 --reporter spec --colors
 */

import { expect } from 'chai';
import crypto from 'crypto';
import bs58 from 'bs58';
import * as ed from '@noble/ed25519';

const L = BigInt('7237005577332262213973186563042994240857116359379907606001950938285454250989');

describe('StealthCrypto (DKSAP)', () => {
  let stealthCrypto: typeof import('../../../src/services/privacy/stealth-crypto');

  before(async () => {
    stealthCrypto = await import('../../../src/services/privacy/stealth-crypto');
  });

  describe('genKeys', () => {
    it('should generate 4 base58-encoded keys from a 64-byte seed', async () => {
      const seed = crypto.randomBytes(64);
      const keys = await stealthCrypto.genKeys(new Uint8Array(seed));

      expect(keys).to.have.all.keys('pubScan', 'pubSpend', 'privScan', 'privSpend');
      expect(keys.pubScan).to.be.a('string').with.length.greaterThan(0);
      expect(keys.pubSpend).to.be.a('string').with.length.greaterThan(0);
      expect(keys.privScan).to.be.a('string').with.length.greaterThan(0);
      expect(keys.privSpend).to.be.a('string').with.length.greaterThan(0);
    });

    it('should produce valid Ed25519 points for public keys', async () => {
      const seed = crypto.randomBytes(64);
      const keys = await stealthCrypto.genKeys(new Uint8Array(seed));

      // Public keys should decode to valid curve points
      const scanPoint = ed.Point.fromHex(bs58.decode(keys.pubScan));
      const spendPoint = ed.Point.fromHex(bs58.decode(keys.pubSpend));

      expect(scanPoint).to.be.instanceOf(ed.Point);
      expect(spendPoint).to.be.instanceOf(ed.Point);
    });

    it('should produce private key scalars less than group order L', async () => {
      const seed = crypto.randomBytes(64);
      const keys = await stealthCrypto.genKeys(new Uint8Array(seed));

      const scanBytes = bs58.decode(keys.privScan);
      const spendBytes = bs58.decode(keys.privSpend);

      // Convert LE bytes to BigInt and check < L
      const scanScalar = bytesToNumberLE(scanBytes);
      const spendScalar = bytesToNumberLE(spendBytes);

      expect(scanScalar < L).to.be.true;
      expect(spendScalar < L).to.be.true;
    });

    it('should produce deterministic output for same seed', async () => {
      const seed = new Uint8Array(64).fill(42);
      const keys1 = await stealthCrypto.genKeys(seed);
      const keys2 = await stealthCrypto.genKeys(seed);

      expect(keys1.pubScan).to.equal(keys2.pubScan);
      expect(keys1.pubSpend).to.equal(keys2.pubSpend);
      expect(keys1.privScan).to.equal(keys2.privScan);
      expect(keys1.privSpend).to.equal(keys2.privSpend);
    });

    it('should produce different keys for different seeds', async () => {
      const seed1 = crypto.randomBytes(64);
      const seed2 = crypto.randomBytes(64);
      const keys1 = await stealthCrypto.genKeys(new Uint8Array(seed1));
      const keys2 = await stealthCrypto.genKeys(new Uint8Array(seed2));

      expect(keys1.pubScan).to.not.equal(keys2.pubScan);
      expect(keys1.pubSpend).to.not.equal(keys2.pubSpend);
    });

    it('should throw for seed shorter than 64 bytes', async () => {
      const shortSeed = new Uint8Array(32);
      try {
        await stealthCrypto.genKeys(shortSeed);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Seed must be at least 64 bytes');
      }
    });

    it('should produce public keys that are 32 bytes (Ed25519 compressed point)', async () => {
      const seed = crypto.randomBytes(64);
      const keys = await stealthCrypto.genKeys(new Uint8Array(seed));

      const scanPubBytes = bs58.decode(keys.pubScan);
      const spendPubBytes = bs58.decode(keys.pubSpend);

      expect(scanPubBytes.length).to.equal(32);
      expect(spendPubBytes.length).to.equal(32);
    });
  });

  describe('Sender → Receiver Roundtrip', () => {
    it('should derive identical stealth address from both sender and receiver sides', async () => {
      const seed = crypto.randomBytes(64);
      const keys = await stealthCrypto.genKeys(new Uint8Array(seed));

      // Sender side: generate ephemeral key, derive stealth address
      const ephPrivBytes = crypto.randomBytes(32);
      const ephPrivBase58 = bs58.encode(ephPrivBytes);

      // Derive ephemeral public key (same way as stealth-adapter)
      const ephScalar = bytesToNumberLE(ephPrivBytes) % L || 1n;
      const ephPubPoint = ed.Point.BASE.multiply(ephScalar);
      const ephPubBase58 = bs58.encode(Buffer.from(ephPubPoint.toRawBytes()));

      // Sender derives stealth address
      const senderStealthPoint = await stealthCrypto.senderGenAddress(
        keys.pubScan,
        keys.pubSpend,
        ephPrivBase58
      );
      const senderStealthAddr = bs58.encode(Buffer.from(senderStealthPoint.toRawBytes()));

      // Receiver detects stealth address using scan private key + ephemeral public key
      const receiverStealthAddr = await stealthCrypto.receiverGenDest(
        keys.privScan,
        keys.pubSpend,
        ephPubBase58
      );

      expect(receiverStealthAddr).to.equal(senderStealthAddr);
    });

    it('should produce different stealth addresses for different ephemeral keys', async () => {
      const seed = crypto.randomBytes(64);
      const keys = await stealthCrypto.genKeys(new Uint8Array(seed));

      const eph1 = bs58.encode(crypto.randomBytes(32));
      const eph2 = bs58.encode(crypto.randomBytes(32));

      const addr1 = await stealthCrypto.senderGenAddress(keys.pubScan, keys.pubSpend, eph1);
      const addr2 = await stealthCrypto.senderGenAddress(keys.pubScan, keys.pubSpend, eph2);

      const addr1Base58 = bs58.encode(Buffer.from(addr1.toRawBytes()));
      const addr2Base58 = bs58.encode(Buffer.from(addr2.toRawBytes()));

      expect(addr1Base58).to.not.equal(addr2Base58);
    });

    it('should produce different stealth addresses for different recipients', async () => {
      const keys1 = await stealthCrypto.genKeys(new Uint8Array(crypto.randomBytes(64)));
      const keys2 = await stealthCrypto.genKeys(new Uint8Array(crypto.randomBytes(64)));
      const eph = bs58.encode(crypto.randomBytes(32));

      const addr1 = await stealthCrypto.senderGenAddress(keys1.pubScan, keys1.pubSpend, eph);
      const addr2 = await stealthCrypto.senderGenAddress(keys2.pubScan, keys2.pubSpend, eph);

      const addr1Base58 = bs58.encode(Buffer.from(addr1.toRawBytes()));
      const addr2Base58 = bs58.encode(Buffer.from(addr2.toRawBytes()));

      expect(addr1Base58).to.not.equal(addr2Base58);
    });
  });

  describe('Spending Key Derivation', () => {
    it('should derive a spending key that corresponds to the stealth address', async () => {
      const seed = crypto.randomBytes(64);
      const keys = await stealthCrypto.genKeys(new Uint8Array(seed));

      const ephPrivBytes = crypto.randomBytes(32);
      const ephPrivBase58 = bs58.encode(ephPrivBytes);
      const ephScalar = bytesToNumberLE(ephPrivBytes) % L || 1n;
      const ephPubPoint = ed.Point.BASE.multiply(ephScalar);
      const ephPubBase58 = bs58.encode(Buffer.from(ephPubPoint.toRawBytes()));

      // Get the stealth address from the sender side
      const stealthPoint = await stealthCrypto.senderGenAddress(
        keys.pubScan,
        keys.pubSpend,
        ephPrivBase58
      );

      // Receiver derives spending key
      const spendingKeyBase58 = await stealthCrypto.receiverGenKey(
        keys.privScan,
        keys.privSpend,
        ephPubBase58
      );

      // The spending key * G should equal the stealth address point
      const spendingScalar = bytesToNumberLE(bs58.decode(spendingKeyBase58)) % L;
      const derivedPubPoint = ed.Point.BASE.multiply(spendingScalar);

      // Compare the two points
      const stealthBytes = stealthPoint.toRawBytes();
      const derivedBytes = derivedPubPoint.toRawBytes();

      expect(Buffer.from(derivedBytes).toString('hex')).to.equal(
        Buffer.from(stealthBytes).toString('hex')
      );
    });

    it('should produce a 32-byte scalar spending key', async () => {
      const keys = await stealthCrypto.genKeys(new Uint8Array(crypto.randomBytes(64)));
      const ephPriv = bs58.encode(crypto.randomBytes(32));
      const ephScalar = bytesToNumberLE(bs58.decode(ephPriv)) % L || 1n;
      const ephPubBase58 = bs58.encode(
        Buffer.from(ed.Point.BASE.multiply(ephScalar).toRawBytes())
      );

      const spendingKey = await stealthCrypto.receiverGenKey(
        keys.privScan,
        keys.privSpend,
        ephPubBase58
      );

      const keyBytes = bs58.decode(spendingKey);
      expect(keyBytes.length).to.equal(32);

      // Should be a valid scalar (< L)
      const scalar = bytesToNumberLE(keyBytes);
      expect(scalar < L).to.be.true;
    });

    it('should produce different spending keys for different ephemeral keys', async () => {
      const keys = await stealthCrypto.genKeys(new Uint8Array(crypto.randomBytes(64)));

      const eph1Priv = crypto.randomBytes(32);
      const eph1Scalar = bytesToNumberLE(eph1Priv) % L || 1n;
      const eph1Pub = bs58.encode(Buffer.from(ed.Point.BASE.multiply(eph1Scalar).toRawBytes()));

      const eph2Priv = crypto.randomBytes(32);
      const eph2Scalar = bytesToNumberLE(eph2Priv) % L || 1n;
      const eph2Pub = bs58.encode(Buffer.from(ed.Point.BASE.multiply(eph2Scalar).toRawBytes()));

      const key1 = await stealthCrypto.receiverGenKey(keys.privScan, keys.privSpend, eph1Pub);
      const key2 = await stealthCrypto.receiverGenKey(keys.privScan, keys.privSpend, eph2Pub);

      expect(key1).to.not.equal(key2);
    });
  });

  describe('Multiple roundtrips (stress)', () => {
    it('should pass sender→receiver roundtrip for 5 different key sets', async () => {
      for (let i = 0; i < 5; i++) {
        const keys = await stealthCrypto.genKeys(new Uint8Array(crypto.randomBytes(64)));
        const ephPrivBytes = crypto.randomBytes(32);
        const ephPrivBase58 = bs58.encode(ephPrivBytes);
        const ephScalar = bytesToNumberLE(ephPrivBytes) % L || 1n;
        const ephPubBase58 = bs58.encode(
          Buffer.from(ed.Point.BASE.multiply(ephScalar).toRawBytes())
        );

        const senderAddr = await stealthCrypto.senderGenAddress(
          keys.pubScan,
          keys.pubSpend,
          ephPrivBase58
        );
        const receiverAddr = await stealthCrypto.receiverGenDest(
          keys.privScan,
          keys.pubSpend,
          ephPubBase58
        );

        expect(receiverAddr).to.equal(bs58.encode(Buffer.from(senderAddr.toRawBytes())));
      }
    });
  });
});

function bytesToNumberLE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) + BigInt(bytes[i]);
  }
  return result;
}
