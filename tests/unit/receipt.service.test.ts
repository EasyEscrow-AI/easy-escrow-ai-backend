/**
 * Unit tests for Receipt Service
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  ReceiptService, 
  getReceiptService, 
  resetReceiptService 
} from '../../src/services/receipt.service';
import { CreateReceiptDTO, ReceiptQueryDTO } from '../../src/models/dto/receipt.dto';
import { resetReceiptSigningService } from '../../src/services/receipt-signing.service';

// Mock Prisma
jest.mock('../../src/config/database', () => ({
  prisma: {
    receipt: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Import mocked prisma
import { prisma } from '../../src/config/database';

describe('ReceiptService', () => {
  let service: ReceiptService;

  beforeEach(() => {
    // Reset singletons before each test
    resetReceiptService();
    resetReceiptSigningService();
    service = new ReceiptService();

    // Clear all mock calls
    jest.clearAllMocks();
  });

  afterEach(() => {
    resetReceiptService();
    resetReceiptSigningService();
  });

  const mockCreateReceiptDTO: CreateReceiptDTO = {
    agreementId: 'test-agreement-123',
    nftMint: 'NFT1234567890',
    price: '100.000000000',
    platformFee: '2.500000000',
    creatorRoyalty: '5.000000000',
    buyer: 'buyer-address-123',
    seller: 'seller-address-456',
    escrowTxId: 'escrow-tx-789',
    settlementTxId: 'settlement-tx-101112',
    createdAt: '2024-01-01T00:00:00.000Z',
    settledAt: '2024-01-02T00:00:00.000Z',
  };

  const mockDatabaseReceipt = {
    id: 'receipt-id-123',
    agreementId: 'test-agreement-123',
    nftMint: 'NFT1234567890',
    price: { toString: () => '100.000000000' },
    platformFee: { toString: () => '2.500000000' },
    creatorRoyalty: { toString: () => '5.000000000' },
    buyer: 'buyer-address-123',
    seller: 'seller-address-456',
    escrowTxId: 'escrow-tx-789',
    settlementTxId: 'settlement-tx-101112',
    receiptHash: 'hash123',
    signature: 'signature123',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    settledAt: new Date('2024-01-02T00:00:00.000Z'),
    generatedAt: new Date('2024-01-02T01:00:00.000Z'),
  };

  describe('generateReceipt', () => {
    it('should generate a new receipt successfully', async () => {
      (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.receipt.create as jest.Mock).mockResolvedValue(mockDatabaseReceipt);

      const result = await service.generateReceipt(mockCreateReceiptDTO);

      expect(result.success).toBe(true);
      expect(result.receipt).toBeDefined();
      expect(result.receipt?.agreementId).toBe(mockCreateReceiptDTO.agreementId);
      expect(prisma.receipt.create).toHaveBeenCalled();
    });

    it('should return existing receipt if already exists', async () => {
      (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(mockDatabaseReceipt);

      const result = await service.generateReceipt(mockCreateReceiptDTO);

      expect(result.success).toBe(true);
      expect(result.receipt).toBeDefined();
      expect(prisma.receipt.create).not.toHaveBeenCalled();
    });

    it('should handle errors during receipt generation', async () => {
      (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.receipt.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await service.generateReceipt(mockCreateReceiptDTO);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should generate hash and signature for new receipt', async () => {
      (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.receipt.create as jest.Mock).mockResolvedValue(mockDatabaseReceipt);

      const result = await service.generateReceipt(mockCreateReceiptDTO);

      expect(result.success).toBe(true);
      
      // Verify that create was called with hash and signature
      const createCall = (prisma.receipt.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.receiptHash).toBeDefined();
      expect(createCall.data.signature).toBeDefined();
    });
  });

  describe('getReceiptById', () => {
    it('should retrieve a receipt by ID', async () => {
      (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(mockDatabaseReceipt);

      const receipt = await service.getReceiptById('receipt-id-123');

      expect(receipt).toBeDefined();
      expect(receipt?.id).toBe('receipt-id-123');
      expect(prisma.receipt.findUnique).toHaveBeenCalledWith({
        where: { id: 'receipt-id-123' },
      });
    });

    it('should return null if receipt not found', async () => {
      (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(null);

      const receipt = await service.getReceiptById('non-existent-id');

      expect(receipt).toBeNull();
    });
  });

  describe('getReceiptByAgreementId', () => {
    it('should retrieve a receipt by agreement ID', async () => {
      (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(mockDatabaseReceipt);

      const receipt = await service.getReceiptByAgreementId('test-agreement-123');

      expect(receipt).toBeDefined();
      expect(receipt?.agreementId).toBe('test-agreement-123');
    });
  });

  describe('getReceiptByHash', () => {
    it('should retrieve a receipt by hash', async () => {
      (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(mockDatabaseReceipt);

      const receipt = await service.getReceiptByHash('hash123');

      expect(receipt).toBeDefined();
      expect(receipt?.receiptHash).toBe('hash123');
    });
  });

  describe('listReceipts', () => {
    it('should list receipts with pagination', async () => {
      const mockReceipts = [mockDatabaseReceipt];
      (prisma.receipt.findMany as jest.Mock).mockResolvedValue(mockReceipts);
      (prisma.receipt.count as jest.Mock).mockResolvedValue(1);

      const query: ReceiptQueryDTO = { page: 1, limit: 20 };
      const result = await service.listReceipts(query);

      expect(result.receipts).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
    });

    it('should filter receipts by buyer', async () => {
      (prisma.receipt.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.receipt.count as jest.Mock).mockResolvedValue(0);

      const query: ReceiptQueryDTO = { buyer: 'buyer-address-123' };
      await service.listReceipts(query);

      const findManyCall = (prisma.receipt.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.buyer).toBe('buyer-address-123');
    });

    it('should filter receipts by date range', async () => {
      (prisma.receipt.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.receipt.count as jest.Mock).mockResolvedValue(0);

      const query: ReceiptQueryDTO = {
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-01-31T23:59:59.999Z',
      };
      await service.listReceipts(query);

      const findManyCall = (prisma.receipt.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.generatedAt).toBeDefined();
      expect(findManyCall.where.generatedAt.gte).toBeDefined();
      expect(findManyCall.where.generatedAt.lte).toBeDefined();
    });

    it('should enforce maximum limit of 100', async () => {
      (prisma.receipt.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.receipt.count as jest.Mock).mockResolvedValue(0);

      const query: ReceiptQueryDTO = { limit: 500 };
      const result = await service.listReceipts(query);

      expect(result.limit).toBe(100);
    });
  });

  describe('verifyReceipt', () => {
    it('should verify a valid receipt', async () => {
      (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(mockDatabaseReceipt);

      const verification = await service.verifyReceipt('receipt-id-123');

      expect(verification.isValid).toBe(true);
      expect(verification.receiptHash).toBeDefined();
      expect(verification.signature).toBeDefined();
    });

    it('should throw error if receipt not found', async () => {
      (prisma.receipt.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyReceipt('non-existent-id')).rejects.toThrow('Receipt not found');
    });
  });

  describe('getReceiptService singleton', () => {
    it('should return a singleton instance', () => {
      const instance1 = getReceiptService();
      const instance2 = getReceiptService();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getReceiptService();
      resetReceiptService();
      const instance2 = getReceiptService();

      expect(instance1).not.toBe(instance2);
    });
  });
});

