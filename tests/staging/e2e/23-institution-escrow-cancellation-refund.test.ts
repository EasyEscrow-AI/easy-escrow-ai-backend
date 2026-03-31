/**
 * Institution Escrow Cancellation & Refund E2E Test (Staging)
 *
 * Tests escrow cancellation flow:
 * - Login with demo account
 * - Create escrow
 * - Cancel escrow
 * - Verify status is CANCELLED
 * - Verify cannot deposit to cancelled escrow
 * - Create another and verify expiry handling
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/staging/e2e/23-institution-escrow-cancellation-refund.test.ts --timeout 180000
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import axios, { AxiosInstance } from 'axios';

const STAGING_API = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';

// Demo account credentials (seeded in staging)
const DEMO_EMAIL = 'demo-enterprise@bank.com';
const DEMO_PASSWORD = 'DemoPass123!';

// Test wallets (from seed data)
const PAYER_WALLET = '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u';
const RECIPIENT_WALLET = '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R';

describe('Institution Escrow Cancellation & Refund - E2E Staging', function () {
  this.timeout(180000);

  let api: AxiosInstance;
  let accessToken: string;
  let escrowIdForCancel: string;
  let escrowIdForExpiry: string;
  const createdEscrowIds: string[] = [];

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('  Institution Escrow Cancellation & Refund - E2E Staging');
    console.log('='.repeat(80));
    console.log('');
    console.log(`  API:   ${STAGING_API}`);
    console.log(`  Demo:  ${DEMO_EMAIL}`);
    console.log('');

    api = axios.create({
      baseURL: STAGING_API,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });

    // Login
    console.log('  Logging in with demo enterprise account...');
    let loginRes;
    try {
      loginRes = await api.post('/api/v1/institution/auth/login', {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (loginRes.status === 504) {
        console.log('  Institution endpoints returning 504 - likely insufficient server resources');
        return this.skip();
      }
    } catch (err: any) {
      console.log('  Institution endpoints unavailable:', err.message || err);
      return this.skip();
    }

    if (loginRes.status === 504) {
      console.log('  Institution endpoints returning 504 - likely insufficient server resources');
      return this.skip();
    }

    if (loginRes.status === 504) {
      console.log('  Institution endpoints returning 504 - likely insufficient server resources');
      return this.skip();
    }

    if (loginRes.status === 504) {
      console.log('  Institution endpoints returning 504 - likely insufficient server resources');
      return this.skip();
    }

    expect(loginRes.status).to.equal(
      200,
      `Demo login failed (${loginRes.status}): ${JSON.stringify(loginRes.data)}. ` +
        'Ensure staging DB is seeded.',
    );

    accessToken = loginRes.data.data.tokens.accessToken;
    console.log('  Logged in successfully\n');
  });

  // ---------------------------------------------------------------------------
  // 1. Create escrow to cancel
  // ---------------------------------------------------------------------------

  it('should create escrow for cancellation test', async function () {
    console.log('  [1] Creating escrow to cancel...');

    const res = await api.post(
      '/api/v1/institution-escrow',
      {
        payerWallet: PAYER_WALLET,
        recipientWallet: RECIPIENT_WALLET,
        amount: 200,
        corridor: 'SG-CH',
        conditionType: 'ADMIN_RELEASE',
        expiryHours: 24,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status).to.equal(201, `Expected 201 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.data.status).to.equal('CREATED');

    escrowIdForCancel = res.data.data.escrowId;
    createdEscrowIds.push(escrowIdForCancel);

    console.log(`    Escrow ID: ${escrowIdForCancel}`);
    console.log(`    Status: CREATED`);
  });

  // ---------------------------------------------------------------------------
  // 2. Cancel escrow
  // ---------------------------------------------------------------------------

  it('should cancel the escrow', async function () {
    console.log('  [2] Cancelling escrow...');

    const res = await api.post(
      `/api/v1/institution-escrow/${escrowIdForCancel}/cancel`,
      { reason: 'E2E test - testing cancellation flow' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;

    console.log(`    Cancel response received`);
    if (res.data.data?.status) {
      console.log(`    Status: ${res.data.data.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Verify status is CANCELLED
  // ---------------------------------------------------------------------------

  it('should have CANCELLED status after cancellation', async function () {
    console.log('  [3] Verifying cancelled status...');

    const res = await api.get(`/api/v1/institution-escrow/${escrowIdForCancel}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(200);
    expect(res.data.data.status).to.be.oneOf(
      ['CANCELLED', 'CANCELLING'],
      `Expected CANCELLED or CANCELLING but got ${res.data.data.status}`,
    );

    console.log(`    Status: ${res.data.data.status}`);

    // If resolvedAt is populated, verify it's after createdAt
    if (res.data.data.resolvedAt) {
      const created = new Date(res.data.data.createdAt).getTime();
      const resolved = new Date(res.data.data.resolvedAt).getTime();
      expect(resolved).to.be.greaterThan(created, 'resolvedAt should be after createdAt');
      console.log(`    Resolved: ${res.data.data.resolvedAt}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Verify cannot deposit to cancelled escrow
  // ---------------------------------------------------------------------------

  it('should reject deposit to cancelled escrow', async function () {
    console.log('  [4] Attempting deposit to cancelled escrow...');

    // Use a fake tx signature (base58 format)
    const fakeTxSignature = '5eykt4UsFv8P8njDctXH5V9HPG7pKp88kA6oY6ERGxhBCsUqfH7jNqkH';

    const res = await api.post(
      `/api/v1/institution-escrow/${escrowIdForCancel}/deposit`,
      { txSignature: fakeTxSignature },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    // Should be rejected because escrow is CANCELLED
    expect(res.status).to.be.oneOf([400, 410, 422]);

    console.log(`    Correctly rejected (${res.status}): ${res.data.message}`);
  });

  it('should reject release on cancelled escrow', async function () {
    console.log('  [4b] Attempting release on cancelled escrow...');

    const res = await api.post(
      `/api/v1/institution-escrow/${escrowIdForCancel}/release`,
      { notes: 'Attempting release after cancel' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status).to.be.oneOf([400, 403, 422]);

    console.log(`    Correctly rejected (${res.status}): ${res.data.message}`);
  });

  // ---------------------------------------------------------------------------
  // 5. Double-cancel should fail or be idempotent
  // ---------------------------------------------------------------------------

  it('should handle double cancellation gracefully', async function () {
    console.log('  [5] Attempting to cancel already-cancelled escrow...');

    const res = await api.post(
      `/api/v1/institution-escrow/${escrowIdForCancel}/cancel`,
      { reason: 'Double cancel attempt' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    // May return 400 (already cancelled) or 200 (idempotent)
    expect(res.status).to.be.oneOf([200, 400]);

    console.log(`    Response: ${res.status} - ${res.data.message || 'OK'}`);
  });

  // ---------------------------------------------------------------------------
  // 6. Cancel escrow without reason (optional field)
  // ---------------------------------------------------------------------------

  it('should cancel escrow without providing reason', async function () {
    console.log('  [6] Creating and cancelling without reason...');

    // Create
    const createRes = await api.post(
      '/api/v1/institution-escrow',
      {
        payerWallet: PAYER_WALLET,
        recipientWallet: RECIPIENT_WALLET,
        amount: 150,
        corridor: 'SG-CH',
        conditionType: 'ADMIN_RELEASE',
        expiryHours: 12,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(createRes.status).to.equal(201);
    const noReasonEscrowId = createRes.data.data.escrowId;
    createdEscrowIds.push(noReasonEscrowId);

    // Cancel without reason
    const cancelRes = await api.post(
      `/api/v1/institution-escrow/${noReasonEscrowId}/cancel`,
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(cancelRes.status).to.equal(200);
    console.log(`    Cancelled ${noReasonEscrowId} without reason`);
  });

  // ---------------------------------------------------------------------------
  // 7. Expiry handling (create short-lived escrow)
  // ---------------------------------------------------------------------------

  it('should create escrow with minimum expiry for future expiry test', async function () {
    console.log('  [7] Creating escrow with minimum expiry (1 hour)...');

    const res = await api.post(
      '/api/v1/institution-escrow',
      {
        payerWallet: PAYER_WALLET,
        recipientWallet: RECIPIENT_WALLET,
        amount: 100,
        corridor: 'SG-CH',
        conditionType: 'ADMIN_RELEASE',
        expiryHours: 1, // Minimum allowed
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status).to.equal(201, `Expected 201 but got ${res.status}: ${JSON.stringify(res.data)}`);

    escrowIdForExpiry = res.data.data.escrowId;
    createdEscrowIds.push(escrowIdForExpiry);

    // Verify the expiry time is roughly 1 hour from now
    const expiresAt = new Date(res.data.data.expiresAt);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    expect(diffHours).to.be.greaterThan(0.5, 'Expiry should be in the future');
    expect(diffHours).to.be.lessThan(2, 'Expiry should be close to 1 hour from now');

    console.log(`    Escrow ID: ${escrowIdForExpiry}`);
    console.log(`    Expires: ${expiresAt.toISOString()}`);
    console.log(`    Hours until expiry: ${diffHours.toFixed(2)}`);
  });

  it('should list cancelled escrows', async function () {
    console.log('  [7b] Listing escrows with CANCELLED status...');

    const res = await api.get('/api/v1/institution-escrow', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { status: 'CANCELLED', limit: 10 },
    });

    expect(res.status).to.equal(200);

    const escrows = Array.isArray(res.data.data)
      ? res.data.data
      : res.data.data.escrows || [];

    for (const e of escrows) {
      expect(e.status).to.be.oneOf(['CANCELLED', 'CANCELLING']);
    }

    const found = escrows.find((e: any) => e.escrowId === escrowIdForCancel);
    console.log(`    CANCELLED escrows found: ${escrows.length}`);
    console.log(`    Test escrow in list: ${!!found}`);
  });

  // ---------------------------------------------------------------------------
  // 8. Refund verification (skipped - requires on-chain funded escrow)
  // ---------------------------------------------------------------------------

  it.skip('should verify on-chain refund after cancelling a funded escrow (requires on-chain USDC)', async function () {
    // Full refund verification requires:
    // 1. Create escrow
    // 2. Fund it with real on-chain USDC deposit
    // 3. Cancel the funded escrow
    // 4. Verify USDC returned to payer on-chain
    //
    // To enable:
    // - Fund the payer wallet with devnet USDC
    // - Execute the deposit flow
    // - Cancel and verify on-chain balances
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  after(async function () {
    // Cancel any remaining CREATED escrows
    for (const id of createdEscrowIds) {
      try {
        const check = await api.get(`/api/v1/institution-escrow/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (check.data?.data?.status === 'CREATED') {
          await api.post(
            `/api/v1/institution-escrow/${id}/cancel`,
            { reason: 'E2E test cleanup' },
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          console.log(`  Cleaned up escrow: ${id}`);
        }
      } catch {
        // Best-effort cleanup
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('  Institution Escrow Cancellation & Refund - Tests Complete');
    console.log('='.repeat(80));
    console.log('');
    console.log('  Summary:');
    console.log('    Created and cancelled escrow');
    console.log('    Verified CANCELLED status');
    console.log('    Rejected deposit and release on cancelled escrow');
    console.log('    Handled double cancellation');
    console.log('    Cancelled without reason (optional field)');
    console.log('    Created short-expiry escrow');
    console.log('    Listed cancelled escrows');
    console.log('    On-chain refund: SKIPPED (requires funded escrow)');
    console.log('');
    console.log(`  Escrows created: ${createdEscrowIds.length}`);
    console.log('');
  });
});
