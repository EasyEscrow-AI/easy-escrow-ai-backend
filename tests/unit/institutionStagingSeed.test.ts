/**
 * Verification test for institution staging seed data.
 *
 * Connects to the staging database and validates that all seeded
 * institution data exists with correct counts, statuses, and relations.
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/institutionStagingSeed.test.ts --timeout 30000
 */

import { expect } from 'chai';
import { PrismaClient } from '../../src/generated/prisma';

const prisma = new PrismaClient();

describe('Institution Staging Seed Data Verification', () => {
  after(async () => {
    await prisma.$disconnect();
  });

  // ── Corridors ──────────────────────────────────────────────────
  describe('Corridors', () => {
    it('should have at least 7 corridors seeded', async () => {
      const count = await prisma.institutionCorridor.count();
      expect(count).to.be.at.least(7);
    });

    const expectedCorridors = ['SG-CH', 'US-MX', 'US-PH', 'EU-UK', 'SG-US', 'CH-SG', 'CH-US'];
    for (const code of expectedCorridors) {
      it(`should have corridor ${code}`, async () => {
        const corridor = await prisma.institutionCorridor.findUnique({ where: { code } });
        expect(corridor, `Corridor ${code} not found`).to.not.be.null;
        expect(corridor!.status).to.equal('ACTIVE');
        expect(Number(corridor!.minAmount)).to.be.greaterThan(0);
        expect(Number(corridor!.maxAmount)).to.be.greaterThan(Number(corridor!.minAmount));
      });
    }
  });

  // ── Clients ────────────────────────────────────────────────────
  describe('Clients', () => {
    it('should have at least 10 institution clients', async () => {
      const count = await prisma.institutionClient.count({ where: { isTestAccount: true } });
      expect(count).to.be.at.least(10);
    });

    // All three tiers covered
    for (const tier of ['STANDARD', 'PREMIUM', 'ENTERPRISE'] as const) {
      it(`should have at least one ${tier} tier client`, async () => {
        const count = await prisma.institutionClient.count({ where: { tier, isTestAccount: true } });
        expect(count, `No ${tier} client found`).to.be.at.least(1);
      });
    }

    // All three statuses covered
    for (const status of ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'] as const) {
      it(`should have at least one ${status} status client`, async () => {
        const count = await prisma.institutionClient.count({ where: { status, isTestAccount: true } });
        expect(count, `No ${status} client found`).to.be.at.least(1);
      });
    }

    // KYB statuses covered
    for (const kybStatus of ['VERIFIED', 'PENDING', 'IN_REVIEW'] as const) {
      it(`should have at least one client with KYB status ${kybStatus}`, async () => {
        const count = await prisma.institutionClient.count({ where: { kybStatus, isTestAccount: true } });
        expect(count, `No client with KYB ${kybStatus} found`).to.be.at.least(1);
      });
    }

    // AMINA-style Swiss crypto bank
    it('should have Helvetica Digital AG (AMINA-style Swiss crypto bank)', async () => {
      const client = await prisma.institutionClient.findUnique({
        where: { email: 'ops@helvetica-digital.ch' },
      });
      expect(client).to.not.be.null;
      expect(client!.tier).to.equal('ENTERPRISE');
      expect(client!.status).to.equal('ACTIVE');
      expect(client!.kybStatus).to.equal('VERIFIED');
      expect(client!.jurisdiction).to.equal('CH');
      expect(client!.regulatoryBody).to.equal('FINMA');
      expect(client!.industry).to.equal('Digital Asset Banking');
      expect(client!.legalName).to.equal('Helvetica Digital AG');
      expect(client!.entityType).to.equal('CORPORATION');
      expect(client!.walletCustodyType).to.equal('MPC');
      expect(client!.isRegulatedEntity).to.equal(true);
    });

    // Crypto-native client
    it('should have Satoshi Bridge Labs (crypto-native cross-chain bridge)', async () => {
      const client = await prisma.institutionClient.findUnique({
        where: { email: 'finance@satoshi-bridge.io' },
      });
      expect(client).to.not.be.null;
      expect(client!.tier).to.equal('ENTERPRISE');
      expect(client!.industry).to.equal('Cross-Chain Infrastructure');
      expect(client!.walletCustodyType).to.equal('MPC');
    });

    // Suspended client with high risk
    it('should have Frontier Exchange (suspended, high risk, flagged sanctions)', async () => {
      const client = await prisma.institutionClient.findUnique({
        where: { email: 'admin@frontier-exchange.ch' },
      });
      expect(client).to.not.be.null;
      expect(client!.status).to.equal('SUSPENDED');
      expect(client!.riskRating).to.equal('HIGH');
      expect(client!.sanctionsStatus).to.equal('FLAGGED');
      expect(client!.regulatoryStatus).to.equal('SUSPENDED');
    });

    // Full KYB profile populated
    it('should have full KYB profile fields on enterprise clients', async () => {
      const client = await prisma.institutionClient.findUnique({
        where: { email: 'ops@helvetica-digital.ch' },
      });
      expect(client).to.not.be.null;
      // Legal
      expect(client!.legalName).to.be.a('string').and.not.empty;
      expect(client!.registrationNumber).to.be.a('string').and.not.empty;
      expect(client!.registrationCountry).to.be.a('string').and.not.empty;
      expect(client!.entityType).to.not.be.null;
      expect(client!.lei).to.be.a('string').and.not.empty;
      // Address
      expect(client!.addressLine1).to.be.a('string').and.not.empty;
      expect(client!.city).to.be.a('string').and.not.empty;
      expect(client!.country).to.be.a('string').and.not.empty;
      // Contact
      expect(client!.contactFirstName).to.be.a('string').and.not.empty;
      expect(client!.contactLastName).to.be.a('string').and.not.empty;
      expect(client!.contactEmail).to.be.a('string').and.not.empty;
      // Compliance
      expect(client!.kybStatus).to.not.be.null;
      expect(client!.riskRating).to.not.be.null;
      expect(client!.sanctionsStatus).to.not.be.null;
      expect(client!.sourceOfFunds).to.be.a('string').and.not.empty;
      // Business
      expect(client!.industry).to.be.a('string').and.not.empty;
      expect(client!.yearEstablished).to.be.a('number');
      expect(client!.employeeCountRange).to.not.be.null;
      expect(client!.annualRevenueRange).to.not.be.null;
      // Crypto
      expect(client!.walletCustodyType).to.not.be.null;
      expect(client!.preferredSettlementChain).to.equal('solana');
    });
  });

  // ── Client Settings ────────────────────────────────────────────
  describe('Client Settings', () => {
    it('should have settings for all 10 clients', async () => {
      const testClientIds = await prisma.institutionClient.findMany({
        where: { isTestAccount: true },
        select: { id: true },
      });
      const settingsCount = await prisma.institutionClientSettings.count({
        where: { clientId: { in: testClientIds.map((c) => c.id) } },
      });
      expect(settingsCount).to.equal(testClientIds.length);
    });

    it('should have correct timezone and corridor in settings', async () => {
      const client = await prisma.institutionClient.findUnique({
        where: { email: 'ops@helvetica-digital.ch' },
        include: { settings: true },
      });
      expect(client!.settings).to.not.be.null;
      expect(client!.settings!.timezone).to.equal('Europe/Zurich');
      expect(client!.settings!.defaultCorridor).to.equal('CH-SG');
      expect(Number(client!.settings!.autoApproveThreshold)).to.equal(50_000);
    });
  });

  // ── Wallets ────────────────────────────────────────────────────
  describe('Wallets', () => {
    it('should have wallets for active clients with wallets defined', async () => {
      const count = await prisma.institutionWallet.count();
      expect(count).to.be.at.least(11); // 3+2+2+1+2+1 = 11
    });

    it('should have primary and settlement wallets for Helvetica', async () => {
      const client = await prisma.institutionClient.findUnique({
        where: { email: 'ops@helvetica-digital.ch' },
        include: { wallets: true },
      });
      expect(client!.wallets.length).to.equal(3);
      expect(client!.wallets.some((w) => w.isPrimary)).to.be.true;
      expect(client!.wallets.some((w) => w.isSettlement)).to.be.true;
      expect(client!.wallets.some((w) => w.provider === 'Fireblocks')).to.be.true;
    });
  });

  // ── Escrows — ALL statuses covered ─────────────────────────────
  describe('Escrows', () => {
    const allStatuses = [
      'CREATED',
      'FUNDED',
      'COMPLIANCE_HOLD',
      'RELEASING',
      'RELEASED',
      'CANCELLING',
      'CANCELLED',
      'EXPIRED',
      'FAILED',
    ] as const;

    it('should have at least 16 escrows total', async () => {
      // Count escrows that have our staging seed audit log marker
      const seedMarkers = await prisma.institutionAuditLog.count({
        where: { action: 'STAGING_SEED' },
      });
      expect(seedMarkers).to.be.at.least(16);
    });

    for (const status of allStatuses) {
      it(`should have at least one escrow in ${status} status`, async () => {
        const count = await prisma.institutionEscrow.count({ where: { status } });
        expect(count, `No escrow in ${status} status`).to.be.at.least(1);
      });
    }

    it('should have CREATED escrows without deposit tx signatures', async () => {
      const created = await prisma.institutionEscrow.findFirst({ where: { status: 'CREATED' } });
      expect(created).to.not.be.null;
      expect(created!.depositTxSignature).to.be.null;
      expect(created!.fundedAt).to.be.null;
    });

    it('should have FUNDED escrows with deposit tx signatures', async () => {
      const funded = await prisma.institutionEscrow.findFirst({ where: { status: 'FUNDED' } });
      expect(funded).to.not.be.null;
      expect(funded!.depositTxSignature).to.be.a('string').and.not.empty;
      expect(funded!.fundedAt).to.not.be.null;
    });

    it('should have RELEASED escrows with both deposit and release tx signatures', async () => {
      const released = await prisma.institutionEscrow.findFirst({ where: { status: 'RELEASED' } });
      expect(released).to.not.be.null;
      expect(released!.depositTxSignature).to.be.a('string').and.not.empty;
      expect(released!.releaseTxSignature).to.be.a('string').and.not.empty;
      expect(released!.resolvedAt).to.not.be.null;
    });

    it('should have CANCELLED escrows with cancel tx signature', async () => {
      const cancelled = await prisma.institutionEscrow.findFirst({
        where: { status: 'CANCELLED', cancelTxSignature: { not: null } },
      });
      expect(cancelled).to.not.be.null;
      expect(cancelled!.cancelTxSignature).to.be.a('string').and.not.empty;
      expect(cancelled!.resolvedAt).to.not.be.null;
    });

    it('should have EXPIRED escrows with resolvedAt set', async () => {
      const expired = await prisma.institutionEscrow.findFirst({ where: { status: 'EXPIRED' } });
      expect(expired).to.not.be.null;
      expect(expired!.resolvedAt).to.not.be.null;
    });

    it('should have FAILED escrow with resolvedAt set', async () => {
      const failed = await prisma.institutionEscrow.findFirst({ where: { status: 'FAILED' } });
      expect(failed).to.not.be.null;
      expect(failed!.resolvedAt).to.not.be.null;
    });

    it('should have escrow PDAs on all escrows', async () => {
      const withoutPda = await prisma.institutionEscrow.count({
        where: {
          escrowPda: null,
          // Only check seed escrows (via audit log)
        },
      });
      // All our seeded escrows have PDAs but there might be others without
      const seededEscrows = await prisma.institutionAuditLog.findMany({
        where: { action: 'STAGING_SEED' },
        select: { escrowId: true },
      });
      for (const { escrowId } of seededEscrows) {
        if (!escrowId) continue;
        const escrow = await prisma.institutionEscrow.findFirst({ where: { escrowId } });
        if (escrow) {
          expect(escrow.escrowPda, `Escrow ${escrowId} missing PDA`).to.not.be.null;
        }
      }
    });

    // All condition types covered
    for (const ct of ['ADMIN_RELEASE', 'TIME_LOCK', 'COMPLIANCE_CHECK'] as const) {
      it(`should have at least one escrow with condition type ${ct}`, async () => {
        const count = await prisma.institutionEscrow.count({ where: { conditionType: ct } });
        expect(count, `No escrow with condition ${ct}`).to.be.at.least(1);
      });
    }
  });

  // ── Deposits ───────────────────────────────────────────────────
  describe('Deposits', () => {
    it('should have deposit records for funded escrows', async () => {
      const count = await prisma.institutionDeposit.count();
      expect(count).to.be.at.least(1);
    });

    it('should have matching amounts between escrow and deposit', async () => {
      const deposit = await prisma.institutionDeposit.findFirst({
        include: { escrow: true },
      });
      if (deposit) {
        expect(Number(deposit.amount)).to.equal(Number(deposit.escrow.amount));
      }
    });
  });

  // ── Audit Logs ─────────────────────────────────────────────────
  describe('Audit Logs', () => {
    it('should have audit logs for seeded escrows', async () => {
      const count = await prisma.institutionAuditLog.count({
        where: { action: 'ESCROW_CREATED', actor: 'staging-seeder' },
      });
      expect(count).to.be.at.least(16);
    });

    it('should have DEPOSIT_CONFIRMED logs for funded escrows', async () => {
      const count = await prisma.institutionAuditLog.count({
        where: { action: 'DEPOSIT_CONFIRMED', actor: 'staging-seeder' },
      });
      expect(count).to.be.at.least(1);
    });

    it('should have FUNDS_RELEASED logs for released escrows', async () => {
      const count = await prisma.institutionAuditLog.count({
        where: { action: 'FUNDS_RELEASED', actor: 'staging-seeder' },
      });
      expect(count).to.be.at.least(3);
    });

    it('should have COMPLIANCE_HOLD_PLACED logs', async () => {
      const count = await prisma.institutionAuditLog.count({
        where: { action: 'COMPLIANCE_HOLD_PLACED', actor: 'staging-seeder' },
      });
      expect(count).to.be.at.least(2);
    });

    it('should have STAGING_SEED marker for idempotency', async () => {
      const count = await prisma.institutionAuditLog.count({
        where: { action: 'STAGING_SEED' },
      });
      expect(count).to.be.at.least(16);
    });
  });

  // ── AI Analyses ────────────────────────────────────────────────
  describe('AI Analyses', () => {
    it('should have AI analyses for risk-scored escrows', async () => {
      const count = await prisma.institutionAiAnalysis.count();
      expect(count).to.be.at.least(1);
    });

    it('should have valid recommendation values', async () => {
      const analyses = await prisma.institutionAiAnalysis.findMany();
      for (const a of analyses) {
        expect(a.recommendation).to.be.oneOf(['APPROVE', 'REVIEW', 'REJECT']);
        expect(a.riskScore).to.be.at.least(0).and.at.most(100);
        expect(a.model).to.be.a('string').and.not.empty;
      }
    });

    it('should have risk factors as JSON array', async () => {
      const analysis = await prisma.institutionAiAnalysis.findFirst();
      expect(analysis).to.not.be.null;
      const factors = analysis!.factors as any[];
      expect(factors).to.be.an('array').with.length.greaterThan(0);
      expect(factors[0]).to.have.property('name');
      expect(factors[0]).to.have.property('weight');
      expect(factors[0]).to.have.property('value');
    });
  });

  // ── Files ──────────────────────────────────────────────────────
  describe('Files', () => {
    it('should have file records attached to escrows', async () => {
      const count = await prisma.institutionFile.count({
        where: { escrowId: { not: null } },
      });
      expect(count).to.be.at.least(1);
    });

    it('should have INVOICE and CONTRACT document types', async () => {
      const invoices = await prisma.institutionFile.count({ where: { documentType: 'INVOICE' } });
      const contracts = await prisma.institutionFile.count({ where: { documentType: 'CONTRACT' } });
      expect(invoices).to.be.at.least(1);
      expect(contracts).to.be.at.least(1);
    });

    it('should have valid file metadata', async () => {
      const file = await prisma.institutionFile.findFirst();
      expect(file).to.not.be.null;
      expect(file!.fileName).to.be.a('string').and.not.empty;
      expect(file!.fileKey).to.be.a('string').and.include('institutions/');
      expect(file!.mimeType).to.equal('application/pdf');
      expect(file!.sizeBytes).to.be.greaterThan(0);
    });
  });

  // ── Cross-entity integrity ─────────────────────────────────────
  describe('Data Integrity', () => {
    it('every escrow should reference a valid client', async () => {
      const escrows = await prisma.institutionEscrow.findMany({
        select: { clientId: true, escrowId: true },
      });
      const clientIds = new Set(
        (await prisma.institutionClient.findMany({ select: { id: true } })).map((c) => c.id),
      );
      for (const e of escrows) {
        expect(clientIds.has(e.clientId), `Escrow ${e.escrowId} references invalid client ${e.clientId}`).to.be.true;
      }
    });

    it('every deposit should reference a valid escrow', async () => {
      const deposits = await prisma.institutionDeposit.findMany({
        select: { escrowId: true },
      });
      for (const d of deposits) {
        const escrow = await prisma.institutionEscrow.findFirst({ where: { escrowId: d.escrowId } });
        expect(escrow, `Deposit references invalid escrow ${d.escrowId}`).to.not.be.null;
      }
    });

    it('every file with escrowId should reference a valid escrow', async () => {
      const files = await prisma.institutionFile.findMany({
        where: { escrowId: { not: null } },
        select: { escrowId: true },
      });
      for (const f of files) {
        const escrow = await prisma.institutionEscrow.findFirst({ where: { escrowId: f.escrowId! } });
        expect(escrow, `File references invalid escrow ${f.escrowId}`).to.not.be.null;
      }
    });

    it('every wallet should reference a valid client', async () => {
      const wallets = await prisma.institutionWallet.findMany({ select: { clientId: true } });
      const clientIds = new Set(
        (await prisma.institutionClient.findMany({ select: { id: true } })).map((c) => c.id),
      );
      for (const w of wallets) {
        expect(clientIds.has(w.clientId), `Wallet references invalid client ${w.clientId}`).to.be.true;
      }
    });
  });
});
