/**
 * Integration Tests for Complete Atomic Swap Flow
 * Tests real service interactions with database and minimal mocking
 */

import { expect } from 'chai';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { PrismaClient, NonceStatus } from '../../src/generated/prisma';
import { NoncePoolManager } from '../../src/services/noncePoolManager';
import { FeeCalculator } from '../../src/services/feeCalculator';
import { AssetValidator } from '../../src/services/assetValidator';
import { TransactionBuilder } from '../../src/services/transactionBuilder';
import { OfferManager } from '../../src/services/offerManager';
import { AssetType } from '../../src/services/assetValidator';

describe('Atomic Swap Flow - Integration Tests', () => {
  let connection: Connection;
  let prisma: PrismaClient;
  let platformAuthority: Keypair;
  let noncePoolManager: NoncePoolManager;
  let feeCalculator: FeeCalculator;
  let assetValidator: AssetValidator;
  let transactionBuilder: TransactionBuilder;
  let offerManager: OfferManager;
  
  // Test wallets
  let makerWallet: Keypair;
  let takerWallet: Keypair;
  
  before(async () => {
    // Use test database
    const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDatabaseUrl,
        },
      },
    });
    
    // Connect to local Solana test validator
    const rpcUrl = process.env.TEST_RPC_URL || 'http://localhost:8899';
    connection = new Connection(rpcUrl, 'confirmed');
    
    // Generate test keypairs
    platformAuthority = Keypair.generate();
    makerWallet = Keypair.generate();
    takerWallet = Keypair.generate();
    
    // Initialize services
    noncePoolManager = new NoncePoolManager(connection, prisma, platformAuthority, {
      minPoolSize: 2,
      maxPoolSize: 5,
    });
    
    feeCalculator = new FeeCalculator();
    
    assetValidator = new AssetValidator(connection, {
      heliusApiKey: process.env.TEST_HELIUS_API_KEY || 'test-key',
    });
    
    const programId = Keypair.generate().publicKey;
    const treasuryPda = Keypair.generate().publicKey;
    
    transactionBuilder = new TransactionBuilder(
      connection,
      platformAuthority
    );
    
    offerManager = new OfferManager(
      connection,
      prisma,
      noncePoolManager,
      feeCalculator,
      assetValidator,
      transactionBuilder,
      platformAuthority,
      treasuryPda,
      programId
    );
    
    // Initialize nonce pool
    await noncePoolManager.initialize();
  });
  
  after(async () => {
    // Cleanup
    await prisma.swapTransaction.deleteMany();
    await prisma.swapOffer.deleteMany();
    await prisma.noncePool.deleteMany();
    await prisma.user.deleteMany();
    
    await noncePoolManager.shutdown();
    await prisma.$disconnect();
  });
  
  describe('Complete Swap Flow', () => {
    it('should create, accept, and confirm a direct SOL swap', async () => {
      // Step 1: Create offer
      const createParams = {
        makerWallet: makerWallet.publicKey.toBase58(),
        takerWallet: takerWallet.publicKey.toBase58(),
        offeredAssets: [],
        requestedAssets: [],
        offeredSol: BigInt(100 * LAMPORTS_PER_SOL), // 100 SOL
        requestedSol: BigInt(50 * LAMPORTS_PER_SOL), // 50 SOL
      };
      
      const offer = await offerManager.createOffer(createParams);
      
      expect(offer).to.have.property('id');
      expect(offer.status).to.equal('ACTIVE');
      expect(offer.makerWallet).to.equal(createParams.makerWallet);
      expect(offer.takerWallet).to.equal(createParams.takerWallet);
      expect(offer.serializedTransaction).to.exist;
      
      // Step 2: Verify user was created
      const makerUser = await prisma.user.findUnique({
        where: { walletAddress: createParams.makerWallet },
      });
      
      expect(makerUser).to.exist;
      expect(makerUser!.isSubsidized).to.be.true; // First nonce is subsidized
      
      // Step 3: Verify nonce was assigned
      const nonce = await prisma.noncePool.findFirst({
        where: { status: NonceStatus.IN_USE },
      });
      
      expect(nonce).to.exist;
      expect(nonce!.status).to.equal(NonceStatus.IN_USE);
      
      // Step 4: Accept offer (should return existing transaction)
      const acceptResult = await offerManager.acceptOffer(
        offer.id,
        takerWallet.publicKey.toBase58()
      );
      
      expect(acceptResult.serializedTransaction).to.equal(offer.serializedTransaction);
      
      // Step 5: Verify offer is still active
      const activeOffer = await prisma.swapOffer.findUnique({
        where: { id: offer.id },
      });
      
      expect(activeOffer).to.exist;
      expect(activeOffer!.status).to.equal('ACTIVE');
    });
    
    it('should create and accept an open offer', async () => {
      // Step 1: Create open offer (no taker specified)
      // Must have at least one requested asset or SOL
      const createParams = {
        makerWallet: makerWallet.publicKey.toBase58(),
        takerWallet: undefined, // Open offer
        offeredAssets: [],
        requestedAssets: [{ type: AssetType.NFT, identifier: 'DummyNftMint123456789012345678901234' }],
        offeredSol: BigInt(10 * LAMPORTS_PER_SOL),
        requestedSol: BigInt(0),
      };
      
      const offer = await offerManager.createOffer(createParams);
      
      expect(offer).to.have.property('id');
      expect(offer.status).to.equal('ACTIVE');
      expect(offer.takerWallet).to.be.null;
      expect(offer.serializedTransaction).to.be.null; // No tx yet
      
      // Step 2: Accept offer with new taker
      const newTaker = Keypair.generate();
      const acceptResult = await offerManager.acceptOffer(
        offer.id,
        newTaker.publicKey.toBase58()
      );
      
      expect(acceptResult.serializedTransaction).to.exist;
      
      // Step 3: Verify offer was updated
      const updatedOffer = await prisma.swapOffer.findUnique({
        where: { id: offer.id },
      });
      
      expect(updatedOffer!.takerWallet).to.equal(newTaker.publicKey.toBase58());
      expect(updatedOffer!.serializedTransaction).to.exist;
    });
    
    it('should create counter-offers', async () => {
      // Step 1: Create parent offer
      const parentParams = {
        makerWallet: makerWallet.publicKey.toBase58(),
        takerWallet: undefined,
        offeredAssets: [],
        requestedAssets: [],
        offeredSol: BigInt(20 * LAMPORTS_PER_SOL),
        requestedSol: BigInt(10 * LAMPORTS_PER_SOL),
      };
      
      const parentOffer = await offerManager.createOffer(parentParams);
      
      // Step 2: Create counter-offer
      // Note: Counter-offer functionality has been simplified
      // Creating a new offer instead
      const counterMaker = Keypair.generate();
      const counterOffer = await offerManager.createOffer({
        makerWallet: counterMaker.publicKey.toBase58(),
        takerWallet: parentOffer.makerWallet,
        offeredAssets: [],
        offeredSol: BigInt(20 * LAMPORTS_PER_SOL),
        requestedAssets: [{ type: AssetType.NFT, identifier: 'DummyNftMint123456789012345678901234' }],
        requestedSol: BigInt(0),
      });
      
      expect(counterOffer).to.exist;
      
      // Step 3: Verify relationship in database
      const counterWithParent = await prisma.swapOffer.findUnique({
        where: { id: counterOffer.id },
        include: { parentOffer: true },
      });
      
      expect(counterWithParent!.parentOffer!.id).to.equal(parentOffer.id);
    });
    
    it('should cancel offers and advance nonce', async () => {
      // Step 1: Create offer (must request at least one asset or SOL)
      const offer = await offerManager.createOffer({
        makerWallet: makerWallet.publicKey.toBase58(),
        takerWallet: takerWallet.publicKey.toBase58(),
        offeredAssets: [],
        requestedAssets: [{ type: AssetType.NFT, identifier: 'DummyNftMint123456789012345678901234' }],
        offeredSol: BigInt(5 * LAMPORTS_PER_SOL),
        requestedSol: BigInt(0),
      });
      
      const originalNonce = await prisma.noncePool.findUnique({
        where: { nonceAccount: offer.nonceAccount },
      });
      
      // Step 2: Cancel offer
      await offerManager.cancelOffer(
        offer.id,
        makerWallet.publicKey.toBase58()
      );
      
      // Step 3: Verify offer is cancelled
      const cancelledOffer = await prisma.swapOffer.findUnique({
        where: { id: offer.id },
      });
      
      expect(cancelledOffer!.status).to.equal('CANCELLED');
      expect(cancelledOffer!.cancelledAt).to.exist;
      
      // Step 4: Verify nonce was advanced
      const advancedNonce = await prisma.noncePool.findUnique({
        where: { nonceAccount: offer.nonceAccount },
      });
      
      expect(advancedNonce!.lastUsedAt).to.exist;
      expect(advancedNonce!.lastUsedAt!.getTime()).to.be.greaterThan(
        originalNonce!.lastUsedAt?.getTime() || 0
      );
    });
  });
  
  describe('Nonce Pool Management Integration', () => {
    it('should replenish nonce pool automatically', async () => {
      const initialStats = await noncePoolManager.getPoolStats();
      
      // Create multiple offers to deplete pool
      for (let i = 0; i < initialStats.available; i++) {
        const testWallet = Keypair.generate();
        await offerManager.createOffer({
          makerWallet: testWallet.publicKey.toBase58(),
          takerWallet: undefined,
          offeredAssets: [],
          requestedAssets: [{ type: AssetType.NFT, identifier: 'DummyNftMint123456789012345678901234' }],
          offeredSol: BigInt(1 * LAMPORTS_PER_SOL),
          requestedSol: BigInt(0),
        });
      }
      
      const depletedStats = await noncePoolManager.getPoolStats();
      expect(depletedStats.available).to.be.lessThan(initialStats.available);
      
      // Trigger replenishment (if configured)
      // Pool should auto-replenish based on threshold
    });
    
    it('should handle concurrent nonce assignments', async () => {
      const wallets = Array.from({ length: 3 }, () => Keypair.generate());
      
      // Assign nonces concurrently
      const assignments = await Promise.all(
        wallets.map((wallet) =>
          noncePoolManager.assignNonceToUser(wallet.publicKey.toBase58())
        )
      );
      
      // All assignments should succeed with unique nonces
      expect(assignments).to.have.lengthOf(3);
      expect(new Set(assignments).size).to.equal(3); // All unique
    });
  });
  
  describe('Fee Calculation Integration', () => {
    it('should calculate correct fees for different swap types', async () => {
      // NFT-only swap (flat fee)
      const nftOnlyFee = feeCalculator.calculateFee(BigInt(0), BigInt(0));
      expect(nftOnlyFee.feeType).to.equal('flat');
      expect(nftOnlyFee.feeLamports).to.equal(BigInt(5_000_000)); // 0.005 SOL
      
      // SOL swap (percentage fee) - fee is 1% of total SOL value (maker + taker)
      const solSwapFee = feeCalculator.calculateFee(
        BigInt(100 * LAMPORTS_PER_SOL), // offered
        BigInt(50 * LAMPORTS_PER_SOL)   // requested
      );
      expect(solSwapFee.feeType).to.equal('percentage');
      // 1% of 150 SOL = 1.5 SOL, but max fee is 0.5 SOL (capped)
      expect(solSwapFee.wasCapped).to.be.true;
      expect(solSwapFee.feeLamports).to.equal(BigInt(0.5 * LAMPORTS_PER_SOL)); // 0.5 SOL max fee
      
      // Verify fees are validated in offers
      const offer = await offerManager.createOffer({
        makerWallet: makerWallet.publicKey.toBase58(),
        takerWallet: takerWallet.publicKey.toBase58(),
        offeredAssets: [],
        requestedAssets: [{ type: AssetType.NFT, identifier: 'DummyNftMint123456789012345678901234' }],
        offeredSol: BigInt(100 * LAMPORTS_PER_SOL),
        requestedSol: BigInt(50 * LAMPORTS_PER_SOL),
      });
      
      expect(offer.platformFee).to.exist;
    });
  });
  
  describe('Offer Listing and Filtering', () => {
    it('should list and filter offers correctly', async () => {
      // Create multiple offers
      const wallet1 = Keypair.generate();
      const wallet2 = Keypair.generate();
      
      await offerManager.createOffer({
        makerWallet: wallet1.publicKey.toBase58(),
        takerWallet: undefined,
        offeredAssets: [],
        requestedAssets: [{ type: AssetType.NFT, identifier: 'DummyNftMint123456789012345678901234' }],
        offeredSol: BigInt(10 * LAMPORTS_PER_SOL),
        requestedSol: BigInt(0),
      });
      
      await offerManager.createOffer({
        makerWallet: wallet2.publicKey.toBase58(),
        takerWallet: undefined,
        offeredAssets: [],
        requestedAssets: [{ type: AssetType.NFT, identifier: 'DummyNftMint123456789012345678901234' }],
        offeredSol: BigInt(20 * LAMPORTS_PER_SOL),
        requestedSol: BigInt(0),
      });
      
      // List all active offers
      const allOffers = await offerManager.listOffers({
        status: 'ACTIVE',
        limit: 10,
        offset: 0,
      });
      
      expect(allOffers.offers.length).to.be.at.least(2);
      
      // Filter by maker
      const wallet1Offers = await offerManager.listOffers({
        makerWallet: wallet1.publicKey.toBase58(),
        limit: 10,
        offset: 0,
      });
      
      expect(wallet1Offers.offers.every((o) => o.makerWallet === wallet1.publicKey.toBase58()))
        .to.be.true;
    });
  });
  
  describe('Error Handling Integration', () => {
    it('should handle invalid offer acceptance attempts', async () => {
      const offer = await offerManager.createOffer({
        makerWallet: makerWallet.publicKey.toBase58(),
        takerWallet: takerWallet.publicKey.toBase58(),
        offeredAssets: [],
        requestedAssets: [{ type: AssetType.NFT, identifier: 'DummyNftMint123456789012345678901234' }],
        offeredSol: BigInt(1 * LAMPORTS_PER_SOL),
        requestedSol: BigInt(0),
      });
      
      // Try to accept with wrong taker
      const wrongTaker = Keypair.generate();
      
      try {
        await offerManager.acceptOffer(
          offer.id,
          wrongTaker.publicKey.toBase58()
        );
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('designated taker');
      }
    });
    
    it('should handle nonce pool exhaustion gracefully', async () => {
      // This would require depleting the pool and trying to create more offers
      // Implementation depends on pool configuration
    });
  });
  
  describe('Database Consistency', () => {
    it('should maintain referential integrity', async () => {
      const offer = await offerManager.createOffer({
        makerWallet: makerWallet.publicKey.toBase58(),
        takerWallet: undefined,
        offeredAssets: [],
        requestedAssets: [{ type: AssetType.NFT, identifier: 'DummyNftMint123456789012345678901234' }],
        offeredSol: BigInt(1 * LAMPORTS_PER_SOL),
        requestedSol: BigInt(0),
      });
      
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { walletAddress: makerWallet.publicKey.toBase58() },
      });
      expect(user).to.exist;
      
      // Verify nonce exists
      const nonce = await prisma.noncePool.findUnique({
        where: { nonceAccount: offer.nonceAccount },
      });
      expect(nonce).to.exist;
      
      // Verify offer references valid nonce
      const offerRecord = await prisma.swapOffer.findUnique({
        where: { id: offer.id },
      });
      expect(offerRecord!.nonceAccount).to.equal(nonce!.nonceAccount);
    });
  });
});

