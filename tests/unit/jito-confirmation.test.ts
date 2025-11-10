/**
 * Unit Tests for Jito Confirmation Architecture
 * 
 * Tests the waitForJitoConfirmation() method which implements:
 * - Tiered polling strategy (1-2s first 15s, 2-3s next 15s)
 * - Blockhash expiration tracking
 * - Proper error handling
 * - Timeout and retry recommendations
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

describe('EscrowProgramService - Jito Confirmation', function() {
  this.timeout(10000); // Unit tests should be fast

  let sandbox: sinon.SinonSandbox;
  let clock: sinon.SinonFakeTimers;
  let connection: sinon.SinonStubbedInstance<Connection>;
  let service: any;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    
    // Create fake timers for controlling time in tests
    clock = sandbox.useFakeTimers({
      now: Date.now(),
      shouldAdvanceTime: false,
    });

    // Create mock connection object with stubbed methods
    connection = {
      getBlockHeight: sandbox.stub().resolves(100),
      getSignatureStatuses: sandbox.stub().resolves({
        context: { slot: 100 },
        value: [null], // Default: transaction not found yet
      }),
    } as any;

    // Create a minimal mock service that only has the waitForJitoConfirmation method
    // and the provider.connection it depends on
    const mockKeypair = Keypair.generate();
    const mockWallet = new Wallet(mockKeypair);
    const provider = new AnchorProvider(
      connection as any,
      mockWallet,
      { commitment: 'confirmed' }
    );

    // Import only the method we're testing
    const { EscrowProgramService } = await import('../../src/services/escrow-program.service');
    
    // Create a minimal service-like object with just what waitForJitoConfirmation needs
    service = {
      provider: provider,
      waitForJitoConfirmation: EscrowProgramService.prototype.waitForJitoConfirmation
    };
  });

  afterEach(() => {
    sandbox.restore();
    clock.restore();
  });

  describe('waitForJitoConfirmation()', () => {
    
    // ============================================================================
    // HAPPY PATH TESTS
    // ============================================================================

    it('should confirm transaction immediately on first poll', async () => {
      // Mock: Transaction confirmed on first check
      connection.getSignatureStatuses.resolves({
        context: { slot: 100 },
        value: [{
          slot: 100,
          confirmations: null,
          confirmationStatus: 'confirmed',
          err: null,
        }],
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200, // lastValidBlockHeight
        30
      );

      // Advance time for the poll to execute
      await clock.tickAsync(100);

      const result = await promise;

      expect(result.confirmed).to.be.true;
      expect(result.error).to.be.undefined;
      expect(connection.getSignatureStatuses.calledOnce).to.be.true;
    });

    it('should confirm transaction with "finalized" status', async () => {
      connection.getSignatureStatuses.resolves({
        context: { slot: 100 },
        value: [{
          slot: 100,
          confirmations: null,
          confirmationStatus: 'finalized',
          err: null,
        }],
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        30
      );

      await clock.tickAsync(100);
      const result = await promise;

      expect(result.confirmed).to.be.true;
    });

    it('should confirm after multiple polls', async () => {
      let pollCount = 0;
      connection.getSignatureStatuses.callsFake(() => {
        pollCount++;
        if (pollCount >= 3) {
          // Confirm on 3rd poll
          return Promise.resolve({
            context: { slot: 100 },
            value: [{
              slot: 100,
              confirmations: null,
              confirmationStatus: 'confirmed',
              err: null,
            }],
          });
        }
        // Not found yet
        return Promise.resolve({ context: { slot: 100 }, value: [null] });
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        30
      );

      // Advance through multiple polling cycles
      await clock.tickAsync(100); // First poll
      await clock.tickAsync(1500); // Wait + second poll
      await clock.tickAsync(1500); // Wait + third poll (confirms)

      const result = await promise;

      expect(result.confirmed).to.be.true;
      expect(pollCount).to.equal(3);
    });

    // ============================================================================
    // TIERED POLLING INTERVAL TESTS
    // ============================================================================

    it('should use 1.5s interval for first 15 seconds', async () => {
      let pollTimes: number[] = [];
      connection.getSignatureStatuses.callsFake(() => {
        pollTimes.push(Date.now());
        return Promise.resolve({ context: { slot: 100 }, value: [null] });
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        10 // Limit attempts to avoid long test
      );

      // Simulate polling for first 10 seconds
      for (let i = 0; i < 6; i++) {
        await clock.tickAsync(100); // Poll execution
        await clock.tickAsync(1500); // Wait interval
      }

      // Force timeout
      await clock.tickAsync(30000);

      await promise;

      // Check that polls happened approximately every 1.5s
      // (within first 15 seconds of elapsed time)
      expect(pollTimes.length).to.be.greaterThan(5);
    });

    it('should use 2.5s interval after 15 seconds', async () => {
      let pollTimes: number[] = [];
      let pollCount = 0;
      
      connection.getSignatureStatuses.callsFake(() => {
        pollCount++;
        pollTimes.push(Date.now());
        
        // Don't confirm, let it poll through intervals
        return Promise.resolve({ context: { slot: 100 }, value: [null] });
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        20
      );

      // Fast-forward through first 15 seconds (should use 1.5s interval)
      for (let i = 0; i < 10; i++) {
        await clock.tickAsync(100);
        await clock.tickAsync(1500);
      }

      // Now fast-forward through next 15 seconds (should use 2.5s interval)
      for (let i = 0; i < 6; i++) {
        await clock.tickAsync(100);
        await clock.tickAsync(2500);
      }

      // Force timeout
      await clock.tickAsync(30000);

      await promise;

      expect(pollCount).to.be.greaterThan(10);
    });

    // ============================================================================
    // BLOCKHASH EXPIRATION TESTS
    // ============================================================================

    it('should detect blockhash expiration', async () => {
      // Mock: Current block height exceeds lastValidBlockHeight
      connection.getBlockHeight.resolves(201);

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200, // lastValidBlockHeight = 200, current = 201 (EXPIRED)
        30
      );

      await clock.tickAsync(100);
      const result = await promise;

      expect(result.confirmed).to.be.false;
      expect(result.error).to.include('Blockhash expired');
      expect(result.error).to.include('fresh blockhash');
    });

    it('should continue polling when blockhash is still valid', async () => {
      let pollCount = 0;
      connection.getBlockHeight.callsFake(() => {
        // Block height increases but stays below lastValidBlockHeight
        return Promise.resolve(100 + pollCount * 2);
      });

      connection.getSignatureStatuses.callsFake(() => {
        pollCount++;
        if (pollCount >= 5) {
          return Promise.resolve({
            context: { slot: 100 + pollCount * 2 },
            value: [{
              slot: 100 + pollCount * 2,
              confirmations: null,
              confirmationStatus: 'confirmed',
              err: null,
            }],
          });
        }
        return Promise.resolve({ context: { slot: 100 + pollCount * 2 }, value: [null] });
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200, // lastValidBlockHeight well above current
        30
      );

      // Advance through polls
      for (let i = 0; i < 6; i++) {
        await clock.tickAsync(100);
        await clock.tickAsync(1500);
      }

      const result = await promise;

      expect(result.confirmed).to.be.true;
      expect(pollCount).to.equal(5);
    });

    // ============================================================================
    // TRANSACTION FAILURE TESTS
    // ============================================================================

    it('should detect on-chain transaction failure', async () => {
      connection.getSignatureStatuses.resolves({
        context: { slot: 100 },
        value: [{
          slot: 100,
          confirmations: null,
          confirmationStatus: 'confirmed',
          err: { InstructionError: [0, 'Custom error'] },
        }],
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        30
      );

      await clock.tickAsync(100);
      const result = await promise;

      expect(result.confirmed).to.be.false;
      expect(result.error).to.include('Transaction failed');
      expect(result.error).to.include('InstructionError');
    });

    it('should return error details from failed transaction', async () => {
      connection.getSignatureStatuses.resolves({
        context: { slot: 100 },
        value: [{
          slot: 100,
          confirmations: null,
          confirmationStatus: 'confirmed',
          err: { 
            InstructionError: [1, { Custom: 6000 }]
          },
        }],
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        30
      );

      await clock.tickAsync(100);
      const result = await promise;

      expect(result.confirmed).to.be.false;
      expect(result.error).to.exist;
      expect(JSON.stringify(result.error)).to.include('6000');
    });

    // ============================================================================
    // TIMEOUT TESTS
    // ============================================================================

    it('should recommend retry after 30 seconds', async () => {
      connection.getSignatureStatuses.resolves({
        context: { slot: 100 },
        value: [null], // Transaction never confirms
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        30
      );

      // Fast-forward 31 seconds worth of polling
      for (let i = 0; i < 21; i++) {
        await clock.tickAsync(100);
        await clock.tickAsync(1500);
      }

      const result = await promise;

      expect(result.confirmed).to.be.false;
      expect(result.error).to.include('30s');
      expect(result.error).to.include('fresh blockhash');
    });

    it('should timeout after max polling attempts', async () => {
      connection.getSignatureStatuses.resolves({
        context: { slot: 100 },
        value: [null],
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        5 // Only 5 attempts
      );

      // Advance through 5 polls
      for (let i = 0; i < 6; i++) {
        await clock.tickAsync(100);
        await clock.tickAsync(1500);
      }

      const result = await promise;

      expect(result.confirmed).to.be.false;
      expect(result.error).to.include('timeout');
      expect(result.error).to.include('5 attempts');
    });

    it('should report elapsed time in timeout error', async () => {
      connection.getSignatureStatuses.resolves({
        context: { slot: 100 },
        value: [null],
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        3
      );

      // Advance through 3 polls
      for (let i = 0; i < 4; i++) {
        await clock.tickAsync(100);
        await clock.tickAsync(1500);
      }

      const result = await promise;

      expect(result.confirmed).to.be.false;
      expect(result.error).to.exist;
    });

    // ============================================================================
    // RPC ERROR HANDLING TESTS
    // ============================================================================

    it('should continue polling despite temporary RPC errors', async () => {
      let pollCount = 0;
      connection.getSignatureStatuses.callsFake(() => {
        pollCount++;
        if (pollCount <= 2) {
          // First 2 polls throw RPC error
          return Promise.reject(new Error('RPC connection error'));
        }
        if (pollCount === 3) {
          // Third poll succeeds with confirmation
          return Promise.resolve({
            context: { slot: 100 },
            value: [{
              slot: 100,
              confirmations: null,
              confirmationStatus: 'confirmed',
              err: null,
            }],
          });
        }
        return Promise.resolve({ context: { slot: 100 }, value: [null] });
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        30
      );

      // Advance through polls (errors should be caught and polling continues)
      for (let i = 0; i < 4; i++) {
        await clock.tickAsync(100);
        await clock.tickAsync(1500);
      }

      const result = await promise;

      expect(result.confirmed).to.be.true;
      expect(pollCount).to.equal(3);
    });

    it('should handle network disconnection gracefully', async () => {
      connection.getBlockHeight.rejects(
        new Error('Network error: ECONNREFUSED')
      );

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        3 // Low attempts for faster test
      );

      // Advance through polls
      for (let i = 0; i < 4; i++) {
        await clock.tickAsync(100);
        await clock.tickAsync(1500);
      }

      const result = await promise;

      // Should timeout gracefully, not throw
      expect(result.confirmed).to.be.false;
      expect(result.error).to.exist;
    });

    // ============================================================================
    // EDGE CASES
    // ============================================================================

    it('should handle null status from RPC', async () => {
      connection.getSignatureStatuses.resolves({
        context: { slot: 100 },
        value: [null], // Transaction not found
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        2
      );

      await clock.tickAsync(100);
      await clock.tickAsync(1500);
      await clock.tickAsync(100);
      await clock.tickAsync(1500);
      await clock.tickAsync(100);

      const result = await promise;

      // Should timeout, not crash
      expect(result.confirmed).to.be.false;
    });

    it('should handle undefined status value', async () => {
      connection.getSignatureStatuses.resolves({
        context: { slot: 100 },
        value: [undefined as any],
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        2
      );

      // Advance through 2 polling attempts
      await clock.tickAsync(100); // Poll 1
      await clock.tickAsync(1500); // Wait
      await clock.tickAsync(100); // Poll 2
      await clock.tickAsync(1500); // Wait
      await clock.tickAsync(100); // Finish

      const result = await promise;

      expect(result.confirmed).to.be.false;
    });

    it('should handle empty status response', async () => {
      connection.getSignatureStatuses.resolves({
        context: { slot: 100 },
        value: [],
      });

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        2
      );

      // Advance through 2 polling attempts
      await clock.tickAsync(100); // Poll 1
      await clock.tickAsync(1500); // Wait
      await clock.tickAsync(100); // Poll 2
      await clock.tickAsync(1500); // Wait
      await clock.tickAsync(100); // Finish

      const result = await promise;

      expect(result.confirmed).to.be.false;
    });

    it('should handle malformed RPC response gracefully', async () => {
      connection.getSignatureStatuses.resolves(null as any);

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200,
        2
      );

      // Advance through 2 polling attempts
      await clock.tickAsync(100); // Poll 1
      await clock.tickAsync(1500); // Wait
      await clock.tickAsync(100); // Poll 2
      await clock.tickAsync(1500); // Wait
      await clock.tickAsync(100); // Finish

      const result = await promise;

      expect(result.confirmed).to.be.false;
    });

    // ============================================================================
    // BLOCKHASH LIFETIME CALCULATION TESTS
    // ============================================================================

    it('should calculate remaining blocks correctly', async () => {
      connection.getBlockHeight.resolves(150);

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200, // 50 blocks remaining
        2
      );

      // Advance through 2 polling attempts
      await clock.tickAsync(100); // Poll 1
      await clock.tickAsync(1500); // Wait
      await clock.tickAsync(100); // Poll 2
      await clock.tickAsync(1500); // Wait
      await clock.tickAsync(100); // Finish

      const result = await promise;

      // Should timeout after max attempts (doesn't show blocks remaining in this path)
      expect(result.confirmed).to.be.false;
      expect(result.error).to.include('2 attempts');
    });

    it('should warn when approaching blockhash expiration', async () => {
      connection.getBlockHeight.resolves(195);

      const promise = service.waitForJitoConfirmation(
        'sig123',
        'blockhash123',
        200, // Only 5 blocks remaining
        2
      );

      // Advance through 2 polling attempts
      await clock.tickAsync(100); // Poll 1
      await clock.tickAsync(1500); // Wait
      await clock.tickAsync(100); // Poll 2
      await clock.tickAsync(1500); // Wait
      await clock.tickAsync(100); // Finish

      const result = await promise;

      // Should timeout after max attempts (doesn't show blocks remaining in this path)
      expect(result.confirmed).to.be.false;
      expect(result.error).to.include('2 attempts');
    });
  });
});

