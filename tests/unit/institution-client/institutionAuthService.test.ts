import { expect } from 'chai';
import sinon from 'sinon';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Set env for tests before importing service modules
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.JWT_ACCESS_TOKEN_EXPIRY = '15m';
process.env.JWT_REFRESH_TOKEN_EXPIRY = '7d';

import {
  createMockPrismaClient,
  createTestClient,
  createMockRedisClient,
} from '../../helpers/institution-test-utils';

describe('InstitutionAuthService', () => {
  let sandbox: sinon.SinonSandbox;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  let mockRedis: ReturnType<typeof createMockRedisClient>;
  let authService: any;

  // We dynamically construct the service and replace its internal prisma + redis
  beforeEach(async () => {
    sandbox = sinon.createSandbox();

    mockPrisma = createMockPrismaClient();
    mockRedis = createMockRedisClient();

    // Stub PrismaClient constructor to return our mock
    // Import the module and create the service, then replace internal state
    const authModule = await import(
      '../../../src/services/institution-auth.service'
    );

    // Create a new instance -- the constructor calls `new PrismaClient()` internally,
    // but we immediately replace the private prisma reference with our mock.
    authService = new (authModule.InstitutionAuthService as any)();
    (authService as any).prisma = mockPrisma;

    // Stub the redisClient module used for rate-limiting
    const redisModule = await import('../../../src/config/redis');
    sandbox.stub(redisModule, 'redisClient').value(mockRedis);
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------
  describe('register', () => {
    it('should register a new client successfully', async () => {
      const testClient = createTestClient({
        settings: { id: 'settings-1', clientId: 'test-client-id' },
      });

      mockPrisma.institutionClient.findUnique.resolves(null);
      mockPrisma.institutionClient.create.resolves(testClient);
      mockPrisma.institutionRefreshToken.create.resolves({
        id: 'rt-1',
        tokenHash: 'hash',
        clientId: testClient.id,
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });

      const result = await authService.register(
        'new@example.com',
        'SecurePass123!',
        'New Corp'
      );

      expect(result).to.have.property('client');
      expect(result).to.have.property('tokens');
      expect(result.client).to.not.have.property('passwordHash');
      expect(result.tokens).to.have.property('accessToken');
      expect(result.tokens).to.have.property('refreshToken');
      expect(result.tokens).to.have.property('expiresIn');

      // Verify findUnique was called with normalized email
      expect(mockPrisma.institutionClient.findUnique.calledOnce).to.be.true;
      const findArg =
        mockPrisma.institutionClient.findUnique.firstCall.args[0];
      expect(findArg.where.email).to.equal('new@example.com');

      // Verify create was called
      expect(mockPrisma.institutionClient.create.calledOnce).to.be.true;
    });

    it('should reject duplicate email registration', async () => {
      const existingClient = createTestClient();
      mockPrisma.institutionClient.findUnique.resolves(existingClient);

      try {
        await authService.register(
          'test@example.com',
          'SecurePass123!',
          'Dup Corp'
        );
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Email already registered');
      }

      // Should NOT have called create
      expect(mockPrisma.institutionClient.create.called).to.be.false;
    });

    it('should hash the password before storing', async () => {
      const bcryptHashStub = sandbox
        .stub(bcrypt, 'hash')
        .resolves('$2b$12$mockedhash' as any);

      const testClient = createTestClient();
      mockPrisma.institutionClient.findUnique.resolves(null);
      mockPrisma.institutionClient.create.resolves(testClient);
      mockPrisma.institutionRefreshToken.create.resolves({
        id: 'rt-1',
        tokenHash: 'hash',
        clientId: testClient.id,
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });

      await authService.register(
        'hash-test@example.com',
        'RawPassword!1',
        'Hash Corp'
      );

      expect(bcryptHashStub.calledOnce).to.be.true;
      expect(bcryptHashStub.firstCall.args[0]).to.equal('RawPassword!1');
      expect(bcryptHashStub.firstCall.args[1]).to.equal(12);
    });

    it('should normalize email to lowercase and trim', async () => {
      const testClient = createTestClient();
      mockPrisma.institutionClient.findUnique.resolves(null);
      mockPrisma.institutionClient.create.resolves(testClient);
      mockPrisma.institutionRefreshToken.create.resolves({
        id: 'rt-1',
        tokenHash: 'hash',
        clientId: testClient.id,
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });

      await authService.register(
        '  Test@EXAMPLE.com  ',
        'SecurePass123!',
        'Trim Corp'
      );

      const findArg =
        mockPrisma.institutionClient.findUnique.firstCall.args[0];
      expect(findArg.where.email).to.equal('test@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------
  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('SecurePass123!', 4); // low rounds for speed
      const testClient = createTestClient({ passwordHash: hashedPassword });

      // Rate limit check: no previous attempts
      mockRedis.get.resolves(null);

      mockPrisma.institutionClient.findUnique.resolves(testClient);
      mockPrisma.institutionClient.update.resolves(testClient);
      mockPrisma.institutionRefreshToken.create.resolves({
        id: 'rt-1',
        tokenHash: 'hash',
        clientId: testClient.id,
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });

      const result = await authService.login(
        'test@example.com',
        'SecurePass123!'
      );

      expect(result).to.have.property('client');
      expect(result).to.have.property('tokens');
      expect(result.client).to.not.have.property('passwordHash');
      expect(result.tokens).to.have.property('accessToken');

      // Verify lastLoginAt was updated
      expect(mockPrisma.institutionClient.update.calledOnce).to.be.true;
    });

    it('should reject wrong password', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPassword!1', 4);
      const testClient = createTestClient({ passwordHash: hashedPassword });

      mockRedis.get.resolves(null);
      mockRedis.incr.resolves(1);
      mockRedis.expire.resolves(1);

      mockPrisma.institutionClient.findUnique.resolves(testClient);

      try {
        await authService.login('test@example.com', 'WrongPassword!1');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Invalid email or password');
      }
    });

    it('should reject non-existent email', async () => {
      mockRedis.get.resolves(null);
      mockRedis.incr.resolves(1);
      mockRedis.expire.resolves(1);

      mockPrisma.institutionClient.findUnique.resolves(null);

      try {
        await authService.login('nobody@example.com', 'SomePass!1');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Invalid email or password');
      }
    });

    it('should enforce rate limiting after too many attempts', async () => {
      // Simulate 5 previous failed attempts
      mockRedis.get.resolves('5');

      try {
        await authService.login('test@example.com', 'AnyPass!1');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.include('Too many login attempts');
      }

      // Should NOT have called findUnique since rate limit blocked it
      expect(mockPrisma.institutionClient.findUnique.called).to.be.false;
    });

    it('should increment login attempts on failed login', async () => {
      mockRedis.get.resolves(null);
      mockRedis.incr.resolves(1);
      mockRedis.expire.resolves(1);

      mockPrisma.institutionClient.findUnique.resolves(null);

      try {
        await authService.login('fail@example.com', 'BadPass!1');
      } catch {
        // expected
      }

      expect(mockRedis.incr.calledOnce).to.be.true;
      const incrKey = mockRedis.incr.firstCall.args[0] as string;
      expect(incrKey).to.include('institution:login:attempts:');
    });
  });

  // ---------------------------------------------------------------------------
  // Token Refresh
  // ---------------------------------------------------------------------------
  describe('refreshToken', () => {
    it('should refresh a valid token', async () => {
      const rawRefreshToken = crypto.randomBytes(64).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawRefreshToken)
        .digest('hex');

      const testClient = createTestClient();
      const storedToken = {
        id: 'rt-1',
        tokenHash,
        clientId: testClient.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        revokedAt: null,
        createdAt: new Date(),
        client: testClient,
      };

      mockPrisma.institutionRefreshToken.findUnique.resolves(storedToken);
      mockPrisma.institutionRefreshToken.update.resolves({
        ...storedToken,
        revokedAt: new Date(),
      });
      mockPrisma.institutionRefreshToken.create.resolves({
        id: 'rt-2',
        tokenHash: 'new-hash',
        clientId: testClient.id,
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });

      const result = await authService.refreshToken(rawRefreshToken);

      expect(result).to.have.property('accessToken');
      expect(result).to.have.property('refreshToken');
      expect(result).to.have.property('expiresIn');

      // Old token should be revoked
      expect(mockPrisma.institutionRefreshToken.update.calledOnce).to.be.true;
    });

    it('should reject an expired refresh token', async () => {
      const rawRefreshToken = crypto.randomBytes(64).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawRefreshToken)
        .digest('hex');

      const storedToken = {
        id: 'rt-1',
        tokenHash,
        clientId: 'test-client-id',
        expiresAt: new Date(Date.now() - 1000), // expired
        revokedAt: null,
        createdAt: new Date(),
        client: createTestClient(),
      };

      mockPrisma.institutionRefreshToken.findUnique.resolves(storedToken);

      try {
        await authService.refreshToken(rawRefreshToken);
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Refresh token has expired');
      }
    });

    it('should reject a revoked refresh token', async () => {
      const rawRefreshToken = crypto.randomBytes(64).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawRefreshToken)
        .digest('hex');

      const storedToken = {
        id: 'rt-1',
        tokenHash,
        clientId: 'test-client-id',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        revokedAt: new Date(), // already revoked
        createdAt: new Date(),
        client: createTestClient(),
      };

      mockPrisma.institutionRefreshToken.findUnique.resolves(storedToken);

      try {
        await authService.refreshToken(rawRefreshToken);
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Refresh token has been revoked');
      }
    });

    it('should reject an invalid refresh token', async () => {
      mockPrisma.institutionRefreshToken.findUnique.resolves(null);

      try {
        await authService.refreshToken('invalid-token-value');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Invalid refresh token');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Change Password
  // ---------------------------------------------------------------------------
  describe('changePassword', () => {
    it('should change password with correct old password', async () => {
      const oldPassword = 'OldSecure!1';
      const hashedOld = await bcrypt.hash(oldPassword, 4);
      const testClient = createTestClient({ passwordHash: hashedOld });

      mockPrisma.institutionClient.findUnique.resolves(testClient);
      mockPrisma.institutionClient.update.resolves(testClient);

      // Should not throw
      await authService.changePassword(
        testClient.id,
        oldPassword,
        'NewSecure!2'
      );

      expect(mockPrisma.institutionClient.update.calledOnce).to.be.true;
      const updateArg =
        mockPrisma.institutionClient.update.firstCall.args[0];
      expect(updateArg.data).to.have.property('passwordHash');
      // The new hash should be different from the old one
      expect(updateArg.data.passwordHash).to.not.equal(hashedOld);
    });

    it('should reject change with wrong old password', async () => {
      const hashedOld = await bcrypt.hash('CorrectOld!1', 4);
      const testClient = createTestClient({ passwordHash: hashedOld });

      mockPrisma.institutionClient.findUnique.resolves(testClient);

      try {
        await authService.changePassword(
          testClient.id,
          'WrongOld!1',
          'NewSecure!2'
        );
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Current password is incorrect');
      }

      // Should NOT have called update
      expect(mockPrisma.institutionClient.update.called).to.be.false;
    });

    it('should throw if client not found', async () => {
      mockPrisma.institutionClient.findUnique.resolves(null);

      try {
        await authService.changePassword(
          'nonexistent-id',
          'OldPass!1',
          'NewPass!2'
        );
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Client not found');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------
  describe('getProfile', () => {
    it('should return sanitized client without passwordHash', async () => {
      const testClient = createTestClient({
        settings: { id: 'settings-1', clientId: 'test-client-id' },
      });

      mockPrisma.institutionClient.findUnique.resolves(testClient);

      const profile = await authService.getProfile('test-client-id');

      expect(profile).to.not.have.property('passwordHash');
      expect(profile).to.have.property('email', 'test@example.com');
      expect(profile).to.have.property('companyName', 'Test Corp');
      expect(profile).to.have.property('tier', 'STANDARD');
    });

    it('should throw if client not found', async () => {
      mockPrisma.institutionClient.findUnique.resolves(null);

      try {
        await authService.getProfile('nonexistent-id');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Client not found');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------
  describe('logout', () => {
    it('should revoke a valid refresh token on logout', async () => {
      const rawRefreshToken = crypto.randomBytes(64).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawRefreshToken)
        .digest('hex');

      const storedToken = {
        id: 'rt-1',
        tokenHash,
        clientId: 'test-client-id',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        revokedAt: null,
        createdAt: new Date(),
      };

      mockPrisma.institutionRefreshToken.findUnique.resolves(storedToken);
      mockPrisma.institutionRefreshToken.update.resolves({
        ...storedToken,
        revokedAt: new Date(),
      });

      await authService.logout(rawRefreshToken);

      expect(mockPrisma.institutionRefreshToken.update.calledOnce).to.be.true;
    });

    it('should not throw if refresh token not found', async () => {
      mockPrisma.institutionRefreshToken.findUnique.resolves(null);

      // Should not throw
      await authService.logout('nonexistent-token');
    });
  });
});
