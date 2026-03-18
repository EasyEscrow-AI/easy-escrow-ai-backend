import { expect } from 'chai';
import sinon from 'sinon';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// Set env for tests before importing service modules
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';

import {
  createMockPrismaClient,
  createMockRedisClient,
} from '../../helpers/institution-test-utils';

function createTestAdmin(overrides?: Partial<any>) {
  return {
    id: 'test-admin-id',
    email: 'admin@amina.bank',
    passwordHash: '$2b$12$LJ3m4ys4Fp.EzE9Jv9OKF.YpEhkgHY5jVXiiDsm1r6N2RAKmKgKW6',
    name: 'AMINA Admin',
    role: 'SUPER_ADMIN',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    ...overrides,
  };
}

describe('AdminAuthService', () => {
  let sandbox: sinon.SinonSandbox;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  let mockRedis: ReturnType<typeof createMockRedisClient>;
  let authService: any;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();

    mockPrisma = createMockPrismaClient();
    mockRedis = createMockRedisClient();

    // Add admin-specific models to mock prisma
    (mockPrisma as any).adminUser = {
      findUnique: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub(),
      upsert: sinon.stub(),
    };
    (mockPrisma as any).adminRefreshToken = {
      findUnique: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub(),
    };

    const authModule = await import('../../../src/services/admin-auth.service');

    authService = new (authModule.AdminAuthService as any)();
    (authService as any).prisma = mockPrisma;

    const redisModule = await import('../../../src/config/redis');
    sandbox.stub(redisModule, 'redisClient').value(mockRedis);
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------
  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('AminaAdmin2024!', 4);
      const testAdmin = createTestAdmin({ passwordHash: hashedPassword });

      mockRedis.get.resolves(null);

      (mockPrisma as any).adminUser.findUnique.resolves(testAdmin);
      (mockPrisma as any).adminUser.update.resolves(testAdmin);
      (mockPrisma as any).adminRefreshToken.create.resolves({
        id: 'rt-1',
        tokenHash: 'hash',
        adminId: testAdmin.id,
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });

      const result = await authService.login('admin@amina.bank', 'AminaAdmin2024!');

      expect(result).to.have.property('admin');
      expect(result).to.have.property('tokens');
      expect(result.admin).to.not.have.property('passwordHash');
      expect(result.tokens).to.have.property('accessToken');
      expect(result.tokens).to.have.property('refreshToken');
      expect(result.tokens).to.have.property('expiresIn');

      // Verify lastLoginAt was updated
      expect((mockPrisma as any).adminUser.update.calledOnce).to.be.true;
    });

    it('should reject wrong password', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPassword!1', 4);
      const testAdmin = createTestAdmin({ passwordHash: hashedPassword });

      mockRedis.get.resolves(null);
      mockRedis.incr.resolves(1);
      mockRedis.expire.resolves(1);

      (mockPrisma as any).adminUser.findUnique.resolves(testAdmin);

      try {
        await authService.login('admin@amina.bank', 'WrongPassword!1');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Invalid email or password');
      }
    });

    it('should reject non-existent email', async () => {
      mockRedis.get.resolves(null);
      mockRedis.incr.resolves(1);
      mockRedis.expire.resolves(1);

      (mockPrisma as any).adminUser.findUnique.resolves(null);

      try {
        await authService.login('nobody@example.com', 'SomePass!1');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Invalid email or password');
      }
    });

    it('should reject inactive admin', async () => {
      const hashedPassword = await bcrypt.hash('AminaAdmin2024!', 4);
      const testAdmin = createTestAdmin({
        passwordHash: hashedPassword,
        isActive: false,
      });

      mockRedis.get.resolves(null);

      (mockPrisma as any).adminUser.findUnique.resolves(testAdmin);

      try {
        await authService.login('admin@amina.bank', 'AminaAdmin2024!');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Account is deactivated');
      }
    });

    it('should enforce rate limiting after too many attempts', async () => {
      mockRedis.get.resolves('5');

      try {
        await authService.login('admin@amina.bank', 'AnyPass!1');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.include('Too many login attempts');
      }

      expect((mockPrisma as any).adminUser.findUnique.called).to.be.false;
    });

    it('should increment login attempts on failed login', async () => {
      mockRedis.get.resolves(null);
      mockRedis.incr.resolves(1);
      mockRedis.expire.resolves(1);

      (mockPrisma as any).adminUser.findUnique.resolves(null);

      try {
        await authService.login('fail@example.com', 'BadPass!1');
      } catch {
        // expected
      }

      expect(mockRedis.incr.calledOnce).to.be.true;
      const incrKey = mockRedis.incr.firstCall.args[0] as string;
      expect(incrKey).to.include('admin:login:attempts:');
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

      const testAdmin = createTestAdmin();
      const storedToken = {
        id: 'rt-1',
        tokenHash,
        adminId: testAdmin.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        revokedAt: null,
        createdAt: new Date(),
        admin: testAdmin,
      };

      (mockPrisma as any).adminRefreshToken.findUnique.resolves(storedToken);
      (mockPrisma as any).adminRefreshToken.update.resolves({
        ...storedToken,
        revokedAt: new Date(),
      });
      (mockPrisma as any).adminRefreshToken.create.resolves({
        id: 'rt-2',
        tokenHash: 'new-hash',
        adminId: testAdmin.id,
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      });

      const result = await authService.refreshToken(rawRefreshToken);

      expect(result).to.have.property('accessToken');
      expect(result).to.have.property('refreshToken');
      expect(result).to.have.property('expiresIn');

      expect((mockPrisma as any).adminRefreshToken.update.calledOnce).to.be.true;
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
        adminId: 'test-admin-id',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        createdAt: new Date(),
        admin: createTestAdmin(),
      };

      (mockPrisma as any).adminRefreshToken.findUnique.resolves(storedToken);

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
        adminId: 'test-admin-id',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        revokedAt: new Date(),
        createdAt: new Date(),
        admin: createTestAdmin(),
      };

      (mockPrisma as any).adminRefreshToken.findUnique.resolves(storedToken);

      try {
        await authService.refreshToken(rawRefreshToken);
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Refresh token has been revoked');
      }
    });

    it('should reject an invalid refresh token', async () => {
      (mockPrisma as any).adminRefreshToken.findUnique.resolves(null);

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
      const testAdmin = createTestAdmin({ passwordHash: hashedOld });

      (mockPrisma as any).adminUser.findUnique.resolves(testAdmin);
      (mockPrisma as any).adminUser.update.resolves(testAdmin);

      await authService.changePassword(testAdmin.id, oldPassword, 'NewSecure!2');

      expect((mockPrisma as any).adminUser.update.calledOnce).to.be.true;
      const updateArg = (mockPrisma as any).adminUser.update.firstCall.args[0];
      expect(updateArg.data).to.have.property('passwordHash');
      expect(updateArg.data.passwordHash).to.not.equal(hashedOld);
    });

    it('should reject change with wrong old password', async () => {
      const hashedOld = await bcrypt.hash('CorrectOld!1', 4);
      const testAdmin = createTestAdmin({ passwordHash: hashedOld });

      (mockPrisma as any).adminUser.findUnique.resolves(testAdmin);

      try {
        await authService.changePassword(testAdmin.id, 'WrongOld!1', 'NewSecure!2');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Current password is incorrect');
      }

      expect((mockPrisma as any).adminUser.update.called).to.be.false;
    });

    it('should throw if admin not found', async () => {
      (mockPrisma as any).adminUser.findUnique.resolves(null);

      try {
        await authService.changePassword('nonexistent-id', 'OldPass!1', 'NewPass!2');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Admin not found');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------
  describe('getProfile', () => {
    it('should return sanitized admin without passwordHash', async () => {
      const testAdmin = createTestAdmin();

      (mockPrisma as any).adminUser.findUnique.resolves(testAdmin);

      const profile = await authService.getProfile('test-admin-id');

      expect(profile).to.not.have.property('passwordHash');
      expect(profile).to.have.property('email', 'admin@amina.bank');
      expect(profile).to.have.property('name', 'AMINA Admin');
      expect(profile).to.have.property('role', 'SUPER_ADMIN');
    });

    it('should throw if admin not found', async () => {
      (mockPrisma as any).adminUser.findUnique.resolves(null);

      try {
        await authService.getProfile('nonexistent-id');
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.equal('Admin not found');
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
        adminId: 'test-admin-id',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        revokedAt: null,
        createdAt: new Date(),
      };

      (mockPrisma as any).adminRefreshToken.findUnique.resolves(storedToken);
      (mockPrisma as any).adminRefreshToken.update.resolves({
        ...storedToken,
        revokedAt: new Date(),
      });

      await authService.logout(rawRefreshToken);

      expect((mockPrisma as any).adminRefreshToken.update.calledOnce).to.be.true;
    });

    it('should not throw if refresh token not found', async () => {
      (mockPrisma as any).adminRefreshToken.findUnique.resolves(null);

      await authService.logout('nonexistent-token');
    });
  });
});
