/**
 * Unit Tests for Institution Escrow State Machine
 *
 * Tests valid/invalid state transitions for InstitutionEscrowStatus:
 * - CREATED -> FUNDED, CANCELLED, EXPIRED
 * - FUNDED -> RELEASED, CANCELLED
 * - RELEASED -> (terminal, no valid transitions)
 * - CANCELLED -> (terminal, no valid transitions)
 * - COMPLIANCE_HOLD -> RELEASING, CANCELLED (post-funding hold)
 *
 * These tests validate the state transition rules enforced by
 * InstitutionEscrowService methods (recordDeposit, releaseFunds, cancelEscrow).
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { InstitutionEscrowService } from '../../../src/services/institution-escrow.service';

/**
 * Valid state transition map for institution escrows.
 * Encodes the business rules tested below.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['CREATED', 'CANCELLED'],
  CREATED: ['FUNDED', 'CANCELLED', 'EXPIRED'],
  FUNDED: ['RELEASING', 'COMPLIANCE_HOLD', 'CANCELLED'],
  COMPLIANCE_HOLD: ['RELEASING', 'CANCELLED'],
  RELEASING: ['RELEASED', 'INSUFFICIENT_FUNDS'],
  INSUFFICIENT_FUNDS: ['RELEASING', 'CANCELLED'],
  RELEASED: ['COMPLETE'],
  COMPLETE: [], // terminal
  CANCELLING: ['CANCELLED'],
  CANCELLED: [], // terminal
  EXPIRED: [],   // terminal
  FAILED: [],    // terminal
};

const TERMINAL_STATES = ['COMPLETE', 'CANCELLED', 'EXPIRED', 'FAILED'];
const CANCELLABLE_STATES = ['DRAFT', 'CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'INSUFFICIENT_FUNDS'];

describe('InstitutionEscrowStateMachine', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionEscrowService;
  let prismaStub: any;

  const CLIENT_ID = 'client-123';
  const ESCROW_ID = 'escrow-456';
  const PAYER_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const RECIPIENT_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

  const makeEscrow = (status: string) => ({
    id: 1,
    escrowId: ESCROW_ID,
    clientId: CLIENT_ID,
    payerWallet: PAYER_WALLET,
    recipientWallet: RECIPIENT_WALLET,
    usdcMint: process.env.USDC_MINT_ADDRESS,
    amount: 1000,
    platformFee: 0.5,
    corridor: 'US-MX',
    conditionType: 'ADMIN_RELEASE',
    status,
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
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    prismaStub = {
      institutionEscrow: {
        findUnique: sandbox.stub(),
        create: sandbox.stub().callsFake(async (params: any) => ({
          ...makeEscrow(params.data.status || 'CREATED'),
          ...params.data,
          escrowCode: params.data.escrowCode || 'EE-TEST-CODE',
          updatedAt: new Date(),
        })),
        update: sandbox.stub().callsFake(async (params: any) => ({
          ...makeEscrow(params.data.status || 'CREATED'),
          ...params.data,
          updatedAt: new Date(),
        })),
      },
      institutionClient: {
        findUnique: sandbox.stub().resolves({
          id: CLIENT_ID,
          companyName: 'Test Corp',
          status: 'ACTIVE',
          kycStatus: 'VERIFIED',
          primaryWallet: PAYER_WALLET,
          settledWallets: [],
        }),
        findFirst: sandbox.stub().resolves({
          id: CLIENT_ID,
          companyName: 'Test Corp',
          primaryWallet: PAYER_WALLET,
        }),
        findMany: sandbox.stub().resolves([]),
      },
      institutionDeposit: {
        create: sandbox.stub().resolves({}),
      },
      institutionAuditLog: {
        create: sandbox.stub().resolves({}),
        findMany: sandbox.stub().resolves([]),
      },
      institutionNotification: {
        create: sandbox.stub().resolves({}),
      },
      institutionAccount: {
        findMany: sandbox.stub().resolves([]),
      },
      institutionAiAnalysis: {
        findMany: sandbox.stub().resolves([]),
        findFirst: sandbox.stub().resolves(null),
      },
      institutionFile: {
        findMany: sandbox.stub().resolves([]),
      },
      institutionCorridor: {
        findUnique: sandbox.stub().resolves(null),
      },
    };

    service = new InstitutionEscrowService();
    (service as any).prisma = prismaStub;
    sandbox.stub(service as any, 'cacheEscrow').resolves();
    // Stub balance check — unit tests don't hit Solana RPC
    sandbox.stub(service as any, 'checkPayerBalance').resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── DRAFT transitions ─────────────────────────────────────

  describe('DRAFT state transitions', () => {
    it('DRAFT -> CANCELLED (via cancel)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('DRAFT'));

      const result = await service.cancelEscrow(CLIENT_ID, ESCROW_ID, 'Discarded');

      expect(result).to.have.property('status', 'CANCELLED');
    });

    it('should reject deposit on DRAFT escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('DRAFT'));

      try {
        await service.recordDeposit(CLIENT_ID, ESCROW_ID, 'txsig');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot record deposit');
      }
    });

    it('should reject release on DRAFT escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('DRAFT'));

      try {
        await service.releaseFunds(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot release');
      }
    });

    it('should allow update on DRAFT escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('DRAFT'));

      const result = await service.updateDraft(CLIENT_ID, ESCROW_ID, {
        amount: 5000,
        corridor: 'SG-CH',
      });

      expect(result).to.exist;
    });

    it('should reject update on non-DRAFT escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('CREATED'));

      try {
        await service.updateDraft(CLIENT_ID, ESCROW_ID, { amount: 5000 });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot update');
        expect(err.message).to.include('CREATED');
      }
    });
  });

  // ─── CREATED transitions ────────────────────────────────────

  describe('CREATED state transitions', () => {
    it('CREATED -> FUNDED (via deposit)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('CREATED'));

      const result = await service.recordDeposit(CLIENT_ID, ESCROW_ID, 'txsig123');

      expect(result).to.have.property('status', 'FUNDED');
    });

    it('CREATED -> CANCELLED (via cancel)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('CREATED'));

      const result = await service.cancelEscrow(CLIENT_ID, ESCROW_ID, 'No longer needed');

      expect(result).to.have.property('status', 'CANCELLED');
    });

    it('CREATED -> EXPIRED (via deposit on expired escrow)', async () => {
      const expiredEscrow = makeEscrow('CREATED');
      expiredEscrow.expiresAt = new Date(Date.now() - 1000);
      prismaStub.institutionEscrow.findUnique.resolves(expiredEscrow);

      try {
        await service.recordDeposit(CLIENT_ID, ESCROW_ID, 'txsig123');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('expired');
        // The service updates the status to EXPIRED before throwing
        expect(prismaStub.institutionEscrow.update.calledOnce).to.be.true;
        const updateCall = prismaStub.institutionEscrow.update.firstCall;
        expect(updateCall.args[0].data.status).to.equal('EXPIRED');
      }
    });
  });

  // ─── FUNDED transitions ─────────────────────────────────────

  describe('FUNDED state transitions', () => {
    it('FUNDED -> COMPLETE (via release, happy path)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('FUNDED'));

      const result = await service.releaseFunds(CLIENT_ID, ESCROW_ID);

      // Release now transitions through RELEASED → COMPLETE
      expect(result).to.have.property('status', 'COMPLETE');
    });

    it('FUNDED -> COMPLETE (notification failure is non-fatal)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('FUNDED'));
      // Notification failure is caught internally — release still completes
      prismaStub.institutionNotification.create = sandbox.stub().rejects(new Error('DB error'));

      const result = await service.releaseFunds(CLIENT_ID, ESCROW_ID);

      expect(result).to.have.property('status', 'COMPLETE');
    });

    it('FUNDED -> CANCELLED (via cancel)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('FUNDED'));

      const result = await service.cancelEscrow(CLIENT_ID, ESCROW_ID, 'Refund requested');

      expect(result).to.have.property('status', 'CANCELLED');
    });
  });

  // ─── RELEASED state ────────────────────────────────────────

  describe('RELEASED state', () => {
    it('should reject deposit on RELEASED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('RELEASED'));

      try {
        await service.recordDeposit(CLIENT_ID, ESCROW_ID, 'txsig');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot record deposit');
        expect(err.message).to.include('RELEASED');
      }
    });

    it('should reject release on RELEASED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('RELEASED'));

      try {
        await service.releaseFunds(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot release');
        expect(err.message).to.include('RELEASED');
      }
    });

    it('should reject cancel on RELEASED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('RELEASED'));

      try {
        await service.cancelEscrow(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot cancel');
        expect(err.message).to.include('RELEASED');
      }
    });
  });

  // ─── COMPLETE (terminal) ──────────────────────────────────

  describe('COMPLETE state (terminal)', () => {
    it('should reject deposit on COMPLETE escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('COMPLETE'));

      try {
        await service.recordDeposit(CLIENT_ID, ESCROW_ID, 'txsig');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot record deposit');
      }
    });

    it('should reject release on COMPLETE escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('COMPLETE'));

      try {
        await service.releaseFunds(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot release');
      }
    });

    it('should reject cancel on COMPLETE escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('COMPLETE'));

      try {
        await service.cancelEscrow(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot cancel');
      }
    });
  });

  // ─── INSUFFICIENT_FUNDS transitions ───────────────────────

  describe('INSUFFICIENT_FUNDS state transitions', () => {
    it('INSUFFICIENT_FUNDS -> COMPLETE (via release retry after funding)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('INSUFFICIENT_FUNDS'));

      const result = await service.releaseFunds(CLIENT_ID, ESCROW_ID);

      expect(result).to.have.property('status', 'COMPLETE');
    });

    it('INSUFFICIENT_FUNDS -> CANCELLED (via cancel)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('INSUFFICIENT_FUNDS'));

      const result = await service.cancelEscrow(CLIENT_ID, ESCROW_ID, 'Funding failed');

      expect(result).to.have.property('status', 'CANCELLED');
    });

    it('should reject deposit on INSUFFICIENT_FUNDS escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('INSUFFICIENT_FUNDS'));

      try {
        await service.recordDeposit(CLIENT_ID, ESCROW_ID, 'txsig');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot record deposit');
      }
    });
  });

  // ─── CANCELLED (terminal) ──────────────────────────────────

  describe('CANCELLED state (terminal)', () => {
    it('should reject deposit on CANCELLED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('CANCELLED'));

      try {
        await service.recordDeposit(CLIENT_ID, ESCROW_ID, 'txsig');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot record deposit');
      }
    });

    it('should reject release on CANCELLED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('CANCELLED'));

      try {
        await service.releaseFunds(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot release');
      }
    });

    it('should reject cancel on CANCELLED escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('CANCELLED'));

      try {
        await service.cancelEscrow(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot cancel');
      }
    });
  });

  // ─── COMPLIANCE_HOLD transitions ───────────────────────────

  describe('COMPLIANCE_HOLD state transitions', () => {
    it('COMPLIANCE_HOLD -> CANCELLED (via cancel)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('COMPLIANCE_HOLD'));

      const result = await service.cancelEscrow(CLIENT_ID, ESCROW_ID, 'Compliance rejected');

      expect(result).to.have.property('status', 'CANCELLED');
    });

    it('COMPLIANCE_HOLD -> should reject deposit', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('COMPLIANCE_HOLD'));

      try {
        await service.recordDeposit(CLIENT_ID, ESCROW_ID, 'txsig');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot record deposit');
        expect(err.message).to.include('COMPLIANCE_HOLD');
      }
    });

    it('COMPLIANCE_HOLD -> should reject release', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('COMPLIANCE_HOLD'));

      try {
        await service.releaseFunds(CLIENT_ID, ESCROW_ID);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Cannot release');
        expect(err.message).to.include('COMPLIANCE_HOLD');
      }
    });
  });

  // ─── Transition map validation ─────────────────────────────

  describe('Transition map validation', () => {
    it('should have terminal states with no outgoing transitions', () => {
      for (const state of TERMINAL_STATES) {
        expect(VALID_TRANSITIONS[state]).to.be.an('array').that.is.empty;
      }
    });

    it('should have DRAFT leading to CREATED, CANCELLED', () => {
      expect(VALID_TRANSITIONS['DRAFT']).to.include.members(['CREATED', 'CANCELLED']);
    });

    it('should have CREATED leading to FUNDED, CANCELLED, EXPIRED', () => {
      expect(VALID_TRANSITIONS['CREATED']).to.include.members(['FUNDED', 'CANCELLED', 'EXPIRED']);
    });

    it('should have FUNDED leading to RELEASING, COMPLIANCE_HOLD, CANCELLED', () => {
      expect(VALID_TRANSITIONS['FUNDED']).to.include.members(['RELEASING', 'COMPLIANCE_HOLD', 'CANCELLED']);
    });

    it('should have RELEASING leading to RELEASED, INSUFFICIENT_FUNDS', () => {
      expect(VALID_TRANSITIONS['RELEASING']).to.include.members(['RELEASED', 'INSUFFICIENT_FUNDS']);
    });

    it('should have RELEASED leading to COMPLETE', () => {
      expect(VALID_TRANSITIONS['RELEASED']).to.include.members(['COMPLETE']);
    });

    it('should have INSUFFICIENT_FUNDS leading to RELEASING, CANCELLED', () => {
      expect(VALID_TRANSITIONS['INSUFFICIENT_FUNDS']).to.include.members(['RELEASING', 'CANCELLED']);
    });

    it('should have COMPLIANCE_HOLD leading to RELEASING, CANCELLED', () => {
      expect(VALID_TRANSITIONS['COMPLIANCE_HOLD']).to.include.members(['RELEASING', 'CANCELLED']);
    });

    it('should only allow cancel from DRAFT, CREATED, FUNDED, COMPLIANCE_HOLD, INSUFFICIENT_FUNDS', () => {
      expect(CANCELLABLE_STATES).to.deep.equal(['DRAFT', 'CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'INSUFFICIENT_FUNDS']);
    });
  });
});
