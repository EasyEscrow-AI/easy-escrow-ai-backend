/**
 * Unit Tests for Database Schema (Prisma)
 * Tests data model integrity, relationships, and constraints
 */

import { PrismaClient, NonceStatus } from '../../src/generated/prisma';

// Note: These tests require a test database connection
// Run with: npm run test:unit -- database.test.ts

describe('Database Schema', () => {
  let prisma: PrismaClient;
  
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
        },
      },
    });
    
    // Ensure clean state
    await prisma.swapTransaction.deleteMany();
    await prisma.swapOffer.deleteMany();
    await prisma.noncePool.deleteMany();
    await prisma.user.deleteMany();
  });
  
  afterEach(async () => {
    // Clean up after each test
    await prisma.swapTransaction.deleteMany();
    await prisma.swapOffer.deleteMany();
    await prisma.noncePool.deleteMany();
    await prisma.user.deleteMany();
  });
  
  afterAll(async () => {
    await prisma.$disconnect();
  });
  
  describe('User Model', () => {
    it('should create a new user', async () => {
      const user = await prisma.user.create({
        data: {
          walletAddress: 'test-wallet-address-1',
          swapStats: {} as any,
        },
      });
      
      expect(user).toMatchObject({
        walletAddress: 'test-wallet-address-1',
        totalSwapsCompleted: 0,
        totalFeesPaidLamports: expect.any(BigInt),
        isSubsidized: false,
      });
      expect(user.id).toBeDefined();
      expect(user.createdAt).toBeInstanceOf(Date);
    });
    
    it('should enforce unique wallet address', async () => {
      await prisma.user.create({
        data: {
          walletAddress: 'duplicate-wallet',
          swapStats: {} as any,
        },
      });
      
      await expect(
        prisma.user.create({
          data: {
            walletAddress: 'duplicate-wallet',
            swapStats: {} as any,
          },
        })
      ).rejects.toThrow();
    });
    
    it('should store swap statistics in JSONB', async () => {
      const swapStats = {
        totalValueSwapped: 1000000,
        averageFee: 5000,
        lastSwapDate: new Date().toISOString(),
      };
      
      const user = await prisma.user.create({
        data: {
          walletAddress: 'test-wallet-stats',
          swapStats: swapStats as any,
        },
      });
      
      expect(user.swapStats).toEqual(swapStats);
    });
    
    it('should update user statistics', async () => {
      const user = await prisma.user.create({
        data: {
          walletAddress: 'test-wallet-update',
          swapStats: {} as any,
        },
      });
      
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          totalSwapsCompleted: 5,
          totalFeesPaidLamports: BigInt(25000000),
        },
      });
      
      expect(updated.totalSwapsCompleted).toBe(5);
      expect(updated.totalFeesPaidLamports).toBe(BigInt(25000000));
    });
  });
  
  describe('NoncePool Model', () => {
    it('should create a nonce account', async () => {
      const nonce = await prisma.noncePool.create({
        data: {
          nonceAccount: 'test-nonce-account-1',
          nonceAuthority: 'test-authority',
          currentNonceValue: 'initial-nonce-value',
          status: NonceStatus.AVAILABLE,
        },
      });
      
      expect(nonce).toMatchObject({
        nonceAccount: 'test-nonce-account-1',
        nonceAuthority: 'test-authority',
        currentNonceValue: 'initial-nonce-value',
        status: NonceStatus.AVAILABLE,
      });
      expect(nonce.id).toBeDefined();
      expect(nonce.createdAt).toBeInstanceOf(Date);
    });
    
    it('should enforce unique nonce account address', async () => {
      await prisma.noncePool.create({
        data: {
          nonceAccount: 'duplicate-nonce',
          nonceAuthority: 'test-authority',
          currentNonceValue: 'nonce-value',
          status: NonceStatus.AVAILABLE,
        },
      });
      
      await expect(
        prisma.noncePool.create({
          data: {
            nonceAccount: 'duplicate-nonce',
            nonceAuthority: 'test-authority',
            currentNonceValue: 'nonce-value',
            status: NonceStatus.AVAILABLE,
          },
        })
      ).rejects.toThrow();
    });
    
    it('should assign nonce to user', async () => {
      const user = await prisma.user.create({
        data: {
          walletAddress: 'test-wallet-nonce',
          swapStats: {} as any,
        },
      });
      
      const nonce = await prisma.noncePool.create({
        data: {
          nonceAccount: 'test-nonce-assigned',
          nonceAuthority: 'test-authority',
          currentNonceValue: 'nonce-value',
          status: NonceStatus.IN_USE,
          assignedToUserId: user.id,
          assignedAt: new Date(),
        },
      });
      
      expect(nonce.assignedToUserId).toBe(user.id);
      expect(nonce.assignedAt).toBeInstanceOf(Date);
    });
    
    it('should track nonce status changes', async () => {
      const nonce = await prisma.noncePool.create({
        data: {
          nonceAccount: 'test-nonce-status',
          nonceAuthority: 'test-authority',
          currentNonceValue: 'nonce-value',
          status: NonceStatus.AVAILABLE,
        },
      });
      
      const updated = await prisma.noncePool.update({
        where: { id: nonce.id },
        data: {
          status: NonceStatus.IN_USE,
          lastUsedAt: new Date(),
        },
      });
      
      expect(updated.status).toBe(NonceStatus.IN_USE);
      expect(updated.lastUsedAt).toBeInstanceOf(Date);
    });
  });
  
  describe('SwapOffer Model', () => {
    it('should create a swap offer', async () => {
      const offer = await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'ACTIVE',
          makerWallet: 'maker-wallet',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'test-nonce-for-offer',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      expect(offer).toMatchObject({
        offerType: 'MAKER',
        status: 'ACTIVE',
        makerWallet: 'maker-wallet',
        platformFeeLamports: BigInt(5000000),
      });
      expect(offer.id).toBeDefined();
      expect(offer.createdAt).toBeInstanceOf(Date);
    });
    
    it('should store asset arrays in JSONB', async () => {
      const offeredAssets = [
        { standard: 'nft', mint: 'mint-1', amount: 1 },
        { standard: 'cnft', assetId: 'cnft-1', tree: 'tree-1', leafIndex: 10, amount: 1 },
      ];
      
      const requestedAssets = [
        { standard: 'nft', mint: 'mint-2', amount: 1 },
      ];
      
      const offer = await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'ACTIVE',
          makerWallet: 'maker-wallet',
          offeredAssets: offeredAssets as any,
          requestedAssets: requestedAssets as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'test-nonce',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      expect(offer.offeredAssets).toEqual(offeredAssets);
      expect(offer.requestedAssets).toEqual(requestedAssets);
    });
    
    it('should create counter-offer with parent relationship', async () => {
      const parentOffer = await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'ACTIVE',
          makerWallet: 'maker-wallet',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'test-nonce-parent',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      const counterOffer = await prisma.swapOffer.create({
        data: {
          offerType: 'COUNTER',
          status: 'ACTIVE',
          makerWallet: 'counter-maker',
          offeredAssets: parentOffer.requestedAssets as any,
          requestedAssets: parentOffer.offeredAssets as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'test-nonce-counter',
          currentNonceValue: 'nonce-value',
          parentOfferId: parentOffer.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      expect(counterOffer.parentOfferId).toBe(parentOffer.id);
      
      // Test relationship query
      const counterWithParent = await prisma.swapOffer.findUnique({
        where: { id: counterOffer.id },
        include: { parentOffer: true },
      });
      
      expect(counterWithParent?.parentOffer?.id).toBe(parentOffer.id);
    });
    
    it('should update offer status', async () => {
      const offer = await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'ACTIVE',
          makerWallet: 'maker-wallet',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'test-nonce',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      const updated = await prisma.swapOffer.update({
        where: { id: offer.id },
        data: {
          status: 'FILLED',
          transactionSignature: 'test-signature',
          filledAt: new Date(),
        },
      });
      
      expect(updated.status).toBe('FILLED');
      expect(updated.transactionSignature).toBe('test-signature');
      expect(updated.filledAt).toBeInstanceOf(Date);
    });
  });
  
  describe('SwapTransaction Model', () => {
    it('should create a swap transaction', async () => {
      const offer = await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'ACTIVE',
          makerWallet: 'maker-wallet',
          takerWallet: 'taker-wallet',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'test-nonce',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      const transaction = await prisma.swapTransaction.create({
        data: {
          offerId: offer.id,
          signature: 'test-transaction-signature',
          makerWallet: offer.makerWallet,
          takerWallet: offer.takerWallet!,
          platformFeeCollectedLamports: offer.platformFeeLamports,
          totalValueLamports: BigInt(100000000),
        },
      });
      
      expect(transaction).toMatchObject({
        offerId: offer.id,
        signature: 'test-transaction-signature',
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        platformFeeCollectedLamports: BigInt(5000000),
        totalValueLamports: BigInt(100000000),
      });
      expect(transaction.id).toBeDefined();
      expect(transaction.executedAt).toBeInstanceOf(Date);
    });
    
    it('should enforce unique transaction signature', async () => {
      const offer1 = await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'ACTIVE',
          makerWallet: 'maker-1',
          takerWallet: 'taker-1',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'nonce-1',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      await prisma.swapTransaction.create({
        data: {
          offerId: offer1.id,
          signature: 'duplicate-signature',
          makerWallet: 'maker-1',
          takerWallet: 'taker-1',
          platformFeeCollectedLamports: BigInt(5000000),
          totalValueLamports: BigInt(100000000),
        },
      });
      
      const offer2 = await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'ACTIVE',
          makerWallet: 'maker-2',
          takerWallet: 'taker-2',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'nonce-2',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      await expect(
        prisma.swapTransaction.create({
          data: {
            offerId: offer2.id,
            signature: 'duplicate-signature',
            makerWallet: 'maker-2',
            takerWallet: 'taker-2',
            platformFeeCollectedLamports: BigInt(5000000),
            totalValueLamports: BigInt(100000000),
          },
        })
      ).rejects.toThrow();
    });
  });
  
  describe('Relationships and Cascade', () => {
    it('should query offer with related transaction', async () => {
      const offer = await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'FILLED',
          makerWallet: 'maker-wallet',
          takerWallet: 'taker-wallet',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'test-nonce',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      await prisma.swapTransaction.create({
        data: {
          offerId: offer.id,
          signature: 'related-signature',
          makerWallet: offer.makerWallet,
          takerWallet: offer.takerWallet!,
          platformFeeCollectedLamports: offer.platformFeeLamports,
          totalValueLamports: BigInt(100000000),
        },
      });
      
      const offerWithTransaction = await prisma.swapOffer.findUnique({
        where: { id: offer.id },
        include: { swapTransactions: true },
      });
      
      expect(offerWithTransaction?.swapTransactions).toHaveLength(1);
      expect(offerWithTransaction?.swapTransactions[0].signature).toBe('related-signature');
    });
    
    it('should query counter-offers for parent offer', async () => {
      const parentOffer = await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'ACTIVE',
          makerWallet: 'maker-wallet',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'parent-nonce',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      await prisma.swapOffer.create({
        data: {
          offerType: 'COUNTER',
          status: 'ACTIVE',
          makerWallet: 'counter-maker-1',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'counter-nonce-1',
          currentNonceValue: 'nonce-value',
          parentOfferId: parentOffer.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      await prisma.swapOffer.create({
        data: {
          offerType: 'COUNTER',
          status: 'ACTIVE',
          makerWallet: 'counter-maker-2',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'counter-nonce-2',
          currentNonceValue: 'nonce-value',
          parentOfferId: parentOffer.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      const offerWithCounters = await prisma.swapOffer.findUnique({
        where: { id: parentOffer.id },
        include: { counterOffers: true },
      });
      
      expect(offerWithCounters?.counterOffers).toHaveLength(2);
    });
  });
  
  describe('Indexes and Performance', () => {
    it('should query by wallet address efficiently', async () => {
      const walletAddress = 'test-performance-wallet';
      
      // Create multiple offers
      for (let i = 0; i < 10; i++) {
        await prisma.swapOffer.create({
          data: {
            offerType: 'MAKER',
            status: 'ACTIVE',
            makerWallet: walletAddress,
            offeredAssets: [] as any,
            requestedAssets: [] as any,
            platformFeeLamports: BigInt(5000000),
            feePayer: 'TAKER',
            nonceAccount: `nonce-${i}`,
            currentNonceValue: 'nonce-value',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }
      
      const offers = await prisma.swapOffer.findMany({
        where: { makerWallet: walletAddress },
      });
      
      expect(offers).toHaveLength(10);
    });
    
    it('should query by status efficiently', async () => {
      // Create offers with different statuses
      await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'ACTIVE',
          makerWallet: 'maker-1',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'nonce-1',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      await prisma.swapOffer.create({
        data: {
          offerType: 'MAKER',
          status: 'FILLED',
          makerWallet: 'maker-2',
          offeredAssets: [] as any,
          requestedAssets: [] as any,
          platformFeeLamports: BigInt(5000000),
          feePayer: 'TAKER',
          nonceAccount: 'nonce-2',
          currentNonceValue: 'nonce-value',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      
      const activeOffers = await prisma.swapOffer.findMany({
        where: { status: 'ACTIVE' },
      });
      
      expect(activeOffers.every((o) => o.status === 'ACTIVE')).toBe(true);
    });
  });
});

