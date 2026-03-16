/**
 * Unit Tests for AllowlistService
 *
 * Tests wallet allowlist management:
 * - isAllowlisted: Redis SET check, Prisma fallback
 * - addToAllowlist: Redis + Prisma updates
 * - removeFromAllowlist: Redis removal
 * - listAllowlist: Redis smembers
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { AllowlistService } from '../../../src/services/allowlist.service';

describe('AllowlistService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: AllowlistService;
  let prismaStub: any;
  let redisStub: any;

  const VALID_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const VALID_WALLET_2 = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  const CLIENT_ID = 'client-123';

  const makeClient = (overrides: Record<string, unknown> = {}) => ({
    id: CLIENT_ID,
    companyName: 'Test Corp',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    tier: 'ENTERPRISE',
    primaryWallet: VALID_WALLET,
    settledWallets: [],
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub Redis methods accessed via the proxy
    redisStub = {
      sismember: sandbox.stub(),
      sadd: sandbox.stub().resolves(1),
      srem: sandbox.stub().resolves(1),
      smembers: sandbox.stub().resolves([VALID_WALLET]),
      del: sandbox.stub().resolves(1),
      hset: sandbox.stub().resolves('OK'),
      hgetall: sandbox.stub().resolves({}),
      expire: sandbox.stub().resolves(1),
    };

    // Stub Prisma
    prismaStub = {
      institutionClient: {
        findFirst: sandbox.stub().resolves(null),
        findUnique: sandbox.stub().resolves(makeClient()),
        findMany: sandbox.stub().resolves([]),
        update: sandbox.stub().resolves({}),
      },
    };

    // Create service and inject stubs
    service = new AllowlistService();
    (service as any).prisma = prismaStub;

    // Stub the redis calls within the service by replacing the imported redisClient
    // We access the module-level redisClient through the service's method calls
    // Instead, we stub the private method that sets metadata too
    sandbox.stub(service as any, 'setWalletMetadata').resolves();

    // We need to intercept the redisClient calls.
    // Since redisClient is a proxy, we stub at the module level.
    const redisModule = require('../../../src/config/redis');
    sandbox.stub(redisModule, 'redisClient').value(redisStub);
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── isAllowlisted ─────────────────────────────────────────

  describe('isAllowlisted', () => {
    it('should return true for allowlisted wallet (Redis hit)', async () => {
      redisStub.sismember.resolves(1);

      const result = await service.isAllowlisted(VALID_WALLET);

      expect(result).to.be.true;
      expect(redisStub.sismember.calledOnce).to.be.true;
      // Should not fall through to Prisma
      expect(prismaStub.institutionClient.findFirst.called).to.be.false;
    });

    it('should fall back to Prisma on Redis miss and return true for verified client', async () => {
      redisStub.sismember.resolves(0);
      prismaStub.institutionClient.findFirst.resolves(makeClient());

      const result = await service.isAllowlisted(VALID_WALLET);

      expect(result).to.be.true;
      expect(prismaStub.institutionClient.findFirst.calledOnce).to.be.true;
      // Should populate Redis cache on miss
      expect(redisStub.sadd.calledOnce).to.be.true;
    });

    it('should return false for non-allowlisted wallet', async () => {
      redisStub.sismember.resolves(0);
      prismaStub.institutionClient.findFirst.resolves(null);

      const result = await service.isAllowlisted(VALID_WALLET_2);

      expect(result).to.be.false;
    });

    it('should return false for invalid Solana address', async () => {
      const result = await service.isAllowlisted('not-a-valid-address!!!');

      expect(result).to.be.false;
      expect(redisStub.sismember.called).to.be.false;
    });

    it('should fall back to Prisma when Redis throws', async () => {
      redisStub.sismember.rejects(new Error('Redis connection refused'));
      prismaStub.institutionClient.findFirst.resolves(makeClient());

      const result = await service.isAllowlisted(VALID_WALLET);

      expect(result).to.be.true;
      expect(prismaStub.institutionClient.findFirst.calledOnce).to.be.true;
    });
  });

  // ─── addToAllowlist ─────────────────────────────────────────

  describe('addToAllowlist', () => {
    it('should add to Redis SET and metadata', async () => {
      await service.addToAllowlist(VALID_WALLET_2, CLIENT_ID);

      expect(redisStub.sadd.calledOnce).to.be.true;
      expect(redisStub.sadd.firstCall.args[0]).to.equal('institution:allowlist');
      expect(redisStub.sadd.firstCall.args[1]).to.equal(VALID_WALLET_2);
    });

    it('should throw for invalid Solana address', async () => {
      try {
        await service.addToAllowlist('invalid!!', CLIENT_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Invalid Solana address');
      }
    });

    it('should throw when client not found', async () => {
      prismaStub.institutionClient.findUnique.resolves(null);

      try {
        await service.addToAllowlist(VALID_WALLET_2, 'nonexistent');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Client not found');
      }
    });

    it('should add wallet to settledWallets if not already present', async () => {
      prismaStub.institutionClient.findUnique.resolves(
        makeClient({ primaryWallet: VALID_WALLET, settledWallets: [] }),
      );

      await service.addToAllowlist(VALID_WALLET_2, CLIENT_ID);

      expect(prismaStub.institutionClient.update.calledOnce).to.be.true;
      const updateCall = prismaStub.institutionClient.update.firstCall;
      expect(updateCall.args[0].data.settledWallets).to.deep.equal({ push: VALID_WALLET_2 });
    });

    it('should not duplicate wallet in settledWallets', async () => {
      prismaStub.institutionClient.findUnique.resolves(
        makeClient({ primaryWallet: VALID_WALLET, settledWallets: [VALID_WALLET_2] }),
      );

      await service.addToAllowlist(VALID_WALLET_2, CLIENT_ID);

      // Should NOT update since the wallet is already in settledWallets
      expect(prismaStub.institutionClient.update.called).to.be.false;
    });
  });

  // ─── removeFromAllowlist ────────────────────────────────────

  describe('removeFromAllowlist', () => {
    it('should remove from Redis SET and metadata', async () => {
      await service.removeFromAllowlist(VALID_WALLET);

      expect(redisStub.srem.calledOnce).to.be.true;
      expect(redisStub.srem.firstCall.args[1]).to.equal(VALID_WALLET);
      expect(redisStub.del.calledOnce).to.be.true;
    });
  });

  // ─── listAllowlist ─────────────────────────────────────────

  describe('listAllowlist', () => {
    it('should return all wallets from Redis', async () => {
      redisStub.smembers.resolves([VALID_WALLET, VALID_WALLET_2]);

      const result = await service.listAllowlist();

      expect(result).to.deep.equal([VALID_WALLET, VALID_WALLET_2]);
      expect(redisStub.smembers.calledOnce).to.be.true;
    });

    it('should fall back to Prisma when Redis fails', async () => {
      redisStub.smembers.rejects(new Error('Redis error'));
      prismaStub.institutionClient.findMany.resolves([
        { primaryWallet: VALID_WALLET, settledWallets: [VALID_WALLET_2] },
      ]);

      const result = await service.listAllowlist();

      expect(result).to.include(VALID_WALLET);
      expect(result).to.include(VALID_WALLET_2);
      expect(prismaStub.institutionClient.findMany.calledOnce).to.be.true;
    });
  });
});
