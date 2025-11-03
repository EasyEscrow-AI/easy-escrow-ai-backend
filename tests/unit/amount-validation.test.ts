/**
 * Unit Tests for BETA Launch Escrow Amount Limits
 * 
 * Tests for escrow value limits:
 * - Minimum: $1.00
 * - Maximum: $10,000.00
 * 
 * These limits will be reassessed after BETA period
 */

import { expect } from 'chai';
import { isValidUSDCAmount, ESCROW_LIMITS } from '../../src/models/validators/solana.validator';
import { Decimal } from '@prisma/client/runtime/library';

describe('BETA Launch Escrow Amount Limits', () => {
  describe('ESCROW_LIMITS Constants', () => {
    it('should have minimum limit of $1.00', () => {
      expect(ESCROW_LIMITS.MIN_USDC).to.equal(1.0);
    });

    it('should have maximum limit of $10,000.00', () => {
      expect(ESCROW_LIMITS.MAX_USDC).to.equal(10000.0);
    });
  });

  describe('Minimum Amount Validation ($1.00)', () => {
    it('should reject amounts below $1.00', () => {
      expect(isValidUSDCAmount(0.99)).to.be.false;
      expect(isValidUSDCAmount(0.50)).to.be.false;
      expect(isValidUSDCAmount(0.01)).to.be.false;
    });

    it('should reject zero amount', () => {
      expect(isValidUSDCAmount(0)).to.be.false;
    });

    it('should reject negative amounts', () => {
      expect(isValidUSDCAmount(-1)).to.be.false;
      expect(isValidUSDCAmount(-100)).to.be.false;
    });

    it('should accept exactly $1.00', () => {
      expect(isValidUSDCAmount(1.0)).to.be.true;
      expect(isValidUSDCAmount(1.00)).to.be.true;
    });

    it('should accept amounts just above $1.00', () => {
      expect(isValidUSDCAmount(1.01)).to.be.true;
      expect(isValidUSDCAmount(1.50)).to.be.true;
    });
  });

  describe('Maximum Amount Validation ($10,000.00)', () => {
    it('should reject amounts above $10,000.00', () => {
      expect(isValidUSDCAmount(10000.01)).to.be.false;
      expect(isValidUSDCAmount(10001.00)).to.be.false;
      expect(isValidUSDCAmount(50000.00)).to.be.false;
      expect(isValidUSDCAmount(100000.00)).to.be.false;
    });

    it('should accept exactly $10,000.00', () => {
      expect(isValidUSDCAmount(10000.0)).to.be.true;
      expect(isValidUSDCAmount(10000.00)).to.be.true;
    });

    it('should accept amounts just below $10,000.00', () => {
      expect(isValidUSDCAmount(9999.99)).to.be.true;
      expect(isValidUSDCAmount(9999.00)).to.be.true;
      expect(isValidUSDCAmount(9500.00)).to.be.true;
    });
  });

  describe('Valid Range Tests', () => {
    it('should accept typical amounts within range', () => {
      expect(isValidUSDCAmount(1.00)).to.be.true;
      expect(isValidUSDCAmount(10.00)).to.be.true;
      expect(isValidUSDCAmount(100.00)).to.be.true;
      expect(isValidUSDCAmount(500.00)).to.be.true;
      expect(isValidUSDCAmount(1000.00)).to.be.true;
      expect(isValidUSDCAmount(5000.00)).to.be.true;
      expect(isValidUSDCAmount(10000.00)).to.be.true;
    });

    it('should handle decimal precision correctly', () => {
      expect(isValidUSDCAmount(1.23)).to.be.true;
      expect(isValidUSDCAmount(99.99)).to.be.true;
      expect(isValidUSDCAmount(999.99)).to.be.true;
      expect(isValidUSDCAmount(9999.99)).to.be.true;
    });
  });

  describe('String Input Support', () => {
    it('should accept valid string amounts within range', () => {
      expect(isValidUSDCAmount('1.00')).to.be.true;
      expect(isValidUSDCAmount('100.00')).to.be.true;
      expect(isValidUSDCAmount('1000.00')).to.be.true;
      expect(isValidUSDCAmount('10000.00')).to.be.true;
    });

    it('should reject string amounts outside range', () => {
      expect(isValidUSDCAmount('0.99')).to.be.false;
      expect(isValidUSDCAmount('10000.01')).to.be.false;
    });

    it('should reject invalid string formats', () => {
      expect(isValidUSDCAmount('invalid')).to.be.false;
      expect(isValidUSDCAmount('abc')).to.be.false;
      expect(isValidUSDCAmount('')).to.be.false;
    });
  });

  describe('Decimal Input Support', () => {
    it('should accept valid Decimal amounts within range', () => {
      expect(isValidUSDCAmount(new Decimal('1.00'))).to.be.true;
      expect(isValidUSDCAmount(new Decimal('100.00'))).to.be.true;
      expect(isValidUSDCAmount(new Decimal('1000.00'))).to.be.true;
      expect(isValidUSDCAmount(new Decimal('10000.00'))).to.be.true;
    });

    it('should reject Decimal amounts outside range', () => {
      expect(isValidUSDCAmount(new Decimal('0.99'))).to.be.false;
      expect(isValidUSDCAmount(new Decimal('10000.01'))).to.be.false;
    });

    it('should handle Decimal precision correctly', () => {
      expect(isValidUSDCAmount(new Decimal('1.234567'))).to.be.true;
      expect(isValidUSDCAmount(new Decimal('9999.999999'))).to.be.true;
    });
  });

  describe('Edge Cases', () => {
    it('should reject NaN values', () => {
      expect(isValidUSDCAmount(NaN)).to.be.false;
      expect(isValidUSDCAmount('NaN')).to.be.false;
    });

    it('should reject Infinity values', () => {
      expect(isValidUSDCAmount(Infinity)).to.be.false;
      expect(isValidUSDCAmount(-Infinity)).to.be.false;
    });

    it('should handle very small amounts correctly', () => {
      expect(isValidUSDCAmount(0.000001)).to.be.false; // Below minimum
      expect(isValidUSDCAmount(0.99999999)).to.be.false; // Below minimum
    });

    it('should handle boundary values precisely', () => {
      // Exactly at boundaries
      expect(isValidUSDCAmount(ESCROW_LIMITS.MIN_USDC)).to.be.true;
      expect(isValidUSDCAmount(ESCROW_LIMITS.MAX_USDC)).to.be.true;
      
      // Just outside boundaries
      expect(isValidUSDCAmount(ESCROW_LIMITS.MIN_USDC - 0.01)).to.be.false;
      expect(isValidUSDCAmount(ESCROW_LIMITS.MAX_USDC + 0.01)).to.be.false;
    });
  });

  describe('BETA Launch Context', () => {
    it('should document that limits are for BETA period', () => {
      // This test serves as documentation that these limits are temporary
      // and will be reassessed after BETA
      expect(ESCROW_LIMITS.MIN_USDC).to.equal(1.0);
      expect(ESCROW_LIMITS.MAX_USDC).to.equal(10000.0);
    });

    it('should use realistic BETA amounts', () => {
      // Common amounts users might test during BETA
      const betaTestAmounts = [
        1.00,    // Minimum test
        5.00,    // Small transaction
        50.00,   // Medium transaction
        500.00,  // Larger transaction
        5000.00, // High-value transaction
        10000.00 // Maximum test
      ];

      betaTestAmounts.forEach(amount => {
        expect(isValidUSDCAmount(amount)).to.be.true;
      });
    });
  });
});

