/**
 * Nonce Pool Manager Service
 * 
 * Manages a pool of Solana durable nonce accounts for atomic swap transactions.
 * Provides thread-safe operations for initialization, assignment, retrieval,
 * advancement, and cleanup of nonce accounts.
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  NonceAccount,
  NONCE_ACCOUNT_LENGTH,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { Mutex } from 'async-mutex';
import { PrismaClient, NonceStatus } from '../generated/prisma';
import { getNoncePoolConfig, NoncePoolConfig, getEnvironmentConfig } from '../config/noncePool.config';

export interface NonceAccountInfo {
  nonceAccount: string;
  authority: PublicKey;
  nonce: string;
  keypair?: Keypair;
}

export interface PoolStats {
  total: number;
  available: number;
  inUse: number;
  expired: number;
}

export class NoncePoolManager {
  private connection: Connection;
  private prisma: PrismaClient;
  private config: NoncePoolConfig;
  private authority: Keypair;
  
  // Mutex for thread-safe pool operations
  private poolMutex: Mutex;
  private assignmentQueue: Array<{
    resolve: (nonceAccount: string) => void;
    reject: (error: Error) => void;
    timeoutId: NodeJS.Timeout;
  }> = [];
  
  // In-memory cache for nonce values
  private nonceCache: Map<string, { nonce: string; timestamp: number }> = new Map();
  
  // Cleanup interval handle
  private cleanupInterval?: NodeJS.Timeout;
  
  // Replenishment lock to prevent concurrent replenishments
  private isReplenishing = false;
  
  constructor(
    connection: Connection,
    prisma: PrismaClient,
    authority: Keypair,
    config?: Partial<NoncePoolConfig>
  ) {
    this.connection = connection;
    this.prisma = prisma;
    this.authority = authority;
    // Use environment-specific config by default, then apply any overrides
    const baseConfig = getEnvironmentConfig(process.env.NODE_ENV);
    this.config = config ? { ...baseConfig, ...config } : baseConfig;
    this.poolMutex = new Mutex();
    
    console.log('[NoncePoolManager] Initialized with config:', {
      minPoolSize: this.config.minPoolSize,
      maxPoolSize: this.config.maxPoolSize,
      maxConcurrentCreations: this.config.maxConcurrentCreations,
      environment: this.config.environment,
    });
  }
  
  /**
   * Initialize the nonce pool by ensuring minimum pool size is met
   */
  async initialize(): Promise<void> {
    console.log('[NoncePoolManager] Initializing nonce pool...');
    
    try {
      const stats = await this.getPoolStats();
      console.log('[NoncePoolManager] Current pool stats:', stats);
      
      if (stats.available < this.config.minPoolSize) {
        const toCreate = this.config.minPoolSize - stats.available;
        console.log(`[NoncePoolManager] Creating ${toCreate} nonce accounts to reach minimum pool size`);
        
        await this.replenishPool(toCreate);
      }
      
      // Start cleanup job
      this.startCleanupJob();
      
      console.log('[NoncePoolManager] Initialization complete');
    } catch (error) {
      console.error('[NoncePoolManager] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Get current pool statistics
   */
  async getPoolStats(): Promise<PoolStats> {
    const nonces = await this.prisma.noncePool.findMany({
      select: { status: true },
    });
    
    return {
      total: nonces.length,
      available: nonces.filter((n) => n.status === NonceStatus.AVAILABLE).length,
      inUse: nonces.filter((n) => n.status === NonceStatus.IN_USE).length,
      expired: nonces.filter((n) => n.status === NonceStatus.EXPIRED).length,
    };
  }
  
  /**
   * Create a new nonce account with retry logic
   */
  private async createNonceAccount(retryCount = 0): Promise<NonceAccountInfo> {
    try {
      // Generate keypair for the nonce account
      const nonceKeypair = Keypair.generate();
      const nonceAccount = nonceKeypair.publicKey;
      
      console.log(`[NoncePoolManager] Creating nonce account: ${nonceAccount.toBase58()}`);
      
      // Get minimum rent-exempt balance for nonce account
      const rentExemption = await this.connection.getMinimumBalanceForRentExemption(
        NONCE_ACCOUNT_LENGTH
      );
      
      console.log(`[NoncePoolManager] Rent exemption: ${rentExemption} lamports`);
      
      // Step 1: Create the account (separate transaction)
      const createTx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: this.authority.publicKey,
          newAccountPubkey: nonceAccount,
          lamports: rentExemption,
          space: NONCE_ACCOUNT_LENGTH,
          programId: SystemProgram.programId,
        })
      );
      
      // Get latest blockhash and set transaction metadata
      let blockhashInfo = await this.connection.getLatestBlockhash('confirmed');
      createTx.recentBlockhash = blockhashInfo.blockhash;
      createTx.feePayer = this.authority.publicKey;
      
      // Send and confirm account creation
      const createSig = await this.connection.sendTransaction(createTx, [
        this.authority,
        nonceKeypair,
      ], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      console.log(`[NoncePoolManager] Account creation tx: ${createSig}`);
      
      await this.connection.confirmTransaction({
        signature: createSig,
        blockhash: blockhashInfo.blockhash,
        lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
      }, 'confirmed');
      
      // Step 2: Initialize as nonce account (separate transaction)
      const initTx = new Transaction().add(
        SystemProgram.nonceInitialize({
          noncePubkey: nonceAccount,
          authorizedPubkey: this.authority.publicKey,
        })
      );
      
      // Get fresh blockhash for initialization
      blockhashInfo = await this.connection.getLatestBlockhash('confirmed');
      initTx.recentBlockhash = blockhashInfo.blockhash;
      initTx.feePayer = this.authority.publicKey;
      
      // Send and confirm nonce initialization
      const initSig = await this.connection.sendTransaction(initTx, [
        this.authority,
      ], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      
      console.log(`[NoncePoolManager] Nonce initialization tx: ${initSig}`);
      
      await this.connection.confirmTransaction({
        signature: initSig,
        blockhash: blockhashInfo.blockhash,
        lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
      }, 'confirmed');
      
      // Get initial nonce value
      const nonceAccountInfo = await this.connection.getAccountInfo(nonceAccount);
      if (!nonceAccountInfo) {
        throw new Error('Failed to retrieve nonce account after creation');
      }
      
      const nonceData = NonceAccount.fromAccountData(nonceAccountInfo.data);
      
      console.log(`[NoncePoolManager] Nonce account created successfully: ${nonceAccount.toBase58()}`);
      
      return {
        nonceAccount: nonceAccount.toBase58(),
        authority: this.authority.publicKey,
        nonce: nonceData.nonce,
        keypair: nonceKeypair,
      };
    } catch (error) {
      console.error(
        `[NoncePoolManager] Failed to create nonce account (attempt ${retryCount + 1}):`,
        error
      );
      
      if (retryCount < this.config.maxCreationRetries) {
        console.log(
          `[NoncePoolManager] Retrying nonce account creation in ${this.config.retryDelayMs}ms...`
        );
        await this.sleep(this.config.retryDelayMs);
        return this.createNonceAccount(retryCount + 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Replenish the pool with new nonce accounts
   */
  private async replenishPool(count?: number): Promise<void> {
    // Prevent concurrent replenishments
    if (this.isReplenishing) {
      console.log('[NoncePoolManager] Replenishment already in progress, skipping');
      return;
    }
    
    this.isReplenishing = true;
    
    try {
      const toCreate = count || this.config.replenishmentBatchSize;
      console.log(`[NoncePoolManager] Replenishing pool with ${toCreate} nonce accounts`);
      
      // Check if we would exceed max pool size
      const stats = await this.getPoolStats();
      const actualToCreate = Math.min(toCreate, this.config.maxPoolSize - stats.total);
      
      if (actualToCreate <= 0) {
        console.log('[NoncePoolManager] Pool at maximum capacity, skipping replenishment');
        return;
      }
      
      // Create nonce accounts in batches to respect concurrency limits
      const batches = Math.ceil(actualToCreate / this.config.maxConcurrentCreations);
      let created = 0;
      
      for (let i = 0; i < batches; i++) {
        const batchSize = Math.min(
          this.config.maxConcurrentCreations,
          actualToCreate - created
        );
        
        console.log(
          `[NoncePoolManager] Creating batch ${i + 1}/${batches} (${batchSize} accounts)`
        );
        
        const promises = Array.from({ length: batchSize }, () => this.createNonceAccount());
        
        const results = await Promise.allSettled(promises);
        
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const nonceInfo = result.value;
            
            // Store in database
            await this.prisma.noncePool.create({
              data: {
                nonceAccount: nonceInfo.nonceAccount,
                status: NonceStatus.AVAILABLE,
              },
            });
            
            created++;
            console.log(`[NoncePoolManager] Added nonce account to pool: ${nonceInfo.nonceAccount}`);
          } else {
            console.error('[NoncePoolManager] Failed to create nonce account:', result.reason);
          }
        }
      }
      
      console.log(`[NoncePoolManager] Successfully created ${created}/${actualToCreate} nonce accounts`);
      
      // Process any queued assignment requests
      this.processAssignmentQueue();
    } finally {
      this.isReplenishing = false;
    }
  }
  
  /**
   * Assign a nonce account to a user with thread-safe operations
   */
  async assignNonceToUser(walletAddress: string): Promise<string> {
    return this.poolMutex.runExclusive(async () => {
      try {
        console.log(`[NoncePoolManager] Assigning nonce account to user: ${walletAddress}`);
        
        // Check if user already has a nonce account
        const existingUser = await this.prisma.user.findUnique({
          where: { walletAddress },
        });
        
        if (existingUser?.nonceAccount) {
          console.log(`[NoncePoolManager] User already has nonce account: ${existingUser.nonceAccount}`);
          return existingUser.nonceAccount;
        }
        
        // Try to get an available nonce account
        const availableNonce = await this.prisma.noncePool.findFirst({
          where: { status: NonceStatus.AVAILABLE },
          orderBy: { createdAt: 'asc' }, // FIFO
        });
        
        if (!availableNonce) {
          console.log('[NoncePoolManager] No available nonce accounts, triggering replenishment');
          
          // Trigger replenishment (non-blocking)
          this.replenishPool().catch((err) => {
            console.error('[NoncePoolManager] Background replenishment failed:', err);
          });
          
          // Wait for a nonce account with timeout
          return this.waitForNonceAccount(walletAddress);
        }
        
        // Update nonce account status to IN_USE
        await this.prisma.noncePool.update({
          where: { nonceAccount: availableNonce.nonceAccount },
          data: {
            status: NonceStatus.IN_USE,
            lastUsedAt: new Date(),
          },
        });
        
        // Create or update user record
        const isNewUser = !existingUser;
        await this.prisma.user.upsert({
          where: { walletAddress },
          create: {
            walletAddress,
            nonceAccount: availableNonce.nonceAccount,
            isSubsidized: isNewUser && this.config.enableSubsidy,
            swapStats: {} as any,
          },
          update: {
            nonceAccount: availableNonce.nonceAccount,
          },
        });
        
        console.log(
          `[NoncePoolManager] Assigned nonce account ${availableNonce.nonceAccount} to user ${walletAddress} (subsidized: ${isNewUser && this.config.enableSubsidy})`
        );
        
        // Check if pool needs replenishment
        const stats = await this.getPoolStats();
        if (stats.available < this.config.replenishmentThreshold) {
          console.log(
            `[NoncePoolManager] Pool below threshold (${stats.available}/${this.config.replenishmentThreshold}), triggering replenishment`
          );
          this.replenishPool().catch((err) => {
            console.error('[NoncePoolManager] Background replenishment failed:', err);
          });
        }
        
        return availableNonce.nonceAccount;
      } catch (error) {
        console.error('[NoncePoolManager] Failed to assign nonce account:', error);
        throw error;
      }
    });
  }

  /**
   * Assign a unique nonce account to an offer (does NOT reuse user's existing nonce)
   * This ensures each offer has its own nonce for independent cancellation
   */
  async assignNonceToOffer(): Promise<string> {
    return this.poolMutex.runExclusive(async () => {
      try {
        console.log('[NoncePoolManager] Assigning fresh nonce account for new offer');

        // Always get a new available nonce account (never reuse)
        const availableNonce = await this.prisma.noncePool.findFirst({
          where: { status: NonceStatus.AVAILABLE },
          orderBy: { createdAt: 'asc' },
        });

        if (!availableNonce) {
          console.log('[NoncePoolManager] No available nonce accounts, triggering replenishment');

          // Trigger replenishment (non-blocking)
          this.replenishPool().catch((err) => {
            console.error('[NoncePoolManager] Background replenishment failed:', err);
          });

          // Wait for a nonce account with timeout
          return this.waitForNonceAccountForOffer();
        }

        // Update nonce account status to IN_USE
        await this.prisma.noncePool.update({
          where: { nonceAccount: availableNonce.nonceAccount },
          data: {
            status: NonceStatus.IN_USE,
            lastUsedAt: new Date(),
          },
        });

        console.log(
          `[NoncePoolManager] Assigned fresh nonce account ${availableNonce.nonceAccount} for offer`
        );

        // Check if pool needs replenishment
        const stats = await this.getPoolStats();
        if (stats.available < this.config.replenishmentThreshold) {
          console.log(
            `[NoncePoolManager] Pool below threshold (${stats.available}/${this.config.replenishmentThreshold}), triggering replenishment`
          );
          this.replenishPool().catch((err) => {
            console.error('[NoncePoolManager] Background replenishment failed:', err);
          });
        }

        return availableNonce.nonceAccount;
      } catch (error) {
        console.error('[NoncePoolManager] Failed to assign nonce account for offer:', error);
        throw error;
      }
    });
  }

  /**
   * Wait for a nonce account to become available for an offer (with timeout)
   */
  private waitForNonceAccountForOffer(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.assignmentQueue = this.assignmentQueue.filter((item) => item.timeoutId !== timeoutId);
        reject(new Error('Timeout waiting for available nonce account for offer'));
      }, this.config.assignmentTimeoutMs);

      this.assignmentQueue.push({
        resolve: (nonceAccount: string) => {
          clearTimeout(timeoutId);
          resolve(nonceAccount);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timeoutId,
      });

      console.log(
        `[NoncePoolManager] Added offer to assignment queue (queue size: ${this.assignmentQueue.length})`
      );
    });
  }

  /**
   * Release a nonce account back to the pool after offer cancellation/completion
   * Advances the nonce first to invalidate any pending transactions
   */
  async releaseNonce(nonceAccount: string): Promise<void> {
    console.log(`[NoncePoolManager] Releasing nonce ${nonceAccount} back to pool`);

    try {
      // Advance nonce first to invalidate any pending transactions using old nonce value
      await this.advanceNonce(nonceAccount);

      // Return to available pool
      await this.prisma.noncePool.update({
        where: { nonceAccount },
        data: {
          status: NonceStatus.AVAILABLE,
          lastUsedAt: new Date(),
        },
      });

      // Clear from cache
      this.nonceCache.delete(nonceAccount);

      console.log(`[NoncePoolManager] Successfully released nonce ${nonceAccount} to pool`);
    } catch (error) {
      console.error(`[NoncePoolManager] Failed to release nonce ${nonceAccount}:`, error);
      // Don't throw - we don't want to fail the cancel/complete operation
      // The nonce will be reclaimed by the cleanup process eventually
    }
  }

  /**
   * Wait for a nonce account to become available (with timeout)
   */
  private waitForNonceAccount(walletAddress: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue
        this.assignmentQueue = this.assignmentQueue.filter((item) => item.timeoutId !== timeoutId);
        reject(new Error('Timeout waiting for available nonce account'));
      }, this.config.assignmentTimeoutMs);
      
      this.assignmentQueue.push({
        resolve: (nonceAccount: string) => {
          clearTimeout(timeoutId);
          resolve(nonceAccount);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timeoutId,
      });
      
      console.log(`[NoncePoolManager] Added user ${walletAddress} to assignment queue (queue size: ${this.assignmentQueue.length})`);
    });
  }
  
  /**
   * Process queued assignment requests
   */
  private async processAssignmentQueue(): Promise<void> {
    if (this.assignmentQueue.length === 0) {
      return;
    }
    
    console.log(`[NoncePoolManager] Processing assignment queue (${this.assignmentQueue.length} waiting)`);
    
    const stats = await this.getPoolStats();
    const toProcess = Math.min(this.assignmentQueue.length, stats.available);
    
    for (let i = 0; i < toProcess; i++) {
      const request = this.assignmentQueue.shift();
      if (!request) break;
      
      try {
        const availableNonce = await this.prisma.noncePool.findFirst({
          where: { status: NonceStatus.AVAILABLE },
          orderBy: { createdAt: 'asc' },
        });
        
        if (availableNonce) {
          await this.prisma.noncePool.update({
            where: { nonceAccount: availableNonce.nonceAccount },
            data: {
              status: NonceStatus.IN_USE,
              lastUsedAt: new Date(),
            },
          });
          
          request.resolve(availableNonce.nonceAccount);
        } else {
          request.reject(new Error('No available nonce accounts'));
        }
      } catch (error) {
        request.reject(error as Error);
      }
    }
  }
  
  /**
   * Get current nonce value for an account (with caching)
   */
  async getCurrentNonce(nonceAccount: string): Promise<string> {
    // Check cache first
    const cached = this.nonceCache.get(nonceAccount);
    if (cached && Date.now() - cached.timestamp < this.config.nonceCacheTTL) {
      console.log(`[NoncePoolManager] Using cached nonce for ${nonceAccount}`);
      return cached.nonce;
    }
    
    try {
      const noncePubkey = new PublicKey(nonceAccount);
      const accountInfo = await this.connection.getAccountInfo(noncePubkey);
      
      if (!accountInfo) {
        throw new Error(`Nonce account ${nonceAccount} not found`);
      }
      
      const nonceData = NonceAccount.fromAccountData(accountInfo.data);
      
      // Update cache
      this.nonceCache.set(nonceAccount, {
        nonce: nonceData.nonce,
        timestamp: Date.now(),
      });
      
      console.log(`[NoncePoolManager] Retrieved current nonce for ${nonceAccount}: ${nonceData.nonce}`);
      
      return nonceData.nonce;
    } catch (error) {
      console.error(`[NoncePoolManager] Failed to get nonce for ${nonceAccount}:`, error);
      throw error;
    }
  }
  
  /**
   * Advance a nonce account to invalidate pending transactions
   */
  async advanceNonce(nonceAccount: string, retryCount = 0): Promise<void> {
    try {
      console.log(`[NoncePoolManager] Advancing nonce for account: ${nonceAccount}`);
      
      const noncePubkey = new PublicKey(nonceAccount);
      
      const transaction = new Transaction().add(
        SystemProgram.nonceAdvance({
          noncePubkey,
          authorizedPubkey: this.authority.publicKey,
        })
      );
      
      // Use recent blockhash for nonce advance
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.authority.publicKey;
      
      const signature = await this.connection.sendTransaction(transaction, [this.authority]);
      
      console.log(`[NoncePoolManager] Nonce advance tx: ${signature}`);
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      // Clear cache for this nonce
      this.nonceCache.delete(nonceAccount);
      
      // Update last used timestamp
      await this.prisma.noncePool.update({
        where: { nonceAccount },
        data: { lastUsedAt: new Date() },
      });
      
      console.log(`[NoncePoolManager] Successfully advanced nonce for ${nonceAccount}`);
    } catch (error) {
      console.error(
        `[NoncePoolManager] Failed to advance nonce (attempt ${retryCount + 1}):`,
        error
      );
      
      if (retryCount < this.config.maxCreationRetries) {
        console.log(`[NoncePoolManager] Retrying nonce advance in ${this.config.retryDelayMs}ms...`);
        await this.sleep(this.config.retryDelayMs);
        return this.advanceNonce(nonceAccount, retryCount + 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Start periodic cleanup job
   */
  private startCleanupJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    console.log(`[NoncePoolManager] Starting cleanup job (interval: ${this.config.cleanupIntervalMs}ms)`);
    
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredNonces();
      } catch (error) {
        console.error('[NoncePoolManager] Cleanup job failed:', error);
      }
    }, this.config.cleanupIntervalMs);
  }
  
  /**
   * Clean up expired nonce accounts and reclaim them for reuse
   */
  private async cleanupExpiredNonces(): Promise<void> {
    console.log('[NoncePoolManager] Running cleanup job...');
    
    try {
      const expirationDate = new Date(Date.now() - this.config.expirationThresholdMs);
      
      // Step 1: Find and mark IN_USE nonces as EXPIRED
      const expiredNonces = await this.prisma.noncePool.findMany({
        where: {
          lastUsedAt: { lt: expirationDate },
          status: NonceStatus.IN_USE,
        },
      });
      
      console.log(`[NoncePoolManager] Found ${expiredNonces.length} expired nonce accounts to mark`);
      
      for (const nonce of expiredNonces) {
        await this.prisma.noncePool.update({
          where: { nonceAccount: nonce.nonceAccount },
          data: { status: NonceStatus.EXPIRED },
        });
        console.log(`[NoncePoolManager] Marked nonce account as expired: ${nonce.nonceAccount}`);
      }
      
      // Step 2: Reclaim EXPIRED nonces back to AVAILABLE
      const reclaimResult = await this.reclaimExpiredNonces();
      console.log(`[NoncePoolManager] Reclaimed ${reclaimResult.reclaimed} nonce accounts`);
      
    } catch (error) {
      console.error('[NoncePoolManager] Cleanup failed:', error);
      throw error;
    }
  }
  
  /**
   * Reclaim expired nonce accounts back to the available pool
   * 
   * Process:
   * 1. Find EXPIRED nonces
   * 2. Verify account still exists on-chain
   * 3. Clear User.nonceAccount references
   * 4. Advance the nonce to invalidate any pending transactions
   * 5. Return to AVAILABLE status
   * 
   * @param batchSize - Maximum number of nonces to reclaim in one run (default: 10)
   * @returns Object with reclaimed count and any errors
   */
  async reclaimExpiredNonces(batchSize: number = 10): Promise<{ reclaimed: number; failed: number; errors: string[] }> {
    console.log(`[NoncePoolManager] Starting nonce reclamation (batch size: ${batchSize})...`);
    
    const errors: string[] = [];
    let reclaimed = 0;
    let failed = 0;
    
    try {
      // Find EXPIRED nonces to reclaim
      const expiredNonces = await this.prisma.noncePool.findMany({
        where: { status: NonceStatus.EXPIRED },
        take: batchSize,
        orderBy: { lastUsedAt: 'asc' }, // Oldest first
      });
      
      if (expiredNonces.length === 0) {
        console.log('[NoncePoolManager] No expired nonces to reclaim');
        return { reclaimed: 0, failed: 0, errors: [] };
      }
      
      console.log(`[NoncePoolManager] Found ${expiredNonces.length} expired nonces to reclaim`);
      
      for (const nonce of expiredNonces) {
        try {
          console.log(`[NoncePoolManager] Reclaiming nonce: ${nonce.nonceAccount}`);
          
          // Step 1: Verify nonce account still exists on-chain
          const noncePubkey = new PublicKey(nonce.nonceAccount);
          const accountInfo = await this.connection.getAccountInfo(noncePubkey);
          
          if (!accountInfo) {
            console.warn(`[NoncePoolManager] Nonce account ${nonce.nonceAccount} no longer exists on-chain, removing from pool`);
            await this.prisma.noncePool.delete({
              where: { nonceAccount: nonce.nonceAccount },
            });
            // Also clear any user references
            await this.prisma.user.updateMany({
              where: { nonceAccount: nonce.nonceAccount },
              data: { nonceAccount: null },
            });
            failed++;
            errors.push(`Nonce ${nonce.nonceAccount} not found on-chain, removed from pool`);
            continue;
          }
          
          // Step 2: Clear User.nonceAccount references for any users using this nonce
          const usersUpdated = await this.prisma.user.updateMany({
            where: { nonceAccount: nonce.nonceAccount },
            data: { nonceAccount: null },
          });
          
          if (usersUpdated.count > 0) {
            console.log(`[NoncePoolManager] Cleared nonce reference from ${usersUpdated.count} user(s)`);
          }
          
          // Step 3: Advance the nonce to invalidate any old pending transactions
          try {
            await this.advanceNonce(nonce.nonceAccount);
            console.log(`[NoncePoolManager] Advanced nonce ${nonce.nonceAccount}`);
          } catch (advanceError) {
            // If advance fails, the nonce might be in a bad state
            // Log but continue - we'll try again next cleanup cycle
            console.warn(`[NoncePoolManager] Failed to advance nonce ${nonce.nonceAccount}:`, advanceError);
            errors.push(`Failed to advance nonce ${nonce.nonceAccount}: ${advanceError instanceof Error ? advanceError.message : 'Unknown error'}`);
            failed++;
            continue;
          }
          
          // Step 4: Return to AVAILABLE status
          await this.prisma.noncePool.update({
            where: { nonceAccount: nonce.nonceAccount },
            data: {
              status: NonceStatus.AVAILABLE,
              lastUsedAt: new Date(), // Reset last used time
            },
          });
          
          // Clear from cache
          this.nonceCache.delete(nonce.nonceAccount);
          
          console.log(`[NoncePoolManager] Successfully reclaimed nonce: ${nonce.nonceAccount}`);
          reclaimed++;
          
        } catch (nonceError) {
          console.error(`[NoncePoolManager] Error reclaiming nonce ${nonce.nonceAccount}:`, nonceError);
          errors.push(`Error reclaiming ${nonce.nonceAccount}: ${nonceError instanceof Error ? nonceError.message : 'Unknown error'}`);
          failed++;
        }
      }
      
      console.log(`[NoncePoolManager] Reclamation complete: ${reclaimed} reclaimed, ${failed} failed`);
      return { reclaimed, failed, errors };
      
    } catch (error) {
      console.error('[NoncePoolManager] Reclamation failed:', error);
      throw error;
    }
  }
  
  /**
   * Close a nonce account and reclaim the rent SOL
   * 
   * Use this for truly abandoned nonces that should be permanently removed.
   * The ~0.00144 SOL rent will be returned to the authority wallet.
   * 
   * @param nonceAccount - The nonce account address to close
   * @returns Transaction signature
   */
  async closeNonceAccount(nonceAccount: string): Promise<string> {
    console.log(`[NoncePoolManager] Closing nonce account: ${nonceAccount}`);
    
    try {
      const noncePubkey = new PublicKey(nonceAccount);
      
      // Verify account exists
      const accountInfo = await this.connection.getAccountInfo(noncePubkey);
      if (!accountInfo) {
        throw new Error(`Nonce account ${nonceAccount} does not exist on-chain`);
      }
      
      // Create withdraw (close) instruction
      // This withdraws all lamports, effectively closing the account
      const transaction = new Transaction().add(
        SystemProgram.nonceWithdraw({
          noncePubkey,
          authorizedPubkey: this.authority.publicKey,
          toPubkey: this.authority.publicKey, // Send rent back to authority
          lamports: accountInfo.lamports, // Withdraw everything
        })
      );
      
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.authority.publicKey;
      
      const signature = await this.connection.sendTransaction(transaction, [this.authority]);
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      console.log(`[NoncePoolManager] Nonce account closed, rent reclaimed. Signature: ${signature}`);
      
      // Remove from database
      await this.prisma.noncePool.delete({
        where: { nonceAccount },
      });
      
      // Clear any user references
      await this.prisma.user.updateMany({
        where: { nonceAccount },
        data: { nonceAccount: null },
      });
      
      // Clear from cache
      this.nonceCache.delete(nonceAccount);
      
      return signature;
      
    } catch (error) {
      console.error(`[NoncePoolManager] Failed to close nonce account ${nonceAccount}:`, error);
      throw error;
    }
  }
  
  /**
   * Close multiple expired nonce accounts and reclaim rent
   * 
   * Use this to permanently remove stale nonces and recover ~0.00144 SOL per account.
   * Only closes nonces in EXPIRED status.
   * 
   * @param batchSize - Maximum number to close (default: 5)
   * @returns Results including SOL reclaimed
   */
  async closeExpiredNonces(batchSize: number = 5): Promise<{ closed: number; solReclaimed: number; errors: string[] }> {
    console.log(`[NoncePoolManager] Closing expired nonces (batch size: ${batchSize})...`);
    
    const errors: string[] = [];
    let closed = 0;
    let totalLamportsReclaimed = 0;
    
    try {
      const expiredNonces = await this.prisma.noncePool.findMany({
        where: { status: NonceStatus.EXPIRED },
        take: batchSize,
        orderBy: { lastUsedAt: 'asc' },
      });
      
      if (expiredNonces.length === 0) {
        console.log('[NoncePoolManager] No expired nonces to close');
        return { closed: 0, solReclaimed: 0, errors: [] };
      }
      
      console.log(`[NoncePoolManager] Found ${expiredNonces.length} expired nonces to close`);
      
      for (const nonce of expiredNonces) {
        try {
          const noncePubkey = new PublicKey(nonce.nonceAccount);
          const accountInfo = await this.connection.getAccountInfo(noncePubkey);
          
          if (!accountInfo) {
            // Already gone, just clean up database
            await this.prisma.noncePool.delete({
              where: { nonceAccount: nonce.nonceAccount },
            });
            await this.prisma.user.updateMany({
              where: { nonceAccount: nonce.nonceAccount },
              data: { nonceAccount: null },
            });
            continue;
          }
          
          const lamportsBefore = accountInfo.lamports;
          await this.closeNonceAccount(nonce.nonceAccount);
          totalLamportsReclaimed += lamportsBefore;
          closed++;
          
        } catch (error) {
          errors.push(`Failed to close ${nonce.nonceAccount}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      const solReclaimed = totalLamportsReclaimed / LAMPORTS_PER_SOL;
      console.log(`[NoncePoolManager] Closed ${closed} nonces, reclaimed ${solReclaimed.toFixed(6)} SOL`);
      
      return { closed, solReclaimed, errors };
      
    } catch (error) {
      console.error('[NoncePoolManager] Failed to close expired nonces:', error);
      throw error;
    }
  }
  
  /**
   * Stop the cleanup job
   */
  stopCleanupJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      console.log('[NoncePoolManager] Cleanup job stopped');
    }
  }
  
  /**
   * Public method for external cleanup scheduler
   * Marks expired nonces and reclaims them back to the pool
   * 
   * @returns Object with counts of marked and reclaimed nonces
   */
  async cleanup(): Promise<{ marked: number; reclaimed: number; failed: number }> {
    console.log('[NoncePoolManager] External cleanup triggered');
    
    try {
      const expirationDate = new Date(Date.now() - this.config.expirationThresholdMs);
      
      // Step 1: Find and mark IN_USE nonces as EXPIRED
      const expiredNonces = await this.prisma.noncePool.findMany({
        where: {
          lastUsedAt: { lt: expirationDate },
          status: NonceStatus.IN_USE,
        },
      });
      
      console.log(`[NoncePoolManager] Found ${expiredNonces.length} expired nonce accounts to mark`);
      
      for (const nonce of expiredNonces) {
        await this.prisma.noncePool.update({
          where: { nonceAccount: nonce.nonceAccount },
          data: { status: NonceStatus.EXPIRED },
        });
        console.log(`[NoncePoolManager] Marked nonce account as expired: ${nonce.nonceAccount}`);
      }
      
      // Step 2: Reclaim EXPIRED nonces back to AVAILABLE
      const reclaimResult = await this.reclaimExpiredNonces();
      
      return {
        marked: expiredNonces.length,
        reclaimed: reclaimResult.reclaimed,
        failed: reclaimResult.failed,
      };
    } catch (error) {
      console.error('[NoncePoolManager] Cleanup failed:', error);
      throw error;
    }
  }
  
  /**
   * Public method for external replenishment scheduler
   * Exposes private replenishPool with proper return value
   */
  async replenish(count?: number): Promise<{ created: number }> {
    console.log('[NoncePoolManager] External replenishment triggered');
    const toCreate = count || (this.config.minPoolSize - (await this.getPoolStats()).available);
    
    if (toCreate <= 0) {
      return { created: 0 };
    }
    
    await this.replenishPool(toCreate);
    return { created: toCreate };
  }
  
  /**
   * Utility: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[NoncePoolManager] Shutting down...');
    this.stopCleanupJob();
    
    // Reject all pending assignment requests
    for (const request of this.assignmentQueue) {
      request.reject(new Error('NoncePoolManager is shutting down'));
    }
    this.assignmentQueue = [];
    
    console.log('[NoncePoolManager] Shutdown complete');
  }
}

