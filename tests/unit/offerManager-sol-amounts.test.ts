/**
 * Unit Tests for OfferManager - SOL Amount Handling
 * Tests new functionality for storing and extracting SOL amounts in offers
 * Added for PR #263 - Transaction building in acceptOffer
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PrismaClient, OfferStatus, OfferType } from '../../src/generated/prisma';
import { OfferManager } from '../../src/services/offerManager';
import { NoncePoolManager } from '../../src/services/noncePoolManager';
import { AssetValidator, AssetType } from '../../src/services/assetValidator';
import { FeeCalculator } from '../../src/services/feeCalculator';
import { TransactionBuilder } from '../../src/services/transactionBuilder';

// Mock dependencies
jest.mock('../../src/generated/prisma');
jest.mock('../../src/services/noncePoolManager');
jest.mock('../../src/services/assetValidator');
jest.mock('../../src/services/feeCalculator');
jest.mock('../../src/services/transactionBuilder');

describe('OfferManager - SOL Amount Handling', () => {
  let offerManager: OfferManager;
  let mockConnection: jest.Mocked<Connection>;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockNoncePoolManager: jest.Mocked<NoncePoolManager>;
  let mockAssetValidator: jest.Mocked<AssetValidator>;
  let mockFeeCalculator: jest.Mocked<FeeCalculator>;
  let mockTransactionBuilder: jest.Mocked<TransactionBuilder>;
  let platformAuthority: Keypair;
  let treasuryPDA: PublicKey;
  let programId: PublicKey;
  
  beforeEach(() => {
    // Create keypairs
    platformAuthority = Keypair.generate();
    treasuryPDA = Keypair.generate().publicKey;
    programId = Keypair.generate().publicKey;
    
    // Create mocks
    mockConnection = {
      getAccountInfo: jest.fn(),
      getBalance: jest.fn(),
    } as any;
    
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      swapOffer: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
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
      validateFee: jest.fn(),
    } as any;
    
    mockTransactionBuilder = {
      buildSwapTransaction: jest.fn(),
      validateInputs: jest.fn(),
    } as any;
    
    offerManager = new OfferManager(
      mockConnection,
      mockPrisma,
      mockNoncePoolManager,
      mockFeeCalculator,
      mockAssetValidator,
      mockTransactionBuilder,
      platformAuthority,
      treasuryPDA,
      programId
    );
    
    // Setup default mock returns
    (mockPrisma.user.upsert as jest.Mock).mockResolvedValue({
      walletAddress: 'test-wallet',
      createdAt: new Date(),
    });
    
    (mockNoncePoolManager.assignNonceToUser as jest.Mock).mockResolvedValue('test-nonce-account');
    (mockNoncePoolManager.getCurrentNonce as jest.Mock).mockResolvedValue('test-nonce-value');
    
    (mockAssetValidator.validateAssets as jest.Mock).mockResolvedValue([
      { identifier: 'test-nft', isValid: true },
    ]);
    
    (mockFeeCalculator.calculateFee as jest.Mock).mockReturnValue({
      feeLamports: BigInt(1000000),
      feeType: 'PERCENTAGE',
      feeRate: 0.01,
    });
    
    (mockTransactionBuilder.buildSwapTransaction as jest.Mock).mockResolvedValue({
      serializedTransaction: 'test-tx-base64',
      nonceValue: 'test-nonce-value-2',
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('createOffer - SOL Amount Storage', () => {
    it('should store offeredSol when provided', async () => {
      const offeredSol = BigInt(500000000); // 0.5 SOL
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: offeredSol,
        requestedSolLamports: null,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        createdAt: new Date(),
        expiresAt: new Date(),
      });
      
      await offerManager.createOffer({
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [],
        offeredSol,
        requestedAssets: [{ type: AssetType.NFT, identifier: 'test-nft' }],
      });
      
      expect(mockPrisma.swapOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            offeredSolLamports: offeredSol,
          }),
        })
      );
    });
    
    it('should store requestedSol when provided', async () => {
      const requestedSol = BigInt(1000000000); // 1 SOL
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [{ type: AssetType.NFT, identifier: 'test-nft' }],
        requestedAssets: [],
        offeredSolLamports: null,
        requestedSolLamports: requestedSol,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        createdAt: new Date(),
        expiresAt: new Date(),
      });
      
      await offerManager.createOffer({
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [{ type: AssetType.NFT, identifier: 'test-nft' }],
        requestedAssets: [],
        requestedSol,
      });
      
      expect(mockPrisma.swapOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestedSolLamports: requestedSol,
          }),
        })
      );
    });
    
    it('should store null for zero SOL amounts', async () => {
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: null,
        requestedSolLamports: null,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        createdAt: new Date(),
        expiresAt: new Date(),
      });
      
      await offerManager.createOffer({
        makerWallet: 'maker-wallet',
        offeredAssets: [{ type: AssetType.NFT, identifier: 'nft-1' }],
        requestedAssets: [{ type: AssetType.NFT, identifier: 'nft-2' }],
      });
      
      expect(mockPrisma.swapOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            offeredSolLamports: null,
            requestedSolLamports: null,
          }),
        })
      );
    });
    
    it('should store both SOL amounts when provided', async () => {
      const offeredSol = BigInt(250000000); // 0.25 SOL
      const requestedSol = BigInt(750000000); // 0.75 SOL
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: offeredSol,
        requestedSolLamports: requestedSol,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        createdAt: new Date(),
        expiresAt: new Date(),
      });
      
      await offerManager.createOffer({
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offeredAssets: [],
        offeredSol,
        requestedAssets: [],
        requestedSol,
      });
      
      expect(mockPrisma.swapOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            offeredSolLamports: offeredSol,
            requestedSolLamports: requestedSol,
          }),
        })
      );
    });
  });
  
  describe('acceptOffer - SOL Amount Extraction', () => {
    it('should extract offeredSol from offer and pass to transaction builder', async () => {
      const offeredSol = BigInt(500000000); // 0.5 SOL
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        takerWallet: null,
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [],
        requestedAssets: [{ type: AssetType.NFT, identifier: 'test-nft' }],
        offeredSolLamports: offeredSol,
        requestedSolLamports: null,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      
      await offerManager.acceptOffer(1, 'taker-wallet');
      
      expect(mockTransactionBuilder.buildSwapTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          makerSolLamports: offeredSol,
        })
      );
    });
    
    it('should extract requestedSol from offer and pass to transaction builder', async () => {
      const requestedSol = BigInt(1000000000); // 1 SOL
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        takerWallet: null,
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [{ type: AssetType.NFT, identifier: 'test-nft' }],
        requestedAssets: [],
        offeredSolLamports: null,
        requestedSolLamports: requestedSol,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      
      await offerManager.acceptOffer(1, 'taker-wallet');
      
      expect(mockTransactionBuilder.buildSwapTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          takerSolLamports: requestedSol,
        })
      );
    });
    
    it('should default to BigInt(0) when SOL amounts are null', async () => {
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        takerWallet: null,
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [{ type: AssetType.NFT, identifier: 'nft-1' }],
        requestedAssets: [{ type: AssetType.NFT, identifier: 'nft-2' }],
        offeredSolLamports: null,
        requestedSolLamports: null,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      
      await offerManager.acceptOffer(1, 'taker-wallet');
      
      expect(mockTransactionBuilder.buildSwapTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
        })
      );
    });
    
    it('should handle both SOL amounts correctly', async () => {
      const offeredSol = BigInt(250000000); // 0.25 SOL
      const requestedSol = BigInt(750000000); // 0.75 SOL
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        takerWallet: null,
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: offeredSol,
        requestedSolLamports: requestedSol,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      
      await offerManager.acceptOffer(1, 'taker-wallet');
      
      expect(mockTransactionBuilder.buildSwapTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          makerSolLamports: offeredSol,
          takerSolLamports: requestedSol,
        })
      );
    });
    
    it('should use stored platformFee from offer', async () => {
      const platformFee = BigInt(5000000); // Custom fee
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        takerWallet: null,
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(100000000),
        requestedSolLamports: null,
        platformFeeLamports: platformFee,
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      
      await offerManager.acceptOffer(1, 'taker-wallet');
      
      expect(mockTransactionBuilder.buildSwapTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          platformFeeLamports: platformFee,
        })
      );
    });
    
    it('should update offer with transaction and taker info', async () => {
      const serializedTx = 'test-tx-base64-updated';
      const nonceValue = 'test-nonce-value-updated';
      
      (mockPrisma.swapOffer.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        takerWallet: null,
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: BigInt(100000000),
        requestedSolLamports: null,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      
      (mockTransactionBuilder.buildSwapTransaction as jest.Mock).mockResolvedValue({
        serializedTransaction: serializedTx,
        nonceValue,
      });
      
      (mockPrisma.swapOffer.update as jest.Mock).mockResolvedValue({});
      
      await offerManager.acceptOffer(1, 'taker-wallet');
      
      expect(mockPrisma.swapOffer.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          takerWallet: 'taker-wallet',
          serializedTransaction: serializedTx,
          currentNonceValue: nonceValue,
        },
      });
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle very large SOL amounts', async () => {
      const largeSol = BigInt('18446744073709551615'); // Near max uint64
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: largeSol,
        requestedSolLamports: null,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        createdAt: new Date(),
        expiresAt: new Date(),
      });
      
      await offerManager.createOffer({
        makerWallet: 'maker-wallet',
        offeredAssets: [],
        offeredSol: largeSol,
        requestedAssets: [{ type: AssetType.NFT, identifier: 'test-nft' }],
      });
      
      expect(mockPrisma.swapOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            offeredSolLamports: largeSol,
          }),
        })
      );
    });
    
    it('should handle minimum SOL amounts (1 lamport)', async () => {
      const minSol = BigInt(1);
      
      (mockPrisma.swapOffer.create as jest.Mock).mockResolvedValue({
        id: 1,
        makerWallet: 'maker-wallet',
        offerType: OfferType.MAKER_OFFER,
        offeredAssets: [],
        requestedAssets: [],
        offeredSolLamports: minSol,
        requestedSolLamports: null,
        platformFeeLamports: BigInt(1000000),
        status: OfferStatus.ACTIVE,
        nonceAccount: 'test-nonce',
        createdAt: new Date(),
        expiresAt: new Date(),
      });
      
      await offerManager.createOffer({
        makerWallet: 'maker-wallet',
        offeredAssets: [],
        offeredSol: minSol,
        requestedAssets: [{ type: AssetType.NFT, identifier: 'test-nft' }],
      });
      
      expect(mockPrisma.swapOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            offeredSolLamports: minSol,
          }),
        })
      );
    });
  });
});

