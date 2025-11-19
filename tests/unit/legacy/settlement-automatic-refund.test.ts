/**
 * Unit Tests for Automatic Refund on Settlement Failure
 * 
 * Tests the new automatic refund feature that triggers when settlement fails.
 * Ensures assets are automatically returned on-chain when settlement errors occur.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { SettlementService } from '../../src/services/settlement.service';
import * as refundService from '../../src/services/refund.service';
import * as escrowProgramService from '../../src/services/escrow-program.service';
import * as solanaService from '../../src/services/solana.service';
import * as idempotencyService from '../../src/services/idempotency.service';
import { AgreementStatus, DepositStatus, DepositType } from '../../src/generated/prisma';
import { mockPrismaForTest, teardownPrismaMock } from '../helpers/prisma-mock';
import { Decimal } from '@prisma/client/runtime/library';

describe('Settlement Service - Automatic Refund on Failure', () => {
  let settlementService: SettlementService;
  let prismaStub: any;
  let refundServiceStub: any;
  let escrowServiceStub: any;
  let idempotencyServiceStub: any;

  beforeEach(() => {
    // Create Prisma stub
    prismaStub = {
      agreement: {
        findUnique: sinon.stub(),
        findMany: sinon.stub(),
        update: sinon.stub(),
      },
      deposit: {
        findMany: sinon.stub(),
      },
      settlement: {
        create: sinon.stub(),
      },
      transactionLog: {
        create: sinon.stub(),
        findMany: sinon.stub(),
      },
    };

    // Setup mock Prisma client
    mockPrismaForTest(prismaStub);

    // Stub RefundService
    refundServiceStub = {
      checkRefundEligibility: sinon.stub(),
      processRefunds: sinon.stub(),
    };
    sinon.stub(refundService, 'getRefundService').returns(refundServiceStub as any);

    // Stub EscrowProgramService with proper ensureTokenAccountExists mock
    escrowServiceStub = {
      settle: sinon.stub(),
      cancelIfExpired: sinon.stub(),
      adminCancel: sinon.stub(),
      ensureTokenAccountExists: sinon.stub().resolves(),
    };
    sinon.stub(escrowProgramService, 'getEscrowProgramService').returns(escrowServiceStub as any);

    // Stub IdempotencyService with proper isDuplicate property
    idempotencyServiceStub = {
      checkIdempotency: sinon.stub().resolves({ isDuplicate: false, result: null }), // Proper idempotency response
      storeIdempotency: sinon.stub().resolves(),
      storeIdempotencyWithTTL: sinon.stub().resolves(), // Add missing method
    };
    sinon.stub(idempotencyService, 'getIdempotencyService').returns(idempotencyServiceStub as any);

    // Stub SolanaService
    const solanaServiceStub = {
      getConnection: sinon.stub().returns({
        confirmTransaction: sinon.stub().resolves(),
      }),
    };
    sinon.stub(solanaService, 'getSolanaService').returns(solanaServiceStub as any);

    // Create settlement service instance
    settlementService = new SettlementService();
  });

  afterEach(() => {
    sinon.restore();
    teardownPrismaMock();
  });

  describe('Automatic Refund Trigger', () => {
    // Use valid Solana public key addresses (base58 encoded, 44 chars)
    const mockAgreement = {
      agreementId: 'AGR-TEST-001',
      escrowPda: '11111111111111111111111111111111', // Valid System Program ID
      nftMint: 'So11111111111111111111111111111111111111112', // Valid wrapped SOL mint
      seller: 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS', // Valid public key
      buyer: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', // Valid USDC mint as example
      price: new Decimal('100'),
      platformFee: 100, // 1% in BPS
      status: AgreementStatus.BOTH_LOCKED,
      expiry: new Date(Date.now() + 3600000), // 1 hour from now
      honorRoyalties: false,
      creatorRoyaltyBps: 0, // Required for fee calculation
      creatorRoyaltyAddress: null, // Required for fee calculation
      deposits: [
        {
          id: 'deposit-usdc',
          type: DepositType.USDC,
          status: DepositStatus.CONFIRMED,
          amount: new Decimal('100'),
          depositor: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        },
        {
          id: 'deposit-nft',
          type: DepositType.NFT,
          status: DepositStatus.CONFIRMED,
          depositor: 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS',
          tokenAccount: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        },
      ],
    };

    it('should trigger automatic refund when settlement fails and deposits exist', async () => {
      // Setup: Settlement will fail
      escrowServiceStub.settle.rejects(new Error('Settlement transaction failed'));

      // Setup: Agreement has deposits and is eligible for refund
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      refundServiceStub.checkRefundEligibility.resolves({
        eligible: true,
        hasDeposits: true,
        agreementStatus: AgreementStatus.BOTH_LOCKED,
      });

      // Setup: Refund will succeed
      refundServiceStub.processRefunds.resolves({
        success: true,
        agreementId: mockAgreement.agreementId,
        transactionIds: ['refund-tx-1'],
        refundedDeposits: [
          {
            depositId: 'deposit-usdc',
            depositor: 'BuyerAddress123',
            type: DepositType.USDC,
            txId: 'refund-tx-1',
          },
          {
            depositId: 'deposit-nft',
            depositor: 'SellerAddress123',
            type: DepositType.NFT,
            txId: 'refund-tx-1',
          },
        ],
        errors: [],
      });

      // Execute: Attempt settlement (which will fail)
      const result = await settlementService.executeSettlement(mockAgreement);

      // Assert: Settlement should fail
      expect(result.success).to.be.false;
      expect(result.error).to.include('Settlement transaction failed');

      // Wait for async refund to be triggered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: Refund eligibility was checked
      expect(refundServiceStub.checkRefundEligibility.calledOnce).to.be.true;
      expect(refundServiceStub.checkRefundEligibility.calledWith(mockAgreement.agreementId)).to.be.true;

      // Assert: Refund was processed
      expect(refundServiceStub.processRefunds.calledOnce).to.be.true;
      expect(refundServiceStub.processRefunds.calledWith(mockAgreement.agreementId)).to.be.true;
    });

    it('should NOT trigger refund when settlement fails but no deposits exist', async () => {
      // Setup: Settlement will fail
      escrowServiceStub.settle.rejects(new Error('Settlement transaction failed'));

      // Setup: Agreement has no deposits
      const agreementNoDeposits = { ...mockAgreement, deposits: [] };
      prismaStub.agreement.findUnique.resolves(agreementNoDeposits);
      refundServiceStub.checkRefundEligibility.resolves({
        eligible: false,
        hasDeposits: false,
        agreementStatus: AgreementStatus.PENDING,
        reason: 'No confirmed deposits to refund',
      });

      // Execute: Attempt settlement (which will fail)
      const result = await settlementService.executeSettlement(agreementNoDeposits);

      // Assert: Settlement should fail
      expect(result.success).to.be.false;

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: Eligibility was checked
      expect(refundServiceStub.checkRefundEligibility.calledOnce).to.be.true;

      // Assert: Refund was NOT processed (no deposits)
      expect(refundServiceStub.processRefunds.called).to.be.false;
    });

    it('should NOT trigger refund when settlement fails and agreement is already refunded', async () => {
      // Setup: Settlement will fail
      escrowServiceStub.settle.rejects(new Error('Settlement transaction failed'));

      // Setup: Agreement already refunded
      const refundedAgreement = { ...mockAgreement, status: AgreementStatus.REFUNDED };
      prismaStub.agreement.findUnique.resolves(refundedAgreement);
      refundServiceStub.checkRefundEligibility.resolves({
        eligible: false,
        hasDeposits: true,
        agreementStatus: AgreementStatus.REFUNDED,
        reason: 'Agreement is already refunded',
      });

      // Execute: Attempt settlement (which will fail)
      const result = await settlementService.executeSettlement(refundedAgreement);

      // Assert: Settlement should fail
      expect(result.success).to.be.false;

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: Eligibility was checked
      expect(refundServiceStub.checkRefundEligibility.calledOnce).to.be.true;

      // Assert: Refund was NOT processed (already refunded)
      expect(refundServiceStub.processRefunds.called).to.be.false;
    });

    it('should handle refund failure gracefully and not block settlement error', async () => {
      // Setup: Settlement will fail
      escrowServiceStub.settle.rejects(new Error('Settlement transaction failed'));

      // Setup: Agreement is eligible for refund
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      refundServiceStub.checkRefundEligibility.resolves({
        eligible: true,
        hasDeposits: true,
        agreementStatus: AgreementStatus.BOTH_LOCKED,
      });

      // Setup: Refund will also fail
      refundServiceStub.processRefunds.resolves({
        success: false,
        agreementId: mockAgreement.agreementId,
        transactionIds: [],
        refundedDeposits: [],
        errors: [{ depositId: 'deposit-usdc', error: 'Refund transaction failed' }],
      });

      // Execute: Attempt settlement (which will fail)
      const result = await settlementService.executeSettlement(mockAgreement);

      // Assert: Settlement should fail with original error
      expect(result.success).to.be.false;
      expect(result.error).to.include('Settlement transaction failed');

      // Wait for async refund attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: Refund was attempted
      expect(refundServiceStub.processRefunds.calledOnce).to.be.true;

      // Note: Refund failure should be logged but not affect settlement error response
    });

    it('should handle refund service errors gracefully', async () => {
      // Setup: Settlement will fail
      escrowServiceStub.settle.rejects(new Error('Settlement transaction failed'));

      // Setup: Agreement has deposits
      prismaStub.agreement.findUnique.resolves(mockAgreement);

      // Setup: Eligibility check throws error
      refundServiceStub.checkRefundEligibility.rejects(new Error('Database connection lost'));

      // Execute: Attempt settlement (which will fail)
      const result = await settlementService.executeSettlement(mockAgreement);

      // Assert: Settlement should fail with original error (not refund error)
      expect(result.success).to.be.false;
      expect(result.error).to.include('Settlement transaction failed');

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: System should handle error gracefully
      expect(refundServiceStub.checkRefundEligibility.calledOnce).to.be.true;
    });

    it('should store failed settlement in idempotency cache', async () => {
      // Setup: Settlement will fail
      escrowServiceStub.settle.rejects(new Error('Settlement transaction failed'));

      // Setup: Agreement
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      refundServiceStub.checkRefundEligibility.resolves({
        eligible: true,
        hasDeposits: true,
        agreementStatus: AgreementStatus.BOTH_LOCKED,
      });
      refundServiceStub.processRefunds.resolves({
        success: true,
        agreementId: mockAgreement.agreementId,
        transactionIds: ['refund-tx-1'],
        refundedDeposits: [],
        errors: [],
      });

      // Execute: Attempt settlement
      const result = await settlementService.executeSettlement(mockAgreement);

      // Assert: Settlement failed
      expect(result.success).to.be.false;

      // Assert: Idempotency stored with error result (using TTL method)
      expect(idempotencyServiceStub.storeIdempotencyWithTTL.calledOnce).to.be.true;
      const storeCall = idempotencyServiceStub.storeIdempotencyWithTTL.getCall(0);
      expect(storeCall.args[0]).to.equal(`settlement_${mockAgreement.agreementId}`);
    });

    it('should run refund in background without blocking error response', async () => {
      // Setup: Settlement will fail
      escrowServiceStub.settle.rejects(new Error('Settlement transaction failed'));

      // Setup: Agreement
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      refundServiceStub.checkRefundEligibility.resolves({
        eligible: true,
        hasDeposits: true,
        agreementStatus: AgreementStatus.BOTH_LOCKED,
      });

      // Setup: Refund takes a long time (simulated)
      const slowRefund = new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            agreementId: mockAgreement.agreementId,
            transactionIds: ['refund-tx-1'],
            refundedDeposits: [],
            errors: [],
          });
        }, 500); // 500ms delay
      });
      refundServiceStub.processRefunds.returns(slowRefund);

      // Execute: Attempt settlement
      const startTime = Date.now();
      const result = await settlementService.executeSettlement(mockAgreement);
      const executionTime = Date.now() - startTime;

      // Assert: Settlement should return immediately (not wait for refund)
      expect(result.success).to.be.false;
      expect(executionTime).to.be.lessThan(200); // Should not wait for 500ms refund

      // Assert: Refund eligibility was checked
      expect(refundServiceStub.checkRefundEligibility.calledOnce).to.be.true;

      // Note: processRefunds was called but we didn't wait for it
      expect(refundServiceStub.processRefunds.calledOnce).to.be.true;
    });
  });

  describe('Integration with RefundService', () => {
    it('should pass correct agreement ID to refund service', async () => {
      const testAgreementId = 'AGR-SPECIFIC-123';
      const mockAgreement = {
        agreementId: testAgreementId,
        escrowPda: 'EscrowPDA123',
        nftMint: 'NFTMint123',
        seller: 'SellerAddress123',
        buyer: 'BuyerAddress123',
        price: new Decimal('100'),
        platformFee: 100,
        status: AgreementStatus.BOTH_LOCKED,
        expiry: new Date(Date.now() + 3600000),
        honorRoyalties: false,
        creatorRoyaltyBps: 0,
        creatorRoyaltyAddress: null,
        deposits: [
          {
            id: 'deposit-1',
            type: DepositType.USDC,
            status: DepositStatus.CONFIRMED,
            amount: new Decimal('100'),
            depositor: 'BuyerAddress123',
          },
        ],
      };

      escrowServiceStub.settle.rejects(new Error('Settlement failed'));
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      refundServiceStub.checkRefundEligibility.resolves({
        eligible: true,
        hasDeposits: true,
        agreementStatus: AgreementStatus.BOTH_LOCKED,
      });
      refundServiceStub.processRefunds.resolves({
        success: true,
        agreementId: testAgreementId,
        transactionIds: ['refund-tx-1'],
        refundedDeposits: [],
        errors: [],
      });

      await settlementService.executeSettlement(mockAgreement);

      // Wait for async refund
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: Correct agreement ID was used
      expect(refundServiceStub.checkRefundEligibility.calledWith(testAgreementId)).to.be.true;
      expect(refundServiceStub.processRefunds.calledWith(testAgreementId)).to.be.true;
    });
  });
});

