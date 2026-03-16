/**
 * Integration Tests: Institution Auth Lifecycle
 *
 * Tests the full auth lifecycle via HTTP:
 * - Register -> get tokens
 * - Login with same credentials -> get tokens
 * - Use access token to GET /api/v1/institution/auth/me -> get profile
 * - Refresh token -> get new access token
 * - Logout -> revoke refresh token
 * - Try to use revoked refresh token -> fail
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon, { SinonSandbox } from 'sinon';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

import * as authServiceModule from '../../../src/services/institution-auth.service';

const JWT_SECRET = 'test-jwt-secret-for-integration-tests';

/**
 * Create a fresh test app by clearing the auth routes module cache.
 * This resets the in-memory rate limiter state between tests.
 */
function createTestApp() {
  const routeModulePath = require.resolve('../../../src/routes/institution-auth.routes');
  delete require.cache[routeModulePath];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const institutionAuthRoutes = require('../../../src/routes/institution-auth.routes').default;

  const app = express();
  app.use(express.json());
  app.set('trust proxy', 1);
  app.use(institutionAuthRoutes);
  return app;
}

function generateTestToken(payload: { clientId: string; email: string; tier: string }, expiresIn = '15m'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

describe('Institution Auth Lifecycle - Integration Tests', function () {
  this.timeout(10000);

  let sandbox: SinonSandbox;
  let app: express.Express;
  let request: supertest.Agent;
  let mockAuthService: sinon.SinonStubbedInstance<authServiceModule.InstitutionAuthService>;

  const testClientId = 'client-uuid-001';
  const testEmail = 'test@institution.com';
  const testPassword = 'SecurePass123!';
  const testCompanyName = 'Test Institution Inc';
  const testTier = 'STANDARD';

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Set JWT_SECRET env var for the middleware
    process.env.JWT_SECRET = JWT_SECRET;

    // Create mock auth service
    mockAuthService = sandbox.createStubInstance(authServiceModule.InstitutionAuthService);
    sandbox.stub(authServiceModule, 'getInstitutionAuthService').returns(mockAuthService as any);

    app = createTestApp();
    request = supertest(app);
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.JWT_SECRET;
  });

  describe('Full Auth Lifecycle', () => {
    it('should register a new institution client and return tokens', async () => {
      const accessToken = generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier });
      const refreshToken = 'mock-refresh-token-abcdef123456';

      mockAuthService.register.resolves({
        client: {
          id: testClientId,
          email: testEmail,
          companyName: testCompanyName,
          tier: testTier,
          status: 'ACTIVE',
          kycStatus: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900,
        },
      });

      const res = await request
        .post('/api/v1/institution/auth/register')
        .send({ email: testEmail, password: testPassword, companyName: testCompanyName })
        .expect(201);

      expect(res.body.success).to.be.true;
      expect(res.body.data.client.email).to.equal(testEmail);
      expect(res.body.data.client.companyName).to.equal(testCompanyName);
      expect(res.body.data.tokens.accessToken).to.be.a('string');
      expect(res.body.data.tokens.refreshToken).to.be.a('string');
      expect(res.body.data.tokens.expiresIn).to.equal(900);
      expect(res.body.timestamp).to.be.a('string');

      // Verify service was called with correct args
      expect(mockAuthService.register.calledOnceWith(testEmail, testPassword, testCompanyName)).to.be.true;
    });

    it('should login with same credentials and return tokens', async () => {
      const accessToken = generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier });
      const refreshToken = 'mock-refresh-token-login-789';

      mockAuthService.login.resolves({
        client: {
          id: testClientId,
          email: testEmail,
          companyName: testCompanyName,
          tier: testTier,
          status: 'ACTIVE',
          lastLoginAt: new Date(),
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900,
        },
      });

      const res = await request
        .post('/api/v1/institution/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.client.email).to.equal(testEmail);
      expect(res.body.data.tokens.accessToken).to.be.a('string');
      expect(res.body.data.tokens.refreshToken).to.equal(refreshToken);
    });

    it('should get profile with valid access token', async () => {
      const accessToken = generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier });

      mockAuthService.getProfile.resolves({
        id: testClientId,
        email: testEmail,
        companyName: testCompanyName,
        tier: testTier,
        status: 'ACTIVE',
        kycStatus: 'VERIFIED',
        createdAt: new Date(),
        settings: { defaultCurrency: 'USDC', timezone: 'UTC' },
      });

      const res = await request
        .get('/api/v1/institution/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.id).to.equal(testClientId);
      expect(res.body.data.email).to.equal(testEmail);
      expect(res.body.data.companyName).to.equal(testCompanyName);
      expect(res.body.data.kycStatus).to.equal('VERIFIED');

      expect(mockAuthService.getProfile.calledOnceWith(testClientId)).to.be.true;
    });

    it('should refresh token and get new access token', async () => {
      const oldRefreshToken = 'old-refresh-token-aaa';
      const newAccessToken = generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier });
      const newRefreshToken = 'new-refresh-token-bbb';

      mockAuthService.refreshToken.resolves({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 900,
      });

      const res = await request
        .post('/api/v1/institution/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.accessToken).to.equal(newAccessToken);
      expect(res.body.data.refreshToken).to.equal(newRefreshToken);
      expect(res.body.data.expiresIn).to.equal(900);

      expect(mockAuthService.refreshToken.calledOnceWith(oldRefreshToken)).to.be.true;
    });

    it('should logout and revoke refresh token', async () => {
      const accessToken = generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier });
      const refreshToken = 'refresh-token-to-revoke';

      mockAuthService.logout.resolves();

      const res = await request
        .post('/api/v1/institution/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Logged out successfully');

      expect(mockAuthService.logout.calledOnceWith(refreshToken)).to.be.true;
    });

    it('should fail to refresh with a revoked refresh token', async () => {
      const revokedRefreshToken = 'revoked-refresh-token-xyz';

      mockAuthService.refreshToken.rejects(new Error('Refresh token has been revoked'));

      const res = await request
        .post('/api/v1/institution/auth/refresh')
        .send({ refreshToken: revokedRefreshToken })
        .expect(401);

      expect(res.body.error).to.equal('Token Refresh Failed');
      expect(res.body.message).to.equal('Refresh token has been revoked');
      expect(res.body.code).to.equal('REFRESH_FAILED');
    });
  });

  describe('Registration Validation', () => {
    it('should reject registration without email', async () => {
      const res = await request
        .post('/api/v1/institution/auth/register')
        .send({ password: testPassword, companyName: testCompanyName })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      expect(res.body.message).to.include('email');
    });

    it('should reject registration without password', async () => {
      const res = await request
        .post('/api/v1/institution/auth/register')
        .send({ email: testEmail, companyName: testCompanyName })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      expect(res.body.message).to.include('password');
    });

    it('should reject registration without companyName', async () => {
      const res = await request
        .post('/api/v1/institution/auth/register')
        .send({ email: testEmail, password: testPassword })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      expect(res.body.message).to.include('companyName');
    });

    it('should return 409 for duplicate email registration', async () => {
      mockAuthService.register.rejects(new Error('Email already registered'));

      const res = await request
        .post('/api/v1/institution/auth/register')
        .send({ email: testEmail, password: testPassword, companyName: testCompanyName })
        .expect(409);

      expect(res.body.error).to.equal('Registration Failed');
      expect(res.body.message).to.include('already registered');
    });
  });

  describe('Login Validation', () => {
    it('should reject login without email', async () => {
      const res = await request
        .post('/api/v1/institution/auth/login')
        .send({ password: testPassword })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      expect(res.body.message).to.include('email');
    });

    it('should reject login without password', async () => {
      const res = await request
        .post('/api/v1/institution/auth/login')
        .send({ email: testEmail })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      expect(res.body.message).to.include('password');
    });

    it('should return 401 for invalid credentials', async () => {
      mockAuthService.login.rejects(new Error('Invalid email or password'));

      const res = await request
        .post('/api/v1/institution/auth/login')
        .send({ email: testEmail, password: 'wrong-password' })
        .expect(401);

      expect(res.body.error).to.equal('Authentication Failed');
      expect(res.body.code).to.equal('AUTH_FAILED');
    });

    it('should return 429 when rate limited', async () => {
      mockAuthService.login.rejects(new Error('Too many login attempts. Please try again later. (rate limit exceeded)'));

      const res = await request
        .post('/api/v1/institution/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(429);

      expect(res.body.error).to.equal('Authentication Failed');
      expect(res.body.code).to.equal('RATE_LIMITED');
    });
  });

  describe('Token Validation', () => {
    it('should reject /me without auth token', async () => {
      const res = await request
        .get('/api/v1/institution/auth/me')
        .expect(401);

      expect(res.body.error).to.equal('Unauthorized');
      expect(res.body.code).to.equal('TOKEN_MISSING');
    });

    it('should reject /me with expired token', async () => {
      const expiredToken = jwt.sign(
        { clientId: testClientId, email: testEmail, tier: testTier },
        JWT_SECRET,
        { expiresIn: '0s' } as jwt.SignOptions,
      );

      // Wait a moment for the token to actually expire
      await new Promise(resolve => setTimeout(resolve, 50));

      const res = await request
        .get('/api/v1/institution/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(res.body.error).to.equal('Unauthorized');
      expect(res.body.code).to.equal('TOKEN_EXPIRED');
    });

    it('should reject /me with invalid token', async () => {
      const res = await request
        .get('/api/v1/institution/auth/me')
        .set('Authorization', 'Bearer invalid-token-data')
        .expect(401);

      expect(res.body.error).to.equal('Unauthorized');
      expect(res.body.code).to.equal('TOKEN_INVALID');
    });

    it('should reject /me with token signed by wrong secret', async () => {
      const wrongToken = jwt.sign(
        { clientId: testClientId, email: testEmail, tier: testTier },
        'wrong-secret',
        { expiresIn: '15m' } as jwt.SignOptions,
      );

      const res = await request
        .get('/api/v1/institution/auth/me')
        .set('Authorization', `Bearer ${wrongToken}`)
        .expect(401);

      expect(res.body.error).to.equal('Unauthorized');
      expect(res.body.code).to.equal('TOKEN_INVALID');
    });
  });

  describe('Password Change', () => {
    it('should change password successfully', async () => {
      const accessToken = generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier });

      mockAuthService.changePassword.resolves();

      const res = await request
        .put('/api/v1/institution/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ oldPassword: 'OldPass123!', newPassword: 'NewPass456!' })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.message).to.equal('Password changed successfully');

      expect(mockAuthService.changePassword.calledOnceWith(testClientId, 'OldPass123!', 'NewPass456!')).to.be.true;
    });

    it('should reject password change without oldPassword', async () => {
      const accessToken = generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier });

      const res = await request
        .put('/api/v1/institution/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ newPassword: 'NewPass456!' })
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
    });

    it('should reject password change with incorrect old password', async () => {
      const accessToken = generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier });

      mockAuthService.changePassword.rejects(new Error('Current password is incorrect'));

      const res = await request
        .put('/api/v1/institution/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ oldPassword: 'WrongPass!', newPassword: 'NewPass456!' })
        .expect(400);

      expect(res.body.error).to.equal('Password Change Failed');
      expect(res.body.message).to.include('incorrect');
    });
  });

  describe('Logout Validation', () => {
    it('should reject logout without refresh token in body', async () => {
      const accessToken = generateTestToken({ clientId: testClientId, email: testEmail, tier: testTier });

      const res = await request
        .post('/api/v1/institution/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      expect(res.body.message).to.include('refreshToken');
    });

    it('should reject logout without auth header', async () => {
      const res = await request
        .post('/api/v1/institution/auth/logout')
        .send({ refreshToken: 'some-token' })
        .expect(401);

      expect(res.body.error).to.equal('Unauthorized');
    });
  });

  describe('Refresh Token Validation', () => {
    it('should reject refresh without refreshToken in body', async () => {
      const res = await request
        .post('/api/v1/institution/auth/refresh')
        .send({})
        .expect(400);

      expect(res.body.error).to.equal('Validation Error');
      expect(res.body.message).to.include('refreshToken');
    });

    it('should return 401 for invalid refresh token', async () => {
      mockAuthService.refreshToken.rejects(new Error('Invalid refresh token'));

      const res = await request
        .post('/api/v1/institution/auth/refresh')
        .send({ refreshToken: 'nonexistent-token' })
        .expect(401);

      expect(res.body.error).to.equal('Token Refresh Failed');
      expect(res.body.message).to.include('Invalid refresh token');
    });

    it('should return 401 for expired refresh token', async () => {
      mockAuthService.refreshToken.rejects(new Error('Refresh token has expired'));

      const res = await request
        .post('/api/v1/institution/auth/refresh')
        .send({ refreshToken: 'expired-refresh-token' })
        .expect(401);

      expect(res.body.error).to.equal('Token Refresh Failed');
      expect(res.body.message).to.include('expired');
    });
  });
});
