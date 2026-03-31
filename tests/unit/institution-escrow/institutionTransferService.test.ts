/**
 * Unit Tests for InstitutionTransferService
 *
 * Tests internal account-to-account SPL token transfers:
 * - Input validation (missing fields, same account, negative amount)
 * - Account ownership and verification checks
 * - Signer wallet validation
 * - Token support validation
 * - Wallet signature verification
 * - Idempotency (duplicate transfer detection)
 * - Insufficient balance check
 * - Successful transfer flow
 * - On-chain failure handling
 * - Transfer code generation format
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
      sendRawTransaction: sandbox.stub().resolves('fakesig123'),
      confirmTransaction: sandbox.stub().resolves(),
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

  describe('transfer - input validation', () => {
    it('should reject when source and destination are the same', async () => {
      try {
        await service.transfer(CLIENT_ID, {
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
        await service.transfer(CLIENT_ID, {
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
        await service.transfer(CLIENT_ID, {
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
        await service.transfer(CLIENT_ID, {
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

  describe('transfer - account checks', () => {
    it('should return 404 when source account not found', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(null)
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));

      try {
        await service.transfer(CLIENT_ID, buildSignedTransferParams());
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
        await service.transfer(CLIENT_ID, buildSignedTransferParams());
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
        await service.transfer(CLIENT_ID, buildSignedTransferParams());
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
        await service.transfer(CLIENT_ID, buildSignedTransferParams());
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
        await service.transfer(CLIENT_ID, buildSignedTransferParams());
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
        await service.transfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Destination account is not verified or active');
        expect(err.status).to.equal(400);
      }
    });
  });

  describe('transfer - signer validation', () => {
    it('should reject signer not associated with institution', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));
      prismaStub.institutionWallet.findFirst.resolves(null);

      try {
        await service.transfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not associated with your institution');
        expect(err.status).to.equal(403);
      }
    });
  });

  describe('transfer - token validation', () => {
    it('should reject unsupported token', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));
      prismaStub.institutionWallet.findFirst.resolves({ id: 'w1', address: SIGNER_PUBKEY });
      prismaStub.institutionApprovedToken.findFirst.resolves(null);

      try {
        await service.transfer(CLIENT_ID, buildSignedTransferParams({ tokenSymbol: 'FAKECOIN' }));
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not supported');
        expect(err.status).to.equal(400);
      }
    });
  });

  describe('transfer - signature verification', () => {
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
        await service.transfer(CLIENT_ID, buildSignedTransferParams({ walletSignature: badSig }));
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
        await service.transfer(CLIENT_ID, buildSignedTransferParams({ timestamp: oldTimestamp }));
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('expired');
        expect(err.status).to.equal(400);
      }
    });

    it('should accept valid signature with current timestamp', async () => {
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
      prismaStub.institutionTransfer.update.resolves({});
      prismaStub.institutionAuditLog.create.resolves({});

      // Mock balance (1000 USDC)
      const balanceData = Buffer.alloc(165);
      balanceData.writeBigUInt64LE(BigInt(1000_000000), 64);
      connectionStub.getTokenAccountsByOwner.resolves({
        value: [{ account: { data: balanceData } }],
      });

      // Stub executeOnChainTransfer to avoid real Solana calls
      sandbox.stub(service as any, 'executeOnChainTransfer').resolves('fakesig123');

      const params = buildSignedTransferParams();
      const result = await service.transfer(CLIENT_ID, params);

      expect(result.status).to.equal('completed');
      expect(result.fromAccountId).to.equal(FROM_ACCOUNT_ID);
      expect(result.toAccountId).to.equal(TO_ACCOUNT_ID);
      expect(result.tokenSymbol).to.equal('USDC');
      expect(result.amount).to.equal(100);
      expect(result.txSignature).to.equal('fakesig123');
    });
  });

  describe('transfer - idempotency', () => {
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
        await service.transfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('already in progress');
        expect(err.status).to.equal(409);
      }
    });
  });

  describe('transfer - balance check', () => {
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
        await service.transfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Insufficient');
        expect(err.status).to.equal(400);
      }
    });
  });

  describe('transfer - on-chain failure', () => {
    it('should mark transfer as failed and create audit log on tx error', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID));
      prismaStub.institutionWallet.findFirst.resolves({ id: 'w1', address: SIGNER_PUBKEY });
      prismaStub.institutionApprovedToken.findFirst.resolves(VALID_TOKEN);
      prismaStub.institutionTransfer.findFirst.resolves(null);
      prismaStub.institutionTransfer.create.resolves({
        id: 'txf-fail-001',
        transferCode: 'TXF-FAI-L01',
        createdAt: new Date(),
      });
      prismaStub.institutionTransfer.update.resolves({});
      prismaStub.institutionAuditLog.create.resolves({});

      // Mock sufficient balance
      const balanceData = Buffer.alloc(165);
      balanceData.writeBigUInt64LE(BigInt(1000_000000), 64);
      connectionStub.getTokenAccountsByOwner.resolves({
        value: [{ account: { data: balanceData } }],
      });

      // Stub executeOnChainTransfer to simulate failure
      sandbox
        .stub(service as any, 'executeOnChainTransfer')
        .rejects(new Error('Simulation failed: custom error'));

      try {
        await service.transfer(CLIENT_ID, buildSignedTransferParams());
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('On-chain transfer failed');
        expect(err.status).to.equal(400);
      }

      // Verify the transfer was marked as failed
      expect(prismaStub.institutionTransfer.update.calledOnce).to.be.true;
      const updateCall = prismaStub.institutionTransfer.update.firstCall.args[0];
      expect(updateCall.data.status).to.equal('failed');
      expect(updateCall.data.failureReason).to.include('Simulation failed');

      // Verify audit log was created
      expect(prismaStub.institutionAuditLog.create.calledOnce).to.be.true;
      const auditCall = prismaStub.institutionAuditLog.create.firstCall.args[0];
      expect(auditCall.data.action).to.equal('TRANSFER_FAILED');
    });
  });

  describe('transfer - successful flow', () => {
    it('should return complete receipt with account labels', async () => {
      prismaStub.institutionAccount.findUnique
        .withArgs(sinon.match({ where: { id: FROM_ACCOUNT_ID } }))
        .resolves(makeAccount(FROM_ACCOUNT_ID, { label: 'Treasury Singapore' }))
        .withArgs(sinon.match({ where: { id: TO_ACCOUNT_ID } }))
        .resolves(makeAccount(TO_ACCOUNT_ID, { label: 'Operations Dubai' }));
      prismaStub.institutionWallet.findFirst.resolves({ id: 'w1', address: SIGNER_PUBKEY });
      prismaStub.institutionApprovedToken.findFirst.resolves(VALID_TOKEN);
      prismaStub.institutionTransfer.findFirst.resolves(null);

      const now = new Date();
      prismaStub.institutionTransfer.create.resolves({
        id: 'txf-ok',
        transferCode: 'TXF-OK1-234',
        createdAt: now,
      });
      prismaStub.institutionTransfer.update.resolves({});
      prismaStub.institutionAuditLog.create.resolves({});

      // Mock sufficient balance
      const balanceData = Buffer.alloc(165);
      balanceData.writeBigUInt64LE(BigInt(5000_000000), 64);
      connectionStub.getTokenAccountsByOwner.resolves({
        value: [{ account: { data: balanceData } }],
      });

      // Stub executeOnChainTransfer
      sandbox.stub(service as any, 'executeOnChainTransfer').resolves('tx-sig-receipt-abc');

      // Build signature with the right labels
      const timestamp = new Date().toISOString();
      const message = [
        'EasyEscrow Internal Transfer',
        'From: Treasury Singapore',
        'To: Operations Dubai',
        'Amount: 250 USDC',
        `Timestamp: ${timestamp}`,
      ].join('\n');
      const sig = signMessage(message);

      const result = await service.transfer(CLIENT_ID, {
        fromAccountId: FROM_ACCOUNT_ID,
        toAccountId: TO_ACCOUNT_ID,
        tokenSymbol: 'USDC',
        amount: 250,
        walletSignature: sig,
        signerPublicKey: SIGNER_PUBKEY,
        timestamp,
        note: 'Quarterly rebalance',
      });

      expect(result.fromAccountLabel).to.equal('Treasury Singapore');
      expect(result.toAccountLabel).to.equal('Operations Dubai');
      expect(result.tokenSymbol).to.equal('USDC');
      expect(result.amount).to.equal(250);
      expect(result.status).to.equal('completed');
      expect(result.txSignature).to.be.a('string');
      expect(result.createdAt).to.equal(now.toISOString());

      // Verify audit log recorded completion
      const auditCalls = prismaStub.institutionAuditLog.create.getCalls();
      const completedLog = auditCalls.find(
        (c: any) => c.args[0].data.action === 'TRANSFER_COMPLETED'
      );
      expect(completedLog).to.exist;
    });
  });
});
