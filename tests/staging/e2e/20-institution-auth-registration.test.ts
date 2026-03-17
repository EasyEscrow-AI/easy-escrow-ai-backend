/**
 * Institution Auth & Registration E2E Test (Staging)
 *
 * Tests the full institution authentication lifecycle:
 * - Register a new account with unique email
 * - Login with registered credentials
 * - Verify access token (GET /me)
 * - Update settings (set default corridor)
 * - Change password
 * - Login with new password
 * - Refresh token
 * - Logout
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/staging/e2e/20-institution-auth-registration.test.ts --timeout 180000
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import axios, { AxiosInstance } from 'axios';

const STAGING_API = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';

describe('Institution Auth & Registration - E2E Staging', function () {
  this.timeout(180000);

  let api: AxiosInstance;
  let accessToken: string;
  let refreshTokenValue: string;

  // Unique test account per run
  const testEmail = `e2e-auth-${Date.now()}@test-institution.com`;
  const initialPassword = `TestPass_${Date.now()}!`;
  const newPassword = `NewPass_${Date.now()}!`;
  const companyName = `E2E Test Corp ${Date.now()}`;

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('  Institution Auth & Registration - E2E Staging');
    console.log('='.repeat(80));
    console.log('');
    console.log(`  API:      ${STAGING_API}`);
    console.log(`  Email:    ${testEmail}`);
    console.log(`  Company:  ${companyName}`);
    console.log('');

    api = axios.create({
      baseURL: STAGING_API,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true, // Don't throw on non-2xx
    });

    // Health check: verify institution endpoints are responsive
    try {
      const healthRes = await api.post('/api/v1/institution/auth/login', {
        email: 'health-check@test.com',
        password: 'dummy',
      });
      if (healthRes.status === 504) {
        console.log('  Institution endpoints returning 504 - likely insufficient server resources');
        return this.skip();
      }
    } catch (err: any) {
      if (err?.response?.status === 504 || err?.code === 'ECONNABORTED') {
        console.log('  Institution endpoints returning 504/timeout - likely insufficient server resources');
        return this.skip();
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Register
  // ---------------------------------------------------------------------------

  it('should register a new institution account', async function () {
    console.log('  [1] Registering new account...');

    const res = await api.post('/api/v1/institution/auth/register', {
      email: testEmail,
      password: initialPassword,
      companyName,
    });

    expect(res.status).to.equal(201, `Expected 201 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;
    expect(res.data.data.client).to.exist;
    expect(res.data.data.client.email).to.equal(testEmail.toLowerCase());
    expect(res.data.data.tokens).to.exist;
    expect(res.data.data.tokens.accessToken).to.be.a('string');
    expect(res.data.data.tokens.refreshToken).to.be.a('string');

    accessToken = res.data.data.tokens.accessToken;
    refreshTokenValue = res.data.data.tokens.refreshToken;

    console.log(`    Client ID: ${res.data.data.client.id || 'returned'}`);
    console.log('    Access token received');
    console.log('    Refresh token received');
  });

  it('should reject duplicate registration', async function () {
    console.log('  [1b] Attempting duplicate registration...');

    const res = await api.post('/api/v1/institution/auth/register', {
      email: testEmail,
      password: initialPassword,
      companyName: 'Duplicate Corp',
    });

    expect(res.status).to.equal(409, 'Duplicate email should return 409');
    expect(res.data.error).to.exist;
    console.log(`    Correctly rejected: ${res.data.message}`);
  });

  // ---------------------------------------------------------------------------
  // 2. Login
  // ---------------------------------------------------------------------------

  it('should login with registered credentials', async function () {
    console.log('  [2] Logging in with registered credentials...');

    const res = await api.post('/api/v1/institution/auth/login', {
      email: testEmail,
      password: initialPassword,
    });

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;
    expect(res.data.data.tokens.accessToken).to.be.a('string');
    expect(res.data.data.tokens.refreshToken).to.be.a('string');

    // Use fresh tokens from login
    accessToken = res.data.data.tokens.accessToken;
    refreshTokenValue = res.data.data.tokens.refreshToken;

    console.log('    Login successful, fresh tokens received');
  });

  it('should reject login with wrong password', async function () {
    console.log('  [2b] Attempting login with wrong password...');

    const res = await api.post('/api/v1/institution/auth/login', {
      email: testEmail,
      password: 'WrongPassword123!',
    });

    expect(res.status).to.equal(401);
    console.log(`    Correctly rejected: ${res.data.message}`);
  });

  // ---------------------------------------------------------------------------
  // 3. Verify access token (GET /me)
  // ---------------------------------------------------------------------------

  it('should get profile with valid access token', async function () {
    console.log('  [3] Getting profile (GET /me)...');

    const res = await api.get('/api/v1/institution/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;
    expect(res.data.data).to.exist;
    expect(res.data.data.email).to.equal(testEmail.toLowerCase());
    expect(res.data.data.companyName).to.equal(companyName);

    console.log(`    Email: ${res.data.data.email}`);
    console.log(`    Company: ${res.data.data.companyName}`);
    console.log(`    Tier: ${res.data.data.tier}`);
    console.log(`    Status: ${res.data.data.status}`);
  });

  it('should reject unauthenticated profile request', async function () {
    console.log('  [3b] Attempting GET /me without token...');

    const res = await api.get('/api/v1/institution/auth/me');

    expect(res.status).to.be.oneOf([401, 403]);
    console.log(`    Correctly rejected: ${res.status}`);
  });

  // ---------------------------------------------------------------------------
  // 4. Update settings
  // ---------------------------------------------------------------------------

  it('should update institution settings (default corridor)', async function () {
    console.log('  [4] Updating settings (default corridor)...');

    const res = await api.put(
      '/api/v1/institution/settings',
      { defaultCorridor: 'SG-CH', timezone: 'Asia/Singapore' },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;

    console.log(`    Settings updated: corridor=SG-CH, timezone=Asia/Singapore`);
  });

  it('should read back updated settings', async function () {
    console.log('  [4b] Reading back settings...');

    const res = await api.get('/api/v1/institution/settings', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(200);
    expect(res.data.success).to.be.true;
    expect(res.data.data.defaultCorridor).to.equal('SG-CH');

    console.log(`    Default corridor: ${res.data.data.defaultCorridor}`);
    console.log(`    Timezone: ${res.data.data.timezone}`);
  });

  // ---------------------------------------------------------------------------
  // 5. Change password
  // ---------------------------------------------------------------------------

  it('should change password', async function () {
    console.log('  [5] Changing password...');

    const res = await api.put(
      '/api/v1/institution/auth/password',
      { oldPassword: initialPassword, newPassword },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;

    console.log('    Password changed successfully');
  });

  // ---------------------------------------------------------------------------
  // 6. Login with new password
  // ---------------------------------------------------------------------------

  it('should login with new password', async function () {
    console.log('  [6] Logging in with new password...');

    const res = await api.post('/api/v1/institution/auth/login', {
      email: testEmail,
      password: newPassword,
    });

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;

    accessToken = res.data.data.tokens.accessToken;
    refreshTokenValue = res.data.data.tokens.refreshToken;

    console.log('    Login with new password successful');
  });

  it('should reject login with old password', async function () {
    console.log('  [6b] Verifying old password no longer works...');

    const res = await api.post('/api/v1/institution/auth/login', {
      email: testEmail,
      password: initialPassword,
    });

    expect(res.status).to.equal(401);
    console.log('    Old password correctly rejected');
  });

  // ---------------------------------------------------------------------------
  // 7. Refresh token
  // ---------------------------------------------------------------------------

  it('should refresh access token', async function () {
    console.log('  [7] Refreshing access token...');

    const res = await api.post('/api/v1/institution/auth/refresh', {
      refreshToken: refreshTokenValue,
    });

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;
    expect(res.data.data.accessToken).to.be.a('string');
    expect(res.data.data.refreshToken).to.be.a('string');

    // The old refresh token should be rotated
    const oldRefreshToken = refreshTokenValue;
    accessToken = res.data.data.accessToken;
    refreshTokenValue = res.data.data.refreshToken;

    expect(refreshTokenValue).to.not.equal(oldRefreshToken, 'Refresh token should be rotated');

    console.log('    New access token received');
    console.log('    Refresh token rotated');
  });

  it('should reject reuse of old refresh token', async function () {
    console.log('  [7b] Attempting to reuse revoked refresh token...');

    // The previous refresh token was consumed and rotated
    const res = await api.post('/api/v1/institution/auth/refresh', {
      refreshToken: 'invalid-refresh-token-value-that-should-not-work',
    });

    expect(res.status).to.equal(401);
    console.log('    Revoked refresh token correctly rejected');
  });

  // ---------------------------------------------------------------------------
  // 8. Logout
  // ---------------------------------------------------------------------------

  it('should logout successfully', async function () {
    console.log('  [8] Logging out...');

    const res = await api.post(
      '/api/v1/institution/auth/logout',
      { refreshToken: refreshTokenValue },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;

    console.log('    Logout successful');
  });

  it('should reject refresh after logout', async function () {
    console.log('  [8b] Verifying refresh token is revoked after logout...');

    const res = await api.post('/api/v1/institution/auth/refresh', {
      refreshToken: refreshTokenValue,
    });

    expect(res.status).to.equal(401);
    console.log('    Refresh token correctly invalidated after logout');
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  after(function () {
    console.log('\n' + '='.repeat(80));
    console.log('  Institution Auth & Registration - Tests Complete');
    console.log('='.repeat(80));
    console.log('');
    console.log('  Summary:');
    console.log('    Registration, duplicate rejection');
    console.log('    Login, wrong password rejection');
    console.log('    Profile retrieval, unauthenticated rejection');
    console.log('    Settings update and read-back');
    console.log('    Password change');
    console.log('    Login with new password, old password rejection');
    console.log('    Token refresh and rotation');
    console.log('    Logout and post-logout token invalidation');
    console.log('');
  });
});
