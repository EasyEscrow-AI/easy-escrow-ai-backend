/**
 * Unit Tests for InstitutionTransferService (Two-Step Flow)
 *
 * Tests internal account-to-account SPL token transfers:
 * - Transfer code generation format
 * - prepareTransfer: input validation, account checks, signer/token/signature validation,
 *   idempotency, balance check, successful preparation
 * - submitTransfer: happy path, expired transfer, not found, on-chain error, already completed
 */

import { expect } from 'chai';
import sinon from 'sinon';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

import { Keypair } from '@solana/web3.js';

// Generate a throwaway admin keypair for tests
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

import { InstitutionTransferService } from '../../../src/services/institution-transfer.service';

after(() => {
  Object.assign(process.env, savedEnv);
});

describe('InstitutionTransferService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionTransferService;
  let prismaStub: any;
  let connectionStub: any;

  const CLIENT_ID = 'client-001';
  const FROM_ACCOUNT_ID = 'acct-from-001';
  const TO_ACCOUNT_ID = 'acct-to-002';

  const keypair = nacl.sign.keyPair();
  const SIGNER_PUBKEY = bs58.encode(keypair.publicKey);

  // Generate deterministic keypairs for stable wallet addresses
  const fromWalletKeypair = Keypair.generate();
  const toWalletKeypair = Keypair.generate();
  const FROM_WALLET = fromWalletKeypair.publicKey.toBase58();
  const TO_WALLET = toWalletKeypair.publicKey.toBase58();

  const makeAccount = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    clientId: CLIENT_ID,
    name: `Account ${id}`,
    label: `Account ${id} Label`,
    walletAddress: id === FROM_ACCOUNT_ID ? FROM_WALLET : TO_WALLET,
    verificationStatus: 'VERIFIED',
    isActive: true,
    accountType: 'OPERATIONS',
    ...overrides,
  });

  const VALID_TOKEN = {
    symbol: 'USDC',
    name: 'USD Coin',
    mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    isActive: true,
  };

  function signMessage(message: string): string {
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    return Buffer.from(signature).toString('base64');
  }

  function buildSignedTransferParams(overrides: Record<string, unknown> = {}) {
    const fromLabel = 'Account acct-from-001 Label';
    const toLabel = 'Account acct-to-002 Label';
    const amount = 100;
    const tokenSymbol = 'USDC';
    const timestamp = new Date().toISOString();

    const message = [
      'EasyEscrow Internal Transfer',
      `From: ${fromLabel}`,
      `To: ${toLabel}`,
      `Amount: ${amount} ${tokenSymbol}`,
      `Timestamp: ${timestamp}`,
    ].join('\n');

    return {
      fromAccountId: FROM_ACCOUNT_ID,
      toAccountId: TO_ACCOUNT_ID,
      tokenSymbol,
      amount,
      walletSignature: signMessage(message),
      signerPublicKey: SIGNER_PUBKEY,
      timestamp,
      ...overrides,
    };
  }

  /** Stub all DB + RPC dependencies so prepareTransfer passes validation */
  function setupPassingStubs() {
    prismaStub.institutionAccount.findUnique
      .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
      .resolves(makeAccount(FROM_ACCOUNT_ID))
      .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
      .resolves(makeAccount(TO_ACCOUNT_ID));
    prismaStub.institutionWallet.findFirst.resolves({ id: 'w1', address: SIGNER_PUBKEY });
    prismaStub.institutionApprovedToken.findFirst.resolves(VALID_TOKEN);
    prismaStub.institutionTransfer.findFirst.resolves(null);
    prismaStub.institutionTransfer.create.resolves({
      id: 'txf-001',
      transferCode: 'TXF-ABC-DEF',
      createdAt: new Date(),
    });
    prismaStub.institutionAuditLog.create.resolves({});

    // Mock balance (1000 USDC)
    const balanceData = Buffer.alloc(165);
    balanceData.writeBigUInt64LE(BigInt(1000_000000), 64);
    connectionStub.getTokenAccountsByOwner.resolves({
      value: [{ account: { data: balanceData } }],
    });
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    service = new InstitutionTransferService();

    // Stub prisma
    prismaStub = {
      institutionAccount: {
        findUnique: sandbox.stub(),
      },
      institutionWallet: {
        findFirst: sandbox.stub(),
      },
      institutionApprovedToken: {
        findFirst: sandbox.stub(),
      },
      institutionTransfer: {
        findFirst: sandbox.stub(),
        create: sandbox.stub(),
        update: sandbox.stub(),
      },
      institutionAuditLog: {
        create: sandbox.stub(),
      },
    };

    // Replace prisma on the service
    (service as any).prisma = prismaStub;

    // Stub connection methods
    connectionStub = {
      getTokenAccountsByOwner: sandbox.stub(),
      getLatestBlockhash: sandbox.stub().resolves({
        blockhash: 'fakeblockhash',
        lastValidBlockHeight: 100,
      }),
      getTransaction: sandbox.stub().resolves({ meta: { err: null } }),
      getAccountInfo: sandbox.stub().resolves(null),
    };
    (service as any).connection = connectionStub;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('generateTransferCode', () => {
    it('should generate TXF-XXX-XXX format', () => {
      const code = service.generateTransferCode();
      expect(code).to.match(/^TXF-[23456789A-HJ-NP-Z]{3}-[23456789A-HJ-NP-Z]{3}$/);
    });

    it('should generate unique codes', () => {
      const codes = new Set(Array.from({ length: 50 }, () => service.generateTransferCode()));
      expect(codes.size).to.equal(50);
    });
  });

  // ─── prepareTransfer ─────────────────────────────────────────────

  describe('prepareTransfer - input validation', () => {
    it('should reject when source and destination are the same', async () => {
      try {
        await service.prepareTransfer(CLIENT_ID, {
          fromAccountId: FROM_ACCOUNT_ID,
          toAccountId: FROM_ACCOUNT_ID,
          tokenSymbol: 'USDC',
          amount: 100,
          walletSignature: 'fake',
          signerPublicKey: SIGNER_PUBKEY,
          timestamp: new Date().toISOString(),
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('must be different');
        expect(err.status).to.equal(400);
      }
    });

    it('should reject zero amount', async () => {
      try {
        await service.prepareTransfer(CLIENT_ID, {
          fromAccountId: FROM_ACCOUNT_ID,
          toAccountId: TO_ACCOUNT_ID,
          tokenSymbol: 'USDC',
          amount: 0,
          walletSignature: 'fake',
          signerPublicKey: SIGNER_PUBKEY,
          timestamp: new Date().toISOString(),
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('greater than zero');
        expect(err.status).to.equal(400);
      }
    });

    it('should reject negative amount', async () => {
      try {
        await service.prepareTransfer(CLIENT_ID, {
          fromAccountId: FROM_ACCOUNT_ID,
          toAccountId: TO_ACCOUNT_ID,
          tokenSymbol: 'USDC',
          amount: -50,
          walletSignature: 'fake',
          signerPublicKey: SIGNER_PUBKEY,
          timestamp: new Date().toISOString(),
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('greater than zero');
        expect(err.status).to.equal(400);
      }
    });

    it('should reject invalid signer public key', async () => {
      try {
        await service.prepareTransfer(CLIENT_ID, {
          fromAccountId: FROM_ACCOUNT_ID,
          toAccountId: TO_ACCOUNT_ID,
          tokenSymbol: 'USDC',
          amount: 100,
          walletSignature: 'fake',
          signerPublicKey: 'not-a-valid-key',
          timestamp: new Date().toISOString(),
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Invalid signer public key');
        expect(err.status).to.equal(400);
      }
    });
  });

  describe('prepareTransfer - account checks', () => {
    it('should return 404 when source account not found', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(null)
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Source account not found');
        expect(err.status).to.equal(404);
      }
    });

    it('should return 404 when destination account not found', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(null);

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Destination account not found');
        expect(err.status).to.equal(404);
      }
    });

    it('should return 403 when source account belongs to different institution', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID, { clientId: 'other-client' }))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('does not belong to your institution');
        expect(err.status).to.equal(403);
      }
    });

    it('should return 403 when destination account belongs to different institution', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID, { clientId: 'other-client' }));

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('does not belong to your institution');
        expect(err.status).to.equal(403);
      }
    });

    it('should reject unverified source account', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID, { verificationStatus: 'PENDING' }))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Source account is not verified');
        expect(err.status).to.equal(400);
      }
    });

    it('should reject inactive destination account', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID, { isActive: false }));

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Destination account is not verified or active');
        expect(err.status).to.equal(400);
      }
    });
  });

  describe('prepareTransfer - signer validation', () => {
    it('should reject signer not associated with institution', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));
      prismaStub.institutionWallet.findFirst.resolves(null);

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not associated with your institution');
        expect(err.status).to.equal(403);
      }
    });
  });

  describe('prepareTransfer - token validation', () => {
    it('should reject unsupported token', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));
      prismaStub.institutionWallet.findFirst.resolves({ id: 'w1', address: SIGNER_PUBKEY });
      prismaStub.institutionApprovedToken.findFirst.resolves(null);

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams({ tokenSymbol: 'FAKECOIN' }));
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not supported');
        expect(err.status).to.equal(400);
      }
    });
  });

  describe('prepareTransfer - signature verification', () => {
    it('should reject invalid signature', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));
      prismaStub.institutionWallet.findFirst.resolves({ id: 'w1', address: SIGNER_PUBKEY });
      prismaStub.institutionApprovedToken.findFirst.resolves(VALID_TOKEN);

      const badSig = Buffer.from(new Uint8Array(64)).toString('base64');

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams({ walletSignature: badSig }));
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('signature verification failed');
        expect(err.status).to.equal(400);
      }
    });

    it('should reject expired timestamp', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));
      prismaStub.institutionWallet.findFirst.resolves({ id: 'w1', address: SIGNER_PUBKEY });
      prismaStub.institutionApprovedToken.findFirst.resolves(VALID_TOKEN);

      // Timestamp 10 minutes ago (outside 5-min window)
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams({ timestamp: oldTimestamp }));
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('expired');
        expect(err.status).to.equal(400);
      }
    });
  });

  describe('prepareTransfer - idempotency', () => {
    it('should reject duplicate transfer within 60 seconds', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));
      prismaStub.institutionWallet.findFirst.resolves({ id: 'w1', address: SIGNER_PUBKEY });
      prismaStub.institutionApprovedToken.findFirst.resolves(VALID_TOKEN);
      prismaStub.institutionTransfer.findFirst.resolves({
        transferCode: 'TXF-DUP-001',
        status: 'pending',
      });

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('already in progress');
        expect(err.status).to.equal(409);
      }
    });
  });

  describe('prepareTransfer - balance check', () => {
    it('should reject when source has insufficient balance', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));
      prismaStub.institutionWallet.findFirst.resolves({ id: 'w1', address: SIGNER_PUBKEY });
      prismaStub.institutionApprovedToken.findFirst.resolves(VALID_TOKEN);
      prismaStub.institutionTransfer.findFirst.resolves(null);

      // Mock balance (10 USDC, need 100)
      const balanceData = Buffer.alloc(165);
      balanceData.writeBigUInt64LE(BigInt(10_000000), 64);
      connectionStub.getTokenAccountsByOwner.resolves({
        value: [{ account: { data: balanceData } }],
      });

      try {
        await service.prepareTransfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Insufficient');
        expect(err.status).to.equal(400);
      }
    });
  });

  describe('prepareTransfer - successful flow', () => {
    it('should return transaction, transferCode, and expiresAt', async () => {
      setupPassingStubs();

      // Stub buildTransferTransaction to avoid real Solana calls
      sandbox
        .stub(service as any, 'buildTransferTransaction')
        .resolves('base64-serialized-tx-data');

      const params = buildSignedTransferParams();
      const result = await service.prepareTransfer(CLIENT_ID, params);

      expect(result.transferCode).to.be.a('string');
      expect(result.transaction).to.equal('base64-serialized-tx-data');
      expect(result.expiresAt).to.be.a('string');
      expect(result.fromAccountId).to.equal(FROM_ACCOUNT_ID);
      expect(result.toAccountId).to.equal(TO_ACCOUNT_ID);
      expect(result.tokenSymbol).to.equal('USDC');
      expect(result.amount).to.equal(100);
      expect(result.fromAccountLabel).to.be.a('string');
      expect(result.toAccountLabel).to.be.a('string');
    });

    it('should return account labels from prepare', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID, { label: 'Treasury Singapore' }))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID, { label: 'Operations Dubai' }));
      prismaStub.institutionWallet.findFirst.resolves({ id: 'w1', address: SIGNER_PUBKEY });
      prismaStub.institutionApprovedToken.findFirst.resolves(VALID_TOKEN);
      prismaStub.institutionTransfer.findFirst.resolves(null);
      prismaStub.institutionTransfer.create.resolves({
        id: 'txf-ok',
        transferCode: 'TXF-OK1-234',
        createdAt: new Date(),
      });
      prismaStub.institutionAuditLog.create.resolves({});

      const balanceData = Buffer.alloc(165);
      balanceData.writeBigUInt64LE(BigInt(5000_000000), 64);
      connectionStub.getTokenAccountsByOwner.resolves({
        value: [{ account: { data: balanceData } }],
      });

      sandbox
        .stub(service as any, 'buildTransferTransaction')
        .resolves('base64-tx');

      const timestamp = new Date().toISOString();
      const message = [
        'EasyEscrow Internal Transfer',
        'From: Treasury Singapore',
        'To: Operations Dubai',
        'Amount: 250 USDC',
        `Timestamp: ${timestamp}`,
      ].join('\n');
      const sig = signMessage(message);

      const result = await service.prepareTransfer(CLIENT_ID, {
        fromAccountId: FROM_ACCOUNT_ID,
        toAccountId: TO_ACCOUNT_ID,
        tokenSymbol: 'USDC',
        amount: 250,
        walletSignature: sig,
        signerPublicKey: SIGNER_PUBKEY,
        timestamp,
      });

      expect(result.fromAccountLabel).to.equal('Treasury Singapore');
      expect(result.toAccountLabel).to.equal('Operations Dubai');

      // Verify TRANSFER_PREPARED audit log
      const auditCalls = prismaStub.institutionAuditLog.create.getCalls();
      const preparedLog = auditCalls.find(
        (c: any) => c.args[0].data.action === 'TRANSFER_PREPARED'
      );
      expect(preparedLog).to.exist;
    });
  });

  // ─── submitTransfer ───────────────────────────────────────────────

  describe('submitTransfer - happy path', () => {
    it('should complete a pending transfer with valid txSignature', async () => {
      const now = new Date();
      prismaStub.institutionTransfer.findFirst.resolves({
        id: 'txf-001',
        transferCode: 'TXF-OK1-234',
        clientId: CLIENT_ID,
        fromAccountId: FROM_ACCOUNT_ID,
        toAccountId: TO_ACCOUNT_ID,
        tokenSymbol: 'USDC',
        amount: 100,
        signerPublicKey: SIGNER_PUBKEY,
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000), // not expired
        createdAt: now,
        fromAccount: makeAccount(FROM_ACCOUNT_ID),
        toAccount: makeAccount(TO_ACCOUNT_ID),
      });
      prismaStub.institutionTransfer.update.resolves({});
      prismaStub.institutionAuditLog.create.resolves({});
      connectionStub.getTransaction.resolves({ meta: { err: null } });

      const result = await service.submitTransfer(CLIENT_ID, {
        transferCode: 'TXF-OK1-234',
        txSignature: 'realSolanaSignature123',
      });

      expect(result.status).to.equal('completed');
      expect(result.txSignature).to.equal('realSolanaSignature123');
      expect(result.transferCode).to.equal('TXF-OK1-234');
      expect(result.amount).to.equal(100);

      // Verify DB update
      expect(prismaStub.institutionTransfer.update.calledOnce).to.be.true;
      const updateCall = prismaStub.institutionTransfer.update.firstCall.args[0];
      expect(updateCall.data.status).to.equal('completed');
      expect(updateCall.data.txSignature).to.equal('realSolanaSignature123');

      // Verify TRANSFER_COMPLETED audit log
      const auditCalls = prismaStub.institutionAuditLog.create.getCalls();
      const completedLog = auditCalls.find(
        (c: any) => c.args[0].data.action === 'TRANSFER_COMPLETED'
      );
      expect(completedLog).to.exist;
    });
  });

  describe('submitTransfer - error cases', () => {
    it('should return 404 when transfer not found', async () => {
      prismaStub.institutionTransfer.findFirst.resolves(null);

      try {
        await service.submitTransfer(CLIENT_ID, {
          transferCode: 'TXF-NON-EXI',
          txSignature: 'sig123',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Transfer not found');
        expect(err.status).to.equal(404);
      }
    });

    it('should return 410 when transfer has expired', async () => {
      prismaStub.institutionTransfer.findFirst.resolves({
        id: 'txf-exp',
        transferCode: 'TXF-EXP-001',
        clientId: CLIENT_ID,
        status: 'pending',
        expiresAt: new Date(Date.now() - 60_000), // already expired
        fromAccount: makeAccount(FROM_ACCOUNT_ID),
        toAccount: makeAccount(TO_ACCOUNT_ID),
      });
      prismaStub.institutionTransfer.update.resolves({});

      try {
        await service.submitTransfer(CLIENT_ID, {
          transferCode: 'TXF-EXP-001',
          txSignature: 'sig123',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('expired');
        expect(err.status).to.equal(410);
      }

      // Verify status was updated to 'expired'
      expect(prismaStub.institutionTransfer.update.calledOnce).to.be.true;
      const updateCall = prismaStub.institutionTransfer.update.firstCall.args[0];
      expect(updateCall.data.status).to.equal('expired');
    });

    it('should return 404 when tx not found on-chain', async () => {
      prismaStub.institutionTransfer.findFirst.resolves({
        id: 'txf-nf',
        transferCode: 'TXF-NF1-234',
        clientId: CLIENT_ID,
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000),
        fromAccount: makeAccount(FROM_ACCOUNT_ID),
        toAccount: makeAccount(TO_ACCOUNT_ID),
      });
      connectionStub.getTransaction.resolves(null);

      try {
        await service.submitTransfer(CLIENT_ID, {
          transferCode: 'TXF-NF1-234',
          txSignature: 'nonexistentSig',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not found or not yet confirmed');
        expect(err.status).to.equal(404);
      }
    });

    it('should mark failed when tx has on-chain error', async () => {
      prismaStub.institutionTransfer.findFirst.resolves({
        id: 'txf-fail',
        transferCode: 'TXF-FAI-L01',
        clientId: CLIENT_ID,
        fromAccountId: FROM_ACCOUNT_ID,
        toAccountId: TO_ACCOUNT_ID,
        tokenSymbol: 'USDC',
        amount: 100,
        signerPublicKey: SIGNER_PUBKEY,
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000),
        fromAccount: makeAccount(FROM_ACCOUNT_ID),
        toAccount: makeAccount(TO_ACCOUNT_ID),
      });
      prismaStub.institutionTransfer.update.resolves({});
      prismaStub.institutionAuditLog.create.resolves({});
      connectionStub.getTransaction.resolves({
        meta: { err: { InstructionError: [0, 'InvalidAccountData'] } },
      });

      try {
        await service.submitTransfer(CLIENT_ID, {
          transferCode: 'TXF-FAI-L01',
          txSignature: 'failedSig456',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('failed on-chain');
        expect(err.status).to.equal(400);
      }

      // Verify transfer was marked failed
      expect(prismaStub.institutionTransfer.update.calledOnce).to.be.true;
      const updateCall = prismaStub.institutionTransfer.update.firstCall.args[0];
      expect(updateCall.data.status).to.equal('failed');
      expect(updateCall.data.failureReason).to.include('InvalidAccountData');

      // Verify TRANSFER_FAILED audit log
      const auditCalls = prismaStub.institutionAuditLog.create.getCalls();
      const failedLog = auditCalls.find(
        (c: any) => c.args[0].data.action === 'TRANSFER_FAILED'
      );
      expect(failedLog).to.exist;
    });

    it('should return already-completed transfer idempotently', async () => {
      prismaStub.institutionTransfer.findFirst.resolves({
        id: 'txf-done',
        transferCode: 'TXF-DON-E01',
        clientId: CLIENT_ID,
        fromAccountId: FROM_ACCOUNT_ID,
        toAccountId: TO_ACCOUNT_ID,
        tokenSymbol: 'USDC',
        amount: 100,
        signerPublicKey: SIGNER_PUBKEY,
        txSignature: 'existingSig789',
        status: 'completed',
        createdAt: new Date(),
        fromAccount: makeAccount(FROM_ACCOUNT_ID),
        toAccount: makeAccount(TO_ACCOUNT_ID),
      });

      const result = await service.submitTransfer(CLIENT_ID, {
        transferCode: 'TXF-DON-E01',
        txSignature: 'existingSig789',
      });

      expect(result.status).to.equal('completed');
      expect(result.txSignature).to.equal('existingSig789');
      // No DB update should have been called
      expect(prismaStub.institutionTransfer.update.called).to.be.false;
    });

    it('should reject non-pending transfer status', async () => {
      prismaStub.institutionTransfer.findFirst.resolves({
        id: 'txf-fail2',
        transferCode: 'TXF-BAD-STA',
        clientId: CLIENT_ID,
        status: 'failed',
        fromAccount: makeAccount(FROM_ACCOUNT_ID),
        toAccount: makeAccount(TO_ACCOUNT_ID),
      });

      try {
        await service.submitTransfer(CLIENT_ID, {
          transferCode: 'TXF-BAD-STA',
          txSignature: 'sig123',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('expected pending');
        expect(err.status).to.equal(400);
      }
    });
  });
});
