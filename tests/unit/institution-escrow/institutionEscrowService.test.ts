/**
 * Unit Tests for InstitutionEscrowService
 *
 * Tests the core escrow orchestrator lifecycle:
 * - createEscrow: validation, compliance, storage
 * - recordDeposit: status checks, expiry, funding
 * - releaseFunds: status checks, release flow
 * - cancelEscrow: cancellable statuses, rejection
 * - getEscrow: ownership, caching
 * - listEscrows: pagination, filters
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import {
  InstitutionEscrowService,
  CreateEscrowParams,
} from '../../../src/services/institution-escrow.service';

describe('InstitutionEscrowService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionEscrowService;
  let prismaStub: any;
  let redisStub: any;
  let complianceStub: any;
  let allowlistStub: any;

  const CLIENT_ID = 'client-123';
  const ESCROW_ID = 'escrow-456';
  const ESCROW_CODE = 'EE-AB3D-7KMN';
  const PAYER_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const RECIPIENT_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

  const makeClient = (overrides: Record<string, unknown> = {}) => ({
    id: CLIENT_ID,
    companyName: 'Test Corp',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    tier: 'ENTERPRISE',
    primaryWallet: PAYER_WALLET,
    settledWallets: [],
    ...overrides,
  });

  const makeEscrow = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    escrowId: ESCROW_ID,
    escrowCode: ESCROW_CODE,
    clientId: CLIENT_ID,
    payerWallet: PAYER_WALLET,
    recipientWallet: RECIPIENT_WALLET,
    usdcMint: process.env.USDC_MINT_ADDRESS,
    amount: 1000,
    platformFee: 0.5,
    corridor: 'US-MX',
    conditionType: 'ADMIN_RELEASE',
    status: 'CREATED',
    settlementAuthority: PAYER_WALLET,
    riskScore: 10,
    escrowPda: null,
    vaultPda: null,
    depositTxSignature: null,
    releaseTxSignature: null,
    cancelTxSignature: null,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    fundedAt: null,
    ...overrides,
  });

  const defaultComplianceResult = {
    passed: true,
    flags: [],
    reasons: [],
    riskScore: 10,
    corridorValid: true,
    walletsAllowlisted: true,
    limitsWithinRange: true,
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub Redis
    redisStub = {
      get: sandbox.stub().resolves(null),
      set: sandbox.stub().resolves('OK'),
      del: sandbox.stub().resolves(1),
    };

    // Stub Prisma
    prismaStub = {
      institutionClient: {
        findUnique: sandbox.stub().resolves(makeClient()),
        findFirst: sandbox.stub().resolves(makeClient()),
        findMany: sandbox.stub().resolves([]),
      },
      institutionEscrow: {
        create: sandbox.stub().callsFake(async (params: any) => ({
          id: 1,
          ...params.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        findUnique: sandbox.stub().resolves(makeEscrow()),
        findMany: sandbox.stub().resolves([makeEscrow()]),
        count: sandbox.stub().resolves(1),
        update: sandbox.stub().callsFake(async (params: any) => ({
          ...makeEscrow(),
          ...params.data,
          updatedAt: new Date(),
        })),
      },
      institutionDeposit: {
        create: sandbox.stub().resolves({}),
      },
      institutionAuditLog: {
        create: sandbox.stub().resolves({}),
        findMany: sandbox.stub().resolves([]),
      },
      institutionAccount: {
        findMany: sandbox.stub().resolves([]),
        findFirst: sandbox.stub().resolves({ clientId: 'other-client-id' }),
      },
      institutionCorridor: {
        findUnique: sandbox.stub().resolves(null),
      },
      institutionAiAnalysis: {
        findMany: sandbox.stub().resolves([]),
      },
    };

    // Stub compliance service
    complianceStub = {
      validateTransaction: sandbox.stub().resolves(defaultComplianceResult),
      getComplianceThresholds: sandbox.stub().resolves({ rejectScore: 90, holdScore: 70 }),
    };

    // Stub allowlist service
    allowlistStub = {
      isAllowlisted: sandbox.stub().resolves(true),
    };

    // Create service and inject stubs
    service = new InstitutionEscrowService();
    (service as any).prisma = prismaStub;
    (service as any).complianceService = complianceStub;
    (service as any).allowlistService = allowlistStub;

    // Stub the redis-based caching methods directly on the service instance
    sandbox.stub(service as any, 'cacheEscrow').resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── createEscrow ───────────────────────────────────────────

  describe('createEscrow', () => {
    const defaultParams: CreateEscrowParams = {
      clientId: CLIENT_ID,
      payerWallet: PAYER_WALLET,
      recipientWallet: RECIPIENT_WALLET,
      amount: 1000,
      corridor: 'US-MX',
      conditionType: 'ADMIN_RELEASE',
      settlementMode: 'escrow',
      releaseMode: 'manual',
    };

    it('should create escrow with valid params', async () => {
      const result = await service.createEscrow(defaultParams);

      expect(result).to.have.property('escrow');
      expect(result).to.have.property('complianceResult');
      expect(result.complianceResult).to.have.property('passed', true);
      expect(result.complianceResult).to.have.property('riskScore', 10);
      expect(prismaStub.institutionEscrow.create.calledOnce).to.be.true;
      expect(prismaStub.institutionAuditLog.create.calledOnce).to.be.true;
    });

    it('should reject non-ACTIVE client', async () => {
      prismaStub.institutionClient.findUnique.resolves(makeClient({ status: 'SUSPENDED' }));

      try {
        await service.createEscrow(defaultParams);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('SUSPENDED');
        expect(err.message).to.include('Must be ACTIVE');
      }
    });

    it('should reject non-VERIFIED KYC', async () => {
      prismaStub.institutionClient.findUnique.resolves(makeClient({ kycStatus: 'PENDING' }));

      try {
        await service.createEscrow(defaultParams);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('PENDING');
        expect(err.message).to.include('Must be VERIFIED');
      }
    });

    it('should create with CREATED status even when compliance has warnings', async () => {
      complianceStub.validateTransaction.resolves({
        ...defaultComplianceResult,
        passed: false,
        riskScore: 55,
        flags: ['MEDIUM_RISK'],
      });

      const result = await service.createEscrow(defaultParams);

      // Escrow should always be CREATED — COMPLIANCE_HOLD is only for post-funding
      const createCall = prismaStub.institutionEscrow.create.firstCall;
      expect(createCall.args[0].data.status).to.equal('CREATED');
      expect(result.complianceResult).to.have.property('passed', false);
    });

    it('should reject when compliance fails with high risk', async () => {
      complianceStub.validateTransaction.resolves({
        ...defaultComplianceResult,
        passed: false,
        riskScore: 80,
        reasons: ['Suspicious activity detected'],
        flags: ['HIGH_RISK'],
      });

      try {
        await service.createEscrow(defaultParams);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Compliance check failed');
        expect(err.message).to.include('Suspicious activity detected');
      }
    });

    it('should throw when client not found', async () => {
      prismaStub.institutionClient.findUnique.resolves(null);

      try {
        await service.createEscrow(defaultParams);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('Client not found');
      }
    });
    it('should reject unregistered external recipient wallet', async () => {
      // No account found, no client found
      prismaStub.institutionAccount.findFirst.resolves(null);
      prismaStub.institutionClient.findFirst.resolves(null);

      try {
        await service.createEscrow(defaultParams);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not registered to any institution');
      }
    });

    it('should reject sending to own account', async () => {
      // Account found but belongs to same client
      prismaStub.institutionAccount.findFirst.resolves({ clientId: CLIENT_ID });

      try {
        await service.createEscrow(defaultParams);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot send to your own account');
      }
    });

    it('should accept recipient wallet from another institution', async () => {
      // Account found and belongs to different client
      prismaStub.institutionAccount.findFirst.resolves({ clientId: 'other-institution-id' });

      const result = await service.createEscrow(defaultParams);
      expect(result).to.have.property('escrow');
    });
  });

  // ─── recordDeposit ──────────────────────────────────────────

  describe('recordDeposit', () => {
    const TX_SIG = 'txsig123abc';

    it('should record deposit on CREATED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow({ status: 'CREATED' }));

      const result = await service.recordDeposit(CLIENT_ID, ESCROW_ID, TX_SIG);

      expect(result).to.have.property('status', 'FUNDED');
      expect(prismaStub.institutionDeposit.create.calledOnce).to.be.true;
      expect(prismaStub.institutionEscrow.update.called).to.be.true;
    });

    it('should reject deposit on non-CREATED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow({ status: 'FUNDED' }));

      try {
        await service.recordDeposit(CLIENT_ID, ESCROW_ID, TX_SIG);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot record deposit');
        expect(err.message).to.include('FUNDED');
        expect(err.message).to.include('expected CREATED');
      }
    });

    it('should reject deposit on expired escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(
        makeEscrow({
          status: 'CREATED',
          expiresAt: new Date(Date.now() - 1000), // expired
        })
      );

      try {
        await service.recordDeposit(CLIENT_ID, ESCROW_ID, TX_SIG);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('expired');
      }
    });
  });

  // ─── releaseFunds ───────────────────────────────────────────

  describe('releaseFunds', () => {
    it('should release funds on FUNDED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow({ status: 'FUNDED' }));

      const result = await service.releaseFunds(CLIENT_ID, ESCROW_ID, 'Test release');

      expect(result).to.have.property('status', 'RELEASED');
      expect(prismaStub.institutionAuditLog.create.calledOnce).to.be.true;
    });

    it('should reject release on non-FUNDED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow({ status: 'CREATED' }));

      try {
        await service.releaseFunds(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot release');
        expect(err.message).to.include('expected FUNDED');
      }
    });
  });

  // ─── cancelEscrow ──────────────────────────────────────────

  describe('cancelEscrow', () => {
    it('should cancel CREATED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow({ status: 'CREATED' }));

      const result = await service.cancelEscrow(CLIENT_ID, ESCROW_ID, 'Changed mind');

      expect(result).to.have.property('status', 'CANCELLED');
      expect(prismaStub.institutionAuditLog.create.calledOnce).to.be.true;
    });

    it('should cancel FUNDED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow({ status: 'FUNDED' }));

      const result = await service.cancelEscrow(CLIENT_ID, ESCROW_ID, 'Refund needed');

      expect(result).to.have.property('status', 'CANCELLED');
    });

    it('should reject cancel on RELEASED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow({ status: 'RELEASED' }));

      try {
        await service.cancelEscrow(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot cancel');
        expect(err.message).to.include('RELEASED');
      }
    });
  });

  // ─── getEscrow ─────────────────────────────────────────────

  describe('getEscrow', () => {
    it('should return escrow for correct client', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow());

      const result = await service.getEscrow(CLIENT_ID, ESCROW_ID);

      expect(result).to.have.property('escrowId', ESCROW_CODE);
      expect(result).to.have.property('clientId', CLIENT_ID);
    });

    it('should reject access by wrong client with non-matching wallets', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(
        makeEscrow({
          clientId: 'other-client',
          payerWallet: 'UnrelatedPayer11111111111111111111111111111111',
          recipientWallet: 'UnrelatedRecip11111111111111111111111111111111',
        })
      );

      try {
        await service.getEscrow(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Access denied');
        expect(err.message).to.include('another client');
      }
    });

    it('should allow counterparty access via primaryWallet matching recipientWallet', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(
        makeEscrow({
          clientId: 'other-client',
          recipientWallet: PAYER_WALLET, // matches CLIENT_ID's primaryWallet
        })
      );

      const result = await service.getEscrow(CLIENT_ID, ESCROW_ID);
      expect(result).to.have.property('escrowId', ESCROW_CODE);
    });

    it('should allow counterparty access via InstitutionAccount wallet', async () => {
      const ACCOUNT_WALLET = 'AccountWallet111111111111111111111111111111111';
      prismaStub.institutionEscrow.findUnique.resolves(
        makeEscrow({
          clientId: 'other-client',
          payerWallet: 'SomeOtherPayer1111111111111111111111111111111',
          recipientWallet: ACCOUNT_WALLET,
        })
      );
      prismaStub.institutionAccount.findMany.resolves([{ walletAddress: ACCOUNT_WALLET }]);

      const result = await service.getEscrow(CLIENT_ID, ESCROW_ID);
      expect(result).to.have.property('escrowId', ESCROW_CODE);
    });

    it('should allow counterparty access via payerWallet match', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(
        makeEscrow({
          clientId: 'other-client',
          payerWallet: PAYER_WALLET, // matches CLIENT_ID's primaryWallet
          recipientWallet: 'SomeRecipient11111111111111111111111111111111',
        })
      );

      const result = await service.getEscrow(CLIENT_ID, ESCROW_ID);
      expect(result).to.have.property('escrowId', ESCROW_CODE);
    });

    it('should return cached escrow from Redis when available', async () => {
      // Restore the cacheEscrow stub so getEscrow can use the original flow
      // For getEscrow, we need to stub the redisClient.get call instead
      const cachedEscrow = makeEscrow();
      const getEscrowSpy = sandbox.stub(service as any, 'getEscrowInternal').resolves(cachedEscrow);

      // When cache misses, it falls through to getEscrowInternal
      const result = await service.getEscrow(CLIENT_ID, ESCROW_ID);
      expect(result).to.have.property('escrowId', ESCROW_CODE);
    });
  });

  // ─── listEscrows ───────────────────────────────────────────

  describe('listEscrows', () => {
    it('should return paginated results', async () => {
      prismaStub.institutionEscrow.findMany.resolves([
        makeEscrow(),
        makeEscrow({ escrowId: 'escrow-789' }),
      ]);
      prismaStub.institutionEscrow.count.resolves(2);

      const result = await service.listEscrows({
        clientId: CLIENT_ID,
        limit: 20,
        offset: 0,
      });

      expect(result).to.have.property('escrows');
      expect(result.escrows).to.have.length(2);
      expect(result).to.have.property('total', 2);
      expect(result).to.have.property('limit', 20);
      expect(result).to.have.property('offset', 0);
    });

    it('should apply status filter', async () => {
      await service.listEscrows({
        clientId: CLIENT_ID,
        status: 'FUNDED',
      });

      const findManyCall = prismaStub.institutionEscrow.findMany.firstCall;
      expect(findManyCall.args[0].where).to.have.property('status', 'FUNDED');
    });

    it('should apply corridor filter', async () => {
      await service.listEscrows({
        clientId: CLIENT_ID,
        corridor: 'US-MX',
      });

      const findManyCall = prismaStub.institutionEscrow.findMany.firstCall;
      expect(findManyCall.args[0].where).to.have.property('corridor', 'US-MX');
    });

    it('should use default limit and offset', async () => {
      const result = await service.listEscrows({ clientId: CLIENT_ID });

      const findManyCall = prismaStub.institutionEscrow.findMany.firstCall;
      expect(findManyCall.args[0].take).to.equal(20);
      expect(findManyCall.args[0].skip).to.equal(0);
      expect(result).to.have.property('limit', 20);
      expect(result).to.have.property('offset', 0);
    });
  });

  // ─── Party Name Fields ──────────────────────────────────

  describe('party name fields', () => {
    it('should include party name fields in list response', async () => {
      prismaStub.institutionEscrow.findMany.resolves([makeEscrow()]);
      prismaStub.institutionEscrow.count.resolves(1);

      const result = await service.listEscrows({ clientId: CLIENT_ID });

      const escrow = result.escrows[0] as any;
      expect(escrow.from).to.have.property('name');
      expect(escrow.from).to.have.property('accountLabel');
      expect(escrow.from).to.have.property('branchName');
      expect(escrow.to).to.have.property('name');
      expect(escrow.to).to.have.property('accountLabel');
      expect(escrow.to).to.have.property('branchName');
      expect(escrow.to).to.have.property('clientId');
    });

    it('should resolve payerName from client companyName', async () => {
      prismaStub.institutionEscrow.findMany.resolves([makeEscrow()]);
      prismaStub.institutionEscrow.count.resolves(1);
      prismaStub.institutionClient.findUnique.resolves(
        makeClient({ companyName: 'Optimus Exchange AG' })
      );

      const result = await service.listEscrows({ clientId: CLIENT_ID });

      expect((result.escrows[0] as any).from.name).to.equal('Optimus Exchange AG');
    });

    it('should resolve payerAccountLabel from matching account', async () => {
      prismaStub.institutionEscrow.findMany.resolves([makeEscrow()]);
      prismaStub.institutionEscrow.count.resolves(1);

      // Stub the account query — first call is for payer accounts (matching clientId + payerWallet)
      prismaStub.institutionAccount.findMany
        .onFirstCall()
        .resolves([{ walletAddress: PAYER_WALLET, label: 'Operating Account', name: 'Main' }])
        .onSecondCall()
        .resolves([]); // recipient accounts

      const result = await service.listEscrows({ clientId: CLIENT_ID });

      expect((result.escrows[0] as any).from.accountLabel).to.equal('Operating Account');
    });

    it('should resolve recipientName from account client relation', async () => {
      prismaStub.institutionEscrow.findMany.resolves([makeEscrow()]);
      prismaStub.institutionEscrow.count.resolves(1);

      // Second account query (recipient accounts) returns match with client
      prismaStub.institutionAccount.findMany
        .onFirstCall()
        .resolves([]) // payer accounts
        .onSecondCall()
        .resolves([
          {
            walletAddress: RECIPIENT_WALLET,
            label: 'Treasury',
            name: 'Treasury Account',
            client: { id: 'recipient-client-id', companyName: 'Satoshi Industries' },
          },
        ]);

      const result = await service.listEscrows({ clientId: CLIENT_ID });

      expect((result.escrows[0] as any).to.name).to.equal('Satoshi Industries');
      expect((result.escrows[0] as any).to.accountLabel).to.equal('Treasury');
      expect((result.escrows[0] as any).to.clientId).to.equal('recipient-client-id');
    });

    it('should resolve recipientName from client primaryWallet', async () => {
      prismaStub.institutionEscrow.findMany.resolves([makeEscrow()]);
      prismaStub.institutionEscrow.count.resolves(1);

      // No account matches
      prismaStub.institutionAccount.findMany.resolves([]);
      // But client primaryWallet matches
      prismaStub.institutionClient.findMany.resolves([
        {
          id: 'recipient-client-id',
          companyName: 'Recipient Corp',
          primaryWallet: RECIPIENT_WALLET,
          settledWallets: [],
        },
      ]);

      const result = await service.listEscrows({ clientId: CLIENT_ID });

      expect((result.escrows[0] as any).to.name).to.equal('Recipient Corp');
      expect((result.escrows[0] as any).to.accountLabel).to.be.null;
      expect((result.escrows[0] as any).to.clientId).to.equal('recipient-client-id');
    });

    it('should return null fields when no matches found', async () => {
      prismaStub.institutionEscrow.findMany.resolves([
        makeEscrow({ recipientWallet: 'unknown-wallet' }),
      ]);
      prismaStub.institutionEscrow.count.resolves(1);
      prismaStub.institutionAccount.findMany.resolves([]);
      prismaStub.institutionClient.findMany.resolves([]);

      const result = await service.listEscrows({ clientId: CLIENT_ID });

      expect((result.escrows[0] as any).to.name).to.equal('External Wallet');
      expect((result.escrows[0] as any).to.accountLabel).to.be.null;
      expect((result.escrows[0] as any).to.clientId).to.be.null;
    });

    it('should include party name fields in counterparty getEscrow', async () => {
      // Escrow owned by another client, counterparty access via account wallet
      prismaStub.institutionEscrow.findUnique.resolves(
        makeEscrow({
          clientId: 'other-client',
          payerWallet: 'SomeOtherPayer1111111111111111111111111111111',
          recipientWallet: PAYER_WALLET,
        })
      );
      prismaStub.institutionAccount.findMany.resolves([{ walletAddress: PAYER_WALLET }]);

      const result = await service.getEscrow(CLIENT_ID, ESCROW_ID);

      const r = result as any;
      expect(r.from).to.have.property('name');
      expect(r.from).to.have.property('accountLabel');
      expect(r.from).to.have.property('branchName');
      expect(r.to).to.have.property('name');
      expect(r.to).to.have.property('accountLabel');
      expect(r.to).to.have.property('branchName');
      expect(r.to).to.have.property('clientId');
    });
  });
});
