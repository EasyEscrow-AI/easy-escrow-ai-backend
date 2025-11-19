/**
 * Unit Tests for Refund Service
 * 
 * Tests refund calculation, eligibility checks, refund processing,
 * and batch operations.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { RefundService, resetRefundService } from '../../src/services/refund.service';
import * as solanaService from '../../src/services/solana.service';
import * as transactionLogService from '../../src/services/transaction-log.service';
import { Decimal } from '@prisma/client/runtime/library';
import { AgreementStatus, DepositStatus, DepositType } from '../../src/generated/prisma';
import { mockPrismaForTest, teardownPrismaMock } from '../helpers/prisma-mock';

describe('Refund Service - Unit Tests', () => {
  let refundService: RefundService;
  let prismaStub: any;
  let solanaServiceStub: any;
  let transactionLogServiceStub: any;

  beforeEach(() => {
    // Reset service instance
    resetRefundService();

    // Create Prisma stub
    prismaStub = {
      agreement: {
        findUnique: sinon.stub(),
        update: sinon.stub(),
      },
      deposit: {
        findMany: sinon.stub(),
      },
      transactionLog: {
        create: sinon.stub(),
        findMany: sinon.stub(),
      },
    };

    // Setup mock Prisma client
    mockPrismaForTest(prismaStub);

    // Stub Solana service
    solanaServiceStub = {
      getAccountInfo: sinon.stub(),
    };
    sinon.stub(solanaService, 'getSolanaService').returns(solanaServiceStub as any);

    // Stub Transaction Log service
    transactionLogServiceStub = {
      captureTransaction: sinon.stub().resolves({ id: 'log-123', txId: 'mock-tx-id' }),
    };
    sinon.stub(transactionLogService, 'getTransactionLogService').returns(transactionLogServiceStub as any);

    // Create service instance (will use mocked Prisma)
    refundService = new RefundService();
    
    // Mock the on-chain execution methods to avoid actual blockchain calls
    sinon.stub(refundService as any, 'executeOnChainRefund').resolves('mock-tx-signature');
    sinon.stub(refundService as any, 'executeOnChainRefundWithRetry').resolves('mock-tx-signature');
    sinon.stub(refundService as any, 'waitForTransactionConfirmation').resolves();
  });

  afterEach(() => {
    sinon.restore();
    teardownPrismaMock();
  });

  describe('checkRefundEligibility', () => {
    const agreementId = 'AGR-TEST-001';

    it('should mark agreement as eligible for refund when cancelled with deposits', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.CANCELLED,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.1'),
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.checkRefundEligibility(agreementId);

      expect(result.eligible).to.be.true;
      expect(result.hasDeposits).to.be.true;
      expect(result.agreementStatus).to.equal(AgreementStatus.CANCELLED);
    });

    it('should mark agreement as eligible for refund when expired with deposits', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.EXPIRED,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.NFT,
            status: DepositStatus.CONFIRMED,
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.checkRefundEligibility(agreementId);

      expect(result.eligible).to.be.true;
      expect(result.hasDeposits).to.be.true;
      expect(result.agreementStatus).to.equal(AgreementStatus.EXPIRED);
    });

    it('should reject refund for already settled agreement', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.SETTLED,
        deposits: [],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.checkRefundEligibility(agreementId);

      expect(result.eligible).to.be.false;
      expect(result.reason).to.include('does not allow refunds');
    });

    it('should reject refund for already refunded agreement', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.REFUNDED,
        deposits: [],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.checkRefundEligibility(agreementId);

      expect(result.eligible).to.be.false;
      expect(result.reason).to.include('does not allow refunds');
    });

    it('should reject refund for agreement with no deposits', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.CANCELLED,
        deposits: [],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.checkRefundEligibility(agreementId);

      expect(result.eligible).to.be.false;
      expect(result.reason).to.include('No confirmed deposits');
      expect(result.hasDeposits).to.be.false;
    });

    it('should reject refund for non-existent agreement', async () => {
      prismaStub.agreement.findUnique.resolves(null);

      const result = await refundService.checkRefundEligibility(agreementId);

      expect(result.eligible).to.be.false;
      expect(result.reason).to.equal('Agreement not found');
      expect(result.hasDeposits).to.be.false;
    });

    it('should allow refund for BOTH_LOCKED status', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.BOTH_LOCKED,
        deposits: [
          {
            id: 'deposit-usdc',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.1'),
          },
          {
            id: 'deposit-nft',
            type: DepositType.NFT,
            status: DepositStatus.CONFIRMED,
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.checkRefundEligibility(agreementId);

      expect(result.eligible).to.be.true;
      expect(result.hasDeposits).to.be.true;
    });
  });

  describe('calculateRefunds', () => {
    const agreementId = 'AGR-TEST-001';

    it('should calculate refunds for USDC deposit', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.CANCELLED,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.5'),
            depositor: 'BuyerAddress123',
            tokenAccount: 'USDCAccount123',
          },
        ],
      };

      // calculateRefunds calls findUnique twice (once directly, once via checkRefundEligibility)
      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.calculateRefunds(agreementId);

      expect(result.eligible).to.be.true;
      expect(result.totalUsdcRefund).to.equal('0.5');
      expect(result.nftRefundCount).to.equal(0);
      expect(result.refunds).to.have.lengthOf(1);
      expect(result.refunds[0].type).to.equal(DepositType.USDC);
      expect(result.refunds[0].amount).to.equal('0.5');
      expect(result.refunds[0].depositor).to.equal('BuyerAddress123');
    });

    it('should calculate refunds for NFT deposit', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.EXPIRED,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.NFT,
            status: DepositStatus.CONFIRMED,
            depositor: 'SellerAddress456',
            tokenAccount: 'NFTAccount456',
            amount: null,
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.calculateRefunds(agreementId);

      expect(result.eligible).to.be.true;
      expect(result.totalUsdcRefund).to.equal('0');
      expect(result.nftRefundCount).to.equal(1);
      expect(result.refunds).to.have.lengthOf(1);
      expect(result.refunds[0].type).to.equal(DepositType.NFT);
      expect(result.refunds[0].tokenAccount).to.equal('NFTAccount456');
    });

    it('should calculate refunds for multiple deposits', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.BOTH_LOCKED,
        deposits: [
          {
            id: 'deposit-usdc',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('1.5'),
            depositor: 'BuyerAddress123',
            tokenAccount: 'USDCAccount123',
          },
          {
            id: 'deposit-nft',
            type: DepositType.NFT,
            status: DepositStatus.CONFIRMED,
            depositor: 'SellerAddress456',
            tokenAccount: 'NFTAccount456',
            amount: null,
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.calculateRefunds(agreementId);

      expect(result.eligible).to.be.true;
      expect(result.totalUsdcRefund).to.equal('1.5');
      expect(result.nftRefundCount).to.equal(1);
      expect(result.refunds).to.have.lengthOf(2);
    });

    it('should return not eligible for ineligible agreement', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.SETTLED,
        deposits: [],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.calculateRefunds(agreementId);

      expect(result.eligible).to.be.false;
      expect(result.totalUsdcRefund).to.equal('0');
      expect(result.nftRefundCount).to.equal(0);
      expect(result.refunds).to.have.lengthOf(0);
      expect(result.reason).to.exist;
    });

    it('should handle agreement not found', async () => {
      prismaStub.agreement.findUnique.resolves(null);

      try {
        await refundService.calculateRefunds(agreementId);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('not found');
      }
    });
  });

  describe('processRefunds', () => {
    const agreementId = 'AGR-TEST-001';

    it('should successfully process refunds for all deposits', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.CANCELLED,
        deposits: [
          {
            id: 'deposit-usdc',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.5'),
            depositor: 'BuyerAddress123',
            tokenAccount: 'USDCAccount123',
          },
          {
            id: 'deposit-nft',
            type: DepositType.NFT,
            status: DepositStatus.CONFIRMED,
            depositor: 'SellerAddress456',
            tokenAccount: 'NFTAccount456',
            amount: null,
          },
        ],
      };

      // Multiple findUnique calls: calculateRefunds + checkRefundEligibility + processDepositRefund per deposit (2)
      prismaStub.agreement.findUnique.resolves(mockAgreement); // Return for all calls
      prismaStub.agreement.update.resolves({ ...mockAgreement, status: AgreementStatus.REFUNDED });
      prismaStub.transactionLog.create.resolves({});
      transactionLogServiceStub.captureTransaction.resolves({ id: 'log-123', txId: 'mock-tx-id' });

      const result = await refundService.processRefunds(agreementId);

      expect(result.success).to.be.true;
      expect(result.transactionIds).to.have.lengthOf(2);
      expect(result.refundedDeposits).to.have.lengthOf(2);
      expect(result.errors).to.have.lengthOf(0);
      expect(prismaStub.agreement.update.calledOnce).to.be.true;
    });

    it('should not process refunds for ineligible agreement', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.SETTLED,
        deposits: [],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.processRefunds(agreementId);

      expect(result.success).to.be.false;
      expect(result.transactionIds).to.have.lengthOf(0);
      expect(result.refundedDeposits).to.have.lengthOf(0);
      expect(result.errors).to.have.lengthOf(1);
      expect(result.errors[0].error).to.include('does not allow refunds');
    });

    it('should handle partial refund success (some deposits fail)', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.CANCELLED,
        deposits: [
          {
            id: 'deposit-success',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.5'),
            depositor: 'BuyerAddress123',
            tokenAccount: 'USDCAccount123',
          },
          {
            id: 'deposit-fail',
            type: DepositType.NFT,
            status: DepositStatus.CONFIRMED,
            depositor: 'SellerAddress456',
            tokenAccount: 'NFTAccount456',
            amount: null,
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement); // All calls return agreement
      
      // Restore the stub so we can configure it per-call
      (refundService as any).executeOnChainRefundWithRetry.restore();
      const retryStub = sinon.stub(refundService as any, 'executeOnChainRefundWithRetry');
      retryStub.onFirstCall().resolves('tx-success'); // First deposit succeeds
      retryStub.onSecondCall().rejects(new Error('On-chain refund failed')); // Second deposit fails
      
      prismaStub.transactionLog.create.resolves({});
      transactionLogServiceStub.captureTransaction.resolves({ id: 'log-123', txId: 'mock-tx-id' });

      const result = await refundService.processRefunds(agreementId);

      expect(result.success).to.be.false; // Partial failure
      expect(result.transactionIds).to.have.lengthOf(1); // One succeeded
      expect(result.refundedDeposits).to.have.lengthOf(1);
      expect(result.errors).to.have.lengthOf(1); // One failed
      expect(prismaStub.agreement.update.called).to.be.false; // Not updated due to errors
    });

    it('should continue processing even if transaction log creation fails', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.CANCELLED,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.5'),
            depositor: 'BuyerAddress123',
            tokenAccount: 'USDCAccount123',
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement); // All calls return agreement
      prismaStub.agreement.update.resolves({ ...mockAgreement, status: AgreementStatus.REFUNDED });
      prismaStub.transactionLog.create.resolves({});
      transactionLogServiceStub.captureTransaction.rejects(new Error('Log service down'));

      const result = await refundService.processRefunds(agreementId);

      // Should still succeed even though transaction log failed
      expect(result.success).to.be.true;
      expect(result.transactionIds).to.have.lengthOf(1);
      expect(result.refundedDeposits).to.have.lengthOf(1);
    });

    it('should update agreement status to REFUNDED on successful completion', async () => {
      const mockAgreement = {
        agreementId,
        status: AgreementStatus.CANCELLED,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.5'),
            depositor: 'BuyerAddress123',
            tokenAccount: 'USDCAccount123',
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.agreement.update.resolves({ ...mockAgreement, status: AgreementStatus.REFUNDED });
      prismaStub.transactionLog.create.resolves({});
      transactionLogServiceStub.captureTransaction.resolves({});

      await refundService.processRefunds(agreementId);

      expect(prismaStub.agreement.update.calledOnce).to.be.true;
      const updateCall = prismaStub.agreement.update.getCall(0);
      expect(updateCall.args[0].data.status).to.equal(AgreementStatus.REFUNDED);
      expect(updateCall.args[0].data.cancelledAt).to.be.instanceof(Date);
    });
  });

  describe('batchProcessRefunds', () => {
    it('should process refunds for multiple agreements', async () => {
      const agreementIds = ['AGR-TEST-001', 'AGR-TEST-002', 'AGR-TEST-003'];

      const mockAgreement = {
        status: AgreementStatus.CANCELLED,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.5'),
            depositor: 'BuyerAddress123',
            tokenAccount: 'USDCAccount123',
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.agreement.update.resolves({ ...mockAgreement, status: AgreementStatus.REFUNDED });
      prismaStub.transactionLog.create.resolves({});
      transactionLogServiceStub.captureTransaction.resolves({});

      const results = await refundService.batchProcessRefunds(agreementIds);

      expect(results.size).to.equal(3);
      expect(results.get('AGR-TEST-001')?.success).to.be.true;
      expect(results.get('AGR-TEST-002')?.success).to.be.true;
      expect(results.get('AGR-TEST-003')?.success).to.be.true;
    });

    it('should handle mixed success/failure in batch processing', async () => {
      const agreementIds = ['AGR-SUCCESS', 'AGR-FAIL'];

      const mockSuccessAgreement = {
        agreementId: 'AGR-SUCCESS',
        status: AgreementStatus.CANCELLED,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.5'),
            depositor: 'BuyerAddress123',
            tokenAccount: 'USDCAccount123',
          },
        ],
      };

      const mockFailAgreement = {
        agreementId: 'AGR-FAIL',
        status: AgreementStatus.SETTLED, // Not eligible
        deposits: [],
      };

      prismaStub.agreement.findUnique
        .onFirstCall().resolves(mockSuccessAgreement)
        .onSecondCall().resolves(mockSuccessAgreement) // For processRefunds
        .onThirdCall().resolves(mockFailAgreement);
      
      prismaStub.agreement.update.resolves({ ...mockSuccessAgreement, status: AgreementStatus.REFUNDED });
      prismaStub.transactionLog.create.resolves({});
      transactionLogServiceStub.captureTransaction.resolves({});

      const results = await refundService.batchProcessRefunds(agreementIds);

      expect(results.size).to.equal(2);
      expect(results.get('AGR-SUCCESS')?.success).to.be.true;
      expect(results.get('AGR-FAIL')?.success).to.be.false;
    });

    it('should handle errors gracefully during batch processing', async () => {
      const agreementIds = ['AGR-ERROR'];

      prismaStub.agreement.findUnique.rejects(new Error('Database connection lost'));

      const results = await refundService.batchProcessRefunds(agreementIds);

      expect(results.size).to.equal(1);
      expect(results.get('AGR-ERROR')?.success).to.be.false;
      expect(results.get('AGR-ERROR')?.errors[0].error).to.include('Database connection lost');
    });
  });

  describe('getRefundHistory', () => {
    const agreementId = 'AGR-TEST-001';

    it('should return refund transaction history', async () => {
      const mockHistory = [
        {
          id: 'log-1',
          agreementId,
          txId: 'refund-tx-1',
          operationType: 'refund',
          status: 'success',
          timestamp: new Date('2025-01-23T00:00:00Z'),
        },
        {
          id: 'log-2',
          agreementId,
          txId: 'refund-tx-2',
          operationType: 'refund',
          status: 'success',
          timestamp: new Date('2025-01-23T00:01:00Z'),
        },
      ];

      prismaStub.transactionLog.findMany.resolves(mockHistory);

      const result = await refundService.getRefundHistory(agreementId);

      expect(result).to.have.lengthOf(2);
      expect(result[0].operationType).to.equal('refund');
      expect(result[1].operationType).to.equal('refund');
    });

    it('should return empty array for agreement with no refunds', async () => {
      prismaStub.transactionLog.findMany.resolves([]);

      const result = await refundService.getRefundHistory(agreementId);

      expect(result).to.have.lengthOf(0);
    });

    it('should handle errors when fetching history', async () => {
      prismaStub.transactionLog.findMany.rejects(new Error('Database error'));

      try {
        await refundService.getRefundHistory(agreementId);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Database error');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle agreement with only pending deposits (no confirmed)', async () => {
      const mockAgreement = {
        agreementId: 'AGR-TEST-001',
        status: AgreementStatus.CANCELLED,
        deposits: [], // No confirmed deposits
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.calculateRefunds('AGR-TEST-001');

      expect(result.eligible).to.be.false;
      expect(result.reason).to.include('No confirmed deposits');
    });

    it('should handle very large USDC amounts', async () => {
      const mockAgreement = {
        agreementId: 'AGR-TEST-001',
        status: AgreementStatus.CANCELLED,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('1000000.123456'), // 1 million USDC
            depositor: 'BuyerAddress123',
            tokenAccount: 'USDCAccount123',
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.calculateRefunds('AGR-TEST-001');

      expect(result.eligible).to.be.true;
      expect(result.totalUsdcRefund).to.equal('1000000.123456');
    });

    it('should handle multiple deposits from same depositor', async () => {
      const mockAgreement = {
        agreementId: 'AGR-TEST-001',
        status: AgreementStatus.CANCELLED,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.5'),
            depositor: 'SameAddress',
            tokenAccount: 'Account1',
          },
          {
            id: 'deposit-2',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('0.3'),
            depositor: 'SameAddress',
            tokenAccount: 'Account2',
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await refundService.calculateRefunds('AGR-TEST-001');

      expect(result.eligible).to.be.true;
      expect(result.totalUsdcRefund).to.equal('0.8'); // Sum of both deposits
      expect(result.refunds).to.have.lengthOf(2); // Both deposits refunded separately
    });
  });
});

