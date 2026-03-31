import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import ms from 'ms';
import { PrismaClient } from '../generated/prisma';
import { prisma as sharedPrisma } from '../config/database';
import { config } from '../config';
import { redisClient } from '../config/redis';

const BCRYPT_ROUNDS = 12;
const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_TTL = 900; // 15 minutes in seconds
const REDIS_LOGIN_PREFIX = 'admin:login:attempts:';
const ACCESS_TOKEN_EXPIRY = process.env.ADMIN_ACCESS_TOKEN_EXPIRY || '1h';
const REFRESH_TOKEN_EXPIRY = process.env.ADMIN_REFRESH_TOKEN_EXPIRY || '7d';

function parseDurationOrThrow(value: string, envName: string): number {
  const result = ms(value as ms.StringValue);
  if (typeof result !== 'number' || !Number.isFinite(result) || result <= 0) {
    throw new Error(`Invalid duration for ${envName}: "${value}". Must be a valid ms() string (e.g. "1h", "7d").`);
  }
  return result;
}

// Validate at module load so invalid values fail fast
parseDurationOrThrow(ACCESS_TOKEN_EXPIRY, 'ADMIN_ACCESS_TOKEN_EXPIRY');
parseDurationOrThrow(REFRESH_TOKEN_EXPIRY, 'ADMIN_REFRESH_TOKEN_EXPIRY');

export class AdminAuthService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = sharedPrisma;
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();

    await this.checkLoginRateLimit(normalizedEmail);

    const admin = await this.prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!admin) {
      await this.incrementLoginAttempts(normalizedEmail);
      throw new Error('Invalid email or password');
    }

    if (!admin.isActive) {
      throw new Error('Account is deactivated');
    }

    const isValid = await bcrypt.compare(password, admin.passwordHash);

    if (!isValid) {
      await this.incrementLoginAttempts(normalizedEmail);
      throw new Error('Invalid email or password');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(admin.id, admin.email, admin.role);

    return {
      admin: this.sanitizeAdmin(admin),
      tokens,
    };
  }

  async generateTokens(adminId: string, email: string, role: string) {
    const jwtSecret = this.getJwtSecret();

    const accessExpiryMs = ms(ACCESS_TOKEN_EXPIRY as ms.StringValue);
    const accessExpirySec = Math.floor(accessExpiryMs / 1000);

    const accessToken = jwt.sign({ adminId, email, role }, jwtSecret, {
      expiresIn: accessExpirySec,
    });

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const refreshExpiryMs = ms(REFRESH_TOKEN_EXPIRY as ms.StringValue);
    const expiresAt = new Date(Date.now() + refreshExpiryMs);

    await this.prisma.adminRefreshToken.create({
      data: {
        tokenHash,
        adminId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpirySec,
    };
  }

  async refreshToken(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const storedToken = await this.prisma.adminRefreshToken.findUnique({
      where: { tokenHash },
      include: { admin: true },
    });

    if (!storedToken) {
      throw new Error('Invalid refresh token');
    }

    if (storedToken.revokedAt) {
      throw new Error('Refresh token has been revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new Error('Refresh token has expired');
    }

    await this.prisma.adminRefreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(
      storedToken.admin.id,
      storedToken.admin.email,
      storedToken.admin.role
    );

    return tokens;
  }

  async logout(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const storedToken = await this.prisma.adminRefreshToken.findUnique({
      where: { tokenHash },
    });

    if (storedToken && !storedToken.revokedAt) {
      await this.prisma.adminRefreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  async getProfile(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new Error('Admin not found');
    }

    return this.sanitizeAdmin(admin);
  }

  async changePassword(adminId: string, oldPassword: string, newPassword: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new Error('Admin not found');
    }

    const isValid = await bcrypt.compare(oldPassword, admin.passwordHash);

    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { passwordHash },
    });
  }

  private sanitizeAdmin(admin: any) {
    const { passwordHash, ...sanitized } = admin;
    return sanitized;
  }

  private getJwtSecret(): string {
    const secret = config.security.jwtSecret || process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    return secret;
  }

  private async checkLoginRateLimit(email: string): Promise<void> {
    try {
      const key = `${REDIS_LOGIN_PREFIX}${email}`;
      const attempts = await redisClient.get(key);

      if (attempts && parseInt(attempts, 10) >= LOGIN_RATE_LIMIT_MAX) {
        throw new Error('Too many login attempts. Please try again later.');
      }
    } catch (error: any) {
      if (error.message?.includes('Too many login attempts')) {
        throw error;
      }
      console.error('Rate limit check failed (Redis):', error.message);
    }
  }

  private async incrementLoginAttempts(email: string): Promise<void> {
    try {
      const key = `${REDIS_LOGIN_PREFIX}${email}`;
      const count = await redisClient.incr(key);

      if (count === 1) {
        await redisClient.expire(key, LOGIN_RATE_LIMIT_TTL);
      }
    } catch (error: any) {
      console.error('Rate limit increment failed (Redis):', error.message);
    }
  }
}

let instance: AdminAuthService | null = null;

export function getAdminAuthService(): AdminAuthService {
  if (!instance) {
    instance = new AdminAuthService();
  }
  return instance;
}
