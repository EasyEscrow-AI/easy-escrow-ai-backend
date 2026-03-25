import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import ms from 'ms';
import { PrismaClient } from '../generated/prisma';
import { config } from '../config';
import { getInstitutionEscrowConfig } from '../config/institution-escrow.config';
import { redisClient } from '../config/redis';

const BCRYPT_ROUNDS = 12;
const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_TTL = 900; // 15 minutes in seconds
const REDIS_LOGIN_PREFIX = 'institution:login:attempts:';
const REFRESH_TOKEN_GRACE_PERIOD_MS = 30_000; // 30 seconds grace period for rotated tokens

/**
 * Institution Authentication Service
 *
 * Handles email+password authentication with JWT access tokens and
 * rotating refresh tokens for institution clients.
 */
export class InstitutionAuthService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Register a new institution client
   */
  async register(email: string, password: string, companyName: string) {
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already taken
    const existing = await this.prisma.institutionClient.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create client and default settings in a transaction
    const client = await this.prisma.institutionClient.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        companyName,
        settings: {
          create: {},
        },
      },
      include: {
        settings: true,
      },
    });

    // Generate auth tokens
    const tokens = await this.generateTokens(client.id, client.email, client.tier);

    return {
      client: this.sanitizeClient(client),
      tokens,
    };
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string, ipAddress?: string) {
    const normalizedEmail = email.toLowerCase().trim();

    // Check rate limit
    await this.checkLoginRateLimit(normalizedEmail);

    // Find client by email
    const client = await this.prisma.institutionClient.findUnique({
      where: { email: normalizedEmail },
    });

    if (!client) {
      await this.incrementLoginAttempts(normalizedEmail);
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, client.passwordHash);

    if (!isValid) {
      await this.incrementLoginAttempts(normalizedEmail);
      throw new Error('Invalid email or password');
    }

    // Update last login timestamp
    await this.prisma.institutionClient.update({
      where: { id: client.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const tokens = await this.generateTokens(client.id, client.email, client.tier);

    return {
      client: this.sanitizeClient(client),
      tokens,
    };
  }

  /**
   * Generate JWT access token and refresh token pair
   */
  async generateTokens(clientId: string, email: string, tier: string) {
    const jwtSecret = this.getJwtSecret();
    const escrowConfig = getInstitutionEscrowConfig();
    const accessTokenExpiry = escrowConfig.jwt.accessTokenExpiry || '1h';
    const refreshTokenExpiry = escrowConfig.jwt.refreshTokenExpiry || '7d';

    // Convert expiry strings to seconds for jwt.sign
    const accessExpiryMs = ms(accessTokenExpiry as ms.StringValue);
    const accessExpirySec = Math.floor(accessExpiryMs / 1000);

    // Create JWT access token
    const accessToken = jwt.sign({ clientId, email, tier }, jwtSecret, {
      expiresIn: accessExpirySec,
    });

    // Create refresh token (random 64-byte hex string)
    const refreshToken = crypto.randomBytes(64).toString('hex');

    // Hash refresh token for storage
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Calculate refresh token expiry date
    const refreshExpiryMs = ms(refreshTokenExpiry as ms.StringValue);
    const expiresAt = new Date(Date.now() + refreshExpiryMs);

    // Store hashed refresh token in database
    await this.prisma.institutionRefreshToken.create({
      data: {
        tokenHash,
        clientId,
        expiresAt,
      },
    });

    const refreshExpirySec = Math.floor(refreshExpiryMs / 1000);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpirySec,
      refreshExpiresIn: refreshExpirySec,
    };
  }

  /**
   * Refresh an access token using a valid refresh token
   */
  async refreshToken(refreshToken: string) {
    // Hash the provided refresh token
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Find the matching token record
    const storedToken = await this.prisma.institutionRefreshToken.findUnique({
      where: { tokenHash },
      include: { client: true },
    });

    if (!storedToken) {
      throw new Error('Invalid refresh token');
    }

    // Allow a 30-second grace period after revocation to handle race conditions
    // (e.g., multiple tabs or retry logic using the old token after rotation)
    if (storedToken.revokedAt) {
      const gracePeriodExpired =
        storedToken.revokedAt.getTime() < Date.now() - REFRESH_TOKEN_GRACE_PERIOD_MS;
      if (gracePeriodExpired) {
        throw new Error('Refresh token has been revoked');
      }
    }

    if (storedToken.expiresAt < new Date()) {
      throw new Error('Refresh token has expired');
    }

    // Revoke old refresh token (skip if already revoked during grace period
    // to preserve the original revokedAt timestamp and keep the window fixed)
    if (!storedToken.revokedAt) {
      await this.prisma.institutionRefreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
    }

    // Generate new token pair
    const tokens = await this.generateTokens(
      storedToken.client.id,
      storedToken.client.email,
      storedToken.client.tier
    );

    return tokens;
  }

  /**
   * Logout by revoking a refresh token
   */
  async logout(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Find and revoke the token
    const storedToken = await this.prisma.institutionRefreshToken.findUnique({
      where: { tokenHash },
    });

    if (storedToken && !storedToken.revokedAt) {
      await this.prisma.institutionRefreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  /**
   * Get client profile by ID (without password hash)
   * Returns expanded profile with settings and wallets
   */
  async getProfile(clientId: string) {
    const client = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
      include: {
        settings: true,
        wallets: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!client) {
      throw new Error('Client not found');
    }

    return this.sanitizeClient(client);
  }

  /**
   * Change client password
   */
  async changePassword(clientId: string, oldPassword: string, newPassword: string) {
    const client = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new Error('Client not found');
    }

    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, client.passwordHash);

    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash and update new password
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.institutionClient.update({
      where: { id: clientId },
      data: { passwordHash },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Remove passwordHash from a client object before returning to callers
   */
  private sanitizeClient(client: any) {
    const { passwordHash, ...sanitized } = client;
    return sanitized;
  }

  /**
   * Get JWT secret from config or environment, throwing if not set
   */
  private getJwtSecret(): string {
    const secret = config.security.jwtSecret || process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    return secret;
  }

  /**
   * Check login rate limit for an email address.
   * Throws if the limit (5 attempts per 15 min) has been exceeded.
   */
  private async checkLoginRateLimit(email: string): Promise<void> {
    try {
      const key = `${REDIS_LOGIN_PREFIX}${email}`;
      const attempts = await redisClient.get(key);

      if (attempts && parseInt(attempts, 10) >= LOGIN_RATE_LIMIT_MAX) {
        throw new Error('Too many login attempts. Please try again later.');
      }
    } catch (error: any) {
      // Re-throw rate limit errors
      if (error.message?.includes('Too many login attempts')) {
        throw error;
      }
      // Swallow Redis connection errors so auth still works without Redis
      console.error('Rate limit check failed (Redis):', error.message);
    }
  }

  /**
   * Increment login attempt counter in Redis with TTL
   */
  private async incrementLoginAttempts(email: string): Promise<void> {
    try {
      const key = `${REDIS_LOGIN_PREFIX}${email}`;
      const count = await redisClient.incr(key);

      // Set TTL on the first attempt
      if (count === 1) {
        await redisClient.expire(key, LOGIN_RATE_LIMIT_TTL);
      }
    } catch (error: any) {
      // Swallow Redis errors so auth still works without Redis
      console.error('Rate limit increment failed (Redis):', error.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let instance: InstitutionAuthService | null = null;

export function getInstitutionAuthService(): InstitutionAuthService {
  if (!instance) {
    instance = new InstitutionAuthService();
  }
  return instance;
}
