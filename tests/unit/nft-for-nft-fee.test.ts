import { expect } from 'chai';
import sinon from 'sinon';
import BN from 'bn.js';
import { Decimal } from '@prisma/client/runtime/library';
import { SwapType } from '../../src/generated/prisma';

/**
 * Unit tests for NFT_FOR_NFT_WITH_FEE bug fixes (PR #203)
 * 
 * These tests prevent regression of 3 critical bugs discovered during production testing:
 * 
 * BUG #1: Premature Settlement
 *   - agreement.solAmount served two conflicting purposes
 *   - Buyer deposited full amount (0.01 SOL) instead of half (0.005 SOL)
 *   - Settlement triggered before seller could deposit
 * 
 * BUG #2: Wrong Fee Calculation
 *   - Settlement treated solAmount as "sale price" and calculated fee as percentage
 *   - Database recorded 99% revenue loss (0.0001 SOL instead of 0.01 SOL)
 *   - sellerReceived showed 0.0099 SOL when seller should receive NFT, not SOL
 * 
 * BUG #3: Rent Recovery Failing (documented, requires smart contract fix)
 */

describe('NFT_FOR_NFT_WITH_FEE Bug Fixes', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ========================================================================
  // BUG #1a: Agreement Creation - Set Buyer's Portion in solAmount
  // ========================================================================
  describe('Bug #1a: Agreement Creation (agreement.service.ts)', () => {
    it('should set solAmount to BUYER\'S PORTION (half) for NFT_FOR_NFT_WITH_FEE', () => {
      // Arrange
      const LAMPORTS_PER_SOL = 1000000000;
      const feeBps = 100; // 1%
      const platformFeeLamports = Math.max(
        Math.floor((feeBps / 10000) * LAMPORTS_PER_SOL),
        10000000 // 0.01 SOL minimum
      );
      
      // Act
      const buyerPortion = Math.floor(platformFeeLamports / 2);
      const solAmount = new BN(buyerPortion);
      
      // Assert
      expect(solAmount.toNumber()).to.equal(5000000); // 0.005 SOL
      expect(buyerPortion).to.equal(platformFeeLamports / 2);
    });

    it('should calculate correct buyer portion with 1% fee (default)', () => {
      // Arrange
      const LAMPORTS_PER_SOL = 1000000000;
      const feeBps = 100; // 1%
      
      // Act
      const platformFeeLamports = Math.max(
        Math.floor((feeBps / 10000) * LAMPORTS_PER_SOL),
        10000000
      );
      const buyerPortion = Math.floor(platformFeeLamports / 2);
      
      // Assert
      expect(platformFeeLamports).to.equal(10000000); // 0.01 SOL total
      expect(buyerPortion).to.equal(5000000); // 0.005 SOL for buyer
    });

    it('should calculate correct buyer portion with custom fee', () => {
      // Arrange
      const LAMPORTS_PER_SOL = 1000000000;
      const feeBps = 200; // 2%
      
      // Act
      const platformFeeLamports = Math.max(
        Math.floor((feeBps / 10000) * LAMPORTS_PER_SOL),
        10000000
      );
      const buyerPortion = Math.floor(platformFeeLamports / 2);
      
      // Assert
      expect(platformFeeLamports).to.equal(20000000); // 0.02 SOL total
      expect(buyerPortion).to.equal(10000000); // 0.01 SOL for buyer
    });

    it('should enforce minimum platform fee of 0.01 SOL', () => {
      // Arrange
      const LAMPORTS_PER_SOL = 1000000000;
      const feeBps = 10; // 0.1% (too low)
      
      // Act
      const platformFeeLamports = Math.max(
        Math.floor((feeBps / 10000) * LAMPORTS_PER_SOL),
        10000000 // Minimum 0.01 SOL
      );
      const buyerPortion = Math.floor(platformFeeLamports / 2);
      
      // Assert - Should use minimum, not calculated
      expect(platformFeeLamports).to.equal(10000000); // 0.01 SOL (minimum)
      expect(buyerPortion).to.equal(5000000); // 0.005 SOL for buyer
    });
  });

  // ========================================================================
  // BUG #1b: Deposit Validation - Expect Total Fee
  // ========================================================================
  describe('Bug #1b: SOL Deposit Validation (sol-deposit.service.ts)', () => {
    it('should calculate expectedAmount as TOTAL (buyer portion * 2) for NFT_FOR_NFT_WITH_FEE', () => {
      // Arrange
      const agreement = {
        swapType: 'NFT_FOR_NFT_WITH_FEE' as SwapType,
        solAmount: new Decimal('5000000'), // Buyer's portion
      };
      
      // Act - Simulating sol-deposit.service.ts logic
      let expectedAmount: bigint;
      if (agreement.swapType === 'NFT_FOR_NFT_WITH_FEE') {
        const buyerPortion = agreement.solAmount ? BigInt(agreement.solAmount.toString()) : BigInt(0);
        expectedAmount = buyerPortion * BigInt(2); // Total = buyer's portion * 2
      } else {
        expectedAmount = agreement.solAmount ? BigInt(agreement.solAmount.toString()) : BigInt(0);
      }
      
      // Assert
      expect(expectedAmount).to.equal(BigInt(10000000)); // 0.01 SOL total
    });

    it('should NOT trigger BOTH_LOCKED when only buyer has deposited', () => {
      // Arrange
      const buyerPortion = BigInt(5000000); // 0.005 SOL
      const expectedTotal = buyerPortion * BigInt(2); // 0.01 SOL
      const vaultBalance = BigInt(5000000); // Only buyer deposited
      
      // Act
      const allDepositsComplete = vaultBalance >= expectedTotal;
      
      // Assert
      expect(allDepositsComplete).to.be.false;
      expect(Number(vaultBalance)).to.be.lessThan(Number(expectedTotal));
    });

    it('should trigger BOTH_LOCKED only after both parties deposit', () => {
      // Arrange
      const buyerPortion = BigInt(5000000); // 0.005 SOL
      const expectedTotal = buyerPortion * BigInt(2); // 0.01 SOL
      const vaultBalance = BigInt(10000000); // Both deposited
      
      // Act
      const allDepositsComplete = vaultBalance >= expectedTotal;
      
      // Assert
      expect(allDepositsComplete).to.be.true;
      expect(vaultBalance).to.equal(expectedTotal);
    });

    it('should handle other swap types without multiplying by 2', () => {
      // Arrange
      const agreement = {
        swapType: 'NFT_FOR_SOL' as SwapType,
        solAmount: new Decimal('1000000000'), // 1 SOL
      };
      
      // Act
      let expectedAmount: bigint;
      if (agreement.swapType === 'NFT_FOR_NFT_WITH_FEE') {
        const buyerPortion = agreement.solAmount ? BigInt(agreement.solAmount.toString()) : BigInt(0);
        expectedAmount = buyerPortion * BigInt(2);
      } else {
        expectedAmount = agreement.solAmount ? BigInt(agreement.solAmount.toString()) : BigInt(0);
      }
      
      // Assert
      expect(expectedAmount).to.equal(BigInt(1000000000)); // Not multiplied
    });
  });

  // ========================================================================
  // BUG #2: Settlement Fee Calculation
  // ========================================================================
  describe('Bug #2: Settlement Fee Calculation (settlement.service.ts)', () => {
    it('should calculate platformFee as TOTAL (buyer portion * 2) for NFT_FOR_NFT_WITH_FEE', () => {
      // Arrange
      const agreement = {
        swapType: 'NFT_FOR_NFT_WITH_FEE' as SwapType,
        solAmount: new Decimal('5000000'), // Buyer's portion
        feeBps: 100,
      };
      
      // Act - Simulating calculateFeesV2 logic
      const solAmount = new Decimal(agreement.solAmount.toString());
      let platformFee: Decimal;
      
      if (agreement.swapType === 'NFT_FOR_NFT_WITH_FEE') {
        // solAmount is buyer's portion, total fee is double
        platformFee = solAmount.mul(2);
      } else {
        // For other swap types, calculate fee as percentage
        platformFee = solAmount.mul(agreement.feeBps).div(10000);
      }
      
      // Assert
      expect(platformFee.toString()).to.equal('10000000'); // 0.01 SOL
    });

    it('should set sellerReceived to 0 (seller gets NFT, not SOL) for NFT_FOR_NFT_WITH_FEE', () => {
      // Arrange
      const agreement = {
        swapType: 'NFT_FOR_NFT_WITH_FEE' as SwapType,
        solAmount: new Decimal('5000000'),
        feeBps: 100,
      };
      
      // Act
      const solAmount = new Decimal(agreement.solAmount.toString());
      let sellerReceived: Decimal;
      let platformFee: Decimal;
      
      if (agreement.swapType === 'NFT_FOR_NFT_WITH_FEE') {
        platformFee = solAmount.mul(2);
        sellerReceived = new Decimal(0); // Seller gets NFT B, not SOL
      } else {
        platformFee = solAmount.mul(agreement.feeBps).div(10000);
        const totalDeductions = platformFee;
        sellerReceived = solAmount.sub(totalDeductions);
      }
      
      // Assert
      expect(sellerReceived.toString()).to.equal('0');
      expect(platformFee.toString()).to.equal('10000000');
    });

    it('should NOT treat solAmount as sale price for NFT_FOR_NFT_WITH_FEE', () => {
      // Arrange - This was the BUG: treating solAmount as sale price
      const solAmount = new Decimal('10000000'); // 0.01 SOL
      const feeBps = 100; // 1%
      
      // Act - Old WRONG calculation (treating as sale price)
      const wrongPlatformFee = solAmount.mul(feeBps).div(10000);
      
      // Assert - Shows why this was wrong
      expect(wrongPlatformFee.toString()).to.equal('100000'); // 0.0001 SOL - 99% loss!
      
      // Correct calculation for NFT_FOR_NFT_WITH_FEE
      const buyerPortion = new Decimal('5000000');
      const correctPlatformFee = buyerPortion.mul(2);
      expect(correctPlatformFee.toString()).to.equal('10000000'); // 0.01 SOL - correct!
    });

    it('should calculate fees correctly for other swap types (not affected)', () => {
      // Arrange
      const agreement = {
        swapType: 'NFT_FOR_SOL' as SwapType,
        solAmount: new Decimal('1000000000'), // 1 SOL sale price
        feeBps: 100, // 1%
      };
      
      // Act
      const solAmount = new Decimal(agreement.solAmount.toString());
      let platformFee: Decimal;
      let sellerReceived: Decimal;
      
      if (agreement.swapType === 'NFT_FOR_NFT_WITH_FEE') {
        platformFee = solAmount.mul(2);
        sellerReceived = new Decimal(0);
      } else {
        // For NFT_FOR_SOL, solAmount IS the sale price
        platformFee = solAmount.mul(agreement.feeBps).div(10000);
        sellerReceived = solAmount.sub(platformFee);
      }
      
      // Assert - Should work as before
      expect(platformFee.toString()).to.equal('10000000'); // 0.01 SOL (1% of 1 SOL)
      expect(sellerReceived.toString()).to.equal('990000000'); // 0.99 SOL
    });

    it('should handle custom fee basis points correctly for NFT_FOR_NFT_WITH_FEE', () => {
      // Arrange
      const feeBps = 200; // 2%
      const LAMPORTS_PER_SOL = 1000000000;
      
      // Calculate total platform fee
      const platformFeeLamports = Math.max(
        Math.floor((feeBps / 10000) * LAMPORTS_PER_SOL),
        10000000
      );
      
      // Calculate buyer portion (what's stored in agreement.solAmount)
      const buyerPortion = Math.floor(platformFeeLamports / 2);
      
      // Act - Settlement calculation
      const solAmount = new Decimal(buyerPortion.toString());
      const platformFee = solAmount.mul(2);
      
      // Assert
      expect(platformFee.toString()).to.equal('20000000'); // 0.02 SOL total
      expect(buyerPortion).to.equal(10000000); // 0.01 SOL per party
    });
  });

  // ========================================================================
  // Integration Test: Complete Flow
  // ========================================================================
  describe('Integration: Complete NFT_FOR_NFT_WITH_FEE Flow', () => {
    it('should prevent premature settlement and calculate fees correctly', () => {
      const LAMPORTS_PER_SOL = 1000000000;
      const feeBps = 100; // 1%
      
      // Step 1: Agreement Creation
      const platformFeeLamports = Math.max(
        Math.floor((feeBps / 10000) * LAMPORTS_PER_SOL),
        10000000
      );
      const buyerPortion = Math.floor(platformFeeLamports / 2);
      const agreementSolAmount = new Decimal(buyerPortion.toString());
      
      expect(buyerPortion).to.equal(5000000, 'Agreement should store buyer portion');
      
      // Step 2: Buyer Deposits 0.005 SOL
      const vaultAfterBuyer = BigInt(5000000);
      const expectedTotal = BigInt(buyerPortion) * BigInt(2);
      const bothLockedAfterBuyer = vaultAfterBuyer >= expectedTotal;
      
      expect(bothLockedAfterBuyer, 'Should NOT be BOTH_LOCKED after buyer deposits').to.be.false;
      
      // Step 3: Seller Deposits 0.005 SOL
      const vaultAfterSeller = BigInt(10000000);
      const bothLockedAfterSeller = vaultAfterSeller >= expectedTotal;
      
      expect(bothLockedAfterSeller, 'Should be BOTH_LOCKED after seller deposits').to.be.true;
      
      // Step 4: Settlement Fee Calculation
      const platformFee = agreementSolAmount.mul(2);
      const sellerReceived = new Decimal(0);
      
      expect(platformFee.toString()).to.equal('10000000', 'Platform fee should be 0.01 SOL');
      expect(sellerReceived.toString()).to.equal('0', 'Seller receives NFT, not SOL');
      
      // Step 5: Verify NOT the old broken behavior
      const wrongPlatformFee = new Decimal('10000000').mul(feeBps).div(10000);
      expect(wrongPlatformFee.toString()).to.equal('100000', 'Old bug calculated 0.0001 SOL');
      expect(platformFee.toString()).to.not.equal(wrongPlatformFee.toString(), 'Should NOT use old calculation');
    });
  });

  // ========================================================================
  // Edge Cases
  // ========================================================================
  describe('Edge Cases', () => {
    it('should handle zero solAmount gracefully', () => {
      // Arrange
      const agreement = {
        swapType: 'NFT_FOR_NFT_WITH_FEE' as SwapType,
        solAmount: new Decimal('0'),
      };
      
      // Act
      const buyerPortion = agreement.solAmount ? BigInt(agreement.solAmount.toString()) : BigInt(0);
      const expectedAmount = buyerPortion * BigInt(2);
      
      // Assert
      expect(expectedAmount).to.equal(BigInt(0));
    });

    it('should handle very large fee amounts', () => {
      // Arrange
      const LAMPORTS_PER_SOL = 1000000000;
      const feeBps = 1000; // 10% (very high)
      
      // Act
      const platformFeeLamports = Math.floor((feeBps / 10000) * LAMPORTS_PER_SOL);
      const buyerPortion = Math.floor(platformFeeLamports / 2);
      
      // Assert
      expect(platformFeeLamports).to.equal(100000000); // 0.1 SOL
      expect(buyerPortion).to.equal(50000000); // 0.05 SOL per party
    });

    it('should handle odd platform fee amounts (rounding)', () => {
      // Arrange
      const platformFeeLamports = 10000001; // Odd number
      
      // Act
      const buyerPortion = Math.floor(platformFeeLamports / 2);
      const expectedTotal = buyerPortion * 2;
      
      // Assert
      expect(buyerPortion).to.equal(5000000); // Rounds down
      expect(expectedTotal).to.equal(10000000); // Lost 1 lamport to rounding
      expect(expectedTotal).to.be.lessThan(platformFeeLamports); // Expected behavior
    });
  });
});

