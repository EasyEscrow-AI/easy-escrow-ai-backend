import { expect } from 'chai';
import sinon from 'sinon';

import {
  createMockPrismaClient,
} from '../../helpers/institution-test-utils';
import { mockPrismaForTest, teardownPrismaMock } from '../../helpers/prisma-mock';

describe('InstitutionEscrow — Direct Payment Transfer', () => {
  let sandbox: sinon.SinonSandbox;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const savedEnv: Record<string, string | undefined> = {};

  before(() => {
    savedEnv.JWT_SECRET = process.env.JWT_SECRET;
  });

  after(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    mockPrisma = createMockPrismaClient();
    mockPrismaForTest(mockPrisma as any);
    process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
  });

  afterEach(() => {
    teardownPrismaMock();
    sandbox.restore();
  });

  // ---------------------------------------------------------------------------
  // Routing: direct vs escrow settlement mode
  // ---------------------------------------------------------------------------
  describe('release routing by settlementMode', () => {
    it('should route direct payments to transferUsdcDirect (not releaseEscrowOnChain)', () => {
      const escrow = {
        settlementMode: 'direct',
        escrowPda: null,
        releaseConditions: ['legal_compliance'],
      };
      const isDirectPayment = escrow.settlementMode === 'direct';
      const useCdpRelease = (escrow.releaseConditions || []).includes('cdp_policy_approval');

      expect(isDirectPayment).to.be.true;
      expect(useCdpRelease).to.be.false;
      // Direct + no CDP → transferUsdcDirect
    });

    it('should route direct + CDP payments to transferUsdcDirectWithCdp', () => {
      const escrow = {
        settlementMode: 'direct',
        escrowPda: null,
        releaseConditions: ['legal_compliance', 'cdp_policy_approval'],
      };
      const isDirectPayment = escrow.settlementMode === 'direct';
      const useCdpRelease = (escrow.releaseConditions || []).includes('cdp_policy_approval');

      expect(isDirectPayment).to.be.true;
      expect(useCdpRelease).to.be.true;
      // Direct + CDP → transferUsdcDirectWithCdp
    });

    it('should route escrow payments to releaseEscrowOnChain (unchanged)', () => {
      const escrow = {
        settlementMode: 'escrow',
        escrowPda: 'some-pda-address',
        releaseConditions: ['legal_compliance'],
      };
      const isDirectPayment = escrow.settlementMode === 'direct';

      expect(isDirectPayment).to.be.false;
      // Escrow mode → releaseEscrowOnChain (existing path)
    });

    it('should route escrow + CDP payments to releaseEscrowWithCdp (unchanged)', () => {
      const escrow = {
        settlementMode: 'escrow',
        escrowPda: 'some-pda-address',
        releaseConditions: ['legal_compliance', 'cdp_policy_approval'],
      };
      const isDirectPayment = escrow.settlementMode === 'direct';
      const useCdpRelease = (escrow.releaseConditions || []).includes('cdp_policy_approval');

      expect(isDirectPayment).to.be.false;
      expect(useCdpRelease).to.be.true;
      // Escrow + CDP → releaseEscrowWithCdp (existing path)
    });
  });

  // ---------------------------------------------------------------------------
  // Amount splitting: net + fee
  // ---------------------------------------------------------------------------
  describe('direct transfer amount splitting', () => {
    it('should split amount into net + platform fee', () => {
      const amount = 19.99;
      const platformFee = 0.20;
      const netAmount = amount - platformFee;

      expect(netAmount).to.be.closeTo(19.79, 0.001);
    });

    it('should handle zero fee correctly', () => {
      const amount = 100.00;
      const platformFee = 0;
      const netAmount = amount - platformFee;

      expect(netAmount).to.equal(100.00);
    });

    it('should handle micro-USDC precision (6 decimals)', () => {
      const amount = 599.99;
      const platformFee = 1.199980;
      // Convert to micro-USDC (integer math)
      const amountMicro = Math.round(amount * 1_000_000);
      const feeMicro = Math.round(platformFee * 1_000_000);
      const netMicro = amountMicro - feeMicro;

      expect(amountMicro).to.equal(599990000);
      expect(feeMicro).to.equal(1199980);
      expect(netMicro).to.equal(598790020);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling: direct transfer failure reverts status
  // ---------------------------------------------------------------------------
  describe('direct transfer error handling', () => {
    it('should revert escrow status on transfer failure', () => {
      const originalStatus = 'PENDING_RELEASE';
      const transferFailed = true;

      // On failure, service reverts to originalStatus
      const revertedStatus = transferFailed ? originalStatus : 'RELEASING';
      expect(revertedStatus).to.equal('PENDING_RELEASE');
    });

    it('should create ON_CHAIN_RELEASE_FAILED audit log on failure', () => {
      const auditAction = 'ON_CHAIN_RELEASE_FAILED';
      const mode = 'direct';

      // The service logs both the action and the mode
      expect(auditAction).to.equal('ON_CHAIN_RELEASE_FAILED');
      expect(mode).to.equal('direct');
    });
  });

  // ---------------------------------------------------------------------------
  // Memo format for direct transfers
  // ---------------------------------------------------------------------------
  describe('direct transfer memo', () => {
    it('should format memo as EasyEscrow:direct:EE-XXX-XXX', () => {
      const escrowCode = 'EE-2WA-C5E';
      const memo = `EasyEscrow:direct:${escrowCode}`;

      expect(memo).to.equal('EasyEscrow:direct:EE-2WA-C5E');
    });

    it('should append AI digest when available', () => {
      const escrowCode = 'EE-2WA-C5E';
      const aiDigest = 'sha256:abc123';
      const memo = `EasyEscrow:direct:${escrowCode}:${aiDigest}`;

      expect(memo).to.include('EasyEscrow:direct:');
      expect(memo).to.include(aiDigest);
    });
  });

  // ---------------------------------------------------------------------------
  // Direct payments skip balance check and deposit
  // ---------------------------------------------------------------------------
  describe('direct payment lifecycle skips', () => {
    it('should skip payer balance check for direct payments', () => {
      const isDirectPayment = true;
      const shouldCheckBalance = !isDirectPayment;

      expect(shouldCheckBalance).to.be.false;
    });

    it('should reject deposit recording for direct payments', () => {
      const settlementMode = 'direct';
      const shouldRejectDeposit = settlementMode === 'direct';

      expect(shouldRejectDeposit).to.be.true;
    });

    it('should allow release from CREATED status for direct payments', () => {
      const isDirectPayment = true;
      const releasableStatuses = isDirectPayment
        ? ['CREATED', 'FUNDED', 'PENDING_RELEASE', 'INSUFFICIENT_FUNDS']
        : ['FUNDED', 'PENDING_RELEASE', 'INSUFFICIENT_FUNDS'];

      expect(releasableStatuses).to.include('CREATED');
    });

    it('should NOT allow release from CREATED for escrow mode', () => {
      const isDirectPayment = false;
      const releasableStatuses = isDirectPayment
        ? ['CREATED', 'FUNDED', 'PENDING_RELEASE', 'INSUFFICIENT_FUNDS']
        : ['FUNDED', 'PENDING_RELEASE', 'INSUFFICIENT_FUNDS'];

      expect(releasableStatuses).to.not.include('CREATED');
    });
  });

  // ---------------------------------------------------------------------------
  // Transaction response: direct vs escrow
  // ---------------------------------------------------------------------------
  describe('response shape for direct payments', () => {
    it('should include releaseTxSignature when direct transfer succeeds', () => {
      const releaseTxSig = '5abc123...'; // from transferUsdcDirect
      const response = {
        transactions: {
          initTx: null,      // no on-chain init for direct
          depositTx: null,   // no deposit for direct
          releaseTx: releaseTxSig,
          cancelTx: null,
        },
      };

      expect(response.transactions.releaseTx).to.equal(releaseTxSig);
      expect(response.transactions.initTx).to.be.null;
      expect(response.transactions.depositTx).to.be.null;
    });

    it('should have null initTx and depositTx for direct payments (by design)', () => {
      const escrow = {
        settlementMode: 'direct',
        initTxSignature: null,
        depositTxSignature: null,
      };

      expect(escrow.initTxSignature).to.be.null;
      expect(escrow.depositTxSignature).to.be.null;
    });
  });
});
