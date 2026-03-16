import sinon from 'sinon';
import jwt from 'jsonwebtoken';

// Mock Prisma client for institution unit tests
export function createMockPrismaClient() {
  return {
    institutionClient: {
      findUnique: sinon.stub(),
      findFirst: sinon.stub(),
      findMany: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub(),
      count: sinon.stub(),
    },
    institutionRefreshToken: {
      findUnique: sinon.stub(),
      findFirst: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub(),
      updateMany: sinon.stub(),
    },
    institutionClientSettings: {
      findUnique: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub(),
      upsert: sinon.stub(),
    },
    institutionApiKey: {
      findUnique: sinon.stub(),
      findFirst: sinon.stub(),
      findMany: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub(),
    },
    institutionEscrow: {
      findUnique: sinon.stub(),
      findFirst: sinon.stub(),
      findMany: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub(),
      count: sinon.stub(),
      aggregate: sinon.stub(),
    },
    institutionDeposit: {
      create: sinon.stub(),
    },
    institutionAuditLog: {
      create: sinon.stub(),
    },
    institutionAiAnalysis: {
      findFirst: sinon.stub(),
      findMany: sinon.stub(),
      create: sinon.stub(),
    },
    institutionCorridor: {
      findUnique: sinon.stub(),
      findMany: sinon.stub(),
      upsert: sinon.stub(),
    },
    institutionFile: {
      findFirst: sinon.stub(),
      findMany: sinon.stub(),
      create: sinon.stub(),
      delete: sinon.stub(),
    },
  };
}

// Generate a test JWT token
export function generateTestToken(
  payload?: Partial<{ clientId: string; email: string; tier: string }>
): string {
  const defaultPayload = {
    clientId: 'test-client-id',
    email: 'test@example.com',
    tier: 'STANDARD',
    ...payload,
  };
  return jwt.sign(
    defaultPayload,
    process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only-32chars!',
    { expiresIn: '15m' } as jwt.SignOptions,
  );
}

// Generate an expired JWT token for testing
export function generateExpiredToken(
  payload?: Partial<{ clientId: string; email: string; tier: string }>
): string {
  const defaultPayload = {
    clientId: 'test-client-id',
    email: 'test@example.com',
    tier: 'STANDARD',
    ...payload,
  };
  return jwt.sign(
    defaultPayload,
    process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only-32chars!',
    { expiresIn: '0s' } as jwt.SignOptions,
  );
}

// Test client factory
export function createTestClient(overrides?: Partial<any>) {
  return {
    id: 'test-client-id',
    email: 'test@example.com',
    passwordHash: '$2b$12$LJ3m4ys4Fp.EzE9Jv9OKF.YpEhkgHY5jVXiiDsm1r6N2RAKmKgKW6',
    companyName: 'Test Corp',
    tier: 'STANDARD',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'US',
    primaryWallet: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u',
    settledWallets: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    ...overrides,
  };
}

// Test escrow factory
export function createTestEscrow(overrides?: Partial<any>) {
  return {
    id: 'test-escrow-uuid',
    escrowId: 'test-escrow-id',
    clientId: 'test-client-id',
    payerWallet: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u',
    recipientWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: 10000,
    platformFee: 50,
    corridor: 'US-MX',
    conditionType: 'ADMIN_RELEASE',
    status: 'CREATED',
    settlementAuthority: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u',
    riskScore: 25,
    escrowPda: null,
    vaultPda: null,
    depositTxSignature: null,
    releaseTxSignature: null,
    cancelTxSignature: null,
    expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    fundedAt: null,
    ...overrides,
  };
}

// Create a mock Redis client for institution tests
export function createMockRedisClient() {
  return {
    get: sinon.stub(),
    set: sinon.stub(),
    setex: sinon.stub(),
    del: sinon.stub(),
    exists: sinon.stub(),
    keys: sinon.stub(),
    ttl: sinon.stub(),
    incrby: sinon.stub(),
    incr: sinon.stub(),
    expire: sinon.stub(),
    mget: sinon.stub(),
    pipeline: sinon.stub().returns({
      del: sinon.stub().returnsThis(),
      exec: sinon.stub().resolves([]),
    }),
    ping: sinon.stub().resolves('PONG'),
    quit: sinon.stub().resolves(),
  };
}
