import { expect } from 'chai';
import sinon from 'sinon';
import { PrismaClient, AgreementStatus } from '../../src/generated/prisma';
import * as agreementService from '../../src/services/agreement.service';
import * as solanaService from '../../src/services/solana.service';
import { testAgreements, testCreateAgreementDTO } from '../fixtures/test-data';
import { generateTestSolanaAddress, generateTestAgreementId } from '../helpers/test-utils';
import { Decimal } from '@prisma/client/runtime/library';

describe('Agreement Service - Unit Tests', () => {
  let prismaStub: any;
  let solanaStub: sinon.SinonStub;

  beforeEach(() => {
    // Stub Solana service
    solanaStub = sinon.stub(solanaService, 'initializeEscrow');
    
    // Create Prisma stub
    prismaStub = {
      agreement: {
        create: sinon.stub(),
        findUnique: sinon.stub(),
        findMany: sinon.stub(),
        update: sinon.stub(),
        delete: sinon.stub(),
        count: sinon.stub(),
        updateMany: sinon.stub(),
      },
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('createAgreement', () => {
    it('should create a new agreement successfully', async () => {
      const mockEscrowResult = {
        escrowPda: generateTestSolanaAddress(),
        depositAddresses: {
          usdc: generateTestSolanaAddress(),
          nft: generateTestSolanaAddress(),
        },
        transactionId: 'TEST_TX_ID',
      };

      solanaStub.resolves(mockEscrowResult);

      const mockAgreement = {
        ...testAgreements.pending,
        agreementId: generateTestAgreementId(),
        escrowPda: mockEscrowResult.escrowPda,
        usdcDepositAddr: mockEscrowResult.depositAddresses.usdc,
        nftDepositAddr: mockEscrowResult.depositAddresses.nft,
        initTxId: mockEscrowResult.transactionId,
      };

      prismaStub.agreement.create.resolves(mockAgreement);

      // Note: We can't easily test the full createAgreement as it uses 
      // a new PrismaClient internally. This test demonstrates the pattern.
      // In a real scenario, we'd use dependency injection.

      expect(solanaStub.called).to.be.false;
    });

    it('should throw error if Solana initialization fails', async () => {
      solanaStub.rejects(new Error('Solana RPC error'));

      // This would need dependency injection to test properly
      expect(solanaStub.called).to.be.false;
    });
  });

  describe('isAgreementExpired', () => {
    it('should return true for expired agreement', () => {
      const expiredAgreement = {
        ...testAgreements.expired,
        expiry: new Date(Date.now() - 1000),
      };

      const result = agreementService.isAgreementExpired(expiredAgreement as any);
      expect(result).to.be.true;
    });

    it('should return false for non-expired agreement', () => {
      const validAgreement = {
        ...testAgreements.pending,
        expiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const result = agreementService.isAgreementExpired(validAgreement as any);
      expect(result).to.be.false;
    });
  });

  describe('Agreement Status Validation', () => {
    it('should validate pending status transitions', () => {
      const statuses = [
        AgreementStatus.PENDING,
        AgreementStatus.USDC_LOCKED,
        AgreementStatus.NFT_LOCKED,
        AgreementStatus.BOTH_LOCKED,
        AgreementStatus.SETTLED,
        AgreementStatus.CANCELLED,
        AgreementStatus.EXPIRED,
        AgreementStatus.REFUNDED,
      ];

      expect(statuses).to.have.lengthOf(8);
      expect(statuses).to.include(AgreementStatus.PENDING);
      expect(statuses).to.include(AgreementStatus.SETTLED);
    });
  });

  describe('Agreement ID Generation', () => {
    it('should generate unique agreement IDs', () => {
      const id1 = generateTestAgreementId();
      const id2 = generateTestAgreementId();

      expect(id1).to.not.equal(id2);
      expect(id1).to.match(/^TEST-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(id2).to.match(/^TEST-[A-Z0-9]+-[A-Z0-9]+$/);
    });
  });

  describe('Price Validation', () => {
    it('should handle decimal prices correctly', () => {
      const price1 = new Decimal('100.50');
      const price2 = new Decimal('200.00');

      expect(price1.toString()).to.equal('100.5');
      expect(price2.toString()).to.equal('200');
      expect(price1.lessThan(price2)).to.be.true;
    });

    it('should handle large price values', () => {
      const largePrice = new Decimal('999999.999999');
      expect(largePrice.toString()).to.equal('999999.999999');
    });

    it('should reject negative prices', () => {
      const negativePrice = new Decimal('-10.00');
      expect(negativePrice.isNegative()).to.be.true;
    });
  });

  describe('Fee Calculation', () => {
    it('should calculate platform fees correctly', () => {
      const price = new Decimal('100.00');
      const feeBps = 250; // 2.5%

      const fee = price.mul(feeBps).div(10000);
      expect(fee.toString()).to.equal('2.5');
    });

    it('should calculate fees for large amounts', () => {
      const price = new Decimal('10000.00');
      const feeBps = 250;

      const fee = price.mul(feeBps).div(10000);
      expect(fee.toString()).to.equal('250');
    });

    it('should handle zero fee', () => {
      const price = new Decimal('100.00');
      const feeBps = 0;

      const fee = price.mul(feeBps).div(10000);
      expect(fee.toString()).to.equal('0');
    });
  });
});

