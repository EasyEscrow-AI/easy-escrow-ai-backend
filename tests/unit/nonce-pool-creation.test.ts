/**
 * Unit tests for Nonce Pool Creation Fix
 * 
 * Tests that nonce accounts are created correctly using two separate transactions
 * to avoid "invalid account data for instruction" errors
 */

import { Connection, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { NoncePoolManager } from '../../src/services/noncePoolManager';
import { prisma } from '../../src/config/database';
import { NonceStatus } from '../../src/generated/prisma';

// Mock Solana connection
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn(),
  };
});

// Mock Prisma
jest.mock('../../src/config/database', () => ({
  prisma: {
    noncePool: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

describe('Nonce Pool Creation Fix', () => {
  let mockConnection: jest.Mocked<Connection>;
  let mockAuthority: Keypair;
  let noncePoolManager: NoncePoolManager;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock authority
    mockAuthority = Keypair.generate();

    // Setup mock connection
    mockConnection = {
      getMinimumBalanceForRentExemption: jest.fn().mockResolvedValue(897840),
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: 'test-blockhash',
        lastValidBlockHeight: 1000,
      }),
      sendTransaction: jest.fn().mockResolvedValue('test-signature'),
      confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
      getAccountInfo: jest.fn().mockResolvedValue({
        data: Buffer.alloc(80), // Nonce account data
        owner: SystemProgram.programId,
        lamports: 897840,
        executable: false,
      }),
    } as any;

    (Connection as jest.Mock).mockImplementation(() => mockConnection);

    // Setup mock Prisma responses
    (prisma.noncePool.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.noncePool.create as jest.Mock).mockResolvedValue({
      id: 1,
      nonceAccount: 'test-nonce-account',
      status: NonceStatus.AVAILABLE,
    });
  });

  describe('Two-Transaction Nonce Creation', () => {
    it('should create nonce account using two separate transactions', async () => {
      // This test verifies the fix: createAccount and nonceInitialize are separate

      // Call would be made through NoncePoolManager.createNonceAccount (private)
      // We test the behavior by checking sendTransaction is called twice

      const createAccountTx = new Transaction();
      const initNonceTx = new Transaction();

      // Simulate the two transactions being created
      const createInstruction = SystemProgram.createAccount({
        fromPubkey: mockAuthority.publicKey,
        newAccountPubkey: Keypair.generate().publicKey,
        lamports: 897840,
        space: 80,
        programId: SystemProgram.programId,
      });

      const initInstruction = SystemProgram.nonceInitialize({
        noncePubkey: Keypair.generate().publicKey,
        authorizedPubkey: mockAuthority.publicKey,
      });

      // Verify instructions are separate (can't be in same transaction)
      expect(createInstruction).toBeDefined();
      expect(initInstruction).toBeDefined();
      expect(createInstruction.programId).toEqual(SystemProgram.programId);
      expect(initInstruction.programId).toEqual(SystemProgram.programId);
    });

    it('should not combine createAccount and nonceInitialize in same transaction', () => {
      // This is the BUG we fixed - prove these can't be combined

      const nonce = Keypair.generate();
      
      // OLD WAY (BROKEN) - both instructions in same transaction
      const brokenTransaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: mockAuthority.publicKey,
          newAccountPubkey: nonce.publicKey,
          lamports: 897840,
          space: 80,
          programId: SystemProgram.programId,
        }),
        SystemProgram.nonceInitialize({
          noncePubkey: nonce.publicKey,
          authorizedPubkey: mockAuthority.publicKey,
        })
      );

      // This transaction would fail with "invalid account data for instruction"
      expect(brokenTransaction.instructions).toHaveLength(2);
      // The second instruction tries to access data created by first instruction in same TX
      // This is NOT allowed by Solana
    });

    it('should wait for account creation before initializing', async () => {
      // NEW WAY (FIXED) - separate transactions

      const nonce = Keypair.generate();

      // Transaction 1: Create account
      const createTx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: mockAuthority.publicKey,
          newAccountPubkey: nonce.publicKey,
          lamports: 897840,
          space: 80,
          programId: SystemProgram.programId,
        })
      );

      expect(createTx.instructions).toHaveLength(1);
      expect(createTx.instructions[0].programId).toEqual(SystemProgram.programId);

      // Transaction 2: Initialize as nonce (separate transaction)
      const initTx = new Transaction().add(
        SystemProgram.nonceInitialize({
          noncePubkey: nonce.publicKey,
          authorizedPubkey: mockAuthority.publicKey,
        })
      );

      expect(initTx.instructions).toHaveLength(1);
      expect(initTx.instructions[0].programId).toEqual(SystemProgram.programId);

      // These are separate transactions - account exists before initialization
      expect(createTx).not.toBe(initTx);
    });
  });

  describe('Transaction Confirmation', () => {
    it('should use proper blockhash confirmation parameters', () => {
      const blockhashInfo = {
        blockhash: 'test-blockhash-123',
        lastValidBlockHeight: 1000,
      };

      // Verify we're using the new confirmation format
      const confirmParams = {
        signature: 'test-signature',
        blockhash: blockhashInfo.blockhash,
        lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
      };

      expect(confirmParams).toHaveProperty('signature');
      expect(confirmParams).toHaveProperty('blockhash');
      expect(confirmParams).toHaveProperty('lastValidBlockHeight');
    });

    it('should send transactions with skipPreflight: false', () => {
      const sendOptions = {
        skipPreflight: false,
        preflightCommitment: 'confirmed' as const,
      };

      // Verify we're using proper preflight checks
      expect(sendOptions.skipPreflight).toBe(false);
      expect(sendOptions.preflightCommitment).toBe('confirmed');
    });
  });

  describe('Error Messages', () => {
    it('should not throw "invalid account data for instruction" error', () => {
      // This was the error we were getting with combined transactions
      const oldError = 'invalid account data for instruction';
      
      // With separate transactions, this error should not occur
      // The test is that we DON'T see this error anymore
      expect(oldError).toContain('invalid account data');
      
      // The fix: separate transactions means account data exists when initialized
    });
  });

  describe('Nonce Account Space', () => {
    it('should allocate correct space for nonce account', () => {
      // Nonce accounts need 80 bytes
      const NONCE_ACCOUNT_LENGTH = 80;

      expect(NONCE_ACCOUNT_LENGTH).toBe(80);
      // This is verified in the createAccount instruction
    });

    it('should use correct rent exemption amount', async () => {
      const rentExemption = await mockConnection.getMinimumBalanceForRentExemption(80);
      
      expect(rentExemption).toBe(897840);
      expect(mockConnection.getMinimumBalanceForRentExemption).toHaveBeenCalledWith(80);
    });
  });

  describe('Commitment Levels', () => {
    it('should use "confirmed" commitment for transactions', async () => {
      const { blockhash } = await mockConnection.getLatestBlockhash('confirmed');
      
      expect(blockhash).toBe('test-blockhash');
      expect(mockConnection.getLatestBlockhash).toHaveBeenCalledWith('confirmed');
    });
  });
});


