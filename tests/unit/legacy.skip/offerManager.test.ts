/**
 * Unit Tests for OfferManager Service
 * Tests complete offer lifecycle and business logic orchestration
 */

import { Connection, Keypair, Transaction } from '@solana/web3.js';
import { PrismaClient } from '../../src/generated/prisma';
import { OfferManager, CreateOfferInput } from '../../src/services/offerManager';
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
  let nonceAccountKeypair: Keypair;
  
  beforeEach(() => {
    nonceAccountKeypair = Keypair.generate();
    // Create all mocks
    mockConnection = new Connection('http://localhost:8899') as jest.Mocked<Connection>;
    // Add confirmTransaction mock to mockConnection
    (mockConnection.confirmTransaction as any) = jest.fn().mockResolvedValue({ value: { err: null } });
    (mockConnection.getTransaction as any) = jest.fn().mockResolvedValue({
      slot: 12345,
      meta: { err: null },
      blockTime: Math.floor(Date.now() / 1000),
    });
    
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
      create: jest.fn(), // Added missing create mock
    };
    (mockPrisma as any).swapOffer = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(), // Added missing count mock
    };
    (mockPrisma as any).swapTransaction = {
      create: jest.fn(),
    };
    (mockPrisma as any).$transaction = jest.fn((fn) => fn(mockPrisma));
    
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
    
    // Setup default mock returns
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-id-1',
      walletAddress: 'test-wallet',
    });
    
    (mockNoncePoolManager.assignNonceToUser as jest.Mock).mockResolvedValue(nonceAccountKeypair.publicKey.toBase58());
    
    (mockNoncePoolManager.getCurrentNonce as jest.Mock).mockResolvedValue('current-nonce-value');
    
    (mockAssetValidator.validateAssets as jest.Mock).mockResolvedValue([
      { identifier: 'test-asset', isValid: true },
    ]);
    
    // Setup FeeCalculator mock
    (mockFeeCalculator.calculateFee as jest.Mock).mockReturnValue({
      feeLamports: BigInt(1000000),
      feeType: 'PERCENTAGE',
      feeRate: 0.01,
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
    
    (mockTransactionBuilder.buildSwapTransaction as jest.Mock).mockResolvedValue({
      serializedTransaction: Buffer.from('mock-transaction-data').toString('base64'),
      nonceValue: 'mock-nonce-value',
    });
    (mockTransactionBuilder.validateInputs as jest.Mock).mockReturnValue(undefined); // validateInputs doesn't return anything
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Create Direct Offer', () => {
    it('should create offer with known taker', async () => {
      const params: CreateOfferInput = {
        makerWallet: 'maker-wallet-address',
        takerWallet: 'taker-wallet-address', // Direct offer
        offeredAssets: [
          {
            type: AssetType.NFT,
            identifier: 'nft-mint-1',
          },
        ],
        requestedAssets: [
          {
            type: AssetType.NFT,
            identifier: 'nft-mint-2',
          },
        ],
        offeredSol: BigInt(0),
        requestedSol: BigInt(0),
      };
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 1,
        offerType: 'MAKER',
        status: 'ACTIVE',
        makerWallet: params.makerWallet,
        takerWallet: params.takerWallet,
        offeredAssets: params.offeredAssets,
        requestedAssets: params.requestedAssets,
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
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
        params.offeredAssets
      );
      
      // Note: Transaction is NOT built during createOffer anymore
      // It's built when the offer is accepted
      
      // Should have stored offer without transaction
      expect(mockPrisma.swapOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            makerWallet: params.makerWallet,
          }),
        })
      );
    });
    
    it('should create offer and ensure user exists', async () => {
      const params: CreateOfferInput = {
        makerWallet: 'new-maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [],
        requestedAssets: [],
        offeredSol: BigInt(100_000_000),
        requestedSol: BigInt(0),
      };
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 2,
        offerType: 'MAKER',
        status: 'ACTIVE',
        offeredSolLamports: BigInt(100_000_000),
        requestedSolLamports: BigInt(0),
      });
      
      await offerManager.createOffer(params);
      
      // Should have checked if user exists
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { walletAddress: params.makerWallet },
        })
      );
      
      // Should have created user since findUnique returned null
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            walletAddress: params.makerWallet,
          }),
        })
      );
    });
    
    it('should assign nonce to user', async () => {
      const params: CreateOfferInput = {
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [],
        requestedAssets: [],
        offeredSol: BigInt(0),
        requestedSol: BigInt(0),
      };
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 3,
        status: 'ACTIVE',
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      });
      
      await offerManager.createOffer(params);
      
      // Should have assigned nonce
      expect(mockNoncePoolManager.assignNonceToUser).toHaveBeenCalledWith(params.makerWallet);
    });
    
    it('should calculate and validate fee', async () => {
      const params: CreateOfferInput = {
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [],
        requestedAssets: [],
        offeredSol: BigInt(100_000_000),
        requestedSol: BigInt(200_000_000),
      };
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 4,
        status: 'ACTIVE',
        offeredSolLamports: BigInt(100_000_000),
        requestedSolLamports: BigInt(200_000_000),
      });
      
      await offerManager.createOffer(params);
      
      // Should have calculated fee
      expect(mockFeeCalculator.calculateFee).toHaveBeenCalledWith(
        BigInt(100_000_000),
        BigInt(200_000_000)
      );
    });
    
    it('should reject offer with invalid assets', async () => {
      const params: CreateOfferInput = {
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [
          {
            type: AssetType.NFT,
            identifier: 'unowned-nft-mint',
          },
        ],
        requestedAssets: [],
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      };
      
      // Mock asset validation failure
      (mockAssetValidator.validateAssets as jest.Mock).mockResolvedValue([
        {
          identifier: params.offeredAssets[0].identifier,
          isValid: false,
          error: 'Asset not owned by maker',
        },
      ]);
      
      await expect(offerManager.createOffer(params)).rejects.toThrow('Maker does not own the following assets');
    });
  });
  
  describe('Create Open Offer', () => {
    it('should create offer without known taker', async () => {
      const params: CreateOfferInput = {
        makerWallet: 'maker-wallet',
        takerWallet: undefined, // Open offer
        offeredAssets: [
          {
            type: AssetType.NFT,
            identifier: 'nft-mint',
          },
        ],
        requestedAssets: [],
        offeredSol: BigInt(0),
        requestedSol: BigInt(100_000_000),
      };
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 5,
        offerType: 'MAKER',
        status: 'ACTIVE',
        makerWallet: params.makerWallet,
        takerWallet: null,
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(100_000_000),
      });
      
      const result = await offerManager.createOffer(params);
      
      expect(result.takerWallet).toBeUndefined();
      
      // Should NOT have built transaction (transactions are built during acceptOffer, not createOffer)
      expect(mockTransactionBuilder.buildSwapTransaction).not.toHaveBeenCalled();
    });
  });
  
  describe('Create Counter-Offer', () => {
    it('should create counter-offer for existing offer', async () => {
      const parentOfferId = 1;
      const originalMaker = Keypair.generate().publicKey.toBase58();
      const counterMaker = Keypair.generate().publicKey.toBase58();
      const parentOffer = {
        id: parentOfferId,
        offerType: 'MAKER',
        status: 'ACTIVE',
        makerWallet: originalMaker,
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
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: nonceAccountKeypair.publicKey.toBase58(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue(parentOffer);
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 6,
        offerType: 'COUNTER',
        status: 'ACTIVE',
        parentOfferId,
        makerWallet: counterMaker,
        nonceAccount: nonceAccountKeypair.publicKey.toBase58(),
      });
      
      const result = await offerManager.createCounterOffer({
        parentOfferId,
        counterMakerWallet: counterMaker,
      });
      
      expect(result.offerType).toBe('COUNTER');
      expect(result.id).toBe(6);
      
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
      const makerWallet = Keypair.generate().publicKey.toBase58();
      const takerWallet = Keypair.generate().publicKey.toBase58();
      const serializedTx = Buffer.from('mock-transaction-data').toString('base64');
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        makerWallet,
        takerWallet,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: null,
        requestedSolLamports: null,
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: nonceAccountKeypair.publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        serializedTransaction: serializedTx,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      const result = await offerManager.acceptOffer(offerId, takerWallet);
      
      expect(result.serializedTransaction).toBe(serializedTx);
    });
    
    it('should accept open offer and build transaction', async () => {
      const offerId = 2;
      const takerWallet = Keypair.generate().publicKey.toBase58();
      
      const makerWallet = Keypair.generate().publicKey.toBase58();
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        makerWallet,
        takerWallet: null, // Open offer
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: null,
        requestedSolLamports: null,
        serializedTransaction: null,
        nonceAccount: nonceAccountKeypair.publicKey.toBase58(),
        currentNonceValue: 'nonce-value',
        platformFeeLamports: BigInt(5_000_000),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      
      const result = await offerManager.acceptOffer(offerId, takerWallet);
      
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
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
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
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
        expiresAt: new Date(Date.now() - 1000), // Expired
      });
      
      await expect(
        offerManager.acceptOffer({
          offerId,
          takerWallet: 'taker-wallet',
        })
      ).rejects.toThrow('Offer has expired');
    });
    
    it.skip('should enforce taker restriction for direct offers', async () => {
      const offerId = 5;
      const designatedTaker = Keypair.generate().publicKey.toBase58();
      const wrongTaker = Keypair.generate().publicKey.toBase58();
      
      const makerWallet = Keypair.generate().publicKey.toBase58();
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        makerWallet,
        takerWallet: designatedTaker,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: nonceAccountKeypair.publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      await expect(
        offerManager.acceptOffer(offerId, wrongTaker)
      ).rejects.toThrow('Only designated taker can accept this offer');
    });
  });
  
  describe('Cancel Offer', () => {
    it('should cancel offer and advance nonce', async () => {
      const offerId = 1;
      const makerWallet = Keypair.generate().publicKey.toBase58();
      const nonceAccount = nonceAccountKeypair.publicKey.toBase58();
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        makerWallet,
        nonceAccount,
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      });
      
      (mockNoncePoolManager.advanceNonce as jest.Mock).mockResolvedValue(undefined);
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.swapOffer.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
      
      await offerManager.cancelOffer(offerId, makerWallet);
      
      // Should have advanced nonce
      expect(mockNoncePoolManager.advanceNonce).toHaveBeenCalledWith(nonceAccount);
      
      // Should have cancelled related offers using same nonce
      expect(mockPrisma.swapOffer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            nonceAccount,
            id: { not: offerId },
            status: { in: ['ACTIVE', 'ACCEPTED'] },
          }),
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancelledAt: expect.any(Date),
          }),
        })
      );
    });
    
    it('should reject cancellation by non-maker', async () => {
      const offerId = 2;
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'ACTIVE',
        makerWallet: 'actual-maker',
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      });
      
      await expect(
        offerManager.cancelOffer(offerId, 'not-the-maker')
      ).rejects.toThrow('Only the maker can cancel this offer');
    });
    
    it('should reject cancelling already cancelled offer', async () => {
      const offerId = 3;
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        status: 'CANCELLED',
        makerWallet: 'maker-wallet',
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      });
      
      await expect(
        offerManager.cancelOffer(offerId, 'maker-wallet')
      ).rejects.toThrow('Offer cannot be cancelled');
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
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: nonceAccountKeypair.publicKey.toBase58(),
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
      expect(mockConnection.confirmTransaction).toHaveBeenCalledWith(signature, 'confirmed');
      
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
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      });
      
      (mockConnection.confirmTransaction as jest.Mock).mockResolvedValueOnce({
        value: {
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
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      });
      
      (mockConnection.confirmTransaction as jest.Mock).mockRejectedValueOnce(
        new Error('Transaction not found on chain')
      );
      
      await expect(
        offerManager.confirmSwap({
          offerId,
          signature,
        })
      ).rejects.toThrow('Failed to confirm transaction');
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
      const makerWallet = Keypair.generate().publicKey.toBase58();
      const mockOffer = {
        id: offerId,
        status: 'ACTIVE',
        makerWallet,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
      };
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue(mockOffer);
      
      const result = await offerManager.getOffer(offerId);
      
      expect(result).toMatchObject({
        id: offerId,
        status: 'ACTIVE',
        makerWallet,
        offeredAssets: [],
        requestedAssets: [],
      });
      expect(mockPrisma.swapOffer.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: offerId },
        })
      );
    });
    
    it('should get offer with complete details', async () => {
      const offerId = 1;
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: offerId,
        makerWallet: 'maker',
        offerType: 'MAKER',
        status: 'ACTIVE',
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(0),
        nonceAccount: nonceAccountKeypair.publicKey.toBase58(),
        expiresAt: new Date(),
        createdAt: new Date(),
      });
      
      const result = await offerManager.getOffer(offerId);
      
      expect(result).toBeDefined();
      expect(result?.id).toBe(offerId);
      expect(result?.makerWallet).toBe('maker');
    });
    
    it('should return null for non-existent offer', async () => {
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue(null);
      
      const result = await offerManager.getOffer(999);
      
      expect(result).toBeNull();
    });
  });
  
  describe('Expire Offers', () => {
    it.skip('should mark expired offers - method not implemented', async () => {
      // This test is skipped because expireOffers method doesn't exist
      // Expiration is handled automatically when offers are accessed
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
        nonceAccount: nonceAccountKeypair.publicKey.toBase58(),
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

