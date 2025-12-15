/**
 * Unit Tests for Receipt Service
 * 
 * Tests receipt generation, validation, and retrieval
 * without requiring E2E setup or blockchain interactions.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { PrismaClient } from '../../src/generated/prisma';
import { ReceiptService } from '../../src/services/receipt.service';
import { Decimal } from '@prisma/client/runtime/library';
import { mockPrismaForTest, teardownPrismaMock } from '../helpers/prisma-mock';

describe('Receipt Service - Unit Tests', () => {
  let receiptService: ReceiptService;
  let prismaStub: any;

  beforeEach(() => {
    // Create Prisma stub
    prismaStub = {
      receipt: {
        create: sinon.stub(),
        findUnique: sinon.stub(),
        findMany: sinon.stub(),
        update: sinon.stub(),
        delete: sinon.stub(),
      },
    };

    // Setup mock Prisma client
    mockPrismaForTest(prismaStub);

    // Create service instance (will use mocked Prisma)
    receiptService = new ReceiptService();
  });

  afterEach(() => {
    sinon.restore();
    teardownPrismaMock();
  });

  describe('generateReceipt', () => {
    const validReceiptData = {
      agreementId: 'AGR-TEST-001',
      nftMint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      price: '100000000', // 0.1 USDC (in lamports)
      platformFee: '1000000', // 0.001 USDC
      buyer: 'BuyerPublicKey123',
      seller: 'SellerPublicKey456',
      escrowTxId: 'EscrowTxId789',
      depositNftTxId: 'DepositNftTxId101',
      depositUsdcTxId: 'DepositUsdcTxId102',
      settlementTxId: 'SettlementTxId103',
      createdAt: new Date('2025-01-23T00:00:00Z'),
      settledAt: new Date('2025-01-23T01:00:00Z'),
    };

    it('should generate receipt with all transaction IDs', async () => {
      const mockReceipt = {
        id: 'receipt-uuid-123',
        agreementId: validReceiptData.agreementId,
        nftMint: validReceiptData.nftMint,
        price: new Decimal(validReceiptData.price),
        platformFee: new Decimal(validReceiptData.platformFee),
        creatorRoyalty: null,
        buyer: validReceiptData.buyer,
        seller: validReceiptData.seller,
        escrowTxId: validReceiptData.escrowTxId,
        depositNftTxId: validReceiptData.depositNftTxId,
        depositUsdcTxId: validReceiptData.depositUsdcTxId,
        settlementTxId: validReceiptData.settlementTxId,
    receiptHash: 'hash123',
        signature: 'sig123',
        createdAt: validReceiptData.createdAt,
        settledAt: validReceiptData.settledAt,
        generatedAt: new Date(),
      };

      prismaStub.receipt.create.resolves(mockReceipt);

      const result = await receiptService.generateReceipt(validReceiptData);

      expect(result.success).to.be.true;
      expect(result.receipt).to.exist;
      expect(result.error).to.be.undefined;
      expect(result.receipt?.agreementId).to.equal(validReceiptData.agreementId);
      expect(result.receipt?.depositNftTxId).to.equal(validReceiptData.depositNftTxId);
      expect(result.receipt?.depositUsdcTxId).to.equal(validReceiptData.depositUsdcTxId);
      expect(result.receipt?.settlementTxId).to.equal(validReceiptData.settlementTxId);

      // Verify transactions array
      expect(result.receipt?.transactions).to.exist;
      expect(result.receipt?.transactions).to.have.lengthOf(4);

      const txTypes = result.receipt?.transactions.map((tx: any) => tx.type);
      expect(txTypes).to.include('INIT');
      expect(txTypes).to.include('DEPOSIT_NFT');
      expect(txTypes).to.include('DEPOSIT_USDC');
      expect(txTypes).to.include('SETTLEMENT');

      expect(prismaStub.receipt.create.calledOnce).to.be.true;
    });

    it('should generate receipt without optional deposit transaction IDs', async () => {
      const dataWithoutDepositTxIds = {
        ...validReceiptData,
        depositNftTxId: undefined,
        depositUsdcTxId: undefined,
      };

      const mockReceipt = {
        id: 'receipt-uuid-456',
        agreementId: dataWithoutDepositTxIds.agreementId,
        nftMint: dataWithoutDepositTxIds.nftMint,
        price: new Decimal(dataWithoutDepositTxIds.price),
        platformFee: new Decimal(dataWithoutDepositTxIds.platformFee),
        creatorRoyalty: null,
        buyer: dataWithoutDepositTxIds.buyer,
        seller: dataWithoutDepositTxIds.seller,
        escrowTxId: dataWithoutDepositTxIds.escrowTxId,
        depositNftTxId: null,
        depositUsdcTxId: null,
        settlementTxId: dataWithoutDepositTxIds.settlementTxId,
        receiptHash: 'hash456',
        signature: 'sig456',
        createdAt: dataWithoutDepositTxIds.createdAt,
        settledAt: dataWithoutDepositTxIds.settledAt,
        generatedAt: new Date(),
      };

      prismaStub.receipt.create.resolves(mockReceipt);

      const result = await receiptService.generateReceipt(dataWithoutDepositTxIds);

      expect(result.success).to.be.true;
      expect(result.receipt?.depositNftTxId).to.be.undefined;
      expect(result.receipt?.depositUsdcTxId).to.be.undefined;

      // Transactions array should only have INIT and SETTLEMENT
      expect(result.receipt?.transactions).to.have.lengthOf(2);
      const txTypes = result.receipt?.transactions.map((tx: any) => tx.type);
      expect(txTypes).to.include('INIT');
      expect(txTypes).to.include('SETTLEMENT');
      expect(txTypes).to.not.include('DEPOSIT_NFT');
      expect(txTypes).to.not.include('DEPOSIT_USDC');
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      prismaStub.receipt.create.rejects(dbError);

      const result = await receiptService.generateReceipt(validReceiptData);

      expect(result.success).to.be.false;
      expect(result.receipt).to.be.undefined;
      expect(result.error).to.exist;
      expect(result.error).to.include('Database connection failed');
    });

    it('should handle missing required fields', async () => {
      const invalidData = {
        ...validReceiptData,
        agreementId: '',
      };

      const result = await receiptService.generateReceipt(invalidData);

      expect(result.success).to.be.false;
      expect(result.error).to.exist;
    });

    it('should include creator royalty when provided', async () => {
      const dataWithRoyalty = {
        ...validReceiptData,
        creatorRoyalty: '500000',
      };

      const mockReceipt = {
        id: 'receipt-uuid-789',
        agreementId: dataWithRoyalty.agreementId,
        nftMint: dataWithRoyalty.nftMint,
        price: new Decimal(dataWithRoyalty.price),
        platformFee: new Decimal(dataWithRoyalty.platformFee),
        creatorRoyalty: new Decimal(dataWithRoyalty.creatorRoyalty!),
        buyer: dataWithRoyalty.buyer,
        seller: dataWithRoyalty.seller,
        escrowTxId: dataWithRoyalty.escrowTxId,
        depositNftTxId: dataWithRoyalty.depositNftTxId,
        depositUsdcTxId: dataWithRoyalty.depositUsdcTxId,
        settlementTxId: dataWithRoyalty.settlementTxId,
        receiptHash: 'hash789',
        signature: 'sig789',
        createdAt: dataWithRoyalty.createdAt,
        settledAt: dataWithRoyalty.settledAt,
        generatedAt: new Date(),
      };

      prismaStub.receipt.create.resolves(mockReceipt);

      const result = await receiptService.generateReceipt(dataWithRoyalty);

      expect(result.success).to.be.true;
      expect(result.receipt?.creatorRoyalty).to.equal('500000');
    });

    it('should generate unique receipt hashes for different agreements', async () => {
      const mockReceipt1 = {
        id: 'receipt-1',
        agreementId: 'AGR-001',
        nftMint: validReceiptData.nftMint,
        price: new Decimal(validReceiptData.price),
        platformFee: new Decimal(validReceiptData.platformFee),
        buyer: validReceiptData.buyer,
        seller: validReceiptData.seller,
        escrowTxId: validReceiptData.escrowTxId,
        settlementTxId: validReceiptData.settlementTxId,
        receiptHash: 'hash-001',
        signature: 'sig-001',
        createdAt: validReceiptData.createdAt,
        settledAt: validReceiptData.settledAt,
        generatedAt: new Date(),
        creatorRoyalty: null,
        depositNftTxId: null,
        depositUsdcTxId: null,
      };

      const mockReceipt2 = {
        ...mockReceipt1,
        id: 'receipt-2',
        agreementId: 'AGR-002',
        receiptHash: 'hash-002',
        signature: 'sig-002',
      };

      prismaStub.receipt.create.onFirstCall().resolves(mockReceipt1);
      prismaStub.receipt.create.onSecondCall().resolves(mockReceipt2);

      const result1 = await receiptService.generateReceipt({
        ...validReceiptData,
        agreementId: 'AGR-001',
      });

      const result2 = await receiptService.generateReceipt({
        ...validReceiptData,
        agreementId: 'AGR-002',
      });

      expect(result1.receipt?.receiptHash).to.not.equal(result2.receipt?.receiptHash);
      expect(prismaStub.receipt.create.calledTwice).to.be.true;
    });
  });

  describe('getReceiptByAgreementId', () => {
    it('should retrieve receipt by agreement ID', async () => {
      const mockReceipt = {
        id: 'receipt-uuid-123',
        agreementId: 'AGR-TEST-001',
        nftMint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        price: new Decimal('100000000'),
        platformFee: new Decimal('1000000'),
        creatorRoyalty: null,
        buyer: 'BuyerPublicKey123',
        seller: 'SellerPublicKey456',
        escrowTxId: 'EscrowTxId789',
        depositNftTxId: 'DepositNftTxId101',
        depositUsdcTxId: 'DepositUsdcTxId102',
        settlementTxId: 'SettlementTxId103',
        receiptHash: 'hash123',
        signature: 'sig123',
        createdAt: new Date('2025-01-23T00:00:00Z'),
        settledAt: new Date('2025-01-23T01:00:00Z'),
        generatedAt: new Date('2025-01-23T01:00:01Z'),
      };

      prismaStub.receipt.findUnique.resolves(mockReceipt);

      const result = await receiptService.getReceiptByAgreementId('AGR-TEST-001');

      expect(result).to.exist;
      expect(result?.agreementId).to.equal('AGR-TEST-001');
      expect(result?.transactions).to.exist;
      expect(result?.transactions.length).to.be.greaterThan(0);

      expect(prismaStub.receipt.findUnique.calledWith({
        where: { agreementId: 'AGR-TEST-001' },
      })).to.be.true;
    });

    it('should return null when receipt not found', async () => {
      prismaStub.receipt.findUnique.resolves(null);

      const result = await receiptService.getReceiptByAgreementId('AGR-NONEXISTENT');

      expect(result).to.be.null;
    });

    it('should throw error on database errors', async () => {
      const dbError = new Error('Database error');
      prismaStub.receipt.findUnique.rejects(dbError);

      try {
        await receiptService.getReceiptByAgreementId('AGR-TEST-001');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.equal('Database error');
      }
    });
  });

  describe('Transaction Array Construction', () => {
    it('should construct transactions array with all transaction types', async () => {
      const mockReceipt = {
        id: 'receipt-uuid-123',
        agreementId: 'AGR-TEST-001',
        escrowTxId: 'EscrowTx123',
        depositNftTxId: 'NftDepositTx456',
        depositUsdcTxId: 'UsdcDepositTx789',
        settlementTxId: 'SettleTx012',
        createdAt: new Date('2025-01-23T00:00:00Z'),
        settledAt: new Date('2025-01-23T01:00:00Z'),
        nftMint: 'NftMint',
        price: new Decimal('100000000'),
        platformFee: new Decimal('1000000'),
        buyer: 'Buyer',
        seller: 'Seller',
        receiptHash: 'hash',
        signature: 'sig',
        generatedAt: new Date(),
        creatorRoyalty: null,
      };

      prismaStub.receipt.findUnique.resolves(mockReceipt);

      const result = await receiptService.getReceiptByAgreementId('AGR-TEST-001');

      expect(result).to.exist;
      expect(result?.transactions).to.have.lengthOf(4);

      // Verify INIT transaction
      const initTx = result?.transactions.find((tx: any) => tx.type === 'INIT');
      expect(initTx).to.exist;
      expect(initTx?.transactionId).to.equal('EscrowTx123');
      expect(initTx?.timestamp).to.exist;

      // Verify DEPOSIT_NFT transaction
      const depositNftTx = result?.transactions.find((tx: any) => tx.type === 'DEPOSIT_NFT');
      expect(depositNftTx).to.exist;
      expect(depositNftTx?.transactionId).to.equal('NftDepositTx456');

      // Verify DEPOSIT_USDC transaction
      const depositUsdcTx = result?.transactions.find((tx: any) => tx.type === 'DEPOSIT_USDC');
      expect(depositUsdcTx).to.exist;
      expect(depositUsdcTx?.transactionId).to.equal('UsdcDepositTx789');

      // Verify SETTLEMENT transaction
      const settleTx = result?.transactions.find((tx: any) => tx.type === 'SETTLEMENT');
      expect(settleTx).to.exist;
      expect(settleTx?.transactionId).to.equal('SettleTx012');
      expect(settleTx?.timestamp).to.exist;
    });

    it('should omit missing deposit transactions from array', async () => {
      const mockReceipt = {
        id: 'receipt-uuid-456',
        agreementId: 'AGR-TEST-002',
        escrowTxId: 'EscrowTx123',
        depositNftTxId: null,
        depositUsdcTxId: null,
        settlementTxId: 'SettleTx012',
        createdAt: new Date('2025-01-23T00:00:00Z'),
        settledAt: new Date('2025-01-23T01:00:00Z'),
        nftMint: 'NftMint',
        price: new Decimal('100000000'),
        platformFee: new Decimal('1000000'),
        buyer: 'Buyer',
        seller: 'Seller',
        receiptHash: 'hash',
        signature: 'sig',
        generatedAt: new Date(),
        creatorRoyalty: null,
      };

      prismaStub.receipt.findUnique.resolves(mockReceipt);

      const result = await receiptService.getReceiptByAgreementId('AGR-TEST-002');

      expect(result).to.exist;
      expect(result?.transactions).to.have.lengthOf(2);

      const txTypes = result?.transactions.map((tx: any) => tx.type);
      expect(txTypes).to.include('INIT');
      expect(txTypes).to.include('SETTLEMENT');
      expect(txTypes).to.not.include('DEPOSIT_NFT');
      expect(txTypes).to.not.include('DEPOSIT_USDC');
    });
  });

  describe('Receipt File Storage', () => {
    it('should verify receipt generation completes successfully', async () => {
      const mockReceipt = {
        id: 'receipt-file-test',
        agreementId: 'AGR-FILE-TEST',
        nftMint: 'NftMint',
        price: new Decimal('100000000'),
        platformFee: new Decimal('1000000'),
        buyer: 'Buyer',
        seller: 'Seller',
        escrowTxId: 'EscrowTx',
        depositNftTxId: 'NftTx',
        depositUsdcTxId: 'UsdcTx',
        settlementTxId: 'SettleTx',
        receiptHash: 'hash',
        signature: 'sig',
        createdAt: new Date(),
        settledAt: new Date(),
        generatedAt: new Date(),
        creatorRoyalty: null,
      };

      prismaStub.receipt.create.resolves(mockReceipt);

      const result = await receiptService.generateReceipt({
        agreementId: 'AGR-FILE-TEST',
        nftMint: 'NftMint',
        price: '100000000',
        platformFee: '1000000',
        buyer: 'Buyer',
        seller: 'Seller',
        escrowTxId: 'EscrowTx',
        depositNftTxId: 'NftTx',
        depositUsdcTxId: 'UsdcTx',
        settlementTxId: 'SettleTx',
        createdAt: new Date(),
        settledAt: new Date(),
      });

      expect(result.success).to.be.true;
      expect(result.receipt).to.exist;
      
      // Note: File storage is a side effect that doesn't affect the result
      // In integration tests, we'd verify the file exists
      // For unit tests, we verify the receipt generation succeeds
    });
  });
});
