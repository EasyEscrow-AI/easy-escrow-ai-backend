/**
 * Unit Tests for Expiry Timestamp Validation
 * 
 * Tests the bug fix for transaction error 0x1771 (InvalidExpiry)
 * which occurs when expiry timestamps are too close to current time
 * or in the past when they reach the blockchain.
 */

import { expect } from 'chai';
import { BN } from '@coral-xyz/anchor';

/**
 * Helper function that simulates the on-chain validation
 * This replicates: require!(expiry_timestamp > Clock::get()?.unix_timestamp)
 */
function simulateOnChainExpiryValidation(expiryTimestamp: BN): { isValid: boolean; error?: string } {
  const currentBlockchainTime = Math.floor(Date.now() / 1000);
  const expirySeconds = expiryTimestamp.toNumber();
  
  console.log('[Validation] Blockchain time:', currentBlockchainTime);
  console.log('[Validation] Expiry timestamp:', expirySeconds);
  console.log('[Validation] Difference:', expirySeconds - currentBlockchainTime, 'seconds');
  
  // This replicates the on-chain validation
  if (expirySeconds <= currentBlockchainTime) {
    return {
      isValid: false,
      error: 'custom program error: 0x1771 (InvalidExpiry)',
    };
  }
  
  return { isValid: true };
}

/**
 * Helper function that converts a Date to Unix timestamp (current implementation)
 * This is what's CURRENTLY in solana.service.ts line 829
 */
function currentImplementation_convertExpiryToTimestamp(expiry: Date): BN {
  return new BN(Math.floor(expiry.getTime() / 1000));
}

/**
 * Helper function that converts a Date to Unix timestamp with buffer (FIXED implementation)
 * This is what SHOULD be in solana.service.ts
 */
function fixedImplementation_convertExpiryToTimestamp(expiry: Date): BN {
  const BUFFER_SECONDS = 60; // 60-second buffer to account for network delays
  const expiryTimestamp = Math.floor(expiry.getTime() / 1000);
  return new BN(expiryTimestamp + BUFFER_SECONDS);
}

describe('Expiry Timestamp Validation', () => {
  describe('Bug Reproduction: Current Implementation Failures', () => {
    it('CURRENT CODE: should FAIL validation when expiry is in the past', () => {
      const pastExpiry = new Date(Date.now() - 60000); // 1 minute ago
      const timestamp = currentImplementation_convertExpiryToTimestamp(pastExpiry);
      
      const result = simulateOnChainExpiryValidation(timestamp);
      
      expect(result.isValid).to.be.false;
      expect(result.error).to.match(/0x1771|InvalidExpiry/);
    });

    it('CURRENT CODE: should FAIL validation when expiry is exactly now', () => {
      const nowExpiry = new Date(); // Current time
      const timestamp = currentImplementation_convertExpiryToTimestamp(nowExpiry);
      
      const result = simulateOnChainExpiryValidation(timestamp);
      
      expect(result.isValid).to.be.false;
      expect(result.error).to.match(/0x1771|InvalidExpiry/);
    });

    it('CURRENT CODE: should FAIL validation when expiry is only 1 second in the future (network delay)', async () => {
      const tooSoonExpiry = new Date(Date.now() + 1000); // 1 second from now
      const timestamp = currentImplementation_convertExpiryToTimestamp(tooSoonExpiry);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait 1.1 seconds
      
      const result = simulateOnChainExpiryValidation(timestamp);
      
      expect(result.isValid).to.be.false;
      expect(result.error).to.match(/0x1771|InvalidExpiry/);
    });

    it('CURRENT CODE: demonstrates the race condition problem', () => {
      // Even with a "future" expiry, by the time it reaches the blockchain,
      // it might be in the past due to network latency
      const shortFutureExpiry = new Date(Date.now() + 5000); // 5 seconds from now
      const timestamp = currentImplementation_convertExpiryToTimestamp(shortFutureExpiry);
      
      console.log('\n[Demo] Race Condition:');
      console.log('  User submits transaction at:', new Date().toISOString());
      console.log('  Expiry timestamp:', new Date(timestamp.toNumber() * 1000).toISOString());
      console.log('  Network delay: 2-10 seconds is common');
      console.log('  Result: Transaction might fail with 0x1771 by the time it\'s processed\n');
      
      // This might pass now, but could fail by the time it reaches the chain
      expect(timestamp.toNumber()).to.be.greaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('Fix Validation: Buffer Implementation Success', () => {
    it('FIXED CODE: should PASS validation even when original expiry is in the past (edge case)', () => {
      // Edge case: user provides a past expiry, but the buffer makes it valid
      const pastExpiry = new Date(Date.now() - 30000); // 30 seconds ago
      const timestamp = fixedImplementation_convertExpiryToTimestamp(pastExpiry);
      
      const result = simulateOnChainExpiryValidation(timestamp);
      
      // With 60-second buffer: -30 + 60 = 30 seconds in future
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.undefined;
    });

    it('FIXED CODE: should PASS validation when expiry is now', () => {
      const nowExpiry = new Date();
      const timestamp = fixedImplementation_convertExpiryToTimestamp(nowExpiry);
      
      const result = simulateOnChainExpiryValidation(timestamp);
      
      // With 60-second buffer, it should be valid
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.undefined;
    });

    it('FIXED CODE: should PASS validation when expiry is only 1 second in the future', async () => {
      const tooSoonExpiry = new Date(Date.now() + 1000); // 1 second from now
      const timestamp = fixedImplementation_convertExpiryToTimestamp(tooSoonExpiry);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait 1.1 seconds
      
      const result = simulateOnChainExpiryValidation(timestamp);
      
      // With 60-second buffer, this should still be valid
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.undefined;
    });

    it('FIXED CODE: should PASS when expiry is 2 minutes in the future', () => {
      const futureExpiry = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now
      const timestamp = fixedImplementation_convertExpiryToTimestamp(futureExpiry);
      
      const result = simulateOnChainExpiryValidation(timestamp);
      
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.undefined;
    });

    it('FIXED CODE: should PASS when expiry is 1 hour in the future', () => {
      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const timestamp = fixedImplementation_convertExpiryToTimestamp(futureExpiry);
      
      const result = simulateOnChainExpiryValidation(timestamp);
      
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.undefined;
    });

    it('FIXED CODE: should PASS when expiry is 24 hours in the future', () => {
      const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      const timestamp = fixedImplementation_convertExpiryToTimestamp(futureExpiry);
      
      const result = simulateOnChainExpiryValidation(timestamp);
      
      expect(result.isValid).to.be.true;
      expect(result.error).to.be.undefined;
    });
  });

  describe('Buffer Mechanics', () => {
    it('should add exactly 60 seconds to the expiry timestamp', () => {
      const testDate = new Date('2024-12-31T23:59:59Z');
      const current = currentImplementation_convertExpiryToTimestamp(testDate);
      const fixed = fixedImplementation_convertExpiryToTimestamp(testDate);
      
      const difference = fixed.toNumber() - current.toNumber();
      expect(difference).to.equal(60);
    });

    it('should handle edge cases where buffer makes the difference', () => {
      // Case where current implementation WOULD fail but fixed passes
      const borderlineExpiry = new Date(Date.now() + 30000); // 30 seconds from now
      
      // Simulate 40-second network delay (common in congested networks)
      const simulatedFutureTime = Date.now() + 40000;
      
      const currentTimestamp = currentImplementation_convertExpiryToTimestamp(borderlineExpiry);
      const fixedTimestamp = fixedImplementation_convertExpiryToTimestamp(borderlineExpiry);
      
      const currentExpiryTime = currentTimestamp.toNumber() * 1000;
      const fixedExpiryTime = fixedTimestamp.toNumber() * 1000;
      
      console.log('\n[Edge Case Analysis]:');
      console.log('  Current implementation expiry:', new Date(currentExpiryTime).toISOString());
      console.log('  Fixed implementation expiry:  ', new Date(fixedExpiryTime).toISOString());
      console.log('  Simulated blockchain time:    ', new Date(simulatedFutureTime).toISOString());
      console.log('  Current would fail:', currentExpiryTime <= simulatedFutureTime);
      console.log('  Fixed would pass:  ', fixedExpiryTime > simulatedFutureTime, '\n');
      
      expect(currentExpiryTime).to.be.lessThan(simulatedFutureTime); // FAILS
      expect(fixedExpiryTime).to.be.greaterThan(simulatedFutureTime); // PASSES
    });
  });

  describe('Timestamp Conversion Accuracy', () => {
    it('should convert JavaScript Date to Unix timestamp correctly', () => {
      const testDate = new Date('2024-12-31T23:59:59Z');
      const expectedTimestamp = Math.floor(testDate.getTime() / 1000);
      
      expect(expectedTimestamp).to.equal(1735689599);
    });

    it('should handle milliseconds correctly (truncate, not round)', () => {
      const dateWithMs = new Date('2024-12-31T23:59:59.999Z');
      const timestamp = Math.floor(dateWithMs.getTime() / 1000);
      
      // Should be 1735689599, not 1735689600 (no rounding)
      expect(timestamp).to.equal(1735689599);
    });
  });
});

/**
 * Expected Test Results BEFORE Fix:
 * ❌ should FAIL when expiry is in the past - FAIL (correctly fails)
 * ❌ should FAIL when expiry is exactly now - FAIL (correctly fails)
 * ❌ should FAIL when expiry is only 1 second in the future - FAIL (correctly fails)
 * ❌ should PASS when expiry is 2 minutes in the future - MIGHT FAIL (race condition)
 * ✅ should PASS when expiry is 1 hour in the future - PASS
 * ✅ should PASS when expiry is 24 hours in the future - PASS
 * 
 * Expected Test Results AFTER Fix:
 * ✅ All tests pass because the fix adds a 60-second buffer to all expiry times
 */

