/**
 * Unit Tests for OfferManager ACCEPTED Status
 * Tests the new ACCEPTED status lifecycle for atomic swap offers
 */

import { Connection, Keypair } from '@solana/web3.js';
import { OfferManager } from '../../src/services/offerManager';
import { AssetValidator, AssetType } from '../../src/services/assetValidator';
import { FeeCalculator } from '../../src/services/feeCalculator';
import { NoncePoolManager } from '../../src/services/noncePoolManager';
import { TransactionBuilder } from '../../src/services/transactionBuilder';
import { PrismaClient, OfferStatus } from '@prisma/client';

describe('OfferManager - ACCEPTED Status', () => {
  let offerManager: OfferManager;
  let mockConnection: jest.Mocked<Connection>;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockNoncePoolManager: jest.Mocked<NoncePoolManager>;
  let mockAssetValidator: jest.Mocked<AssetValidator>;
  let mockFeeCalculator: jest.Mocked<FeeCalculator>;
  let mockTransactionBuilder: jest.Mocked<TransactionBuilder>;

  beforeEach(() => {
    // Setup mocks
    mockConnection = {} as jest.Mocked<Connection>;
    mockPrisma = {
      swapOffer: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        upsert: jest.fn(),
      },
      swapTransaction: {
        create: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(mockPrisma)),
    } as any;

    mockNoncePoolManager = {
      assignNonceToUser: jest.fn(),
      getCurrentNonce: jest.fn(),
      advanceNonce: jest.fn(),
    } as any;

    mockAssetValidator = {
      validateAssets: jest.fn(),
    } as any;

    mockFeeCalculator = {
      calculateFee: jest.fn(),
    } as any;

    mockTransactionBuilder = {
      buildSwapTransaction: jest.fn(),
    } as any;

    // Setup default mock returns
    (mockPrisma.user.upsert as jest.Mock).mockResolvedValue({
      id: 'user-id-1',
      walletAddress: 'test-wallet',
    });

    (mockNoncePoolManager.assignNonceToUser as jest.Mock).mockResolvedValue(
      Keypair.generate().publicKey.toBase58()
    );

    (mockNoncePoolManager.getCurrentNonce as jest.Mock).mockResolvedValue(
      'current-nonce-value'
    );

    (mockAssetValidator.validateAssets as jest.Mock).mockResolvedValue([
      { identifier: 'test-asset', isValid: true },
    ]);

    (mockFeeCalculator.calculateFee as jest.Mock).mockReturnValue({
      feeLamports: BigInt(1000000),
      feeType: 'PERCENTAGE',
      feeRate: 0.01,
    });

    (mockTransactionBuilder.buildSwapTransaction as jest.Mock).mockResolvedValue({
      serializedTransaction: 'mock-serialized-transaction',
      nonceValue: 'mock-nonce-value',
    });

    // Mock getTransaction for confirmation
    (mockConnection.getTransaction as any) = jest.fn().mockResolvedValue({
      slot: 12345,
      blockTime: Math.floor(Date.now() / 1000),
      meta: { err: null },
    });

    offerManager = new OfferManager(
      mockConnection,
      mockPrisma,
      mockNoncePoolManager,
      mockFeeCalculator,
      mockAssetValidator,
      mockTransactionBuilder,
      Keypair.generate(), // platformAuthority
      Keypair.generate().publicKey, // treasuryPDA
      Keypair.generate().publicKey  // programId
    );
  });

  describe('Status Lifecycle', () => {
    it('should create offer with ACTIVE status', async () => {
      const makerWallet = Keypair.generate().publicKey.toBase58();
      const takerWallet = Keypair.generate().publicKey.toBase58();

      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 1,
        status: OfferStatus.ACTIVE,
        makerWallet,
        takerWallet,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(100000000),
        requestedSolLamports: BigInt(0),
        platformFeeLamports: BigInt(1000000),
      });

      const result = await offerManager.createOffer({
        makerWallet,
        takerWallet,
        offeredAssets: [],
        requestedAssets: [],
        offeredSol: BigInt(100000000),
        requestedSol: BigInt(0),
      });

      expect(result.status).toBe(OfferStatus.ACTIVE);
    });

    it('should set status to ACCEPTED when offer is accepted', async () => {
      const makerWallet = Keypair.generate().publicKey.toBase58();
      const takerWallet = Keypair.generate().publicKey.toBase58();
      const offerId = 1;

      // Mock finding the offer
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.ACTIVE,
        makerWallet,
        takerWallet,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(100000000),
        requestedSolLamports: BigInt(0),
        platformFeeLamports: BigInt(1000000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
      });

      // Mock updating the offer to ACCEPTED
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.ACCEPTED,
        makerWallet,
        takerWallet,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(100000000),
        requestedSolLamports: BigInt(0),
        platformFeeLamports: BigInt(1000000),
        serializedTransaction: 'mock-serialized-transaction',
        currentNonceValue: 'mock-nonce-value',
        nonceAccount: Keypair.generate().publicKey.toBase58(),
      });

      const result = await offerManager.acceptOffer(offerId, takerWallet);

      // Verify update was called with ACCEPTED status
      expect(mockPrisma.swapOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: offerId },
          data: expect.objectContaining({
            status: OfferStatus.ACCEPTED,
          }),
        })
      );

      // Verify result includes updated offer with ACCEPTED status
      expect(result.offer.status).toBe(OfferStatus.ACCEPTED);
    });

    it('should transition from ACCEPTED to FILLED when confirmed', async () => {
      const offerId = 1;
      const nonceAccount = Keypair.generate().publicKey.toBase58();
      const transactionSignature = 'mock-signature';

      // Mock finding ACCEPTED offer
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.ACCEPTED,
        serializedTransaction: 'mock-serialized-transaction',
        nonceAccount,
      });

      // Mock update to FILLED
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.FILLED,
      });

      // Mock updateMany for cancelling other offers
      (mockPrisma.swapOffer.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      // Mock transaction creation
      (mockPrisma.swapTransaction.create as jest.Mock).mockResolvedValue({
        id: 1,
        signature: transactionSignature,
      });

      await offerManager.confirmSwap({
        offerId,
        signature: transactionSignature,
      });

      // Verify status was updated to FILLED
      expect(mockPrisma.swapOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: offerId },
          data: expect.objectContaining({
            status: OfferStatus.FILLED,
          }),
        })
      );
    });
  });

  describe('Status Validation', () => {
    it('should only accept offers with ACTIVE status', async () => {
      const offerId = 1;
      const takerWallet = Keypair.generate().publicKey.toBase58();

      // Mock finding offer with non-ACTIVE status
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.FILLED,
        makerWallet: Keypair.generate().publicKey.toBase58(),
      });

      await expect(offerManager.acceptOffer(offerId, takerWallet)).rejects.toThrow(
        'Offer is not active'
      );
    });

    it('should only confirm offers with ACCEPTED status', async () => {
      const offerId = 1;
      const signature = 'mock-signature';

      // Mock finding offer with ACTIVE status (not yet ACCEPTED)
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.ACTIVE,
      });

      await expect(
        offerManager.confirmSwap({ offerId, signature })
      ).rejects.toThrow();
    });
  });

  describe('Nonce Reuse Prevention', () => {
    it('should cancel both ACTIVE and ACCEPTED offers using same nonce when confirming', async () => {
      const offerId = 1;
      const nonceAccount = Keypair.generate().publicKey.toBase58();
      const signature = 'mock-signature';

      // Mock finding offer
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.ACCEPTED,
        serializedTransaction: 'mock-tx',
        nonceAccount,
      });

      // Mock update to FILLED
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.FILLED,
      });

      // Mock updateMany for cancelling
      (mockPrisma.swapOffer.updateMany as jest.Mock).mockResolvedValue({
        count: 2, // 2 other offers cancelled
      });

      // Mock transaction creation
      (mockPrisma.swapTransaction.create as jest.Mock).mockResolvedValue({
        id: 1,
      });

      await offerManager.confirmSwap({ offerId, signature });

      // Verify both ACTIVE and ACCEPTED offers are cancelled
      expect(mockPrisma.swapOffer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            nonceAccount,
            id: { not: offerId },
            status: { in: [OfferStatus.ACTIVE, OfferStatus.ACCEPTED] },
          }),
          data: { status: OfferStatus.CANCELLED },
        })
      );
    });

    it('should prevent nonce reuse by cancelling ACCEPTED offers', async () => {
      const offerId = 1;
      const nonceAccount = Keypair.generate().publicKey.toBase58();
      const signature = 'mock-signature';

      // Create scenario: 3 offers with same nonce
      // - Offer 1 (offerId): ACCEPTED → will be FILLED
      // - Offer 2: ACTIVE → should be CANCELLED
      // - Offer 3: ACCEPTED → should be CANCELLED (this is the bug fix)

      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.ACCEPTED,
        serializedTransaction: 'mock-tx',
        nonceAccount,
      });

      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.FILLED,
      });

      // Mock cancelling 2 offers (1 ACTIVE + 1 ACCEPTED)
      (mockPrisma.swapOffer.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      (mockPrisma.swapTransaction.create as jest.Mock).mockResolvedValue({
        id: 1,
      });

      await offerManager.confirmSwap({ offerId, signature });

      // Verify the where clause includes both statuses
      const updateManyCall = (mockPrisma.swapOffer.updateMany as jest.Mock).mock.calls[0][0];
      expect(updateManyCall.where.status.in).toEqual([OfferStatus.ACTIVE, OfferStatus.ACCEPTED]);
    });
  });

  describe('Response Structure', () => {
    it('should return both transaction and offer in acceptOffer response', async () => {
      const makerWallet = Keypair.generate().publicKey.toBase58();
      const takerWallet = Keypair.generate().publicKey.toBase58();
      const offerId = 1;

      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.ACTIVE,
        makerWallet,
        takerWallet,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(100000000),
        requestedSolLamports: BigInt(0),
        platformFeeLamports: BigInt(1000000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
      });

      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.ACCEPTED,
        makerWallet,
        takerWallet,
        serializedTransaction: 'mock-serialized-transaction',
        currentNonceValue: 'mock-nonce-value',
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(100000000),
        requestedSolLamports: BigInt(0),
      });

      const result = await offerManager.acceptOffer(offerId, takerWallet);

      // Verify response structure
      expect(result).toHaveProperty('serializedTransaction');
      expect(result).toHaveProperty('offer');
      expect(result.offer).toHaveProperty('status', OfferStatus.ACCEPTED);
      expect(result.serializedTransaction).toBe('mock-serialized-transaction');
    });
  });
});
