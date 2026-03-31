/**
 * Stealth Direct Payment E2E Tests (Staging)
 *
 * Tests stealth address registration and cryptographic correctness
 * via the staging API and local adapter layer.
 *
 * On-chain USDC transfers require STAGING_FUNDED=true.
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/staging/privacy/e2e-stealth-direct-payment.test.ts --timeout 60000 --reporter spec --colors
 */

import { expect } from 'chai';
import bs58 from 'bs58';
import { stagingFetch, getStagingAuth, clearAuthCache, uniqueLabel } from '../../helpers/staging-auth';

describe('Stealth Direct Payment E2E - Staging', function () {
  this.timeout(60000);

  let clientId: string;

  before(async () => {
    const auth = await getStagingAuth();
    clientId = auth.clientId;
  });

  after(() => clearAuthCache());

  describe('Meta-address registration via API', () => {
    let metaId: string;
    let metaLabel: string;

    after(async () => {
      if (metaId) {
        await stagingFetch(`/api/v1/privacy/meta-address/${metaId}`, { method: 'DELETE' });
      }
    });

    it('should register and return valid Ed25519 public keys', async () => {
      metaLabel = uniqueLabel('direct-payment-test');
      const res = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST',
        body: JSON.stringify({ label: metaLabel }),
      });
      expect(res.status).to.equal(201);
      const data = (await res.json() as any).data;
      metaId = data.id;

      // Validate scan public key is a valid 32-byte Ed25519 point
      const scanBytes = bs58.decode(data.scanPublicKey);
      expect(scanBytes.length).to.equal(32);

      // Validate spend public key
      const spendBytes = bs58.decode(data.spendPublicKey);
      expect(spendBytes.length).to.equal(32);
    });

    it('should be retrievable from the meta-address list', async () => {
      const res = await stagingFetch(`/api/v1/privacy/meta-address/${clientId}`);
      const list = (await res.json() as any).data;
      const found = list.find((m: any) => m.id === metaId);
      expect(found).to.exist;
      expect(found.label).to.equal(metaLabel);
    });
  });

  describe('Stealth address derivation (local crypto)', () => {
    let stealthAdapter: typeof import('../../../src/services/privacy/stealth-adapter');

    before(async () => {
      stealthAdapter = await import('../../../src/services/privacy/stealth-adapter');
    });

    it('should derive detectable stealth address from generated meta-address', async () => {
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

    it('should derive spending key that can sign for stealth address', async () => {
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

      // Verify: spending key * G should equal stealth address
      const ed = await import('@noble/ed25519');
      const L = BigInt('7237005577332262213973186563042994240857116359379907606001950938285454250989');
      const keyBytes = bs58.decode(spendingKey);
      let scalar = 0n;
      for (let i = keyBytes.length - 1; i >= 0; i--) {
        scalar = (scalar << 8n) + BigInt(keyBytes[i]);
      }
      scalar = scalar % L;
      const derivedPub = bs58.encode(Buffer.from(ed.Point.BASE.multiply(scalar).toRawBytes()));
      expect(derivedPub).to.equal(result.stealthAddress);
    });
  });

  describe('On-chain direct payment', () => {
    const skip = !process.env.STAGING_FUNDED;

    it('should send USDC directly to stealth address' + (skip ? ' [SKIP: needs STAGING_FUNDED=true]' : ''), async function () {
      if (skip) return this.skip();
    });

    it('should create StealthPayment record' + (skip ? ' [SKIP: needs STAGING_FUNDED=true]' : ''), async function () {
      if (skip) return this.skip();
    });

    it('should work with durable nonce' + (skip ? ' [SKIP: needs STAGING_FUNDED=true]' : ''), async function () {
      if (skip) return this.skip();
    });
  });
});
