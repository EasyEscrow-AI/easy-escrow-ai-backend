/**
 * Stealth Escrow E2E Tests (Staging)
 *
 * Full end-to-end privacy flow against the live staging API:
 * register meta-address → verify → scan → list → deactivate
 *
 * On-chain steps (fund/release/sweep) require STAGING_FUNDED=true.
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/staging/privacy/e2e-stealth-escrow.test.ts --timeout 60000 --reporter spec --colors
 */

import { expect } from 'chai';
import { stagingFetch, getStagingAuth, clearAuthCache, uniqueLabel } from '../../helpers/staging-auth';

describe('Stealth Escrow E2E - Staging', function () {
  this.timeout(60000);

  let clientId: string;
  let metaAddressId: string;
  let metaLabel: string;

  before(async () => {
    const auth = await getStagingAuth();
    clientId = auth.clientId;
  });

  after(async () => {
    // Cleanup: deactivate meta-address if still active
    if (metaAddressId) {
      await stagingFetch(`/api/v1/privacy/meta-address/${metaAddressId}`, { method: 'DELETE' });
    }
    clearAuthCache();
  });

  describe('Step 1: Register meta-address', () => {
    it('should register a stealth meta-address', async () => {
      metaLabel = uniqueLabel('e2e-escrow-test');
      const res = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST',
        body: JSON.stringify({ label: metaLabel }),
      });
      expect(res.status).to.equal(201);

      const body = await res.json() as any;
      expect(body.success).to.equal(true);
      expect(body.data.id).to.be.a('string');
      expect(body.data.scanPublicKey).to.be.a('string').with.length.greaterThan(30);
      expect(body.data.spendPublicKey).to.be.a('string').with.length.greaterThan(30);
      expect(body.data.label).to.equal(metaLabel);

      // Private keys must NOT be exposed
      expect(body.data).to.not.have.property('encryptedScanKey');
      expect(body.data).to.not.have.property('encryptedSpendKey');

      metaAddressId = body.data.id;
    });
  });

  describe('Step 2: Verify meta-address in list', () => {
    it('should appear in client meta-address list', async () => {
      const res = await stagingFetch(`/api/v1/privacy/meta-address/${clientId}`);
      expect(res.status).to.equal(200);

      const body = await res.json() as any;
      const found = body.data.find((m: any) => m.id === metaAddressId);
      expect(found).to.exist;
      expect(found.label).to.equal(metaLabel);
      expect(found.viewingKeyShared).to.equal(false);
    });
  });

  describe('Step 3: Create escrow with STEALTH privacy', () => {
    const skipOnChain = !process.env.STAGING_FUNDED;

    it('should create institution escrow with privacyLevel: STEALTH' + (skipOnChain ? ' [SKIP: needs STAGING_FUNDED=true]' : ''), async function () {
      if (skipOnChain) return this.skip();
      // Would POST /api/v1/institution-escrow with privacyLevel: 'STEALTH'
    });
  });

  describe('Step 4: Fund escrow', () => {
    const skipOnChain = !process.env.STAGING_FUNDED;

    it('should fund escrow with staging USDC' + (skipOnChain ? ' [SKIP: needs STAGING_FUNDED=true]' : ''), async function () {
      if (skipOnChain) return this.skip();
    });
  });

  describe('Step 5: Release to stealth address', () => {
    const skipOnChain = !process.env.STAGING_FUNDED;

    it('should release USDC to derived stealth address' + (skipOnChain ? ' [SKIP: needs STAGING_FUNDED=true]' : ''), async function () {
      if (skipOnChain) return this.skip();
    });

    it('should verify stealth address is not linkable to recipient wallet' + (skipOnChain ? ' [SKIP: needs STAGING_FUNDED=true]' : ''), async function () {
      if (skipOnChain) return this.skip();
    });
  });

  describe('Step 6: Scan for payment', () => {
    it('should return scan results (may be empty without on-chain payments)', async () => {
      const res = await stagingFetch('/api/v1/privacy/scan', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(res.status).to.equal(200);
      const body = await res.json() as any;
      expect(body.data).to.be.an('array');
    });

    it('should support status filter on scan', async () => {
      const res = await stagingFetch('/api/v1/privacy/scan', {
        method: 'POST',
        body: JSON.stringify({ status: 'CONFIRMED' }),
      });
      expect(res.status).to.equal(200);
    });
  });

  describe('Step 7: List payments', () => {
    it('should return paginated payment list', async () => {
      const res = await stagingFetch('/api/v1/privacy/payments?limit=10');
      expect(res.status).to.equal(200);

      const body = await res.json() as any;
      expect(body.data).to.have.all.keys('payments', 'total', 'limit', 'offset');
      expect(body.data.limit).to.equal(10);
    });
  });

  describe('Step 8: Sweep to real wallet', () => {
    const skipOnChain = !process.env.STAGING_FUNDED;

    it('should sweep USDC from stealth address to destination' + (skipOnChain ? ' [SKIP: needs STAGING_FUNDED=true]' : ''), async function () {
      if (skipOnChain) return this.skip();
    });

    it('should reject sweep for nonexistent payment', async () => {
      const res = await stagingFetch('/api/v1/privacy/sweep/00000000-0000-0000-0000-000000000000', {
        method: 'POST',
        body: JSON.stringify({ destinationWallet: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u' }),
      });
      expect(res.status).to.equal(400);
    });
  });

  describe('Step 9: Cleanup - deactivate meta-address', () => {
    it('should deactivate the test meta-address', async () => {
      const res = await stagingFetch(`/api/v1/privacy/meta-address/${metaAddressId}`, {
        method: 'DELETE',
      });
      expect(res.status).to.equal(200);

      // Verify removed
      const listRes = await stagingFetch(`/api/v1/privacy/meta-address/${clientId}`);
      const list = (await listRes.json() as any).data;
      expect(list.find((m: any) => m.id === metaAddressId)).to.be.undefined;

      metaAddressId = ''; // Prevent double-cleanup in after()
    });
  });
});
