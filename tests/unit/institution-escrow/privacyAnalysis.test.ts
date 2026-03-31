/**
 * Unit Tests for PrivacyAnalysisService
 *
 * Tests the 5 privacy checks: stealth address, PDA receipts,
 * encrypted custody, compliance audit trail, and pool shielding.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';

const testAdminKeypair = Keypair.generate();

const savedEnv = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  USDC_MINT_ADDRESS: process.env.USDC_MINT_ADDRESS,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  ESCROW_PROGRAM_ID: process.env.ESCROW_PROGRAM_ID,
  DEVNET_ADMIN_PRIVATE_KEY: process.env.DEVNET_ADMIN_PRIVATE_KEY,
};

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.ESCROW_PROGRAM_ID = 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei';
process.env.DEVNET_ADMIN_PRIVATE_KEY = bs58.encode(testAdminKeypair.secretKey);

import { PrivacyAnalysisService } from '../../../src/services/privacy-analysis.service';

after(() => {
  Object.assign(process.env, savedEnv);
});

describe('PrivacyAnalysisService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: PrivacyAnalysisService;
  let prismaStub: any;
  let connectionStub: any;
  let cacheStub: any;

  const CLIENT_ID = 'client-001';
  const ESCROW_ID = 'escrow-001';
  const ESCROW_CODE = 'EE-7UA-HGK';

  const makeEscrow = (overrides: Record<string, unknown> = {}) => ({
    escrowId: ESCROW_ID,
    escrowCode: ESCROW_CODE,
    clientId: CLIENT_ID,
    recipientWallet: Keypair.generate().publicKey.toBase58(),
    payerWallet: Keypair.generate().publicKey.toBase58(),
    stealthPaymentId: 'stealth-001',
    escrowPda: Keypair.generate().publicKey.toBase58(),
    vaultPda: Keypair.generate().publicKey.toBase58(),
    initTxSignature: 'initSig123',
    depositTxSignature: 'depositSig456',
    releaseTxSignature: 'releaseSig789',
    cancelTxSignature: null,
    riskScore: 12,
    poolId: null,
    privacyLevel: 'STEALTH',
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    service = new PrivacyAnalysisService();

    prismaStub = {
      institutionEscrow: {
        findUnique: sandbox.stub(),
        count: sandbox.stub(),
      },
      institutionAuditLog: {
        findMany: sandbox.stub(),
      },
      transactionPool: {
        findUnique: sandbox.stub(),
      },
    };
    (service as any).prisma = prismaStub;

    connectionStub = {
      getAccountInfo: sandbox.stub(),
      getTransaction: sandbox.stub(),
    };
    (service as any).connection = connectionStub;

    cacheStub = {
      get: sandbox.stub().resolves(null),
      set: sandbox.stub().resolves(true),
    };
    (service as any).cache = cacheStub;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('analyze', () => {
    it('should return 404 when escrow not found', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(null);

      try {
        await service.analyze(CLIENT_ID, ESCROW_CODE);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not found');
        expect(err.status).to.equal(404);
      }
    });

    it('should return 403 when client does not own escrow', async () => {
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow({ clientId: 'other-client' }));

      try {
        await service.analyze(CLIENT_ID, ESCROW_CODE);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Access denied');
        expect(err.status).to.equal(403);
      }
    });

    it('should return cached result if available', async () => {
      const cached = { escrowId: ESCROW_CODE, overallScore: 5, maxScore: 5 };
      prismaStub.institutionEscrow.findUnique.resolves(makeEscrow());
      cacheStub.get.resolves(cached);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result).to.deep.equal(cached);
    });

    it('should return all 5 checks with overallScore', async () => {
      const escrow = makeEscrow();
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      prismaStub.institutionEscrow.count.resolves(0); // no reuse
      prismaStub.institutionAuditLog.findMany.resolves([
        {
          id: 'audit-001',
          action: 'COMPLIANCE_SCREENING',
          details: { escrowId: ESCROW_ID, passed: true, riskScore: 12 },
        },
      ]);

      // RPC stubs
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100), owner: Keypair.generate().publicKey });
      connectionStub.getTransaction.resolves({ meta: { err: null } });

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);

      expect(result.escrowId).to.equal(ESCROW_CODE);
      expect(result.maxScore).to.equal(5);
      expect(result.checks).to.have.all.keys(
        'stealthAddress',
        'pdaReceipts',
        'encryptedCustody',
        'complianceAuditTrail',
        'transactionPoolShielding'
      );
      expect(result.analyzedAt).to.be.a('string');
      // Cache should be set
      expect(cacheStub.set.calledOnce).to.be.true;
    });
  });

  describe('checkStealthAddress', () => {
    it('should pass when stealth derived and not reused', async () => {
      const escrow = makeEscrow();
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      prismaStub.institutionEscrow.count.resolves(0);
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) });
      connectionStub.getTransaction.resolves({ meta: { err: null } });
      prismaStub.institutionAuditLog.findMany.resolves([]);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result.checks.stealthAddress.passed).to.be.true;
      expect(result.checks.stealthAddress.derivationVerified).to.be.true;
    });

    it('should fail when no stealth payment ID', async () => {
      const escrow = makeEscrow({ stealthPaymentId: null });
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) });
      connectionStub.getTransaction.resolves({ meta: { err: null } });
      prismaStub.institutionAuditLog.findMany.resolves([]);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result.checks.stealthAddress.passed).to.be.false;
      expect(result.checks.stealthAddress.detail).to.include('Standard wallet');
    });
  });

  describe('checkPdaReceipts', () => {
    it('should pass when PDA exists with encrypted metadata', async () => {
      const escrow = makeEscrow();
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      prismaStub.institutionEscrow.count.resolves(0);
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) });
      connectionStub.getTransaction.resolves({ meta: { err: null } });
      prismaStub.institutionAuditLog.findMany.resolves([]);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result.checks.pdaReceipts.passed).to.be.true;
      expect(result.checks.pdaReceipts.accountExists).to.be.true;
      expect(result.checks.pdaReceipts.metadataEncrypted).to.be.true;
    });

    it('should fail when no PDAs exist', async () => {
      const escrow = makeEscrow({ escrowPda: null, vaultPda: null });
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      prismaStub.institutionEscrow.count.resolves(0);
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) });
      connectionStub.getTransaction.resolves({ meta: { err: null } });
      prismaStub.institutionAuditLog.findMany.resolves([]);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result.checks.pdaReceipts.passed).to.be.false;
    });
  });

  describe('checkEncryptedCustody', () => {
    it('should pass when all tx signatures verified', async () => {
      const escrow = makeEscrow();
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      prismaStub.institutionEscrow.count.resolves(0);
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) });
      connectionStub.getTransaction.resolves({ meta: { err: null } });
      prismaStub.institutionAuditLog.findMany.resolves([]);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result.checks.encryptedCustody.passed).to.be.true;
      expect(result.checks.encryptedCustody.allVerified).to.be.true;
      expect(result.checks.encryptedCustody.signatures).to.include('initTx');
      expect(result.checks.encryptedCustody.signatures).to.include('depositTx');
      expect(result.checks.encryptedCustody.signatures).to.include('releaseTx');
    });

    it('should fail when no signatures exist', async () => {
      const escrow = makeEscrow({
        initTxSignature: null,
        depositTxSignature: null,
        releaseTxSignature: null,
      });
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      prismaStub.institutionEscrow.count.resolves(0);
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) });
      prismaStub.institutionAuditLog.findMany.resolves([]);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result.checks.encryptedCustody.passed).to.be.false;
    });
  });

  describe('checkComplianceAuditTrail', () => {
    it('should pass when compliance screening passed', async () => {
      const escrow = makeEscrow();
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      prismaStub.institutionEscrow.count.resolves(0);
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) });
      connectionStub.getTransaction.resolves({ meta: { err: null } });
      prismaStub.institutionAuditLog.findMany.resolves([
        {
          id: 'audit-001',
          action: 'COMPLIANCE_SCREENING',
          details: { escrowId: ESCROW_ID, passed: true, riskScore: 12 },
        },
      ]);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result.checks.complianceAuditTrail.passed).to.be.true;
      expect(result.checks.complianceAuditTrail.riskScore).to.equal(12);
      expect(result.checks.complianceAuditTrail.sanctionsCleared).to.be.true;
    });

    it('should fail when no compliance records exist', async () => {
      const escrow = makeEscrow({ riskScore: null });
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      prismaStub.institutionEscrow.count.resolves(0);
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) });
      connectionStub.getTransaction.resolves({ meta: { err: null } });
      prismaStub.institutionAuditLog.findMany.resolves([]);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result.checks.complianceAuditTrail.passed).to.be.false;
    });
  });

  describe('checkTransactionPoolShielding', () => {
    it('should pass when escrow is in a pool with 2+ members', async () => {
      const escrow = makeEscrow({ poolId: 'pool-001' });
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      prismaStub.institutionEscrow.count.resolves(0);
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) });
      connectionStub.getTransaction.resolves({ meta: { err: null } });
      prismaStub.institutionAuditLog.findMany.resolves([]);
      prismaStub.transactionPool.findUnique.resolves({
        id: 'pool-001',
        poolCode: 'SP-ABC-123',
        status: 'SETTLED',
        _count: { members: 8 },
      });

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result.checks.transactionPoolShielding.passed).to.be.true;
      expect(result.checks.transactionPoolShielding.shieldedPoolBatchId).to.equal('SP-ABC-123');
      expect(result.checks.transactionPoolShielding.batchSize).to.equal(8);
    });

    it('should fail when escrow has no pool', async () => {
      const escrow = makeEscrow({ poolId: null });
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      prismaStub.institutionEscrow.count.resolves(0);
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) });
      connectionStub.getTransaction.resolves({ meta: { err: null } });
      prismaStub.institutionAuditLog.findMany.resolves([]);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);
      expect(result.checks.transactionPoolShielding.passed).to.be.false;
    });
  });

  describe('RPC failure resilience', () => {
    it('should mark individual checks as failed without failing the whole analysis', async () => {
      const escrow = makeEscrow();
      prismaStub.institutionEscrow.findUnique.resolves(escrow);
      // RPC throws on all calls
      connectionStub.getAccountInfo.rejects(new Error('RPC timeout'));
      connectionStub.getTransaction.rejects(new Error('RPC timeout'));
      prismaStub.institutionAuditLog.findMany.resolves([]);

      const result = await service.analyze(CLIENT_ID, ESCROW_CODE);

      // Should still return a result (not throw)
      expect(result.escrowId).to.equal(ESCROW_CODE);
      expect(result.checks.stealthAddress.passed).to.be.false;
      expect(result.checks.stealthAddress.detail).to.include('unavailable');
      expect(result.checks.pdaReceipts.passed).to.be.false;
      expect(result.checks.encryptedCustody.passed).to.be.false;
    });
  });
});
