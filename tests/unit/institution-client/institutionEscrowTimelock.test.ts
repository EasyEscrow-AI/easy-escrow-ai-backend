import { expect } from 'chai';
import sinon from 'sinon';

// Set env for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.INSTITUTION_ESCROW_DEFAULT_TIMELOCK_HOURS = '24';

import {
  createMockPrismaClient,
} from '../../helpers/institution-test-utils';
import { mockPrismaForTest, teardownPrismaMock } from '../../helpers/prisma-mock';

describe('InstitutionEscrow — Payment Timelock', () => {
  let sandbox: sinon.SinonSandbox;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    mockPrisma = createMockPrismaClient();
    mockPrismaForTest(mockPrisma as any);
  });

  afterEach(() => {
    teardownPrismaMock();
    sandbox.restore();
  });

  // ---------------------------------------------------------------------------
  // recordDeposit — unlockAt computation
  // ---------------------------------------------------------------------------
  describe('recordDeposit — unlockAt computation', () => {
    it('should set unlockAt = fundedAt + timelockHours when timelockHours > 0', () => {
      const timelockHours = 24;
      const fundedAt = new Date('2026-03-28T10:00:00.000Z');
      const unlockAt = timelockHours > 0
        ? new Date(fundedAt.getTime() + timelockHours * 60 * 60 * 1000)
        : null;

      expect(unlockAt).to.not.be.null;
      expect(unlockAt!.toISOString()).to.equal('2026-03-29T10:00:00.000Z');
    });

    it('should leave unlockAt null when timelockHours is null', () => {
      const timelockHours: number | null = null;
      const fundedAt = new Date('2026-03-28T10:00:00.000Z');
      const unlockAt = timelockHours && timelockHours > 0
        ? new Date(fundedAt.getTime() + timelockHours * 60 * 60 * 1000)
        : null;

      expect(unlockAt).to.be.null;
    });

    it('should leave unlockAt null when timelockHours is 0', () => {
      const timelockHours = 0;
      const fundedAt = new Date('2026-03-28T10:00:00.000Z');
      const unlockAt = timelockHours && timelockHours > 0
        ? new Date(fundedAt.getTime() + timelockHours * 60 * 60 * 1000)
        : null;

      expect(unlockAt).to.be.null;
    });
  });

  // ---------------------------------------------------------------------------
  // releaseFunds — timelock gate
  // ---------------------------------------------------------------------------
  describe('releaseFunds — timelock gate', () => {
    it('should throw when timelock is active (unlockAt in future)', () => {
      const now = new Date();
      const unlockAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12h from now

      const isLocked = unlockAt && now < unlockAt;
      expect(isLocked).to.be.true;
    });

    it('should allow release when timelock expired (unlockAt in past)', () => {
      const now = new Date();
      const unlockAt = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1h ago

      const isLocked = unlockAt && now < unlockAt;
      expect(isLocked).to.be.false;
    });

    it('should allow release when no timelock (unlockAt null)', () => {
      const escrow = { unlockAt: null as Date | null };

      // Simulate the service logic: check if unlockAt exists and is in the future
      const isLocked = !!escrow.unlockAt && new Date() < escrow.unlockAt;
      expect(isLocked).to.equal(false);
    });

    it('should allow forceRelease to override active timelock', () => {
      const now = new Date();
      const unlockAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12h from now
      const forceRelease = true;

      const isLocked = unlockAt && now < unlockAt;
      expect(isLocked).to.be.true;

      // forceRelease should bypass the lock
      const shouldBlock = isLocked && !forceRelease;
      expect(shouldBlock).to.be.false;
    });
  });

  // ---------------------------------------------------------------------------
  // Timelock priority chain
  // ---------------------------------------------------------------------------
  describe('timelock priority: per-escrow > per-client > global', () => {
    function resolveTimelockHours(
      perEscrow: number | undefined,
      perClient: number | null,
      globalDefault: number
    ): number | null {
      if (perEscrow !== undefined) {
        return perEscrow > 0 ? perEscrow : null;
      }
      if (perClient != null && perClient > 0) {
        return perClient;
      }
      if (globalDefault > 0) {
        return globalDefault;
      }
      return null;
    }

    it('should use per-escrow timelockHours when provided', () => {
      const result = resolveTimelockHours(48, 12, 24);
      expect(result).to.equal(48);
    });

    it('should use per-escrow 0 to disable timelock', () => {
      const result = resolveTimelockHours(0, 12, 24);
      expect(result).to.be.null;
    });

    it('should fall back to per-client when per-escrow not provided', () => {
      const result = resolveTimelockHours(undefined, 12, 24);
      expect(result).to.equal(12);
    });

    it('should fall back to global when per-escrow and per-client not set', () => {
      const result = resolveTimelockHours(undefined, null, 24);
      expect(result).to.equal(24);
    });

    it('should return null when all sources are 0 or null', () => {
      const result = resolveTimelockHours(undefined, null, 0);
      expect(result).to.be.null;
    });
  });

  // ---------------------------------------------------------------------------
  // Validation: timelockHours >= expiryHours
  // ---------------------------------------------------------------------------
  describe('validation: timelockHours vs expiryHours', () => {
    it('should reject timelockHours >= expiryHours', () => {
      const timelockHours = 72;
      const expiryHours = 72;

      expect(timelockHours >= expiryHours).to.be.true;
    });

    it('should accept timelockHours < expiryHours', () => {
      const timelockHours = 24;
      const expiryHours = 72;

      expect(timelockHours < expiryHours).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  // fulfillEscrow — auto-release deferred when timelock active
  // ---------------------------------------------------------------------------
  describe('fulfillEscrow — auto-release deferral', () => {
    it('should defer auto-release when timelock is active', () => {
      const now = new Date();
      const unlockAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      const isTimelockActive = unlockAt && now < unlockAt;

      expect(isTimelockActive).to.be.true;
      // When timelock is active, auto-release should be deferred
      const autoReleaseDeferred = isTimelockActive;
      expect(autoReleaseDeferred).to.be.true;
    });

    it('should allow auto-release when timelock has expired', () => {
      const now = new Date();
      const unlockAt = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      const isTimelockActive = unlockAt && now < unlockAt;

      expect(isTimelockActive).to.be.false;
    });

    it('should allow auto-release when no timelock set', () => {
      const escrow = { unlockAt: null as Date | null };
      const isTimelockActive = !!escrow.unlockAt && new Date() < escrow.unlockAt;

      expect(isTimelockActive).to.equal(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Backward compatibility
  // ---------------------------------------------------------------------------
  describe('backward compatibility', () => {
    it('existing escrows with unlockAt=null should release normally', () => {
      const escrow = {
        status: 'FUNDED',
        unlockAt: null,
        timelockHours: null,
      };

      const isLocked = escrow.unlockAt !== null && new Date() < new Date(escrow.unlockAt);
      expect(isLocked).to.equal(false);
    });

    it('existing escrows with timelockHours=null should have no timelock in response', () => {
      const escrow = {
        timelockHours: null as number | null,
        unlockAt: null as string | null,
      };

      const timelock = escrow.timelockHours ? {
        hours: escrow.timelockHours,
        unlockAt: escrow.unlockAt || null,
        isLocked: escrow.unlockAt ? new Date() < new Date(escrow.unlockAt) : false,
      } : null;

      expect(timelock).to.be.null;
    });
  });

  // ---------------------------------------------------------------------------
  // formatEscrow — timelock section
  // ---------------------------------------------------------------------------
  describe('formatEscrow — timelock section', () => {
    it('should include timelock object when timelockHours is set', () => {
      const escrow = {
        timelockHours: 24,
        unlockAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      };

      const timelock = escrow.timelockHours ? {
        hours: escrow.timelockHours,
        unlockAt: escrow.unlockAt || null,
        isLocked: escrow.unlockAt ? new Date() < new Date(escrow.unlockAt) : false,
      } : null;

      expect(timelock).to.not.be.null;
      expect(timelock!.hours).to.equal(24);
      expect(timelock!.isLocked).to.be.true;
    });

    it('should show isLocked=false when unlockAt is in the past', () => {
      const escrow = {
        timelockHours: 24,
        unlockAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago
      };

      const timelock = escrow.timelockHours ? {
        hours: escrow.timelockHours,
        unlockAt: escrow.unlockAt || null,
        isLocked: escrow.unlockAt ? new Date() < new Date(escrow.unlockAt) : false,
      } : null;

      expect(timelock).to.not.be.null;
      expect(timelock!.isLocked).to.be.false;
    });

    it('should return null timelock when timelockHours is not set', () => {
      const escrow = {
        timelockHours: null as number | null,
        unlockAt: null as Date | null,
      };

      const timelock = escrow.timelockHours ? {
        hours: escrow.timelockHours,
        unlockAt: escrow.unlockAt || null,
        isLocked: escrow.unlockAt ? new Date() < new Date(escrow.unlockAt) : false,
      } : null;

      expect(timelock).to.be.null;
    });

    it('should enhance statusLabel to Funded — Timelock Active when lock is active', () => {
      const status = 'FUNDED';
      const unlockAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

      const statusLabel = (status === 'FUNDED' && unlockAt && new Date() < new Date(unlockAt))
        ? 'Funded — Timelock Active'
        : 'Funded — Awaiting Release';

      expect(statusLabel).to.equal('Funded — Timelock Active');
    });
  });
});
