/**
 * Unit Tests for Transaction Log Service
 * 
 * Tests transaction logging, querying, stats, and cleanup operations.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { Connection } from '@solana/web3.js';
import {
  TransactionLogService,
  resetTransactionLogService,
  TransactionOperationType,
  TransactionStatusType,
} from '../../src/services/transaction-log.service';
import { mockPrismaForTest, teardownPrismaMock } from '../helpers/prisma-mock';

describe('Transaction Log Service - Unit Tests', () => {
  let transactionLogService: TransactionLogService;
  let prismaStub: any;
  let connectionStub: any;

  beforeEach(() => {
    // Reset service instance
    resetTransactionLogService();

    // Create Prisma stub
    prismaStub = {
      transactionLog: {
        findUnique: sinon.stub(),
        findMany: sinon.stub(),
        create: sinon.stub(),
        update: sinon.stub(),
        deleteMany: sinon.stub(),
        count: sinon.stub(),
      },
    };

    // Setup mock Prisma client
    mockPrismaForTest(prismaStub);

    // Create Solana connection stub
    connectionStub = sinon.createStubInstance(Connection);

    // Create service instance (will use mocked Prisma)
    transactionLogService = new TransactionLogService(
      connectionStub,
      'https://explorer.solana.com/tx'
    );
  });

  afterEach(() => {
    sinon.restore();
    teardownPrismaMock();
  });

  describe('captureTransaction', () => {
    it('should create new transaction log successfully', async () => {
      const input = {
        txId: 'tx-signature-123',
        operationType: TransactionOperationType.DEPOSIT_USDC,
        agreementId: 'AGR-TEST-001',
        status: TransactionStatusType.CONFIRMED,
        blockHeight: BigInt(100),
      };

      const mockLog = {
        id: 'log-123',
        txId: input.txId,
        operationType: input.operationType,
        agreementId: input.agreementId,
        status: input.status,
        blockHeight: input.blockHeight,
        slot: null,
        errorMessage: null,
        timestamp: new Date(),
      };

      prismaStub.transactionLog.findUnique.resolves(null); // Not exists
      prismaStub.transactionLog.create.resolves(mockLog);

      const result = await transactionLogService.captureTransaction(input);

      expect(result.id).to.equal('log-123');
      expect(result.txId).to.equal(input.txId);
      expect(result.operationType).to.equal(input.operationType);
      expect(result.agreementId).to.equal(input.agreementId);
      expect(prismaStub.transactionLog.create.calledOnce).to.be.true;
    });

    it('should return existing log if transaction already logged', async () => {
      const existingLog = {
        id: 'existing-log-123',
        txId: 'tx-signature-123',
        operationType: TransactionOperationType.DEPOSIT_NFT,
        agreementId: 'AGR-TEST-001',
        status: TransactionStatusType.CONFIRMED,
        blockHeight: BigInt(100),
        slot: null,
        errorMessage: null,
        timestamp: new Date(),
      };

      prismaStub.transactionLog.findUnique.resolves(existingLog);

      const result = await transactionLogService.captureTransaction({
        txId: 'tx-signature-123',
        operationType: TransactionOperationType.DEPOSIT_NFT,
      });

      expect(result.id).to.equal('existing-log-123');
      expect(prismaStub.transactionLog.create.called).to.be.false;
    });

    it('should handle transaction without agreement ID', async () => {
      const input = {
        txId: 'tx-signature-456',
        operationType: TransactionOperationType.OTHER,
      };

      const mockLog = {
        id: 'log-456',
        txId: input.txId,
        operationType: input.operationType,
        agreementId: null,
        status: TransactionStatusType.PENDING,
        blockHeight: null,
        slot: null,
        errorMessage: null,
        timestamp: new Date(),
      };

      prismaStub.transactionLog.findUnique.resolves(null);
      prismaStub.transactionLog.create.resolves(mockLog);

      const result = await transactionLogService.captureTransaction(input);

      expect(result.agreementId).to.be.null;
    });

    it('should default to PENDING status if not provided', async () => {
      const input = {
        txId: 'tx-signature-789',
        operationType: TransactionOperationType.INIT_ESCROW,
        agreementId: 'AGR-TEST-002',
      };

      const mockLog = {
        id: 'log-789',
        txId: input.txId,
        operationType: input.operationType,
        agreementId: input.agreementId,
        status: TransactionStatusType.PENDING,
        blockHeight: null,
        slot: null,
        errorMessage: null,
        timestamp: new Date(),
      };

      prismaStub.transactionLog.findUnique.resolves(null);
      prismaStub.transactionLog.create.resolves(mockLog);

      const result = await transactionLogService.captureTransaction(input);

      expect(result.status).to.equal(TransactionStatusType.PENDING);
    });

    it('should handle errors gracefully', async () => {
      prismaStub.transactionLog.findUnique.rejects(new Error('DB error'));

      try {
        await transactionLogService.captureTransaction({
          txId: 'tx-error',
          operationType: TransactionOperationType.SETTLE,
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Failed to capture transaction');
      }
    });
  });

  describe('updateTransactionStatus', () => {
    it('should update transaction status successfully', async () => {
      const txId = 'tx-signature-123';
      const updatedLog = {
        id: 'log-123',
        txId,
        operationType: TransactionOperationType.DEPOSIT_USDC,
        agreementId: 'AGR-TEST-001',
        status: TransactionStatusType.CONFIRMED,
        blockHeight: BigInt(100),
        slot: null,
        errorMessage: null,
        timestamp: new Date(),
      };

      prismaStub.transactionLog.update.resolves(updatedLog);

      const result = await transactionLogService.updateTransactionStatus(
        txId,
        TransactionStatusType.CONFIRMED
      );

      expect(result.status).to.equal(TransactionStatusType.CONFIRMED);
      expect(prismaStub.transactionLog.update.calledOnce).to.be.true;
    });

    it('should update status with error message', async () => {
      const txId = 'tx-signature-failed';
      const errorMessage = 'Insufficient funds';
      const updatedLog = {
        id: 'log-failed',
        txId,
        operationType: TransactionOperationType.SETTLE,
        agreementId: 'AGR-TEST-001',
        status: TransactionStatusType.FAILED,
        blockHeight: BigInt(100),
        slot: null,
        errorMessage,
        timestamp: new Date(),
      };

      prismaStub.transactionLog.update.resolves(updatedLog);

      const result = await transactionLogService.updateTransactionStatus(
        txId,
        TransactionStatusType.FAILED,
        errorMessage
      );

      expect(result.status).to.equal(TransactionStatusType.FAILED);
      expect(result.errorMessage).to.equal(errorMessage);
    });

    it('should handle non-existent transaction', async () => {
      prismaStub.transactionLog.update.rejects(new Error('Record not found'));

      try {
        await transactionLogService.updateTransactionStatus(
          'non-existent-tx',
          TransactionStatusType.CONFIRMED
        );
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Failed to update transaction status');
      }
    });
  });

  describe('getTransactionById', () => {
    it('should return transaction with explorer URL', async () => {
      const mockLog = {
        id: 'log-123',
        txId: 'tx-signature-123',
        operationType: TransactionOperationType.DEPOSIT_USDC,
        agreementId: 'AGR-TEST-001',
        status: TransactionStatusType.CONFIRMED,
        blockHeight: BigInt(100),
        slot: null,
        errorMessage: null,
        timestamp: new Date(),
      };

      prismaStub.transactionLog.findUnique.resolves(mockLog);

      const result = await transactionLogService.getTransactionById('tx-signature-123');

      expect(result).to.not.be.null;
      expect(result?.txId).to.equal('tx-signature-123');
      expect(result?.explorerUrl).to.equal('https://explorer.solana.com/tx/tx-signature-123');
    });

    it('should return null for non-existent transaction', async () => {
      prismaStub.transactionLog.findUnique.resolves(null);

      const result = await transactionLogService.getTransactionById('non-existent-tx');

      expect(result).to.be.null;
    });
  });

  describe('getTransactionsByAgreement', () => {
    it('should return all transactions for an agreement', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          txId: 'tx-init',
          operationType: TransactionOperationType.INIT_ESCROW,
          agreementId: 'AGR-TEST-001',
          status: TransactionStatusType.CONFIRMED,
          blockHeight: BigInt(100),
          slot: null,
          errorMessage: null,
          timestamp: new Date('2025-01-23T00:00:00Z'),
        },
        {
          id: 'log-2',
          txId: 'tx-deposit-nft',
          operationType: TransactionOperationType.DEPOSIT_NFT,
          agreementId: 'AGR-TEST-001',
          status: TransactionStatusType.CONFIRMED,
          blockHeight: BigInt(101),
          slot: null,
          errorMessage: null,
          timestamp: new Date('2025-01-23T00:01:00Z'),
        },
        {
          id: 'log-3',
          txId: 'tx-deposit-usdc',
          operationType: TransactionOperationType.DEPOSIT_USDC,
          agreementId: 'AGR-TEST-001',
          status: TransactionStatusType.CONFIRMED,
          blockHeight: BigInt(102),
          slot: null,
          errorMessage: null,
          timestamp: new Date('2025-01-23T00:02:00Z'),
        },
      ];

      prismaStub.transactionLog.findMany.resolves(mockLogs);

      const result = await transactionLogService.getTransactionsByAgreement('AGR-TEST-001');

      expect(result).to.have.lengthOf(3);
      expect(result[0].explorerUrl).to.exist;
      expect(result[1].explorerUrl).to.exist;
      expect(result[2].explorerUrl).to.exist;
    });

    it('should return empty array for agreement with no transactions', async () => {
      prismaStub.transactionLog.findMany.resolves([]);

      const result = await transactionLogService.getTransactionsByAgreement('AGR-NO-TX');

      expect(result).to.have.lengthOf(0);
    });
  });

  describe('searchTransactionLogs', () => {
    it('should search with filters and pagination', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          txId: 'tx-1',
          operationType: TransactionOperationType.DEPOSIT_USDC,
          agreementId: 'AGR-TEST-001',
          status: TransactionStatusType.CONFIRMED,
          blockHeight: BigInt(100),
          slot: null,
          errorMessage: null,
          timestamp: new Date(),
        },
      ];

      prismaStub.transactionLog.findMany.resolves(mockLogs);
      prismaStub.transactionLog.count.resolves(10);

      const result = await transactionLogService.searchTransactionLogs({
        agreementId: 'AGR-TEST-001',
        operationType: TransactionOperationType.DEPOSIT_USDC,
        status: TransactionStatusType.CONFIRMED,
        limit: 5,
        offset: 0,
      });

      expect(result.logs).to.have.lengthOf(1);
      expect(result.total).to.equal(10);
      expect(result.limit).to.equal(5);
      expect(result.offset).to.equal(0);
    });

    it('should enforce maximum limit of 100', async () => {
      prismaStub.transactionLog.findMany.resolves([]);
      prismaStub.transactionLog.count.resolves(0);

      const result = await transactionLogService.searchTransactionLogs({
        limit: 200, // Requesting more than max
      });

      expect(result.limit).to.equal(100); // Should be capped at 100
    });

    it('should search by transaction ID partial match', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          txId: 'tx-signature-abc123',
          operationType: TransactionOperationType.SETTLE,
          agreementId: 'AGR-TEST-001',
          status: TransactionStatusType.CONFIRMED,
          blockHeight: BigInt(100),
          slot: null,
          errorMessage: null,
          timestamp: new Date(),
        },
      ];

      prismaStub.transactionLog.findMany.resolves(mockLogs);
      prismaStub.transactionLog.count.resolves(1);

      const result = await transactionLogService.searchTransactionLogs({
        txId: 'abc123',
      });

      expect(result.logs).to.have.lengthOf(1);
      expect(result.logs[0].txId).to.include('abc123');
    });

    it('should filter by date range', async () => {
      prismaStub.transactionLog.findMany.resolves([]);
      prismaStub.transactionLog.count.resolves(0);

      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-01-31');

      await transactionLogService.searchTransactionLogs({
        dateFrom,
        dateTo,
      });

      const findManyCall = prismaStub.transactionLog.findMany.getCall(0);
      expect(findManyCall.args[0].where.timestamp).to.deep.equal({
        gte: dateFrom,
        lte: dateTo,
      });
    });
  });

  describe('getAgreementTransactionStats', () => {
    it('should calculate statistics correctly', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          txId: 'tx-1',
          operationType: TransactionOperationType.INIT_ESCROW,
          agreementId: 'AGR-TEST-001',
          status: TransactionStatusType.CONFIRMED,
          blockHeight: BigInt(100),
          slot: null,
          errorMessage: null,
          timestamp: new Date('2025-01-23T00:00:00Z'),
        },
        {
          id: 'log-2',
          txId: 'tx-2',
          operationType: TransactionOperationType.DEPOSIT_NFT,
          agreementId: 'AGR-TEST-001',
          status: TransactionStatusType.CONFIRMED,
          blockHeight: BigInt(101),
          slot: null,
          errorMessage: null,
          timestamp: new Date('2025-01-23T00:01:00Z'),
        },
        {
          id: 'log-3',
          txId: 'tx-3',
          operationType: TransactionOperationType.DEPOSIT_USDC,
          agreementId: 'AGR-TEST-001',
          status: TransactionStatusType.CONFIRMED,
          blockHeight: BigInt(102),
          slot: null,
          errorMessage: null,
          timestamp: new Date('2025-01-23T00:02:00Z'),
        },
        {
          id: 'log-4',
          txId: 'tx-4',
          operationType: TransactionOperationType.SETTLE,
          agreementId: 'AGR-TEST-001',
          status: TransactionStatusType.PENDING,
          blockHeight: BigInt(103),
          slot: null,
          errorMessage: null,
          timestamp: new Date('2025-01-23T00:03:00Z'),
        },
      ];

      prismaStub.transactionLog.findMany.resolves(mockLogs);

      const result = await transactionLogService.getAgreementTransactionStats('AGR-TEST-001');

      expect(result.totalTransactions).to.equal(4);
      expect(result.byOperationType[TransactionOperationType.INIT_ESCROW]).to.equal(1);
      expect(result.byOperationType[TransactionOperationType.DEPOSIT_NFT]).to.equal(1);
      expect(result.byOperationType[TransactionOperationType.DEPOSIT_USDC]).to.equal(1);
      expect(result.byOperationType[TransactionOperationType.SETTLE]).to.equal(1);
      expect(result.byStatus[TransactionStatusType.CONFIRMED]).to.equal(3);
      expect(result.byStatus[TransactionStatusType.PENDING]).to.equal(1);
      expect(result.firstTransaction).to.exist;
      expect(result.lastTransaction).to.exist;
    });

    it('should return empty stats for agreement with no transactions', async () => {
      prismaStub.transactionLog.findMany.resolves([]);

      const result = await transactionLogService.getAgreementTransactionStats('AGR-NO-TX');

      expect(result.totalTransactions).to.equal(0);
      expect(result.byOperationType).to.deep.equal({});
      expect(result.byStatus).to.deep.equal({});
      expect(result.firstTransaction).to.be.undefined;
      expect(result.lastTransaction).to.be.undefined;
    });
  });

  describe('cleanupOldLogs', () => {
    it('should delete logs older than specified days', async () => {
      prismaStub.transactionLog.deleteMany.resolves({ count: 25 });

      const deletedCount = await transactionLogService.cleanupOldLogs(90);

      expect(deletedCount).to.equal(25);
      expect(prismaStub.transactionLog.deleteMany.calledOnce).to.be.true;

      const deleteCall = prismaStub.transactionLog.deleteMany.getCall(0);
      expect(deleteCall.args[0].where.timestamp.lt).to.be.instanceof(Date);
    });

    it('should use default of 90 days if not specified', async () => {
      prismaStub.transactionLog.deleteMany.resolves({ count: 0 });

      await transactionLogService.cleanupOldLogs();

      expect(prismaStub.transactionLog.deleteMany.calledOnce).to.be.true;
    });

    it('should return 0 if no logs to delete', async () => {
      prismaStub.transactionLog.deleteMany.resolves({ count: 0 });

      const deletedCount = await transactionLogService.cleanupOldLogs(30);

      expect(deletedCount).to.equal(0);
    });
  });

  describe('getRecentFailedTransactions', () => {
    it('should return recent failed transactions', async () => {
      const mockFailedLogs = [
        {
          id: 'log-failed-1',
          txId: 'tx-failed-1',
          operationType: TransactionOperationType.SETTLE,
          agreementId: 'AGR-TEST-001',
          status: TransactionStatusType.FAILED,
          blockHeight: BigInt(100),
          slot: null,
          errorMessage: 'Insufficient funds',
          timestamp: new Date('2025-01-23T00:00:00Z'),
        },
        {
          id: 'log-failed-2',
          txId: 'tx-failed-2',
          operationType: TransactionOperationType.DEPOSIT_USDC,
          agreementId: 'AGR-TEST-002',
          status: TransactionStatusType.FAILED,
          blockHeight: BigInt(101),
          slot: null,
          errorMessage: 'Invalid signature',
          timestamp: new Date('2025-01-23T00:01:00Z'),
        },
      ];

      prismaStub.transactionLog.findMany.resolves(mockFailedLogs);

      const result = await transactionLogService.getRecentFailedTransactions(10);

      expect(result).to.have.lengthOf(2);
      expect(result[0].status).to.equal(TransactionStatusType.FAILED);
      expect(result[0].errorMessage).to.exist;
      expect(result[0].explorerUrl).to.exist;
    });

    it('should use default limit of 10', async () => {
      prismaStub.transactionLog.findMany.resolves([]);

      await transactionLogService.getRecentFailedTransactions();

      const findManyCall = prismaStub.transactionLog.findMany.getCall(0);
      expect(findManyCall.args[0].take).to.equal(10);
    });

    it('should return empty array if no failed transactions', async () => {
      prismaStub.transactionLog.findMany.resolves([]);

      const result = await transactionLogService.getRecentFailedTransactions();

      expect(result).to.have.lengthOf(0);
    });
  });
});

