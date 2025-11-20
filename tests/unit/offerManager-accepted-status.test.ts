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
      },
      user: {
        upsert: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(mockPrisma)),
    } as any;

    mockNoncePoolManager = {
      assignNonceToUser: jest.fn(),
      getCurrentNonce: jest.fn(),
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
      const transactionSignature = 'mock-signature';

      // Mock finding ACCEPTED offer
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.ACCEPTED,
        serializedTransaction: 'mock-serialized-transaction',
      });

      // Mock transaction confirmation
      (mockConnection.getTransaction as any) = jest.fn().mockResolvedValue({
        slot: 12345,
        blockTime: Math.floor(Date.now() / 1000),
        meta: { err: null },
      });

      // Mock update to FILLED
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({
        id: offerId,
        status: OfferStatus.FILLED,
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

