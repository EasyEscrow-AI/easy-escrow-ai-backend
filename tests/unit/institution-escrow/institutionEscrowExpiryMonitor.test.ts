/**
 * Unit Tests for InstitutionEscrowExpiryMonitor
 *
 * Tests the background expiry monitor that:
 * - Expires CREATED / INSUFFICIENT_FUNDS escrows (DB-only)
 * - Expires FUNDED / COMPLIANCE_HOLD escrows (on-chain cancel + DB)
 * - Creates audit logs with system:expiry-monitor actor
 * - Sends ESCROW_EXPIRED notifications
 * - Invalidates Redis cache
 * - Releases nonces
 * - Prevents concurrent execution
 * - Alerts after consecutive failures
 */

import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Shim 'resend' module which is not installed in dev/test.
// The notification service imports institution-email.service which imports 'resend'.
// We intercept module resolution to provide a mock.
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request === 'resend') {
    // Return a dummy identifier; the require will hit our cache entry below
    return 'resend';
  }
  return originalResolveFilename.call(this, request, ...args);
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
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

import { InstitutionEscrowExpiryMonitor } from '../../../src/services/institution-escrow-expiry-monitor.service';

describe('InstitutionEscrowExpiryMonitor', function () {
  this.timeout(10000);

  let sandbox: sinon.SinonSandbox;
  let monitor: InstitutionEscrowExpiryMonitor;
  let prismaStub: any;
  let programServiceStub: any;
  let notificationServiceStub: any;
  let redisStub: any;
  let alertingStub: any;
  let noncePoolManagerStub: any;

  const PAYER_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const RECIPIENT_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

  const makeEscrow = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    escrowId: 'escrow-001',
    escrowCode: 'EE-AB3D-7KMN',
    clientId: 'client-123',
    payerWallet: PAYER_WALLET,
    recipientWallet: RECIPIENT_WALLET,
    amount: 1000,
    platformFee: 0.5,
    corridor: 'US-MX',
    conditionType: 'ADMIN_RELEASE',
    status: 'CREATED',
    escrowPda: null,
    vaultPda: null,
    nonceAccount: null,
    depositTxSignature: null,
    releaseTxSignature: null,
    cancelTxSignature: null,
    expiresAt: new Date(Date.now() - 60000), // expired 1 min ago
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    fundedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Reset singleton
    (InstitutionEscrowExpiryMonitor as any).instance = null;

    // Stub Redis
    redisStub = {
      del: sandbox.stub().resolves(1),
    };

    // Stub Prisma
    prismaStub = {
      institutionEscrow: {
        findMany: sandbox.stub().resolves([]),
        updateMany: sandbox.stub().resolves({ count: 0 }),
        update: sandbox.stub().callsFake(async (params: any) => ({
          ...makeEscrow(),
          ...params.data,
        })),
      },
      institutionAuditLog: {
        create: sandbox.stub().resolves({}),
      },
      institutionClient: {
        findUnique: sandbox.stub().resolves({
          companyName: 'Test Corp',
          legalName: 'Test Corporation Ltd',
          country: 'US',
          registrationCountry: 'US',
          lei: null,
        }),
        findFirst: sandbox.stub().resolves(null),
      },
    };

    // Stub program service
    programServiceStub = {
      cancelEscrowOnChain: sandbox.stub().resolves('mock-tx-signature-123'),
      getUsdcMintAddress: sandbox.stub().returns({ toBase58: () => process.env.USDC_MINT_ADDRESS }),
    };

    // Stub notification service
    notificationServiceStub = {
      notify: sandbox.stub().resolves(),
    };

    // Stub nonce pool manager
    noncePoolManagerStub = {
      releaseNonce: sandbox.stub().resolves(),
    };

    // Stub alerting service
    alertingStub = sandbox.stub().resolves();

    // Stub external dependencies via module require cache
    const programServiceMod = require('../../../src/services/institution-escrow-program.service');
    sandbox
      .stub(programServiceMod, 'getInstitutionEscrowProgramService')
      .returns(programServiceStub);

    // Stub notification service (lazy-loaded via require in postExpireActions)
    const notificationServiceMod = require('../../../src/services/institution-notification.service');
    sandbox
      .stub(notificationServiceMod, 'getInstitutionNotificationService')
      .returns(notificationServiceStub);

    const alertingMod = require('../../../src/services/alerting.service');
    if (alertingMod.alertingService && alertingMod.alertingService.sendAlert) {
      sandbox.stub(alertingMod.alertingService, 'sendAlert').callsFake(alertingStub);
    }

    // Redis cache invalidation is wrapped in try/catch in the service,
    // so in test environment it'll silently fail (no real Redis connection).
    // We stub it directly on the monitor's postExpireActions via the redis module proxy.

    // Create monitor instance
    monitor = InstitutionEscrowExpiryMonitor.getInstance(prismaStub as any, {
      schedule: '*/10 * * * *',
      batchSize: 50,
      onChainDelayMs: 0, // No delay in tests
      maxIterations: 50,
    });

    // Inject stubbed prisma (override the one passed to constructor)
    (monitor as any).prisma = prismaStub;

    // Stub getNoncePoolManager
    (monitor as any).getNoncePoolManager = () => noncePoolManagerStub;
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── executeExpiryCheck ──────────────────────────────────────

  describe('executeExpiryCheck', () => {
    it('should expire CREATED escrows without on-chain cancel', async () => {
      const escrow = makeEscrow({ status: 'CREATED', escrowPda: null });
      prismaStub.institutionEscrow.findMany.resolves([escrow]);
      prismaStub.institutionEscrow.updateMany.resolves({ count: 1 });

      const result = await monitor.executeExpiryCheck();

      expect(result.success).to.be.true;
      expect(result.dbOnlyExpired).to.equal(1);
      expect(result.onChainExpired).to.equal(0);
      expect(programServiceStub.cancelEscrowOnChain.called).to.be.false;
      expect(prismaStub.institutionEscrow.updateMany.calledOnce).to.be.true;

      const updateCall = prismaStub.institutionEscrow.updateMany.firstCall.args[0];
      expect(updateCall.data.status).to.equal('EXPIRED');
      expect(updateCall.data.resolvedAt).to.be.instanceOf(Date);
    });

    it('should expire FUNDED escrows with on-chain cancel and capture txSignature', async () => {
      const escrow = makeEscrow({
        status: 'FUNDED',
        escrowPda: 'SomePda123',
        vaultPda: 'SomeVault456',
      });
      prismaStub.institutionEscrow.findMany.resolves([escrow]);

      const result = await monitor.executeExpiryCheck();

      expect(result.success).to.be.true;
      expect(result.onChainExpired).to.equal(1);
      expect(result.dbOnlyExpired).to.equal(0);
      expect(programServiceStub.cancelEscrowOnChain.calledOnce).to.be.true;

      const updateCall = prismaStub.institutionEscrow.update.firstCall.args[0];
      expect(updateCall.data.status).to.equal('EXPIRED');
      expect(updateCall.data.cancelTxSignature).to.equal('mock-tx-signature-123');
      expect(updateCall.data.resolvedAt).to.be.instanceOf(Date);
    });

    it('should skip FUNDED escrow if on-chain cancel fails (retry next cycle)', async () => {
      const escrow = makeEscrow({
        status: 'FUNDED',
        escrowPda: 'SomePda123',
      });
      prismaStub.institutionEscrow.findMany.resolves([escrow]);
      programServiceStub.cancelEscrowOnChain.rejects(new Error('RPC timeout'));

      const result = await monitor.executeExpiryCheck();

      expect(result.success).to.be.true;
      expect(result.onChainExpired).to.equal(0);
      expect(result.onChainFailures).to.equal(1);
      // DB should NOT be updated to EXPIRED
      expect(prismaStub.institutionEscrow.update.called).to.be.false;
    });

    it('should expire COMPLIANCE_HOLD with escrowPda via on-chain cancel', async () => {
      const escrow = makeEscrow({
        status: 'COMPLIANCE_HOLD',
        escrowPda: 'SomePda789',
      });
      prismaStub.institutionEscrow.findMany.resolves([escrow]);

      const result = await monitor.executeExpiryCheck();

      expect(result.success).to.be.true;
      expect(result.onChainExpired).to.equal(1);
      expect(programServiceStub.cancelEscrowOnChain.calledOnce).to.be.true;
    });

    it('should expire COMPLIANCE_HOLD without escrowPda as DB-only', async () => {
      const escrow = makeEscrow({
        status: 'COMPLIANCE_HOLD',
        escrowPda: null,
      });
      prismaStub.institutionEscrow.findMany.resolves([escrow]);
      prismaStub.institutionEscrow.updateMany.resolves({ count: 1 });

      const result = await monitor.executeExpiryCheck();

      expect(result.success).to.be.true;
      expect(result.dbOnlyExpired).to.equal(1);
      expect(result.onChainExpired).to.equal(0);
      expect(programServiceStub.cancelEscrowOnChain.called).to.be.false;
    });

    it('should expire INSUFFICIENT_FUNDS as DB-only', async () => {
      const escrow = makeEscrow({
        status: 'INSUFFICIENT_FUNDS',
        escrowPda: null,
      });
      prismaStub.institutionEscrow.findMany.resolves([escrow]);
      prismaStub.institutionEscrow.updateMany.resolves({ count: 1 });

      const result = await monitor.executeExpiryCheck();

      expect(result.success).to.be.true;
      expect(result.dbOnlyExpired).to.equal(1);
      expect(programServiceStub.cancelEscrowOnChain.called).to.be.false;
    });

    it('should NOT expire DRAFT escrows (not in query)', async () => {
      prismaStub.institutionEscrow.findMany.resolves([]);

      const result = await monitor.executeExpiryCheck();

      expect(result.success).to.be.true;
      expect(result.dbOnlyExpired).to.equal(0);
      expect(result.onChainExpired).to.equal(0);

      const findCall = prismaStub.institutionEscrow.findMany.firstCall.args[0];
      expect(findCall.where.status.in).to.deep.equal([
        'CREATED',
        'FUNDED',
        'COMPLIANCE_HOLD',
        'INSUFFICIENT_FUNDS',
      ]);
      expect(findCall.where.status.in).to.not.include('DRAFT');
    });

    it('should create audit log with ESCROW_EXPIRED action and system:expiry-monitor actor', async () => {
      const escrow = makeEscrow({ status: 'CREATED' });
      prismaStub.institutionEscrow.findMany.resolves([escrow]);
      prismaStub.institutionEscrow.updateMany.resolves({ count: 1 });

      await monitor.executeExpiryCheck();

      expect(prismaStub.institutionAuditLog.create.calledOnce).to.be.true;
      const auditCall = prismaStub.institutionAuditLog.create.firstCall.args[0];
      expect(auditCall.data.action).to.equal('ESCROW_EXPIRED');
      expect(auditCall.data.actor).to.equal('system:expiry-monitor');
      expect(auditCall.data.escrowId).to.equal(escrow.escrowId);
      expect(auditCall.data.clientId).to.equal(escrow.clientId);
      expect(auditCall.data.details.previousStatus).to.equal('CREATED');
      expect(auditCall.data.details.kyt).to.exist;
    });

    it('should send ESCROW_EXPIRED notification', async () => {
      const escrow = makeEscrow({ status: 'CREATED' });
      prismaStub.institutionEscrow.findMany.resolves([escrow]);
      prismaStub.institutionEscrow.updateMany.resolves({ count: 1 });

      await monitor.executeExpiryCheck();

      expect(notificationServiceStub.notify.calledOnce).to.be.true;
      const notifyCall = notificationServiceStub.notify.firstCall.args[0];
      expect(notifyCall.type).to.equal('ESCROW_EXPIRED');
      expect(notifyCall.clientId).to.equal(escrow.clientId);
      expect(notifyCall.escrowId).to.equal(escrow.escrowId);
    });

    it('should release nonce on funded escrow expiry', async () => {
      const escrow = makeEscrow({
        status: 'FUNDED',
        escrowPda: 'SomePda123',
        nonceAccount: 'NonceAbc',
      });
      prismaStub.institutionEscrow.findMany.resolves([escrow]);

      await monitor.executeExpiryCheck();

      expect(noncePoolManagerStub.releaseNonce.calledOnce).to.be.true;
      expect(noncePoolManagerStub.releaseNonce.firstCall.args[0]).to.equal('NonceAbc');
    });

    it('should prevent concurrent execution (isRunning guard)', async () => {
      (monitor as any).isRunning = true;

      const result = await monitor.executeExpiryCheck();

      expect(result.success).to.be.false;
      expect(result.error).to.include('still running');
      expect(prismaStub.institutionEscrow.findMany.called).to.be.false;

      (monitor as any).isRunning = false;
    });

    it('should not crash on Redis cache invalidation', async () => {
      // Redis is a Proxy in test env; cache invalidation is wrapped in try/catch
      // and should never prevent the main flow from completing
      const escrow = makeEscrow({
        status: 'CREATED',
        escrowCode: 'EE-TEST-1234',
        escrowId: 'test-id-123',
      });
      prismaStub.institutionEscrow.findMany.resolves([escrow]);
      prismaStub.institutionEscrow.updateMany.resolves({ count: 1 });

      const result = await monitor.executeExpiryCheck();

      expect(result.success).to.be.true;
      expect(result.dbOnlyExpired).to.equal(1);
    });

    it('should process multiple batches until exhausted', async () => {
      prismaStub.institutionEscrow.findMany
        .onFirstCall()
        .resolves([makeEscrow({ escrowId: 'e1' }), makeEscrow({ escrowId: 'e2' })]);
      prismaStub.institutionEscrow.findMany.onSecondCall().resolves([]);
      prismaStub.institutionEscrow.updateMany.resolves({ count: 2 });

      const result = await monitor.executeExpiryCheck();

      expect(result.success).to.be.true;
      expect(result.dbOnlyExpired).to.equal(2);
    });

    it('should alert after 3 consecutive failures', async () => {
      (monitor as any).consecutiveErrors = 2;

      prismaStub.institutionEscrow.findMany.rejects(new Error('DB connection lost'));

      await monitor.executeExpiryCheck();

      expect((monitor as any).consecutiveErrors).to.equal(3);
      expect(alertingStub.calledOnce).to.be.true;
      const alertCall = alertingStub.firstCall.args;
      expect(alertCall[0]).to.equal('institution_escrow_expiry_monitor_failed');
      expect(alertCall[1]).to.equal('HIGH');
    });
  });

  // ─── start/stop ──────────────────────────────────────────────

  describe('start/stop', () => {
    it('should not start on non-leader instances', () => {
      (monitor as any).isLeader = false;
      monitor.start();
      expect((monitor as any).job).to.be.null;
    });

    it('should start cron job on leader when enabled', () => {
      (monitor as any).isLeader = true;
      monitor.start();
      expect((monitor as any).job).to.not.be.null;
      monitor.stop();
      expect((monitor as any).job).to.be.null;
    });
  });

  // ─── getStatus ───────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return current metrics', () => {
      const status = monitor.getStatus();

      expect(status).to.have.property('isLeader');
      expect(status).to.have.property('isRunning', false);
      expect(status).to.have.property('isScheduled');
      expect(status).to.have.property('totalExecutions');
      expect(status).to.have.property('totalExpired');
      expect(status).to.have.property('consecutiveErrors');
      expect(status).to.have.property('schedule', '*/10 * * * *');
    });
  });
});
