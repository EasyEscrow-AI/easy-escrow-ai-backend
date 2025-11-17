/**
 * Unit Tests for OfferManager Service
 * Tests complete offer lifecycle and business logic orchestration
 */

import { Connection, Keypair, Transaction } from '@solana/web3.js';
import { PrismaClient } from '../../src/generated/prisma';
import { OfferManager, CreateOfferParams, AcceptOfferParams } from '../../src/services/offerManager';
import { NoncePoolManager } from '../../src/services/noncePoolManager';
import { AssetValidator, AssetType } from '../../src/services/assetValidator';
import { FeeCalculator } from '../../src/services/feeCalculator';
import { TransactionBuilder } from '../../src/services/transactionBuilder';

// Mock all dependencies
jest.mock('../../src/generated/prisma');
jest.mock('../../src/services/noncePoolManager');
jest.mock('../../src/services/assetValidator');
jest.mock('../../src/services/feeCalculator');
jest.mock('../../src/services/transactionBuilder');
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getTransaction: jest.fn(),
      confirmTransaction: jest.fn(),
    })),
  };
});

describe('OfferManager', () => {
  let offerManager: OfferManager;
  let mockConnection: jest.Mocked<Connection>;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockNoncePoolManager: jest.Mocked<NoncePoolManager>;
  let mockAssetValidator: jest.Mocked<AssetValidator>;
  let mockFeeCalculator: jest.Mocked<FeeCalculator>;
  let mockTransactionBuilder: jest.Mocked<TransactionBuilder>;
  
  beforeEach(() => {
    // Create all mocks
    mockConnection = new Connection('http://localhost:8899') as jest.Mocked<Connection>;
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    mockNoncePoolManager = new NoncePoolManager(
      mockConnection,
      mockPrisma,
      Keypair.generate()
    ) as jest.Mocked<NoncePoolManager>;
    mockAssetValidator = new AssetValidator(mockConnection) as jest.Mocked<AssetValidator>;
    mockFeeCalculator = new FeeCalculator() as jest.Mocked<FeeCalculator>;
    mockTransactionBuilder = new TransactionBuilder(
      mockConnection,
      mockAssetValidator,
      mockFeeCalculator,
      {
        programId: Keypair.generate().publicKey.toBase58(),
        treasuryPda: Keypair.generate().publicKey.toBase58(),
        platformAuthority: Keypair.generate(),
      }
    ) as jest.Mocked<TransactionBuilder>;
    
    // Setup Prisma mocks
    (mockPrisma as any).user = {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    };
    (mockPrisma as any).swapOffer = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    (mockPrisma as any).swapTransaction = {
      create: jest.fn(),
    };
    (mockPrisma as any).$transaction = jest.fn((fn) => fn(mockPrisma));
    
    offerManager = new OfferManager(
      mockConnection,
      mockPrisma,
      mockNoncePoolManager,
      mockAssetValidator,
      mockFeeCalculator,
      mockTransactionBuilder
    );
    
    // Setup default mock returns
    (mockPrisma.user.upsert as jest.Mock).mockResolvedValue({
      id: 'user-id-1',
      walletAddress: 'test-wallet',
    });
    
    (mockNoncePoolManager.assignNonceToUser as jest.Mock).mockResolvedValue('test-nonce-account');
    
    (mockNoncePoolManager.getCurrentNonce as jest.Mock).mockResolvedValue('current-nonce-value');
    
    (mockAssetValidator.validateAssets as jest.Mock).mockResolvedValue({
      valid: true,
      validatedAssets: [],
      invalidAssets: [],
    });
    
    (mockFeeCalculator.calculateFee as jest.Mock).mockReturnValue({
      feeLamports: BigInt(5_000_000),
      feeSol: 0.005,
      feeType: 'flat',
      totalSwapValueLamports: BigInt(0),
      totalSwapValueSol: 0,
      wasCapped: false,
    });
    
    (mockFeeCalculator.validateFee as jest.Mock).mockReturnValue(true);
    
    const mockTransaction = new Transaction();
    (mockTransactionBuilder.buildSwapTransaction as jest.Mock).mockResolvedValue(mockTransaction);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Create Direct Offer', () => {
    it('should create offer with known taker', async () => {
      const params: CreateOfferParams = {
        makerWallet: 'maker-wallet-address',
        takerWallet: 'taker-wallet-address', // Direct offer
        offeredAssets: [
          {
            standard: AssetType.NFT,
            mint: 'nft-mint-1',
            amount: 1,
          },
        ],
        requestedAssets: [
          {
            standard: AssetType.NFT,
            mint: 'nft-mint-2',
            amount: 1,
          },
        ],
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      };
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 1,
        offerType: 'MAKER',
        status: 'ACTIVE',
        makerWallet: params.makerWallet,
        takerWallet: params.takerWallet,
        offeredAssets: params.offeredAssets,
        requestedAssets: params.requestedAssets,
        platformFeeLamports: BigInt(5_000_000),
        serializedTransaction: 'base64-encoded-transaction',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      const result = await offerManager.createOffer(params);
      
      expect(result).toMatchObject({
        id: expect.any(Number),
        status: 'ACTIVE',
        makerWallet: params.makerWallet,
        takerWallet: params.takerWallet,
      });
      
      // Should have validated assets
      expect(mockAssetValidator.validateAssets).toHaveBeenCalledWith(
        params.makerWallet,
        params.offeredAssets,
        expect.any(Object)
      );
      
      // Should have built transaction
      expect(mockTransactionBuilder.buildSwapTransaction).toHaveBeenCalled();
      
      // Should have stored serialized transaction
      expect(mockPrisma.swapOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            serializedTransaction: expect.any(String),
          }),
        })
      );
    });
    
    it('should create offer and ensure user exists', async () => {
      const params: CreateOfferParams = {
        makerWallet: 'new-maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(100_000_000),
        requestedSolLamports: BigInt(0),
      };
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 2,
        offerType: 'MAKER',
        status: 'ACTIVE',
      });
      
      await offerManager.createOffer(params);
      
      // Should have upserted user
      expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { walletAddress: params.makerWallet },
        })
      );
    });
    
    it('should assign nonce to user', async () => {
      const params: CreateOfferParams = {
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      };
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 3,
        status: 'ACTIVE',
      });
      
      await offerManager.createOffer(params);
      
      // Should have assigned nonce
      expect(mockNoncePoolManager.assignNonceToUser).toHaveBeenCalledWith(params.makerWallet);
    });
    
    it('should calculate and validate fee', async () => {
      const params: CreateOfferParams = {
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(100_000_000),
        requestedSolLamports: BigInt(200_000_000),
      };
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 4,
        status: 'ACTIVE',
      });
      
      await offerManager.createOffer(params);
      
      // Should have calculated fee
      expect(mockFeeCalculator.calculateFee).toHaveBeenCalledWith(
        params.offeredSolLamports,
        params.requestedSolLamports
      );
      
      // Should have validated fee
      expect(mockFeeCalculator.validateFee).toHaveBeenCalled();
    });
    
    it('should reject offer with invalid assets', async () => {
      const params: CreateOfferParams = {
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [
          {
            standard: AssetType.NFT,
            mint: 'unowned-nft-mint',
            amount: 1,
          },
        ],
        requestedAssets: [],
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      };
      
      // Mock asset validation failure
      (mockAssetValidator.validateAssets as jest.Mock).mockResolvedValue({
        valid: false,
        validatedAssets: [],
        invalidAssets: [
          {
            asset: params.offeredAssets[0],
            reason: 'Asset not owned by maker',
          },
        ],
      });
      
      await expect(offerManager.createOffer(params)).rejects.toThrow('Asset validation failed');
    });
  });
  
  describe('Create Open Offer', () => {
    it('should create offer without known taker', async () => {
      const params: CreateOfferParams = {
        makerWallet: 'maker-wallet',
        takerWallet: undefined, // Open offer
        offeredAssets: [
          {
            standard: AssetType.NFT,
            mint: 'nft-mint',
            amount: 1,
          },
        ],
        requestedAssets: [],
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(100_000_000),
      };
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 5,
        offerType: 'MAKER',
        status: 'ACTIVE',
        makerWallet: params.makerWallet,
        takerWallet: null,
      });
      
      const result = await offerManager.createOffer(params);
      
      expect(result.takerWallet).toBeNull();
      
      // Should NOT have built transaction yet (no taker)
      expect(mockTransactionBuilder.buildSwapTransaction).not.toHaveBeenCalled();
      
      // Should NOT have serialized transaction
      expect(mockPrisma.swapOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            serializedTransaction: null,
          }),
        })
      );
    });
  });
  
  describe('Create Counter-Offer', () => {
    it('should create counter-offer for existing offer', async () => {
      const parentOfferId = 1;
      const parentOffer = {
        id: parentOfferId,
        offerType: 'MAKER',
        status: 'ACTIVE',
        makerWallet: 'original-maker',
        takerWallet: null,
        offeredAssets: [
          {
            standard: 'nft',
            mint: 'nft-1',
            amount: 1,
          },
        ],
        requestedAssets: [
          {
            standard: 'nft',
            mint: 'nft-2',
            amount: 1,
          },
        ],
        nonceAccount: 'parent-nonce-account',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue(parentOffer);
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 6,
        offerType: 'COUNTER',
        status: 'ACTIVE',
        parentOfferId,
      });
      
      const result = await offerManager.createCounterOffer({
        parentOfferId,
        counterMakerWallet: 'counter-maker',
      });
      
      expect(result.offerType).toBe('COUNTER');
      expect(result.parentOfferId).toBe(parentOfferId);
      
      // Should reuse parent's nonce account
      expect(mockNoncePoolManager.assignNonceToUser).not.toHaveBeenCalled();
    });
    
    it('should reject counter-offer for inactive parent', async () => {
      const parentOfferId = 10;
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: parentOfferId,
        status: 'FILLED', // Not active
      });
      
      await expect(
        offerManager.createCounterOffer({
          parentOfferId,
          counterMakerWallet: 'counter-maker',
        })
      ).rejects.toThrow('Parent offer is not active');
    });
    
    it('should reject counter-offer for expired parent', async () => {
      const parentOfferId = 11;
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: parentOfferId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 1000), // Expired
      });
      
      await expect(
        offerManager.createCounterOffer({
          parentOfferId,
          counterMakerWallet: 'counter-maker',
        })
      ).rejects.toThrow('Parent offer has expired');
    });
  });
  
  describe('Accept Offer', () => {
    it('should accept direct offer and return transaction', async () => {
      const offerId = 1;
      const takerWallet = 'taker-wallet';
      const serializedTx = Buffer.from('mock-transaction-data').toString('base64');
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        takerWallet,
        serializedTransaction: serializedTx,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      const result = await offerManager.acceptOffer({
        offerId,
        takerWallet,
      });
      
      expect(result.serializedTransaction).toBe(serializedTx);
    });
    
    it('should accept open offer and build transaction', async () => {
      const offerId = 2;
      const takerWallet = 'new-taker-wallet';
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        makerWallet: 'maker-wallet',
        takerWallet: null, // Open offer
        offeredAssets: [],
        requestedAssets: [],
        serializedTransaction: null,
        nonceAccount: 'nonce-account',
        currentNonceValue: 'nonce-value',
        platformFeeLamports: BigInt(5_000_000),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      
      const result = await offerManager.acceptOffer({
        offerId,
        takerWallet,
      });
      
      expect(result.serializedTransaction).toBeDefined();
      
      // Should have built transaction
      expect(mockTransactionBuilder.buildSwapTransaction).toHaveBeenCalled();
      
      // Should have updated offer with taker and transaction
      expect(mockPrisma.swapOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            takerWallet,
            serializedTransaction: expect.any(String),
          }),
        })
      );
    });
    
    it('should reject accepting inactive offer', async () => {
      const offerId = 3;
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'CANCELLED',
      });
      
      await expect(
        offerManager.acceptOffer({
          offerId,
          takerWallet: 'taker-wallet',
        })
      ).rejects.toThrow('Offer is not active');
    });
    
    it('should reject accepting expired offer', async () => {
      const offerId = 4;
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 1000), // Expired
      });
      
      await expect(
        offerManager.acceptOffer({
          offerId,
          takerWallet: 'taker-wallet',
        })
      ).rejects.toThrow('Offer has expired');
    });
    
    it('should enforce taker restriction for direct offers', async () => {
      const offerId = 5;
      const designatedTaker = 'designated-taker';
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        takerWallet: designatedTaker,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      await expect(
        offerManager.acceptOffer({
          offerId,
          takerWallet: 'wrong-taker-wallet',
        })
      ).rejects.toThrow('Only designated taker can accept this offer');
    });
  });
  
  describe('Cancel Offer', () => {
    it('should cancel offer and advance nonce', async () => {
      const offerId = 1;
      const makerWallet = 'maker-wallet';
      const nonceAccount = 'nonce-account';
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        makerWallet,
        nonceAccount,
      });
      
      (mockNoncePoolManager.advanceNonce as jest.Mock).mockResolvedValue(undefined);
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.swapOffer.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
      
      await offerManager.cancelOffer({
        offerId,
        makerWallet,
      });
      
      // Should have advanced nonce
      expect(mockNoncePoolManager.advanceNonce).toHaveBeenCalledWith(nonceAccount);
      
      // Should have marked offer as cancelled
      expect(mockPrisma.swapOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: offerId },
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancelledAt: expect.any(Date),
          }),
        })
      );
      
      // Should have cancelled related offers
      expect(mockPrisma.swapOffer.updateMany).toHaveBeenCalled();
    });
    
    it('should reject cancellation by non-maker', async () => {
      const offerId = 2;
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        makerWallet: 'actual-maker',
      });
      
      await expect(
        offerManager.cancelOffer({
          offerId,
          makerWallet: 'not-the-maker',
        })
      ).rejects.toThrow('Only maker can cancel offer');
    });
    
    it('should reject cancelling already cancelled offer', async () => {
      const offerId = 3;
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'CANCELLED',
        makerWallet: 'maker-wallet',
      });
      
      await expect(
        offerManager.cancelOffer({
          offerId,
          makerWallet: 'maker-wallet',
        })
      ).rejects.toThrow('Offer is not active');
    });
  });
  
  describe('Confirm Swap', () => {
    it('should confirm swap and mark offer as filled', async () => {
      const offerId = 1;
      const signature = 'transaction-signature-base58';
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: 'nonce-account',
      });
      
      (mockConnection.getTransaction as jest.Mock).mockResolvedValue({
        slot: 12345,
        meta: {
          err: null, // Successful transaction
        },
      });
      
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.swapOffer.updateMany as jest.Mock).mockResolvedValue({});
      (mockPrisma.swapTransaction.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
      
      await offerManager.confirmSwap({
        offerId,
        signature,
      });
      
      // Should have verified transaction
      expect(mockConnection.getTransaction).toHaveBeenCalledWith(signature);
      
      // Should have marked offer as filled
      expect(mockPrisma.swapOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FILLED',
            transactionSignature: signature,
            filledAt: expect.any(Date),
          }),
        })
      );
      
      // Should have created swap transaction record
      expect(mockPrisma.swapTransaction.create).toHaveBeenCalled();
    });
    
    it('should reject confirmation for failed transaction', async () => {
      const offerId = 2;
      const signature = 'failed-tx-signature';
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
      });
      
      (mockConnection.getTransaction as jest.Mock).mockResolvedValue({
        slot: 12345,
        meta: {
          err: { InstructionError: [0, 'Custom error'] }, // Failed transaction
        },
      });
      
      await expect(
        offerManager.confirmSwap({
          offerId,
          signature,
        })
      ).rejects.toThrow('Transaction failed');
    });
    
    it('should reject confirmation if transaction not found', async () => {
      const offerId = 3;
      const signature = 'non-existent-signature';
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
      });
      
      (mockConnection.getTransaction as jest.Mock).mockResolvedValue(null);
      
      await expect(
        offerManager.confirmSwap({
          offerId,
          signature,
        })
      ).rejects.toThrow('Transaction not found');
    });
  });
  
  describe('List Offers', () => {
    it('should list offers with filters', async () => {
      const mockOffers = [
        { id: 1, status: 'ACTIVE', makerWallet: 'maker-1' },
        { id: 2, status: 'ACTIVE', makerWallet: 'maker-2' },
      ];
      
      (mockPrisma.swapOffer.findMany as jest.Mock).mockResolvedValue(mockOffers);
      
      const result = await offerManager.listOffers({
        status: 'ACTIVE',
        limit: 10,
        offset: 0,
      });
      
      expect(result.offers).toHaveLength(2);
      expect(mockPrisma.swapOffer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
          }),
          take: 10,
          skip: 0,
        })
      );
    });
    
    it('should filter offers by maker wallet', async () => {
      const makerWallet = 'specific-maker';
      
      (mockPrisma.swapOffer.findMany as jest.Mock).mockResolvedValue([]);
      
      await offerManager.listOffers({
        makerWallet,
        limit: 10,
        offset: 0,
      });
      
      expect(mockPrisma.swapOffer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            makerWallet,
          }),
        })
      );
    });
    
    it('should filter offers by taker wallet', async () => {
      const takerWallet = 'specific-taker';
      
      (mockPrisma.swapOffer.findMany as jest.Mock).mockResolvedValue([]);
      
      await offerManager.listOffers({
        takerWallet,
        limit: 10,
        offset: 0,
      });
      
      expect(mockPrisma.swapOffer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            takerWallet,
          }),
        })
      );
    });
  });
  
  describe('Get Offer Details', () => {
    it('should get offer by ID', async () => {
      const offerId = 1;
      const mockOffer = {
        id: offerId,
        status: 'ACTIVE',
        makerWallet: 'maker-wallet',
        offeredAssets: [],
        requestedAssets: [],
      };
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue(mockOffer);
      
      const result = await offerManager.getOffer(offerId);
      
      expect(result).toMatchObject(mockOffer);
      expect(mockPrisma.swapOffer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: offerId },
        })
      );
    });
    
    it('should include related data in offer details', async () => {
      const offerId = 1;
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        parentOffer: { id: 0 },
        counterOffers: [{ id: 2 }],
        swapTransactions: [{ signature: 'sig-1' }],
      });
      
      const result = await offerManager.getOffer(offerId, { includeRelations: true });
      
      expect(result.parentOffer).toBeDefined();
      expect(result.counterOffers).toHaveLength(1);
      expect(result.swapTransactions).toHaveLength(1);
    });
    
    it('should return null for non-existent offer', async () => {
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue(null);
      
      const result = await offerManager.getOffer(999);
      
      expect(result).toBeNull();
    });
  });
  
  describe('Expire Offers', () => {
    it('should mark expired offers', async () => {
      (mockPrisma.swapOffer.updateMany as jest.Mock).mockResolvedValue({ count: 5 });
      
      const result = await offerManager.expireOffers();
      
      expect(result.count).toBe(5);
      expect(mockPrisma.swapOffer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            expiresAt: expect.objectContaining({
              lt: expect.any(Date),
            }),
          }),
          data: expect.objectContaining({
            status: 'EXPIRED',
          }),
        })
      );
    });
  });
  
  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (mockPrisma.swapOffer.create as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );
      
      await expect(
        offerManager.createOffer({
          makerWallet: 'maker-wallet',
          takerWallet: 'taker-wallet',
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: BigInt(0),
          requestedSolLamports: BigInt(0),
        })
      ).rejects.toThrow('Database connection failed');
    });
    
    it('should handle nonce pool exhaustion', async () => {
      (mockNoncePoolManager.assignNonceToUser as jest.Mock).mockRejectedValue(
        new Error('No available nonces in pool')
      );
      
      await expect(
        offerManager.createOffer({
          makerWallet: 'maker-wallet',
          takerWallet: 'taker-wallet',
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: BigInt(0),
          requestedSolLamports: BigInt(0),
        })
      ).rejects.toThrow('No available nonces in pool');
    });
  });
  
  describe('Transaction Safety', () => {
    it('should use database transactions for atomic operations', async () => {
      const offerId = 1;
      const signature = 'tx-signature';
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        makerWallet: 'maker',
        takerWallet: 'taker',
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: 'nonce',
      });
      
      (mockConnection.getTransaction as jest.Mock).mockResolvedValue({
        meta: { err: null },
      });
      
      await offerManager.confirmSwap({ offerId, signature });
      
      // Should have used a database transaction
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });
});

