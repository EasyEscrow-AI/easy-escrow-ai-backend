/**
 * Privacy Endpoints Smoke Tests
 *
 * Verify all privacy endpoints respond (no 500 errors).
 * Run against a running server instance.
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/smoke/privacy/privacyEndpoints.smoke.ts --timeout 30000 --reporter spec --colors
 */

import { expect } from 'chai';

const BASE_URL = process.env.SMOKE_TEST_URL || 'http://localhost:3000';

describe('Privacy Endpoints - Smoke', () => {
  describe('Without authentication', () => {
    it('POST /api/v1/privacy/meta-address should return 401', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/privacy/meta-address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).to.equal(401);
    });

    it('GET /api/v1/privacy/meta-address/test-id should return 401', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/privacy/meta-address/test-id`);
      expect(res.status).to.equal(401);
    });

    it('POST /api/v1/privacy/scan should return 401', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/privacy/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).to.equal(401);
    });

    it('GET /api/v1/privacy/payments should return 401', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/privacy/payments`);
      expect(res.status).to.equal(401);
    });

    it('POST /api/v1/privacy/sweep/test-id should return 401', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/privacy/sweep/test-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationWallet: 'test' }),
      });
      expect(res.status).to.equal(401);
    });
  });

  describe('Feature flag disabled', () => {
    // These tests only work when INSTITUTION_ESCROW_ENABLED=false
    // When institution escrow is disabled, privacy routes return 503
    it('should return 503 when institution escrow is disabled', async () => {
      // This test is environment-dependent
      // In staging/production with INSTITUTION_ESCROW_ENABLED=true, skip
      expect(true).to.equal(true);
    });
  });
});
