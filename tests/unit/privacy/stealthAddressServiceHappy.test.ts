/**
 * Stealth Address Service — Happy Path & Edge Case Tests
 *
 * Tests service methods with mocked Prisma client to verify:
 * - Meta-address registration (key generation + encryption + DB store)
 * - Payment creation, confirmation, failure transitions
 * - Scan/list with ownership isolation
 * - Sweep payment validation (status, ownership, amount overflow)
 * - Deactivation and ownership checks
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/privacy/stealthAddressServiceHappy.test.ts --timeout 30000 --reporter spec --colors
 */

import { expect } from 'chai';
import sinon from 'sinon';
import proxyquire from 'proxyquire';

describe('StealthAddressService — Happy Paths & Edge Cases', () => {
  let sandbox: sinon.SinonSandbox;

  // Mocked Prisma methods
  let mockPrisma: any;

  // Module under test (re-required with mocked deps each time)
  let StealthAddressService: any;

  const MOCK_META_RECORD = {
    id: 'meta-uuid-1',
    institutionClientId: 'client-123',
    label: null,
    scanPublicKey: 'scanPubBase58',
    spendPublicKey: 'spendPubBase58',
    encryptedScanKey: 'iv1:tag1:cipher1',
    encryptedSpendKey: 'iv2:tag2:cipher2',
    viewingKeyShared: false,
    isActive: true,
    createdAt: new Date('2026-03-25'),
    updatedAt: new Date('2026-03-25'),
  };

  const MOCK_PAYMENT_RECORD = {
    id: 'payment-uuid-1',
    metaAddressId: 'meta-uuid-1',
    stealthAddress: 'stealthAddrBase58',
    ephemeralPublicKey: 'ephPubBase58',
    escrowId: 'escrow-789',
    tokenMint: 'usdcMintBase58',
    amountRaw: BigInt(1000000),
    status: 'CONFIRMED',
    releaseTxSignature: 'releaseTxSig',
    sweepTxSignature: null,
    createdAt: new Date('2026-03-25'),
    confirmedAt: new Date('2026-03-25'),
    sweptAt: null,
    metaAddress: MOCK_META_RECORD,
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.PRIVACY_ENABLED = 'true';
    process.env.STEALTH_KEY_ENCRYPTION_SECRET = 'a'.repeat(64);

    // Reset privacy config cache
    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();

    // Build mock Prisma
    mockPrisma = {
      stealthMetaAddress: {
        create: sandbox.stub(),
        findMany: sandbox.stub(),
        findUnique: sandbox.stub(),
        findFirst: sandbox.stub(),
        update: sandbox.stub(),
      },
      stealthPayment: {
        create: sandbox.stub(),
        findMany: sandbox.stub(),
        findUnique: sandbox.stub(),
        update: sandbox.stub(),
        updateMany: sandbox.stub(),
        count: sandbox.stub(),
      },
      institutionAccount: {
        findFirst: sandbox.stub(),
      },
      institutionClient: {
        findFirst: sandbox.stub(),
      },
    };

    // Use proxyquire to inject mocked prisma, adapter, and Solana deps
    const mod = proxyquire('../../../src/services/privacy/stealth-address.service', {
      '../../generated/prisma': { PrismaClient: function () { return mockPrisma; } },
      './stealth-adapter': {
        generateMetaAddress: sandbox.stub().resolves({
          scan: { publicKey: 'scanPubBase58', secretKey: 'scanPrivBase58' },
          spend: { publicKey: 'spendPubBase58', secretKey: 'spendPrivBase58' },
        }),
        deriveStealthAddress: sandbox.stub().resolves({
          stealthAddress: 'stealthAddrBase58',
          ephemeralPublicKey: 'ephPubBase58',
        }),
        deriveSpendingKey: sandbox.stub().resolves('scalarKeyBase58'),
        sendTokensFromStealth: sandbox.stub().resolves('sweepTxSignature123'),
      },
      './stealth-key-manager': {
        encryptKey: sandbox.stub().callsFake((plaintext: string) => `enc:${plaintext}`),
        decryptKey: sandbox.stub().callsFake((encrypted: string) => encrypted.replace('enc:', '')),
      },
      '@solana/web3.js': {
        Connection: sandbox.stub(),
        PublicKey: sandbox.stub(),
      },
      '../../config': {
        config: { solana: { rpcUrl: 'http://localhost:8899' } },
      },
      '../../utils/loadAdminKeypair': {
        loadAdminKeypair: sandbox.stub().returns({ publicKey: 'mockAdminPubkey' }),
      },
    });

    StealthAddressService = mod.StealthAddressService;
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.PRIVACY_ENABLED;
    delete process.env.STEALTH_KEY_ENCRYPTION_SECRET;
    const { resetPrivacyConfig } = require('../../../src/services/privacy/privacy.config');
    resetPrivacyConfig();
  });

  // ============================
  // registerMetaAddress
  // ============================
  describe('registerMetaAddress — happy path', () => {
    it('should generate keys, encrypt, and store in DB', async () => {
      mockPrisma.stealthMetaAddress.create.resolves(MOCK_META_RECORD);

      const service = new StealthAddressService();
      const result = await service.registerMetaAddress('client-123');

      expect(result).to.deep.equal({
        id: 'meta-uuid-1',
        scanPublicKey: 'scanPubBase58',
        spendPublicKey: 'spendPubBase58',
        label: null,
      });

      // Verify Prisma was called with encrypted keys
      const createCall = mockPrisma.stealthMetaAddress.create.firstCall.args[0];
      expect(createCall.data.institutionClientId).to.equal('client-123');
      expect(createCall.data.encryptedScanKey).to.equal('enc:scanPrivBase58');
      expect(createCall.data.encryptedSpendKey).to.equal('enc:spendPrivBase58');
    });

    it('should store label when provided', async () => {
      mockPrisma.stealthMetaAddress.create.resolves({
        ...MOCK_META_RECORD,
        label: 'My Wallet',
      });

      const service = new StealthAddressService();
      const result = await service.registerMetaAddress('client-123', 'My Wallet');

      expect(result.label).to.equal('My Wallet');
      const createCall = mockPrisma.stealthMetaAddress.create.firstCall.args[0];
      expect(createCall.data.label).to.equal('My Wallet');
    });

    it('should store null label when not provided', async () => {
      mockPrisma.stealthMetaAddress.create.resolves(MOCK_META_RECORD);

      const service = new StealthAddressService();
      await service.registerMetaAddress('client-123');

      const createCall = mockPrisma.stealthMetaAddress.create.firstCall.args[0];
      expect(createCall.data.label).to.be.null;
    });
  });

  // ============================
  // getMetaAddresses
  // ============================
  describe('getMetaAddresses — happy path', () => {
    it('should return only active meta-addresses for the client', async () => {
      const records = [
        { id: 'meta-1', scanPublicKey: 'a', spendPublicKey: 'b', label: null, viewingKeyShared: false, createdAt: new Date() },
        { id: 'meta-2', scanPublicKey: 'c', spendPublicKey: 'd', label: 'Work', viewingKeyShared: false, createdAt: new Date() },
      ];
      mockPrisma.stealthMetaAddress.findMany.resolves(records);

      const service = new StealthAddressService();
      const result = await service.getMetaAddresses('client-123');

      expect(result).to.have.length(2);
      expect(result[0].id).to.equal('meta-1');
      expect(result[1].label).to.equal('Work');

      // Verify query filters
      const queryArgs = mockPrisma.stealthMetaAddress.findMany.firstCall.args[0];
      expect(queryArgs.where.institutionClientId).to.equal('client-123');
      expect(queryArgs.where.isActive).to.equal(true);
      expect(queryArgs.orderBy.createdAt).to.equal('desc');
    });

    it('should return empty array when client has no meta-addresses', async () => {
      mockPrisma.stealthMetaAddress.findMany.resolves([]);

      const service = new StealthAddressService();
      const result = await service.getMetaAddresses('client-no-meta');

      expect(result).to.deep.equal([]);
    });
  });

  // ============================
  // getMetaAddress (by ID)
  // ============================
  describe('getMetaAddress — ownership', () => {
    it('should return meta-address when clientId matches', async () => {
      mockPrisma.stealthMetaAddress.findUnique.resolves(MOCK_META_RECORD);

      const service = new StealthAddressService();
      const result = await service.getMetaAddress('client-123', 'meta-uuid-1');

      expect(result.id).to.equal('meta-uuid-1');
    });

    it('should throw when clientId does not match', async () => {
      mockPrisma.stealthMetaAddress.findUnique.resolves(MOCK_META_RECORD);

      const service = new StealthAddressService();
      try {
        await service.getMetaAddress('wrong-client', 'meta-uuid-1');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Meta-address not found');
      }
    });

    it('should throw when meta-address does not exist', async () => {
      mockPrisma.stealthMetaAddress.findUnique.resolves(null);

      const service = new StealthAddressService();
      try {
        await service.getMetaAddress('client-123', 'nonexistent');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Meta-address not found');
      }
    });
  });

  // ============================
  // deactivateMetaAddress
  // ============================
  describe('deactivateMetaAddress — happy path', () => {
    it('should set isActive=false on matching meta-address', async () => {
      mockPrisma.stealthMetaAddress.findUnique.resolves(MOCK_META_RECORD);
      mockPrisma.stealthMetaAddress.update.resolves({});

      const service = new StealthAddressService();
      await service.deactivateMetaAddress('client-123', 'meta-uuid-1');

      const updateCall = mockPrisma.stealthMetaAddress.update.firstCall.args[0];
      expect(updateCall.where.id).to.equal('meta-uuid-1');
      expect(updateCall.data.isActive).to.equal(false);
    });

    it('should throw when clientId does not match', async () => {
      mockPrisma.stealthMetaAddress.findUnique.resolves(MOCK_META_RECORD);

      const service = new StealthAddressService();
      try {
        await service.deactivateMetaAddress('wrong-client', 'meta-uuid-1');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Meta-address not found');
      }
    });

    it('should throw when meta-address does not exist', async () => {
      mockPrisma.stealthMetaAddress.findUnique.resolves(null);

      const service = new StealthAddressService();
      try {
        await service.deactivateMetaAddress('client-123', 'nonexistent');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Meta-address not found');
      }
    });
  });

  // ============================
  // createStealthPayment
  // ============================
  describe('createStealthPayment — happy path', () => {
    it('should derive stealth address and create payment with PENDING status', async () => {
      mockPrisma.stealthMetaAddress.findUnique.resolves(MOCK_META_RECORD);
      mockPrisma.stealthPayment.create.resolves({
        id: 'payment-new',
        stealthAddress: 'stealthAddrBase58',
        ephemeralPublicKey: 'ephPubBase58',
      });

      const service = new StealthAddressService();
      const result = await service.createStealthPayment({
        metaAddressId: 'meta-uuid-1',
        escrowId: 'escrow-789',
        tokenMint: 'usdcMint',
        amountRaw: BigInt(5000000),
      });

      expect(result.stealthPaymentId).to.equal('payment-new');
      expect(result.stealthAddress).to.equal('stealthAddrBase58');
      expect(result.ephemeralPublicKey).to.equal('ephPubBase58');

      const createArgs = mockPrisma.stealthPayment.create.firstCall.args[0];
      expect(createArgs.data.status).to.equal('PENDING');
      expect(createArgs.data.escrowId).to.equal('escrow-789');
      expect(createArgs.data.tokenMint).to.equal('usdcMint');
      expect(createArgs.data.amountRaw).to.equal(BigInt(5000000));
    });

    it('should throw when meta-address is inactive', async () => {
      mockPrisma.stealthMetaAddress.findUnique.resolves({
        ...MOCK_META_RECORD,
        isActive: false,
      });

      const service = new StealthAddressService();
      try {
        await service.createStealthPayment({
          metaAddressId: 'meta-uuid-1',
          tokenMint: 'usdcMint',
          amountRaw: BigInt(1000000),
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Meta-address not found or inactive');
      }
    });

    it('should throw when meta-address does not exist', async () => {
      mockPrisma.stealthMetaAddress.findUnique.resolves(null);

      const service = new StealthAddressService();
      try {
        await service.createStealthPayment({
          metaAddressId: 'nonexistent',
          tokenMint: 'usdcMint',
          amountRaw: BigInt(1000000),
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Meta-address not found or inactive');
      }
    });

    it('should set escrowId to null when not provided', async () => {
      mockPrisma.stealthMetaAddress.findUnique.resolves(MOCK_META_RECORD);
      mockPrisma.stealthPayment.create.resolves({
        id: 'payment-new',
        stealthAddress: 'stealthAddrBase58',
        ephemeralPublicKey: 'ephPubBase58',
      });

      const service = new StealthAddressService();
      await service.createStealthPayment({
        metaAddressId: 'meta-uuid-1',
        tokenMint: 'usdcMint',
        amountRaw: BigInt(1000000),
      });

      const createArgs = mockPrisma.stealthPayment.create.firstCall.args[0];
      expect(createArgs.data.escrowId).to.be.null;
    });
  });

  // ============================
  // confirmStealthPayment
  // ============================
  describe('confirmStealthPayment', () => {
    it('should transition PENDING → CONFIRMED with tx signature', async () => {
      mockPrisma.stealthPayment.updateMany.resolves({ count: 1 });

      const service = new StealthAddressService();
      await service.confirmStealthPayment('payment-1', 'txSig123');

      const updateArgs = mockPrisma.stealthPayment.updateMany.firstCall.args[0];
      expect(updateArgs.where.id).to.equal('payment-1');
      expect(updateArgs.where.status).to.equal('PENDING');
      expect(updateArgs.data.status).to.equal('CONFIRMED');
      expect(updateArgs.data.releaseTxSignature).to.equal('txSig123');
      expect(updateArgs.data.confirmedAt).to.be.instanceOf(Date);
    });

    it('should not throw when payment is not in PENDING status (idempotent)', async () => {
      mockPrisma.stealthPayment.updateMany.resolves({ count: 0 });

      const service = new StealthAddressService();
      // Should not throw — just logs a warning
      await service.confirmStealthPayment('payment-already-confirmed', 'txSig123');

      expect(mockPrisma.stealthPayment.updateMany.calledOnce).to.be.true;
    });
  });

  // ============================
  // failStealthPayment
  // ============================
  describe('failStealthPayment', () => {
    it('should transition PENDING → FAILED', async () => {
      mockPrisma.stealthPayment.updateMany.resolves({ count: 1 });

      const service = new StealthAddressService();
      await service.failStealthPayment('payment-1');

      const updateArgs = mockPrisma.stealthPayment.updateMany.firstCall.args[0];
      expect(updateArgs.where.status).to.equal('PENDING');
      expect(updateArgs.data.status).to.equal('FAILED');
    });

    it('should not throw when payment is not in PENDING status', async () => {
      mockPrisma.stealthPayment.updateMany.resolves({ count: 0 });

      const service = new StealthAddressService();
      await service.failStealthPayment('payment-already-failed');

      expect(mockPrisma.stealthPayment.updateMany.calledOnce).to.be.true;
    });
  });

  // ============================
  // scanPayments
  // ============================
  describe('scanPayments — happy path', () => {
    it('should return mapped payments for client', async () => {
      const now = new Date();
      mockPrisma.stealthPayment.findMany.resolves([
        { id: 'p1', stealthAddress: 'addr1', amountRaw: BigInt(1000000), status: 'CONFIRMED', createdAt: now },
        { id: 'p2', stealthAddress: 'addr2', amountRaw: BigInt(2000000), status: 'PENDING', createdAt: now },
      ]);

      const service = new StealthAddressService();
      const result = await service.scanPayments('client-123');

      expect(result).to.have.length(2);
      expect(result[0]).to.deep.include({
        paymentId: 'p1',
        stealthAddress: 'addr1',
        amount: '1000000',
        status: 'CONFIRMED',
      });
      expect(result[1].amount).to.equal('2000000');
    });

    it('should filter by status when provided', async () => {
      mockPrisma.stealthPayment.findMany.resolves([]);

      const service = new StealthAddressService();
      await service.scanPayments('client-123', 'CONFIRMED' as any);

      const queryArgs = mockPrisma.stealthPayment.findMany.firstCall.args[0];
      expect(queryArgs.where.status).to.equal('CONFIRMED');
    });

    it('should not filter by status when not provided', async () => {
      mockPrisma.stealthPayment.findMany.resolves([]);

      const service = new StealthAddressService();
      await service.scanPayments('client-123');

      const queryArgs = mockPrisma.stealthPayment.findMany.firstCall.args[0];
      expect(queryArgs.where).to.not.have.property('status');
    });
  });

  // ============================
  // listPayments
  // ============================
  describe('listPayments — happy path', () => {
    it('should return paginated results with total count', async () => {
      const now = new Date();
      mockPrisma.stealthPayment.findMany.resolves([
        {
          id: 'p1', metaAddressId: 'meta-1', stealthAddress: 'addr1', ephemeralPublicKey: 'eph1',
          escrowId: null, tokenMint: 'usdc', amountRaw: BigInt(1000000), status: 'CONFIRMED',
          releaseTxSignature: 'tx1', sweepTxSignature: null,
          createdAt: now, confirmedAt: now, sweptAt: null,
          metaAddress: { label: 'Primary', scanPublicKey: 'scanPub1' },
        },
      ]);
      mockPrisma.stealthPayment.count.resolves(5);

      const service = new StealthAddressService();
      const result = await service.listPayments('client-123', { limit: 10, offset: 0 });

      expect(result.payments).to.have.length(1);
      expect(result.total).to.equal(5);
      expect(result.limit).to.equal(10);
      expect(result.offset).to.equal(0);
      expect(result.payments[0].metaAddressLabel).to.equal('Primary');
      expect(result.payments[0].amount).to.equal('1000000');
    });

    it('should use default pagination when not provided', async () => {
      mockPrisma.stealthPayment.findMany.resolves([]);
      mockPrisma.stealthPayment.count.resolves(0);

      const service = new StealthAddressService();
      const result = await service.listPayments('client-123');

      expect(result.limit).to.equal(20);
      expect(result.offset).to.equal(0);

      const queryArgs = mockPrisma.stealthPayment.findMany.firstCall.args[0];
      expect(queryArgs.take).to.equal(20);
      expect(queryArgs.skip).to.equal(0);
    });
  });

  // ============================
  // getPayment
  // ============================
  describe('getPayment — ownership', () => {
    it('should return payment when client owns it', async () => {
      mockPrisma.stealthPayment.findUnique.resolves(MOCK_PAYMENT_RECORD);

      const service = new StealthAddressService();
      const result = await service.getPayment('client-123', 'payment-uuid-1');

      expect(result.id).to.equal('payment-uuid-1');
      expect(result.amount).to.equal('1000000');
      expect(result.metaAddressLabel).to.be.null;
    });

    it('should throw when client does not own the payment', async () => {
      mockPrisma.stealthPayment.findUnique.resolves(MOCK_PAYMENT_RECORD);

      const service = new StealthAddressService();
      try {
        await service.getPayment('wrong-client', 'payment-uuid-1');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Payment not found');
      }
    });

    it('should throw when payment does not exist', async () => {
      mockPrisma.stealthPayment.findUnique.resolves(null);

      const service = new StealthAddressService();
      try {
        await service.getPayment('client-123', 'nonexistent');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Payment not found');
      }
    });
  });

  // ============================
  // sweepPayment
  // ============================
  describe('sweepPayment — happy path', () => {
    it('should decrypt keys, derive spending key, sweep, and update status', async () => {
      mockPrisma.stealthPayment.findUnique.resolves({
        ...MOCK_PAYMENT_RECORD,
        metaAddress: {
          ...MOCK_META_RECORD,
          encryptedScanKey: 'enc:scanPrivKey',
          encryptedSpendKey: 'enc:spendPrivKey',
        },
      });
      mockPrisma.stealthPayment.update.resolves({});

      const service = new StealthAddressService();
      const result = await service.sweepPayment('client-123', 'payment-uuid-1', 'destWallet');

      expect(result.txSignature).to.equal('sweepTxSignature123');
      expect(result.destinationWallet).to.equal('destWallet');
      expect(result.amount).to.equal('1000000');

      // Verify status updated to SWEPT
      const updateArgs = mockPrisma.stealthPayment.update.firstCall.args[0];
      expect(updateArgs.data.status).to.equal('SWEPT');
      expect(updateArgs.data.sweepTxSignature).to.equal('sweepTxSignature123');
      expect(updateArgs.data.sweptAt).to.be.instanceOf(Date);
    });
  });

  describe('sweepPayment — edge cases', () => {
    it('should throw when payment is not CONFIRMED', async () => {
      mockPrisma.stealthPayment.findUnique.resolves({
        ...MOCK_PAYMENT_RECORD,
        status: 'PENDING',
      });

      const service = new StealthAddressService();
      try {
        await service.sweepPayment('client-123', 'payment-uuid-1', 'destWallet');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.include('Cannot sweep');
        expect(error.message).to.include('PENDING');
      }
    });

    it('should throw when payment status is SWEPT (already swept)', async () => {
      mockPrisma.stealthPayment.findUnique.resolves({
        ...MOCK_PAYMENT_RECORD,
        status: 'SWEPT',
      });

      const service = new StealthAddressService();
      try {
        await service.sweepPayment('client-123', 'payment-uuid-1', 'destWallet');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.include('Cannot sweep');
        expect(error.message).to.include('SWEPT');
      }
    });

    it('should throw when payment status is FAILED', async () => {
      mockPrisma.stealthPayment.findUnique.resolves({
        ...MOCK_PAYMENT_RECORD,
        status: 'FAILED',
      });

      const service = new StealthAddressService();
      try {
        await service.sweepPayment('client-123', 'payment-uuid-1', 'destWallet');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.include('Cannot sweep');
        expect(error.message).to.include('FAILED');
      }
    });

    it('should throw when clientId does not own the payment', async () => {
      mockPrisma.stealthPayment.findUnique.resolves(MOCK_PAYMENT_RECORD);

      const service = new StealthAddressService();
      try {
        await service.sweepPayment('wrong-client', 'payment-uuid-1', 'destWallet');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Payment not found');
      }
    });

    it('should throw when payment does not exist', async () => {
      mockPrisma.stealthPayment.findUnique.resolves(null);

      const service = new StealthAddressService();
      try {
        await service.sweepPayment('client-123', 'nonexistent', 'destWallet');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.equal('Payment not found');
      }
    });

    it('should throw when amountRaw exceeds MAX_SAFE_INTEGER', async () => {
      mockPrisma.stealthPayment.findUnique.resolves({
        ...MOCK_PAYMENT_RECORD,
        amountRaw: BigInt('99999999999999999'),
        metaAddress: {
          ...MOCK_META_RECORD,
          encryptedScanKey: 'enc:scanPrivKey',
          encryptedSpendKey: 'enc:spendPrivKey',
        },
      });

      const service = new StealthAddressService();
      try {
        await service.sweepPayment('client-123', 'payment-uuid-1', 'destWallet');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).to.include('MAX_SAFE_INTEGER');
      }
    });
  });

  // ============================
  // findMetaAddressForWallet
  // ============================
  describe('findMetaAddressForWallet', () => {
    it('should find meta-address via account wallet link', async () => {
      mockPrisma.institutionAccount.findFirst.resolves({
        stealthMetaAddressId: 'meta-linked',
      });
      mockPrisma.stealthMetaAddress.findFirst.resolves({ id: 'meta-linked' });

      const service = new StealthAddressService();
      const result = await service.findMetaAddressForWallet('someWallet');

      expect(result).to.equal('meta-linked');
    });

    it('should fallback to client primary wallet lookup', async () => {
      mockPrisma.institutionAccount.findFirst.resolves(null);
      mockPrisma.institutionClient.findFirst.resolves({ id: 'client-found' });
      mockPrisma.stealthMetaAddress.findFirst.resolves({ id: 'meta-fallback' });

      const service = new StealthAddressService();
      const result = await service.findMetaAddressForWallet('primaryWallet');

      expect(result).to.equal('meta-fallback');
    });

    it('should return null when no account or client found', async () => {
      mockPrisma.institutionAccount.findFirst.resolves(null);
      mockPrisma.institutionClient.findFirst.resolves(null);

      const service = new StealthAddressService();
      const result = await service.findMetaAddressForWallet('unknownWallet');

      expect(result).to.be.null;
    });

    it('should return null when account link exists but meta-address is deactivated', async () => {
      mockPrisma.institutionAccount.findFirst.resolves({
        stealthMetaAddressId: 'meta-deactivated',
      });
      mockPrisma.stealthMetaAddress.findFirst.resolves(null); // not active

      // Fallback
      mockPrisma.institutionClient.findFirst.resolves(null);

      const service = new StealthAddressService();
      const result = await service.findMetaAddressForWallet('someWallet');

      expect(result).to.be.null;
    });
  });
});
