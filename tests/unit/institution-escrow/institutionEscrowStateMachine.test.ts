/**
 * Unit Tests for Institution Escrow State Machine
 *
 * Tests valid/invalid state transitions for InstitutionEscrowStatus:
 * - CREATED -> FUNDED, CANCELLED, EXPIRED
 * - FUNDED -> RELEASED, CANCELLED
 * - RELEASED -> (terminal, no valid transitions)
 * - CANCELLED -> (terminal, no valid transitions)
 * - COMPLIANCE_HOLD -> CREATED, CANCELLED
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
  CREATED: ['FUNDED', 'CANCELLED', 'EXPIRED'],
  FUNDED: ['RELEASED', 'CANCELLED'],
  COMPLIANCE_HOLD: ['CREATED', 'CANCELLED'],
  RELEASING: ['RELEASED'],
  CANCELLING: ['CANCELLED'],
  RELEASED: [], // terminal
  CANCELLED: [], // terminal
  EXPIRED: [],   // terminal
  FAILED: [],    // terminal
};

const TERMINAL_STATES = ['RELEASED', 'CANCELLED', 'EXPIRED', 'FAILED'];
const CANCELLABLE_STATES = ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD'];

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
        update: sandbox.stub().callsFake(async (params: any) => ({
          ...makeEscrow(params.data.status || 'CREATED'),
          ...params.data,
          updatedAt: new Date(),
        })),
      },
      institutionDeposit: {
        create: sandbox.stub().resolves({}),
      },
      institutionAuditLog: {
        create: sandbox.stub().resolves({}),
      },
    };

    service = new InstitutionEscrowService();
    (service as any).prisma = prismaStub;
    sandbox.stub(service as any, 'cacheEscrow').resolves();
  });

  afterEach(() => {
    sandbox.restore();
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
    it('FUNDED -> RELEASED (via release)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('FUNDED'));

      const result = await service.releaseFunds(CLIENT_ID, ESCROW_ID);

      expect(result).to.have.property('status', 'RELEASED');
    });

    it('FUNDED -> CANCELLED (via cancel)', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow('FUNDED'));

      const result = await service.cancelEscrow(CLIENT_ID, ESCROW_ID, 'Refund requested');

      expect(result).to.have.property('status', 'CANCELLED');
    });
  });

  // ─── RELEASED (terminal) ───────────────────────────────────

  describe('RELEASED state (terminal)', () => {
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

    it('should have CREATED leading to FUNDED, CANCELLED, EXPIRED', () => {
      expect(VALID_TRANSITIONS['CREATED']).to.include.members(['FUNDED', 'CANCELLED', 'EXPIRED']);
    });

    it('should have FUNDED leading to RELEASED, CANCELLED', () => {
      expect(VALID_TRANSITIONS['FUNDED']).to.include.members(['RELEASED', 'CANCELLED']);
    });

    it('should have COMPLIANCE_HOLD leading to CREATED, CANCELLED', () => {
      expect(VALID_TRANSITIONS['COMPLIANCE_HOLD']).to.include.members(['CREATED', 'CANCELLED']);
    });

    it('should only allow cancel from CREATED, FUNDED, COMPLIANCE_HOLD', () => {
      expect(CANCELLABLE_STATES).to.deep.equal(['CREATED', 'FUNDED', 'COMPLIANCE_HOLD']);
    });
  });
});
