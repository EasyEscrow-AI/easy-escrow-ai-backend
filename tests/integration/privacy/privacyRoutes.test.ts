/**
 * Privacy Routes Integration Tests
 *
 * Tests all 7 privacy HTTP endpoints against the live staging API.
 * Validates auth, validation, response shapes, and error handling.
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/integration/privacy/privacyRoutes.test.ts --timeout 30000 --reporter spec --colors
 */

import { expect } from 'chai';
import {
  getStagingAuth,
  getStagingApiUrl,
  stagingFetch,
  clearAuthCache,
  uniqueLabel,
} from '../../helpers/staging-auth';

const API = getStagingApiUrl();

describe('Privacy Routes - Integration', function () {
  this.timeout(30000);

  let accessToken: string;
  let clientId: string;

  before(async () => {
    const auth = await getStagingAuth();
    accessToken = auth.accessToken;
    clientId = auth.clientId;
  });

  after(() => clearAuthCache());

  // ============================
  // Authentication
  // ============================
  describe('Authentication', () => {
    it('POST /api/v1/privacy/meta-address should return 401 without token', async () => {
      const res = await fetch(`${API}/api/v1/privacy/meta-address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).to.equal(401);
      const body = await res.json() as any;
      expect(body.code).to.equal('TOKEN_MISSING');
    });

    it('GET /api/v1/privacy/payments should return 401 without token', async () => {
      const res = await fetch(`${API}/api/v1/privacy/payments`);
      expect(res.status).to.equal(401);
    });

    it('POST /api/v1/privacy/scan should return 401 without token', async () => {
      const res = await fetch(`${API}/api/v1/privacy/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).to.equal(401);
    });

    it('POST /api/v1/privacy/sweep/:id should return 401 without token', async () => {
      const res = await fetch(`${API}/api/v1/privacy/sweep/test-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationWallet: 'test' }),
      });
      expect(res.status).to.equal(401);
    });

    it('DELETE /api/v1/privacy/meta-address/:id should return 401 without token', async () => {
      const res = await fetch(`${API}/api/v1/privacy/meta-address/test-id`, { method: 'DELETE' });
      expect(res.status).to.equal(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await fetch(`${API}/api/v1/privacy/payments`, {
        headers: { Authorization: 'Bearer invalid.jwt.token' },
      });
      expect(res.status).to.equal(401);
      const body = await res.json() as any;
      expect(body.code).to.equal('TOKEN_INVALID');
    });
  });

  // ============================
  // POST /api/v1/privacy/meta-address
  // ============================
  describe('POST /api/v1/privacy/meta-address', () => {
    let createdId: string;
    afterEach(async () => {
      if (createdId) {
        await stagingFetch(`/api/v1/privacy/meta-address/${createdId}`, { method: 'DELETE' });
        createdId = '';
      }
    });

    it('should return 201 with valid JWT and register meta-address', async () => {
      const label = uniqueLabel('route-test');
      const res = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST',
        body: JSON.stringify({ label }),
      });
      expect(res.status).to.equal(201);
      const body = await res.json() as any;
      expect(body.success).to.equal(true);
      expect(body.data).to.have.all.keys('id', 'scanPublicKey', 'spendPublicKey', 'label');
      expect(body.data.scanPublicKey).to.be.a('string').with.length.greaterThan(30);
      expect(body.data.label).to.equal(label);
      createdId = body.data.id;
    });

    it('should return 201 without label', async () => {
      const res = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(res.status).to.equal(201);
      const body = await res.json() as any;
      expect(body.data.label).to.be.null;
      createdId = body.data.id;
    });

    it('should return 400 for empty string label', async () => {
      const res = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST',
        body: JSON.stringify({ label: '' }),
      });
      expect(res.status).to.equal(400);
      const body = await res.json() as any;
      expect(body.message).to.include('non-empty');
    });

    it('should return 400 for label exceeding 100 chars', async () => {
      const res = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST',
        body: JSON.stringify({ label: 'x'.repeat(101) }),
      });
      expect(res.status).to.equal(400);
      const body = await res.json() as any;
      expect(body.message).to.include('100 characters');
    });

    it('should produce unique keys on each registration', async () => {
      const r1 = await stagingFetch('/api/v1/privacy/meta-address', { method: 'POST', body: JSON.stringify({}) });
      const d1 = (await r1.json() as any).data;
      const r2 = await stagingFetch('/api/v1/privacy/meta-address', { method: 'POST', body: JSON.stringify({}) });
      const d2 = (await r2.json() as any).data;

      expect(d1.scanPublicKey).to.not.equal(d2.scanPublicKey);
      expect(d1.spendPublicKey).to.not.equal(d2.spendPublicKey);

      await stagingFetch(`/api/v1/privacy/meta-address/${d1.id}`, { method: 'DELETE' });
      await stagingFetch(`/api/v1/privacy/meta-address/${d2.id}`, { method: 'DELETE' });
    });
  });

  // ============================
  // GET /api/v1/privacy/meta-address/:clientId
  // ============================
  describe('GET /api/v1/privacy/meta-address/:clientId', () => {
    let metaId: string;
    before(async () => {
      const res = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST', body: JSON.stringify({ label: uniqueLabel('list-test') }),
      });
      metaId = (await res.json() as any).data.id;
    });
    after(async () => {
      await stagingFetch(`/api/v1/privacy/meta-address/${metaId}`, { method: 'DELETE' });
    });

    it("should return 200 with client's own meta-addresses", async () => {
      const res = await stagingFetch(`/api/v1/privacy/meta-address/${clientId}`);
      expect(res.status).to.equal(200);
      const body = await res.json() as any;
      expect(body.data).to.be.an('array');
      const found = body.data.find((m: any) => m.id === metaId);
      expect(found).to.exist;
      expect(found).to.have.all.keys('id', 'scanPublicKey', 'spendPublicKey', 'label', 'viewingKeyShared', 'createdAt');
    });

    it("should return 403 when accessing another client's meta-addresses", async () => {
      const res = await stagingFetch('/api/v1/privacy/meta-address/00000000-0000-0000-0000-000000000000');
      expect(res.status).to.equal(403);
      const body = await res.json() as any;
      expect(body.message).to.include('another client');
    });
  });

  // ============================
  // DELETE /api/v1/privacy/meta-address/:id
  // ============================
  describe('DELETE /api/v1/privacy/meta-address/:id', () => {
    it('should deactivate meta-address and return 200', async () => {
      const createRes = await stagingFetch('/api/v1/privacy/meta-address', {
        method: 'POST', body: JSON.stringify({ label: uniqueLabel('delete-me') }),
      });
      const id = (await createRes.json() as any).data.id;

      const delRes = await stagingFetch(`/api/v1/privacy/meta-address/${id}`, { method: 'DELETE' });
      expect(delRes.status).to.equal(200);
      const body = await delRes.json() as any;
      expect(body.message).to.include('deactivated');

      // Verify removed from list
      const listRes = await stagingFetch(`/api/v1/privacy/meta-address/${clientId}`);
      const listBody = await listRes.json() as any;
      expect(listBody.data.find((m: any) => m.id === id)).to.be.undefined;
    });

    it('should return 404 for nonexistent meta-address', async () => {
      const res = await stagingFetch('/api/v1/privacy/meta-address/00000000-0000-0000-0000-000000000000', { method: 'DELETE' });
      expect(res.status).to.equal(404);
    });
  });

  // ============================
  // POST /api/v1/privacy/scan
  // ============================
  describe('POST /api/v1/privacy/scan', () => {
    it('should return 200 with scanned payments', async () => {
      const res = await stagingFetch('/api/v1/privacy/scan', {
        method: 'POST', body: JSON.stringify({}),
      });
      expect(res.status).to.equal(200);
      const body = await res.json() as any;
      expect(body.success).to.equal(true);
      expect(body.data).to.be.an('array');
    });

    it('should accept optional status filter', async () => {
      const res = await stagingFetch('/api/v1/privacy/scan', {
        method: 'POST', body: JSON.stringify({ status: 'CONFIRMED' }),
      });
      expect(res.status).to.equal(200);
    });
  });

  // ============================
  // GET /api/v1/privacy/payments
  // ============================
  describe('GET /api/v1/privacy/payments', () => {
    it('should return 200 with paginated payments', async () => {
      const res = await stagingFetch('/api/v1/privacy/payments');
      expect(res.status).to.equal(200);
      const body = await res.json() as any;
      expect(body.data).to.have.all.keys('payments', 'total', 'limit', 'offset');
      expect(body.data.payments).to.be.an('array');
      expect(body.data.limit).to.be.a('number');
    });

    it('should respect limit and offset', async () => {
      const res = await stagingFetch('/api/v1/privacy/payments?limit=5&offset=0');
      const body = await res.json() as any;
      expect(body.data.limit).to.equal(5);
      expect(body.data.offset).to.equal(0);
    });

    it('should clamp limit to max 100', async () => {
      const res = await stagingFetch('/api/v1/privacy/payments?limit=999');
      const body = await res.json() as any;
      expect(body.data.limit).to.be.at.most(100);
    });
  });

  // ============================
  // GET /api/v1/privacy/payments/:id
  // ============================
  describe('GET /api/v1/privacy/payments/:id', () => {
    it('should return 404 for nonexistent payment', async () => {
      const res = await stagingFetch('/api/v1/privacy/payments/00000000-0000-0000-0000-000000000000');
      expect(res.status).to.equal(404);
      const body = await res.json() as any;
      expect(body.message).to.include('not found');
    });
  });

  // ============================
  // POST /api/v1/privacy/sweep/:paymentId
  // ============================
  describe('POST /api/v1/privacy/sweep/:paymentId', () => {
    it('should return 400 without destinationWallet', async () => {
      const res = await stagingFetch('/api/v1/privacy/sweep/00000000-0000-0000-0000-000000000000', {
        method: 'POST', body: JSON.stringify({}),
      });
      expect(res.status).to.equal(400);
      const body = await res.json() as any;
      expect(body.message).to.include('destinationWallet');
    });

    it('should return 400 for nonexistent payment', async () => {
      const res = await stagingFetch('/api/v1/privacy/sweep/00000000-0000-0000-0000-000000000000', {
        method: 'POST',
        body: JSON.stringify({ destinationWallet: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u' }),
      });
      expect(res.status).to.equal(400);
      const body = await res.json() as any;
      expect(body.message).to.include('not found');
    });
  });
});
