/**
 * Unit Tests for NoncePoolManager Service
 * Tests nonce pool management, assignment, and cleanup
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PrismaClient, NonceStatus } from '../../src/generated/prisma';
import { NoncePoolManager } from '../../src/services/noncePoolManager';
import { NoncePoolConfig } from '../../src/config/noncePool.config';

// Mock Prisma
jest.mock('../../src/generated/prisma', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      noncePool: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
    })),
    NonceStatus: {
      AVAILABLE: 'AVAILABLE',
      IN_USE: 'IN_USE',
      EXPIRED: 'EXPIRED',
    },
  };
});

// Mock Solana Connection
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getAccountInfo: jest.fn(),
      getMinimumBalanceForRentExemption: jest.fn(),
      sendTransaction: jest.fn(),
      confirmTransaction: jest.fn(),
      getLatestBlockhash: jest.fn(),
    })),
  };
});

describe('NoncePoolManager', () => {
  let noncePoolManager: NoncePoolManager;
  let mockConnection: jest.Mocked<Connection>;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockAuthority: Keypair;
  let testConfig: Partial<NoncePoolConfig>;
  
  beforeEach(() => {
    // Create mocks
    mockConnection = new Connection('http://localhost:8899') as jest.Mocked<Connection>;
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    mockAuthority = Keypair.generate();
    
    // Test configuration with smaller values for faster tests
    testConfig = {
      minPoolSize: 3,
      maxPoolSize: 10,
      replenishmentThreshold: 5,
      replenishmentBatchSize: 2,
      assignmentTimeoutMs: 5000,
      maxCreationRetries: 2,
      retryDelayMs: 100,
      nonceCacheTTL: 1000,
      cleanupIntervalMs: 60000,
      expirationThresholdMs: 3600000,
      maxConcurrentCreations: 2,
      enableSubsidy: true,
      environment: 'local',
    };
    
    noncePoolManager = new NoncePoolManager(
      mockConnection,
      mockPrisma,
      mockAuthority,
      testConfig
    );
  });
  
  afterEach(() => {
    jest.clearAllMocks();
    noncePoolManager.stopCleanupJob();
  });
  
  describe('Initialization', () => {
    it('should create instance with default configuration', () => {
      const manager = new NoncePoolManager(
        mockConnection,
        mockPrisma,
        mockAuthority
      );
      
      expect(manager).toBeInstanceOf(NoncePoolManager);
    });
    
    it('should create instance with custom configuration', () => {
      expect(noncePoolManager).toBeInstanceOf(NoncePoolManager);
    });
    
    it('should initialize pool when below minimum size', async () => {
      // Mock pool stats showing 0 available nonces
      (mockPrisma.noncePool.findMany as jest.Mock).mockResolvedValue([]);
      
      // Mock nonce account creation
      (mockConnection.getMinimumBalanceForRentExemption as jest.Mock).mockResolvedValue(1_500_000);
      (mockConnection.sendTransaction as jest.Mock).mockResolvedValue('mock-signature');
      (mockConnection.confirmTransaction as jest.Mock).mockResolvedValue({ value: { err: null } });
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({
        data: Buffer.alloc(80), // Simplified nonce account data
      });
      (mockPrisma.noncePool.create as jest.Mock).mockResolvedValue({
        nonceAccount: 'mock-nonce-account',
        status: NonceStatus.AVAILABLE,
      });
      
      await noncePoolManager.initialize();
      
      // Should have attempted to create nonces
      expect(mockPrisma.noncePool.create).toHaveBeenCalled();
    });
  });
  
  describe('Pool Statistics', () => {
    it('should return correct pool statistics', async () => {
      const mockNonces = [
        { status: NonceStatus.AVAILABLE },
        { status: NonceStatus.AVAILABLE },
        { status: NonceStatus.IN_USE },
        { status: NonceStatus.EXPIRED },
      ];
      
      (mockPrisma.noncePool.findMany as jest.Mock).mockResolvedValue(mockNonces);
      
      const stats = await noncePoolManager.getPoolStats();
      
      expect(stats).toEqual({
        total: 4,
        available: 2,
        inUse: 1,
        expired: 1,
      });
    });
    
    it('should handle empty pool', async () => {
      (mockPrisma.noncePool.findMany as jest.Mock).mockResolvedValue([]);
      
      const stats = await noncePoolManager.getPoolStats();
      
      expect(stats).toEqual({
        total: 0,
        available: 0,
        inUse: 0,
        expired: 0,
      });
    });
  });
  
  describe('User Assignment', () => {
    it('should assign nonce to new user', async () => {
      const walletAddress = 'test-wallet-address';
      const mockNonce = {
        nonceAccount: 'mock-nonce-account',
        status: NonceStatus.AVAILABLE,
      };
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.noncePool.findFirst as jest.Mock).mockResolvedValue(mockNonce);
      (mockPrisma.noncePool.update as jest.Mock).mockResolvedValue({
        ...mockNonce,
        status: NonceStatus.IN_USE,
      });
      (mockPrisma.user.upsert as jest.Mock).mockResolvedValue({
        walletAddress,
        nonceAccount: mockNonce.nonceAccount,
        isSubsidized: true,
      });
      (mockPrisma.noncePool.findMany as jest.Mock).mockResolvedValue([
        mockNonce,
        mockNonce,
        mockNonce,
        mockNonce,
        mockNonce,
        mockNonce,
      ]); // Above threshold
      
      const result = await noncePoolManager.assignNonceToUser(walletAddress);
      
      expect(result).toBe('mock-nonce-account');
      expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isSubsidized: true,
          }),
        })
      );
    });
    
    it('should return existing nonce for existing user', async () => {
      const walletAddress = 'test-wallet-address';
      const existingNonce = 'existing-nonce-account';
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        walletAddress,
        nonceAccount: existingNonce,
      });
      
      const result = await noncePoolManager.assignNonceToUser(walletAddress);
      
      expect(result).toBe(existingNonce);
      expect(mockPrisma.noncePool.findFirst).not.toHaveBeenCalled();
    });
    
    it('should mark first assignment as subsidized', async () => {
      const walletAddress = 'new-user-wallet';
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.noncePool.findFirst as jest.Mock).mockResolvedValue({
        nonceAccount: 'mock-nonce',
        status: NonceStatus.AVAILABLE,
      });
      (mockPrisma.noncePool.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.user.upsert as jest.Mock).mockResolvedValue({});
      (mockPrisma.noncePool.findMany as jest.Mock).mockResolvedValue(
        Array(6).fill({ status: NonceStatus.AVAILABLE })
      );
      
      await noncePoolManager.assignNonceToUser(walletAddress);
      
      expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isSubsidized: true,
          }),
        })
      );
    });
    
    it('should not mark existing user assignment as subsidized', async () => {
      const walletAddress = 'existing-user-wallet';
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        walletAddress,
        nonceAccount: null,
      });
      (mockPrisma.noncePool.findFirst as jest.Mock).mockResolvedValue({
        nonceAccount: 'mock-nonce',
        status: NonceStatus.AVAILABLE,
      });
      (mockPrisma.noncePool.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.user.upsert as jest.Mock).mockResolvedValue({});
      (mockPrisma.noncePool.findMany as jest.Mock).mockResolvedValue(
        Array(6).fill({ status: NonceStatus.AVAILABLE })
      );
      
      await noncePoolManager.assignNonceToUser(walletAddress);
      
      expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isSubsidized: false,
          }),
        })
      );
    });
  });
  
  describe('Nonce Retrieval', () => {
    it('should get current nonce value from account', async () => {
      const nonceAccount = 'test-nonce-account';
      const mockNonceData = Buffer.alloc(80);
      mockNonceData.write('mock-nonce-value', 36); // Start at offset 36
      
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({
        data: mockNonceData,
      });
      
      const result = await noncePoolManager.getCurrentNonce(nonceAccount);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
    
    it('should throw error if nonce account not found', async () => {
      const nonceAccount = 'non-existent-nonce';
      
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);
      
      await expect(noncePoolManager.getCurrentNonce(nonceAccount)).rejects.toThrow(
        'Nonce account non-existent-nonce not found'
      );
    });
    
    it('should cache nonce values', async () => {
      const nonceAccount = 'test-nonce-account';
      const mockNonceData = Buffer.alloc(80);
      
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({
        data: mockNonceData,
      });
      
      // First call
      await noncePoolManager.getCurrentNonce(nonceAccount);
      
      // Second call (should use cache)
      await noncePoolManager.getCurrentNonce(nonceAccount);
      
      // Should only call RPC once due to caching
      expect(mockConnection.getAccountInfo).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Nonce Advancement', () => {
    it('should advance nonce successfully', async () => {
      const nonceAccount = 'test-nonce-account';
      
      (mockConnection.getLatestBlockhash as jest.Mock).mockResolvedValue({
        blockhash: 'mock-blockhash',
      });
      (mockConnection.sendTransaction as jest.Mock).mockResolvedValue('mock-signature');
      (mockConnection.confirmTransaction as jest.Mock).mockResolvedValue({
        value: { err: null },
      });
      (mockPrisma.noncePool.update as jest.Mock).mockResolvedValue({});
      
      await noncePoolManager.advanceNonce(nonceAccount);
      
      expect(mockConnection.sendTransaction).toHaveBeenCalled();
      expect(mockPrisma.noncePool.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { nonceAccount },
          data: expect.objectContaining({
            lastUsedAt: expect.any(Date),
          }),
        })
      );
    });
    
    it('should retry nonce advancement on failure', async () => {
      const nonceAccount = 'test-nonce-account';
      
      (mockConnection.getLatestBlockhash as jest.Mock).mockResolvedValue({
        blockhash: 'mock-blockhash',
      });
      
      // First two attempts fail, third succeeds
      (mockConnection.sendTransaction as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('mock-signature');
      
      (mockConnection.confirmTransaction as jest.Mock).mockResolvedValue({
        value: { err: null },
      });
      (mockPrisma.noncePool.update as jest.Mock).mockResolvedValue({});
      
      await noncePoolManager.advanceNonce(nonceAccount);
      
      expect(mockConnection.sendTransaction).toHaveBeenCalledTimes(3);
    });
    
    it('should throw error after max retries', async () => {
      const nonceAccount = 'test-nonce-account';
      
      (mockConnection.getLatestBlockhash as jest.Mock).mockResolvedValue({
        blockhash: 'mock-blockhash',
      });
      (mockConnection.sendTransaction as jest.Mock).mockRejectedValue(
        new Error('Persistent network error')
      );
      
      await expect(noncePoolManager.advanceNonce(nonceAccount)).rejects.toThrow();
      
      // Should attempt maxRetries + 1 times
      expect(mockConnection.sendTransaction).toHaveBeenCalledTimes(3); // 2 retries + 1 initial
    });
  });
  
  describe('Cleanup Operations', () => {
    it('should identify expired nonces', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const expiredNonces = [
        { nonceAccount: 'expired-1', lastUsedAt: oldDate },
        { nonceAccount: 'expired-2', lastUsedAt: oldDate },
      ];
      
      (mockPrisma.noncePool.findMany as jest.Mock).mockResolvedValue(expiredNonces);
      (mockPrisma.noncePool.update as jest.Mock).mockResolvedValue({});
      
      // Trigger cleanup manually
      await (noncePoolManager as any).cleanupExpiredNonces();
      
      expect(mockPrisma.noncePool.update).toHaveBeenCalledTimes(2);
    });
    
    it('should start cleanup job on initialization', () => {
      // Cleanup job should be started
      expect((noncePoolManager as any).cleanupInterval).toBeDefined();
    });
    
    it('should stop cleanup job on shutdown', async () => {
      await noncePoolManager.shutdown();
      
      expect((noncePoolManager as any).cleanupInterval).toBeUndefined();
    });
  });
  
  describe('Concurrency and Thread Safety', () => {
    it('should handle concurrent assignment requests', async () => {
      const wallets = ['wallet-1', 'wallet-2', 'wallet-3'];
      const mockNonces = [
        { nonceAccount: 'nonce-1', status: NonceStatus.AVAILABLE },
        { nonceAccount: 'nonce-2', status: NonceStatus.AVAILABLE },
        { nonceAccount: 'nonce-3', status: NonceStatus.AVAILABLE },
      ];
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.noncePool.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockNonces[0])
        .mockResolvedValueOnce(mockNonces[1])
        .mockResolvedValueOnce(mockNonces[2]);
      (mockPrisma.noncePool.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.user.upsert as jest.Mock).mockResolvedValue({});
      (mockPrisma.noncePool.findMany as jest.Mock).mockResolvedValue(
        Array(6).fill({ status: NonceStatus.AVAILABLE })
      );
      
      const results = await Promise.all(
        wallets.map((wallet) => noncePoolManager.assignNonceToUser(wallet))
      );
      
      expect(results).toHaveLength(3);
      expect(new Set(results).size).toBe(3); // All unique nonces
    });
  });
  
  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection lost')
      );
      
      await expect(
        noncePoolManager.assignNonceToUser('test-wallet')
      ).rejects.toThrow('Database connection lost');
    });
    
    it('should handle RPC errors gracefully', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockRejectedValue(
        new Error('RPC node unreachable')
      );
      
      await expect(
        noncePoolManager.getCurrentNonce('test-nonce')
      ).rejects.toThrow();
    });
  });
  
  describe('Shutdown', () => {
    it('should clean up resources on shutdown', async () => {
      await noncePoolManager.shutdown();
      
      expect((noncePoolManager as any).cleanupInterval).toBeUndefined();
      expect((noncePoolManager as any).assignmentQueue).toHaveLength(0);
    });
  });
});

