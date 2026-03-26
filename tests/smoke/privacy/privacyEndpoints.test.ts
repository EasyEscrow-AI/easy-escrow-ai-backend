/**
 * Privacy Endpoints Smoke Tests
 *
 * Verify all 7 privacy endpoints are routed and auth middleware is wired up.
 * Every endpoint should return 401 (not 404/500/502/503) without a token.
 *
 * Run: cross-env NODE_ENV=test SMOKE_TEST_URL=https://staging-api.easyescrow.ai mocha --require ts-node/register --no-config tests/smoke/privacy/privacyEndpoints.smoke.ts --timeout 30000 --reporter spec --colors
 */

import { expect } from 'chai';

const BASE_URL = process.env.SMOKE_TEST_URL || 'http://localhost:3000';

describe('Privacy Endpoints - Smoke', () => {
  it('POST /api/v1/privacy/meta-address → 401', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/privacy/meta-address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).to.equal(401);
  });

  it('GET /api/v1/privacy/meta-address/:clientId → 401', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/privacy/meta-address/test-id`);
    expect(res.status).to.equal(401);
  });

  it('DELETE /api/v1/privacy/meta-address/:id → 401', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/privacy/meta-address/test-id`, {
      method: 'DELETE',
    });
    expect(res.status).to.equal(401);
  });

  it('POST /api/v1/privacy/scan → 401', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/privacy/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).to.equal(401);
  });

  it('GET /api/v1/privacy/payments → 401', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/privacy/payments`);
    expect(res.status).to.equal(401);
  });

  it('GET /api/v1/privacy/payments/:id → 401', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/privacy/payments/test-id`);
    expect(res.status).to.equal(401);
  });

  it('POST /api/v1/privacy/sweep/:paymentId → 401', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/privacy/sweep/test-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationWallet: 'test' }),
    });
    expect(res.status).to.equal(401);
  });
});
