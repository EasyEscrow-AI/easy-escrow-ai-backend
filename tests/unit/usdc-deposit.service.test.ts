/**
 * Unit Tests for USDC Deposit Service
 * 
 * Tests USDC deposit detection, amount validation,
 * and transaction log creation.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { PublicKey, AccountInfo, Context } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { UsdcDepositService, resetUsdcDepositService } from '../../src/services/usdc-deposit.service';
import * as solanaService from '../../src/services/solana.service';
import * as transactionLogService from '../../src/services/transaction-log.service';
import { Decimal } from '@prisma/client/runtime/library';
import { DepositStatus, AgreementStatus } from '../../src/generated/prisma';
import { mockPrismaForTest, teardownPrismaMock } from '../helpers/prisma-mock';

describe('USDC Deposit Service - Unit Tests', () => {
  let usdcDepositService: UsdcDepositService;
  let prismaStub: any;
  let solanaServiceStub: any;
  let transactionLogServiceStub: any;
  let configStub: any;

  const USDC_MINT = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
  const USDC_DECIMALS = 6;

  beforeEach(() => {
    // Reset service instance
    resetUsdcDepositService();

    // Stub config
    configStub = {
      usdc: {
        mintAddress: USDC_MINT,
      },
    };

    // Create Prisma stub
    prismaStub = {
      deposit: {
        findFirst: sinon.stub(),
        create: sinon.stub(),
        update: sinon.stub(),
      },
      agreement: {
        findUnique: sinon.stub(),
        update: sinon.stub(),
      },
    };

    // Setup mock Prisma client
    mockPrismaForTest(prismaStub);

    // Stub Solana service
    solanaServiceStub = {
      getAccountInfo: sinon.stub(),
      getRecentTransactionSignature: sinon.stub(),
    };
    sinon.stub(solanaService, 'getSolanaService').returns(solanaServiceStub as any);

    // Stub Transaction Log service
    transactionLogServiceStub = {
      captureTransaction: sinon.stub(),
    };
    sinon.stub(transactionLogService, 'getTransactionLogService').returns(transactionLogServiceStub as any);
    
    // Require the config module and stub it
    const configModule = require('../../src/config');
    sinon.stub(configModule, 'config').value(configStub);

    // Create service instance (will use mocked Prisma)
    usdcDepositService = new UsdcDepositService();
  });

  afterEach(() => {
    sinon.restore();
    teardownPrismaMock();
  });

  /**
   * Helper function to convert USDC to lamports
   */
  function usdcToLamports(usdc: number): bigint {
    return BigInt(Math.floor(usdc * (10 ** USDC_DECIMALS)));
  }

  /**
   * Helper function to create mock token account data
   */
  function createMockAccountInfo(amount: bigint, mint: string = USDC_MINT): AccountInfo<Buffer> {
    const accountData = Buffer.alloc(AccountLayout.span);
    const mockData = {
      mint: new PublicKey(mint),
      owner: new PublicKey('OwnerAddress123'),
      amount,
      state: 1,
      delegateOption: 0 as 0 | 1,
      delegate: new PublicKey('11111111111111111111111111111111'),
      isNativeOption: 0 as 0 | 1,
      isNative: BigInt(0),
      delegatedAmount: BigInt(0),
      closeAuthorityOption: 0 as 0 | 1,
      closeAuthority: new PublicKey('11111111111111111111111111111111'),
    };

    AccountLayout.encode(mockData, accountData);

    return {
      data: accountData,
      owner: TOKEN_PROGRAM_ID,
      lamports: 1000000,
      executable: false,
      rentEpoch: 0,
    };
  }

  describe('handleUsdcAccountChange', () => {
    const agreementId = 'test-agreement-id';
    const publicKey = 'USDCDepositAddress123';
    const context: Context = { slot: 100 };

    it('should successfully detect new USDC deposit with correct amount', async () => {
      const price = new Decimal('0.1'); // 0.1 USDC
      const amount = usdcToLamports(0.1);

      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        price,
        buyer: 'BuyerAddress',
        usdcDepositAddr: publicKey,
        status: 'PENDING',
      };

      const mockDeposit = {
        id: 'deposit-123',
        agreementId,
        type: 'USDC',
        status: 'CONFIRMED',
        amount: new Decimal('0.1'),
      };

      prismaStub.deposit.findFirst.resolves(null); // No existing deposit
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves(mockDeposit);
      prismaStub.deposit.findFirst.onSecondCall().resolves(null); // No NFT deposit
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-signature-123');

      const accountInfo = createMockAccountInfo(amount);
      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(result.depositId).to.equal('deposit-123');
      expect(result.amount).to.equal('0.100000');
      expect(result.status).to.equal('CONFIRMED');

      expect(prismaStub.deposit.create.calledOnce).to.be.true;
      expect(transactionLogServiceStub.captureTransaction.calledOnce).to.be.true;
    });

    it('should reject deposit with invalid account owner', async () => {
      const accountInfo = createMockAccountInfo(usdcToLamports(0.1));
      accountInfo.owner = new PublicKey('InvalidOwner123');

      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include('Invalid account owner');
    });

    it('should reject deposit with wrong mint address', async () => {
      const wrongMint = 'WrongMintAddress123';
      const accountInfo = createMockAccountInfo(usdcToLamports(0.1), wrongMint);

      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include('not USDC');
    });

    it('should warn about insufficient deposit amount', async () => {
      const price = new Decimal('0.1'); // Expected 0.1 USDC
      const amount = usdcToLamports(0.05); // But only 0.05 deposited

      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        price,
        buyer: 'BuyerAddress',
        usdcDepositAddr: publicKey,
        status: 'PENDING',
      };

      const mockDeposit = {
        id: 'deposit-123',
        agreementId,
        type: 'USDC',
        status: 'CONFIRMED',
        amount: new Decimal('0.05'),
      };

      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves(mockDeposit);

      const accountInfo = createMockAccountInfo(amount);
      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      // Should still create deposit but not trigger settlement logic
      expect(result.success).to.be.true;
      expect(result.amount).to.equal('0.050000');
      expect(prismaStub.agreement.update.called).to.be.false; // Status not updated
      expect(transactionLogServiceStub.captureTransaction.called).to.be.false; // No log for invalid amount
    });

    it('should handle pending deposit (amount = 0)', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        price: new Decimal('0.1'),
        buyer: 'BuyerAddress',
        usdcDepositAddr: publicKey,
        status: 'PENDING',
      };

      const mockDeposit = {
        id: 'deposit-123',
        agreementId,
        type: 'USDC',
        status: 'PENDING',
        amount: new Decimal('0'),
      };

      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves(mockDeposit);

      const accountInfo = createMockAccountInfo(BigInt(0));
      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(result.status).to.equal('PENDING');
      expect(transactionLogServiceStub.captureTransaction.called).to.be.false; // No log for pending
    });

    it('should update existing pending deposit to confirmed', async () => {
      const existingDeposit = {
        id: 'existing-deposit-123',
        status: 'PENDING',
        amount: new Decimal('0'),
      };

      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        price: new Decimal('0.1'),
        buyer: 'BuyerAddress',
        usdcDepositAddr: publicKey,
        status: 'PENDING',
      };

      prismaStub.deposit.findFirst.resolves(existingDeposit);
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.update.resolves({ ...existingDeposit, status: 'CONFIRMED', amount: new Decimal('0.1') });
      prismaStub.deposit.findFirst.onSecondCall().resolves(null); // No NFT deposit
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-signature-update');

      const accountInfo = createMockAccountInfo(usdcToLamports(0.1));
      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(result.status).to.equal('CONFIRMED');
      expect(prismaStub.deposit.update.calledOnce).to.be.true;
      expect(transactionLogServiceStub.captureTransaction.calledOnce).to.be.true;
    });

    it('should return existing confirmed deposit without changes', async () => {
      const existingDeposit = {
        id: 'existing-deposit-123',
        status: 'CONFIRMED',
        amount: new Decimal('0.1'),
      };

      prismaStub.deposit.findFirst.resolves(existingDeposit);

      const accountInfo = createMockAccountInfo(usdcToLamports(0.1));
      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(result.depositId).to.equal('existing-deposit-123');
      expect(result.amount).to.equal('0.1');
      expect(result.status).to.equal('CONFIRMED');
      expect(prismaStub.deposit.create.called).to.be.false;
      expect(prismaStub.deposit.update.called).to.be.false;
    });

    it('should handle agreement not found', async () => {
      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(null);

      const accountInfo = createMockAccountInfo(usdcToLamports(0.1));
      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include('Agreement not found');
    });

    it('should continue if transaction log creation fails', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        price: new Decimal('0.1'),
        buyer: 'BuyerAddress',
        usdcDepositAddr: publicKey,
        status: 'PENDING',
      };

      const mockDeposit = {
        id: 'deposit-123',
        agreementId,
        type: 'USDC',
        status: 'CONFIRMED',
        amount: new Decimal('0.1'),
      };

      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves(mockDeposit);
      prismaStub.deposit.findFirst.onSecondCall().resolves(null);
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-signature');
      transactionLogServiceStub.captureTransaction.rejects(new Error('DB error'));

      const accountInfo = createMockAccountInfo(usdcToLamports(0.1));
      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      // Should still succeed despite transaction log error
      expect(result.success).to.be.true;
      expect(result.depositId).to.equal('deposit-123');
    });

    it('should handle transaction signature not found gracefully', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        price: new Decimal('0.1'),
        buyer: 'BuyerAddress',
        usdcDepositAddr: publicKey,
        status: 'PENDING',
      };

      const mockDeposit = {
        id: 'deposit-123',
        agreementId,
        type: 'USDC',
        status: 'CONFIRMED',
        amount: new Decimal('0.1'),
      };

      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves(mockDeposit);
      prismaStub.deposit.findFirst.onSecondCall().resolves(null);
      solanaServiceStub.getRecentTransactionSignature.resolves(null); // No signature found

      const accountInfo = createMockAccountInfo(usdcToLamports(0.1));
      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(transactionLogServiceStub.captureTransaction.called).to.be.false;
    });
  });

  describe('Agreement Status Updates', () => {
    const agreementId = 'test-agreement-id';
    const publicKey = 'USDCDepositAddress123';
    const context: Context = { slot: 100 };

    it('should update status to USDC_LOCKED when only USDC is deposited', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        price: new Decimal('0.1'),
        buyer: 'BuyerAddress',
        usdcDepositAddr: publicKey,
        status: 'PENDING',
      };

      prismaStub.deposit.findFirst.onFirstCall().resolves(null); // No existing USDC deposit
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves({ id: 'deposit-123' });
      prismaStub.deposit.findFirst.onSecondCall().resolves(null); // No NFT deposit
      prismaStub.agreement.update.resolves({ ...mockAgreement, status: 'USDC_LOCKED' });
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-sig');

      const accountInfo = createMockAccountInfo(usdcToLamports(0.1));
      await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(prismaStub.agreement.update.calledOnce).to.be.true;
      const updateCall = prismaStub.agreement.update.getCall(0);
      expect(updateCall.args[0].data.status).to.equal('USDC_LOCKED');
    });

    it('should update status to BOTH_LOCKED when both assets are deposited', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        price: new Decimal('0.1'),
        buyer: 'BuyerAddress',
        usdcDepositAddr: publicKey,
        status: 'NFT_LOCKED',
      };

      const mockNftDeposit = {
        id: 'nft-deposit-123',
        type: 'NFT',
        status: 'CONFIRMED',
      };

      prismaStub.deposit.findFirst.onFirstCall().resolves(null); // No existing USDC deposit
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves({ id: 'deposit-123' });
      prismaStub.deposit.findFirst.onSecondCall().resolves(mockNftDeposit); // NFT is deposited
      prismaStub.agreement.update.resolves({ ...mockAgreement, status: 'BOTH_LOCKED' });
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-sig');

      const accountInfo = createMockAccountInfo(usdcToLamports(0.1));
      await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(prismaStub.agreement.update.calledOnce).to.be.true;
      const updateCall = prismaStub.agreement.update.getCall(0);
      expect(updateCall.args[0].data.status).to.equal('BOTH_LOCKED');
    });
  });

  describe('getUsdcBalance', () => {
    const publicKey = 'USDCAccountAddress123';

    it('should return USDC balance for valid account', async () => {
      const amount = usdcToLamports(1.5); // 1.5 USDC
      const accountInfo = createMockAccountInfo(amount);

      solanaServiceStub.getAccountInfo.resolves(accountInfo);

      const balance = await usdcDepositService.getUsdcBalance(publicKey);

      expect(balance).to.equal('1.500000');
    });

    it('should return null for non-existent account', async () => {
      solanaServiceStub.getAccountInfo.resolves(null);

      const balance = await usdcDepositService.getUsdcBalance(publicKey);

      expect(balance).to.be.null;
    });

    it('should return null for non-USDC account', async () => {
      const wrongMint = 'WrongMintAddress123';
      const accountInfo = createMockAccountInfo(usdcToLamports(1.0), wrongMint);

      solanaServiceStub.getAccountInfo.resolves(accountInfo);

      const balance = await usdcDepositService.getUsdcBalance(publicKey);

      expect(balance).to.be.null;
    });

    it('should handle errors gracefully', async () => {
      solanaServiceStub.getAccountInfo.rejects(new Error('RPC error'));

      const balance = await usdcDepositService.getUsdcBalance(publicKey);

      expect(balance).to.be.null;
    });
  });

  describe('Amount Validation', () => {
    const agreementId = 'test-agreement-id';
    const publicKey = 'USDCDepositAddress123';
    const context: Context = { slot: 100 };

    it('should handle small amounts with correct decimal precision', async () => {
      const price = new Decimal('0.000001'); // 1 micro-USDC
      const amount = usdcToLamports(0.000001);

      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        price,
        buyer: 'BuyerAddress',
        usdcDepositAddr: publicKey,
        status: 'PENDING',
      };

      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves({ id: 'deposit-123', status: 'CONFIRMED' });
      prismaStub.deposit.findFirst.onSecondCall().resolves(null);
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-sig');

      const accountInfo = createMockAccountInfo(amount);
      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(result.amount).to.equal('0.000001');
    });

    it('should handle large amounts correctly', async () => {
      const price = new Decimal('1000000'); // 1 million USDC
      const amount = usdcToLamports(1000000);

      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        price,
        buyer: 'BuyerAddress',
        usdcDepositAddr: publicKey,
        status: 'PENDING',
      };

      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves({ id: 'deposit-123', status: 'CONFIRMED' });
      prismaStub.deposit.findFirst.onSecondCall().resolves(null);
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-sig');

      const accountInfo = createMockAccountInfo(amount);
      const result = await usdcDepositService.handleUsdcAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(result.amount).to.equal('1000000.000000');
    });
  });
});

