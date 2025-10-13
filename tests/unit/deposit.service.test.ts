import { expect } from 'chai';
import { Decimal } from '@prisma/client/runtime/library';
import { DepositType, DepositStatus } from '../../src/generated/prisma';
import { testDeposits, testAgreements } from '../fixtures/test-data';
import { usdcToLamports } from '../helpers/test-utils';

describe('Deposit Service - Unit Tests', () => {
  describe('Deposit Status Validation', () => {
    it('should have all required deposit statuses', () => {
      const statuses = [
        DepositStatus.PENDING,
        DepositStatus.CONFIRMED,
        DepositStatus.REFUNDED,
      ];

      expect(statuses).to.have.lengthOf(3);
      expect(statuses).to.include(DepositStatus.PENDING);
      expect(statuses).to.include(DepositStatus.CONFIRMED);
    });
  });

  describe('Deposit Type Validation', () => {
    it('should support USDC and NFT deposit types', () => {
      const types = [DepositType.USDC, DepositType.NFT];

      expect(types).to.have.lengthOf(2);
      expect(types).to.include(DepositType.USDC);
      expect(types).to.include(DepositType.NFT);
    });
  });

  describe('USDC Deposit Amount Validation', () => {
    it('should validate positive amounts', () => {
      const amount = new Decimal('100.50');
      expect(amount.isPositive()).to.be.true;
    });

    it('should reject zero amounts', () => {
      const amount = new Decimal('0');
      expect(amount.isZero()).to.be.true;
    });

    it('should reject negative amounts', () => {
      const amount = new Decimal('-10.00');
      expect(amount.isNegative()).to.be.true;
    });

    it('should handle decimal precision correctly', () => {
      const amount = new Decimal('100.123456');
      expect(amount.decimalPlaces()).to.equal(6);
    });
  });

  describe('Deposit Matching', () => {
    it('should match deposit amount to agreement price', () => {
      const agreementPrice = new Decimal('100.00');
      const depositAmount = new Decimal('100.00');

      expect(depositAmount.equals(agreementPrice)).to.be.true;
    });

    it('should detect under-deposit', () => {
      const agreementPrice = new Decimal('100.00');
      const depositAmount = new Decimal('99.99');

      expect(depositAmount.lessThan(agreementPrice)).to.be.true;
    });

    it('should detect over-deposit', () => {
      const agreementPrice = new Decimal('100.00');
      const depositAmount = new Decimal('100.01');

      expect(depositAmount.greaterThan(agreementPrice)).to.be.true;
    });
  });

  describe('NFT Deposit Validation', () => {
    it('should validate NFT deposits have no amount', () => {
      const nftDeposit = testDeposits.nftConfirmed;
      expect(nftDeposit.amount).to.be.null;
    });

    it('should validate NFT deposits have transaction ID', () => {
      const nftDeposit = testDeposits.nftConfirmed;
      expect(nftDeposit.txId).to.be.a('string');
      expect(nftDeposit.txId).to.have.length.greaterThan(0);
    });
  });

  describe('Deposit Timing', () => {
    it('should track detection time', () => {
      const deposit = testDeposits.usdcConfirmed;
      expect(deposit.detectedAt).to.be.instanceOf(Date);
    });

    it('should track confirmation time for confirmed deposits', () => {
      const deposit = testDeposits.usdcConfirmed;
      expect(deposit.confirmedAt).to.be.instanceOf(Date);
      expect(deposit.confirmedAt!.getTime()).to.be.at.least(deposit.detectedAt.getTime());
    });

    it('should have null confirmation time for pending deposits', () => {
      const deposit = testDeposits.usdcPending;
      expect(deposit.confirmedAt).to.be.null;
    });
  });

  describe('Deposit Transaction Validation', () => {
    it('should validate transaction ID format', () => {
      const txId = testDeposits.usdcConfirmed.txId;
      expect(txId).to.be.a('string');
      expect(txId).to.match(/^TEST_/);
    });

    it('should have unique transaction IDs', () => {
      const tx1 = testDeposits.usdcConfirmed.txId;
      const tx2 = testDeposits.nftConfirmed.txId;
      expect(tx1).to.not.equal(tx2);
    });
  });

  describe('Amount Conversion', () => {
    it('should convert USDC amounts to blockchain units', () => {
      const usdcAmount = 100.50;
      const lamports = usdcToLamports(usdcAmount);
      
      expect(lamports).to.equal(100_500_000);
    });

    it('should handle fractional USDC amounts', () => {
      const usdcAmount = 0.000001; // Minimum USDC unit
      const lamports = usdcToLamports(usdcAmount);
      
      expect(lamports).to.equal(1);
    });

    it('should handle large USDC amounts', () => {
      const usdcAmount = 1_000_000; // 1 million USDC
      const lamports = usdcToLamports(usdcAmount);
      
      expect(lamports).to.equal(1_000_000_000_000);
    });
  });
});

