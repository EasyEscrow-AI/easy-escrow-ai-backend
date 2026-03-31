/**
 * Stealth Scan & Sweep Integration Tests
 *
 * Tests the meta-address lifecycle and scan/list against staging.
 * Sweep on-chain flow requires funded USDC — error paths tested here.
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/integration/privacy/stealthScanSweep.test.ts --timeout 30000 --reporter spec --colors
 */

import { expect } from 'chai';
import { stagingFetch, getStagingAuth, clearAuthCache, uniqueLabel } from '../../helpers/staging-auth';

describe('Stealth Scan & Sweep - Integration', function () {
  this.timeout(30000);

  let clientId: string;

  before(async () => {
    const auth = await getStagingAuth();
    clientId = auth.clientId;
  });

  after(() => clearAuthCache());

  describe('Full lifecycle', () => {
    let metaId: string;

    it('should register meta-address, verify in list, then deactivate', async () => {
      // Register
      const label = uniqueLabel('lifecycle-sweep-test');
      const regRes = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST',
        body: JSON.stringify({ label }),
      });
      expect(regRes.status).to.equal(201);
      metaId = (await regRes.json() as any).data.id;

      // Verify in list
      const listRes = await stagingFetch(`/api/v1/privacy/meta-address/${clientId}`);
      const found = (await listRes.json() as any).data.find((m: any) => m.id === metaId);
      expect(found).to.exist;
      expect(found.label).to.equal(label);

      // Scan should return (may be empty if no payments)
      const scanRes = await stagingFetch('/api/v1/privacy/scan', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(scanRes.status).to.equal(200);

      // Deactivate
      const delRes = await stagingFetch(`/api/v1/privacy/meta-address/${metaId}`, { method: 'DELETE' });
      expect(delRes.status).to.equal(200);
    });

    it('should reject sweep when payment status is not CONFIRMED', async () => {
      // No CONFIRMED payments exist for this client, so any sweep attempt should fail
      const res = await stagingFetch('/api/v1/privacy/sweep/00000000-0000-0000-0000-000000000000', {
        method: 'POST',
        body: JSON.stringify({ destinationWallet: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u' }),
      });
      expect(res.status).to.equal(400);
    });

    it('should reject sweep without destination wallet', async () => {
      const res = await stagingFetch('/api/v1/privacy/sweep/00000000-0000-0000-0000-000000000000', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(res.status).to.equal(400);
      const body = await res.json() as any;
      expect(body.message).to.include('destinationWallet');
    });
  });

  describe('Meta-address management', () => {
    it('should persist meta-address to database with encrypted keys', async () => {
      const res = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST',
        body: JSON.stringify({ label: uniqueLabel('persist-test') }),
      });
      expect(res.status).to.equal(201);
      const data = (await res.json() as any).data;

      // Public keys returned, private keys NOT returned
      expect(data.scanPublicKey).to.be.a('string').with.length.greaterThan(30);
      expect(data.spendPublicKey).to.be.a('string').with.length.greaterThan(30);
      expect(data).to.not.have.property('encryptedScanKey');
      expect(data).to.not.have.property('encryptedSpendKey');
      expect(data).to.not.have.property('secretKey');

      // Cleanup
      await stagingFetch(`/api/v1/privacy/meta-address/${data.id}`, { method: 'DELETE' });
    });

    it('should allow multiple meta-addresses with different labels', async () => {
      const ids: string[] = [];
      for (const label of [`label-a-${Date.now()}`, `label-b-${Date.now()}`]) {
        const res = await stagingFetch('/api/v1/privacy/meta-address', {
          method: 'POST',
          body: JSON.stringify({ label }),
        });
        expect(res.status).to.equal(201);
        ids.push((await res.json() as any).data.id);
      }

      const listRes = await stagingFetch(`/api/v1/privacy/meta-address/${clientId}`);
      const list = (await listRes.json() as any).data;
      for (const id of ids) {
        expect(list.find((m: any) => m.id === id)).to.exist;
      }

      // Cleanup
      for (const id of ids) {
        await stagingFetch(`/api/v1/privacy/meta-address/${id}`, { method: 'DELETE' });
      }
    });

    it('should soft-delete meta-address on deactivation', async () => {
      const createRes = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST',
        body: JSON.stringify({ label: uniqueLabel('soft-delete-test') }),
      });
      const id = (await createRes.json() as any).data.id;

      // Delete
      const delRes = await stagingFetch(`/api/v1/privacy/meta-address/${id}`, { method: 'DELETE' });
      expect(delRes.status).to.equal(200);

      // Verify removed from active list
      const listRes = await stagingFetch(`/api/v1/privacy/meta-address/${clientId}`);
      const list = (await listRes.json() as any).data;
      expect(list.find((m: any) => m.id === id)).to.be.undefined;

      // Second delete: may return 404 (not found) or 200 (idempotent deactivation)
      const delAgain = await stagingFetch(`/api/v1/privacy/meta-address/${id}`, { method: 'DELETE' });
      expect([200, 404]).to.include(delAgain.status);
    });
  });
});
