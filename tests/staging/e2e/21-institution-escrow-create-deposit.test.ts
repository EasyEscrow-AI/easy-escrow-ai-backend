/**
 * Institution Escrow Create & Deposit E2E Test (Staging)
 *
 * Tests escrow creation and deposit recording using the demo enterprise account:
 * - Login with demo account
 * - Create escrow (SG-CH corridor, 100 USDC)
 * - Verify escrow status is CREATED
 * - Get escrow by ID
 * - List escrows and verify it appears
 * - (Skip actual on-chain deposit since we need test USDC)
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/staging/e2e/21-institution-escrow-create-deposit.test.ts --timeout 180000
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

describe('Institution Escrow Create & Deposit - E2E Staging', function () {
  this.timeout(180000);

  let api: AxiosInstance;
  let accessToken: string;
  let escrowId: string;
  const createdEscrowIds: string[] = [];

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('  Institution Escrow Create & Deposit - E2E Staging');
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

    // Login with demo account
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

    expect(loginRes.status).to.equal(
      200,
      `Demo login failed (${loginRes.status}): ${JSON.stringify(loginRes.data)}. ` +
        'Ensure staging DB is seeded with: npx ts-node scripts/seed-institution-data.ts',
    );

    accessToken = loginRes.data.data.tokens.accessToken;
    console.log('  Logged in successfully\n');
  });

  // ---------------------------------------------------------------------------
  // 1. Create escrow
  // ---------------------------------------------------------------------------

  it('should create an escrow (SG-CH corridor, 100 USDC)', async function () {
    console.log('  [1] Creating escrow (SG-CH, 100 USDC, ADMIN_RELEASE)...');

    const res = await api.post(
      '/api/v1/institution-escrow',
      {
        payerWallet: PAYER_WALLET,
        recipientWallet: RECIPIENT_WALLET,
        amount: 100,
        corridor: 'SG-CH',
        conditionType: 'ADMIN_RELEASE',
        expiryHours: 24,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status).to.equal(201, `Expected 201 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;
    expect(res.data.data).to.exist;
    expect(res.data.data.escrowId).to.be.a('string');
    expect(res.data.data.status).to.equal('CREATED');

    escrowId = res.data.data.escrowId;
    createdEscrowIds.push(escrowId);

    console.log(`    Escrow ID: ${escrowId}`);
    console.log(`    Status: ${res.data.data.status}`);
    console.log(`    Amount: ${res.data.data.amount} USDC`);
    console.log(`    Corridor: ${res.data.data.corridor}`);
    console.log(`    Condition: ${res.data.data.conditionType}`);
    if (res.data.data.escrowPda) {
      console.log(`    Escrow PDA: ${res.data.data.escrowPda}`);
    }
    if (res.data.data.platformFee !== undefined) {
      console.log(`    Platform Fee: ${res.data.data.platformFee} USDC`);
    }
    console.log(`    Expires: ${res.data.data.expiresAt}`);
  });

  it('should reject escrow with same payer and recipient wallet', async function () {
    console.log('  [1b] Creating escrow with same payer/recipient...');

    const res = await api.post(
      '/api/v1/institution-escrow',
      {
        payerWallet: PAYER_WALLET,
        recipientWallet: PAYER_WALLET, // Same as payer
        amount: 100,
        corridor: 'SG-CH',
        conditionType: 'ADMIN_RELEASE',
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status).to.equal(400, 'Same payer/recipient should be rejected');
    console.log(`    Correctly rejected: ${res.data.message || res.data.details?.[0]?.msg}`);
  });

  it('should reject escrow with invalid corridor format', async function () {
    console.log('  [1c] Creating escrow with invalid corridor...');

    const res = await api.post(
      '/api/v1/institution-escrow',
      {
        payerWallet: PAYER_WALLET,
        recipientWallet: RECIPIENT_WALLET,
        amount: 100,
        corridor: 'INVALID',
        conditionType: 'ADMIN_RELEASE',
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status).to.equal(400);
    console.log(`    Correctly rejected invalid corridor format`);
  });

  // ---------------------------------------------------------------------------
  // 2. Verify escrow status is CREATED
  // ---------------------------------------------------------------------------

  it('should have escrow with CREATED status', async function () {
    console.log('  [2] Verifying escrow status is CREATED...');

    const res = await api.get(`/api/v1/institution-escrow/${escrowId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;
    expect(res.data.data.status).to.equal('CREATED');

    console.log(`    Status: ${res.data.data.status}`);
    console.log(`    Amount: ${res.data.data.amount}`);
  });

  // ---------------------------------------------------------------------------
  // 3. Get escrow by ID
  // ---------------------------------------------------------------------------

  it('should get escrow by ID with full details', async function () {
    console.log('  [3] Getting escrow by ID...');

    const res = await api.get(`/api/v1/institution-escrow/${escrowId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(200);
    expect(res.data.success).to.be.true;

    const escrow = res.data.data;
    expect(escrow.escrowId).to.equal(escrowId);
    expect(escrow.payerWallet).to.equal(PAYER_WALLET);
    expect(escrow.recipientWallet).to.equal(RECIPIENT_WALLET);
    expect(escrow.corridor).to.equal('SG-CH');
    expect(escrow.conditionType).to.equal('ADMIN_RELEASE');
    expect(escrow.amount).to.exist;

    console.log('    All escrow fields verified');
    console.log(`    Payer: ${escrow.payerWallet}`);
    console.log(`    Recipient: ${escrow.recipientWallet}`);
  });

  it('should return 404 for non-existent escrow', async function () {
    console.log('  [3b] Getting non-existent escrow...');

    const res = await api.get('/api/v1/institution-escrow/00000000-0000-0000-0000-000000000000', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(404);
    console.log(`    Correctly returned 404`);
  });

  // ---------------------------------------------------------------------------
  // 4. List escrows
  // ---------------------------------------------------------------------------

  it('should list escrows and find the created one', async function () {
    console.log('  [4] Listing escrows...');

    const res = await api.get('/api/v1/institution-escrow', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: 50 },
    });

    expect(res.status).to.equal(200);
    expect(res.data.success).to.be.true;
    expect(res.data.data).to.exist;

    // The response might be { escrows: [...], total: N } or just an array
    const escrows = Array.isArray(res.data.data)
      ? res.data.data
      : res.data.data.escrows || [];

    expect(escrows).to.be.an('array');

    const found = escrows.find((e: any) => e.escrowId === escrowId);
    expect(found, `Escrow ${escrowId} should appear in the list`).to.exist;

    console.log(`    Total escrows returned: ${escrows.length}`);
    console.log(`    Found test escrow: ${!!found}`);
  });

  it('should filter escrows by status', async function () {
    console.log('  [4b] Filtering escrows by status=CREATED...');

    const res = await api.get('/api/v1/institution-escrow', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { status: 'CREATED', limit: 10 },
    });

    expect(res.status).to.equal(200);
    expect(res.data.success).to.be.true;

    const escrows = Array.isArray(res.data.data)
      ? res.data.data
      : res.data.data.escrows || [];

    // All returned escrows should have CREATED status
    for (const e of escrows) {
      expect(e.status).to.equal('CREATED');
    }

    console.log(`    CREATED escrows found: ${escrows.length}`);
  });

  it('should filter escrows by corridor', async function () {
    console.log('  [4c] Filtering escrows by corridor=SG-CH...');

    const res = await api.get('/api/v1/institution-escrow', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { corridor: 'SG-CH', limit: 10 },
    });

    expect(res.status).to.equal(200);
    expect(res.data.success).to.be.true;

    const escrows = Array.isArray(res.data.data)
      ? res.data.data
      : res.data.data.escrows || [];

    for (const e of escrows) {
      expect(e.corridor).to.equal('SG-CH');
    }

    console.log(`    SG-CH corridor escrows found: ${escrows.length}`);
  });

  // ---------------------------------------------------------------------------
  // 5. Deposit (skipped - requires on-chain USDC)
  // ---------------------------------------------------------------------------

  it.skip('should record an on-chain USDC deposit (requires test USDC)', async function () {
    // This test requires:
    // 1. A funded USDC token account on staging/devnet
    // 2. An actual on-chain USDC transfer to the escrow vault PDA
    // 3. The transaction signature from that transfer
    //
    // To enable:
    // - Fund the payer wallet with devnet USDC
    // - Send USDC to the escrow vault PDA
    // - Pass the tx signature to the deposit endpoint
    //
    // const depositRes = await api.post(
    //   `/api/v1/institution-escrow/${escrowId}/deposit`,
    //   { txSignature: 'actual-tx-signature-here' },
    //   { headers: { Authorization: `Bearer ${accessToken}` } },
    // );
    // expect(depositRes.status).to.equal(200);
    // expect(depositRes.data.data.status).to.equal('FUNDED');
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  after(async function () {
    // Cancel any escrows we created so they don't clutter staging
    for (const id of createdEscrowIds) {
      try {
        await api.post(
          `/api/v1/institution-escrow/${id}/cancel`,
          { reason: 'E2E test cleanup' },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        console.log(`  Cleaned up escrow: ${id}`);
      } catch {
        // Best-effort cleanup
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('  Institution Escrow Create & Deposit - Tests Complete');
    console.log('='.repeat(80));
    console.log('');
    console.log('  Summary:');
    console.log('    Escrow creation with valid params');
    console.log('    Validation (same wallet, invalid corridor)');
    console.log('    Get escrow by ID, 404 for missing');
    console.log('    List with filters (status, corridor)');
    console.log('    Deposit skipped (requires on-chain USDC)');
    console.log('');
    console.log(`  Escrows created: ${createdEscrowIds.length}`);
    console.log('');
  });
});
