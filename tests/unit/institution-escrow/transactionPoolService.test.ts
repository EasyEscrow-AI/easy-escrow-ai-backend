/**
 * Unit Tests for TransactionPoolService
 *
 * Tests the pool orchestrator lifecycle:
 * - createPool: validation, on-chain init, storage
 * - addMember: status check, escrow validation, corridor match
 * - removeMember: status check, member lookup
 * - lockPool: compliance check, empty pool guard
 * - settlePool: sequential mode, parallel mode, partial failure
 * - retryFailedMembers: retry logic, status recalculation
 * - cancelPool: refund, vault close
 * - getPool: client isolation, cache
 * - listPools: pagination, filters
 * - decryptReceipt: authorization, status check
 * - Receipt encryption roundtrip
 */

import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';

const savedEnv = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  USDC_MINT_ADDRESS: process.env.USDC_MINT_ADDRESS,
  INSTITUTION_ESCROW_ENABLED: process.env.INSTITUTION_ESCROW_ENABLED,
  TRANSACTION_POOLS_ENABLED: process.env.TRANSACTION_POOLS_ENABLED,
  PLATFORM_FEE_COLLECTOR_ADDRESS: process.env.PLATFORM_FEE_COLLECTOR_ADDRESS,
};

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.INSTITUTION_ESCROW_ENABLED = 'true';
process.env.TRANSACTION_POOLS_ENABLED = 'true';
process.env.PLATFORM_FEE_COLLECTOR_ADDRESS = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

// Shim 'resend' module (pulled in by notification service chain)
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request === 'resend') return 'resend';
  return originalResolveFilename.call(this, request, ...args);
};
const cacheKey = 'resend';
require.cache[cacheKey] = {
  id: cacheKey,
  filename: cacheKey,
  loaded: true,
  children: [],
  path: '',
  paths: [],
  exports: {
    Resend: class MockResend {
      constructor() {}
      emails = { send: async () => ({}) };
    },
  },
} as any;

import { TransactionPoolService } from '../../../src/services/transaction-pool.service';
import {
  TransactionPoolStatus,
  PoolMemberStatus,
  PoolSettlementMode,
} from '../../../src/types/transaction-pool';
import {
  encryptReceiptPayload,
  decryptReceiptPayload,
  computeCommitmentHash,
} from '../../../src/services/pool-vault-program.service';
import crypto from 'crypto';

describe('TransactionPoolService', function () {
  this.timeout(15000);

  let sandbox: sinon.SinonSandbox;
  let service: TransactionPoolService;
  let prismaStub: any;
  let programServiceStub: any;
  let escrowServiceStub: any;
  let notificationServiceStub: any;

  const CLIENT_ID = 'client-pool-123';
  const POOL_ID = 'pool-uuid-456';
  const POOL_CODE = 'TP-A3K-9MN';
  const ESCROW_ID = 'escrow-uuid-789';
  const ESCROW_CODE = 'EE-7KMN-AB3D';
  const MEMBER_ID = 'member-uuid-001';
  const PAYER_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const RECIPIENT_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

  const makeClient = (overrides: Record<string, unknown> = {}) => ({
    id: CLIENT_ID,
    companyName: 'Test Corp',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    primaryWallet: PAYER_WALLET,
    settledWallets: [],
    ...overrides,
  });

  const makePool = (overrides: Record<string, unknown> = {}) => ({
    id: POOL_ID,
    poolCode: POOL_CODE,
    clientId: CLIENT_ID,
    status: 'OPEN',
    settlementMode: 'SEQUENTIAL',
    corridor: 'SG-CH',
    totalAmount: 0,
    totalFees: 0,
    memberCount: 0,
    settledCount: 0,
    failedCount: 0,
    poolVaultPda: 'mock-vault-pda',
    poolVaultTokenAccount: 'mock-vault-token',
    poolRiskScore: null,
    compliancePassed: null,
    settledBy: null,
    settledAt: null,
    lockedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ...overrides,
  });

  const makeEscrow = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    escrowId: ESCROW_ID,
    escrowCode: ESCROW_CODE,
    clientId: CLIENT_ID,
    payerWallet: PAYER_WALLET,
    recipientWallet: RECIPIENT_WALLET,
    amount: 1000,
    platformFee: 0.5,
    corridor: 'SG-CH',
    conditionType: 'ADMIN_RELEASE',
    status: 'FUNDED',
    riskScore: 10,
    releaseTxSignature: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const makeMember = (overrides: Record<string, unknown> = {}) => ({
    id: MEMBER_ID,
    poolId: POOL_ID,
    escrowId: ESCROW_ID,
    status: 'PENDING',
    amount: 1000,
    platformFee: 0.5,
    corridor: 'SG-CH',
    releaseTxSignature: null,
    releasedAt: null,
    errorMessage: null,
    retryCount: 0,
    receiptPda: null,
    commitmentHash: null,
    sequenceNumber: 1,
    addedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub Prisma
    prismaStub = {
      institutionClient: {
        findUnique: sandbox.stub().resolves(makeClient()),
      },
      transactionPool: {
        create: sandbox.stub().callsFake(async (params: any) => ({
          ...makePool(),
          ...params.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        findUnique: sandbox.stub().resolves(makePool()),
        findMany: sandbox.stub().resolves([makePool()]),
        count: sandbox.stub().resolves(1),
        update: sandbox.stub().callsFake(async (params: any) => ({
          ...makePool(),
          ...params.data,
          updatedAt: new Date(),
        })),
      },
      transactionPoolMember: {
        create: sandbox.stub().callsFake(async (params: any) => ({
          id: MEMBER_ID,
          ...params.data,
          addedAt: new Date(),
          updatedAt: new Date(),
        })),
        findFirst: sandbox.stub().resolves(null),
        findUnique: sandbox.stub().resolves(makeMember()),
        findMany: sandbox.stub().resolves([]),
        update: sandbox.stub().callsFake(async (params: any) => ({
          ...makeMember(),
          ...params.data,
          updatedAt: new Date(),
        })),
        count: sandbox.stub().resolves(0),
      },
      transactionPoolAuditLog: {
        create: sandbox.stub().resolves({}),
        findMany: sandbox.stub().resolves([]),
        count: sandbox.stub().resolves(0),
      },
      institutionEscrow: {
        findUnique: sandbox.stub().resolves(makeEscrow()),
        findMany: sandbox.stub().resolves([makeEscrow()]),
      },
      $transaction: sandbox.stub().callsFake(async (ops: any[]) => {
        const results = [];
        for (const op of ops) {
          results.push(await op);
        }
        return results;
      }),
    };

    // Stub program service (on-chain operations)
    programServiceStub = {
      initPoolVaultOnChain: sandbox.stub().resolves({
        txSignature: 'mock-init-tx',
        poolStatePda: 'mock-pool-state-pda',
        vaultPda: 'mock-vault-pda',
      }),
      releasePoolMemberOnChain: sandbox.stub().resolves({
        txSignature: 'mock-release-tx',
        receiptPda: 'mock-receipt-pda',
      }),
      cancelPoolMemberOnChain: sandbox.stub().resolves('mock-cancel-tx'),
      closePoolVaultOnChain: sandbox.stub().resolves('mock-close-tx'),
      fetchPoolReceipt: sandbox.stub().resolves({
        exists: true,
        commitmentHash: 'abc123',
        encryptedPayload: Buffer.alloc(512),
      }),
      decryptReceipt: sandbox.stub().returns({
        poolId: POOL_ID,
        poolCode: POOL_CODE,
        escrowId: ESCROW_ID,
        escrowCode: ESCROW_CODE,
        amount: '1000.000000',
        corridor: 'SG-CH',
        payerWallet: PAYER_WALLET,
        recipientWallet: RECIPIENT_WALLET,
        releaseTxSignature: 'mock-tx',
        settledAt: new Date().toISOString(),
      }),
      encryptReceipt: sandbox.stub().returns(Buffer.alloc(512)),
      computeCommitment: sandbox.stub().returns(Buffer.alloc(32)),
      getUsdcMintAddress: sandbox.stub().returns({
        toBase58: () => process.env.USDC_MINT_ADDRESS,
      }),
      decimalToMicroUsdc: sandbox.stub().returns('1000000000'),
    };

    // Stub escrow service
    escrowServiceStub = {
      releaseFunds: sandbox.stub().resolves({ status: 'RELEASED' }),
    };

    // Stub notification service
    notificationServiceStub = {
      notify: sandbox.stub().resolves(),
    };

    // Stub external service getters
    const poolVaultMod = require('../../../src/services/pool-vault-program.service');
    sandbox.stub(poolVaultMod, 'getPoolVaultProgramService').returns(programServiceStub);

    const escrowMod = require('../../../src/services/institution-escrow.service');
    sandbox.stub(escrowMod, 'getInstitutionEscrowService').returns(escrowServiceStub);

    const notifMod = require('../../../src/services/institution-notification.service');
    sandbox.stub(notifMod, 'getInstitutionNotificationService').returns(notificationServiceStub);

    // Create service with stub prisma
    service = new TransactionPoolService(prismaStub as any);
    (service as any).prisma = prismaStub;

    // Stub cache methods to be no-ops
    sandbox.stub(service as any, 'cachePool').resolves();
    sandbox.stub(service as any, 'getCachedPool').resolves(null);
    sandbox.stub(service as any, 'invalidatePoolCache').resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  after(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  // ─── createPool ──────────────────────────────────────────────

  describe('createPool', () => {
    it('should create pool with valid params', async () => {
      const result = await service.createPool({
        clientId: CLIENT_ID,
        corridor: 'SG-CH',
        settlementMode: PoolSettlementMode.SEQUENTIAL,
        expiryHours: 24,
      });

      expect(result).to.have.property('poolCode');
      expect(result).to.have.property('status', 'OPEN');
      expect(result).to.have.property('corridor', 'SG-CH');
      expect(prismaStub.transactionPool.create.calledOnce).to.be.true;
      expect(prismaStub.transactionPoolAuditLog.create.calledOnce).to.be.true;
    });

    it('should throw when client not found', async () => {
      prismaStub.institutionClient.findUnique.resolves(null);

      try {
        await service.createPool({ clientId: CLIENT_ID });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('Client not found');
      }
    });

    it('should reject non-ACTIVE client', async () => {
      prismaStub.institutionClient.findUnique.resolves(makeClient({ status: 'SUSPENDED' }));

      try {
        await service.createPool({ clientId: CLIENT_ID });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('SUSPENDED');
        expect(err.message).to.include('Must be ACTIVE');
      }
    });

    it('should reject non-VERIFIED KYC', async () => {
      prismaStub.institutionClient.findUnique.resolves(makeClient({ kycStatus: 'PENDING' }));

      try {
        await service.createPool({ clientId: CLIENT_ID });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('PENDING');
        expect(err.message).to.include('Must be VERIFIED');
      }
    });

    it('should create with default settlement mode and expiry', async () => {
      const result = await service.createPool({ clientId: CLIENT_ID });

      const createCall = prismaStub.transactionPool.create.firstCall;
      expect(createCall.args[0].data.settlementMode).to.equal('SEQUENTIAL');
      expect(createCall.args[0].data.expiresAt).to.be.instanceOf(Date);
    });
  });

  // ─── addMember ──────────────────────────────────────────────

  describe('addMember', () => {
    it('should add funded escrow to OPEN pool', async () => {
      prismaStub.transactionPool.findUnique
        .onFirstCall()
        .resolves(makePool({ status: 'OPEN', memberCount: 0 }));
      prismaStub.transactionPool.findUnique.onSecondCall().resolves(
        makePool({
          status: 'OPEN',
          memberCount: 1,
          members: [makeMember()],
        })
      );

      const result = await service.addMember({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
        escrowId: ESCROW_ID,
      });

      expect(result).to.have.property('poolCode');
      expect(prismaStub.$transaction.calledOnce).to.be.true;
    });

    it('should reject non-FUNDED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow({ status: 'CREATED' }));

      try {
        await service.addMember({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
          escrowId: ESCROW_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('CREATED');
        expect(err.message).to.include('expected FUNDED');
      }
    });

    it('should reject escrow already in a pool', async () => {
      prismaStub.transactionPoolMember.findFirst.resolves({
        id: 'existing-member',
        poolId: 'other-pool',
        status: 'PENDING',
      });

      try {
        await service.addMember({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
          escrowId: ESCROW_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('already in pool');
      }
    });

    it('should reject corridor mismatch', async () => {
      prismaStub.transactionPool.findUnique.resolves(
        makePool({ status: 'OPEN', corridor: 'SG-CH' })
      );
      prismaStub.institutionEscrow.findUnique.resolves(
        makeEscrow({ corridor: 'US-MX', status: 'FUNDED' })
      );

      try {
        await service.addMember({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
          escrowId: ESCROW_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Corridor mismatch');
        expect(err.message).to.include('SG-CH');
        expect(err.message).to.include('US-MX');
      }
    });

    it('should reject adding to non-OPEN pool', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'LOCKED' }));

      try {
        await service.addMember({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
          escrowId: ESCROW_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot add member');
        expect(err.message).to.include('LOCKED');
        expect(err.message).to.include('expected OPEN');
      }
    });

    it('should reject when pool is at max capacity', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'OPEN', memberCount: 50 }));

      try {
        await service.addMember({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
          escrowId: ESCROW_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('maximum member count');
      }
    });
  });

  // ─── removeMember ────────────────────────────────────────────

  describe('removeMember', () => {
    it('should remove member from OPEN pool', async () => {
      prismaStub.transactionPool.findUnique
        .onFirstCall()
        .resolves(makePool({ status: 'OPEN', memberCount: 1 }));
      prismaStub.transactionPool.findUnique
        .onSecondCall()
        .resolves(makePool({ status: 'OPEN', memberCount: 0, members: [] }));
      prismaStub.transactionPoolMember.findUnique.resolves(makeMember({ status: 'PENDING' }));

      const result = await service.removeMember({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
        memberId: MEMBER_ID,
      });

      expect(result).to.have.property('poolCode');
      expect(prismaStub.$transaction.calledOnce).to.be.true;
    });

    it('should reject removal from non-OPEN pool', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'LOCKED' }));

      try {
        await service.removeMember({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
          memberId: MEMBER_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot remove member');
        expect(err.message).to.include('expected OPEN');
      }
    });

    it('should reject removal of already-removed member', async () => {
      prismaStub.transactionPoolMember.findUnique.resolves(makeMember({ status: 'REMOVED' }));

      try {
        await service.removeMember({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
          memberId: MEMBER_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('already removed');
      }
    });

    it('should reject removal of member not in pool', async () => {
      prismaStub.transactionPoolMember.findUnique.resolves(null);

      try {
        await service.removeMember({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
          memberId: 'non-existent-member',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not found in pool');
      }
    });
  });

  // ─── lockPool ────────────────────────────────────────────────

  describe('lockPool', () => {
    it('should lock pool with members and run compliance check', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'OPEN', memberCount: 2 }));
      prismaStub.transactionPoolMember.findMany.resolves([
        makeMember({ escrowId: 'esc-1' }),
        makeMember({ escrowId: 'esc-2' }),
      ]);
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow({ riskScore: 10 }));

      const result = await service.lockPool({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
      });

      expect(result).to.have.property('status', 'LOCKED');
      expect(prismaStub.transactionPool.update.called).to.be.true;
      // At least compliance_check + pool_locked audit entries
      expect(prismaStub.transactionPoolAuditLog.create.callCount).to.be.at.least(2);
    });

    it('should reject locking non-OPEN pool', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'SETTLED' }));

      try {
        await service.lockPool({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot lock');
        expect(err.message).to.include('expected OPEN');
      }
    });

    it('should reject locking empty pool', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'OPEN', memberCount: 0 }));

      try {
        await service.lockPool({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('pool has no members');
      }
    });
  });

  // ─── settlePool ──────────────────────────────────────────────

  describe('settlePool', () => {
    it('should settle LOCKED pool sequentially', async () => {
      prismaStub.transactionPool.findUnique.resolves(
        makePool({
          status: 'LOCKED',
          memberCount: 2,
          settlementMode: 'SEQUENTIAL',
          compliancePassed: true,
        })
      );
      prismaStub.transactionPoolMember.findMany.resolves([
        makeMember({ id: 'mem-1', escrowId: 'esc-1' }),
        makeMember({ id: 'mem-2', escrowId: 'esc-2' }),
      ]);
      prismaStub.institutionEscrow.findUnique.resolves(
        makeEscrow({ releaseTxSignature: 'tx-sig-123' })
      );

      const result = await service.settlePool({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
      });

      expect(result).to.have.property('status', TransactionPoolStatus.SETTLED);
      expect(result.settledCount).to.equal(2);
      expect(result.failedCount).to.equal(0);
      expect(result.members).to.have.length(2);
      expect(escrowServiceStub.releaseFunds.callCount).to.equal(2);
    });

    it('should settle LOCKED pool in parallel mode', async () => {
      prismaStub.transactionPool.findUnique.resolves(
        makePool({
          status: 'LOCKED',
          memberCount: 2,
          settlementMode: 'PARALLEL',
          compliancePassed: true,
        })
      );
      prismaStub.transactionPoolMember.findMany.resolves([
        makeMember({ id: 'mem-1', escrowId: 'esc-1' }),
        makeMember({ id: 'mem-2', escrowId: 'esc-2' }),
      ]);
      prismaStub.institutionEscrow.findUnique.resolves(
        makeEscrow({ releaseTxSignature: 'tx-sig-123' })
      );

      const result = await service.settlePool({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
      });

      expect(result).to.have.property('status', TransactionPoolStatus.SETTLED);
      expect(result.settledCount).to.equal(2);
    });

    it('should produce PARTIAL_FAIL when some members fail', async () => {
      prismaStub.transactionPool.findUnique.resolves(
        makePool({ status: 'LOCKED', memberCount: 2, compliancePassed: true })
      );
      prismaStub.transactionPoolMember.findMany.resolves([
        makeMember({ id: 'mem-1', escrowId: 'esc-1' }),
        makeMember({ id: 'mem-2', escrowId: 'esc-2' }),
      ]);

      // First escrow succeeds, second not found
      prismaStub.institutionEscrow.findUnique
        .onFirstCall()
        .resolves(makeEscrow({ escrowId: 'esc-1', releaseTxSignature: 'tx-1' }))
        .onSecondCall()
        .resolves(makeEscrow({ escrowId: 'esc-2', releaseTxSignature: 'tx-2' }));

      // Make second release fail
      escrowServiceStub.releaseFunds
        .onFirstCall()
        .resolves({ status: 'RELEASED' })
        .onSecondCall()
        .rejects(new Error('Insufficient vault balance'));

      const result = await service.settlePool({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
      });

      expect(result).to.have.property('status', TransactionPoolStatus.PARTIAL_FAIL);
      expect(result.settledCount).to.equal(1);
      expect(result.failedCount).to.equal(1);
    });

    it('should produce FAILED when all members fail', async () => {
      prismaStub.transactionPool.findUnique.resolves(
        makePool({ status: 'LOCKED', memberCount: 1, compliancePassed: true })
      );
      prismaStub.transactionPoolMember.findMany.resolves([
        makeMember({ id: 'mem-1', escrowId: 'esc-1' }),
      ]);
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow());
      escrowServiceStub.releaseFunds.rejects(new Error('Release failed'));

      const result = await service.settlePool({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
      });

      expect(result).to.have.property('status', TransactionPoolStatus.FAILED);
      expect(result.settledCount).to.equal(0);
      expect(result.failedCount).to.equal(1);
    });

    it('should reject settling non-LOCKED pool', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'OPEN' }));

      try {
        await service.settlePool({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot settle');
        expect(err.message).to.include('expected LOCKED');
      }
    });

    it('should reject settling when compliance did not pass', async () => {
      prismaStub.transactionPool.findUnique.resolves(
        makePool({ status: 'LOCKED', compliancePassed: false })
      );

      try {
        await service.settlePool({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('compliance check did not pass');
      }
    });
  });

  // ─── retryFailedMembers ──────────────────────────────────────

  describe('retryFailedMembers', () => {
    it('should retry failed members in PARTIAL_FAIL pool', async () => {
      prismaStub.transactionPool.findUnique.resolves(
        makePool({ status: 'PARTIAL_FAIL', settledCount: 1, failedCount: 1, memberCount: 2 })
      );
      prismaStub.transactionPoolMember.findMany.resolves([
        makeMember({ id: 'mem-2', escrowId: 'esc-2', status: 'FAILED' }),
      ]);
      prismaStub.transactionPoolMember.count.resolves(0); // no more failed after retry
      prismaStub.institutionEscrow.findUnique.resolves(
        makeEscrow({ escrowId: 'esc-2', releaseTxSignature: 'tx-retry' })
      );

      const result = await service.retryFailedMembers({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
      });

      expect(result).to.have.property('status', TransactionPoolStatus.SETTLED);
      expect(result.settledCount).to.equal(2); // 1 previous + 1 retried
    });

    it('should reject retry when pool is not PARTIAL_FAIL or FAILED', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'SETTLED' }));

      try {
        await service.retryFailedMembers({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot retry');
        expect(err.message).to.include('expected PARTIAL_FAIL or FAILED');
      }
    });

    it('should reject retry when no failed members exist', async () => {
      prismaStub.transactionPool.findUnique.resolves(
        makePool({ status: 'PARTIAL_FAIL', settledCount: 1, failedCount: 0 })
      );
      prismaStub.transactionPoolMember.findMany.resolves([]);

      try {
        await service.retryFailedMembers({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('No failed members to retry');
      }
    });
  });

  // ─── cancelPool ──────────────────────────────────────────────

  describe('cancelPool', () => {
    it('should cancel OPEN pool', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'OPEN' }));
      prismaStub.transactionPoolMember.findMany.resolves([]);

      const result = await service.cancelPool({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
        reason: 'Changed plans',
      });

      expect(result).to.have.property('status', 'CANCELLED');
      expect(prismaStub.transactionPool.update.called).to.be.true;
    });

    it('should cancel LOCKED pool and refund members', async () => {
      prismaStub.transactionPool.findUnique.resolves(
        makePool({ status: 'LOCKED', memberCount: 1, poolVaultPda: 'some-pda' })
      );
      prismaStub.transactionPoolMember.findMany.resolves([makeMember()]);

      const result = await service.cancelPool({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
      });

      expect(result).to.have.property('status', 'CANCELLED');
      // Member should be marked REMOVED
      expect(prismaStub.transactionPoolMember.update.calledOnce).to.be.true;
      const memberUpdateCall = prismaStub.transactionPoolMember.update.firstCall;
      expect(memberUpdateCall.args[0].data.status).to.equal('REMOVED');
    });

    it('should reject cancel on SETTLED pool', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'SETTLED' }));

      try {
        await service.cancelPool({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot cancel');
        expect(err.message).to.include('SETTLED');
      }
    });

    it('should reject cancel on SETTLING pool', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ status: 'SETTLING' }));

      try {
        await service.cancelPool({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot cancel');
      }
    });
  });

  // ─── getPool ─────────────────────────────────────────────────

  describe('getPool', () => {
    it('should return pool for correct client', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool());
      prismaStub.transactionPoolMember.findMany.resolves([makeMember()]);

      const result = await service.getPool({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
      });

      expect(result).to.have.property('poolCode', POOL_CODE);
      expect(result).to.have.property('clientId', CLIENT_ID);
    });

    it('should reject access by wrong client', async () => {
      prismaStub.transactionPool.findUnique.resolves(makePool({ clientId: 'other-client' }));

      try {
        await service.getPool({
          clientId: CLIENT_ID,
          poolIdOrCode: POOL_ID,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Access denied');
        expect(err.message).to.include('another client');
      }
    });

    it('should throw when pool not found', async () => {
      prismaStub.transactionPool.findUnique.resolves(null);

      try {
        await service.getPool({
          clientId: CLIENT_ID,
          poolIdOrCode: 'non-existent',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Pool not found');
      }
    });
  });

  // ─── listPools ───────────────────────────────────────────────

  describe('listPools', () => {
    it('should return paginated results', async () => {
      const poolWithMembers = { ...makePool(), members: [makeMember()] };
      prismaStub.transactionPool.findMany.resolves([poolWithMembers]);
      prismaStub.transactionPool.count.resolves(1);

      const result = await service.listPools({
        clientId: CLIENT_ID,
        limit: 20,
        offset: 0,
      });

      expect(result).to.have.property('pools');
      expect(result.pools).to.have.length(1);
      expect(result).to.have.property('total', 1);
      expect(result).to.have.property('limit', 20);
      expect(result).to.have.property('offset', 0);
    });

    it('should apply status filter', async () => {
      prismaStub.transactionPool.findMany.resolves([]);
      prismaStub.transactionPool.count.resolves(0);

      await service.listPools({
        clientId: CLIENT_ID,
        status: 'OPEN',
      });

      const findManyCall = prismaStub.transactionPool.findMany.firstCall;
      expect(findManyCall.args[0].where).to.have.property('status', 'OPEN');
    });

    it('should apply corridor filter', async () => {
      prismaStub.transactionPool.findMany.resolves([]);
      prismaStub.transactionPool.count.resolves(0);

      await service.listPools({
        clientId: CLIENT_ID,
        corridor: 'SG-CH',
      });

      const findManyCall = prismaStub.transactionPool.findMany.firstCall;
      expect(findManyCall.args[0].where).to.have.property('corridor', 'SG-CH');
    });

    it('should use default limit and offset', async () => {
      prismaStub.transactionPool.findMany.resolves([]);
      prismaStub.transactionPool.count.resolves(0);

      const result = await service.listPools({ clientId: CLIENT_ID });

      const findManyCall = prismaStub.transactionPool.findMany.firstCall;
      expect(findManyCall.args[0].take).to.equal(20);
      expect(findManyCall.args[0].skip).to.equal(0);
      expect(result).to.have.property('limit', 20);
      expect(result).to.have.property('offset', 0);
    });
  });

  // ─── decryptReceipt ──────────────────────────────────────────

  describe('decryptReceipt', () => {
    it('should decrypt receipt for settled member', async () => {
      prismaStub.transactionPoolMember.findFirst.resolves(makeMember({ status: 'SETTLED' }));

      const result = await service.decryptReceipt(CLIENT_ID, POOL_ID, ESCROW_ID);

      expect(result).to.have.property('poolCode', POOL_CODE);
      expect(result).to.have.property('amount', '1000.000000');
      expect(programServiceStub.fetchPoolReceipt.calledOnce).to.be.true;
      expect(programServiceStub.decryptReceipt.calledOnce).to.be.true;
    });

    it('should reject if member not settled', async () => {
      prismaStub.transactionPoolMember.findFirst.resolves(makeMember({ status: 'PENDING' }));

      try {
        await service.decryptReceipt(CLIENT_ID, POOL_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not been settled yet');
        expect(err.message).to.include('PENDING');
      }
    });

    it('should reject if escrow not a member of pool', async () => {
      prismaStub.transactionPoolMember.findFirst.resolves(null);

      try {
        await service.decryptReceipt(CLIENT_ID, POOL_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not a member of pool');
      }
    });

    it('should reject if on-chain receipt not found', async () => {
      prismaStub.transactionPoolMember.findFirst.resolves(makeMember({ status: 'SETTLED' }));
      programServiceStub.fetchPoolReceipt.resolves({
        exists: false,
      });

      try {
        await service.decryptReceipt(CLIENT_ID, POOL_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('On-chain receipt not found');
      }
    });
  });

  // ─── getPoolAudit ────────────────────────────────────────────

  describe('getPoolAudit', () => {
    it('should return paginated audit logs', async () => {
      prismaStub.transactionPoolAuditLog.findMany.resolves([
        {
          id: 'log-1',
          poolId: POOL_ID,
          escrowId: null,
          action: 'POOL_CREATED',
          actor: 'test@example.com',
          details: { message: 'Pool created' },
          createdAt: new Date(),
        },
      ]);
      prismaStub.transactionPoolAuditLog.count.resolves(1);

      const result = await service.getPoolAudit({
        clientId: CLIENT_ID,
        poolIdOrCode: POOL_ID,
        limit: 10,
        offset: 0,
      });

      expect(result.logs).to.have.length(1);
      expect(result.total).to.equal(1);
      expect(result.logs[0]).to.have.property('action', 'POOL_CREATED');
    });
  });

  // ─── Receipt encryption roundtrip ────────────────────────────

  describe('receipt encryption roundtrip', () => {
    const aesKey = crypto.randomBytes(32);

    const sampleReceipt = {
      poolId: POOL_ID,
      poolCode: POOL_CODE,
      escrowId: ESCROW_ID,
      escrowCode: ESCROW_CODE,
      amount: '1000.000000',
      corridor: 'SG-CH',
      payerWallet: PAYER_WALLET,
      recipientWallet: RECIPIENT_WALLET,
      releaseTxSignature: 'mock-tx-signature-abc123',
      settledAt: '2026-03-26T14:05:00.000Z',
    };

    it('should encrypt and decrypt receipt correctly', () => {
      const encrypted = encryptReceiptPayload(sampleReceipt, aesKey);

      expect(encrypted).to.have.length(512);

      const decrypted = decryptReceiptPayload(encrypted, aesKey);

      expect(decrypted.poolId).to.equal(sampleReceipt.poolId);
      expect(decrypted.poolCode).to.equal(sampleReceipt.poolCode);
      expect(decrypted.escrowId).to.equal(sampleReceipt.escrowId);
      expect(decrypted.amount).to.equal(sampleReceipt.amount);
      expect(decrypted.corridor).to.equal(sampleReceipt.corridor);
      expect(decrypted.payerWallet).to.equal(sampleReceipt.payerWallet);
      expect(decrypted.recipientWallet).to.equal(sampleReceipt.recipientWallet);
      expect(decrypted.releaseTxSignature).to.equal(sampleReceipt.releaseTxSignature);
      expect(decrypted.settledAt).to.equal(sampleReceipt.settledAt);
    });

    it('should produce fixed 512-byte payload', () => {
      const encrypted = encryptReceiptPayload(sampleReceipt, aesKey);
      expect(encrypted.length).to.equal(512);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const enc1 = encryptReceiptPayload(sampleReceipt, aesKey);
      const enc2 = encryptReceiptPayload(sampleReceipt, aesKey);

      // IVs are at offset 0-12, should differ
      const iv1 = enc1.subarray(0, 12);
      const iv2 = enc2.subarray(0, 12);
      expect(iv1.equals(iv2)).to.be.false;
    });

    it('should fail decryption with wrong key', () => {
      const encrypted = encryptReceiptPayload(sampleReceipt, aesKey);
      const wrongKey = crypto.randomBytes(32);

      expect(() => decryptReceiptPayload(encrypted, wrongKey)).to.throw();
    });

    it('should reject payload with wrong size', () => {
      const badPayload = Buffer.alloc(256);

      try {
        decryptReceiptPayload(badPayload, aesKey);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Invalid receipt payload size');
      }
    });

    it('should reject plaintext exceeding max size', () => {
      const bigReceipt = {
        ...sampleReceipt,
        // Create a very long field to exceed 480 bytes
        releaseTxSignature: 'x'.repeat(500),
      };

      try {
        encryptReceiptPayload(bigReceipt, aesKey);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Receipt plaintext too large');
      }
    });

    it('should compute deterministic commitment hash', () => {
      const hash1 = computeCommitmentHash(sampleReceipt);
      const hash2 = computeCommitmentHash(sampleReceipt);

      expect(hash1.equals(hash2)).to.be.true;
      expect(hash1.length).to.equal(32); // SHA-256
    });

    it('should produce different hashes for different receipts', () => {
      const hash1 = computeCommitmentHash(sampleReceipt);
      const hash2 = computeCommitmentHash({
        ...sampleReceipt,
        amount: '2000.000000',
      });

      expect(hash1.equals(hash2)).to.be.false;
    });
  });
});
